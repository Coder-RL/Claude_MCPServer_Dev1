import { getLogger } from './logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from './error-handler.js';

const logger = getLogger('RetryCircuitBreaker');

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterEnabled: boolean;
  retryCondition?: (error: any) => boolean;
  onRetry?: (error: any, attempt: number) => void | Promise<void>;
  abortSignal?: AbortSignal;
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringWindow: number;
  halfOpenMaxCalls: number;
  onStateChange?: (state: CircuitBreakerState) => void;
  onFailure?: (error: any) => void;
  shouldTrackError?: (error: any) => boolean;
}

export enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface RetryStatistics {
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  averageAttempts: number;
  lastAttemptTime: Date | null;
}

export interface CircuitBreakerStatistics {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  halfOpenCallCount: number;
  lastFailureTime: Date | null;
  lastStateChangeTime: Date;
  totalRequests: number;
  failureRate: number;
}

export class RetryMechanism {
  private defaultOptions: RetryOptions;
  private statistics: RetryStatistics;

  constructor(defaultOptions: Partial<RetryOptions> = {}) {
    this.defaultOptions = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitterEnabled: true,
      ...defaultOptions,
    };

    this.statistics = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      averageAttempts: 0,
      lastAttemptTime: null,
    };
  }

  async execute<T>(
    operation: () => Promise<T>,
    options: Partial<RetryOptions> = {}
  ): Promise<T> {
    const config = { ...this.defaultOptions, ...options };
    let lastError: any;
    let attempt = 0;

    while (attempt < config.maxAttempts) {
      attempt++;
      this.statistics.totalAttempts++;
      this.statistics.lastAttemptTime = new Date();

      try {
        if (config.abortSignal?.aborted) {
          throw new MCPError({
            code: ErrorCode.TIMEOUT,
            message: 'Operation was aborted',
            severity: ErrorSeverity.MEDIUM,
            retryable: false,
            context: { operation: 'retry_execute', attempt },
          });
        }

        const result = await operation();
        
        this.statistics.totalSuccesses++;
        this.updateAverageAttempts();
        
        if (attempt > 1) {
          logger.info(`Operation succeeded after ${attempt} attempts`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        const shouldRetry = attempt < config.maxAttempts && 
          (config.retryCondition ? config.retryCondition(error) : this.isRetryableError(error));

        if (!shouldRetry) {
          break;
        }

        if (config.onRetry) {
          try {
            await config.onRetry(error, attempt);
          } catch (callbackError) {
            logger.error('Error in retry callback', { callbackError, originalError: error });
          }
        }

        const delay = this.calculateDelay(attempt, config);
        
        logger.warn(`Operation failed, retrying in ${delay}ms`, {
          attempt,
          maxAttempts: config.maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        });

        await this.delay(delay, config.abortSignal);
      }
    }

    this.statistics.totalFailures++;
    this.updateAverageAttempts();

    if (lastError instanceof MCPError) {
      throw lastError;
    }

    throw new MCPError({
      code: ErrorCode.INTERNAL_ERROR,
      message: `Operation failed after ${attempt} attempts`,
      severity: ErrorSeverity.HIGH,
      retryable: false,
      context: { 
        operation: 'retry_execute', 
        totalAttempts: attempt,
        lastError: lastError instanceof Error ? lastError.message : String(lastError),
      },
      cause: lastError instanceof Error ? lastError : undefined,
    });
  }

  private calculateDelay(attempt: number, options: RetryOptions): number {
    const exponentialDelay = Math.min(
      options.baseDelay * Math.pow(options.backoffMultiplier, attempt - 1),
      options.maxDelay
    );

    if (!options.jitterEnabled) {
      return exponentialDelay;
    }

    const jitter = exponentialDelay * 0.1 * Math.random();
    return Math.floor(exponentialDelay + jitter);
  }

  private async delay(ms: number, abortSignal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);
      
      const abortHandler = () => {
        clearTimeout(timeoutId);
        reject(new MCPError({
          code: ErrorCode.TIMEOUT,
          message: 'Retry delay was aborted',
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'delay' },
        }));
      };

      if (abortSignal) {
        if (abortSignal.aborted) {
          clearTimeout(timeoutId);
          abortHandler();
          return;
        }
        abortSignal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }

  private isRetryableError(error: any): boolean {
    if (error instanceof MCPError) {
      return error.retryable;
    }

    if (error?.code === 'ECONNREFUSED' || 
        error?.code === 'ENOTFOUND' || 
        error?.code === 'TIMEOUT' ||
        error?.status >= 500) {
      return true;
    }

    return false;
  }

  private updateAverageAttempts(): void {
    const totalOperations = this.statistics.totalSuccesses + this.statistics.totalFailures;
    if (totalOperations > 0) {
      this.statistics.averageAttempts = this.statistics.totalAttempts / totalOperations;
    }
  }

  getStatistics(): RetryStatistics {
    return { ...this.statistics };
  }

  resetStatistics(): void {
    this.statistics = {
      totalAttempts: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      averageAttempts: 0,
      lastAttemptTime: null,
    };
  }

  wrap<T extends any[], R>(
    operation: (...args: T) => Promise<R>,
    options: Partial<RetryOptions> = {}
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      return this.execute(() => operation(...args), options);
    };
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private halfOpenCallCount = 0;
  private lastFailureTime: Date | null = null;
  private lastStateChangeTime = new Date();
  private totalRequests = 0;
  private options: Required<CircuitBreakerOptions>;
  private recoveryTimer: NodeJS.Timeout | null = null;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      monitoringWindow: 60000,
      halfOpenMaxCalls: 3,
      ...options,
    } as Required<CircuitBreakerOptions>;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === CircuitBreakerState.OPEN) {
      throw new MCPError({
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Circuit breaker is open - service is temporarily unavailable',
        severity: ErrorSeverity.HIGH,
        retryable: true,
        context: { 
          operation: 'circuit_breaker', 
          state: this.state,
          failureCount: this.failureCount,
        },
      });
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenCallCount >= this.options.halfOpenMaxCalls) {
        throw new MCPError({
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: 'Circuit breaker is half-open - maximum test calls exceeded',
          severity: ErrorSeverity.MEDIUM,
          retryable: true,
          context: { 
            operation: 'circuit_breaker', 
            state: this.state,
            halfOpenCallCount: this.halfOpenCallCount,
          },
        });
      }
      this.halfOpenCallCount++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  private onSuccess(): void {
    this.successCount++;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenCallCount >= this.options.halfOpenMaxCalls) {
        this.transitionTo(CircuitBreakerState.CLOSED);
        this.resetCounts();
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      this.failureCount = 0;
    }
  }

  private onFailure(error: any): void {
    if (this.options.shouldTrackError && !this.options.shouldTrackError(error)) {
      return;
    }

    this.lastFailureTime = new Date();
    
    if (this.options.onFailure) {
      try {
        this.options.onFailure(error);
      } catch (callbackError) {
        logger.error('Error in circuit breaker failure callback', { callbackError, originalError: error });
      }
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionTo(CircuitBreakerState.OPEN);
      this.scheduleRecovery();
    } else if (this.state === CircuitBreakerState.CLOSED) {
      this.failureCount++;
      
      if (this.failureCount >= this.options.failureThreshold) {
        this.transitionTo(CircuitBreakerState.OPEN);
        this.scheduleRecovery();
      }
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChangeTime = new Date();

    logger.info(`Circuit breaker state changed`, {
      from: oldState,
      to: newState,
      failureCount: this.failureCount,
      successCount: this.successCount,
    });

    if (this.options.onStateChange) {
      try {
        this.options.onStateChange(newState);
      } catch (error) {
        logger.error('Error in circuit breaker state change callback', { error });
      }
    }
  }

  private scheduleRecovery(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    this.recoveryTimer = setTimeout(() => {
      if (this.state === CircuitBreakerState.OPEN) {
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
        this.halfOpenCallCount = 0;
      }
    }, this.options.recoveryTimeout);
  }

  private resetCounts(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCallCount = 0;
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getStatistics(): CircuitBreakerStatistics {
    const now = Date.now();
    const windowStart = now - this.options.monitoringWindow;
    
    const recentFailures = this.lastFailureTime && this.lastFailureTime.getTime() > windowStart ? 
      this.failureCount : 0;
    
    const failureRate = this.totalRequests > 0 ? recentFailures / this.totalRequests : 0;

    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      halfOpenCallCount: this.halfOpenCallCount,
      lastFailureTime: this.lastFailureTime,
      lastStateChangeTime: this.lastStateChangeTime,
      totalRequests: this.totalRequests,
      failureRate,
    };
  }

  isCallPermitted(): boolean {
    if (this.state === CircuitBreakerState.CLOSED) {
      return true;
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      return this.halfOpenCallCount < this.options.halfOpenMaxCalls;
    }

    return false;
  }

  reset(): void {
    this.transitionTo(CircuitBreakerState.CLOSED);
    this.resetCounts();
    this.totalRequests = 0;
    this.lastFailureTime = null;
    
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  forceOpen(): void {
    this.transitionTo(CircuitBreakerState.OPEN);
    this.scheduleRecovery();
  }

  forceClose(): void {
    this.transitionTo(CircuitBreakerState.CLOSED);
    this.resetCounts();
    
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  wrap<T extends any[], R>(
    operation: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      return this.execute(() => operation(...args));
    };
  }

  destroy(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }
}

export class RetryableCircuitBreaker {
  private retry: RetryMechanism;
  private circuitBreaker: CircuitBreaker;

  constructor(
    retryOptions: Partial<RetryOptions> = {},
    circuitBreakerOptions: Partial<CircuitBreakerOptions> = {}
  ) {
    this.retry = new RetryMechanism(retryOptions);
    this.circuitBreaker = new CircuitBreaker(circuitBreakerOptions);
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    return this.retry.execute(async () => {
      return this.circuitBreaker.execute(operation);
    });
  }

  wrap<T extends any[], R>(
    operation: (...args: T) => Promise<R>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      return this.execute(() => operation(...args));
    };
  }

  getRetryStatistics(): RetryStatistics {
    return this.retry.getStatistics();
  }

  getCircuitBreakerStatistics(): CircuitBreakerStatistics {
    return this.circuitBreaker.getStatistics();
  }

  getCircuitBreakerState(): CircuitBreakerState {
    return this.circuitBreaker.getState();
  }

  reset(): void {
    this.retry.resetStatistics();
    this.circuitBreaker.reset();
  }

  destroy(): void {
    this.circuitBreaker.destroy();
  }
}

export function createRetryMechanism(options: Partial<RetryOptions> = {}): RetryMechanism {
  return new RetryMechanism(options);
}

export function createCircuitBreaker(options: Partial<CircuitBreakerOptions> = {}): CircuitBreaker {
  return new CircuitBreaker(options);
}

export function createRetryableCircuitBreaker(
  retryOptions: Partial<RetryOptions> = {},
  circuitBreakerOptions: Partial<CircuitBreakerOptions> = {}
): RetryableCircuitBreaker {
  return new RetryableCircuitBreaker(retryOptions, circuitBreakerOptions);
}

export function withRetry<T extends any[], R>(
  operation: (...args: T) => Promise<R>,
  options: Partial<RetryOptions> = {}
): (...args: T) => Promise<R> {
  const retryMechanism = new RetryMechanism(options);
  return retryMechanism.wrap(operation);
}

export function withCircuitBreaker<T extends any[], R>(
  operation: (...args: T) => Promise<R>,
  options: Partial<CircuitBreakerOptions> = {}
): (...args: T) => Promise<R> {
  const circuitBreaker = new CircuitBreaker(options);
  return circuitBreaker.wrap(operation);
}

export function withRetryAndCircuitBreaker<T extends any[], R>(
  operation: (...args: T) => Promise<R>,
  retryOptions: Partial<RetryOptions> = {},
  circuitBreakerOptions: Partial<CircuitBreakerOptions> = {}
): (...args: T) => Promise<R> {
  const retryableCircuitBreaker = new RetryableCircuitBreaker(retryOptions, circuitBreakerOptions);
  return retryableCircuitBreaker.wrap(operation);
}