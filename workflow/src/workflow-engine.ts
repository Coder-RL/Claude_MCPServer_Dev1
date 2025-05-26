import { EventEmitter } from 'events';

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  triggers: WorkflowTrigger[];
  steps: WorkflowStep[];
  variables: Record<string, any>;
  timeout?: number;
  retryPolicy?: RetryPolicy;
  errorHandling?: ErrorHandling;
  metadata?: Record<string, any>;
}

export interface WorkflowTrigger {
  id: string;
  type: 'manual' | 'scheduled' | 'event' | 'webhook' | 'file' | 'api';
  config: Record<string, any>;
  conditions?: WorkflowCondition[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'action' | 'condition' | 'loop' | 'parallel' | 'subprocess' | 'human' | 'ai';
  config: Record<string, any>;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
  conditions?: WorkflowCondition[];
  onSuccess?: string;
  onFailure?: string;
  timeout?: number;
  retries?: number;
}

export interface WorkflowCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'regex' | 'exists';
  value: any;
}

export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'fixed' | 'exponential' | 'linear';
  initialDelay: number;
  maxDelay: number;
  retryableErrors?: string[];
}

export interface ErrorHandling {
  strategy: 'fail' | 'continue' | 'retry' | 'rollback';
  maxErrors: number;
  errorSteps?: string[];
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  currentStep?: string;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  variables: Record<string, any>;
  stepResults: Map<string, StepResult>;
  errors: WorkflowError[];
  triggeredBy?: string;
  parentExecution?: string;
}

export interface StepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  error?: WorkflowError;
  retryCount: number;
  logs: string[];
}

export interface WorkflowError {
  stepId?: string;
  message: string;
  code?: string;
  stack?: string;
  timestamp: Date;
  retryable: boolean;
}

export interface WorkflowMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  stepMetrics: Map<string, StepMetrics>;
}

export interface StepMetrics {
  stepId: string;
  executionCount: number;
  successRate: number;
  averageDuration: number;
  errorRate: number;
}

export class WorkflowEngine extends EventEmitter {
  private workflows = new Map<string, WorkflowDefinition>();
  private executions = new Map<string, WorkflowExecution>();
  private activeExecutions = new Map<string, WorkflowExecution>();
  private scheduledTasks = new Map<string, NodeJS.Timeout>();
  private stepHandlers = new Map<string, WorkflowStepHandler>();
  private metrics = new Map<string, WorkflowMetrics>();

  constructor() {
    super();
    this.initializeDefaultHandlers();
    this.startMaintenanceTimer();
  }

  async registerWorkflow(workflow: WorkflowDefinition): Promise<boolean> {
    try {
      const validation = this.validateWorkflow(workflow);
      if (!validation.valid) {
        this.emit('error', { operation: 'registerWorkflow', error: validation.error });
        return false;
      }

      this.workflows.set(workflow.id, workflow);
      
      // Set up triggers
      for (const trigger of workflow.triggers) {
        await this.setupTrigger(workflow.id, trigger);
      }

      // Initialize metrics
      this.metrics.set(workflow.id, {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDuration: 0,
        stepMetrics: new Map()
      });

      this.emit('workflowRegistered', { workflowId: workflow.id, workflow });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'registerWorkflow', error });
      return false;
    }
  }

  async executeWorkflow(
    workflowId: string, 
    inputs: Record<string, any> = {},
    triggeredBy?: string
  ): Promise<string> {
    try {
      const workflow = this.workflows.get(workflowId);
      if (!workflow) {
        throw new Error(`Workflow ${workflowId} not found`);
      }

      const execution: WorkflowExecution = {
        id: this.generateExecutionId(),
        workflowId,
        status: 'pending',
        startTime: new Date(),
        inputs,
        outputs: {},
        variables: { ...workflow.variables, ...inputs },
        stepResults: new Map(),
        errors: [],
        triggeredBy
      };

      this.executions.set(execution.id, execution);
      this.activeExecutions.set(execution.id, execution);

      this.emit('executionStarted', { execution });

      // Start execution asynchronously
      this.processExecution(execution);

      return execution.id;
    } catch (error) {
      this.emit('error', { operation: 'executeWorkflow', error });
      throw error;
    }
  }

  async pauseExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return false;

    execution.status = 'paused';
    this.emit('executionPaused', { execution });
    return true;
  }

  async resumeExecution(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'paused') return false;

    execution.status = 'running';
    this.activeExecutions.set(executionId, execution);
    this.emit('executionResumed', { execution });
    
    this.processExecution(execution);
    return true;
  }

  async cancelExecution(executionId: string): Promise<boolean> {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return false;

    execution.status = 'cancelled';
    execution.endTime = new Date();
    execution.duration = execution.endTime.getTime() - execution.startTime.getTime();

    this.activeExecutions.delete(executionId);
    this.emit('executionCancelled', { execution });
    return true;
  }

  async getExecution(executionId: string): Promise<WorkflowExecution | undefined> {
    return this.executions.get(executionId);
  }

  async getActiveExecutions(): Promise<WorkflowExecution[]> {
    return Array.from(this.activeExecutions.values());
  }

  async getWorkflowMetrics(workflowId: string): Promise<WorkflowMetrics | undefined> {
    return this.metrics.get(workflowId);
  }

  registerStepHandler(stepType: string, handler: WorkflowStepHandler): void {
    this.stepHandlers.set(stepType, handler);
  }

  private async processExecution(execution: WorkflowExecution): Promise<void> {
    try {
      execution.status = 'running';
      this.emit('executionRunning', { execution });

      const workflow = this.workflows.get(execution.workflowId)!;
      
      // Set timeout if specified
      let timeoutHandle: NodeJS.Timeout | undefined;
      if (workflow.timeout) {
        timeoutHandle = setTimeout(() => {
          this.cancelExecution(execution.id);
        }, workflow.timeout);
      }

      try {
        await this.executeSteps(execution, workflow.steps);
        
        execution.status = 'completed';
        execution.endTime = new Date();
        execution.duration = execution.endTime.getTime() - execution.startTime.getTime();

        this.updateMetrics(execution.workflowId, execution, true);
        this.emit('executionCompleted', { execution });

      } catch (error) {
        execution.status = 'failed';
        execution.endTime = new Date();
        execution.duration = execution.endTime!.getTime() - execution.startTime.getTime();
        execution.errors.push({
          message: error.message,
          timestamp: new Date(),
          retryable: false
        });

        this.updateMetrics(execution.workflowId, execution, false);
        this.emit('executionFailed', { execution, error });

        // Handle error based on workflow configuration
        await this.handleWorkflowError(execution, workflow, error);
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        this.activeExecutions.delete(execution.id);
      }

    } catch (error) {
      this.emit('error', { operation: 'processExecution', error, executionId: execution.id });
    }
  }

  private async executeSteps(execution: WorkflowExecution, steps: WorkflowStep[]): Promise<void> {
    for (const step of steps) {
      if (execution.status === 'cancelled' || execution.status === 'paused') {
        break;
      }

      await this.executeStep(execution, step);
    }
  }

  private async executeStep(execution: WorkflowExecution, step: WorkflowStep): Promise<void> {
    const stepResult: StepResult = {
      stepId: step.id,
      status: 'pending',
      startTime: new Date(),
      inputs: this.resolveStepInputs(step, execution),
      outputs: {},
      retryCount: 0,
      logs: []
    };

    execution.stepResults.set(step.id, stepResult);
    execution.currentStep = step.id;

    this.emit('stepStarted', { execution, step, stepResult });

    try {
      // Check step conditions
      if (step.conditions && !this.evaluateConditions(step.conditions, execution)) {
        stepResult.status = 'skipped';
        stepResult.endTime = new Date();
        stepResult.duration = stepResult.endTime.getTime() - stepResult.startTime.getTime();
        this.emit('stepSkipped', { execution, step, stepResult });
        return;
      }

      stepResult.status = 'running';

      // Execute step with retry logic
      await this.executeStepWithRetry(execution, step, stepResult);

      stepResult.status = 'completed';
      stepResult.endTime = new Date();
      stepResult.duration = stepResult.endTime.getTime() - stepResult.startTime.getTime();

      // Update execution variables with step outputs
      execution.variables = { ...execution.variables, ...stepResult.outputs };

      this.emit('stepCompleted', { execution, step, stepResult });

    } catch (error) {
      stepResult.status = 'failed';
      stepResult.endTime = new Date();
      stepResult.duration = stepResult.endTime!.getTime() - stepResult.startTime.getTime();
      stepResult.error = {
        stepId: step.id,
        message: error.message,
        stack: error.stack,
        timestamp: new Date(),
        retryable: this.isRetryableError(error)
      };

      this.emit('stepFailed', { execution, step, stepResult, error });

      // Handle step failure
      await this.handleStepError(execution, step, stepResult, error);
    }
  }

  private async executeStepWithRetry(
    execution: WorkflowExecution,
    step: WorkflowStep,
    stepResult: StepResult
  ): Promise<void> {
    const maxRetries = step.retries || 0;
    let lastError: Error;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        stepResult.retryCount = attempt;
        
        if (attempt > 0) {
          stepResult.logs.push(`Retry attempt ${attempt}/${maxRetries}`);
          await this.delay(this.calculateRetryDelay(attempt));
        }

        await this.executeStepHandler(execution, step, stepResult);
        return; // Success, exit retry loop
        
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries && this.isRetryableError(error)) {
          stepResult.logs.push(`Attempt ${attempt + 1} failed: ${error.message}`);
          continue;
        }
        
        break; // Max retries reached or non-retryable error
      }
    }

    throw lastError!;
  }

  private async executeStepHandler(
    execution: WorkflowExecution,
    step: WorkflowStep,
    stepResult: StepResult
  ): Promise<void> {
    const handler = this.stepHandlers.get(step.type);
    if (!handler) {
      throw new Error(`No handler registered for step type: ${step.type}`);
    }

    const context = {
      execution,
      step,
      stepResult,
      variables: execution.variables,
      inputs: stepResult.inputs
    };

    const result = await handler.execute(context);
    stepResult.outputs = result.outputs || {};
    stepResult.logs.push(...(result.logs || []));
  }

  private resolveStepInputs(step: WorkflowStep, execution: WorkflowExecution): Record<string, any> {
    const inputs: Record<string, any> = {};
    
    if (step.inputs) {
      for (const [key, value] of Object.entries(step.inputs)) {
        inputs[key] = this.resolveValue(value, execution);
      }
    }

    return inputs;
  }

  private resolveValue(value: any, execution: WorkflowExecution): any {
    if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
      const expression = value.slice(2, -1);
      return this.evaluateExpression(expression, execution);
    }
    return value;
  }

  private evaluateExpression(expression: string, execution: WorkflowExecution): any {
    // Simple expression evaluation - in production use proper expression parser
    const context = {
      ...execution.variables,
      execution: execution,
      inputs: execution.inputs,
      outputs: execution.outputs
    };

    try {
      // Replace variable references
      let resolved = expression;
      for (const [key, value] of Object.entries(context)) {
        resolved = resolved.replace(new RegExp(`\\b${key}\\b`, 'g'), JSON.stringify(value));
      }

      return eval(resolved);
    } catch {
      return expression;
    }
  }

  private evaluateConditions(conditions: WorkflowCondition[], execution: WorkflowExecution): boolean {
    return conditions.every(condition => {
      const value = execution.variables[condition.field];
      return this.evaluateCondition(condition, value);
    });
  }

  private evaluateCondition(condition: WorkflowCondition, value: any): boolean {
    switch (condition.operator) {
      case 'eq': return value === condition.value;
      case 'ne': return value !== condition.value;
      case 'gt': return value > condition.value;
      case 'gte': return value >= condition.value;
      case 'lt': return value < condition.value;
      case 'lte': return value <= condition.value;
      case 'in': return Array.isArray(condition.value) && condition.value.includes(value);
      case 'nin': return Array.isArray(condition.value) && !condition.value.includes(value);
      case 'contains': return typeof value === 'string' && value.includes(condition.value);
      case 'regex': return typeof value === 'string' && new RegExp(condition.value).test(value);
      case 'exists': return value !== undefined && value !== null;
      default: return false;
    }
  }

  private async setupTrigger(workflowId: string, trigger: WorkflowTrigger): Promise<void> {
    switch (trigger.type) {
      case 'scheduled':
        this.setupScheduledTrigger(workflowId, trigger);
        break;
      case 'event':
        this.setupEventTrigger(workflowId, trigger);
        break;
      case 'webhook':
        this.setupWebhookTrigger(workflowId, trigger);
        break;
      case 'file':
        this.setupFileTrigger(workflowId, trigger);
        break;
    }
  }

  private setupScheduledTrigger(workflowId: string, trigger: WorkflowTrigger): void {
    const { schedule } = trigger.config;
    if (!schedule) return;

    // Simplified cron-like scheduling
    const interval = this.parseSchedule(schedule);
    const taskId = `${workflowId}-${trigger.id}`;
    
    this.scheduledTasks.set(taskId, setInterval(() => {
      this.executeWorkflow(workflowId, {}, 'scheduled');
    }, interval));
  }

  private setupEventTrigger(workflowId: string, trigger: WorkflowTrigger): void {
    const { eventType } = trigger.config;
    this.on(eventType, (data) => {
      if (this.evaluateConditions(trigger.conditions || [], { variables: data })) {
        this.executeWorkflow(workflowId, data, 'event');
      }
    });
  }

  private setupWebhookTrigger(workflowId: string, trigger: WorkflowTrigger): void {
    // Webhook trigger setup would integrate with web server
    this.emit('webhookTriggerSetup', { workflowId, trigger });
  }

  private setupFileTrigger(workflowId: string, trigger: WorkflowTrigger): void {
    // File watcher trigger setup
    this.emit('fileTriggerSetup', { workflowId, trigger });
  }

  private parseSchedule(schedule: string): number {
    // Simplified schedule parsing - in production use proper cron parser
    const match = schedule.match(/every (\d+) (second|minute|hour|day)s?/);
    if (!match) return 60000; // Default 1 minute

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'second': return value * 1000;
      case 'minute': return value * 60 * 1000;
      case 'hour': return value * 60 * 60 * 1000;
      case 'day': return value * 24 * 60 * 60 * 1000;
      default: return 60000;
    }
  }

  private validateWorkflow(workflow: WorkflowDefinition): { valid: boolean; error?: string } {
    if (!workflow.id || !workflow.name || !workflow.version) {
      return { valid: false, error: 'Missing required fields: id, name, version' };
    }

    if (!workflow.steps.length) {
      return { valid: false, error: 'Workflow must have at least one step' };
    }

    // Validate step references
    const stepIds = new Set(workflow.steps.map(s => s.id));
    for (const step of workflow.steps) {
      if (step.onSuccess && !stepIds.has(step.onSuccess)) {
        return { valid: false, error: `Invalid onSuccess reference: ${step.onSuccess}` };
      }
      if (step.onFailure && !stepIds.has(step.onFailure)) {
        return { valid: false, error: `Invalid onFailure reference: ${step.onFailure}` };
      }
    }

    return { valid: true };
  }

  private async handleWorkflowError(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    error: Error
  ): Promise<void> {
    if (workflow.errorHandling?.strategy === 'rollback') {
      await this.rollbackExecution(execution);
    }
  }

  private async handleStepError(
    execution: WorkflowExecution,
    step: WorkflowStep,
    stepResult: StepResult,
    error: Error
  ): Promise<void> {
    if (step.onFailure) {
      // Jump to failure step
      const failureStep = this.workflows.get(execution.workflowId)!.steps
        .find(s => s.id === step.onFailure);
      if (failureStep) {
        await this.executeStep(execution, failureStep);
        return;
      }
    }

    throw error; // Re-throw if no failure handling
  }

  private async rollbackExecution(execution: WorkflowExecution): Promise<void> {
    // Implement rollback logic based on completed steps
    this.emit('executionRollback', { execution });
  }

  private updateMetrics(workflowId: string, execution: WorkflowExecution, success: boolean): void {
    const metrics = this.metrics.get(workflowId)!;
    
    metrics.totalExecutions++;
    if (success) {
      metrics.successfulExecutions++;
    } else {
      metrics.failedExecutions++;
    }

    if (execution.duration) {
      const total = metrics.totalExecutions;
      metrics.averageDuration = (metrics.averageDuration * (total - 1) + execution.duration) / total;
    }

    // Update step metrics
    for (const [stepId, stepResult] of execution.stepResults) {
      if (!metrics.stepMetrics.has(stepId)) {
        metrics.stepMetrics.set(stepId, {
          stepId,
          executionCount: 0,
          successRate: 0,
          averageDuration: 0,
          errorRate: 0
        });
      }

      const stepMetrics = metrics.stepMetrics.get(stepId)!;
      stepMetrics.executionCount++;
      
      if (stepResult.status === 'completed') {
        stepMetrics.successRate = (stepMetrics.successRate * (stepMetrics.executionCount - 1) + 1) / stepMetrics.executionCount;
      } else if (stepResult.status === 'failed') {
        stepMetrics.errorRate = (stepMetrics.errorRate * (stepMetrics.executionCount - 1) + 1) / stepMetrics.executionCount;
      }

      if (stepResult.duration) {
        stepMetrics.averageDuration = (stepMetrics.averageDuration * (stepMetrics.executionCount - 1) + stepResult.duration) / stepMetrics.executionCount;
      }
    }
  }

  private isRetryableError(error: Error): boolean {
    // Define retryable error patterns
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /temporary/i,
      /rate.?limit/i
    ];

    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  private calculateRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    return delay + Math.random() * 1000; // Add jitter
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private initializeDefaultHandlers(): void {
    // Register built-in step handlers
    this.registerStepHandler('action', new ActionStepHandler());
    this.registerStepHandler('condition', new ConditionStepHandler());
    this.registerStepHandler('parallel', new ParallelStepHandler());
    this.registerStepHandler('ai', new AIStepHandler());
  }

  private startMaintenanceTimer(): void {
    setInterval(() => {
      this.cleanupCompletedExecutions();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private cleanupCompletedExecutions(): void {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const [id, execution] of this.executions.entries()) {
      if (execution.endTime && execution.endTime < cutoff && 
          ['completed', 'failed', 'cancelled'].includes(execution.status)) {
        this.executions.delete(id);
      }
    }
  }
}

export interface WorkflowStepHandler {
  execute(context: WorkflowStepContext): Promise<WorkflowStepResult>;
}

export interface WorkflowStepContext {
  execution: WorkflowExecution;
  step: WorkflowStep;
  stepResult: StepResult;
  variables: Record<string, any>;
  inputs: Record<string, any>;
}

export interface WorkflowStepResult {
  outputs?: Record<string, any>;
  logs?: string[];
}

class ActionStepHandler implements WorkflowStepHandler {
  async execute(context: WorkflowStepContext): Promise<WorkflowStepResult> {
    const { action, params } = context.step.config;
    
    switch (action) {
      case 'http_request':
        return this.executeHttpRequest(params);
      case 'email':
        return this.sendEmail(params);
      case 'database':
        return this.executeDatabaseQuery(params);
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  private async executeHttpRequest(params: any): Promise<WorkflowStepResult> {
    // HTTP request implementation
    return { outputs: { status: 200, response: 'Success' } };
  }

  private async sendEmail(params: any): Promise<WorkflowStepResult> {
    // Email sending implementation
    return { outputs: { sent: true, messageId: 'msg123' } };
  }

  private async executeDatabaseQuery(params: any): Promise<WorkflowStepResult> {
    // Database query implementation
    return { outputs: { rows: [], count: 0 } };
  }
}

class ConditionStepHandler implements WorkflowStepHandler {
  async execute(context: WorkflowStepContext): Promise<WorkflowStepResult> {
    const { condition } = context.step.config;
    const result = this.evaluateCondition(condition, context.variables);
    return { outputs: { result, condition } };
  }

  private evaluateCondition(condition: string, variables: Record<string, any>): boolean {
    // Condition evaluation implementation
    return true;
  }
}

class ParallelStepHandler implements WorkflowStepHandler {
  async execute(context: WorkflowStepContext): Promise<WorkflowStepResult> {
    const { steps } = context.step.config;
    const results = await Promise.allSettled(
      steps.map((step: any) => this.executeSubStep(step, context))
    );
    
    return {
      outputs: { results: results.map(r => r.status === 'fulfilled' ? r.value : r.reason) }
    };
  }

  private async executeSubStep(step: any, context: WorkflowStepContext): Promise<any> {
    // Sub-step execution implementation
    return { completed: true };
  }
}

class AIStepHandler implements WorkflowStepHandler {
  async execute(context: WorkflowStepContext): Promise<WorkflowStepResult> {
    const { model, prompt, parameters } = context.step.config;
    
    // AI model integration implementation
    const response = await this.callAIModel(model, prompt, parameters, context.variables);
    
    return {
      outputs: { response, model, tokens: response.length },
      logs: [`AI model ${model} executed with ${response.length} tokens`]
    };
  }

  private async callAIModel(model: string, prompt: string, parameters: any, variables: Record<string, any>): Promise<string> {
    // AI model call implementation
    return 'AI response generated';
  }
}