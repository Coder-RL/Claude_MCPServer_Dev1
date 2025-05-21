import { getLogger } from '../logger.js';
import { MCPError, ErrorCode, ErrorSeverity, createValidationError, createConfigurationError } from '../error-handler.js';
import { ConfigManager, createConfigManager } from '../config-manager.js';
import { SchemaValidator } from '../validation.js';
import { BaseMCPServer, MCPServerOptions, ResourceProvider, ToolProvider, PromptProvider } from './server.js';
import { MCPClient, MCPClientOptions, createMCPClient } from './client.js';
import {
  MCPServerConfig,
  TransportType,
  TransportOptions,
  ServerCapabilities,
  ClientCapabilities,
  Implementation,
  Tool,
  Resource,
  Prompt,
  CallToolRequest,
  CallToolResult,
  ReadResourceRequest,
  ReadResourceResult,
  GetPromptRequest,
  GetPromptResult,
} from './types.js';

const logger = getLogger('MCPFactory');

export interface ServerDefinition {
  name: string;
  version: string;
  description?: string;
  transport: TransportOptions;
  capabilities: ServerCapabilities;
  providers?: {
    resources?: string[];
    tools?: string[];
    prompts?: string[];
  };
  middleware?: string[];
  authentication?: {
    type: 'none' | 'bearer' | 'basic' | 'oauth2' | 'custom';
    config?: Record<string, any>;
  };
  rateLimit?: {
    requests: number;
    window: number;
  };
  monitoring?: {
    enabled: boolean;
    healthCheck: boolean;
    metrics: boolean;
  };
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    destination: 'console' | 'file';
    file?: string;
  };
}

export interface ClientDefinition {
  clientInfo: Implementation;
  transport: TransportOptions;
  capabilities?: ClientCapabilities;
  connection?: {
    timeout?: number;
    retries?: number;
    autoReconnect?: boolean;
  };
  circuitBreaker?: {
    enabled: boolean;
    failureThreshold?: number;
    recoveryTimeout?: number;
  };
  monitoring?: {
    enabled: boolean;
  };
}

export interface ProviderRegistry {
  resources: Map<string, () => ResourceProvider>;
  tools: Map<string, () => ToolProvider>;
  prompts: Map<string, () => PromptProvider>;
}

export class UniversalMCPServer extends BaseMCPServer {
  private definition: ServerDefinition;

  constructor(definition: ServerDefinition, options: MCPServerOptions = {}) {
    const config: MCPServerConfig = {
      name: definition.name,
      version: definition.version,
      description: definition.description,
      transport: definition.transport,
      capabilities: definition.capabilities,
      authentication: definition.authentication,
      rateLimit: definition.rateLimit,
      logging: definition.logging,
    };

    super({ ...options, config });
    this.definition = definition;
  }

  get serverInfo(): { name: string; version: string; description?: string } {
    return {
      name: this.definition.name,
      version: this.definition.version,
      description: this.definition.description,
    };
  }

  protected async initializeProviders(): Promise<void> {
    if (!this.definition.providers) {
      return;
    }

    const registry = MCPFactory.getProviderRegistry();

    // Initialize resource providers
    if (this.definition.providers.resources) {
      for (const providerName of this.definition.providers.resources) {
        const providerFactory = registry.resources.get(providerName);
        if (providerFactory) {
          try {
            const provider = providerFactory();
            this.addResourceProvider(providerName, provider);
            logger.info(`Initialized resource provider: ${providerName}`);
          } catch (error) {
            logger.error(`Failed to initialize resource provider ${providerName}`, { error });
          }
        } else {
          logger.warn(`Resource provider not found: ${providerName}`);
        }
      }
    }

    // Initialize tool providers
    if (this.definition.providers.tools) {
      for (const providerName of this.definition.providers.tools) {
        const providerFactory = registry.tools.get(providerName);
        if (providerFactory) {
          try {
            const provider = providerFactory();
            this.addToolProvider(providerName, provider);
            logger.info(`Initialized tool provider: ${providerName}`);
          } catch (error) {
            logger.error(`Failed to initialize tool provider ${providerName}`, { error });
          }
        } else {
          logger.warn(`Tool provider not found: ${providerName}`);
        }
      }
    }

    // Initialize prompt providers
    if (this.definition.providers.prompts) {
      for (const providerName of this.definition.providers.prompts) {
        const providerFactory = registry.prompts.get(providerName);
        if (providerFactory) {
          try {
            const provider = providerFactory();
            this.addPromptProvider(providerName, provider);
            logger.info(`Initialized prompt provider: ${providerName}`);
          } catch (error) {
            logger.error(`Failed to initialize prompt provider ${providerName}`, { error });
          }
        } else {
          logger.warn(`Prompt provider not found: ${providerName}`);
        }
      }
    }
  }
}

export class MCPFactory {
  private static providerRegistry: ProviderRegistry = {
    resources: new Map(),
    tools: new Map(),
    prompts: new Map(),
  };

  private static validator = new SchemaValidator();
  private static configManager: ConfigManager;

  static initialize(configPath?: string): void {
    this.configManager = configPath ? 
      createConfigManager({ configPath }) : 
      createConfigManager();
    
    logger.info('MCP Factory initialized', { configPath });
  }

  // Server factory methods
  static async createServer(definition: ServerDefinition, options: MCPServerOptions = {}): Promise<UniversalMCPServer> {
    try {
      this.validateServerDefinition(definition);
      
      const server = new UniversalMCPServer(definition, options);
      
      logger.info('Created MCP server', {
        name: definition.name,
        version: definition.version,
        transport: definition.transport.type,
        capabilities: Object.keys(definition.capabilities),
      });

      return server;
    } catch (error) {
      logger.error('Failed to create MCP server', { error, definition });
      throw error;
    }
  }

  static async createServerFromConfig(configPath: string, options: MCPServerOptions = {}): Promise<UniversalMCPServer> {
    try {
      const config = this.loadConfig(configPath);
      const definition = this.configToServerDefinition(config);
      return this.createServer(definition, options);
    } catch (error) {
      logger.error('Failed to create server from config', { error, configPath });
      throw error;
    }
  }

  static async createMultipleServers(definitions: ServerDefinition[]): Promise<UniversalMCPServer[]> {
    const servers: UniversalMCPServer[] = [];
    
    for (const definition of definitions) {
      try {
        const server = await this.createServer(definition);
        servers.push(server);
      } catch (error) {
        logger.error(`Failed to create server ${definition.name}`, { error });
        // Continue creating other servers
      }
    }

    logger.info(`Created ${servers.length}/${definitions.length} servers`);
    return servers;
  }

  // Client factory methods
  static createClient(definition: ClientDefinition): MCPClient {
    try {
      this.validateClientDefinition(definition);

      const options: MCPClientOptions = {
        transport: definition.transport,
        clientInfo: definition.clientInfo,
        capabilities: definition.capabilities,
        timeout: definition.connection?.timeout,
        autoReconnect: definition.connection?.autoReconnect,
        maxReconnectAttempts: definition.connection?.retries,
        enablePerformanceMonitoring: definition.monitoring?.enabled,
      };

      if (definition.circuitBreaker?.enabled) {
        options.circuitBreakerOptions = {
          failureThreshold: definition.circuitBreaker.failureThreshold || 5,
          recoveryTimeout: definition.circuitBreaker.recoveryTimeout || 60000,
        };
      }

      const client = createMCPClient(options);

      logger.info('Created MCP client', {
        clientInfo: definition.clientInfo,
        transport: definition.transport.type,
        capabilities: Object.keys(definition.capabilities || {}),
      });

      return client;
    } catch (error) {
      logger.error('Failed to create MCP client', { error, definition });
      throw error;
    }
  }

  static createClientFromConfig(configPath: string): MCPClient {
    try {
      const config = this.loadConfig(configPath);
      const definition = this.configToClientDefinition(config);
      return this.createClient(definition);
    } catch (error) {
      logger.error('Failed to create client from config', { error, configPath });
      throw error;
    }
  }

  // Provider registry methods
  static registerResourceProvider(name: string, factory: () => ResourceProvider): void {
    this.providerRegistry.resources.set(name, factory);
    logger.debug(`Registered resource provider: ${name}`);
  }

  static registerToolProvider(name: string, factory: () => ToolProvider): void {
    this.providerRegistry.tools.set(name, factory);
    logger.debug(`Registered tool provider: ${name}`);
  }

  static registerPromptProvider(name: string, factory: () => PromptProvider): void {
    this.providerRegistry.prompts.set(name, factory);
    logger.debug(`Registered prompt provider: ${name}`);
  }

  static unregisterProvider(type: 'resources' | 'tools' | 'prompts', name: string): boolean {
    const removed = this.providerRegistry[type].delete(name);
    if (removed) {
      logger.debug(`Unregistered ${type} provider: ${name}`);
    }
    return removed;
  }

  static getProviderRegistry(): ProviderRegistry {
    return this.providerRegistry;
  }

  static listProviders(): {
    resources: string[];
    tools: string[];
    prompts: string[];
  } {
    return {
      resources: Array.from(this.providerRegistry.resources.keys()),
      tools: Array.from(this.providerRegistry.tools.keys()),
      prompts: Array.from(this.providerRegistry.prompts.keys()),
    };
  }

  // Built-in provider factories
  static createSimpleResourceProvider(resources: Resource[]): ResourceProvider {
    return {
      async listResources(cursor?: string) {
        return { resources };
      },
      async readResource(uri: string) {
        const resource = resources.find(r => r.uri === uri);
        if (!resource) {
          throw new MCPError({
            code: ErrorCode.NOT_FOUND,
            message: `Resource not found: ${uri}`,
            severity: ErrorSeverity.MEDIUM,
            retryable: false,
            context: { uri },
          });
        }
        
        return {
          contents: [{
            uri,
            mimeType: resource.mimeType,
            text: `Content for ${resource.name}`,
          }],
        };
      },
    };
  }

  static createSimpleToolProvider(tools: Tool[], handlers: Map<string, (args: any) => Promise<CallToolResult>>): ToolProvider {
    return {
      async listTools() {
        return tools;
      },
      async callTool(request: CallToolRequest) {
        const handler = handlers.get(request.name);
        if (!handler) {
          throw new MCPError({
            code: ErrorCode.NOT_FOUND,
            message: `Tool handler not found: ${request.name}`,
            severity: ErrorSeverity.MEDIUM,
            retryable: false,
            context: { toolName: request.name },
          });
        }
        
        return handler(request.arguments);
      },
    };
  }

  static createSimplePromptProvider(prompts: Prompt[], handlers: Map<string, (args: any) => Promise<GetPromptResult>>): PromptProvider {
    return {
      async listPrompts() {
        return prompts;
      },
      async getPrompt(request: GetPromptRequest) {
        const handler = handlers.get(request.name);
        if (!handler) {
          throw new MCPError({
            code: ErrorCode.NOT_FOUND,
            message: `Prompt handler not found: ${request.name}`,
            severity: ErrorSeverity.MEDIUM,
            retryable: false,
            context: { promptName: request.name },
          });
        }
        
        return handler(request.arguments);
      },
    };
  }

  // Template and discovery methods
  static generateServerTemplate(
    name: string,
    transport: TransportType = TransportType.STDIO
  ): ServerDefinition {
    return {
      name,
      version: '1.0.0',
      description: `Generated MCP server: ${name}`,
      transport: { type: transport },
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
        logging: {},
      },
      providers: {
        resources: [],
        tools: [],
        prompts: [],
      },
      monitoring: {
        enabled: true,
        healthCheck: true,
        metrics: true,
      },
      logging: {
        level: 'info',
        destination: 'console',
      },
    };
  }

  static generateClientTemplate(
    name: string,
    transport: TransportType = TransportType.STDIO
  ): ClientDefinition {
    return {
      clientInfo: {
        name,
        version: '1.0.0',
      },
      transport: { type: transport },
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      connection: {
        timeout: 30000,
        retries: 3,
        autoReconnect: true,
      },
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        recoveryTimeout: 60000,
      },
      monitoring: {
        enabled: true,
      },
    };
  }

  static discoverServers(directory?: string): Promise<ServerDefinition[]> {
    // This would scan a directory for server configuration files
    // Implementation would be platform-specific
    logger.info('Server discovery not yet implemented', { directory });
    return Promise.resolve([]);
  }

  // Validation methods
  private static validateServerDefinition(definition: ServerDefinition): void {
    if (!definition.name || typeof definition.name !== 'string') {
      throw createValidationError('Server name is required and must be a string');
    }

    if (!definition.version || typeof definition.version !== 'string') {
      throw createValidationError('Server version is required and must be a string');
    }

    if (!definition.transport || !definition.transport.type) {
      throw createValidationError('Transport configuration is required');
    }

    if (!Object.values(TransportType).includes(definition.transport.type)) {
      throw createValidationError(`Invalid transport type: ${definition.transport.type}`);
    }

    if (!definition.capabilities || typeof definition.capabilities !== 'object') {
      throw createValidationError('Server capabilities are required');
    }
  }

  private static validateClientDefinition(definition: ClientDefinition): void {
    if (!definition.clientInfo || !definition.clientInfo.name || !definition.clientInfo.version) {
      throw createValidationError('Client info with name and version is required');
    }

    if (!definition.transport || !definition.transport.type) {
      throw createValidationError('Transport configuration is required');
    }

    if (!Object.values(TransportType).includes(definition.transport.type)) {
      throw createValidationError(`Invalid transport type: ${definition.transport.type}`);
    }
  }

  // Configuration helpers
  private static loadConfig(configPath: string): any {
    try {
      if (!this.configManager) {
        this.configManager = createConfigManager({ configPath });
      }
      return this.configManager.getAll();
    } catch (error) {
      throw createConfigurationError(
        `Failed to load configuration from ${configPath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { configPath }
      );
    }
  }

  private static configToServerDefinition(config: any): ServerDefinition {
    // Convert configuration object to ServerDefinition
    // This would include validation and type conversion
    return {
      name: config.name || 'Unnamed Server',
      version: config.version || '1.0.0',
      description: config.description,
      transport: config.transport || { type: TransportType.STDIO },
      capabilities: config.capabilities || {},
      providers: config.providers,
      middleware: config.middleware,
      authentication: config.authentication,
      rateLimit: config.rateLimit,
      monitoring: config.monitoring,
      logging: config.logging,
    };
  }

  private static configToClientDefinition(config: any): ClientDefinition {
    // Convert configuration object to ClientDefinition
    return {
      clientInfo: config.clientInfo || { name: 'Unnamed Client', version: '1.0.0' },
      transport: config.transport || { type: TransportType.STDIO },
      capabilities: config.capabilities,
      connection: config.connection,
      circuitBreaker: config.circuitBreaker,
      monitoring: config.monitoring,
    };
  }

  // Utility methods
  static getHealth(): {
    factory: { healthy: boolean; providers: number };
    registry: { resources: number; tools: number; prompts: number };
  } {
    return {
      factory: {
        healthy: true,
        providers: this.providerRegistry.resources.size + 
                  this.providerRegistry.tools.size + 
                  this.providerRegistry.prompts.size,
      },
      registry: {
        resources: this.providerRegistry.resources.size,
        tools: this.providerRegistry.tools.size,
        prompts: this.providerRegistry.prompts.size,
      },
    };
  }

  static reset(): void {
    this.providerRegistry.resources.clear();
    this.providerRegistry.tools.clear();
    this.providerRegistry.prompts.clear();
    logger.info('MCP Factory reset');
  }
}

// Export convenience functions
export function createServer(definition: ServerDefinition, options?: MCPServerOptions): Promise<UniversalMCPServer> {
  return MCPFactory.createServer(definition, options);
}

export function createClient(definition: ClientDefinition): MCPClient {
  return MCPFactory.createClient(definition);
}

export function registerResourceProvider(name: string, factory: () => ResourceProvider): void {
  MCPFactory.registerResourceProvider(name, factory);
}

export function registerToolProvider(name: string, factory: () => ToolProvider): void {
  MCPFactory.registerToolProvider(name, factory);
}

export function registerPromptProvider(name: string, factory: () => PromptProvider): void {
  MCPFactory.registerPromptProvider(name, factory);
}

export function generateServerTemplate(name: string, transport?: TransportType): ServerDefinition {
  return MCPFactory.generateServerTemplate(name, transport);
}

export function generateClientTemplate(name: string, transport?: TransportType): ClientDefinition {
  return MCPFactory.generateClientTemplate(name, transport);
}