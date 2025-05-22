import { EventEmitter } from 'events';

export interface DataPipelineDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  owner: string;
  schedule?: PipelineSchedule;
  triggers: PipelineTrigger[];
  stages: PipelineStage[];
  dependencies: string[];
  configuration: PipelineConfiguration;
  resources: ResourceRequirements;
  monitoring: MonitoringConfig;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'active' | 'paused' | 'deprecated';
}

export interface PipelineSchedule {
  type: 'cron' | 'interval' | 'event';
  expression: string;
  timezone: string;
  enabled: boolean;
  startDate?: Date;
  endDate?: Date;
}

export interface PipelineTrigger {
  id: string;
  type: 'schedule' | 'file' | 'database' | 'api' | 'message_queue' | 'manual';
  config: Record<string, any>;
  conditions?: TriggerCondition[];
}

export interface TriggerCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'matches';
  value: any;
}

export interface PipelineStage {
  id: string;
  name: string;
  type: 'extract' | 'transform' | 'load' | 'validate' | 'enrich' | 'analyze' | 'custom';
  config: StageConfiguration;
  inputs: DataInput[];
  outputs: DataOutput[];
  dependencies: string[];
  parallelism: number;
  retryPolicy: RetryPolicy;
  timeout: number;
  resources: StageResources;
}

export interface StageConfiguration {
  processor: string;
  parameters: Record<string, any>;
  environment: Record<string, string>;
  secrets: string[];
  volumes?: VolumeMount[];
}

export interface VolumeMount {
  name: string;
  mountPath: string;
  readOnly: boolean;
}

export interface DataInput {
  name: string;
  type: 'file' | 'database' | 'stream' | 'api' | 'memory';
  source: DataSource;
  schema?: DataSchema;
  validation?: ValidationRule[];
}

export interface DataOutput {
  name: string;
  type: 'file' | 'database' | 'stream' | 'api' | 'memory';
  destination: DataDestination;
  schema?: DataSchema;
  partitioning?: PartitioningStrategy;
}

export interface DataSource {
  type: string;
  connection: string;
  path?: string;
  query?: string;
  parameters?: Record<string, any>;
  credentials?: string;
}

export interface DataDestination {
  type: string;
  connection: string;
  path?: string;
  table?: string;
  parameters?: Record<string, any>;
  credentials?: string;
  writeMode?: 'append' | 'overwrite' | 'merge' | 'update';
}

export interface DataSchema {
  version: string;
  fields: SchemaField[];
  metadata?: Record<string, any>;
}

export interface SchemaField {
  name: string;
  type: 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'timestamp' | 'array' | 'object';
  nullable: boolean;
  description?: string;
  constraints?: FieldConstraint[];
}

export interface FieldConstraint {
  type: 'min' | 'max' | 'regex' | 'enum' | 'unique' | 'foreign_key';
  value: any;
}

export interface ValidationRule {
  type: 'schema' | 'quality' | 'freshness' | 'completeness' | 'custom';
  config: Record<string, any>;
  severity: 'error' | 'warning' | 'info';
}

export interface PartitioningStrategy {
  type: 'hash' | 'range' | 'time' | 'custom';
  columns: string[];
  buckets?: number;
  expression?: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'fixed' | 'exponential' | 'linear';
  initialDelay: number;
  maxDelay: number;
  retryableErrors: string[];
}

export interface StageResources {
  cpu: string;
  memory: string;
  storage?: string;
  gpu?: string;
}

export interface ResourceRequirements {
  compute: {
    cpu: number;
    memory: number;
    storage: number;
  };
  network: {
    bandwidth: number;
    connections: number;
  };
  database: {
    connections: number;
    storage: number;
  };
}

export interface PipelineConfiguration {
  maxConcurrency: number;
  checkpointInterval: number;
  failureHandling: 'stop' | 'skip' | 'retry';
  dataRetention: number;
  compression: boolean;
  encryption: boolean;
  lineage: boolean;
}

export interface MonitoringConfig {
  enabled: boolean;
  metrics: string[];
  alerts: AlertRule[];
  logging: LoggingConfig;
  profiling: boolean;
}

export interface AlertRule {
  name: string;
  metric: string;
  condition: string;
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: string[];
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  structured: boolean;
  retention: number;
  destinations: string[];
}

export interface PipelineExecution {
  id: string;
  pipelineId: string;
  version: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  triggeredBy: string;
  triggerType: string;
  stageExecutions: StageExecution[];
  metrics: ExecutionMetrics;
  errors: ExecutionError[];
  outputs: ExecutionOutput[];
  checkpoints: Checkpoint[];
}

export interface StageExecution {
  stageId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  attempt: number;
  metrics: StageMetrics;
  logs: string[];
  errors: string[];
}

export interface ExecutionMetrics {
  recordsProcessed: number;
  bytesProcessed: number;
  recordsPerSecond: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  networkIO: number;
  customMetrics: Record<string, number>;
}

export interface StageMetrics {
  inputRecords: number;
  outputRecords: number;
  processedBytes: number;
  errorRecords: number;
  processingTime: number;
  resourceUsage: Record<string, number>;
}

export interface ExecutionError {
  stageId?: string;
  type: string;
  message: string;
  stackTrace?: string;
  timestamp: Date;
  context: Record<string, any>;
}

export interface ExecutionOutput {
  name: string;
  location: string;
  size: number;
  recordCount: number;
  schema: DataSchema;
  checksum: string;
}

export interface Checkpoint {
  id: string;
  stageId: string;
  state: Record<string, any>;
  timestamp: Date;
  size: number;
}

export interface DataLineage {
  pipelineId: string;
  executionId: string;
  timestamp: Date;
  inputs: LineageNode[];
  outputs: LineageNode[];
  transformations: LineageTransformation[];
}

export interface LineageNode {
  id: string;
  type: 'dataset' | 'table' | 'file' | 'stream';
  name: string;
  location: string;
  schema: DataSchema;
  metadata: Record<string, any>;
}

export interface LineageTransformation {
  id: string;
  type: string;
  description: string;
  parameters: Record<string, any>;
  inputColumns: string[];
  outputColumns: string[];
}

export class DataPipelineOrchestrator extends EventEmitter {
  private pipelines = new Map<string, DataPipelineDefinition>();
  private executions = new Map<string, PipelineExecution>();
  private activeExecutions = new Map<string, PipelineExecution>();
  private scheduledJobs = new Map<string, NodeJS.Timeout>();
  private processors = new Map<string, DataProcessor>();
  private lineageGraph = new Map<string, DataLineage>();

  constructor() {
    super();
    this.initializeDefaultProcessors();
    this.startScheduler();
    this.startMonitoring();
  }

  // Pipeline Management
  async createPipeline(definition: Omit<DataPipelineDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const pipelineId = this.generateId();
      const pipeline: DataPipelineDefinition = {
        id: pipelineId,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...definition
      };

      // Validate pipeline definition
      await this.validatePipeline(pipeline);

      this.pipelines.set(pipelineId, pipeline);

      // Setup triggers
      if (pipeline.schedule) {
        this.setupSchedule(pipelineId, pipeline.schedule);
      }

      for (const trigger of pipeline.triggers) {
        await this.setupTrigger(pipelineId, trigger);
      }

      this.emit('pipelineCreated', { pipeline });
      return pipelineId;
    } catch (error) {
      this.emit('error', { operation: 'createPipeline', error });
      throw error;
    }
  }

  async updatePipeline(pipelineId: string, updates: Partial<DataPipelineDefinition>): Promise<boolean> {
    try {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) {
        throw new Error(`Pipeline ${pipelineId} not found`);
      }

      Object.assign(pipeline, updates, { updatedAt: new Date() });
      
      // Re-setup schedule if changed
      if (updates.schedule) {
        this.cleanupSchedule(pipelineId);
        this.setupSchedule(pipelineId, updates.schedule);
      }

      this.emit('pipelineUpdated', { pipeline });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'updatePipeline', error });
      return false;
    }
  }

  async deletePipeline(pipelineId: string): Promise<boolean> {
    try {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) {
        return false;
      }

      // Check for active executions
      const activeExecution = this.activeExecutions.get(pipelineId);
      if (activeExecution) {
        throw new Error('Cannot delete pipeline with active execution');
      }

      this.pipelines.delete(pipelineId);
      this.cleanupSchedule(pipelineId);

      this.emit('pipelineDeleted', { pipelineId });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'deletePipeline', error });
      return false;
    }
  }

  async getPipeline(pipelineId: string): Promise<DataPipelineDefinition | undefined> {
    return this.pipelines.get(pipelineId);
  }

  async getPipelines(filters?: {
    owner?: string;
    status?: string;
    tags?: string[];
  }): Promise<DataPipelineDefinition[]> {
    let pipelines = Array.from(this.pipelines.values());

    if (filters) {
      if (filters.owner) {
        pipelines = pipelines.filter(p => p.owner === filters.owner);
      }
      if (filters.status) {
        pipelines = pipelines.filter(p => p.status === filters.status);
      }
      if (filters.tags && filters.tags.length > 0) {
        pipelines = pipelines.filter(p => 
          filters.tags!.some(tag => p.tags.includes(tag))
        );
      }
    }

    return pipelines.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  // Pipeline Execution
  async executePipeline(
    pipelineId: string,
    triggeredBy: string = 'manual',
    parameters?: Record<string, any>
  ): Promise<string> {
    try {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) {
        throw new Error(`Pipeline ${pipelineId} not found`);
      }

      if (pipeline.status !== 'active') {
        throw new Error(`Pipeline ${pipelineId} is not active`);
      }

      const executionId = this.generateId();
      const execution: PipelineExecution = {
        id: executionId,
        pipelineId,
        version: pipeline.version,
        status: 'pending',
        startTime: new Date(),
        triggeredBy,
        triggerType: 'manual',
        stageExecutions: pipeline.stages.map(stage => ({
          stageId: stage.id,
          status: 'pending',
          attempt: 0,
          metrics: {
            inputRecords: 0,
            outputRecords: 0,
            processedBytes: 0,
            errorRecords: 0,
            processingTime: 0,
            resourceUsage: {}
          },
          logs: [],
          errors: []
        })),
        metrics: {
          recordsProcessed: 0,
          bytesProcessed: 0,
          recordsPerSecond: 0,
          cpuUsage: 0,
          memoryUsage: 0,
          diskUsage: 0,
          networkIO: 0,
          customMetrics: {}
        },
        errors: [],
        outputs: [],
        checkpoints: []
      };

      this.executions.set(executionId, execution);
      this.activeExecutions.set(pipelineId, execution);

      this.emit('executionStarted', { execution });

      // Start execution asynchronously
      this.processExecution(execution, pipeline, parameters);

      return executionId;
    } catch (error) {
      this.emit('error', { operation: 'executePipeline', error });
      throw error;
    }
  }

  async stopExecution(executionId: string): Promise<boolean> {
    try {
      const execution = this.executions.get(executionId);
      if (!execution || execution.status !== 'running') {
        return false;
      }

      execution.status = 'cancelled';
      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();

      this.activeExecutions.delete(execution.pipelineId);
      this.emit('executionStopped', { execution });
      
      return true;
    } catch (error) {
      this.emit('error', { operation: 'stopExecution', error });
      return false;
    }
  }

  async getExecution(executionId: string): Promise<PipelineExecution | undefined> {
    return this.executions.get(executionId);
  }

  async getExecutions(
    pipelineId?: string,
    limit: number = 50
  ): Promise<PipelineExecution[]> {
    let executions = Array.from(this.executions.values());

    if (pipelineId) {
      executions = executions.filter(e => e.pipelineId === pipelineId);
    }

    return executions
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit);
  }

  async getActiveExecutions(): Promise<PipelineExecution[]> {
    return Array.from(this.activeExecutions.values());
  }

  // Data Lineage
  async recordLineage(lineage: DataLineage): Promise<void> {
    this.lineageGraph.set(lineage.executionId, lineage);
    this.emit('lineageRecorded', { lineage });
  }

  async getDataLineage(
    datasetId: string,
    direction: 'upstream' | 'downstream' | 'both' = 'both'
  ): Promise<DataLineage[]> {
    const lineages: DataLineage[] = [];
    
    for (const lineage of this.lineageGraph.values()) {
      const hasInput = lineage.inputs.some(input => input.id === datasetId);
      const hasOutput = lineage.outputs.some(output => output.id === datasetId);
      
      if ((direction === 'upstream' && hasOutput) ||
          (direction === 'downstream' && hasInput) ||
          (direction === 'both' && (hasInput || hasOutput))) {
        lineages.push(lineage);
      }
    }

    return lineages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  // Monitoring and Analytics
  async getPipelineMetrics(pipelineId: string, timeRange?: { start: Date; end: Date }): Promise<{
    executionStats: {
      total: number;
      successful: number;
      failed: number;
      avgDuration: number;
    };
    resourceUsage: {
      avgCpu: number;
      avgMemory: number;
      avgStorage: number;
    };
    dataStats: {
      totalRecords: number;
      totalBytes: number;
      avgThroughput: number;
    };
    errorStats: {
      totalErrors: number;
      errorsByType: Record<string, number>;
      errorsByStage: Record<string, number>;
    };
  }> {
    let executions = Array.from(this.executions.values())
      .filter(e => e.pipelineId === pipelineId);

    if (timeRange) {
      executions = executions.filter(e => 
        e.startTime >= timeRange.start && e.startTime <= timeRange.end
      );
    }

    const total = executions.length;
    const successful = executions.filter(e => e.status === 'completed').length;
    const failed = executions.filter(e => e.status === 'failed').length;
    
    const completedExecutions = executions.filter(e => e.duration);
    const avgDuration = completedExecutions.length > 0 
      ? completedExecutions.reduce((sum, e) => sum + (e.duration || 0), 0) / completedExecutions.length 
      : 0;

    const avgCpu = executions.reduce((sum, e) => sum + e.metrics.cpuUsage, 0) / Math.max(total, 1);
    const avgMemory = executions.reduce((sum, e) => sum + e.metrics.memoryUsage, 0) / Math.max(total, 1);
    const avgStorage = executions.reduce((sum, e) => sum + e.metrics.diskUsage, 0) / Math.max(total, 1);

    const totalRecords = executions.reduce((sum, e) => sum + e.metrics.recordsProcessed, 0);
    const totalBytes = executions.reduce((sum, e) => sum + e.metrics.bytesProcessed, 0);
    const avgThroughput = executions.reduce((sum, e) => sum + e.metrics.recordsPerSecond, 0) / Math.max(total, 1);

    const allErrors = executions.flatMap(e => e.errors);
    const totalErrors = allErrors.length;
    
    const errorsByType: Record<string, number> = {};
    const errorsByStage: Record<string, number> = {};
    
    allErrors.forEach(error => {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
      if (error.stageId) {
        errorsByStage[error.stageId] = (errorsByStage[error.stageId] || 0) + 1;
      }
    });

    return {
      executionStats: { total, successful, failed, avgDuration },
      resourceUsage: { avgCpu, avgMemory, avgStorage },
      dataStats: { totalRecords, totalBytes, avgThroughput },
      errorStats: { totalErrors, errorsByType, errorsByStage }
    };
  }

  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    activePipelines: number;
    runningExecutions: number;
    queuedExecutions: number;
    errorRate: number;
    avgLatency: number;
    resourceUtilization: number;
    issues: string[];
  }> {
    const activePipelines = Array.from(this.pipelines.values())
      .filter(p => p.status === 'active').length;
    
    const runningExecutions = Array.from(this.activeExecutions.values())
      .filter(e => e.status === 'running').length;
    
    const queuedExecutions = Array.from(this.activeExecutions.values())
      .filter(e => e.status === 'pending').length;

    // Calculate error rate from last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentExecutions = Array.from(this.executions.values())
      .filter(e => e.startTime > yesterday);
    
    const errorRate = recentExecutions.length > 0 
      ? recentExecutions.filter(e => e.status === 'failed').length / recentExecutions.length 
      : 0;

    const avgLatency = recentExecutions.length > 0
      ? recentExecutions.reduce((sum, e) => sum + (e.duration || 0), 0) / recentExecutions.length
      : 0;

    // Simplified resource utilization
    const resourceUtilization = Math.random() * 0.3 + 0.4; // 40-70%

    const issues: string[] = [];
    if (errorRate > 0.1) issues.push('High error rate detected');
    if (avgLatency > 300000) issues.push('High execution latency detected'); // 5 minutes
    if (resourceUtilization > 0.8) issues.push('High resource utilization');
    if (queuedExecutions > 10) issues.push('High queue backlog');

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (issues.length > 0) {
      status = issues.length > 2 ? 'unhealthy' : 'degraded';
    }

    return {
      status,
      activePipelines,
      runningExecutions,
      queuedExecutions,
      errorRate,
      avgLatency,
      resourceUtilization,
      issues
    };
  }

  // Data Processing
  registerProcessor(name: string, processor: DataProcessor): void {
    this.processors.set(name, processor);
    this.emit('processorRegistered', { name });
  }

  private async processExecution(
    execution: PipelineExecution,
    pipeline: DataPipelineDefinition,
    parameters?: Record<string, any>
  ): Promise<void> {
    try {
      execution.status = 'running';
      this.emit('executionRunning', { execution });

      // Execute stages in dependency order
      const sortedStages = this.topologicalSort(pipeline.stages);
      
      for (const stage of sortedStages) {
        await this.executeStage(execution, stage, pipeline, parameters);
        
        if (execution.status === 'cancelled') {
          break;
        }
      }

      if (execution.status !== 'cancelled') {
        execution.status = 'completed';
      }

      execution.endTime = new Date();
      execution.duration = execution.endTime.getTime() - execution.startTime.getTime();

      this.activeExecutions.delete(pipeline.id);
      this.emit('executionCompleted', { execution });

      // Record data lineage
      if (pipeline.configuration.lineage) {
        await this.generateLineage(execution, pipeline);
      }

    } catch (error) {
      execution.status = 'failed';
      execution.endTime = new Date();
      execution.duration = execution.endTime!.getTime() - execution.startTime.getTime();
      execution.errors.push({
        type: 'ExecutionError',
        message: error.message,
        timestamp: new Date(),
        context: { parameters }
      });

      this.activeExecutions.delete(pipeline.id);
      this.emit('executionFailed', { execution, error });
    }
  }

  private async executeStage(
    execution: PipelineExecution,
    stage: PipelineStage,
    pipeline: DataPipelineDefinition,
    parameters?: Record<string, any>
  ): Promise<void> {
    const stageExecution = execution.stageExecutions.find(s => s.stageId === stage.id)!;
    
    try {
      stageExecution.status = 'running';
      stageExecution.startTime = new Date();
      stageExecution.attempt++;

      this.emit('stageStarted', { execution, stage, stageExecution });

      const processor = this.processors.get(stage.config.processor);
      if (!processor) {
        throw new Error(`Processor ${stage.config.processor} not found`);
      }

      // Prepare stage context
      const context: StageContext = {
        execution,
        stage,
        pipeline,
        parameters: { ...stage.config.parameters, ...parameters },
        inputs: stage.inputs,
        outputs: stage.outputs
      };

      // Execute stage with timeout
      const result = await this.executeWithTimeout(
        () => processor.process(context),
        stage.timeout
      );

      // Update metrics
      stageExecution.metrics = result.metrics;
      stageExecution.logs.push(...result.logs);

      stageExecution.status = 'completed';
      stageExecution.endTime = new Date();
      stageExecution.duration = stageExecution.endTime.getTime() - stageExecution.startTime!.getTime();

      this.emit('stageCompleted', { execution, stage, stageExecution });

    } catch (error) {
      stageExecution.status = 'failed';
      stageExecution.endTime = new Date();
      stageExecution.duration = stageExecution.endTime.getTime() - stageExecution.startTime!.getTime();
      stageExecution.errors.push(error.message);

      execution.errors.push({
        stageId: stage.id,
        type: error.constructor.name,
        message: error.message,
        stackTrace: error.stack,
        timestamp: new Date(),
        context: { stage: stage.name }
      });

      // Handle stage failure based on retry policy
      if (stageExecution.attempt < stage.retryPolicy.maxAttempts) {
        const delay = this.calculateRetryDelay(stageExecution.attempt, stage.retryPolicy);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry stage
        await this.executeStage(execution, stage, pipeline, parameters);
      } else {
        this.emit('stageFailed', { execution, stage, stageExecution, error });
        
        if (pipeline.configuration.failureHandling === 'stop') {
          throw error;
        }
      }
    }
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);

      fn()
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private calculateRetryDelay(attempt: number, retryPolicy: RetryPolicy): number {
    const { backoffStrategy, initialDelay, maxDelay } = retryPolicy;
    
    let delay = initialDelay;
    
    switch (backoffStrategy) {
      case 'exponential':
        delay = initialDelay * Math.pow(2, attempt - 1);
        break;
      case 'linear':
        delay = initialDelay * attempt;
        break;
      case 'fixed':
      default:
        delay = initialDelay;
        break;
    }

    return Math.min(delay, maxDelay);
  }

  private topologicalSort(stages: PipelineStage[]): PipelineStage[] {
    const visited = new Set<string>();
    const sorted: PipelineStage[] = [];
    
    const visit = (stage: PipelineStage) => {
      if (visited.has(stage.id)) return;
      visited.add(stage.id);
      
      // Visit dependencies first
      for (const depId of stage.dependencies) {
        const depStage = stages.find(s => s.id === depId);
        if (depStage) {
          visit(depStage);
        }
      }
      
      sorted.push(stage);
    };

    stages.forEach(stage => visit(stage));
    return sorted;
  }

  private async validatePipeline(pipeline: DataPipelineDefinition): Promise<void> {
    // Validate stages have required processors
    for (const stage of pipeline.stages) {
      if (!this.processors.has(stage.config.processor)) {
        throw new Error(`Unknown processor: ${stage.config.processor}`);
      }
    }

    // Validate dependencies
    const stageIds = new Set(pipeline.stages.map(s => s.id));
    for (const stage of pipeline.stages) {
      for (const depId of stage.dependencies) {
        if (!stageIds.has(depId)) {
          throw new Error(`Invalid dependency: ${depId} for stage ${stage.id}`);
        }
      }
    }

    // Check for circular dependencies
    if (this.hasCircularDependencies(pipeline.stages)) {
      throw new Error('Circular dependencies detected');
    }
  }

  private hasCircularDependencies(stages: PipelineStage[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (stageId: string): boolean => {
      if (recursionStack.has(stageId)) return true;
      if (visited.has(stageId)) return false;

      visited.add(stageId);
      recursionStack.add(stageId);

      const stage = stages.find(s => s.id === stageId);
      if (stage) {
        for (const depId of stage.dependencies) {
          if (hasCycle(depId)) return true;
        }
      }

      recursionStack.delete(stageId);
      return false;
    };

    for (const stage of stages) {
      if (hasCycle(stage.id)) return true;
    }

    return false;
  }

  private setupSchedule(pipelineId: string, schedule: PipelineSchedule): void {
    if (!schedule.enabled) return;

    let interval: number;
    
    if (schedule.type === 'interval') {
      interval = this.parseInterval(schedule.expression);
    } else if (schedule.type === 'cron') {
      // Simplified cron parsing - in production use proper cron library
      interval = 60000; // Default 1 minute
    } else {
      return;
    }

    const job = setInterval(() => {
      this.executePipeline(pipelineId, 'scheduler');
    }, interval);

    this.scheduledJobs.set(pipelineId, job);
  }

  private cleanupSchedule(pipelineId: string): void {
    const job = this.scheduledJobs.get(pipelineId);
    if (job) {
      clearInterval(job);
      this.scheduledJobs.delete(pipelineId);
    }
  }

  private async setupTrigger(pipelineId: string, trigger: PipelineTrigger): Promise<void> {
    // Setup trigger based on type
    this.emit('triggerSetup', { pipelineId, trigger });
  }

  private parseInterval(expression: string): number {
    const match = expression.match(/(\d+)\s*(s|m|h|d)/);
    if (!match) return 60000; // Default 1 minute

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 60000;
    }
  }

  private async generateLineage(
    execution: PipelineExecution,
    pipeline: DataPipelineDefinition
  ): Promise<void> {
    const lineage: DataLineage = {
      pipelineId: pipeline.id,
      executionId: execution.id,
      timestamp: new Date(),
      inputs: [],
      outputs: [],
      transformations: []
    };

    // Extract lineage from stage configurations
    for (const stage of pipeline.stages) {
      // Add inputs and outputs based on stage configuration
      // This would be more sophisticated in a real implementation
    }

    await this.recordLineage(lineage);
  }

  private startScheduler(): void {
    // Scheduler is started when pipelines are created
  }

  private startMonitoring(): void {
    setInterval(() => {
      this.collectMetrics();
    }, 30000); // Every 30 seconds
  }

  private collectMetrics(): void {
    for (const execution of this.activeExecutions.values()) {
      // Update execution metrics
      execution.metrics.cpuUsage = Math.random() * 100;
      execution.metrics.memoryUsage = Math.random() * 100;
      execution.metrics.diskUsage = Math.random() * 100;
      execution.metrics.networkIO = Math.random() * 1000000;
    }
  }

  private initializeDefaultProcessors(): void {
    // Register built-in processors
    this.registerProcessor('extract_csv', new CSVExtractProcessor());
    this.registerProcessor('transform_filter', new FilterTransformProcessor());
    this.registerProcessor('load_database', new DatabaseLoadProcessor());
    this.registerProcessor('validate_schema', new SchemaValidationProcessor());
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

// Processor Interfaces and Implementations
export interface DataProcessor {
  process(context: StageContext): Promise<ProcessResult>;
}

export interface StageContext {
  execution: PipelineExecution;
  stage: PipelineStage;
  pipeline: DataPipelineDefinition;
  parameters: Record<string, any>;
  inputs: DataInput[];
  outputs: DataOutput[];
}

export interface ProcessResult {
  metrics: StageMetrics;
  logs: string[];
  outputs?: any[];
}

class CSVExtractProcessor implements DataProcessor {
  async process(context: StageContext): Promise<ProcessResult> {
    const { stage, parameters } = context;
    
    // Simulate CSV extraction
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      metrics: {
        inputRecords: 0,
        outputRecords: 1000,
        processedBytes: 50000,
        errorRecords: 0,
        processingTime: 1000,
        resourceUsage: { cpu: 20, memory: 100 }
      },
      logs: ['CSV extraction completed', `Processed file: ${parameters.file_path}`]
    };
  }
}

class FilterTransformProcessor implements DataProcessor {
  async process(context: StageContext): Promise<ProcessResult> {
    const { parameters } = context;
    
    // Simulate filtering
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      metrics: {
        inputRecords: 1000,
        outputRecords: 800,
        processedBytes: 40000,
        errorRecords: 0,
        processingTime: 500,
        resourceUsage: { cpu: 15, memory: 50 }
      },
      logs: ['Filter transformation completed', `Applied filter: ${parameters.condition}`]
    };
  }
}

class DatabaseLoadProcessor implements DataProcessor {
  async process(context: StageContext): Promise<ProcessResult> {
    const { parameters } = context;
    
    // Simulate database loading
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      metrics: {
        inputRecords: 800,
        outputRecords: 800,
        processedBytes: 40000,
        errorRecords: 0,
        processingTime: 2000,
        resourceUsage: { cpu: 30, memory: 200 }
      },
      logs: ['Database load completed', `Loaded to table: ${parameters.table_name}`]
    };
  }
}

class SchemaValidationProcessor implements DataProcessor {
  async process(context: StageContext): Promise<ProcessResult> {
    // Simulate schema validation
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return {
      metrics: {
        inputRecords: 1000,
        outputRecords: 995,
        processedBytes: 50000,
        errorRecords: 5,
        processingTime: 300,
        resourceUsage: { cpu: 10, memory: 30 }
      },
      logs: ['Schema validation completed', '5 records failed validation']
    };
  }
}