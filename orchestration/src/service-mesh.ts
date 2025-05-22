import { EventEmitter } from 'events';
import { createLogger } from '../../shared/src/logging.js';
import { memoryOptimizationSuite } from '../../shared/src/memory-optimization-suite.js';

export interface ServiceRegistration {
  id: string;
  name: string;
  version: string;
  protocol: 'http' | 'grpc' | 'mcp' | 'websocket';
  endpoints: ServiceEndpoint[];
  healthcheck: HealthCheckConfig;
  metadata: ServiceMetadata;
  registeredAt: number;
  lastSeen: number;
  status: 'healthy' | 'unhealthy' | 'unknown' | 'draining';
}

export interface ServiceEndpoint {
  id: string;
  host: string;
  port: number;
  path: string;
  protocol: string;
  weight: number;
  tags: string[];
  rateLimit?: RateLimit;
  timeout?: number;
  retries?: number;
}

export interface ServiceMetadata {
  region: string;
  zone: string;
  environment: 'development' | 'staging' | 'production';
  capabilities: string[];
  resources: {
    cpu: number;
    memory: number;
    disk: number;
  };
  dependencies: string[];
  tags: Record<string, string>;
}

export interface HealthCheckConfig {
  enabled: boolean;
  path: string;
  interval: number;
  timeout: number;
  healthyThreshold: number;
  unhealthyThreshold: number;
  lastCheck?: number;
  consecutiveFailures: number;
}

export interface RateLimit {
  requestsPerSecond: number;
  burstSize: number;
  windowSize: number;
}

export interface LoadBalancingStrategy {
  type: 'round_robin' | 'least_connections' | 'weighted_round_robin' | 'consistent_hash' | 'adaptive';
  parameters: Record<string, any>;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxCalls: number;
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
}

export interface ServiceRoute {
  id: string;
  pattern: string;
  methods: string[];
  serviceId: string;
  middleware: string[];
  timeout: number;
  retries: number;
  circuitBreaker: CircuitBreakerConfig;
  rateLimit?: RateLimit;
  priority: number;
}

export interface RequestContext {
  id: string;
  service: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  timestamp: number;
  timeout: number;
  retries: number;
  attempt: number;
  metadata: Record<string, any>;
}

export interface ServiceMeshMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  errorRate: number;
  throughput: number;
  circuitBreakerTrips: number;
  rateLimitHits: number;
  serviceHealth: Record<string, number>;
}

export class ServiceMesh extends EventEmitter {
  private logger = createLogger('ServiceMesh');
  private services = new Map<string, ServiceRegistration>();
  private routes = new Map<string, ServiceRoute>();
  private loadBalancers = new Map<string, LoadBalancer>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private rateLimiters = new Map<string, RateLimiter>();
  private apiGateway: APIGateway;
  private serviceDiscovery: ServiceDiscovery;
  private healthChecker: HealthChecker;
  private metrics: ServiceMeshMetrics;
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      errorRate: 0,
      throughput: 0,
      circuitBreakerTrips: 0,
      rateLimitHits: 0,
      serviceHealth: {}
    };

    this.apiGateway = new APIGateway(this);
    this.serviceDiscovery = new ServiceDiscovery(this);
    this.healthChecker = new HealthChecker(this);
    
    this.startMonitoring();
    this.setupEventHandlers();
    
    this.logger.info('Service Mesh initialized');
  }

  private setupEventHandlers(): void {
    this.on('serviceRegistered', (service) => {
      this.logger.info(`Service registered: ${service.name}`, { id: service.id });
      this.updateLoadBalancer(service.name);
    });

    this.on('serviceDeregistered', (service) => {
      this.logger.info(`Service deregistered: ${service.name}`, { id: service.id });
      this.updateLoadBalancer(service.name);
    });

    this.on('serviceHealthChanged', (service, health) => {
      this.logger.info(`Service health changed: ${service.name}`, { id: service.id, health });
      this.metrics.serviceHealth[service.id] = health === 'healthy' ? 1 : 0;
    });

    this.on('circuitBreakerTripped', (serviceId) => {
      this.metrics.circuitBreakerTrips++;
      this.logger.warn(`Circuit breaker tripped for service: ${serviceId}`);
    });
  }

  async registerService(
    name: string,
    version: string,
    endpoints: Omit<ServiceEndpoint, 'id'>[],
    options: {
      protocol?: ServiceRegistration['protocol'];
      healthcheck?: Partial<HealthCheckConfig>;
      metadata?: Partial<ServiceMetadata>;
    } = {}
  ): Promise<string> {
    const serviceId = `${name}_${version}_${Date.now()}`;
    const now = Date.now();

    const service: ServiceRegistration = {
      id: serviceId,
      name,
      version,
      protocol: options.protocol || 'http',
      endpoints: endpoints.map((endpoint, index) => ({
        ...endpoint,
        id: `${serviceId}_endpoint_${index}`,
        weight: endpoint.weight || 1
      })),
      healthcheck: {
        enabled: true,
        path: '/health',
        interval: 30000,
        timeout: 5000,
        healthyThreshold: 2,
        unhealthyThreshold: 3,
        consecutiveFailures: 0,
        ...options.healthcheck
      },
      metadata: {
        region: 'default',
        zone: 'default',
        environment: 'development',
        capabilities: [],
        resources: { cpu: 1, memory: 1024, disk: 10240 },
        dependencies: [],
        tags: {},
        ...options.metadata
      },
      registeredAt: now,
      lastSeen: now,
      status: 'unknown'
    };

    this.services.set(serviceId, service);
    
    // Initialize load balancer for the service
    this.createLoadBalancer(name, { type: 'round_robin', parameters: {} });
    
    // Initialize circuit breaker for each endpoint
    for (const endpoint of service.endpoints) {
      this.createCircuitBreaker(endpoint.id);
    }

    // Start health checking
    if (service.healthcheck.enabled) {
      this.healthChecker.startHealthCheck(serviceId);
    }

    this.emit('serviceRegistered', service);
    return serviceId;
  }

  async deregisterService(serviceId: string): Promise<boolean> {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    // Stop health checking
    this.healthChecker.stopHealthCheck(serviceId);
    
    // Remove from load balancer
    this.removeFromLoadBalancer(service.name, serviceId);
    
    // Clean up circuit breakers
    for (const endpoint of service.endpoints) {
      this.circuitBreakers.delete(endpoint.id);
    }
    
    // Remove service
    this.services.delete(serviceId);
    
    this.emit('serviceDeregistered', service);
    return true;
  }

  async discoverServices(name?: string, tags?: Record<string, string>): Promise<ServiceRegistration[]> {
    let services = Array.from(this.services.values());
    
    if (name) {
      services = services.filter(s => s.name === name);
    }
    
    if (tags) {
      services = services.filter(s => {
        return Object.entries(tags).every(([key, value]) => s.metadata.tags[key] === value);
      });
    }
    
    return services.filter(s => s.status === 'healthy');
  }

  async routeRequest(
    serviceName: string,
    request: Omit<RequestContext, 'id' | 'timestamp'>
  ): Promise<{ endpoint: ServiceEndpoint; service: ServiceRegistration } | null> {
    const loadBalancer = this.loadBalancers.get(serviceName);
    if (!loadBalancer) {
      this.logger.warn(`No load balancer found for service: ${serviceName}`);
      return null;
    }

    const healthyServices = await this.discoverServices(serviceName);
    if (healthyServices.length === 0) {
      this.logger.warn(`No healthy instances found for service: ${serviceName}`);
      return null;
    }

    const selectedService = loadBalancer.selectService(healthyServices);
    if (!selectedService) {
      return null;
    }

    const selectedEndpoint = loadBalancer.selectEndpoint(selectedService.endpoints);
    if (!selectedEndpoint) {
      return null;
    }

    // Check circuit breaker
    const circuitBreaker = this.circuitBreakers.get(selectedEndpoint.id);
    if (circuitBreaker && !circuitBreaker.canExecute()) {
      this.logger.warn(`Circuit breaker open for endpoint: ${selectedEndpoint.id}`);
      return null;
    }

    // Check rate limit
    const rateLimiter = this.rateLimiters.get(selectedEndpoint.id);
    if (rateLimiter && !rateLimiter.allowRequest()) {
      this.metrics.rateLimitHits++;
      this.logger.warn(`Rate limit exceeded for endpoint: ${selectedEndpoint.id}`);
      return null;
    }

    return { endpoint: selectedEndpoint, service: selectedService };
  }

  async executeRequest(
    serviceName: string,
    request: Omit<RequestContext, 'id' | 'timestamp'>
  ): Promise<any> {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const context: RequestContext = {
      ...request,
      id: requestId,
      timestamp: startTime,
      attempt: 1
    };

    this.metrics.totalRequests++;
    
    try {
      const result = await this.executeWithRetry(serviceName, context);
      
      const latency = Date.now() - startTime;
      this.updateMetrics(true, latency);
      
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.updateMetrics(false, latency);
      
      this.logger.error(`Request failed: ${requestId}`, error);
      throw error;
    }
  }

  private async executeWithRetry(serviceName: string, context: RequestContext): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= context.retries + 1; attempt++) {
      context.attempt = attempt;
      
      try {
        const route = await this.routeRequest(serviceName, context);
        if (!route) {
          throw new Error(`No available endpoints for service: ${serviceName}`);
        }

        const result = await this.makeRequest(route.endpoint, context);
        
        // Record success in circuit breaker
        const circuitBreaker = this.circuitBreakers.get(route.endpoint.id);
        if (circuitBreaker) {
          circuitBreaker.recordSuccess();
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Record failure in circuit breaker
        const route = await this.routeRequest(serviceName, context);
        if (route) {
          const circuitBreaker = this.circuitBreakers.get(route.endpoint.id);
          if (circuitBreaker) {
            circuitBreaker.recordFailure();
          }
        }
        
        // Don't retry on certain errors
        if (this.isNonRetriableError(error as Error)) {
          break;
        }
        
        if (attempt < context.retries + 1) {
          await this.sleep(Math.pow(2, attempt - 1) * 1000); // Exponential backoff
        }
      }
    }
    
    throw lastError || new Error('All retry attempts failed');
  }

  private async makeRequest(endpoint: ServiceEndpoint, context: RequestContext): Promise<any> {
    // This would be implemented based on the endpoint protocol
    // For now, we'll simulate a request
    const isSuccess = Math.random() > 0.1; // 90% success rate
    
    if (isSuccess) {
      return { status: 'success', data: { message: 'Request completed successfully' } };
    } else {
      throw new Error('Simulated service error');
    }
  }

  private isNonRetriableError(error: Error): boolean {
    // Define which errors should not be retried
    const nonRetriableCodes = ['400', '401', '403', '404', '422'];
    return nonRetriableCodes.some(code => error.message.includes(code));
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createLoadBalancer(serviceName: string, strategy: LoadBalancingStrategy): void {
    const loadBalancer = new LoadBalancer(strategy);
    this.loadBalancers.set(serviceName, loadBalancer);
  }

  private updateLoadBalancer(serviceName: string): void {
    const loadBalancer = this.loadBalancers.get(serviceName);
    if (loadBalancer) {
      const services = Array.from(this.services.values()).filter(s => s.name === serviceName && s.status === 'healthy');
      loadBalancer.updateServices(services);
    }
  }

  private removeFromLoadBalancer(serviceName: string, serviceId: string): void {
    const loadBalancer = this.loadBalancers.get(serviceName);
    if (loadBalancer) {
      loadBalancer.removeService(serviceId);
    }
  }

  private createCircuitBreaker(endpointId: string): void {
    const circuitBreaker = new CircuitBreaker({
      enabled: true,
      failureThreshold: 5,
      recoveryTimeout: 60000,
      halfOpenMaxCalls: 3,
      state: 'closed',
      failureCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0
    });
    this.circuitBreakers.set(endpointId, circuitBreaker);
  }

  private updateMetrics(success: boolean, latency: number): void {
    if (success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
    
    this.metrics.errorRate = this.metrics.totalRequests > 0 
      ? this.metrics.failedRequests / this.metrics.totalRequests 
      : 0;
    
    this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
    
    // Update throughput (requests per second)
    this.metrics.throughput = this.metrics.totalRequests / (Date.now() / 1000);
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.cleanupStaleServices();
    }, 30000); // Every 30 seconds
  }

  private collectMetrics(): void {
    // Update P95 and P99 latency metrics
    // This would be implemented with a proper histogram in production
    this.metrics.p95Latency = this.metrics.averageLatency * 1.5;
    this.metrics.p99Latency = this.metrics.averageLatency * 2.0;
    
    this.emit('metricsUpdated', this.metrics);
  }

  private cleanupStaleServices(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    for (const [serviceId, service] of this.services) {
      if (now - service.lastSeen > staleThreshold) {
        this.logger.info(`Removing stale service: ${service.name}`, { id: serviceId });
        this.deregisterService(serviceId);
      }
    }
  }

  // Public API methods
  
  getServices(): ServiceRegistration[] {
    return Array.from(this.services.values());
  }

  getService(serviceId: string): ServiceRegistration | null {
    return this.services.get(serviceId) || null;
  }

  getServicesByName(name: string): ServiceRegistration[] {
    return Array.from(this.services.values()).filter(s => s.name === name);
  }

  getMetrics(): ServiceMeshMetrics {
    return { ...this.metrics };
  }

  getHealthyServices(): ServiceRegistration[] {
    return Array.from(this.services.values()).filter(s => s.status === 'healthy');
  }

  getLoadBalancerStats(serviceName: string): any {
    const loadBalancer = this.loadBalancers.get(serviceName);
    return loadBalancer ? loadBalancer.getStats() : null;
  }

  getCircuitBreakerStats(): Array<{ endpointId: string; stats: any }> {
    return Array.from(this.circuitBreakers.entries()).map(([endpointId, cb]) => ({
      endpointId,
      stats: cb.getStats()
    }));
  }

  async updateServiceHealth(serviceId: string, health: 'healthy' | 'unhealthy'): Promise<void> {
    const service = this.services.get(serviceId);
    if (service) {
      service.status = health;
      service.lastSeen = Date.now();
      this.emit('serviceHealthChanged', service, health);
    }
  }

  async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    await this.healthChecker.shutdown();
    
    this.logger.info('Service Mesh shutdown completed');
  }
}

class LoadBalancer {
  private strategy: LoadBalancingStrategy;
  private services: ServiceRegistration[] = [];
  private currentIndex = 0;
  private connectionCounts = new Map<string, number>();
  private stats = { totalRequests: 0, serviceSelections: new Map<string, number>() };

  constructor(strategy: LoadBalancingStrategy) {
    this.strategy = strategy;
  }

  selectService(services: ServiceRegistration[]): ServiceRegistration | null {
    if (services.length === 0) return null;
    
    this.stats.totalRequests++;
    
    let selected: ServiceRegistration;
    
    switch (this.strategy.type) {
      case 'round_robin':
        selected = services[this.currentIndex % services.length];
        this.currentIndex++;
        break;
        
      case 'least_connections':
        selected = services.reduce((min, service) => {
          const connections = this.connectionCounts.get(service.id) || 0;
          const minConnections = this.connectionCounts.get(min.id) || 0;
          return connections < minConnections ? service : min;
        });
        break;
        
      case 'weighted_round_robin':
        selected = this.selectWeightedService(services);
        break;
        
      default:
        selected = services[Math.floor(Math.random() * services.length)];
    }
    
    this.stats.serviceSelections.set(selected.id, (this.stats.serviceSelections.get(selected.id) || 0) + 1);
    return selected;
  }

  selectEndpoint(endpoints: ServiceEndpoint[]): ServiceEndpoint | null {
    if (endpoints.length === 0) return null;
    
    // For now, select the first healthy endpoint
    return endpoints[0];
  }

  private selectWeightedService(services: ServiceRegistration[]): ServiceRegistration {
    const totalWeight = services.reduce((sum, service) => sum + service.endpoints[0]?.weight || 1, 0);
    let random = Math.random() * totalWeight;
    
    for (const service of services) {
      const weight = service.endpoints[0]?.weight || 1;
      random -= weight;
      if (random <= 0) {
        return service;
      }
    }
    
    return services[0];
  }

  updateServices(services: ServiceRegistration[]): void {
    this.services = services;
  }

  removeService(serviceId: string): void {
    this.services = this.services.filter(s => s.id !== serviceId);
    this.connectionCounts.delete(serviceId);
  }

  getStats(): any {
    return {
      totalRequests: this.stats.totalRequests,
      serviceSelections: Object.fromEntries(this.stats.serviceSelections),
      strategy: this.strategy.type
    };
  }
}

class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private stats = { totalRequests: 0, successfulRequests: 0, failedRequests: 0 };

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
  }

  canExecute(): boolean {
    if (!this.config.enabled) return true;
    
    const now = Date.now();
    
    switch (this.config.state) {
      case 'closed':
        return true;
        
      case 'open':
        if (now >= this.config.nextAttemptTime) {
          this.config.state = 'half_open';
          return true;
        }
        return false;
        
      case 'half_open':
        return this.stats.totalRequests < this.config.halfOpenMaxCalls;
        
      default:
        return false;
    }
  }

  recordSuccess(): void {
    this.stats.totalRequests++;
    this.stats.successfulRequests++;
    
    if (this.config.state === 'half_open') {
      this.config.state = 'closed';
      this.config.failureCount = 0;
    }
  }

  recordFailure(): void {
    this.stats.totalRequests++;
    this.stats.failedRequests++;
    this.config.failureCount++;
    this.config.lastFailureTime = Date.now();
    
    if (this.config.failureCount >= this.config.failureThreshold) {
      this.config.state = 'open';
      this.config.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
    }
  }

  getStats(): any {
    return {
      state: this.config.state,
      failureCount: this.config.failureCount,
      totalRequests: this.stats.totalRequests,
      successRate: this.stats.totalRequests > 0 ? this.stats.successfulRequests / this.stats.totalRequests : 0
    };
  }
}

class RateLimiter {
  private config: RateLimit;
  private tokens: number;
  private lastRefill: number;

  constructor(config: RateLimit) {
    this.config = config;
    this.tokens = config.burstSize;
    this.lastRefill = Date.now();
  }

  allowRequest(): boolean {
    this.refillTokens();
    
    if (this.tokens > 0) {
      this.tokens--;
      return true;
    }
    
    return false;
  }

  private refillTokens(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const tokensToAdd = Math.floor(timePassed / 1000 * this.config.requestsPerSecond);
    
    this.tokens = Math.min(this.config.burstSize, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

class APIGateway {
  private serviceMesh: ServiceMesh;
  private logger = createLogger('APIGateway');

  constructor(serviceMesh: ServiceMesh) {
    this.serviceMesh = serviceMesh;
  }

  async handleRequest(request: any): Promise<any> {
    // Implementation would handle HTTP requests, routing, etc.
    this.logger.info('Handling API Gateway request', request);
    return { status: 'success' };
  }
}

class ServiceDiscovery {
  private serviceMesh: ServiceMesh;
  private logger = createLogger('ServiceDiscovery');

  constructor(serviceMesh: ServiceMesh) {
    this.serviceMesh = serviceMesh;
  }

  async publishService(service: ServiceRegistration): Promise<void> {
    this.logger.info(`Publishing service: ${service.name}`, { id: service.id });
    // Implementation would publish to external service discovery
  }

  async unpublishService(serviceId: string): Promise<void> {
    this.logger.info(`Unpublishing service: ${serviceId}`);
    // Implementation would remove from external service discovery
  }
}

class HealthChecker {
  private serviceMesh: ServiceMesh;
  private logger = createLogger('HealthChecker');
  private checkIntervals = new Map<string, NodeJS.Timeout>();

  constructor(serviceMesh: ServiceMesh) {
    this.serviceMesh = serviceMesh;
  }

  startHealthCheck(serviceId: string): void {
    const service = this.serviceMesh.getService(serviceId);
    if (!service) return;

    const interval = setInterval(async () => {
      await this.performHealthCheck(serviceId);
    }, service.healthcheck.interval);

    this.checkIntervals.set(serviceId, interval);
  }

  stopHealthCheck(serviceId: string): void {
    const interval = this.checkIntervals.get(serviceId);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(serviceId);
    }
  }

  private async performHealthCheck(serviceId: string): Promise<void> {
    const service = this.serviceMesh.getService(serviceId);
    if (!service) return;

    try {
      // Simulate health check - in production would make actual HTTP request
      const isHealthy = Math.random() > 0.05; // 95% success rate
      
      if (isHealthy) {
        service.healthcheck.consecutiveFailures = 0;
        if (service.status !== 'healthy') {
          service.status = 'healthy';
          await this.serviceMesh.updateServiceHealth(serviceId, 'healthy');
        }
      } else {
        service.healthcheck.consecutiveFailures++;
        if (service.healthcheck.consecutiveFailures >= service.healthcheck.unhealthyThreshold) {
          service.status = 'unhealthy';
          await this.serviceMesh.updateServiceHealth(serviceId, 'unhealthy');
        }
      }
      
      service.healthcheck.lastCheck = Date.now();
      service.lastSeen = Date.now();
    } catch (error) {
      this.logger.error(`Health check failed for service: ${serviceId}`, error);
      service.healthcheck.consecutiveFailures++;
      if (service.healthcheck.consecutiveFailures >= service.healthcheck.unhealthyThreshold) {
        service.status = 'unhealthy';
        await this.serviceMesh.updateServiceHealth(serviceId, 'unhealthy');
      }
    }
  }

  async shutdown(): Promise<void> {
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();
  }
}

export default ServiceMesh;