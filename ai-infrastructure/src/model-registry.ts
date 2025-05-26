import { EventEmitter } from 'events';

export interface ModelMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  type: 'llm' | 'embedding' | 'classification' | 'regression' | 'generation' | 'custom';
  framework: 'pytorch' | 'tensorflow' | 'onnx' | 'huggingface' | 'openai' | 'anthropic';
  size: number;
  parameters: number;
  architecture: string;
  inputSchema: ModelSchema;
  outputSchema: ModelSchema;
  requirements: ModelRequirements;
  performance: ModelPerformance;
  tags: string[];
  author: string;
  license: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'testing' | 'staging' | 'production' | 'deprecated';
}

export interface ModelSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, ModelSchemaProperty>;
  items?: ModelSchema;
  required?: string[];
  example?: any;
}

export interface ModelSchemaProperty {
  type: string;
  description: string;
  format?: string;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

export interface ModelRequirements {
  cpu: {
    cores: number;
    architecture: string[];
  };
  memory: {
    ram: number;
    vram?: number;
  };
  gpu?: {
    required: boolean;
    memory: number;
    compute: string[];
  };
  storage: {
    size: number;
    type: 'ssd' | 'hdd' | 'nvme';
  };
  runtime: {
    python?: string;
    cuda?: string;
    dependencies: string[];
  };
}

export interface ModelPerformance {
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    tokensPerSecond?: number;
  };
  accuracy?: {
    metric: string;
    value: number;
    dataset: string;
  };
  resourceUtilization: {
    cpu: number;
    memory: number;
    gpu?: number;
  };
  benchmarks: ModelBenchmark[];
}

export interface ModelBenchmark {
  name: string;
  dataset: string;
  metric: string;
  value: number;
  timestamp: Date;
  environment: string;
}

export interface ModelArtifact {
  id: string;
  modelId: string;
  type: 'weights' | 'config' | 'tokenizer' | 'onnx' | 'tensorrt' | 'openvino';
  path: string;
  size: number;
  checksum: string;
  format: string;
  compression?: string;
  createdAt: Date;
}

export interface ModelVersion {
  version: string;
  modelId: string;
  changelog: string[];
  artifacts: ModelArtifact[];
  experiments: ModelExperiment[];
  promotion: ModelPromotion;
  createdBy: string;
  createdAt: Date;
}

export interface ModelExperiment {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  metrics: Record<string, number>;
  dataset: string;
  duration: number;
  status: 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export interface ModelPromotion {
  environment: string;
  promotedBy: string;
  promotedAt: Date;
  approvals: ModelApproval[];
  rollbackPlan?: string;
}

export interface ModelApproval {
  approver: string;
  approved: boolean;
  comments?: string;
  timestamp: Date;
}

export interface ModelDeployment {
  id: string;
  modelId: string;
  version: string;
  environment: string;
  configuration: DeploymentConfiguration;
  endpoints: ModelEndpoint[];
  status: 'deploying' | 'active' | 'inactive' | 'failed' | 'updating';
  health: 'healthy' | 'degraded' | 'unhealthy';
  metrics: DeploymentMetrics;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeploymentConfiguration {
  replicas: number;
  resources: {
    cpu: string;
    memory: string;
    gpu?: string;
  };
  scaling: {
    minReplicas: number;
    maxReplicas: number;
    targetCPU: number;
    targetMemory: number;
  };
  networking: {
    port: number;
    protocol: 'http' | 'grpc';
    loadBalancer: boolean;
  };
  environment: Record<string, string>;
  secrets: string[];
}

export interface ModelEndpoint {
  id: string;
  url: string;
  type: 'inference' | 'batch' | 'streaming';
  authentication: 'none' | 'api_key' | 'oauth' | 'jwt';
  rateLimit: {
    requests: number;
    window: number;
  };
  timeout: number;
  retries: number;
}

export interface DeploymentMetrics {
  requests: {
    total: number;
    success: number;
    errors: number;
    rate: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
    mean: number;
  };
  resources: {
    cpu: number;
    memory: number;
    gpu?: number;
  };
  uptime: number;
  lastUpdated: Date;
}

export interface ModelInferenceRequest {
  modelId: string;
  version?: string;
  input: any;
  parameters?: Record<string, any>;
  metadata?: Record<string, any>;
  timeout?: number;
  streaming?: boolean;
}

export interface ModelInferenceResponse {
  requestId: string;
  modelId: string;
  version: string;
  output: any;
  confidence?: number;
  latency: number;
  tokens?: {
    input: number;
    output: number;
    total: number;
  };
  metadata?: Record<string, any>;
  timestamp: Date;
}

export class ModelRegistry extends EventEmitter {
  private models = new Map<string, ModelMetadata>();
  private versions = new Map<string, ModelVersion[]>();
  private artifacts = new Map<string, ModelArtifact[]>();
  private deployments = new Map<string, ModelDeployment>();
  private experiments = new Map<string, ModelExperiment>();

  constructor() {
    super();
    this.initializeBuiltInModels();
  }

  // Model Management
  async registerModel(metadata: Omit<ModelMetadata, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const modelId = this.generateId();
      const model: ModelMetadata = {
        id: modelId,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...metadata
      };

      this.models.set(modelId, model);
      this.versions.set(modelId, []);
      this.artifacts.set(modelId, []);

      this.emit('modelRegistered', { model });
      return modelId;
    } catch (error) {
      this.emit('error', { operation: 'registerModel', error });
      throw error;
    }
  }

  async updateModel(modelId: string, updates: Partial<ModelMetadata>): Promise<boolean> {
    try {
      const model = this.models.get(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      Object.assign(model, updates, { updatedAt: new Date() });
      this.emit('modelUpdated', { model });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'updateModel', error });
      return false;
    }
  }

  async getModel(modelId: string): Promise<ModelMetadata | undefined> {
    return this.models.get(modelId);
  }

  async getModels(filters?: {
    type?: string;
    framework?: string;
    status?: string;
    tags?: string[];
  }): Promise<ModelMetadata[]> {
    let models = Array.from(this.models.values());

    if (filters) {
      if (filters.type) {
        models = models.filter(m => m.type === filters.type);
      }
      if (filters.framework) {
        models = models.filter(m => m.framework === filters.framework);
      }
      if (filters.status) {
        models = models.filter(m => m.status === filters.status);
      }
      if (filters.tags && filters.tags.length > 0) {
        models = models.filter(m => 
          filters.tags!.some(tag => m.tags.includes(tag))
        );
      }
    }

    return models.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async deleteModel(modelId: string): Promise<boolean> {
    try {
      const model = this.models.get(modelId);
      if (!model) {
        return false;
      }

      // Check if model has active deployments
      const activeDeployments = Array.from(this.deployments.values())
        .filter(d => d.modelId === modelId && d.status === 'active');

      if (activeDeployments.length > 0) {
        throw new Error('Cannot delete model with active deployments');
      }

      this.models.delete(modelId);
      this.versions.delete(modelId);
      this.artifacts.delete(modelId);

      this.emit('modelDeleted', { modelId });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'deleteModel', error });
      return false;
    }
  }

  // Version Management
  async createVersion(modelId: string, version: Omit<ModelVersion, 'modelId' | 'createdAt'>): Promise<boolean> {
    try {
      const model = this.models.get(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      const modelVersion: ModelVersion = {
        modelId,
        createdAt: new Date(),
        ...version
      };

      const versions = this.versions.get(modelId) || [];
      versions.push(modelVersion);
      this.versions.set(modelId, versions);

      this.emit('versionCreated', { modelId, version: modelVersion });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'createVersion', error });
      return false;
    }
  }

  async getVersions(modelId: string): Promise<ModelVersion[]> {
    return this.versions.get(modelId) || [];
  }

  async getLatestVersion(modelId: string): Promise<ModelVersion | undefined> {
    const versions = this.versions.get(modelId) || [];
    return versions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  // Artifact Management
  async uploadArtifact(artifact: Omit<ModelArtifact, 'id' | 'createdAt'>): Promise<string> {
    try {
      const artifactId = this.generateId();
      const modelArtifact: ModelArtifact = {
        id: artifactId,
        createdAt: new Date(),
        ...artifact
      };

      const artifacts = this.artifacts.get(artifact.modelId) || [];
      artifacts.push(modelArtifact);
      this.artifacts.set(artifact.modelId, artifacts);

      this.emit('artifactUploaded', { artifact: modelArtifact });
      return artifactId;
    } catch (error) {
      this.emit('error', { operation: 'uploadArtifact', error });
      throw error;
    }
  }

  async getArtifacts(modelId: string, type?: string): Promise<ModelArtifact[]> {
    let artifacts = this.artifacts.get(modelId) || [];
    
    if (type) {
      artifacts = artifacts.filter(a => a.type === type);
    }

    return artifacts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async downloadArtifact(artifactId: string): Promise<Buffer> {
    // In production, this would download from storage service
    const artifact = this.findArtifactById(artifactId);
    if (!artifact) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    // Simulate artifact download
    return Buffer.from(`Artifact content for ${artifact.id}`);
  }

  // Experiment Management
  async createExperiment(experiment: Omit<ModelExperiment, 'id' | 'createdAt'>): Promise<string> {
    try {
      const experimentId = this.generateId();
      const modelExperiment: ModelExperiment = {
        id: experimentId,
        createdAt: new Date(),
        ...experiment
      };

      this.experiments.set(experimentId, modelExperiment);
      this.emit('experimentCreated', { experiment: modelExperiment });
      
      return experimentId;
    } catch (error) {
      this.emit('error', { operation: 'createExperiment', error });
      throw error;
    }
  }

  async updateExperiment(experimentId: string, updates: Partial<ModelExperiment>): Promise<boolean> {
    try {
      const experiment = this.experiments.get(experimentId);
      if (!experiment) {
        throw new Error(`Experiment ${experimentId} not found`);
      }

      Object.assign(experiment, updates);
      this.emit('experimentUpdated', { experiment });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'updateExperiment', error });
      return false;
    }
  }

  async getExperiments(modelId?: string): Promise<ModelExperiment[]> {
    let experiments = Array.from(this.experiments.values());
    
    if (modelId) {
      // Filter experiments by model - would need to track this relationship
      experiments = experiments.filter(e => e.name.includes(modelId));
    }

    return experiments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Model Promotion
  async promoteModel(
    modelId: string, 
    version: string, 
    environment: string, 
    approvals: ModelApproval[]
  ): Promise<boolean> {
    try {
      const model = this.models.get(modelId);
      if (!model) {
        throw new Error(`Model ${modelId} not found`);
      }

      const versions = this.versions.get(modelId) || [];
      const targetVersion = versions.find(v => v.version === version);
      
      if (!targetVersion) {
        throw new Error(`Version ${version} not found for model ${modelId}`);
      }

      // Check if all required approvals are present
      const requiredApprovals = approvals.filter(a => a.approved);
      if (requiredApprovals.length === 0) {
        throw new Error('At least one approval is required for promotion');
      }

      targetVersion.promotion = {
        environment,
        promotedBy: requiredApprovals[0].approver,
        promotedAt: new Date(),
        approvals
      };

      this.emit('modelPromoted', { modelId, version, environment });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'promoteModel', error });
      return false;
    }
  }

  // Model Comparison
  async compareModels(modelIds: string[]): Promise<{
    models: ModelMetadata[];
    comparison: ModelComparison;
  }> {
    const models = modelIds.map(id => this.models.get(id)).filter(Boolean) as ModelMetadata[];
    
    if (models.length < 2) {
      throw new Error('At least 2 models are required for comparison');
    }

    const comparison: ModelComparison = {
      parameters: models.map(m => ({ id: m.id, parameters: m.parameters })),
      performance: models.map(m => ({
        id: m.id,
        latency: m.performance.latency.p95,
        throughput: m.performance.throughput.requestsPerSecond,
        accuracy: m.performance.accuracy?.value
      })),
      requirements: models.map(m => ({
        id: m.id,
        memory: m.requirements.memory.ram,
        storage: m.requirements.storage.size,
        gpu: m.requirements.gpu?.required
      })),
      recommendations: this.generateComparisonRecommendations(models)
    };

    return { models, comparison };
  }

  // Model Search
  async searchModels(query: string, filters?: {
    type?: string;
    framework?: string;
    minAccuracy?: number;
    maxLatency?: number;
  }): Promise<ModelMetadata[]> {
    let models = Array.from(this.models.values());

    // Text search
    if (query.trim()) {
      models = models.filter(m => 
        m.name.toLowerCase().includes(query.toLowerCase()) ||
        m.description.toLowerCase().includes(query.toLowerCase()) ||
        m.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
      );
    }

    // Apply filters
    if (filters) {
      if (filters.type) {
        models = models.filter(m => m.type === filters.type);
      }
      if (filters.framework) {
        models = models.filter(m => m.framework === filters.framework);
      }
      if (filters.minAccuracy !== undefined) {
        models = models.filter(m => 
          m.performance.accuracy && m.performance.accuracy.value >= filters.minAccuracy!
        );
      }
      if (filters.maxLatency !== undefined) {
        models = models.filter(m => 
          m.performance.latency.p95 <= filters.maxLatency!
        );
      }
    }

    return models;
  }

  // Analytics
  async getRegistryAnalytics(): Promise<{
    totalModels: number;
    modelsByType: Record<string, number>;
    modelsByFramework: Record<string, number>;
    modelsByStatus: Record<string, number>;
    popularModels: { id: string; name: string; deployments: number }[];
    recentActivity: RecentActivity[];
    storageUsage: {
      totalSize: number;
      artifactCount: number;
      avgModelSize: number;
    };
  }> {
    const models = Array.from(this.models.values());
    
    const modelsByType: Record<string, number> = {};
    const modelsByFramework: Record<string, number> = {};
    const modelsByStatus: Record<string, number> = {};
    
    let totalArtifacts = 0;
    let totalSize = 0;

    models.forEach(model => {
      modelsByType[model.type] = (modelsByType[model.type] || 0) + 1;
      modelsByFramework[model.framework] = (modelsByFramework[model.framework] || 0) + 1;
      modelsByStatus[model.status] = (modelsByStatus[model.status] || 0) + 1;
      
      const artifacts = this.artifacts.get(model.id) || [];
      totalArtifacts += artifacts.length;
      totalSize += artifacts.reduce((sum, a) => sum + a.size, 0);
    });

    const popularModels = models
      .map(m => ({
        id: m.id,
        name: m.name,
        deployments: Array.from(this.deployments.values())
          .filter(d => d.modelId === m.id).length
      }))
      .sort((a, b) => b.deployments - a.deployments)
      .slice(0, 10);

    const recentActivity: RecentActivity[] = [
      ...models.slice(0, 5).map(m => ({
        type: 'model_registered' as const,
        modelId: m.id,
        modelName: m.name,
        timestamp: m.createdAt
      })),
      ...Array.from(this.experiments.values()).slice(0, 5).map(e => ({
        type: 'experiment_created' as const,
        experimentId: e.id,
        experimentName: e.name,
        timestamp: e.createdAt
      }))
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 10);

    return {
      totalModels: models.length,
      modelsByType,
      modelsByFramework,
      modelsByStatus,
      popularModels,
      recentActivity,
      storageUsage: {
        totalSize,
        artifactCount: totalArtifacts,
        avgModelSize: totalSize / Math.max(models.length, 1)
      }
    };
  }

  private findArtifactById(artifactId: string): ModelArtifact | undefined {
    for (const artifacts of this.artifacts.values()) {
      const artifact = artifacts.find(a => a.id === artifactId);
      if (artifact) return artifact;
    }
    return undefined;
  }

  private generateComparisonRecommendations(models: ModelMetadata[]): string[] {
    const recommendations: string[] = [];

    // Performance recommendations
    const bestPerformance = models.reduce((best, model) => 
      model.performance.latency.p95 < best.performance.latency.p95 ? model : best
    );
    recommendations.push(`${bestPerformance.name} has the best latency performance`);

    // Accuracy recommendations
    const bestAccuracy = models.reduce((best, model) => {
      if (!model.performance.accuracy || !best.performance.accuracy) return best;
      return model.performance.accuracy.value > best.performance.accuracy.value ? model : best;
    });
    if (bestAccuracy.performance.accuracy) {
      recommendations.push(`${bestAccuracy.name} has the highest accuracy`);
    }

    // Resource recommendations
    const leastResource = models.reduce((least, model) => 
      model.requirements.memory.ram < least.requirements.memory.ram ? model : least
    );
    recommendations.push(`${leastResource.name} has the lowest memory requirements`);

    return recommendations;
  }

  private initializeBuiltInModels(): void {
    // Initialize some example models
    const builtInModels: Omit<ModelMetadata, 'id' | 'createdAt' | 'updatedAt'>[] = [
      {
        name: 'Claude-3-Sonnet',
        version: '3.0.0',
        description: 'Advanced language model for complex reasoning and analysis',
        type: 'llm',
        framework: 'anthropic',
        size: 1024 * 1024 * 1024 * 100, // 100GB
        parameters: 175000000000, // 175B
        architecture: 'transformer',
        inputSchema: {
          type: 'object',
          properties: {
            messages: {
              type: 'array',
              description: 'Array of conversation messages'
            },
            max_tokens: {
              type: 'number',
              description: 'Maximum tokens to generate'
            }
          },
          required: ['messages']
        },
        outputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'Generated response'
            },
            usage: {
              type: 'object',
              description: 'Token usage statistics'
            }
          }
        },
        requirements: {
          cpu: {
            cores: 16,
            architecture: ['x86_64', 'arm64']
          },
          memory: {
            ram: 32 * 1024 * 1024 * 1024, // 32GB
            vram: 80 * 1024 * 1024 * 1024 // 80GB
          },
          gpu: {
            required: true,
            memory: 80 * 1024 * 1024 * 1024,
            compute: ['7.0', '8.0', '8.6']
          },
          storage: {
            size: 200 * 1024 * 1024 * 1024, // 200GB
            type: 'nvme'
          },
          runtime: {
            python: '3.9+',
            cuda: '11.8+',
            dependencies: ['torch>=2.0.0', 'transformers>=4.25.0']
          }
        },
        performance: {
          latency: {
            p50: 150,
            p95: 300,
            p99: 500
          },
          throughput: {
            requestsPerSecond: 10,
            tokensPerSecond: 50
          },
          accuracy: {
            metric: 'hellaswag',
            value: 0.95,
            dataset: 'hellaswag-validation'
          },
          resourceUtilization: {
            cpu: 60,
            memory: 70,
            gpu: 85
          },
          benchmarks: []
        },
        tags: ['nlp', 'language-model', 'reasoning', 'anthropic'],
        author: 'Anthropic',
        license: 'Commercial',
        status: 'production'
      }
    ];

    builtInModels.forEach(async (model) => {
      await this.registerModel(model);
    });
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

// Helper interfaces
interface ModelComparison {
  parameters: { id: string; parameters: number }[];
  performance: { id: string; latency: number; throughput: number; accuracy?: number }[];
  requirements: { id: string; memory: number; storage: number; gpu?: boolean }[];
  recommendations: string[];
}

interface RecentActivity {
  type: 'model_registered' | 'experiment_created' | 'model_deployed' | 'version_created';
  modelId?: string;
  modelName?: string;
  experimentId?: string;
  experimentName?: string;
  timestamp: Date;
}