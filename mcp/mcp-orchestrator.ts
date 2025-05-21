/**
 * MCP Orchestrator - Service Integration for Claude_MCPServer
 * Manages and coordinates Memory, Sequential Thinking, and Filesystem MCP services
 */

import { ServiceRegistry } from '../orchestration/src/service-registry';
import { HealthChecker } from '../shared/src/health';
import { getLogger } from '../shared/src/logging';

const logger = getLogger('MCP-Orchestrator');

export interface MCPServiceConfig {
  name: string;
  port: number;
  healthEndpoint: string;
  type: 'memory' | 'sequential-thinking' | 'filesystem';
  dependencies?: string[];
  enabled: boolean;
}

export class MCPOrchestrator {
  private serviceRegistry: ServiceRegistry;
  private healthChecker: HealthChecker;
  private services: Map<string, MCPServiceConfig> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(serviceRegistry: ServiceRegistry) {
    this.serviceRegistry = serviceRegistry;
    this.healthChecker = new HealthChecker();
    this.initializeServices();
  }

  private initializeServices() {
    // Memory MCP Service Configuration
    this.services.set('memory-mcp', {
      name: 'memory-mcp',
      port: 3201,
      healthEndpoint: 'http://localhost:3201/health',
      type: 'memory',
      dependencies: ['postgres', 'qdrant'],
      enabled: true
    });

    // Sequential Thinking MCP Service Configuration  
    this.services.set('sequential-thinking-mcp', {
      name: 'sequential-thinking-mcp',
      port: 3202,
      healthEndpoint: 'http://localhost:3202/health',
      type: 'sequential-thinking',
      dependencies: [],
      enabled: true
    });

    // Filesystem MCP Service Configuration
    this.services.set('filesystem-mcp', {
      name: 'filesystem-mcp',
      port: 3203,
      healthEndpoint: 'http://localhost:3203/health', 
      type: 'filesystem',
      dependencies: [],
      enabled: true
    });

    logger.info(`Initialized ${this.services.size} MCP services`);
  }

  async startAll(): Promise<void> {
    logger.info('Starting MCP Orchestrator...');

    // Register MCP services with the main service registry
    for (const [serviceId, config] of this.services) {
      if (config.enabled) {
        try {
          await this.serviceRegistry.registerService({
            id: serviceId,
            name: config.name,
            version: '1.0.0',
            host: 'localhost',
            port: config.port,
            protocol: 'http',
            capabilities: [`mcp-${config.type}`],
            tags: ['mcp', config.type, 'enhancement'],
            metadata: {
              type: 'mcp-service',
              category: config.type,
              dependencies: config.dependencies,
              healthEndpoint: config.healthEndpoint
            }
          });

          logger.info(`✅ Registered MCP service: ${config.name} on port ${config.port}`);
        } catch (error) {
          logger.error(`❌ Failed to register ${config.name}:`, error);
        }
      }
    }

    // Start health monitoring
    this.startHealthMonitoring();
    
    logger.info('🚀 MCP Orchestrator started successfully');
  }

  async stopAll(): Promise<void> {
    logger.info('Stopping MCP Orchestrator...');

    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Deregister services
    for (const [serviceId] of this.services) {
      try {
        await this.serviceRegistry.deregisterService(serviceId);
        logger.info(`✅ Deregistered MCP service: ${serviceId}`);
      } catch (error) {
        logger.error(`❌ Failed to deregister ${serviceId}:`, error);
      }
    }

    logger.info('🛑 MCP Orchestrator stopped');
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000); // Check every 30 seconds

    logger.info('🏥 Started MCP health monitoring');
  }

  private async performHealthChecks(): Promise<void> {
    const healthResults: Array<{ service: string; healthy: boolean; latency?: number; error?: string }> = [];

    for (const [serviceId, config] of this.services) {
      if (!config.enabled) continue;

      try {
        const startTime = Date.now();
        const response = await fetch(config.healthEndpoint, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        const latency = Date.now() - startTime;
        const healthy = response.ok;

        healthResults.push({
          service: serviceId,
          healthy,
          latency
        });

        if (!healthy) {
          logger.warn(`⚠️ Health check failed for ${serviceId}: HTTP ${response.status}`);
        }

      } catch (error) {
        healthResults.push({
          service: serviceId,
          healthy: false,
          error: error.message
        });

        logger.error(`❌ Health check error for ${serviceId}:`, error.message);
      }
    }

    // Update service registry with health status
    await this.updateServiceHealth(healthResults);
  }

  private async updateServiceHealth(healthResults: Array<{ service: string; healthy: boolean; latency?: number; error?: string }>): Promise<void> {
    for (const result of healthResults) {
      try {
        const serviceInfo = await this.serviceRegistry.getService(result.service);
        if (serviceInfo) {
          serviceInfo.metadata = {
            ...serviceInfo.metadata,
            lastHealthCheck: new Date().toISOString(),
            healthy: result.healthy,
            latency: result.latency,
            error: result.error
          };

          // Update service status based on health
          const newStatus = result.healthy ? 'running' : 'error';
          if (serviceInfo.status !== newStatus) {
            logger.info(`🔄 Service ${result.service} status changed: ${serviceInfo.status} -> ${newStatus}`);
          }
        }
      } catch (error) {
        logger.error(`Failed to update health status for ${result.service}:`, error);
      }
    }
  }

  async getServiceStatuses(): Promise<Record<string, any>> {
    const statuses: Record<string, any> = {};

    for (const [serviceId, config] of this.services) {
      try {
        const serviceInfo = await this.serviceRegistry.getService(serviceId);
        statuses[serviceId] = {
          name: config.name,
          type: config.type,
          port: config.port,
          enabled: config.enabled,
          healthy: serviceInfo?.metadata?.healthy || false,
          latency: serviceInfo?.metadata?.latency,
          lastCheck: serviceInfo?.metadata?.lastHealthCheck,
          dependencies: config.dependencies,
          error: serviceInfo?.metadata?.error
        };
      } catch (error) {
        statuses[serviceId] = {
          name: config.name,
          type: config.type,
          enabled: config.enabled,
          healthy: false,
          error: `Failed to get service info: ${error.message}`
        };
      }
    }

    return statuses;
  }

  async testServiceConnectivity(): Promise<{ success: boolean; results: Record<string, any> }> {
    logger.info('🧪 Testing MCP service connectivity...');
    
    const results: Record<string, any> = {};
    let allSuccessful = true;

    for (const [serviceId, config] of this.services) {
      if (!config.enabled) {
        results[serviceId] = { status: 'disabled', message: 'Service disabled in configuration' };
        continue;
      }

      try {
        // Test basic connectivity
        const healthResponse = await fetch(config.healthEndpoint, { 
          method: 'GET',
          signal: AbortSignal.timeout(10000)
        });

        if (healthResponse.ok) {
          const healthData = await healthResponse.json();
          
          results[serviceId] = {
            status: 'connected',
            health: healthData,
            connectivity: 'success',
            message: `Successfully connected to ${config.name}`
          };
        } else {
          allSuccessful = false;
          results[serviceId] = {
            status: 'error',
            connectivity: 'failed',
            message: `Health check failed: HTTP ${healthResponse.status}`
          };
        }

      } catch (error) {
        allSuccessful = false;
        results[serviceId] = {
          status: 'error',
          connectivity: 'failed',
          message: `Connection failed: ${error.message}`
        };
      }
    }

    const summary = {
      success: allSuccessful,
      results,
      totalServices: this.services.size,
      connectedServices: Object.values(results).filter(r => r.status === 'connected').length,
      timestamp: new Date().toISOString()
    };

    logger.info(`🧪 Connectivity test completed: ${summary.connectedServices}/${summary.totalServices} services connected`);
    
    return summary;
  }

  getServiceCount(): number {
    return this.services.size;
  }

  getEnabledServiceCount(): number {
    return Array.from(this.services.values()).filter(s => s.enabled).length;
  }

  isServiceEnabled(serviceId: string): boolean {
    return this.services.get(serviceId)?.enabled || false;
  }

  async enableService(serviceId: string): Promise<boolean> {
    const service = this.services.get(serviceId);
    if (service) {
      service.enabled = true;
      logger.info(`✅ Enabled MCP service: ${serviceId}`);
      return true;
    }
    return false;
  }

  async disableService(serviceId: string): Promise<boolean> {
    const service = this.services.get(serviceId);
    if (service) {
      service.enabled = false;
      await this.serviceRegistry.deregisterService(serviceId);
      logger.info(`🛑 Disabled MCP service: ${serviceId}`);
      return true;
    }
    return false;
  }
}

export default MCPOrchestrator;