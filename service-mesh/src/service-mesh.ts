import { EventEmitter } from 'events';
import { ServiceRegistry, ServiceInstance, LoadBalancingStrategy } from './service-registry';
import * as crypto from 'crypto';

export interface ServiceMeshConfig {
  name: string;
  version: string;
  datacenter: string;
  encryption: {
    enabled: boolean;
    algorithm: string;
    keyRotationInterval: number; // hours
  };
  observability: {
    tracing: boolean;
    metrics: boolean;
    logging: boolean;
    samplingRate: number; // 0-1
  };
  security: {
    mtls: boolean;
    authenticationRequired: boolean;
    authorizationEnabled: boolean;
    certificateAuthority: string;
  };
  networking: {
    maxConnections: number;
    connectionTimeout: number; // seconds
    requestTimeout: number; // seconds
    retryPolicy: RetryPolicy;
  };
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  retryableStatuses: number[];
}

export interface ServiceProxy {
  serviceId: string;
  upstreamService: string;
  downstreamServices: string[];
  interceptors: ProxyInterceptor[];
  rateLimiting?: RateLimitConfig;
  circuitBreaker?: CircuitBreakerConfig;
  timeout: number;
  retries: number;
}

export interface ProxyInterceptor {
  id: string;
  name: string;
  type: 'request' | 'response' | 'bidirectional';
  order: number;
  enabled: boolean;
  configuration: Record<string, any>;
}

export interface RateLimitConfig {
  requestsPerSecond: number;
  burstSize: number;
  keyExtractor: 'ip' | 'user' | 'service' | 'header';
  keyField?: string;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number; // seconds
  resetTimeout: number; // seconds
  monitoringPeriod: number; // seconds
}

export interface TrafficPolicy {
  id: string;
  name: string;
  serviceSelector: ServiceSelector;
  rules: TrafficRule[];
  enabled: boolean;
  priority: number;
}

export interface ServiceSelector {
  serviceName?: string;
  version?: string;
  tags?: string[];
  namespace?: string;
}

export interface TrafficRule {
  id: string;
  name: string;
  match: TrafficMatch;
  action: TrafficAction;
  weight?: number;
}

export interface TrafficMatch {
  headers?: Record<string, string>;
  path?: {
    type: 'exact' | 'prefix' | 'regex';
    value: string;
  };
  method?: string[];
  sourceService?: string[];
  sourceLabels?: Record<string, string>;
}

export interface TrafficAction {
  type: 'route' | 'redirect' | 'fault' | 'delay' | 'abort';
  destination?: TrafficDestination;
  redirect?: {
    url: string;
    statusCode: number;
  };
  fault?: {
    delay?: {
      percentage: number;
      fixedDelay: number; // milliseconds
    };
    abort?: {
      percentage: number;
      statusCode: number;
    };
  };
}

export interface TrafficDestination {
  serviceName: string;
  version?: string;
  weight?: number;
  headers?: {
    add?: Record<string, string>;
    remove?: string[];
    set?: Record<string, string>;
  };
}

export interface ServiceTrace {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  tags: Record<string, any>;
  logs: TraceLog[];
  service: string;
  status: 'ok' | 'error' | 'timeout';
}

export interface TraceLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, any>;
}

export interface ServiceMetrics {
  serviceName: string;
  timestamp: Date;
  requestRate: number;
  errorRate: number;
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  throughput: number;
  activeConnections: number;
  upstreamLatency: number;
}

export class ServiceMesh extends EventEmitter {
  private config: ServiceMeshConfig;
  private registry: ServiceRegistry;
  private proxies = new Map<string, ServiceProxy>();
  private trafficPolicies = new Map<string, TrafficPolicy>();
  private traces: ServiceTrace[] = [];
  private metrics: ServiceMetrics[] = [];
  private certificates = new Map<string, { cert: string; key: string; expires: Date }>();
  private encryptionKeys = new Map<string, { key: Buffer; created: Date }>();
  private circuitBreakers = new Map<string, {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    lastFailure: Date;
    lastSuccess: Date;
  }>();

  constructor(config: ServiceMeshConfig) {
    super();
    this.config = config;
    this.registry = new ServiceRegistry();
    this.initializeMesh();
  }

  private initializeMesh(): void {
    // Initialize encryption keys
    if (this.config.encryption.enabled) {
      this.rotateEncryptionKeys();
      this.startKeyRotation();
    }

    // Initialize observability
    if (this.config.observability.tracing || this.config.observability.metrics) {
      this.startObservabilityCollection();
    }

    // Setup service registry event handlers
    this.registry.on('service-registered', (service) => {
      this.createServiceProxy(service);
    });

    this.registry.on('service-deregistered', ({ serviceId }) => {
      this.removeServiceProxy(serviceId);
    });

    this.emit('mesh-initialized', { config: this.config });
  }

  registerService(service: Omit<ServiceInstance, 'id' | 'registeredAt' | 'lastHeartbeat' | 'metrics'>): string {
    return this.registry.registerService(service);
  }

  deregisterService(serviceId: string): boolean {
    return this.registry.deregisterService(serviceId);
  }

  async callService(
    serviceName: string,
    request: ServiceRequest,
    options: CallOptions = {}
  ): Promise<ServiceResponse> {
    const traceId = request.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();
    const startTime = new Date();

    try {
      // Start tracing
      const trace = this.startTrace(traceId, spanId, request.parentSpanId, serviceName, startTime);

      // Apply traffic policies
      const routingDecision = await this.applyTrafficPolicies(serviceName, request);
      
      // Select service instance
      const instance = this.selectServiceInstance(serviceName, options.loadBalancingStrategy || {
        algorithm: 'round-robin',
        healthyOnly: true
      }, request);

      if (!instance) {
        throw new Error(`No healthy instances available for service: ${serviceName}`);
      }

      // Check circuit breaker
      if (!this.checkCircuitBreaker(instance.id)) {
        throw new Error(`Circuit breaker is open for service: ${serviceName}`);
      }

      // Apply rate limiting
      if (options.rateLimiting && !this.checkRateLimit(instance.id, request, options.rateLimiting)) {
        throw new Error(`Rate limit exceeded for service: ${serviceName}`);
      }

      // Execute request with retries
      const response = await this.executeRequestWithRetries(
        instance,
        request,
        routingDecision,
        options,
        trace
      );

      // Update circuit breaker on success
      this.recordCircuitBreakerSuccess(instance.id);

      // Complete tracing
      this.completeTrace(trace, response, 'ok');

      // Record metrics
      this.recordMetrics(serviceName, startTime, response);

      return response;

    } catch (error) {
      // Update circuit breaker on failure
      const instance = this.registry.discoverServices({ serviceName })[0];
      if (instance) {
        this.recordCircuitBreakerFailure(instance.id);
      }

      // Complete tracing with error
      const errorTrace = this.startTrace(traceId, spanId, request.parentSpanId, serviceName, startTime);
      this.completeTrace(errorTrace, null, 'error', (error as Error).message);

      throw error;
    }
  }

  private async executeRequestWithRetries(
    instance: ServiceInstance,
    request: ServiceRequest,
    routingDecision: TrafficDestination | null,
    options: CallOptions,
    trace: ServiceTrace
  ): Promise<ServiceResponse> {
    const retryPolicy = options.retryPolicy || this.config.networking.retryPolicy;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++) {
      try {
        const response = await this.executeRequest(instance, request, routingDecision, options, trace);
        
        // Success - update connection count
        this.registry.decrementConnectionCount(instance.id);
        
        return response;

      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        if (!this.isRetryableError(error as Error, retryPolicy)) {
          throw error;
        }

        // Don't retry on last attempt
        if (attempt === retryPolicy.maxAttempts) {
          break;
        }

        // Calculate delay
        const delay = Math.min(
          retryPolicy.baseDelay * Math.pow(retryPolicy.backoffMultiplier, attempt - 1),
          retryPolicy.maxDelay
        );

        await new Promise(resolve => setTimeout(resolve, delay));

        // Log retry attempt
        trace.logs.push({
          timestamp: new Date(),
          level: 'info',
          message: `Retry attempt ${attempt}`,
          fields: { error: (error as Error).message, delay }
        });
      }
    }

    throw lastError;
  }

  private async executeRequest(
    instance: ServiceInstance,
    request: ServiceRequest,
    routingDecision: TrafficDestination | null,
    options: CallOptions,
    trace: ServiceTrace
  ): Promise<ServiceResponse> {
    const url = `${instance.protocol}://${instance.host}:${instance.port}${request.path}`;
    const headers = { ...request.headers };

    // Add tracing headers
    if (this.config.observability.tracing) {
      headers['X-Trace-Id'] = trace.traceId;
      headers['X-Span-Id'] = trace.spanId;
      if (trace.parentSpanId) {
        headers['X-Parent-Span-Id'] = trace.parentSpanId;
      }
    }

    // Apply routing headers
    if (routingDecision?.headers) {
      if (routingDecision.headers.add) {
        Object.assign(headers, routingDecision.headers.add);
      }
      if (routingDecision.headers.set) {
        Object.assign(headers, routingDecision.headers.set);
      }
      if (routingDecision.headers.remove) {
        for (const headerName of routingDecision.headers.remove) {
          delete headers[headerName];
        }
      }
    }

    // Add authentication headers
    if (this.config.security.authenticationRequired) {
      headers['Authorization'] = await this.generateServiceToken(instance.serviceName);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, (options.timeout || this.config.networking.requestTimeout) * 1000);

    try {
      const response = await fetch(url, {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeout);

      const responseBody = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : await response.text();

      return {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: responseBody,
        traceId: trace.traceId,
        duration: Date.now() - trace.startTime.getTime()
      };

    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  private applyTrafficPolicies(serviceName: string, request: ServiceRequest): TrafficDestination | null {
    const applicablePolicies = Array.from(this.trafficPolicies.values())
      .filter(policy => policy.enabled && this.matchesServiceSelector(serviceName, policy.serviceSelector))
      .sort((a, b) => b.priority - a.priority);

    for (const policy of applicablePolicies) {
      for (const rule of policy.rules) {
        if (this.matchesTrafficRule(request, rule.match)) {
          if (rule.action.type === 'route' && rule.action.destination) {
            return rule.action.destination;
          }
        }
      }
    }

    return null;
  }

  private matchesServiceSelector(serviceName: string, selector: ServiceSelector): boolean {
    if (selector.serviceName && selector.serviceName !== serviceName) {
      return false;
    }
    
    // Additional selector matching logic would go here
    return true;
  }

  private matchesTrafficRule(request: ServiceRequest, match: TrafficMatch): boolean {
    // Headers matching
    if (match.headers) {
      for (const [key, value] of Object.entries(match.headers)) {
        if (request.headers?.[key] !== value) {
          return false;
        }
      }
    }

    // Path matching
    if (match.path) {
      const requestPath = request.path;
      switch (match.path.type) {
        case 'exact':
          if (requestPath !== match.path.value) return false;
          break;
        case 'prefix':
          if (!requestPath.startsWith(match.path.value)) return false;
          break;
        case 'regex':
          if (!new RegExp(match.path.value).test(requestPath)) return false;
          break;
      }
    }

    // Method matching
    if (match.method && !match.method.includes(request.method)) {
      return false;
    }

    return true;
  }

  private selectServiceInstance(
    serviceName: string,
    strategy: LoadBalancingStrategy,
    request: ServiceRequest
  ): ServiceInstance | null {
    return this.registry.selectInstance(serviceName, strategy, {
      clientIp: request.clientIp,
      sessionKey: request.sessionId,
      hashKey: request.userId || request.sessionId
    });
  }

  private checkCircuitBreaker(instanceId: string): boolean {
    const breaker = this.circuitBreakers.get(instanceId);
    if (!breaker) {
      // Initialize circuit breaker
      this.circuitBreakers.set(instanceId, {
        state: 'closed',
        failures: 0,
        lastFailure: new Date(0),
        lastSuccess: new Date()
      });
      return true;
    }

    const now = Date.now();

    switch (breaker.state) {
      case 'closed':
        return true;
      
      case 'open':
        // Check if we should transition to half-open
        const timeSinceLastFailure = now - breaker.lastFailure.getTime();
        if (timeSinceLastFailure > 30000) { // 30 seconds
          breaker.state = 'half-open';
          return true;
        }
        return false;
      
      case 'half-open':
        return true;
      
      default:
        return false;
    }
  }

  private recordCircuitBreakerSuccess(instanceId: string): void {
    const breaker = this.circuitBreakers.get(instanceId);
    if (breaker) {
      breaker.failures = 0;
      breaker.lastSuccess = new Date();
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
      }
    }
  }

  private recordCircuitBreakerFailure(instanceId: string): void {
    const breaker = this.circuitBreakers.get(instanceId);
    if (breaker) {
      breaker.failures++;
      breaker.lastFailure = new Date();
      
      if (breaker.failures >= 5 && breaker.state === 'closed') { // Configurable threshold
        breaker.state = 'open';
      } else if (breaker.state === 'half-open') {
        breaker.state = 'open';
      }
    }
  }

  private checkRateLimit(instanceId: string, request: ServiceRequest, config: RateLimitConfig): boolean {
    // Simplified rate limiting - in production use a proper rate limiter
    return true;
  }

  private isRetryableError(error: Error, retryPolicy: RetryPolicy): boolean {
    // Check if error indicates a retryable condition
    if (error.message.includes('timeout') || 
        error.message.includes('connection') ||
        error.message.includes('network')) {
      return true;
    }

    // Check HTTP status codes if available
    const statusMatch = error.message.match(/status (\d+)/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1]);
      return retryPolicy.retryableStatuses.includes(status);
    }

    return false;
  }

  private startTrace(
    traceId: string,
    spanId: string,
    parentSpanId: string | undefined,
    operationName: string,
    startTime: Date
  ): ServiceTrace {
    const trace: ServiceTrace = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      startTime,
      tags: {},
      logs: [],
      service: this.config.name,
      status: 'ok'
    };

    this.traces.push(trace);
    return trace;
  }

  private completeTrace(trace: ServiceTrace, response: ServiceResponse | null, status: 'ok' | 'error' | 'timeout', errorMessage?: string): void {
    trace.endTime = new Date();
    trace.duration = trace.endTime.getTime() - trace.startTime.getTime();
    trace.status = status;

    if (response) {
      trace.tags.statusCode = response.statusCode;
      trace.tags.responseSize = JSON.stringify(response.body).length;
    }

    if (errorMessage) {
      trace.tags.error = errorMessage;
      trace.logs.push({
        timestamp: new Date(),
        level: 'error',
        message: errorMessage
      });
    }

    this.emit('trace-completed', trace);
  }

  private recordMetrics(serviceName: string, startTime: Date, response: ServiceResponse): void {
    const duration = Date.now() - startTime.getTime();
    
    // Find or create metrics record
    let metrics = this.metrics.find(m => 
      m.serviceName === serviceName &&
      Date.now() - m.timestamp.getTime() < 60000 // Last minute
    );

    if (!metrics) {
      metrics = {
        serviceName,
        timestamp: new Date(),
        requestRate: 0,
        errorRate: 0,
        responseTime: { p50: 0, p95: 0, p99: 0, avg: 0 },
        throughput: 0,
        activeConnections: 0,
        upstreamLatency: duration
      };
      this.metrics.push(metrics);
    }

    // Update metrics
    metrics.requestRate++;
    if (response.statusCode >= 400) {
      metrics.errorRate++;
    }
    
    // Simplified response time tracking
    metrics.responseTime.avg = (metrics.responseTime.avg + duration) / 2;

    this.emit('metrics-recorded', metrics);
  }

  private createServiceProxy(service: ServiceInstance): void {
    const proxy: ServiceProxy = {
      serviceId: service.id,
      upstreamService: service.serviceName,
      downstreamServices: [],
      interceptors: [],
      timeout: this.config.networking.requestTimeout,
      retries: this.config.networking.retryPolicy.maxAttempts
    };

    this.proxies.set(service.id, proxy);
    this.emit('proxy-created', proxy);
  }

  private removeServiceProxy(serviceId: string): void {
    const proxy = this.proxies.get(serviceId);
    if (proxy) {
      this.proxies.delete(serviceId);
      this.emit('proxy-removed', { serviceId });
    }
  }

  private rotateEncryptionKeys(): void {
    const key = crypto.randomBytes(32);
    const keyId = crypto.randomUUID();
    
    this.encryptionKeys.set(keyId, {
      key,
      created: new Date()
    });

    this.emit('encryption-key-rotated', { keyId });
  }

  private startKeyRotation(): void {
    setInterval(() => {
      this.rotateEncryptionKeys();
      
      // Clean up old keys
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours
      for (const [keyId, keyData] of this.encryptionKeys) {
        if (keyData.created < cutoff) {
          this.encryptionKeys.delete(keyId);
        }
      }
    }, this.config.encryption.keyRotationInterval * 60 * 60 * 1000);
  }

  private startObservabilityCollection(): void {
    setInterval(() => {
      this.collectObservabilityData();
    }, 60000); // Every minute
  }

  private collectObservabilityData(): void {
    // Clean up old traces and metrics
    const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour
    
    this.traces = this.traces.filter(t => t.startTime > cutoff);
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
  }

  private generateTraceId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private generateSpanId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  private async generateServiceToken(serviceName: string): Promise<string> {
    // Simplified service token generation
    const payload = {
      service: serviceName,
      issued: Date.now(),
      expires: Date.now() + 3600000 // 1 hour
    };
    
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  // Public API methods
  addTrafficPolicy(policy: TrafficPolicy): void {
    this.trafficPolicies.set(policy.id, policy);
    this.emit('traffic-policy-added', policy);
  }

  removeTrafficPolicy(policyId: string): void {
    const policy = this.trafficPolicies.get(policyId);
    if (policy) {
      this.trafficPolicies.delete(policyId);
      this.emit('traffic-policy-removed', { policyId });
    }
  }

  getServices(): ServiceInstance[] {
    return this.registry.getServices();
  }

  getService(serviceId: string): ServiceInstance | null {
    return this.registry.getService(serviceId);
  }

  getTraces(serviceName?: string, limit: number = 100): ServiceTrace[] {
    let traces = [...this.traces].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    
    if (serviceName) {
      traces = traces.filter(t => t.service === serviceName);
    }
    
    return traces.slice(0, limit);
  }

  getMetrics(serviceName?: string, duration: number = 3600000): ServiceMetrics[] {
    const cutoff = Date.now() - duration;
    let metrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);
    
    if (serviceName) {
      metrics = metrics.filter(m => m.serviceName === serviceName);
    }
    
    return metrics;
  }

  getStats(): any {
    return {
      config: this.config,
      services: this.registry.getStats(),
      proxies: this.proxies.size,
      trafficPolicies: this.trafficPolicies.size,
      traces: this.traces.length,
      metrics: this.metrics.length,
      circuitBreakers: this.circuitBreakers.size,
      encryptionKeys: this.encryptionKeys.size
    };
  }

  destroy(): void {
    this.registry.destroy();
    this.proxies.clear();
    this.trafficPolicies.clear();
    this.traces = [];
    this.metrics = [];
    this.certificates.clear();
    this.encryptionKeys.clear();
    this.circuitBreakers.clear();
    
    this.removeAllListeners();
  }
}

export interface ServiceRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
  traceId?: string;
  parentSpanId?: string;
  clientIp?: string;
  userId?: string;
  sessionId?: string;
}

export interface ServiceResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  traceId: string;
  duration: number;
}

export interface CallOptions {
  timeout?: number;
  retryPolicy?: RetryPolicy;
  loadBalancingStrategy?: LoadBalancingStrategy;
  rateLimiting?: RateLimitConfig;
}