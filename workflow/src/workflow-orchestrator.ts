import { EventEmitter } from 'events';
import { WorkflowEngine, WorkflowDefinition, WorkflowExecution } from './workflow-engine.js';

export interface WorkflowTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  template: WorkflowDefinition;
  parameters: TemplateParameter[];
  examples: WorkflowExample[];
  documentation: string;
}

export interface TemplateParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  defaultValue?: any;
  validation?: ParameterValidation;
}

export interface ParameterValidation {
  pattern?: string;
  min?: number;
  max?: number;
  enum?: any[];
}

export interface WorkflowExample {
  name: string;
  description: string;
  inputs: Record<string, any>;
  expectedOutputs: Record<string, any>;
}

export interface WorkflowLibrary {
  templates: Map<string, WorkflowTemplate>;
  categories: string[];
  tags: string[];
}

export interface WorkflowSchedule {
  id: string;
  workflowId: string;
  name: string;
  schedule: string;
  inputs: Record<string, any>;
  enabled: boolean;
  lastRun?: Date;
  nextRun?: Date;
  executionHistory: string[];
}

export interface WorkflowPipeline {
  id: string;
  name: string;
  description: string;
  workflows: PipelineWorkflow[];
  triggers: PipelineTrigger[];
  variables: Record<string, any>;
  errorHandling: PipelineErrorHandling;
}

export interface PipelineWorkflow {
  id: string;
  workflowId: string;
  name: string;
  dependsOn: string[];
  condition?: string;
  inputMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  parallel: boolean;
}

export interface PipelineTrigger {
  type: 'manual' | 'scheduled' | 'event' | 'api';
  config: Record<string, any>;
}

export interface PipelineErrorHandling {
  strategy: 'fail' | 'continue' | 'retry';
  maxRetries: number;
  notifyOnFailure: boolean;
}

export interface WorkflowOrchestrationMetrics {
  totalWorkflows: number;
  activeExecutions: number;
  queuedExecutions: number;
  completedToday: number;
  failedToday: number;
  averageExecutionTime: number;
  resourceUtilization: ResourceUtilization;
  topWorkflows: TopWorkflow[];
}

export interface ResourceUtilization {
  cpu: number;
  memory: number;
  storage: number;
  network: number;
}

export interface TopWorkflow {
  workflowId: string;
  name: string;
  executionCount: number;
  successRate: number;
  averageDuration: number;
}

export class WorkflowOrchestrator extends EventEmitter {
  private workflowEngine: WorkflowEngine;
  private library: WorkflowLibrary;
  private schedules = new Map<string, WorkflowSchedule>();
  private pipelines = new Map<string, WorkflowPipeline>();
  private executionQueue: QueuedExecution[] = [];
  private activeExecutions = new Map<string, WorkflowExecution>();
  private maxConcurrentExecutions = 10;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.workflowEngine = new WorkflowEngine();
    this.library = {
      templates: new Map(),
      categories: [],
      tags: []
    };
    
    this.setupEventHandlers();
    this.initializeBuiltInTemplates();
    this.startScheduler();
  }

  async registerWorkflowTemplate(template: WorkflowTemplate): Promise<boolean> {
    try {
      // Validate template
      const validation = this.validateTemplate(template);
      if (!validation.valid) {
        this.emit('error', { operation: 'registerTemplate', error: validation.error });
        return false;
      }

      this.library.templates.set(template.id, template);
      
      // Update categories and tags
      if (!this.library.categories.includes(template.category)) {
        this.library.categories.push(template.category);
      }
      
      template.tags.forEach(tag => {
        if (!this.library.tags.includes(tag)) {
          this.library.tags.push(tag);
        }
      });

      this.emit('templateRegistered', { template });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'registerTemplate', error });
      return false;
    }
  }

  async createWorkflowFromTemplate(
    templateId: string,
    parameters: Record<string, any>,
    name?: string
  ): Promise<WorkflowDefinition | null> {
    try {
      const template = this.library.templates.get(templateId);
      if (!template) {
        throw new Error(`Template ${templateId} not found`);
      }

      // Validate parameters
      const paramValidation = this.validateTemplateParameters(template, parameters);
      if (!paramValidation.valid) {
        throw new Error(`Parameter validation failed: ${paramValidation.error}`);
      }

      // Create workflow from template
      const workflow = this.instantiateTemplate(template, parameters, name);
      
      // Register workflow with engine
      const registered = await this.workflowEngine.registerWorkflow(workflow);
      if (!registered) {
        throw new Error('Failed to register workflow with engine');
      }

      this.emit('workflowCreatedFromTemplate', { templateId, workflow, parameters });
      return workflow;
    } catch (error) {
      this.emit('error', { operation: 'createWorkflowFromTemplate', error });
      return null;
    }
  }

  async scheduleWorkflow(schedule: Omit<WorkflowSchedule, 'id' | 'executionHistory'>): Promise<string> {
    try {
      const scheduleId = this.generateId();
      const workflowSchedule: WorkflowSchedule = {
        id: scheduleId,
        ...schedule,
        executionHistory: []
      };

      workflowSchedule.nextRun = this.calculateNextRun(schedule.schedule);
      
      this.schedules.set(scheduleId, workflowSchedule);
      this.emit('workflowScheduled', { schedule: workflowSchedule });
      
      return scheduleId;
    } catch (error) {
      this.emit('error', { operation: 'scheduleWorkflow', error });
      throw error;
    }
  }

  async createPipeline(pipeline: Omit<WorkflowPipeline, 'id'>): Promise<string> {
    try {
      const pipelineId = this.generateId();
      const workflowPipeline: WorkflowPipeline = {
        id: pipelineId,
        ...pipeline
      };

      // Validate pipeline
      const validation = this.validatePipeline(workflowPipeline);
      if (!validation.valid) {
        throw new Error(`Pipeline validation failed: ${validation.error}`);
      }

      this.pipelines.set(pipelineId, workflowPipeline);
      this.emit('pipelineCreated', { pipeline: workflowPipeline });
      
      return pipelineId;
    } catch (error) {
      this.emit('error', { operation: 'createPipeline', error });
      throw error;
    }
  }

  async executePipeline(pipelineId: string, inputs: Record<string, any> = {}): Promise<string> {
    try {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) {
        throw new Error(`Pipeline ${pipelineId} not found`);
      }

      const executionId = this.generateId();
      this.emit('pipelineExecutionStarted', { pipelineId, executionId, inputs });

      // Execute pipeline workflows in dependency order
      await this.executePipelineWorkflows(pipeline, inputs, executionId);

      return executionId;
    } catch (error) {
      this.emit('error', { operation: 'executePipeline', error });
      throw error;
    }
  }

  async queueWorkflowExecution(
    workflowId: string,
    inputs: Record<string, any> = {},
    priority: number = 0
  ): Promise<string> {
    const queuedExecution: QueuedExecution = {
      id: this.generateId(),
      workflowId,
      inputs,
      priority,
      queuedAt: new Date()
    };

    this.executionQueue.push(queuedExecution);
    this.executionQueue.sort((a, b) => b.priority - a.priority);
    
    this.emit('executionQueued', { queuedExecution });
    
    // Try to process queue
    this.processExecutionQueue();
    
    return queuedExecution.id;
  }

  async getWorkflowTemplates(
    category?: string,
    tags?: string[],
    difficulty?: string
  ): Promise<WorkflowTemplate[]> {
    let templates = Array.from(this.library.templates.values());

    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    if (tags && tags.length > 0) {
      templates = templates.filter(t => 
        tags.some(tag => t.tags.includes(tag))
      );
    }

    if (difficulty) {
      templates = templates.filter(t => t.difficulty === difficulty);
    }

    return templates;
  }

  async getOrchestrationMetrics(): Promise<WorkflowOrchestrationMetrics> {
    const totalWorkflows = this.library.templates.size;
    const activeExecutions = this.activeExecutions.size;
    const queuedExecutions = this.executionQueue.length;

    // Get today's metrics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayExecutions = await this.getTodayExecutions(today);
    const completedToday = todayExecutions.filter(e => e.status === 'completed').length;
    const failedToday = todayExecutions.filter(e => e.status === 'failed').length;
    
    const averageExecutionTime = this.calculateAverageExecutionTime(todayExecutions);
    const resourceUtilization = await this.getResourceUtilization();
    const topWorkflows = await this.getTopWorkflows();

    return {
      totalWorkflows,
      activeExecutions,
      queuedExecutions,
      completedToday,
      failedToday,
      averageExecutionTime,
      resourceUtilization,
      topWorkflows
    };
  }

  async pauseAllSchedules(): Promise<void> {
    for (const schedule of this.schedules.values()) {
      schedule.enabled = false;
    }
    this.emit('allSchedulesPaused');
  }

  async resumeAllSchedules(): Promise<void> {
    for (const schedule of this.schedules.values()) {
      schedule.enabled = true;
      schedule.nextRun = this.calculateNextRun(schedule.schedule);
    }
    this.emit('allSchedulesResumed');
  }

  private async processExecutionQueue(): Promise<void> {
    while (this.executionQueue.length > 0 && 
           this.activeExecutions.size < this.maxConcurrentExecutions) {
      
      const queuedExecution = this.executionQueue.shift()!;
      
      try {
        const executionId = await this.workflowEngine.executeWorkflow(
          queuedExecution.workflowId,
          queuedExecution.inputs,
          'queued'
        );

        const execution = await this.workflowEngine.getExecution(executionId);
        if (execution) {
          this.activeExecutions.set(executionId, execution);
        }

        this.emit('executionStartedFromQueue', { 
          queuedExecutionId: queuedExecution.id,
          executionId 
        });
      } catch (error) {
        this.emit('queuedExecutionFailed', { 
          queuedExecution, 
          error 
        });
      }
    }
  }

  private async executePipelineWorkflows(
    pipeline: WorkflowPipeline,
    inputs: Record<string, any>,
    executionId: string
  ): Promise<void> {
    const workflowResults = new Map<string, any>();
    const executedWorkflows = new Set<string>();
    const pendingWorkflows = [...pipeline.workflows];

    while (pendingWorkflows.length > 0) {
      const readyWorkflows = pendingWorkflows.filter(wf => 
        wf.dependsOn.every(dep => executedWorkflows.has(dep))
      );

      if (readyWorkflows.length === 0) {
        throw new Error('Circular dependency detected in pipeline');
      }

      // Group parallel workflows
      const parallelGroups = this.groupParallelWorkflows(readyWorkflows);
      
      for (const group of parallelGroups) {
        if (group.length === 1) {
          // Execute single workflow
          const result = await this.executePipelineWorkflow(
            group[0], 
            pipeline, 
            inputs, 
            workflowResults
          );
          workflowResults.set(group[0].id, result);
          executedWorkflows.add(group[0].id);
        } else {
          // Execute parallel workflows
          const results = await Promise.allSettled(
            group.map(wf => this.executePipelineWorkflow(wf, pipeline, inputs, workflowResults))
          );
          
          group.forEach((wf, index) => {
            const result = results[index];
            if (result.status === 'fulfilled') {
              workflowResults.set(wf.id, result.value);
              executedWorkflows.add(wf.id);
            } else {
              throw new Error(`Pipeline workflow ${wf.id} failed: ${result.reason}`);
            }
          });
        }
      }

      // Remove executed workflows from pending list
      for (const wf of readyWorkflows) {
        const index = pendingWorkflows.indexOf(wf);
        if (index !== -1) {
          pendingWorkflows.splice(index, 1);
        }
      }
    }

    this.emit('pipelineExecutionCompleted', { 
      pipelineId: pipeline.id, 
      executionId, 
      results: Object.fromEntries(workflowResults) 
    });
  }

  private async executePipelineWorkflow(
    pipelineWorkflow: PipelineWorkflow,
    pipeline: WorkflowPipeline,
    pipelineInputs: Record<string, any>,
    workflowResults: Map<string, any>
  ): Promise<any> {
    // Prepare workflow inputs
    const workflowInputs = this.mapPipelineInputs(
      pipelineWorkflow,
      pipelineInputs,
      workflowResults
    );

    // Check condition if specified
    if (pipelineWorkflow.condition) {
      const conditionMet = this.evaluatePipelineCondition(
        pipelineWorkflow.condition,
        { ...pipelineInputs, ...Object.fromEntries(workflowResults) }
      );
      
      if (!conditionMet) {
        return { skipped: true, reason: 'Condition not met' };
      }
    }

    // Execute workflow
    const executionId = await this.workflowEngine.executeWorkflow(
      pipelineWorkflow.workflowId,
      workflowInputs,
      'pipeline'
    );

    // Wait for completion
    const execution = await this.waitForExecution(executionId);
    
    // Map outputs
    const mappedOutputs = this.mapPipelineOutputs(
      pipelineWorkflow,
      execution.outputs
    );

    return { executionId, outputs: mappedOutputs, execution };
  }

  private mapPipelineInputs(
    pipelineWorkflow: PipelineWorkflow,
    pipelineInputs: Record<string, any>,
    workflowResults: Map<string, any>
  ): Record<string, any> {
    const inputs: Record<string, any> = {};
    
    for (const [key, mapping] of Object.entries(pipelineWorkflow.inputMapping)) {
      if (mapping.startsWith('pipeline.')) {
        const inputKey = mapping.substring(9);
        inputs[key] = pipelineInputs[inputKey];
      } else if (mapping.includes('.')) {
        const [workflowId, outputKey] = mapping.split('.');
        const workflowResult = workflowResults.get(workflowId);
        if (workflowResult?.outputs) {
          inputs[key] = workflowResult.outputs[outputKey];
        }
      }
    }

    return inputs;
  }

  private mapPipelineOutputs(
    pipelineWorkflow: PipelineWorkflow,
    workflowOutputs: Record<string, any>
  ): Record<string, any> {
    const outputs: Record<string, any> = {};
    
    for (const [key, mapping] of Object.entries(pipelineWorkflow.outputMapping)) {
      outputs[mapping] = workflowOutputs[key];
    }

    return outputs;
  }

  private groupParallelWorkflows(workflows: PipelineWorkflow[]): PipelineWorkflow[][] {
    const parallelGroups: PipelineWorkflow[][] = [];
    const processed = new Set<string>();

    for (const workflow of workflows) {
      if (processed.has(workflow.id)) continue;

      if (workflow.parallel) {
        const parallelGroup = workflows.filter(wf => 
          wf.parallel && !processed.has(wf.id)
        );
        parallelGroups.push(parallelGroup);
        parallelGroup.forEach(wf => processed.add(wf.id));
      } else {
        parallelGroups.push([workflow]);
        processed.add(workflow.id);
      }
    }

    return parallelGroups;
  }

  private evaluatePipelineCondition(
    condition: string,
    context: Record<string, any>
  ): boolean {
    try {
      // Simple condition evaluation - in production use proper expression parser
      let expression = condition;
      for (const [key, value] of Object.entries(context)) {
        expression = expression.replace(
          new RegExp(`\\b${key}\\b`, 'g'),
          JSON.stringify(value)
        );
      }
      return eval(expression) === true;
    } catch {
      return false;
    }
  }

  private async waitForExecution(executionId: string): Promise<WorkflowExecution> {
    return new Promise((resolve, reject) => {
      const checkExecution = async () => {
        const execution = await this.workflowEngine.getExecution(executionId);
        if (!execution) {
          reject(new Error(`Execution ${executionId} not found`));
          return;
        }

        if (['completed', 'failed', 'cancelled'].includes(execution.status)) {
          resolve(execution);
        } else {
          setTimeout(checkExecution, 1000); // Check every second
        }
      };

      checkExecution();
    });
  }

  private validateTemplate(template: WorkflowTemplate): { valid: boolean; error?: string } {
    if (!template.id || !template.name || !template.template) {
      return { valid: false, error: 'Missing required template fields' };
    }

    // Validate template parameters
    for (const param of template.parameters) {
      if (!param.name || !param.type) {
        return { valid: false, error: 'Invalid parameter definition' };
      }
    }

    return { valid: true };
  }

  private validateTemplateParameters(
    template: WorkflowTemplate,
    parameters: Record<string, any>
  ): { valid: boolean; error?: string } {
    for (const param of template.parameters) {
      if (param.required && !(param.name in parameters)) {
        return { valid: false, error: `Required parameter ${param.name} missing` };
      }

      if (param.name in parameters) {
        const value = parameters[param.name];
        const validation = this.validateParameterValue(param, value);
        if (!validation.valid) {
          return validation;
        }
      }
    }

    return { valid: true };
  }

  private validateParameterValue(
    param: TemplateParameter,
    value: any
  ): { valid: boolean; error?: string } {
    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== param.type) {
      return { valid: false, error: `Parameter ${param.name} must be of type ${param.type}` };
    }

    // Additional validation
    if (param.validation) {
      const { pattern, min, max, enum: enumValues } = param.validation;
      
      if (pattern && typeof value === 'string' && !new RegExp(pattern).test(value)) {
        return { valid: false, error: `Parameter ${param.name} does not match pattern` };
      }

      if (min !== undefined && value < min) {
        return { valid: false, error: `Parameter ${param.name} is below minimum value` };
      }

      if (max !== undefined && value > max) {
        return { valid: false, error: `Parameter ${param.name} is above maximum value` };
      }

      if (enumValues && !enumValues.includes(value)) {
        return { valid: false, error: `Parameter ${param.name} is not a valid enum value` };
      }
    }

    return { valid: true };
  }

  private validatePipeline(pipeline: WorkflowPipeline): { valid: boolean; error?: string } {
    if (!pipeline.name || !pipeline.workflows.length) {
      return { valid: false, error: 'Pipeline must have name and workflows' };
    }

    // Check for circular dependencies
    const graph = new Map<string, string[]>();
    for (const wf of pipeline.workflows) {
      graph.set(wf.id, wf.dependsOn);
    }

    if (this.hasCyclicDependency(graph)) {
      return { valid: false, error: 'Circular dependency detected in pipeline' };
    }

    return { valid: true };
  }

  private hasCyclicDependency(graph: Map<string, string[]>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string): boolean => {
      if (recursionStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recursionStack.add(node);

      const dependencies = graph.get(node) || [];
      for (const dep of dependencies) {
        if (dfs(dep)) return true;
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (dfs(node)) return true;
    }

    return false;
  }

  private instantiateTemplate(
    template: WorkflowTemplate,
    parameters: Record<string, any>,
    name?: string
  ): WorkflowDefinition {
    const workflow = JSON.parse(JSON.stringify(template.template));
    workflow.id = this.generateId();
    workflow.name = name || `${template.name} - ${new Date().toISOString()}`;

    // Replace parameter placeholders
    const workflowStr = JSON.stringify(workflow);
    let updatedWorkflowStr = workflowStr;

    for (const param of template.parameters) {
      const value = parameters[param.name] ?? param.defaultValue;
      const placeholder = `{{${param.name}}}`;
      updatedWorkflowStr = updatedWorkflowStr.replace(
        new RegExp(placeholder, 'g'),
        JSON.stringify(value)
      );
    }

    return JSON.parse(updatedWorkflowStr);
  }

  private calculateNextRun(schedule: string): Date {
    // Simplified schedule calculation - in production use proper cron parser
    const now = new Date();
    const match = schedule.match(/every (\d+) (minute|hour|day)s?/);
    
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      
      switch (unit) {
        case 'minute':
          return new Date(now.getTime() + value * 60 * 1000);
        case 'hour':
          return new Date(now.getTime() + value * 60 * 60 * 1000);
        case 'day':
          return new Date(now.getTime() + value * 24 * 60 * 60 * 1000);
      }
    }

    // Default to 1 hour
    return new Date(now.getTime() + 60 * 60 * 1000);
  }

  private async getTodayExecutions(today: Date): Promise<WorkflowExecution[]> {
    // This would query the execution history
    return [];
  }

  private calculateAverageExecutionTime(executions: WorkflowExecution[]): number {
    const completed = executions.filter(e => e.duration);
    if (completed.length === 0) return 0;
    
    const total = completed.reduce((sum, e) => sum + (e.duration || 0), 0);
    return total / completed.length;
  }

  private async getResourceUtilization(): Promise<ResourceUtilization> {
    // This would integrate with system monitoring
    return {
      cpu: Math.random() * 100,
      memory: Math.random() * 100,
      storage: Math.random() * 100,
      network: Math.random() * 100
    };
  }

  private async getTopWorkflows(): Promise<TopWorkflow[]> {
    // This would analyze execution metrics
    return [];
  }

  private setupEventHandlers(): void {
    this.workflowEngine.on('executionCompleted', (data) => {
      this.activeExecutions.delete(data.execution.id);
      this.processExecutionQueue();
    });

    this.workflowEngine.on('executionFailed', (data) => {
      this.activeExecutions.delete(data.execution.id);
      this.processExecutionQueue();
    });

    this.workflowEngine.on('executionCancelled', (data) => {
      this.activeExecutions.delete(data.execution.id);
      this.processExecutionQueue();
    });
  }

  private startScheduler(): void {
    this.schedulerInterval = setInterval(() => {
      this.processSchedules();
    }, 60 * 1000); // Check every minute
  }

  private async processSchedules(): Promise<void> {
    const now = new Date();
    
    for (const schedule of this.schedules.values()) {
      if (schedule.enabled && schedule.nextRun && schedule.nextRun <= now) {
        try {
          const executionId = await this.workflowEngine.executeWorkflow(
            schedule.workflowId,
            schedule.inputs,
            'scheduled'
          );

          schedule.lastRun = now;
          schedule.nextRun = this.calculateNextRun(schedule.schedule);
          schedule.executionHistory.push(executionId);

          // Keep only last 100 executions
          if (schedule.executionHistory.length > 100) {
            schedule.executionHistory = schedule.executionHistory.slice(-100);
          }

          this.emit('scheduledExecutionStarted', { schedule, executionId });
        } catch (error) {
          this.emit('scheduledExecutionFailed', { schedule, error });
        }
      }
    }
  }

  private initializeBuiltInTemplates(): void {
    // Initialize common workflow templates
    const templates: WorkflowTemplate[] = [
      {
        id: 'data-processing',
        name: 'Data Processing Pipeline',
        category: 'Data',
        description: 'Process and transform data files',
        tags: ['data', 'etl', 'processing'],
        difficulty: 'intermediate',
        template: {
          id: 'template',
          name: 'Data Processing',
          version: '1.0',
          triggers: [],
          steps: [
            {
              id: 'extract',
              name: 'Extract Data',
              type: 'action',
              config: { action: 'extract', source: '{{source}}' }
            },
            {
              id: 'transform',
              name: 'Transform Data',
              type: 'action',
              config: { action: 'transform', rules: '{{transformRules}}' }
            },
            {
              id: 'load',
              name: 'Load Data',
              type: 'action',
              config: { action: 'load', destination: '{{destination}}' }
            }
          ],
          variables: {}
        },
        parameters: [
          {
            name: 'source',
            type: 'string',
            required: true,
            description: 'Data source location'
          },
          {
            name: 'destination',
            type: 'string',
            required: true,
            description: 'Data destination location'
          },
          {
            name: 'transformRules',
            type: 'object',
            required: false,
            description: 'Data transformation rules',
            defaultValue: {}
          }
        ],
        examples: [
          {
            name: 'CSV Processing',
            description: 'Process CSV file from S3 to database',
            inputs: {
              source: 's3://bucket/data.csv',
              destination: 'postgresql://localhost/db',
              transformRules: { format: 'normalize' }
            },
            expectedOutputs: {
              recordsProcessed: 1000,
              status: 'completed'
            }
          }
        ],
        documentation: 'This template processes data through extract, transform, and load steps.'
      }
    ];

    templates.forEach(template => {
      this.library.templates.set(template.id, template);
    });
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

interface QueuedExecution {
  id: string;
  workflowId: string;
  inputs: Record<string, any>;
  priority: number;
  queuedAt: Date;
}