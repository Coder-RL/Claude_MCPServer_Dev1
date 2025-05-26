import { EventEmitter } from 'events';
import { ModelRegistry, ModelInferenceRequest, ModelInferenceResponse } from './model-registry.js';

export interface InferenceEngineConfig {
  maxConcurrentRequests: number;
  defaultTimeout: number;
  cachingEnabled: boolean;
  batchingEnabled: boolean;
  streamingEnabled: boolean;
  loadBalancing: 'round_robin' | 'least_connections' | 'weighted' | 'adaptive';
  fallbackEnabled: boolean;
  monitoringEnabled: boolean;
}

export interface InferenceEndpoint {
  id: string;
  modelId: string;
  version: string;
  url: string;
  type: 'http' | 'grpc' | 'websocket';
  status: 'active' | 'inactive' | 'error' | 'warming';
  weight: number;
  connections: number;
  health: InferenceHealth;
  capabilities: EndpointCapabilities;
  lastHealthCheck: Date;
}

export interface InferenceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  errorRate: number;
  uptime: number;
  lastError?: string;
  lastErrorTime?: Date;
}

export interface EndpointCapabilities {
  streaming: boolean;
  batching: boolean;
  async: boolean;
  maxBatchSize: number;
  maxTokens: number;
  supportedFormats: string[];
}

export interface BatchInferenceRequest {
  id: string;
  requests: ModelInferenceRequest[];
  priority: number;
  callback?: string;
  createdAt: Date;
  timeout: number;
}

export interface BatchInferenceResponse {
  batchId: string;
  responses: ModelInferenceResponse[];
  status: 'completed' | 'partial' | 'failed';
  processedAt: Date;
  duration: number;
  errors?: string[];
}

export interface StreamingSession {
  id: string;
  modelId: string;
  userId: string;
  startTime: Date;
  lastActivity: Date;
  tokenCount: number;
  status: 'active' | 'paused' | 'ended';
  metadata: Record<string, any>;
}

export interface InferenceCache {
  key: string;
  modelId: string;
  input: any;
  output: any;
  createdAt: Date;
  accessCount: number;
  lastAccessed: Date;
  ttl: number;
}

export interface InferenceMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  tokensProcessed: number;
  cacheHitRate: number;
  activeSessions: number;
  queueSize: number;
  errorsByType: Record<string, number>;
  requestsByModel: Record<string, number>;
}

export interface LoadBalancingStrategy {
  selectEndpoint(endpoints: InferenceEndpoint[], request: ModelInferenceRequest): InferenceEndpoint;
  updateEndpointMetrics(endpointId: string, metrics: { latency: number; success: boolean }): void;
}

export interface CircuitBreaker {
  id: string;
  endpointId: string;
  state: 'closed' | 'open' | 'half_open';
  failureCount: number;
  failureThreshold: number;
  timeout: number;
  lastFailure?: Date;
  nextAttempt?: Date;
}

export class InferenceEngine extends EventEmitter {
  private modelRegistry: ModelRegistry;
  private endpoints = new Map<string, InferenceEndpoint>();
  private requestQueue: ModelInferenceRequest[] = [];
  private batchQueue: BatchInferenceRequest[] = [];
  private streamingSessions = new Map<string, StreamingSession>();
  private cache = new Map<string, InferenceCache>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private loadBalancer: LoadBalancingStrategy;
  private metrics: InferenceMetrics;
  private processing = false;

  constructor(
    private config: InferenceEngineConfig,
    modelRegistry: ModelRegistry
  ) {
    super();
    this.modelRegistry = modelRegistry;
    this.loadBalancer = this.createLoadBalancer(config.loadBalancing);
    this.metrics = this.initializeMetrics();
    
    this.startRequestProcessor();
    this.startHealthMonitoring();
    this.startMetricsCollection();
  }

  // Endpoint Management
  async registerEndpoint(endpoint: Omit<InferenceEndpoint, 'id' | 'lastHealthCheck'>): Promise<string> {
    try {
      const endpointId = this.generateId();
      const inferenceEndpoint: InferenceEndpoint = {
        id: endpointId,
        lastHealthCheck: new Date(),
        ...endpoint
      };

      this.endpoints.set(endpointId, inferenceEndpoint);
      
      // Initialize circuit breaker
      this.circuitBreakers.set(endpointId, {
        id: this.generateId(),
        endpointId,
        state: 'closed',
        failureCount: 0,
        failureThreshold: 5,
        timeout: 30000
      });

      // Perform initial health check
      await this.performHealthCheck(endpointId);

      this.emit('endpointRegistered', { endpoint: inferenceEndpoint });
      return endpointId;
    } catch (error) {
      this.emit('error', { operation: 'registerEndpoint', error });
      throw error;
    }
  }

  async unregisterEndpoint(endpointId: string): Promise<boolean> {
    try {
      const endpoint = this.endpoints.get(endpointId);
      if (!endpoint) {
        return false;
      }

      this.endpoints.delete(endpointId);
      this.circuitBreakers.delete(endpointId);

      this.emit('endpointUnregistered', { endpointId });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'unregisterEndpoint', error });
      return false;
    }
  }

  async getEndpoints(modelId?: string): Promise<InferenceEndpoint[]> {
    let endpoints = Array.from(this.endpoints.values());
    
    if (modelId) {
      endpoints = endpoints.filter(e => e.modelId === modelId);
    }

    return endpoints.filter(e => e.status === 'active');
  }

  // Inference Methods
  async infer(request: ModelInferenceRequest): Promise<ModelInferenceResponse> {
    try {
      const requestId = this.generateId();
      const startTime = Date.now();

      // Check cache first
      if (this.config.cachingEnabled) {
        const cached = this.getCachedResult(request);
        if (cached) {
          this.updateCacheMetrics(true);
          return this.createResponse(requestId, request, cached.output, Date.now() - startTime);
        }
      }

      // Select endpoint
      const endpoints = await this.getEndpoints(request.modelId);
      if (endpoints.length === 0) {
        throw new Error(`No active endpoints found for model ${request.modelId}`);
      }

      const endpoint = this.loadBalancer.selectEndpoint(endpoints, request);
      const circuitBreaker = this.circuitBreakers.get(endpoint.id);

      // Check circuit breaker
      if (circuitBreaker && circuitBreaker.state === 'open') {
        if (Date.now() - (circuitBreaker.nextAttempt?.getTime() || 0) < 0) {
          throw new Error('Circuit breaker is open');
        } else {
          circuitBreaker.state = 'half_open';
        }
      }

      try {
        // Perform inference
        const result = await this.performInference(endpoint, request);
        const latency = Date.now() - startTime;

        // Update metrics
        this.updateEndpointMetrics(endpoint.id, { latency, success: true });
        this.updateCircuitBreaker(endpoint.id, true);

        // Cache result
        if (this.config.cachingEnabled) {
          this.cacheResult(request, result);
        }

        this.updateMetrics('success', latency);
        return this.createResponse(requestId, request, result, latency);

      } catch (error) {
        this.updateEndpointMetrics(endpoint.id, { latency: Date.now() - startTime, success: false });
        this.updateCircuitBreaker(endpoint.id, false);
        this.updateMetrics('error', Date.now() - startTime);
        throw error;
      }

    } catch (error) {
      this.emit('error', { operation: 'infer', error, request });
      throw error;
    }
  }

  async inferBatch(requests: ModelInferenceRequest[], priority: number = 0): Promise<string> {
    try {
      const batchId = this.generateId();
      const batchRequest: BatchInferenceRequest = {
        id: batchId,
        requests,
        priority,
        createdAt: new Date(),
        timeout: this.config.defaultTimeout * requests.length
      };

      this.batchQueue.push(batchRequest);
      this.batchQueue.sort((a, b) => b.priority - a.priority);

      this.emit('batchQueued', { batchId, requestCount: requests.length });
      return batchId;
    } catch (error) {
      this.emit('error', { operation: 'inferBatch', error });
      throw error;
    }
  }

  async getBatchResult(batchId: string): Promise<BatchInferenceResponse | undefined> {
    // In production, this would check a persistent store or cache
    // For now, simulate batch completion
    return {
      batchId,
      responses: [],
      status: 'completed',
      processedAt: new Date(),
      duration: 1000
    };
  }

  // Streaming Inference
  async startStreamingSession(
    modelId: string,
    userId: string,
    metadata: Record<string, any> = {}
  ): Promise<string> {
    try {
      const sessionId = this.generateId();
      const session: StreamingSession = {
        id: sessionId,
        modelId,
        userId,
        startTime: new Date(),
        lastActivity: new Date(),
        tokenCount: 0,
        status: 'active',
        metadata
      };

      this.streamingSessions.set(sessionId, session);
      this.emit('streamingSessionStarted', { session });
      
      return sessionId;
    } catch (error) {
      this.emit('error', { operation: 'startStreamingSession', error });
      throw error;
    }
  }

  async sendStreamingMessage(
    sessionId: string,
    message: any
  ): Promise<AsyncIterable<any>> {
    const session = this.streamingSessions.get(sessionId);
    if (!session || session.status !== 'active') {
      throw new Error('Invalid or inactive streaming session');
    }

    session.lastActivity = new Date();

    // Create async generator for streaming response
    const self = this;
    async function* streamResponse() {
      try {
        const endpoints = await self.getEndpoints(session.modelId);
        if (endpoints.length === 0) {
          throw new Error(`No active endpoints for model ${session.modelId}`);
        }

        const endpoint = endpoints.find(e => e.capabilities.streaming);
        if (!endpoint) {
          throw new Error('No streaming-capable endpoints available');
        }

        // Simulate streaming response
        const words = ['Hello', 'this', 'is', 'a', 'streaming', 'response'];
        for (const word of words) {
          await new Promise(resolve => setTimeout(resolve, 100));
          session.tokenCount++;
          yield { content: word, finished: false };
        }
        
        yield { content: '', finished: true };
        self.emit('streamingMessageSent', { sessionId, tokenCount: session.tokenCount });

      } catch (error) {
        self.emit('error', { operation: 'sendStreamingMessage', error, sessionId });
        throw error;
      }
    }

    return streamResponse();
  }

  async endStreamingSession(sessionId: string): Promise<boolean> {
    const session = this.streamingSessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.status = 'ended';
    this.streamingSessions.delete(sessionId);
    
    this.emit('streamingSessionEnded', { sessionId, duration: Date.now() - session.startTime.getTime() });
    return true;
  }

  // Cache Management
  async clearCache(modelId?: string): Promise<number> {
    let cleared = 0;
    
    for (const [key, cached] of this.cache.entries()) {
      if (!modelId || cached.modelId === modelId) {
        this.cache.delete(key);
        cleared++;
      }
    }

    this.emit('cacheCleared', { modelId, entriesCleared: cleared });
    return cleared;
  }

  async getCacheStats(): Promise<{
    totalEntries: number;
    hitRate: number;
    totalSize: number;
    oldestEntry: Date;
    newestEntry: Date;
    entriesByModel: Record<string, number>;
  }> {
    const entries = Array.from(this.cache.values());
    const totalEntries = entries.length;
    
    if (totalEntries === 0) {
      return {
        totalEntries: 0,
        hitRate: 0,
        totalSize: 0,
        oldestEntry: new Date(),
        newestEntry: new Date(),
        entriesByModel: {}
      };
    }

    const totalAccess = entries.reduce((sum, e) => sum + e.accessCount, 0);
    const hitRate = totalAccess > 0 ? totalAccess / (totalAccess + this.metrics.failedRequests) : 0;
    
    const dates = entries.map(e => e.createdAt);
    const oldestEntry = new Date(Math.min(...dates.map(d => d.getTime())));
    const newestEntry = new Date(Math.max(...dates.map(d => d.getTime())));
    
    const entriesByModel: Record<string, number> = {};
    entries.forEach(e => {
      entriesByModel[e.modelId] = (entriesByModel[e.modelId] || 0) + 1;
    });

    return {
      totalEntries,
      hitRate,
      totalSize: entries.length * 1024, // Simplified size calculation
      oldestEntry,
      newestEntry,
      entriesByModel
    };
  }

  // Metrics and Monitoring
  async getMetrics(): Promise<InferenceMetrics> {
    return { ...this.metrics };
  }

  async getEndpointHealth(): Promise<{ [endpointId: string]: InferenceHealth }> {
    const health: { [endpointId: string]: InferenceHealth } = {};
    
    for (const [id, endpoint] of this.endpoints.entries()) {
      health[id] = endpoint.health;
    }

    return health;
  }

  async scaleEndpoints(modelId: string, targetCount: number): Promise<boolean> {
    try {
      const currentEndpoints = await this.getEndpoints(modelId);
      const currentCount = currentEndpoints.length;

      if (targetCount > currentCount) {
        // Scale up - add more endpoints
        const needed = targetCount - currentCount;
        for (let i = 0; i < needed; i++) {
          await this.createEndpoint(modelId);
        }
      } else if (targetCount < currentCount) {
        // Scale down - remove endpoints
        const toRemove = currentCount - targetCount;
        const endpointsToRemove = currentEndpoints
          .sort((a, b) => a.connections - b.connections)
          .slice(0, toRemove);
        
        for (const endpoint of endpointsToRemove) {
          await this.unregisterEndpoint(endpoint.id);
        }
      }

      this.emit('endpointsScaled', { modelId, previousCount: currentCount, newCount: targetCount });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'scaleEndpoints', error });
      return false;
    }
  }

  private async performInference(endpoint: InferenceEndpoint, request: ModelInferenceRequest): Promise<any> {
    // Simulate inference call to endpoint
    const model = await this.modelRegistry.getModel(request.modelId);
    if (!model) {
      throw new Error(`Model ${request.modelId} not found`);
    }

    // Simulate processing delay based on model complexity
    const processingTime = Math.random() * 1000 + 100; // 100-1100ms
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // Simulate potential failures
    if (Math.random() < 0.05) { // 5% failure rate
      throw new Error('Inference failed');
    }

    return {
      content: 'Generated response from model',
      tokens: { input: 10, output: 20, total: 30 },
      confidence: 0.95
    };
  }

  private createResponse(
    requestId: string,
    request: ModelInferenceRequest,
    output: any,
    latency: number
  ): ModelInferenceResponse {
    return {
      requestId,
      modelId: request.modelId,
      version: request.version || 'latest',
      output,
      latency,
      timestamp: new Date(),
      tokens: output.tokens,
      confidence: output.confidence
    };
  }

  private getCachedResult(request: ModelInferenceRequest): InferenceCache | undefined {
    const key = this.generateCacheKey(request);
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.createdAt.getTime() < cached.ttl) {
      cached.accessCount++;
      cached.lastAccessed = new Date();
      return cached;
    }

    return undefined;
  }

  private cacheResult(request: ModelInferenceRequest, result: any): void {
    const key = this.generateCacheKey(request);
    const cached: InferenceCache = {
      key,
      modelId: request.modelId,
      input: request.input,
      output: result,
      createdAt: new Date(),
      accessCount: 0,
      lastAccessed: new Date(),
      ttl: 300000 // 5 minutes
    };

    this.cache.set(key, cached);

    // Cleanup old entries if cache is too large
    if (this.cache.size > 10000) {
      this.cleanupCache();
    }
  }

  private generateCacheKey(request: ModelInferenceRequest): string {
    const input = JSON.stringify(request.input);
    const params = JSON.stringify(request.parameters || {});
    return `${request.modelId}:${this.hashString(input + params)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private cleanupCache(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime());
    
    // Remove oldest 20% of entries
    const toRemove = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
  }

  private updateEndpointMetrics(endpointId: string, metrics: { latency: number; success: boolean }): void {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) return;

    // Update endpoint health
    endpoint.health.latency = (endpoint.health.latency * 0.9) + (metrics.latency * 0.1);
    
    if (metrics.success) {
      endpoint.health.errorRate = endpoint.health.errorRate * 0.95;
    } else {
      endpoint.health.errorRate = Math.min(endpoint.health.errorRate + 0.1, 1.0);
    }

    // Update health status
    if (endpoint.health.errorRate > 0.5) {
      endpoint.health.status = 'unhealthy';
    } else if (endpoint.health.errorRate > 0.1 || endpoint.health.latency > 2000) {
      endpoint.health.status = 'degraded';
    } else {
      endpoint.health.status = 'healthy';
    }

    // Update load balancer
    this.loadBalancer.updateEndpointMetrics(endpointId, metrics);
  }

  private updateCircuitBreaker(endpointId: string, success: boolean): void {
    const breaker = this.circuitBreakers.get(endpointId);
    if (!breaker) return;

    if (success) {
      breaker.failureCount = 0;
      if (breaker.state === 'half_open') {
        breaker.state = 'closed';
      }
    } else {
      breaker.failureCount++;
      breaker.lastFailure = new Date();

      if (breaker.failureCount >= breaker.failureThreshold) {
        breaker.state = 'open';
        breaker.nextAttempt = new Date(Date.now() + breaker.timeout);
      }
    }
  }

  private updateMetrics(type: 'success' | 'error', latency: number): void {
    this.metrics.totalRequests++;
    
    if (type === 'success') {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update latency metrics (exponential moving average)
    this.metrics.averageLatency = (this.metrics.averageLatency * 0.9) + (latency * 0.1);
  }

  private updateCacheMetrics(hit: boolean): void {
    const total = this.metrics.totalRequests + 1;
    const hits = hit ? (this.metrics.cacheHitRate * this.metrics.totalRequests) + 1 : (this.metrics.cacheHitRate * this.metrics.totalRequests);
    this.metrics.cacheHitRate = hits / total;
  }

  private async performHealthCheck(endpointId: string): Promise<void> {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) return;

    try {
      const startTime = Date.now();
      
      // Simulate health check call
      await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 50));
      
      const latency = Date.now() - startTime;
      endpoint.health.latency = latency;
      endpoint.health.status = 'healthy';
      endpoint.health.uptime = Date.now() - endpoint.lastHealthCheck.getTime();
      endpoint.lastHealthCheck = new Date();

    } catch (error) {
      endpoint.health.status = 'unhealthy';
      endpoint.health.lastError = error.message;
      endpoint.health.lastErrorTime = new Date();
    }
  }

  private startRequestProcessor(): void {
    setInterval(() => {
      this.processRequestQueue();
      this.processBatchQueue();
    }, 100); // Process every 100ms
  }

  private async processRequestQueue(): Promise<void> {
    if (this.processing || this.requestQueue.length === 0) return;
    
    this.processing = true;
    
    try {
      const request = this.requestQueue.shift();
      if (request) {
        await this.infer(request);
      }
    } catch (error) {
      this.emit('error', { operation: 'processRequestQueue', error });
    } finally {
      this.processing = false;
    }
  }

  private async processBatchQueue(): Promise<void> {
    if (this.batchQueue.length === 0) return;

    const batch = this.batchQueue.shift();
    if (!batch) return;

    try {
      const responses: ModelInferenceResponse[] = [];
      
      for (const request of batch.requests) {
        try {
          const response = await this.infer(request);
          responses.push(response);
        } catch (error) {
          // Continue processing other requests in batch
        }
      }

      const batchResponse: BatchInferenceResponse = {
        batchId: batch.id,
        responses,
        status: responses.length === batch.requests.length ? 'completed' : 'partial',
        processedAt: new Date(),
        duration: Date.now() - batch.createdAt.getTime()
      };

      this.emit('batchCompleted', { batchResponse });

    } catch (error) {
      this.emit('error', { operation: 'processBatchQueue', error, batchId: batch.id });
    }
  }

  private startHealthMonitoring(): void {
    setInterval(() => {
      for (const [endpointId] of this.endpoints.entries()) {
        this.performHealthCheck(endpointId);
      }
    }, 30000); // Health check every 30 seconds
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      this.metrics.activeSessions = this.streamingSessions.size;
      this.metrics.queueSize = this.requestQueue.length + this.batchQueue.length;
    }, 5000); // Update metrics every 5 seconds
  }

  private async createEndpoint(modelId: string): Promise<string> {
    // Simulate creating a new endpoint instance
    const endpoint: Omit<InferenceEndpoint, 'id' | 'lastHealthCheck'> = {
      modelId,
      version: 'latest',
      url: `http://inference-${this.generateId()}.local:8080`,
      type: 'http',
      status: 'warming',
      weight: 1,
      connections: 0,
      health: {
        status: 'healthy',
        latency: 0,
        errorRate: 0,
        uptime: 0
      },
      capabilities: {
        streaming: true,
        batching: true,
        async: true,
        maxBatchSize: 10,
        maxTokens: 4096,
        supportedFormats: ['json']
      }
    };

    const endpointId = await this.registerEndpoint(endpoint);
    
    // Simulate warmup time
    setTimeout(() => {
      const ep = this.endpoints.get(endpointId);
      if (ep) {
        ep.status = 'active';
      }
    }, 5000);

    return endpointId;
  }

  private createLoadBalancer(strategy: string): LoadBalancingStrategy {
    switch (strategy) {
      case 'round_robin':
        return new RoundRobinLoadBalancer();
      case 'least_connections':
        return new LeastConnectionsLoadBalancer();
      case 'weighted':
        return new WeightedLoadBalancer();
      case 'adaptive':
        return new AdaptiveLoadBalancer();
      default:
        return new RoundRobinLoadBalancer();
    }
  }

  private initializeMetrics(): InferenceMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      tokensProcessed: 0,
      cacheHitRate: 0,
      activeSessions: 0,
      queueSize: 0,
      errorsByType: {},
      requestsByModel: {}
    };
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

// Load Balancing Strategies
class RoundRobinLoadBalancer implements LoadBalancingStrategy {
  private currentIndex = 0;

  selectEndpoint(endpoints: InferenceEndpoint[]): InferenceEndpoint {
    const activeEndpoints = endpoints.filter(e => e.status === 'active');
    if (activeEndpoints.length === 0) {
      throw new Error('No active endpoints available');
    }

    const endpoint = activeEndpoints[this.currentIndex % activeEndpoints.length];
    this.currentIndex++;
    return endpoint;
  }

  updateEndpointMetrics(): void {
    // No specific logic needed for round robin
  }
}

class LeastConnectionsLoadBalancer implements LoadBalancingStrategy {
  selectEndpoint(endpoints: InferenceEndpoint[]): InferenceEndpoint {
    const activeEndpoints = endpoints.filter(e => e.status === 'active');
    if (activeEndpoints.length === 0) {
      throw new Error('No active endpoints available');
    }

    return activeEndpoints.reduce((least, current) => 
      current.connections < least.connections ? current : least
    );
  }

  updateEndpointMetrics(): void {
    // Connections are tracked elsewhere
  }
}

class WeightedLoadBalancer implements LoadBalancingStrategy {
  selectEndpoint(endpoints: InferenceEndpoint[]): InferenceEndpoint {
    const activeEndpoints = endpoints.filter(e => e.status === 'active');
    if (activeEndpoints.length === 0) {
      throw new Error('No active endpoints available');
    }

    const totalWeight = activeEndpoints.reduce((sum, e) => sum + e.weight, 0);
    let random = Math.random() * totalWeight;

    for (const endpoint of activeEndpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }

    return activeEndpoints[0];
  }

  updateEndpointMetrics(): void {
    // Weights are static or updated elsewhere
  }
}

class AdaptiveLoadBalancer implements LoadBalancingStrategy {
  selectEndpoint(endpoints: InferenceEndpoint[]): InferenceEndpoint {
    const activeEndpoints = endpoints.filter(e => e.status === 'active' && e.health.status === 'healthy');
    if (activeEndpoints.length === 0) {
      throw new Error('No healthy endpoints available');
    }

    // Select based on combination of latency and error rate
    return activeEndpoints.reduce((best, current) => {
      const currentScore = current.health.latency * (1 + current.health.errorRate);
      const bestScore = best.health.latency * (1 + best.health.errorRate);
      return currentScore < bestScore ? current : best;
    });
  }

  updateEndpointMetrics(): void {
    // Metrics are updated in the main engine
  }
}