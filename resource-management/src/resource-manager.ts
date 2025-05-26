import { EventEmitter } from 'events';
import { cpus, freemem, totalmem, loadavg } from 'os';

export interface Resource {
  id: string;
  name: string;
  type: 'cpu' | 'memory' | 'storage' | 'network' | 'gpu' | 'custom';
  capacity: number;
  allocated: number;
  available: number;
  unit: string;
  attributes: Record<string, any>;
  tags: string[];
  lastUpdated: Date;
  status: 'healthy' | 'degraded' | 'critical' | 'offline';
}

export interface ResourceRequest {
  id: string;
  requester: string;
  resources: ResourceRequirement[];
  priority: 'low' | 'normal' | 'high' | 'critical';
  deadline?: Date;
  constraints?: ResourceConstraint[];
  preferences?: ResourcePreference[];
  metadata: Record<string, any>;
  status: 'pending' | 'approved' | 'allocated' | 'rejected' | 'completed' | 'failed';
  createdAt: Date;
  allocatedAt?: Date;
  completedAt?: Date;
}

export interface ResourceRequirement {
  type: string;
  amount: number;
  unit: string;
  duration: number; // seconds, -1 for permanent
  scalable: boolean;
  minAmount?: number;
  maxAmount?: number;
  attributes?: Record<string, any>;
}

export interface ResourceConstraint {
  type: 'affinity' | 'anti-affinity' | 'location' | 'attribute' | 'custom';
  target: string;
  operator: 'equals' | 'not-equals' | 'greater-than' | 'less-than' | 'contains' | 'matches';
  value: any;
  weight: number;
}

export interface ResourcePreference {
  type: 'affinity' | 'anti-affinity' | 'location' | 'attribute' | 'cost';
  target: string;
  operator: 'equals' | 'not-equals' | 'greater-than' | 'less-than' | 'contains' | 'matches';
  value: any;
  weight: number;
}

export interface ResourceAllocation {
  id: string;
  requestId: string;
  resourceId: string;
  amount: number;
  unit: string;
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'expired' | 'released' | 'failed';
  metrics: AllocationMetrics;
}

export interface AllocationMetrics {
  utilization: number;
  efficiency: number;
  performance: number;
  cost: number;
  lastMeasured: Date;
}

export interface ScalingPolicy {
  id: string;
  name: string;
  target: string;
  enabled: boolean;
  triggers: ScalingTrigger[];
  actions: ScalingAction[];
  cooldown: number; // seconds
  minInstances: number;
  maxInstances: number;
  lastTriggered?: Date;
}

export interface ScalingTrigger {
  id: string;
  type: 'metric' | 'schedule' | 'event';
  metric?: string;
  threshold?: number;
  operator?: 'greater-than' | 'less-than' | 'equals';
  duration?: number; // seconds
  schedule?: string; // cron expression
  event?: string;
}

export interface ScalingAction {
  id: string;
  type: 'scale-up' | 'scale-down' | 'scale-to';
  amount: number;
  unit: 'instances' | 'percentage' | 'absolute';
  delay?: number; // seconds
}

export interface ResourcePool {
  id: string;
  name: string;
  description: string;
  resources: string[];
  capacity: Record<string, number>;
  allocated: Record<string, number>;
  reservations: ResourceReservation[];
  policies: PoolPolicy[];
  enabled: boolean;
}

export interface ResourceReservation {
  id: string;
  poolId: string;
  resourceType: string;
  amount: number;
  reservedBy: string;
  startTime: Date;
  endTime: Date;
  status: 'active' | 'expired' | 'cancelled';
}

export interface PoolPolicy {
  id: string;
  name: string;
  type: 'quota' | 'priority' | 'access' | 'scheduling';
  configuration: Record<string, any>;
  enabled: boolean;
}

export interface ResourceMetrics {
  resourceId: string;
  timestamp: Date;
  utilization: number;
  performance: number;
  availability: number;
  errors: number;
  latency: number;
  throughput: number;
  customMetrics: Record<string, number>;
}

export class ResourceManager extends EventEmitter {
  private resources = new Map<string, Resource>();
  private requests = new Map<string, ResourceRequest>();
  private allocations = new Map<string, ResourceAllocation>();
  private scalingPolicies = new Map<string, ScalingPolicy>();
  private resourcePools = new Map<string, ResourcePool>();
  private metrics: ResourceMetrics[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private scalingInterval: NodeJS.Timeout | null = null;
  private requestQueue: ResourceRequest[] = [];
  private allocationScheduler: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeSystemResources();
    this.startMonitoring();
    this.startAutoScaling();
    this.startAllocationScheduler();
  }

  private initializeSystemResources(): void {
    // Initialize CPU resources
    const cpuCount = cpus().length;
    this.addResource({
      id: 'system-cpu',
      name: 'System CPU',
      type: 'cpu',
      capacity: cpuCount,
      allocated: 0,
      available: cpuCount,
      unit: 'cores',
      attributes: {
        architecture: process.arch,
        model: cpus()[0]?.model || 'unknown'
      },
      tags: ['system', 'compute'],
      lastUpdated: new Date(),
      status: 'healthy'
    });

    // Initialize Memory resources
    const totalMemory = totalmem();
    this.addResource({
      id: 'system-memory',
      name: 'System Memory',
      type: 'memory',
      capacity: totalMemory,
      allocated: 0,
      available: totalMemory,
      unit: 'bytes',
      attributes: {
        type: 'RAM'
      },
      tags: ['system', 'memory'],
      lastUpdated: new Date(),
      status: 'healthy'
    });

    // Create default resource pool
    this.createResourcePool({
      id: 'default-pool',
      name: 'Default Resource Pool',
      description: 'Default pool for system resources',
      resources: ['system-cpu', 'system-memory'],
      capacity: {
        cpu: cpuCount,
        memory: totalMemory
      },
      allocated: {
        cpu: 0,
        memory: 0
      },
      reservations: [],
      policies: [],
      enabled: true
    });
  }

  addResource(resource: Resource): void {
    this.resources.set(resource.id, resource);
    this.emit('resource-added', resource);
  }

  removeResource(resourceId: string): boolean {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      return false;
    }

    // Check if resource is allocated
    const activeAllocations = Array.from(this.allocations.values())
      .filter(a => a.resourceId === resourceId && a.status === 'active');
    
    if (activeAllocations.length > 0) {
      throw new Error(`Cannot remove resource ${resourceId}: has active allocations`);
    }

    this.resources.delete(resourceId);
    this.emit('resource-removed', { resourceId });
    return true;
  }

  async requestResources(request: Omit<ResourceRequest, 'id' | 'status' | 'createdAt'>): Promise<string> {
    const resourceRequest: ResourceRequest = {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending',
      createdAt: new Date(),
      ...request
    };

    this.requests.set(resourceRequest.id, resourceRequest);
    this.requestQueue.push(resourceRequest);
    
    this.emit('resource-request-created', resourceRequest);
    
    // Try immediate allocation for high priority requests
    if (resourceRequest.priority === 'critical' || resourceRequest.priority === 'high') {
      await this.processResourceRequest(resourceRequest.id);
    }

    return resourceRequest.id;
  }

  private async processResourceRequest(requestId: string): Promise<void> {
    const request = this.requests.get(requestId);
    if (!request || request.status !== 'pending') {
      return;
    }

    try {
      // Find suitable resources
      const allocation = await this.findAndAllocateResources(request);
      
      if (allocation) {
        request.status = 'allocated';
        request.allocatedAt = new Date();
        
        this.emit('resource-request-allocated', { requestId, allocation });
      } else {
        // Check if we can scale to meet demand
        const canScale = await this.checkScalingOpportunity(request);
        
        if (canScale) {
          request.status = 'pending'; // Keep pending for scaling
          await this.triggerScaling(request);
        } else {
          request.status = 'rejected';
          this.emit('resource-request-rejected', { requestId, reason: 'Insufficient resources' });
        }
      }
    } catch (error) {
      request.status = 'failed';
      this.emit('resource-request-failed', { requestId, error: (error as Error).message });
    }
  }

  private async findAndAllocateResources(request: ResourceRequest): Promise<ResourceAllocation[] | null> {
    const allocations: ResourceAllocation[] = [];

    for (const requirement of request.resources) {
      const resource = this.findSuitableResource(requirement, request.constraints, request.preferences);
      
      if (!resource) {
        // Rollback previous allocations
        for (const allocation of allocations) {
          await this.releaseAllocation(allocation.id);
        }
        return null;
      }

      // Create allocation
      const allocation: ResourceAllocation = {
        id: `alloc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        requestId: request.id,
        resourceId: resource.id,
        amount: requirement.amount,
        unit: requirement.unit,
        startTime: new Date(),
        endTime: requirement.duration > 0 ? new Date(Date.now() + requirement.duration * 1000) : undefined,
        status: 'active',
        metrics: {
          utilization: 0,
          efficiency: 0,
          performance: 0,
          cost: 0,
          lastMeasured: new Date()
        }
      };

      // Update resource allocation
      resource.allocated += requirement.amount;
      resource.available -= requirement.amount;
      resource.lastUpdated = new Date();

      this.allocations.set(allocation.id, allocation);
      allocations.push(allocation);
    }

    return allocations;
  }

  private findSuitableResource(
    requirement: ResourceRequirement,
    constraints?: ResourceConstraint[],
    preferences?: ResourcePreference[]
  ): Resource | null {
    const candidates = Array.from(this.resources.values())
      .filter(r => r.type === requirement.type)
      .filter(r => r.available >= requirement.amount)
      .filter(r => r.status === 'healthy' || r.status === 'degraded');

    if (candidates.length === 0) {
      return null;
    }

    // Apply constraints
    let filteredCandidates = constraints ? this.applyConstraints(candidates, constraints) : candidates;
    
    if (filteredCandidates.length === 0) {
      return null;
    }

    // Apply preferences and score
    if (preferences && preferences.length > 0) {
      filteredCandidates = this.scoreAndSortByPreferences(filteredCandidates, preferences);
    }

    return filteredCandidates[0];
  }

  private applyConstraints(resources: Resource[], constraints: ResourceConstraint[]): Resource[] {
    return resources.filter(resource => {
      return constraints.every(constraint => {
        switch (constraint.type) {
          case 'attribute':
            return this.evaluateConstraint(resource.attributes[constraint.target], constraint.operator, constraint.value);
          case 'location':
            return this.evaluateConstraint(resource.attributes.location, constraint.operator, constraint.value);
          case 'affinity':
            // Check if resource has affinity to target
            return resource.tags.includes(constraint.value);
          case 'anti-affinity':
            // Check if resource does not have anti-affinity to target
            return !resource.tags.includes(constraint.value);
          default:
            return true;
        }
      });
    });
  }

  private evaluateConstraint(value: any, operator: string, target: any): boolean {
    switch (operator) {
      case 'equals':
        return value === target;
      case 'not-equals':
        return value !== target;
      case 'greater-than':
        return value > target;
      case 'less-than':
        return value < target;
      case 'contains':
        return Array.isArray(value) ? value.includes(target) : String(value).includes(target);
      case 'matches':
        return new RegExp(target).test(String(value));
      default:
        return true;
    }
  }

  private scoreAndSortByPreferences(resources: Resource[], preferences: ResourcePreference[]): Resource[] {
    const scoredResources = resources.map(resource => {
      let score = 0;
      
      for (const preference of preferences) {
        let preferenceScore = 0;
        
        switch (preference.type) {
          case 'attribute':
            if (this.evaluateConstraint(resource.attributes[preference.target], preference.operator, preference.value)) {
              preferenceScore = preference.weight;
            }
            break;
          case 'location':
            if (this.evaluateConstraint(resource.attributes.location, preference.operator, preference.value)) {
              preferenceScore = preference.weight;
            }
            break;
          case 'affinity':
            if (resource.tags.includes(preference.value)) {
              preferenceScore = preference.weight;
            }
            break;
          case 'cost':
            // Lower cost gets higher score
            const cost = resource.attributes.cost || 1;
            preferenceScore = preference.weight / cost;
            break;
        }
        
        score += preferenceScore;
      }
      
      return { resource, score };
    });

    return scoredResources
      .sort((a, b) => b.score - a.score)
      .map(item => item.resource);
  }

  async releaseResources(requestId: string): Promise<void> {
    const allocations = Array.from(this.allocations.values())
      .filter(a => a.requestId === requestId && a.status === 'active');

    for (const allocation of allocations) {
      await this.releaseAllocation(allocation.id);
    }

    const request = this.requests.get(requestId);
    if (request) {
      request.status = 'completed';
      request.completedAt = new Date();
      this.emit('resource-request-completed', { requestId });
    }
  }

  private async releaseAllocation(allocationId: string): Promise<void> {
    const allocation = this.allocations.get(allocationId);
    if (!allocation || allocation.status !== 'active') {
      return;
    }

    const resource = this.resources.get(allocation.resourceId);
    if (resource) {
      resource.allocated -= allocation.amount;
      resource.available += allocation.amount;
      resource.lastUpdated = new Date();
    }

    allocation.status = 'released';
    allocation.endTime = new Date();
    
    this.emit('allocation-released', { allocationId });
  }

  createScalingPolicy(policy: ScalingPolicy): void {
    this.scalingPolicies.set(policy.id, policy);
    this.emit('scaling-policy-created', policy);
  }

  removeScalingPolicy(policyId: string): void {
    const policy = this.scalingPolicies.get(policyId);
    if (policy) {
      this.scalingPolicies.delete(policyId);
      this.emit('scaling-policy-removed', { policyId });
    }
  }

  private async checkScalingOpportunity(request: ResourceRequest): Promise<boolean> {
    // Check if any scaling policies can help meet the demand
    for (const policy of this.scalingPolicies.values()) {
      if (!policy.enabled) continue;

      // Check if policy targets resources needed by the request
      const relevantResources = request.resources.filter(req => 
        policy.target === 'all' || policy.target === req.type
      );

      if (relevantResources.length > 0) {
        return true;
      }
    }

    return false;
  }

  private async triggerScaling(request: ResourceRequest): Promise<void> {
    for (const policy of this.scalingPolicies.values()) {
      if (!policy.enabled) continue;

      // Check cooldown
      if (policy.lastTriggered && 
          Date.now() - policy.lastTriggered.getTime() < policy.cooldown * 1000) {
        continue;
      }

      // Execute scaling actions
      for (const action of policy.actions) {
        if (action.type === 'scale-up') {
          await this.scaleUp(policy.target, action.amount, action.unit);
          policy.lastTriggered = new Date();
          this.emit('scaling-triggered', { policy: policy.id, action: action.type });
        }
      }
    }
  }

  private async scaleUp(target: string, amount: number, unit: string): Promise<void> {
    // Simulate scaling up resources
    if (target === 'cpu' || target === 'all') {
      const cpuResource = this.resources.get('system-cpu');
      if (cpuResource) {
        if (unit === 'instances') {
          cpuResource.capacity += amount;
          cpuResource.available += amount;
        } else if (unit === 'percentage') {
          const increase = Math.floor(cpuResource.capacity * (amount / 100));
          cpuResource.capacity += increase;
          cpuResource.available += increase;
        }
        cpuResource.lastUpdated = new Date();
      }
    }

    if (target === 'memory' || target === 'all') {
      const memoryResource = this.resources.get('system-memory');
      if (memoryResource) {
        if (unit === 'percentage') {
          const increase = Math.floor(memoryResource.capacity * (amount / 100));
          memoryResource.capacity += increase;
          memoryResource.available += increase;
        }
        memoryResource.lastUpdated = new Date();
      }
    }

    this.emit('resources-scaled', { target, amount, unit });
  }

  createResourcePool(pool: ResourcePool): void {
    this.resourcePools.set(pool.id, pool);
    this.emit('resource-pool-created', pool);
  }

  removeResourcePool(poolId: string): void {
    const pool = this.resourcePools.get(poolId);
    if (pool) {
      this.resourcePools.delete(poolId);
      this.emit('resource-pool-removed', { poolId });
    }
  }

  private startMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      await this.collectMetrics();
      await this.updateResourceStatus();
      await this.checkAllocationExpiry();
    }, 60000); // Every minute
  }

  private async collectMetrics(): Promise<void> {
    const now = new Date();

    for (const resource of this.resources.values()) {
      let utilization = 0;
      let performance = 100;
      let availability = 100;

      // Calculate utilization
      if (resource.capacity > 0) {
        utilization = (resource.allocated / resource.capacity) * 100;
      }

      // Simulate performance and availability metrics
      if (resource.type === 'cpu') {
        const loadAverages = loadavg();
        performance = Math.max(0, 100 - (loadAverages[0] * 10));
      } else if (resource.type === 'memory') {
        const freeMemory = freemem();
        const totalMemory = totalmem();
        utilization = ((totalMemory - freeMemory) / totalMemory) * 100;
        performance = utilization < 90 ? 100 : Math.max(0, 100 - (utilization - 90) * 2);
      }

      const metrics: ResourceMetrics = {
        resourceId: resource.id,
        timestamp: now,
        utilization,
        performance,
        availability,
        errors: 0,
        latency: Math.random() * 10, // Simulated
        throughput: Math.random() * 1000, // Simulated
        customMetrics: {}
      };

      this.metrics.push(metrics);
      
      // Update allocation metrics
      const activeAllocations = Array.from(this.allocations.values())
        .filter(a => a.resourceId === resource.id && a.status === 'active');
      
      for (const allocation of activeAllocations) {
        allocation.metrics.utilization = utilization;
        allocation.metrics.performance = performance;
        allocation.metrics.efficiency = performance * (100 - utilization) / 100;
        allocation.metrics.lastMeasured = now;
      }
    }

    // Keep only recent metrics (last hour)
    const cutoff = now.getTime() - 3600000;
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  private async updateResourceStatus(): Promise<void> {
    for (const resource of this.resources.values()) {
      const recentMetrics = this.metrics
        .filter(m => m.resourceId === resource.id)
        .filter(m => Date.now() - m.timestamp.getTime() < 300000) // Last 5 minutes
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      if (recentMetrics.length === 0) {
        resource.status = 'offline';
        continue;
      }

      const latestMetrics = recentMetrics[0];
      
      if (latestMetrics.availability < 50 || latestMetrics.performance < 30) {
        resource.status = 'critical';
      } else if (latestMetrics.availability < 80 || latestMetrics.performance < 60) {
        resource.status = 'degraded';
      } else {
        resource.status = 'healthy';
      }

      resource.lastUpdated = new Date();
    }
  }

  private async checkAllocationExpiry(): Promise<void> {
    const now = new Date();
    
    for (const allocation of this.allocations.values()) {
      if (allocation.status === 'active' && allocation.endTime && allocation.endTime <= now) {
        await this.releaseAllocation(allocation.id);
        allocation.status = 'expired';
        this.emit('allocation-expired', { allocationId: allocation.id });
      }
    }
  }

  private startAutoScaling(): void {
    this.scalingInterval = setInterval(async () => {
      await this.evaluateScalingPolicies();
    }, 30000); // Every 30 seconds
  }

  private async evaluateScalingPolicies(): Promise<void> {
    for (const policy of this.scalingPolicies.values()) {
      if (!policy.enabled) continue;

      // Check cooldown
      if (policy.lastTriggered && 
          Date.now() - policy.lastTriggered.getTime() < policy.cooldown * 1000) {
        continue;
      }

      // Evaluate triggers
      for (const trigger of policy.triggers) {
        const shouldTrigger = await this.evaluateTrigger(trigger, policy.target);
        
        if (shouldTrigger) {
          // Execute actions
          for (const action of policy.actions) {
            await this.executeScalingAction(action, policy.target);
          }
          
          policy.lastTriggered = new Date();
          this.emit('auto-scaling-triggered', { policy: policy.id });
          break;
        }
      }
    }
  }

  private async evaluateTrigger(trigger: ScalingTrigger, target: string): Promise<boolean> {
    switch (trigger.type) {
      case 'metric':
        return this.evaluateMetricTrigger(trigger, target);
      case 'schedule':
        return this.evaluateScheduleTrigger(trigger);
      case 'event':
        return this.evaluateEventTrigger(trigger);
      default:
        return false;
    }
  }

  private evaluateMetricTrigger(trigger: ScalingTrigger, target: string): boolean {
    if (!trigger.metric || !trigger.threshold || !trigger.operator) {
      return false;
    }

    const relevantMetrics = this.metrics
      .filter(m => {
        const resource = this.resources.get(m.resourceId);
        return resource && (target === 'all' || resource.type === target);
      })
      .filter(m => Date.now() - m.timestamp.getTime() < (trigger.duration || 300) * 1000);

    if (relevantMetrics.length === 0) {
      return false;
    }

    const avgValue = relevantMetrics.reduce((sum, m) => {
      switch (trigger.metric) {
        case 'utilization':
          return sum + m.utilization;
        case 'performance':
          return sum + m.performance;
        case 'availability':
          return sum + m.availability;
        default:
          return sum;
      }
    }, 0) / relevantMetrics.length;

    switch (trigger.operator) {
      case 'greater-than':
        return avgValue > trigger.threshold;
      case 'less-than':
        return avgValue < trigger.threshold;
      case 'equals':
        return Math.abs(avgValue - trigger.threshold) < 0.1;
      default:
        return false;
    }
  }

  private evaluateScheduleTrigger(trigger: ScalingTrigger): boolean {
    // Simplified cron evaluation - in production use a proper cron library
    return false;
  }

  private evaluateEventTrigger(trigger: ScalingTrigger): boolean {
    // Event-based triggers would be implemented based on specific events
    return false;
  }

  private async executeScalingAction(action: ScalingAction, target: string): Promise<void> {
    switch (action.type) {
      case 'scale-up':
        await this.scaleUp(target, action.amount, action.unit);
        break;
      case 'scale-down':
        await this.scaleDown(target, action.amount, action.unit);
        break;
      case 'scale-to':
        await this.scaleTo(target, action.amount, action.unit);
        break;
    }
  }

  private async scaleDown(target: string, amount: number, unit: string): Promise<void> {
    // Implement scale down logic
    this.emit('resources-scaled', { target, amount: -amount, unit });
  }

  private async scaleTo(target: string, amount: number, unit: string): Promise<void> {
    // Implement scale to specific amount logic
    this.emit('resources-scaled', { target, amount, unit, type: 'scale-to' });
  }

  private startAllocationScheduler(): void {
    this.allocationScheduler = setInterval(async () => {
      await this.processRequestQueue();
    }, 5000); // Every 5 seconds
  }

  private async processRequestQueue(): Promise<void> {
    // Sort queue by priority and deadline
    this.requestQueue.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, normal: 2, low: 1 };
      
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      
      if (a.deadline && b.deadline) {
        return a.deadline.getTime() - b.deadline.getTime();
      }
      
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    // Process up to 10 requests per cycle
    const requestsToProcess = this.requestQueue.splice(0, 10);
    
    for (const request of requestsToProcess) {
      if (request.status === 'pending') {
        await this.processResourceRequest(request.id);
      }
    }
  }

  getResources(): Resource[] {
    return Array.from(this.resources.values());
  }

  getResourceRequests(status?: string): ResourceRequest[] {
    const requests = Array.from(this.requests.values());
    return status ? requests.filter(r => r.status === status) : requests;
  }

  getAllocations(status?: string): ResourceAllocation[] {
    const allocations = Array.from(this.allocations.values());
    return status ? allocations.filter(a => a.status === status) : allocations;
  }

  getScalingPolicies(): ScalingPolicy[] {
    return Array.from(this.scalingPolicies.values());
  }

  getResourcePools(): ResourcePool[] {
    return Array.from(this.resourcePools.values());
  }

  getMetrics(resourceId?: string, duration: number = 3600000): ResourceMetrics[] {
    const cutoff = Date.now() - duration;
    let filteredMetrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);
    
    if (resourceId) {
      filteredMetrics = filteredMetrics.filter(m => m.resourceId === resourceId);
    }
    
    return filteredMetrics;
  }

  getResourceUtilization(): Record<string, number> {
    const utilization: Record<string, number> = {};
    
    for (const resource of this.resources.values()) {
      if (resource.capacity > 0) {
        utilization[resource.id] = (resource.allocated / resource.capacity) * 100;
      }
    }
    
    return utilization;
  }

  getStats(): any {
    const resources = Array.from(this.resources.values());
    const requests = Array.from(this.requests.values());
    const allocations = Array.from(this.allocations.values());

    return {
      resources: {
        total: resources.length,
        byType: resources.reduce((acc, r) => {
          acc[r.type] = (acc[r.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byStatus: resources.reduce((acc, r) => {
          acc[r.status] = (acc[r.status] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      },
      requests: {
        total: requests.length,
        pending: requests.filter(r => r.status === 'pending').length,
        allocated: requests.filter(r => r.status === 'allocated').length,
        completed: requests.filter(r => r.status === 'completed').length,
        rejected: requests.filter(r => r.status === 'rejected').length
      },
      allocations: {
        total: allocations.length,
        active: allocations.filter(a => a.status === 'active').length,
        expired: allocations.filter(a => a.status === 'expired').length,
        released: allocations.filter(a => a.status === 'released').length
      },
      scalingPolicies: this.scalingPolicies.size,
      resourcePools: this.resourcePools.size,
      queueSize: this.requestQueue.length,
      metrics: this.metrics.length
    };
  }

  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    if (this.scalingInterval) {
      clearInterval(this.scalingInterval);
    }
    
    if (this.allocationScheduler) {
      clearInterval(this.allocationScheduler);
    }
    
    this.resources.clear();
    this.requests.clear();
    this.allocations.clear();
    this.scalingPolicies.clear();
    this.resourcePools.clear();
    this.metrics = [];
    this.requestQueue = [];
    
    this.removeAllListeners();
  }
}