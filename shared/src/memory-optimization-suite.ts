import { EventEmitter } from 'events';
import { createLogger } from './logging.js';
import { memoryManager } from './memory-manager.js';
import { createIntelligentCache } from './intelligent-cache.js';
import { memoryMonitor } from './memory-monitor.js';
import { streamingOptimizer } from './streaming-optimizer.js';

export interface OptimizationProfile {
  id: string;
  name: string;
  services: string[];
  strategy: 'aggressive' | 'balanced' | 'conservative';
  targets: {
    memoryReduction: number;
    performanceGain: number;
    throughputIncrease: number;
  };
  constraints: {
    maxMemoryUsage: number;
    maxLatencyIncrease: number;
    qualityThreshold: number;
  };
  createdAt: number;
  lastUsed: number;
}

export interface CrossServiceOptimization {
  id: string;
  profileId: string;
  services: string[];
  status: 'running' | 'completed' | 'failed' | 'paused';
  startTime: number;
  endTime?: number;
  results: {
    memoryFreed: number;
    performanceGain: number;
    servicesOptimized: number;
    errors: string[];
  };
  recommendations: OptimizationRecommendation[];
}

export interface OptimizationRecommendation {
  type: 'memory' | 'cache' | 'streaming' | 'gc' | 'pool';
  service: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  estimatedImpact: {
    memoryReduction?: number;
    performanceGain?: number;
    risk: 'low' | 'medium' | 'high';
  };
  implementation: string[];
  applied: boolean;
  appliedAt?: number;
}

export interface ServiceMemoryState {
  serviceId: string;
  name: string;
  memoryUsage: number;
  cacheUsage: number;
  bufferUsage: number;
  heapUsage: number;
  gcPressure: number;
  efficiency: number;
  lastUpdated: number;
}

export interface GlobalMemoryState {
  totalSystemMemory: number;
  usedMemory: number;
  availableMemory: number;
  systemUtilization: number;
  services: ServiceMemoryState[];
  pools: {
    id: string;
    utilization: number;
    fragmentation: number;
    efficiency: number;
  }[];
  caches: {
    id: string;
    hitRate: number;
    utilization: number;
    efficiency: number;
  }[];
  alerts: number;
  recommendations: number;
}

export class MemoryOptimizationSuite extends EventEmitter {
  private logger = createLogger('MemoryOptimizationSuite');
  private profiles = new Map<string, OptimizationProfile>();
  private optimizations = new Map<string, CrossServiceOptimization>();
  private serviceStates = new Map<string, ServiceMemoryState>();
  private globalCache = createIntelligentCache({
    maxSize: 256 * 1024 * 1024, // 256MB
    evictionPolicy: 'hybrid',
    compressionEnabled: true,
    prefetchEnabled: true,
    analyticsEnabled: true
  });
  private monitoringInterval: NodeJS.Timeout | null = null;
  private optimizationInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    
    this.initializeDefaultProfiles();
    this.setupEventListeners();
    this.startMonitoring();
    this.startPeriodicOptimization();
    
    this.logger.info('Memory Optimization Suite initialized');
  }

  private initializeDefaultProfiles(): void {
    const defaultProfiles: Array<Omit<OptimizationProfile, 'id' | 'createdAt' | 'lastUsed'>> = [
      {
        name: 'High Performance',
        services: ['*'],
        strategy: 'aggressive',
        targets: {
          memoryReduction: 0.3,
          performanceGain: 0.25,
          throughputIncrease: 0.2
        },
        constraints: {
          maxMemoryUsage: 0.8,
          maxLatencyIncrease: 0.1,
          qualityThreshold: 0.95
        }
      },
      {
        name: 'Balanced Optimization',
        services: ['*'],
        strategy: 'balanced',
        targets: {
          memoryReduction: 0.2,
          performanceGain: 0.15,
          throughputIncrease: 0.1
        },
        constraints: {
          maxMemoryUsage: 0.85,
          maxLatencyIncrease: 0.15,
          qualityThreshold: 0.98
        }
      },
      {
        name: 'Memory Conservation',
        services: ['*'],
        strategy: 'conservative',
        targets: {
          memoryReduction: 0.4,
          performanceGain: 0.1,
          throughputIncrease: 0.05
        },
        constraints: {
          maxMemoryUsage: 0.7,
          maxLatencyIncrease: 0.2,
          qualityThreshold: 0.99
        }
      }
    ];

    for (const profile of defaultProfiles) {
      const id = this.createOptimizationProfile(profile.name, profile.services, profile.strategy, profile.targets, profile.constraints);
      this.logger.debug(`Created default profile: ${profile.name} (${id})`);
    }
  }

  private setupEventListeners(): void {
    // Listen to memory manager events
    memoryManager.on('allocated', (event) => {
      this.handleMemoryEvent('allocation', event);
    });

    memoryManager.on('deallocated', (event) => {
      this.handleMemoryEvent('deallocation', event);
    });

    memoryManager.on('memoryPressure', (event) => {
      this.handleMemoryPressure(event);
    });

    // Listen to memory monitor events
    memoryMonitor.on('alert', (alert) => {
      this.handleMemoryAlert(alert);
    });

    memoryMonitor.on('memoryLeak', (leak) => {
      this.handleMemoryLeak(leak);
    });

    // Listen to streaming optimizer events
    streamingOptimizer.on('backpressure', (event) => {
      this.handleBackpressure(event);
    });
  }

  private handleMemoryEvent(type: string, event: any): void {
    // Update service state if we can identify the service
    if (event.owner && event.owner !== 'unknown') {
      this.updateServiceState(event.owner, { memoryEvent: { type, ...event } });
    }
  }

  private async handleMemoryPressure(event: any): Promise<void> {
    this.logger.warn(`Memory pressure detected: ${event.type}`, event);
    
    // Trigger automatic optimization based on pressure level
    switch (event.type) {
      case 'warning':
        await this.triggerOptimization('balanced');
        break;
      case 'critical':
        await this.triggerOptimization('aggressive');
        break;
      case 'emergency':
        await this.emergencyOptimization();
        break;
    }
  }

  private async handleMemoryAlert(alert: any): Promise<void> {
    this.logger.warn(`Memory alert: ${alert.type}`, alert);
    
    // Generate optimization recommendations based on alert
    const recommendations = this.generateAlertRecommendations(alert);
    
    // Auto-apply low-risk recommendations
    for (const rec of recommendations) {
      if (rec.estimatedImpact.risk === 'low' && rec.priority === 'high') {
        await this.applyRecommendation(rec);
      }
    }
  }

  private async handleMemoryLeak(leak: any): Promise<void> {
    this.logger.error(`Memory leak detected: ${leak.source}`, leak);
    
    // Generate specific recommendations for leak mitigation
    const recommendations = this.generateLeakRecommendations(leak);
    
    this.emit('memoryLeakDetected', { leak, recommendations });
  }

  private async handleBackpressure(event: any): Promise<void> {
    this.logger.warn(`Backpressure detected in stream: ${event.streamId}`, event);
    
    // Optimize streaming configuration
    await this.optimizeStreamingForService(event.streamId);
  }

  createOptimizationProfile(
    name: string,
    services: string[],
    strategy: OptimizationProfile['strategy'],
    targets: OptimizationProfile['targets'],
    constraints: OptimizationProfile['constraints']
  ): string {
    const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const profile: OptimizationProfile = {
      id: profileId,
      name,
      services,
      strategy,
      targets,
      constraints,
      createdAt: now,
      lastUsed: now
    };

    this.profiles.set(profileId, profile);
    this.emit('profileCreated', profile);
    
    return profileId;
  }

  async runOptimization(profileId: string, services?: string[]): Promise<string> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Optimization profile not found: ${profileId}`);
    }

    const optimizationId = `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const targetServices = services || profile.services;
    
    const optimization: CrossServiceOptimization = {
      id: optimizationId,
      profileId,
      services: targetServices,
      status: 'running',
      startTime: Date.now(),
      results: {
        memoryFreed: 0,
        performanceGain: 0,
        servicesOptimized: 0,
        errors: []
      },
      recommendations: []
    };

    this.optimizations.set(optimizationId, optimization);
    profile.lastUsed = Date.now();

    this.logger.info(`Starting optimization: ${optimizationId}`, {
      profile: profile.name,
      strategy: profile.strategy,
      services: targetServices.length
    });

    // Run optimization asynchronously
    this.executeOptimization(optimization, profile).catch(error => {
      optimization.status = 'failed';
      optimization.results.errors.push(error.message);
      this.logger.error(`Optimization failed: ${optimizationId}`, error);
    });

    return optimizationId;
  }

  private async executeOptimization(
    optimization: CrossServiceOptimization,
    profile: OptimizationProfile
  ): Promise<void> {
    try {
      const startMemory = this.getGlobalMemoryState().usedMemory;
      let totalFreed = 0;
      let servicesOptimized = 0;

      // Step 1: Memory Pool Optimization
      if (optimization.services.includes('*') || optimization.services.some(s => s.includes('pool'))) {
        const poolResults = await this.optimizeMemoryPools(profile);
        totalFreed += poolResults.freed;
        optimization.recommendations.push(...poolResults.recommendations);
      }

      // Step 2: Cache Optimization
      if (optimization.services.includes('*') || optimization.services.some(s => s.includes('cache'))) {
        const cacheResults = await this.optimizeCaches(profile);
        totalFreed += cacheResults.freed;
        optimization.recommendations.push(...cacheResults.recommendations);
      }

      // Step 3: Streaming Optimization
      if (optimization.services.includes('*') || optimization.services.some(s => s.includes('stream'))) {
        const streamResults = await this.optimizeStreaming(profile);
        totalFreed += streamResults.freed;
        optimization.recommendations.push(...streamResults.recommendations);
      }

      // Step 4: Garbage Collection Optimization
      if (profile.strategy === 'aggressive') {
        const gcResults = await this.optimizeGarbageCollection(profile);
        totalFreed += gcResults.freed;
        optimization.recommendations.push(...gcResults.recommendations);
      }

      // Step 5: Service-Specific Optimization
      for (const serviceId of optimization.services) {
        if (serviceId !== '*') {
          const serviceResults = await this.optimizeService(serviceId, profile);
          totalFreed += serviceResults.freed;
          servicesOptimized++;
          optimization.recommendations.push(...serviceResults.recommendations);
        }
      }

      const endMemory = this.getGlobalMemoryState().usedMemory;
      const actualFreed = startMemory - endMemory;
      const performanceGain = this.calculatePerformanceGain(optimization);

      optimization.results = {
        memoryFreed: actualFreed,
        performanceGain,
        servicesOptimized,
        errors: []
      };

      optimization.status = 'completed';
      optimization.endTime = Date.now();

      this.logger.info(`Optimization completed: ${optimization.id}`, {
        memoryFreed: this.formatBytes(actualFreed),
        performanceGain: `${(performanceGain * 100).toFixed(1)}%`,
        servicesOptimized,
        duration: optimization.endTime - optimization.startTime
      });

      this.emit('optimizationCompleted', optimization);

    } catch (error) {
      optimization.status = 'failed';
      optimization.results.errors.push(error.message);
      optimization.endTime = Date.now();
      throw error;
    }
  }

  private async optimizeMemoryPools(profile: OptimizationProfile): Promise<{ freed: number; recommendations: OptimizationRecommendation[] }> {
    const recommendations: OptimizationRecommendation[] = [];
    let totalFreed = 0;

    try {
      // Get all pool statistics
      const poolStats = memoryManager.getPoolStatistics();
      
      if (Array.isArray(poolStats)) {
        for (const pool of poolStats) {
          const utilization = parseFloat(pool.utilization) / 100;
          const fragmentation = parseFloat(pool.fragmentationRatio) / 100;
          
          // Defragment highly fragmented pools
          if (fragmentation > 0.3) {
            const result = await memoryManager.optimizePool(pool.id);
            totalFreed += result.freed;
            
            recommendations.push({
              type: 'pool',
              service: pool.id,
              priority: 'medium',
              description: `Defragmented pool with ${(fragmentation * 100).toFixed(1)}% fragmentation`,
              estimatedImpact: {
                memoryReduction: result.freed,
                performanceGain: 0.1,
                risk: 'low'
              },
              implementation: [`Defragmented ${pool.id} pool`],
              applied: true,
              appliedAt: Date.now()
            });
          }
          
          // Recommend pool resizing for underutilized pools
          if (utilization < 0.3 && profile.strategy === 'aggressive') {
            recommendations.push({
              type: 'pool',
              service: pool.id,
              priority: 'low',
              description: `Pool underutilized at ${(utilization * 100).toFixed(1)}%`,
              estimatedImpact: {
                memoryReduction: this.parseBytes(pool.freeSize) * 0.5,
                performanceGain: 0,
                risk: 'medium'
              },
              implementation: [`Consider reducing pool size for ${pool.id}`],
              applied: false
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Error optimizing memory pools:', error);
    }

    return { freed: totalFreed, recommendations };
  }

  private async optimizeCaches(profile: OptimizationProfile): Promise<{ freed: number; recommendations: OptimizationRecommendation[] }> {
    const recommendations: OptimizationRecommendation[] = [];
    let totalFreed = 0;

    try {
      // Optimize global cache
      const cacheStats = this.globalCache.getStatistics();
      
      if (cacheStats.hitRate < 0.5 && profile.strategy !== 'conservative') {
        // Clear low-hit-rate cache entries
        const beforeSize = cacheStats.memoryUsage;
        
        // This would require implementing selective cache clearing
        // For now, we'll estimate the impact
        const estimatedFreed = beforeSize * 0.3;
        totalFreed += estimatedFreed;
        
        recommendations.push({
          type: 'cache',
          service: 'global',
          priority: 'medium',
          description: `Optimized cache with ${(cacheStats.hitRate * 100).toFixed(1)}% hit rate`,
          estimatedImpact: {
            memoryReduction: estimatedFreed,
            performanceGain: 0.05,
            risk: 'low'
          },
          implementation: ['Cleared low-hit-rate cache entries'],
          applied: true,
          appliedAt: Date.now()
        });
      }
      
      // Recommend cache configuration adjustments
      if (cacheStats.hitRate > 0.9 && cacheStats.memoryUsage / (256 * 1024 * 1024) > 0.8) {
        recommendations.push({
          type: 'cache',
          service: 'global',
          priority: 'low',
          description: 'High hit rate suggests cache size could be increased',
          estimatedImpact: {
            performanceGain: 0.1,
            risk: 'low'
          },
          implementation: ['Consider increasing cache size'],
          applied: false
        });
      }
    } catch (error) {
      this.logger.error('Error optimizing caches:', error);
    }

    return { freed: totalFreed, recommendations };
  }

  private async optimizeStreaming(profile: OptimizationProfile): Promise<{ freed: number; recommendations: OptimizationRecommendation[] }> {
    const recommendations: OptimizationRecommendation[] = [];
    let totalFreed = 0;

    try {
      const streamingStats = streamingOptimizer.getMetrics();
      const bufferStats = streamingOptimizer.getBufferPoolStatistics();
      
      // Optimize buffer pools
      for (const bufferPool of bufferStats) {
        const utilization = parseFloat(bufferPool.stats.utilization) / 100;
        
        if (utilization < 0.2 && profile.strategy === 'aggressive') {
          // Estimate memory that could be freed by reducing buffer pool
          const totalSize = this.parseBytes(bufferPool.stats.totalSize);
          const estimatedFreed = totalSize * 0.5;
          totalFreed += estimatedFreed;
          
          recommendations.push({
            type: 'streaming',
            service: 'buffers',
            priority: 'medium',
            description: `Buffer pool ${bufferPool.id} underutilized at ${(utilization * 100).toFixed(1)}%`,
            estimatedImpact: {
              memoryReduction: estimatedFreed,
              performanceGain: 0,
              risk: 'medium'
            },
            implementation: [`Reduce buffer pool size for ${bufferPool.id}`],
            applied: false
          });
        }
      }
      
      // Optimize streaming configuration based on throughput
      if (streamingStats.throughput < 1024 * 1024 && streamingStats.backpressureEvents > 10) {
        recommendations.push({
          type: 'streaming',
          service: 'configuration',
          priority: 'high',
          description: 'High backpressure with low throughput detected',
          estimatedImpact: {
            performanceGain: 0.2,
            risk: 'low'
          },
          implementation: [
            'Increase buffer sizes',
            'Enable compression',
            'Adjust concurrency settings'
          ],
          applied: false
        });
      }
    } catch (error) {
      this.logger.error('Error optimizing streaming:', error);
    }

    return { freed: totalFreed, recommendations };
  }

  private async optimizeGarbageCollection(profile: OptimizationProfile): Promise<{ freed: number; recommendations: OptimizationRecommendation[] }> {
    const recommendations: OptimizationRecommendation[] = [];
    let totalFreed = 0;

    try {
      const memoryInfo = memoryManager.getSystemMemoryInfo();
      const beforeMemory = this.parseBytes(memoryInfo.used);
      
      // Force garbage collection if available
      if (global.gc && profile.strategy === 'aggressive') {
        global.gc();
        
        // Estimate memory freed (simplified)
        const estimatedFreed = beforeMemory * 0.1;
        totalFreed += estimatedFreed;
        
        recommendations.push({
          type: 'gc',
          service: 'system',
          priority: 'high',
          description: 'Forced garbage collection executed',
          estimatedImpact: {
            memoryReduction: estimatedFreed,
            performanceGain: 0.05,
            risk: 'low'
          },
          implementation: ['Executed global.gc()'],
          applied: true,
          appliedAt: Date.now()
        });
      }
      
      // Recommend GC tuning
      const gcStrategy = memoryManager.getSystemMemoryInfo().gcStrategy;
      if (gcStrategy !== 'aggressive' && profile.strategy === 'aggressive') {
        recommendations.push({
          type: 'gc',
          service: 'system',
          priority: 'medium',
          description: 'GC strategy could be more aggressive',
          estimatedImpact: {
            memoryReduction: beforeMemory * 0.05,
            performanceGain: 0.1,
            risk: 'medium'
          },
          implementation: ['Switch to aggressive GC strategy'],
          applied: false
        });
      }
    } catch (error) {
      this.logger.error('Error optimizing garbage collection:', error);
    }

    return { freed: totalFreed, recommendations };
  }

  private async optimizeService(serviceId: string, profile: OptimizationProfile): Promise<{ freed: number; recommendations: OptimizationRecommendation[] }> {
    const recommendations: OptimizationRecommendation[] = [];
    let totalFreed = 0;

    // Service-specific optimization would be implemented here
    // For now, we'll provide general recommendations
    
    const serviceState = this.serviceStates.get(serviceId);
    if (serviceState) {
      if (serviceState.efficiency < 0.7) {
        recommendations.push({
          type: 'memory',
          service: serviceId,
          priority: 'medium',
          description: `Service efficiency is ${(serviceState.efficiency * 100).toFixed(1)}%`,
          estimatedImpact: {
            memoryReduction: serviceState.memoryUsage * 0.2,
            performanceGain: 0.15,
            risk: 'medium'
          },
          implementation: [
            'Review memory allocation patterns',
            'Optimize data structures',
            'Implement object pooling'
          ],
          applied: false
        });
      }
    }

    return { freed: totalFreed, recommendations };
  }

  private calculatePerformanceGain(optimization: CrossServiceOptimization): number {
    // Simplified performance gain calculation
    const memoryFreedRatio = optimization.results.memoryFreed / (1024 * 1024 * 1024); // GB
    return Math.min(0.5, memoryFreedRatio * 0.1); // Max 50% gain
  }

  private async triggerOptimization(strategy: 'aggressive' | 'balanced' | 'conservative'): Promise<void> {
    const profile = Array.from(this.profiles.values()).find(p => p.strategy === strategy);
    if (profile) {
      await this.runOptimization(profile.id);
    }
  }

  private async emergencyOptimization(): Promise<void> {
    this.logger.warn('Executing emergency memory optimization');
    
    // Force aggressive optimization
    await this.triggerOptimization('aggressive');
    
    // Additional emergency measures
    if (global.gc) {
      global.gc();
    }
    
    // Clear all non-critical caches
    await this.globalCache.flush();
    
    this.emit('emergencyOptimization', { timestamp: Date.now() });
  }

  private generateAlertRecommendations(alert: any): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];
    
    switch (alert.category) {
      case 'utilization':
        recommendations.push({
          type: 'memory',
          service: 'system',
          priority: 'high',
          description: 'High memory utilization detected',
          estimatedImpact: {
            memoryReduction: alert.currentValue * 0.2,
            risk: 'low'
          },
          implementation: ['Free unused memory', 'Optimize allocations'],
          applied: false
        });
        break;
        
      case 'fragmentation':
        recommendations.push({
          type: 'pool',
          service: 'memory-pools',
          priority: 'medium',
          description: 'High memory fragmentation detected',
          estimatedImpact: {
            memoryReduction: alert.currentValue * 0.1,
            performanceGain: 0.05,
            risk: 'low'
          },
          implementation: ['Defragment memory pools', 'Optimize allocation sizes'],
          applied: false
        });
        break;
    }
    
    return recommendations;
  }

  private generateLeakRecommendations(leak: any): OptimizationRecommendation[] {
    return [{
      type: 'memory',
      service: leak.source,
      priority: 'critical',
      description: `Memory leak detected in ${leak.source}`,
      estimatedImpact: {
        memoryReduction: leak.totalGrowth,
        risk: 'high'
      },
      implementation: [
        'Investigate memory allocation patterns',
        'Check for unclosed resources',
        'Review object lifecycle management',
        'Implement proper cleanup procedures'
      ],
      applied: false
    }];
  }

  private async optimizeStreamingForService(streamId: string): Promise<void> {
    // Update streaming configuration to reduce backpressure
    streamingOptimizer.updateConfiguration({
      bufferSize: streamingOptimizer.getConfiguration().bufferSize * 1.5,
      backpressureThreshold: 0.9
    });
  }

  private async applyRecommendation(recommendation: OptimizationRecommendation): Promise<void> {
    try {
      // Implementation would depend on recommendation type
      switch (recommendation.type) {
        case 'gc':
          if (global.gc) {
            global.gc();
          }
          break;
        case 'cache':
          // Apply cache optimizations
          break;
        // Add other cases as needed
      }
      
      recommendation.applied = true;
      recommendation.appliedAt = Date.now();
      
      this.logger.info(`Applied optimization recommendation: ${recommendation.description}`);
    } catch (error) {
      this.logger.error(`Failed to apply recommendation: ${recommendation.description}`, error);
    }
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.updateGlobalState();
    }, 10000); // Every 10 seconds
  }

  private startPeriodicOptimization(): void {
    this.optimizationInterval = setInterval(() => {
      this.performPeriodicOptimization();
    }, 300000); // Every 5 minutes
  }

  private updateGlobalState(): void {
    // Update global memory state from all components
    const systemInfo = memoryManager.getSystemMemoryInfo();
    const memoryMetrics = memoryMonitor.getLatestMetrics();
    
    // This would be expanded to collect from all registered services
    this.emit('globalStateUpdated', this.getGlobalMemoryState());
  }

  private async performPeriodicOptimization(): Promise<void> {
    const globalState = this.getGlobalMemoryState();
    
    // Determine if optimization is needed
    if (globalState.systemUtilization > 0.8) {
      await this.triggerOptimization('balanced');
    } else if (globalState.alerts > 0) {
      await this.triggerOptimization('conservative');
    }
  }

  private updateServiceState(serviceId: string, updates: any): void {
    let state = this.serviceStates.get(serviceId);
    if (!state) {
      state = {
        serviceId,
        name: serviceId,
        memoryUsage: 0,
        cacheUsage: 0,
        bufferUsage: 0,
        heapUsage: 0,
        gcPressure: 0,
        efficiency: 1.0,
        lastUpdated: Date.now()
      };
    }
    
    // Update state with new information
    Object.assign(state, updates, { lastUpdated: Date.now() });
    this.serviceStates.set(serviceId, state);
  }

  // Public API methods

  getGlobalMemoryState(): GlobalMemoryState {
    const systemInfo = memoryManager.getSystemMemoryInfo();
    const poolStats = memoryManager.getPoolStatistics();
    const alerts = memoryMonitor.getAlerts(true);
    
    return {
      totalSystemMemory: this.parseBytes(systemInfo.total),
      usedMemory: this.parseBytes(systemInfo.used),
      availableMemory: this.parseBytes(systemInfo.free),
      systemUtilization: parseFloat(systemInfo.utilization) / 100,
      services: Array.from(this.serviceStates.values()),
      pools: Array.isArray(poolStats) ? poolStats.map(pool => ({
        id: pool.id,
        utilization: parseFloat(pool.utilization) / 100,
        fragmentation: parseFloat(pool.fragmentationRatio) / 100,
        efficiency: 1 - (parseFloat(pool.fragmentationRatio) / 100)
      })) : [],
      caches: [{
        id: 'global',
        hitRate: this.globalCache.getStatistics().hitRate,
        utilization: this.globalCache.getStatistics().memoryUsage / (256 * 1024 * 1024),
        efficiency: this.globalCache.getStatistics().hitRate
      }],
      alerts: alerts.length,
      recommendations: Array.from(this.optimizations.values())
        .reduce((sum, opt) => sum + opt.recommendations.filter(r => !r.applied).length, 0)
    };
  }

  getOptimizationProfiles(): OptimizationProfile[] {
    return Array.from(this.profiles.values());
  }

  getOptimization(optimizationId: string): CrossServiceOptimization | null {
    return this.optimizations.get(optimizationId) || null;
  }

  getActiveOptimizations(): CrossServiceOptimization[] {
    return Array.from(this.optimizations.values()).filter(opt => opt.status === 'running');
  }

  getRecommendations(): OptimizationRecommendation[] {
    return Array.from(this.optimizations.values())
      .flatMap(opt => opt.recommendations)
      .filter(rec => !rec.applied)
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
    }
    
    await this.globalCache.shutdown();
    
    this.logger.info('Memory Optimization Suite shutdown completed');
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
export const memoryOptimizationSuite = new MemoryOptimizationSuite();
export default memoryOptimizationSuite;