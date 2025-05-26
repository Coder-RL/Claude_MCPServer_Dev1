import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
  tags?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface OptimizationRule {
  id: string;
  name: string;
  condition: (metrics: PerformanceMetric[]) => boolean;
  action: (context: OptimizationContext) => Promise<void>;
  priority: number;
  cooldown: number; // seconds
  enabled: boolean;
}

export interface OptimizationContext {
  metrics: PerformanceMetric[];
  cacheManager: any;
  resourceManager: any;
  configuration: any;
  services: Map<string, any>;
}

export interface PerformanceProfile {
  id: string;
  name: string;
  description: string;
  thresholds: Record<string, number>;
  optimizations: string[];
  enabled: boolean;
}

export interface BottleneckAnalysis {
  component: string;
  metric: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: number;
  suggestions: string[];
  timestamp: number;
}

export interface PerformanceReport {
  timestamp: number;
  duration: number;
  metrics: PerformanceMetric[];
  bottlenecks: BottleneckAnalysis[];
  optimizations: OptimizationResult[];
  recommendations: string[];
  score: number;
}

export interface OptimizationResult {
  ruleId: string;
  ruleName: string;
  executed: boolean;
  impact: number;
  duration: number;
  error?: string;
  timestamp: number;
}

export class PerformanceOptimizer extends EventEmitter {
  private metrics: PerformanceMetric[] = [];
  private rules = new Map<string, OptimizationRule>();
  private profiles = new Map<string, PerformanceProfile>();
  private activeProfile: string | null = null;
  private lastOptimization = new Map<string, number>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private metricsHistory: PerformanceMetric[][] = [];
  private bottleneckHistory: BottleneckAnalysis[] = [];
  private optimizationHistory: OptimizationResult[] = [];
  private isOptimizing = false;

  constructor(private context: OptimizationContext) {
    super();
    this.setupDefaultRules();
    this.setupDefaultProfiles();
    this.startMonitoring();
  }

  private setupDefaultRules(): void {
    // Memory optimization rule
    this.addRule({
      id: 'memory-optimization',
      name: 'Memory Usage Optimization',
      condition: (metrics) => {
        const memoryMetric = metrics.find(m => m.name === 'memory.usage');
        return memoryMetric ? memoryMetric.value > 0.8 : false;
      },
      action: async (context) => {
        // Trigger garbage collection and cache cleanup
        if (global.gc) {
          global.gc();
        }
        
        if (context.cacheManager) {
          await context.cacheManager.clear();
        }
        
        this.emit('optimization-applied', { type: 'memory', action: 'cleanup' });
      },
      priority: 1,
      cooldown: 300, // 5 minutes
      enabled: true
    });

    // CPU optimization rule
    this.addRule({
      id: 'cpu-optimization',
      name: 'CPU Usage Optimization',
      condition: (metrics) => {
        const cpuMetric = metrics.find(m => m.name === 'cpu.usage');
        return cpuMetric ? cpuMetric.value > 0.9 : false;
      },
      action: async (context) => {
        // Implement CPU optimization strategies
        this.emit('optimization-applied', { type: 'cpu', action: 'throttle' });
      },
      priority: 1,
      cooldown: 180, // 3 minutes
      enabled: true
    });

    // Response time optimization rule
    this.addRule({
      id: 'response-time-optimization',
      name: 'Response Time Optimization',
      condition: (metrics) => {
        const responseTimeMetric = metrics.find(m => m.name === 'http.response_time');
        return responseTimeMetric ? responseTimeMetric.value > 5000 : false; // 5 seconds
      },
      action: async (context) => {
        // Enable aggressive caching and connection pooling
        if (context.cacheManager) {
          context.cacheManager.updateLayerConfig('default', { strategy: 'lru', maxSize: 200 * 1024 * 1024 });
        }
        
        this.emit('optimization-applied', { type: 'response-time', action: 'cache-boost' });
      },
      priority: 2,
      cooldown: 600, // 10 minutes
      enabled: true
    });

    // Database optimization rule
    this.addRule({
      id: 'database-optimization',
      name: 'Database Performance Optimization',
      condition: (metrics) => {
        const dbMetric = metrics.find(m => m.name === 'database.query_time');
        return dbMetric ? dbMetric.value > 1000 : false; // 1 second
      },
      action: async (context) => {
        // Implement database optimization strategies
        this.emit('optimization-applied', { type: 'database', action: 'connection-pool-adjustment' });
      },
      priority: 1,
      cooldown: 300,
      enabled: true
    });
  }

  private setupDefaultProfiles(): void {
    // High Performance Profile
    this.addProfile({
      id: 'high-performance',
      name: 'High Performance',
      description: 'Optimized for maximum performance',
      thresholds: {
        'memory.usage': 0.7,
        'cpu.usage': 0.8,
        'http.response_time': 2000,
        'database.query_time': 500
      },
      optimizations: ['memory-optimization', 'cpu-optimization', 'response-time-optimization'],
      enabled: true
    });

    // Balanced Profile
    this.addProfile({
      id: 'balanced',
      name: 'Balanced',
      description: 'Balanced performance and resource usage',
      thresholds: {
        'memory.usage': 0.8,
        'cpu.usage': 0.85,
        'http.response_time': 3000,
        'database.query_time': 800
      },
      optimizations: ['memory-optimization', 'response-time-optimization'],
      enabled: true
    });

    // Resource Saver Profile
    this.addProfile({
      id: 'resource-saver',
      name: 'Resource Saver',
      description: 'Optimized for minimal resource usage',
      thresholds: {
        'memory.usage': 0.9,
        'cpu.usage': 0.95,
        'http.response_time': 5000,
        'database.query_time': 1500
      },
      optimizations: ['memory-optimization'],
      enabled: true
    });

    this.setActiveProfile('balanced');
  }

  addRule(rule: OptimizationRule): void {
    this.rules.set(rule.id, rule);
    this.emit('rule-added', rule);
  }

  removeRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.delete(ruleId);
      this.emit('rule-removed', rule);
    }
  }

  addProfile(profile: PerformanceProfile): void {
    this.profiles.set(profile.id, profile);
    this.emit('profile-added', profile);
  }

  setActiveProfile(profileId: string): void {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    this.activeProfile = profileId;
    this.emit('profile-activated', profile);
  }

  recordMetric(metric: PerformanceMetric): void {
    metric.timestamp = Date.now();
    this.metrics.push(metric);

    // Keep only recent metrics (last hour)
    const cutoff = Date.now() - 3600000;
    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);

    this.emit('metric-recorded', metric);
  }

  recordMetrics(metrics: PerformanceMetric[]): void {
    for (const metric of metrics) {
      this.recordMetric(metric);
    }
  }

  async collectSystemMetrics(): Promise<PerformanceMetric[]> {
    const metrics: PerformanceMetric[] = [];
    const now = Date.now();

    // Memory metrics
    const memUsage = process.memoryUsage();
    metrics.push({
      name: 'memory.heap_used',
      value: memUsage.heapUsed,
      unit: 'bytes',
      timestamp: now
    });

    metrics.push({
      name: 'memory.heap_total',
      value: memUsage.heapTotal,
      unit: 'bytes',
      timestamp: now
    });

    metrics.push({
      name: 'memory.usage',
      value: memUsage.heapUsed / memUsage.heapTotal,
      unit: 'ratio',
      timestamp: now
    });

    // CPU metrics (simplified)
    const cpuUsage = process.cpuUsage();
    metrics.push({
      name: 'cpu.user',
      value: cpuUsage.user,
      unit: 'microseconds',
      timestamp: now
    });

    metrics.push({
      name: 'cpu.system',
      value: cpuUsage.system,
      unit: 'microseconds',
      timestamp: now
    });

    // Event loop lag
    const start = performance.now();
    await new Promise(resolve => setImmediate(resolve));
    const lag = performance.now() - start;
    
    metrics.push({
      name: 'eventloop.lag',
      value: lag,
      unit: 'milliseconds',
      timestamp: now
    });

    return metrics;
  }

  async analyzeBottlenecks(): Promise<BottleneckAnalysis[]> {
    const bottlenecks: BottleneckAnalysis[] = [];
    const now = Date.now();
    const recentMetrics = this.metrics.filter(m => now - m.timestamp < 300000); // Last 5 minutes

    // Analyze memory usage
    const memoryMetrics = recentMetrics.filter(m => m.name === 'memory.usage');
    if (memoryMetrics.length > 0) {
      const avgMemory = memoryMetrics.reduce((sum, m) => sum + m.value, 0) / memoryMetrics.length;
      
      if (avgMemory > 0.9) {
        bottlenecks.push({
          component: 'memory',
          metric: 'usage',
          severity: 'critical',
          impact: avgMemory,
          suggestions: [
            'Increase memory allocation',
            'Implement memory pooling',
            'Optimize data structures',
            'Enable compression'
          ],
          timestamp: now
        });
      } else if (avgMemory > 0.8) {
        bottlenecks.push({
          component: 'memory',
          metric: 'usage',
          severity: 'high',
          impact: avgMemory,
          suggestions: [
            'Monitor memory usage closely',
            'Implement caching strategies',
            'Optimize memory-intensive operations'
          ],
          timestamp: now
        });
      }
    }

    // Analyze CPU usage
    const cpuMetrics = recentMetrics.filter(m => m.name === 'cpu.usage');
    if (cpuMetrics.length > 0) {
      const avgCpu = cpuMetrics.reduce((sum, m) => sum + m.value, 0) / cpuMetrics.length;
      
      if (avgCpu > 0.9) {
        bottlenecks.push({
          component: 'cpu',
          metric: 'usage',
          severity: 'critical',
          impact: avgCpu,
          suggestions: [
            'Scale horizontally',
            'Optimize CPU-intensive algorithms',
            'Implement task queuing',
            'Use worker threads'
          ],
          timestamp: now
        });
      }
    }

    // Analyze response times
    const responseTimeMetrics = recentMetrics.filter(m => m.name === 'http.response_time');
    if (responseTimeMetrics.length > 0) {
      const avgResponseTime = responseTimeMetrics.reduce((sum, m) => sum + m.value, 0) / responseTimeMetrics.length;
      
      if (avgResponseTime > 5000) {
        bottlenecks.push({
          component: 'http',
          metric: 'response_time',
          severity: 'high',
          impact: avgResponseTime / 1000,
          suggestions: [
            'Implement response caching',
            'Optimize database queries',
            'Use CDN for static assets',
            'Implement connection pooling'
          ],
          timestamp: now
        });
      }
    }

    this.bottleneckHistory.push(...bottlenecks);
    
    // Keep only recent bottleneck history
    const cutoff = now - 3600000; // 1 hour
    this.bottleneckHistory = this.bottleneckHistory.filter(b => b.timestamp > cutoff);

    return bottlenecks;
  }

  async optimize(): Promise<OptimizationResult[]> {
    if (this.isOptimizing) {
      return [];
    }

    this.isOptimizing = true;
    const results: OptimizationResult[] = [];
    const now = Date.now();

    try {
      const profile = this.activeProfile ? this.profiles.get(this.activeProfile) : null;
      if (!profile || !profile.enabled) {
        return results;
      }

      // Get enabled rules for the active profile
      const enabledRules = Array.from(this.rules.values())
        .filter(rule => rule.enabled && profile.optimizations.includes(rule.id))
        .sort((a, b) => a.priority - b.priority);

      for (const rule of enabledRules) {
        // Check cooldown
        const lastRun = this.lastOptimization.get(rule.id) || 0;
        if (now - lastRun < rule.cooldown * 1000) {
          continue;
        }

        // Check condition
        try {
          const shouldExecute = rule.condition(this.metrics);
          
          if (shouldExecute) {
            const startTime = performance.now();
            
            try {
              await rule.action(this.context);
              
              const duration = performance.now() - startTime;
              const result: OptimizationResult = {
                ruleId: rule.id,
                ruleName: rule.name,
                executed: true,
                impact: this.calculateImpact(rule.id),
                duration,
                timestamp: now
              };
              
              results.push(result);
              this.lastOptimization.set(rule.id, now);
              
              this.emit('optimization-executed', result);
              
            } catch (error) {
              const result: OptimizationResult = {
                ruleId: rule.id,
                ruleName: rule.name,
                executed: false,
                impact: 0,
                duration: performance.now() - startTime,
                error: (error as Error).message,
                timestamp: now
              };
              
              results.push(result);
              this.emit('optimization-failed', result);
            }
          }
        } catch (error) {
          this.emit('rule-error', { ruleId: rule.id, error: (error as Error).message });
        }
      }

      this.optimizationHistory.push(...results);
      
      // Keep only recent optimization history
      const cutoff = now - 86400000; // 24 hours
      this.optimizationHistory = this.optimizationHistory.filter(o => o.timestamp > cutoff);

    } finally {
      this.isOptimizing = false;
    }

    return results;
  }

  private calculateImpact(ruleId: string): number {
    // Simplified impact calculation
    // In production, this would measure actual performance improvements
    const beforeMetrics = this.metricsHistory[this.metricsHistory.length - 2] || [];
    const afterMetrics = this.metrics;
    
    // Calculate improvement percentage
    return Math.random() * 0.2; // Placeholder
  }

  async generateReport(): Promise<PerformanceReport> {
    const now = Date.now();
    const startTime = now - 3600000; // Last hour
    
    const recentMetrics = this.metrics.filter(m => m.timestamp > startTime);
    const bottlenecks = await this.analyzeBottlenecks();
    const recentOptimizations = this.optimizationHistory.filter(o => o.timestamp > startTime);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(recentMetrics, bottlenecks);
    
    // Calculate performance score
    const score = this.calculatePerformanceScore(recentMetrics, bottlenecks);
    
    const report: PerformanceReport = {
      timestamp: now,
      duration: 3600000, // 1 hour
      metrics: recentMetrics,
      bottlenecks,
      optimizations: recentOptimizations,
      recommendations,
      score
    };

    this.emit('report-generated', report);
    return report;
  }

  private generateRecommendations(metrics: PerformanceMetric[], bottlenecks: BottleneckAnalysis[]): string[] {
    const recommendations: string[] = [];
    
    // Analyze patterns and generate recommendations
    if (bottlenecks.some(b => b.component === 'memory' && b.severity === 'critical')) {
      recommendations.push('Consider upgrading server memory or implementing memory optimization strategies');
    }
    
    if (bottlenecks.some(b => b.component === 'cpu' && b.severity === 'critical')) {
      recommendations.push('Consider horizontal scaling or CPU optimization');
    }
    
    const responseTimeBottlenecks = bottlenecks.filter(b => b.component === 'http');
    if (responseTimeBottlenecks.length > 0) {
      recommendations.push('Implement caching strategies to improve response times');
    }
    
    // Check for patterns in metrics
    const memoryMetrics = metrics.filter(m => m.name === 'memory.usage');
    if (memoryMetrics.length > 10) {
      const trend = this.calculateTrend(memoryMetrics.map(m => m.value));
      if (trend > 0.1) {
        recommendations.push('Memory usage is trending upward - investigate potential memory leaks');
      }
    }
    
    return recommendations;
  }

  private calculateTrend(values: number[]): number {
    if (values.length < 2) return 0;
    
    // Simple linear regression slope
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, i) => sum + (i * val), 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  private calculatePerformanceScore(metrics: PerformanceMetric[], bottlenecks: BottleneckAnalysis[]): number {
    let score = 100;
    
    // Deduct points for bottlenecks
    for (const bottleneck of bottlenecks) {
      switch (bottleneck.severity) {
        case 'critical':
          score -= 25;
          break;
        case 'high':
          score -= 15;
          break;
        case 'medium':
          score -= 10;
          break;
        case 'low':
          score -= 5;
          break;
      }
    }
    
    // Consider metric trends
    const memoryMetrics = metrics.filter(m => m.name === 'memory.usage');
    if (memoryMetrics.length > 0) {
      const avgMemory = memoryMetrics.reduce((sum, m) => sum + m.value, 0) / memoryMetrics.length;
      if (avgMemory > 0.9) score -= 20;
      else if (avgMemory > 0.8) score -= 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        // Collect system metrics
        const systemMetrics = await this.collectSystemMetrics();
        this.recordMetrics(systemMetrics);
        
        // Store metrics snapshot
        this.metricsHistory.push([...this.metrics]);
        
        // Keep only recent history
        if (this.metricsHistory.length > 60) { // Keep last 60 snapshots
          this.metricsHistory = this.metricsHistory.slice(-60);
        }
        
        // Trigger optimization if needed
        await this.optimize();
        
      } catch (error) {
        this.emit('monitoring-error', { error: (error as Error).message });
      }
    }, 60000); // Every minute
  }

  getRules(): OptimizationRule[] {
    return Array.from(this.rules.values());
  }

  getProfiles(): PerformanceProfile[] {
    return Array.from(this.profiles.values());
  }

  getActiveProfile(): PerformanceProfile | null {
    return this.activeProfile ? this.profiles.get(this.activeProfile) || null : null;
  }

  getMetrics(duration: number = 3600000): PerformanceMetric[] {
    const cutoff = Date.now() - duration;
    return this.metrics.filter(m => m.timestamp > cutoff);
  }

  getBottleneckHistory(duration: number = 3600000): BottleneckAnalysis[] {
    const cutoff = Date.now() - duration;
    return this.bottleneckHistory.filter(b => b.timestamp > cutoff);
  }

  getOptimizationHistory(duration: number = 86400000): OptimizationResult[] {
    const cutoff = Date.now() - duration;
    return this.optimizationHistory.filter(o => o.timestamp > cutoff);
  }

  getStats(): any {
    return {
      rules: this.rules.size,
      profiles: this.profiles.size,
      activeProfile: this.activeProfile,
      metrics: this.metrics.length,
      bottlenecks: this.bottleneckHistory.length,
      optimizations: this.optimizationHistory.length,
      isOptimizing: this.isOptimizing,
      isMonitoring: this.monitoringInterval !== null
    };
  }

  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.rules.clear();
    this.profiles.clear();
    this.metrics = [];
    this.metricsHistory = [];
    this.bottleneckHistory = [];
    this.optimizationHistory = [];
    this.lastOptimization.clear();
    
    this.removeAllListeners();
  }
}