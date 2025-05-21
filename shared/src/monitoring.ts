import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

export interface PerformanceMetrics {
  requests: {
    total: number;
    success: number;
    errors: number;
    averageResponseTime: number;
    requestsPerSecond: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    usage: number;
  };
  uptime: number;
  timestamp: string;
}

export class PerformanceMonitor extends EventEmitter {
  private serviceName: string;
  private metrics: {
    requests: Array<{ timestamp: number; duration: number; success: boolean }>;
    startTime: number;
  };
  private interval?: NodeJS.Timeout;
  private isRunning: boolean = false;

  constructor(serviceName: string) {
    super();
    this.serviceName = serviceName;
    this.metrics = {
      requests: [],
      startTime: Date.now()
    };
  }

  start(intervalMs: number = 60000): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.interval = setInterval(() => {
      this.emit('metrics', this.getMetrics());
    }, intervalMs);
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  recordRequest(duration: number, success: boolean = true): void {
    const now = Date.now();
    this.metrics.requests.push({
      timestamp: now,
      duration,
      success
    });

    // Keep only last 1000 requests
    if (this.metrics.requests.length > 1000) {
      this.metrics.requests = this.metrics.requests.slice(-1000);
    }
  }

  getMetrics(): PerformanceMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentRequests = this.metrics.requests.filter(r => r.timestamp > oneMinuteAgo);

    const totalRequests = this.metrics.requests.length;
    const successRequests = this.metrics.requests.filter(r => r.success).length;
    const errorRequests = totalRequests - successRequests;

    const avgResponseTime = recentRequests.length > 0
      ? recentRequests.reduce((sum, r) => sum + r.duration, 0) / recentRequests.length
      : 0;

    const requestsPerSecond = recentRequests.length / 60;

    const memUsage = process.memoryUsage();
    const memTotal = memUsage.heapTotal;
    const memUsed = memUsage.heapUsed;

    return {
      requests: {
        total: totalRequests,
        success: successRequests,
        errors: errorRequests,
        averageResponseTime: Math.round(avgResponseTime * 100) / 100,
        requestsPerSecond: Math.round(requestsPerSecond * 100) / 100
      },
      memory: {
        used: memUsed,
        total: memTotal,
        percentage: Math.round((memUsed / memTotal) * 100)
      },
      cpu: {
        usage: process.cpuUsage().user / 1000000 // Convert to seconds
      },
      uptime: Math.round((now - this.metrics.startTime) / 1000),
      timestamp: new Date().toISOString()
    };
  }

  middleware() {
    return (req: any, res: any, next: any) => {
      const start = performance.now();

      res.on('finish', () => {
        const duration = performance.now() - start;
        const success = res.statusCode < 400;
        this.recordRequest(duration, success);
      });

      next();
    };
  }
}

// Decorator for monitoring function performance
export function withPerformanceMonitoring(monitor?: PerformanceMonitor) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const start = performance.now();
      let success = true;

      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } catch (error) {
        success = false;
        throw error;
      } finally {
        const duration = performance.now() - start;
        if (monitor) {
          monitor.recordRequest(duration, success);
        }
        if (this.performanceMonitor) {
          this.performanceMonitor.recordRequest(duration, success);
        }
      }
    };

    return descriptor;
  };
}

// Utility function to create a performance monitor
export function createPerformanceMonitor(serviceName: string): PerformanceMonitor {
  return new PerformanceMonitor(serviceName);
}

export default PerformanceMonitor;