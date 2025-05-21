import { EventEmitter } from 'events';
import { getLogger } from '../logger.js';
import { MCPError, ErrorCode, ErrorSeverity, globalErrorHandler } from '../error-handler.js';
import { ConfigManager, createConfigManager } from '../config-manager.js';
import { HealthChecker } from '../health-checker.js';
import { globalPerformanceMonitor } from '../performance-monitor.js';
import { BaseTransport, TransportHandler, createTransport } from './transport.js';
import { MCPRouter, RouteDefinition, NotificationDefinition } from './router.js';
import {
  MCPMessage,
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPServerConfig,
  ServerCapabilities,
  ClientCapabilities,
  InitializeRequest,
  InitializeResult,
  ConnectionInfo,
  ConnectionMetrics,
  HealthStatus,
  ServerLifecycleEvent,
  TransportType,
  Tool,
  Resource,
  Prompt,
  ListToolsResult,
  ListResourcesResult,
  ListPromptsResult,
  CallToolRequest,
  CallToolResult,
  ReadResourceRequest,
  ReadResourceResult,
  GetPromptRequest,
  GetPromptResult,
} from './types.js';

const logger = getLogger('MCPServer');

export interface MCPServerOptions {
  config?: MCPServerConfig;
  configPath?: string;
  enablePerformanceMonitoring?: boolean;
  enableHealthCheck?: boolean;
  gracefulShutdownTimeout?: number;
}

export interface ResourceProvider {
  listResources(cursor?: string): Promise<{ resources: Resource[]; nextCursor?: string }>;
  readResource(uri: string): Promise<ReadResourceResult>;
}

export interface ToolProvider {
  listTools(): Promise<Tool[]>;
  callTool(request: CallToolRequest): Promise<CallToolResult>;
}

export interface PromptProvider {
  listPrompts(): Promise<Prompt[]>;
  getPrompt(request: GetPromptRequest): Promise<GetPromptResult>;
}

export abstract class BaseMCPServer extends EventEmitter implements TransportHandler {
  protected config: MCPServerConfig;
  protected configManager: ConfigManager;
  protected transport: BaseTransport;
  protected router: MCPRouter;
  protected healthChecker: HealthChecker;
  protected connections: Map<string, ConnectionInfo> = new Map();
  protected connectionMetrics: ConnectionMetrics;
  protected isInitialized = false;
  protected isRunning = false;
  protected shutdownPromise?: Promise<void>;
  protected resourceProviders: Map<string, ResourceProvider> = new Map();
  protected toolProviders: Map<string, ToolProvider> = new Map();
  protected promptProviders: Map<string, PromptProvider> = new Map();

  constructor(options: MCPServerOptions = {}) {
    super();

    this.configManager = options.configPath 
      ? createConfigManager({ configPath: options.configPath })
      : createConfigManager();

    this.config = options.config || this.loadDefaultConfig();
    this.transport = createTransport(this.config.transport);
    this.router = new MCPRouter();
    this.healthChecker = new HealthChecker();

    this.connectionMetrics = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      averageConnectionTime: 0,
      peakConnections: 0,
      connectionsByTransport: {} as Record<TransportType, number>,
    };

    this.setupTransport();
    this.setupRouter();
    this.setupHealthChecks();
    this.setupErrorHandling();
    this.setupSignalHandlers();

    if (options.enablePerformanceMonitoring !== false) {
      globalPerformanceMonitor.enable();
    }
  }

  protected loadDefaultConfig(): MCPServerConfig {
    return {
      name: 'MCP Server',
      version: '1.0.0',
      transport: {
        type: TransportType.STDIO,
      },
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
        logging: {},
      },
    };
  }

  protected setupTransport(): void {
    this.transport.setHandler(this);
    
    this.transport.on('connect', (connectionId: string) => {
      this.handleConnectionEstablished(connectionId);
    });

    this.transport.on('disconnect', (connectionId: string, reason?: string) => {
      this.handleConnectionClosed(connectionId, reason);
    });

    this.transport.on('error', (error: Error) => {
      this.handleTransportError(error);
    });
  }

  protected setupRouter(): void {
    this.router.setServerCapabilities(this.config.capabilities);

    // Add standard MCP routes
    this.addStandardRoutes();

    this.router.on('request', (event) => {
      this.emit('request', event);
    });

    this.router.on('notification', (event) => {
      this.emit('notification', event);
    });

    this.router.on('progress', (event) => {
      this.emit('progress', event);
    });

    this.router.on('cancelled', (event) => {
      this.emit('cancelled', event);
    });
  }

  protected addStandardRoutes(): void {
    // Tools
    if (this.config.capabilities.tools) {
      this.addRoute({
        method: 'tools/list',
        handler: this.handleListTools.bind(this),
        description: 'List available tools',
        capabilities: ['tools'],
      });

      this.addRoute({
        method: 'tools/call',
        handler: this.handleCallTool.bind(this),
        schema: {
          name: { type: 'string', required: true },
          arguments: { type: 'object' },
        },
        description: 'Call a tool',
        capabilities: ['tools'],
        timeout: 60000,
      });
    }

    // Resources
    if (this.config.capabilities.resources) {
      this.addRoute({
        method: 'resources/list',
        handler: this.handleListResources.bind(this),
        schema: {
          cursor: { type: 'string' },
        },
        description: 'List available resources',
        capabilities: ['resources'],
      });

      this.addRoute({
        method: 'resources/read',
        handler: this.handleReadResource.bind(this),
        schema: {
          uri: { type: 'string', required: true },
        },
        description: 'Read a resource',
        capabilities: ['resources'],
      });

      this.addRoute({
        method: 'resources/subscribe',
        handler: this.handleSubscribeResource.bind(this),
        schema: {
          uri: { type: 'string', required: true },
        },
        description: 'Subscribe to resource updates',
        capabilities: ['resources.subscribe'],
      });

      this.addRoute({
        method: 'resources/unsubscribe',
        handler: this.handleUnsubscribeResource.bind(this),
        schema: {
          uri: { type: 'string', required: true },
        },
        description: 'Unsubscribe from resource updates',
        capabilities: ['resources.subscribe'],
      });
    }

    // Prompts
    if (this.config.capabilities.prompts) {
      this.addRoute({
        method: 'prompts/list',
        handler: this.handleListPrompts.bind(this),
        description: 'List available prompts',
        capabilities: ['prompts'],
      });

      this.addRoute({
        method: 'prompts/get',
        handler: this.handleGetPrompt.bind(this),
        schema: {
          name: { type: 'string', required: true },
          arguments: { type: 'object' },
        },
        description: 'Get a prompt',
        capabilities: ['prompts'],
      });
    }

    // Sampling (if supported)
    if (this.config.capabilities.sampling) {
      this.addRoute({
        method: 'sampling/createMessage',
        handler: this.handleCreateMessage.bind(this),
        schema: {
          messages: { type: 'array', required: true },
          modelPreferences: { type: 'object' },
          systemPrompt: { type: 'string' },
          includeContext: { type: 'string' },
          temperature: { type: 'number', min: 0, max: 2 },
          maxTokens: { type: 'number', required: true, min: 1 },
        },
        description: 'Create a message using sampling',
        capabilities: ['sampling'],
        timeout: 120000,
      });
    }
  }

  protected setupHealthChecks(): void {
    this.healthChecker.addCheck('transport', async () => {
      return {
        healthy: this.transport.isConnected(),
        details: {
          connected: this.transport.isConnected(),
          metrics: this.transport.getMetrics(),
        },
      };
    });

    this.healthChecker.addCheck('router', async () => {
      const routerHealth = this.router.getHealthStatus();
      return {
        healthy: routerHealth.healthy,
        details: routerHealth,
      };
    });

    this.healthChecker.addCheck('connections', async () => {
      return {
        healthy: this.connectionMetrics.activeConnections >= 0,
        details: this.connectionMetrics,
      };
    });
  }

  protected setupErrorHandling(): void {
    globalErrorHandler.onError((error) => {
      this.emit('error', error);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception in MCP server', { error });
      this.emitLifecycleEvent('error', { error: error.message });
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection in MCP server', { reason, promise });
      this.emitLifecycleEvent('error', { error: 'Unhandled promise rejection', reason });
    });
  }

  protected setupSignalHandlers(): void {
    const shutdownSignals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    for (const signal of shutdownSignals) {
      process.on(signal, () => {
        logger.info(`Received ${signal}, initiating graceful shutdown`);
        this.shutdown().catch((error) => {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        });
      });
    }
  }

  // Transport handler implementation
  async onMessage(message: MCPMessage): Promise<MCPMessage | void> {
    try {
      return await this.router.routeMessage(message);
    } catch (error) {
      logger.error('Error routing message', { error, message });
      throw error;
    }
  }

  async onConnect(connectionId: string): Promise<void> {
    // Handled in setupTransport
  }

  async onDisconnect(connectionId: string, reason?: string): Promise<void> {
    // Handled in setupTransport
  }

  async onError(error: Error): Promise<void> {
    this.handleTransportError(error);
  }

  // Server lifecycle methods
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Server is already running');
      return;
    }

    try {
      this.emitLifecycleEvent('starting');
      
      logger.info('Starting MCP server', {
        name: this.config.name,
        version: this.config.version,
        transport: this.config.transport.type,
        capabilities: Object.keys(this.config.capabilities),
      });

      await this.initialize();
      await this.transport.connect();

      this.isRunning = true;
      this.emitLifecycleEvent('started');

      logger.info('MCP server started successfully', {
        name: this.config.name,
        transport: this.config.transport.type,
      });
    } catch (error) {
      this.emitLifecycleEvent('error', { error });
      throw new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: `Failed to start MCP server: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.CRITICAL,
        retryable: false,
        context: { operation: 'start' },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async shutdown(timeout = 30000): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown(timeout);
    return this.shutdownPromise;
  }

  private async performShutdown(timeout: number): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.emitLifecycleEvent('stopping');
    logger.info('Shutting down MCP server');

    try {
      // Stop accepting new connections
      this.isRunning = false;

      // Notify all connections
      for (const [connectionId, connection] of this.connections) {
        try {
          await this.sendNotification({
            jsonrpc: '2.0',
            method: 'notifications/cancelled',
            params: { reason: 'Server shutting down' },
          });
        } catch (error) {
          logger.warn(`Failed to notify connection ${connectionId} of shutdown`, { error });
        }
      }

      // Close transport
      await Promise.race([
        this.transport.disconnect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Transport shutdown timeout')), timeout / 2)
        ),
      ]);

      // Perform cleanup
      await this.cleanup();

      this.emitLifecycleEvent('stopped');
      logger.info('MCP server shutdown complete');
    } catch (error) {
      this.emitLifecycleEvent('error', { error });
      logger.error('Error during shutdown', { error });
      throw error;
    }
  }

  protected async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize providers
    await this.initializeProviders();

    this.isInitialized = true;
  }

  protected async initializeProviders(): Promise<void> {
    // Override in subclasses to initialize providers
  }

  protected async cleanup(): Promise<void> {
    this.connections.clear();
    globalPerformanceMonitor.disable();
    
    // Override in subclasses for additional cleanup
  }

  // Connection management
  private handleConnectionEstablished(connectionId: string): void {
    const connection: ConnectionInfo = {
      id: connectionId,
      clientInfo: { name: 'Unknown', version: 'Unknown' },
      capabilities: {},
      protocolVersion: 'Unknown',
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      transport: this.config.transport.type,
    };

    this.connections.set(connectionId, connection);
    
    this.connectionMetrics.totalConnections++;
    this.connectionMetrics.activeConnections++;
    this.connectionMetrics.peakConnections = Math.max(
      this.connectionMetrics.peakConnections,
      this.connectionMetrics.activeConnections
    );

    const transportCount = this.connectionMetrics.connectionsByTransport[this.config.transport.type] || 0;
    this.connectionMetrics.connectionsByTransport[this.config.transport.type] = transportCount + 1;

    this.emitLifecycleEvent('connection', { connectionId });
    
    logger.info('Client connected', {
      connectionId,
      transport: this.config.transport.type,
      activeConnections: this.connectionMetrics.activeConnections,
    });
  }

  private handleConnectionClosed(connectionId: string, reason?: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.connections.delete(connectionId);
      this.connectionMetrics.activeConnections--;

      const connectionTime = Date.now() - connection.connectedAt.getTime();
      this.updateAverageConnectionTime(connectionTime);

      this.emitLifecycleEvent('disconnection', { connectionId, reason });

      logger.info('Client disconnected', {
        connectionId,
        reason,
        connectionTime,
        messageCount: connection.messageCount,
        activeConnections: this.connectionMetrics.activeConnections,
      });
    }
  }

  private handleTransportError(error: Error): void {
    this.connectionMetrics.failedConnections++;
    logger.error('Transport error', { error });
    this.emit('transportError', error);
  }

  private updateAverageConnectionTime(connectionTime: number): void {
    const totalConnections = this.connectionMetrics.totalConnections;
    const currentAvg = this.connectionMetrics.averageConnectionTime;
    this.connectionMetrics.averageConnectionTime = 
      (currentAvg * (totalConnections - 1) + connectionTime) / totalConnections;
  }

  // Route and notification management
  addRoute(definition: RouteDefinition): void {
    this.router.addRoute(definition);
  }

  addNotification(definition: NotificationDefinition): void {
    this.router.addNotification(definition);
  }

  removeRoute(method: string): boolean {
    return this.router.removeRoute(method);
  }

  removeNotification(method: string): boolean {
    return this.router.removeNotification(method);
  }

  // Provider management
  addResourceProvider(name: string, provider: ResourceProvider): void {
    this.resourceProviders.set(name, provider);
    logger.debug(`Added resource provider: ${name}`);
  }

  addToolProvider(name: string, provider: ToolProvider): void {
    this.toolProviders.set(name, provider);
    logger.debug(`Added tool provider: ${name}`);
  }

  addPromptProvider(name: string, provider: PromptProvider): void {
    this.promptProviders.set(name, provider);
    logger.debug(`Added prompt provider: ${name}`);
  }

  removeResourceProvider(name: string): boolean {
    const removed = this.resourceProviders.delete(name);
    if (removed) {
      logger.debug(`Removed resource provider: ${name}`);
    }
    return removed;
  }

  removeToolProvider(name: string): boolean {
    const removed = this.toolProviders.delete(name);
    if (removed) {
      logger.debug(`Removed tool provider: ${name}`);
    }
    return removed;
  }

  removePromptProvider(name: string): boolean {
    const removed = this.promptProviders.delete(name);
    if (removed) {
      logger.debug(`Removed prompt provider: ${name}`);
    }
    return removed;
  }

  // Standard route handlers
  protected async handleListTools(request: MCPRequest): Promise<ListToolsResult> {
    const allTools: Tool[] = [];
    
    for (const [name, provider] of this.toolProviders) {
      try {
        const tools = await provider.listTools();
        allTools.push(...tools);
      } catch (error) {
        logger.error(`Error listing tools from provider ${name}`, { error });
      }
    }

    return { tools: allTools };
  }

  protected async handleCallTool(request: MCPRequest): Promise<CallToolResult> {
    const { name, arguments: args } = request.params;

    for (const [providerName, provider] of this.toolProviders) {
      try {
        const tools = await provider.listTools();
        const tool = tools.find(t => t.name === name);
        
        if (tool) {
          return await provider.callTool({ name, arguments: args });
        }
      } catch (error) {
        logger.error(`Error checking tool ${name} in provider ${providerName}`, { error });
      }
    }

    throw new MCPError({
      code: ErrorCode.NOT_FOUND,
      message: `Tool not found: ${name}`,
      severity: ErrorSeverity.MEDIUM,
      retryable: false,
      context: { method: 'tools/call', toolName: name },
    });
  }

  protected async handleListResources(request: MCPRequest): Promise<ListResourcesResult> {
    const { cursor } = request.params || {};
    const allResources: Resource[] = [];
    let nextCursor: string | undefined;

    for (const [name, provider] of this.resourceProviders) {
      try {
        const result = await provider.listResources(cursor);
        allResources.push(...result.resources);
        
        if (result.nextCursor) {
          nextCursor = result.nextCursor;
        }
      } catch (error) {
        logger.error(`Error listing resources from provider ${name}`, { error });
      }
    }

    return { resources: allResources, nextCursor };
  }

  protected async handleReadResource(request: MCPRequest): Promise<ReadResourceResult> {
    const { uri } = request.params;

    for (const [providerName, provider] of this.resourceProviders) {
      try {
        const resources = await provider.listResources();
        const resource = resources.resources.find(r => r.uri === uri);
        
        if (resource) {
          return await provider.readResource(uri);
        }
      } catch (error) {
        logger.error(`Error checking resource ${uri} in provider ${providerName}`, { error });
      }
    }

    throw new MCPError({
      code: ErrorCode.NOT_FOUND,
      message: `Resource not found: ${uri}`,
      severity: ErrorSeverity.MEDIUM,
      retryable: false,
      context: { method: 'resources/read', uri },
    });
  }

  protected async handleSubscribeResource(request: MCPRequest): Promise<any> {
    // Implementation depends on specific subscription mechanism
    return { subscribed: true };
  }

  protected async handleUnsubscribeResource(request: MCPRequest): Promise<any> {
    // Implementation depends on specific subscription mechanism
    return { unsubscribed: true };
  }

  protected async handleListPrompts(request: MCPRequest): Promise<ListPromptsResult> {
    const allPrompts: Prompt[] = [];

    for (const [name, provider] of this.promptProviders) {
      try {
        const prompts = await provider.listPrompts();
        allPrompts.push(...prompts);
      } catch (error) {
        logger.error(`Error listing prompts from provider ${name}`, { error });
      }
    }

    return { prompts: allPrompts };
  }

  protected async handleGetPrompt(request: MCPRequest): Promise<GetPromptResult> {
    const { name, arguments: args } = request.params;

    for (const [providerName, provider] of this.promptProviders) {
      try {
        const prompts = await provider.listPrompts();
        const prompt = prompts.find(p => p.name === name);
        
        if (prompt) {
          return await provider.getPrompt({ name, arguments: args });
        }
      } catch (error) {
        logger.error(`Error checking prompt ${name} in provider ${providerName}`, { error });
      }
    }

    throw new MCPError({
      code: ErrorCode.NOT_FOUND,
      message: `Prompt not found: ${name}`,
      severity: ErrorSeverity.MEDIUM,
      retryable: false,
      context: { method: 'prompts/get', promptName: name },
    });
  }

  protected async handleCreateMessage(request: MCPRequest): Promise<any> {
    // This would typically be implemented by servers that support sampling
    throw new MCPError({
      code: ErrorCode.NOT_FOUND,
      message: 'Sampling not implemented',
      severity: ErrorSeverity.MEDIUM,
      retryable: false,
      context: { method: 'sampling/createMessage' },
    });
  }

  // Utility methods
  async sendNotification(notification: MCPNotification): Promise<void> {
    try {
      await this.transport.send(notification);
    } catch (error) {
      logger.error('Failed to send notification', { error, notification });
      throw error;
    }
  }

  getHealthStatus(): HealthStatus {
    const transportMetrics = this.transport.getMetrics();
    const routerMetrics = this.router.getMetrics();
    
    return {
      status: this.isRunning ? 'healthy' : 'unhealthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      version: this.config.version,
      transport: {
        connected: this.transport.isConnected(),
        metrics: transportMetrics,
      },
      resources: {
        count: this.resourceProviders.size,
        healthy: this.resourceProviders.size,
      },
      tools: {
        count: this.toolProviders.size,
        healthy: this.toolProviders.size,
      },
      prompts: {
        count: this.promptProviders.size,
        healthy: this.promptProviders.size,
      },
      performance: {
        averageResponseTime: routerMetrics.averageResponseTime,
        requestRate: routerMetrics.totalRequests / (process.uptime() || 1),
        errorRate: routerMetrics.totalRequests > 0 ? routerMetrics.failedRequests / routerMetrics.totalRequests : 0,
      },
    };
  }

  getConnectionMetrics(): ConnectionMetrics {
    return { ...this.connectionMetrics };
  }

  getConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values());
  }

  private emitLifecycleEvent(type: ServerLifecycleEvent['type'], data?: any): void {
    const event: ServerLifecycleEvent = {
      type,
      timestamp: new Date(),
      data,
    };
    
    this.emit('lifecycle', event);
  }

  // Abstract methods for subclasses
  abstract get serverInfo(): { name: string; version: string; description?: string };
}