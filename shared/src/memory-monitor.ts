import { EventEmitter } from 'events';
import { createLogger } from './logging.js';
import { memoryManager } from './memory-manager.js';

export interface MemoryMetrics {
  timestamp: number;
  system: {
    total: number;
    used: number;
    free: number;
    available: number;
    utilization: number;
  };
  process: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
    rss: number;
  };
  pools: {
    [poolId: string]: {
      totalSize: number;
      allocatedSize: number;
      freeSize: number;
      utilization: number;
      fragmentationRatio: number;
      allocations: number;
    };
  };
  gc: {
    majorCollections: number;
    minorCollections: number;
    totalTime: number;
    averageTime: number;
    pressure: number;
  };
}

export interface MemoryAlert {
  id: string;
  type: 'warning' | 'critical' | 'emergency';
  category: 'utilization' | 'fragmentation' | 'leak' | 'performance' | 'pool_exhaustion';
  message: string;
  details: any;
  timestamp: number;
  threshold: number;
  currentValue: number;
  recommendations: string[];
  acknowledged: boolean;
  resolvedAt?: number;
}

export interface MemoryThreshold {
  metric: string;
  warning: number;
  critical: number;
  emergency: number;
  hysteresis: number; // Prevent flapping
}

export interface MemoryLeak {
  id: string;
  detectedAt: number;
  source: string;
  growthRate: number; // bytes per second
  totalGrowth: number;
  confidence: number;
  samples: number[];
  timeline: { timestamp: number; size: number }[];
}

export interface PerformanceProfile {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  memorySnapshots: MemoryMetrics[];
  allocations: { timestamp: number; size: number; type: string }[];
  deallocations: { timestamp: number; size: number; type: string }[];
  peaks: { timestamp: number; memory: number; description: string }[];
  analysis: {
    peakMemory: number;
    averageMemory: number;
    memoryEfficiency: number;
    allocationRate: number;
    deallocationRate: number;
    fragmentationTrend: number;
  };
}

export class MemoryMonitor extends EventEmitter {
  private logger = createLogger('MemoryMonitor');
  private metrics: MemoryMetrics[] = [];
  private alerts = new Map<string, MemoryAlert>();
  private thresholds = new Map<string, MemoryThreshold>();
  private leaks = new Map<string, MemoryLeak>();
  private profiles = new Map<string, PerformanceProfile>();
  private activeProfile: string | null = null;
  
  private monitoringInterval: NodeJS.Timeout | null = null;
  private leakDetectionInterval: NodeJS.Timeout | null = null;
  private alertCheckInterval: NodeJS.Timeout | null = null;
  
  private readonly maxMetricsHistory = 1000;
  private readonly metricsRetentionTime = 24 * 60 * 60 * 1000; // 24 hours
  private readonly leakDetectionWindow = 10 * 60 * 1000; // 10 minutes
  private readonly minimumLeakSamples = 10;
  
  private gcStats = {
    majorCollections: 0,
    minorCollections: 0,
    totalTime: 0,
    lastMajorGC: 0,
    lastMinorGC: 0
  };

  constructor() {
    super();
    
    this.initializeDefaultThresholds();
    this.setupGCMonitoring();
    this.startMonitoring();
    
    this.logger.info('Memory Monitor initialized');
  }

  private initializeDefaultThresholds(): void {
    const defaultThresholds: Array<[string, MemoryThreshold]> = [
      ['system.utilization', { metric: 'system.utilization', warning: 0.7, critical: 0.85, emergency: 0.95, hysteresis: 0.02 }],
      ['process.heapUsed', { metric: 'process.heapUsed', warning: 1024 * 1024 * 1024, critical: 2 * 1024 * 1024 * 1024, emergency: 3 * 1024 * 1024 * 1024, hysteresis: 0.05 }],
      ['fragmentation', { metric: 'fragmentation', warning: 0.3, critical: 0.5, emergency: 0.7, hysteresis: 0.05 }],
      ['gc.pressure', { metric: 'gc.pressure', warning: 0.1, critical: 0.2, emergency: 0.3, hysteresis: 0.02 }],
      ['pool.utilization', { metric: 'pool.utilization', warning: 0.8, critical: 0.9, emergency: 0.95, hysteresis: 0.02 }]
    ];

    for (const [key, threshold] of defaultThresholds) {
      this.thresholds.set(key, threshold);
    }
  }

  private setupGCMonitoring(): void {
    // Hook into Node.js garbage collection events if available
    if (process.env.NODE_ENV !== 'production') {
      try {
        const v8 = require('v8');
        const gc = require('gc-stats')();
        
        gc.on('stats', (stats: any) => {
          this.handleGCStats(stats);
        });
      } catch (error) {
        this.logger.debug('GC monitoring not available:', error.message);
      }
    }
  }

  private handleGCStats(stats: any): void {
    const now = Date.now();
    
    if (stats.gctype === 1 || stats.gctype === 2) { // Major GC
      this.gcStats.majorCollections++;
      this.gcStats.lastMajorGC = now;
    } else { // Minor GC
      this.gcStats.minorCollections++;
      this.gcStats.lastMinorGC = now;
    }
    
    this.gcStats.totalTime += stats.pause;
    
    // Calculate GC pressure
    const totalCollections = this.gcStats.majorCollections + this.gcStats.minorCollections;
    const avgTime = totalCollections > 0 ? this.gcStats.totalTime / totalCollections : 0;
    const pressure = Math.min(1, avgTime / 100); // Normalize to 0-1 scale
    
    this.emit('gcStats', {
      type: stats.gctype === 1 || stats.gctype === 2 ? 'major' : 'minor',
      duration: stats.pause,
      before: stats.before,
      after: stats.after,
      pressure
    });
  }

  private startMonitoring(): void {
    // Main metrics collection
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
    }, 5000); // Every 5 seconds

    // Leak detection
    this.leakDetectionInterval = setInterval(() => {
      this.detectMemoryLeaks();
    }, 60000); // Every minute

    // Alert checking
    this.alertCheckInterval = setInterval(() => {
      this.checkAlerts();
    }, 10000); // Every 10 seconds
  }

  private async collectMetrics(): Promise<void> {
    try {
      const now = Date.now();
      const memUsage = process.memoryUsage();
      const systemInfo = memoryManager.getSystemMemoryInfo();
      const poolStats = memoryManager.getPoolStatistics();

      const metrics: MemoryMetrics = {
        timestamp: now,
        system: {
          total: this.parseBytes(systemInfo.total),
          used: this.parseBytes(systemInfo.used),
          free: this.parseBytes(systemInfo.free),
          available: this.parseBytes(systemInfo.free),
          utilization: parseFloat(systemInfo.utilization) / 100
        },
        process: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers,
          rss: memUsage.rss
        },
        pools: {},
        gc: {
          majorCollections: this.gcStats.majorCollections,
          minorCollections: this.gcStats.minorCollections,
          totalTime: this.gcStats.totalTime,
          averageTime: (this.gcStats.majorCollections + this.gcStats.minorCollections) > 0 
            ? this.gcStats.totalTime / (this.gcStats.majorCollections + this.gcStats.minorCollections) 
            : 0,
          pressure: this.calculateGCPressure()
        }
      };

      // Add pool statistics
      if (Array.isArray(poolStats)) {
        for (const pool of poolStats) {
          metrics.pools[pool.id] = {
            totalSize: this.parseBytes(pool.totalSize),
            allocatedSize: this.parseBytes(pool.allocatedSize),
            freeSize: this.parseBytes(pool.freeSize),
            utilization: parseFloat(pool.utilization) / 100,
            fragmentationRatio: parseFloat(pool.fragmentationRatio) / 100,
            allocations: pool.allocations
          };
        }
      }

      // Store metrics
      this.metrics.push(metrics);
      
      // Trim old metrics
      if (this.metrics.length > this.maxMetricsHistory) {
        this.metrics.shift();
      }

      // Update active profile if running
      if (this.activeProfile) {
        const profile = this.profiles.get(this.activeProfile);
        if (profile) {
          profile.memorySnapshots.push(metrics);
        }
      }

      this.emit('metrics', metrics);

    } catch (error) {
      this.logger.error('Failed to collect memory metrics:', error);
    }
  }

  private calculateGCPressure(): number {
    const recentMetrics = this.metrics.slice(-12); // Last minute
    if (recentMetrics.length < 2) return 0;
    
    const gcActivity = recentMetrics.reduce((sum, metric) => {
      return sum + metric.gc.majorCollections + metric.gc.minorCollections;
    }, 0);
    
    return Math.min(1, gcActivity / 60); // Normalize to collections per second
  }

  private async detectMemoryLeaks(): Promise<void> {
    if (this.metrics.length < this.minimumLeakSamples) return;

    const recentMetrics = this.metrics.slice(-this.minimumLeakSamples);
    const timeWindow = recentMetrics[recentMetrics.length - 1].timestamp - recentMetrics[0].timestamp;
    
    if (timeWindow < this.leakDetectionWindow) return;

    // Check for sustained memory growth
    const memoryGrowth = this.analyzeMemoryGrowth(recentMetrics);
    
    for (const [source, growth] of Object.entries(memoryGrowth)) {
      if (growth.rate > 0 && growth.confidence > 0.7) {
        await this.reportMemoryLeak(source, growth);
      }
    }
  }

  private analyzeMemoryGrowth(metrics: MemoryMetrics[]): Record<string, { rate: number; confidence: number; totalGrowth: number }> {
    const sources = {
      'process.heapUsed': metrics.map(m => m.process.heapUsed),
      'process.external': metrics.map(m => m.process.external),
      'system.used': metrics.map(m => m.system.used)
    };

    const results: Record<string, { rate: number; confidence: number; totalGrowth: number }> = {};

    for (const [source, values] of Object.entries(sources)) {
      const growth = this.calculateLinearRegression(values);
      const totalGrowth = values[values.length - 1] - values[0];
      
      results[source] = {
        rate: growth.slope,
        confidence: growth.r2,
        totalGrowth
      };
    }

    return results;
  }

  private calculateLinearRegression(values: number[]): { slope: number; intercept: number; r2: number } {
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((acc, xi, i) => acc + xi * values[i], 0);
    const sumXX = x.reduce((acc, xi) => acc + xi * xi, 0);
    const sumYY = values.reduce((acc, yi) => acc + yi * yi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Calculate R²
    const yMean = sumY / n;
    const totalSumSquares = values.reduce((acc, yi) => acc + Math.pow(yi - yMean, 2), 0);
    const residualSumSquares = values.reduce((acc, yi, i) => {
      const predicted = slope * x[i] + intercept;
      return acc + Math.pow(yi - predicted, 2);
    }, 0);
    
    const r2 = 1 - (residualSumSquares / totalSumSquares);
    
    return { slope, intercept, r2: Math.max(0, r2) };
  }

  private async reportMemoryLeak(source: string, growth: { rate: number; confidence: number; totalGrowth: number }): Promise<void> {
    const leakId = `leak_${source}_${Date.now()}`;
    const now = Date.now();
    
    const leak: MemoryLeak = {
      id: leakId,
      detectedAt: now,
      source,
      growthRate: growth.rate,
      totalGrowth: growth.totalGrowth,
      confidence: growth.confidence,
      samples: this.metrics.slice(-this.minimumLeakSamples).map(m => this.getMetricValue(m, source)),
      timeline: this.metrics.slice(-this.minimumLeakSamples).map(m => ({
        timestamp: m.timestamp,
        size: this.getMetricValue(m, source)
      }))
    };

    this.leaks.set(leakId, leak);

    // Generate alert
    const alert = this.createAlert(
      'critical',
      'leak',
      `Memory leak detected in ${source}`,
      {
        source,
        growthRate: this.formatBytes(growth.rate * 1000) + '/s',
        totalGrowth: this.formatBytes(growth.totalGrowth),
        confidence: `${(growth.confidence * 100).toFixed(1)}%`,
        leakId
      },
      0,
      growth.rate,
      [
        'Investigate recent code changes',
        'Check for unclosed resources',
        'Review event listener cleanup',
        'Monitor garbage collection patterns',
        'Consider heap profiling'
      ]
    );

    this.logger.error(`Memory leak detected: ${source}`, {
      growthRate: this.formatBytes(growth.rate * 1000) + '/s',
      confidence: growth.confidence,
      totalGrowth: this.formatBytes(growth.totalGrowth)
    });

    this.emit('memoryLeak', leak);
  }

  private getMetricValue(metrics: MemoryMetrics, path: string): number {
    const parts = path.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      value = value[part];
      if (value === undefined) return 0;
    }
    
    return typeof value === 'number' ? value : 0;
  }

  private async checkAlerts(): Promise<void> {
    if (this.metrics.length === 0) return;

    const latest = this.metrics[this.metrics.length - 1];
    
    for (const [key, threshold] of this.thresholds) {
      const value = this.getMetricValue(latest, key);
      const existingAlert = Array.from(this.alerts.values()).find(a => 
        a.category === this.getAlertCategory(key) && !a.acknowledged
      );

      if (value >= threshold.emergency) {
        if (!existingAlert || existingAlert.type !== 'emergency') {
          await this.createAndEmitAlert('emergency', key, threshold, value, latest);
        }
      } else if (value >= threshold.critical) {
        if (!existingAlert || existingAlert.type !== 'critical') {
          await this.createAndEmitAlert('critical', key, threshold, value, latest);
        }
      } else if (value >= threshold.warning) {
        if (!existingAlert || existingAlert.type !== 'warning') {
          await this.createAndEmitAlert('warning', key, threshold, value, latest);
        }
      } else if (existingAlert && value < threshold.warning * (1 - threshold.hysteresis)) {
        // Resolve alert due to hysteresis
        await this.resolveAlert(existingAlert.id);
      }
    }
  }

  private async createAndEmitAlert(
    type: 'warning' | 'critical' | 'emergency',
    metricKey: string,
    threshold: MemoryThreshold,
    value: number,
    context: MemoryMetrics
  ): Promise<void> {
    const alert = this.createAlert(
      type,
      this.getAlertCategory(metricKey),
      this.getAlertMessage(metricKey, type, value, threshold),
      { metric: metricKey, context },
      threshold[type],
      value,
      this.getRecommendations(metricKey, type)
    );

    this.emit('alert', alert);
  }

  private createAlert(
    type: 'warning' | 'critical' | 'emergency',
    category: MemoryAlert['category'],
    message: string,
    details: any,
    threshold: number,
    currentValue: number,
    recommendations: string[]
  ): MemoryAlert {
    const alert: MemoryAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      category,
      message,
      details,
      timestamp: Date.now(),
      threshold,
      currentValue,
      recommendations,
      acknowledged: false
    };

    this.alerts.set(alert.id, alert);
    return alert;
  }

  private getAlertCategory(metricKey: string): MemoryAlert['category'] {
    if (metricKey.includes('utilization')) return 'utilization';
    if (metricKey.includes('fragmentation')) return 'fragmentation';
    if (metricKey.includes('gc')) return 'performance';
    if (metricKey.includes('pool')) return 'pool_exhaustion';
    return 'utilization';
  }

  private getAlertMessage(metricKey: string, type: string, value: number, threshold: MemoryThreshold): string {
    const formattedValue = metricKey.includes('utilization') || metricKey.includes('fragmentation') || metricKey.includes('pressure')
      ? `${(value * 100).toFixed(1)}%`
      : this.formatBytes(value);
    
    const formattedThreshold = metricKey.includes('utilization') || metricKey.includes('fragmentation') || metricKey.includes('pressure')
      ? `${(threshold[type as keyof MemoryThreshold] as number * 100).toFixed(1)}%`
      : this.formatBytes(threshold[type as keyof MemoryThreshold] as number);

    return `${type.toUpperCase()}: ${metricKey} is ${formattedValue} (threshold: ${formattedThreshold})`;
  }

  private getRecommendations(metricKey: string, type: string): string[] {
    const recommendations: Record<string, string[]> = {
      'system.utilization': [
        'Free up system memory',
        'Restart memory-intensive processes',
        'Consider scaling to additional nodes',
        'Review memory allocation patterns'
      ],
      'process.heapUsed': [
        'Trigger garbage collection',
        'Review object retention',
        'Check for memory leaks',
        'Optimize data structures'
      ],
      'fragmentation': [
        'Trigger memory defragmentation',
        'Optimize allocation patterns',
        'Consider memory pool restructuring',
        'Review allocation sizes'
      ],
      'gc.pressure': [
        'Reduce allocation rate',
        'Optimize object lifecycle',
        'Consider increasing heap size',
        'Review garbage collection settings'
      ],
      'pool.utilization': [
        'Expand memory pool',
        'Optimize pool allocation',
        'Review pool configuration',
        'Consider pool defragmentation'
      ]
    };

    return recommendations[metricKey] || ['Review memory usage patterns', 'Consider optimization strategies'];
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.resolvedAt = Date.now();
    this.emit('alertResolved', alert);
    this.logger.info(`Alert resolved: ${alert.message}`, { alertId });
    return true;
  }

  async acknowledgeAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert) return false;

    alert.acknowledged = true;
    this.emit('alertAcknowledged', alert);
    this.logger.info(`Alert acknowledged: ${alert.message}`, { alertId });
    return true;
  }

  startProfiling(name: string): string {
    const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const profile: PerformanceProfile = {
      id: profileId,
      name,
      startTime: Date.now(),
      memorySnapshots: [],
      allocations: [],
      deallocations: [],
      peaks: [],
      analysis: {
        peakMemory: 0,
        averageMemory: 0,
        memoryEfficiency: 0,
        allocationRate: 0,
        deallocationRate: 0,
        fragmentationTrend: 0
      }
    };

    this.profiles.set(profileId, profile);
    this.activeProfile = profileId;

    this.logger.info(`Started memory profiling: ${name}`, { profileId });
    return profileId;
  }

  stopProfiling(profileId: string): PerformanceProfile | null {
    const profile = this.profiles.get(profileId);
    if (!profile) return null;

    profile.endTime = Date.now();
    this.activeProfile = null;

    // Analyze the profile
    profile.analysis = this.analyzeProfile(profile);

    this.logger.info(`Stopped memory profiling: ${profile.name}`, {
      profileId,
      duration: profile.endTime - profile.startTime,
      peakMemory: this.formatBytes(profile.analysis.peakMemory)
    });

    return profile;
  }

  private analyzeProfile(profile: PerformanceProfile): PerformanceProfile['analysis'] {
    const snapshots = profile.memorySnapshots;
    
    if (snapshots.length === 0) {
      return {
        peakMemory: 0,
        averageMemory: 0,
        memoryEfficiency: 0,
        allocationRate: 0,
        deallocationRate: 0,
        fragmentationTrend: 0
      };
    }

    const memoryValues = snapshots.map(s => s.process.heapUsed);
    const peakMemory = Math.max(...memoryValues);
    const averageMemory = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length;
    
    const allocationRate = profile.allocations.length / ((profile.endTime! - profile.startTime) / 1000);
    const deallocationRate = profile.deallocations.length / ((profile.endTime! - profile.startTime) / 1000);
    
    // Calculate fragmentation trend
    const fragmentationValues = snapshots.map(s => 
      Object.values(s.pools).reduce((avg, pool) => avg + pool.fragmentationRatio, 0) / Object.keys(s.pools).length
    );
    const fragmentationTrend = fragmentationValues.length > 1 
      ? this.calculateLinearRegression(fragmentationValues).slope
      : 0;

    const memoryEfficiency = averageMemory > 0 ? (peakMemory - averageMemory) / peakMemory : 0;

    return {
      peakMemory,
      averageMemory,
      memoryEfficiency,
      allocationRate,
      deallocationRate,
      fragmentationTrend
    };
  }

  // Public API methods

  getMetrics(limit?: number): MemoryMetrics[] {
    return limit ? this.metrics.slice(-limit) : [...this.metrics];
  }

  getLatestMetrics(): MemoryMetrics | null {
    return this.metrics.length > 0 ? this.metrics[this.metrics.length - 1] : null;
  }

  getAlerts(activeOnly: boolean = false): MemoryAlert[] {
    const alerts = Array.from(this.alerts.values());
    return activeOnly ? alerts.filter(a => !a.acknowledged && !a.resolvedAt) : alerts;
  }

  getMemoryLeaks(): MemoryLeak[] {
    return Array.from(this.leaks.values());
  }

  getProfiles(): PerformanceProfile[] {
    return Array.from(this.profiles.values());
  }

  getProfile(profileId: string): PerformanceProfile | null {
    return this.profiles.get(profileId) || null;
  }

  updateThreshold(metricKey: string, threshold: Partial<MemoryThreshold>): void {
    const existing = this.thresholds.get(metricKey);
    if (existing) {
      Object.assign(existing, threshold);
      this.logger.info(`Updated threshold for ${metricKey}`, threshold);
    }
  }

  getThresholds(): Map<string, MemoryThreshold> {
    return new Map(this.thresholds);
  }

  async exportMetrics(format: 'json' | 'csv' = 'json'): Promise<string> {
    if (format === 'csv') {
      return this.exportMetricsAsCSV();
    }
    return JSON.stringify(this.metrics, null, 2);
  }

  private exportMetricsAsCSV(): string {
    const headers = [
      'timestamp',
      'system.total',
      'system.used',
      'system.utilization',
      'process.heapUsed',
      'process.heapTotal',
      'process.rss',
      'gc.majorCollections',
      'gc.minorCollections',
      'gc.pressure'
    ];

    const rows = this.metrics.map(m => [
      m.timestamp,
      m.system.total,
      m.system.used,
      m.system.utilization,
      m.process.heapUsed,
      m.process.heapTotal,
      m.process.rss,
      m.gc.majorCollections,
      m.gc.minorCollections,
      m.gc.pressure
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.leakDetectionInterval) {
      clearInterval(this.leakDetectionInterval);
    }
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval);
    }

    this.logger.info('Memory Monitor shutdown completed');
  }

  private parseBytes(bytesString: string): number {
    const match = bytesString.match(/^([\d.]+)\s*([KMGT]?B)$/i);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    
    const multipliers: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024
    };
    
    return value * (multipliers[unit] || 1);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

// Export singleton instance
export const memoryMonitor = new MemoryMonitor();
export default memoryMonitor;