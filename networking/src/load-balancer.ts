import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import { IncomingMessage, ServerResponse, createServer, Server } from 'http';
import { createServer as createHttpsServer } from 'https';

export interface LoadBalancerConfig {
  name: string;
  type: 'layer4' | 'layer7' | 'hybrid';
  algorithm: 'round-robin' | 'least-connections' | 'ip-hash' | 'weighted' | 'least-response-time' | 'resource-based';
  healthCheck: HealthCheckConfig;
  stickySessions: StickySessionConfig;
  ssl: SSLConfig;
  compression: CompressionConfig;
  caching: CacheConfig;
  rateLimiting: RateLimitConfig;
  failover: FailoverConfig;
  monitoring: MonitoringConfig;
}

export interface HealthCheckConfig {
  enabled: boolean;
  interval: number; // seconds
  timeout: number; // seconds
  retries: number;
  path?: string;
  method?: string;
  expectedStatus?: number[];
  expectedContent?: string;
  headers?: Record<string, string>;
  gracePeriod: number; // seconds
  failureThreshold: number;
  recoveryThreshold: number;
}

export interface StickySessionConfig {
  enabled: boolean;
  method: 'cookie' | 'ip-hash' | 'header';
  cookieName?: string;
  headerName?: string;
  ttl: number; // seconds
  fallbackToRoundRobin: boolean;
}

export interface SSLConfig {
  enabled: boolean;
  certificates: SSLCertificate[];
  protocols: string[];
  ciphers: string[];
  honorCipherOrder: boolean;
  sessionCache: boolean;
  sessionTimeout: number; // seconds
  sslRedirect: boolean;
  hstsEnabled: boolean;
  hstsMaxAge: number; // seconds
}

export interface SSLCertificate {
  id: string;
  domain: string;
  certPath: string;
  keyPath: string;
  chainPath?: string;
  expires: Date;
  autoRenew: boolean;
}

export interface CompressionConfig {
  enabled: boolean;
  types: string[]; // MIME types
  level: number; // 1-9
  threshold: number; // bytes
  algorithms: string[]; // gzip, deflate, br
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number; // seconds
  maxSize: number; // bytes
  varyBy: string[]; // headers to vary cache by
  excludePaths: string[];
  includePaths: string[];
}

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerSecond: number;
  burstSize: number;
  keyExtractor: 'ip' | 'header' | 'custom';
  headerName?: string;
  customExtractor?: (req: IncomingMessage) => string;
  whitelist: string[];
  blacklist: string[];
}

export interface FailoverConfig {
  enabled: boolean;
  mode: 'active-passive' | 'active-active';
  backupPools: string[];
  healthCheckRequired: boolean;
  automaticFailback: boolean;
  failbackDelay: number; // seconds
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsInterval: number; // seconds
  healthCheckLogging: boolean;
  accessLogging: boolean;
  errorLogging: boolean;
  performanceMetrics: boolean;
}

export interface BackendServer {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'http' | 'https';
  weight: number;
  backup: boolean;
  maxConnections: number;
  currentConnections: number;
  status: 'healthy' | 'unhealthy' | 'draining' | 'maintenance';
  responseTime: number; // ms
  errorRate: number; // 0-1
  lastHealthCheck: Date;
  healthCheckFailures: number;
  metadata: Record<string, any>;
  ssl?: {
    verify: boolean;
    caPath?: string;
    certPath?: string;
    keyPath?: string;
  };
}

export interface ServerPool {
  id: string;
  name: string;
  servers: BackendServer[];
  algorithm: string;
  healthCheck: HealthCheckConfig;
  enabled: boolean;
  priority: number;
  weights: Record<string, number>;
  metadata: Record<string, any>;
}

export interface RequestContext {
  id: string;
  startTime: number;
  clientIp: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  userAgent: string;
  sessionId?: string;
  userId?: string;
  selectedServer?: string;
  retryCount: number;
  cached: boolean;
  compressed: boolean;
}

export interface LoadBalancerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  throughput: number; // requests/second
  activeConnections: number;
  cacheHitRate: number;
  compressionRatio: number;
  sslHandshakes: number;
  bytesTransferred: number;
  errorsByType: Record<string, number>;
  serverMetrics: Map<string, ServerMetrics>;
  lastUpdated: Date;
}

export interface ServerMetrics {
  serverId: string;
  requests: number;
  responses: number;
  errors: number;
  responseTime: number;
  connections: number;
  bytesReceived: number;
  bytesSent: number;
  uptime: number;
  lastActivity: Date;
}

export interface LoadBalancingRule {
  id: string;
  name: string;
  condition: RuleCondition;
  action: RuleAction;
  priority: number;
  enabled: boolean;
}

export interface RuleCondition {
  type: 'path' | 'header' | 'method' | 'ip' | 'custom';
  operator: 'equals' | 'contains' | 'starts-with' | 'ends-with' | 'regex' | 'in-list';
  value: string | string[];
  caseSensitive: boolean;
}

export interface RuleAction {
  type: 'route-to-pool' | 'redirect' | 'reject' | 'modify-request' | 'modify-response';
  poolId?: string;
  redirectUrl?: string;
  statusCode?: number;
  headers?: Record<string, string>;
  weight?: number;
}

export class LoadBalancer extends EventEmitter {
  private config: LoadBalancerConfig;
  private pools = new Map<string, ServerPool>();
  private rules = new Map<string, LoadBalancingRule>();
  private sessions = new Map<string, string>(); // sessionId -> serverId
  private connections = new Map<string, number>(); // serverId -> connection count
  private metrics: LoadBalancerMetrics;
  private cache = new Map<string, CacheEntry>();
  private rateLimitBuckets = new Map<string, RateLimitBucket>();
  private server: Server | null = null;
  private healthCheckTimers = new Map<string, NodeJS.Timeout>();
  private metricsTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config: LoadBalancerConfig) {
    super();
    this.config = config;
    this.metrics = this.initializeMetrics();
    this.startMetricsCollection();
  }

  private initializeMetrics(): LoadBalancerMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      throughput: 0,
      activeConnections: 0,
      cacheHitRate: 0,
      compressionRatio: 0,
      sslHandshakes: 0,
      bytesTransferred: 0,
      errorsByType: {},
      serverMetrics: new Map(),
      lastUpdated: new Date()
    };
  }

  addServerPool(pool: ServerPool): void {
    this.pools.set(pool.id, pool);
    
    // Initialize server metrics
    for (const server of pool.servers) {
      this.metrics.serverMetrics.set(server.id, {
        serverId: server.id,
        requests: 0,
        responses: 0,
        errors: 0,
        responseTime: 0,
        connections: 0,
        bytesReceived: 0,
        bytesSent: 0,
        uptime: 0,
        lastActivity: new Date()
      });
      
      this.connections.set(server.id, 0);
      
      // Start health checking
      if (pool.healthCheck.enabled) {
        this.startHealthCheck(server, pool.healthCheck);
      }
    }

    this.emit('pool-added', pool);
  }

  removeServerPool(poolId: string): boolean {
    const pool = this.pools.get(poolId);
    if (!pool) {
      return false;
    }

    // Stop health checks for servers in this pool
    for (const server of pool.servers) {
      this.stopHealthCheck(server.id);
      this.metrics.serverMetrics.delete(server.id);
      this.connections.delete(server.id);
    }

    this.pools.delete(poolId);
    this.emit('pool-removed', { poolId });
    return true;
  }

  addLoadBalancingRule(rule: LoadBalancingRule): void {
    this.rules.set(rule.id, rule);
    this.emit('rule-added', rule);
  }

  removeLoadBalancingRule(ruleId: string): boolean {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.delete(ruleId);
      this.emit('rule-removed', { ruleId });
      return true;
    }
    return false;
  }

  async start(port: number = 80, httpsPort?: number): Promise<void> {
    if (this.isRunning) {
      throw new Error('Load balancer is already running');
    }

    // Create HTTP server
    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    // Create HTTPS server if SSL is enabled
    if (this.config.ssl.enabled && httpsPort) {
      const httpsServer = createHttpsServer({
        // SSL options would be configured here
      }, (req, res) => {
        this.handleRequest(req, res);
      });

      httpsServer.listen(httpsPort, () => {
        this.emit('https-server-started', { port: httpsPort });
      });
    }

    return new Promise((resolve, reject) => {
      this.server!.listen(port, (error: any) => {
        if (error) {
          reject(error);
          return;
        }

        this.isRunning = true;
        this.emit('started', { port, httpsPort });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    // Stop health check timers
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();

    // Stop metrics collection
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        this.emit('stopped');
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const context = this.createRequestContext(req);
    const startTime = Date.now();

    try {
      this.metrics.totalRequests++;
      this.metrics.activeConnections++;

      // Apply load balancing rules
      const ruleAction = this.applyRules(context);
      if (ruleAction) {
        await this.executeRuleAction(ruleAction, context, req, res);
        return;
      }

      // Check rate limiting
      if (this.config.rateLimiting.enabled && !this.checkRateLimit(context)) {
        this.sendError(res, 429, 'Too Many Requests');
        return;
      }

      // Check cache
      if (this.config.caching.enabled) {
        const cachedResponse = this.getFromCache(context);
        if (cachedResponse) {
          context.cached = true;
          this.sendCachedResponse(res, cachedResponse);
          this.recordMetrics(context, startTime, 200);
          return;
        }
      }

      // Select backend server
      const server = this.selectServer(context);
      if (!server) {
        this.sendError(res, 503, 'Service Unavailable');
        return;
      }

      context.selectedServer = server.id;

      // Forward request to backend
      await this.forwardRequest(req, res, server, context);

    } catch (error) {
      this.metrics.failedRequests++;
      this.sendError(res, 500, 'Internal Server Error');
      this.emit('request-error', {
        context,
        error: (error as Error).message
      });
    } finally {
      this.metrics.activeConnections--;
      this.recordMetrics(context, startTime, res.statusCode);
    }
  }

  private createRequestContext(req: IncomingMessage): RequestContext {
    const clientIp = this.getClientIP(req);
    
    return {
      id: crypto.randomUUID(),
      startTime: Date.now(),
      clientIp,
      method: req.method || 'GET',
      url: req.url || '/',
      headers: req.headers as Record<string, string>,
      userAgent: req.headers['user-agent'] || '',
      retryCount: 0,
      cached: false,
      compressed: false
    };
  }

  private getClientIP(req: IncomingMessage): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
           (req.headers['x-real-ip'] as string) ||
           req.socket.remoteAddress ||
           '0.0.0.0';
  }

  private applyRules(context: RequestContext): RuleAction | null {
    const sortedRules = Array.from(this.rules.values())
      .filter(rule => rule.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      if (this.evaluateRuleCondition(rule.condition, context)) {
        return rule.action;
      }
    }

    return null;
  }

  private evaluateRuleCondition(condition: RuleCondition, context: RequestContext): boolean {
    let value: string;

    switch (condition.type) {
      case 'path':
        value = context.url;
        break;
      case 'method':
        value = context.method;
        break;
      case 'ip':
        value = context.clientIp;
        break;
      case 'header':
        value = context.headers[condition.value as string] || '';
        break;
      default:
        return false;
    }

    if (!condition.caseSensitive) {
      value = value.toLowerCase();
    }

    const testValue = condition.caseSensitive 
      ? condition.value 
      : (Array.isArray(condition.value) 
          ? condition.value.map(v => v.toLowerCase())
          : (condition.value as string).toLowerCase());

    switch (condition.operator) {
      case 'equals':
        return value === testValue;
      case 'contains':
        return value.includes(testValue as string);
      case 'starts-with':
        return value.startsWith(testValue as string);
      case 'ends-with':
        return value.endsWith(testValue as string);
      case 'regex':
        return new RegExp(testValue as string).test(value);
      case 'in-list':
        return Array.isArray(testValue) && testValue.includes(value);
      default:
        return false;
    }
  }

  private async executeRuleAction(action: RuleAction, context: RequestContext, req: IncomingMessage, res: ServerResponse): Promise<void> {
    switch (action.type) {
      case 'route-to-pool':
        if (action.poolId) {
          const pool = this.pools.get(action.poolId);
          if (pool) {
            const server = this.selectServerFromPool(pool, context);
            if (server) {
              await this.forwardRequest(req, res, server, context);
              return;
            }
          }
        }
        this.sendError(res, 503, 'Service Unavailable');
        break;

      case 'redirect':
        if (action.redirectUrl) {
          res.writeHead(action.statusCode || 302, {
            'Location': action.redirectUrl,
            ...action.headers
          });
          res.end();
        }
        break;

      case 'reject':
        this.sendError(res, action.statusCode || 403, 'Forbidden');
        break;

      case 'modify-request':
        if (action.headers) {
          Object.assign(req.headers, action.headers);
        }
        break;
    }
  }

  private checkRateLimit(context: RequestContext): boolean {
    const config = this.config.rateLimiting;
    
    let key: string;
    switch (config.keyExtractor) {
      case 'ip':
        key = context.clientIp;
        break;
      case 'header':
        key = context.headers[config.headerName || 'authorization'] || context.clientIp;
        break;
      case 'custom':
        key = config.customExtractor ? config.customExtractor(context as any) : context.clientIp;
        break;
      default:
        key = context.clientIp;
    }

    // Check whitelist
    if (config.whitelist.includes(key)) {
      return true;
    }

    // Check blacklist
    if (config.blacklist.includes(key)) {
      return false;
    }

    // Token bucket rate limiting
    const now = Date.now();
    let bucket = this.rateLimitBuckets.get(key);

    if (!bucket) {
      bucket = {
        tokens: config.requestsPerSecond,
        lastRefill: now,
        burstTokens: config.burstSize
      };
      this.rateLimitBuckets.set(key, bucket);
    }

    // Refill tokens
    const elapsed = (now - bucket.lastRefill) / 1000;
    const tokensToAdd = elapsed * config.requestsPerSecond;
    bucket.tokens = Math.min(config.requestsPerSecond, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    // Check if request can be served
    if (bucket.tokens >= 1) {
      bucket.tokens--;
      return true;
    }

    // Check burst tokens
    if (bucket.burstTokens > 0) {
      bucket.burstTokens--;
      return true;
    }

    return false;
  }

  private getFromCache(context: RequestContext): CacheEntry | null {
    const cacheKey = this.generateCacheKey(context);
    const entry = this.cache.get(cacheKey);

    if (entry && entry.expires > Date.now()) {
      this.metrics.cacheHitRate = (this.metrics.cacheHitRate + 1) / 2; // Running average
      return entry;
    }

    if (entry) {
      this.cache.delete(cacheKey);
    }

    return null;
  }

  private generateCacheKey(context: RequestContext): string {
    let key = `${context.method}:${context.url}`;
    
    for (const header of this.config.caching.varyBy) {
      key += `:${context.headers[header] || ''}`;
    }

    return crypto.createHash('md5').update(key).digest('hex');
  }

  private sendCachedResponse(res: ServerResponse, entry: CacheEntry): void {
    res.writeHead(entry.statusCode, entry.headers);
    res.end(entry.body);
  }

  private selectServer(context: RequestContext): BackendServer | null {
    // Find the best pool based on priority and health
    const availablePools = Array.from(this.pools.values())
      .filter(pool => pool.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const pool of availablePools) {
      const server = this.selectServerFromPool(pool, context);
      if (server) {
        return server;
      }
    }

    return null;
  }

  private selectServerFromPool(pool: ServerPool, context: RequestContext): BackendServer | null {
    const healthyServers = pool.servers.filter(s => s.status === 'healthy');
    
    if (healthyServers.length === 0) {
      return null;
    }

    // Check sticky sessions
    if (this.config.stickySessions.enabled) {
      const sessionServer = this.getSessionServer(context);
      if (sessionServer && healthyServers.find(s => s.id === sessionServer)) {
        return healthyServers.find(s => s.id === sessionServer)!;
      }
    }

    let selectedServer: BackendServer;

    switch (this.config.algorithm) {
      case 'round-robin':
        selectedServer = this.selectRoundRobin(healthyServers, pool.id);
        break;
      
      case 'least-connections':
        selectedServer = this.selectLeastConnections(healthyServers);
        break;
      
      case 'ip-hash':
        selectedServer = this.selectIPHash(healthyServers, context.clientIp);
        break;
      
      case 'weighted':
        selectedServer = this.selectWeighted(healthyServers, pool.weights);
        break;
      
      case 'least-response-time':
        selectedServer = this.selectLeastResponseTime(healthyServers);
        break;
      
      case 'resource-based':
        selectedServer = this.selectResourceBased(healthyServers);
        break;
      
      default:
        selectedServer = healthyServers[0];
    }

    // Update sticky session
    if (this.config.stickySessions.enabled && context.sessionId) {
      this.setSessionServer(context.sessionId, selectedServer.id);
    }

    return selectedServer;
  }

  private selectRoundRobin(servers: BackendServer[], poolId: string): BackendServer {
    // Simple round-robin - in production would track per-pool state
    const index = Math.floor(Math.random() * servers.length);
    return servers[index];
  }

  private selectLeastConnections(servers: BackendServer[]): BackendServer {
    return servers.reduce((least, current) => {
      const leastConnections = this.connections.get(least.id) || 0;
      const currentConnections = this.connections.get(current.id) || 0;
      return currentConnections < leastConnections ? current : least;
    });
  }

  private selectIPHash(servers: BackendServer[], clientIP: string): BackendServer {
    const hash = crypto.createHash('md5').update(clientIP).digest('hex');
    const index = parseInt(hash.substring(0, 8), 16) % servers.length;
    return servers[index];
  }

  private selectWeighted(servers: BackendServer[], weights: Record<string, number>): BackendServer {
    const totalWeight = servers.reduce((sum, server) => 
      sum + (weights[server.id] || server.weight), 0);
    
    let random = Math.random() * totalWeight;
    
    for (const server of servers) {
      const weight = weights[server.id] || server.weight;
      random -= weight;
      if (random <= 0) {
        return server;
      }
    }
    
    return servers[servers.length - 1];
  }

  private selectLeastResponseTime(servers: BackendServer[]): BackendServer {
    return servers.reduce((fastest, current) => 
      current.responseTime < fastest.responseTime ? current : fastest
    );
  }

  private selectResourceBased(servers: BackendServer[]): BackendServer {
    // Select based on server resource utilization
    // This would integrate with actual resource monitoring
    return servers.reduce((best, current) => {
      const bestScore = this.calculateResourceScore(best);
      const currentScore = this.calculateResourceScore(current);
      return currentScore > bestScore ? current : best;
    });
  }

  private calculateResourceScore(server: BackendServer): number {
    // Simple scoring based on connections and response time
    const connectionScore = Math.max(0, 1 - (server.currentConnections / server.maxConnections));
    const responseTimeScore = Math.max(0, 1 - (server.responseTime / 5000)); // 5s max
    return (connectionScore + responseTimeScore) / 2;
  }

  private getSessionServer(context: RequestContext): string | null {
    if (!context.sessionId) {
      return null;
    }

    return this.sessions.get(context.sessionId) || null;
  }

  private setSessionServer(sessionId: string, serverId: string): void {
    this.sessions.set(sessionId, serverId);
    
    // Clean up expired sessions periodically
    setTimeout(() => {
      this.sessions.delete(sessionId);
    }, this.config.stickySessions.ttl * 1000);
  }

  private async forwardRequest(
    req: IncomingMessage,
    res: ServerResponse,
    server: BackendServer,
    context: RequestContext
  ): Promise<void> {
    const startTime = Date.now();
    
    // Increment connection count
    const currentConnections = this.connections.get(server.id) || 0;
    this.connections.set(server.id, currentConnections + 1);
    server.currentConnections = currentConnections + 1;

    try {
      const url = `${server.protocol}://${server.host}:${server.port}${req.url}`;
      const headers = { ...req.headers };
      
      // Add load balancer headers
      headers['X-Forwarded-For'] = context.clientIp;
      headers['X-Forwarded-Proto'] = req.socket.encrypted ? 'https' : 'http';
      headers['X-Forwarded-Host'] = req.headers.host || '';
      headers['X-Request-ID'] = context.id;

      // Read request body
      const body = await this.readRequestBody(req);

      // Make request to backend
      const response = await fetch(url, {
        method: req.method,
        headers,
        body: body || undefined
      });

      const responseBody = await response.arrayBuffer();
      const responseHeaders = Object.fromEntries(response.headers.entries());

      // Apply compression if enabled
      let finalBody = Buffer.from(responseBody);
      if (this.shouldCompress(responseHeaders, finalBody.length)) {
        finalBody = await this.compressResponse(finalBody);
        responseHeaders['content-encoding'] = 'gzip';
        responseHeaders['content-length'] = finalBody.length.toString();
        context.compressed = true;
      }

      // Cache response if cacheable
      if (this.shouldCache(context, response.status, responseHeaders)) {
        this.cacheResponse(context, response.status, responseHeaders, finalBody);
      }

      // Send response
      res.writeHead(response.status, responseHeaders);
      res.end(finalBody);

      // Update server metrics
      const responseTime = Date.now() - startTime;
      server.responseTime = (server.responseTime + responseTime) / 2; // Running average
      
      const serverMetrics = this.metrics.serverMetrics.get(server.id)!;
      serverMetrics.requests++;
      serverMetrics.responses++;
      serverMetrics.responseTime = (serverMetrics.responseTime + responseTime) / 2;
      serverMetrics.bytesSent += finalBody.length;
      serverMetrics.lastActivity = new Date();

    } catch (error) {
      // Handle backend error
      const serverMetrics = this.metrics.serverMetrics.get(server.id)!;
      serverMetrics.errors++;
      server.errorRate = serverMetrics.errors / (serverMetrics.requests || 1);
      
      // Retry with another server if possible
      if (context.retryCount < 2) {
        context.retryCount++;
        const alternativeServer = this.selectServer(context);
        if (alternativeServer && alternativeServer.id !== server.id) {
          await this.forwardRequest(req, res, alternativeServer, context);
          return;
        }
      }

      this.sendError(res, 502, 'Bad Gateway');
      throw error;

    } finally {
      // Decrement connection count
      const connections = this.connections.get(server.id) || 0;
      this.connections.set(server.id, Math.max(0, connections - 1));
      server.currentConnections = Math.max(0, server.currentConnections - 1);
    }
  }

  private async readRequestBody(req: IncomingMessage): Promise<Buffer | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        if (chunks.length > 0) {
          resolve(Buffer.concat(chunks));
        } else {
          resolve(null);
        }
      });
      req.on('error', () => resolve(null));
    });
  }

  private shouldCompress(headers: Record<string, string>, bodyLength: number): boolean {
    if (!this.config.compression.enabled) {
      return false;
    }

    if (bodyLength < this.config.compression.threshold) {
      return false;
    }

    const contentType = headers['content-type'] || '';
    return this.config.compression.types.some(type => 
      contentType.includes(type)
    );
  }

  private async compressResponse(body: Buffer): Promise<Buffer> {
    const zlib = require('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(body, { level: this.config.compression.level }, (err: any, compressed: Buffer) => {
        if (err) reject(err);
        else resolve(compressed);
      });
    });
  }

  private shouldCache(context: RequestContext, statusCode: number, headers: Record<string, string>): boolean {
    if (!this.config.caching.enabled) {
      return false;
    }

    if (context.method !== 'GET') {
      return false;
    }

    if (statusCode < 200 || statusCode >= 300) {
      return false;
    }

    if (headers['cache-control']?.includes('no-cache')) {
      return false;
    }

    // Check include/exclude paths
    if (this.config.caching.excludePaths.some(path => context.url.includes(path))) {
      return false;
    }

    if (this.config.caching.includePaths.length > 0) {
      return this.config.caching.includePaths.some(path => context.url.includes(path));
    }

    return true;
  }

  private cacheResponse(context: RequestContext, statusCode: number, headers: Record<string, string>, body: Buffer): void {
    const cacheKey = this.generateCacheKey(context);
    const entry: CacheEntry = {
      statusCode,
      headers,
      body,
      expires: Date.now() + (this.config.caching.ttl * 1000),
      size: body.length
    };

    // Check cache size limits
    if (this.calculateCacheSize() + entry.size > this.config.caching.maxSize) {
      this.evictCacheEntries();
    }

    this.cache.set(cacheKey, entry);
  }

  private calculateCacheSize(): number {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }
    return totalSize;
  }

  private evictCacheEntries(): void {
    // Simple LRU eviction - remove oldest entries
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].expires - b[1].expires);

    const targetSize = this.config.caching.maxSize * 0.8; // Remove 20% of cache
    let currentSize = this.calculateCacheSize();

    for (const [key, entry] of entries) {
      if (currentSize <= targetSize) {
        break;
      }
      
      this.cache.delete(key);
      currentSize -= entry.size;
    }
  }

  private sendError(res: ServerResponse, statusCode: number, message: string): void {
    this.metrics.failedRequests++;
    this.metrics.errorsByType[statusCode] = (this.metrics.errorsByType[statusCode] || 0) + 1;

    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache'
    });

    res.end(JSON.stringify({
      error: message,
      timestamp: new Date().toISOString(),
      requestId: crypto.randomUUID()
    }));
  }

  private recordMetrics(context: RequestContext, startTime: number, statusCode: number): void {
    const responseTime = Date.now() - startTime;
    
    this.metrics.averageResponseTime = (this.metrics.averageResponseTime + responseTime) / 2;
    
    if (statusCode >= 200 && statusCode < 400) {
      this.metrics.successfulRequests++;
    }

    this.metrics.bytesTransferred += 1024; // Approximate
    this.metrics.lastUpdated = new Date();

    this.emit('request-completed', {
      context,
      responseTime,
      statusCode,
      cached: context.cached,
      compressed: context.compressed
    });
  }

  private startHealthCheck(server: BackendServer, config: HealthCheckConfig): void {
    const healthCheck = async () => {
      try {
        const isHealthy = await this.performHealthCheck(server, config);
        const wasHealthy = server.status === 'healthy';
        
        if (isHealthy) {
          server.healthCheckFailures = 0;
          if (server.status === 'unhealthy' && server.healthCheckFailures === 0) {
            server.status = 'healthy';
            this.emit('server-recovered', server);
          }
        } else {
          server.healthCheckFailures++;
          if (server.healthCheckFailures >= config.failureThreshold && wasHealthy) {
            server.status = 'unhealthy';
            this.emit('server-failed', server);
          }
        }

        server.lastHealthCheck = new Date();

      } catch (error) {
        server.healthCheckFailures++;
        if (server.healthCheckFailures >= config.failureThreshold) {
          server.status = 'unhealthy';
        }
      }
    };

    // Initial health check after grace period
    setTimeout(healthCheck, config.gracePeriod * 1000);

    // Regular health checks
    const timer = setInterval(healthCheck, config.interval * 1000);
    this.healthCheckTimers.set(server.id, timer);
  }

  private async performHealthCheck(server: BackendServer, config: HealthCheckConfig): Promise<boolean> {
    const url = config.path 
      ? `${server.protocol}://${server.host}:${server.port}${config.path}`
      : `${server.protocol}://${server.host}:${server.port}/health`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout * 1000);

    try {
      const response = await fetch(url, {
        method: config.method || 'GET',
        headers: config.headers || {},
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Check expected status codes
      if (config.expectedStatus && !config.expectedStatus.includes(response.status)) {
        return false;
      }

      // Check expected content
      if (config.expectedContent) {
        const content = await response.text();
        return content.includes(config.expectedContent);
      }

      return response.ok;

    } catch (error) {
      clearTimeout(timeoutId);
      return false;
    }
  }

  private stopHealthCheck(serverId: string): void {
    const timer = this.healthCheckTimers.get(serverId);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(serverId);
    }
  }

  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
    }, this.config.monitoring.metricsInterval * 1000);
  }

  private updateMetrics(): void {
    // Calculate throughput
    const now = Date.now();
    const timeDiff = (now - this.metrics.lastUpdated.getTime()) / 1000;
    this.metrics.throughput = this.metrics.totalRequests / timeDiff;

    // Update compression ratio
    if (this.metrics.totalRequests > 0) {
      this.metrics.compressionRatio = this.metrics.totalRequests > 0 ? 0.3 : 0; // Simplified
    }

    this.metrics.lastUpdated = new Date();

    this.emit('metrics-updated', this.metrics);
  }

  // Public API methods
  getMetrics(): LoadBalancerMetrics {
    return { ...this.metrics };
  }

  getServerPools(): ServerPool[] {
    return Array.from(this.pools.values());
  }

  getServerPool(poolId: string): ServerPool | null {
    return this.pools.get(poolId) || null;
  }

  getLoadBalancingRules(): LoadBalancingRule[] {
    return Array.from(this.rules.values());
  }

  drainServer(serverId: string): boolean {
    for (const pool of this.pools.values()) {
      const server = pool.servers.find(s => s.id === serverId);
      if (server) {
        server.status = 'draining';
        this.emit('server-draining', server);
        return true;
      }
    }
    return false;
  }

  enableServer(serverId: string): boolean {
    for (const pool of this.pools.values()) {
      const server = pool.servers.find(s => s.id === serverId);
      if (server) {
        server.status = 'healthy';
        this.emit('server-enabled', server);
        return true;
      }
    }
    return false;
  }

  getStats(): any {
    const pools = Array.from(this.pools.values());
    const allServers = pools.flatMap(p => p.servers);

    return {
      isRunning: this.isRunning,
      pools: pools.length,
      servers: {
        total: allServers.length,
        healthy: allServers.filter(s => s.status === 'healthy').length,
        unhealthy: allServers.filter(s => s.status === 'unhealthy').length,
        draining: allServers.filter(s => s.status === 'draining').length
      },
      rules: this.rules.size,
      cache: {
        entries: this.cache.size,
        size: this.calculateCacheSize(),
        hitRate: this.metrics.cacheHitRate
      },
      rateLimiting: {
        buckets: this.rateLimitBuckets.size
      },
      sessions: this.sessions.size,
      metrics: this.metrics
    };
  }

  destroy(): void {
    if (this.isRunning) {
      this.stop();
    }

    // Clear all timers
    for (const timer of this.healthCheckTimers.values()) {
      clearInterval(timer);
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
    }

    this.pools.clear();
    this.rules.clear();
    this.sessions.clear();
    this.connections.clear();
    this.cache.clear();
    this.rateLimitBuckets.clear();
    this.healthCheckTimers.clear();

    this.removeAllListeners();
  }
}

interface CacheEntry {
  statusCode: number;
  headers: Record<string, string>;
  body: Buffer;
  expires: number;
  size: number;
}

interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  burstTokens: number;
}