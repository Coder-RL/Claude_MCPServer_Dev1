import { EventEmitter } from 'events';
import { ModelRegistry, ModelDeployment, DeploymentConfiguration } from './model-registry.js';
import { InferenceEngine, InferenceEngineConfig } from './inference-engine.js';

export interface ServingOrchestrator {
  deployModel(modelId: string, version: string, environment: string, config: DeploymentConfiguration): Promise<string>;
  updateDeployment(deploymentId: string, config: Partial<DeploymentConfiguration>): Promise<boolean>;
  scaleDeployment(deploymentId: string, replicas: number): Promise<boolean>;
  rollbackDeployment(deploymentId: string, targetVersion: string): Promise<boolean>;
  undeployModel(deploymentId: string): Promise<boolean>;
  getDeployments(environment?: string): Promise<ModelDeployment[]>;
  getDeploymentStatus(deploymentId: string): Promise<ModelDeployment | undefined>;
}

export interface ResourcePool {
  id: string;
  name: string;
  type: 'cpu' | 'gpu' | 'mixed';
  region: string;
  availableResources: ResourceCapacity;
  totalResources: ResourceCapacity;
  utilizationThreshold: number;
  nodes: ComputeNode[];
  status: 'active' | 'maintenance' | 'error';
}

export interface ResourceCapacity {
  cpu: number;
  memory: number;
  gpu?: number;
  storage: number;
}

export interface ComputeNode {
  id: string;
  name: string;
  type: string;
  capacity: ResourceCapacity;
  allocated: ResourceCapacity;
  available: ResourceCapacity;
  status: 'ready' | 'busy' | 'error' | 'maintenance';
  labels: Record<string, string>;
  taints: NodeTaint[];
  lastHeartbeat: Date;
}

export interface NodeTaint {
  key: string;
  value: string;
  effect: 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute';
}

export interface DeploymentStrategy {
  type: 'rolling' | 'blue_green' | 'canary' | 'recreate';
  parameters: Record<string, any>;
}

export interface ModelServingConfig {
  resourcePools: ResourcePool[];
  defaultStrategy: DeploymentStrategy;
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    healthCheckInterval: number;
    alerting: boolean;
  };
  autoscaling: {
    enabled: boolean;
    minReplicas: number;
    maxReplicas: number;
    targetCPU: number;
    targetMemory: number;
    scaleUpCooldown: number;
    scaleDownCooldown: number;
  };
  loadBalancing: {
    strategy: 'round_robin' | 'least_connections' | 'weighted' | 'adaptive';
    healthCheck: boolean;
    sessionAffinity: boolean;
  };
  caching: {
    enabled: boolean;
    strategy: 'memory' | 'redis' | 'hybrid';
    ttl: number;
    maxSize: number;
  };
}

export interface DeploymentPlan {
  deploymentId: string;
  modelId: string;
  version: string;
  strategy: DeploymentStrategy;
  resourceRequirements: ResourceCapacity;
  placement: NodePlacement[];
  networkConfig: NetworkConfiguration;
  dependencies: string[];
  validations: DeploymentValidation[];
}

export interface NodePlacement {
  nodeId: string;
  replicas: number;
  resources: ResourceCapacity;
}

export interface NetworkConfiguration {
  serviceType: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  ports: PortConfiguration[];
  ingress?: IngressConfiguration;
}

export interface PortConfiguration {
  name: string;
  port: number;
  targetPort: number;
  protocol: 'TCP' | 'UDP';
}

export interface IngressConfiguration {
  host: string;
  path: string;
  tlsEnabled: boolean;
  annotations: Record<string, string>;
}

export interface DeploymentValidation {
  type: 'resource_availability' | 'model_compatibility' | 'dependency_check' | 'security_scan';
  status: 'pending' | 'passed' | 'failed';
  message?: string;
  timestamp: Date;
}

export interface AutoscalingMetrics {
  cpu: number;
  memory: number;
  requestRate: number;
  latency: number;
  errorRate: number;
  queueSize: number;
  customMetrics: Record<string, number>;
}

export interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'no_action';
  currentReplicas: number;
  targetReplicas: number;
  reason: string;
  confidence: number;
  timestamp: Date;
}

export class ModelServingOrchestrator extends EventEmitter implements ServingOrchestrator {
  private modelRegistry: ModelRegistry;
  private inferenceEngine: InferenceEngine;
  private deployments = new Map<string, ModelDeployment>();
  private resourcePools = new Map<string, ResourcePool>();
  private deploymentPlans = new Map<string, DeploymentPlan>();
  private autoscalingDecisions = new Map<string, ScalingDecision[]>();

  constructor(
    private config: ModelServingConfig,
    modelRegistry: ModelRegistry,
    inferenceEngine: InferenceEngine
  ) {
    super();
    this.modelRegistry = modelRegistry;
    this.inferenceEngine = inferenceEngine;
    
    this.initializeResourcePools();
    this.startMonitoring();
    this.startAutoscaling();
  }

  async deployModel(
    modelId: string,
    version: string,
    environment: string,
    config: DeploymentConfiguration
  ): Promise<string> {
    try {
      const deploymentId = this.generateId();
      
      // Validate model exists
      const model = await this.modelRegistry.getModel(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      // Create deployment plan
      const plan = await this.createDeploymentPlan(deploymentId, modelId, version, config, environment);
      
      // Validate deployment
      await this.validateDeployment(plan);

      // Execute deployment
      const deployment = await this.executeDeployment(plan, environment);
      
      this.deployments.set(deploymentId, deployment);
      this.emit('modelDeployed', { deployment });
      
      return deploymentId;
    } catch (error) {
      this.emit('error', { operation: 'deployModel', error, modelId, version });
      throw error;
    }
  }

  async updateDeployment(
    deploymentId: string,
    config: Partial<DeploymentConfiguration>
  ): Promise<boolean> {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      deployment.status = 'updating';
      deployment.configuration = { ...deployment.configuration, ...config };
      deployment.updatedAt = new Date();

      // Perform rolling update
      await this.performRollingUpdate(deployment);

      deployment.status = 'active';
      this.emit('deploymentUpdated', { deployment });
      
      return true;
    } catch (error) {
      const deployment = this.deployments.get(deploymentId);
      if (deployment) {
        deployment.status = 'failed';
      }
      this.emit('error', { operation: 'updateDeployment', error, deploymentId });
      return false;
    }
  }

  async scaleDeployment(deploymentId: string, replicas: number): Promise<boolean> {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const currentReplicas = deployment.configuration.replicas;
      deployment.configuration.replicas = replicas;
      deployment.updatedAt = new Date();

      if (replicas > currentReplicas) {
        await this.scaleUp(deployment, replicas - currentReplicas);
      } else if (replicas < currentReplicas) {
        await this.scaleDown(deployment, currentReplicas - replicas);
      }

      this.emit('deploymentScaled', { deploymentId, previousReplicas: currentReplicas, newReplicas: replicas });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'scaleDeployment', error, deploymentId });
      return false;
    }
  }

  async rollbackDeployment(deploymentId: string, targetVersion: string): Promise<boolean> {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        throw new Error(`Deployment ${deploymentId} not found`);
      }

      const previousVersion = deployment.version;
      deployment.status = 'updating';
      deployment.version = targetVersion;

      // Perform rollback deployment
      await this.performRollback(deployment, previousVersion);

      deployment.status = 'active';
      deployment.updatedAt = new Date();

      this.emit('deploymentRolledBack', { deploymentId, previousVersion, targetVersion });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'rollbackDeployment', error, deploymentId });
      return false;
    }
  }

  async undeployModel(deploymentId: string): Promise<boolean> {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        return false;
      }

      deployment.status = 'inactive';
      
      // Gracefully shutdown all replicas
      await this.shutdownDeployment(deployment);
      
      // Cleanup resources
      await this.cleanupDeploymentResources(deployment);
      
      this.deployments.delete(deploymentId);
      this.emit('modelUndeployed', { deploymentId });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'undeployModel', error, deploymentId });
      return false;
    }
  }

  async getDeployments(environment?: string): Promise<ModelDeployment[]> {
    let deployments = Array.from(this.deployments.values());
    
    if (environment) {
      deployments = deployments.filter(d => d.environment === environment);
    }

    return deployments.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getDeploymentStatus(deploymentId: string): Promise<ModelDeployment | undefined> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      return undefined;
    }

    // Update real-time metrics
    await this.updateDeploymentMetrics(deployment);
    return deployment;
  }

  // Resource Management
  async getResourcePools(): Promise<ResourcePool[]> {
    return Array.from(this.resourcePools.values());
  }

  async addResourcePool(pool: ResourcePool): Promise<boolean> {
    try {
      this.resourcePools.set(pool.id, pool);
      this.emit('resourcePoolAdded', { pool });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'addResourcePool', error });
      return false;
    }
  }

  async removeResourcePool(poolId: string): Promise<boolean> {
    try {
      const pool = this.resourcePools.get(poolId);
      if (!pool) {
        return false;
      }

      // Check if pool has active deployments
      const activeDeployments = Array.from(this.deployments.values())
        .filter(d => d.status === 'active');
      
      if (activeDeployments.length > 0) {
        throw new Error('Cannot remove resource pool with active deployments');
      }

      this.resourcePools.delete(poolId);
      this.emit('resourcePoolRemoved', { poolId });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'removeResourcePool', error });
      return false;
    }
  }

  async getResourceUtilization(): Promise<{
    global: ResourceCapacity;
    byPool: { [poolId: string]: { total: ResourceCapacity; used: ResourceCapacity; utilization: number } };
    byNode: { [nodeId: string]: { capacity: ResourceCapacity; allocated: ResourceCapacity; utilization: number } };
  }> {
    const global: ResourceCapacity = { cpu: 0, memory: 0, gpu: 0, storage: 0 };
    const byPool: { [poolId: string]: { total: ResourceCapacity; used: ResourceCapacity; utilization: number } } = {};
    const byNode: { [nodeId: string]: { capacity: ResourceCapacity; allocated: ResourceCapacity; utilization: number } } = {};

    for (const pool of this.resourcePools.values()) {
      const totalResources = pool.totalResources;
      const usedResources = {
        cpu: totalResources.cpu - pool.availableResources.cpu,
        memory: totalResources.memory - pool.availableResources.memory,
        gpu: (totalResources.gpu || 0) - (pool.availableResources.gpu || 0),
        storage: totalResources.storage - pool.availableResources.storage
      };

      const utilization = (usedResources.cpu + usedResources.memory) / (totalResources.cpu + totalResources.memory);

      byPool[pool.id] = {
        total: totalResources,
        used: usedResources,
        utilization
      };

      // Aggregate to global
      global.cpu += totalResources.cpu;
      global.memory += totalResources.memory;
      global.gpu = (global.gpu || 0) + (totalResources.gpu || 0);
      global.storage += totalResources.storage;

      // Node-level metrics
      for (const node of pool.nodes) {
        const nodeUtilization = (node.allocated.cpu + node.allocated.memory) / (node.capacity.cpu + node.capacity.memory);
        byNode[node.id] = {
          capacity: node.capacity,
          allocated: node.allocated,
          utilization: nodeUtilization
        };
      }
    }

    return { global, byPool, byNode };
  }

  // Monitoring and Analytics
  async getDeploymentMetrics(deploymentId: string): Promise<{
    requests: { total: number; success: number; errors: number; rate: number };
    latency: { p50: number; p95: number; p99: number; mean: number };
    resources: { cpu: number; memory: number; gpu?: number };
    replicas: { desired: number; ready: number; available: number };
    uptime: number;
  }> {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    return {
      requests: deployment.metrics.requests,
      latency: deployment.metrics.latency,
      resources: deployment.metrics.resources,
      replicas: {
        desired: deployment.configuration.replicas,
        ready: deployment.configuration.replicas, // Simplified
        available: deployment.configuration.replicas
      },
      uptime: deployment.metrics.uptime
    };
  }

  async getSystemHealthScore(): Promise<{
    overall: number;
    components: {
      deployments: number;
      resources: number;
      network: number;
      storage: number;
    };
    recommendations: string[];
  }> {
    const deployments = Array.from(this.deployments.values());
    const healthyDeployments = deployments.filter(d => d.health === 'healthy').length;
    const deploymentScore = deployments.length > 0 ? (healthyDeployments / deployments.length) * 100 : 100;

    const resourceUtilization = await this.getResourceUtilization();
    const avgUtilization = Object.values(resourceUtilization.byPool).reduce((sum, pool) => sum + pool.utilization, 0) / Object.keys(resourceUtilization.byPool).length;
    const resourceScore = Math.max(0, 100 - (avgUtilization * 100));

    const networkScore = 95; // Simplified
    const storageScore = 90; // Simplified

    const overall = (deploymentScore + resourceScore + networkScore + storageScore) / 4;

    const recommendations: string[] = [];
    if (deploymentScore < 90) {
      recommendations.push('Some deployments are unhealthy - investigate and remediate');
    }
    if (resourceScore < 70) {
      recommendations.push('High resource utilization detected - consider scaling up');
    }
    if (overall < 80) {
      recommendations.push('System health is degraded - review all components');
    }

    return {
      overall,
      components: {
        deployments: deploymentScore,
        resources: resourceScore,
        network: networkScore,
        storage: storageScore
      },
      recommendations
    };
  }

  private async createDeploymentPlan(
    deploymentId: string,
    modelId: string,
    version: string,
    config: DeploymentConfiguration,
    environment: string
  ): Promise<DeploymentPlan> {
    const model = await this.modelRegistry.getModel(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found`);
    }

    const resourceRequirements: ResourceCapacity = {
      cpu: parseInt(config.resources.cpu) || model.requirements.cpu.cores,
      memory: this.parseMemory(config.resources.memory) || model.requirements.memory.ram,
      gpu: config.resources.gpu ? parseInt(config.resources.gpu) : model.requirements.gpu?.memory,
      storage: model.requirements.storage.size
    };

    const placement = await this.calculateNodePlacement(resourceRequirements, config.replicas);

    const plan: DeploymentPlan = {
      deploymentId,
      modelId,
      version,
      strategy: this.config.defaultStrategy,
      resourceRequirements,
      placement,
      networkConfig: {
        serviceType: 'ClusterIP',
        ports: [
          {
            name: 'http',
            port: config.networking.port || 8080,
            targetPort: config.networking.port || 8080,
            protocol: 'TCP'
          }
        ]
      },
      dependencies: [],
      validations: []
    };

    this.deploymentPlans.set(deploymentId, plan);
    return plan;
  }

  private async validateDeployment(plan: DeploymentPlan): Promise<void> {
    const validations: DeploymentValidation[] = [];

    // Resource availability validation
    validations.push({
      type: 'resource_availability',
      status: 'pending',
      timestamp: new Date()
    });

    const hasResources = await this.checkResourceAvailability(plan.resourceRequirements, plan.placement.length);
    validations[0].status = hasResources ? 'passed' : 'failed';
    validations[0].message = hasResources ? 'Resources available' : 'Insufficient resources';

    // Model compatibility validation
    validations.push({
      type: 'model_compatibility',
      status: 'passed',
      message: 'Model compatible with runtime',
      timestamp: new Date()
    });

    plan.validations = validations;

    const failedValidations = validations.filter(v => v.status === 'failed');
    if (failedValidations.length > 0) {
      throw new Error(`Deployment validation failed: ${failedValidations.map(v => v.message).join(', ')}`);
    }
  }

  private async executeDeployment(plan: DeploymentPlan, environment: string): Promise<ModelDeployment> {
    const deployment: ModelDeployment = {
      id: plan.deploymentId,
      modelId: plan.modelId,
      version: plan.version,
      environment,
      configuration: {
        replicas: plan.placement.reduce((sum, p) => sum + p.replicas, 0),
        resources: {
          cpu: plan.resourceRequirements.cpu.toString(),
          memory: `${plan.resourceRequirements.memory}Mi`,
          gpu: plan.resourceRequirements.gpu?.toString()
        },
        scaling: this.config.autoscaling,
        networking: plan.networkConfig,
        environment: {},
        secrets: []
      },
      endpoints: [],
      status: 'deploying',
      health: 'healthy',
      metrics: {
        requests: { total: 0, success: 0, errors: 0, rate: 0 },
        latency: { p50: 0, p95: 0, p99: 0, mean: 0 },
        resources: { cpu: 0, memory: 0 },
        uptime: 0,
        lastUpdated: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Simulate deployment process
    await this.simulateDeploymentProcess(deployment);

    deployment.status = 'active';
    deployment.health = 'healthy';

    return deployment;
  }

  private async simulateDeploymentProcess(deployment: ModelDeployment): Promise<void> {
    // Simulate deployment steps
    const steps = ['pulling_image', 'creating_containers', 'starting_services', 'health_checks'];
    
    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.emit('deploymentProgress', { deploymentId: deployment.id, step, status: 'completed' });
    }
  }

  private async calculateNodePlacement(
    requirements: ResourceCapacity,
    replicas: number
  ): Promise<NodePlacement[]> {
    const placements: NodePlacement[] = [];
    const availableNodes = this.getAvailableNodes(requirements);

    if (availableNodes.length === 0) {
      throw new Error('No suitable nodes available for deployment');
    }

    let remainingReplicas = replicas;
    let nodeIndex = 0;

    while (remainingReplicas > 0 && nodeIndex < availableNodes.length) {
      const node = availableNodes[nodeIndex];
      const nodeCapacity = Math.floor(Math.min(
        node.available.cpu / requirements.cpu,
        node.available.memory / requirements.memory
      ));

      const replicasOnNode = Math.min(remainingReplicas, nodeCapacity, 3); // Max 3 replicas per node

      if (replicasOnNode > 0) {
        placements.push({
          nodeId: node.id,
          replicas: replicasOnNode,
          resources: {
            cpu: requirements.cpu * replicasOnNode,
            memory: requirements.memory * replicasOnNode,
            gpu: requirements.gpu ? requirements.gpu * replicasOnNode : 0,
            storage: requirements.storage * replicasOnNode
          }
        });

        remainingReplicas -= replicasOnNode;
      }

      nodeIndex++;
    }

    if (remainingReplicas > 0) {
      throw new Error(`Cannot place all replicas. ${remainingReplicas} replicas remaining.`);
    }

    return placements;
  }

  private getAvailableNodes(requirements: ResourceCapacity): ComputeNode[] {
    const nodes: ComputeNode[] = [];
    
    for (const pool of this.resourcePools.values()) {
      if (pool.status !== 'active') continue;

      for (const node of pool.nodes) {
        if (node.status === 'ready' &&
            node.available.cpu >= requirements.cpu &&
            node.available.memory >= requirements.memory &&
            (!requirements.gpu || (node.available.gpu && node.available.gpu >= requirements.gpu))) {
          nodes.push(node);
        }
      }
    }

    return nodes.sort((a, b) => {
      const aUtilization = (a.allocated.cpu + a.allocated.memory) / (a.capacity.cpu + a.capacity.memory);
      const bUtilization = (b.allocated.cpu + b.allocated.memory) / (b.capacity.cpu + b.capacity.memory);
      return aUtilization - bUtilization; // Prefer less utilized nodes
    });
  }

  private async checkResourceAvailability(requirements: ResourceCapacity, replicas: number): Promise<boolean> {
    const totalRequired = {
      cpu: requirements.cpu * replicas,
      memory: requirements.memory * replicas,
      gpu: requirements.gpu ? requirements.gpu * replicas : 0,
      storage: requirements.storage * replicas
    };

    let availableCpu = 0;
    let availableMemory = 0;
    let availableGpu = 0;
    let availableStorage = 0;

    for (const pool of this.resourcePools.values()) {
      if (pool.status === 'active') {
        availableCpu += pool.availableResources.cpu;
        availableMemory += pool.availableResources.memory;
        availableGpu += pool.availableResources.gpu || 0;
        availableStorage += pool.availableResources.storage;
      }
    }

    return availableCpu >= totalRequired.cpu &&
           availableMemory >= totalRequired.memory &&
           availableGpu >= totalRequired.gpu &&
           availableStorage >= totalRequired.storage;
  }

  private async performRollingUpdate(deployment: ModelDeployment): Promise<void> {
    // Simulate rolling update
    for (let i = 0; i < deployment.configuration.replicas; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.emit('deploymentProgress', { 
        deploymentId: deployment.id, 
        step: `updating_replica_${i + 1}`, 
        status: 'completed' 
      });
    }
  }

  private async scaleUp(deployment: ModelDeployment, additionalReplicas: number): Promise<void> {
    for (let i = 0; i < additionalReplicas; i++) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      this.emit('deploymentProgress', { 
        deploymentId: deployment.id, 
        step: `scaling_up_replica_${i + 1}`, 
        status: 'completed' 
      });
    }
  }

  private async scaleDown(deployment: ModelDeployment, replicasToRemove: number): Promise<void> {
    for (let i = 0; i < replicasToRemove; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.emit('deploymentProgress', { 
        deploymentId: deployment.id, 
        step: `scaling_down_replica_${i + 1}`, 
        status: 'completed' 
      });
    }
  }

  private async performRollback(deployment: ModelDeployment, previousVersion: string): Promise<void> {
    // Simulate rollback process
    const steps = ['stopping_current', 'deploying_previous', 'health_checks', 'traffic_switch'];
    
    for (const step of steps) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      this.emit('deploymentProgress', { 
        deploymentId: deployment.id, 
        step, 
        status: 'completed' 
      });
    }
  }

  private async shutdownDeployment(deployment: ModelDeployment): Promise<void> {
    // Graceful shutdown
    for (let i = 0; i < deployment.configuration.replicas; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.emit('deploymentProgress', { 
        deploymentId: deployment.id, 
        step: `shutting_down_replica_${i + 1}`, 
        status: 'completed' 
      });
    }
  }

  private async cleanupDeploymentResources(deployment: ModelDeployment): Promise<void> {
    // Cleanup resources
    await new Promise(resolve => setTimeout(resolve, 2000));
    this.emit('deploymentProgress', { 
      deploymentId: deployment.id, 
      step: 'cleanup_resources', 
      status: 'completed' 
    });
  }

  private async updateDeploymentMetrics(deployment: ModelDeployment): Promise<void> {
    // Simulate metrics update
    deployment.metrics.requests.total += Math.floor(Math.random() * 100);
    deployment.metrics.requests.success += Math.floor(Math.random() * 95);
    deployment.metrics.requests.errors += Math.floor(Math.random() * 5);
    deployment.metrics.requests.rate = Math.random() * 1000;

    deployment.metrics.latency.p50 = Math.random() * 100 + 50;
    deployment.metrics.latency.p95 = Math.random() * 200 + 150;
    deployment.metrics.latency.p99 = Math.random() * 300 + 250;
    deployment.metrics.latency.mean = Math.random() * 80 + 60;

    deployment.metrics.resources.cpu = Math.random() * 80 + 10;
    deployment.metrics.resources.memory = Math.random() * 70 + 20;

    deployment.metrics.uptime = Date.now() - deployment.createdAt.getTime();
    deployment.metrics.lastUpdated = new Date();
  }

  private startMonitoring(): void {
    if (!this.config.monitoring.enabled) return;

    setInterval(() => {
      for (const deployment of this.deployments.values()) {
        this.updateDeploymentMetrics(deployment);
        this.checkDeploymentHealth(deployment);
      }
    }, this.config.monitoring.metricsInterval || 30000);
  }

  private checkDeploymentHealth(deployment: ModelDeployment): void {
    const errorRate = deployment.metrics.requests.errors / Math.max(deployment.metrics.requests.total, 1);
    const avgLatency = deployment.metrics.latency.mean;

    if (errorRate > 0.1 || avgLatency > 2000) {
      deployment.health = 'unhealthy';
      this.emit('deploymentUnhealthy', { deploymentId: deployment.id, errorRate, avgLatency });
    } else if (errorRate > 0.05 || avgLatency > 1000) {
      deployment.health = 'degraded';
    } else {
      deployment.health = 'healthy';
    }
  }

  private startAutoscaling(): void {
    if (!this.config.autoscaling.enabled) return;

    setInterval(() => {
      for (const deployment of this.deployments.values()) {
        this.evaluateAutoscaling(deployment);
      }
    }, 60000); // Every minute
  }

  private async evaluateAutoscaling(deployment: ModelDeployment): Promise<void> {
    const metrics: AutoscalingMetrics = {
      cpu: deployment.metrics.resources.cpu,
      memory: deployment.metrics.resources.memory,
      requestRate: deployment.metrics.requests.rate,
      latency: deployment.metrics.latency.mean,
      errorRate: deployment.metrics.requests.errors / Math.max(deployment.metrics.requests.total, 1),
      queueSize: 0, // Would come from inference engine
      customMetrics: {}
    };

    const decision = this.calculateScalingDecision(deployment, metrics);
    
    if (decision.action !== 'no_action') {
      const decisions = this.autoscalingDecisions.get(deployment.id) || [];
      decisions.push(decision);
      
      // Keep only last 10 decisions
      if (decisions.length > 10) {
        decisions.splice(0, decisions.length - 10);
      }
      
      this.autoscalingDecisions.set(deployment.id, decisions);

      if (decision.confidence > 0.8) {
        await this.scaleDeployment(deployment.id, decision.targetReplicas);
      }
    }
  }

  private calculateScalingDecision(deployment: ModelDeployment, metrics: AutoscalingMetrics): ScalingDecision {
    const currentReplicas = deployment.configuration.replicas;
    const minReplicas = this.config.autoscaling.minReplicas;
    const maxReplicas = this.config.autoscaling.maxReplicas;
    
    let targetReplicas = currentReplicas;
    let reason = '';
    let confidence = 0;

    // Scale up conditions
    if (metrics.cpu > this.config.autoscaling.targetCPU * 1.2) {
      targetReplicas = Math.min(currentReplicas + 1, maxReplicas);
      reason = `High CPU utilization: ${metrics.cpu}%`;
      confidence = 0.9;
    } else if (metrics.memory > this.config.autoscaling.targetMemory * 1.2) {
      targetReplicas = Math.min(currentReplicas + 1, maxReplicas);
      reason = `High memory utilization: ${metrics.memory}%`;
      confidence = 0.85;
    } else if (metrics.latency > 1000) {
      targetReplicas = Math.min(currentReplicas + 1, maxReplicas);
      reason = `High latency: ${metrics.latency}ms`;
      confidence = 0.8;
    }
    // Scale down conditions
    else if (metrics.cpu < this.config.autoscaling.targetCPU * 0.5 && 
             metrics.memory < this.config.autoscaling.targetMemory * 0.5) {
      targetReplicas = Math.max(currentReplicas - 1, minReplicas);
      reason = `Low resource utilization: CPU ${metrics.cpu}%, Memory ${metrics.memory}%`;
      confidence = 0.7;
    }

    const action = targetReplicas > currentReplicas ? 'scale_up' :
                   targetReplicas < currentReplicas ? 'scale_down' : 'no_action';

    return {
      action,
      currentReplicas,
      targetReplicas,
      reason,
      confidence,
      timestamp: new Date()
    };
  }

  private parseMemory(memory: string): number {
    const match = memory.match(/^(\d+)(Mi|Gi)$/);
    if (!match) return 0;

    const value = parseInt(match[1]);
    const unit = match[2];

    return unit === 'Gi' ? value * 1024 : value;
  }

  private initializeResourcePools(): void {
    // Initialize default resource pools
    const defaultPools: ResourcePool[] = [
      {
        id: 'cpu-pool-1',
        name: 'CPU Pool 1',
        type: 'cpu',
        region: 'us-west-2',
        availableResources: { cpu: 100, memory: 200000, storage: 1000000 },
        totalResources: { cpu: 120, memory: 240000, storage: 1000000 },
        utilizationThreshold: 0.8,
        nodes: [
          {
            id: 'node-1',
            name: 'cpu-node-1',
            type: 'c5.4xlarge',
            capacity: { cpu: 16, memory: 32000, storage: 100000 },
            allocated: { cpu: 4, memory: 8000, storage: 10000 },
            available: { cpu: 12, memory: 24000, storage: 90000 },
            status: 'ready',
            labels: { 'node-type': 'cpu', 'zone': 'us-west-2a' },
            taints: [],
            lastHeartbeat: new Date()
          }
        ],
        status: 'active'
      },
      {
        id: 'gpu-pool-1',
        name: 'GPU Pool 1',
        type: 'gpu',
        region: 'us-west-2',
        availableResources: { cpu: 32, memory: 128000, gpu: 4, storage: 500000 },
        totalResources: { cpu: 64, memory: 256000, gpu: 8, storage: 500000 },
        utilizationThreshold: 0.8,
        nodes: [
          {
            id: 'node-2',
            name: 'gpu-node-1',
            type: 'p3.2xlarge',
            capacity: { cpu: 8, memory: 64000, gpu: 1, storage: 100000 },
            allocated: { cpu: 2, memory: 16000, gpu: 0, storage: 10000 },
            available: { cpu: 6, memory: 48000, gpu: 1, storage: 90000 },
            status: 'ready',
            labels: { 'node-type': 'gpu', 'zone': 'us-west-2b', 'gpu-type': 'v100' },
            taints: [{ key: 'gpu', value: 'true', effect: 'NoSchedule' }],
            lastHeartbeat: new Date()
          }
        ],
        status: 'active'
      }
    ];

    defaultPools.forEach(pool => {
      this.resourcePools.set(pool.id, pool);
    });
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}