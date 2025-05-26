import { EventEmitter } from 'events';
import { createLogger } from '../../shared/src/logging.js';
import { memoryLeakDetector, LeakReport } from './memory-leak-detector.js';
import { memoryManager } from '../../shared/src/memory-manager.js';

export interface MemoryAlert {
  type: 'warning' | 'critical' | 'emergency';
  message: string;
  timestamp: Date;
  metrics: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
  };
  recommendations: string[];
}

export interface MemoryMonitoringConfig {
  enabled: boolean;
  leakDetection: boolean;
  alertThresholds: {
    warning: number; // percentage
    critical: number;
    emergency: number;
  };
  reportInterval: number; // ms
  autoGC: boolean;
  autoGCThreshold: number; // percentage
}

export class MemoryMonitoring extends EventEmitter {
  private logger = createLogger('MemoryMonitoring');
  private config: MemoryMonitoringConfig;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastAlert: MemoryAlert | null = null;
  private alertCooldown = 60000; // 1 minute between same alerts
  private isShuttingDown = false;

  constructor(config: Partial<MemoryMonitoringConfig> = {}) {
    super();
    
    this.config = {
      enabled: true,
      leakDetection: true,
      alertThresholds: {
        warning: 70,
        critical: 85,
        emergency: 95
      },
      reportInterval: 30000, // 30 seconds
      autoGC: true,
      autoGCThreshold: 90,
      ...config
    };
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info('Memory monitoring disabled');
      return;
    }

    this.logger.info('Starting memory monitoring', {
      leakDetection: this.config.leakDetection,
      reportInterval: `${this.config.reportInterval}ms`,
      thresholds: this.config.alertThresholds
    });

    // Start leak detection if enabled
    if (this.config.leakDetection) {
      this.setupLeakDetection();
    }

    // Start periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.performMonitoring();
    }, this.config.reportInterval);

    // Initial monitoring
    await this.performMonitoring();

    // Setup memory manager listeners
    this.setupMemoryManagerListeners();
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.logger.info('Stopping memory monitoring');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.config.leakDetection) {
      memoryLeakDetector.stopMonitoring();
    }

    this.removeAllListeners();
  }

  private setupLeakDetection(): void {
    memoryLeakDetector.startMonitoring();

    memoryLeakDetector.on('leakDetected', (report: LeakReport) => {
      this.handleLeakDetected(report);
    });

    memoryLeakDetector.on('memoryStats', (stats) => {
      this.emit('memoryStats', stats);
    });
  }

  private setupMemoryManagerListeners(): void {
    memoryManager.on('memoryPressure', (event) => {
      this.logger.warn('Memory pressure event from memory manager', {
        type: event.type,
        usage: this.formatBytes(event.currentUsage),
        available: this.formatBytes(event.availableMemory)
      });
      
      this.emit('memoryPressure', event);
    });

    memoryManager.on('poolOptimized', (result) => {
      this.logger.info('Memory pool optimized', {
        poolId: result.poolId,
        freed: this.formatBytes(result.freed),
        timeSpent: `${result.timeSpent}ms`
      });
    });
  }

  private async performMonitoring(): Promise<void> {
    const memUsage = process.memoryUsage();
    const systemInfo = memoryManager.getSystemMemoryInfo();
    
    // Calculate percentages
    const heapPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    const systemPercentage = parseFloat(systemInfo.utilization);

    // Log current status
    this.logger.debug('Memory status', {
      heap: `${heapPercentage.toFixed(1)}%`,
      system: `${systemPercentage.toFixed(1)}%`,
      heapUsed: this.formatBytes(memUsage.heapUsed),
      heapTotal: this.formatBytes(memUsage.heapTotal),
      rss: this.formatBytes(memUsage.rss),
      external: this.formatBytes(memUsage.external)
    });

    // Check thresholds
    this.checkThresholds(memUsage, heapPercentage, systemPercentage);

    // Auto GC if needed
    if (this.config.autoGC && heapPercentage > this.config.autoGCThreshold) {
      this.performAutoGC();
    }

    // Emit monitoring event
    this.emit('monitoring', {
      timestamp: new Date(),
      memory: memUsage,
      percentages: {
        heap: heapPercentage,
        system: systemPercentage
      },
      pools: memoryManager.getPoolStatistics()
    });
  }

  private checkThresholds(
    memUsage: NodeJS.MemoryUsage,
    heapPercentage: number,
    systemPercentage: number
  ): void {
    let alertType: 'warning' | 'critical' | 'emergency' | null = null;
    const recommendations: string[] = [];

    if (heapPercentage >= this.config.alertThresholds.emergency ||
        systemPercentage >= this.config.alertThresholds.emergency) {
      alertType = 'emergency';
      recommendations.push('Immediate action required - system at capacity');
      recommendations.push('Force garbage collection');
      recommendations.push('Restart service if possible');
      recommendations.push('Scale horizontally if in cluster mode');
    } else if (heapPercentage >= this.config.alertThresholds.critical ||
               systemPercentage >= this.config.alertThresholds.critical) {
      alertType = 'critical';
      recommendations.push('Clear caches and temporary data');
      recommendations.push('Review active connections and close unused');
      recommendations.push('Check for memory leaks');
    } else if (heapPercentage >= this.config.alertThresholds.warning ||
               systemPercentage >= this.config.alertThresholds.warning) {
      alertType = 'warning';
      recommendations.push('Monitor memory usage closely');
      recommendations.push('Consider optimizing memory-intensive operations');
    }

    if (alertType) {
      this.raiseAlert(alertType, memUsage, recommendations);
    }
  }

  private raiseAlert(
    type: 'warning' | 'critical' | 'emergency',
    memUsage: NodeJS.MemoryUsage,
    recommendations: string[]
  ): void {
    const now = new Date();
    
    // Check cooldown
    if (this.lastAlert && 
        this.lastAlert.type === type &&
        now.getTime() - this.lastAlert.timestamp.getTime() < this.alertCooldown) {
      return;
    }

    const alert: MemoryAlert = {
      type,
      message: `Memory ${type.toUpperCase()}: Heap at ${((memUsage.heapUsed / memUsage.heapTotal) * 100).toFixed(1)}%`,
      timestamp: now,
      metrics: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        rss: memUsage.rss,
        external: memUsage.external
      },
      recommendations
    };

    this.lastAlert = alert;
    
    this.logger.error(`Memory alert: ${type}`, {
      ...alert.metrics,
      recommendations
    });
    
    this.emit('alert', alert);
  }

  private handleLeakDetected(report: LeakReport): void {
    this.logger.error('Memory leak detected!', {
      confidence: `${(report.confidence * 100).toFixed(1)}%`,
      growth: this.formatBytes(report.growth.total),
      rate: `${this.formatBytes(report.growth.rate)}/sec`,
      patterns: report.suspiciousPatterns
    });

    const alert: MemoryAlert = {
      type: 'critical',
      message: `Potential memory leak detected with ${(report.confidence * 100).toFixed(1)}% confidence`,
      timestamp: new Date(),
      metrics: process.memoryUsage(),
      recommendations: report.recommendations
    };

    this.emit('alert', alert);
    this.emit('leakDetected', report);
  }

  private performAutoGC(): void {
    if (!global.gc) {
      this.logger.warn('Cannot perform auto GC - not exposed');
      return;
    }

    this.logger.info('Performing automatic garbage collection');
    const before = process.memoryUsage();
    
    try {
      global.gc();
      
      const after = process.memoryUsage();
      const freed = before.heapUsed - after.heapUsed;
      
      this.logger.info('Auto GC completed', {
        freed: this.formatBytes(freed),
        heapBefore: this.formatBytes(before.heapUsed),
        heapAfter: this.formatBytes(after.heapUsed)
      });
      
      this.emit('autoGC', {
        before,
        after,
        freed
      });
    } catch (error) {
      this.logger.error('Auto GC failed', { error });
    }
  }

  getStatus(): {
    enabled: boolean;
    currentMemory: NodeJS.MemoryUsage;
    percentages: { heap: number; system: number };
    lastAlert: MemoryAlert | null;
    leakDetection: {
      enabled: boolean;
      report: LeakReport | null;
    };
  } {
    const memUsage = process.memoryUsage();
    const systemInfo = memoryManager.getSystemMemoryInfo();
    
    return {
      enabled: this.config.enabled,
      currentMemory: memUsage,
      percentages: {
        heap: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        system: parseFloat(systemInfo.utilization)
      },
      lastAlert: this.lastAlert,
      leakDetection: {
        enabled: this.config.leakDetection,
        report: this.config.leakDetection ? memoryLeakDetector.getReport() : null
      }
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2)} ${sizes[i]}`;
  }
}

// Export singleton instance
export const memoryMonitoring = new MemoryMonitoring();
export default memoryMonitoring;