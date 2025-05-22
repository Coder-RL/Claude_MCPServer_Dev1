import { EventEmitter } from 'events';

export interface MetricDefinition {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  description: string;
  labels: string[];
  unit?: string;
  buckets?: number[];
}

export interface Metric {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: Date;
}

export interface Trace {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  tags: Record<string, any>;
  logs: TraceLog[];
  status: 'ok' | 'error' | 'timeout';
  service: string;
  component: string;
}

export interface TraceLog {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, any>;
}

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  service: string;
  message: string;
  fields: Record<string, any>;
  traceId?: string;
  spanId?: string;
}

export interface Alert {
  id: string;
  name: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'resolved' | 'suppressed';
  createdAt: Date;
  resolvedAt?: Date;
  source: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  silenceId?: string;
}

export interface AlertRule {
  id: string;
  name: string;
  query: string;
  condition: AlertCondition;
  severity: 'low' | 'medium' | 'high' | 'critical';
  duration: number;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  enabled: boolean;
  notificationChannels: string[];
}

export interface AlertCondition {
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
  threshold: number;
  evaluationWindow: number;
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  tags: string[];
  panels: DashboardPanel[];
  variables: DashboardVariable[];
  timeRange: TimeRange;
  refreshInterval: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardPanel {
  id: string;
  title: string;
  type: 'graph' | 'table' | 'stat' | 'heatmap' | 'logs' | 'trace';
  gridPos: GridPosition;
  targets: PanelTarget[];
  options: Record<string, any>;
}

export interface GridPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PanelTarget {
  query: string;
  datasource: string;
  legend?: string;
  format?: string;
}

export interface DashboardVariable {
  name: string;
  type: 'query' | 'constant' | 'interval' | 'datasource';
  query?: string;
  options?: string[];
  current?: string;
}

export interface TimeRange {
  from: Date;
  to: Date;
}

export interface ServiceHealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  uptime: number;
  responseTime: number;
  errorRate: number;
  dependencies: ServiceDependency[];
  checks: HealthCheck[];
}

export interface ServiceDependency {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastCheck: Date;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  lastCheck: Date;
  duration: number;
}

export interface ObservabilityConfig {
  metrics: {
    enabled: boolean;
    retention: number;
    scrapeInterval: number;
    endpoints: string[];
  };
  tracing: {
    enabled: boolean;
    samplingRate: number;
    jaegerEndpoint?: string;
    zipkinEndpoint?: string;
  };
  logging: {
    enabled: boolean;
    level: string;
    retention: number;
    structured: boolean;
  };
  alerting: {
    enabled: boolean;
    evaluationInterval: number;
    notificationChannels: NotificationChannel[];
  };
  dashboards: {
    enabled: boolean;
    autoGenerate: boolean;
    defaultTimeRange: string;
  };
}

export interface NotificationChannel {
  id: string;
  type: 'email' | 'slack' | 'webhook' | 'pagerduty';
  name: string;
  config: Record<string, any>;
  enabled: boolean;
}

export class ObservabilityPlatform extends EventEmitter {
  private metrics = new Map<string, Metric[]>();
  private traces = new Map<string, Trace>();
  private logs: LogEntry[] = [];
  private alerts = new Map<string, Alert>();
  private alertRules = new Map<string, AlertRule>();
  private dashboards = new Map<string, Dashboard>();
  private serviceHealth = new Map<string, ServiceHealthStatus>();
  private metricDefinitions = new Map<string, MetricDefinition>();
  private activeTraces = new Map<string, Trace>();

  constructor(private config: ObservabilityConfig) {
    super();
    this.initializeDefaultMetrics();
    this.startMetricCollection();
    this.startAlertEvaluation();
    this.startHealthChecks();
  }

  // Metrics API
  async recordMetric(name: string, value: number, labels: Record<string, string> = {}): Promise<void> {
    const metric: Metric = {
      name,
      value,
      labels,
      timestamp: new Date()
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push(metric);
    this.trimMetrics(name);
    
    this.emit('metricRecorded', { metric });
  }

  async incrementCounter(name: string, labels: Record<string, string> = {}, value: number = 1): Promise<void> {
    const existing = this.getLatestMetric(name, labels);
    const newValue = existing ? existing.value + value : value;
    await this.recordMetric(name, newValue, labels);
  }

  async setGauge(name: string, value: number, labels: Record<string, string> = {}): Promise<void> {
    await this.recordMetric(name, value, labels);
  }

  async observeHistogram(name: string, value: number, labels: Record<string, string> = {}): Promise<void> {
    const bucketLabels = this.getBucketLabels(name, value);
    await this.recordMetric(name, value, { ...labels, ...bucketLabels });
  }

  async queryMetrics(
    query: string,
    timeRange?: TimeRange,
    step?: number
  ): Promise<{ metric: string; values: [number, number][] }[]> {
    // Simplified metric query - in production use proper query engine
    const results: { metric: string; values: [number, number][] }[] = [];
    
    for (const [metricName, metricData] of this.metrics.entries()) {
      if (this.matchesQuery(metricName, query)) {
        const filteredData = timeRange 
          ? metricData.filter(m => m.timestamp >= timeRange.from && m.timestamp <= timeRange.to)
          : metricData;

        const values: [number, number][] = filteredData.map(m => [
          m.timestamp.getTime(),
          m.value
        ]);

        results.push({ metric: metricName, values });
      }
    }

    return results;
  }

  // Tracing API
  async startTrace(operationName: string, service: string, component: string): Promise<string> {
    const trace: Trace = {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      operationName,
      startTime: new Date(),
      tags: {},
      logs: [],
      status: 'ok',
      service,
      component
    };

    this.activeTraces.set(trace.traceId, trace);
    this.emit('traceStarted', { trace });
    
    return trace.traceId;
  }

  async startSpan(
    traceId: string,
    operationName: string,
    parentSpanId?: string
  ): Promise<string> {
    const parentTrace = this.activeTraces.get(traceId);
    if (!parentTrace) {
      throw new Error(`Trace ${traceId} not found`);
    }

    const span: Trace = {
      traceId,
      spanId: this.generateSpanId(),
      parentSpanId,
      operationName,
      startTime: new Date(),
      tags: {},
      logs: [],
      status: 'ok',
      service: parentTrace.service,
      component: parentTrace.component
    };

    this.activeTraces.set(span.spanId, span);
    this.emit('spanStarted', { span });
    
    return span.spanId;
  }

  async finishTrace(traceId: string, status: 'ok' | 'error' | 'timeout' = 'ok'): Promise<void> {
    const trace = this.activeTraces.get(traceId);
    if (!trace) return;

    trace.endTime = new Date();
    trace.duration = trace.endTime.getTime() - trace.startTime.getTime();
    trace.status = status;

    this.traces.set(traceId, trace);
    this.activeTraces.delete(traceId);
    
    this.emit('traceFinished', { trace });
  }

  async addTraceLog(
    traceId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields?: Record<string, any>
  ): Promise<void> {
    const trace = this.activeTraces.get(traceId) || this.traces.get(traceId);
    if (!trace) return;

    const log: TraceLog = {
      timestamp: new Date(),
      level,
      message,
      fields
    };

    trace.logs.push(log);
  }

  async setTraceTag(traceId: string, key: string, value: any): Promise<void> {
    const trace = this.activeTraces.get(traceId) || this.traces.get(traceId);
    if (!trace) return;

    trace.tags[key] = value;
  }

  async queryTraces(
    query: string,
    timeRange?: TimeRange,
    limit?: number
  ): Promise<Trace[]> {
    let traces = Array.from(this.traces.values());

    if (timeRange) {
      traces = traces.filter(t => 
        t.startTime >= timeRange.from && t.startTime <= timeRange.to
      );
    }

    // Simple query matching - in production use proper query parser
    if (query) {
      traces = traces.filter(t => 
        t.operationName.includes(query) ||
        t.service.includes(query) ||
        Object.values(t.tags).some(v => String(v).includes(query))
      );
    }

    if (limit) {
      traces = traces.slice(0, limit);
    }

    return traces.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  }

  // Logging API
  async log(
    level: 'debug' | 'info' | 'warn' | 'error' | 'fatal',
    service: string,
    message: string,
    fields: Record<string, any> = {},
    traceId?: string,
    spanId?: string
  ): Promise<void> {
    const logEntry: LogEntry = {
      timestamp: new Date(),
      level,
      service,
      message,
      fields,
      traceId,
      spanId
    };

    this.logs.push(logEntry);
    this.trimLogs();
    
    this.emit('logEntryCreated', { logEntry });

    // Auto-create alert for error logs
    if (level === 'error' || level === 'fatal') {
      this.checkErrorLogAlerts(logEntry);
    }
  }

  async queryLogs(
    query: string,
    timeRange?: TimeRange,
    limit: number = 100
  ): Promise<LogEntry[]> {
    let logs = [...this.logs];

    if (timeRange) {
      logs = logs.filter(l => 
        l.timestamp >= timeRange.from && l.timestamp <= timeRange.to
      );
    }

    // Simple query matching
    if (query) {
      logs = logs.filter(l => 
        l.message.includes(query) ||
        l.service.includes(query) ||
        Object.values(l.fields).some(v => String(v).includes(query))
      );
    }

    return logs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // Alerting API
  async createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<string> {
    const ruleId = this.generateId();
    const alertRule: AlertRule = {
      id: ruleId,
      ...rule
    };

    this.alertRules.set(ruleId, alertRule);
    this.emit('alertRuleCreated', { alertRule });
    
    return ruleId;
  }

  async triggerAlert(
    ruleName: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    message: string,
    labels: Record<string, string> = {}
  ): Promise<string> {
    const alert: Alert = {
      id: this.generateId(),
      name: ruleName,
      description: message,
      severity,
      status: 'active',
      createdAt: new Date(),
      source: 'manual',
      labels,
      annotations: {}
    };

    this.alerts.set(alert.id, alert);
    this.emit('alertCreated', { alert });
    
    await this.sendAlertNotifications(alert);
    
    return alert.id;
  }

  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.status === 'resolved') return false;

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    
    this.emit('alertResolved', { alert });
    return true;
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return Array.from(this.alerts.values())
      .filter(a => a.status === 'active')
      .sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      });
  }

  // Dashboard API
  async createDashboard(dashboard: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const dashboardId = this.generateId();
    const newDashboard: Dashboard = {
      id: dashboardId,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...dashboard
    };

    this.dashboards.set(dashboardId, newDashboard);
    this.emit('dashboardCreated', { dashboard: newDashboard });
    
    return dashboardId;
  }

  async updateDashboard(id: string, updates: Partial<Dashboard>): Promise<boolean> {
    const dashboard = this.dashboards.get(id);
    if (!dashboard) return false;

    Object.assign(dashboard, updates, { updatedAt: new Date() });
    this.emit('dashboardUpdated', { dashboard });
    
    return true;
  }

  async getDashboard(id: string): Promise<Dashboard | undefined> {
    return this.dashboards.get(id);
  }

  async getDashboards(): Promise<Dashboard[]> {
    return Array.from(this.dashboards.values())
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // Health Monitoring API
  async registerService(
    serviceName: string,
    healthCheckUrl?: string,
    dependencies: string[] = []
  ): Promise<void> {
    const status: ServiceHealthStatus = {
      service: serviceName,
      status: 'unknown',
      lastCheck: new Date(),
      uptime: 0,
      responseTime: 0,
      errorRate: 0,
      dependencies: dependencies.map(dep => ({
        name: dep,
        status: 'unknown',
        lastCheck: new Date()
      })),
      checks: []
    };

    this.serviceHealth.set(serviceName, status);
    this.emit('serviceRegistered', { serviceName, status });
  }

  async updateServiceHealth(
    serviceName: string,
    status: 'healthy' | 'degraded' | 'unhealthy',
    responseTime?: number,
    errorRate?: number
  ): Promise<void> {
    const health = this.serviceHealth.get(serviceName);
    if (!health) return;

    health.status = status;
    health.lastCheck = new Date();
    if (responseTime !== undefined) health.responseTime = responseTime;
    if (errorRate !== undefined) health.errorRate = errorRate;

    this.emit('serviceHealthUpdated', { serviceName, health });

    // Trigger alerts for unhealthy services
    if (status === 'unhealthy') {
      await this.triggerAlert(
        'Service Unhealthy',
        'high',
        `Service ${serviceName} is unhealthy`,
        { service: serviceName }
      );
    }
  }

  async getServiceHealth(serviceName?: string): Promise<ServiceHealthStatus | ServiceHealthStatus[]> {
    if (serviceName) {
      return this.serviceHealth.get(serviceName);
    }
    return Array.from(this.serviceHealth.values());
  }

  // System Overview
  async getSystemOverview(): Promise<{
    services: number;
    healthyServices: number;
    activeAlerts: number;
    criticalAlerts: number;
    tracesInLastHour: number;
    errorLogsInLastHour: number;
  }> {
    const services = this.serviceHealth.size;
    const healthyServices = Array.from(this.serviceHealth.values())
      .filter(s => s.status === 'healthy').length;
    
    const activeAlerts = Array.from(this.alerts.values())
      .filter(a => a.status === 'active').length;
    
    const criticalAlerts = Array.from(this.alerts.values())
      .filter(a => a.status === 'active' && a.severity === 'critical').length;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const tracesInLastHour = Array.from(this.traces.values())
      .filter(t => t.startTime > oneHourAgo).length;
    
    const errorLogsInLastHour = this.logs
      .filter(l => l.timestamp > oneHourAgo && ['error', 'fatal'].includes(l.level)).length;

    return {
      services,
      healthyServices,
      activeAlerts,
      criticalAlerts,
      tracesInLastHour,
      errorLogsInLastHour
    };
  }

  private initializeDefaultMetrics(): void {
    const defaultMetrics: MetricDefinition[] = [
      {
        name: 'http_requests_total',
        type: 'counter',
        description: 'Total number of HTTP requests',
        labels: ['method', 'status', 'endpoint']
      },
      {
        name: 'http_request_duration_seconds',
        type: 'histogram',
        description: 'HTTP request duration in seconds',
        labels: ['method', 'endpoint'],
        buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10]
      },
      {
        name: 'memory_usage_bytes',
        type: 'gauge',
        description: 'Memory usage in bytes',
        labels: ['type']
      },
      {
        name: 'cpu_usage_percent',
        type: 'gauge',
        description: 'CPU usage percentage',
        labels: ['core']
      }
    ];

    defaultMetrics.forEach(metric => {
      this.metricDefinitions.set(metric.name, metric);
    });
  }

  private startMetricCollection(): void {
    if (!this.config.metrics.enabled) return;

    setInterval(() => {
      this.collectSystemMetrics();
    }, this.config.metrics.scrapeInterval || 15000);
  }

  private startAlertEvaluation(): void {
    if (!this.config.alerting.enabled) return;

    setInterval(() => {
      this.evaluateAlertRules();
    }, this.config.alerting.evaluationInterval || 60000);
  }

  private startHealthChecks(): void {
    setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Every 30 seconds
  }

  private async collectSystemMetrics(): Promise<void> {
    // Collect system metrics
    const memoryUsage = process.memoryUsage();
    await this.setGauge('memory_usage_bytes', memoryUsage.heapUsed, { type: 'heap' });
    await this.setGauge('memory_usage_bytes', memoryUsage.rss, { type: 'rss' });

    // Collect CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    const cpuPercent = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
    await this.setGauge('cpu_usage_percent', cpuPercent, { core: 'all' });
  }

  private async evaluateAlertRules(): Promise<void> {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      try {
        await this.evaluateAlertRule(rule);
      } catch (error) {
        this.emit('error', { operation: 'evaluateAlertRule', error, rule: rule.id });
      }
    }
  }

  private async evaluateAlertRule(rule: AlertRule): Promise<void> {
    const timeRange: TimeRange = {
      from: new Date(Date.now() - rule.condition.evaluationWindow),
      to: new Date()
    };

    const results = await this.queryMetrics(rule.query, timeRange);
    
    for (const result of results) {
      const latestValue = result.values[result.values.length - 1]?.[1];
      if (latestValue === undefined) continue;

      const conditionMet = this.evaluateCondition(latestValue, rule.condition);
      
      if (conditionMet) {
        // Check if alert already exists
        const existingAlert = Array.from(this.alerts.values())
          .find(a => a.name === rule.name && a.status === 'active');

        if (!existingAlert) {
          await this.triggerAlert(
            rule.name,
            rule.severity,
            `Alert condition met: ${rule.query} ${rule.condition.operator} ${rule.condition.threshold}`,
            rule.labels
          );
        }
      }
    }
  }

  private evaluateCondition(value: number, condition: AlertCondition): boolean {
    switch (condition.operator) {
      case 'gt': return value > condition.threshold;
      case 'gte': return value >= condition.threshold;
      case 'lt': return value < condition.threshold;
      case 'lte': return value <= condition.threshold;
      case 'eq': return value === condition.threshold;
      case 'ne': return value !== condition.threshold;
      default: return false;
    }
  }

  private async performHealthChecks(): Promise<void> {
    for (const [serviceName, health] of this.serviceHealth.entries()) {
      try {
        const startTime = Date.now();
        // Simulate health check - in production make actual HTTP request
        const isHealthy = Math.random() > 0.1; // 90% healthy
        const duration = Date.now() - startTime;

        const status = isHealthy ? 'healthy' : 'unhealthy';
        await this.updateServiceHealth(serviceName, status, duration);
        
      } catch (error) {
        await this.updateServiceHealth(serviceName, 'unhealthy');
      }
    }
  }

  private async sendAlertNotifications(alert: Alert): Promise<void> {
    const rule = Array.from(this.alertRules.values())
      .find(r => r.name === alert.name);

    if (!rule) return;

    for (const channelId of rule.notificationChannels) {
      try {
        await this.sendNotification(channelId, alert);
      } catch (error) {
        this.emit('error', { operation: 'sendNotification', error, channelId, alert: alert.id });
      }
    }
  }

  private async sendNotification(channelId: string, alert: Alert): Promise<void> {
    const channel = this.config.alerting.notificationChannels
      .find(c => c.id === channelId);

    if (!channel || !channel.enabled) return;

    // Implement notification sending based on channel type
    this.emit('notificationSent', { channel: channelId, alert: alert.id });
  }

  private checkErrorLogAlerts(logEntry: LogEntry): void {
    // Create automatic alerts for error patterns
    if (logEntry.level === 'error' || logEntry.level === 'fatal') {
      this.triggerAlert(
        'Error Log Alert',
        logEntry.level === 'fatal' ? 'critical' : 'high',
        `${logEntry.level.toUpperCase()}: ${logEntry.message}`,
        { service: logEntry.service, level: logEntry.level }
      );
    }
  }

  private getLatestMetric(name: string, labels: Record<string, string>): Metric | undefined {
    const metrics = this.metrics.get(name);
    if (!metrics) return undefined;

    // Find metric with matching labels
    return metrics
      .filter(m => this.labelsMatch(m.labels, labels))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];
  }

  private labelsMatch(labels1: Record<string, string>, labels2: Record<string, string>): boolean {
    const keys1 = Object.keys(labels1);
    const keys2 = Object.keys(labels2);
    
    if (keys1.length !== keys2.length) return false;
    
    return keys1.every(key => labels1[key] === labels2[key]);
  }

  private getBucketLabels(metricName: string, value: number): Record<string, string> {
    const definition = this.metricDefinitions.get(metricName);
    if (!definition || definition.type !== 'histogram' || !definition.buckets) {
      return {};
    }

    // Find appropriate bucket
    const bucket = definition.buckets.find(b => value <= b);
    return { bucket: bucket ? bucket.toString() : '+Inf' };
  }

  private matchesQuery(metricName: string, query: string): boolean {
    // Simplified query matching - in production use proper query parser
    return metricName.includes(query) || query === '*';
  }

  private trimMetrics(metricName: string): void {
    const metrics = this.metrics.get(metricName)!;
    const maxRetention = this.config.metrics.retention || 86400000; // 24 hours default
    const cutoff = new Date(Date.now() - maxRetention);
    
    this.metrics.set(
      metricName,
      metrics.filter(m => m.timestamp > cutoff)
    );
  }

  private trimLogs(): void {
    const maxRetention = this.config.logging.retention || 86400000; // 24 hours default
    const cutoff = new Date(Date.now() - maxRetention);
    
    this.logs = this.logs.filter(l => l.timestamp > cutoff);
  }

  private generateTraceId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private generateSpanId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}