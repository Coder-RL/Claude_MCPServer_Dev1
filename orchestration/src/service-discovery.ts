import { ServiceRegistry, ServiceInfo } from './service-registry.js';
import { MessageBus, MessagePayload } from './message-bus.js';
import { RedisConnectionManager } from '../../database/redis-client.js';
import { getLogger } from '../../shared/logger.js';

const logger = getLogger('ServiceDiscovery');

export interface ServiceEndpoint {
  id: string;
  serviceName: string;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'stdio' | 'ws';
  path?: string;
  weight: number;
  status: 'healthy' | 'unhealthy' | 'draining';
  metadata: Record<string, any>;
  lastHealthCheck: Date;
}

export interface DiscoveryQuery {
  serviceName?: string;
  capabilities?: string[];
  version?: string;
  tags?: string[];
  healthyOnly?: boolean;
  protocol?: string;
  metadata?: Record<string, any>;
}

export interface LoadBalancingStrategy {
  name: 'round-robin' | 'weighted' | 'least-connections' | 'random' | 'health-aware';
  options?: Record<string, any>;
}

export interface ServiceGroup {
  name: string;
  services: ServiceEndpoint[];
  strategy: LoadBalancingStrategy;
  healthCheckInterval: number;
  failureThreshold: number;
}

export interface DiscoveryMetrics {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  averageQueryTime: number;
  totalEndpoints: number;
  healthyEndpoints: number;
  unhealthyEndpoints: number;
  servicesDiscovered: number;
}

export class ServiceDiscovery {
  private registry: ServiceRegistry;
  private messageBus: MessageBus;
  private redis: RedisConnectionManager;
  private endpoints: Map<string, ServiceEndpoint> = new Map();
  private serviceGroups: Map<string, ServiceGroup> = new Map();
  private connectionTracking: Map<string, number> = new Map();
  private roundRobinCounters: Map<string, number> = new Map();
  private metrics: DiscoveryMetrics = {
    totalQueries: 0,
    successfulQueries: 0,
    failedQueries: 0,
    averageQueryTime: 0,
    totalEndpoints: 0,
    healthyEndpoints: 0,
    unhealthyEndpoints: 0,
    servicesDiscovered: 0,
  };
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private shutdownPromise: Promise<void> | null = null;

  constructor(
    registry: ServiceRegistry,
    messageBus: MessageBus,
    redis: RedisConnectionManager
  ) {
    this.registry = registry;
    this.messageBus = messageBus;
    this.redis = redis;
    this.setupSignalHandlers();
  }

  private setupSignalHandlers(): void {
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async initialize(): Promise<void> {
    try {
      await this.loadServiceEndpoints();
      await this.subscribeToServiceEvents();
      await this.startHealthChecking();
      
      logger.info('Service Discovery initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Service Discovery', { error });
      throw error;
    }
  }

  private async loadServiceEndpoints(): Promise<void> {
    try {
      const services = this.registry.getAllServices();
      
      for (const service of services) {
        const endpoint = this.serviceInfoToEndpoint(service);
        this.endpoints.set(endpoint.id, endpoint);
      }

      this.updateMetrics();
      logger.info(`Loaded ${this.endpoints.size} service endpoints`);
    } catch (error) {
      logger.error('Failed to load service endpoints', { error });
      throw error;
    }
  }

  private serviceInfoToEndpoint(service: ServiceInfo): ServiceEndpoint {
    return {
      id: service.id,
      serviceName: service.name,
      host: service.host,
      port: service.port,
      protocol: service.protocol,
      weight: 100,
      status: service.status === 'healthy' ? 'healthy' : 'unhealthy',
      metadata: {
        version: service.version,
        capabilities: service.capabilities,
        registeredAt: service.registeredAt,
      },
      lastHealthCheck: new Date(),
    };
  }

  private async subscribeToServiceEvents(): Promise<void> {
    try {
      await this.messageBus.subscribeToStream(
        'service-events',
        {
          group: 'service-discovery',
          consumer: `discovery-${process.pid}`,
          count: 10,
          block: 1000,
        },
        this.handleServiceEvent.bind(this)
      );

      logger.info('Subscribed to service events');
    } catch (error) {
      logger.error('Failed to subscribe to service events', { error });
      throw error;
    }
  }

  private async handleServiceEvent(message: MessagePayload): Promise<void> {
    try {
      const { type, data } = message;

      switch (type) {
        case 'service.registered':
          await this.handleServiceRegistered(data);
          break;
        case 'service.deregistered':
          await this.handleServiceDeregistered(data);
          break;
        case 'service.health_changed':
          await this.handleServiceHealthChanged(data);
          break;
        default:
          logger.debug(`Unknown service event type: ${type}`);
      }
    } catch (error) {
      logger.error('Failed to handle service event', { error, message });
    }
  }

  private async handleServiceRegistered(serviceInfo: ServiceInfo): Promise<void> {
    const endpoint = this.serviceInfoToEndpoint(serviceInfo);
    this.endpoints.set(endpoint.id, endpoint);
    
    await this.redis.setJSON(`endpoint:${endpoint.id}`, endpoint, 3600);
    
    this.updateMetrics();
    
    logger.info(`Added endpoint for service registration`, {
      endpointId: endpoint.id,
      serviceName: endpoint.serviceName,
      address: `${endpoint.host}:${endpoint.port}`,
    });
  }

  private async handleServiceDeregistered(serviceInfo: ServiceInfo): Promise<void> {
    const endpointId = serviceInfo.id;
    const endpoint = this.endpoints.get(endpointId);
    
    if (endpoint) {
      this.endpoints.delete(endpointId);
      await this.redis.getClient().del(`endpoint:${endpointId}`);
      
      this.updateMetrics();
      
      logger.info(`Removed endpoint for service deregistration`, {
        endpointId,
        serviceName: endpoint.serviceName,
      });
    }
  }

  private async handleServiceHealthChanged(data: { serviceId: string; status: string }): Promise<void> {
    const endpoint = this.endpoints.get(data.serviceId);
    
    if (endpoint) {
      const oldStatus = endpoint.status;
      endpoint.status = data.status === 'healthy' ? 'healthy' : 'unhealthy';
      endpoint.lastHealthCheck = new Date();
      
      await this.redis.setJSON(`endpoint:${endpoint.id}`, endpoint, 3600);
      
      if (oldStatus !== endpoint.status) {
        logger.info(`Endpoint health status changed`, {
          endpointId: endpoint.id,
          serviceName: endpoint.serviceName,
          oldStatus,
          newStatus: endpoint.status,
        });
        
        this.updateMetrics();
      }
    }
  }

  async discoverServices(query: DiscoveryQuery): Promise<ServiceEndpoint[]> {
    const startTime = Date.now();
    
    try {
      this.metrics.totalQueries++;
      
      let matchingEndpoints = Array.from(this.endpoints.values());

      if (query.serviceName) {
        matchingEndpoints = matchingEndpoints.filter(ep => 
          ep.serviceName.toLowerCase().includes(query.serviceName!.toLowerCase())
        );
      }

      if (query.protocol) {
        matchingEndpoints = matchingEndpoints.filter(ep => ep.protocol === query.protocol);
      }

      if (query.capabilities && query.capabilities.length > 0) {
        matchingEndpoints = matchingEndpoints.filter(ep => {
          const epCapabilities = ep.metadata.capabilities || [];
          return query.capabilities!.some(cap => epCapabilities.includes(cap));
        });
      }

      if (query.version) {
        matchingEndpoints = matchingEndpoints.filter(ep => 
          ep.metadata.version === query.version
        );
      }

      if (query.healthyOnly !== false) {
        matchingEndpoints = matchingEndpoints.filter(ep => ep.status === 'healthy');
      }

      if (query.metadata) {
        matchingEndpoints = matchingEndpoints.filter(ep => {
          return Object.entries(query.metadata!).every(([key, value]) => 
            ep.metadata[key] === value
          );
        });
      }

      const queryTime = Date.now() - startTime;
      this.updateQueryMetrics(queryTime, true);

      logger.debug(`Service discovery query completed`, {
        query,
        resultsCount: matchingEndpoints.length,
        queryTime,
      });

      return matchingEndpoints;
    } catch (error) {
      const queryTime = Date.now() - startTime;
      this.updateQueryMetrics(queryTime, false);
      
      logger.error('Service discovery query failed', { error, query });
      throw error;
    }
  }

  async selectEndpoint(
    serviceName: string,
    strategy: LoadBalancingStrategy = { name: 'round-robin' }
  ): Promise<ServiceEndpoint | null> {
    const endpoints = await this.discoverServices({ 
      serviceName, 
      healthyOnly: true 
    });

    if (endpoints.length === 0) {
      return null;
    }

    switch (strategy.name) {
      case 'round-robin':
        return this.selectRoundRobin(serviceName, endpoints);
      case 'weighted':
        return this.selectWeighted(endpoints);
      case 'least-connections':
        return this.selectLeastConnections(endpoints);
      case 'random':
        return this.selectRandom(endpoints);
      case 'health-aware':
        return this.selectHealthAware(endpoints);
      default:
        return endpoints[0];
    }
  }

  private selectRoundRobin(serviceName: string, endpoints: ServiceEndpoint[]): ServiceEndpoint {
    const currentIndex = this.roundRobinCounters.get(serviceName) || 0;
    const selectedEndpoint = endpoints[currentIndex % endpoints.length];
    this.roundRobinCounters.set(serviceName, currentIndex + 1);
    return selectedEndpoint;
  }

  private selectWeighted(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0);
    const random = Math.random() * totalWeight;
    
    let currentWeight = 0;
    for (const endpoint of endpoints) {
      currentWeight += endpoint.weight;
      if (random <= currentWeight) {
        return endpoint;
      }
    }
    
    return endpoints[0];
  }

  private selectLeastConnections(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    return endpoints.reduce((least, current) => {
      const leastConnections = this.connectionTracking.get(least.id) || 0;
      const currentConnections = this.connectionTracking.get(current.id) || 0;
      return currentConnections < leastConnections ? current : least;
    });
  }

  private selectRandom(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    return endpoints[Math.floor(Math.random() * endpoints.length)];
  }

  private selectHealthAware(endpoints: ServiceEndpoint[]): ServiceEndpoint {
    const healthyEndpoints = endpoints.filter(ep => ep.status === 'healthy');
    const recentlyChecked = healthyEndpoints.filter(ep => {
      const timeSinceCheck = Date.now() - ep.lastHealthCheck.getTime();
      return timeSinceCheck < 30000;
    });
    
    const targetEndpoints = recentlyChecked.length > 0 ? recentlyChecked : healthyEndpoints;
    return this.selectWeighted(targetEndpoints);
  }

  trackConnection(endpointId: string, delta: number = 1): void {
    const current = this.connectionTracking.get(endpointId) || 0;
    const newCount = Math.max(0, current + delta);
    this.connectionTracking.set(endpointId, newCount);
  }

  async createServiceGroup(
    name: string,
    serviceName: string,
    strategy: LoadBalancingStrategy,
    options: {
      healthCheckInterval?: number;
      failureThreshold?: number;
    } = {}
  ): Promise<void> {
    try {
      const services = await this.discoverServices({ serviceName });
      
      const serviceGroup: ServiceGroup = {
        name,
        services,
        strategy,
        healthCheckInterval: options.healthCheckInterval || 30000,
        failureThreshold: options.failureThreshold || 3,
      };

      this.serviceGroups.set(name, serviceGroup);
      
      await this.redis.setJSON(`service-group:${name}`, serviceGroup, 3600);
      
      logger.info(`Created service group`, {
        groupName: name,
        serviceName,
        endpointCount: services.length,
        strategy: strategy.name,
      });
    } catch (error) {
      logger.error(`Failed to create service group ${name}`, { error });
      throw error;
    }
  }

  async getServiceGroup(name: string): Promise<ServiceGroup | null> {
    const group = this.serviceGroups.get(name);
    if (group) {
      return group;
    }

    try {
      const cachedGroup = await this.redis.getJSON<ServiceGroup>(`service-group:${name}`);
      if (cachedGroup) {
        this.serviceGroups.set(name, cachedGroup);
        return cachedGroup;
      }
    } catch (error) {
      logger.error(`Failed to load service group ${name} from cache`, { error });
    }

    return null;
  }

  async removeServiceGroup(name: string): Promise<void> {
    this.serviceGroups.delete(name);
    await this.redis.getClient().del(`service-group:${name}`);
    
    logger.info(`Removed service group ${name}`);
  }

  private async startHealthChecking(): Promise<void> {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 15000);

    logger.info('Started health checking');
  }

  private async performHealthChecks(): Promise<void> {
    const endpoints = Array.from(this.endpoints.values());
    
    const healthCheckPromises = endpoints.map(async (endpoint) => {
      try {
        const isHealthy = await this.checkEndpointHealth(endpoint);
        const newStatus = isHealthy ? 'healthy' : 'unhealthy';
        
        if (endpoint.status !== newStatus) {
          endpoint.status = newStatus;
          endpoint.lastHealthCheck = new Date();
          
          await this.redis.setJSON(`endpoint:${endpoint.id}`, endpoint, 3600);
          
          logger.info(`Endpoint health status changed`, {
            endpointId: endpoint.id,
            serviceName: endpoint.serviceName,
            newStatus,
          });
        }
      } catch (error) {
        logger.error(`Health check failed for endpoint ${endpoint.id}`, { error });
      }
    });

    await Promise.allSettled(healthCheckPromises);
    this.updateMetrics();
  }

  private async checkEndpointHealth(endpoint: ServiceEndpoint): Promise<boolean> {
    try {
      const service = this.registry.getService(endpoint.id);
      return service?.status === 'healthy' || false;
    } catch (error) {
      return false;
    }
  }

  private updateMetrics(): void {
    const endpoints = Array.from(this.endpoints.values());
    
    this.metrics.totalEndpoints = endpoints.length;
    this.metrics.healthyEndpoints = endpoints.filter(ep => ep.status === 'healthy').length;
    this.metrics.unhealthyEndpoints = endpoints.filter(ep => ep.status === 'unhealthy').length;
    
    const uniqueServices = new Set(endpoints.map(ep => ep.serviceName));
    this.metrics.servicesDiscovered = uniqueServices.size;
  }

  private updateQueryMetrics(queryTime: number, success: boolean): void {
    if (success) {
      this.metrics.successfulQueries++;
      
      const currentAvg = this.metrics.averageQueryTime;
      const successfulCount = this.metrics.successfulQueries;
      this.metrics.averageQueryTime = (currentAvg * (successfulCount - 1) + queryTime) / successfulCount;
    } else {
      this.metrics.failedQueries++;
    }
  }

  getAllEndpoints(): ServiceEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  getEndpoint(endpointId: string): ServiceEndpoint | undefined {
    return this.endpoints.get(endpointId);
  }

  getServiceGroups(): ServiceGroup[] {
    return Array.from(this.serviceGroups.values());
  }

  getMetrics(): DiscoveryMetrics {
    return { ...this.metrics };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const registryHealth = await this.registry.healthCheck();
      const redisHealth = await this.redis.healthCheck();
      
      return {
        healthy: registryHealth.healthy && redisHealth.healthy,
        details: {
          registry: registryHealth,
          redis: redisHealth,
          metrics: this.metrics,
          endpoints: this.metrics.totalEndpoints,
          healthyEndpoints: this.metrics.healthyEndpoints,
          serviceGroups: this.serviceGroups.size,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    logger.info('Shutting down Service Discovery...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    try {
      await this.messageBus.unsubscribeFromStream('service-events', {
        group: 'service-discovery',
        consumer: `discovery-${process.pid}`,
      });
    } catch (error) {
      logger.error('Failed to unsubscribe from service events', { error });
    }

    this.endpoints.clear();
    this.serviceGroups.clear();
    this.connectionTracking.clear();
    this.roundRobinCounters.clear();

    logger.info('Service Discovery shutdown complete');
  }
}