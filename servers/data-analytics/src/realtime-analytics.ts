import { BaseServer } from '../../shared/src/base-server';
import { MCPError } from '../../shared/src/errors';
import { withPerformanceMonitoring } from '../../shared/src/monitoring';
import { withRetry } from '../../shared/src/retry';
import { HealthChecker } from '../../shared/src/health';
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
  watermark: WatermarkConfig;
  checkpointing: CheckpointConfig;
  parallelism: number;
  backpressure: BackpressureConfig;
  status: 'active' | 'paused' | 'stopped' | 'error';
  created: Date;
  updated: Date;
  metrics: StreamMetrics;
}

export interface StreamSource {
  connectionString: string;
  topic?: string;
  queue?: string;
  channel?: string;
  partition?: number;
  offset?: 'earliest' | 'latest' | 'timestamp';
  batchSize: number;
  pollInterval: number;
  timeout: number;
  authentication?: StreamAuth;
  serialization: 'json' | 'avro' | 'protobuf' | 'csv' | 'binary';
  compression?: 'gzip' | 'snappy' | 'lz4' | 'zstd';
}

export interface StreamAuth {
  type: 'none' | 'basic' | 'oauth' | 'sasl' | 'ssl';
  username?: string;
  password?: string;
  token?: string;
  mechanism?: string;
  certificates?: {
    ca?: string;
    cert?: string;
    key?: string;
  };
}

export interface StreamProcessingConfig {
  mode: 'event_time' | 'processing_time' | 'ingestion_time';
  schema: StreamSchema;
  transformations: StreamTransformation[];
  filters: StreamFilter[];
  enrichments: StreamEnrichment[];
  deduplication?: DeduplicationConfig;
  ordering?: OrderingConfig;
}

export interface StreamSchema {
  version: string;
  fields: StreamField[];
  timestampField: string;
  keyFields: string[];
  partitionField?: string;
  versionField?: string;
}

export interface StreamField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'object' | 'array';
  nullable: boolean;
  defaultValue?: any;
  format?: string;
  precision?: number;
  scale?: number;
}

export interface StreamTransformation {
  id: string;
  name: string;
  type: 'map' | 'flatmap' | 'keyby' | 'project' | 'compute' | 'parse' | 'format';
  configuration: Record<string, any>;
  code?: string;
  language?: 'javascript' | 'sql';
  parallelism?: number;
}

export interface StreamFilter {
  id: string;
  name: string;
  condition: string;
  enabled: boolean;
  priority: number;
}

export interface StreamEnrichment {
  id: string;
  name: string;
  type: 'lookup' | 'join' | 'cache' | 'api' | 'ml_model';
  configuration: EnrichmentConfig;
  caching?: CacheConfig;
  timeout: number;
}

export interface EnrichmentConfig {
  source: string;
  keyMapping: Record<string, string>;
  outputMapping: Record<string, string>;
  fallbackValues?: Record<string, any>;
  errorHandling: 'ignore' | 'default' | 'fail';
}

export interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
  strategy: 'lru' | 'lfu' | 'ttl' | 'fifo';
}

export interface DeduplicationConfig {
  enabled: boolean;
  keyFields: string[];
  timeWindow: number;
  strategy: 'first' | 'last' | 'custom';
  customLogic?: string;
}

export interface OrderingConfig {
  enabled: boolean;
  timestampField: string;
  maxOutOfOrder: number;
  latenessThreshold: number;
}

export interface StreamOutput {
  id: string;
  name: string;
  type: 'kafka' | 'redis' | 'database' | 'file' | 'webhook' | 'elasticsearch' | 'dashboard';
  destination: OutputDestination;
  format: 'json' | 'avro' | 'csv' | 'parquet';
  batching?: BatchConfig;
  compression?: string;
  encryption?: EncryptionConfig;
  retries: RetryConfig;
}

export interface OutputDestination {
  url: string;
  topic?: string;
  database?: string;
  table?: string;
  index?: string;
  path?: string;
  headers?: Record<string, string>;
  authentication?: StreamAuth;
}

export interface BatchConfig {
  enabled: boolean;
  size: number;
  timeout: number;
  flushOnCheckpoint: boolean;
}

export interface EncryptionConfig {
  enabled: boolean;
  algorithm: string;
  keyId: string;
  rotationInterval?: number;
}

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  deadLetterTopic?: string;
}

export interface WindowConfig {
  type: 'tumbling' | 'sliding' | 'session' | 'global';
  size: number;
  slide?: number;
  sessionTimeout?: number;
  grace?: number;
  allowedLateness: number;
}

export interface AggregationConfig {
  id: string;
  name: string;
  window: WindowConfig;
  groupBy: string[];
  aggregations: AggregationFunction[];
  outputTopic?: string;
  triggers: AggregationTrigger[];
}

export interface AggregationFunction {
  field: string;
  function: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'distinct_count' | 'percentile' | 'stddev' | 'variance';
  parameters?: Record<string, any>;
  outputField: string;
}

export interface AggregationTrigger {
  type: 'time' | 'count' | 'size' | 'custom';
  threshold: number;
  condition?: string;
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
  groupBy?: string[];
}

export interface WatermarkConfig {
  strategy: 'fixed' | 'bounded' | 'heuristic';
  maxOutOfOrder: number;
  idlenessTimeout?: number;
  periodicInterval: number;
}

export interface CheckpointConfig {
  enabled: boolean;
  interval: number;
  storage: 'file' | 'redis' | 'database' | 's3';
  path: string;
  compression: boolean;
  retention: number;
}

export interface BackpressureConfig {
  enabled: boolean;
  strategy: 'drop' | 'block' | 'spill' | 'sample';
  threshold: number;
  spillPath?: string;
  samplingRate?: number;
}

export interface StreamMetrics {
  recordsPerSecond: number;
  bytesPerSecond: number;
  latency: LatencyMetrics;
  errors: ErrorMetrics;
  backpressure: BackpressureMetrics;
  checkpoint: CheckpointMetrics;
  watermark: WatermarkMetrics;
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

export interface BackpressureMetrics {
  isBackpressured: boolean;
  queueSize: number;
  dropRate: number;
  spillSize?: number;
}

export interface CheckpointMetrics {
  lastCheckpoint: Date;
  checkpointDuration: number;
  checkpointSize: number;
  failureCount: number;
}

export interface WatermarkMetrics {
  currentWatermark: Date;
  lag: number;
  progressRate: number;
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
  headers?: Record<string, string>;
  metadata?: Record<string, any>;
}

export interface WindowedData {
  windowStart: Date;
  windowEnd: Date;
  key: string;
  count: number;
  data: any[];
  aggregations: Record<string, any>;
  metadata: Record<string, any>;
}

export interface StreamingJob {
  id: string;
  streamId: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed' | 'recovering';
  startTime: Date;
  stopTime?: Date;
  processedRecords: number;
  failedRecords: number;
  lastProcessedTime?: Date;
  currentWatermark?: Date;
  checkpoints: JobCheckpoint[];
  errors: JobError[];
  performance: JobPerformance;
}

export interface JobCheckpoint {
  id: string;
  timestamp: Date;
  state: any;
  size: number;
  duration: number;
  success: boolean;
}

export interface JobError {
  timestamp: Date;
  type: string;
  message: string;
  stack?: string;
  data?: any;
  fatal: boolean;
}

export interface JobPerformance {
  throughput: number;
  latency: number;
  cpuUsage: number;
  memoryUsage: number;
  networkUsage: number;
}

export interface DashboardWidget {
  id: string;
  type: 'line_chart' | 'bar_chart' | 'gauge' | 'table' | 'map' | 'text' | 'alert_list';
  title: string;
  description: string;
  position: { x: number; y: number; width: number; height: number };
  config: WidgetConfig;
  data: WidgetData;
  refreshInterval: number;
  lastUpdated: Date;
}

export interface WidgetConfig {
  streamId?: string;
  metricName?: string;
  aggregation?: string;
  timeRange?: number;
  groupBy?: string[];
  filters?: Record<string, any>;
  visualization?: VisualizationConfig;
}

export interface VisualizationConfig {
  xAxis?: string;
  yAxis?: string;
  colorBy?: string;
  size?: string;
  threshold?: number;
  colors?: string[];
  formatters?: Record<string, string>;
}

export interface WidgetData {
  series: DataSeries[];
  labels: string[];
  metadata: Record<string, any>;
  lastUpdate: Date;
}

export interface DataSeries {
  name: string;
  data: DataPoint[];
  color?: string;
  type?: 'line' | 'bar' | 'area';
}

export interface DataPoint {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
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
    this.healthChecker = new HealthChecker();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.on('event', this.handleStreamEvent.bind(this));
    this.on('window_complete', this.handleWindowComplete.bind(this));
    this.on('alert', this.handleAlert.bind(this));
    this.on('error', this.handleError.bind(this));
  }

  @withPerformanceMonitoring('realtime-analytics.create-stream')
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
          errors: { total: 0, rate: 0, byType: {} },
          backpressure: { isBackpressured: false, queueSize: 0, dropRate: 0 },
          checkpoint: { lastCheckpoint: new Date(), checkpointDuration: 0, checkpointSize: 0, failureCount: 0 },
          watermark: { currentWatermark: new Date(), lag: 0, progressRate: 0 }
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

  @withPerformanceMonitoring('realtime-analytics.start-stream')
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
        checkpoints: [],
        errors: [],
        performance: {
          throughput: 0,
          latency: 0,
          cpuUsage: 0,
          memoryUsage: 0,
          networkUsage: 0
        }
      };

      this.jobs.set(jobId, job);
      stream.status = 'active';

      // Start streaming processing
      this.startStreamProcessing(stream, job);

      return jobId;
    } catch (error) {
      throw new MCPError('STREAM_ERROR', `Failed to start stream: ${error}`);
    }
  }

  private async startStreamProcessing(stream: StreamConfig, job: StreamingJob): Promise<void> {
    try {
      job.status = 'running';
      
      // Simulate event stream processing
      const processInterval = setInterval(async () => {
        if (job.status !== 'running') {
          clearInterval(processInterval);
          return;
        }

        try {
          // Generate sample events
          const events = await this.readEventsFromSource(stream);
          
          for (const event of events) {
            await this.processEvent(stream, event, job);
          }

          // Update metrics
          this.updateStreamMetrics(stream, events.length);
          
          // Perform checkpoint if needed
          if (this.shouldCheckpoint(stream, job)) {
            await this.performCheckpoint(stream, job);
          }

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
    // Simulate reading from various stream sources
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

  @withPerformanceMonitoring('realtime-analytics.process-event')
  private async processEvent(stream: StreamConfig, event: StreamEvent, job: StreamingJob): Promise<void> {
    try {
      // Apply filters
      if (!this.passesFilters(event, stream.processing.filters)) {
        return;
      }

      // Apply transformations
      const transformedEvent = await this.applyTransformations(event, stream.processing.transformations);
      
      // Apply enrichments
      const enrichedEvent = await this.applyEnrichments(transformedEvent, stream.processing.enrichments);
      
      // Add to windows
      await this.addToWindows(stream, enrichedEvent);
      
      // Check alerts
      await this.checkAlerts(stream, enrichedEvent);
      
      // Send to outputs
      await this.sendToOutputs(stream, enrichedEvent);
      
      job.processedRecords++;
      job.lastProcessedTime = new Date();
      
      this.emit('event', { streamId: stream.id, event: enrichedEvent });

    } catch (error) {
      job.failedRecords++;
      job.errors.push({
        timestamp: new Date(),
        type: 'event_processing_error',
        message: error.message,
        data: event,
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
          case 'parse':
            transformedEvent = await this.applyParseTransformation(transformedEvent, transformation);
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

  private async applyParseTransformation(event: StreamEvent, transformation: StreamTransformation): Promise<StreamEvent> {
    const field = transformation.configuration.field as string;
    const pattern = transformation.configuration.pattern as string;
    const outputFields = transformation.configuration.outputFields as string[];

    try {
      const regex = new RegExp(pattern);
      const match = regex.exec(event.data[field]);
      
      if (match && outputFields) {
        const parsedData = { ...event.data };
        outputFields.forEach((outputField, index) => {
          parsedData[outputField] = match[index + 1] || null;
        });
        return { ...event, data: parsedData };
      }
    } catch (error) {
      // Parsing failed, return original event
    }

    return event;
  }

  private async applyEnrichments(event: StreamEvent, enrichments: StreamEnrichment[]): Promise<StreamEvent> {
    let enrichedEvent = { ...event };

    for (const enrichment of enrichments) {
      try {
        enrichedEvent = await this.applyEnrichment(enrichedEvent, enrichment);
      } catch (error) {
        // Continue with other enrichments if one fails
        continue;
      }
    }

    return enrichedEvent;
  }

  private async applyEnrichment(event: StreamEvent, enrichment: StreamEnrichment): Promise<StreamEvent> {
    switch (enrichment.type) {
      case 'lookup':
        return await this.applyLookupEnrichment(event, enrichment);
      case 'cache':
        return await this.applyCacheEnrichment(event, enrichment);
      default:
        return event;
    }
  }

  private async applyLookupEnrichment(event: StreamEvent, enrichment: StreamEnrichment): Promise<StreamEvent> {
    // Simulated lookup enrichment
    const enrichedData = { ...event.data };
    
    Object.entries(enrichment.configuration.outputMapping).forEach(([outputField, sourceField]) => {
      enrichedData[outputField] = `enriched_${event.data[sourceField] || 'unknown'}`;
    });

    return { ...event, data: enrichedData };
  }

  private async applyCacheEnrichment(event: StreamEvent, enrichment: StreamEnrichment): Promise<StreamEvent> {
    // Simulated cache enrichment
    return event;
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
          aggregations: {},
          metadata: {}
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
    
    // Check time-based completion
    if (now >= windowData.windowEnd) {
      return true;
    }

    // Check trigger-based completion
    return aggregation.triggers.some(trigger => {
      switch (trigger.type) {
        case 'count':
          return windowData.count >= trigger.threshold;
        case 'size':
          return windowData.data.length >= trigger.threshold;
        case 'custom':
          if (trigger.condition) {
            try {
              const conditionFunction = new Function('window', `return ${trigger.condition}`);
              return conditionFunction(windowData);
            } catch (error) {
              return false;
            }
          }
          return false;
        default:
          return false;
      }
    });
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
        // Continue with other alerts if one fails
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
        // Continue with other outputs if one fails
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
    // Update dashboard widgets with new data
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
    const now = Date.now();
    
    // Update records per second
    stream.metrics.recordsPerSecond = eventCount;
    
    // Update bytes per second (estimated)
    stream.metrics.bytesPerSecond = eventCount * 1024; // Rough estimate
    
    // Update latency metrics (simulated)
    stream.metrics.latency = {
      p50: Math.random() * 100,
      p95: Math.random() * 200,
      p99: Math.random() * 500,
      average: Math.random() * 150,
      max: Math.random() * 1000
    };
  }

  private shouldCheckpoint(stream: StreamConfig, job: StreamingJob): boolean {
    if (!stream.checkpointing.enabled) return false;
    
    const timeSinceLastCheckpoint = Date.now() - stream.metrics.checkpoint.lastCheckpoint.getTime();
    return timeSinceLastCheckpoint >= stream.checkpointing.interval;
  }

  private async performCheckpoint(stream: StreamConfig, job: StreamingJob): Promise<void> {
    try {
      const checkpointId = `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const startTime = Date.now();
      
      const checkpoint: JobCheckpoint = {
        id: checkpointId,
        timestamp: new Date(),
        state: {
          jobId: job.id,
          processedRecords: job.processedRecords,
          watermark: stream.metrics.watermark.currentWatermark
        },
        size: 0,
        duration: 0,
        success: false
      };

      // Simulate checkpoint creation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      checkpoint.duration = Date.now() - startTime;
      checkpoint.size = Math.floor(Math.random() * 1024 * 1024); // Random size
      checkpoint.success = true;
      
      job.checkpoints.push(checkpoint);
      stream.metrics.checkpoint.lastCheckpoint = new Date();
      stream.metrics.checkpoint.checkpointDuration = checkpoint.duration;
      stream.metrics.checkpoint.checkpointSize = checkpoint.size;
      
    } catch (error) {
      stream.metrics.checkpoint.failureCount++;
      throw error;
    }
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

  @withPerformanceMonitoring('realtime-analytics.stop-stream')
  async stopStream(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new MCPError('STREAM_ERROR', `Job ${jobId} not found`);
    }

    job.status = 'stopping';
    
    // Perform final checkpoint
    const stream = this.streams.get(job.streamId);
    if (stream && stream.checkpointing.enabled) {
      await this.performCheckpoint(stream, job);
    }

    job.status = 'stopped';
    job.stopTime = new Date();
    
    if (stream) {
      stream.status = 'paused';
    }
  }

  @withPerformanceMonitoring('realtime-analytics.create-dashboard')
  async createDashboard(dashboardId: string, widgets: DashboardWidget[]): Promise<void> {
    this.dashboards.set(dashboardId, widgets);
    await this.saveDashboards();
  }

  @withPerformanceMonitoring('realtime-analytics.get-stream-metrics')
  async getStreamMetrics(streamId: string): Promise<StreamMetrics> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new MCPError('STREAM_ERROR', `Stream ${streamId} not found`);
    }

    return stream.metrics;
  }

  @withPerformanceMonitoring('realtime-analytics.get-job-status')
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
      },
      metrics: {
        eventsPerSecond: this.calculateOverallThroughput(),
        averageLatency: this.calculateAverageLatency(),
        errorRate: this.calculateOverallErrorRate(),
        activeAlerts: this.getActiveAlertsCount()
      }
    };
  }

  private calculateOverallThroughput(): number {
    const activeStreams = Array.from(this.streams.values()).filter(s => s.status === 'active');
    return activeStreams.reduce((sum, stream) => sum + stream.metrics.recordsPerSecond, 0);
  }

  private calculateAverageLatency(): number {
    const activeStreams = Array.from(this.streams.values()).filter(s => s.status === 'active');
    if (activeStreams.length === 0) return 0;
    
    const totalLatency = activeStreams.reduce((sum, stream) => sum + stream.metrics.latency.average, 0);
    return totalLatency / activeStreams.length;
  }

  private calculateOverallErrorRate(): number {
    const allJobs = Array.from(this.jobs.values());
    if (allJobs.length === 0) return 0;
    
    const totalProcessed = allJobs.reduce((sum, job) => sum + job.processedRecords, 0);
    const totalFailed = allJobs.reduce((sum, job) => sum + job.failedRecords, 0);
    
    return totalProcessed > 0 ? totalFailed / totalProcessed : 0;
  }

  private getActiveAlertsCount(): number {
    return Array.from(this.streams.values())
      .flatMap(stream => stream.alerts)
      .filter(alert => alert.enabled)
      .length;
  }
}

export class RealtimeAnalyticsMCPServer extends BaseServer {
  private realtimeAnalyticsService: RealtimeAnalyticsService;

  constructor() {
    super('realtime-analytics');
    this.realtimeAnalyticsService = new RealtimeAnalyticsService();
  }

  protected setupRoutes(): void {
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.realtimeAnalyticsService.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/streams', async (req, res) => {
      try {
        const streamId = await this.realtimeAnalyticsService.createStream(req.body);
        res.json({ id: streamId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/streams/:id/start', async (req, res) => {
      try {
        const jobId = await this.realtimeAnalyticsService.startStream(req.params.id);
        res.json({ jobId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/jobs/:id/stop', async (req, res) => {
      try {
        await this.realtimeAnalyticsService.stopStream(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/streams/:id/metrics', async (req, res) => {
      try {
        const metrics = await this.realtimeAnalyticsService.getStreamMetrics(req.params.id);
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/jobs/:id/status', async (req, res) => {
      try {
        const status = await this.realtimeAnalyticsService.getJobStatus(req.params.id);
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/dashboards/:id', async (req, res) => {
      try {
        await this.realtimeAnalyticsService.createDashboard(req.params.id, req.body.widgets);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  protected getMCPTools() {
    return [
      {
        name: 'create_stream',
        description: 'Create a new real-time data stream',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['kafka', 'redis_stream', 'websocket', 'sse', 'mqtt', 'rabbitmq', 'kinesis'] },
            source: { type: 'object' },
            processing: { type: 'object' },
            output: { type: 'array' },
            windowing: { type: 'object' },
            aggregations: { type: 'array' },
            alerts: { type: 'array' },
            watermark: { type: 'object' },
            checkpointing: { type: 'object' },
            parallelism: { type: 'number' },
            backpressure: { type: 'object' },
            status: { type: 'string', enum: ['active', 'paused', 'stopped', 'error'] }
          },
          required: ['name', 'type', 'source', 'processing', 'output', 'windowing']
        }
      },
      {
        name: 'start_stream',
        description: 'Start a real-time data stream',
        inputSchema: {
          type: 'object',
          properties: {
            streamId: { type: 'string' }
          },
          required: ['streamId']
        }
      },
      {
        name: 'stop_stream',
        description: 'Stop a streaming job',
        inputSchema: {
          type: 'object',
          properties: {
            jobId: { type: 'string' }
          },
          required: ['jobId']
        }
      },
      {
        name: 'get_stream_metrics',
        description: 'Get real-time metrics for a stream',
        inputSchema: {
          type: 'object',
          properties: {
            streamId: { type: 'string' }
          },
          required: ['streamId']
        }
      },
      {
        name: 'get_job_status',
        description: 'Get status of a streaming job',
        inputSchema: {
          type: 'object',
          properties: {
            jobId: { type: 'string' }
          },
          required: ['jobId']
        }
      },
      {
        name: 'create_dashboard',
        description: 'Create a real-time analytics dashboard',
        inputSchema: {
          type: 'object',
          properties: {
            dashboardId: { type: 'string' },
            widgets: { type: 'array' }
          },
          required: ['dashboardId', 'widgets']
        }
      }
    ];
  }

  protected async handleMCPRequest(method: string, params: any): Promise<any> {
    switch (method) {
      case 'create_stream':
        return { id: await this.realtimeAnalyticsService.createStream(params) };

      case 'start_stream':
        return { jobId: await this.realtimeAnalyticsService.startStream(params.streamId) };

      case 'stop_stream':
        await this.realtimeAnalyticsService.stopStream(params.jobId);
        return { success: true };

      case 'get_stream_metrics':
        return await this.realtimeAnalyticsService.getStreamMetrics(params.streamId);

      case 'get_job_status':
        return await this.realtimeAnalyticsService.getJobStatus(params.jobId);

      case 'create_dashboard':
        await this.realtimeAnalyticsService.createDashboard(params.dashboardId, params.widgets);
        return { success: true };

      default:
        throw new MCPError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
    }
  }
}