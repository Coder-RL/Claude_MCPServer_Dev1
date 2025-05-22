import { EventEmitter } from 'events';
import { ObservabilityPlatform } from './observability-platform.js';

export interface APMConfig {
  serviceName: string;
  version: string;
  environment: string;
  sampling: {
    rate: number;
    maxTracesPerSecond: number;
  };
  instrumentation: {
    http: boolean;
    database: boolean;
    redis: boolean;
    elasticsearch: boolean;
    mongodb: boolean;
    kafka: boolean;
    customSpans: boolean;
  };
  performance: {
    captureHeaders: boolean;
    captureBody: boolean;
    captureStackTrace: boolean;
    slowQueryThreshold: number;
  };
  errorTracking: {
    enabled: boolean;
    captureUnhandledRejections: boolean;
    captureUncaughtExceptions: boolean;
    ignorePatterns: string[];
  };
}

export interface SpanContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
  baggage: Record<string, string>;
}

export interface TransactionContext {
  id: string;
  name: string;
  type: string;
  result: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  sampled: boolean;
  spans: SpanInfo[];
  labels: Record<string, string>;
  custom: Record<string, any>;
}

export interface SpanInfo {
  id: string;
  name: string;
  type: string;
  subtype?: string;
  action?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  stackTrace?: string[];
  labels: Record<string, string>;
  context: SpanContextInfo;
}

export interface SpanContextInfo {
  http?: HttpContext;
  db?: DatabaseContext;
  service?: ServiceContext;
  user?: UserContext;
  custom?: Record<string, any>;
}

export interface HttpContext {
  method: string;
  url: string;
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
  responseTime: number;
}

export interface DatabaseContext {
  type: string;
  statement: string;
  instance?: string;
  user?: string;
  affectedRows?: number;
  queryTime: number;
}

export interface ServiceContext {
  name: string;
  version: string;
  environment: string;
  node?: {
    name: string;
    version: string;
  };
  runtime?: {
    name: string;
    version: string;
  };
}

export interface UserContext {
  id?: string;
  email?: string;
  username?: string;
  ip?: string;
  userAgent?: string;
}

export interface ErrorInfo {
  id: string;
  message: string;
  type: string;
  stack?: string;
  code?: string;
  handled: boolean;
  timestamp: Date;
  transaction?: TransactionContext;
  context: ErrorContextInfo;
}

export interface ErrorContextInfo {
  request?: HttpContext;
  user?: UserContext;
  custom?: Record<string, any>;
  tags?: Record<string, string>;
}

export class APMAgent extends EventEmitter {
  private observability: ObservabilityPlatform;
  private activeTransactions = new Map<string, TransactionContext>();
  private activeSpans = new Map<string, SpanInfo>();
  private samplingDecisions = new Map<string, boolean>();
  private errorCount = 0;
  private transactionCount = 0;
  private spanCount = 0;

  constructor(
    private config: APMConfig,
    observability: ObservabilityPlatform
  ) {
    super();
    this.observability = observability;
    this.setupErrorHandling();
    this.setupInstrumentation();
    this.startMetricsCollection();
  }

  // Transaction Management
  startTransaction(name: string, type: string = 'request'): string {
    const transactionId = this.generateId();
    const sampled = this.shouldSample();

    const transaction: TransactionContext = {
      id: transactionId,
      name,
      type,
      result: 'unknown',
      startTime: new Date(),
      sampled,
      spans: [],
      labels: {},
      custom: {}
    };

    this.activeTransactions.set(transactionId, transaction);
    this.transactionCount++;

    if (sampled) {
      this.observability.startTrace(name, this.config.serviceName, type);
    }

    this.emit('transactionStarted', { transaction });
    return transactionId;
  }

  endTransaction(
    transactionId: string,
    result: string = 'success',
    statusCode?: number
  ): void {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) return;

    transaction.endTime = new Date();
    transaction.duration = transaction.endTime.getTime() - transaction.startTime.getTime();
    transaction.result = result;

    // Record metrics
    this.recordTransactionMetrics(transaction, statusCode);

    if (transaction.sampled) {
      this.observability.finishTrace(
        transactionId,
        result === 'success' ? 'ok' : 'error'
      );
    }

    this.activeTransactions.delete(transactionId);
    this.emit('transactionEnded', { transaction });
  }

  setTransactionName(transactionId: string, name: string): void {
    const transaction = this.activeTransactions.get(transactionId);
    if (transaction) {
      transaction.name = name;
    }
  }

  setTransactionLabel(transactionId: string, key: string, value: string): void {
    const transaction = this.activeTransactions.get(transactionId);
    if (transaction) {
      transaction.labels[key] = value;
    }
  }

  setTransactionCustom(transactionId: string, key: string, value: any): void {
    const transaction = this.activeTransactions.get(transactionId);
    if (transaction) {
      transaction.custom[key] = value;
    }
  }

  getCurrentTransaction(): TransactionContext | undefined {
    // Return the most recent active transaction
    const transactions = Array.from(this.activeTransactions.values());
    return transactions[transactions.length - 1];
  }

  // Span Management
  startSpan(
    name: string,
    type: string,
    subtype?: string,
    action?: string,
    transactionId?: string
  ): string {
    const spanId = this.generateId();
    const transaction = transactionId 
      ? this.activeTransactions.get(transactionId)
      : this.getCurrentTransaction();

    if (!transaction) {
      throw new Error('No active transaction found');
    }

    const span: SpanInfo = {
      id: spanId,
      name,
      type,
      subtype,
      action,
      startTime: new Date(),
      labels: {},
      context: {}
    };

    this.activeSpans.set(spanId, span);
    transaction.spans.push(span);
    this.spanCount++;

    if (transaction.sampled) {
      this.observability.startSpan(transaction.id, name);
    }

    this.emit('spanStarted', { span, transaction });
    return spanId;
  }

  endSpan(spanId: string, outcome: 'success' | 'failure' = 'success'): void {
    const span = this.activeSpans.get(spanId);
    if (!span) return;

    span.endTime = new Date();
    span.duration = span.endTime.getTime() - span.startTime.getTime();

    // Capture stack trace for slow spans
    if (span.duration && span.duration > this.config.performance.slowQueryThreshold) {
      if (this.config.performance.captureStackTrace) {
        span.stackTrace = this.captureStackTrace();
      }
    }

    // Record span metrics
    this.recordSpanMetrics(span);

    this.activeSpans.delete(spanId);
    this.emit('spanEnded', { span, outcome });
  }

  setSpanLabel(spanId: string, key: string, value: string): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.labels[key] = value;
    }
  }

  setSpanContext(spanId: string, context: Partial<SpanContextInfo>): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.context = { ...span.context, ...context };
    }
  }

  // HTTP Instrumentation
  instrumentHTTPRequest(
    method: string,
    url: string,
    headers?: Record<string, string>
  ): string {
    const spanId = this.startSpan(`${method} ${url}`, 'external', 'http', method);
    
    const httpContext: HttpContext = {
      method,
      url,
      headers: this.config.performance.captureHeaders ? headers : undefined,
      responseTime: 0
    };

    this.setSpanContext(spanId, { http: httpContext });
    return spanId;
  }

  instrumentHTTPResponse(
    spanId: string,
    statusCode: number,
    responseHeaders?: Record<string, string>,
    responseBody?: string
  ): void {
    const span = this.activeSpans.get(spanId);
    if (!span || !span.context.http) return;

    span.context.http.statusCode = statusCode;
    span.context.http.responseTime = Date.now() - span.startTime.getTime();

    if (this.config.performance.captureHeaders && responseHeaders) {
      span.context.http.headers = { ...span.context.http.headers, ...responseHeaders };
    }

    if (this.config.performance.captureBody && responseBody) {
      span.context.http.body = responseBody;
    }

    this.endSpan(spanId, statusCode >= 400 ? 'failure' : 'success');
  }

  // Database Instrumentation
  instrumentDatabaseQuery(
    type: string,
    statement: string,
    instance?: string
  ): string {
    const spanId = this.startSpan(`${type} query`, 'db', type, 'query');
    
    const dbContext: DatabaseContext = {
      type,
      statement,
      instance,
      queryTime: 0
    };

    this.setSpanContext(spanId, { db: dbContext });
    return spanId;
  }

  instrumentDatabaseResult(
    spanId: string,
    affectedRows?: number,
    error?: Error
  ): void {
    const span = this.activeSpans.get(spanId);
    if (!span || !span.context.db) return;

    span.context.db.queryTime = Date.now() - span.startTime.getTime();
    span.context.db.affectedRows = affectedRows;

    if (error) {
      this.captureError(error, { span });
      this.endSpan(spanId, 'failure');
    } else {
      this.endSpan(spanId, 'success');
    }
  }

  // Error Tracking
  captureError(
    error: Error,
    context?: {
      transaction?: TransactionContext;
      span?: SpanInfo;
      user?: UserContext;
      custom?: Record<string, any>;
      tags?: Record<string, string>;
    }
  ): string {
    // Check if error should be ignored
    if (this.shouldIgnoreError(error)) {
      return '';
    }

    const errorId = this.generateId();
    const errorInfo: ErrorInfo = {
      id: errorId,
      message: error.message,
      type: error.constructor.name,
      stack: error.stack,
      handled: true,
      timestamp: new Date(),
      transaction: context?.transaction,
      context: {
        user: context?.user,
        custom: context?.custom,
        tags: context?.tags
      }
    };

    this.errorCount++;
    
    // Log error
    this.observability.log(
      'error',
      this.config.serviceName,
      error.message,
      {
        errorId,
        errorType: error.constructor.name,
        stack: error.stack,
        ...context?.custom
      },
      context?.transaction?.id,
      context?.span?.id
    );

    // Record error metrics
    this.recordErrorMetrics(errorInfo);

    this.emit('errorCaptured', { error: errorInfo });
    return errorId;
  }

  captureMessage(
    message: string,
    level: 'debug' | 'info' | 'warn' | 'error' = 'info',
    context?: {
      transaction?: TransactionContext;
      user?: UserContext;
      custom?: Record<string, any>;
      tags?: Record<string, string>;
    }
  ): void {
    this.observability.log(
      level,
      this.config.serviceName,
      message,
      {
        ...context?.custom,
        ...context?.tags,
        userId: context?.user?.id,
        userEmail: context?.user?.email
      },
      context?.transaction?.id
    );
  }

  // User Context
  setUserContext(user: UserContext): void {
    // Store user context for current transaction
    const transaction = this.getCurrentTransaction();
    if (transaction) {
      transaction.custom.user = user;
    }
  }

  // Custom Metrics
  recordMetric(name: string, value: number, labels?: Record<string, string>): void {
    this.observability.recordMetric(
      `${this.config.serviceName}.${name}`,
      value,
      { service: this.config.serviceName, ...labels }
    );
  }

  incrementCounter(name: string, labels?: Record<string, string>): void {
    this.observability.incrementCounter(
      `${this.config.serviceName}.${name}`,
      { service: this.config.serviceName, ...labels }
    );
  }

  recordHistogram(name: string, value: number, labels?: Record<string, string>): void {
    this.observability.observeHistogram(
      `${this.config.serviceName}.${name}`,
      value,
      { service: this.config.serviceName, ...labels }
    );
  }

  // Sampling
  private shouldSample(): boolean {
    const random = Math.random();
    return random < this.config.sampling.rate;
  }

  private shouldIgnoreError(error: Error): boolean {
    if (!this.config.errorTracking.enabled) return true;
    
    return this.config.errorTracking.ignorePatterns.some(pattern => 
      new RegExp(pattern).test(error.message)
    );
  }

  // Metrics Recording
  private recordTransactionMetrics(
    transaction: TransactionContext,
    statusCode?: number
  ): void {
    const labels = {
      service: this.config.serviceName,
      transaction_name: transaction.name,
      transaction_type: transaction.type,
      result: transaction.result,
      ...(statusCode && { status_code: statusCode.toString() })
    };

    this.incrementCounter('transactions.total', labels);
    
    if (transaction.duration) {
      this.recordHistogram('transaction.duration', transaction.duration / 1000, labels);
    }

    if (transaction.result === 'error') {
      this.incrementCounter('transactions.errors', labels);
    }
  }

  private recordSpanMetrics(span: SpanInfo): void {
    const labels = {
      service: this.config.serviceName,
      span_name: span.name,
      span_type: span.type,
      ...(span.subtype && { span_subtype: span.subtype }),
      ...(span.action && { span_action: span.action })
    };

    this.incrementCounter('spans.total', labels);
    
    if (span.duration) {
      this.recordHistogram('span.duration', span.duration / 1000, labels);
      
      if (span.duration > this.config.performance.slowQueryThreshold) {
        this.incrementCounter('spans.slow', labels);
      }
    }
  }

  private recordErrorMetrics(error: ErrorInfo): void {
    const labels = {
      service: this.config.serviceName,
      error_type: error.type,
      handled: error.handled.toString()
    };

    this.incrementCounter('errors.total', labels);
  }

  private startMetricsCollection(): void {
    setInterval(() => {
      // Record agent metrics
      this.recordMetric('apm.transactions.active', this.activeTransactions.size);
      this.recordMetric('apm.spans.active', this.activeSpans.size);
      this.recordMetric('apm.transactions.total', this.transactionCount);
      this.recordMetric('apm.spans.total', this.spanCount);
      this.recordMetric('apm.errors.total', this.errorCount);

      // Record memory usage
      const memoryUsage = process.memoryUsage();
      this.recordMetric('process.memory.heap_used', memoryUsage.heapUsed);
      this.recordMetric('process.memory.heap_total', memoryUsage.heapTotal);
      this.recordMetric('process.memory.rss', memoryUsage.rss);
    }, 30000); // Every 30 seconds
  }

  private setupErrorHandling(): void {
    if (this.config.errorTracking.captureUncaughtExceptions) {
      process.on('uncaughtException', (error) => {
        this.captureError(error, { custom: { uncaught: true } });
        process.exit(1);
      });
    }

    if (this.config.errorTracking.captureUnhandledRejections) {
      process.on('unhandledRejection', (reason) => {
        const error = reason instanceof Error ? reason : new Error(String(reason));
        this.captureError(error, { custom: { unhandledRejection: true } });
      });
    }
  }

  private setupInstrumentation(): void {
    // Automatic instrumentation setup would go here
    // This would patch common libraries like http, express, database drivers etc.
    if (this.config.instrumentation.http) {
      this.instrumentHTTPModule();
    }
  }

  private instrumentHTTPModule(): void {
    // HTTP module instrumentation would be implemented here
    // This is a simplified example
    this.emit('instrumentationSetup', { module: 'http' });
  }

  private captureStackTrace(): string[] {
    const stack = new Error().stack;
    if (!stack) return [];
    
    return stack.split('\n').slice(2); // Remove Error and current function
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  // Public API for getting APM statistics
  getStats(): {
    activeTransactions: number;
    activeSpans: number;
    totalTransactions: number;
    totalSpans: number;
    totalErrors: number;
    samplingRate: number;
  } {
    return {
      activeTransactions: this.activeTransactions.size,
      activeSpans: this.activeSpans.size,
      totalTransactions: this.transactionCount,
      totalSpans: this.spanCount,
      totalErrors: this.errorCount,
      samplingRate: this.config.sampling.rate
    };
  }

  // Middleware helpers
  createExpressMiddleware(): (req: any, res: any, next: any) => void {
    return (req: any, res: any, next: any) => {
      const transactionId = this.startTransaction(`${req.method} ${req.route?.path || req.path}`, 'request');
      
      // Add transaction context to request
      req.apmTransaction = transactionId;
      
      // Set user context if available
      if (req.user) {
        this.setUserContext({
          id: req.user.id,
          email: req.user.email,
          username: req.user.username
        });
      }

      // End transaction when response finishes
      res.on('finish', () => {
        this.endTransaction(transactionId, res.statusCode >= 400 ? 'error' : 'success', res.statusCode);
      });

      next();
    };
  }
}