import { etcd3 } from 'etcd3';
import { logger } from '@shared/logging';

export interface ServiceInfo {
  id: string;
  name: string;
  version: string;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'stdio' | 'ws';
  capabilities: string[];
  metadata: Record<string, any>;
  healthCheckUrl?: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastHeartbeat: Date;
  registeredAt: Date;
  tags: string[];
}

export interface ServiceRegistryConfig {
  etcdHosts: string[];
  keyPrefix: string;
  ttlSeconds: number;
  healthCheckIntervalMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface ServiceFilter {
  name?: string;
  capability?: string;
  tag?: string;
  status?: 'healthy' | 'unhealthy';
  version?: string;
}

class ServiceRegistry {
  private client: etcd3.Etcd3;
  private services = new Map<string, ServiceInfo>();
  private healthCheckTimers = new Map<string, NodeJS.Timeout>();
  private watchers = new Set<etcd3.Watcher>();
  private isConnected = false;

  constructor(private config: ServiceRegistryConfig) {
    this.client = new etcd3.Etcd3({
      hosts: config.etcdHosts,
      retry: {
        retryMethod: 'exponential',
        retryDelay: config.retryDelayMs,
        retryAttempts: config.retryAttempts,
      },
    });

    this.initializeRegistry();
  }

  private async initializeRegistry(): Promise<void> {
    try {
      // Test etcd connection
      await this.client.get('health-check').string();
      this.isConnected = true;
      logger.info('Service Registry connected to etcd', {
        hosts: this.config.etcdHosts,
        keyPrefix: this.config.keyPrefix,
      });

      // Start watching for service changes
      await this.startWatching();

      // Load existing services
      await this.loadExistingServices();
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to initialize Service Registry', {
        error: error instanceof Error ? error.message : 'Unknown error',
        hosts: this.config.etcdHosts,
      });
      throw error;
    }
  }

  private async startWatching(): Promise<void> {
    const watcher = this.client.watch().prefix(`${this.config.keyPrefix}/services/`);
    
    watcher.on('put', (kv) => {
      try {
        const serviceInfo: ServiceInfo = JSON.parse(kv.value.toString());
        this.services.set(serviceInfo.id, serviceInfo);
        logger.debug('Service updated in registry', {
          serviceId: serviceInfo.id,
          serviceName: serviceInfo.name,
          status: serviceInfo.status,
        });
      } catch (error) {
        logger.error('Failed to parse service info from etcd', {
          key: kv.key.toString(),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    watcher.on('delete', (kv) => {
      const key = kv.key.toString();
      const serviceId = key.split('/').pop();
      if (serviceId && this.services.has(serviceId)) {
        this.services.delete(serviceId);
        this.stopHealthCheck(serviceId);
        logger.info('Service removed from registry', { serviceId });
      }
    });

    this.watchers.add(watcher);
  }

  private async loadExistingServices(): Promise<void> {
    try {
      const services = await this.client.getAll().prefix(`${this.config.keyPrefix}/services/`);
      
      for (const [key, value] of Object.entries(services)) {
        try {
          const serviceInfo: ServiceInfo = JSON.parse(value);
          this.services.set(serviceInfo.id, serviceInfo);
          this.startHealthCheck(serviceInfo);
        } catch (error) {
          logger.warn('Failed to load service from etcd', {
            key,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      logger.info('Loaded existing services from registry', {
        count: this.services.size,
      });
    } catch (error) {
      logger.error('Failed to load existing services', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Register a service in the registry
   */
  async registerService(serviceInfo: Omit<ServiceInfo, 'registeredAt' | 'lastHeartbeat' | 'status'>): Promise<void> {
    const fullServiceInfo: ServiceInfo = {
      ...serviceInfo,
      status: 'unknown',
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
    };

    try {
      const key = `${this.config.keyPrefix}/services/${serviceInfo.id}`;
      const lease = this.client.lease(this.config.ttlSeconds);
      
      await this.client.put(key).value(JSON.stringify(fullServiceInfo)).lease(lease);
      
      this.services.set(serviceInfo.id, fullServiceInfo);
      this.startHealthCheck(fullServiceInfo);

      logger.info('Service registered successfully', {
        serviceId: serviceInfo.id,
        serviceName: serviceInfo.name,
        host: serviceInfo.host,
        port: serviceInfo.port,
      });
    } catch (error) {
      logger.error('Failed to register service', {
        serviceId: serviceInfo.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Unregister a service from the registry
   */
  async unregisterService(serviceId: string): Promise<void> {
    try {
      const key = `${this.config.keyPrefix}/services/${serviceId}`;
      await this.client.delete().key(key);
      
      this.services.delete(serviceId);
      this.stopHealthCheck(serviceId);

      logger.info('Service unregistered successfully', { serviceId });
    } catch (error) {
      logger.error('Failed to unregister service', {
        serviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update service status
   */
  async updateServiceStatus(serviceId: string, status: 'healthy' | 'unhealthy'): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service ${serviceId} not found in registry`);
    }

    const updatedService: ServiceInfo = {
      ...service,
      status,
      lastHeartbeat: new Date(),
    };

    try {
      const key = `${this.config.keyPrefix}/services/${serviceId}`;
      await this.client.put(key).value(JSON.stringify(updatedService));
      
      this.services.set(serviceId, updatedService);

      logger.debug('Service status updated', {
        serviceId,
        status,
        serviceName: service.name,
      });
    } catch (error) {
      logger.error('Failed to update service status', {
        serviceId,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get service by ID
   */
  getService(serviceId: string): ServiceInfo | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Get all services with optional filtering
   */
  getServices(filter?: ServiceFilter): ServiceInfo[] {
    let services = Array.from(this.services.values());

    if (filter) {
      if (filter.name) {
        services = services.filter(s => s.name === filter.name);
      }
      if (filter.capability) {
        services = services.filter(s => s.capabilities.includes(filter.capability!));
      }
      if (filter.tag) {
        services = services.filter(s => s.tags.includes(filter.tag!));
      }
      if (filter.status) {
        services = services.filter(s => s.status === filter.status);
      }
      if (filter.version) {
        services = services.filter(s => s.version === filter.version);
      }
    }

    return services;
  }

  /**
   * Get healthy services for load balancing
   */
  getHealthyServices(serviceName?: string): ServiceInfo[] {
    return this.getServices({
      name: serviceName,
      status: 'healthy',
    });
  }

  /**
   * Start health checking for a service
   */
  private startHealthCheck(serviceInfo: ServiceInfo): void {
    if (!serviceInfo.healthCheckUrl) {
      // If no health check URL, assume healthy
      this.updateServiceStatus(serviceInfo.id, 'healthy').catch(error => {
        logger.warn('Failed to update service status to healthy', {
          serviceId: serviceInfo.id,
          error: error.message,
        });
      });
      return;
    }

    const timer = setInterval(async () => {
      try {
        const response = await fetch(serviceInfo.healthCheckUrl!, {
          method: 'GET',
          timeout: 5000,
        });

        const status = response.ok ? 'healthy' : 'unhealthy';
        await this.updateServiceStatus(serviceInfo.id, status);
      } catch (error) {
        await this.updateServiceStatus(serviceInfo.id, 'unhealthy');
        logger.warn('Health check failed for service', {
          serviceId: serviceInfo.id,
          serviceName: serviceInfo.name,
          healthCheckUrl: serviceInfo.healthCheckUrl,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, this.config.healthCheckIntervalMs);

    this.healthCheckTimers.set(serviceInfo.id, timer);
  }

  /**
   * Stop health checking for a service
   */
  private stopHealthCheck(serviceId: string): void {
    const timer = this.healthCheckTimers.get(serviceId);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(serviceId);
    }
  }

  /**
   * Get registry health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy';
    connectedToEtcd: boolean;
    servicesCount: number;
    healthyServicesCount: number;
  }> {
    const services = Array.from(this.services.values());
    const healthyCount = services.filter(s => s.status === 'healthy').length;

    return {
      status: this.isConnected ? 'healthy' : 'unhealthy',
      connectedToEtcd: this.isConnected,
      servicesCount: services.length,
      healthyServicesCount: healthyCount,
    };
  }

  /**
   * Close the service registry
   */
  async close(): Promise<void> {
    // Clear all health check timers
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();

    // Close all watchers
    for (const watcher of this.watchers) {
      await watcher.cancel();
    }
    this.watchers.clear();

    // Close etcd client
    this.client.close();
    this.isConnected = false;

    logger.info('Service Registry closed');
  }
}

// Create and export service registry instance
const registryConfig: ServiceRegistryConfig = {
  etcdHosts: (process.env.ETCD_HOSTS || 'localhost:2379').split(','),
  keyPrefix: process.env.SERVICE_REGISTRY_PREFIX || 'mcp-servers',
  ttlSeconds: parseInt(process.env.SERVICE_TTL_SECONDS || '60'),
  healthCheckIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || '30000'),
  retryAttempts: parseInt(process.env.ETCD_RETRY_ATTEMPTS || '3'),
  retryDelayMs: parseInt(process.env.ETCD_RETRY_DELAY_MS || '1000'),
};

export const serviceRegistry = new ServiceRegistry(registryConfig);

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing Service Registry...');
  await serviceRegistry.close();
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing Service Registry...');
  await serviceRegistry.close();
});

export { ServiceRegistry };