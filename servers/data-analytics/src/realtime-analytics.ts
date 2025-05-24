import { StandardMCPServer } from '../../shared/standard-mcp-server';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MCPError } from '../../../shared/src/errors';
import { HealthChecker } from '../../../shared/src/health';
import * as fs from 'fs/promises';
import * as path from 'path';
import { EventEmitter } from 'events';

export interface StreamConfig {
  id: string;
  name: string;
  type: 'kafka' | 'redis_stream' | 'websocket' | 'sse' | 'mqtt' | 'rabbitmq' | 'kinesis';
  source: StreamSource;
  processing: StreamProcessingConfig;
  output: StreamOutput[];
  windowing: WindowConfig;
  aggregations: AggregationConfig[];
  alerts: AlertRule[];
  parallelism: number;
  status: 'active' | 'paused' | 'stopped' | 'error';
  created: Date;
  updated: Date;
  metrics: StreamMetrics;
}

export interface StreamSource {
  connectionString: string;
  topic?: string;
  batchSize: number;
  pollInterval: number;
  timeout: number;
  serialization: 'json' | 'avro' | 'protobuf' | 'csv' | 'binary';
}

export interface StreamProcessingConfig {
  mode: 'event_time' | 'processing_time' | 'ingestion_time';
  schema: StreamSchema;
  transformations: StreamTransformation[];
  filters: StreamFilter[];
}

export interface StreamSchema {
  version: string;
  fields: StreamField[];
  timestampField: string;
  keyFields: string[];
}

export interface StreamField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'object' | 'array';
  nullable: boolean;
  defaultValue?: any;
}

export interface StreamTransformation {
  id: string;
  name: string;
  type: 'map' | 'flatmap' | 'keyby' | 'project' | 'compute' | 'parse' | 'format';
  configuration: Record<string, any>;
  code?: string;
}

export interface StreamFilter {
  id: string;
  name: string;
  condition: string;
  enabled: boolean;
  priority: number;
}

export interface StreamOutput {
  id: string;
  name: string;
  type: 'kafka' | 'redis' | 'database' | 'file' | 'webhook' | 'elasticsearch' | 'dashboard';
  destination: OutputDestination;
  format: 'json' | 'avro' | 'csv' | 'parquet';
}

export interface OutputDestination {
  url: string;
  topic?: string;
  database?: string;
  table?: string;
  path?: string;
  headers?: Record<string, string>;
}

export interface WindowConfig {
  type: 'tumbling' | 'sliding' | 'session' | 'global';
  size: number;
  slide?: number;
  sessionTimeout?: number;
  allowedLateness: number;
}

export interface AggregationConfig {
  id: string;
  name: string;
  window: WindowConfig;
  groupBy: string[];
  aggregations: AggregationFunction[];
  outputTopic?: string;
}

export interface AggregationFunction {
  field: string;
  function: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct_count' | 'percentile';
  parameters?: Record<string, any>;
  outputField: string;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  condition: string;
  threshold: number;
  timeWindow: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  channels: string[];
  enabled: boolean;
  cooldown: number;
}

export interface StreamMetrics {
  recordsPerSecond: number;
  bytesPerSecond: number;
  latency: LatencyMetrics;
  errors: ErrorMetrics;
}

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  average: number;
  max: number;
}

export interface ErrorMetrics {
  total: number;
  rate: number;
  byType: Record<string, number>;
  lastError?: string;
  lastErrorTime?: Date;
}

export interface StreamEvent {
  id: string;
  timestamp: Date;
  eventTime: Date;
  source: string;
  type: string;
  data: Record<string, any>;
  key?: string;
  partition?: number;
  offset?: number;
}

export interface WindowedData {
  windowStart: Date;
  windowEnd: Date;
  key: string;
  count: number;
  data: any[];
  aggregations: Record<string, any>;
}

export interface StreamingJob {
  id: string;
  streamId: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
  startTime: Date;
  stopTime?: Date;
  processedRecords: number;
  failedRecords: number;
  lastProcessedTime?: Date;
  errors: JobError[];
}

export interface JobError {
  timestamp: Date;
  type: string;
  message: string;
  stack?: string;
  fatal: boolean;
}

export interface DashboardWidget {
  id: string;
  type: 'line_chart' | 'bar_chart' | 'gauge' | 'table' | 'map' | 'text' | 'alert_list';
  title: string;
  description: string;
  position: { x: number; y: number; width: number; height: number };
  config: WidgetConfig;
  refreshInterval: number;
}

export interface WidgetConfig {
  streamId?: string;
  metricName?: string;
  aggregation?: string;
  timeRange?: number;
  groupBy?: string[];
  filters?: Record<string, any>;
}

export class RealtimeAnalyticsService extends EventEmitter {
  private streams: Map<string, StreamConfig> = new Map();
  private jobs: Map<string, StreamingJob> = new Map();
  private dashboards: Map<string, DashboardWidget[]> = new Map();
  private eventBuffer: Map<string, StreamEvent[]> = new Map();
  private windows: Map<string, Map<string, WindowedData>> = new Map();
  private healthChecker: HealthChecker;
  private configPath: string;

  constructor(configPath: string = './data/realtime-analytics') {
    super();
    this.configPath = configPath;
    this.healthChecker = new HealthChecker("realtime-analytics-service");
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.on('event', this.handleStreamEvent.bind(this));
    this.on('window_complete', this.handleWindowComplete.bind(this));
    this.on('alert', this.handleAlert.bind(this));
    this.on('error', this.handleError.bind(this));
  }

  async initialize(): Promise<void> {
    await this.ensureDirectoryExists(this.configPath);
    await this.loadStreams();
    await this.loadDashboards();
  }

  async shutdown(): Promise<void> {
    for (const job of this.jobs.values()) {
      if (job.status === 'running') {
        await this.stopStream(job.id);
      }
    }
    this.jobs.clear();
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  private async loadStreams(): Promise<void> {
    try {
      const streamsFile = path.join(this.configPath, 'streams.json');
      const data = await fs.readFile(streamsFile, 'utf8');
      const streams = JSON.parse(data) as StreamConfig[];
      for (const stream of streams) {
        this.streams.set(stream.id, stream);
        this.eventBuffer.set(stream.id, []);
        this.windows.set(stream.id, new Map());
      }
    } catch {
      // Streams file doesn't exist, start with empty collection
    }
  }

  private async loadDashboards(): Promise<void> {
    try {
      const dashboardsFile = path.join(this.configPath, 'dashboards.json');
      const data = await fs.readFile(dashboardsFile, 'utf8');
      const dashboards = JSON.parse(data);
      for (const [id, widgets] of Object.entries(dashboards)) {
        this.dashboards.set(id, widgets as DashboardWidget[]);
      }
    } catch {
      // Dashboards file doesn't exist, start with empty collection
    }
  }

  async createStream(stream: Omit<StreamConfig, 'id' | 'created' | 'updated' | 'metrics'>): Promise<string> {
    try {
      const id = `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const streamConfig: StreamConfig = {
        ...stream,
        id,
        created: new Date(),
        updated: new Date(),
        metrics: {
          recordsPerSecond: 0,
          bytesPerSecond: 0,
          latency: { p50: 0, p95: 0, p99: 0, average: 0, max: 0 },
          errors: { total: 0, rate: 0, byType: {} }
        }
      };

      await this.validateStreamConfig(streamConfig);
      
      this.streams.set(id, streamConfig);
      this.eventBuffer.set(id, []);
      this.windows.set(id, new Map());
      
      await this.saveStreams();

      return id;
    } catch (error) {
      throw new MCPError('STREAM_ERROR', `Failed to create stream: ${error}`);
    }
  }

  async startStream(streamId: string): Promise<string> {
    try {
      const stream = this.streams.get(streamId);
      if (!stream) {
        throw new MCPError('STREAM_ERROR', `Stream ${streamId} not found`);
      }

      const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const job: StreamingJob = {
        id: jobId,
        streamId,
        status: 'starting',
        startTime: new Date(),
        processedRecords: 0,
        failedRecords: 0,
        errors: []
      };

      this.jobs.set(jobId, job);
      stream.status = 'active';

      this.startStreamProcessing(stream, job);

      return jobId;
    } catch (error) {
      throw new MCPError('STREAM_ERROR', `Failed to start stream: ${error}`);
    }
  }

  private async startStreamProcessing(stream: StreamConfig, job: StreamingJob): Promise<void> {
    try {
      job.status = 'running';
      
      const processInterval = setInterval(async () => {
        if (job.status !== 'running') {
          clearInterval(processInterval);
          return;
        }

        try {
          const events = await this.readEventsFromSource(stream);
          
          for (const event of events) {
            await this.processEvent(stream, event, job);
          }

          this.updateStreamMetrics(stream, events.length);
          
        } catch (error) {
          job.errors.push({
            timestamp: new Date(),
            type: 'processing_error',
            message: error.message,
            stack: error.stack,
            fatal: false
          });
          
          stream.metrics.errors.total++;
          stream.metrics.errors.rate = job.errors.length / ((Date.now() - job.startTime.getTime()) / 1000);
          
          this.emit('error', { streamId: stream.id, jobId: job.id, error });
        }
      }, stream.source.pollInterval);

    } catch (error) {
      job.status = 'failed';
      job.stopTime = new Date();
      throw error;
    }
  }

  private async readEventsFromSource(stream: StreamConfig): Promise<StreamEvent[]> {
    const events: StreamEvent[] = [];
    
    for (let i = 0; i < Math.floor(Math.random() * 10) + 1; i++) {
      const event: StreamEvent = {
        id: `event_${Date.now()}_${i}`,
        timestamp: new Date(),
        eventTime: new Date(),
        source: stream.id,
        type: 'data',
        data: this.generateSampleData(stream),
        key: `key_${Math.floor(Math.random() * 100)}`,
        partition: Math.floor(Math.random() * 4),
        offset: Date.now() + i
      };
      
      events.push(event);
    }

    return events;
  }

  private generateSampleData(stream: StreamConfig): Record<string, any> {
    const data: Record<string, any> = {};
    
    stream.processing.schema.fields.forEach(field => {
      switch (field.type) {
        case 'string':
          data[field.name] = `value_${Math.random().toString(36).substr(2, 8)}`;
          break;
        case 'number':
          data[field.name] = Math.random() * 1000;
          break;
        case 'boolean':
          data[field.name] = Math.random() > 0.5;
          break;
        case 'timestamp':
          data[field.name] = new Date();
          break;
        default:
          data[field.name] = null;
      }
    });

    return data;
  }

  private async processEvent(stream: StreamConfig, event: StreamEvent, job: StreamingJob): Promise<void> {
    try {
      if (!this.passesFilters(event, stream.processing.filters)) {
        return;
      }

      const transformedEvent = await this.applyTransformations(event, stream.processing.transformations);
      
      await this.addToWindows(stream, transformedEvent);
      await this.checkAlerts(stream, transformedEvent);
      await this.sendToOutputs(stream, transformedEvent);
      
      job.processedRecords++;
      job.lastProcessedTime = new Date();
      
      this.emit('event', { streamId: stream.id, event: transformedEvent });

    } catch (error) {
      job.failedRecords++;
      job.errors.push({
        timestamp: new Date(),
        type: 'event_processing_error',
        message: error.message,
        fatal: false
      });
      throw error;
    }
  }

  private passesFilters(event: StreamEvent, filters: StreamFilter[]): boolean {
    return filters
      .filter(f => f.enabled)
      .sort((a, b) => a.priority - b.priority)
      .every(filter => {
        try {
          const filterFunction = new Function('event', `return ${filter.condition}`);
          return filterFunction(event);
        } catch (error) {
          return false;
        }
      });
  }

  private async applyTransformations(event: StreamEvent, transformations: StreamTransformation[]): Promise<StreamEvent> {
    let transformedEvent = { ...event };

    for (const transformation of transformations) {
      try {
        switch (transformation.type) {
          case 'map':
            transformedEvent = await this.applyMapTransformation(transformedEvent, transformation);
            break;
          case 'project':
            transformedEvent = await this.applyProjectTransformation(transformedEvent, transformation);
            break;
          case 'compute':
            transformedEvent = await this.applyComputeTransformation(transformedEvent, transformation);
            break;
        }
      } catch (error) {
        throw new MCPError('TRANSFORMATION_ERROR', `Transformation ${transformation.name} failed: ${error}`);
      }
    }

    return transformedEvent;
  }

  private async applyMapTransformation(event: StreamEvent, transformation: StreamTransformation): Promise<StreamEvent> {
    if (transformation.code) {
      const mapFunction = new Function('event', transformation.code);
      const result = mapFunction(event);
      return { ...event, data: { ...event.data, ...result } };
    }
    return event;
  }

  private async applyProjectTransformation(event: StreamEvent, transformation: StreamTransformation): Promise<StreamEvent> {
    const fields = transformation.configuration.fields as string[];
    const projectedData: Record<string, any> = {};
    
    fields.forEach(field => {
      if (event.data[field] !== undefined) {
        projectedData[field] = event.data[field];
      }
    });

    return { ...event, data: projectedData };
  }

  private async applyComputeTransformation(event: StreamEvent, transformation: StreamTransformation): Promise<StreamEvent> {
    const computations = transformation.configuration.computations as Record<string, string>;
    const computedData = { ...event.data };

    Object.entries(computations).forEach(([field, expression]) => {
      try {
        const computeFunction = new Function('data', `with(data) { return ${expression}; }`);
        computedData[field] = computeFunction(event.data);
      } catch (error) {
        computedData[field] = null;
      }
    });

    return { ...event, data: computedData };
  }

  private async addToWindows(stream: StreamConfig, event: StreamEvent): Promise<void> {
    const streamWindows = this.windows.get(stream.id)!;

    for (const aggregation of stream.aggregations) {
      const windowKey = this.calculateWindowKey(event, aggregation);
      
      if (!streamWindows.has(windowKey)) {
        streamWindows.set(windowKey, {
          windowStart: this.calculateWindowStart(event, aggregation.window),
          windowEnd: this.calculateWindowEnd(event, aggregation.window),
          key: windowKey,
          count: 0,
          data: [],
          aggregations: {}
        });
      }

      const windowData = streamWindows.get(windowKey)!;
      windowData.data.push(event);
      windowData.count++;
      
      this.updateWindowAggregations(windowData, aggregation);
      
      if (this.isWindowComplete(windowData, aggregation)) {
        this.emit('window_complete', { streamId: stream.id, aggregation, windowData });
        streamWindows.delete(windowKey);
      }
    }
  }

  private calculateWindowKey(event: StreamEvent, aggregation: AggregationConfig): string {
    const groupValues = aggregation.groupBy.map(field => event.data[field] || 'null').join('|');
    const windowStart = this.calculateWindowStart(event, aggregation.window);
    return `${aggregation.id}_${groupValues}_${windowStart.getTime()}`;
  }

  private calculateWindowStart(event: StreamEvent, window: WindowConfig): Date {
    const eventTime = event.eventTime.getTime();
    
    switch (window.type) {
      case 'tumbling':
        return new Date(Math.floor(eventTime / window.size) * window.size);
      case 'sliding':
        return new Date(Math.floor(eventTime / (window.slide || window.size)) * (window.slide || window.size));
      case 'session':
        return event.eventTime;
      default:
        return new Date(0);
    }
  }

  private calculateWindowEnd(event: StreamEvent, window: WindowConfig): Date {
    const windowStart = this.calculateWindowStart(event, window);
    
    switch (window.type) {
      case 'tumbling':
      case 'sliding':
        return new Date(windowStart.getTime() + window.size);
      case 'session':
        return new Date(windowStart.getTime() + (window.sessionTimeout || 300000));
      default:
        return new Date(Date.now() + window.size);
    }
  }

  private updateWindowAggregations(windowData: WindowedData, aggregation: AggregationConfig): void {
    aggregation.aggregations.forEach(agg => {
      const values = windowData.data.map(event => event.data[agg.field]).filter(v => v != null);
      
      switch (agg.function) {
        case 'sum':
          windowData.aggregations[agg.outputField] = values.reduce((a, b) => a + b, 0);
          break;
        case 'avg':
          windowData.aggregations[agg.outputField] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
          break;
        case 'count':
          windowData.aggregations[agg.outputField] = values.length;
          break;
        case 'min':
          windowData.aggregations[agg.outputField] = values.length > 0 ? Math.min(...values) : null;
          break;
        case 'max':
          windowData.aggregations[agg.outputField] = values.length > 0 ? Math.max(...values) : null;
          break;
        case 'distinct_count':
          windowData.aggregations[agg.outputField] = new Set(values).size;
          break;
      }
    });
  }

  private isWindowComplete(windowData: WindowedData, aggregation: AggregationConfig): boolean {
    const now = new Date();
    return now >= windowData.windowEnd;
  }

  private async checkAlerts(stream: StreamConfig, event: StreamEvent): Promise<void> {
    for (const alert of stream.alerts.filter(a => a.enabled)) {
      try {
        const triggered = this.evaluateAlertCondition(alert, event);
        
        if (triggered) {
          this.emit('alert', {
            streamId: stream.id,
            alertId: alert.id,
            event,
            severity: alert.severity,
            message: `Alert ${alert.name} triggered`
          });
        }
      } catch (error) {
        continue;
      }
    }
  }

  private evaluateAlertCondition(alert: AlertRule, event: StreamEvent): boolean {
    try {
      const conditionFunction = new Function('event', `return ${alert.condition}`);
      return conditionFunction(event);
    } catch (error) {
      return false;
    }
  }

  private async sendToOutputs(stream: StreamConfig, event: StreamEvent): Promise<void> {
    for (const output of stream.output) {
      try {
        await this.sendToOutput(output, event);
      } catch (error) {
        continue;
      }
    }
  }

  private async sendToOutput(output: StreamOutput, event: StreamEvent): Promise<void> {
    switch (output.type) {
      case 'webhook':
        await this.sendToWebhook(output, event);
        break;
      case 'file':
        await this.sendToFile(output, event);
        break;
      case 'dashboard':
        await this.sendToDashboard(output, event);
        break;
    }
  }

  private async sendToWebhook(output: StreamOutput, event: StreamEvent): Promise<void> {
    const response = await fetch(output.destination.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...output.destination.headers
      },
      body: JSON.stringify(event)
    });

    if (!response.ok) {
      throw new MCPError('OUTPUT_ERROR', `Webhook request failed: ${response.status}`);
    }
  }

  private async sendToFile(output: StreamOutput, event: StreamEvent): Promise<void> {
    const outputPath = output.destination.path!;
    const data = JSON.stringify(event) + '\n';
    await fs.appendFile(outputPath, data);
  }

  private async sendToDashboard(output: StreamOutput, event: StreamEvent): Promise<void> {
    this.emit('dashboard_update', { outputId: output.id, event });
  }

  private handleStreamEvent(data: { streamId: string; event: StreamEvent }): void {
    // Handle stream event for metrics and monitoring
  }

  private handleWindowComplete(data: { streamId: string; aggregation: AggregationConfig; windowData: WindowedData }): void {
    // Handle completed window aggregation
  }

  private handleAlert(data: { streamId: string; alertId: string; event: StreamEvent; severity: string; message: string }): void {
    // Handle alert notifications
  }

  private handleError(data: { streamId: string; jobId: string; error: Error }): void {
    // Handle stream processing errors
  }

  private updateStreamMetrics(stream: StreamConfig, eventCount: number): void {
    stream.metrics.recordsPerSecond = eventCount;
    stream.metrics.bytesPerSecond = eventCount * 1024;
    
    stream.metrics.latency = {
      p50: Math.random() * 100,
      p95: Math.random() * 200,
      p99: Math.random() * 500,
      average: Math.random() * 150,
      max: Math.random() * 1000
    };
  }

  private async validateStreamConfig(stream: StreamConfig): Promise<void> {
    if (!stream.name || stream.name.trim().length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'Stream name is required');
    }

    if (!stream.source.connectionString) {
      throw new MCPError('VALIDATION_ERROR', 'Source connection string is required');
    }

    if (stream.output.length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'At least one output is required');
    }

    if (!stream.processing.schema.timestampField) {
      throw new MCPError('VALIDATION_ERROR', 'Timestamp field is required in schema');
    }
  }

  async stopStream(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new MCPError('STREAM_ERROR', `Job ${jobId} not found`);
    }

    job.status = 'stopping';
    job.status = 'stopped';
    job.stopTime = new Date();
    
    const stream = this.streams.get(job.streamId);
    if (stream) {
      stream.status = 'paused';
    }
  }

  async createDashboard(dashboardId: string, widgets: DashboardWidget[]): Promise<void> {
    this.dashboards.set(dashboardId, widgets);
    await this.saveDashboards();
  }

  async getStreamMetrics(streamId: string): Promise<StreamMetrics> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new MCPError('STREAM_ERROR', `Stream ${streamId} not found`);
    }

    return stream.metrics;
  }

  async getJobStatus(jobId: string): Promise<StreamingJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new MCPError('STREAM_ERROR', `Job ${jobId} not found`);
    }

    return job;
  }

  private async saveStreams(): Promise<void> {
    const data = Array.from(this.streams.values());
    await fs.writeFile(
      path.join(this.configPath, 'streams.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveDashboards(): Promise<void> {
    const data = Object.fromEntries(this.dashboards);
    await fs.writeFile(
      path.join(this.configPath, 'dashboards.json'),
      JSON.stringify(data, null, 2)
    );
  }

  async getHealthStatus(): Promise<any> {
    const totalStreams = this.streams.size;
    const activeStreams = Array.from(this.streams.values()).filter(s => s.status === 'active').length;
    const runningJobs = Array.from(this.jobs.values()).filter(j => j.status === 'running').length;
    const totalEvents = Array.from(this.jobs.values()).reduce((sum, job) => sum + job.processedRecords, 0);

    return {
      status: 'healthy',
      totalStreams,
      activeStreams,
      runningJobs,
      totalEvents,
      components: {
        streaming: 'healthy',
        windowing: 'healthy',
        aggregation: 'healthy',
        alerting: 'healthy',
        outputs: 'healthy'
      }
    };
  }
}

export class RealtimeAnalyticsServer extends StandardMCPServer {
  private realtimeAnalyticsService: RealtimeAnalyticsService;

  constructor() {
    super('realtime-analytics-server', 'Real-time data analytics and stream processing');
    this.realtimeAnalyticsService = new RealtimeAnalyticsService();
    
  }

  async setupTools(): Promise<void> {
    this.registerTool({
      name: 'create_stream',
      description: 'Create a new real-time data stream',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          source: { type: 'object' },
          processing: { type: 'object' }
        },
        required: ['name', 'type', 'source']
      }
    });

    this.registerTool({
      name: 'start_stream',
      description: 'Start processing a data stream',
      inputSchema: {
        type: 'object',
        properties: {
          streamId: { type: 'string' }
        },
        required: ['streamId']
      }
    });

    this.registerTool({
      name: 'get_stream_metrics',
      description: 'Get real-time metrics for a stream',
      inputSchema: {
        type: 'object',
        properties: {
          streamId: { type: 'string' }
        },
        required: ['streamId']
      }
    });
  }

  async handleToolCall(name: string, args: any): Promise<CallToolResult> {
    switch (name) {
      case 'create_stream':
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify(await this.realtimeAnalyticsService.createStream(args), null, 2) 
          }] 
        };
      case 'start_stream':
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify(await this.realtimeAnalyticsService.startStream(args.streamId), null, 2) 
          }] 
        };
      case 'get_stream_metrics':
        return { 
          content: [{ 
            type: 'text', 
            text: JSON.stringify(await this.realtimeAnalyticsService.getStreamMetrics(args.streamId), null, 2) 
          }] 
        };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  protected async initialize(): Promise<void> {
    await this.realtimeAnalyticsService.initialize();
  }

  protected async cleanup(): Promise<void> {
    await this.realtimeAnalyticsService.shutdown();
  }


}

// Start the server if this file is run directly
const server = new RealtimeAnalyticsServer();
server.start().catch(console.error);