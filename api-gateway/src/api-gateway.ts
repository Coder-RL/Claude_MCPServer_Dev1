import { EventEmitter } from 'events';
import { IncomingMessage, ServerResponse, createServer } from 'http';
import { URL } from 'url';

export interface GatewayRoute {
  id: string;
  path: string;
  method: string;
  target: string;
  rateLimit?: RateLimitConfig;
  authentication?: AuthConfig;
  transformation?: TransformConfig;
  caching?: CacheConfig;
  circuitBreaker?: CircuitBreakerConfig;
  retries?: RetryConfig;
  timeout?: number;
  metadata: Record<string, any>;
}

export interface RateLimitConfig {
  requests: number;
  window: number; // seconds
  burst?: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: IncomingMessage) => string;
}

export interface AuthConfig {
  required: boolean;
  methods: ('jwt' | 'apikey' | 'oauth2' | 'basic')[];
  roles?: string[];
  scopes?: string[];
}

export interface TransformConfig {
  request?: {
    headers?: Record<string, string>;
    body?: string;
  };
  response?: {
    headers?: Record<string, string>;
    body?: string;
  };
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  key?: string;
  varyBy?: string[];
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export interface RetryConfig {
  attempts: number;
  delay: number;
  backoff?: 'linear' | 'exponential';
  retryOn?: number[];
}

interface RequestMetrics {
  timestamp: number;
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  size: number;
}

interface RateLimitBucket {
  requests: number;
  resetTime: number;
  burstTokens: number;
}

export class APIGateway extends EventEmitter {
  private routes = new Map<string, GatewayRoute>();
  private rateLimitBuckets = new Map<string, RateLimitBucket>();
  private circuitBreakers = new Map<string, {
    failures: number;
    lastFailure: number;
    state: 'closed' | 'open' | 'half-open';
  }>();
  private cache = new Map<string, { data: any; expires: number }>();
  private middleware: Array<(req: IncomingMessage, res: ServerResponse, next: () => void) => void> = [];
  private server: any;
  private port: number;
  private isRunning = false;

  constructor(port: number = 8080) {
    super();
    this.port = port;
    this.setupDefaultMiddleware();
    this.startMetricsCleanup();
  }

  private setupDefaultMiddleware(): void {
    // CORS middleware
    this.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }
      
      next();
    });

    // Request logging middleware
    this.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        this.emit('request', {
          timestamp: start,
          method: req.method!,
          path: req.url!,
          statusCode: res.statusCode,
          responseTime: duration,
          size: parseInt(res.getHeader('content-length') as string) || 0
        } as RequestMetrics);
      });
      
      next();
    });
  }

  use(middleware: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void {
    this.middleware.push(middleware);
  }

  addRoute(route: GatewayRoute): void {
    const routeKey = `${route.method.toUpperCase()}:${route.path}`;
    this.routes.set(routeKey, route);
    
    this.emit('route-added', route);
  }

  removeRoute(method: string, path: string): void {
    const routeKey = `${method.toUpperCase()}:${path}`;
    const route = this.routes.get(routeKey);
    
    if (route) {
      this.routes.delete(routeKey);
      this.emit('route-removed', route);
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Gateway is already running');
    }

    this.server = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        this.handleError(error, res);
      }
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (error: any) => {
        if (error) {
          reject(error);
          return;
        }
        
        this.isRunning = true;
        this.emit('started', { port: this.port });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        this.emit('stopped');
        resolve();
      });
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Execute middleware chain
    await this.executeMiddleware(req, res);
    
    // Find matching route
    const route = this.findRoute(req);
    if (!route) {
      this.sendError(res, 404, 'Route not found');
      return;
    }

    // Rate limiting
    if (route.rateLimit && !await this.checkRateLimit(req, route.rateLimit)) {
      this.sendError(res, 429, 'Too Many Requests');
      return;
    }

    // Authentication
    if (route.authentication && !await this.authenticate(req, route.authentication)) {
      this.sendError(res, 401, 'Unauthorized');
      return;
    }

    // Circuit breaker check
    if (route.circuitBreaker && !this.checkCircuitBreaker(route)) {
      this.sendError(res, 503, 'Service Unavailable');
      return;
    }

    // Check cache
    if (route.caching?.enabled) {
      const cached = this.getFromCache(req, route);
      if (cached) {
        this.sendResponse(res, 200, cached);
        return;
      }
    }

    // Forward request
    await this.forwardRequest(req, res, route);
  }

  private findRoute(req: IncomingMessage): GatewayRoute | null {
    const method = req.method!.toUpperCase();
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const path = url.pathname;

    // Exact match first
    const exactKey = `${method}:${path}`;
    if (this.routes.has(exactKey)) {
      return this.routes.get(exactKey)!;
    }

    // Pattern matching
    for (const [routeKey, route] of this.routes) {
      if (routeKey.startsWith(`${method}:`)) {
        const routePath = routeKey.substring(method.length + 1);
        if (this.matchPath(path, routePath)) {
          return route;
        }
      }
    }

    return null;
  }

  private matchPath(requestPath: string, routePath: string): boolean {
    // Simple wildcard matching
    const routeRegex = routePath
      .replace(/\*/g, '.*')
      .replace(/\{[^}]+\}/g, '[^/]+');
    
    return new RegExp(`^${routeRegex}$`).test(requestPath);
  }

  private async executeMiddleware(req: IncomingMessage, res: ServerResponse): Promise<void> {
    let index = 0;
    
    const next = () => {
      if (index < this.middleware.length) {
        const middleware = this.middleware[index++];
        middleware(req, res, next);
      }
    };
    
    next();
  }

  private async checkRateLimit(req: IncomingMessage, config: RateLimitConfig): Promise<boolean> {
    const key = config.keyGenerator ? config.keyGenerator(req) : this.getClientIP(req);
    const now = Date.now();
    const windowStart = Math.floor(now / (config.window * 1000)) * (config.window * 1000);
    
    let bucket = this.rateLimitBuckets.get(key);
    
    if (!bucket || bucket.resetTime <= now) {
      bucket = {
        requests: 0,
        resetTime: windowStart + (config.window * 1000),
        burstTokens: config.burst || config.requests
      };
      this.rateLimitBuckets.set(key, bucket);
    }

    if (bucket.requests >= config.requests) {
      if (config.burst && bucket.burstTokens > 0) {
        bucket.burstTokens--;
        bucket.requests++;
        return true;
      }
      return false;
    }

    bucket.requests++;
    return true;
  }

  private async authenticate(req: IncomingMessage, config: AuthConfig): Promise<boolean> {
    if (!config.required) {
      return true;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return false;
    }

    // Simple authentication logic - in production, integrate with auth service
    for (const method of config.methods) {
      if (await this.validateAuthMethod(authHeader, method, config)) {
        return true;
      }
    }

    return false;
  }

  private async validateAuthMethod(authHeader: string, method: string, config: AuthConfig): Promise<boolean> {
    switch (method) {
      case 'jwt':
        return authHeader.startsWith('Bearer ') && authHeader.length > 7;
      case 'apikey':
        return authHeader.startsWith('ApiKey ') && authHeader.length > 7;
      case 'basic':
        return authHeader.startsWith('Basic ') && authHeader.length > 6;
      case 'oauth2':
        return authHeader.startsWith('Bearer ') && authHeader.length > 7;
      default:
        return false;
    }
  }

  private checkCircuitBreaker(route: GatewayRoute): boolean {
    if (!route.circuitBreaker) {
      return true;
    }

    const key = route.id;
    const breaker = this.circuitBreakers.get(key) || {
      failures: 0,
      lastFailure: 0,
      state: 'closed' as const
    };

    const now = Date.now();

    switch (breaker.state) {
      case 'closed':
        return true;
      
      case 'open':
        if (now - breaker.lastFailure >= route.circuitBreaker.resetTimeout) {
          breaker.state = 'half-open';
          this.circuitBreakers.set(key, breaker);
          return true;
        }
        return false;
      
      case 'half-open':
        return true;
      
      default:
        return false;
    }
  }

  private getFromCache(req: IncomingMessage, route: GatewayRoute): any | null {
    if (!route.caching?.enabled) {
      return null;
    }

    const cacheKey = this.generateCacheKey(req, route);
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    return null;
  }

  private generateCacheKey(req: IncomingMessage, route: GatewayRoute): string {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    let key = `${req.method}:${url.pathname}`;
    
    if (route.caching?.varyBy) {
      for (const header of route.caching.varyBy) {
        key += `:${req.headers[header.toLowerCase()]}`;
      }
    }
    
    return key;
  }

  private async forwardRequest(req: IncomingMessage, res: ServerResponse, route: GatewayRoute): Promise<void> {
    const targetUrl = new URL(route.target);
    const requestUrl = new URL(req.url!, `http://${req.headers.host}`);
    
    // Build target URL
    targetUrl.pathname = requestUrl.pathname.replace(new RegExp(`^${route.path}`), '');
    targetUrl.search = requestUrl.search;

    // Apply transformations
    const headers = { ...req.headers };
    if (route.transformation?.request?.headers) {
      Object.assign(headers, route.transformation.request.headers);
    }

    // Make request with retries
    let lastError: Error | null = null;
    const maxAttempts = route.retries?.attempts || 1;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.makeRequest(targetUrl.toString(), {
          method: req.method!,
          headers,
          body: req.method !== 'GET' ? await this.readBody(req) : undefined,
          timeout: route.timeout || 30000
        });

        // Update circuit breaker on success
        if (route.circuitBreaker) {
          const breaker = this.circuitBreakers.get(route.id);
          if (breaker) {
            breaker.failures = 0;
            breaker.state = 'closed';
          }
        }

        // Cache response if enabled
        if (route.caching?.enabled && response.status < 400) {
          const cacheKey = this.generateCacheKey(req, route);
          this.cache.set(cacheKey, {
            data: response.body,
            expires: Date.now() + (route.caching.ttl * 1000)
          });
        }

        // Apply response transformations
        let responseHeaders = response.headers;
        if (route.transformation?.response?.headers) {
          responseHeaders = { ...responseHeaders, ...route.transformation.response.headers };
        }

        // Send response
        Object.entries(responseHeaders).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        
        res.writeHead(response.status);
        res.end(response.body);
        return;

      } catch (error) {
        lastError = error as Error;
        
        // Update circuit breaker on failure
        if (route.circuitBreaker) {
          const key = route.id;
          const breaker = this.circuitBreakers.get(key) || {
            failures: 0,
            lastFailure: 0,
            state: 'closed' as const
          };
          
          breaker.failures++;
          breaker.lastFailure = Date.now();
          
          if (breaker.failures >= route.circuitBreaker.failureThreshold) {
            breaker.state = 'open';
          }
          
          this.circuitBreakers.set(key, breaker);
        }

        // Check if we should retry
        if (attempt < maxAttempts && route.retries) {
          const delay = this.calculateRetryDelay(attempt, route.retries);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    // All retries failed
    this.sendError(res, 502, 'Bad Gateway', lastError?.message);
  }

  private async makeRequest(url: string, options: any): Promise<any> {
    // Simplified HTTP client - in production, use a proper HTTP client
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const http = isHttps ? require('https') : require('http');
    
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: options.method,
        headers: options.headers,
        timeout: options.timeout
      }, (res: any) => {
        let body = '';
        res.on('data', (chunk: any) => body += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  private calculateRetryDelay(attempt: number, config: RetryConfig): number {
    const baseDelay = config.delay;
    
    switch (config.backoff) {
      case 'exponential':
        return baseDelay * Math.pow(2, attempt - 1);
      case 'linear':
        return baseDelay * attempt;
      default:
        return baseDelay;
    }
  }

  private async readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private getClientIP(req: IncomingMessage): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           (req.headers['x-real-ip'] as string) ||
           req.socket.remoteAddress ||
           'unknown';
  }

  private sendResponse(res: ServerResponse, status: number, data: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
  }

  private sendError(res: ServerResponse, status: number, message: string, details?: string): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: message,
      details,
      timestamp: new Date().toISOString()
    }));
  }

  private handleError(error: any, res: ServerResponse): void {
    console.error('Gateway error:', error);
    this.emit('error', error);
    
    if (!res.headersSent) {
      this.sendError(res, 500, 'Internal Server Error');
    }
  }

  private startMetricsCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      
      // Cleanup expired rate limit buckets
      for (const [key, bucket] of this.rateLimitBuckets) {
        if (bucket.resetTime <= now) {
          this.rateLimitBuckets.delete(key);
        }
      }
      
      // Cleanup expired cache entries
      for (const [key, entry] of this.cache) {
        if (entry.expires <= now) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }

  getMetrics(): any {
    return {
      routes: this.routes.size,
      rateLimitBuckets: this.rateLimitBuckets.size,
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([id, breaker]) => ({
        id,
        ...breaker
      })),
      cacheEntries: this.cache.size,
      isRunning: this.isRunning,
      port: this.port
    };
  }
}