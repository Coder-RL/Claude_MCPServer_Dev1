import { EventEmitter } from 'events';
import { createLogger } from '../../../shared/src/logging.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('ModelOrchestration');

export interface ModelConfig {
  id: string;
  type: 'tensorflow' | 'pytorch' | 'sklearn' | 'custom';
  endpoint?: string;
  config: Record<string, any>;
  resources: {
    cpu: number;
    memory: number;
    gpu?: number;
  };
}

export interface Pipeline {
  id: string;
  name: string;
  models: ModelConfig[];
  workflow: PipelineWorkflow;
  status: 'created' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  lastRun?: Date;
  metrics: PipelineMetrics;
}

export interface PipelineWorkflow {
  steps: WorkflowStep[];
  connections: WorkflowConnection[];
  errorHandling: ErrorHandlingStrategy;
}

export interface WorkflowStep {
  id: string;
  modelId: string;
  name: string;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  condition?: string; // JavaScript expression for conditional execution
  timeout: number;
}

export interface WorkflowConnection {
  from: string; // step id
  to: string;   // step id
  dataMapping: Record<string, string>;
}

export interface ErrorHandlingStrategy {
  retryAttempts: number;
  retryDelay: number;
  fallbackModel?: string;
  rollbackOnFailure: boolean;
}

export interface PipelineMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime: number;
  resourceUtilization: {
    cpu: number;
    memory: number;
    gpu?: number;
  };
}

export interface OrchestrationConfig {
  storagePath: string;
  maxConcurrentModels: number;
  defaultTimeout: number;
  resourceLimits: {
    maxCpu: number;
    maxMemory: number;
    maxGpu?: number;
  };
}

export class ModelOrchestrationEngine extends EventEmitter {
  private pipelines: Map<string, Pipeline> = new Map();
  private activeExecutions: Map<string, any> = new Map();
  private models: Map<string, any> = new Map();
  private resourceUsage: Record<string, number> = { cpu: 0, memory: 0, gpu: 0 };

  constructor(private config: OrchestrationConfig) {
    super();
    logger.info('Model Orchestration Engine initialized', {
      maxConcurrentModels: config.maxConcurrentModels,
      storagePath: config.storagePath
    });
  }

  async initialize(): Promise<void> {
    try {
      // Initialize model registry
      await this.loadExistingPipelines();
      
      // Setup resource monitoring
      this.startResourceMonitoring();
      
      logger.info('Model Orchestration Engine ready');
    } catch (error) {
      logger.error('Failed to initialize Model Orchestration Engine', { error });
      throw error;
    }
  }

  async createPipeline(args: {
    name: string;
    models: ModelConfig[];
    workflow: PipelineWorkflow;
  }): Promise<{ pipelineId: string; status: string }> {
    try {
      const pipelineId = uuidv4();
      
      // Validate models and workflow
      await this.validatePipelineConfig(args.models, args.workflow);
      
      const pipeline: Pipeline = {
        id: pipelineId,
        name: args.name,
        models: args.models,
        workflow: args.workflow,
        status: 'created',
        createdAt: new Date(),
        metrics: {
          totalExecutions: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          averageExecutionTime: 0,
          lastExecutionTime: 0,
          resourceUtilization: { cpu: 0, memory: 0 }
        }
      };

      // Register models
      for (const model of args.models) {
        await this.registerModel(model);
      }

      this.pipelines.set(pipelineId, pipeline);
      
      this.emit('pipelineCreated', { pipelineId, name: args.name });
      
      logger.info('Pipeline created successfully', {
        pipelineId,
        name: args.name,
        modelCount: args.models.length,
        stepCount: args.workflow.steps.length
      });

      return {
        pipelineId,
        status: 'created'
      };
    } catch (error) {
      logger.error('Failed to create pipeline', { error, name: args.name });
      throw error;
    }
  }

  async executePipeline(pipelineId: string, input: any): Promise<any> {
    const executionId = uuidv4();
    const startTime = Date.now();

    try {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) {
        throw new Error(`Pipeline ${pipelineId} not found`);
      }

      // Check resource availability
      await this.checkResourceAvailability(pipeline);

      // Update pipeline status
      pipeline.status = 'running';
      
      this.activeExecutions.set(executionId, {
        pipelineId,
        startTime,
        status: 'running'
      });

      logger.info('Starting pipeline execution', {
        pipelineId,
        executionId,
        inputKeys: Object.keys(input)
      });

      // Execute workflow steps
      const result = await this.executeWorkflow(pipeline, input, executionId);

      // Update metrics
      const executionTime = Date.now() - startTime;
      pipeline.metrics.totalExecutions++;
      pipeline.metrics.successfulExecutions++;
      pipeline.metrics.lastExecutionTime = executionTime;
      pipeline.metrics.averageExecutionTime = 
        (pipeline.metrics.averageExecutionTime * (pipeline.metrics.totalExecutions - 1) + executionTime) / 
        pipeline.metrics.totalExecutions;
      pipeline.lastRun = new Date();
      pipeline.status = 'completed';

      this.activeExecutions.delete(executionId);
      
      this.emit('pipelineCompleted', { 
        pipelineId, 
        executionId, 
        executionTime,
        result 
      });

      logger.info('Pipeline execution completed', {
        pipelineId,
        executionId,
        executionTime,
        resultKeys: Object.keys(result)
      });

      return result;
    } catch (error) {
      // Update error metrics
      const pipeline = this.pipelines.get(pipelineId);
      if (pipeline) {
        pipeline.metrics.totalExecutions++;
        pipeline.metrics.failedExecutions++;
        pipeline.status = 'failed';
      }

      this.activeExecutions.delete(executionId);
      
      this.emit('pipelineError', { 
        pipelineId, 
        executionId, 
        error: error.message 
      });

      logger.error('Pipeline execution failed', {
        pipelineId,
        executionId,
        error,
        executionTime: Date.now() - startTime
      });

      throw error;
    }
  }

  private async executeWorkflow(
    pipeline: Pipeline, 
    input: any, 
    executionId: string
  ): Promise<any> {
    const { workflow } = pipeline;
    const stepResults: Map<string, any> = new Map();
    stepResults.set('input', input);

    // Sort steps by dependencies
    const sortedSteps = this.topologicalSort(workflow.steps, workflow.connections);

    for (const step of sortedSteps) {
      try {
        // Check execution condition
        if (step.condition && !this.evaluateCondition(step.condition, stepResults)) {
          logger.debug('Skipping step due to condition', {
            stepId: step.id,
            condition: step.condition
          });
          continue;
        }

        // Prepare step input
        const stepInput = this.mapStepInput(step, stepResults);
        
        // Execute model
        const model = this.models.get(step.modelId);
        if (!model) {
          throw new Error(`Model ${step.modelId} not found`);
        }

        logger.debug('Executing pipeline step', {
          stepId: step.id,
          modelId: step.modelId,
          inputKeys: Object.keys(stepInput)
        });

        const stepResult = await this.executeModelWithTimeout(
          model, 
          stepInput, 
          step.timeout
        );

        // Map step output
        const mappedOutput = this.mapStepOutput(step, stepResult);
        stepResults.set(step.id, mappedOutput);

        this.emit('stepCompleted', {
          pipelineId: pipeline.id,
          executionId,
          stepId: step.id,
          modelId: step.modelId
        });

      } catch (error) {
        // Handle step failure
        await this.handleStepFailure(
          pipeline,
          step,
          error,
          workflow.errorHandling
        );
      }
    }

    // Return final result
    const finalSteps = workflow.steps.filter(step => 
      !workflow.connections.some(conn => conn.from === step.id)
    );
    
    if (finalSteps.length === 1) {
      return stepResults.get(finalSteps[0].id);
    } else {
      // Multiple outputs - return as object
      const result: Record<string, any> = {};
      finalSteps.forEach(step => {
        result[step.name] = stepResults.get(step.id);
      });
      return result;
    }
  }

  private async registerModel(modelConfig: ModelConfig): Promise<void> {
    // Simulate model registration
    const mockModel = {
      id: modelConfig.id,
      type: modelConfig.type,
      config: modelConfig.config,
      resources: modelConfig.resources,
      predict: async (input: any) => {
        // Mock prediction - replace with actual model inference
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));
        return {
          prediction: `${modelConfig.type}_result_${Date.now()}`,
          modelId: modelConfig.id,
          confidence: 0.85 + Math.random() * 0.15,
          processingTime: 100 + Math.random() * 400
        };
      }
    };

    this.models.set(modelConfig.id, mockModel);
    
    // Update resource usage
    this.resourceUsage.cpu += modelConfig.resources.cpu;
    this.resourceUsage.memory += modelConfig.resources.memory;
    if (modelConfig.resources.gpu) {
      this.resourceUsage.gpu += modelConfig.resources.gpu;
    }

    logger.debug('Model registered', {
      modelId: modelConfig.id,
      type: modelConfig.type,
      resources: modelConfig.resources
    });
  }

  private async validatePipelineConfig(
    models: ModelConfig[], 
    workflow: PipelineWorkflow
  ): Promise<void> {
    // Validate models
    if (models.length === 0) {
      throw new Error('Pipeline must have at least one model');
    }

    // Check for duplicate model IDs
    const modelIds = models.map(m => m.id);
    if (new Set(modelIds).size !== modelIds.length) {
      throw new Error('Duplicate model IDs found');
    }

    // Validate workflow steps reference existing models
    for (const step of workflow.steps) {
      if (!models.find(m => m.id === step.modelId)) {
        throw new Error(`Step ${step.id} references non-existent model ${step.modelId}`);
      }
    }

    // Check for workflow cycles
    if (this.hasWorkflowCycles(workflow.steps, workflow.connections)) {
      throw new Error('Workflow contains cycles');
    }

    // Validate resource requirements
    const totalResources = models.reduce((total, model) => ({
      cpu: total.cpu + model.resources.cpu,
      memory: total.memory + model.resources.memory,
      gpu: total.gpu + (model.resources.gpu || 0)
    }), { cpu: 0, memory: 0, gpu: 0 });

    if (totalResources.cpu > this.config.resourceLimits.maxCpu) {
      throw new Error('Pipeline exceeds CPU resource limits');
    }
    if (totalResources.memory > this.config.resourceLimits.maxMemory) {
      throw new Error('Pipeline exceeds memory resource limits');
    }
  }

  private topologicalSort(
    steps: WorkflowStep[], 
    connections: WorkflowConnection[]
  ): WorkflowStep[] {
    const visited = new Set<string>();
    const result: WorkflowStep[] = [];
    const stepMap = new Map(steps.map(step => [step.id, step]));

    const visit = (stepId: string) => {
      if (visited.has(stepId)) return;
      visited.add(stepId);

      // Visit dependencies first
      const dependencies = connections
        .filter(conn => conn.to === stepId)
        .map(conn => conn.from);
        
      dependencies.forEach(depId => visit(depId));

      const step = stepMap.get(stepId);
      if (step) result.push(step);
    };

    steps.forEach(step => visit(step.id));
    return result;
  }

  private mapStepInput(step: WorkflowStep, stepResults: Map<string, any>): any {
    const input: Record<string, any> = {};
    
    for (const [outputKey, inputKey] of Object.entries(step.inputMapping)) {
      // Find source step or input
      let sourceValue;
      for (const [stepId, result] of stepResults.entries()) {
        if (result && typeof result === 'object' && inputKey in result) {
          sourceValue = result[inputKey];
          break;
        }
      }
      input[outputKey] = sourceValue;
    }
    
    return input;
  }

  private mapStepOutput(step: WorkflowStep, result: any): any {
    if (!step.outputMapping || Object.keys(step.outputMapping).length === 0) {
      return result;
    }

    const mappedOutput: Record<string, any> = {};
    for (const [sourceKey, targetKey] of Object.entries(step.outputMapping)) {
      if (result && typeof result === 'object' && sourceKey in result) {
        mappedOutput[targetKey] = result[sourceKey];
      }
    }
    
    return mappedOutput;
  }

  private evaluateCondition(condition: string, stepResults: Map<string, any>): boolean {
    try {
      // Simple condition evaluation - in production, use a safer eval alternative
      const context: Record<string, any> = {};
      stepResults.forEach((value, key) => {
        context[key] = value;
      });
      
      // For demo purposes, assume all conditions pass
      return true;
    } catch (error) {
      logger.warn('Failed to evaluate condition', { condition, error });
      return false;
    }
  }

  private async executeModelWithTimeout(
    model: any, 
    input: any, 
    timeout: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Model execution timeout after ${timeout}ms`));
      }, timeout);

      model.predict(input)
        .then((result: any) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error: any) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async handleStepFailure(
    pipeline: Pipeline,
    step: WorkflowStep,
    error: Error,
    errorHandling: ErrorHandlingStrategy
  ): Promise<void> {
    logger.error('Step execution failed', {
      pipelineId: pipeline.id,
      stepId: step.id,
      modelId: step.modelId,
      error: error.message
    });

    // Implement retry logic, fallback models, etc.
    if (errorHandling.retryAttempts > 0) {
      // Retry logic would go here
    }

    if (errorHandling.fallbackModel) {
      // Fallback model logic would go here
    }

    throw error; // Re-throw for now
  }

  private hasWorkflowCycles(
    steps: WorkflowStep[], 
    connections: WorkflowConnection[]
  ): boolean {
    // Simplified cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (stepId: string): boolean => {
      if (inStack.has(stepId)) return true; // Cycle detected
      if (visited.has(stepId)) return false;

      visited.add(stepId);
      inStack.add(stepId);

      const outgoing = connections.filter(conn => conn.from === stepId);
      for (const conn of outgoing) {
        if (dfs(conn.to)) return true;
      }

      inStack.delete(stepId);
      return false;
    };

    return steps.some(step => dfs(step.id));
  }

  private async checkResourceAvailability(pipeline: Pipeline): Promise<void> {
    const requiredResources = pipeline.models.reduce((total, model) => ({
      cpu: total.cpu + model.resources.cpu,
      memory: total.memory + model.resources.memory,
      gpu: total.gpu + (model.resources.gpu || 0)
    }), { cpu: 0, memory: 0, gpu: 0 });

    if (this.resourceUsage.cpu + requiredResources.cpu > this.config.resourceLimits.maxCpu) {
      throw new Error('Insufficient CPU resources');
    }
    if (this.resourceUsage.memory + requiredResources.memory > this.config.resourceLimits.maxMemory) {
      throw new Error('Insufficient memory resources');
    }
  }

  private async loadExistingPipelines(): Promise<void> {
    // In production, load from persistent storage
    logger.debug('Loading existing pipelines from storage');
  }

  private startResourceMonitoring(): void {
    setInterval(() => {
      this.emit('resourceUpdate', {
        usage: this.resourceUsage,
        limits: this.config.resourceLimits,
        utilization: {
          cpu: this.resourceUsage.cpu / this.config.resourceLimits.maxCpu,
          memory: this.resourceUsage.memory / this.config.resourceLimits.maxMemory,
          gpu: this.resourceUsage.gpu / (this.config.resourceLimits.maxGpu || 1)
        }
      });
    }, 30000); // Every 30 seconds
  }

  // Public API methods
  isHealthy(): boolean {
    return this.pipelines.size >= 0 && this.activeExecutions.size < this.config.maxConcurrentModels;
  }

  getActiveModelCount(): number {
    return this.models.size;
  }

  getActivePipelineCount(): number {
    return Array.from(this.pipelines.values()).filter(p => p.status === 'running').length;
  }

  getPipelines(): Pipeline[] {
    return Array.from(this.pipelines.values());
  }

  getPipeline(pipelineId: string): Pipeline | undefined {
    return this.pipelines.get(pipelineId);
  }

  async deletePipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    if (pipeline.status === 'running') {
      throw new Error('Cannot delete running pipeline');
    }

    this.pipelines.delete(pipelineId);
    
    // Cleanup models if not used by other pipelines
    pipeline.models.forEach(model => {
      const isUsedElsewhere = Array.from(this.pipelines.values())
        .some(p => p.models.some(m => m.id === model.id));
      
      if (!isUsedElsewhere) {
        this.models.delete(model.id);
        this.resourceUsage.cpu -= model.resources.cpu;
        this.resourceUsage.memory -= model.resources.memory;
        if (model.resources.gpu) {
          this.resourceUsage.gpu -= model.resources.gpu;
        }
      }
    });

    logger.info('Pipeline deleted', { pipelineId });
  }

  getMetrics(): any {
    const pipelines = Array.from(this.pipelines.values());
    
    return {
      totalPipelines: pipelines.length,
      activePipelines: pipelines.filter(p => p.status === 'running').length,
      totalModels: this.models.size,
      activeExecutions: this.activeExecutions.size,
      resourceUsage: this.resourceUsage,
      totalExecutions: pipelines.reduce((sum, p) => sum + p.metrics.totalExecutions, 0),
      successRate: pipelines.length > 0 ? 
        pipelines.reduce((sum, p) => sum + p.metrics.successfulExecutions, 0) /
        pipelines.reduce((sum, p) => sum + p.metrics.totalExecutions, 0) : 0,
      averageExecutionTime: pipelines.length > 0 ?
        pipelines.reduce((sum, p) => sum + p.metrics.averageExecutionTime, 0) / pipelines.length : 0
    };
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Model Orchestration Engine');
    
    // Stop all active executions
    for (const [executionId, execution] of this.activeExecutions.entries()) {
      logger.warn('Terminating active execution', { executionId });
      // In production, gracefully terminate executions
    }
    
    this.activeExecutions.clear();
    this.models.clear();
    this.pipelines.clear();
    this.removeAllListeners();
    
    logger.info('Model Orchestration Engine shutdown complete');
  }
}