import { EventEmitter } from 'events';
import { createLogger } from '../../shared/src/logging.js';
import ServiceMesh, { ServiceRegistration, RequestContext } from './service-mesh.js';

export interface APIRoute {
  id: string;
  path: string;
  method: string;
  serviceName: string;
  serviceVersion?: string;
  timeout: number;
  retries: number;
  rateLimit?: {
    requestsPerSecond: number;
    burstSize: number;
  };
  authentication?: AuthConfig;
  authorization?: AuthzConfig;
  transformation?: TransformationConfig;
  caching?: CacheConfig;
  middleware: string[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AuthConfig {
  required: boolean;
  schemes: ('bearer' | 'basic' | 'apikey' | 'oauth2')[];
  providers: string[];
  scopes?: string[];
}

export interface AuthzConfig {
  enabled: boolean;
  policies: string[];
  resources: string[];
  actions: string[];
}

export interface TransformationConfig {
  request?: {
    headers?: Record<string, string>;
    body?: any;
    parameters?: Record<string, any>;
  };
  response?: {
    headers?: Record<string, string>;
    body?: any;
    statusCode?: number;
  };
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  key: string;
  conditions: string[];
  varyBy: string[];
}

export interface APIRequest {
  id: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  body?: any;
  timestamp: number;
  clientId?: string;
  userId?: string;
  metadata: Record<string, any>;
}

export interface APIResponse {
  statusCode: number;
  headers: Record<string, string>;
  body?: any;
  metadata: {
    requestId: string;
    duration: number;
    cacheHit: boolean;
    serviceRoute?: string;
    transformations: string[];
  };
}

export interface GatewayMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatency: number;
  requestsPerSecond: number;
  cacheHitRate: number;
  authenticationFailures: number;
  authorizationFailures: number;
  rateLimitHits: number;
  routeMetrics: Record<string, RouteMetrics>;
}

export interface RouteMetrics {
  requests: number;
  successes: number;
  failures: number;
  averageLatency: number;
  lastUsed: number;
}

export interface Middleware {
  name: string;
  priority: number;
  execute(request: APIRequest, response: APIResponse, next: () => Promise<void>): Promise<void>;
}

export class APIGateway extends EventEmitter {
  private logger = createLogger('APIGateway');
  private serviceMesh: ServiceMesh;
  private routes = new Map<string, APIRoute>();
  private middleware = new Map<string, Middleware>();
  private metrics: GatewayMetrics;
  private cache = new Map<string, { data: any; expires: number }>();
  private rateLimiters = new Map<string, RateLimiter>();

  constructor(serviceMesh: ServiceMesh) {
    super();
    this.serviceMesh = serviceMesh;
    
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      requestsPerSecond: 0,
      cacheHitRate: 0,
      authenticationFailures: 0,
      authorizationFailures: 0,
      rateLimitHits: 0,
      routeMetrics: {}
    };

    this.setupDefaultMiddleware();
    this.logger.info('API Gateway initialized');
  }

  private setupDefaultMiddleware(): void {
    // Request logging middleware
    this.registerMiddleware({
      name: 'logging',
      priority: 1,
      execute: async (request, response, next) => {
        this.logger.info(`${request.method} ${request.path}`, {
          requestId: request.id,
          clientId: request.clientId
        });
        await next();
      }
    });

    // Request validation middleware
    this.registerMiddleware({
      name: 'validation',
      priority: 2,
      execute: async (request, response, next) => {
        // Basic validation logic
        if (!request.path || !request.method) {
          response.statusCode = 400;
          response.body = { error: 'Invalid request format' };
          return;
        }
        await next();
      }
    });

    // Authentication middleware
    this.registerMiddleware({
      name: 'authentication',
      priority: 3,
      execute: async (request, response, next) => {
        const route = this.findRoute(request.method, request.path);
        if (route?.authentication?.required) {
          const isAuthenticated = await this.authenticateRequest(request, route.authentication);
          if (!isAuthenticated) {
            this.metrics.authenticationFailures++;
            response.statusCode = 401;
            response.body = { error: 'Authentication required' };
            return;
          }
        }
        await next();
      }
    });

    // Authorization middleware
    this.registerMiddleware({
      name: 'authorization',
      priority: 4,
      execute: async (request, response, next) => {
        const route = this.findRoute(request.method, request.path);
        if (route?.authorization?.enabled) {
          const isAuthorized = await this.authorizeRequest(request, route.authorization);
          if (!isAuthorized) {
            this.metrics.authorizationFailures++;
            response.statusCode = 403;
            response.body = { error: 'Access denied' };
            return;
          }
        }
        await next();
      }
    });

    // Rate limiting middleware
    this.registerMiddleware({
      name: 'rateLimit',
      priority: 5,
      execute: async (request, response, next) => {
        const route = this.findRoute(request.method, request.path);
        if (route?.rateLimit) {
          const rateLimiter = this.getRateLimiter(route.id, route.rateLimit);
          if (!rateLimiter.allowRequest(request.clientId || 'anonymous')) {
            this.metrics.rateLimitHits++;
            response.statusCode = 429;
            response.body = { error: 'Rate limit exceeded' };
            return;
          }
        }
        await next();
      }
    });

    // Caching middleware
    this.registerMiddleware({
      name: 'caching',
      priority: 6,
      execute: async (request, response, next) => {
        const route = this.findRoute(request.method, request.path);
        if (route?.caching?.enabled && request.method === 'GET') {
          const cacheKey = this.generateCacheKey(request, route.caching);
          const cached = this.cache.get(cacheKey);
          
          if (cached && cached.expires > Date.now()) {
            response.body = cached.data;
            response.metadata.cacheHit = true;
            this.updateCacheMetrics(true);
            return;
          }
          this.updateCacheMetrics(false);
        }
        await next();
      }
    });
  }

  registerRoute(
    path: string,
    method: string,
    serviceName: string,
    options: {
      serviceVersion?: string;
      timeout?: number;
      retries?: number;
      rateLimit?: APIRoute['rateLimit'];
      authentication?: AuthConfig;
      authorization?: AuthzConfig;
      transformation?: TransformationConfig;
      caching?: CacheConfig;
      middleware?: string[];
      tags?: string[];
    } = {}
  ): string {
    const routeId = `route_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const route: APIRoute = {
      id: routeId,
      path: this.normalizePath(path),
      method: method.toUpperCase(),
      serviceName,
      serviceVersion: options.serviceVersion,
      timeout: options.timeout || 30000,
      retries: options.retries || 3,
      rateLimit: options.rateLimit,
      authentication: options.authentication,
      authorization: options.authorization,
      transformation: options.transformation,
      caching: options.caching,
      middleware: options.middleware || ['logging', 'validation', 'authentication', 'authorization', 'rateLimit', 'caching'],
      tags: options.tags || [],
      createdAt: now,
      updatedAt: now
    };

    this.routes.set(routeId, route);
    this.metrics.routeMetrics[routeId] = {
      requests: 0,
      successes: 0,
      failures: 0,
      averageLatency: 0,
      lastUsed: 0
    };

    this.logger.info(`Registered route: ${method} ${path} -> ${serviceName}`, { routeId });
    this.emit('routeRegistered', route);
    
    return routeId;
  }

  registerMiddleware(middleware: Middleware): void {
    this.middleware.set(middleware.name, middleware);
    this.logger.info(`Registered middleware: ${middleware.name}`, { priority: middleware.priority });
  }

  async handleRequest(request: APIRequest): Promise<APIResponse> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    const response: APIResponse = {
      statusCode: 200,
      headers: {},
      metadata: {
        requestId: request.id,
        duration: 0,
        cacheHit: false,
        transformations: []
      }
    };

    try {
      // Find matching route
      const route = this.findRoute(request.method, request.path);
      if (!route) {
        response.statusCode = 404;
        response.body = { error: 'Route not found' };
        return response;
      }

      response.metadata.serviceRoute = `${route.serviceName}:${route.serviceVersion || 'latest'}`;

      // Execute middleware chain
      await this.executeMiddlewareChain(request, response, route);

      // If middleware didn't handle the request, route to service
      if (response.statusCode === 200 && !response.body) {
        await this.routeToService(request, response, route);
      }

      // Update route metrics
      this.updateRouteMetrics(route.id, true, Date.now() - startTime);
      this.metrics.successfulRequests++;

    } catch (error) {
      this.logger.error(`Request handling failed: ${request.id}`, error);
      
      response.statusCode = 500;
      response.body = { error: 'Internal server error' };
      
      const route = this.findRoute(request.method, request.path);
      if (route) {
        this.updateRouteMetrics(route.id, false, Date.now() - startTime);
      }
      this.metrics.failedRequests++;
    }

    response.metadata.duration = Date.now() - startTime;
    this.updateGlobalMetrics(Date.now() - startTime);

    return response;
  }

  private findRoute(method: string, path: string): APIRoute | null {
    const normalizedPath = this.normalizePath(path);
    
    for (const route of this.routes.values()) {
      if (route.method === method.toUpperCase() && this.matchPath(route.path, normalizedPath)) {
        return route;
      }
    }
    
    return null;
  }

  private matchPath(routePath: string, requestPath: string): boolean {
    // Simple path matching - in production would support parameters
    if (routePath === requestPath) {
      return true;
    }
    
    // Support wildcard matching
    const routeSegments = routePath.split('/');
    const requestSegments = requestPath.split('/');
    
    if (routeSegments.length !== requestSegments.length) {
      return false;
    }
    
    for (let i = 0; i < routeSegments.length; i++) {
      const routeSegment = routeSegments[i];
      const requestSegment = requestSegments[i];
      
      if (routeSegment.startsWith(':') || routeSegment === '*') {
        continue; // Parameter or wildcard match
      }
      
      if (routeSegment !== requestSegment) {
        return false;
      }
    }
    
    return true;
  }

  private normalizePath(path: string): string {
    return path.startsWith('/') ? path : `/${path}`;
  }

  private async executeMiddlewareChain(request: APIRequest, response: APIResponse, route: APIRoute): Promise<void> {
    const middlewareNames = route.middleware;
    const middlewareChain = middlewareNames
      .map(name => this.middleware.get(name))
      .filter(mw => mw !== undefined)
      .sort((a, b) => a!.priority - b!.priority);

    let currentIndex = 0;

    const next = async (): Promise<void> => {
      if (currentIndex < middlewareChain.length) {
        const middleware = middlewareChain[currentIndex++];
        await middleware!.execute(request, response, next);
      }
    };

    await next();
  }

  private async routeToService(request: APIRequest, response: APIResponse, route: APIRoute): Promise<void> {
    // Apply request transformation
    if (route.transformation?.request) {
      this.applyRequestTransformation(request, route.transformation.request);
      response.metadata.transformations.push('request');
    }

    // Create service request context
    const serviceRequest: Omit<RequestContext, 'id' | 'timestamp'> = {
      service: route.serviceName,
      endpoint: request.path,
      method: request.method,
      headers: request.headers,
      timeout: route.timeout,
      retries: route.retries,
      attempt: 1,
      metadata: {
        routeId: route.id,
        originalRequest: request
      }
    };

    // Execute service request
    const serviceResponse = await this.serviceMesh.executeRequest(route.serviceName, serviceRequest);
    
    // Set response data
    response.body = serviceResponse;

    // Apply response transformation
    if (route.transformation?.response) {
      this.applyResponseTransformation(response, route.transformation.response);
      response.metadata.transformations.push('response');
    }

    // Cache response if configured
    if (route.caching?.enabled && request.method === 'GET') {
      const cacheKey = this.generateCacheKey(request, route.caching);
      this.cache.set(cacheKey, {
        data: response.body,
        expires: Date.now() + route.caching.ttl
      });
    }
  }

  private applyRequestTransformation(request: APIRequest, transformation: NonNullable<TransformationConfig['request']>): void {
    if (transformation.headers) {
      Object.assign(request.headers, transformation.headers);
    }
    
    if (transformation.body) {
      request.body = { ...request.body, ...transformation.body };
    }
    
    if (transformation.parameters) {
      request.metadata.transformedParameters = transformation.parameters;
    }
  }

  private applyResponseTransformation(response: APIResponse, transformation: NonNullable<TransformationConfig['response']>): void {
    if (transformation.headers) {
      Object.assign(response.headers, transformation.headers);
    }
    
    if (transformation.body) {
      response.body = { ...response.body, ...transformation.body };
    }
    
    if (transformation.statusCode) {
      response.statusCode = transformation.statusCode;
    }
  }

  private async authenticateRequest(request: APIRequest, authConfig: AuthConfig): Promise<boolean> {
    // Simplified authentication - in production would integrate with identity providers
    const authHeader = request.headers.authorization || request.headers.Authorization;
    
    if (!authHeader) {
      return false;
    }
    
    // Basic bearer token validation
    if (authConfig.schemes.includes('bearer') && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      return this.validateBearerToken(token);
    }
    
    // API key validation
    if (authConfig.schemes.includes('apikey')) {
      const apiKey = request.headers['x-api-key'] || request.query.apikey;
      return this.validateApiKey(apiKey);
    }
    
    return false;
  }

  private async validateBearerToken(token: string): Promise<boolean> {
    // Simplified token validation
    return token.length > 10; // Placeholder validation
  }

  private async validateApiKey(apiKey: string): Promise<boolean> {
    // Simplified API key validation
    return apiKey && apiKey.startsWith('ak_');
  }

  private async authorizeRequest(request: APIRequest, authzConfig: AuthzConfig): Promise<boolean> {
    // Simplified authorization - in production would integrate with policy engines
    const userRole = request.headers['x-user-role'] || 'user';
    
    // Simple role-based authorization
    if (authzConfig.policies.includes('admin') && userRole !== 'admin') {
      return false;
    }
    
    return true;
  }

  private getRateLimiter(routeId: string, config: NonNullable<APIRoute['rateLimit']>): RateLimiter {
    let rateLimiter = this.rateLimiters.get(routeId);
    if (!rateLimiter) {
      rateLimiter = new RateLimiter(config.requestsPerSecond, config.burstSize);
      this.rateLimiters.set(routeId, rateLimiter);
    }
    return rateLimiter;
  }

  private generateCacheKey(request: APIRequest, cacheConfig: CacheConfig): string {
    let key = cacheConfig.key || `${request.method}:${request.path}`;
    
    // Include vary-by parameters
    for (const varyBy of cacheConfig.varyBy || []) {
      if (varyBy === 'query') {
        key += `:${JSON.stringify(request.query)}`;
      } else if (varyBy === 'headers') {
        key += `:${JSON.stringify(request.headers)}`;
      } else if (request.headers[varyBy]) {
        key += `:${request.headers[varyBy]}`;
      }
    }
    
    return key;
  }

  private updateRouteMetrics(routeId: string, success: boolean, latency: number): void {
    const metrics = this.metrics.routeMetrics[routeId];
    if (metrics) {
      metrics.requests++;
      metrics.lastUsed = Date.now();
      metrics.averageLatency = (metrics.averageLatency + latency) / 2;
      
      if (success) {
        metrics.successes++;
      } else {
        metrics.failures++;
      }
    }
  }

  private updateGlobalMetrics(latency: number): void {
    this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;
    this.metrics.requestsPerSecond = this.metrics.totalRequests / (Date.now() / 1000);
  }

  private updateCacheMetrics(hit: boolean): void {
    const totalCacheRequests = Object.values(this.metrics.routeMetrics)
      .reduce((sum, metrics) => sum + metrics.requests, 0);
    
    if (totalCacheRequests > 0) {
      this.metrics.cacheHitRate = hit ? 
        (this.metrics.cacheHitRate + 1) / 2 : 
        this.metrics.cacheHitRate * 0.99;
    }
  }

  // Public API methods

  getRoutes(): APIRoute[] {
    return Array.from(this.routes.values());
  }

  getRoute(routeId: string): APIRoute | null {
    return this.routes.get(routeId) || null;
  }

  updateRoute(routeId: string, updates: Partial<APIRoute>): boolean {
    const route = this.routes.get(routeId);
    if (route) {
      Object.assign(route, updates, { updatedAt: Date.now() });
      this.emit('routeUpdated', route);
      return true;
    }
    return false;
  }

  deleteRoute(routeId: string): boolean {
    const route = this.routes.get(routeId);
    if (route) {
      this.routes.delete(routeId);
      delete this.metrics.routeMetrics[routeId];
      this.rateLimiters.delete(routeId);
      this.emit('routeDeleted', route);
      return true;
    }
    return false;
  }

  getMetrics(): GatewayMetrics {
    return { ...this.metrics };
  }

  clearCache(): void {
    this.cache.clear();
    this.logger.info('API Gateway cache cleared');
  }

  getMiddleware(): Middleware[] {
    return Array.from(this.middleware.values());
  }
}

class RateLimiter {
  private tokens = new Map<string, { count: number; resetTime: number }>();
  private requestsPerSecond: number;
  private burstSize: number;

  constructor(requestsPerSecond: number, burstSize: number) {
    this.requestsPerSecond = requestsPerSecond;
    this.burstSize = burstSize;
  }

  allowRequest(clientId: string): boolean {
    const now = Date.now();
    const windowSize = 1000; // 1 second window
    
    let clientTokens = this.tokens.get(clientId);
    if (!clientTokens || now >= clientTokens.resetTime) {
      clientTokens = { count: 0, resetTime: now + windowSize };
      this.tokens.set(clientId, clientTokens);
    }

    if (clientTokens.count < Math.min(this.burstSize, this.requestsPerSecond)) {
      clientTokens.count++;
      return true;
    }

    return false;
  }
}

export default APIGateway;