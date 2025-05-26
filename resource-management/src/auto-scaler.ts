import { EventEmitter } from 'events';

export interface ScalingTarget {
  id: string;
  name: string;
  type: 'service' | 'function' | 'container' | 'vm' | 'resource';
  currentInstances: number;
  desiredInstances: number;
  minInstances: number;
  maxInstances: number;
  healthyInstances: number;
  unhealthyInstances: number;
  metadata: Record<string, any>;
  lastScaled: Date;
  status: 'active' | 'paused' | 'error';
}

export interface ScalingMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  targetId: string;
  labels: Record<string, string>;
}

export interface ScalingRule {
  id: string;
  name: string;
  targetId: string;
  enabled: boolean;
  priority: number;
  conditions: ScalingCondition[];
  actions: ScalingActionConfig[];
  cooldownPeriod: number; // seconds
  evaluationPeriod: number; // seconds
  dataPointsToAlarm: number;
  lastTriggered?: Date;
  metadata: Record<string, any>;
}

export interface ScalingCondition {
  id: string;
  metric: string;
  statistic: 'average' | 'sum' | 'min' | 'max' | 'percentile';
  threshold: number;
  comparisonOperator: 'greater-than' | 'greater-than-or-equal' | 'less-than' | 'less-than-or-equal' | 'equal';
  period: number; // seconds
  evaluationPeriods: number;
  percentile?: number; // for percentile statistic
  missingDataTreatment: 'missing' | 'ignore' | 'breaching' | 'not-breaching';
  weight: number;
}

export interface ScalingActionConfig {
  id: string;
  type: 'change-capacity' | 'set-capacity' | 'step-scaling' | 'target-tracking';
  adjustmentType: 'absolute' | 'percentage' | 'exact';
  adjustmentValue: number;
  stepAdjustments?: StepAdjustment[];
  targetValue?: number;
  warmupPeriod?: number; // seconds
  cooldownPeriod?: number; // seconds
}

export interface StepAdjustment {
  lowerBound?: number;
  upperBound?: number;
  adjustmentValue: number;
}

export interface ScalingEvent {
  id: string;
  timestamp: Date;
  targetId: string;
  ruleId: string;
  type: 'scale-up' | 'scale-down' | 'scale-to';
  previousInstances: number;
  newInstances: number;
  reason: string;
  metrics: ScalingMetric[];
  success: boolean;
  error?: string;
  duration: number;
}

export interface PredictiveScalingConfig {
  enabled: boolean;
  lookAheadPeriod: number; // seconds
  confidenceThreshold: number; // 0-1
  maxScaleOutSteps: number;
  schedulingBufferTime: number; // seconds
  forecastAlgorithm: 'linear' | 'exponential' | 'seasonal' | 'ml';
}

export interface ScalingPolicy {
  id: string;
  name: string;
  description: string;
  targetId: string;
  enabled: boolean;
  policyType: 'reactive' | 'predictive' | 'scheduled' | 'hybrid';
  rules: string[];
  predictiveConfig?: PredictiveScalingConfig;
  scheduledActions: ScheduledScalingAction[];
  estimatedInstanceWarmup: number; // seconds
  defaultCooldown: number; // seconds
  lastModified: Date;
}

export interface ScheduledScalingAction {
  id: string;
  name: string;
  schedule: string; // cron expression
  action: ScalingActionConfig;
  timezone: string;
  startTime?: Date;
  endTime?: Date;
  recurrence?: {
    type: 'daily' | 'weekly' | 'monthly';
    daysOfWeek?: number[];
    daysOfMonth?: number[];
  };
}

export interface ResourceForecast {
  targetId: string;
  metric: string;
  predictions: Array<{
    timestamp: Date;
    value: number;
    confidence: number;
  }>;
  accuracy: number;
  lastUpdated: Date;
}

export class AutoScaler extends EventEmitter {
  private targets = new Map<string, ScalingTarget>();
  private rules = new Map<string, ScalingRule>();
  private policies = new Map<string, ScalingPolicy>();
  private metrics: ScalingMetric[] = [];
  private events: ScalingEvent[] = [];
  private forecasts = new Map<string, ResourceForecast>();
  
  private evaluationInterval: NodeJS.Timeout | null = null;
  private metricsCollectionInterval: NodeJS.Timeout | null = null;
  private scheduledActionsInterval: NodeJS.Timeout | null = null;
  private forecastingInterval: NodeJS.Timeout | null = null;
  
  private isEvaluating = false;
  private cooldownTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    super();
    this.startEvaluationLoop();
    this.startMetricsCollection();
    this.startScheduledActions();
    this.startForecasting();
  }

  addTarget(target: ScalingTarget): void {
    this.targets.set(target.id, target);
    this.emit('target-added', target);
  }

  removeTarget(targetId: string): void {
    const target = this.targets.get(targetId);
    if (target) {
      // Remove associated rules and policies
      const associatedRules = Array.from(this.rules.values()).filter(r => r.targetId === targetId);
      const associatedPolicies = Array.from(this.policies.values()).filter(p => p.targetId === targetId);
      
      for (const rule of associatedRules) {
        this.removeRule(rule.id);
      }
      
      for (const policy of associatedPolicies) {
        this.removePolicy(policy.id);
      }
      
      this.targets.delete(targetId);
      this.emit('target-removed', { targetId });
    }
  }

  addRule(rule: ScalingRule): void {
    this.rules.set(rule.id, rule);
    this.emit('rule-added', rule);
  }

  removeRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      this.rules.delete(ruleId);
      this.emit('rule-removed', { ruleId });
    }
  }

  addPolicy(policy: ScalingPolicy): void {
    this.policies.set(policy.id, policy);
    this.emit('policy-added', policy);
  }

  removePolicy(policyId: string): void {
    const policy = this.policies.get(policyId);
    if (policy) {
      this.policies.delete(policyId);
      this.emit('policy-removed', { policyId });
    }
  }

  recordMetric(metric: ScalingMetric): void {
    this.metrics.push(metric);
    
    // Keep only recent metrics (last 2 hours)
    const cutoff = Date.now() - 7200000;
    this.metrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);
    
    this.emit('metric-recorded', metric);
  }

  recordMetrics(metrics: ScalingMetric[]): void {
    for (const metric of metrics) {
      this.recordMetric(metric);
    }
  }

  private startEvaluationLoop(): void {
    this.evaluationInterval = setInterval(async () => {
      if (!this.isEvaluating) {
        await this.evaluateScalingRules();
      }
    }, 30000); // Every 30 seconds
  }

  private startMetricsCollection(): void {
    this.metricsCollectionInterval = setInterval(async () => {
      await this.collectSystemMetrics();
    }, 60000); // Every minute
  }

  private startScheduledActions(): void {
    this.scheduledActionsInterval = setInterval(async () => {
      await this.evaluateScheduledActions();
    }, 60000); // Every minute
  }

  private startForecasting(): void {
    this.forecastingInterval = setInterval(async () => {
      await this.generateForecasts();
    }, 300000); // Every 5 minutes
  }

  private async evaluateScalingRules(): Promise<void> {
    this.isEvaluating = true;
    
    try {
      // Sort rules by priority
      const sortedRules = Array.from(this.rules.values())
        .filter(rule => rule.enabled)
        .sort((a, b) => b.priority - a.priority);

      for (const rule of sortedRules) {
        await this.evaluateRule(rule);
      }
    } catch (error) {
      this.emit('evaluation-error', { error: (error as Error).message });
    } finally {
      this.isEvaluating = false;
    }
  }

  private async evaluateRule(rule: ScalingRule): Promise<void> {
    const target = this.targets.get(rule.targetId);
    if (!target || target.status !== 'active') {
      return;
    }

    // Check cooldown
    if (rule.lastTriggered) {
      const timeSinceLastTrigger = Date.now() - rule.lastTriggered.getTime();
      if (timeSinceLastTrigger < rule.cooldownPeriod * 1000) {
        return;
      }
    }

    // Evaluate conditions
    const conditionResults = await Promise.all(
      rule.conditions.map(condition => this.evaluateCondition(condition, rule.targetId))
    );

    // Check if all conditions are met (weighted evaluation)
    const totalWeight = rule.conditions.reduce((sum, c) => sum + c.weight, 0);
    const weightedScore = conditionResults.reduce((sum, result, index) => {
      return sum + (result.met ? rule.conditions[index].weight : 0);
    }, 0);

    const shouldTrigger = weightedScore / totalWeight >= 0.5; // 50% threshold

    if (shouldTrigger) {
      // Execute scaling actions
      for (const action of rule.actions) {
        await this.executeScalingAction(action, rule, target, conditionResults);
      }
      
      rule.lastTriggered = new Date();
      this.emit('rule-triggered', { ruleId: rule.id, targetId: rule.targetId });
    }
  }

  private async evaluateCondition(condition: ScalingCondition, targetId: string): Promise<{met: boolean, value: number}> {
    const now = Date.now();
    const periodMs = condition.period * 1000;
    const evaluationWindowMs = condition.evaluationPeriods * periodMs;
    
    // Get relevant metrics
    const relevantMetrics = this.metrics.filter(m => 
      m.targetId === targetId &&
      m.name === condition.metric &&
      now - m.timestamp.getTime() <= evaluationWindowMs
    );

    if (relevantMetrics.length === 0) {
      return this.handleMissingData(condition);
    }

    // Group metrics by evaluation periods
    const periods: ScalingMetric[][] = [];
    for (let i = 0; i < condition.evaluationPeriods; i++) {
      const periodStart = now - (i + 1) * periodMs;
      const periodEnd = now - i * periodMs;
      
      const periodMetrics = relevantMetrics.filter(m => 
        m.timestamp.getTime() >= periodStart && m.timestamp.getTime() < periodEnd
      );
      
      periods.push(periodMetrics);
    }

    // Calculate statistic for each period
    const periodValues = periods.map(periodMetrics => {
      if (periodMetrics.length === 0) {
        return this.handleMissingData(condition).value;
      }
      
      return this.calculateStatistic(periodMetrics.map(m => m.value), condition.statistic, condition.percentile);
    });

    // Check how many periods breach the threshold
    const breachingPeriods = periodValues.filter(value => 
      this.compareValue(value, condition.threshold, condition.comparisonOperator)
    );

    const met = breachingPeriods.length >= condition.dataPointsToAlarm;
    const currentValue = periodValues.length > 0 ? periodValues[0] : 0;

    return { met, value: currentValue };
  }

  private handleMissingData(condition: ScalingCondition): {met: boolean, value: number} {
    switch (condition.missingDataTreatment) {
      case 'breaching':
        return { met: true, value: condition.threshold };
      case 'not-breaching':
        return { met: false, value: condition.threshold };
      case 'ignore':
        return { met: false, value: 0 };
      case 'missing':
      default:
        return { met: false, value: 0 };
    }
  }

  private calculateStatistic(values: number[], statistic: string, percentile?: number): number {
    if (values.length === 0) return 0;

    switch (statistic) {
      case 'average':
        return values.reduce((sum, v) => sum + v, 0) / values.length;
      
      case 'sum':
        return values.reduce((sum, v) => sum + v, 0);
      
      case 'min':
        return Math.min(...values);
      
      case 'max':
        return Math.max(...values);
      
      case 'percentile':
        if (percentile === undefined) return 0;
        const sorted = values.sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
      
      default:
        return values[0];
    }
  }

  private compareValue(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case 'greater-than':
        return value > threshold;
      case 'greater-than-or-equal':
        return value >= threshold;
      case 'less-than':
        return value < threshold;
      case 'less-than-or-equal':
        return value <= threshold;
      case 'equal':
        return Math.abs(value - threshold) < 0.001;
      default:
        return false;
    }
  }

  private async executeScalingAction(
    action: ScalingActionConfig,
    rule: ScalingRule,
    target: ScalingTarget,
    conditionResults: Array<{met: boolean, value: number}>
  ): Promise<void> {
    const startTime = Date.now();
    let newInstanceCount = target.currentInstances;
    let scalingType: 'scale-up' | 'scale-down' | 'scale-to' = 'scale-to';

    try {
      switch (action.type) {
        case 'change-capacity':
          newInstanceCount = this.calculateChangeCapacity(target, action);
          scalingType = action.adjustmentValue > 0 ? 'scale-up' : 'scale-down';
          break;
        
        case 'set-capacity':
          newInstanceCount = action.adjustmentValue;
          scalingType = 'scale-to';
          break;
        
        case 'step-scaling':
          newInstanceCount = this.calculateStepScaling(target, action, conditionResults);
          scalingType = newInstanceCount > target.currentInstances ? 'scale-up' : 'scale-down';
          break;
        
        case 'target-tracking':
          newInstanceCount = this.calculateTargetTracking(target, action, conditionResults);
          scalingType = newInstanceCount > target.currentInstances ? 'scale-up' : 'scale-down';
          break;
      }

      // Apply min/max constraints
      newInstanceCount = Math.max(target.minInstances, Math.min(target.maxInstances, newInstanceCount));

      // Execute scaling if needed
      if (newInstanceCount !== target.currentInstances) {
        const success = await this.scaleTarget(target, newInstanceCount);
        
        const scalingEvent: ScalingEvent = {
          id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          targetId: target.id,
          ruleId: rule.id,
          type: scalingType,
          previousInstances: target.currentInstances,
          newInstances: success ? newInstanceCount : target.currentInstances,
          reason: this.generateScalingReason(rule, conditionResults),
          metrics: this.getRecentMetrics(target.id),
          success,
          duration: Date.now() - startTime
        };

        this.events.push(scalingEvent);
        this.emit('scaling-executed', scalingEvent);

        // Setup cooldown timer
        if (action.cooldownPeriod) {
          this.setupCooldownTimer(rule.id, action.cooldownPeriod);
        }
      }

    } catch (error) {
      const scalingEvent: ScalingEvent = {
        id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        targetId: target.id,
        ruleId: rule.id,
        type: scalingType,
        previousInstances: target.currentInstances,
        newInstanceCount: target.currentInstances,
        reason: 'Scaling failed',
        metrics: this.getRecentMetrics(target.id),
        success: false,
        error: (error as Error).message,
        duration: Date.now() - startTime
      };

      this.events.push(scalingEvent);
      this.emit('scaling-failed', scalingEvent);
    }
  }

  private calculateChangeCapacity(target: ScalingTarget, action: ScalingActionConfig): number {
    switch (action.adjustmentType) {
      case 'absolute':
        return target.currentInstances + action.adjustmentValue;
      
      case 'percentage':
        const change = Math.ceil(target.currentInstances * (action.adjustmentValue / 100));
        return target.currentInstances + change;
      
      case 'exact':
        return action.adjustmentValue;
      
      default:
        return target.currentInstances;
    }
  }

  private calculateStepScaling(
    target: ScalingTarget,
    action: ScalingActionConfig,
    conditionResults: Array<{met: boolean, value: number}>
  ): number {
    if (!action.stepAdjustments) {
      return target.currentInstances;
    }

    // Use the first condition result's value for step scaling
    const currentValue = conditionResults.length > 0 ? conditionResults[0].value : 0;
    
    for (const step of action.stepAdjustments) {
      const inRange = (step.lowerBound === undefined || currentValue >= step.lowerBound) &&
                     (step.upperBound === undefined || currentValue < step.upperBound);
      
      if (inRange) {
        return target.currentInstances + step.adjustmentValue;
      }
    }
    
    return target.currentInstances;
  }

  private calculateTargetTracking(
    target: ScalingTarget,
    action: ScalingActionConfig,
    conditionResults: Array<{met: boolean, value: number}>
  ): number {
    if (!action.targetValue || conditionResults.length === 0) {
      return target.currentInstances;
    }

    const currentValue = conditionResults[0].value;
    const targetValue = action.targetValue;
    
    // Simple proportional scaling
    const ratio = currentValue / targetValue;
    const newInstances = Math.ceil(target.currentInstances / ratio);
    
    return newInstances;
  }

  private async scaleTarget(target: ScalingTarget, newInstanceCount: number): Promise<boolean> {
    // Simulate scaling operation - in production, this would integrate with actual infrastructure
    try {
      target.desiredInstances = newInstanceCount;
      
      // Simulate scaling delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      target.currentInstances = newInstanceCount;
      target.healthyInstances = newInstanceCount;
      target.lastScaled = new Date();
      
      this.emit('target-scaled', {
        targetId: target.id,
        previousInstances: target.currentInstances,
        newInstances: newInstanceCount
      });
      
      return true;
    } catch (error) {
      this.emit('scaling-error', {
        targetId: target.id,
        error: (error as Error).message
      });
      return false;
    }
  }

  private generateScalingReason(rule: ScalingRule, conditionResults: Array<{met: boolean, value: number}>): string {
    const metConditions = rule.conditions.filter((_, index) => conditionResults[index].met);
    const reasons = metConditions.map(condition => 
      `${condition.metric} ${condition.comparisonOperator} ${condition.threshold}`
    );
    
    return `Rule '${rule.name}' triggered: ${reasons.join(' AND ')}`;
  }

  private getRecentMetrics(targetId: string): ScalingMetric[] {
    const fiveMinutesAgo = Date.now() - 300000;
    return this.metrics.filter(m => 
      m.targetId === targetId && m.timestamp.getTime() > fiveMinutesAgo
    );
  }

  private setupCooldownTimer(ruleId: string, cooldownPeriod: number): void {
    const existingTimer = this.cooldownTimers.get(ruleId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    const timer = setTimeout(() => {
      this.cooldownTimers.delete(ruleId);
      this.emit('cooldown-expired', { ruleId });
    }, cooldownPeriod * 1000);
    
    this.cooldownTimers.set(ruleId, timer);
  }

  private async collectSystemMetrics(): Promise<void> {
    const now = new Date();
    
    for (const target of this.targets.values()) {
      // Simulate metric collection
      const metrics: ScalingMetric[] = [
        {
          name: 'cpu-utilization',
          value: Math.random() * 100,
          unit: 'percent',
          timestamp: now,
          targetId: target.id,
          labels: { instance: 'all' }
        },
        {
          name: 'memory-utilization',
          value: Math.random() * 100,
          unit: 'percent',
          timestamp: now,
          targetId: target.id,
          labels: { instance: 'all' }
        },
        {
          name: 'request-count',
          value: Math.floor(Math.random() * 1000),
          unit: 'count',
          timestamp: now,
          targetId: target.id,
          labels: { endpoint: 'all' }
        },
        {
          name: 'response-time',
          value: Math.random() * 1000,
          unit: 'milliseconds',
          timestamp: now,
          targetId: target.id,
          labels: { percentile: '95' }
        }
      ];
      
      this.recordMetrics(metrics);
    }
  }

  private async evaluateScheduledActions(): Promise<void> {
    const now = new Date();
    
    for (const policy of this.policies.values()) {
      if (!policy.enabled || policy.policyType !== 'scheduled') {
        continue;
      }
      
      for (const scheduledAction of policy.scheduledActions) {
        if (this.shouldExecuteScheduledAction(scheduledAction, now)) {
          const target = this.targets.get(policy.targetId);
          if (target) {
            await this.executeScheduledAction(scheduledAction, target);
          }
        }
      }
    }
  }

  private shouldExecuteScheduledAction(action: ScheduledScalingAction, now: Date): boolean {
    // Simplified cron evaluation - in production use a proper cron library
    // This is a placeholder implementation
    return false;
  }

  private async executeScheduledAction(action: ScheduledScalingAction, target: ScalingTarget): Promise<void> {
    const startTime = Date.now();
    
    try {
      let newInstanceCount = target.currentInstances;
      
      switch (action.action.type) {
        case 'change-capacity':
          newInstanceCount = this.calculateChangeCapacity(target, action.action);
          break;
        case 'set-capacity':
          newInstanceCount = action.action.adjustmentValue;
          break;
      }
      
      newInstanceCount = Math.max(target.minInstances, Math.min(target.maxInstances, newInstanceCount));
      
      if (newInstanceCount !== target.currentInstances) {
        const success = await this.scaleTarget(target, newInstanceCount);
        
        const scalingEvent: ScalingEvent = {
          id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          targetId: target.id,
          ruleId: `scheduled-${action.id}`,
          type: newInstanceCount > target.currentInstances ? 'scale-up' : 'scale-down',
          previousInstances: target.currentInstances,
          newInstances: success ? newInstanceCount : target.currentInstances,
          reason: `Scheduled action: ${action.name}`,
          metrics: this.getRecentMetrics(target.id),
          success,
          duration: Date.now() - startTime
        };
        
        this.events.push(scalingEvent);
        this.emit('scheduled-scaling-executed', scalingEvent);
      }
      
    } catch (error) {
      this.emit('scheduled-scaling-failed', {
        actionId: action.id,
        targetId: target.id,
        error: (error as Error).message
      });
    }
  }

  private async generateForecasts(): Promise<void> {
    for (const target of this.targets.values()) {
      const policies = Array.from(this.policies.values())
        .filter(p => p.targetId === target.id && p.predictiveConfig?.enabled);
      
      for (const policy of policies) {
        if (policy.predictiveConfig) {
          await this.generateForecastForTarget(target, policy.predictiveConfig);
        }
      }
    }
  }

  private async generateForecastForTarget(target: ScalingTarget, config: PredictiveScalingConfig): Promise<void> {
    const metrics = ['cpu-utilization', 'memory-utilization', 'request-count'];
    
    for (const metricName of metrics) {
      const historicalData = this.getHistoricalData(target.id, metricName, config.lookAheadPeriod * 2);
      
      if (historicalData.length < 10) {
        continue; // Not enough data for forecasting
      }
      
      const forecast = this.predictMetric(historicalData, config);
      
      this.forecasts.set(`${target.id}:${metricName}`, {
        targetId: target.id,
        metric: metricName,
        predictions: forecast.predictions,
        accuracy: forecast.accuracy,
        lastUpdated: new Date()
      });
      
      this.emit('forecast-generated', {
        targetId: target.id,
        metric: metricName,
        predictions: forecast.predictions.length
      });
    }
  }

  private getHistoricalData(targetId: string, metricName: string, lookbackSeconds: number): ScalingMetric[] {
    const cutoff = Date.now() - lookbackSeconds * 1000;
    return this.metrics
      .filter(m => m.targetId === targetId && m.name === metricName && m.timestamp.getTime() > cutoff)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private predictMetric(historicalData: ScalingMetric[], config: PredictiveScalingConfig): {
    predictions: Array<{ timestamp: Date; value: number; confidence: number }>,
    accuracy: number
  } {
    // Simplified forecasting implementation
    // In production, this would use proper time series forecasting algorithms
    
    const predictions = [];
    const values = historicalData.map(m => m.value);
    const trend = this.calculateTrend(values);
    const lastValue = values[values.length - 1];
    const now = Date.now();
    
    for (let i = 1; i <= config.lookAheadPeriod / 60; i++) { // Predict every minute
      const timestamp = new Date(now + i * 60 * 1000);
      const value = Math.max(0, lastValue + trend * i);
      const confidence = Math.max(0.5, 1 - (i * 0.02)); // Decreasing confidence over time
      
      predictions.push({ timestamp, value, confidence });
    }
    
    return {
      predictions,
      accuracy: 0.85 // Simplified accuracy score
    };
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

  getTargets(): ScalingTarget[] {
    return Array.from(this.targets.values());
  }

  getRules(): ScalingRule[] {
    return Array.from(this.rules.values());
  }

  getPolicies(): ScalingPolicy[] {
    return Array.from(this.policies.values());
  }

  getEvents(targetId?: string, limit: number = 100): ScalingEvent[] {
    let events = [...this.events].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    if (targetId) {
      events = events.filter(e => e.targetId === targetId);
    }
    
    return events.slice(0, limit);
  }

  getMetrics(targetId?: string, metricName?: string, duration: number = 3600000): ScalingMetric[] {
    const cutoff = Date.now() - duration;
    let filteredMetrics = this.metrics.filter(m => m.timestamp.getTime() > cutoff);
    
    if (targetId) {
      filteredMetrics = filteredMetrics.filter(m => m.targetId === targetId);
    }
    
    if (metricName) {
      filteredMetrics = filteredMetrics.filter(m => m.name === metricName);
    }
    
    return filteredMetrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getForecasts(targetId?: string): ResourceForecast[] {
    const forecasts = Array.from(this.forecasts.values());
    return targetId ? forecasts.filter(f => f.targetId === targetId) : forecasts;
  }

  getStats(): any {
    const targets = Array.from(this.targets.values());
    const rules = Array.from(this.rules.values());
    const policies = Array.from(this.policies.values());
    const events = this.events;

    return {
      targets: {
        total: targets.length,
        active: targets.filter(t => t.status === 'active').length,
        totalInstances: targets.reduce((sum, t) => sum + t.currentInstances, 0),
        totalCapacity: targets.reduce((sum, t) => sum + t.maxInstances, 0)
      },
      rules: {
        total: rules.length,
        enabled: rules.filter(r => r.enabled).length,
        byType: rules.reduce((acc, r) => {
          r.actions.forEach(a => {
            acc[a.type] = (acc[a.type] || 0) + 1;
          });
          return acc;
        }, {} as Record<string, number>)
      },
      policies: {
        total: policies.length,
        enabled: policies.filter(p => p.enabled).length,
        byType: policies.reduce((acc, p) => {
          acc[p.policyType] = (acc[p.policyType] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      },
      events: {
        total: events.length,
        successful: events.filter(e => e.success).length,
        failed: events.filter(e => !e.success).length,
        scaleUp: events.filter(e => e.type === 'scale-up').length,
        scaleDown: events.filter(e => e.type === 'scale-down').length
      },
      metrics: {
        total: this.metrics.length,
        unique: new Set(this.metrics.map(m => `${m.targetId}:${m.name}`)).size
      },
      forecasts: this.forecasts.size,
      cooldowns: this.cooldownTimers.size
    };
  }

  destroy(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
    }
    
    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
    }
    
    if (this.scheduledActionsInterval) {
      clearInterval(this.scheduledActionsInterval);
    }
    
    if (this.forecastingInterval) {
      clearInterval(this.forecastingInterval);
    }
    
    // Clear cooldown timers
    for (const timer of this.cooldownTimers.values()) {
      clearTimeout(timer);
    }
    
    this.targets.clear();
    this.rules.clear();
    this.policies.clear();
    this.forecasts.clear();
    this.cooldownTimers.clear();
    this.metrics = [];
    this.events = [];
    
    this.removeAllListeners();
  }
}