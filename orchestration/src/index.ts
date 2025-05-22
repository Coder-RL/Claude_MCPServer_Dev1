import { DatabasePool } from '../../database/pg-pool.js';
import { RedisConnectionManager } from '../../database/redis-client.js';
import { ServiceRegistry } from './service-registry.js';
import { MessageBus } from './message-bus.js';
import { ResourceManager } from './resource-manager.js';
import { ServiceDiscovery } from './service-discovery.js';
import { createLogger } from '../../shared/src/logging.js';
import { HealthChecker } from '../../shared/src/health.js';

const logger = createLogger('OrchestrationServer');

export interface OrchestrationConfig {
  database: {
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl?: boolean;
    poolMin?: number;
    poolMax?: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  etcd: {
    endpoints: string[];
    auth?: {
      username: string;
      password: string;
    };
  };
  server: {
    port: number;
    host: string;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  monitoring: {
    healthCheckInterval: number;
    metricsPort: number;
  };
}

export class OrchestrationServer {
  private config: OrchestrationConfig;
  private db: DatabasePool;
  private redis: RedisConnectionManager;
  private serviceRegistry: ServiceRegistry;
  private messageBus: MessageBus;
  private resourceManager: ResourceManager;
  private serviceDiscovery: ServiceDiscovery;
  private healthChecker: HealthChecker;
  private isRunning = false;
  private shutdownPromise: Promise<void> | null = null;

  constructor(config: OrchestrationConfig) {
    this.config = config;
    setLogLevel(config.server.logLevel);

    this.db = new DatabasePool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.username,
      password: config.database.password,
      ssl: config.database.ssl,
      min: config.database.poolMin || 5,
      max: config.database.poolMax || 20,
    });

    this.redis = new RedisConnectionManager({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db || 0,
    });

    this.serviceRegistry = new ServiceRegistry(
      this.db,
      this.redis,
      {
        endpoints: config.etcd.endpoints,
        auth: config.etcd.auth,
      }
    );

    this.messageBus = new MessageBus(this.redis);
    this.resourceManager = new ResourceManager(this.db, this.redis);
    this.serviceDiscovery = new ServiceDiscovery(
      this.serviceRegistry,
      this.messageBus,
      this.redis
    );

    this.healthChecker = new HealthChecker();
    this.setupSignalHandlers();
  }

  private setupSignalHandlers(): void {
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, initiating graceful shutdown');
      this.shutdown();
    });

    process.on('SIGINT', () => {
      logger.info('Received SIGINT, initiating graceful shutdown');
      this.shutdown();
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception occurred', { error });
      this.shutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', { reason, promise });
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Orchestration server is already running');
      return;
    }

    try {
      logger.info('Starting Orchestration Server...', {
        version: process.env.npm_package_version || 'unknown',
        nodeVersion: process.version,
        config: {
          host: this.config.server.host,
          port: this.config.server.port,
          logLevel: this.config.server.logLevel,
        },
      });

      await this.initializeComponents();
      await this.registerHealthChecks();
      await this.startHealthMonitoring();

      this.isRunning = true;

      logger.info('Orchestration Server started successfully', {
        host: this.config.server.host,
        port: this.config.server.port,
        components: [
          'DatabasePool',
          'RedisConnectionManager',
          'ServiceRegistry',
          'MessageBus',
          'ResourceManager',
          'ServiceDiscovery',
        ],
      });

      await this.publishServerStartedEvent();
    } catch (error) {
      logger.error('Failed to start Orchestration Server', { error });
      await this.shutdown();
      throw error;
    }
  }

  private async initializeComponents(): Promise<void> {
    logger.info('Initializing orchestration components...');

    try {
      await this.db.initialize();
      logger.info('Database pool initialized');

      await this.redis.connect();
      logger.info('Redis connection established');

      await this.serviceRegistry.initialize();
      logger.info('Service registry initialized');

      await this.resourceManager.initialize();
      logger.info('Resource manager initialized');

      await this.serviceDiscovery.initialize();
      logger.info('Service discovery initialized');

      logger.info('All orchestration components initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize components', { error });
      throw error;
    }
  }

  private async registerHealthChecks(): Promise<void> {
    this.healthChecker.addCheck('database', async () => {
      return await this.db.healthCheck();
    });

    this.healthChecker.addCheck('redis', async () => {
      return await this.redis.healthCheck();
    });

    this.healthChecker.addCheck('service-registry', async () => {
      return await this.serviceRegistry.healthCheck();
    });

    this.healthChecker.addCheck('message-bus', async () => {
      return await this.messageBus.healthCheck();
    });

    this.healthChecker.addCheck('resource-manager', async () => {
      return await this.resourceManager.healthCheck();
    });

    this.healthChecker.addCheck('service-discovery', async () => {
      return await this.serviceDiscovery.healthCheck();
    });

    logger.info('Health checks registered for all components');
  }

  private async startHealthMonitoring(): Promise<void> {
    setInterval(async () => {
      try {
        const healthStatus = await this.healthChecker.checkAll();
        
        if (!healthStatus.healthy) {
          logger.warn('Health check failed', {
            unhealthyChecks: Object.entries(healthStatus.checks)
              .filter(([_, check]) => !check.healthy)
              .map(([name, check]) => ({ name, details: check.details })),
          });
        } else {
          logger.debug('All health checks passed');
        }

        await this.redis.setJSON('orchestration:health', healthStatus, 60);
      } catch (error) {
        logger.error('Failed to perform health checks', { error });
      }
    }, this.config.monitoring.healthCheckInterval);

    logger.info('Health monitoring started');
  }

  private async publishServerStartedEvent(): Promise<void> {
    try {
      await this.messageBus.publishMessage('system-events', {
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'orchestration.server.started',
        source: 'orchestration-server',
        data: {
          host: this.config.server.host,
          port: this.config.server.port,
          startTime: new Date().toISOString(),
          components: [
            'ServiceRegistry',
            'MessageBus',
            'ResourceManager',
            'ServiceDiscovery',
          ],
        },
        timestamp: Date.now(),
      });
      
      logger.info('Published server started event');
    } catch (error) {
      logger.error('Failed to publish server started event', { error });
    }
  }

  async registerService(serviceInfo: {
    name: string;
    version: string;
    host: string;
    port: number;
    protocol: 'http' | 'https' | 'stdio' | 'ws';
    capabilities: string[];
    metadata?: Record<string, any>;
  }): Promise<string> {
    try {
      return await this.serviceRegistry.registerService(serviceInfo);
    } catch (error) {
      logger.error('Failed to register service', { error, serviceInfo });
      throw error;
    }
  }

  async deregisterService(serviceId: string): Promise<void> {
    try {
      await this.serviceRegistry.deregisterService(serviceId);
      
      await this.messageBus.publishMessage('service-events', {
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'service.deregistered',
        source: 'orchestration-server',
        data: { serviceId },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to deregister service', { error, serviceId });
      throw error;
    }
  }

  async discoverServices(query: {
    serviceName?: string;
    capabilities?: string[];
    version?: string;
    healthyOnly?: boolean;
  }): Promise<any[]> {
    try {
      return await this.serviceDiscovery.discoverServices(query);
    } catch (error) {
      logger.error('Failed to discover services', { error, query });
      throw error;
    }
  }

  async allocateResources(request: {
    serviceId: string;
    serviceName: string;
    requested: {
      cpu: number;
      memory: number;
      storage: number;
      connections: number;
    };
    priority: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<string> {
    try {
      return await this.resourceManager.requestAllocation(request);
    } catch (error) {
      logger.error('Failed to allocate resources', { error, request });
      throw error;
    }
  }

  async releaseResources(allocationId: string): Promise<void> {
    try {
      await this.resourceManager.releaseAllocation(allocationId);
    } catch (error) {
      logger.error('Failed to release resources', { error, allocationId });
      throw error;
    }
  }

  async getSystemMetrics(): Promise<{
    services: any;
    resources: any;
    discovery: any;
    messaging: any;
  }> {
    try {
      return {
        services: this.serviceRegistry.getMetrics(),
        resources: this.resourceManager.getMetrics(),
        discovery: this.serviceDiscovery.getMetrics(),
        messaging: this.messageBus.getMetrics(),
      };
    } catch (error) {
      logger.error('Failed to get system metrics', { error });
      throw error;
    }
  }

  async getHealthStatus(): Promise<any> {
    try {
      return await this.healthChecker.checkAll();
    } catch (error) {
      logger.error('Failed to get health status', { error });
      throw error;
    }
  }

  getServiceRegistry(): ServiceRegistry {
    return this.serviceRegistry;
  }

  getMessageBus(): MessageBus {
    return this.messageBus;
  }

  getResourceManager(): ResourceManager {
    return this.resourceManager;
  }

  getServiceDiscovery(): ServiceDiscovery {
    return this.serviceDiscovery;
  }

  isHealthy(): boolean {
    return this.isRunning;
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    logger.info('Shutting down Orchestration Server...');
    
    this.isRunning = false;

    try {
      await this.publishServerShutdownEvent();
    } catch (error) {
      logger.error('Failed to publish shutdown event', { error });
    }

    const shutdownPromises = [
      this.serviceDiscovery.shutdown(),
      this.resourceManager.shutdown(),
      this.messageBus.shutdown(),
      this.serviceRegistry.shutdown(),
      this.redis.disconnect(),
      this.db.close(),
    ];

    try {
      await Promise.allSettled(shutdownPromises);
      logger.info('All components shut down successfully');
    } catch (error) {
      logger.error('Error during component shutdown', { error });
    }

    logger.info('Orchestration Server shutdown complete');
  }

  private async publishServerShutdownEvent(): Promise<void> {
    try {
      await this.messageBus.publishMessage('system-events', {
        id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'orchestration.server.shutdown',
        source: 'orchestration-server',
        data: {
          shutdownTime: new Date().toISOString(),
          reason: 'graceful_shutdown',
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error('Failed to publish shutdown event', { error });
    }
  }
}

async function createServerFromEnv(): Promise<OrchestrationServer> {
  const config: OrchestrationConfig = {
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'claude_mcp_server',
      username: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
      poolMin: parseInt(process.env.DB_POOL_MIN || '5'),
      poolMax: parseInt(process.env.DB_POOL_MAX || '20'),
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
    },
    etcd: {
      endpoints: (process.env.ETCD_ENDPOINTS || 'http://localhost:2379').split(','),
      auth: process.env.ETCD_USERNAME ? {
        username: process.env.ETCD_USERNAME,
        password: process.env.ETCD_PASSWORD || '',
      } : undefined,
    },
    server: {
      port: parseInt(process.env.PORT || '8080'),
      host: process.env.HOST || '0.0.0.0',
      logLevel: (process.env.LOG_LEVEL as any) || 'info',
    },
    monitoring: {
      healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
      metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
    },
  };

  return new OrchestrationServer(config);
}

if (require.main === module) {
  createServerFromEnv()
    .then(async (server) => {
      await server.start();
      
      process.on('SIGTERM', () => {
        server.shutdown().then(() => {
          process.exit(0);
        });
      });
      
      process.on('SIGINT', () => {
        server.shutdown().then(() => {
          process.exit(0);
        });
      });
    })
    .catch((error) => {
      console.error('Failed to start orchestration server:', error);
      process.exit(1);
    });
}

export { createServerFromEnv };