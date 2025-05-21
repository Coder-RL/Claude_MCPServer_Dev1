import { EventEmitter } from 'events';
import { getLogger } from '../logger.js';
import { MCPError, ErrorCode, ErrorSeverity, createValidationError, createNotFoundError } from '../error-handler.js';
import { SchemaValidator, ValidationSchema, ValidationResult } from '../validation.js';
import { PerformanceTimer, globalPerformanceMonitor } from '../performance-monitor.js';
import {
  MCPMessage,
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPErrorCode,
  createMCPError,
  isMCPRequest,
  isMCPResponse,
  isMCPNotification,
  ValidationContext,
  ServerCapabilities,
  ClientCapabilities,
} from './types.js';

const logger = getLogger('MCPRouter');

export interface RouteHandler {
  (request: MCPRequest, context: RequestContext): Promise<any>;
}

export interface NotificationHandler {
  (notification: MCPNotification, context: RequestContext): Promise<void>;
}

export interface RequestContext {
  requestId: string | number | null;
  method: string;
  clientCapabilities?: ClientCapabilities;
  serverCapabilities?: ServerCapabilities;
  connectionId?: string;
  metadata?: Record<string, any>;
  startTime: number;
}

export interface RouteDefinition {
  method: string;
  handler: RouteHandler;
  schema?: ValidationSchema;
  description?: string;
  capabilities?: string[];
  rateLimit?: {
    requests: number;
    window: number;
  };
  timeout?: number;
  authentication?: boolean;
}

export interface NotificationDefinition {
  method: string;
  handler: NotificationHandler;
  schema?: ValidationSchema;
  description?: string;
  capabilities?: string[];
}

export interface RouterMetrics {
  totalRequests: number;
  totalNotifications: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  requestsByMethod: Map<string, number>;
  errorsByMethod: Map<string, number>;
  lastActivity: Date | null;
}

export interface RateLimitInfo {
  requests: number;
  window: number;
  resetTime: number;
  remaining: number;
}

export class MCPRouter extends EventEmitter {
  private routes: Map<string, RouteDefinition> = new Map();
  private notifications: Map<string, NotificationDefinition> = new Map();
  private validator: SchemaValidator;
  private metrics: RouterMetrics;
  private rateLimitStore: Map<string, Map<string, RateLimitInfo>> = new Map();
  private serverCapabilities?: ServerCapabilities;
  private clientCapabilities?: ClientCapabilities;

  constructor() {
    super();
    
    this.validator = new SchemaValidator();
    this.metrics = {
      totalRequests: 0,
      totalNotifications: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsByMethod: new Map(),
      errorsByMethod: new Map(),
      lastActivity: null,
    };

    this.setupBuiltinRoutes();
  }

  private setupBuiltinRoutes(): void {
    // Initialize route
    this.addRoute({
      method: 'initialize',
      handler: this.handleInitialize.bind(this),
      schema: {
        protocolVersion: { type: 'string', required: true },
        capabilities: { type: 'object', required: true },
        clientInfo: {
          type: 'object',
          required: true,
          properties: {
            name: { type: 'string', required: true },
            version: { type: 'string', required: true },
          },
        },
      },
      description: 'Initialize the MCP session',
    });

    // Ping route for health checks
    this.addRoute({
      method: 'ping',
      handler: this.handlePing.bind(this),
      description: 'Health check endpoint',
    });

    // Logging notification
    this.addNotification({
      method: 'notifications/message',
      handler: this.handleLoggingNotification.bind(this),
      schema: {
        level: { 
          type: 'string', 
          required: true,
          enum: ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'],
        },
        data: { type: 'object', required: true },
        logger: { type: 'string' },
      },
      description: 'Logging notification from client',
    });

    // Progress notification
    this.addNotification({
      method: 'notifications/progress',
      handler: this.handleProgressNotification.bind(this),
      schema: {
        progressToken: { type: 'string', required: true },
        progress: { type: 'number', required: true },
        total: { type: 'number' },
      },
      description: 'Progress update notification',
    });

    // Cancelled notification
    this.addNotification({
      method: 'notifications/cancelled',
      handler: this.handleCancelledNotification.bind(this),
      schema: {
        reason: { type: 'string', required: true },
      },
      description: 'Operation cancelled notification',
    });
  }

  addRoute(definition: RouteDefinition): void {
    this.routes.set(definition.method, definition);
    logger.debug(`Added route: ${definition.method}`, { 
      description: definition.description,
      hasSchema: !!definition.schema,
      capabilities: definition.capabilities,
    });
  }

  addNotification(definition: NotificationDefinition): void {
    this.notifications.set(definition.method, definition);
    logger.debug(`Added notification handler: ${definition.method}`, {
      description: definition.description,
      hasSchema: !!definition.schema,
      capabilities: definition.capabilities,
    });
  }

  removeRoute(method: string): boolean {
    const removed = this.routes.delete(method);
    if (removed) {
      logger.debug(`Removed route: ${method}`);
    }
    return removed;
  }

  removeNotification(method: string): boolean {
    const removed = this.notifications.delete(method);
    if (removed) {
      logger.debug(`Removed notification handler: ${method}`);
    }
    return removed;
  }

  setServerCapabilities(capabilities: ServerCapabilities): void {
    this.serverCapabilities = capabilities;
  }

  setClientCapabilities(capabilities: ClientCapabilities): void {
    this.clientCapabilities = capabilities;
  }

  async routeMessage(
    message: MCPMessage,
    connectionId?: string,
    metadata?: Record<string, any>
  ): Promise<MCPMessage | void> {
    const timer = globalPerformanceMonitor.startTimer();
    timer.addMetadata('connectionId', connectionId);
    timer.addMetadata('messageType', this.getMessageType(message));

    try {
      this.updateActivity();

      if (isMCPRequest(message)) {
        const response = await this.handleRequest(message, connectionId, metadata);
        globalPerformanceMonitor.recordMetric(`mcp.request.${message.method}`, timer, true);
        return response;
      } else if (isMCPNotification(message)) {
        await this.handleNotification(message, connectionId, metadata);
        globalPerformanceMonitor.recordMetric(`mcp.notification.${message.method}`, timer, true);
        return;
      } else if (isMCPResponse(message)) {
        await this.handleResponse(message, connectionId, metadata);
        globalPerformanceMonitor.recordMetric('mcp.response', timer, true);
        return;
      } else {
        throw createValidationError('Invalid MCP message format', {
          operation: 'routeMessage',
          connectionId,
          message,
        });
      }
    } catch (error) {
      const method = (message as any).method || 'unknown';
      globalPerformanceMonitor.recordMetric(`mcp.request.${method}`, timer, false, error instanceof Error ? error : new Error(String(error)));
      
      if (isMCPRequest(message)) {
        return this.createErrorResponse(message, error);
      }
      
      throw error;
    }
  }

  private async handleRequest(
    request: MCPRequest,
    connectionId?: string,
    metadata?: Record<string, any>
  ): Promise<MCPResponse> {
    this.metrics.totalRequests++;
    this.incrementMethodCounter(this.metrics.requestsByMethod, request.method);

    const context: RequestContext = {
      requestId: request.id,
      method: request.method,
      clientCapabilities: this.clientCapabilities,
      serverCapabilities: this.serverCapabilities,
      connectionId,
      metadata,
      startTime: Date.now(),
    };

    try {
      await this.validateRequest(request, context);
      await this.checkRateLimit(request, connectionId);

      const route = this.routes.get(request.method);
      if (!route) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: `Method not found: ${request.method}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { method: request.method, connectionId },
        });
      }

      await this.checkCapabilities(route, context);

      const result = await this.executeWithTimeout(
        () => route.handler(request, context),
        route.timeout || 30000,
        `Request ${request.method}`
      );

      this.metrics.successfulRequests++;
      this.updateAverageResponseTime(Date.now() - context.startTime);

      this.emit('request', {
        method: request.method,
        success: true,
        duration: Date.now() - context.startTime,
        connectionId,
      });

      return {
        jsonrpc: '2.0',
        id: request.id,
        result,
      };
    } catch (error) {
      this.metrics.failedRequests++;
      this.incrementMethodCounter(this.metrics.errorsByMethod, request.method);

      this.emit('request', {
        method: request.method,
        success: false,
        error,
        duration: Date.now() - context.startTime,
        connectionId,
      });

      throw error;
    }
  }

  private async handleNotification(
    notification: MCPNotification,
    connectionId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    this.metrics.totalNotifications++;

    const context: RequestContext = {
      requestId: null,
      method: notification.method,
      clientCapabilities: this.clientCapabilities,
      serverCapabilities: this.serverCapabilities,
      connectionId,
      metadata,
      startTime: Date.now(),
    };

    const handler = this.notifications.get(notification.method);
    if (!handler) {
      logger.warn(`No handler found for notification: ${notification.method}`, { connectionId });
      return;
    }

    try {
      await this.validateNotification(notification, context);
      await this.checkCapabilities(handler, context);
      await handler.handler(notification, context);

      this.emit('notification', {
        method: notification.method,
        success: true,
        connectionId,
      });
    } catch (error) {
      logger.error(`Error handling notification ${notification.method}`, { error, connectionId });
      
      this.emit('notification', {
        method: notification.method,
        success: false,
        error,
        connectionId,
      });
    }
  }

  private async handleResponse(
    response: MCPResponse,
    connectionId?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    // Handle response (typically for client-side scenarios)
    this.emit('response', {
      id: response.id,
      success: !response.error,
      error: response.error,
      connectionId,
    });
  }

  private async validateRequest(request: MCPRequest, context: RequestContext): Promise<void> {
    const route = this.routes.get(request.method);
    if (!route?.schema) {
      return;
    }

    try {
      const validationResult = await this.validator.validate(request.params || {}, {
        strict: true,
        allowUnknown: false,
      });

      if (!validationResult.valid) {
        throw createValidationError(
          `Invalid parameters for method ${request.method}: ${validationResult.errors.map(e => e.message).join(', ')}`,
          context
        );
      }
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      throw createValidationError(
        `Validation failed for method ${request.method}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context
      );
    }
  }

  private async validateNotification(notification: MCPNotification, context: RequestContext): Promise<void> {
    const handler = this.notifications.get(notification.method);
    if (!handler?.schema) {
      return;
    }

    try {
      const validationResult = await this.validator.validate(notification.params || {}, {
        strict: true,
        allowUnknown: false,
      });

      if (!validationResult.valid) {
        throw createValidationError(
          `Invalid parameters for notification ${notification.method}: ${validationResult.errors.map(e => e.message).join(', ')}`,
          context
        );
      }
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      throw createValidationError(
        `Validation failed for notification ${notification.method}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        context
      );
    }
  }

  private async checkCapabilities(
    definition: RouteDefinition | NotificationDefinition,
    context: RequestContext
  ): Promise<void> {
    if (!definition.capabilities || definition.capabilities.length === 0) {
      return;
    }

    const serverCaps = this.serverCapabilities;
    if (!serverCaps) {
      throw new MCPError({
        code: ErrorCode.SERVER_NOT_INITIALIZED,
        message: 'Server capabilities not set',
        severity: ErrorSeverity.HIGH,
        retryable: false,
        context,
      });
    }

    for (const requiredCap of definition.capabilities) {
      if (!this.hasCapability(serverCaps, requiredCap)) {
        throw new MCPError({
          code: ErrorCode.AUTHORIZATION_FAILED,
          message: `Required capability not available: ${requiredCap}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { ...context, requiredCapability: requiredCap },
        });
      }
    }
  }

  private hasCapability(capabilities: ServerCapabilities, required: string): boolean {
    const parts = required.split('.');
    let current: any = capabilities;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return false;
      }
    }

    return current !== undefined && current !== false;
  }

  private async checkRateLimit(request: MCPRequest, connectionId?: string): Promise<void> {
    const route = this.routes.get(request.method);
    if (!route?.rateLimit || !connectionId) {
      return;
    }

    const key = `${connectionId}:${request.method}`;
    const now = Date.now();
    
    if (!this.rateLimitStore.has(connectionId)) {
      this.rateLimitStore.set(connectionId, new Map());
    }

    const connectionLimits = this.rateLimitStore.get(connectionId)!;
    let limitInfo = connectionLimits.get(request.method);

    if (!limitInfo || now > limitInfo.resetTime) {
      limitInfo = {
        requests: 0,
        window: route.rateLimit.window,
        resetTime: now + route.rateLimit.window,
        remaining: route.rateLimit.requests,
      };
      connectionLimits.set(request.method, limitInfo);
    }

    if (limitInfo.requests >= route.rateLimit.requests) {
      throw new MCPError({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        message: `Rate limit exceeded for method ${request.method}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: {
          method: request.method,
          connectionId,
          limit: route.rateLimit.requests,
          window: route.rateLimit.window,
          resetTime: limitInfo.resetTime,
        },
      });
    }

    limitInfo.requests++;
    limitInfo.remaining--;
  }

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeout: number,
    operationName: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new MCPError({
          code: ErrorCode.TIMEOUT,
          message: `${operationName} timed out after ${timeout}ms`,
          severity: ErrorSeverity.MEDIUM,
          retryable: true,
          context: { operation: operationName, timeout },
        }));
      }, timeout);

      operation()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private createErrorResponse(request: MCPRequest, error: any): MCPResponse {
    let mcpError: MCPError;

    if (error instanceof MCPError) {
      mcpError = error;
    } else {
      mcpError = new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : String(error),
        severity: ErrorSeverity.HIGH,
        retryable: false,
        context: { method: request.method },
        cause: error instanceof Error ? error : undefined,
      });
    }

    const errorCode = this.mapErrorToMCPCode(mcpError);

    return {
      jsonrpc: '2.0',
      id: request.id,
      error: createMCPError(errorCode, mcpError.message, {
        type: mcpError.code,
        severity: mcpError.severity,
        context: mcpError.context,
      }),
    };
  }

  private mapErrorToMCPCode(error: MCPError): MCPErrorCode {
    switch (error.code) {
      case ErrorCode.VALIDATION_ERROR:
        return MCPErrorCode.InvalidParams;
      case ErrorCode.NOT_FOUND:
        return MCPErrorCode.MethodNotFound;
      case ErrorCode.AUTHENTICATION_ERROR:
        return MCPErrorCode.AuthenticationRequired;
      case ErrorCode.AUTHORIZATION_ERROR:
        return MCPErrorCode.AuthorizationFailed;
      case ErrorCode.RATE_LIMIT_EXCEEDED:
        return MCPErrorCode.RateLimitExceeded;
      case ErrorCode.SERVICE_UNAVAILABLE:
        return MCPErrorCode.ServiceUnavailable;
      case ErrorCode.TIMEOUT:
        return MCPErrorCode.RequestFailed;
      case ErrorCode.RESOURCE_EXHAUSTED:
        return MCPErrorCode.ServiceUnavailable;
      default:
        return MCPErrorCode.InternalError;
    }
  }

  private getMessageType(message: MCPMessage): string {
    if (isMCPRequest(message)) return 'request';
    if (isMCPResponse(message)) return 'response';
    if (isMCPNotification(message)) return 'notification';
    return 'unknown';
  }

  private updateActivity(): void {
    this.metrics.lastActivity = new Date();
  }

  private incrementMethodCounter(counter: Map<string, number>, method: string): void {
    counter.set(method, (counter.get(method) || 0) + 1);
  }

  private updateAverageResponseTime(duration: number): void {
    const current = this.metrics.averageResponseTime;
    const count = this.metrics.successfulRequests;
    this.metrics.averageResponseTime = (current * (count - 1) + duration) / count;
  }

  // Built-in route handlers
  private async handleInitialize(request: MCPRequest, context: RequestContext): Promise<any> {
    const { protocolVersion, capabilities, clientInfo } = request.params;

    this.setClientCapabilities(capabilities);

    logger.info('Client initialized', {
      protocolVersion,
      clientInfo,
      connectionId: context.connectionId,
    });

    return {
      protocolVersion: '2024-11-05',
      capabilities: this.serverCapabilities || {},
      serverInfo: {
        name: 'Claude MCP Server',
        version: '1.0.0',
      },
    };
  }

  private async handlePing(request: MCPRequest, context: RequestContext): Promise<any> {
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      status: 'healthy',
    };
  }

  private async handleLoggingNotification(notification: MCPNotification, context: RequestContext): Promise<void> {
    const { level, data, logger: loggerName } = notification.params;
    
    logger.log(level, 'Client log message', {
      data,
      logger: loggerName,
      connectionId: context.connectionId,
    });
  }

  private async handleProgressNotification(notification: MCPNotification, context: RequestContext): Promise<void> {
    const { progressToken, progress, total } = notification.params;
    
    logger.debug('Progress update', {
      progressToken,
      progress,
      total,
      percentage: total ? Math.round((progress / total) * 100) : undefined,
      connectionId: context.connectionId,
    });

    this.emit('progress', {
      progressToken,
      progress,
      total,
      connectionId: context.connectionId,
    });
  }

  private async handleCancelledNotification(notification: MCPNotification, context: RequestContext): Promise<void> {
    const { reason } = notification.params;
    
    logger.info('Operation cancelled', {
      reason,
      connectionId: context.connectionId,
    });

    this.emit('cancelled', {
      reason,
      connectionId: context.connectionId,
    });
  }

  // Public API methods
  getRoutes(): string[] {
    return Array.from(this.routes.keys());
  }

  getNotifications(): string[] {
    return Array.from(this.notifications.keys());
  }

  getMetrics(): RouterMetrics {
    return {
      ...this.metrics,
      requestsByMethod: new Map(this.metrics.requestsByMethod),
      errorsByMethod: new Map(this.metrics.errorsByMethod),
    };
  }

  clearMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      totalNotifications: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsByMethod: new Map(),
      errorsByMethod: new Map(),
      lastActivity: null,
    };
  }

  getHealthStatus(): {
    healthy: boolean;
    routes: number;
    notifications: number;
    metrics: RouterMetrics;
  } {
    const metrics = this.getMetrics();
    const errorRate = metrics.totalRequests > 0 ? metrics.failedRequests / metrics.totalRequests : 0;

    return {
      healthy: errorRate < 0.1, // Consider healthy if error rate is less than 10%
      routes: this.routes.size,
      notifications: this.notifications.size,
      metrics,
    };
  }
}