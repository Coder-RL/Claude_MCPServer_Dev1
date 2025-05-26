import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface HealthCheck {
  id: string;
  name: string;
  description: string;
  type: 'http' | 'tcp' | 'database' | 'custom' | 'composite' | 'dependency';
  target: HealthTarget;
  configuration: HealthCheckConfig;
  schedule: ScheduleConfig;
  thresholds: ThresholdConfig;
  actions: ActionConfig[];
  tags: string[];
  dependencies: string[];
  enabled: boolean;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown' | 'maintenance';
  lastCheck: Date;
  nextCheck: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  uptime: number; // percentage
  created: Date;
  modified: Date;
}

export interface HealthTarget {
  id: string;
  name: string;
  type: 'service' | 'database' | 'external-api' | 'infrastructure' | 'application';
  endpoint: string;
  region?: string;
  environment: string;
  criticality: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
}

export interface HealthCheckConfig {
  timeout: number; // seconds
  retries: number;
  retryDelay: number; // seconds
  method?: string; // for HTTP checks
  headers?: Record<string, string>;
  body?: string;
  expectedStatus?: number[];
  expectedContent?: string;
  expectedContentType?: string;
  authentication?: AuthConfig;
  ssl?: SSLConfig;
  proxy?: ProxyConfig;
  customScript?: string;
  parameters?: Record<string, any>;
}

export interface AuthConfig {
  type: 'basic' | 'bearer' | 'api-key' | 'oauth2' | 'certificate';
  credentials: Record<string, string>;
  refreshToken?: string;
  tokenEndpoint?: string;
}

export interface SSLConfig {
  verify: boolean;
  ca?: string;
  cert?: string;
  key?: string;
  allowSelfSigned: boolean;
}

export interface ProxyConfig {
  enabled: boolean;
  host: string;
  port: number;
  auth?: AuthConfig;
}

export interface ScheduleConfig {
  interval: number; // seconds
  jitter: number; // seconds (randomization)
  timezone: string;
  activeHours?: {
    start: string; // HH:MM
    end: string; // HH:MM
    days: number[]; // 0-6, Sunday = 0
  };
  maintenanceWindows?: MaintenanceWindow[];
}

export interface MaintenanceWindow {
  id: string;
  name: string;
  start: Date;
  end: Date;
  recurring: boolean;
  recurrencePattern?: string; // cron expression
}

export interface ThresholdConfig {
  responseTime: {
    warning: number; // ms
    critical: number; // ms
  };
  failureThreshold: number; // consecutive failures before marking unhealthy
  recoveryThreshold: number; // consecutive successes before marking healthy
  uptimeThreshold: {
    warning: number; // percentage
    critical: number; // percentage
  };
  customThresholds?: CustomThreshold[];
}

export interface CustomThreshold {
  metric: string;
  warning: number;
  critical: number;
  operator: 'greater-than' | 'less-than' | 'equals' | 'not-equals';
}

export interface ActionConfig {
  id: string;
  name: string;
  type: 'notification' | 'webhook' | 'script' | 'escalation' | 'auto-recovery';
  trigger: 'failure' | 'recovery' | 'degraded' | 'threshold-breach';
  conditions: ActionCondition[];
  configuration: Record<string, any>;
  cooldown: number; // seconds
  enabled: boolean;
  lastExecuted?: Date;
}

export interface ActionCondition {
  type: 'consecutive-failures' | 'uptime-below' | 'response-time-above' | 'custom';
  value: number;
  duration?: number; // seconds
}

export interface HealthCheckResult {
  id: string;
  checkId: string;
  timestamp: Date;
  status: 'success' | 'failure' | 'timeout' | 'error';
  responseTime: number; // ms
  statusCode?: number;
  message: string;
  details?: HealthCheckDetails;
  metrics: HealthMetrics;
  error?: string;
  retryCount: number;
}

export interface HealthCheckDetails {
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  contentLength?: number;
  resolvedIP?: string;
  certificateInfo?: CertificateInfo;
}

export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  serialNumber: string;
}

export interface HealthMetrics {
  availability: number; // percentage
  responseTime: number; // ms
  throughput: number; // checks per minute
  errorRate: number; // percentage
  mttr: number; // mean time to recovery in seconds
  mtbf: number; // mean time between failures in seconds
  customMetrics: Record<string, number>;
}

export interface HealthSummary {
  timestamp: Date;
  overallStatus: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
  totalChecks: number;
  healthyChecks: number;
  unhealthyChecks: number;
  degradedChecks: number;
  unknownChecks: number;
  averageResponseTime: number;
  overallAvailability: number;
  criticalServices: ServiceStatus[];
  recentIncidents: HealthIncident[];
  upcomingMaintenance: MaintenanceWindow[];
}

export interface ServiceStatus {
  serviceId: string;
  serviceName: string;
  status: string;
  lastCheck: Date;
  responseTime: number;
  availability: number;
  checkCount: number;
}

export interface HealthIncident {
  id: string;
  checkId: string;
  serviceName: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  startTime: Date;
  endTime?: Date;
  duration?: number; // seconds
  description: string;
  impact: string;
  resolution?: string;
  assignedTo?: string;
  updates: IncidentUpdate[];
}

export interface IncidentUpdate {
  id: string;
  timestamp: Date;
  status: string;
  message: string;
  author: string;
}

export interface CircuitBreakerConfig {
  enabled: boolean;
  failureThreshold: number;
  successThreshold: number;
  timeout: number; // seconds
  resetTimeout: number; // seconds
  monitoringPeriod: number; // seconds
  skipOnCircuitOpen: boolean;
}

export interface CircuitBreakerState {
  checkId: string;
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successes: number;
  lastFailure: Date;
  lastSuccess: Date;
  lastStateChange: Date;
  nextAttemptTime: Date;
}

export class HealthChecker extends EventEmitter {
  private checks = new Map<string, HealthCheck>();
  private results = new Map<string, HealthCheckResult[]>();
  private incidents = new Map<string, HealthIncident>();
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private scheduledChecks = new Map<string, NodeJS.Timeout>();
  private maintenanceWindows: MaintenanceWindow[] = [];
  private metricsAggregation: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startMetricsAggregation();
    this.startCleanupProcess();
  }

  addHealthCheck(check: Omit<HealthCheck, 'id' | 'status' | 'lastCheck' | 'nextCheck' | 'consecutiveFailures' | 'consecutiveSuccesses' | 'uptime' | 'created' | 'modified'>): string {
    const healthCheck: HealthCheck = {
      id: crypto.randomUUID(),
      status: 'unknown',
      lastCheck: new Date(0),
      nextCheck: new Date(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      uptime: 100,
      created: new Date(),
      modified: new Date(),
      ...check
    };

    this.checks.set(healthCheck.id, healthCheck);
    this.results.set(healthCheck.id, []);

    // Initialize circuit breaker if enabled
    if (check.configuration.customScript?.includes('circuitBreaker')) {
      this.initializeCircuitBreaker(healthCheck.id);
    }

    // Schedule the health check
    this.scheduleHealthCheck(healthCheck);

    this.emit('health-check-added', healthCheck);
    return healthCheck.id;
  }

  removeHealthCheck(checkId: string): boolean {
    const check = this.checks.get(checkId);
    if (!check) {
      return false;
    }

    // Cancel scheduled check
    const scheduledCheck = this.scheduledChecks.get(checkId);
    if (scheduledCheck) {
      clearTimeout(scheduledCheck);
      this.scheduledChecks.delete(checkId);
    }

    // Clean up data
    this.checks.delete(checkId);
    this.results.delete(checkId);
    this.circuitBreakers.delete(checkId);
    
    // Close any open incidents
    for (const incident of this.incidents.values()) {
      if (incident.checkId === checkId && incident.status !== 'closed') {
        incident.status = 'closed';
        incident.endTime = new Date();
        incident.duration = incident.endTime.getTime() - incident.startTime.getTime();
      }
    }

    this.emit('health-check-removed', { checkId });
    return true;
  }

  updateHealthCheck(checkId: string, updates: Partial<HealthCheck>): boolean {
    const check = this.checks.get(checkId);
    if (!check) {
      return false;
    }

    Object.assign(check, updates);
    check.modified = new Date();

    // Reschedule if schedule changed
    if (updates.schedule) {
      const scheduledCheck = this.scheduledChecks.get(checkId);
      if (scheduledCheck) {
        clearTimeout(scheduledCheck);
      }
      this.scheduleHealthCheck(check);
    }

    this.emit('health-check-updated', check);
    return true;
  }

  async executeHealthCheck(checkId: string, force: boolean = false): Promise<HealthCheckResult> {
    const check = this.checks.get(checkId);
    if (!check) {
      throw new Error(`Health check not found: ${checkId}`);
    }

    if (!force && !check.enabled) {
      throw new Error(`Health check is disabled: ${checkId}`);
    }

    // Check if in maintenance window
    if (!force && this.isInMaintenanceWindow(check)) {
      const result: HealthCheckResult = {
        id: crypto.randomUUID(),
        checkId,
        timestamp: new Date(),
        status: 'success',
        responseTime: 0,
        message: 'Skipped - maintenance window',
        metrics: this.getDefaultMetrics(),
        retryCount: 0
      };
      
      this.recordResult(check, result);
      return result;
    }

    // Check circuit breaker
    const circuitBreaker = this.circuitBreakers.get(checkId);
    if (circuitBreaker && circuitBreaker.state === 'open' && !force) {
      if (Date.now() < circuitBreaker.nextAttemptTime.getTime()) {
        const result: HealthCheckResult = {
          id: crypto.randomUUID(),
          checkId,
          timestamp: new Date(),
          status: 'failure',
          responseTime: 0,
          message: 'Circuit breaker is open',
          metrics: this.getDefaultMetrics(),
          retryCount: 0
        };
        
        this.recordResult(check, result);
        return result;
      } else {
        // Transition to half-open
        circuitBreaker.state = 'half-open';
        circuitBreaker.lastStateChange = new Date();
      }
    }

    let result: HealthCheckResult;
    const startTime = Date.now();

    try {
      result = await this.performHealthCheck(check);
      
      // Update circuit breaker on success
      if (circuitBreaker) {
        this.handleCircuitBreakerSuccess(circuitBreaker);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      result = {
        id: crypto.randomUUID(),
        checkId,
        timestamp: new Date(),
        status: 'error',
        responseTime,
        message: (error as Error).message,
        error: (error as Error).stack,
        metrics: this.getDefaultMetrics(),
        retryCount: 0
      };

      // Update circuit breaker on failure
      if (circuitBreaker) {
        this.handleCircuitBreakerFailure(circuitBreaker);
      }
    }

    this.recordResult(check, result);
    return result;
  }

  private async performHealthCheck(check: HealthCheck): Promise<HealthCheckResult> {
    const config = check.configuration;
    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount <= config.retries) {
      try {
        const result = await this.executeCheck(check, retryCount);
        return result;
      } catch (error) {
        lastError = error as Error;
        retryCount++;
        
        if (retryCount <= config.retries) {
          await this.delay(config.retryDelay * 1000);
        }
      }
    }

    throw lastError;
  }

  private async executeCheck(check: HealthCheck, retryCount: number): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    switch (check.type) {
      case 'http':
        return this.executeHttpCheck(check, startTime, retryCount);
      
      case 'tcp':
        return this.executeTcpCheck(check, startTime, retryCount);
      
      case 'database':
        return this.executeDatabaseCheck(check, startTime, retryCount);
      
      case 'custom':
        return this.executeCustomCheck(check, startTime, retryCount);
      
      case 'composite':
        return this.executeCompositeCheck(check, startTime, retryCount);
      
      case 'dependency':
        return this.executeDependencyCheck(check, startTime, retryCount);
      
      default:
        throw new Error(`Unsupported health check type: ${check.type}`);
    }
  }

  private async executeHttpCheck(check: HealthCheck, startTime: number, retryCount: number): Promise<HealthCheckResult> {
    const config = check.configuration;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout * 1000);

    try {
      const headers = { ...config.headers };
      
      // Add authentication
      if (config.authentication) {
        await this.addAuthentication(headers, config.authentication);
      }

      const response = await fetch(check.target.endpoint, {
        method: config.method || 'GET',
        headers,
        body: config.body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      const responseTime = Date.now() - startTime;
      const responseBody = await response.text();

      // Check expected status
      if (config.expectedStatus && !config.expectedStatus.includes(response.status)) {
        throw new Error(`Unexpected status code: ${response.status}`);
      }

      // Check expected content
      if (config.expectedContent && !responseBody.includes(config.expectedContent)) {
        throw new Error(`Expected content not found: ${config.expectedContent}`);
      }

      // Check expected content type
      const contentType = response.headers.get('content-type') || '';
      if (config.expectedContentType && !contentType.includes(config.expectedContentType)) {
        throw new Error(`Unexpected content type: ${contentType}`);
      }

      return {
        id: crypto.randomUUID(),
        checkId: check.id,
        timestamp: new Date(),
        status: 'success',
        responseTime,
        statusCode: response.status,
        message: 'Health check successful',
        details: {
          endpoint: check.target.endpoint,
          method: config.method || 'GET',
          headers: headers,
          body: config.body,
          responseHeaders: Object.fromEntries(response.headers.entries()),
          responseBody: responseBody.substring(0, 1000), // Limit body size
          contentLength: parseInt(response.headers.get('content-length') || '0')
        },
        metrics: this.calculateMetrics(check.id, responseTime),
        retryCount
      };

    } catch (error) {
      clearTimeout(timeoutId);
      
      const responseTime = Date.now() - startTime;
      const status = error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'failure';
      
      throw new Error(`HTTP check failed: ${(error as Error).message}`);
    }
  }

  private async executeTcpCheck(check: HealthCheck, startTime: number, retryCount: number): Promise<HealthCheckResult> {
    const url = new URL(check.target.endpoint);
    const host = url.hostname;
    const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);

    return new Promise((resolve, reject) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error('TCP connection timeout'));
      }, check.configuration.timeout * 1000);

      socket.connect(port, host, () => {
        clearTimeout(timeout);
        const responseTime = Date.now() - startTime;
        
        socket.destroy();
        
        resolve({
          id: crypto.randomUUID(),
          checkId: check.id,
          timestamp: new Date(),
          status: 'success',
          responseTime,
          message: 'TCP connection successful',
          details: {
            endpoint: check.target.endpoint,
            method: 'TCP',
            headers: {}
          },
          metrics: this.calculateMetrics(check.id, responseTime),
          retryCount
        });
      });

      socket.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private async executeDatabaseCheck(check: HealthCheck, startTime: number, retryCount: number): Promise<HealthCheckResult> {
    // Database health check implementation would depend on the specific database
    // This is a simplified example
    try {
      // Simulate database connection and query
      await this.delay(Math.random() * 100); // Random delay up to 100ms
      
      const responseTime = Date.now() - startTime;
      
      return {
        id: crypto.randomUUID(),
        checkId: check.id,
        timestamp: new Date(),
        status: 'success',
        responseTime,
        message: 'Database connection successful',
        details: {
          endpoint: check.target.endpoint,
          method: 'DATABASE',
          headers: {}
        },
        metrics: this.calculateMetrics(check.id, responseTime),
        retryCount
      };

    } catch (error) {
      throw new Error(`Database check failed: ${(error as Error).message}`);
    }
  }

  private async executeCustomCheck(check: HealthCheck, startTime: number, retryCount: number): Promise<HealthCheckResult> {
    if (!check.configuration.customScript) {
      throw new Error('Custom script not provided');
    }

    try {
      // In production, this would execute the custom script in a secure environment
      // For now, we'll simulate the execution
      await this.delay(Math.random() * 200);
      
      const responseTime = Date.now() - startTime;
      
      return {
        id: crypto.randomUUID(),
        checkId: check.id,
        timestamp: new Date(),
        status: 'success',
        responseTime,
        message: 'Custom check successful',
        details: {
          endpoint: check.target.endpoint,
          method: 'CUSTOM',
          headers: {}
        },
        metrics: this.calculateMetrics(check.id, responseTime),
        retryCount
      };

    } catch (error) {
      throw new Error(`Custom check failed: ${(error as Error).message}`);
    }
  }

  private async executeCompositeCheck(check: HealthCheck, startTime: number, retryCount: number): Promise<HealthCheckResult> {
    const dependencyResults: HealthCheckResult[] = [];
    let allHealthy = true;
    let totalResponseTime = 0;

    // Execute all dependency checks
    for (const dependencyId of check.dependencies) {
      try {
        const dependencyResult = await this.executeHealthCheck(dependencyId);
        dependencyResults.push(dependencyResult);
        totalResponseTime += dependencyResult.responseTime;
        
        if (dependencyResult.status !== 'success') {
          allHealthy = false;
        }
      } catch (error) {
        allHealthy = false;
        dependencyResults.push({
          id: crypto.randomUUID(),
          checkId: dependencyId,
          timestamp: new Date(),
          status: 'error',
          responseTime: 0,
          message: (error as Error).message,
          metrics: this.getDefaultMetrics(),
          retryCount: 0
        });
      }
    }

    const responseTime = Date.now() - startTime;

    return {
      id: crypto.randomUUID(),
      checkId: check.id,
      timestamp: new Date(),
      status: allHealthy ? 'success' : 'failure',
      responseTime,
      message: allHealthy ? 'All dependencies healthy' : 'One or more dependencies unhealthy',
      details: {
        endpoint: check.target.endpoint,
        method: 'COMPOSITE',
        headers: {},
        responseBody: JSON.stringify(dependencyResults)
      },
      metrics: this.calculateMetrics(check.id, responseTime),
      retryCount
    };
  }

  private async executeDependencyCheck(check: HealthCheck, startTime: number, retryCount: number): Promise<HealthCheckResult> {
    // Dependency checks verify that required services are available
    const dependencies = check.dependencies;
    const unhealthyDependencies: string[] = [];

    for (const dependencyId of dependencies) {
      const dependencyCheck = this.checks.get(dependencyId);
      if (!dependencyCheck || dependencyCheck.status !== 'healthy') {
        unhealthyDependencies.push(dependencyId);
      }
    }

    const responseTime = Date.now() - startTime;
    const isHealthy = unhealthyDependencies.length === 0;

    return {
      id: crypto.randomUUID(),
      checkId: check.id,
      timestamp: new Date(),
      status: isHealthy ? 'success' : 'failure',
      responseTime,
      message: isHealthy ? 'All dependencies available' : `Unhealthy dependencies: ${unhealthyDependencies.join(', ')}`,
      details: {
        endpoint: check.target.endpoint,
        method: 'DEPENDENCY',
        headers: {},
        responseBody: JSON.stringify({ unhealthyDependencies })
      },
      metrics: this.calculateMetrics(check.id, responseTime),
      retryCount
    };
  }

  private async addAuthentication(headers: Record<string, string>, auth: AuthConfig): Promise<void> {
    switch (auth.type) {
      case 'basic':
        const basicAuth = Buffer.from(`${auth.credentials.username}:${auth.credentials.password}`).toString('base64');
        headers['Authorization'] = `Basic ${basicAuth}`;
        break;
      
      case 'bearer':
        headers['Authorization'] = `Bearer ${auth.credentials.token}`;
        break;
      
      case 'api-key':
        headers[auth.credentials.headerName || 'X-API-Key'] = auth.credentials.apiKey;
        break;
      
      case 'oauth2':
        // Would implement OAuth2 token refresh logic
        headers['Authorization'] = `Bearer ${auth.credentials.accessToken}`;
        break;
    }
  }

  private calculateMetrics(checkId: string, responseTime: number): HealthMetrics {
    const results = this.results.get(checkId) || [];
    const recentResults = results.slice(-100); // Last 100 results
    
    if (recentResults.length === 0) {
      return this.getDefaultMetrics();
    }

    const successCount = recentResults.filter(r => r.status === 'success').length;
    const availability = (successCount / recentResults.length) * 100;
    const averageResponseTime = recentResults.reduce((sum, r) => sum + r.responseTime, 0) / recentResults.length;
    const errorRate = ((recentResults.length - successCount) / recentResults.length) * 100;

    // Calculate MTTR and MTBF
    let mttr = 0;
    let mtbf = 0;
    let failureStart: Date | null = null;
    let lastRecovery: Date | null = null;
    let failureDurations: number[] = [];
    let successDurations: number[] = [];

    for (let i = 0; i < recentResults.length; i++) {
      const result = recentResults[i];
      
      if (result.status !== 'success' && !failureStart) {
        failureStart = result.timestamp;
      } else if (result.status === 'success' && failureStart) {
        failureDurations.push(result.timestamp.getTime() - failureStart.getTime());
        failureStart = null;
        lastRecovery = result.timestamp;
      } else if (result.status === 'success' && lastRecovery && i > 0) {
        const prevResult = recentResults[i - 1];
        if (prevResult.status === 'success') {
          successDurations.push(result.timestamp.getTime() - prevResult.timestamp.getTime());
        }
      }
    }

    if (failureDurations.length > 0) {
      mttr = failureDurations.reduce((sum, d) => sum + d, 0) / failureDurations.length / 1000; // Convert to seconds
    }

    if (successDurations.length > 0) {
      mtbf = successDurations.reduce((sum, d) => sum + d, 0) / successDurations.length / 1000; // Convert to seconds
    }

    return {
      availability,
      responseTime: averageResponseTime,
      throughput: recentResults.length / 60, // Assuming results span roughly 1 hour
      errorRate,
      mttr,
      mtbf,
      customMetrics: {}
    };
  }

  private getDefaultMetrics(): HealthMetrics {
    return {
      availability: 0,
      responseTime: 0,
      throughput: 0,
      errorRate: 0,
      mttr: 0,
      mtbf: 0,
      customMetrics: {}
    };
  }

  private recordResult(check: HealthCheck, result: HealthCheckResult): void {
    // Store result
    const results = this.results.get(check.id) || [];
    results.push(result);
    
    // Keep only recent results (last 1000)
    if (results.length > 1000) {
      results.splice(0, results.length - 1000);
    }
    
    this.results.set(check.id, results);

    // Update check status
    const previousStatus = check.status;
    
    if (result.status === 'success') {
      check.consecutiveSuccesses++;
      check.consecutiveFailures = 0;
      
      if (check.consecutiveSuccesses >= check.thresholds.recoveryThreshold) {
        check.status = 'healthy';
      }
    } else {
      check.consecutiveFailures++;
      check.consecutiveSuccesses = 0;
      
      if (check.consecutiveFailures >= check.thresholds.failureThreshold) {
        check.status = 'unhealthy';
      } else if (check.consecutiveFailures > 1) {
        check.status = 'degraded';
      }
    }

    // Check response time thresholds
    if (result.responseTime > check.thresholds.responseTime.critical) {
      check.status = check.status === 'healthy' ? 'degraded' : check.status;
    }

    check.lastCheck = result.timestamp;
    check.nextCheck = new Date(Date.now() + check.schedule.interval * 1000);

    // Calculate uptime
    const recentResults = results.slice(-100);
    if (recentResults.length > 0) {
      const successCount = recentResults.filter(r => r.status === 'success').length;
      check.uptime = (successCount / recentResults.length) * 100;
    }

    // Handle status change
    if (previousStatus !== check.status) {
      this.handleStatusChange(check, previousStatus, result);
    }

    // Execute actions
    this.executeActions(check, result);

    // Schedule next check
    this.scheduleHealthCheck(check);

    this.emit('health-check-completed', { check, result });
  }

  private handleStatusChange(check: HealthCheck, previousStatus: string, result: HealthCheckResult): void {
    if (check.status === 'unhealthy' && previousStatus !== 'unhealthy') {
      // Create incident
      const incident: HealthIncident = {
        id: crypto.randomUUID(),
        checkId: check.id,
        serviceName: check.target.name,
        severity: this.mapCriticalityToSeverity(check.target.criticality),
        status: 'open',
        startTime: result.timestamp,
        description: `${check.name} is unhealthy: ${result.message}`,
        impact: this.calculateImpact(check),
        updates: [{
          id: crypto.randomUUID(),
          timestamp: result.timestamp,
          status: 'detected',
          message: `Service became unhealthy: ${result.message}`,
          author: 'health-checker'
        }]
      };

      this.incidents.set(incident.id, incident);
      this.emit('incident-created', incident);

    } else if (check.status === 'healthy' && previousStatus === 'unhealthy') {
      // Resolve incident
      for (const incident of this.incidents.values()) {
        if (incident.checkId === check.id && incident.status !== 'closed') {
          incident.status = 'resolved';
          incident.endTime = result.timestamp;
          incident.duration = incident.endTime.getTime() - incident.startTime.getTime();
          incident.resolution = `Service recovered: ${result.message}`;
          
          incident.updates.push({
            id: crypto.randomUUID(),
            timestamp: result.timestamp,
            status: 'resolved',
            message: `Service recovered: ${result.message}`,
            author: 'health-checker'
          });

          this.emit('incident-resolved', incident);
          break;
        }
      }
    }

    this.emit('status-changed', {
      checkId: check.id,
      serviceName: check.target.name,
      previousStatus,
      newStatus: check.status,
      timestamp: result.timestamp
    });
  }

  private mapCriticalityToSeverity(criticality: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (criticality) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return 'medium';
    }
  }

  private calculateImpact(check: HealthCheck): string {
    switch (check.target.criticality) {
      case 'critical':
        return 'Critical service outage - immediate attention required';
      case 'high':
        return 'High impact service degradation';
      case 'medium':
        return 'Moderate service impact';
      case 'low':
        return 'Low impact service issue';
      default:
        return 'Service issue detected';
    }
  }

  private executeActions(check: HealthCheck, result: HealthCheckResult): void {
    for (const action of check.actions) {
      if (!action.enabled) continue;

      const shouldExecute = this.shouldExecuteAction(action, check, result);
      if (shouldExecute) {
        this.executeAction(action, check, result);
      }
    }
  }

  private shouldExecuteAction(action: ActionConfig, check: HealthCheck, result: HealthCheckResult): boolean {
    // Check cooldown
    if (action.lastExecuted) {
      const timeSinceLastExecution = Date.now() - action.lastExecuted.getTime();
      if (timeSinceLastExecution < action.cooldown * 1000) {
        return false;
      }
    }

    // Check trigger
    switch (action.trigger) {
      case 'failure':
        if (result.status === 'success') return false;
        break;
      case 'recovery':
        if (result.status !== 'success') return false;
        break;
      case 'degraded':
        if (check.status !== 'degraded') return false;
        break;
      case 'threshold-breach':
        // Check specific threshold conditions
        break;
    }

    // Check conditions
    for (const condition of action.conditions) {
      if (!this.evaluateActionCondition(condition, check, result)) {
        return false;
      }
    }

    return true;
  }

  private evaluateActionCondition(condition: ActionCondition, check: HealthCheck, result: HealthCheckResult): boolean {
    switch (condition.type) {
      case 'consecutive-failures':
        return check.consecutiveFailures >= condition.value;
      
      case 'uptime-below':
        return check.uptime < condition.value;
      
      case 'response-time-above':
        return result.responseTime > condition.value;
      
      case 'custom':
        // Custom condition evaluation would be implemented here
        return true;
      
      default:
        return true;
    }
  }

  private async executeAction(action: ActionConfig, check: HealthCheck, result: HealthCheckResult): Promise<void> {
    action.lastExecuted = new Date();

    try {
      switch (action.type) {
        case 'notification':
          await this.sendNotification(action, check, result);
          break;
        
        case 'webhook':
          await this.callWebhook(action, check, result);
          break;
        
        case 'script':
          await this.executeScript(action, check, result);
          break;
        
        case 'escalation':
          await this.escalateIncident(action, check, result);
          break;
        
        case 'auto-recovery':
          await this.attemptAutoRecovery(action, check, result);
          break;
      }

      this.emit('action-executed', {
        actionId: action.id,
        actionType: action.type,
        checkId: check.id,
        success: true
      });

    } catch (error) {
      this.emit('action-failed', {
        actionId: action.id,
        actionType: action.type,
        checkId: check.id,
        error: (error as Error).message
      });
    }
  }

  private async sendNotification(action: ActionConfig, check: HealthCheck, result: HealthCheckResult): Promise<void> {
    // Notification implementation would integrate with email, SMS, Slack, etc.
    this.emit('notification-sent', {
      recipient: action.configuration.recipient,
      subject: `Health Check Alert: ${check.name}`,
      message: `${check.target.name} is ${check.status}: ${result.message}`,
      checkId: check.id
    });
  }

  private async callWebhook(action: ActionConfig, check: HealthCheck, result: HealthCheckResult): Promise<void> {
    const payload = {
      checkId: check.id,
      checkName: check.name,
      targetName: check.target.name,
      status: check.status,
      result: result,
      timestamp: new Date().toISOString()
    };

    const response = await fetch(action.configuration.url, {
      method: action.configuration.method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...action.configuration.headers
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.statusText}`);
    }
  }

  private async executeScript(action: ActionConfig, check: HealthCheck, result: HealthCheckResult): Promise<void> {
    // Script execution would be implemented with proper security measures
    this.emit('script-executed', {
      script: action.configuration.script,
      checkId: check.id
    });
  }

  private async escalateIncident(action: ActionConfig, check: HealthCheck, result: HealthCheckResult): Promise<void> {
    // Find open incident for this check
    const incident = Array.from(this.incidents.values())
      .find(i => i.checkId === check.id && i.status === 'open');

    if (incident) {
      incident.updates.push({
        id: crypto.randomUUID(),
        timestamp: new Date(),
        status: 'escalated',
        message: `Incident escalated to: ${action.configuration.escalateTo}`,
        author: 'health-checker'
      });

      this.emit('incident-escalated', {
        incidentId: incident.id,
        escalatedTo: action.configuration.escalateTo
      });
    }
  }

  private async attemptAutoRecovery(action: ActionConfig, check: HealthCheck, result: HealthCheckResult): Promise<void> {
    // Auto-recovery implementation would depend on the specific service
    this.emit('auto-recovery-attempted', {
      checkId: check.id,
      recoveryAction: action.configuration.recoveryAction
    });
  }

  private initializeCircuitBreaker(checkId: string): void {
    const circuitBreaker: CircuitBreakerState = {
      checkId,
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailure: new Date(0),
      lastSuccess: new Date(0),
      lastStateChange: new Date(),
      nextAttemptTime: new Date()
    };

    this.circuitBreakers.set(checkId, circuitBreaker);
  }

  private handleCircuitBreakerSuccess(circuitBreaker: CircuitBreakerState): void {
    circuitBreaker.successes++;
    circuitBreaker.lastSuccess = new Date();

    if (circuitBreaker.state === 'half-open') {
      // Transition to closed after enough successes
      if (circuitBreaker.successes >= 3) { // Configurable threshold
        circuitBreaker.state = 'closed';
        circuitBreaker.failures = 0;
        circuitBreaker.lastStateChange = new Date();
      }
    } else if (circuitBreaker.state === 'closed') {
      circuitBreaker.failures = 0;
    }
  }

  private handleCircuitBreakerFailure(circuitBreaker: CircuitBreakerState): void {
    circuitBreaker.failures++;
    circuitBreaker.lastFailure = new Date();

    if (circuitBreaker.state === 'closed' && circuitBreaker.failures >= 5) { // Configurable threshold
      circuitBreaker.state = 'open';
      circuitBreaker.lastStateChange = new Date();
      circuitBreaker.nextAttemptTime = new Date(Date.now() + 60000); // 1 minute timeout
    } else if (circuitBreaker.state === 'half-open') {
      circuitBreaker.state = 'open';
      circuitBreaker.lastStateChange = new Date();
      circuitBreaker.nextAttemptTime = new Date(Date.now() + 60000);
    }
  }

  private scheduleHealthCheck(check: HealthCheck): void {
    // Clear existing schedule
    const existingSchedule = this.scheduledChecks.get(check.id);
    if (existingSchedule) {
      clearTimeout(existingSchedule);
    }

    if (!check.enabled) {
      return;
    }

    // Calculate next execution time with jitter
    const jitter = Math.random() * check.schedule.jitter * 1000;
    const delay = (check.schedule.interval * 1000) + jitter;

    const timeout = setTimeout(async () => {
      try {
        await this.executeHealthCheck(check.id);
      } catch (error) {
        // Error is already handled in executeHealthCheck
      }
    }, delay);

    this.scheduledChecks.set(check.id, timeout);
  }

  private isInMaintenanceWindow(check: HealthCheck): boolean {
    const now = new Date();
    
    for (const window of check.schedule.maintenanceWindows || []) {
      if (now >= window.start && now <= window.end) {
        return true;
      }
    }

    return false;
  }

  private startMetricsAggregation(): void {
    this.metricsAggregation = setInterval(() => {
      this.aggregateMetrics();
    }, 60000); // Every minute
  }

  private aggregateMetrics(): void {
    const summary = this.generateHealthSummary();
    this.emit('metrics-aggregated', summary);
  }

  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldData();
    }, 3600000); // Every hour
  }

  private cleanupOldData(): void {
    const cutoffTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

    // Clean up old results
    for (const [checkId, results] of this.results) {
      const filteredResults = results.filter(r => r.timestamp.getTime() > cutoffTime);
      this.results.set(checkId, filteredResults);
    }

    // Clean up old incidents
    for (const [incidentId, incident] of this.incidents) {
      if (incident.endTime && incident.endTime.getTime() < cutoffTime) {
        this.incidents.delete(incidentId);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public API methods
  generateHealthSummary(): HealthSummary {
    const checks = Array.from(this.checks.values());
    const activeIncidents = Array.from(this.incidents.values())
      .filter(i => i.status === 'open' || i.status === 'investigating')
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, 10);

    const healthyChecks = checks.filter(c => c.status === 'healthy').length;
    const unhealthyChecks = checks.filter(c => c.status === 'unhealthy').length;
    const degradedChecks = checks.filter(c => c.status === 'degraded').length;
    const unknownChecks = checks.filter(c => c.status === 'unknown').length;

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' | 'critical';
    if (unhealthyChecks > 0) {
      const criticalUnhealthy = checks.filter(c => c.status === 'unhealthy' && c.target.criticality === 'critical').length;
      overallStatus = criticalUnhealthy > 0 ? 'critical' : 'unhealthy';
    } else if (degradedChecks > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const criticalServices = checks
      .filter(c => c.target.criticality === 'critical')
      .map(c => ({
        serviceId: c.target.id,
        serviceName: c.target.name,
        status: c.status,
        lastCheck: c.lastCheck,
        responseTime: this.getAverageResponseTime(c.id),
        availability: c.uptime,
        checkCount: (this.results.get(c.id) || []).length
      }));

    return {
      timestamp: new Date(),
      overallStatus,
      totalChecks: checks.length,
      healthyChecks,
      unhealthyChecks,
      degradedChecks,
      unknownChecks,
      averageResponseTime: this.calculateOverallAverageResponseTime(),
      overallAvailability: this.calculateOverallAvailability(),
      criticalServices,
      recentIncidents: activeIncidents,
      upcomingMaintenance: this.maintenanceWindows.filter(w => w.start > new Date())
    };
  }

  private getAverageResponseTime(checkId: string): number {
    const results = this.results.get(checkId) || [];
    if (results.length === 0) return 0;
    
    const recentResults = results.slice(-10);
    return recentResults.reduce((sum, r) => sum + r.responseTime, 0) / recentResults.length;
  }

  private calculateOverallAverageResponseTime(): number {
    const allResults = Array.from(this.results.values()).flat();
    if (allResults.length === 0) return 0;
    
    const recentResults = allResults.slice(-100);
    return recentResults.reduce((sum, r) => sum + r.responseTime, 0) / recentResults.length;
  }

  private calculateOverallAvailability(): number {
    const checks = Array.from(this.checks.values());
    if (checks.length === 0) return 100;
    
    const totalUptime = checks.reduce((sum, c) => sum + c.uptime, 0);
    return totalUptime / checks.length;
  }

  getHealthChecks(): HealthCheck[] {
    return Array.from(this.checks.values());
  }

  getHealthCheck(checkId: string): HealthCheck | null {
    return this.checks.get(checkId) || null;
  }

  getHealthCheckResults(checkId: string, limit: number = 100): HealthCheckResult[] {
    const results = this.results.get(checkId) || [];
    return results.slice(-limit);
  }

  getIncidents(): HealthIncident[] {
    return Array.from(this.incidents.values());
  }

  getIncident(incidentId: string): HealthIncident | null {
    return this.incidents.get(incidentId) || null;
  }

  getCircuitBreakerStates(): CircuitBreakerState[] {
    return Array.from(this.circuitBreakers.values());
  }

  addMaintenanceWindow(window: MaintenanceWindow): void {
    this.maintenanceWindows.push(window);
    this.emit('maintenance-window-added', window);
  }

  getStats(): any {
    const checks = Array.from(this.checks.values());
    const results = Array.from(this.results.values()).flat();
    const incidents = Array.from(this.incidents.values());

    return {
      checks: {
        total: checks.length,
        enabled: checks.filter(c => c.enabled).length,
        healthy: checks.filter(c => c.status === 'healthy').length,
        unhealthy: checks.filter(c => c.status === 'unhealthy').length,
        degraded: checks.filter(c => c.status === 'degraded').length,
        unknown: checks.filter(c => c.status === 'unknown').length
      },
      results: {
        total: results.length,
        successful: results.filter(r => r.status === 'success').length,
        failed: results.filter(r => r.status === 'failure').length,
        errors: results.filter(r => r.status === 'error').length,
        timeouts: results.filter(r => r.status === 'timeout').length
      },
      incidents: {
        total: incidents.length,
        open: incidents.filter(i => i.status === 'open').length,
        investigating: incidents.filter(i => i.status === 'investigating').length,
        resolved: incidents.filter(i => i.status === 'resolved').length,
        closed: incidents.filter(i => i.status === 'closed').length
      },
      circuitBreakers: {
        total: this.circuitBreakers.size,
        closed: Array.from(this.circuitBreakers.values()).filter(cb => cb.state === 'closed').length,
        open: Array.from(this.circuitBreakers.values()).filter(cb => cb.state === 'open').length,
        halfOpen: Array.from(this.circuitBreakers.values()).filter(cb => cb.state === 'half-open').length
      },
      maintenance: this.maintenanceWindows.length
    };
  }

  destroy(): void {
    // Clear all scheduled checks
    for (const timeout of this.scheduledChecks.values()) {
      clearTimeout(timeout);
    }

    // Clear intervals
    if (this.metricsAggregation) {
      clearInterval(this.metricsAggregation);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.checks.clear();
    this.results.clear();
    this.incidents.clear();
    this.circuitBreakers.clear();
    this.scheduledChecks.clear();
    this.maintenanceWindows = [];

    this.removeAllListeners();
  }
}