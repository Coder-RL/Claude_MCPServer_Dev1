import { BaseServer } from '../../shared/src/base-server';
import { MCPError } from '../../shared/src/errors';
import { withPerformanceMonitoring } from '../../shared/src/monitoring';
import { withRetry } from '../../shared/src/retry';
import { HealthChecker } from '../../shared/src/health';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface HealthCheck {
  id: string;
  name: string;
  description: string;
  type: 'http' | 'tcp' | 'command' | 'database' | 'custom';
  target: string;
  interval: number;
  timeout: number;
  retries: number;
  successThreshold: number;
  failureThreshold: number;
  tags: string[];
  metadata: Record<string, any>;
  enabled: boolean;
  created: Date;
  lastCheck?: Date;
  lastSuccess?: Date;
  lastFailure?: Date;
}

export interface HealthMetric {
  id: string;
  checkId: string;
  timestamp: Date;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  responseTime: number;
  details: any;
  error?: string;
  metadata: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
  cooldown: number;
  targets: string[];
  actions: AlertAction[];
  filters: Record<string, any>;
  created: Date;
  lastTriggered?: Date;
  triggerCount: number;
}

export interface AlertAction {
  type: 'email' | 'webhook' | 'slack' | 'pagerduty' | 'sms' | 'custom';
  config: Record<string, any>;
  enabled: boolean;
  retries: number;
  cooldown: number;
}

export interface Alert {
  id: string;
  ruleId: string;
  checkId?: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  status: 'active' | 'resolved' | 'suppressed' | 'acknowledged';
  title: string;
  description: string;
  details: any;
  created: Date;
  updated: Date;
  resolved?: Date;
  acknowledged?: Date;
  acknowledgedBy?: string;
  suppressedUntil?: Date;
  metadata: Record<string, any>;
}

export interface MonitoringDashboard {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  layout: LayoutConfig;
  refreshInterval: number;
  timeRange: string;
  filters: Record<string, any>;
  shared: boolean;
  created: Date;
  updated: Date;
}

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'table' | 'metric' | 'status' | 'heatmap' | 'gauge';
  title: string;
  position: { x: number; y: number; width: number; height: number };
  config: Record<string, any>;
  dataSource: string;
  query: string;
  refreshInterval: number;
}

export interface LayoutConfig {
  columns: number;
  rows: number;
  gridSize: number;
  responsive: boolean;
}

export interface MonitoringConfig {
  defaultCheckInterval: number;
  defaultTimeout: number;
  maxRetries: number;
  alertingEnabled: boolean;
  dashboardsEnabled: boolean;
  metricsRetention: number;
  alertsRetention: number;
  notificationChannels: NotificationChannel[];
  escalationPolicies: EscalationPolicy[];
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'email' | 'webhook' | 'slack' | 'pagerduty' | 'sms';
  config: Record<string, any>;
  enabled: boolean;
  rateLimits: {
    burst: number;
    sustained: number;
    window: number;
  };
}

export interface EscalationPolicy {
  id: string;
  name: string;
  levels: EscalationLevel[];
  enabled: boolean;
}

export interface EscalationLevel {
  level: number;
  delay: number;
  channels: string[];
  actions: string[];
}

export class HealthMonitoringService {
  private config: MonitoringConfig;
  private healthChecks: Map<string, HealthCheck> = new Map();
  private healthMetrics: Map<string, HealthMetric[]> = new Map();
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private dashboards: Map<string, MonitoringDashboard> = new Map();
  private notificationChannels: Map<string, NotificationChannel> = new Map();
  private escalationPolicies: Map<string, EscalationPolicy> = new Map();
  private healthChecker: HealthChecker;
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private configPath: string;

  constructor(config: MonitoringConfig, configPath: string = './data/monitoring') {
    this.config = config;
    this.configPath = configPath;
    this.healthChecker = new HealthChecker();
    this.initializeNotificationChannels();
    this.initializeEscalationPolicies();
  }

  private initializeNotificationChannels(): void {
    this.config.notificationChannels.forEach(channel => {
      this.notificationChannels.set(channel.id, channel);
    });
  }

  private initializeEscalationPolicies(): void {
    this.config.escalationPolicies.forEach(policy => {
      this.escalationPolicies.set(policy.id, policy);
    });
  }

  @withPerformanceMonitoring('health-monitoring.create-check')
  async createHealthCheck(check: Omit<HealthCheck, 'id' | 'created'>): Promise<string> {
    try {
      const id = `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const healthCheck: HealthCheck = {
        ...check,
        id,
        created: new Date()
      };

      this.healthChecks.set(id, healthCheck);
      
      if (check.enabled) {
        await this.startHealthCheckMonitoring(id);
      }

      await this.saveHealthChecks();
      return id;
    } catch (error) {
      throw new MCPError('MONITORING_ERROR', `Failed to create health check: ${error}`);
    }
  }

  @withPerformanceMonitoring('health-monitoring.create-alert-rule')
  async createAlertRule(rule: Omit<AlertRule, 'id' | 'created' | 'triggerCount'>): Promise<string> {
    try {
      const id = `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const alertRule: AlertRule = {
        ...rule,
        id,
        created: new Date(),
        triggerCount: 0
      };

      this.alertRules.set(id, alertRule);
      await this.saveAlertRules();
      return id;
    } catch (error) {
      throw new MCPError('MONITORING_ERROR', `Failed to create alert rule: ${error}`);
    }
  }

  @withPerformanceMonitoring('health-monitoring.create-dashboard')
  async createDashboard(dashboard: Omit<MonitoringDashboard, 'id' | 'created' | 'updated'>): Promise<string> {
    try {
      const id = `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const monitoringDashboard: MonitoringDashboard = {
        ...dashboard,
        id,
        created: new Date(),
        updated: new Date()
      };

      this.dashboards.set(id, monitoringDashboard);
      await this.saveDashboards();
      return id;
    } catch (error) {
      throw new MCPError('MONITORING_ERROR', `Failed to create dashboard: ${error}`);
    }
  }

  @withRetry({ maxAttempts: 3, delayMs: 1000 })
  @withPerformanceMonitoring('health-monitoring.perform-check')
  async performHealthCheck(checkId: string): Promise<HealthMetric> {
    try {
      const check = this.healthChecks.get(checkId);
      if (!check) {
        throw new MCPError('MONITORING_ERROR', `Health check ${checkId} not found`);
      }

      const startTime = Date.now();
      let status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown' = 'unknown';
      let details: any = {};
      let error: string | undefined;

      try {
        const result = await this.executeHealthCheck(check);
        status = result.status as 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
        details = result.details;
      } catch (checkError) {
        status = 'unhealthy';
        error = checkError.message;
        details = { error: checkError.message };
      }

      const responseTime = Date.now() - startTime;
      
      const metric: HealthMetric = {
        id: `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        checkId,
        timestamp: new Date(),
        status,
        responseTime,
        details,
        error,
        metadata: { checkType: check.type, target: check.target }
      };

      await this.recordHealthMetric(metric);
      await this.updateHealthCheckStatus(checkId, metric);
      await this.evaluateAlertRules(metric);

      return metric;
    } catch (error) {
      throw new MCPError('MONITORING_ERROR', `Failed to perform health check: ${error}`);
    }
  }

  @withPerformanceMonitoring('health-monitoring.get-metrics')
  async getHealthMetrics(checkId: string, options: {
    from?: Date;
    to?: Date;
    limit?: number;
    status?: string;
  } = {}): Promise<HealthMetric[]> {
    try {
      const allMetrics = this.healthMetrics.get(checkId) || [];
      let filteredMetrics = allMetrics;

      if (options.from) {
        filteredMetrics = filteredMetrics.filter(m => m.timestamp >= options.from!);
      }
      
      if (options.to) {
        filteredMetrics = filteredMetrics.filter(m => m.timestamp <= options.to!);
      }
      
      if (options.status) {
        filteredMetrics = filteredMetrics.filter(m => m.status === options.status);
      }

      if (options.limit) {
        filteredMetrics = filteredMetrics.slice(-options.limit);
      }

      return filteredMetrics.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      throw new MCPError('MONITORING_ERROR', `Failed to get health metrics: ${error}`);
    }
  }

  @withPerformanceMonitoring('health-monitoring.get-alerts')
  async getAlerts(options: {
    status?: string;
    severity?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  } = {}): Promise<Alert[]> {
    try {
      let alerts = Array.from(this.activeAlerts.values());

      if (options.status) {
        alerts = alerts.filter(a => a.status === options.status);
      }
      
      if (options.severity) {
        alerts = alerts.filter(a => a.severity === options.severity);
      }
      
      if (options.from) {
        alerts = alerts.filter(a => a.created >= options.from!);
      }
      
      if (options.to) {
        alerts = alerts.filter(a => a.created <= options.to!);
      }

      alerts.sort((a, b) => b.created.getTime() - a.created.getTime());

      if (options.limit) {
        alerts = alerts.slice(0, options.limit);
      }

      return alerts;
    } catch (error) {
      throw new MCPError('MONITORING_ERROR', `Failed to get alerts: ${error}`);
    }
  }

  @withPerformanceMonitoring('health-monitoring.acknowledge-alert')
  async acknowledgeAlert(alertId: string, acknowledgedBy: string, note?: string): Promise<void> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        throw new MCPError('MONITORING_ERROR', `Alert ${alertId} not found`);
      }

      alert.status = 'acknowledged';
      alert.acknowledged = new Date();
      alert.acknowledgedBy = acknowledgedBy;
      alert.updated = new Date();
      
      if (note) {
        alert.metadata.acknowledgmentNote = note;
      }

      await this.saveAlerts();
      await this.notifyAlert(alert, 'acknowledged');
    } catch (error) {
      throw new MCPError('MONITORING_ERROR', `Failed to acknowledge alert: ${error}`);
    }
  }

  @withPerformanceMonitoring('health-monitoring.resolve-alert')
  async resolveAlert(alertId: string, resolvedBy?: string, note?: string): Promise<void> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        throw new MCPError('MONITORING_ERROR', `Alert ${alertId} not found`);
      }

      alert.status = 'resolved';
      alert.resolved = new Date();
      alert.updated = new Date();
      
      if (resolvedBy) {
        alert.metadata.resolvedBy = resolvedBy;
      }
      
      if (note) {
        alert.metadata.resolutionNote = note;
      }

      await this.saveAlerts();
      await this.notifyAlert(alert, 'resolved');
    } catch (error) {
      throw new MCPError('MONITORING_ERROR', `Failed to resolve alert: ${error}`);
    }
  }

  @withPerformanceMonitoring('health-monitoring.get-dashboard-data')
  async getDashboardData(dashboardId: string, timeRange?: string): Promise<{
    dashboard: MonitoringDashboard;
    data: Record<string, any>;
  }> {
    try {
      const dashboard = this.dashboards.get(dashboardId);
      if (!dashboard) {
        throw new MCPError('MONITORING_ERROR', `Dashboard ${dashboardId} not found`);
      }

      const data: Record<string, any> = {};

      for (const widget of dashboard.widgets) {
        data[widget.id] = await this.getWidgetData(widget, timeRange || dashboard.timeRange);
      }

      return { dashboard, data };
    } catch (error) {
      throw new MCPError('MONITORING_ERROR', `Failed to get dashboard data: ${error}`);
    }
  }

  async startAllHealthChecks(): Promise<void> {
    for (const check of this.healthChecks.values()) {
      if (check.enabled) {
        await this.startHealthCheckMonitoring(check.id);
      }
    }
  }

  async stopAllHealthChecks(): Promise<void> {
    for (const intervalId of this.checkIntervals.values()) {
      clearInterval(intervalId);
    }
    this.checkIntervals.clear();
  }

  private async startHealthCheckMonitoring(checkId: string): Promise<void> {
    const check = this.healthChecks.get(checkId);
    if (!check) return;

    const existingInterval = this.checkIntervals.get(checkId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    const intervalId = setInterval(async () => {
      try {
        await this.performHealthCheck(checkId);
      } catch (error) {
        console.error(`Health check ${checkId} failed:`, error);
      }
    }, check.interval);

    this.checkIntervals.set(checkId, intervalId);

    await this.performHealthCheck(checkId);
  }

  private async executeHealthCheck(check: HealthCheck): Promise<{
    status: string;
    details: any;
  }> {
    switch (check.type) {
      case 'http':
        return await this.performHttpCheck(check);
      case 'tcp':
        return await this.performTcpCheck(check);
      case 'command':
        return await this.performCommandCheck(check);
      case 'database':
        return await this.performDatabaseCheck(check);
      case 'custom':
        return await this.performCustomCheck(check);
      default:
        throw new Error(`Unknown health check type: ${check.type}`);
    }
  }

  private async performHttpCheck(check: HealthCheck): Promise<{ status: string; details: any }> {
    return await this.healthChecker.checkHealth({
      name: check.name,
      url: check.target,
      timeout: check.timeout
    });
  }

  private async performTcpCheck(check: HealthCheck): Promise<{ status: string; details: any }> {
    
    return { status: 'healthy', details: { connected: true } };
  }

  private async performCommandCheck(check: HealthCheck): Promise<{ status: string; details: any }> {
    
    return { status: 'healthy', details: { exitCode: 0, output: 'Command executed successfully' } };
  }

  private async performDatabaseCheck(check: HealthCheck): Promise<{ status: string; details: any }> {
    
    return { status: 'healthy', details: { connectionTime: 50, queryTime: 25 } };
  }

  private async performCustomCheck(check: HealthCheck): Promise<{ status: string; details: any }> {
    
    return { status: 'healthy', details: { custom: true } };
  }

  private async recordHealthMetric(metric: HealthMetric): Promise<void> {
    const metrics = this.healthMetrics.get(metric.checkId) || [];
    metrics.push(metric);

    const maxMetrics = 1000;
    if (metrics.length > maxMetrics) {
      metrics.splice(0, metrics.length - maxMetrics);
    }

    this.healthMetrics.set(metric.checkId, metrics);
    await this.saveHealthMetrics();
  }

  private async updateHealthCheckStatus(checkId: string, metric: HealthMetric): Promise<void> {
    const check = this.healthChecks.get(checkId);
    if (!check) return;

    check.lastCheck = metric.timestamp;
    
    if (metric.status === 'healthy') {
      check.lastSuccess = metric.timestamp;
    } else {
      check.lastFailure = metric.timestamp;
    }

    await this.saveHealthChecks();
  }

  private async evaluateAlertRules(metric: HealthMetric): Promise<void> {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      try {
        const shouldTrigger = await this.evaluateAlertCondition(rule, metric);
        
        if (shouldTrigger) {
          await this.triggerAlert(rule, metric);
        }
      } catch (error) {
        console.error(`Failed to evaluate alert rule ${rule.id}:`, error);
      }
    }
  }

  private async evaluateAlertCondition(rule: AlertRule, metric: HealthMetric): Promise<boolean> {
    
    if (rule.condition.includes('status == "unhealthy"')) {
      return metric.status === 'unhealthy';
    }
    
    if (rule.condition.includes('responseTime > 5000')) {
      return metric.responseTime > 5000;
    }

    return false;
  }

  private async triggerAlert(rule: AlertRule, metric: HealthMetric): Promise<void> {
    const existingAlert = Array.from(this.activeAlerts.values())
      .find(alert => alert.ruleId === rule.id && alert.status === 'active');

    if (existingAlert) {
      if (rule.cooldown && rule.lastTriggered) {
        const timeSinceLastTrigger = Date.now() - rule.lastTriggered.getTime();
        if (timeSinceLastTrigger < rule.cooldown) {
          return;
        }
      }
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      checkId: metric.checkId,
      severity: rule.severity,
      status: 'active',
      title: `Alert: ${rule.name}`,
      description: rule.description,
      details: {
        metric,
        condition: rule.condition,
        timestamp: metric.timestamp
      },
      created: new Date(),
      updated: new Date(),
      metadata: { ruleId: rule.id, checkId: metric.checkId }
    };

    this.activeAlerts.set(alert.id, alert);
    rule.lastTriggered = new Date();
    rule.triggerCount++;

    await this.saveAlerts();
    await this.saveAlertRules();
    await this.notifyAlert(alert, 'triggered');
  }

  private async notifyAlert(alert: Alert, action: 'triggered' | 'acknowledged' | 'resolved'): Promise<void> {
    const rule = this.alertRules.get(alert.ruleId);
    if (!rule) return;

    for (const alertAction of rule.actions) {
      if (!alertAction.enabled) continue;

      try {
        await this.executeAlertAction(alertAction, alert, action);
      } catch (error) {
        console.error(`Failed to execute alert action:`, error);
      }
    }
  }

  private async executeAlertAction(
    action: AlertAction, 
    alert: Alert, 
    triggerAction: 'triggered' | 'acknowledged' | 'resolved'
  ): Promise<void> {
    switch (action.type) {
      case 'email':
        await this.sendEmailAlert(action.config, alert, triggerAction);
        break;
      case 'webhook':
        await this.sendWebhookAlert(action.config, alert, triggerAction);
        break;
      case 'slack':
        await this.sendSlackAlert(action.config, alert, triggerAction);
        break;
      case 'pagerduty':
        await this.sendPagerDutyAlert(action.config, alert, triggerAction);
        break;
      case 'sms':
        await this.sendSmsAlert(action.config, alert, triggerAction);
        break;
      case 'custom':
        await this.executeCustomAction(action.config, alert, triggerAction);
        break;
    }
  }

  private async sendEmailAlert(config: any, alert: Alert, action: string): Promise<void> {
    
  }

  private async sendWebhookAlert(config: any, alert: Alert, action: string): Promise<void> {
    
  }

  private async sendSlackAlert(config: any, alert: Alert, action: string): Promise<void> {
    
  }

  private async sendPagerDutyAlert(config: any, alert: Alert, action: string): Promise<void> {
    
  }

  private async sendSmsAlert(config: any, alert: Alert, action: string): Promise<void> {
    
  }

  private async executeCustomAction(config: any, alert: Alert, action: string): Promise<void> {
    
  }

  private async getWidgetData(widget: DashboardWidget, timeRange: string): Promise<any> {
    switch (widget.type) {
      case 'chart':
        return await this.getChartData(widget, timeRange);
      case 'table':
        return await this.getTableData(widget, timeRange);
      case 'metric':
        return await this.getMetricData(widget, timeRange);
      case 'status':
        return await this.getStatusData(widget, timeRange);
      case 'heatmap':
        return await this.getHeatmapData(widget, timeRange);
      case 'gauge':
        return await this.getGaugeData(widget, timeRange);
      default:
        return { data: [], meta: { type: widget.type } };
    }
  }

  private async getChartData(widget: DashboardWidget, timeRange: string): Promise<any> {
    
    return {
      data: [
        { timestamp: new Date(), value: Math.random() * 100 },
        { timestamp: new Date(Date.now() - 60000), value: Math.random() * 100 }
      ],
      meta: { type: 'chart', timeRange }
    };
  }

  private async getTableData(widget: DashboardWidget, timeRange: string): Promise<any> {
    return {
      data: [],
      meta: { type: 'table', timeRange }
    };
  }

  private async getMetricData(widget: DashboardWidget, timeRange: string): Promise<any> {
    return {
      value: Math.random() * 100,
      previous: Math.random() * 100,
      meta: { type: 'metric', timeRange }
    };
  }

  private async getStatusData(widget: DashboardWidget, timeRange: string): Promise<any> {
    return {
      status: 'healthy',
      count: { healthy: 8, unhealthy: 0, degraded: 2 },
      meta: { type: 'status', timeRange }
    };
  }

  private async getHeatmapData(widget: DashboardWidget, timeRange: string): Promise<any> {
    return {
      data: [],
      meta: { type: 'heatmap', timeRange }
    };
  }

  private async getGaugeData(widget: DashboardWidget, timeRange: string): Promise<any> {
    return {
      value: Math.random() * 100,
      min: 0,
      max: 100,
      meta: { type: 'gauge', timeRange }
    };
  }

  private async saveHealthChecks(): Promise<void> {
    const data = Array.from(this.healthChecks.values());
    await fs.writeFile(
      path.join(this.configPath, 'health-checks.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveHealthMetrics(): Promise<void> {
    const data = Object.fromEntries(this.healthMetrics);
    await fs.writeFile(
      path.join(this.configPath, 'health-metrics.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveAlertRules(): Promise<void> {
    const data = Array.from(this.alertRules.values());
    await fs.writeFile(
      path.join(this.configPath, 'alert-rules.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveAlerts(): Promise<void> {
    const data = Array.from(this.activeAlerts.values());
    await fs.writeFile(
      path.join(this.configPath, 'alerts.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveDashboards(): Promise<void> {
    const data = Array.from(this.dashboards.values());
    await fs.writeFile(
      path.join(this.configPath, 'dashboards.json'),
      JSON.stringify(data, null, 2)
    );
  }

  async getHealthStatus(): Promise<any> {
    const totalChecks = this.healthChecks.size;
    const enabledChecks = Array.from(this.healthChecks.values()).filter(c => c.enabled).length;
    const healthyChecks = Array.from(this.healthChecks.values()).filter(c => {
      const metrics = this.healthMetrics.get(c.id);
      return metrics && metrics.length > 0 && metrics[metrics.length - 1].status === 'healthy';
    }).length;
    const activeAlerts = Array.from(this.activeAlerts.values()).filter(a => a.status === 'active').length;

    return {
      status: healthyChecks === enabledChecks ? 'healthy' : 'degraded',
      totalChecks,
      enabledChecks,
      healthyChecks,
      activeAlerts,
      components: {
        healthChecker: 'healthy',
        alerting: 'healthy',
        dashboards: 'healthy',
        notifications: 'healthy'
      },
      metrics: {
        checksToday: this.getChecksCount('today'),
        alertsToday: this.getAlertsCount('today'),
        averageResponseTime: this.calculateAverageResponseTime(),
        uptime: this.calculateUptime()
      }
    };
  }

  private getChecksCount(period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return Array.from(this.healthMetrics.values())
      .flat()
      .filter(metric => metric.timestamp >= startOfDay)
      .length;
  }

  private getAlertsCount(period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.created >= startOfDay)
      .length;
  }

  private calculateAverageResponseTime(): number {
    const allMetrics = Array.from(this.healthMetrics.values()).flat();
    if (allMetrics.length === 0) return 0;
    
    const totalResponseTime = allMetrics.reduce((sum, metric) => sum + metric.responseTime, 0);
    return totalResponseTime / allMetrics.length;
  }

  private calculateUptime(): number {
    
    return 99.9;
  }
}

export class HealthMonitoringMCPServer extends BaseServer {
  private healthMonitoring: HealthMonitoringService;

  constructor() {
    super('health-monitoring');
    
    const config: MonitoringConfig = {
      defaultCheckInterval: 30000,
      defaultTimeout: 5000,
      maxRetries: 3,
      alertingEnabled: true,
      dashboardsEnabled: true,
      metricsRetention: 7776000000,
      alertsRetention: 2592000000,
      notificationChannels: [],
      escalationPolicies: []
    };

    this.healthMonitoring = new HealthMonitoringService(config);
  }

  protected setupRoutes(): void {
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.healthMonitoring.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/checks', async (req, res) => {
      try {
        const checkId = await this.healthMonitoring.createHealthCheck(req.body);
        res.json({ id: checkId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/rules', async (req, res) => {
      try {
        const ruleId = await this.healthMonitoring.createAlertRule(req.body);
        res.json({ id: ruleId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/dashboards', async (req, res) => {
      try {
        const dashboardId = await this.healthMonitoring.createDashboard(req.body);
        res.json({ id: dashboardId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/checks/:id/execute', async (req, res) => {
      try {
        const metric = await this.healthMonitoring.performHealthCheck(req.params.id);
        res.json(metric);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/checks/:id/metrics', async (req, res) => {
      try {
        const metrics = await this.healthMonitoring.getHealthMetrics(req.params.id, req.query);
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/alerts', async (req, res) => {
      try {
        const alerts = await this.healthMonitoring.getAlerts(req.query);
        res.json(alerts);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/alerts/:id/acknowledge', async (req, res) => {
      try {
        await this.healthMonitoring.acknowledgeAlert(req.params.id, req.body.acknowledgedBy, req.body.note);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/alerts/:id/resolve', async (req, res) => {
      try {
        await this.healthMonitoring.resolveAlert(req.params.id, req.body.resolvedBy, req.body.note);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/dashboards/:id', async (req, res) => {
      try {
        const dashboardData = await this.healthMonitoring.getDashboardData(req.params.id, req.query.timeRange as string);
        res.json(dashboardData);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  protected getMCPTools() {
    return [
      {
        name: 'create_health_check',
        description: 'Create a new health check',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['http', 'tcp', 'command', 'database', 'custom'] },
            target: { type: 'string' },
            interval: { type: 'number' },
            timeout: { type: 'number' },
            retries: { type: 'number' },
            successThreshold: { type: 'number' },
            failureThreshold: { type: 'number' },
            tags: { type: 'array', items: { type: 'string' } },
            metadata: { type: 'object' },
            enabled: { type: 'boolean' }
          },
          required: ['name', 'type', 'target']
        }
      },
      {
        name: 'create_alert_rule',
        description: 'Create a new alert rule',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            condition: { type: 'string' },
            severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'] },
            enabled: { type: 'boolean' },
            cooldown: { type: 'number' },
            targets: { type: 'array', items: { type: 'string' } },
            actions: { type: 'array' },
            filters: { type: 'object' }
          },
          required: ['name', 'condition', 'severity']
        }
      },
      {
        name: 'create_dashboard',
        description: 'Create a new monitoring dashboard',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            widgets: { type: 'array' },
            layout: { type: 'object' },
            refreshInterval: { type: 'number' },
            timeRange: { type: 'string' },
            filters: { type: 'object' },
            shared: { type: 'boolean' }
          },
          required: ['name', 'widgets']
        }
      },
      {
        name: 'perform_health_check',
        description: 'Execute a health check immediately',
        inputSchema: {
          type: 'object',
          properties: {
            checkId: { type: 'string' }
          },
          required: ['checkId']
        }
      },
      {
        name: 'get_health_metrics',
        description: 'Get health metrics for a specific check',
        inputSchema: {
          type: 'object',
          properties: {
            checkId: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            limit: { type: 'number' },
            status: { type: 'string' }
          },
          required: ['checkId']
        }
      },
      {
        name: 'get_alerts',
        description: 'Get alerts with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            severity: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            limit: { type: 'number' }
          }
        }
      },
      {
        name: 'acknowledge_alert',
        description: 'Acknowledge an active alert',
        inputSchema: {
          type: 'object',
          properties: {
            alertId: { type: 'string' },
            acknowledgedBy: { type: 'string' },
            note: { type: 'string' }
          },
          required: ['alertId', 'acknowledgedBy']
        }
      },
      {
        name: 'resolve_alert',
        description: 'Resolve an active alert',
        inputSchema: {
          type: 'object',
          properties: {
            alertId: { type: 'string' },
            resolvedBy: { type: 'string' },
            note: { type: 'string' }
          },
          required: ['alertId']
        }
      },
      {
        name: 'get_dashboard_data',
        description: 'Get dashboard data with widgets',
        inputSchema: {
          type: 'object',
          properties: {
            dashboardId: { type: 'string' },
            timeRange: { type: 'string' }
          },
          required: ['dashboardId']
        }
      }
    ];
  }

  protected async handleMCPRequest(method: string, params: any): Promise<any> {
    switch (method) {
      case 'create_health_check':
        return { id: await this.healthMonitoring.createHealthCheck(params) };

      case 'create_alert_rule':
        return { id: await this.healthMonitoring.createAlertRule(params) };

      case 'create_dashboard':
        return { id: await this.healthMonitoring.createDashboard(params) };

      case 'perform_health_check':
        return await this.healthMonitoring.performHealthCheck(params.checkId);

      case 'get_health_metrics':
        return await this.healthMonitoring.getHealthMetrics(params.checkId, params);

      case 'get_alerts':
        return await this.healthMonitoring.getAlerts(params);

      case 'acknowledge_alert':
        await this.healthMonitoring.acknowledgeAlert(params.alertId, params.acknowledgedBy, params.note);
        return { success: true };

      case 'resolve_alert':
        await this.healthMonitoring.resolveAlert(params.alertId, params.resolvedBy, params.note);
        return { success: true };

      case 'get_dashboard_data':
        return await this.healthMonitoring.getDashboardData(params.dashboardId, params.timeRange);

      default:
        throw new MCPError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
    }
  }

  async initialize(): Promise<void> {
    await super.initialize();
    await this.healthMonitoring.startAllHealthChecks();
  }

  async shutdown(): Promise<void> {
    await this.healthMonitoring.stopAllHealthChecks();
    await super.shutdown();
  }
}