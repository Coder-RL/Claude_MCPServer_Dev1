import { DatabasePool } from '../../../database/pg-pool.js';
import { RedisConnectionManager } from '../../../database/redis-client.js';
import { getLogger, setLogLevel } from '../../../shared/logger.js';
import { HealthChecker } from '../../../shared/health-checker.js';
import { globalPerformanceMonitor } from '../../../shared/performance-monitor.js';
import { createConfigManager } from '../../../shared/config-manager.js';
import { BaseMCPServer, MCPServerOptions, ToolProvider } from '../../../shared/mcp/server.js';
import { 
  ServerDefinition, 
  createServer, 
  MCPFactory,
  registerToolProvider 
} from '../../../shared/mcp/factory.js';
import { TransportType } from '../../../shared/mcp/types.js';
import { VectorDatabase } from './vector-database.js';
import { EmbeddingService, MockEmbeddingProvider } from './embedding-service.js';
import { DomainKnowledgeOrganizer } from './domain-knowledge.js';
import { InferenceEnhancementTools } from './mcp-tools.js';

const logger = getLogger('InferenceEnhancementServer');

export interface InferenceEnhancementConfig {
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  server: {
    name: string;
    version: string;
    description: string;
    transport: {
      type: TransportType;
      endpoint?: string;
      port?: number;
    };
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  embedding: {
    provider: 'mock' | 'openai' | 'azure' | 'huggingface';
    model?: string;
    dimensions?: number;
    batchSize?: number;
  };
  features: {
    enablePerformanceMonitoring: boolean;
    enableHealthCheck: boolean;
    maxEmbeddingsPerRequest: number;
    defaultSearchLimit: number;
  };
}

export class InferenceEnhancementServer extends StandardMCPServer {
  private config: InferenceEnhancementConfig;
  private vectorDb: VectorDatabase;
  private embeddingService: EmbeddingService;
  private domainOrganizer: DomainKnowledgeOrganizer;
  private inferenceTools: InferenceEnhancementTools;
  private db: DatabasePool;
  private redis: RedisConnectionManager;

  constructor(config: InferenceEnhancementConfig, options: MCPServerOptions = {}) {
    const serverConfig = {
      name: config.server.name,
      version: config.server.version,
      description: config.server.description,
      transport: {
        type: config.server.transport.type,
        endpoint: config.server.transport.endpoint,
      },
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
        logging: {},
      },
    };

    super({ ...options, config: serverConfig });
    
    this.config = config;
    setLogLevel(config.server.logLevel);

    // Initialize database connections
    this.db = new DatabasePool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.username,
      password: config.database.password,
      ssl: config.database.ssl,
    });

    this.redis = new RedisConnectionManager({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
    });

    // Initialize core components
    this.vectorDb = new VectorDatabase(this.db);
    
    // Initialize embedding provider (using mock for now)
    const embeddingProvider = new MockEmbeddingProvider();
    this.embeddingService = new EmbeddingService(this.vectorDb, embeddingProvider);
    
    this.domainOrganizer = new DomainKnowledgeOrganizer(this.embeddingService);
    this.inferenceTools = new InferenceEnhancementTools(this.embeddingService, this.domainOrganizer);

    if (config.features.enablePerformanceMonitoring) {
      globalPerformanceMonitor.enable();
    }
  }

  get serverInfo() {
    return {
      name: this.config.server.name,
      version: this.config.server.version,
      description: this.config.server.description,
    };
  }

  protected async initializeProviders(): Promise<void> {
    try {
      logger.info('Initializing inference enhancement providers...');

      // Initialize database connections
      await this.db.initialize();
      await this.redis.connect();

      // Initialize vector database
      await this.vectorDb.initialize();

      // Register tool provider
      this.addToolProvider('inference-enhancement', {
        async listTools() {
          return inferenceTools.getTools();
        },
        async handleToolCall(request) {
          return inferenceTools.callTool(request);
        },
      });

      logger.info('Inference enhancement providers initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize providers', { error });
      throw error;
    }
  }

  protected async cleanup(): Promise<void> {
    logger.info('Cleaning up inference enhancement server...');

    try {
      if (this.redis) {
        await this.redis.disconnect();
      }
      
      if (this.db) {
        await this.db.close();
      }

      globalPerformanceMonitor.disable();
      
      logger.info('Inference enhancement server cleanup completed');
    } catch (error) {
      logger.error('Error during cleanup', { error });
    }
  }

  // Public API methods for direct access to services
  getVectorDatabase(): VectorDatabase {
    return this.vectorDb;
  }

  getEmbeddingService(): EmbeddingService {
    return this.embeddingService;
  }

  getDomainOrganizer(): DomainKnowledgeOrganizer {
    return this.domainOrganizer;
  }

  getInferenceTools(): InferenceEnhancementTools {
    return this.inferenceTools;
  }

  async getServerStats(): Promise<{
    server: any;
    database: any;
    embeddings: any;
    domains: any;
    health: any;
  }> {
    try {
      const [embeddingStats, domainStats, healthStatus] = await Promise.all([
        this.vectorDb.getStats(),
        this.domainOrganizer.getStats(),
        this.getHealthStatus(),
      ]);

      return {
        server: {
          name: this.config.server.name,
          version: this.config.server.version,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          connections: this.getConnectionMetrics(),
        },
        database: {
          vector: embeddingStats,
          poolStats: await this.db.getStats(),
          redisHealth: await this.redis.healthCheck(),
        },
        embeddings: embeddingStats,
        domains: domainStats,
        health: healthStatus,
      };
    } catch (error) {
      logger.error('Failed to get server stats', { error });
      throw error;
    }
  }
}

// Factory functions
export async function createInferenceEnhancementServer(
  config: InferenceEnhancementConfig
): Promise<InferenceEnhancementServer> {
  return new InferenceEnhancementServer(config);
}

export function createServerDefinition(
  config: Partial<InferenceEnhancementConfig> = {}
): ServerDefinition {
  const defaultConfig = loadDefaultConfig();
  const mergedConfig = { ...defaultConfig, ...config };

  return {
    name: mergedConfig.server.name,
    version: mergedConfig.server.version,
    description: mergedConfig.server.description,
    transport: {
      type: mergedConfig.server.transport.type,
      endpoint: mergedConfig.server.transport.endpoint,
    },
    capabilities: {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
      logging: {},
    },
    providers: {
      tools: ['inference-enhancement'],
    },
    monitoring: {
      enabled: mergedConfig.features.enablePerformanceMonitoring,
      healthCheck: mergedConfig.features.enableHealthCheck,
      metrics: true,
    },
    logging: {
      level: mergedConfig.server.logLevel,
      destination: 'console',
    },
  };
}

function loadDefaultConfig(): InferenceEnhancementConfig {
  return {
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'claude_mcp_server',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    },
    server: {
      name: 'Inference Enhancement Server',
      version: '1.0.0',
      description: 'MCP server for enhanced reasoning with domain knowledge and vector search',
      transport: {
        type: (process.env.TRANSPORT_TYPE as TransportType) || TransportType.STDIO,
        endpoint: process.env.TRANSPORT_ENDPOINT,
        port: process.env.TRANSPORT_PORT ? parseInt(process.env.TRANSPORT_PORT) : undefined,
      },
      logLevel: (process.env.LOG_LEVEL as any) || 'info',
    },
    embedding: {
      provider: (process.env.EMBEDDING_PROVIDER as any) || 'mock',
      model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
      dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536'),
      batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '100'),
    },
    features: {
      enablePerformanceMonitoring: process.env.ENABLE_MONITORING !== 'false',
      enableHealthCheck: process.env.ENABLE_HEALTH_CHECK !== 'false',
      maxEmbeddingsPerRequest: parseInt(process.env.MAX_EMBEDDINGS_PER_REQUEST || '1000'),
      defaultSearchLimit: parseInt(process.env.DEFAULT_SEARCH_LIMIT || '10'),
    },
  };
}

// Register the tool provider globally
function registerInferenceToolProvider(): void {
  const config = loadDefaultConfig();
  
  registerToolProvider('inference-enhancement', () => {
    // This would be initialized when the provider is actually used
    const db = new DatabasePool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.username,
      password: config.database.password,
      ssl: config.database.ssl,
    });

    const vectorDb = new VectorDatabase(db);
    const embeddingProvider = new MockEmbeddingProvider();
    const embeddingService = new EmbeddingService(vectorDb, embeddingProvider);
    const domainOrganizer = new DomainKnowledgeOrganizer(embeddingService);
    const inferenceTools = new InferenceEnhancementTools(embeddingService, domainOrganizer);

    return {
      async listTools() {
        return inferenceTools.getTools();
      },
      async handleToolCall(request) {
        return inferenceTools.callTool(request);
      },
    };
  });
}

// Initialize MCP Factory and register providers
MCPFactory.initialize();
registerInferenceToolProvider();

// CLI entry point
async function main(): Promise<void> {
  if (require.main === module) {
    try {
      const config = loadDefaultConfig();
      
      logger.info('Starting Inference Enhancement Server', {
        name: config.server.name,
        version: config.server.version,
        transport: config.server.transport.type,
        logLevel: config.server.logLevel,
      });

      const server = await createInferenceEnhancementServer(config);
      await server.start();

      // Graceful shutdown handling
      const shutdownHandler = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully...`);
        try {
          await server.shutdown();
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', { error });
          process.exit(1);
        }
      };

      process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
      process.on('SIGINT', () => shutdownHandler('SIGINT'));
      process.on('SIGUSR2', () => shutdownHandler('SIGUSR2')); // For nodemon

      logger.info('Inference Enhancement Server started successfully', {
        transport: config.server.transport.type,
        endpoint: config.server.transport.endpoint,
        pid: process.pid,
      });

    } catch (error) {
      logger.error('Failed to start Inference Enhancement Server', { error });
      process.exit(1);
    }
  }
}

// Export CLI function for testing
export { main };

// Start server if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}