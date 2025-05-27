import { EventEmitter } from 'events';
import { createLogger } from './logging.js';

export interface MemoryAllocation {
  id: string;
  size: number;
  type: 'buffer' | 'tensor' | 'cache' | 'temporary' | 'persistent';
  owner: string;
  allocatedAt: number;
  lastAccessed: number;
  accessCount: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  data?: Buffer | any;
}

export interface MemoryPool {
  id: string;
  name: string;
  totalSize: number;
  allocatedSize: number;
  freeSize: number;
  blockSize: number;
  allocations: Map<string, MemoryAllocation>;
  fragments: MemoryFragment[];
  policy: AllocationPolicy;
  created: number;
  stats: PoolStatistics;
}

export interface MemoryFragment {
  offset: number;
  size: number;
  isFree: boolean;
  nextFragment?: string;
  prevFragment?: string;
}

export interface PoolStatistics {
  totalAllocations: number;
  totalDeallocations: number;
  totalFragmentations: number;
  averageAllocationSize: number;
  peakUsage: number;
  utilizationHistory: number[];
  fragmentationRatio: number;
}

export interface AllocationPolicy {
  strategy: 'first_fit' | 'best_fit' | 'worst_fit' | 'buddy_system';
  compactionThreshold: number;
  autoResize: boolean;
  maxSize: number;
  growthFactor: number;
}

export interface MemoryPressureEvent {
  type: 'warning' | 'critical' | 'emergency';
  currentUsage: number;
  threshold: number;
  availableMemory: number;
  recommendations: string[];
  timestamp: number;
}

export interface OptimizationResult {
  freed: number;
  defragmented: number;
  reallocated: number;
  timeSpent: number;
  improvements: string[];
}

export class DynamicMemoryManager extends EventEmitter {
  private logger = createLogger('DynamicMemoryManager');
  private pools = new Map<string, MemoryPool>();
  private globalAllocations = new Map<string, MemoryAllocation>();
  private memoryPressureThresholds = {
    warning: 0.65,   // 65% memory usage (earlier warning)
    critical: 0.80,  // 80% memory usage (earlier intervention)
    emergency: 0.90  // 90% memory usage (more room for recovery)
  };
  private optimizationInterval: NodeJS.Timeout | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private totalSystemMemory: number;
  private gcStrategy: 'aggressive' | 'balanced' | 'conservative' = 'balanced';
  private processEventHandlers: Array<{ event: string; handler: Function }> = [];
  private isShuttingDown = false;

  constructor(systemMemoryLimit?: number) {
    super();
    
    // Get system memory info (simplified - in real implementation would use os.totalmem())
    this.totalSystemMemory = systemMemoryLimit || 8 * 1024 * 1024 * 1024; // 8GB default
    
    this.initializeDefaultPools();
    this.startMemoryMonitoring();
    this.startPeriodicOptimization();
    
    // Handle process events with proper cleanup tracking
    this.setupProcessHandlers();
    
    this.logger.info('Dynamic Memory Manager initialized', {
      totalMemory: this.formatBytes(this.totalSystemMemory),
      gcStrategy: this.gcStrategy
    });
  }

  private initializeDefaultPools(): void {
    // Create default memory pools for different use cases
    const defaultPools = [
      {
        id: 'tensor-pool',
        name: 'Tensor Operations Pool',
        size: Math.floor(this.totalSystemMemory * 0.35), // 35% for tensors (reduced)
        blockSize: 1024 * 1024, // 1MB blocks
        policy: {
          strategy: 'buddy_system' as const,
          compactionThreshold: 0.25, // Earlier compaction
          autoResize: true,
          maxSize: Math.floor(this.totalSystemMemory * 0.5), // Reduced max
          growthFactor: 1.3 // More conservative growth
        }
      },
      {
        id: 'cache-pool',
        name: 'Caching Pool',
        size: Math.floor(this.totalSystemMemory * 0.30), // 30% for caching (increased)
        blockSize: 64 * 1024, // 64KB blocks
        policy: {
          strategy: 'best_fit' as const,
          compactionThreshold: 0.3, // Earlier compaction
          autoResize: true,
          maxSize: Math.floor(this.totalSystemMemory * 0.45), // Increased max
          growthFactor: 1.4 // Faster growth for caching
        }
      },
      {
        id: 'buffer-pool',
        name: 'Buffer Pool',
        size: Math.floor(this.totalSystemMemory * 0.2), // 20% for buffers
        blockSize: 32 * 1024, // 32KB blocks
        policy: {
          strategy: 'first_fit' as const,
          compactionThreshold: 0.5,
          autoResize: false,
          maxSize: Math.floor(this.totalSystemMemory * 0.3),
          growthFactor: 1.2
        }
      },
      {
        id: 'temporary-pool',
        name: 'Temporary Allocations Pool',
        size: Math.floor(this.totalSystemMemory * 0.1), // 10% for temporary
        blockSize: 8 * 1024, // 8KB blocks
        policy: {
          strategy: 'worst_fit' as const,
          compactionThreshold: 0.6,
          autoResize: true,
          maxSize: Math.floor(this.totalSystemMemory * 0.15),
          growthFactor: 1.1
        }
      }
    ];

    for (const poolConfig of defaultPools) {
      this.createPool(poolConfig.id, poolConfig.name, poolConfig.size, poolConfig.policy);
    }
  }

  createPool(
    id: string,
    name: string,
    initialSize: number,
    policy: AllocationPolicy
  ): void {
    if (this.pools.has(id)) {
      throw new Error(`Memory pool '${id}' already exists`);
    }

    const pool: MemoryPool = {
      id,
      name,
      totalSize: initialSize,
      allocatedSize: 0,
      freeSize: initialSize,
      blockSize: Math.max(1024, Math.floor(initialSize / 1000)), // Dynamic block size
      allocations: new Map(),
      fragments: [{ offset: 0, size: initialSize, isFree: true }],
      policy,
      created: Date.now(),
      stats: {
        totalAllocations: 0,
        totalDeallocations: 0,
        totalFragmentations: 0,
        averageAllocationSize: 0,
        peakUsage: 0,
        utilizationHistory: [],
        fragmentationRatio: 0
      }
    };

    this.pools.set(id, pool);
    this.logger.info(`Created memory pool: ${id}`, {
      name,
      size: this.formatBytes(initialSize),
      strategy: policy.strategy
    });
  }

  async allocate(
    size: number,
    type: MemoryAllocation['type'],
    owner: string,
    options: {
      poolId?: string;
      priority?: MemoryAllocation['priority'];
      tags?: string[];
      align?: number;
    } = {}
  ): Promise<string> {
    const {
      poolId = this.selectOptimalPool(size, type),
      priority = 'medium',
      tags = [],
      align = 8
    } = options;

    // Align size to specified alignment
    const alignedSize = Math.ceil(size / align) * align;

    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Memory pool '${poolId}' not found`);
    }

    // Check if we need to trigger memory pressure handling
    await this.checkMemoryPressure();

    // Try to allocate from the pool
    const allocation = await this.allocateFromPool(pool, alignedSize, type, owner, priority, tags);
    
    if (!allocation) {
      // Try optimization and retry once
      await this.optimizePool(poolId);
      const retryAllocation = await this.allocateFromPool(pool, alignedSize, type, owner, priority, tags);
      
      if (!retryAllocation) {
        // Try to expand pool if policy allows
        if (pool.policy.autoResize && pool.totalSize < pool.policy.maxSize) {
          await this.expandPool(poolId, alignedSize);
          const expandedAllocation = await this.allocateFromPool(pool, alignedSize, type, owner, priority, tags);
          if (expandedAllocation) {
            return expandedAllocation.id;
          }
        }
        
        throw new Error(`Unable to allocate ${this.formatBytes(alignedSize)} from pool '${poolId}'`);
      }
      
      return retryAllocation.id;
    }

    return allocation.id;
  }

  private selectOptimalPool(size: number, type: MemoryAllocation['type']): string {
    // Select best pool based on allocation type and size
    switch (type) {
      case 'tensor':
        return 'tensor-pool';
      case 'cache':
        return 'cache-pool';
      case 'buffer':
        return 'buffer-pool';
      case 'temporary':
        return 'temporary-pool';
      default:
        // Select based on size and availability
        const pools = Array.from(this.pools.values())
          .filter(pool => pool.freeSize >= size)
          .sort((a, b) => {
            const aUtilization = a.allocatedSize / a.totalSize;
            const bUtilization = b.allocatedSize / b.totalSize;
            return aUtilization - bUtilization; // Prefer less utilized pools
          });
        
        return pools.length > 0 ? pools[0].id : 'buffer-pool';
    }
  }

  private async allocateFromPool(
    pool: MemoryPool,
    size: number,
    type: MemoryAllocation['type'],
    owner: string,
    priority: MemoryAllocation['priority'],
    tags: string[]
  ): Promise<MemoryAllocation | null> {
    const fragment = this.findFreeFragment(pool, size);
    if (!fragment) {
      return null;
    }

    const allocationId = `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const allocation: MemoryAllocation = {
      id: allocationId,
      size,
      type,
      owner,
      allocatedAt: now,
      lastAccessed: now,
      accessCount: 0,
      priority,
      tags
    };

    // Update fragment
    if (fragment.size > size) {
      // Split fragment
      const newFragment: MemoryFragment = {
        offset: fragment.offset + size,
        size: fragment.size - size,
        isFree: true
      };
      pool.fragments.push(newFragment);
    }

    fragment.size = size;
    fragment.isFree = false;

    // Update pool stats
    pool.allocations.set(allocationId, allocation);
    pool.allocatedSize += size;
    pool.freeSize -= size;
    pool.stats.totalAllocations++;
    pool.stats.peakUsage = Math.max(pool.stats.peakUsage, pool.allocatedSize);
    pool.stats.averageAllocationSize = 
      (pool.stats.averageAllocationSize * (pool.stats.totalAllocations - 1) + size) / pool.stats.totalAllocations;

    // Update global tracking
    this.globalAllocations.set(allocationId, allocation);

    this.emit('allocated', { allocationId, poolId: pool.id, size, type, owner });
    
    return allocation;
  }

  private findFreeFragment(pool: MemoryPool, size: number): MemoryFragment | null {
    const freeFragments = pool.fragments.filter(f => f.isFree && f.size >= size);
    
    if (freeFragments.length === 0) {
      return null;
    }

    switch (pool.policy.strategy) {
      case 'first_fit':
        return freeFragments[0];
      
      case 'best_fit':
        return freeFragments.reduce((best, current) => 
          current.size < best.size ? current : best
        );
      
      case 'worst_fit':
        return freeFragments.reduce((worst, current) => 
          current.size > worst.size ? current : worst
        );
      
      case 'buddy_system':
        return this.findBuddyFragment(freeFragments, size);
      
      default:
        return freeFragments[0];
    }
  }

  private findBuddyFragment(fragments: MemoryFragment[], size: number): MemoryFragment | null {
    // Find the smallest power-of-2 fragment that can fit the allocation
    const powerOf2Size = Math.pow(2, Math.ceil(Math.log2(size)));
    
    const suitable = fragments.filter(f => f.size >= powerOf2Size);
    if (suitable.length === 0) {
      return null;
    }

    return suitable.reduce((best, current) => {
      const bestPowerSize = Math.pow(2, Math.floor(Math.log2(best.size)));
      const currentPowerSize = Math.pow(2, Math.floor(Math.log2(current.size)));
      return currentPowerSize < bestPowerSize ? current : best;
    });
  }

  async deallocate(allocationId: string): Promise<void> {
    const allocation = this.globalAllocations.get(allocationId);
    if (!allocation) {
      this.logger.warn(`Attempt to deallocate unknown allocation: ${allocationId}`);
      return;
    }

    // Find the pool containing this allocation
    let targetPool: MemoryPool | null = null;
    for (const pool of this.pools.values()) {
      if (pool.allocations.has(allocationId)) {
        targetPool = pool;
        break;
      }
    }

    if (!targetPool) {
      this.logger.error(`Pool not found for allocation: ${allocationId}`);
      return;
    }

    // Update pool stats
    targetPool.allocations.delete(allocationId);
    targetPool.allocatedSize -= allocation.size;
    targetPool.freeSize += allocation.size;
    targetPool.stats.totalDeallocations++;

    // Mark fragment as free
    const fragment = targetPool.fragments.find(f => 
      !f.isFree && f.size === allocation.size
    );
    
    if (fragment) {
      fragment.isFree = true;
      // Try to merge with adjacent free fragments
      await this.mergeAdjacentFragments(targetPool);
    }

    // Remove from global tracking
    this.globalAllocations.delete(allocationId);

    this.emit('deallocated', { 
      allocationId, 
      poolId: targetPool.id, 
      size: allocation.size,
      lifetime: Date.now() - allocation.allocatedAt
    });

    this.logger.debug(`Deallocated ${this.formatBytes(allocation.size)}`, {
      allocationId,
      pool: targetPool.id,
      lifetime: Date.now() - allocation.allocatedAt
    });
  }

  private async mergeAdjacentFragments(pool: MemoryPool): Promise<void> {
    const freeFragments = pool.fragments
      .filter(f => f.isFree)
      .sort((a, b) => a.offset - b.offset);

    let merged = false;
    
    for (let i = 0; i < freeFragments.length - 1; i++) {
      const current = freeFragments[i];
      const next = freeFragments[i + 1];
      
      if (current.offset + current.size === next.offset) {
        // Merge fragments
        current.size += next.size;
        const nextIndex = pool.fragments.indexOf(next);
        if (nextIndex !== -1) {
          pool.fragments.splice(nextIndex, 1);
        }
        merged = true;
      }
    }

    if (merged) {
      pool.stats.totalFragmentations--;
      // Recursively merge until no more adjacent fragments
      await this.mergeAdjacentFragments(pool);
    }
  }

  async optimizePool(poolId: string): Promise<OptimizationResult> {
    const pool = this.pools.get(poolId);
    if (!pool) {
      throw new Error(`Pool '${poolId}' not found`);
    }

    const startTime = Date.now();
    let freed = 0;
    let defragmented = 0;
    let reallocated = 0;
    const improvements: string[] = [];

    // 1. Garbage collect unused allocations
    const gcResult = await this.garbageCollectPool(pool);
    freed += gcResult.freed;
    if (gcResult.freed > 0) {
      improvements.push(`Freed ${this.formatBytes(gcResult.freed)} of unused memory`);
    }

    // 2. Defragment memory
    const defragResult = await this.defragmentPool(pool);
    defragmented += defragResult.compacted;
    if (defragResult.compacted > 0) {
      improvements.push(`Defragmented ${defragResult.mergedFragments} fragments`);
    }

    // 3. Optimize allocation order
    const reallocResult = await this.optimizeAllocationOrder(pool);
    reallocated += reallocResult.relocated;
    if (reallocResult.relocated > 0) {
      improvements.push(`Optimized ${reallocResult.relocated} allocations`);
    }

    // 4. Update fragmentation ratio
    pool.stats.fragmentationRatio = this.calculateFragmentationRatio(pool);

    const timeSpent = Date.now() - startTime;
    
    this.emit('poolOptimized', { 
      poolId, 
      freed, 
      defragmented, 
      reallocated, 
      timeSpent 
    });

    this.logger.info(`Optimized pool: ${poolId}`, {
      freed: this.formatBytes(freed),
      defragmented,
      reallocated,
      timeSpent: `${timeSpent}ms`,
      improvements
    });

    return { freed, defragmented, reallocated, timeSpent, improvements };
  }

  private async garbageCollectPool(pool: MemoryPool): Promise<{ freed: number; collected: number }> {
    const now = Date.now();
    let freed = 0;
    let collected = 0;

    const allocationsToFree: string[] = [];

    // Identify candidates for garbage collection
    for (const [id, allocation] of pool.allocations) {
      const age = now - allocation.lastAccessed;
      const shouldCollect = this.shouldGarbageCollect(allocation, age);
      
      if (shouldCollect) {
        allocationsToFree.push(id);
        freed += allocation.size;
        collected++;
      }
    }

    // Free identified allocations
    for (const allocationId of allocationsToFree) {
      await this.deallocate(allocationId);
    }

    return { freed, collected };
  }

  private shouldGarbageCollect(allocation: MemoryAllocation, age: number): boolean {
    const ageThresholds = {
      low: 30 * 60 * 1000,      // 30 minutes
      medium: 15 * 60 * 1000,   // 15 minutes  
      high: 5 * 60 * 1000,      // 5 minutes
      critical: 0               // Never auto-collect
    };

    const threshold = ageThresholds[allocation.priority];
    
    // Don't collect critical allocations automatically
    if (allocation.priority === 'critical') {
      return false;
    }

    // Consider type-specific rules
    switch (allocation.type) {
      case 'temporary':
        return age > Math.min(threshold, 5 * 60 * 1000); // Max 5 minutes for temporary
      case 'cache':
        return age > threshold && allocation.accessCount < 3; // Low access cache items
      case 'buffer':
        return age > threshold;
      default:
        return age > threshold && allocation.accessCount === 0; // Never accessed
    }
  }

  private async defragmentPool(pool: MemoryPool): Promise<{ compacted: number; mergedFragments: number }> {
    const initialFragments = pool.fragments.length;
    
    // Merge all adjacent free fragments
    await this.mergeAdjacentFragments(pool);
    
    const finalFragments = pool.fragments.length;
    const mergedFragments = initialFragments - finalFragments;
    
    // Calculate compacted memory
    const freeFragments = pool.fragments.filter(f => f.isFree);
    const compacted = freeFragments.reduce((sum, f) => sum + f.size, 0);

    return { compacted, mergedFragments };
  }

  private async optimizeAllocationOrder(pool: MemoryPool): Promise<{ relocated: number }> {
    // This is a simplified version - in practice would involve complex reallocation
    const allocations = Array.from(pool.allocations.values());
    
    // Sort by access frequency and priority
    allocations.sort((a, b) => {
      if (a.priority !== b.priority) {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.accessCount - a.accessCount;
    });

    // For now, just return count without actual relocation
    return { relocated: 0 };
  }

  private calculateFragmentationRatio(pool: MemoryPool): number {
    const freeFragments = pool.fragments.filter(f => f.isFree);
    if (freeFragments.length <= 1) return 0;
    
    const totalFreeSpace = freeFragments.reduce((sum, f) => sum + f.size, 0);
    const largestFreeFragment = Math.max(...freeFragments.map(f => f.size));
    
    return totalFreeSpace > 0 ? 1 - (largestFreeFragment / totalFreeSpace) : 0;
  }

  private async expandPool(poolId: string, requiredSize: number): Promise<void> {
    const pool = this.pools.get(poolId);
    if (!pool) return;

    const currentUsage = this.getCurrentMemoryUsage();
    const expansionSize = Math.max(
      requiredSize,
      Math.floor(pool.totalSize * (pool.policy.growthFactor - 1))
    );

    // Check if expansion would exceed system limits
    if (currentUsage + expansionSize > this.totalSystemMemory * 0.9) {
      throw new Error('Cannot expand pool: would exceed system memory limits');
    }

    pool.totalSize += expansionSize;
    pool.freeSize += expansionSize;
    
    // Add new free fragment
    pool.fragments.push({
      offset: pool.totalSize - expansionSize,
      size: expansionSize,
      isFree: true
    });

    this.logger.info(`Expanded pool: ${poolId}`, {
      expansion: this.formatBytes(expansionSize),
      newSize: this.formatBytes(pool.totalSize)
    });
  }

  private async checkMemoryPressure(): Promise<void> {
    const usage = this.getCurrentMemoryUsage();
    const ratio = usage / this.totalSystemMemory;

    if (ratio >= this.memoryPressureThresholds.emergency) {
      await this.handleMemoryPressure('emergency', ratio);
    } else if (ratio >= this.memoryPressureThresholds.critical) {
      await this.handleMemoryPressure('critical', ratio);
    } else if (ratio >= this.memoryPressureThresholds.warning) {
      await this.handleMemoryPressure('warning', ratio);
    }
  }

  private async handleMemoryPressure(
    type: 'warning' | 'critical' | 'emergency',
    ratio: number
  ): Promise<void> {
    const usage = this.getCurrentMemoryUsage();
    const available = this.totalSystemMemory - usage;
    const recommendations: string[] = [];

    switch (type) {
      case 'warning':
        recommendations.push('Consider cleaning temporary allocations');
        recommendations.push('Review cache retention policies');
        break;
        
      case 'critical':
        recommendations.push('Immediate garbage collection recommended');
        recommendations.push('Consider reducing cache sizes');
        // Trigger automatic optimization
        await this.optimizeAllPools();
        break;
        
      case 'emergency':
        recommendations.push('Emergency memory cleanup required');
        recommendations.push('Consider terminating non-critical processes');
        // Force aggressive garbage collection
        this.gcStrategy = 'aggressive';
        await this.forceGarbageCollection();
        break;
    }

    const event: MemoryPressureEvent = {
      type,
      currentUsage: usage,
      threshold: this.memoryPressureThresholds[type] * this.totalSystemMemory,
      availableMemory: available,
      recommendations,
      timestamp: Date.now()
    };

    this.emit('memoryPressure', event);
    
    this.logger.warn(`Memory pressure detected: ${type}`, {
      usage: this.formatBytes(usage),
      ratio: `${(ratio * 100).toFixed(1)}%`,
      available: this.formatBytes(available),
      recommendations
    });
  }

  private async optimizeAllPools(): Promise<void> {
    const poolIds = Array.from(this.pools.keys());
    const results = await Promise.all(
      poolIds.map(poolId => this.optimizePool(poolId))
    );

    const totalFreed = results.reduce((sum, result) => sum + result.freed, 0);
    
    this.logger.info('Optimized all pools', {
      pools: poolIds.length,
      totalFreed: this.formatBytes(totalFreed)
    });
  }

  private async forceGarbageCollection(): Promise<void> {
    this.logger.info('Forcing aggressive garbage collection');
    
    // Force Node.js garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Aggressively clean up temporary and cache allocations
    for (const pool of this.pools.values()) {
      const allocationsToFree: string[] = [];
      
      for (const [id, allocation] of pool.allocations) {
        if (allocation.type === 'temporary' || 
           (allocation.type === 'cache' && allocation.priority !== 'critical')) {
          allocationsToFree.push(id);
        }
      }
      
      for (const allocationId of allocationsToFree) {
        await this.deallocate(allocationId);
      }
    }
  }

  private getCurrentMemoryUsage(): number {
    return Array.from(this.pools.values())
      .reduce((total, pool) => total + pool.allocatedSize, 0);
  }

  private startMemoryMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.updatePoolStatistics();
      this.checkMemoryPressure();
      this.emitMemoryMetrics();
    }, 3000); // Monitor every 3 seconds for faster response
  }

  private emitMemoryMetrics(): void {
    const usage = this.getCurrentMemoryUsage();
    const ratio = usage / this.totalSystemMemory;
    
    this.emit('memoryMetrics', {
      timestamp: Date.now(),
      totalUsage: usage,
      utilization: ratio,
      pools: Array.from(this.pools.entries()).map(([id, pool]) => ({
        id,
        utilization: pool.allocatedSize / pool.totalSize,
        fragmentation: pool.stats.fragmentationRatio,
        allocations: pool.allocations.size
      }))
    });
  }

  private startPeriodicOptimization(): void {
    this.optimizationInterval = setInterval(() => {
      this.performPeriodicOptimization();
    }, 60000); // Optimize every minute
  }

  private updatePoolStatistics(): void {
    for (const pool of this.pools.values()) {
      const utilization = pool.allocatedSize / pool.totalSize;
      pool.stats.utilizationHistory.push(utilization);
      
      // Keep only last 100 data points
      if (pool.stats.utilizationHistory.length > 100) {
        pool.stats.utilizationHistory.shift();
      }
      
      pool.stats.fragmentationRatio = this.calculateFragmentationRatio(pool);
    }
  }

  private async performPeriodicOptimization(): void {
    // Only optimize pools with high fragmentation or low utilization
    for (const [poolId, pool] of this.pools) {
      const shouldOptimize = 
        pool.stats.fragmentationRatio > pool.policy.compactionThreshold ||
        pool.freeSize / pool.totalSize > 0.5; // More than 50% free
        
      if (shouldOptimize) {
        try {
          await this.optimizePool(poolId);
        } catch (error) {
          this.logger.error(`Failed to optimize pool ${poolId}:`, error);
        }
      }
    }
  }

  // Public API methods
  
  getPoolStatistics(poolId?: string): any {
    if (poolId) {
      const pool = this.pools.get(poolId);
      return pool ? this.formatPoolStats(pool) : null;
    }
    
    return Array.from(this.pools.entries()).map(([id, pool]) => ({
      id,
      ...this.formatPoolStats(pool)
    }));
  }

  private formatPoolStats(pool: MemoryPool): any {
    const utilization = pool.totalSize > 0 ? pool.allocatedSize / pool.totalSize : 0;
    
    return {
      name: pool.name,
      totalSize: this.formatBytes(pool.totalSize),
      allocatedSize: this.formatBytes(pool.allocatedSize),
      freeSize: this.formatBytes(pool.freeSize),
      utilization: `${(utilization * 100).toFixed(1)}%`,
      allocations: pool.allocations.size,
      fragments: pool.fragments.length,
      fragmentationRatio: `${(pool.stats.fragmentationRatio * 100).toFixed(1)}%`,
      peakUsage: this.formatBytes(pool.stats.peakUsage),
      totalAllocations: pool.stats.totalAllocations,
      totalDeallocations: pool.stats.totalDeallocations,
      averageAllocationSize: this.formatBytes(pool.stats.averageAllocationSize)
    };
  }

  getSystemMemoryInfo(): any {
    const used = this.getCurrentMemoryUsage();
    const utilization = used / this.totalSystemMemory;
    
    return {
      total: this.formatBytes(this.totalSystemMemory),
      used: this.formatBytes(used),
      free: this.formatBytes(this.totalSystemMemory - used),
      utilization: `${(utilization * 100).toFixed(1)}%`,
      pools: this.pools.size,
      totalAllocations: this.globalAllocations.size,
      gcStrategy: this.gcStrategy,
      thresholds: {
        warning: `${(this.memoryPressureThresholds.warning * 100).toFixed(0)}%`,
        critical: `${(this.memoryPressureThresholds.critical * 100).toFixed(0)}%`,
        emergency: `${(this.memoryPressureThresholds.emergency * 100).toFixed(0)}%`
      }
    };
  }

  setGCStrategy(strategy: 'aggressive' | 'balanced' | 'conservative'): void {
    this.gcStrategy = strategy;
    this.logger.info(`Changed GC strategy to: ${strategy}`);
  }

  updateMemoryThresholds(thresholds: Partial<typeof this.memoryPressureThresholds>): void {
    Object.assign(this.memoryPressureThresholds, thresholds);
    this.logger.info('Updated memory pressure thresholds', this.memoryPressureThresholds);
  }

  private async cleanup(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
      this.optimizationInterval = null;
    }
    
    // Deallocate all remaining allocations
    const allocationIds = Array.from(this.globalAllocations.keys());
    for (const id of allocationIds) {
      try {
        await this.deallocate(id);
      } catch (error) {
        this.logger.error(`Failed to deallocate ${id} during cleanup:`, error);
      }
    }
    
    this.logger.info('Dynamic Memory Manager cleanup completed');
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  private setupProcessHandlers(): void {
    const exitHandler = async () => {
      if (!this.isShuttingDown) {
        this.isShuttingDown = true;
        await this.cleanup();
      }
    };

    const events = ['exit', 'SIGINT', 'SIGTERM'];
    events.forEach(event => {
      process.on(event, exitHandler);
      this.processEventHandlers.push({ event, handler: exitHandler });
    });
  }

  async destroy(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    // Remove process event handlers
    this.processEventHandlers.forEach(({ event, handler }) => {
      process.removeListener(event, handler as any);
    });
    this.processEventHandlers = [];

    // Cleanup resources
    await this.cleanup();
    
    // Clear all allocations
    this.globalAllocations.clear();
    this.pools.clear();
    
    // Remove all event listeners
    this.removeAllListeners();
    
    this.logger.info('Memory Manager destroyed');
  }
}

// Export singleton instance
export const memoryManager = new DynamicMemoryManager();
export default memoryManager;