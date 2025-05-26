import { getLogger } from './logger.js';

const logger = getLogger('ErrorHandler');

export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  TIMEOUT = 'TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  REDIS_ERROR = 'REDIS_ERROR',
  ETCD_ERROR = 'ETCD_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ErrorContext {
  service?: string;
  operation?: string;
  requestId?: string;
  userId?: string;
  sessionId?: string;
  correlationId?: string;
  metadata?: Record<string, any>;
  stackTrace?: string;
  timestamp?: Date;
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  severity: ErrorSeverity;
  retryable: boolean;
  context: ErrorContext;
  cause?: Error;
  suggestions?: string[];
}

export class MCPError extends Error {
  public readonly code: ErrorCode;
  public readonly severity: ErrorSeverity;
  public readonly retryable: boolean;
  public readonly context: ErrorContext;
  public readonly cause?: Error;
  public readonly suggestions: string[];
  public readonly timestamp: Date;

  constructor(details: ErrorDetails) {
    super(details.message);
    this.name = 'MCPError';
    this.code = details.code;
    this.severity = details.severity;
    this.retryable = details.retryable;
    this.context = { ...details.context, timestamp: new Date() };
    this.cause = details.cause;
    this.suggestions = details.suggestions || [];
    this.timestamp = new Date();

    Error.captureStackTrace(this, MCPError);
  }

  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      retryable: this.retryable,
      context: this.context,
      suggestions: this.suggestions,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  toString(): string {
    return `${this.name}: [${this.code}] ${this.message}`;
  }

  static from(error: unknown, context: Partial<ErrorContext> = {}): MCPError {
    if (error instanceof MCPError) {
      return new MCPError({
        code: error.code,
        message: error.message,
        severity: error.severity,
        retryable: error.retryable,
        context: { ...error.context, ...context },
        cause: error.cause,
        suggestions: error.suggestions,
      });
    }

    if (error instanceof Error) {
      return new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { ...context, stackTrace: error.stack },
        cause: error,
      });
    }

    return new MCPError({
      code: ErrorCode.INTERNAL_ERROR,
      message: String(error),
      severity: ErrorSeverity.MEDIUM,
      retryable: false,
      context,
    });
  }
}

export interface ErrorHandlerOptions {
  enableStackTrace: boolean;
  enableSuggestions: boolean;
  logErrors: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  includeContext: boolean;
  sanitizeErrors: boolean;
}

export interface ErrorMetrics {
  totalErrors: number;
  errorsByCode: Map<ErrorCode, number>;
  errorsBySeverity: Map<ErrorSeverity, number>;
  errorsByService: Map<string, number>;
  lastErrorTime: Date | null;
  errorRate: number;
}

export class ErrorHandler {
  private options: ErrorHandlerOptions;
  private metrics: ErrorMetrics;
  private onErrorCallbacks: Array<(error: MCPError) => void | Promise<void>> = [];
  private errorHistory: MCPError[] = [];
  private readonly maxHistorySize = 1000;

  constructor(options: Partial<ErrorHandlerOptions> = {}) {
    this.options = {
      enableStackTrace: true,
      enableSuggestions: true,
      logErrors: true,
      logLevel: 'error',
      includeContext: true,
      sanitizeErrors: true,
      ...options,
    };

    this.metrics = {
      totalErrors: 0,
      errorsByCode: new Map(),
      errorsBySeverity: new Map(),
      errorsByService: new Map(),
      lastErrorTime: null,
      errorRate: 0,
    };

    this.setupProcessErrorHandlers();
  }

  private setupProcessErrorHandlers(): void {
    process.on('uncaughtException', (error) => {
      const mcpError = MCPError.from(error, {
        service: 'global',
        operation: 'uncaught_exception',
      });
      this.handleError(mcpError);
    });

    process.on('unhandledRejection', (reason, promise) => {
      const mcpError = MCPError.from(reason, {
        service: 'global',
        operation: 'unhandled_rejection',
        metadata: { promise: promise.toString() },
      });
      this.handleError(mcpError);
    });
  }

  handleError(error: unknown, context: Partial<ErrorContext> = {}): MCPError {
    const mcpError = error instanceof MCPError ? error : MCPError.from(error, context);
    
    this.updateMetrics(mcpError);
    this.addToHistory(mcpError);

    if (this.options.logErrors) {
      this.logError(mcpError);
    }

    this.notifyCallbacks(mcpError);

    return mcpError;
  }

  private updateMetrics(error: MCPError): void {
    this.metrics.totalErrors++;
    this.metrics.lastErrorTime = new Date();

    const codeCount = this.metrics.errorsByCode.get(error.code) || 0;
    this.metrics.errorsByCode.set(error.code, codeCount + 1);

    const severityCount = this.metrics.errorsBySeverity.get(error.severity) || 0;
    this.metrics.errorsBySeverity.set(error.severity, severityCount + 1);

    if (error.context.service) {
      const serviceCount = this.metrics.errorsByService.get(error.context.service) || 0;
      this.metrics.errorsByService.set(error.context.service, serviceCount + 1);
    }

    this.calculateErrorRate();
  }

  private calculateErrorRate(): void {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    
    const recentErrors = this.errorHistory.filter(
      error => error.timestamp.getTime() > oneHourAgo
    );
    
    this.metrics.errorRate = recentErrors.length;
  }

  private addToHistory(error: MCPError): void {
    this.errorHistory.push(error);
    
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  private logError(error: MCPError): void {
    const logData = {
      code: error.code,
      message: error.message,
      severity: error.severity,
      retryable: error.retryable,
      ...(this.options.includeContext && { context: error.context }),
      ...(this.options.enableStackTrace && { stack: error.stack }),
      ...(this.options.enableSuggestions && error.suggestions.length > 0 && { suggestions: error.suggestions }),
    };

    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('Critical error occurred', logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('High severity error occurred', logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('Medium severity error occurred', logData);
        break;
      case ErrorSeverity.LOW:
        logger.info('Low severity error occurred', logData);
        break;
    }
  }

  private async notifyCallbacks(error: MCPError): Promise<void> {
    for (const callback of this.onErrorCallbacks) {
      try {
        await callback(error);
      } catch (callbackError) {
        logger.error('Error in error handler callback', { 
          callbackError, 
          originalError: error.toJSON() 
        });
      }
    }
  }

  onError(callback: (error: MCPError) => void | Promise<void>): void {
    this.onErrorCallbacks.push(callback);
  }

  createError(details: Omit<ErrorDetails, 'context'> & { context?: Partial<ErrorContext> }): MCPError {
    return new MCPError({
      ...details,
      context: details.context || {},
    });
  }

  wrapAsync<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context: Partial<ErrorContext> = {}
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        throw this.handleError(error, context);
      }
    };
  }

  wrapSync<T extends any[], R>(
    fn: (...args: T) => R,
    context: Partial<ErrorContext> = {}
  ): (...args: T) => R {
    return (...args: T): R => {
      try {
        return fn(...args);
      } catch (error) {
        throw this.handleError(error, context);
      }
    };
  }

  isRetryableError(error: unknown): boolean {
    if (error instanceof MCPError) {
      return error.retryable;
    }
    return false;
  }

  isCriticalError(error: unknown): boolean {
    if (error instanceof MCPError) {
      return error.severity === ErrorSeverity.CRITICAL;
    }
    return false;
  }

  getErrorsByCode(code: ErrorCode): MCPError[] {
    return this.errorHistory.filter(error => error.code === code);
  }

  getErrorsBySeverity(severity: ErrorSeverity): MCPError[] {
    return this.errorHistory.filter(error => error.severity === severity);
  }

  getErrorsByService(service: string): MCPError[] {
    return this.errorHistory.filter(error => error.context.service === service);
  }

  getRecentErrors(minutes: number = 60): MCPError[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.errorHistory.filter(error => error.timestamp > cutoff);
  }

  getMetrics(): ErrorMetrics {
    return {
      totalErrors: this.metrics.totalErrors,
      errorsByCode: new Map(this.metrics.errorsByCode),
      errorsBySeverity: new Map(this.metrics.errorsBySeverity),
      errorsByService: new Map(this.metrics.errorsByService),
      lastErrorTime: this.metrics.lastErrorTime,
      errorRate: this.metrics.errorRate,
    };
  }

  clearHistory(): void {
    this.errorHistory = [];
    this.metrics = {
      totalErrors: 0,
      errorsByCode: new Map(),
      errorsBySeverity: new Map(),
      errorsByService: new Map(),
      lastErrorTime: null,
      errorRate: 0,
    };
  }

  sanitizeError(error: MCPError): Partial<MCPError> {
    if (!this.options.sanitizeErrors) {
      return error;
    }

    const sanitized: any = {
      name: error.name,
      message: error.message,
      code: error.code,
      severity: error.severity,
      retryable: error.retryable,
      timestamp: error.timestamp,
    };

    if (this.options.enableSuggestions && error.suggestions.length > 0) {
      sanitized.suggestions = error.suggestions;
    }

    if (this.options.includeContext) {
      sanitized.context = {
        service: error.context.service,
        operation: error.context.operation,
        requestId: error.context.requestId,
      };
    }

    return sanitized;
  }
}

export const globalErrorHandler = new ErrorHandler();

export function createValidationError(
  message: string,
  context: Partial<ErrorContext> = {}
): MCPError {
  return new MCPError({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    severity: ErrorSeverity.LOW,
    retryable: false,
    context,
    suggestions: [
      'Check the request parameters',
      'Ensure all required fields are provided',
      'Validate data types and formats',
    ],
  });
}

export function createNotFoundError(
  resource: string,
  context: Partial<ErrorContext> = {}
): MCPError {
  return new MCPError({
    code: ErrorCode.NOT_FOUND,
    message: `${resource} not found`,
    severity: ErrorSeverity.LOW,
    retryable: false,
    context,
    suggestions: [
      'Verify the resource identifier',
      'Check if the resource exists',
      'Ensure proper permissions',
    ],
  });
}

export function createServiceUnavailableError(
  service: string,
  context: Partial<ErrorContext> = {}
): MCPError {
  return new MCPError({
    code: ErrorCode.SERVICE_UNAVAILABLE,
    message: `Service ${service} is currently unavailable`,
    severity: ErrorSeverity.HIGH,
    retryable: true,
    context: { ...context, service },
    suggestions: [
      'Retry the request after some time',
      'Check service health status',
      'Contact system administrators if the issue persists',
    ],
  });
}

export function createTimeoutError(
  operation: string,
  timeout: number,
  context: Partial<ErrorContext> = {}
): MCPError {
  return new MCPError({
    code: ErrorCode.TIMEOUT,
    message: `Operation '${operation}' timed out after ${timeout}ms`,
    severity: ErrorSeverity.MEDIUM,
    retryable: true,
    context: { ...context, operation, metadata: { timeout } },
    suggestions: [
      'Retry with a longer timeout',
      'Check network connectivity',
      'Optimize the operation if possible',
    ],
  });
}

export function createResourceExhaustedError(
  resource: string,
  context: Partial<ErrorContext> = {}
): MCPError {
  return new MCPError({
    code: ErrorCode.RESOURCE_EXHAUSTED,
    message: `Resource ${resource} is exhausted`,
    severity: ErrorSeverity.HIGH,
    retryable: true,
    context,
    suggestions: [
      'Free up resources before retrying',
      'Implement resource pooling',
      'Scale the system if necessary',
    ],
  });
}