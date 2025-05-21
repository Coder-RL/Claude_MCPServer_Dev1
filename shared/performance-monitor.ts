import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import * as os from 'os';
import { getLogger } from './logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from './error-handler.js';

const logger = getLogger('PerformanceMonitor');

export interface PerformanceMetrics {
  timestamp: Date;
  duration: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  memory: {
    total: number;
    used: number;
    free: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  process: {
    pid: number;
    uptime: number;
    cpuUsage: NodeJS.CpuUsage;
  };
  eventLoop: {
    lag: number;
  };
}

export interface OperationStats {
  operationName: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  errorRate: number;
  requestsPerSecond: number;
  lastCallTime: Date | null;
}

export interface PerformanceAlert {
  type: 'performance' | 'error' | 'system';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  metrics: any;
  timestamp: Date;
}

export interface MonitoringOptions {
  enabled: boolean;
  systemMetricsInterval: number;
  eventLoopLagThreshold: number;
  memoryUsageThreshold: number;
  cpuUsageThreshold: number;
  maxStoredMetrics: number;
  enableAlerts: boolean;
  alertThresholds: {
    errorRate: number;
    averageResponseTime: number;
    systemMemoryUsage: number;
    systemCpuUsage: number;
  };
}

export class PerformanceTimer {
  private startTime: number;
  private endTime?: number;
  private metadata: Record<string, any> = {};

  constructor() {
    this.startTime = performance.now();
  }

  addMetadata(key: string, value: any): void {
    this.metadata[key] = value;
  }

  addMetadataObject(metadata: Record<string, any>): void {
    Object.assign(this.metadata, metadata);
  }

  stop(): number {
    if (this.endTime === undefined) {
      this.endTime = performance.now();
    }
    return this.getDuration();
  }

  getDuration(): number {
    const end = this.endTime || performance.now();
    return end - this.startTime;
  }

  getMetadata(): Record<string, any> {
    return { ...this.metadata };
  }

  isRunning(): boolean {
    return this.endTime === undefined;
  }
}

export class PerformanceMonitor extends EventEmitter {
  private options: MonitoringOptions;
  private operationMetrics: Map<string, PerformanceMetrics[]> = new Map();
  private operationStats: Map<string, OperationStats> = new Map();
  private systemMetricsHistory: SystemMetrics[] = [];
  private systemMetricsInterval: NodeJS.Timeout | null = null;
  private eventLoopMonitor: NodeJS.Timeout | null = null;
  private lastEventLoopCheck = process.hrtime.bigint();
  private isEnabled = true;

  constructor(options: Partial<MonitoringOptions> = {}) {
    super();
    
    this.options = {
      enabled: true,
      systemMetricsInterval: 5000,
      eventLoopLagThreshold: 100,
      memoryUsageThreshold: 0.85,
      cpuUsageThreshold: 0.80,
      maxStoredMetrics: 1000,
      enableAlerts: true,
      alertThresholds: {
        errorRate: 0.05,
        averageResponseTime: 5000,
        systemMemoryUsage: 0.85,
        systemCpuUsage: 0.80,
      },
      ...options,
    };

    if (this.options.enabled) {
      this.startMonitoring();
    }
  }

  startTimer(operationName?: string): PerformanceTimer {
    const timer = new PerformanceTimer();
    
    if (operationName) {
      timer.addMetadata('operationName', operationName);
    }
    
    return timer;
  }

  recordMetric(operationName: string, timer: PerformanceTimer, success = true, error?: Error): void {
    if (!this.isEnabled) return;

    const duration = timer.stop();
    const metric: PerformanceMetrics = {
      timestamp: new Date(),
      duration,
      success,
      error: error?.message,
      metadata: timer.getMetadata(),
    };

    this.storeMetric(operationName, metric);
    this.updateOperationStats(operationName, metric);
    this.checkAlerts(operationName);

    this.emit('metric', { operationName, metric });
  }

  recordOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    metadata: Record<string, any> = {}
  ): Promise<T> {
    const timer = this.startTimer(operationName);
    timer.addMetadataObject(metadata);

    return operation()
      .then((result) => {
        this.recordMetric(operationName, timer, true);
        return result;
      })
      .catch((error) => {
        this.recordMetric(operationName, timer, false, error);
        throw error;
      });
  }

  wrapFunction<T extends any[], R>(
    operationName: string,
    fn: (...args: T) => Promise<R>,
    metadataExtractor?: (...args: T) => Record<string, any>
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      const metadata = metadataExtractor ? metadataExtractor(...args) : {};
      return this.recordOperation(operationName, () => fn(...args), metadata);
    };
  }

  private storeMetric(operationName: string, metric: PerformanceMetrics): void {
    if (!this.operationMetrics.has(operationName)) {
      this.operationMetrics.set(operationName, []);
    }

    const metrics = this.operationMetrics.get(operationName)!;
    metrics.push(metric);

    if (metrics.length > this.options.maxStoredMetrics) {
      metrics.shift();
    }
  }

  private updateOperationStats(operationName: string, metric: PerformanceMetrics): void {
    let stats = this.operationStats.get(operationName);
    
    if (!stats) {
      stats = {
        operationName,
        totalCalls: 0,
        successCount: 0,
        errorCount: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorRate: 0,
        requestsPerSecond: 0,
        lastCallTime: null,
      };
      this.operationStats.set(operationName, stats);
    }

    stats.totalCalls++;
    stats.lastCallTime = metric.timestamp;

    if (metric.success) {
      stats.successCount++;
    } else {
      stats.errorCount++;
    }

    stats.minDuration = Math.min(stats.minDuration, metric.duration);
    stats.maxDuration = Math.max(stats.maxDuration, metric.duration);

    const metrics = this.operationMetrics.get(operationName)!;
    const durations = metrics.map(m => m.duration).sort((a, b) => a - b);
    
    stats.averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    stats.p50Duration = this.calculatePercentile(durations, 0.5);
    stats.p95Duration = this.calculatePercentile(durations, 0.95);
    stats.p99Duration = this.calculatePercentile(durations, 0.99);
    stats.errorRate = stats.errorCount / stats.totalCalls;

    const timeWindow = 60000;
    const recentMetrics = metrics.filter(
      m => Date.now() - m.timestamp.getTime() < timeWindow
    );
    stats.requestsPerSecond = (recentMetrics.length / timeWindow) * 1000;
  }

  private calculatePercentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.floor(sortedValues.length * percentile);
    return sortedValues[Math.min(index, sortedValues.length - 1)];
  }

  private startMonitoring(): void {
    this.startSystemMetricsCollection();
    this.startEventLoopMonitoring();
    
    logger.info('Performance monitoring started', {
      systemMetricsInterval: this.options.systemMetricsInterval,
      alertsEnabled: this.options.enableAlerts,
    });
  }

  private startSystemMetricsCollection(): void {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
    }

    this.systemMetricsInterval = setInterval(() => {
      try {
        const metrics = this.collectSystemMetrics();
        this.systemMetricsHistory.push(metrics);
        
        if (this.systemMetricsHistory.length > this.options.maxStoredMetrics) {
          this.systemMetricsHistory.shift();
        }

        this.checkSystemAlerts(metrics);
        this.emit('systemMetrics', metrics);
      } catch (error) {
        logger.error('Failed to collect system metrics', { error });
      }
    }, this.options.systemMetricsInterval);
  }

  private startEventLoopMonitoring(): void {
    if (this.eventLoopMonitor) {
      clearInterval(this.eventLoopMonitor);
    }

    this.eventLoopMonitor = setInterval(() => {
      const now = process.hrtime.bigint();
      const lag = Number(now - this.lastEventLoopCheck - BigInt(this.options.systemMetricsInterval * 1000000)) / 1000000;
      this.lastEventLoopCheck = now;

      if (lag > this.options.eventLoopLagThreshold) {
        this.emitAlert({
          type: 'performance',
          severity: lag > this.options.eventLoopLagThreshold * 2 ? 'high' : 'medium',
          message: `Event loop lag detected: ${lag.toFixed(2)}ms`,
          metrics: { eventLoopLag: lag },
          timestamp: new Date(),
        });
      }
    }, this.options.systemMetricsInterval);
  }

  private collectSystemMetrics(): SystemMetrics {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    return {
      timestamp: new Date(),
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000,
        loadAverage: loadAvg,
      },
      memory: {
        total: totalMemory,
        used: totalMemory - freeMemory,
        free: freeMemory,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        cpuUsage,
      },
      eventLoop: {
        lag: 0,
      },
    };
  }

  private checkAlerts(operationName: string): void {
    if (!this.options.enableAlerts) return;

    const stats = this.operationStats.get(operationName);
    if (!stats) return;

    if (stats.errorRate > this.options.alertThresholds.errorRate && stats.totalCalls >= 10) {
      this.emitAlert({
        type: 'error',
        severity: stats.errorRate > 0.2 ? 'critical' : 'high',
        message: `High error rate for operation ${operationName}: ${(stats.errorRate * 100).toFixed(1)}%`,
        metrics: { operationName, errorRate: stats.errorRate, totalCalls: stats.totalCalls },
        timestamp: new Date(),
      });
    }

    if (stats.averageDuration > this.options.alertThresholds.averageResponseTime) {
      this.emitAlert({
        type: 'performance',
        severity: stats.averageDuration > this.options.alertThresholds.averageResponseTime * 2 ? 'high' : 'medium',
        message: `Slow response time for operation ${operationName}: ${stats.averageDuration.toFixed(1)}ms`,
        metrics: { operationName, averageDuration: stats.averageDuration },
        timestamp: new Date(),
      });
    }
  }

  private checkSystemAlerts(metrics: SystemMetrics): void {
    if (!this.options.enableAlerts) return;

    const memoryUsageRatio = metrics.memory.used / metrics.memory.total;
    if (memoryUsageRatio > this.options.alertThresholds.systemMemoryUsage) {
      this.emitAlert({
        type: 'system',
        severity: memoryUsageRatio > 0.95 ? 'critical' : 'high',
        message: `High memory usage: ${(memoryUsageRatio * 100).toFixed(1)}%`,
        metrics: { memoryUsage: memoryUsageRatio, totalMemory: metrics.memory.total },
        timestamp: new Date(),
      });
    }

    const avgLoad = metrics.cpu.loadAverage[0];
    const cpuCount = os.cpus().length;
    const cpuUsageRatio = avgLoad / cpuCount;
    
    if (cpuUsageRatio > this.options.alertThresholds.systemCpuUsage) {
      this.emitAlert({
        type: 'system',
        severity: cpuUsageRatio > 1.5 ? 'critical' : 'high',
        message: `High CPU usage: ${(cpuUsageRatio * 100).toFixed(1)}%`,
        metrics: { cpuUsage: cpuUsageRatio, loadAverage: avgLoad, cpuCount },
        timestamp: new Date(),
      });
    }
  }

  private emitAlert(alert: PerformanceAlert): void {
    logger.warn(`Performance alert: ${alert.message}`, {
      type: alert.type,
      severity: alert.severity,
      metrics: alert.metrics,
    });
    
    this.emit('alert', alert);
  }

  getOperationStats(operationName?: string): OperationStats | OperationStats[] {
    if (operationName) {
      const stats = this.operationStats.get(operationName);
      if (!stats) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: `No stats found for operation: ${operationName}`,
          severity: ErrorSeverity.LOW,
          retryable: false,
          context: { operation: 'getOperationStats', operationName },
        });
      }
      return { ...stats };
    }

    return Array.from(this.operationStats.values()).map(stats => ({ ...stats }));
  }

  getSystemMetrics(count = 1): SystemMetrics | SystemMetrics[] {
    if (count === 1) {
      return this.systemMetricsHistory[this.systemMetricsHistory.length - 1] || this.collectSystemMetrics();
    }

    return this.systemMetricsHistory.slice(-count).map(metrics => ({ ...metrics }));
  }

  getOperationMetrics(operationName: string, count?: number): PerformanceMetrics[] {
    const metrics = this.operationMetrics.get(operationName);
    if (!metrics) {
      return [];
    }

    if (count) {
      return metrics.slice(-count).map(metric => ({ ...metric }));
    }

    return metrics.map(metric => ({ ...metric }));
  }

  clearMetrics(operationName?: string): void {
    if (operationName) {
      this.operationMetrics.delete(operationName);
      this.operationStats.delete(operationName);
    } else {
      this.operationMetrics.clear();
      this.operationStats.clear();
      this.systemMetricsHistory = [];
    }
  }

  getHealthStatus(): {
    healthy: boolean;
    issues: string[];
    metrics: {
      operations: number;
      systemMetricsCount: number;
      averageErrorRate: number;
      averageResponseTime: number;
    };
  } {
    const issues: string[] = [];
    const stats = Array.from(this.operationStats.values());
    
    const averageErrorRate = stats.length > 0 ? 
      stats.reduce((sum, s) => sum + s.errorRate, 0) / stats.length : 0;
    
    const averageResponseTime = stats.length > 0 ? 
      stats.reduce((sum, s) => sum + s.averageDuration, 0) / stats.length : 0;

    if (averageErrorRate > this.options.alertThresholds.errorRate) {
      issues.push(`High average error rate: ${(averageErrorRate * 100).toFixed(1)}%`);
    }

    if (averageResponseTime > this.options.alertThresholds.averageResponseTime) {
      issues.push(`High average response time: ${averageResponseTime.toFixed(1)}ms`);
    }

    const currentSystemMetrics = this.systemMetricsHistory[this.systemMetricsHistory.length - 1];
    if (currentSystemMetrics) {
      const memoryUsageRatio = currentSystemMetrics.memory.used / currentSystemMetrics.memory.total;
      if (memoryUsageRatio > this.options.alertThresholds.systemMemoryUsage) {
        issues.push(`High memory usage: ${(memoryUsageRatio * 100).toFixed(1)}%`);
      }
    }

    return {
      healthy: issues.length === 0,
      issues,
      metrics: {
        operations: this.operationStats.size,
        systemMetricsCount: this.systemMetricsHistory.length,
        averageErrorRate,
        averageResponseTime,
      },
    };
  }

  enable(): void {
    this.isEnabled = true;
    if (!this.systemMetricsInterval) {
      this.startMonitoring();
    }
  }

  disable(): void {
    this.isEnabled = false;
  }

  destroy(): void {
    this.disable();
    
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
      this.systemMetricsInterval = null;
    }

    if (this.eventLoopMonitor) {
      clearInterval(this.eventLoopMonitor);
      this.eventLoopMonitor = null;
    }

    this.removeAllListeners();
    this.operationMetrics.clear();
    this.operationStats.clear();
    this.systemMetricsHistory = [];

    logger.info('Performance monitor destroyed');
  }
}

export const globalPerformanceMonitor = new PerformanceMonitor();

export function createPerformanceMonitor(options: Partial<MonitoringOptions> = {}): PerformanceMonitor {
  return new PerformanceMonitor(options);
}

export function measurePerformance<T>(
  operationName: string,
  operation: () => Promise<T>,
  metadata: Record<string, any> = {}
): Promise<T> {
  return globalPerformanceMonitor.recordOperation(operationName, operation, metadata);
}

export function withPerformanceMonitoring<T extends any[], R>(
  operationName: string,
  fn: (...args: T) => Promise<R>,
  metadataExtractor?: (...args: T) => Record<string, any>
): (...args: T) => Promise<R> {
  return globalPerformanceMonitor.wrapFunction(operationName, fn, metadataExtractor);
}