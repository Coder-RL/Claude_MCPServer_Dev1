import { EventEmitter } from 'events';
import { getLogger } from '../logger.js';
import { MCPError, ErrorCode, ErrorSeverity, createTimeoutError, createServiceUnavailableError } from '../error-handler.js';
import { withRetry, createCircuitBreaker, CircuitBreaker } from '../retry-circuit-breaker.js';
import { globalPerformanceMonitor } from '../performance-monitor.js';
import { BaseTransport, TransportHandler, createTransport } from './transport.js';
import {
  MCPMessage,
  MCPRequest,
  MCPResponse,
  MCPNotification,
  TransportOptions,
  ClientCapabilities,
  ServerCapabilities,
  InitializeRequest,
  InitializeResult,
  Implementation,
  ConnectionInfo,
  HealthStatus,
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
  CreateMessageRequest,
  CreateMessageResult,
  isMCPResponse,
  isMCPNotification,
} from './types.js';

const logger = getLogger('MCPClient');

export interface MCPClientOptions {
  transport: TransportOptions;
  clientInfo: Implementation;
  capabilities?: ClientCapabilities;
  timeout?: number;
  retryOptions?: {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
  };
  circuitBreakerOptions?: {
    failureThreshold: number;
    recoveryTimeout: number;
  };
  enablePerformanceMonitoring?: boolean;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export interface PendingRequest {
  id: string | number;
  method: string;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
  startTime: number;
  timeout: NodeJS.Timeout;
}

export interface ClientMetrics {
  totalRequests: number;
  totalNotifications: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  connectionAttempts: number;
  successfulConnections: number;
  lastActivity: Date | null;
  circuitBreakerState: string;
}

export class MCPClient extends EventEmitter implements TransportHandler {
  private options: Required<MCPClientOptions>;
  private transport: BaseTransport;
  private circuitBreaker: CircuitBreaker;
  private pendingRequests: Map<string | number, PendingRequest> = new Map();
  private requestIdCounter = 0;
  private isInitialized = false;
  private isConnected = false;
  private serverInfo?: Implementation;
  private serverCapabilities?: ServerCapabilities;
  private connectionInfo?: ConnectionInfo;
  private metrics: ClientMetrics;
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(options: MCPClientOptions) {
    super();

    this.options = {
      timeout: 30000,
      retryOptions: {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 10000,
      },
      circuitBreakerOptions: {
        failureThreshold: 5,
        recoveryTimeout: 60000,
      },
      enablePerformanceMonitoring: true,
      autoReconnect: true,
      maxReconnectAttempts: 5,
      capabilities: {},
      ...options,
    };

    this.transport = createTransport(this.options.transport);
    this.circuitBreaker = createCircuitBreaker(this.options.circuitBreakerOptions);

    this.metrics = {
      totalRequests: 0,
      totalNotifications: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      connectionAttempts: 0,
      successfulConnections: 0,
      lastActivity: null,
      circuitBreakerState: 'closed',
    };

    this.setupTransport();
    this.setupCircuitBreaker();

    if (this.options.enablePerformanceMonitoring) {
      globalPerformanceMonitoring.enable();
    }
  }

  private setupTransport(): void {
    this.transport.setHandler(this);

    this.transport.on('connect', (connectionId: string) => {
      this.handleConnected(connectionId);
    });

    this.transport.on('disconnect', (connectionId: string, reason?: string) => {
      this.handleDisconnected(connectionId, reason);
    });

    this.transport.on('error', (error: Error) => {
      this.handleTransportError(error);
    });
  }

  private setupCircuitBreaker(): void {
    this.circuitBreaker.wrap(async () => {
      // Circuit breaker wrapper for requests
    });

    this.circuitBreaker.onStateChange?.((state) => {
      this.metrics.circuitBreakerState = state;
      this.emit('circuitBreakerStateChange', state);
      
      logger.info('Circuit breaker state changed', { 
        state,
        failureCount: this.circuitBreaker.getStatistics().failureCount,
      });
    });
  }

  // Transport handler implementation
  async onMessage(message: MCPMessage): Promise<MCPMessage | void> {
    this.updateActivity();

    if (isMCPResponse(message)) {
      this.handleResponse(message);
    } else if (isMCPNotification(message)) {
      this.handleNotification(message);
    } else {
      logger.warn('Received unexpected message type', { message });
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

  // Connection management
  async connect(): Promise<void> {
    if (this.isConnected) {
      logger.warn('Client is already connected');
      return;
    }

    this.metrics.connectionAttempts++;

    try {
      await this.transport.connect();
      // Connection success is handled in handleConnected
    } catch (error) {
      this.handleConnectionError(error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    this.clearReconnectTimer();
    
    // Reject all pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new MCPError({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Client disconnecting',
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { method: request.method, requestId: id },
      }));
    }
    this.pendingRequests.clear();

    try {
      await this.transport.disconnect();
    } catch (error) {
      logger.error('Error during disconnect', { error });
    }

    this.isConnected = false;
    this.isInitialized = false;
  }

  async initialize(): Promise<InitializeResult> {
    if (!this.isConnected) {
      throw createServiceUnavailableError('MCP Client', { operation: 'initialize' });
    }

    if (this.isInitialized) {
      logger.warn('Client is already initialized');
      return {
        protocolVersion: '2024-11-05',
        capabilities: this.serverCapabilities || {},
        serverInfo: this.serverInfo || { name: 'Unknown', version: 'Unknown' },
      };
    }

    const request: InitializeRequest = {
      protocolVersion: '2024-11-05',
      capabilities: this.options.capabilities,
      clientInfo: this.options.clientInfo,
    };

    try {
      const result = await this.sendRequest<InitializeResult>('initialize', request);
      
      this.serverCapabilities = result.capabilities;
      this.serverInfo = result.serverInfo;
      this.isInitialized = true;

      logger.info('Client initialized successfully', {
        serverInfo: result.serverInfo,
        protocolVersion: result.protocolVersion,
        capabilities: Object.keys(result.capabilities),
      });

      this.emit('initialized', result);
      return result;
    } catch (error) {
      logger.error('Failed to initialize client', { error });
      throw error;
    }
  }

  // Request/response handling
  async sendRequest<T = any>(method: string, params?: any, timeout?: number): Promise<T> {
    if (!this.isConnected) {
      throw createServiceUnavailableError('MCP Client', { method, operation: 'sendRequest' });
    }

    const requestTimeout = timeout || this.options.timeout;
    const id = this.generateRequestId();
    
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    this.metrics.totalRequests++;

    return new Promise<T>((resolve, reject) => {
      const timer = globalPerformanceMonitor.startTimer(method);
      timer.addMetadata('requestId', id);
      timer.addMetadata('hasCircuitBreaker', true);

      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        globalPerformanceMonitor.recordMetric(`mcp.client.${method}`, timer, false);
        reject(createTimeoutError(`Request ${method}`, requestTimeout, { method, requestId: id }));
      }, requestTimeout);

      const pendingRequest: PendingRequest = {
        id,
        method,
        resolve: (result: T) => {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(id);
          
          const duration = timer.stop();
          this.updateResponseTime(duration);
          this.metrics.successfulRequests++;
          
          globalPerformanceMonitor.recordMetric(`mcp.client.${method}`, timer, true);
          resolve(result);
        },
        reject: (error: Error) => {
          clearTimeout(timeoutHandle);
          this.pendingRequests.delete(id);
          this.metrics.failedRequests++;
          
          globalPerformanceMonitor.recordMetric(`mcp.client.${method}`, timer, false, error);
          reject(error);
        },
        startTime: Date.now(),
        timeout: timeoutHandle,
      };

      this.pendingRequests.set(id, pendingRequest);

      const sendWithCircuitBreaker = this.circuitBreaker.wrap(async () => {
        await this.transport.send(request);
      });

      sendWithCircuitBreaker().catch((error) => {
        this.pendingRequests.delete(id);
        clearTimeout(timeoutHandle);
        this.metrics.failedRequests++;
        
        globalPerformanceMonitor.recordMetric(`mcp.client.${method}`, timer, false, error);
        reject(error);
      });
    });
  }

  async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.isConnected) {
      throw createServiceUnavailableError('MCP Client', { method, operation: 'sendNotification' });
    }

    const notification: MCPNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.metrics.totalNotifications++;

    try {
      await this.transport.send(notification);
      this.updateActivity();
    } catch (error) {
      logger.error('Failed to send notification', { error, method, params });
      throw error;
    }
  }

  private handleResponse(response: MCPResponse): void {
    const pendingRequest = this.pendingRequests.get(response.id);
    if (!pendingRequest) {
      logger.warn('Received response for unknown request', { id: response.id });
      return;
    }

    if (response.error) {
      const error = new MCPError({
        code: ErrorCode.PROTOCOL_ERROR,
        message: response.error.message,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { 
          method: pendingRequest.method,
          requestId: response.id,
          mcpError: response.error,
        },
      });
      pendingRequest.reject(error);
    } else {
      pendingRequest.resolve(response.result);
    }
  }

  private handleNotification(notification: MCPNotification): void {
    this.emit('notification', notification);
    
    logger.debug('Received notification', {
      method: notification.method,
      params: notification.params,
    });

    // Handle specific notifications
    switch (notification.method) {
      case 'notifications/tools/list_changed':
        this.emit('toolsListChanged');
        break;
      case 'notifications/resources/list_changed':
        this.emit('resourcesListChanged');
        break;
      case 'notifications/resources/updated':
        this.emit('resourceUpdated', notification.params);
        break;
      case 'notifications/prompts/list_changed':
        this.emit('promptsListChanged');
        break;
      default:
        logger.debug('Unhandled notification', { method: notification.method });
    }
  }

  private handleConnected(connectionId: string): void {
    this.isConnected = true;
    this.metrics.successfulConnections++;
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();

    this.connectionInfo = {
      id: connectionId,
      clientInfo: this.options.clientInfo,
      capabilities: this.options.capabilities,
      protocolVersion: '2024-11-05',
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      transport: this.options.transport.type,
    };

    logger.info('Connected to MCP server', {
      connectionId,
      transport: this.options.transport.type,
    });

    this.emit('connected', connectionId);
  }

  private handleDisconnected(connectionId: string, reason?: string): void {
    this.isConnected = false;
    this.isInitialized = false;
    
    logger.info('Disconnected from MCP server', {
      connectionId,
      reason,
      autoReconnect: this.options.autoReconnect,
    });

    this.emit('disconnected', connectionId, reason);

    if (this.options.autoReconnect && this.reconnectAttempts < this.options.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private handleTransportError(error: Error): void {
    logger.error('Transport error', { error });
    this.emit('transportError', error);
  }

  private handleConnectionError(error: any): void {
    logger.error('Connection failed', {
      error,
      attempt: this.metrics.connectionAttempts,
      maxAttempts: this.options.maxReconnectAttempts,
    });

    this.emit('connectionError', error);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.options.retryOptions.baseDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.options.retryOptions.maxDelay
    );

    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      
      try {
        await this.connect();
        await this.initialize();
      } catch (error) {
        logger.error('Reconnection failed', { error, attempt: this.reconnectAttempts });
        
        if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          logger.error('Max reconnection attempts exceeded');
          this.emit('maxReconnectAttemptsExceeded');
        }
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private generateRequestId(): number {
    return ++this.requestIdCounter;
  }

  private updateActivity(): void {
    this.metrics.lastActivity = new Date();
    if (this.connectionInfo) {
      this.connectionInfo.lastActivity = new Date();
      this.connectionInfo.messageCount++;
    }
  }

  private updateResponseTime(duration: number): void {
    const current = this.metrics.averageResponseTime;
    const count = this.metrics.successfulRequests;
    this.metrics.averageResponseTime = (current * (count - 1) + duration) / count;
  }

  // High-level MCP API methods
  async listTools(): Promise<Tool[]> {
    this.ensureInitialized();
    const result = await this.sendRequest<ListToolsResult>('tools/list');
    return result.tools;
  }

  async callTool(name: string, args?: Record<string, any>): Promise<CallToolResult> {
    this.ensureInitialized();
    return this.sendRequest<CallToolResult>('tools/call', { name, arguments: args });
  }

  async listResources(cursor?: string): Promise<{ resources: Resource[]; nextCursor?: string }> {
    this.ensureInitialized();
    const result = await this.sendRequest<ListResourcesResult>('resources/list', { cursor });
    return { resources: result.resources, nextCursor: result.nextCursor };
  }

  async readResource(uri: string): Promise<ReadResourceResult> {
    this.ensureInitialized();
    return this.sendRequest<ReadResourceResult>('resources/read', { uri });
  }

  async subscribeToResource(uri: string): Promise<any> {
    this.ensureInitialized();
    return this.sendRequest('resources/subscribe', { uri });
  }

  async unsubscribeFromResource(uri: string): Promise<any> {
    this.ensureInitialized();
    return this.sendRequest('resources/unsubscribe', { uri });
  }

  async listPrompts(): Promise<Prompt[]> {
    this.ensureInitialized();
    const result = await this.sendRequest<ListPromptsResult>('prompts/list');
    return result.prompts;
  }

  async getPrompt(name: string, args?: Record<string, any>): Promise<GetPromptResult> {
    this.ensureInitialized();
    return this.sendRequest<GetPromptResult>('prompts/get', { name, arguments: args });
  }

  async createMessage(request: CreateMessageRequest): Promise<CreateMessageResult> {
    this.ensureInitialized();
    return this.sendRequest<CreateMessageResult>('sampling/createMessage', request);
  }

  async ping(): Promise<any> {
    return this.sendRequest('ping');
  }

  // Utility methods
  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new MCPError({
        code: ErrorCode.SERVER_NOT_INITIALIZED,
        message: 'Client must be initialized before making requests',
        severity: ErrorSeverity.HIGH,
        retryable: false,
        context: { operation: 'ensureInitialized' },
      });
    }
  }

  getServerInfo(): Implementation | undefined {
    return this.serverInfo;
  }

  getServerCapabilities(): ServerCapabilities | undefined {
    return this.serverCapabilities;
  }

  getConnectionInfo(): ConnectionInfo | undefined {
    return this.connectionInfo;
  }

  getMetrics(): ClientMetrics {
    return { ...this.metrics };
  }

  isClientConnected(): boolean {
    return this.isConnected;
  }

  isClientInitialized(): boolean {
    return this.isInitialized;
  }

  getHealthStatus(): HealthStatus {
    return {
      status: this.isConnected && this.isInitialized ? 'healthy' : 'unhealthy',
      timestamp: new Date(),
      uptime: process.uptime(),
      version: this.options.clientInfo.version,
      transport: {
        connected: this.isConnected,
        metrics: this.transport.getMetrics(),
      },
      resources: {
        count: 0, // This would be populated if we cached resource lists
        healthy: 0,
      },
      tools: {
        count: 0, // This would be populated if we cached tool lists
        healthy: 0,
      },
      prompts: {
        count: 0, // This would be populated if we cached prompt lists
        healthy: 0,
      },
      performance: {
        averageResponseTime: this.metrics.averageResponseTime,
        requestRate: this.metrics.totalRequests / (process.uptime() || 1),
        errorRate: this.metrics.totalRequests > 0 ? this.metrics.failedRequests / this.metrics.totalRequests : 0,
      },
    };
  }

  destroy(): void {
    this.disconnect().catch((error) => {
      logger.error('Error during client destruction', { error });
    });

    this.circuitBreaker.destroy();
    this.removeAllListeners();
    
    logger.info('MCP client destroyed');
  }
}

export function createMCPClient(options: MCPClientOptions): MCPClient {
  return new MCPClient(options);
}