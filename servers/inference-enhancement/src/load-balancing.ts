import { BaseServer } from '../../shared/src/base-server';
import { MCPError } from '../../shared/src/errors';
import { withPerformanceMonitoring } from '../../shared/src/monitoring';
import { withRetry } from '../../shared/src/retry';
import { HealthChecker } from '../../shared/src/health';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface LoadBalancer {
  id: string;
  name: string;
  algorithm: 'round-robin' | 'least-connections' | 'weighted-round-robin' | 'ip-hash' | 'least-response-time' | 'random';
  targets: LoadBalancerTarget[];
  healthCheck: {
    enabled: boolean;
    path: string;
    interval: number;
    timeout: number;
    successThreshold: number;
    failureThreshold: number;
  };
  stickySessions: {
    enabled: boolean;
    cookieName?: string;
    duration?: number;
  };
  rateLimiting: {
    enabled: boolean;
    requestsPerSecond: number;
    burstSize: number;
    keyExtractor: 'ip' | 'header' | 'custom';
  };
  ssl: {
    enabled: boolean;
    certificate?: string;
    privateKey?: string;
    protocols: string[];
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    alertThresholds: {
      errorRate: number;
      responseTime: number;
      throughput: number;
    };
  };
  configuration: Record<string, any>;
  status: 'active' | 'inactive' | 'draining' | 'maintenance';
  created: Date;
  updated: Date;
}

export interface LoadBalancerTarget {
  id: string;
  host: string;
  port: number;
  weight: number;
  priority: number;
  maxConnections: number;
  currentConnections: number;
  status: 'healthy' | 'unhealthy' | 'draining' | 'maintenance';
  metadata: Record<string, any>;
  lastHealthCheck?: Date;
  averageResponseTime: number;
  errorRate: number;
  throughput: number;
}

export interface AutoScalingGroup {
  id: string;
  name: string;
  serviceName: string;
  minInstances: number;
  maxInstances: number;
  desiredInstances: number;
  currentInstances: number;
  scalingPolicy: ScalingPolicy;
  targetGroup: string;
  instanceTemplate: InstanceTemplate;
  healthCheck: {
    enabled: boolean;
    gracePeriod: number;
    checkInterval: number;
    unhealthyThreshold: number;
  };
  cooldown: {
    scaleUp: number;
    scaleDown: number;
  };
  notifications: {
    enabled: boolean;
    channels: string[];
    events: string[];
  };
  status: 'active' | 'inactive' | 'scaling' | 'error';
  created: Date;
  updated: Date;
  lastScaleActivity?: Date;
}

export interface ScalingPolicy {
  type: 'target-tracking' | 'step-scaling' | 'simple-scaling' | 'predictive';
  metrics: ScalingMetric[];
  targetValue?: number;
  scaleUpAdjustment: number;
  scaleDownAdjustment: number;
  evaluationPeriods: number;
  dataPointsToAlarm: number;
  treatMissingData: 'breaching' | 'not-breaching' | 'ignore';
}

export interface ScalingMetric {
  type: 'cpu-utilization' | 'memory-utilization' | 'request-count' | 'response-time' | 'queue-length' | 'custom';
  statistic: 'average' | 'sum' | 'maximum' | 'minimum';
  threshold: number;
  comparisonOperator: 'greater-than' | 'less-than' | 'greater-than-or-equal' | 'less-than-or-equal';
  period: number;
  weight: number;
}

export interface InstanceTemplate {
  imageId: string;
  instanceType: string;
  securityGroups: string[];
  userData: string;
  iamRole?: string;
  networkConfig: {
    vpc: string;
    subnets: string[];
    publicIp: boolean;
  };
  storage: {
    volumeType: string;
    size: number;
    encrypted: boolean;
  };
  metadata: Record<string, any>;
}

export interface LoadBalancingMetrics {
  timestamp: Date;
  loadBalancerId: string;
  requestCount: number;
  errorCount: number;
  averageResponseTime: number;
  throughput: number;
  activeConnections: number;
  targetHealth: {
    healthy: number;
    unhealthy: number;
    total: number;
  };
  cpuUtilization: number;
  memoryUtilization: number;
}

export interface ScalingEvent {
  id: string;
  autoScalingGroupId: string;
  type: 'scale-up' | 'scale-down' | 'health-check' | 'manual';
  trigger: string;
  oldCapacity: number;
  newCapacity: number;
  status: 'successful' | 'failed' | 'in-progress';
  details: any;
  timestamp: Date;
  duration?: number;
  error?: string;
}

export interface LoadBalancingConfig {
  defaultAlgorithm: string;
  healthCheckDefaults: {
    interval: number;
    timeout: number;
    successThreshold: number;
    failureThreshold: number;
  };
  rateLimitingDefaults: {
    requestsPerSecond: number;
    burstSize: number;
  };
  autoScalingDefaults: {
    cooldownScaleUp: number;
    cooldownScaleDown: number;
    evaluationPeriods: number;
  };
  metricsRetention: number;
  enableAdvancedFeatures: boolean;
}

export class LoadBalancingService {
  private config: LoadBalancingConfig;
  private loadBalancers: Map<string, LoadBalancer> = new Map();
  private autoScalingGroups: Map<string, AutoScalingGroup> = new Map();
  private targetConnections: Map<string, number> = new Map();
  private requestCounts: Map<string, number> = new Map();
  private lastTargetIndex: Map<string, number> = new Map();
  private stickySessionMap: Map<string, string> = new Map();
  private scalingHistory: Map<string, ScalingEvent[]> = new Map();
  private metricsHistory: Map<string, LoadBalancingMetrics[]> = new Map();
  private healthChecker: HealthChecker;
  private configPath: string;

  constructor(config: LoadBalancingConfig, configPath: string = './data/load-balancing') {
    this.config = config;
    this.configPath = configPath;
    this.healthChecker = new HealthChecker();
  }

  @withPerformanceMonitoring('load-balancing.create-load-balancer')
  async createLoadBalancer(loadBalancer: Omit<LoadBalancer, 'id' | 'created' | 'updated'>): Promise<string> {
    try {
      const id = `lb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newLoadBalancer: LoadBalancer = {
        ...loadBalancer,
        id,
        created: new Date(),
        updated: new Date()
      };

      this.loadBalancers.set(id, newLoadBalancer);
      await this.saveLoadBalancers();

      if (newLoadBalancer.status === 'active') {
        await this.startLoadBalancerHealthChecks(id);
      }

      return id;
    } catch (error) {
      throw new MCPError('LOAD_BALANCING_ERROR', `Failed to create load balancer: ${error}`);
    }
  }

  @withPerformanceMonitoring('load-balancing.create-auto-scaling-group')
  async createAutoScalingGroup(group: Omit<AutoScalingGroup, 'id' | 'created' | 'updated' | 'currentInstances'>): Promise<string> {
    try {
      const id = `asg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const autoScalingGroup: AutoScalingGroup = {
        ...group,
        id,
        currentInstances: group.desiredInstances,
        created: new Date(),
        updated: new Date()
      };

      this.autoScalingGroups.set(id, autoScalingGroup);
      await this.saveAutoScalingGroups();

      if (autoScalingGroup.status === 'active') {
        await this.initializeAutoScalingGroup(id);
      }

      return id;
    } catch (error) {
      throw new MCPError('LOAD_BALANCING_ERROR', `Failed to create auto-scaling group: ${error}`);
    }
  }

  @withRetry({ maxAttempts: 3, delayMs: 100 })
  @withPerformanceMonitoring('load-balancing.route-request')
  async routeRequest(loadBalancerId: string, request: {
    clientIp: string;
    headers: Record<string, string>;
    sessionId?: string;
    path: string;
    method: string;
  }): Promise<LoadBalancerTarget> {
    try {
      const loadBalancer = this.loadBalancers.get(loadBalancerId);
      if (!loadBalancer) {
        throw new MCPError('LOAD_BALANCING_ERROR', `Load balancer ${loadBalancerId} not found`);
      }

      if (loadBalancer.status !== 'active') {
        throw new MCPError('LOAD_BALANCING_ERROR', `Load balancer ${loadBalancerId} is not active`);
      }

      const availableTargets = loadBalancer.targets.filter(target => 
        target.status === 'healthy' && 
        target.currentConnections < target.maxConnections
      );

      if (availableTargets.length === 0) {
        throw new MCPError('LOAD_BALANCING_ERROR', 'No healthy targets available');
      }

      let selectedTarget: LoadBalancerTarget;

      if (loadBalancer.stickySessions.enabled && request.sessionId) {
        const stickyTarget = this.getStickySessionTarget(loadBalancerId, request.sessionId, availableTargets);
        if (stickyTarget) {
          selectedTarget = stickyTarget;
        } else {
          selectedTarget = this.selectTargetByAlgorithm(loadBalancer, availableTargets, request);
          this.setStickySession(loadBalancerId, request.sessionId, selectedTarget.id);
        }
      } else {
        selectedTarget = this.selectTargetByAlgorithm(loadBalancer, availableTargets, request);
      }

      await this.updateTargetMetrics(loadBalancerId, selectedTarget.id);
      await this.recordRequestMetrics(loadBalancerId, request);

      return selectedTarget;
    } catch (error) {
      throw new MCPError('LOAD_BALANCING_ERROR', `Failed to route request: ${error}`);
    }
  }

  @withPerformanceMonitoring('load-balancing.check-scaling')
  async checkScalingConditions(autoScalingGroupId: string): Promise<{
    shouldScale: boolean;
    direction?: 'up' | 'down';
    reason: string;
    newDesiredCapacity?: number;
  }> {
    try {
      const group = this.autoScalingGroups.get(autoScalingGroupId);
      if (!group || group.status !== 'active') {
        return { shouldScale: false, reason: 'Auto-scaling group not active' };
      }

      const metrics = await this.collectScalingMetrics(group);
      const policy = group.scalingPolicy;

      for (const metric of policy.metrics) {
        const metricValue = metrics[metric.type] || 0;
        const shouldTrigger = this.evaluateMetricThreshold(metric, metricValue);

        if (shouldTrigger) {
          const direction = this.determineScalingDirection(metric, metricValue);
          const adjustment = direction === 'up' ? policy.scaleUpAdjustment : policy.scaleDownAdjustment;
          const newCapacity = Math.max(group.minInstances, 
            Math.min(group.maxInstances, group.desiredInstances + adjustment));

          if (newCapacity !== group.desiredInstances) {
            return {
              shouldScale: true,
              direction,
              reason: `${metric.type} ${metric.comparisonOperator} ${metric.threshold} (current: ${metricValue})`,
              newDesiredCapacity: newCapacity
            };
          }
        }
      }

      return { shouldScale: false, reason: 'All metrics within normal range' };
    } catch (error) {
      throw new MCPError('LOAD_BALANCING_ERROR', `Failed to check scaling conditions: ${error}`);
    }
  }

  @withPerformanceMonitoring('load-balancing.scale-group')
  async scaleAutoScalingGroup(autoScalingGroupId: string, desiredCapacity: number, reason: string): Promise<string> {
    try {
      const group = this.autoScalingGroups.get(autoScalingGroupId);
      if (!group) {
        throw new MCPError('LOAD_BALANCING_ERROR', `Auto-scaling group ${autoScalingGroupId} not found`);
      }

      const cooldownPeriod = desiredCapacity > group.desiredInstances ? 
        group.cooldown.scaleUp : group.cooldown.scaleDown;

      if (group.lastScaleActivity) {
        const timeSinceLastScale = Date.now() - group.lastScaleActivity.getTime();
        if (timeSinceLastScale < cooldownPeriod) {
          throw new MCPError('LOAD_BALANCING_ERROR', 'Scaling operation is in cooldown period');
        }
      }

      const scalingEvent: ScalingEvent = {
        id: `scale_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        autoScalingGroupId,
        type: desiredCapacity > group.desiredInstances ? 'scale-up' : 'scale-down',
        trigger: reason,
        oldCapacity: group.desiredInstances,
        newCapacity: desiredCapacity,
        status: 'in-progress',
        details: { reason },
        timestamp: new Date()
      };

      const startTime = Date.now();
      
      try {
        group.status = 'scaling';
        group.desiredInstances = desiredCapacity;
        group.lastScaleActivity = new Date();
        group.updated = new Date();

        await this.executeScalingOperation(group, scalingEvent);

        scalingEvent.status = 'successful';
        scalingEvent.duration = Date.now() - startTime;
        group.currentInstances = desiredCapacity;
        group.status = 'active';

      } catch (scalingError) {
        scalingEvent.status = 'failed';
        scalingEvent.error = scalingError.message;
        group.status = 'error';
        throw scalingError;
      }

      this.recordScalingEvent(autoScalingGroupId, scalingEvent);
      await this.saveAutoScalingGroups();

      return scalingEvent.id;
    } catch (error) {
      throw new MCPError('LOAD_BALANCING_ERROR', `Failed to scale auto-scaling group: ${error}`);
    }
  }

  @withPerformanceMonitoring('load-balancing.update-target-health')
  async updateTargetHealth(loadBalancerId: string, targetId: string, isHealthy: boolean): Promise<void> {
    try {
      const loadBalancer = this.loadBalancers.get(loadBalancerId);
      if (!loadBalancer) {
        throw new MCPError('LOAD_BALANCING_ERROR', `Load balancer ${loadBalancerId} not found`);
      }

      const target = loadBalancer.targets.find(t => t.id === targetId);
      if (!target) {
        throw new MCPError('LOAD_BALANCING_ERROR', `Target ${targetId} not found`);
      }

      const previousStatus = target.status;
      target.status = isHealthy ? 'healthy' : 'unhealthy';
      target.lastHealthCheck = new Date();

      if (previousStatus !== target.status) {
        await this.handleTargetStatusChange(loadBalancerId, targetId, previousStatus, target.status);
      }

      loadBalancer.updated = new Date();
      await this.saveLoadBalancers();
    } catch (error) {
      throw new MCPError('LOAD_BALANCING_ERROR', `Failed to update target health: ${error}`);
    }
  }

  @withPerformanceMonitoring('load-balancing.get-metrics')
  async getLoadBalancingMetrics(loadBalancerId: string, options: {
    from?: Date;
    to?: Date;
    granularity?: 'minute' | 'hour' | 'day';
  } = {}): Promise<LoadBalancingMetrics[]> {
    try {
      const allMetrics = this.metricsHistory.get(loadBalancerId) || [];
      let filteredMetrics = allMetrics;

      if (options.from) {
        filteredMetrics = filteredMetrics.filter(m => m.timestamp >= options.from!);
      }
      
      if (options.to) {
        filteredMetrics = filteredMetrics.filter(m => m.timestamp <= options.to!);
      }

      if (options.granularity) {
        filteredMetrics = this.aggregateMetrics(filteredMetrics, options.granularity);
      }

      return filteredMetrics.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      throw new MCPError('LOAD_BALANCING_ERROR', `Failed to get load balancing metrics: ${error}`);
    }
  }

  @withPerformanceMonitoring('load-balancing.get-scaling-history')
  async getScalingHistory(autoScalingGroupId: string, options: {
    from?: Date;
    to?: Date;
    limit?: number;
  } = {}): Promise<ScalingEvent[]> {
    try {
      let events = this.scalingHistory.get(autoScalingGroupId) || [];

      if (options.from) {
        events = events.filter(e => e.timestamp >= options.from!);
      }
      
      if (options.to) {
        events = events.filter(e => e.timestamp <= options.to!);
      }

      events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      if (options.limit) {
        events = events.slice(0, options.limit);
      }

      return events;
    } catch (error) {
      throw new MCPError('LOAD_BALANCING_ERROR', `Failed to get scaling history: ${error}`);
    }
  }

  private selectTargetByAlgorithm(
    loadBalancer: LoadBalancer, 
    targets: LoadBalancerTarget[], 
    request: any
  ): LoadBalancerTarget {
    switch (loadBalancer.algorithm) {
      case 'round-robin':
        return this.selectRoundRobin(loadBalancer.id, targets);
      case 'least-connections':
        return this.selectLeastConnections(targets);
      case 'weighted-round-robin':
        return this.selectWeightedRoundRobin(loadBalancer.id, targets);
      case 'ip-hash':
        return this.selectIpHash(targets, request.clientIp);
      case 'least-response-time':
        return this.selectLeastResponseTime(targets);
      case 'random':
        return this.selectRandom(targets);
      default:
        return this.selectRoundRobin(loadBalancer.id, targets);
    }
  }

  private selectRoundRobin(loadBalancerId: string, targets: LoadBalancerTarget[]): LoadBalancerTarget {
    const lastIndex = this.lastTargetIndex.get(loadBalancerId) || 0;
    const nextIndex = (lastIndex + 1) % targets.length;
    this.lastTargetIndex.set(loadBalancerId, nextIndex);
    return targets[nextIndex];
  }

  private selectLeastConnections(targets: LoadBalancerTarget[]): LoadBalancerTarget {
    return targets.reduce((least, current) => 
      current.currentConnections < least.currentConnections ? current : least
    );
  }

  private selectWeightedRoundRobin(loadBalancerId: string, targets: LoadBalancerTarget[]): LoadBalancerTarget {
    const totalWeight = targets.reduce((sum, target) => sum + target.weight, 0);
    const random = Math.random() * totalWeight;
    let weightSum = 0;

    for (const target of targets) {
      weightSum += target.weight;
      if (random <= weightSum) {
        return target;
      }
    }

    return targets[0];
  }

  private selectIpHash(targets: LoadBalancerTarget[], clientIp: string): LoadBalancerTarget {
    const hash = this.hashString(clientIp);
    return targets[hash % targets.length];
  }

  private selectLeastResponseTime(targets: LoadBalancerTarget[]): LoadBalancerTarget {
    return targets.reduce((fastest, current) => 
      current.averageResponseTime < fastest.averageResponseTime ? current : fastest
    );
  }

  private selectRandom(targets: LoadBalancerTarget[]): LoadBalancerTarget {
    return targets[Math.floor(Math.random() * targets.length)];
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  private getStickySessionTarget(
    loadBalancerId: string, 
    sessionId: string, 
    targets: LoadBalancerTarget[]
  ): LoadBalancerTarget | null {
    const targetId = this.stickySessionMap.get(`${loadBalancerId}:${sessionId}`);
    if (!targetId) return null;

    return targets.find(t => t.id === targetId) || null;
  }

  private setStickySession(loadBalancerId: string, sessionId: string, targetId: string): void {
    this.stickySessionMap.set(`${loadBalancerId}:${sessionId}`, targetId);
  }

  private async updateTargetMetrics(loadBalancerId: string, targetId: string): Promise<void> {
    const connectionKey = `${loadBalancerId}:${targetId}`;
    const currentConnections = this.targetConnections.get(connectionKey) || 0;
    this.targetConnections.set(connectionKey, currentConnections + 1);

    const loadBalancer = this.loadBalancers.get(loadBalancerId);
    if (loadBalancer) {
      const target = loadBalancer.targets.find(t => t.id === targetId);
      if (target) {
        target.currentConnections = currentConnections + 1;
      }
    }
  }

  private async recordRequestMetrics(loadBalancerId: string, request: any): Promise<void> {
    const requestCount = this.requestCounts.get(loadBalancerId) || 0;
    this.requestCounts.set(loadBalancerId, requestCount + 1);
  }

  private async collectScalingMetrics(group: AutoScalingGroup): Promise<Record<string, number>> {
    const metrics: Record<string, number> = {};

    metrics['cpu-utilization'] = Math.random() * 100;
    metrics['memory-utilization'] = Math.random() * 100;
    metrics['request-count'] = Math.floor(Math.random() * 1000);
    metrics['response-time'] = Math.random() * 5000;
    metrics['queue-length'] = Math.floor(Math.random() * 100);

    return metrics;
  }

  private evaluateMetricThreshold(metric: ScalingMetric, value: number): boolean {
    switch (metric.comparisonOperator) {
      case 'greater-than':
        return value > metric.threshold;
      case 'less-than':
        return value < metric.threshold;
      case 'greater-than-or-equal':
        return value >= metric.threshold;
      case 'less-than-or-equal':
        return value <= metric.threshold;
      default:
        return false;
    }
  }

  private determineScalingDirection(metric: ScalingMetric, value: number): 'up' | 'down' {
    const isAboveThreshold = value > metric.threshold;
    
    switch (metric.comparisonOperator) {
      case 'greater-than':
      case 'greater-than-or-equal':
        return isAboveThreshold ? 'up' : 'down';
      case 'less-than':
      case 'less-than-or-equal':
        return isAboveThreshold ? 'down' : 'up';
      default:
        return 'up';
    }
  }

  private async startLoadBalancerHealthChecks(loadBalancerId: string): Promise<void> {
    const loadBalancer = this.loadBalancers.get(loadBalancerId);
    if (!loadBalancer || !loadBalancer.healthCheck.enabled) return;

    setInterval(async () => {
      for (const target of loadBalancer.targets) {
        try {
          const healthResult = await this.healthChecker.checkHealth({
            name: `${loadBalancerId}-${target.id}`,
            url: `http://${target.host}:${target.port}${loadBalancer.healthCheck.path}`,
            timeout: loadBalancer.healthCheck.timeout
          });

          const isHealthy = healthResult.status === 'healthy';
          await this.updateTargetHealth(loadBalancerId, target.id, isHealthy);
        } catch (error) {
          await this.updateTargetHealth(loadBalancerId, target.id, false);
        }
      }
    }, loadBalancer.healthCheck.interval);
  }

  private async initializeAutoScalingGroup(autoScalingGroupId: string): Promise<void> {
    const group = this.autoScalingGroups.get(autoScalingGroupId);
    if (!group) return;

    setInterval(async () => {
      try {
        const scalingCheck = await this.checkScalingConditions(autoScalingGroupId);
        if (scalingCheck.shouldScale && scalingCheck.newDesiredCapacity !== undefined) {
          await this.scaleAutoScalingGroup(
            autoScalingGroupId, 
            scalingCheck.newDesiredCapacity,
            scalingCheck.reason
          );
        }
      } catch (error) {
        console.error(`Auto-scaling check failed for group ${autoScalingGroupId}:`, error);
      }
    }, 60000);
  }

  private async executeScalingOperation(group: AutoScalingGroup, event: ScalingEvent): Promise<void> {
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  private async handleTargetStatusChange(
    loadBalancerId: string, 
    targetId: string, 
    previousStatus: string, 
    newStatus: string
  ): Promise<void> {
    
  }

  private aggregateMetrics(metrics: LoadBalancingMetrics[], granularity: string): LoadBalancingMetrics[] {
    
    return metrics;
  }

  private recordScalingEvent(autoScalingGroupId: string, event: ScalingEvent): void {
    const events = this.scalingHistory.get(autoScalingGroupId) || [];
    events.push(event);
    
    const maxEvents = 1000;
    if (events.length > maxEvents) {
      events.splice(0, events.length - maxEvents);
    }
    
    this.scalingHistory.set(autoScalingGroupId, events);
  }

  private async saveLoadBalancers(): Promise<void> {
    const data = Array.from(this.loadBalancers.values());
    await fs.writeFile(
      path.join(this.configPath, 'load-balancers.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveAutoScalingGroups(): Promise<void> {
    const data = Array.from(this.autoScalingGroups.values());
    await fs.writeFile(
      path.join(this.configPath, 'auto-scaling-groups.json'),
      JSON.stringify(data, null, 2)
    );
  }

  async getHealthStatus(): Promise<any> {
    const totalLoadBalancers = this.loadBalancers.size;
    const activeLoadBalancers = Array.from(this.loadBalancers.values())
      .filter(lb => lb.status === 'active').length;
    const totalAutoScalingGroups = this.autoScalingGroups.size;
    const activeAutoScalingGroups = Array.from(this.autoScalingGroups.values())
      .filter(asg => asg.status === 'active').length;

    return {
      status: 'healthy',
      totalLoadBalancers,
      activeLoadBalancers,
      totalAutoScalingGroups,
      activeAutoScalingGroups,
      components: {
        loadBalancing: 'healthy',
        autoScaling: 'healthy',
        healthChecks: 'healthy',
        metrics: 'healthy'
      },
      metrics: {
        totalRequests: Array.from(this.requestCounts.values()).reduce((a, b) => a + b, 0),
        averageResponseTime: this.calculateAverageResponseTime(),
        healthyTargetsPercentage: this.calculateHealthyTargetsPercentage(),
        scalingEventsToday: this.getScalingEventsCount('today')
      }
    };
  }

  private calculateAverageResponseTime(): number {
    const allTargets = Array.from(this.loadBalancers.values())
      .flatMap(lb => lb.targets);
    
    if (allTargets.length === 0) return 0;
    
    const totalResponseTime = allTargets.reduce((sum, target) => sum + target.averageResponseTime, 0);
    return totalResponseTime / allTargets.length;
  }

  private calculateHealthyTargetsPercentage(): number {
    const allTargets = Array.from(this.loadBalancers.values())
      .flatMap(lb => lb.targets);
    
    if (allTargets.length === 0) return 100;
    
    const healthyTargets = allTargets.filter(target => target.status === 'healthy').length;
    return (healthyTargets / allTargets.length) * 100;
  }

  private getScalingEventsCount(period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return Array.from(this.scalingHistory.values())
      .flat()
      .filter(event => event.timestamp >= startOfDay)
      .length;
  }
}

export class LoadBalancingMCPServer extends BaseServer {
  private loadBalancing: LoadBalancingService;

  constructor() {
    super('load-balancing');
    
    const config: LoadBalancingConfig = {
      defaultAlgorithm: 'round-robin',
      healthCheckDefaults: {
        interval: 30000,
        timeout: 5000,
        successThreshold: 2,
        failureThreshold: 3
      },
      rateLimitingDefaults: {
        requestsPerSecond: 1000,
        burstSize: 1500
      },
      autoScalingDefaults: {
        cooldownScaleUp: 300000,
        cooldownScaleDown: 600000,
        evaluationPeriods: 3
      },
      metricsRetention: 2592000000,
      enableAdvancedFeatures: true
    };

    this.loadBalancing = new LoadBalancingService(config);
  }

  protected setupRoutes(): void {
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.loadBalancing.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/load-balancers', async (req, res) => {
      try {
        const loadBalancerId = await this.loadBalancing.createLoadBalancer(req.body);
        res.json({ id: loadBalancerId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/auto-scaling-groups', async (req, res) => {
      try {
        const groupId = await this.loadBalancing.createAutoScalingGroup(req.body);
        res.json({ id: groupId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/load-balancers/:id/route', async (req, res) => {
      try {
        const target = await this.loadBalancing.routeRequest(req.params.id, req.body);
        res.json(target);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/auto-scaling-groups/:id/scale', async (req, res) => {
      try {
        const scalingEventId = await this.loadBalancing.scaleAutoScalingGroup(
          req.params.id, 
          req.body.desiredCapacity, 
          req.body.reason
        );
        res.json({ scalingEventId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.put('/load-balancers/:id/targets/:targetId/health', async (req, res) => {
      try {
        await this.loadBalancing.updateTargetHealth(req.params.id, req.params.targetId, req.body.isHealthy);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/load-balancers/:id/metrics', async (req, res) => {
      try {
        const metrics = await this.loadBalancing.getLoadBalancingMetrics(req.params.id, req.query);
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/auto-scaling-groups/:id/history', async (req, res) => {
      try {
        const history = await this.loadBalancing.getScalingHistory(req.params.id, req.query);
        res.json(history);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/auto-scaling-groups/:id/scaling-check', async (req, res) => {
      try {
        const scalingCheck = await this.loadBalancing.checkScalingConditions(req.params.id);
        res.json(scalingCheck);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  protected getMCPTools() {
    return [
      {
        name: 'create_load_balancer',
        description: 'Create a new load balancer',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            algorithm: { type: 'string', enum: ['round-robin', 'least-connections', 'weighted-round-robin', 'ip-hash', 'least-response-time', 'random'] },
            targets: { type: 'array' },
            healthCheck: { type: 'object' },
            stickySessions: { type: 'object' },
            rateLimiting: { type: 'object' },
            ssl: { type: 'object' },
            monitoring: { type: 'object' },
            configuration: { type: 'object' },
            status: { type: 'string', enum: ['active', 'inactive', 'draining', 'maintenance'] }
          },
          required: ['name', 'algorithm', 'targets']
        }
      },
      {
        name: 'create_auto_scaling_group',
        description: 'Create a new auto-scaling group',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            serviceName: { type: 'string' },
            minInstances: { type: 'number' },
            maxInstances: { type: 'number' },
            desiredInstances: { type: 'number' },
            scalingPolicy: { type: 'object' },
            targetGroup: { type: 'string' },
            instanceTemplate: { type: 'object' },
            healthCheck: { type: 'object' },
            cooldown: { type: 'object' },
            notifications: { type: 'object' },
            status: { type: 'string', enum: ['active', 'inactive', 'scaling', 'error'] }
          },
          required: ['name', 'serviceName', 'minInstances', 'maxInstances', 'desiredInstances', 'scalingPolicy', 'instanceTemplate']
        }
      },
      {
        name: 'route_request',
        description: 'Route a request through a load balancer',
        inputSchema: {
          type: 'object',
          properties: {
            loadBalancerId: { type: 'string' },
            request: {
              type: 'object',
              properties: {
                clientIp: { type: 'string' },
                headers: { type: 'object' },
                sessionId: { type: 'string' },
                path: { type: 'string' },
                method: { type: 'string' }
              },
              required: ['clientIp', 'headers', 'path', 'method']
            }
          },
          required: ['loadBalancerId', 'request']
        }
      },
      {
        name: 'scale_auto_scaling_group',
        description: 'Manually scale an auto-scaling group',
        inputSchema: {
          type: 'object',
          properties: {
            autoScalingGroupId: { type: 'string' },
            desiredCapacity: { type: 'number' },
            reason: { type: 'string' }
          },
          required: ['autoScalingGroupId', 'desiredCapacity', 'reason']
        }
      },
      {
        name: 'update_target_health',
        description: 'Update the health status of a load balancer target',
        inputSchema: {
          type: 'object',
          properties: {
            loadBalancerId: { type: 'string' },
            targetId: { type: 'string' },
            isHealthy: { type: 'boolean' }
          },
          required: ['loadBalancerId', 'targetId', 'isHealthy']
        }
      },
      {
        name: 'get_load_balancing_metrics',
        description: 'Get load balancing metrics',
        inputSchema: {
          type: 'object',
          properties: {
            loadBalancerId: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            granularity: { type: 'string', enum: ['minute', 'hour', 'day'] }
          },
          required: ['loadBalancerId']
        }
      },
      {
        name: 'get_scaling_history',
        description: 'Get auto-scaling history',
        inputSchema: {
          type: 'object',
          properties: {
            autoScalingGroupId: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            limit: { type: 'number' }
          },
          required: ['autoScalingGroupId']
        }
      },
      {
        name: 'check_scaling_conditions',
        description: 'Check if auto-scaling conditions are met',
        inputSchema: {
          type: 'object',
          properties: {
            autoScalingGroupId: { type: 'string' }
          },
          required: ['autoScalingGroupId']
        }
      }
    ];
  }

  protected async handleMCPRequest(method: string, params: any): Promise<any> {
    switch (method) {
      case 'create_load_balancer':
        return { id: await this.loadBalancing.createLoadBalancer(params) };

      case 'create_auto_scaling_group':
        return { id: await this.loadBalancing.createAutoScalingGroup(params) };

      case 'route_request':
        return await this.loadBalancing.routeRequest(params.loadBalancerId, params.request);

      case 'scale_auto_scaling_group':
        return { scalingEventId: await this.loadBalancing.scaleAutoScalingGroup(params.autoScalingGroupId, params.desiredCapacity, params.reason) };

      case 'update_target_health':
        await this.loadBalancing.updateTargetHealth(params.loadBalancerId, params.targetId, params.isHealthy);
        return { success: true };

      case 'get_load_balancing_metrics':
        return await this.loadBalancing.getLoadBalancingMetrics(params.loadBalancerId, params);

      case 'get_scaling_history':
        return await this.loadBalancing.getScalingHistory(params.autoScalingGroupId, params);

      case 'check_scaling_conditions':
        return await this.loadBalancing.checkScalingConditions(params.autoScalingGroupId);

      default:
        throw new MCPError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
    }
  }
}