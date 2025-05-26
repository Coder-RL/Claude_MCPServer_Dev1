import { DatabasePool } from '../../database/pg-pool.js';
import { RedisConnectionManager } from '../../database/redis-client.js';
import { getLogger } from '../../shared/logger.js';

const logger = getLogger('ResourceManager');

export interface ResourceQuota {
  cpu: number;
  memory: number;
  storage: number;
  connections: number;
}

export interface ResourceUsage {
  cpu: number;
  memory: number;
  storage: number;
  connections: number;
  timestamp: number;
}

export interface ResourceAllocation {
  id: string;
  serviceId: string;
  serviceName: string;
  allocated: ResourceQuota;
  used: ResourceUsage;
  status: 'active' | 'pending' | 'released' | 'exceeded';
  createdAt: Date;
  updatedAt: Date;
}

export interface ResourcePool {
  name: string;
  total: ResourceQuota;
  allocated: ResourceQuota;
  available: ResourceQuota;
  efficiency: number;
}

export interface AllocationRequest {
  serviceId: string;
  serviceName: string;
  requested: ResourceQuota;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
}

export interface ResourceMetrics {
  totalAllocations: number;
  activeAllocations: number;
  pendingAllocations: number;
  exceededAllocations: number;
  allocationSuccessRate: number;
  averageAllocationTime: number;
  resourceEfficiency: number;
}

export class ResourceManager {
  private db: DatabasePool;
  private redis: RedisConnectionManager;
  private pools: Map<string, ResourcePool> = new Map();
  private allocations: Map<string, ResourceAllocation> = new Map();
  private metrics: ResourceMetrics = {
    totalAllocations: 0,
    activeAllocations: 0,
    pendingAllocations: 0,
    exceededAllocations: 0,
    allocationSuccessRate: 0,
    averageAllocationTime: 0,
    resourceEfficiency: 0,
  };
  private monitoringInterval: NodeJS.Timeout | null = null;
  private shutdownPromise: Promise<void> | null = null;

  constructor(db: DatabasePool, redis: RedisConnectionManager) {
    this.db = db;
    this.redis = redis;
    this.setupDefaultPools();
    this.setupSignalHandlers();
  }

  private setupDefaultPools(): void {
    this.pools.set('default', {
      name: 'default',
      total: { cpu: 8, memory: 32768, storage: 1048576, connections: 1000 },
      allocated: { cpu: 0, memory: 0, storage: 0, connections: 0 },
      available: { cpu: 8, memory: 32768, storage: 1048576, connections: 1000 },
      efficiency: 0,
    });

    this.pools.set('high-performance', {
      name: 'high-performance',
      total: { cpu: 16, memory: 65536, storage: 2097152, connections: 2000 },
      allocated: { cpu: 0, memory: 0, storage: 0, connections: 0 },
      available: { cpu: 16, memory: 65536, storage: 2097152, connections: 2000 },
      efficiency: 0,
    });

    this.pools.set('development', {
      name: 'development',
      total: { cpu: 4, memory: 8192, storage: 262144, connections: 200 },
      allocated: { cpu: 0, memory: 0, storage: 0, connections: 0 },
      available: { cpu: 4, memory: 8192, storage: 262144, connections: 200 },
      efficiency: 0,
    });
  }

  private setupSignalHandlers(): void {
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async initialize(): Promise<void> {
    try {
      await this.loadExistingAllocations();
      await this.startMonitoring();
      logger.info('Resource Manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Resource Manager', { error });
      throw error;
    }
  }

  private async loadExistingAllocations(): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT id, service_id, service_name, allocated_cpu, allocated_memory, 
               allocated_storage, allocated_connections, used_cpu, used_memory,
               used_storage, used_connections, status, created_at, updated_at
        FROM orchestration.resource_allocations
        WHERE status IN ('active', 'pending')
      `);

      for (const row of result.rows) {
        const allocation: ResourceAllocation = {
          id: row.id,
          serviceId: row.service_id,
          serviceName: row.service_name,
          allocated: {
            cpu: row.allocated_cpu,
            memory: row.allocated_memory,
            storage: row.allocated_storage,
            connections: row.allocated_connections,
          },
          used: {
            cpu: row.used_cpu || 0,
            memory: row.used_memory || 0,
            storage: row.used_storage || 0,
            connections: row.used_connections || 0,
            timestamp: Date.now(),
          },
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };

        this.allocations.set(allocation.id, allocation);
        this.updatePoolAllocations(allocation, 'allocate');
      }

      this.updateMetrics();
      logger.info(`Loaded ${result.rows.length} existing resource allocations`);
    } catch (error) {
      logger.error('Failed to load existing allocations', { error });
      throw error;
    }
  }

  async requestAllocation(request: AllocationRequest, poolName = 'default'): Promise<string> {
    const allocationId = `alloc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      const pool = this.pools.get(poolName);
      if (!pool) {
        throw new Error(`Resource pool '${poolName}' not found`);
      }

      if (!this.canAllocate(pool, request.requested)) {
        if (request.priority === 'critical') {
          await this.reclaimResources(request.requested, poolName);
        } else {
          throw new Error('Insufficient resources available');
        }
      }

      const allocation: ResourceAllocation = {
        id: allocationId,
        serviceId: request.serviceId,
        serviceName: request.serviceName,
        allocated: request.requested,
        used: { cpu: 0, memory: 0, storage: 0, connections: 0, timestamp: Date.now() },
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await this.db.query(`
        INSERT INTO orchestration.resource_allocations 
        (id, service_id, service_name, allocated_cpu, allocated_memory, 
         allocated_storage, allocated_connections, status, pool_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        allocation.id,
        allocation.serviceId,
        allocation.serviceName,
        allocation.allocated.cpu,
        allocation.allocated.memory,
        allocation.allocated.storage,
        allocation.allocated.connections,
        allocation.status,
        poolName,
      ]);

      this.allocations.set(allocationId, allocation);
      this.updatePoolAllocations(allocation, 'allocate');

      await this.activateAllocation(allocationId);

      const allocationTime = Date.now() - startTime;
      this.updateAllocationMetrics(allocationTime, true);

      logger.info(`Resource allocation successful`, {
        allocationId,
        serviceId: request.serviceId,
        serviceName: request.serviceName,
        requested: request.requested,
        poolName,
        allocationTime,
      });

      return allocationId;
    } catch (error) {
      this.updateAllocationMetrics(Date.now() - startTime, false);
      logger.error(`Resource allocation failed`, { 
        allocationId,
        serviceId: request.serviceId,
        error 
      });
      throw error;
    }
  }

  private canAllocate(pool: ResourcePool, requested: ResourceQuota): boolean {
    return (
      pool.available.cpu >= requested.cpu &&
      pool.available.memory >= requested.memory &&
      pool.available.storage >= requested.storage &&
      pool.available.connections >= requested.connections
    );
  }

  private async reclaimResources(needed: ResourceQuota, poolName: string): Promise<void> {
    logger.info(`Attempting to reclaim resources for critical allocation`, { needed, poolName });

    const lowPriorityAllocations = Array.from(this.allocations.values())
      .filter(alloc => alloc.status === 'active')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    let reclaimedCpu = 0;
    let reclaimedMemory = 0;
    let reclaimedStorage = 0;
    let reclaimedConnections = 0;

    for (const allocation of lowPriorityAllocations) {
      if (
        reclaimedCpu >= needed.cpu &&
        reclaimedMemory >= needed.memory &&
        reclaimedStorage >= needed.storage &&
        reclaimedConnections >= needed.connections
      ) {
        break;
      }

      await this.releaseAllocation(allocation.id);
      reclaimedCpu += allocation.allocated.cpu;
      reclaimedMemory += allocation.allocated.memory;
      reclaimedStorage += allocation.allocated.storage;
      reclaimedConnections += allocation.allocated.connections;

      logger.info(`Reclaimed resources from allocation`, {
        allocationId: allocation.id,
        serviceId: allocation.serviceId,
        reclaimed: allocation.allocated,
      });
    }

    if (
      reclaimedCpu < needed.cpu ||
      reclaimedMemory < needed.memory ||
      reclaimedStorage < needed.storage ||
      reclaimedConnections < needed.connections
    ) {
      throw new Error('Unable to reclaim sufficient resources');
    }
  }

  private async activateAllocation(allocationId: string): Promise<void> {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      throw new Error(`Allocation ${allocationId} not found`);
    }

    allocation.status = 'active';
    allocation.updatedAt = new Date();

    await this.db.query(`
      UPDATE orchestration.resource_allocations 
      SET status = $1, updated_at = $2
      WHERE id = $3
    `, ['active', allocation.updatedAt, allocationId]);

    await this.redis.setJSON(`allocation:${allocationId}`, allocation, 3600);

    logger.debug(`Activated allocation ${allocationId}`);
  }

  async releaseAllocation(allocationId: string): Promise<void> {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      logger.warn(`Allocation ${allocationId} not found for release`);
      return;
    }

    try {
      allocation.status = 'released';
      allocation.updatedAt = new Date();

      await this.db.query(`
        UPDATE orchestration.resource_allocations 
        SET status = $1, updated_at = $2
        WHERE id = $3
      `, ['released', allocation.updatedAt, allocationId]);

      this.updatePoolAllocations(allocation, 'release');
      this.allocations.delete(allocationId);

      await this.redis.getClient().del(`allocation:${allocationId}`);

      logger.info(`Released allocation ${allocationId}`, {
        serviceId: allocation.serviceId,
        resources: allocation.allocated,
      });
    } catch (error) {
      logger.error(`Failed to release allocation ${allocationId}`, { error });
      throw error;
    }
  }

  async updateResourceUsage(allocationId: string, usage: ResourceUsage): Promise<void> {
    const allocation = this.allocations.get(allocationId);
    if (!allocation) {
      throw new Error(`Allocation ${allocationId} not found`);
    }

    allocation.used = { ...usage, timestamp: Date.now() };
    allocation.updatedAt = new Date();

    await this.db.query(`
      UPDATE orchestration.resource_allocations 
      SET used_cpu = $1, used_memory = $2, used_storage = $3, 
          used_connections = $4, updated_at = $5
      WHERE id = $6
    `, [
      usage.cpu,
      usage.memory,
      usage.storage,
      usage.connections,
      allocation.updatedAt,
      allocationId,
    ]);

    if (this.isResourceExceeded(allocation)) {
      allocation.status = 'exceeded';
      await this.handleResourceExceeded(allocation);
    }

    await this.redis.setJSON(`allocation:${allocationId}`, allocation, 3600);
  }

  private isResourceExceeded(allocation: ResourceAllocation): boolean {
    return (
      allocation.used.cpu > allocation.allocated.cpu * 1.1 ||
      allocation.used.memory > allocation.allocated.memory * 1.1 ||
      allocation.used.storage > allocation.allocated.storage ||
      allocation.used.connections > allocation.allocated.connections
    );
  }

  private async handleResourceExceeded(allocation: ResourceAllocation): Promise<void> {
    logger.warn(`Resource usage exceeded for allocation`, {
      allocationId: allocation.id,
      serviceId: allocation.serviceId,
      allocated: allocation.allocated,
      used: allocation.used,
    });

    this.metrics.exceededAllocations++;

    await this.db.query(`
      UPDATE orchestration.resource_allocations 
      SET status = $1, updated_at = $2
      WHERE id = $3
    `, ['exceeded', new Date(), allocation.id]);
  }

  private updatePoolAllocations(allocation: ResourceAllocation, operation: 'allocate' | 'release'): void {
    const pools = Array.from(this.pools.values());
    
    for (const pool of pools) {
      if (operation === 'allocate') {
        pool.allocated.cpu += allocation.allocated.cpu;
        pool.allocated.memory += allocation.allocated.memory;
        pool.allocated.storage += allocation.allocated.storage;
        pool.allocated.connections += allocation.allocated.connections;

        pool.available.cpu -= allocation.allocated.cpu;
        pool.available.memory -= allocation.allocated.memory;
        pool.available.storage -= allocation.allocated.storage;
        pool.available.connections -= allocation.allocated.connections;
      } else {
        pool.allocated.cpu -= allocation.allocated.cpu;
        pool.allocated.memory -= allocation.allocated.memory;
        pool.allocated.storage -= allocation.allocated.storage;
        pool.allocated.connections -= allocation.allocated.connections;

        pool.available.cpu += allocation.allocated.cpu;
        pool.available.memory += allocation.allocated.memory;
        pool.available.storage += allocation.allocated.storage;
        pool.available.connections += allocation.allocated.connections;
      }

      pool.efficiency = this.calculatePoolEfficiency(pool);
    }
  }

  private calculatePoolEfficiency(pool: ResourcePool): number {
    const cpuEfficiency = pool.allocated.cpu / pool.total.cpu;
    const memoryEfficiency = pool.allocated.memory / pool.total.memory;
    const storageEfficiency = pool.allocated.storage / pool.total.storage;
    const connectionEfficiency = pool.allocated.connections / pool.total.connections;

    return (cpuEfficiency + memoryEfficiency + storageEfficiency + connectionEfficiency) / 4;
  }

  private async startMonitoring(): Promise<void> {
    this.monitoringInterval = setInterval(() => {
      this.updateMetrics();
      this.cleanupStaleAllocations();
    }, 30000);

    logger.info('Started resource monitoring');
  }

  private updateMetrics(): void {
    const allocations = Array.from(this.allocations.values());
    
    this.metrics.totalAllocations = allocations.length;
    this.metrics.activeAllocations = allocations.filter(a => a.status === 'active').length;
    this.metrics.pendingAllocations = allocations.filter(a => a.status === 'pending').length;
    this.metrics.exceededAllocations = allocations.filter(a => a.status === 'exceeded').length;

    const pools = Array.from(this.pools.values());
    this.metrics.resourceEfficiency = pools.reduce((sum, pool) => sum + pool.efficiency, 0) / pools.length;
  }

  private updateAllocationMetrics(allocationTime: number, success: boolean): void {
    if (success) {
      const currentAvg = this.metrics.averageAllocationTime;
      const currentCount = this.metrics.totalAllocations;
      this.metrics.averageAllocationTime = (currentAvg * currentCount + allocationTime) / (currentCount + 1);
    }

    const successfulAllocations = this.metrics.totalAllocations * this.metrics.allocationSuccessRate;
    const totalAttempts = this.metrics.totalAllocations + (success ? 1 : 0);
    const newSuccessful = successfulAllocations + (success ? 1 : 0);
    
    this.metrics.allocationSuccessRate = totalAttempts > 0 ? newSuccessful / totalAttempts : 0;
  }

  private async cleanupStaleAllocations(): Promise<void> {
    const staleThreshold = Date.now() - (24 * 60 * 60 * 1000);
    
    try {
      await this.db.query(`
        UPDATE orchestration.resource_allocations 
        SET status = 'released', updated_at = NOW()
        WHERE status = 'pending' AND created_at < $1
      `, [new Date(staleThreshold)]);
    } catch (error) {
      logger.error('Failed to cleanup stale allocations', { error });
    }
  }

  getResourcePools(): ResourcePool[] {
    return Array.from(this.pools.values());
  }

  getAllocation(allocationId: string): ResourceAllocation | undefined {
    return this.allocations.get(allocationId);
  }

  getAllocations(serviceId?: string): ResourceAllocation[] {
    const allocations = Array.from(this.allocations.values());
    return serviceId ? allocations.filter(a => a.serviceId === serviceId) : allocations;
  }

  getMetrics(): ResourceMetrics {
    return { ...this.metrics };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const dbHealth = await this.db.healthCheck();
      const redisHealth = await this.redis.healthCheck();
      
      return {
        healthy: dbHealth.healthy && redisHealth.healthy,
        details: {
          database: dbHealth,
          redis: redisHealth,
          metrics: this.metrics,
          pools: this.getResourcePools(),
          allocations: this.metrics.activeAllocations,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    logger.info('Shutting down Resource Manager...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    const activeAllocations = Array.from(this.allocations.values())
      .filter(a => a.status === 'active');

    for (const allocation of activeAllocations) {
      try {
        await this.releaseAllocation(allocation.id);
      } catch (error) {
        logger.error(`Failed to release allocation during shutdown: ${allocation.id}`, { error });
      }
    }

    logger.info('Resource Manager shutdown complete');
  }
}