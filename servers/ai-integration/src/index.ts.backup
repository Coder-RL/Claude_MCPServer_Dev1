import { BaseMCPServer } from '../../shared/src/base-server.js';
import { createLogger } from '../../shared/src/logging.js';
import { HealthChecker } from '../../shared/src/health.js';

import { ModelOrchestrationEngine } from './model-orchestration.js';
import { EnsembleMethodsService } from './ensemble-methods.js';
import { AutoMLService } from './automl-service.js';
import { NeuralArchitectureSearch } from './neural-architecture-search.js';
import { AIOpsService } from './aiops-service.js';

const logger = createLogger('AIIntegrationServer');

export interface AIIntegrationConfig {
  name: string;
  version: string;
  host: string;
  port: number;
  modelStoragePath: string;
  experimentTrackingUrl?: string;
  computeResources: {
    maxCpuCores: number;
    maxMemoryGB: number;
    gpuEnabled: boolean;
  };
}

export class AIIntegrationServer extends BaseMCPServer {
  private modelOrchestration: ModelOrchestrationEngine;
  private ensembleMethods: EnsembleMethodsService;
  private autoML: AutoMLService;
  private neuralArchSearch: NeuralArchitectureSearch;
  private aiOperations: AIOpsService;
  private healthChecker: HealthChecker;

  constructor(private config: AIIntegrationConfig) {
    super();
    
    this.healthChecker = new HealthChecker('AIIntegrationServer');
    
    // Initialize all AI integration components
    this.modelOrchestration = new ModelOrchestrationEngine({
      storagePath: config.modelStoragePath,
      maxConcurrentModels: config.computeResources.maxCpuCores,
    });
    
    this.ensembleMethods = new EnsembleMethodsService({
      cacheSize: 1000,
      parallelProcessing: true,
    });
    
    this.autoML = new AutoMLService();
    
    this.neuralArchSearch = new NeuralArchitectureSearch();
    
    this.aiOperations = new AIOpsService();
    
    this.setupHealthChecks();
    this.registerMCPTools();
    
    logger.info('AI Integration Server initialized', {
      version: config.version,
      port: config.port,
      modelStorage: config.modelStoragePath,
    });
  }

  private setupHealthChecks(): void {
    this.healthChecker.addCheck('model-orchestration', async () => {
      const health = this.modelOrchestration.getHealthCheck();
      return {
        name: 'model-orchestration',
        status: health.status === 'healthy' ? 'pass' : 'fail',
        timestamp: new Date().toISOString(),
        details: health.details
      };
    });

    this.healthChecker.addCheck('ensemble-methods', async () => {
      const health = this.ensembleMethods.getHealthCheck();
      return {
        name: 'ensemble-methods',
        status: health.status === 'healthy' ? 'pass' : 'fail',
        timestamp: new Date().toISOString(),
        details: health.details
      };
    });

    this.healthChecker.addCheck('automl-service', async () => {
      const health = this.autoML.getHealthCheck();
      return {
        name: 'automl-service',
        status: health.status === 'healthy' ? 'pass' : 'fail',
        timestamp: new Date().toISOString(),
        details: health.details
      };
    });

    this.healthChecker.addCheck('neural-arch-search', async () => {
      const health = this.neuralArchSearch.getHealthCheck();
      return {
        name: 'neural-arch-search',
        status: health.status === 'healthy' ? 'pass' : 'fail',
        timestamp: new Date().toISOString(),
        details: health.details
      };
    });

    this.healthChecker.addCheck('ai-operations', async () => {
      const health = this.aiOperations.getHealthCheck();
      return {
        name: 'ai-operations',
        status: health.status === 'healthy' ? 'pass' : 'fail',
        timestamp: new Date().toISOString(),
        details: health.details
      };
    });
  }

  private registerMCPTools(): void {
    // Model Orchestration Tools
    this.addTool('create_model_pipeline', {
      description: 'Create a multi-model pipeline for orchestrated AI workflows',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          models: { 
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                config: { type: 'object' }
              }
            }
          },
          workflow: { type: 'object' }
        },
        required: ['name', 'models', 'workflow']
      }
    }, async (args) => {
      return await this.modelOrchestration.createPipeline(args.name, args.models, args.workflow);
    });

    this.addTool('execute_orchestration', {
      description: 'Execute a model orchestration pipeline',
      inputSchema: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' },
          input: { type: 'object' }
        },
        required: ['pipelineId', 'input']
      }
    }, async (args) => {
      return await this.modelOrchestration.executePipeline(args.pipelineId, args.input);
    });

    // Ensemble Methods Tools
    this.addTool('create_ensemble', {
      description: 'Create an ensemble of multiple models',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          method: { type: 'string', enum: ['voting', 'stacking', 'bagging', 'boosting'] },
          models: { type: 'array', items: { type: 'object' } },
          weights: { type: 'array', items: { type: 'number' } }
        },
        required: ['name', 'method', 'models']
      }
    }, async (args) => {
      return await this.ensembleMethods.createEnsemble(args.name, args.method, args.models, args.weights);
    });

    this.addTool('predict_ensemble', {
      description: 'Make predictions using an ensemble model',
      inputSchema: {
        type: 'object',
        properties: {
          ensembleId: { type: 'string' },
          input: { type: 'object' }
        },
        required: ['ensembleId', 'input']
      }
    }, async (args) => {
      return await this.ensembleMethods.predict(args.ensembleId, args.input);
    });

    // AutoML Tools
    this.addTool('start_automl_experiment', {
      description: 'Start an automated machine learning experiment',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          dataset: { type: 'object' },
          target: { type: 'string' },
          task: { type: 'string', enum: ['classification', 'regression'] },
          timeLimit: { type: 'number' },
          metric: { type: 'string' }
        },
        required: ['name', 'dataset', 'target', 'task']
      }
    }, async (args) => {
      return await this.autoML.createExperiment(args.name, args.dataset, args.target || 'target', args.task, { maxTime: args.timeLimit });
    });

    this.addTool('get_automl_results', {
      description: 'Get results from an AutoML experiment',
      inputSchema: {
        type: 'object',
        properties: {
          experimentId: { type: 'string' }
        },
        required: ['experimentId']
      }
    }, async (args) => {
      return await this.autoML.getExperiment(args.experimentId);
    });

    // Neural Architecture Search Tools
    this.addTool('start_nas_experiment', {
      description: 'Start a neural architecture search experiment',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          searchSpace: { type: 'object' },
          dataset: { type: 'object' },
          budget: { type: 'number' }
        },
        required: ['name', 'searchSpace', 'dataset']
      }
    }, async (args) => {
      return await this.neuralArchSearch.startSearch(args.name, args.searchSpace, 'evolutionary', { objectives: ['accuracy', 'efficiency'] });
    });

    this.addTool('get_architecture_candidates', {
      description: 'Get discovered architecture candidates',
      inputSchema: {
        type: 'object',
        properties: {
          searchId: { type: 'string' },
          topK: { type: 'number', default: 10 }
        },
        required: ['searchId']
      }
    }, async (args) => {
      const experiment = await this.neuralArchSearch.getExperiment(args.searchId);
      return experiment ? experiment.paretoFront.slice(0, args.topK || 10) : [];
    });

    // AI Operations Tools
    this.addTool('register_model', {
      description: 'Register a new model in the AIOps system',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          version: { type: 'string' },
          algorithm: { type: 'string' },
          framework: { type: 'string' },
          author: { type: 'string' },
          artifacts: { type: 'array', items: { type: 'object' } },
          dependencies: { type: 'array', items: { type: 'object' } },
          metrics: { type: 'object' }
        },
        required: ['name', 'version', 'algorithm', 'framework', 'author', 'artifacts', 'dependencies', 'metrics']
      }
    }, async (args) => {
      return await this.aiOperations.registerModel(
        args.name, args.version, args.algorithm, args.framework, 
        args.author, args.artifacts, args.dependencies, args.metrics
      );
    });

    this.addTool('deploy_model', {
      description: 'Deploy a registered model to an environment',
      inputSchema: {
        type: 'object',
        properties: {
          modelId: { type: 'string' },
          environment: { type: 'string', enum: ['development', 'staging', 'production'] },
          configuration: { type: 'object' }
        },
        required: ['modelId', 'environment']
      }
    }, async (args) => {
      return await this.aiOperations.deployModel(args.modelId, args.environment, args.configuration);
    });

    this.addTool('scale_deployment', {
      description: 'Scale a model deployment',
      inputSchema: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' },
          replicas: { type: 'number' }
        },
        required: ['deploymentId', 'replicas']
      }
    }, async (args) => {
      return await this.aiOperations.scaleDeployment(args.deploymentId, args.replicas);
    });

    this.addTool('get_model_metrics', {
      description: 'Get performance metrics for a deployed model',
      inputSchema: {
        type: 'object',
        properties: {
          deploymentId: { type: 'string' },
          timeRange: { type: 'number', default: 3600000 }
        },
        required: ['deploymentId']
      }
    }, async (args) => {
      return await this.aiOperations.getModelMetrics(args.deploymentId, args.timeRange);
    });

    this.addTool('list_deployments', {
      description: 'List all model deployments',
      inputSchema: {
        type: 'object',
        properties: {
          environment: { type: 'string', enum: ['development', 'staging', 'production'] }
        }
      }
    }, async (args) => {
      return await this.aiOperations.listDeployments(args.environment);
    });

    this.addTool('pause_nas_search', {
      description: 'Pause a running neural architecture search',
      inputSchema: {
        type: 'object',
        properties: {
          searchId: { type: 'string' }
        },
        required: ['searchId']
      }
    }, async (args) => {
      return await this.neuralArchSearch.pauseSearch(args.searchId);
    });

    this.addTool('resume_nas_search', {
      description: 'Resume a paused neural architecture search',
      inputSchema: {
        type: 'object',
        properties: {
          searchId: { type: 'string' }
        },
        required: ['searchId']
      }
    }, async (args) => {
      return await this.neuralArchSearch.resumeSearch(args.searchId);
    });

    this.addTool('cancel_automl_experiment', {
      description: 'Cancel a running AutoML experiment',
      inputSchema: {
        type: 'object',
        properties: {
          experimentId: { type: 'string' }
        },
        required: ['experimentId']
      }
    }, async (args) => {
      return await this.autoML.cancelExperiment(args.experimentId);
    });

    this.addTool('deploy_automl_model', {
      description: 'Deploy the best model from an AutoML experiment',
      inputSchema: {
        type: 'object',
        properties: {
          experimentId: { type: 'string' },
          modelId: { type: 'string' }
        },
        required: ['experimentId']
      }
    }, async (args) => {
      return await this.autoML.deployModel(args.experimentId, args.modelId);
    });

    logger.info('All MCP tools registered for AI Integration Server', { totalTools: 16 });
  }

  async start(): Promise<void> {
    try {
      // Components are initialized in constructor
      // Start health monitoring
      this.healthChecker.start();

      logger.info('AI Integration Server started successfully', {
        port: this.config.port,
        components: 5,
        tools: 16
      });
    } catch (error) {
      logger.error('Failed to start AI Integration Server', { error });
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.healthChecker.stop();
      // Services don't have shutdown methods in current implementation
      logger.info('AI Integration Server stopped successfully');
    } catch (error) {
      logger.error('Error during AI Integration Server shutdown', { error });
      throw error;
    }
  }

  async getHealthStatus(): Promise<any> {
    return await this.healthChecker.check();
  }

  getMetrics(): any {
    return {
      orchestration: this.modelOrchestration.getHealthCheck(),
      ensemble: this.ensembleMethods.getHealthCheck(),
      automl: this.autoML.getHealthCheck(),
      nas: this.neuralArchSearch.getHealthCheck(),
      aiops: this.aiOperations.getHealthCheck(),
    };
  }
}

// Export for use in other modules
export default AIIntegrationServer;