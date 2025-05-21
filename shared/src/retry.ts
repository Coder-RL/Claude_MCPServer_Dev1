import { MCPError } from './errors';

export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryCondition?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

export interface RetryPolicy {
  enabled: boolean;
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffType: 'linear' | 'exponential' | 'fixed';
  retryableErrors: string[];
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  retryCondition: (error: Error) => {
    // Retry on network errors, timeouts, and 5xx HTTP errors
    if (error instanceof MCPError) {
      return error.statusCode >= 500 || 
             error.code === 'NETWORK_ERROR' || 
             error.code === 'TIMEOUT';
    }
    return false;
  }
};

export class RetryableOperation<T> {
  private options: RetryOptions;
  private operation: () => Promise<T>;

  constructor(operation: () => Promise<T>, options: Partial<RetryOptions> = {}) {
    this.operation = operation;
    this.options = { ...DEFAULT_RETRY_OPTIONS, ...options };
  }

  async execute(): Promise<T> {
    let lastError: Error;
    let attempt = 0;

    while (attempt < this.options.maxAttempts) {
      try {
        return await this.operation();
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // Check if we should retry this error
        if (!this.shouldRetry(lastError) || attempt >= this.options.maxAttempts) {
          throw lastError;
        }

        // Calculate delay
        const delay = this.calculateDelay(attempt);

        // Call retry callback if provided
        if (this.options.onRetry) {
          this.options.onRetry(lastError, attempt);
        }

        // Wait before retrying
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private shouldRetry(error: Error): boolean {
    if (this.options.retryCondition) {
      return this.options.retryCondition(error);
    }
    return DEFAULT_RETRY_OPTIONS.retryCondition!(error);
  }

  private calculateDelay(attempt: number): number {
    const delay = this.options.initialDelay * Math.pow(this.options.backoffFactor, attempt - 1);
    return Math.min(delay, this.options.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Utility function to retry an operation
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const retryableOp = new RetryableOperation(operation, options);
  return retryableOp.execute();
}

// Decorator for retrying method calls
export function withRetryDecorator(options: Partial<RetryOptions> = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

// Circuit breaker implementation
export class CircuitBreaker<T> {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private successCount: number = 0;

  constructor(
    private operation: () => Promise<T>,
    private options: {
      failureThreshold: number;
      timeout: number;
      monitoringPeriod: number;
    } = {
      failureThreshold: 5,
      timeout: 60000,
      monitoringPeriod: 10000
    }
  ) {}

  async execute(): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.options.timeout) {
        throw new MCPError('Circuit breaker is OPEN', 'CIRCUIT_BREAKER_OPEN', 503);
      } else {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
      }
    }

    try {
      const result = await this.operation();
      
      if (this.state === 'HALF_OPEN') {
        this.successCount++;
        if (this.successCount >= 3) {
          this.state = 'CLOSED';
          this.failures = 0;
        }
      } else {
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.options.failureThreshold) {
        this.state = 'OPEN';
      }
      
      throw error;
    }
  }

  getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN' {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successCount = 0;
  }
}

// Utility function to create a circuit breaker
export function createCircuitBreaker<T>(
  operation: () => Promise<T>,
  options?: { failureThreshold: number; timeout: number; monitoringPeriod: number }
): CircuitBreaker<T> {
  return new CircuitBreaker(operation, options);
}

export default withRetry;