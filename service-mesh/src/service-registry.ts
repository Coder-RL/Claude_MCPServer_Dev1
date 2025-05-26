import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface ServiceInstance {
  id: string;
  serviceName: string;
  version: string;
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'grpc' | 'tcp' | 'udp';
  metadata: Record<string, any>;
  tags: string[];
  healthCheck: HealthCheckConfig;
  status: 'starting' | 'healthy' | 'unhealthy' | 'draining' | 'stopped';
  registeredAt: Date;
  lastHeartbeat: Date;
  metrics: ServiceMetrics;
}

export interface HealthCheckConfig {
  enabled: boolean;
  path?: string;
  method?: string;
  interval: number; // seconds
  timeout: number; // seconds
  retries: number;
  gracePeriod: number; // seconds
  headers?: Record<string, string>;
  expectedStatus?: number[];
  expectedBody?: string;
  tcp?: boolean;
}

export interface ServiceMetrics {
  requestCount: number;
  errorCount: number;
  responseTime: number;
  lastRequestTime: Date;
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
}

export interface ServiceDiscoveryQuery {
  serviceName?: string;
  version?: string;
  tags?: string[];
  metadata?: Record<string, any>;
  status?: string[];
  limit?: number;
  excludeUnhealthy?: boolean;
}

export interface LoadBalancingStrategy {
  algorithm: 'round-robin' | 'least-connections' | 'random' | 'weighted' | 'ip-hash' | 'consistent-hash';
  healthyOnly: boolean;
  stickySession?: {
    enabled: boolean;
    key: string; // cookie name or header name
    ttl: number; // seconds
  };
  weights?: Record<string, number>; // instance id -> weight
}

export interface ServiceRoute {
  id: string;
  pattern: string;
  method?: string;
  headers?: Record<string, string>;
  serviceName: string;
  version?: string;
  rewrite?: {
    path?: string;
    headers?: Record<string, string>;
  };
  timeout: number;
  retries: number;
  loadBalancing: LoadBalancingStrategy;
  middleware: string[];
  enabled: boolean;
}

export class ServiceRegistry extends EventEmitter {
  private services = new Map<string, ServiceInstance>();
  private routes = new Map<string, ServiceRoute>();
  private healthCheckTimers = new Map<string, NodeJS.Timeout>();
  private stickySessionStore = new Map<string, { instanceId: string; expires: number }>();
  private connectionCounts = new Map<string, number>();
  private lastSelectedInstance = new Map<string, string>();
  private consistentHashRing = new Map<string, string[]>();
  
  constructor() {
    super();
    this.startCleanupProcess();
  }

  registerService(service: Omit<ServiceInstance, 'id' | 'registeredAt' | 'lastHeartbeat' | 'metrics'>): string {
    const serviceInstance: ServiceInstance = {
      id: this.generateServiceId(service.serviceName, service.host, service.port),
      registeredAt: new Date(),
      lastHeartbeat: new Date(),
      metrics: {
        requestCount: 0,
        errorCount: 0,
        responseTime: 0,
        lastRequestTime: new Date(),
        uptime: 0,
        memoryUsage: 0,
        cpuUsage: 0
      },
      ...service
    };

    this.services.set(serviceInstance.id, serviceInstance);
    
    // Start health checking if enabled
    if (serviceInstance.healthCheck.enabled) {
      this.startHealthCheck(serviceInstance.id);
    }

    // Update consistent hash ring
    this.updateConsistentHashRing(serviceInstance.serviceName);

    this.emit('service-registered', serviceInstance);
    return serviceInstance.id;
  }

  deregisterService(serviceId: string): boolean {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    // Stop health checking
    const healthTimer = this.healthCheckTimers.get(serviceId);
    if (healthTimer) {
      clearInterval(healthTimer);
      this.healthCheckTimers.delete(serviceId);
    }

    // Remove from registry
    this.services.delete(serviceId);

    // Update consistent hash ring
    this.updateConsistentHashRing(service.serviceName);

    // Clean up connection counts
    this.connectionCounts.delete(serviceId);

    this.emit('service-deregistered', { serviceId, serviceName: service.serviceName });
    return true;
  }

  heartbeat(serviceId: string, metrics?: Partial<ServiceMetrics>): boolean {
    const service = this.services.get(serviceId);
    if (!service) {
      return false;
    }

    service.lastHeartbeat = new Date();
    
    if (metrics) {
      Object.assign(service.metrics, metrics);
    }

    // Update uptime
    service.metrics.uptime = Date.now() - service.registeredAt.getTime();

    this.emit('heartbeat-received', { serviceId, serviceName: service.serviceName });
    return true;
  }

  discoverServices(query: ServiceDiscoveryQuery): ServiceInstance[] {
    let results = Array.from(this.services.values());

    // Filter by service name
    if (query.serviceName) {
      results = results.filter(s => s.serviceName === query.serviceName);
    }

    // Filter by version
    if (query.version) {
      results = results.filter(s => s.version === query.version);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(s => 
        query.tags!.every(tag => s.tags.includes(tag))
      );
    }

    // Filter by metadata
    if (query.metadata) {
      results = results.filter(s => {
        return Object.entries(query.metadata!).every(([key, value]) => 
          s.metadata[key] === value
        );
      });
    }

    // Filter by status
    if (query.status && query.status.length > 0) {
      results = results.filter(s => query.status!.includes(s.status));
    }

    // Exclude unhealthy services
    if (query.excludeUnhealthy) {
      results = results.filter(s => s.status === 'healthy');
    }

    // Apply limit
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  selectInstance(serviceName: string, strategy: LoadBalancingStrategy, context?: any): ServiceInstance | null {
    const candidates = this.discoverServices({
      serviceName,
      status: strategy.healthyOnly ? ['healthy'] : ['healthy', 'starting'],
      excludeUnhealthy: strategy.healthyOnly
    });

    if (candidates.length === 0) {
      return null;
    }

    // Handle sticky sessions
    if (strategy.stickySession?.enabled && context?.sessionKey) {
      const sessionId = this.getSessionId(context.sessionKey, strategy.stickySession.key);
      const stickyInstance = this.getStickyInstance(sessionId);
      
      if (stickyInstance && candidates.find(c => c.id === stickyInstance)) {
        return this.services.get(stickyInstance) || null;
      }
    }

    let selectedInstance: ServiceInstance;

    switch (strategy.algorithm) {
      case 'round-robin':
        selectedInstance = this.selectRoundRobin(candidates, serviceName);
        break;
      
      case 'least-connections':
        selectedInstance = this.selectLeastConnections(candidates);
        break;
      
      case 'random':
        selectedInstance = this.selectRandom(candidates);
        break;
      
      case 'weighted':
        selectedInstance = this.selectWeighted(candidates, strategy.weights || {});
        break;
      
      case 'ip-hash':
        selectedInstance = this.selectIpHash(candidates, context?.clientIp || '');
        break;
      
      case 'consistent-hash':
        selectedInstance = this.selectConsistentHash(serviceName, context?.hashKey || '');
        break;
      
      default:
        selectedInstance = candidates[0];
    }

    // Update sticky session if enabled
    if (strategy.stickySession?.enabled && context?.sessionKey) {
      const sessionId = this.getSessionId(context.sessionKey, strategy.stickySession.key);
      this.setStickyInstance(sessionId, selectedInstance.id, strategy.stickySession.ttl);
    }

    // Update connection count
    this.incrementConnectionCount(selectedInstance.id);

    return selectedInstance;
  }

  private selectRoundRobin(candidates: ServiceInstance[], serviceName: string): ServiceInstance {
    const lastSelected = this.lastSelectedInstance.get(serviceName);
    
    if (!lastSelected) {
      const selected = candidates[0];
      this.lastSelectedInstance.set(serviceName, selected.id);
      return selected;
    }

    const lastIndex = candidates.findIndex(c => c.id === lastSelected);
    const nextIndex = (lastIndex + 1) % candidates.length;
    const selected = candidates[nextIndex];
    
    this.lastSelectedInstance.set(serviceName, selected.id);
    return selected;
  }

  private selectLeastConnections(candidates: ServiceInstance[]): ServiceInstance {
    return candidates.reduce((least, current) => {
      const leastConnections = this.connectionCounts.get(least.id) || 0;
      const currentConnections = this.connectionCounts.get(current.id) || 0;
      return currentConnections < leastConnections ? current : least;
    });
  }

  private selectRandom(candidates: ServiceInstance[]): ServiceInstance {
    const randomIndex = Math.floor(Math.random() * candidates.length);
    return candidates[randomIndex];
  }

  private selectWeighted(candidates: ServiceInstance[], weights: Record<string, number>): ServiceInstance {
    const totalWeight = candidates.reduce((sum, instance) => 
      sum + (weights[instance.id] || 1), 0
    );
    
    let random = Math.random() * totalWeight;
    
    for (const instance of candidates) {
      const weight = weights[instance.id] || 1;
      random -= weight;
      if (random <= 0) {
        return instance;
      }
    }
    
    return candidates[candidates.length - 1];
  }

  private selectIpHash(candidates: ServiceInstance[], clientIp: string): ServiceInstance {
    const hash = crypto.createHash('md5').update(clientIp).digest('hex');
    const index = parseInt(hash.substring(0, 8), 16) % candidates.length;
    return candidates[index];
  }

  private selectConsistentHash(serviceName: string, hashKey: string): ServiceInstance {
    const ring = this.consistentHashRing.get(serviceName);
    if (!ring || ring.length === 0) {
      // Fallback to first available instance
      const candidates = this.discoverServices({ serviceName, excludeUnhealthy: true });
      return candidates.length > 0 ? candidates[0] : null!;
    }

    const hash = crypto.createHash('md5').update(hashKey).digest('hex');
    const position = parseInt(hash.substring(0, 8), 16);
    
    // Find the first node >= position
    for (const nodeHash of ring) {
      if (parseInt(nodeHash, 16) >= position) {
        const instanceId = this.getInstanceFromHash(serviceName, nodeHash);
        const instance = this.services.get(instanceId);
        if (instance) {
          return instance;
        }
      }
    }
    
    // Wrap around to first node
    const firstNodeHash = ring[0];
    const instanceId = this.getInstanceFromHash(serviceName, firstNodeHash);
    return this.services.get(instanceId) || null!;
  }

  private updateConsistentHashRing(serviceName: string): void {
    const instances = this.discoverServices({ serviceName });
    const ring: string[] = [];
    
    // Create virtual nodes for better distribution
    const virtualNodes = 150;
    
    for (const instance of instances) {
      for (let i = 0; i < virtualNodes; i++) {
        const hash = crypto.createHash('md5')
          .update(`${instance.id}:${i}`)
          .digest('hex')
          .substring(0, 8);
        ring.push(hash);
      }
    }
    
    ring.sort((a, b) => parseInt(a, 16) - parseInt(b, 16));
    this.consistentHashRing.set(serviceName, ring);
  }

  private getInstanceFromHash(serviceName: string, hash: string): string {
    // This is a simplified implementation
    // In practice, you'd need to maintain a mapping from hash to instance
    const instances = this.discoverServices({ serviceName });
    const index = parseInt(hash, 16) % instances.length;
    return instances[index]?.id || '';
  }

  private generateServiceId(serviceName: string, host: string, port: number): string {
    const data = `${serviceName}:${host}:${port}:${Date.now()}`;
    return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
  }

  private startHealthCheck(serviceId: string): void {
    const service = this.services.get(serviceId);
    if (!service || !service.healthCheck.enabled) {
      return;
    }

    const checkHealth = async () => {
      try {
        const isHealthy = await this.performHealthCheck(service);
        const previousStatus = service.status;
        
        if (isHealthy) {
          service.status = service.status === 'starting' ? 'healthy' : service.status;
          if (service.status !== 'healthy' && service.status !== 'draining') {
            service.status = 'healthy';
          }
        } else {
          service.status = 'unhealthy';
        }

        if (previousStatus !== service.status) {
          this.emit('service-status-changed', {
            serviceId,
            serviceName: service.serviceName,
            previousStatus,
            currentStatus: service.status
          });
        }

      } catch (error) {
        service.status = 'unhealthy';
        this.emit('health-check-failed', {
          serviceId,
          serviceName: service.serviceName,
          error: (error as Error).message
        });
      }
    };

    // Perform initial check after grace period
    setTimeout(checkHealth, service.healthCheck.gracePeriod * 1000);

    // Set up regular health checks
    const timer = setInterval(checkHealth, service.healthCheck.interval * 1000);
    this.healthCheckTimers.set(serviceId, timer);
  }

  private async performHealthCheck(service: ServiceInstance): Promise<boolean> {
    const config = service.healthCheck;

    if (config.tcp) {
      return this.performTcpHealthCheck(service);
    }

    if (config.path) {
      return this.performHttpHealthCheck(service);
    }

    // Default to always healthy if no specific check is configured
    return true;
  }

  private async performTcpHealthCheck(service: ServiceInstance): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, service.healthCheck.timeout * 1000);

      socket.connect(service.port, service.host, () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });
  }

  private async performHttpHealthCheck(service: ServiceInstance): Promise<boolean> {
    const url = `${service.protocol}://${service.host}:${service.port}${service.healthCheck.path}`;
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), service.healthCheck.timeout * 1000);

      const response = await fetch(url, {
        method: service.healthCheck.method || 'GET',
        headers: service.healthCheck.headers || {},
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Check status code
      const expectedStatuses = service.healthCheck.expectedStatus || [200];
      if (!expectedStatuses.includes(response.status)) {
        return false;
      }

      // Check response body if expected
      if (service.healthCheck.expectedBody) {
        const body = await response.text();
        return body.includes(service.healthCheck.expectedBody);
      }

      return true;

    } catch (error) {
      return false;
    }
  }

  private getSessionId(sessionKey: string, key: string): string {
    // Extract session identifier from request context
    return crypto.createHash('md5').update(`${sessionKey}:${key}`).digest('hex');
  }

  private getStickyInstance(sessionId: string): string | null {
    const session = this.stickySessionStore.get(sessionId);
    if (!session || session.expires < Date.now()) {
      this.stickySessionStore.delete(sessionId);
      return null;
    }
    return session.instanceId;
  }

  private setStickyInstance(sessionId: string, instanceId: string, ttl: number): void {
    this.stickySessionStore.set(sessionId, {
      instanceId,
      expires: Date.now() + ttl * 1000
    });
  }

  private incrementConnectionCount(instanceId: string): void {
    const current = this.connectionCounts.get(instanceId) || 0;
    this.connectionCounts.set(instanceId, current + 1);
  }

  decrementConnectionCount(instanceId: string): void {
    const current = this.connectionCounts.get(instanceId) || 0;
    this.connectionCounts.set(instanceId, Math.max(0, current - 1));
  }

  private startCleanupProcess(): void {
    setInterval(() => {
      this.cleanupStaleServices();
      this.cleanupExpiredSessions();
    }, 60000); // Every minute
  }

  private cleanupStaleServices(): void {
    const staleThreshold = 3 * 60 * 1000; // 3 minutes
    const now = Date.now();

    for (const [serviceId, service] of this.services) {
      const timeSinceHeartbeat = now - service.lastHeartbeat.getTime();
      
      if (timeSinceHeartbeat > staleThreshold && service.status !== 'stopped') {
        service.status = 'unhealthy';
        this.emit('service-stale', { serviceId, serviceName: service.serviceName });
        
        // Remove completely stale services (no heartbeat for 10 minutes)
        if (timeSinceHeartbeat > 10 * 60 * 1000) {
          this.deregisterService(serviceId);
        }
      }
    }
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    
    for (const [sessionId, session] of this.stickySessionStore) {
      if (session.expires < now) {
        this.stickySessionStore.delete(sessionId);
      }
    }
  }

  // Route management
  addRoute(route: ServiceRoute): void {
    this.routes.set(route.id, route);
    this.emit('route-added', route);
  }

  removeRoute(routeId: string): void {
    const route = this.routes.get(routeId);
    if (route) {
      this.routes.delete(routeId);
      this.emit('route-removed', { routeId });
    }
  }

  findRoute(path: string, method: string, headers: Record<string, string> = {}): ServiceRoute | null {
    for (const route of this.routes.values()) {
      if (!route.enabled) continue;
      
      // Check method
      if (route.method && route.method.toUpperCase() !== method.toUpperCase()) {
        continue;
      }
      
      // Check path pattern
      if (!this.matchPath(path, route.pattern)) {
        continue;
      }
      
      // Check headers
      if (route.headers && !this.matchHeaders(headers, route.headers)) {
        continue;
      }
      
      return route;
    }
    
    return null;
  }

  private matchPath(path: string, pattern: string): boolean {
    // Simple pattern matching - in production use a proper router
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\{[^}]+\}/g, '[^/]+');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  private matchHeaders(headers: Record<string, string>, requiredHeaders: Record<string, string>): boolean {
    for (const [key, value] of Object.entries(requiredHeaders)) {
      if (headers[key.toLowerCase()] !== value) {
        return false;
      }
    }
    return true;
  }

  getServices(): ServiceInstance[] {
    return Array.from(this.services.values());
  }

  getService(serviceId: string): ServiceInstance | null {
    return this.services.get(serviceId) || null;
  }

  getRoutes(): ServiceRoute[] {
    return Array.from(this.routes.values());
  }

  getServicesByName(serviceName: string): ServiceInstance[] {
    return Array.from(this.services.values())
      .filter(s => s.serviceName === serviceName);
  }

  getStats(): any {
    const services = Array.from(this.services.values());
    
    return {
      services: {
        total: services.length,
        byStatus: services.reduce((acc, s) => {
          acc[s.status] = (acc[s.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byName: services.reduce((acc, s) => {
          acc[s.serviceName] = (acc[s.serviceName] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      },
      routes: {
        total: this.routes.size,
        enabled: Array.from(this.routes.values()).filter(r => r.enabled).length
      },
      healthChecks: this.healthCheckTimers.size,
      stickySessions: this.stickySessionStore.size,
      connectionCounts: Object.fromEntries(this.connectionCounts)
    };
  }

  destroy(): void {
    // Clear all health check timers
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }
    
    this.services.clear();
    this.routes.clear();
    this.healthCheckTimers.clear();
    this.stickySessionStore.clear();
    this.connectionCounts.clear();
    this.lastSelectedInstance.clear();
    this.consistentHashRing.clear();
    
    this.removeAllListeners();
  }
}