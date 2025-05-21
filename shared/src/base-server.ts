import { EventEmitter } from 'events';
import { Server } from 'http';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { HealthChecker } from './health';
import { createLogger } from './logging';
import { PerformanceMonitor } from './monitoring';

export interface ServerConfig {
  name: string;
  port: number;
  host?: string;
  enableCors?: boolean;
  enableCompression?: boolean;
  enableSecurity?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  healthCheck?: {
    enabled: boolean;
    path: string;
    interval: number;
  };
  performance?: {
    enabled: boolean;
    metricsPath: string;
  };
}

export abstract class BaseServer extends EventEmitter {
  protected config: ServerConfig;
  protected app: express.Application;
  protected server?: Server;
  protected healthChecker: HealthChecker;
  protected performanceMonitor: PerformanceMonitor;
  protected logger: any;
  protected isRunning: boolean = false;

  constructor(config: ServerConfig) {
    super();
    this.config = config;
    this.logger = createLogger(config.name, config.logLevel || 'info');
    this.app = express();
    this.healthChecker = new HealthChecker(config.name);
    this.performanceMonitor = new PerformanceMonitor(config.name);
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    if (this.config.enableSecurity !== false) {
      this.app.use(helmet());
    }

    if (this.config.enableCors !== false) {
      this.app.use(cors());
    }

    if (this.config.enableCompression !== false) {
      this.app.use(compression());
    }

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });

    // Performance monitoring
    if (this.config.performance?.enabled !== false) {
      this.app.use(this.performanceMonitor.middleware());
    }
  }

  private setupRoutes(): void {
    // Health check endpoint
    if (this.config.healthCheck?.enabled !== false) {
      const healthPath = this.config.healthCheck?.path || '/health';
      this.app.get(healthPath, async (req, res) => {
        try {
          const health = await this.healthChecker.check();
          res.status(health.healthy ? 200 : 503).json(health);
        } catch (error) {
          res.status(503).json({
            healthy: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      });
    }

    // Performance metrics endpoint
    if (this.config.performance?.enabled !== false) {
      const metricsPath = this.config.performance?.metricsPath || '/metrics';
      this.app.get(metricsPath, (req, res) => {
        const metrics = this.performanceMonitor.getMetrics();
        res.json(metrics);
      });
    }

    // Server info endpoint
    this.app.get('/info', (req, res) => {
      res.json({
        name: this.config.name,
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        nodeVersion: process.version,
        platform: process.platform
      });
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Server is already running');
      return;
    }

    try {
      // Initialize the server-specific setup
      await this.initialize();

      // Start health checker
      if (this.config.healthCheck?.enabled !== false) {
        this.healthChecker.start(this.config.healthCheck?.interval || 30000);
      }

      // Start performance monitoring
      if (this.config.performance?.enabled !== false) {
        this.performanceMonitor.start();
      }

      // Start the HTTP server
      const port = this.config.port;
      const host = this.config.host || 'localhost';

      this.server = this.app.listen(port, host, () => {
        this.isRunning = true;
        this.logger.info(`${this.config.name} started on ${host}:${port}`);
        this.emit('started', { host, port });
      });

      // Handle server errors
      this.server.on('error', (error: Error) => {
        this.logger.error('Server error:', error);
        this.emit('error', error);
      });

    } catch (error) {
      this.logger.error('Failed to start server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('Server is not running');
      return;
    }

    try {
      // Stop health checker
      this.healthChecker.stop();

      // Stop performance monitoring
      this.performanceMonitor.stop();

      // Cleanup server-specific resources
      await this.cleanup();

      // Close the HTTP server
      if (this.server) {
        await new Promise<void>((resolve) => {
          this.server!.close(() => {
            this.isRunning = false;
            this.logger.info(`${this.config.name} stopped`);
            this.emit('stopped');
            resolve();
          });
        });
      }

    } catch (error) {
      this.logger.error('Error stopping server:', error);
      throw error;
    }
  }

  // Abstract methods that subclasses must implement
  protected abstract initialize(): Promise<void>;
  protected abstract cleanup(): Promise<void>;

  // Utility methods
  protected addRoute(method: 'get' | 'post' | 'put' | 'delete' | 'patch', path: string, handler: express.RequestHandler): void {
    this.app[method](path, handler);
  }

  protected addMiddleware(middleware: express.RequestHandler): void {
    this.app.use(middleware);
  }

  public getApp(): express.Application {
    return this.app;
  }

  public isHealthy(): boolean {
    return this.isRunning && this.healthChecker.isHealthy();
  }

  public getMetrics(): any {
    return this.performanceMonitor.getMetrics();
  }
}

export default BaseServer;