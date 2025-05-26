import { EventEmitter } from 'events';

export interface HealthStatus {
  healthy: boolean;
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  timestamp: string;
  uptime: number;
  version?: string;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  message?: string;
  duration?: number;
  timestamp: string;
  details?: any;
}

export type HealthCheckFunction = () => Promise<HealthCheck> | HealthCheck;

export class HealthChecker extends EventEmitter {
  private serviceName: string;
  private checks: Map<string, HealthCheckFunction> = new Map();
  private interval?: NodeJS.Timeout;
  private isRunning: boolean = false;
  private lastStatus?: HealthStatus;
  private startTime: number;

  constructor(serviceName: string) {
    super();
    this.serviceName = serviceName;
    this.startTime = Date.now();
  }

  addCheck(name: string, checkFunction: HealthCheckFunction): void {
    this.checks.set(name, checkFunction);
  }

  removeCheck(name: string): void {
    this.checks.delete(name);
  }

  async check(): Promise<HealthStatus> {
    const checkResults: HealthCheck[] = [];
    const startTime = Date.now();

    // Run all health checks
    for (const [name, checkFn] of this.checks) {
      try {
        const checkStart = Date.now();
        const result = await checkFn();
        const duration = Date.now() - checkStart;
        
        checkResults.push({
          ...result,
          name,
          duration,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        checkResults.push({
          name,
          status: 'fail',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
          details: { error: error instanceof Error ? error.stack : error }
        });
      }
    }

    // Determine overall health status
    const failedChecks = checkResults.filter(c => c.status === 'fail');
    const warnChecks = checkResults.filter(c => c.status === 'warn');
    
    let status: 'healthy' | 'degraded' | 'unhealthy';
    let healthy: boolean;

    if (failedChecks.length > 0) {
      status = 'unhealthy';
      healthy = false;
    } else if (warnChecks.length > 0) {
      status = 'degraded';
      healthy = true;
    } else {
      status = 'healthy';
      healthy = true;
    }

    const healthStatus: HealthStatus = {
      healthy,
      status,
      checks: checkResults,
      timestamp: new Date().toISOString(),
      uptime: Math.round((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '1.0.0'
    };

    this.lastStatus = healthStatus;
    this.emit('health-check', healthStatus);

    return healthStatus;
  }

  start(intervalMs: number = 30000): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    
    // Add default system health checks
    this.addDefaultChecks();

    // Run initial check
    this.check().catch(error => {
      this.emit('error', error);
    });

    // Setup periodic checks
    this.interval = setInterval(async () => {
      try {
        await this.check();
      } catch (error) {
        this.emit('error', error);
      }
    }, intervalMs);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  isHealthy(): boolean {
    return this.lastStatus?.healthy ?? true;
  }

  getLastStatus(): HealthStatus | undefined {
    return this.lastStatus;
  }

  private addDefaultChecks(): void {
    // Memory usage check
    this.addCheck('memory', () => {
      const memUsage = process.memoryUsage();
      const memoryUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
      
      let status: 'pass' | 'warn' | 'fail';
      let message: string;
      
      if (memoryUsagePercent > 90) {
        status = 'fail';
        message = `Memory usage critical: ${memoryUsagePercent.toFixed(1)}%`;
      } else if (memoryUsagePercent > 80) {
        status = 'warn';
        message = `Memory usage high: ${memoryUsagePercent.toFixed(1)}%`;
      } else {
        status = 'pass';
        message = `Memory usage normal: ${memoryUsagePercent.toFixed(1)}%`;
      }
      
      return {
        name: 'memory',
        status,
        message,
        timestamp: new Date().toISOString(),
        details: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external,
          rss: memUsage.rss
        }
      };
    });

    // Process uptime check
    this.addCheck('uptime', () => {
      const uptime = process.uptime();
      return {
        name: 'uptime',
        status: 'pass',
        message: `Service running for ${Math.round(uptime)} seconds`,
        timestamp: new Date().toISOString(),
        details: { uptime }
      };
    });

    // Event loop lag check
    this.addCheck('event-loop', () => {
      return new Promise<HealthCheck>((resolve) => {
        const start = process.hrtime.bigint();
        setImmediate(() => {
          const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
          
          let status: 'pass' | 'warn' | 'fail';
          let message: string;
          
          if (lag > 100) {
            status = 'fail';
            message = `Event loop lag critical: ${lag.toFixed(2)}ms`;
          } else if (lag > 50) {
            status = 'warn';
            message = `Event loop lag high: ${lag.toFixed(2)}ms`;
          } else {
            status = 'pass';
            message = `Event loop lag normal: ${lag.toFixed(2)}ms`;
          }
          
          resolve({
            name: 'event-loop',
            status,
            message,
            timestamp: new Date().toISOString(),
            details: { lagMs: lag }
          });
        });
      });
    });
  }
}

// Utility function to create a health checker
export function createHealthChecker(serviceName: string): HealthChecker {
  return new HealthChecker(serviceName);
}

export default HealthChecker;