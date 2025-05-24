import { StandardMCPServer } from '../../shared/standard-mcp-server';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MCPError } from '../../../shared/src/errors';
import { HealthChecker } from '../../../shared/src/health';
import * as fs from 'fs/promises';
import * as path from 'path';

// Data Source Interfaces
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
  status: 'active' | 'inactive' | 'error' | 'maintenance';
  lastAccessed?: Date;
  errorLog: ErrorEntry[];
}

export interface ConnectionConfig {
  url?: string;
  host?: string;
  port?: number;
  database?: string;
  path?: string;
  timeout: number;
  headers?: Record<string, string>;
}

export interface DataSchema {
  version: string;
  fields: SchemaField[];
  primaryKey?: string[];
  validation: ValidationRule[];
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array';
  required: boolean;
  nullable: boolean;
  defaultValue?: any;
}

export interface ValidationRule {
  field: string;
  rule: string;
  parameters: any[];
  errorMessage: string;
  severity: 'error' | 'warning' | 'info';
}

export interface ErrorEntry {
  timestamp: Date;
  error: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  resolved: boolean;
}

// Pipeline Interfaces
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
  metadata: PipelineMetadata;
  created: Date;
  updated: Date;
  lastRun?: Date;
  runHistory: PipelineRun[];
}

export interface ScheduleConfig {
  type: 'manual' | 'cron' | 'interval' | 'event_driven';
  cronExpression?: string;
  intervalMs?: number;
  timezone: string;
  enabled: boolean;
  maxConcurrentRuns: number;
}

export interface TransformationStep {
  id: string;
  name: string;
  type: 'map' | 'filter' | 'aggregate' | 'join' | 'sort' | 'custom';
  order: number;
  enabled: boolean;
  configuration: TransformationConfig;
}

export interface TransformationConfig {
  operation: string;
  parameters: Record<string, any>;
  code?: string;
  language?: 'javascript' | 'python' | 'sql';
}

export interface ValidationStep {
  id: string;
  name: string;
  type: 'schema' | 'data_quality' | 'business_rule' | 'completeness';
  order: number;
  enabled: boolean;
  rules: ValidationRule[];
  onFailure: 'stop' | 'warn' | 'ignore' | 'quarantine';
}

export interface PipelineMetadata {
  tags: string[];
  owner: string;
  team: string;
  project: string;
  environment: 'development' | 'staging' | 'production';
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
  errors: RunError[];
  logs: RunLog[];
}

export interface RunError {
  step: string;
  timestamp: Date;
  error: string;
  details: Record<string, any>;
  recoverable: boolean;
}

export interface RunLog {
  timestamp: Date;
  level: string;
  message: string;
  details?: Record<string, any>;
}

export class DataPipelineService {
  private sources: Map<string, DataSource> = new Map();
  private pipelines: Map<string, DataPipeline> = new Map();
  private activeRuns: Map<string, PipelineRun> = new Map();
  private healthChecker: HealthChecker;
  private configPath: string;

  constructor(configPath: string = './data/data-pipeline') {
    this.configPath = configPath;
    this.healthChecker = new HealthChecker('data-pipeline-service');
  }

  async initialize(): Promise<void> {
    await this.ensureDirectoryExists(this.configPath);
    await this.loadSources();
    await this.loadPipelines();
  }

  async shutdown(): Promise<void> {
    this.activeRuns.clear();
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  private async loadSources(): Promise<void> {
    try {
      const sourcesFile = path.join(this.configPath, 'sources.json');
      const data = await fs.readFile(sourcesFile, 'utf8');
      const sources = JSON.parse(data) as DataSource[];
      for (const source of sources) {
        this.sources.set(source.id, source);
      }
    } catch {
      // Sources file doesn't exist, start with empty collection
    }
  }

  private async loadPipelines(): Promise<void> {
    try {
      const pipelinesFile = path.join(this.configPath, 'pipelines.json');
      const data = await fs.readFile(pipelinesFile, 'utf8');
      const pipelines = JSON.parse(data) as DataPipeline[];
      for (const pipeline of pipelines) {
        this.pipelines.set(pipeline.id, pipeline);
      }
    } catch {
      // Pipelines file doesn't exist, start with empty collection
    }
  }

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

      return id;
    } catch (error) {
      throw new MCPError('PIPELINE_ERROR', `Failed to create pipeline: ${error}`);
    }
  }

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
        errors: [],
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
      await this.performValidations(pipeline.validations, transformedData, run);

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
          duration: run.duration
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

      throw error;
    } finally {
      this.activeRuns.delete(run.id);
    }
  }

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
      case 'api':
        return this.loadFromAPI(source);
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

  private async loadFromAPI(source: DataSource): Promise<any[]> {
    const url = source.connection.url!;
    const headers = source.connection.headers || {};

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

  private async applyTransformation(transformation: TransformationStep, data: any[], run: PipelineRun): Promise<any[]> {
    // Simplified transformation logic
    return data;
  }

  private async performValidations(validations: ValidationStep[], data: any[], run: PipelineRun): Promise<void> {
    // Simplified validation logic
  }

  private async writeToDestinations(destinationIds: string[], data: any[], run: PipelineRun): Promise<void> {
    // Simplified destination writing
    run.recordsSucceeded += data.length;
  }

  private async validateSourceConnection(source: DataSource): Promise<void> {
    // Validation logic
  }

  private async validatePipeline(pipeline: DataPipeline): Promise<void> {
    if (pipeline.sources.length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'Pipeline must have at least one source');
    }
  }

  async getPipelineStatus(pipelineId: string): Promise<any> {
    const pipeline = this.pipelines.get(pipelineId);
    if (!pipeline) {
      throw new MCPError('PIPELINE_ERROR', `Pipeline ${pipelineId} not found`);
    }

    return {
      pipeline,
      currentRun: Array.from(this.activeRuns.values()).find(run => run.pipelineId === pipelineId),
      lastRun: pipeline.runHistory[pipeline.runHistory.length - 1]
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
      }
    };
  }
}

export class DataPipelineServer extends StandardMCPServer {
  private dataPipelineService: DataPipelineService;

  constructor() {
    super('data-pipeline-server', 'Data pipeline processing and ETL operations');
    this.dataPipelineService = new DataPipelineService();
  }

  async setupTools(): Promise<void> {
    this.registerTool({
      name: 'create_pipeline',
      description: 'Create a new data pipeline',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          sources: { type: 'array' },
          transformations: { type: 'array' },
          targets: { type: 'array' }
        },
        required: ['name', 'sources', 'targets']
      }
    });

    this.registerTool({
      name: 'run_pipeline',
      description: 'Execute a data pipeline',
      inputSchema: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' }
        },
        required: ['pipelineId']
      }
    });

    this.registerTool({
      name: 'get_pipeline_status',
      description: 'Get pipeline execution status',
      inputSchema: {
        type: 'object',
        properties: {
          pipelineId: { type: 'string' }
        },
        required: ['pipelineId']
      }
    });
  }

  async handleToolCall(name: string, args: any): Promise<CallToolResult> {
    switch (name) {
      case 'create_pipeline':
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify(await this.dataPipelineService.createPipeline(args), null, 2) 
          }] 
        };
      case 'run_pipeline':
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify(await this.dataPipelineService.executePipeline(args.pipelineId), null, 2) 
          }] 
        };
      case 'get_pipeline_status':
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify(await this.dataPipelineService.getPipelineStatus(args.pipelineId), null, 2) 
          }] 
        };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  protected async initialize(): Promise<void> {
    await this.dataPipelineService.initialize();
  }

  protected async cleanup(): Promise<void> {
    await this.dataPipelineService.shutdown();
  }

}

// Start the server if this file is run directly
const server = new DataPipelineServer();
server.start().catch(console.error);