import { BaseServer } from '../../../shared/src/base-server';
import { MCPError } from '../../../shared/src/errors';
import { withPerformanceMonitoring } from '../../../shared/src/monitoring';
import { withRetry } from '../../../shared/src/retry';
import { HealthChecker } from '../../../shared/src/health';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Transform, Readable, Writable } from 'stream';
import { pipeline } from 'stream/promises';

export interface DataSource {
  id: string;
  name: string;
  type: 'file' | 'database' | 'api' | 'stream' | 'queue' | 'webhook';
  connection: ConnectionConfig;
  schema: DataSchema;
  format: 'json' | 'csv' | 'parquet' | 'avro' | 'xml' | 'binary';
  compression: 'none' | 'gzip' | 'bzip2' | 'lz4' | 'snappy';
  encoding: 'utf8' | 'ascii' | 'base64' | 'binary';
  metadata: Record<string, any>;
  credentials?: CredentialConfig;
  polling?: PollingConfig;
  webhookConfig?: WebhookConfig;
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  lastAccessed?: Date;
  errorLog: ErrorEntry[];
}

export interface ConnectionConfig {
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  collection?: string;
  path?: string;
  endpoint?: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  timeout: number;
  retryPolicy: RetryPolicy;
  connectionPool?: PoolConfig;
  ssl?: SSLConfig;
}

export interface PoolConfig {
  min: number;
  max: number;
  acquireTimeoutMillis: number;
  createTimeoutMillis: number;
  destroyTimeoutMillis: number;
  idleTimeoutMillis: number;
  reapIntervalMillis: number;
}

export interface SSLConfig {
  enabled: boolean;
  cert?: string;
  key?: string;
  ca?: string;
  rejectUnauthorized: boolean;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface DataSchema {
  version: string;
  fields: SchemaField[];
  primaryKey?: string[];
  indexes?: SchemaIndex[];
  constraints?: SchemaConstraint[];
  relationships?: SchemaRelationship[];
  validation: ValidationRule[];
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'binary';
  required: boolean;
  nullable: boolean;
  defaultValue?: any;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: any[];
  description?: string;
  metadata?: Record<string, any>;
}

export interface SchemaIndex {
  name: string;
  fields: string[];
  unique: boolean;
  sparse: boolean;
  type: 'btree' | 'hash' | 'gin' | 'gist' | 'text';
}

export interface SchemaConstraint {
  name: string;
  type: 'unique' | 'foreign_key' | 'check' | 'not_null';
  fields: string[];
  referencedTable?: string;
  referencedFields?: string[];
  checkExpression?: string;
}

export interface SchemaRelationship {
  name: string;
  type: 'one_to_one' | 'one_to_many' | 'many_to_many';
  localField: string;
  foreignTable: string;
  foreignField: string;
  cascadeDelete: boolean;
}

export interface ValidationRule {
  field: string;
  rule: string;
  parameters: any[];
  errorMessage: string;
  severity: 'error' | 'warning' | 'info';
}

export interface CredentialConfig {
  type: 'basic' | 'bearer' | 'oauth2' | 'api_key' | 'certificate';
  username?: string;
  password?: string;
  token?: string;
  apiKey?: string;
  keyField?: string;
  clientId?: string;
  clientSecret?: string;
  authUrl?: string;
  tokenUrl?: string;
  scope?: string[];
  certificate?: CertificateConfig;
}

export interface CertificateConfig {
  cert: string;
  key: string;
  passphrase?: string;
  ca?: string;
}

export interface PollingConfig {
  enabled: boolean;
  intervalMs: number;
  maxRecords?: number;
  lastModifiedField?: string;
  incrementalField?: string;
  checkpoint: PollingCheckpoint;
}

export interface PollingCheckpoint {
  lastTimestamp?: Date;
  lastId?: string;
  lastOffset?: number;
  metadata?: Record<string, any>;
}

export interface WebhookConfig {
  enabled: boolean;
  endpoint: string;
  secret?: string;
  headers?: Record<string, string>;
  retryPolicy: RetryPolicy;
  transformation?: TransformationConfig;
}

export interface ErrorEntry {
  timestamp: Date;
  error: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
}

export interface DataPipeline {
  id: string;
  name: string;
  description: string;
  version: string;
  status: 'draft' | 'active' | 'paused' | 'error' | 'completed';
  schedule: ScheduleConfig;
  sources: string[];
  destinations: string[];
  transformations: TransformationStep[];
  validations: ValidationStep[];
  monitoring: MonitoringConfig;
  errorHandling: ErrorHandlingConfig;
  metadata: PipelineMetadata;
  created: Date;
  updated: Date;
  lastRun?: Date;
  nextRun?: Date;
  runHistory: PipelineRun[];
}

export interface ScheduleConfig {
  type: 'manual' | 'cron' | 'interval' | 'event_driven';
  cronExpression?: string;
  intervalMs?: number;
  eventTriggers?: EventTrigger[];
  timezone: string;
  enabled: boolean;
  maxConcurrentRuns: number;
}

export interface EventTrigger {
  type: 'file_created' | 'file_modified' | 'webhook' | 'message_queue' | 'database_change';
  source: string;
  condition?: string;
  parameters: Record<string, any>;
}

export interface TransformationStep {
  id: string;
  name: string;
  type: 'map' | 'filter' | 'aggregate' | 'join' | 'sort' | 'custom' | 'ml_inference';
  order: number;
  enabled: boolean;
  configuration: TransformationConfig;
  outputSchema?: DataSchema;
  parallelism?: number;
  resources?: ResourceRequirements;
}

export interface TransformationConfig {
  operation: string;
  parameters: Record<string, any>;
  code?: string;
  language?: 'javascript' | 'python' | 'sql';
  dependencies?: string[];
  environment?: Record<string, string>;
  timeout?: number;
}

export interface ResourceRequirements {
  cpu: number;
  memory: number;
  storage: number;
  gpu?: boolean;
  networkBandwidth?: number;
}

export interface ValidationStep {
  id: string;
  name: string;
  type: 'schema' | 'data_quality' | 'business_rule' | 'completeness' | 'consistency';
  order: number;
  enabled: boolean;
  rules: ValidationRule[];
  onFailure: 'stop' | 'warn' | 'ignore' | 'quarantine';
  threshold?: number;
}

export interface MonitoringConfig {
  enabled: boolean;
  metrics: MetricConfig[];
  alerts: AlertConfig[];
  logging: LoggingConfig;
  profiling: ProfilingConfig;
}

export interface MetricConfig {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  description: string;
  tags: string[];
  aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count';
  retention: number;
}

export interface AlertConfig {
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  channels: string[];
  cooldown: number;
}

export interface LoggingConfig {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text';
  destination: 'console' | 'file' | 'remote';
  retention: number;
  sampling?: number;
}

export interface ProfilingConfig {
  enabled: boolean;
  samplingRate: number;
  detailLevel: 'basic' | 'detailed' | 'comprehensive';
  includeMemory: boolean;
  includeCpu: boolean;
  includeIo: boolean;
}

export interface ErrorHandlingConfig {
  strategy: 'fail_fast' | 'continue' | 'retry' | 'circuit_breaker';
  maxRetries: number;
  retryDelayMs: number;
  circuitBreakerThreshold: number;
  deadLetterQueue?: string;
  errorNotifications: string[];
}

export interface PipelineMetadata {
  tags: string[];
  owner: string;
  team: string;
  project: string;
  environment: 'development' | 'staging' | 'production';
  costCenter?: string;
  sla?: SLAConfig;
  documentation?: string;
}

export interface SLAConfig {
  availability: number;
  latency: number;
  throughput: number;
  errorRate: number;
}

export interface PipelineRun {
  id: string;
  pipelineId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  trigger: string;
  recordsProcessed: number;
  recordsSucceeded: number;
  recordsFailed: number;
  bytesProcessed: number;
  errors: RunError[];
  metrics: RunMetrics;
  logs: RunLog[];
}

export interface RunError {
  step: string;
  timestamp: Date;
  error: string;
  details: Record<string, any>;
  recoverable: boolean;
}

export interface RunMetrics {
  cpuUsage: number;
  memoryUsage: number;
  networkUsage: number;
  diskUsage: number;
  throughput: number;
  latency: number;
  errorRate: number;
}

export interface RunLog {
  timestamp: Date;
  level: string;
  message: string;
  details?: Record<string, any>;
}

export interface DataQualityReport {
  pipelineId: string;
  runId: string;
  timestamp: Date;
  overallScore: number;
  dimensions: QualityDimension[];
  issues: QualityIssue[];
  recommendations: QualityRecommendation[];
}

export interface QualityDimension {
  name: 'completeness' | 'accuracy' | 'consistency' | 'validity' | 'uniqueness' | 'timeliness';
  score: number;
  threshold: number;
  passed: boolean;
  details: Record<string, any>;
}

export interface QualityIssue {
  id: string;
  dimension: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedRecords: number;
  examples: any[];
  suggestedFix?: string;
}

export interface QualityRecommendation {
  type: 'schema_update' | 'validation_rule' | 'transformation' | 'data_cleansing';
  priority: 'low' | 'medium' | 'high';
  description: string;
  implementation: string;
  estimatedImpact: number;
}

export class DataPipelineService {
  private sources: Map<string, DataSource> = new Map();
  private pipelines: Map<string, DataPipeline> = new Map();
  private activeRuns: Map<string, PipelineRun> = new Map();
  private healthChecker: HealthChecker;
  private configPath: string;

  constructor(configPath: string = './data/data-pipeline') {
    this.configPath = configPath;
    this.healthChecker = new HealthChecker();
  }

  @withPerformanceMonitoring('data-pipeline.register-source')
  async registerDataSource(source: Omit<DataSource, 'id' | 'lastAccessed' | 'errorLog'>): Promise<string> {
    try {
      const id = `source_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const dataSource: DataSource = {
        ...source,
        id,
        lastAccessed: undefined,
        errorLog: []
      };

      await this.validateSourceConnection(dataSource);
      
      this.sources.set(id, dataSource);
      await this.saveSources();

      return id;
    } catch (error) {
      throw new MCPError('PIPELINE_ERROR', `Failed to register data source: ${error}`);
    }
  }

  @withPerformanceMonitoring('data-pipeline.create-pipeline')
  async createPipeline(pipeline: Omit<DataPipeline, 'id' | 'created' | 'updated' | 'runHistory'>): Promise<string> {
    try {
      const id = `pipeline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const dataPipeline: DataPipeline = {
        ...pipeline,
        id,
        created: new Date(),
        updated: new Date(),
        runHistory: []
      };

      await this.validatePipeline(dataPipeline);
      
      this.pipelines.set(id, dataPipeline);
      await this.savePipelines();

      if (dataPipeline.schedule.enabled && dataPipeline.schedule.type !== 'manual') {
        await this.schedulePipeline(id);
      }

      return id;
    } catch (error) {
      throw new MCPError('PIPELINE_ERROR', `Failed to create pipeline: ${error}`);
    }
  }

  @withPerformanceMonitoring('data-pipeline.execute-pipeline')
  async executePipeline(pipelineId: string, trigger: string = 'manual'): Promise<string> {
    try {
      const pipeline = this.pipelines.get(pipelineId);
      if (!pipeline) {
        throw new MCPError('PIPELINE_ERROR', `Pipeline ${pipelineId} not found`);
      }

      if (pipeline.status !== 'active') {
        throw new MCPError('PIPELINE_ERROR', `Pipeline ${pipelineId} is not active`);
      }

      const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const run: PipelineRun = {
        id: runId,
        pipelineId,
        status: 'running',
        startTime: new Date(),
        trigger,
        recordsProcessed: 0,
        recordsSucceeded: 0,
        recordsFailed: 0,
        bytesProcessed: 0,
        errors: [],
        metrics: {
          cpuUsage: 0,
          memoryUsage: 0,
          networkUsage: 0,
          diskUsage: 0,
          throughput: 0,
          latency: 0,
          errorRate: 0
        },
        logs: []
      };

      this.activeRuns.set(runId, run);

      // Execute pipeline asynchronously
      this.executePipelineInternal(pipeline, run).catch(error => {
        run.status = 'failed';
        run.endTime = new Date();
        run.errors.push({
          step: 'execution',
          timestamp: new Date(),
          error: error.message,
          details: { stack: error.stack },
          recoverable: false
        });
      });

      return runId;
    } catch (error) {
      throw new MCPError('PIPELINE_ERROR', `Failed to execute pipeline: ${error}`);
    }
  }

  @withRetry({ maxAttempts: 3, delayMs: 1000 })
  private async executePipelineInternal(pipeline: DataPipeline, run: PipelineRun): Promise<void> {
    try {
      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Starting pipeline execution: ${pipeline.name}`
      });

      // Load data from sources
      const sourceData = await this.loadSourceData(pipeline.sources, run);
      
      // Apply transformations
      let transformedData = sourceData;
      for (const transformation of pipeline.transformations.sort((a, b) => a.order - b.order)) {
        if (transformation.enabled) {
          transformedData = await this.applyTransformation(transformation, transformedData, run);
        }
      }

      // Perform validations
      const validationResults = await this.performValidations(pipeline.validations, transformedData, run);
      
      // Generate data quality report
      const qualityReport = await this.generateQualityReport(pipeline.id, run.id, validationResults, transformedData);

      // Write to destinations
      await this.writeToDestinations(pipeline.destinations, transformedData, run);

      run.status = 'completed';
      run.endTime = new Date();
      run.duration = run.endTime.getTime() - run.startTime.getTime();

      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Pipeline execution completed successfully`,
        details: {
          recordsProcessed: run.recordsProcessed,
          duration: run.duration,
          qualityScore: qualityReport.overallScore
        }
      });

      // Update pipeline run history
      pipeline.runHistory.push(run);
      pipeline.lastRun = run.endTime;
      await this.savePipelines();

    } catch (error) {
      run.status = 'failed';
      run.endTime = new Date();
      run.duration = run.endTime!.getTime() - run.startTime.getTime();
      
      run.errors.push({
        step: 'execution',
        timestamp: new Date(),
        error: error.message,
        details: { stack: error.stack },
        recoverable: false
      });

      run.logs.push({
        timestamp: new Date(),
        level: 'error',
        message: `Pipeline execution failed: ${error.message}`
      });

      throw error;
    } finally {
      this.activeRuns.delete(run.id);
    }
  }

  @withPerformanceMonitoring('data-pipeline.load-source-data')
  private async loadSourceData(sourceIds: string[], run: PipelineRun): Promise<any[]> {
    const allData: any[] = [];

    for (const sourceId of sourceIds) {
      const source = this.sources.get(sourceId);
      if (!source) {
        throw new MCPError('PIPELINE_ERROR', `Data source ${sourceId} not found`);
      }

      try {
        const data = await this.loadFromSource(source);
        allData.push(...data);
        run.recordsProcessed += data.length;
        
        run.logs.push({
          timestamp: new Date(),
          level: 'info',
          message: `Loaded ${data.length} records from source: ${source.name}`
        });

      } catch (error) {
        run.errors.push({
          step: `load-${sourceId}`,
          timestamp: new Date(),
          error: error.message,
          details: { sourceId, sourceName: source.name },
          recoverable: true
        });
        throw error;
      }
    }

    return allData;
  }

  private async loadFromSource(source: DataSource): Promise<any[]> {
    switch (source.type) {
      case 'file':
        return this.loadFromFile(source);
      case 'database':
        return this.loadFromDatabase(source);
      case 'api':
        return this.loadFromAPI(source);
      case 'stream':
        return this.loadFromStream(source);
      default:
        throw new MCPError('PIPELINE_ERROR', `Unsupported source type: ${source.type}`);
    }
  }

  private async loadFromFile(source: DataSource): Promise<any[]> {
    const filePath = source.connection.path!;
    const content = await fs.readFile(filePath, { encoding: source.encoding as BufferEncoding });
    
    switch (source.format) {
      case 'json':
        return JSON.parse(content);
      case 'csv':
        return this.parseCSV(content);
      default:
        throw new MCPError('PIPELINE_ERROR', `Unsupported file format: ${source.format}`);
    }
  }

  private async loadFromDatabase(source: DataSource): Promise<any[]> {
    // Simulated database loading
    return [];
  }

  private async loadFromAPI(source: DataSource): Promise<any[]> {
    const url = source.connection.url!;
    const headers = source.connection.headers || {};
    
    if (source.credentials) {
      this.addAuthenticationHeaders(headers, source.credentials);
    }

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(source.connection.timeout)
    });

    if (!response.ok) {
      throw new MCPError('PIPELINE_ERROR', `API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private async loadFromStream(source: DataSource): Promise<any[]> {
    // Simulated stream loading
    return [];
  }

  private parseCSV(content: string): any[] {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const data: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const record: any = {};
      
      headers.forEach((header, index) => {
        record[header] = values[index] || null;
      });
      
      data.push(record);
    }

    return data;
  }

  private addAuthenticationHeaders(headers: Record<string, string>, credentials: CredentialConfig): void {
    switch (credentials.type) {
      case 'basic':
        const auth = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
        break;
      case 'bearer':
        headers['Authorization'] = `Bearer ${credentials.token}`;
        break;
      case 'api_key':
        headers[credentials.keyField || 'X-API-Key'] = credentials.apiKey!;
        break;
    }
  }

  @withPerformanceMonitoring('data-pipeline.apply-transformation')
  private async applyTransformation(transformation: TransformationStep, data: any[], run: PipelineRun): Promise<any[]> {
    try {
      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Applying transformation: ${transformation.name}`
      });

      let result: any[];

      switch (transformation.type) {
        case 'map':
          result = await this.applyMapTransformation(transformation.configuration, data);
          break;
        case 'filter':
          result = await this.applyFilterTransformation(transformation.configuration, data);
          break;
        case 'aggregate':
          result = await this.applyAggregateTransformation(transformation.configuration, data);
          break;
        case 'join':
          result = await this.applyJoinTransformation(transformation.configuration, data);
          break;
        case 'sort':
          result = await this.applySortTransformation(transformation.configuration, data);
          break;
        case 'custom':
          result = await this.applyCustomTransformation(transformation.configuration, data);
          break;
        default:
          throw new MCPError('PIPELINE_ERROR', `Unsupported transformation type: ${transformation.type}`);
      }

      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        message: `Transformation completed: ${data.length} -> ${result.length} records`
      });

      return result;
    } catch (error) {
      run.errors.push({
        step: `transform-${transformation.id}`,
        timestamp: new Date(),
        error: error.message,
        details: { transformationName: transformation.name },
        recoverable: false
      });
      throw error;
    }
  }

  private async applyMapTransformation(config: TransformationConfig, data: any[]): Promise<any[]> {
    const mapFunction = new Function('record', 'index', config.code || 'return record;');
    return data.map((record, index) => mapFunction(record, index));
  }

  private async applyFilterTransformation(config: TransformationConfig, data: any[]): Promise<any[]> {
    const filterFunction = new Function('record', 'index', config.code || 'return true;');
    return data.filter((record, index) => filterFunction(record, index));
  }

  private async applyAggregateTransformation(config: TransformationConfig, data: any[]): Promise<any[]> {
    const groupBy = config.parameters.groupBy as string[];
    const aggregations = config.parameters.aggregations as Record<string, string>;
    
    const groups = new Map<string, any[]>();
    
    data.forEach(record => {
      const key = groupBy.map(field => record[field]).join('|');
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(record);
    });

    const result: any[] = [];
    groups.forEach((records, key) => {
      const aggregated: any = {};
      
      groupBy.forEach((field, index) => {
        aggregated[field] = key.split('|')[index];
      });

      Object.entries(aggregations).forEach(([field, operation]) => {
        const values = records.map(r => r[field]).filter(v => v != null);
        
        switch (operation) {
          case 'sum':
            aggregated[field] = values.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
            aggregated[field] = values.reduce((a, b) => a + b, 0) / values.length;
            break;
          case 'count':
            aggregated[field] = values.length;
            break;
          case 'min':
            aggregated[field] = Math.min(...values);
            break;
          case 'max':
            aggregated[field] = Math.max(...values);
            break;
        }
      });

      result.push(aggregated);
    });

    return result;
  }

  private async applyJoinTransformation(config: TransformationConfig, data: any[]): Promise<any[]> {
    // Simulated join operation
    return data;
  }

  private async applySortTransformation(config: TransformationConfig, data: any[]): Promise<any[]> {
    const sortField = config.parameters.field as string;
    const sortOrder = config.parameters.order as 'asc' | 'desc';
    
    return data.sort((a, b) => {
      const valueA = a[sortField];
      const valueB = b[sortField];
      
      if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
      if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }

  private async applyCustomTransformation(config: TransformationConfig, data: any[]): Promise<any[]> {
    if (config.language === 'javascript') {
      const transformFunction = new Function('data', config.code || 'return data;');
      return transformFunction(data);
    }
    
    throw new MCPError('PIPELINE_ERROR', `Unsupported transformation language: ${config.language}`);
  }

  @withPerformanceMonitoring('data-pipeline.perform-validations')
  private async performValidations(validations: ValidationStep[], data: any[], run: PipelineRun): Promise<QualityDimension[]> {
    const dimensions: QualityDimension[] = [];

    for (const validation of validations.filter(v => v.enabled).sort((a, b) => a.order - b.order)) {
      try {
        const dimension = await this.performValidation(validation, data, run);
        dimensions.push(dimension);

        if (!dimension.passed && validation.onFailure === 'stop') {
          throw new MCPError('VALIDATION_ERROR', `Validation failed: ${validation.name}`);
        }
      } catch (error) {
        run.errors.push({
          step: `validate-${validation.id}`,
          timestamp: new Date(),
          error: error.message,
          details: { validationName: validation.name },
          recoverable: validation.onFailure !== 'stop'
        });

        if (validation.onFailure === 'stop') {
          throw error;
        }
      }
    }

    return dimensions;
  }

  private async performValidation(validation: ValidationStep, data: any[], run: PipelineRun): Promise<QualityDimension> {
    let score = 0;
    let passed = false;
    const details: Record<string, any> = {};

    switch (validation.type) {
      case 'completeness':
        score = this.calculateCompletenessScore(data, validation.rules);
        break;
      case 'data_quality':
        score = this.calculateDataQualityScore(data, validation.rules);
        break;
      case 'schema':
        score = this.calculateSchemaScore(data, validation.rules);
        break;
      default:
        score = 1.0;
    }

    passed = score >= (validation.threshold || 0.8);
    
    run.logs.push({
      timestamp: new Date(),
      level: passed ? 'info' : 'warn',
      message: `Validation ${validation.name}: score=${score.toFixed(3)}, passed=${passed}`
    });

    return {
      name: validation.type,
      score,
      threshold: validation.threshold || 0.8,
      passed,
      details
    };
  }

  private calculateCompletenessScore(data: any[], rules: ValidationRule[]): number {
    if (data.length === 0) return 0;

    let totalFields = 0;
    let completeFields = 0;

    data.forEach(record => {
      Object.entries(record).forEach(([field, value]) => {
        totalFields++;
        if (value != null && value !== '' && value !== undefined) {
          completeFields++;
        }
      });
    });

    return totalFields > 0 ? completeFields / totalFields : 0;
  }

  private calculateDataQualityScore(data: any[], rules: ValidationRule[]): number {
    if (data.length === 0) return 1;

    let totalChecks = 0;
    let passedChecks = 0;

    data.forEach(record => {
      rules.forEach(rule => {
        totalChecks++;
        if (this.validateRule(record, rule)) {
          passedChecks++;
        }
      });
    });

    return totalChecks > 0 ? passedChecks / totalChecks : 1;
  }

  private calculateSchemaScore(data: any[], rules: ValidationRule[]): number {
    // Simulated schema validation
    return 1.0;
  }

  private validateRule(record: any, rule: ValidationRule): boolean {
    const value = record[rule.field];
    
    switch (rule.rule) {
      case 'required':
        return value != null && value !== '';
      case 'type':
        return typeof value === rule.parameters[0];
      case 'range':
        return value >= rule.parameters[0] && value <= rule.parameters[1];
      case 'pattern':
        return new RegExp(rule.parameters[0]).test(value);
      case 'enum':
        return rule.parameters.includes(value);
      default:
        return true;
    }
  }

  private async generateQualityReport(pipelineId: string, runId: string, dimensions: QualityDimension[], data: any[]): Promise<DataQualityReport> {
    const overallScore = dimensions.length > 0 ? 
      dimensions.reduce((sum, dim) => sum + dim.score, 0) / dimensions.length : 0;

    const issues: QualityIssue[] = [];
    const recommendations: QualityRecommendation[] = [];

    dimensions.forEach(dimension => {
      if (!dimension.passed) {
        issues.push({
          id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          dimension: dimension.name,
          severity: dimension.score < 0.5 ? 'critical' : dimension.score < 0.7 ? 'high' : 'medium',
          description: `${dimension.name} score (${dimension.score.toFixed(3)}) below threshold (${dimension.threshold})`,
          affectedRecords: Math.floor(data.length * (1 - dimension.score)),
          examples: [],
          suggestedFix: `Improve ${dimension.name} by addressing data quality issues`
        });

        recommendations.push({
          type: 'validation_rule',
          priority: dimension.score < 0.5 ? 'high' : 'medium',
          description: `Add stricter validation rules for ${dimension.name}`,
          implementation: `Implement additional ${dimension.name} checks in the pipeline`,
          estimatedImpact: (1 - dimension.score) * 100
        });
      }
    });

    return {
      pipelineId,
      runId,
      timestamp: new Date(),
      overallScore,
      dimensions,
      issues,
      recommendations
    };
  }

  private async writeToDestinations(destinationIds: string[], data: any[], run: PipelineRun): Promise<void> {
    for (const destinationId of destinationIds) {
      try {
        await this.writeToDestination(destinationId, data);
        run.recordsSucceeded += data.length;
        
        run.logs.push({
          timestamp: new Date(),
          level: 'info',
          message: `Successfully wrote ${data.length} records to destination: ${destinationId}`
        });
      } catch (error) {
        run.recordsFailed += data.length;
        run.errors.push({
          step: `write-${destinationId}`,
          timestamp: new Date(),
          error: error.message,
          details: { destinationId },
          recoverable: true
        });
      }
    }
  }

  private async writeToDestination(destinationId: string, data: any[]): Promise<void> {
    // Simulated destination writing
    const outputPath = path.join(this.configPath, 'output', `${destinationId}_${Date.now()}.json`);
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
  }

  private async validateSourceConnection(source: DataSource): Promise<void> {
    try {
      switch (source.type) {
        case 'file':
          if (!source.connection.path) {
            throw new MCPError('VALIDATION_ERROR', 'File path is required');
          }
          break;
        case 'api':
          if (!source.connection.url) {
            throw new MCPError('VALIDATION_ERROR', 'API URL is required');
          }
          break;
        case 'database':
          if (!source.connection.host || !source.connection.database) {
            throw new MCPError('VALIDATION_ERROR', 'Database host and database name are required');
          }
          break;
      }
    } catch (error) {
      throw new MCPError('VALIDATION_ERROR', `Source validation failed: ${error}`);
    }
  }

  private async validatePipeline(pipeline: DataPipeline): Promise<void> {
    if (pipeline.sources.length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'Pipeline must have at least one source');
    }

    if (pipeline.destinations.length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'Pipeline must have at least one destination');
    }

    for (const sourceId of pipeline.sources) {
      if (!this.sources.has(sourceId)) {
        throw new MCPError('VALIDATION_ERROR', `Source ${sourceId} not found`);
      }
    }
  }

  private async schedulePipeline(pipelineId: string): Promise<void> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) return;

    // Simulated scheduling
    if (pipeline.schedule.type === 'interval' && pipeline.schedule.intervalMs) {
      setInterval(() => {
        this.executePipeline(pipelineId, 'scheduled').catch(console.error);
      }, pipeline.schedule.intervalMs);
    }
  }

  @withPerformanceMonitoring('data-pipeline.get-pipeline-status')
  async getPipelineStatus(pipelineId: string): Promise<{
    pipeline: DataPipeline;
    currentRun?: PipelineRun;
    lastRun?: PipelineRun;
    metrics: PipelineMetrics;
  }> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new MCPError('PIPELINE_ERROR', `Pipeline ${pipelineId} not found`);
    }

    const currentRun = Array.from(this.activeRuns.values()).find(run => run.pipelineId === pipelineId);
    const lastRun = pipeline.runHistory[pipeline.runHistory.length - 1];
    
    const metrics = this.calculatePipelineMetrics(pipeline);

    return {
      pipeline,
      currentRun,
      lastRun,
      metrics
    };
  }

  private calculatePipelineMetrics(pipeline: DataPipeline): PipelineMetrics {
    const recentRuns = pipeline.runHistory.slice(-10);
    
    return {
      totalRuns: pipeline.runHistory.length,
      successfulRuns: pipeline.runHistory.filter(r => r.status === 'completed').length,
      failedRuns: pipeline.runHistory.filter(r => r.status === 'failed').length,
      averageDuration: recentRuns.reduce((sum, r) => sum + (r.duration || 0), 0) / recentRuns.length || 0,
      averageThroughput: recentRuns.reduce((sum, r) => sum + r.recordsProcessed, 0) / recentRuns.length || 0,
      errorRate: recentRuns.length > 0 ? recentRuns.filter(r => r.status === 'failed').length / recentRuns.length : 0,
      lastExecutionTime: pipeline.lastRun || new Date(0),
      nextExecutionTime: pipeline.nextRun || new Date()
    };
  }

  private async saveSources(): Promise<void> {
    const data = Array.from(this.sources.values());
    await fs.writeFile(
      path.join(this.configPath, 'sources.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async savePipelines(): Promise<void> {
    const data = Array.from(this.pipelines.values());
    await fs.writeFile(
      path.join(this.configPath, 'pipelines.json'),
      JSON.stringify(data, null, 2)
    );
  }

  async getHealthStatus(): Promise<any> {
    const totalPipelines = this.pipelines.size;
    const activePipelines = Array.from(this.pipelines.values()).filter(p => p.status === 'active').length;
    const runningJobs = this.activeRuns.size;
    const totalSources = this.sources.size;

    return {
      status: 'healthy',
      totalPipelines,
      activePipelines,
      runningJobs,
      totalSources,
      components: {
        pipeline: 'healthy',
        sources: 'healthy',
        transformations: 'healthy',
        validations: 'healthy'
      },
      metrics: {
        pipelinesExecutedToday: this.getPipelinesExecutedCount('today'),
        averageExecutionTime: this.getAverageExecutionTime(),
        successRate: this.getOverallSuccessRate(),
        dataProcessedToday: this.getDataProcessedCount('today')
      }
    };
  }

  private getPipelinesExecutedCount(period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return Array.from(this.pipelines.values())
      .flatMap(p => p.runHistory)
      .filter(run => run.startTime >= startOfDay)
      .length;
  }

  private getAverageExecutionTime(): number {
    const allRuns = Array.from(this.pipelines.values()).flatMap(p => p.runHistory);
    const completedRuns = allRuns.filter(r => r.status === 'completed' && r.duration);
    
    if (completedRuns.length === 0) return 0;
    
    return completedRuns.reduce((sum, r) => sum + (r.duration || 0), 0) / completedRuns.length;
  }

  private getOverallSuccessRate(): number {
    const allRuns = Array.from(this.pipelines.values()).flatMap(p => p.runHistory);
    if (allRuns.length === 0) return 1;
    
    const successfulRuns = allRuns.filter(r => r.status === 'completed').length;
    return successfulRuns / allRuns.length;
  }

  private getDataProcessedCount(period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return Array.from(this.pipelines.values())
      .flatMap(p => p.runHistory)
      .filter(run => run.startTime >= startOfDay)
      .reduce((sum, run) => sum + run.recordsProcessed, 0);
  }
}

interface PipelineMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDuration: number;
  averageThroughput: number;
  errorRate: number;
  lastExecutionTime: Date;
  nextExecutionTime: Date;
}

export class DataPipelineMCPServer extends BaseServer {
  private dataPipelineService: DataPipelineService;

  constructor() {
    super({
      name: 'data-pipeline-server',
      port: parseInt(process.env.DATA_PIPELINE_PORT || '8110'),
      host: process.env.DATA_PIPELINE_HOST || 'localhost'
    });
    this.dataPipelineService = new DataPipelineService();
  }

  protected async initialize(): Promise<void> {
    // Initialize the data pipeline service
    await this.dataPipelineService.initialize();
    this.setupDataPipelineRoutes();
  }

  protected async cleanup(): Promise<void> {
    // Cleanup resources
    await this.dataPipelineService.shutdown();
  }

  protected setupDataPipelineRoutes(): void {
    this.addRoute('get', '/api/health', async (req, res) => {
      try {
        const health = await this.dataPipelineService.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.addRoute('post', '/api/sources', async (req, res) => {
      try {
        const sourceId = await this.dataPipelineService.registerDataSource(req.body);
        res.json({ id: sourceId });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.addRoute('post', '/api/pipelines', async (req, res) => {
      try {
        const pipelineId = await this.dataPipelineService.createPipeline(req.body);
        res.json({ id: pipelineId });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.addRoute('post', '/api/pipelines/:id/execute', async (req, res) => {
      try {
        const runId = await this.dataPipelineService.executePipeline(req.params.id, req.body.trigger);
        res.json({ runId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/pipelines/:id/status', async (req, res) => {
      try {
        const status = await this.dataPipelineService.getPipelineStatus(req.params.id);
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  protected getMCPTools() {
    return [
      {
        name: 'register_data_source',
        description: 'Register a new data source',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['file', 'database', 'api', 'stream', 'queue', 'webhook'] },
            connection: { type: 'object' },
            schema: { type: 'object' },
            format: { type: 'string', enum: ['json', 'csv', 'parquet', 'avro', 'xml', 'binary'] },
            compression: { type: 'string', enum: ['none', 'gzip', 'bzip2', 'lz4', 'snappy'] },
            encoding: { type: 'string', enum: ['utf8', 'ascii', 'base64', 'binary'] },
            status: { type: 'string', enum: ['active', 'inactive', 'error', 'maintenance'] }
          },
          required: ['name', 'type', 'connection', 'schema', 'format']
        }
      },
      {
        name: 'create_pipeline',
        description: 'Create a new data pipeline',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            version: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'active', 'paused', 'error', 'completed'] },
            schedule: { type: 'object' },
            sources: { type: 'array', items: { type: 'string' } },
            destinations: { type: 'array', items: { type: 'string' } },
            transformations: { type: 'array' },
            validations: { type: 'array' },
            monitoring: { type: 'object' },
            errorHandling: { type: 'object' },
            metadata: { type: 'object' }
          },
          required: ['name', 'description', 'schedule', 'sources', 'destinations', 'transformations', 'metadata']
        }
      },
      {
        name: 'execute_pipeline',
        description: 'Execute a data pipeline',
        inputSchema: {
          type: 'object',
          properties: {
            pipelineId: { type: 'string' },
            trigger: { type: 'string' }
          },
          required: ['pipelineId']
        }
      },
      {
        name: 'get_pipeline_status',
        description: 'Get pipeline execution status',
        inputSchema: {
          type: 'object',
          properties: {
            pipelineId: { type: 'string' }
          },
          required: ['pipelineId']
        }
      }
    ];
  }

  protected async handleMCPRequest(method: string, params: any): Promise<any> {
    switch (method) {
      case 'register_data_source':
        return { id: await this.dataPipelineService.registerDataSource(params) };

      case 'create_pipeline':
        return { id: await this.dataPipelineService.createPipeline(params) };

      case 'execute_pipeline':
        return { runId: await this.dataPipelineService.executePipeline(params.pipelineId, params.trigger) };

      case 'get_pipeline_status':
        return await this.dataPipelineService.getPipelineStatus(params.pipelineId);

      default:
        throw new MCPError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
    }
  }
}