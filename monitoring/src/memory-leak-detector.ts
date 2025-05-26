import { EventEmitter } from 'events';
import { createLogger } from '../../shared/src/logging.js';
import * as v8 from 'v8';
import * as fs from 'fs';
import * as path from 'path';

export interface MemorySnapshot {
  timestamp: Date;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  external: number;
  arrayBuffers: number;
  detached?: number;
}

export interface LeakReport {
  detected: boolean;
  confidence: number;
  growth: {
    rate: number; // bytes per second
    total: number; // total growth in bytes
  };
  snapshots: MemorySnapshot[];
  recommendations: string[];
  suspiciousPatterns: string[];
}

export interface LeakDetectorConfig {
  intervalMs: number;
  windowSize: number;
  growthThreshold: number; // MB
  growthRateThreshold: number; // MB per minute
  heapSnapshotInterval?: number; // Take heap snapshot every N intervals
  outputDir?: string;
}

export class MemoryLeakDetector extends EventEmitter {
  private logger = createLogger('MemoryLeakDetector');
  private config: LeakDetectorConfig;
  private snapshots: MemorySnapshot[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring = false;
  private snapshotCounter = 0;
  private baselineMemory: MemorySnapshot | null = null;

  constructor(config: Partial<LeakDetectorConfig> = {}) {
    super();
    
    this.config = {
      intervalMs: 10000, // 10 seconds
      windowSize: 30, // Keep last 30 snapshots
      growthThreshold: 50, // 50 MB growth considered suspicious
      growthRateThreshold: 10, // 10 MB per minute
      heapSnapshotInterval: 60, // Every 10 minutes
      outputDir: './memory-snapshots',
      ...config
    };

    // Create output directory if specified
    if (this.config.outputDir) {
      this.ensureOutputDirectory();
    }
  }

  private ensureOutputDirectory(): void {
    if (this.config.outputDir && !fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  startMonitoring(): void {
    if (this.isMonitoring) {
      this.logger.warn('Memory monitoring already started');
      return;
    }

    this.isMonitoring = true;
    this.snapshots = [];
    this.snapshotCounter = 0;

    // Take baseline snapshot
    this.baselineMemory = this.takeSnapshot();
    
    this.logger.info('Starting memory leak detection', {
      interval: `${this.config.intervalMs}ms`,
      windowSize: this.config.windowSize,
      growthThreshold: `${this.config.growthThreshold}MB`
    });

    this.monitoringInterval = setInterval(() => {
      this.performMonitoringCycle();
    }, this.config.intervalMs);

    // Also monitor on garbage collection if available
    this.setupGCMonitoring();
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.logger.info('Stopped memory leak detection');
    this.emit('monitoringStopped');
  }

  private performMonitoringCycle(): void {
    const snapshot = this.takeSnapshot();
    this.snapshots.push(snapshot);
    
    // Keep only the configured window size
    if (this.snapshots.length > this.config.windowSize) {
      this.snapshots.shift();
    }

    // Analyze for leaks
    const report = this.analyzeForLeaks();
    
    if (report.detected) {
      this.logger.warn('Potential memory leak detected!', {
        confidence: `${(report.confidence * 100).toFixed(1)}%`,
        growthRate: `${report.growth.rate.toFixed(2)} bytes/sec`,
        totalGrowth: this.formatBytes(report.growth.total)
      });
      
      this.emit('leakDetected', report);
    }

    // Take heap snapshot if configured
    this.snapshotCounter++;
    if (this.config.heapSnapshotInterval && 
        this.snapshotCounter % this.config.heapSnapshotInterval === 0) {
      this.takeHeapSnapshot();
    }

    // Emit current memory stats
    this.emit('memoryStats', {
      current: snapshot,
      trend: this.calculateTrend(),
      report
    });
  }

  private takeSnapshot(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    
    return {
      timestamp: new Date(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      rss: memUsage.rss,
      external: memUsage.external,
      arrayBuffers: memUsage.arrayBuffers || 0
    };
  }

  private analyzeForLeaks(): LeakReport {
    if (this.snapshots.length < 3) {
      return {
        detected: false,
        confidence: 0,
        growth: { rate: 0, total: 0 },
        snapshots: this.snapshots,
        recommendations: [],
        suspiciousPatterns: []
      };
    }

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    const timeSpan = (last.timestamp.getTime() - first.timestamp.getTime()) / 1000; // seconds

    // Calculate growth
    const heapGrowth = last.heapUsed - first.heapUsed;
    const rssGrowth = last.rss - first.rss;
    const growthRate = heapGrowth / timeSpan;

    // Check for consistent growth pattern
    const isConsistentGrowth = this.checkConsistentGrowth();
    
    // Calculate confidence based on multiple factors
    let confidence = 0;
    const recommendations: string[] = [];
    const suspiciousPatterns: string[] = [];

    // Factor 1: Total growth
    const growthMB = heapGrowth / (1024 * 1024);
    if (growthMB > this.config.growthThreshold) {
      confidence += 0.3;
      suspiciousPatterns.push(`Heap grew by ${growthMB.toFixed(2)}MB`);
    }

    // Factor 2: Growth rate
    const growthRateMBPerMin = (growthRate * 60) / (1024 * 1024);
    if (growthRateMBPerMin > this.config.growthRateThreshold) {
      confidence += 0.3;
      suspiciousPatterns.push(`Growth rate: ${growthRateMBPerMin.toFixed(2)}MB/min`);
    }

    // Factor 3: Consistent growth
    if (isConsistentGrowth) {
      confidence += 0.3;
      suspiciousPatterns.push('Consistent upward memory trend');
    }

    // Factor 4: External memory growth
    const externalGrowth = last.external - first.external;
    if (externalGrowth > 10 * 1024 * 1024) { // 10MB
      confidence += 0.1;
      suspiciousPatterns.push(`External memory grew by ${this.formatBytes(externalGrowth)}`);
    }

    // Generate recommendations
    if (confidence > 0.5) {
      recommendations.push('Review recently added event listeners for proper cleanup');
      recommendations.push('Check for accumulating data structures (Maps, Sets, Arrays)');
      recommendations.push('Verify database connections are properly closed');
      recommendations.push('Look for recursive function calls without proper termination');
      
      if (externalGrowth > 0) {
        recommendations.push('Check for Buffer allocations that are not being released');
      }
    }

    return {
      detected: confidence > 0.6,
      confidence,
      growth: {
        rate: growthRate,
        total: heapGrowth
      },
      snapshots: this.snapshots.slice(-10), // Last 10 snapshots
      recommendations,
      suspiciousPatterns
    };
  }

  private checkConsistentGrowth(): boolean {
    if (this.snapshots.length < 5) return false;

    // Check if memory is consistently growing
    let increasingCount = 0;
    for (let i = 1; i < this.snapshots.length; i++) {
      if (this.snapshots[i].heapUsed > this.snapshots[i - 1].heapUsed) {
        increasingCount++;
      }
    }

    // If more than 80% of measurements show increase, it's consistent growth
    return increasingCount / (this.snapshots.length - 1) > 0.8;
  }

  private calculateTrend(): 'stable' | 'growing' | 'shrinking' {
    if (this.snapshots.length < 3) return 'stable';

    const recent = this.snapshots.slice(-5);
    const first = recent[0];
    const last = recent[recent.length - 1];
    
    const change = last.heapUsed - first.heapUsed;
    const changePercent = (change / first.heapUsed) * 100;

    if (changePercent > 5) return 'growing';
    if (changePercent < -5) return 'shrinking';
    return 'stable';
  }

  private takeHeapSnapshot(): void {
    if (!this.config.outputDir) return;

    try {
      const filename = `heap-${Date.now()}.heapsnapshot`;
      const filepath = path.join(this.config.outputDir, filename);
      
      const stream = fs.createWriteStream(filepath);
      
      this.logger.info(`Taking heap snapshot: ${filename}`);
      
      v8.writeHeapSnapshot(stream);
      
      stream.on('finish', () => {
        this.logger.info(`Heap snapshot saved: ${filepath}`);
        this.emit('heapSnapshotTaken', { filepath });
      });
      
      stream.on('error', (error) => {
        this.logger.error('Failed to write heap snapshot', { error });
      });
      
    } catch (error) {
      this.logger.error('Failed to take heap snapshot', { error });
    }
  }

  private setupGCMonitoring(): void {
    // Force expose gc if not already exposed
    if (!global.gc) {
      this.logger.warn('GC not exposed. Run with --expose-gc flag for better monitoring');
      return;
    }

    // Monitor after GC events
    if ((global as any).performance && (global as any).performance.measureUserAgentSpecificMemory) {
      this.logger.info('Advanced GC monitoring available');
    }
  }

  getReport(): LeakReport {
    return this.analyzeForLeaks();
  }

  getCurrentStats(): {
    current: MemorySnapshot | null;
    baseline: MemorySnapshot | null;
    growth: number;
    duration: number;
  } {
    const current = this.snapshots[this.snapshots.length - 1] || null;
    
    if (!current || !this.baselineMemory) {
      return {
        current,
        baseline: this.baselineMemory,
        growth: 0,
        duration: 0
      };
    }

    return {
      current,
      baseline: this.baselineMemory,
      growth: current.heapUsed - this.baselineMemory.heapUsed,
      duration: current.timestamp.getTime() - this.baselineMemory.timestamp.getTime()
    };
  }

  forceGarbageCollection(): void {
    if (!global.gc) {
      this.logger.warn('Cannot force GC. Run with --expose-gc flag');
      return;
    }

    this.logger.info('Forcing garbage collection');
    const before = process.memoryUsage();
    global.gc();
    const after = process.memoryUsage();
    
    const freed = before.heapUsed - after.heapUsed;
    this.logger.info(`GC freed ${this.formatBytes(freed)}`);
    
    this.emit('gcForced', { before, after, freed });
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

// Export singleton instance for easy use
export const memoryLeakDetector = new MemoryLeakDetector();
export default memoryLeakDetector;