import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../../shared/src/logging.js';
import { HealthCheck } from '../../../shared/src/health.js';

export interface ModelMetadata {
  id: string;
  name: string;
  version: string;
  algorithm: string;
  framework: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  description?: string;
  author: string;
  metrics: ModelMetrics;
  artifacts: ModelArtifact[];
  dependencies: ModelDependency[];
}

export interface ModelMetrics {
  training: {
    accuracy?: number;
    loss?: number;
    f1Score?: number;
    precision?: number;
    recall?: number;
    trainingTime: number;
    epochs: number;
  };
  validation: {
    accuracy?: number;
    loss?: number;
    f1Score?: number;
    precision?: number;
    recall?: number;
  };
  production?: {
    latency: number;
    throughput: number;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
    uptime: number;
  };
}

export interface ModelArtifact {
  id: string;
  type: 'model' | 'weights' | 'config' | 'preprocessor' | 'postprocessor';
  path: string;
  size: number;
  checksum: string;
  createdAt: number;
}

export interface ModelDependency {
  name: string;
  version: string;
  type: 'package' | 'model' | 'dataset';
}

export interface Deployment {
  id: string;
  modelId: string;
  environment: 'development' | 'staging' | 'production';
  endpoint: string;
  status: 'deploying' | 'active' | 'inactive' | 'failed' | 'scaling';
  replicas: number;
  targetReplicas: number;
  resources: {
    cpu: string;
    memory: string;
    gpu?: string;
  };
  deployedAt: number;
  lastHealthCheck: number;
  healthStatus: 'healthy' | 'unhealthy' | 'degraded';
  configuration: DeploymentConfiguration;
}

export interface DeploymentConfiguration {
  autoScaling: {
    enabled: boolean;
    minReplicas: number;
    maxReplicas: number;
    targetCpuUtilization: number;
    targetMemoryUtilization: number;
  };
  rollback: {
    enabled: boolean;
    strategy: 'immediate' | 'gradual';
    healthCheckInterval: number;
    failureThreshold: number;
  };
  monitoring: {
    metricsEnabled: boolean;
    loggingLevel: 'debug' | 'info' | 'warn' | 'error';
    alerting: AlertConfiguration[];
  };
}

export interface AlertConfiguration {
  metric: string;
  threshold: number;
  comparison: 'greater' | 'less' | 'equal';
  duration: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: string[];
}

export interface MonitoringData {
  modelId: string;
  deploymentId: string;
  timestamp: number;
  metrics: {
    requests: number;
    responses: number;
    errors: number;
    latency: number[];
    cpuUsage: number;
    memoryUsage: number;
    gpuUsage?: number;
  };
  predictions: Array<{
    input: any;
    output: any;
    confidence?: number;
    processingTime: number;
  }>;
}

export interface ModelDrift {
  modelId: string;
  deploymentId: string;
  detectedAt: number;
  type: 'data' | 'concept' | 'prediction';
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  description: string;
  recommendations: string[];
  affectedFeatures?: string[];
}

export class AIOpsService extends EventEmitter {
  private logger = createLogger('AIOpsService');
  private models = new Map<string, ModelMetadata>();
  private deployments = new Map<string, Deployment>();
  private monitoringData = new Map<string, MonitoringData[]>();
  private driftDetector = new DriftDetector();
  private alertManager = new AlertManager();
  private performanceOptimizer = new PerformanceOptimizer();
  private modelRegistry = new ModelRegistry();

  constructor() {
    super();
    this.initializeMonitoring();
    this.logger.info('AIOps Service initialized');
  }

  private initializeMonitoring(): void {
    setInterval(async () => {
      await this.performHealthChecks();
      await this.collectMetrics();
      await this.detectDrift();
      await this.optimizePerformance();
    }, 30000);

    setInterval(async () => {
      await this.cleanupOldData();
    }, 3600000);
  }

  async registerModel(
    name: string,
    version: string,
    algorithm: string,
    framework: string,
    author: string,
    artifacts: Omit<ModelArtifact, 'id' | 'createdAt'>[],
    dependencies: ModelDependency[],
    metrics: ModelMetrics,
    options: {
      description?: string;
      tags?: string[];
    } = {}
  ): Promise<string> {
    const modelId = uuidv4();
    const now = Date.now();

    const model: ModelMetadata = {
      id: modelId,
      name,
      version,
      algorithm,
      framework,
      createdAt: now,
      updatedAt: now,
      tags: options.tags || [],
      description: options.description,
      author,
      metrics,
      artifacts: artifacts.map(artifact => ({
        ...artifact,
        id: uuidv4(),
        createdAt: now
      })),
      dependencies
    };

    this.models.set(modelId, model);
    await this.modelRegistry.register(model);

    this.logger.info(`Registered model: ${modelId}`, { name, version, algorithm });
    this.emit('modelRegistered', { modelId, name, version });

    return modelId;
  }

  async deployModel(
    modelId: string,
    environment: 'development' | 'staging' | 'production',
    configuration: Partial<DeploymentConfiguration> = {}
  ): Promise<string> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const deploymentId = uuidv4();
    const now = Date.now();

    const defaultConfig: DeploymentConfiguration = {
      autoScaling: {
        enabled: environment === 'production',
        minReplicas: 1,
        maxReplicas: environment === 'production' ? 10 : 3,
        targetCpuUtilization: 70,
        targetMemoryUtilization: 80
      },
      rollback: {
        enabled: environment !== 'development',
        strategy: 'gradual',
        healthCheckInterval: 30000,
        failureThreshold: 3
      },
      monitoring: {
        metricsEnabled: true,
        loggingLevel: environment === 'production' ? 'warn' : 'info',
        alerting: this.getDefaultAlerts(environment)
      }
    };

    const deployment: Deployment = {
      id: deploymentId,
      modelId,
      environment,
      endpoint: `/api/models/${modelId}/predict`,
      status: 'deploying',
      replicas: 0,
      targetReplicas: defaultConfig.autoScaling.minReplicas,
      resources: {
        cpu: environment === 'production' ? '2000m' : '500m',
        memory: environment === 'production' ? '4Gi' : '1Gi',
        gpu: model.framework.includes('tensorflow') || model.framework.includes('pytorch') ? '1' : undefined
      },
      deployedAt: now,
      lastHealthCheck: now,
      healthStatus: 'healthy',
      configuration: { ...defaultConfig, ...configuration }
    };

    this.deployments.set(deploymentId, deployment);
    this.monitoringData.set(deploymentId, []);

    this.logger.info(`Deploying model: ${modelId} to ${environment}`, { deploymentId });
    this.emit('deploymentStarted', { deploymentId, modelId, environment });

    this.simulateDeployment(deploymentId);
    return deploymentId;
  }

  private async simulateDeployment(deploymentId: string): Promise<void> {
    setTimeout(async () => {
      const deployment = this.deployments.get(deploymentId);
      if (deployment) {
        deployment.status = 'active';
        deployment.replicas = deployment.targetReplicas;
        this.logger.info(`Deployment completed: ${deploymentId}`);
        this.emit('deploymentCompleted', { deploymentId });
      }
    }, 5000);
  }

  private getDefaultAlerts(environment: string): AlertConfiguration[] {
    const baseAlerts: AlertConfiguration[] = [
      {
        metric: 'error_rate',
        threshold: environment === 'production' ? 0.01 : 0.05,
        comparison: 'greater',
        duration: 300000,
        severity: 'high',
        channels: ['email', 'slack']
      },
      {
        metric: 'latency_p95',
        threshold: environment === 'production' ? 1000 : 2000,
        comparison: 'greater',
        duration: 300000,
        severity: 'medium',
        channels: ['email']
      },
      {
        metric: 'cpu_usage',
        threshold: 90,
        comparison: 'greater',
        duration: 600000,
        severity: 'medium',
        channels: ['email']
      }
    ];

    if (environment === 'production') {
      baseAlerts.push({
        metric: 'drift_score',
        threshold: 0.8,
        comparison: 'greater',
        duration: 1800000,
        severity: 'high',
        channels: ['email', 'slack', 'pager']
      });
    }

    return baseAlerts;
  }

  async scaleDeployment(deploymentId: string, replicas: number): Promise<boolean> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const oldReplicas = deployment.targetReplicas;
    deployment.targetReplicas = replicas;
    deployment.status = 'scaling';

    this.logger.info(`Scaling deployment: ${deploymentId}`, { from: oldReplicas, to: replicas });
    this.emit('deploymentScaling', { deploymentId, from: oldReplicas, to: replicas });

    setTimeout(() => {
      deployment.replicas = replicas;
      deployment.status = 'active';
      this.logger.info(`Scaling completed: ${deploymentId}`);
      this.emit('deploymentScaled', { deploymentId, replicas });
    }, 3000);

    return true;
  }

  async rollbackDeployment(deploymentId: string, targetVersion?: string): Promise<boolean> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    this.logger.info(`Rolling back deployment: ${deploymentId}`, { targetVersion });
    this.emit('deploymentRollback', { deploymentId, targetVersion });

    deployment.status = 'deploying';
    
    setTimeout(() => {
      deployment.status = 'active';
      this.logger.info(`Rollback completed: ${deploymentId}`);
      this.emit('deploymentRollbackCompleted', { deploymentId });
    }, 5000);

    return true;
  }

  async collectModelMetrics(deploymentId: string, metrics: Partial<MonitoringData['metrics']>): Promise<void> {
    const data = this.monitoringData.get(deploymentId) || [];
    
    const monitoringEntry: MonitoringData = {
      modelId: this.deployments.get(deploymentId)?.modelId || '',
      deploymentId,
      timestamp: Date.now(),
      metrics: {
        requests: 0,
        responses: 0,
        errors: 0,
        latency: [],
        cpuUsage: 0,
        memoryUsage: 0,
        ...metrics
      },
      predictions: []
    };

    data.push(monitoringEntry);
    
    if (data.length > 1000) {
      data.splice(0, data.length - 1000);
    }
    
    this.monitoringData.set(deploymentId, data);
  }

  async recordPrediction(
    deploymentId: string,
    input: any,
    output: any,
    confidence?: number,
    processingTime: number = 0
  ): Promise<void> {
    const data = this.monitoringData.get(deploymentId) || [];
    if (data.length === 0) return;

    const latestEntry = data[data.length - 1];
    latestEntry.predictions.push({
      input,
      output,
      confidence,
      processingTime
    });

    if (latestEntry.predictions.length > 100) {
      latestEntry.predictions.splice(0, latestEntry.predictions.length - 100);
    }
  }

  private async performHealthChecks(): Promise<void> {
    for (const [deploymentId, deployment] of this.deployments) {
      if (deployment.status !== 'active') continue;

      const isHealthy = await this.checkDeploymentHealth(deploymentId);
      const now = Date.now();
      
      deployment.lastHealthCheck = now;
      deployment.healthStatus = isHealthy ? 'healthy' : 'unhealthy';

      if (!isHealthy) {
        this.logger.warn(`Unhealthy deployment detected: ${deploymentId}`);
        this.emit('deploymentUnhealthy', { deploymentId });
        
        if (deployment.configuration.rollback.enabled) {
          await this.handleUnhealthyDeployment(deploymentId);
        }
      }
    }
  }

  private async checkDeploymentHealth(deploymentId: string): Promise<boolean> {
    const data = this.monitoringData.get(deploymentId) || [];
    if (data.length === 0) return true;

    const recentData = data.slice(-10);
    const avgErrorRate = recentData.reduce((sum, d) => 
      sum + (d.metrics.errors / Math.max(d.metrics.requests, 1)), 0
    ) / recentData.length;

    const avgLatency = recentData.reduce((sum, d) => 
      sum + (d.metrics.latency.reduce((a, b) => a + b, 0) / Math.max(d.metrics.latency.length, 1)), 0
    ) / recentData.length;

    return avgErrorRate < 0.1 && avgLatency < 5000;
  }

  private async handleUnhealthyDeployment(deploymentId: string): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    const config = deployment.configuration.rollback;
    
    if (config.strategy === 'immediate') {
      await this.rollbackDeployment(deploymentId);
    } else {
      setTimeout(async () => {
        if (deployment.healthStatus === 'unhealthy') {
          await this.rollbackDeployment(deploymentId);
        }
      }, config.healthCheckInterval);
    }
  }

  private async collectMetrics(): Promise<void> {
    for (const [deploymentId, deployment] of this.deployments) {
      if (deployment.status !== 'active') continue;

      const simulatedMetrics = {
        requests: Math.floor(Math.random() * 1000) + 100,
        responses: Math.floor(Math.random() * 950) + 100,
        errors: Math.floor(Math.random() * 10),
        latency: Array.from({ length: 10 }, () => Math.random() * 1000 + 100),
        cpuUsage: Math.random() * 100,
        memoryUsage: Math.random() * 80 + 20,
        gpuUsage: deployment.resources.gpu ? Math.random() * 90 + 10 : undefined
      };

      await this.collectModelMetrics(deploymentId, simulatedMetrics);
      await this.alertManager.checkAlerts(deploymentId, simulatedMetrics, deployment.configuration.monitoring.alerting);
    }
  }

  private async detectDrift(): Promise<void> {
    for (const [deploymentId, deployment] of this.deployments) {
      if (deployment.status !== 'active') continue;

      const drift = await this.driftDetector.detectDrift(deploymentId, this.monitoringData.get(deploymentId) || []);
      
      if (drift) {
        this.logger.warn(`Model drift detected: ${deploymentId}`, drift);
        this.emit('modelDrift', drift);
        
        if (drift.severity === 'high') {
          await this.handleModelDrift(deploymentId, drift);
        }
      }
    }
  }

  private async handleModelDrift(deploymentId: string, drift: ModelDrift): Promise<void> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) return;

    this.logger.info(`Handling model drift: ${deploymentId}`, { type: drift.type, severity: drift.severity });
    
    if (deployment.environment === 'production') {
      this.emit('driftActionRequired', { deploymentId, drift });
    }
  }

  private async optimizePerformance(): Promise<void> {
    for (const [deploymentId, deployment] of this.deployments) {
      if (deployment.status !== 'active' || !deployment.configuration.autoScaling.enabled) continue;

      const recommendations = await this.performanceOptimizer.analyze(
        deploymentId,
        this.monitoringData.get(deploymentId) || []
      );

      if (recommendations.shouldScale) {
        const newReplicas = Math.max(
          deployment.configuration.autoScaling.minReplicas,
          Math.min(deployment.configuration.autoScaling.maxReplicas, recommendations.targetReplicas)
        );

        if (newReplicas !== deployment.targetReplicas) {
          await this.scaleDeployment(deploymentId, newReplicas);
        }
      }
    }
  }

  private async cleanupOldData(): Promise<void> {
    const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    for (const [deploymentId, data] of this.monitoringData) {
      const filteredData = data.filter(entry => entry.timestamp > cutoffTime);
      this.monitoringData.set(deploymentId, filteredData);
    }

    this.logger.info('Cleaned up old monitoring data');
  }

  async getModel(modelId: string): Promise<ModelMetadata | null> {
    return this.models.get(modelId) || null;
  }

  async getDeployment(deploymentId: string): Promise<Deployment | null> {
    return this.deployments.get(deploymentId) || null;
  }

  async listModels(): Promise<ModelMetadata[]> {
    return Array.from(this.models.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  async listDeployments(environment?: string): Promise<Deployment[]> {
    const deployments = Array.from(this.deployments.values());
    return environment 
      ? deployments.filter(d => d.environment === environment)
      : deployments.sort((a, b) => b.deployedAt - a.deployedAt);
  }

  async getModelMetrics(deploymentId: string, timeRange: number = 3600000): Promise<MonitoringData[]> {
    const data = this.monitoringData.get(deploymentId) || [];
    const cutoff = Date.now() - timeRange;
    return data.filter(entry => entry.timestamp > cutoff);
  }

  getHealthCheck(): HealthCheck {
    const totalDeployments = this.deployments.size;
    const activeDeployments = Array.from(this.deployments.values()).filter(d => d.status === 'active').length;
    const healthyDeployments = Array.from(this.deployments.values()).filter(d => d.healthStatus === 'healthy').length;

    return {
      status: totalDeployments === 0 || healthyDeployments / activeDeployments > 0.8 ? 'healthy' : 'degraded',
      timestamp: Date.now(),
      details: {
        totalModels: this.models.size,
        totalDeployments,
        activeDeployments,
        healthyDeployments,
        monitoringDataPoints: Array.from(this.monitoringData.values()).reduce((sum, data) => sum + data.length, 0)
      }
    };
  }
}

class DriftDetector {
  async detectDrift(deploymentId: string, data: MonitoringData[]): Promise<ModelDrift | null> {
    if (data.length < 100) return null;

    const recentData = data.slice(-50);
    const historicalData = data.slice(-200, -50);

    if (historicalData.length < 50) return null;

    const recentErrorRate = this.calculateErrorRate(recentData);
    const historicalErrorRate = this.calculateErrorRate(historicalData);
    
    const driftScore = Math.abs(recentErrorRate - historicalErrorRate) / (historicalErrorRate + 0.001);
    
    if (driftScore > 0.5) {
      return {
        modelId: recentData[0]?.modelId || '',
        deploymentId,
        detectedAt: Date.now(),
        type: 'prediction',
        severity: driftScore > 1.0 ? 'high' : 'medium',
        confidence: Math.min(driftScore, 1.0),
        description: `Prediction drift detected with score: ${driftScore.toFixed(3)}`,
        recommendations: [
          'Review recent training data quality',
          'Check for changes in input data distribution',
          'Consider retraining the model',
          'Implement gradual rollback if issues persist'
        ]
      };
    }

    return null;
  }

  private calculateErrorRate(data: MonitoringData[]): number {
    const totalRequests = data.reduce((sum, d) => sum + d.metrics.requests, 0);
    const totalErrors = data.reduce((sum, d) => sum + d.metrics.errors, 0);
    return totalRequests > 0 ? totalErrors / totalRequests : 0;
  }
}

class AlertManager {
  private logger = createLogger('AlertManager');
  private alertHistory = new Map<string, number>();

  async checkAlerts(
    deploymentId: string,
    metrics: any,
    alertConfigs: AlertConfiguration[]
  ): Promise<void> {
    for (const config of alertConfigs) {
      const currentValue = this.getMetricValue(metrics, config.metric);
      const shouldAlert = this.evaluateThreshold(currentValue, config.threshold, config.comparison);
      
      if (shouldAlert) {
        const alertKey = `${deploymentId}_${config.metric}`;
        const lastAlert = this.alertHistory.get(alertKey) || 0;
        
        if (Date.now() - lastAlert > config.duration) {
          await this.sendAlert(deploymentId, config, currentValue);
          this.alertHistory.set(alertKey, Date.now());
        }
      }
    }
  }

  private getMetricValue(metrics: any, metricName: string): number {
    switch (metricName) {
      case 'error_rate':
        return metrics.errors / Math.max(metrics.requests, 1);
      case 'latency_p95':
        return this.calculatePercentile(metrics.latency, 0.95);
      case 'cpu_usage':
        return metrics.cpuUsage;
      case 'memory_usage':
        return metrics.memoryUsage;
      default:
        return 0;
    }
  }

  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  private evaluateThreshold(value: number, threshold: number, comparison: string): boolean {
    switch (comparison) {
      case 'greater':
        return value > threshold;
      case 'less':
        return value < threshold;
      case 'equal':
        return Math.abs(value - threshold) < 0.001;
      default:
        return false;
    }
  }

  private async sendAlert(deploymentId: string, config: AlertConfiguration, value: number): Promise<void> {
    this.logger.warn(`Alert triggered for deployment: ${deploymentId}`, {
      metric: config.metric,
      threshold: config.threshold,
      currentValue: value,
      severity: config.severity
    });
  }
}

class PerformanceOptimizer {
  async analyze(deploymentId: string, data: MonitoringData[]): Promise<{
    shouldScale: boolean;
    targetReplicas: number;
    recommendations: string[];
  }> {
    if (data.length < 10) {
      return { shouldScale: false, targetReplicas: 1, recommendations: [] };
    }

    const recentData = data.slice(-10);
    const avgCpuUsage = recentData.reduce((sum, d) => sum + d.metrics.cpuUsage, 0) / recentData.length;
    const avgMemoryUsage = recentData.reduce((sum, d) => sum + d.metrics.memoryUsage, 0) / recentData.length;
    const avgLatency = recentData.reduce((sum, d) => 
      sum + (d.metrics.latency.reduce((a, b) => a + b, 0) / Math.max(d.metrics.latency.length, 1)), 0
    ) / recentData.length;

    const recommendations: string[] = [];
    let shouldScale = false;
    let targetReplicas = 1;

    if (avgCpuUsage > 80) {
      shouldScale = true;
      targetReplicas = Math.ceil(avgCpuUsage / 60);
      recommendations.push('High CPU usage detected - scaling up');
    } else if (avgCpuUsage < 30) {
      shouldScale = true;
      targetReplicas = Math.max(1, Math.floor(avgCpuUsage / 40));
      recommendations.push('Low CPU usage detected - scaling down');
    }

    if (avgLatency > 2000) {
      recommendations.push('High latency detected - consider optimizing model or scaling up');
    }

    if (avgMemoryUsage > 85) {
      recommendations.push('High memory usage detected - monitor for memory leaks');
    }

    return { shouldScale, targetReplicas, recommendations };
  }
}

class ModelRegistry {
  private logger = createLogger('ModelRegistry');

  async register(model: ModelMetadata): Promise<void> {
    this.logger.info(`Registering model in registry: ${model.id}`, {
      name: model.name,
      version: model.version,
      algorithm: model.algorithm
    });
  }

  async getModel(modelId: string): Promise<ModelMetadata | null> {
    return null;
  }

  async listModels(filter?: { algorithm?: string; framework?: string }): Promise<ModelMetadata[]> {
    return [];
  }
}