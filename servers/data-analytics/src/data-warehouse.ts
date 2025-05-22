import { BaseServer } from '../../../shared/src/base-server';
import { MCPError } from '../../../shared/src/errors';
import { withPerformanceMonitoring } from '../../../shared/src/monitoring';
import { withRetry } from '../../../shared/src/retry';
import { HealthChecker } from '../../../shared/src/health';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DataWarehouse {
  id: string;
  name: string;
  type: 'snowflake' | 'redshift' | 'bigquery' | 'databricks' | 'synapse' | 'clickhouse' | 'postgresql';
  connection: WarehouseConnection;
  schemas: WarehouseSchema[];
  configuration: WarehouseConfig;
  monitoring: WarehouseMonitoring;
  security: WarehouseSecurity;
  performance: PerformanceConfig;
  status: 'active' | 'inactive' | 'maintenance' | 'error';
  created: Date;
  updated: Date;
  metadata: Record<string, any>;
}

export interface WarehouseConnection {
  host: string;
  port: number;
  database: string;
  warehouse?: string;
  account?: string;
  region?: string;
  project?: string;
  catalog?: string;
  schema: string;
  credentials: WarehouseCredentials;
  connectionPool: ConnectionPoolConfig;
  ssl: SSLConfiguration;
  timeout: number;
  retryPolicy: ConnectionRetryPolicy;
}

export interface WarehouseCredentials {
  type: 'basic' | 'oauth' | 'service_account' | 'iam' | 'key_pair';
  username?: string;
  password?: string;
  token?: string;
  privateKey?: string;
  keyFile?: string;
  roleArn?: string;
  externalId?: string;
  sessionDuration?: number;
}

export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  acquireTimeout: number;
  createTimeout: number;
  destroyTimeout: number;
  idleTimeout: number;
  reapInterval: number;
  createRetryInterval: number;
}

export interface SSLConfiguration {
  enabled: boolean;
  mode: 'disable' | 'require' | 'verify-ca' | 'verify-full';
  ca?: string;
  cert?: string;
  key?: string;
  passphrase?: string;
}

export interface ConnectionRetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface WarehouseSchema {
  name: string;
  tables: WarehouseTable[];
  views: WarehouseView[];
  materialized_views: MaterializedView[];
  functions: WarehouseFunction[];
  procedures: WarehouseProcedure[];
  permissions: SchemaPermissions;
}

export interface WarehouseTable {
  name: string;
  type: 'fact' | 'dimension' | 'staging' | 'lookup' | 'bridge' | 'temporal';
  columns: TableColumn[];
  constraints: TableConstraint[];
  indexes: TableIndex[];
  partitioning: PartitionConfig;
  clustering: ClusterConfig;
  compression: CompressionConfig;
  statistics: TableStatistics;
  metadata: TableMetadata;
}

export interface TableColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue?: any;
  precision?: number;
  scale?: number;
  length?: number;
  collation?: string;
  encoding?: string;
  compression?: string;
  comment?: string;
  tags: string[];
}

export interface TableConstraint {
  name: string;
  type: 'primary_key' | 'foreign_key' | 'unique' | 'check' | 'not_null';
  columns: string[];
  referencedTable?: string;
  referencedColumns?: string[];
  checkExpression?: string;
  deferrable?: boolean;
  initially?: 'deferred' | 'immediate';
}

export interface TableIndex {
  name: string;
  type: 'btree' | 'hash' | 'bitmap' | 'columnstore' | 'spatial';
  columns: IndexColumn[];
  unique: boolean;
  partial?: string;
  include?: string[];
  fillFactor?: number;
  storage?: IndexStorage;
}

export interface IndexColumn {
  name: string;
  order: 'asc' | 'desc';
  nullsFirst?: boolean;
  expression?: string;
}

export interface IndexStorage {
  tablespace?: string;
  compressLevel?: number;
  bloomFilter?: boolean;
}

export interface PartitionConfig {
  enabled: boolean;
  type: 'range' | 'list' | 'hash' | 'composite';
  columns: string[];
  strategy: PartitionStrategy;
  retention: PartitionRetention;
}

export interface PartitionStrategy {
  rangeType?: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  customExpression?: string;
  hashBuckets?: number;
  listValues?: any[];
}

export interface PartitionRetention {
  enabled: boolean;
  keepDays: number;
  archiveLocation?: string;
  compressionLevel?: number;
}

export interface ClusterConfig {
  enabled: boolean;
  keys: string[];
  algorithm: 'linear' | 'interleaved';
  autoCluster: boolean;
}

export interface CompressionConfig {
  enabled: boolean;
  algorithm: 'gzip' | 'lz4' | 'snappy' | 'zstd' | 'brotli';
  level: number;
  columnLevel?: Record<string, string>;
}

export interface TableStatistics {
  rowCount: number;
  sizeBytes: number;
  lastAnalyzed: Date;
  cardinality: Record<string, number>;
  nullCounts: Record<string, number>;
  histogram: Record<string, Histogram>;
}

export interface Histogram {
  buckets: HistogramBucket[];
  totalCount: number;
  nullCount: number;
  distinctCount: number;
}

export interface HistogramBucket {
  lowerBound: any;
  upperBound: any;
  count: number;
  frequency: number;
}

export interface TableMetadata {
  owner: string;
  created: Date;
  lastModified: Date;
  description?: string;
  tags: string[];
  businessGlossary?: BusinessGlossaryEntry[];
  dataLineage?: DataLineage;
  qualityRules?: QualityRule[];
}

export interface BusinessGlossaryEntry {
  term: string;
  definition: string;
  source: string;
  steward: string;
}

export interface DataLineage {
  upstream: LineageEntry[];
  downstream: LineageEntry[];
  transformations: TransformationLineage[];
}

export interface LineageEntry {
  type: 'table' | 'view' | 'file' | 'api' | 'stream';
  name: string;
  database?: string;
  schema?: string;
  columns?: string[];
  relationship: 'source' | 'target' | 'lookup';
}

export interface TransformationLineage {
  type: 'etl' | 'elt' | 'streaming' | 'ml' | 'aggregation';
  name: string;
  description: string;
  code?: string;
  schedule?: string;
}

export interface QualityRule {
  id: string;
  name: string;
  type: 'completeness' | 'accuracy' | 'consistency' | 'validity' | 'uniqueness';
  expression: string;
  threshold: number;
  enabled: boolean;
}

export interface WarehouseView {
  name: string;
  type: 'view' | 'secure_view';
  definition: string;
  columns: ViewColumn[];
  dependencies: string[];
  security: ViewSecurity;
  materialized?: MaterializationConfig;
}

export interface ViewColumn {
  name: string;
  dataType: string;
  expression?: string;
  comment?: string;
}

export interface ViewSecurity {
  rowLevelSecurity: boolean;
  columnLevelSecurity: boolean;
  maskingPolicies?: MaskingPolicy[];
  accessPolicies?: AccessPolicy[];
}

export interface MaskingPolicy {
  name: string;
  columns: string[];
  maskingFunction: string;
  conditions?: string[];
}

export interface AccessPolicy {
  name: string;
  principals: string[];
  conditions?: string[];
  permissions: string[];
}

export interface MaterializedView {
  name: string;
  definition: string;
  refreshPolicy: RefreshPolicy;
  partitioning?: PartitionConfig;
  clustering?: ClusterConfig;
  dependencies: string[];
  lastRefresh: Date;
  nextRefresh: Date;
  refreshDuration: number;
  refreshErrors: RefreshError[];
}

export interface RefreshPolicy {
  type: 'manual' | 'automatic' | 'scheduled';
  schedule?: string;
  incrementalKey?: string;
  refreshCondition?: string;
  dependencyRefresh: boolean;
}

export interface RefreshError {
  timestamp: Date;
  error: string;
  details: Record<string, any>;
  resolved: boolean;
}

export interface MaterializationConfig {
  enabled: boolean;
  autoRefresh: boolean;
  refreshInterval: number;
  incrementalColumn?: string;
  refreshCondition?: string;
}

export interface WarehouseFunction {
  name: string;
  type: 'scalar' | 'table' | 'aggregate' | 'window';
  language: 'sql' | 'javascript' | 'python' | 'java' | 'scala';
  parameters: FunctionParameter[];
  returnType: string;
  body: string;
  security: 'definer' | 'invoker';
  deterministic: boolean;
}

export interface FunctionParameter {
  name: string;
  dataType: string;
  defaultValue?: any;
  nullable: boolean;
}

export interface WarehouseProcedure {
  name: string;
  language: 'sql' | 'javascript' | 'python' | 'java';
  parameters: ProcedureParameter[];
  body: string;
  security: 'definer' | 'invoker';
  transactional: boolean;
}

export interface ProcedureParameter {
  name: string;
  dataType: string;
  mode: 'in' | 'out' | 'inout';
  defaultValue?: any;
}

export interface SchemaPermissions {
  owner: string;
  grants: PermissionGrant[];
  roles: RoleAssignment[];
}

export interface PermissionGrant {
  principal: string;
  principalType: 'user' | 'role' | 'group';
  permissions: string[];
  grantable: boolean;
  conditions?: string[];
}

export interface RoleAssignment {
  role: string;
  principal: string;
  principalType: 'user' | 'role' | 'group';
  inherited: boolean;
}

export interface WarehouseConfig {
  autoSuspend: boolean;
  autoResume: boolean;
  suspendTimeout: number;
  multiCluster: MultiClusterConfig;
  resourceMonitor: ResourceMonitorConfig;
  queryOptimization: QueryOptimizationConfig;
  caching: CachingConfig;
  compression: GlobalCompressionConfig;
}

export interface MultiClusterConfig {
  enabled: boolean;
  minClusters: number;
  maxClusters: number;
  scalingPolicy: 'standard' | 'economy';
  autoScale: boolean;
}

export interface ResourceMonitorConfig {
  enabled: boolean;
  creditQuota: number;
  warningThreshold: number;
  suspendThreshold: number;
  notifications: string[];
  resetSchedule: string;
}

export interface QueryOptimizationConfig {
  resultCaching: boolean;
  queryAcceleration: boolean;
  searchOptimization: boolean;
  statisticsUpdate: 'auto' | 'manual';
  costBasedOptimizer: boolean;
}

export interface CachingConfig {
  resultCache: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
  };
  metadataCache: {
    enabled: boolean;
    ttl: number;
  };
  schemaCache: {
    enabled: boolean;
    ttl: number;
  };
}

export interface GlobalCompressionConfig {
  defaultAlgorithm: string;
  columnTypes: Record<string, string>;
  compressionRatio: number;
  autoCompression: boolean;
}

export interface WarehouseMonitoring {
  queryMonitoring: QueryMonitoringConfig;
  performanceMonitoring: PerformanceMonitoringConfig;
  usageMonitoring: UsageMonitoringConfig;
  alerting: AlertingConfig;
}

export interface QueryMonitoringConfig {
  enabled: boolean;
  logAllQueries: boolean;
  logLongRunningQueries: boolean;
  longRunningThreshold: number;
  logExpensiveQueries: boolean;
  expensiveQueryThreshold: number;
  retention: number;
}

export interface PerformanceMonitoringConfig {
  enabled: boolean;
  metrics: string[];
  samplingRate: number;
  aggregationInterval: number;
  retention: number;
}

export interface UsageMonitoringConfig {
  enabled: boolean;
  trackCredits: boolean;
  trackStorage: boolean;
  trackQueries: boolean;
  trackUsers: boolean;
  reportingInterval: number;
}

export interface AlertingConfig {
  enabled: boolean;
  rules: AlertRule[];
  channels: AlertChannel[];
  cooldownPeriod: number;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
  evaluationInterval: number;
}

export interface AlertChannel {
  id: string;
  type: 'email' | 'slack' | 'webhook' | 'pagerduty';
  configuration: Record<string, any>;
  enabled: boolean;
}

export interface WarehouseSecurity {
  networkSecurity: NetworkSecurityConfig;
  authentication: AuthenticationConfig;
  authorization: AuthorizationConfig;
  encryption: EncryptionConfig;
  auditing: AuditingConfig;
  masking: DataMaskingConfig;
}

export interface NetworkSecurityConfig {
  allowedIPs: string[];
  privateLink: boolean;
  vpnRequired: boolean;
  firewallRules: FirewallRule[];
}

export interface FirewallRule {
  name: string;
  source: string;
  destination: string;
  ports: number[];
  protocol: 'tcp' | 'udp' | 'icmp';
  action: 'allow' | 'deny';
}

export interface AuthenticationConfig {
  mfa: boolean;
  sso: boolean;
  federatedAuth: boolean;
  passwordPolicy: PasswordPolicy;
  sessionTimeout: number;
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
  maxAge: number;
  historyCount: number;
}

export interface AuthorizationConfig {
  rbac: boolean;
  abac: boolean;
  defaultRole: string;
  roleHierarchy: boolean;
  privilegeEscalation: boolean;
}

export interface EncryptionConfig {
  atRest: boolean;
  inTransit: boolean;
  keyManagement: 'customer' | 'aws' | 'azure' | 'gcp';
  rotationEnabled: boolean;
  rotationInterval: number;
}

export interface AuditingConfig {
  enabled: boolean;
  logQueries: boolean;
  logDDL: boolean;
  logDML: boolean;
  logLogins: boolean;
  logPrivilegeChanges: boolean;
  retention: number;
  destination: 'warehouse' | 'external' | 'both';
}

export interface DataMaskingConfig {
  enabled: boolean;
  policies: MaskingPolicy[];
  dynamicMasking: boolean;
  staticMasking: boolean;
}

export interface PerformanceConfig {
  warehouseSize: 'x-small' | 'small' | 'medium' | 'large' | 'x-large' | '2x-large' | '3x-large' | '4x-large';
  autoScale: boolean;
  maxConcurrency: number;
  queryTimeout: number;
  statementTimeout: number;
  queryQueueing: boolean;
  resourceGovernor: ResourceGovernorConfig;
}

export interface ResourceGovernorConfig {
  enabled: boolean;
  cpuLimit: number;
  memoryLimit: number;
  ioLimit: number;
  queryClassification: QueryClassificationConfig[];
}

export interface QueryClassificationConfig {
  name: string;
  condition: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  resourceLimits: {
    cpu?: number;
    memory?: number;
    io?: number;
    timeout?: number;
  };
}

export interface ETLJob {
  id: string;
  name: string;
  description: string;
  type: 'extract' | 'transform' | 'load' | 'full_etl';
  schedule: ETLSchedule;
  source: ETLSource;
  target: ETLTarget;
  transformations: ETLTransformation[];
  validation: ETLValidation;
  monitoring: ETLMonitoring;
  errorHandling: ETLErrorHandling;
  dependencies: string[];
  status: 'active' | 'inactive' | 'running' | 'error' | 'completed';
  lastRun?: Date;
  nextRun?: Date;
  runHistory: ETLRun[];
  metadata: ETLJobMetadata;
}

export interface ETLSchedule {
  type: 'manual' | 'cron' | 'interval' | 'event' | 'dependency';
  cronExpression?: string;
  intervalMinutes?: number;
  eventTrigger?: string;
  timezone: string;
  enabled: boolean;
  maxConcurrent: number;
}

export interface ETLSource {
  type: 'database' | 'file' | 'api' | 'stream' | 'warehouse';
  connection: SourceConnection;
  extraction: ExtractionConfig;
  incremental: IncrementalConfig;
}

export interface SourceConnection {
  connectionId?: string;
  query?: string;
  table?: string;
  filePath?: string;
  apiEndpoint?: string;
  streamConfig?: any;
}

export interface ExtractionConfig {
  mode: 'full' | 'incremental' | 'delta' | 'cdc';
  batchSize: number;
  parallelism: number;
  compression: boolean;
  format: 'json' | 'csv' | 'parquet' | 'avro';
}

export interface IncrementalConfig {
  enabled: boolean;
  keyColumn: string;
  keyType: 'timestamp' | 'sequential' | 'hash';
  watermark?: any;
  lookbackPeriod?: number;
}

export interface ETLTarget {
  warehouseId: string;
  schema: string;
  table: string;
  loadType: 'insert' | 'upsert' | 'merge' | 'replace' | 'append';
  mergeKey?: string[];
  partitionColumn?: string;
  clusteringColumns?: string[];
}

export interface ETLTransformation {
  id: string;
  name: string;
  type: 'sql' | 'python' | 'scala' | 'java' | 'custom';
  order: number;
  code: string;
  parameters: Record<string, any>;
  enabled: boolean;
  parallelism?: number;
}

export interface ETLValidation {
  enabled: boolean;
  rules: ValidationRule[];
  onFailure: 'stop' | 'warn' | 'skip';
  quarantineTable?: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  type: 'row_count' | 'data_quality' | 'schema' | 'business_rule';
  condition: string;
  threshold?: number;
  severity: 'error' | 'warning' | 'info';
}

export interface ETLMonitoring {
  enabled: boolean;
  metrics: ETLMetric[];
  logging: ETLLoggingConfig;
  notifications: ETLNotificationConfig;
}

export interface ETLMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
  description: string;
  enabled: boolean;
}

export interface ETLLoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  destination: 'console' | 'file' | 'warehouse' | 'external';
  retention: number;
  structured: boolean;
}

export interface ETLNotificationConfig {
  onSuccess: boolean;
  onFailure: boolean;
  onWarning: boolean;
  channels: string[];
  template?: string;
}

export interface ETLErrorHandling {
  strategy: 'fail_fast' | 'continue' | 'retry' | 'skip';
  maxRetries: number;
  retryDelay: number;
  errorTable?: string;
  alertOnError: boolean;
}

export interface ETLRun {
  id: string;
  jobId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  recordsExtracted: number;
  recordsTransformed: number;
  recordsLoaded: number;
  recordsRejected: number;
  bytesProcessed: number;
  performance: ETLPerformance;
  errors: ETLError[];
  warnings: ETLWarning[];
  logs: ETLLog[];
}

export interface ETLPerformance {
  extractionTime: number;
  transformationTime: number;
  loadTime: number;
  throughputMBps: number;
  recordsPerSecond: number;
  cpuUsage: number;
  memoryUsage: number;
}

export interface ETLError {
  timestamp: Date;
  stage: 'extract' | 'transform' | 'load' | 'validate';
  type: string;
  message: string;
  details: Record<string, any>;
  recoverable: boolean;
}

export interface ETLWarning {
  timestamp: Date;
  stage: string;
  message: string;
  details?: Record<string, any>;
}

export interface ETLLog {
  timestamp: Date;
  level: string;
  stage: string;
  message: string;
  details?: Record<string, any>;
}

export interface ETLJobMetadata {
  owner: string;
  team: string;
  project: string;
  tags: string[];
  created: Date;
  updated: Date;
  version: string;
  documentation?: string;
}

export class DataWarehouseService {
  private warehouses: Map<string, DataWarehouse> = new Map();
  private etlJobs: Map<string, ETLJob> = new Map();
  private runningJobs: Map<string, ETLRun> = new Map();
  private healthChecker: HealthChecker;
  private configPath: string;

  constructor(configPath: string = './data/data-warehouse') {
    this.configPath = configPath;
    this.healthChecker = new HealthChecker();
  }

  async registerWarehouse(warehouse: Omit<DataWarehouse, 'id' | 'created' | 'updated'>): Promise<string> {
    try {
      const id = `warehouse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const dataWarehouse: DataWarehouse = {
        ...warehouse,
        id,
        created: new Date(),
        updated: new Date()
      };

      await this.validateWarehouseConnection(dataWarehouse);
      
      this.warehouses.set(id, dataWarehouse);
      await this.saveWarehouses();

      return id;
    } catch (error) {
      throw new MCPError('WAREHOUSE_ERROR', `Failed to register warehouse: ${error}`);
    }
  }

  async createETLJob(job: Omit<ETLJob, 'id' | 'runHistory'>): Promise<string> {
    try {
      const id = `etl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const etlJob: ETLJob = {
        ...job,
        id,
        runHistory: []
      };

      await this.validateETLJob(etlJob);
      
      this.etlJobs.set(id, etlJob);
      await this.saveETLJobs();

      if (etlJob.schedule.enabled && etlJob.schedule.type !== 'manual') {
        await this.scheduleETLJob(id);
      }

      return id;
    } catch (error) {
      throw new MCPError('ETL_ERROR', `Failed to create ETL job: ${error}`);
    }
  }

  async executeETLJob(jobId: string): Promise<string> {
    try {
      const job = this.etlJobs.get(jobId);
      if (!job) {
        throw new MCPError('ETL_ERROR', `ETL job ${jobId} not found`);
      }

      if (job.status !== 'active') {
        throw new MCPError('ETL_ERROR', `ETL job ${jobId} is not active`);
      }

      const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const run: ETLRun = {
        id: runId,
        jobId,
        status: 'running',
        startTime: new Date(),
        recordsExtracted: 0,
        recordsTransformed: 0,
        recordsLoaded: 0,
        recordsRejected: 0,
        bytesProcessed: 0,
        performance: {
          extractionTime: 0,
          transformationTime: 0,
          loadTime: 0,
          throughputMBps: 0,
          recordsPerSecond: 0,
          cpuUsage: 0,
          memoryUsage: 0
        },
        errors: [],
        warnings: [],
        logs: []
      };

      this.runningJobs.set(runId, run);

      // Execute ETL job asynchronously
      this.executeETLJobInternal(job, run).catch(error => {
        run.status = 'failed';
        run.endTime = new Date();
        run.errors.push({
          timestamp: new Date(),
          stage: 'execute',
          type: 'execution_error',
          message: error.message,
          details: { stack: error.stack },
          recoverable: false
        });
      });

      return runId;
    } catch (error) {
      throw new MCPError('ETL_ERROR', `Failed to execute ETL job: ${error}`);
    }
  }

  private async executeETLJobInternal(job: ETLJob, run: ETLRun): Promise<void> {
    try {
      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        stage: 'start',
        message: `Starting ETL job execution: ${job.name}`
      });

      // Extract phase
      const extractStart = Date.now();
      const extractedData = await this.extractData(job, run);
      run.performance.extractionTime = Date.now() - extractStart;
      run.recordsExtracted = extractedData.length;

      // Transform phase
      const transformStart = Date.now();
      const transformedData = await this.transformData(job, extractedData, run);
      run.performance.transformationTime = Date.now() - transformStart;
      run.recordsTransformed = transformedData.length;

      // Validate data
      if (job.validation.enabled) {
        await this.validateData(job, transformedData, run);
      }

      // Load phase
      const loadStart = Date.now();
      await this.loadData(job, transformedData, run);
      run.performance.loadTime = Date.now() - loadStart;
      run.recordsLoaded = transformedData.length - run.recordsRejected;

      // Calculate performance metrics
      run.duration = Date.now() - run.startTime.getTime();
      run.performance.recordsPerSecond = run.recordsLoaded / (run.duration / 1000);
      run.performance.throughputMBps = run.bytesProcessed / (1024 * 1024) / (run.duration / 1000);

      run.status = 'completed';
      run.endTime = new Date();

      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        stage: 'complete',
        message: 'ETL job execution completed successfully',
        details: {
          recordsProcessed: run.recordsLoaded,
          duration: run.duration,
          throughput: run.performance.recordsPerSecond
        }
      });

      // Update job run history
      job.runHistory.push(run);
      job.lastRun = run.endTime;
      await this.saveETLJobs();

    } catch (error) {
      run.status = 'failed';
      run.endTime = new Date();
      run.duration = run.endTime.getTime() - run.startTime.getTime();
      
      run.errors.push({
        timestamp: new Date(),
        stage: 'execute',
        type: 'execution_error',
        message: error.message,
        details: { stack: error.stack },
        recoverable: false
      });

      run.logs.push({
        timestamp: new Date(),
        level: 'error',
        stage: 'error',
        message: `ETL job execution failed: ${error.message}`
      });

      throw error;
    } finally {
      this.runningJobs.delete(run.id);
    }
  }

  private async extractData(job: ETLJob, run: ETLRun): Promise<any[]> {
    try {
      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        stage: 'extract',
        message: 'Starting data extraction'
      });

      let data: any[] = [];

      switch (job.source.type) {
        case 'database':
          data = await this.extractFromDatabase(job.source, run);
          break;
        case 'file':
          data = await this.extractFromFile(job.source, run);
          break;
        case 'api':
          data = await this.extractFromAPI(job.source, run);
          break;
        case 'warehouse':
          data = await this.extractFromWarehouse(job.source, run);
          break;
        default:
          throw new MCPError('EXTRACTION_ERROR', `Unsupported source type: ${job.source.type}`);
      }

      run.bytesProcessed += JSON.stringify(data).length;

      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        stage: 'extract',
        message: `Extracted ${data.length} records`
      });

      return data;
    } catch (error) {
      run.errors.push({
        timestamp: new Date(),
        stage: 'extract',
        type: 'extraction_error',
        message: error.message,
        details: { sourceType: job.source.type },
        recoverable: false
      });
      throw error;
    }
  }

  private async extractFromDatabase(source: ETLSource, run: ETLRun): Promise<any[]> {
    // Simulated database extraction
    const mockData = [];
    for (let i = 0; i < 1000; i++) {
      mockData.push({
        id: i + 1,
        name: `record_${i + 1}`,
        value: Math.random() * 1000,
        created_at: new Date(Date.now() - Math.random() * 86400000)
      });
    }
    return mockData;
  }

  private async extractFromFile(source: ETLSource, run: ETLRun): Promise<any[]> {
    // Simulated file extraction
    if (source.connection.filePath) {
      try {
        const content = await fs.readFile(source.connection.filePath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  private async extractFromAPI(source: ETLSource, run: ETLRun): Promise<any[]> {
    // Simulated API extraction
    if (source.connection.apiEndpoint) {
      try {
        const response = await fetch(source.connection.apiEndpoint);
        return response.json();
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  private async extractFromWarehouse(source: ETLSource, run: ETLRun): Promise<any[]> {
    // Simulated warehouse extraction
    return [];
  }

  private async transformData(job: ETLJob, data: any[], run: ETLRun): Promise<any[]> {
    try {
      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        stage: 'transform',
        message: 'Starting data transformation'
      });

      let transformedData = [...data];

      for (const transformation of job.transformations.filter(t => t.enabled).sort((a, b) => a.order - b.order)) {
        try {
          transformedData = await this.applyTransformation(transformation, transformedData, run);
        } catch (error) {
          run.errors.push({
            timestamp: new Date(),
            stage: 'transform',
            type: 'transformation_error',
            message: error.message,
            details: { transformationId: transformation.id, transformationName: transformation.name },
            recoverable: false
          });
          throw error;
        }
      }

      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        stage: 'transform',
        message: `Transformed ${data.length} -> ${transformedData.length} records`
      });

      return transformedData;
    } catch (error) {
      throw error;
    }
  }

  private async applyTransformation(transformation: ETLTransformation, data: any[], run: ETLRun): Promise<any[]> {
    run.logs.push({
      timestamp: new Date(),
      level: 'info',
      stage: 'transform',
      message: `Applying transformation: ${transformation.name}`
    });

    switch (transformation.type) {
      case 'sql':
        return this.applySQLTransformation(transformation, data);
      case 'python':
        return this.applyPythonTransformation(transformation, data);
      case 'custom':
        return this.applyCustomTransformation(transformation, data);
      default:
        return data;
    }
  }

  private async applySQLTransformation(transformation: ETLTransformation, data: any[]): Promise<any[]> {
    // Simulated SQL transformation
    // In a real implementation, this would execute SQL against the data
    return data.map(record => ({
      ...record,
      transformed_at: new Date(),
      transformation_id: transformation.id
    }));
  }

  private async applyPythonTransformation(transformation: ETLTransformation, data: any[]): Promise<any[]> {
    // Simulated Python transformation
    // In a real implementation, this would execute Python code
    return data.filter(record => record.value > 100);
  }

  private async applyCustomTransformation(transformation: ETLTransformation, data: any[]): Promise<any[]> {
    // Execute custom JavaScript transformation
    try {
      const transformFunction = new Function('data', 'parameters', transformation.code);
      return transformFunction(data, transformation.parameters);
    } catch (error) {
      throw new MCPError('TRANSFORMATION_ERROR', `Custom transformation failed: ${error}`);
    }
  }

  private async validateData(job: ETLJob, data: any[], run: ETLRun): Promise<void> {
    try {
      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        stage: 'validate',
        message: 'Starting data validation'
      });

      let validationErrors = 0;

      for (const rule of job.validation.rules) {
        try {
          const result = await this.validateRule(rule, data, run);
          if (!result.passed) {
            validationErrors++;
            
            if (rule.severity === 'error' && job.validation.onFailure === 'stop') {
              throw new MCPError('VALIDATION_ERROR', `Validation rule '${rule.name}' failed`);
            }
          }
        } catch (error) {
          run.errors.push({
            timestamp: new Date(),
            stage: 'validate',
            type: 'validation_error',
            message: error.message,
            details: { ruleName: rule.name },
            recoverable: rule.severity !== 'error'
          });

          if (rule.severity === 'error' && job.validation.onFailure === 'stop') {
            throw error;
          }
        }
      }

      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        stage: 'validate',
        message: `Validation completed with ${validationErrors} errors`
      });

    } catch (error) {
      throw error;
    }
  }

  private async validateRule(rule: ValidationRule, data: any[], run: ETLRun): Promise<{ passed: boolean; details: any }> {
    switch (rule.type) {
      case 'row_count':
        const count = data.length;
        const threshold = rule.threshold || 0;
        return { passed: count >= threshold, details: { count, threshold } };
      
      case 'data_quality':
        return this.validateDataQuality(rule, data);
      
      case 'schema':
        return this.validateSchema(rule, data);
      
      case 'business_rule':
        return this.validateBusinessRule(rule, data);
      
      default:
        return { passed: true, details: {} };
    }
  }

  private async validateDataQuality(rule: ValidationRule, data: any[]): Promise<{ passed: boolean; details: any }> {
    // Simulated data quality validation
    const qualityScore = Math.random();
    const threshold = rule.threshold || 0.8;
    return { passed: qualityScore >= threshold, details: { qualityScore, threshold } };
  }

  private async validateSchema(rule: ValidationRule, data: any[]): Promise<{ passed: boolean; details: any }> {
    // Simulated schema validation
    return { passed: true, details: {} };
  }

  private async validateBusinessRule(rule: ValidationRule, data: any[]): Promise<{ passed: boolean; details: any }> {
    // Simulated business rule validation
    try {
      const ruleFunction = new Function('data', `return ${rule.condition}`);
      const passed = ruleFunction(data);
      return { passed, details: { condition: rule.condition } };
    } catch (error) {
      return { passed: false, details: { error: error.message } };
    }
  }

  private async loadData(job: ETLJob, data: any[], run: ETLRun): Promise<void> {
    try {
      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        stage: 'load',
        message: `Starting data load to ${job.target.schema}.${job.target.table}`
      });

      const warehouse = this.warehouses.get(job.target.warehouseId);
      if (!warehouse) {
        throw new MCPError('LOAD_ERROR', `Warehouse ${job.target.warehouseId} not found`);
      }

      await this.performLoad(warehouse, job.target, data, run);

      run.logs.push({
        timestamp: new Date(),
        level: 'info',
        stage: 'load',
        message: `Successfully loaded ${data.length} records`
      });

    } catch (error) {
      run.errors.push({
        timestamp: new Date(),
        stage: 'load',
        type: 'load_error',
        message: error.message,
        details: { target: job.target },
        recoverable: false
      });
      throw error;
    }
  }

  private async performLoad(warehouse: DataWarehouse, target: ETLTarget, data: any[], run: ETLRun): Promise<void> {
    // Simulated data loading
    switch (target.loadType) {
      case 'insert':
        await this.performInsert(warehouse, target, data, run);
        break;
      case 'upsert':
        await this.performUpsert(warehouse, target, data, run);
        break;
      case 'merge':
        await this.performMerge(warehouse, target, data, run);
        break;
      case 'replace':
        await this.performReplace(warehouse, target, data, run);
        break;
      case 'append':
        await this.performAppend(warehouse, target, data, run);
        break;
    }
  }

  private async performInsert(warehouse: DataWarehouse, target: ETLTarget, data: any[], run: ETLRun): Promise<void> {
    // Simulated insert operation
    const outputPath = path.join(this.configPath, 'output', `${target.table}_${Date.now()}.json`);
    await fs.writeFile(outputPath, JSON.stringify(data, null, 2));
  }

  private async performUpsert(warehouse: DataWarehouse, target: ETLTarget, data: any[], run: ETLRun): Promise<void> {
    // Simulated upsert operation
    await this.performInsert(warehouse, target, data, run);
  }

  private async performMerge(warehouse: DataWarehouse, target: ETLTarget, data: any[], run: ETLRun): Promise<void> {
    // Simulated merge operation
    await this.performInsert(warehouse, target, data, run);
  }

  private async performReplace(warehouse: DataWarehouse, target: ETLTarget, data: any[], run: ETLRun): Promise<void> {
    // Simulated replace operation
    await this.performInsert(warehouse, target, data, run);
  }

  private async performAppend(warehouse: DataWarehouse, target: ETLTarget, data: any[], run: ETLRun): Promise<void> {
    // Simulated append operation
    await this.performInsert(warehouse, target, data, run);
  }

  private async validateWarehouseConnection(warehouse: DataWarehouse): Promise<void> {
    try {
      if (!warehouse.connection.host) {
        throw new MCPError('VALIDATION_ERROR', 'Warehouse host is required');
      }
      
      if (!warehouse.connection.database) {
        throw new MCPError('VALIDATION_ERROR', 'Database name is required');
      }

      // Simulated connection test
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      throw new MCPError('VALIDATION_ERROR', `Warehouse connection validation failed: ${error}`);
    }
  }

  private async validateETLJob(job: ETLJob): Promise<void> {
    if (!job.name || job.name.trim().length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'ETL job name is required');
    }

    if (!this.warehouses.has(job.target.warehouseId)) {
      throw new MCPError('VALIDATION_ERROR', `Target warehouse ${job.target.warehouseId} not found`);
    }

    if (!job.target.schema || !job.target.table) {
      throw new MCPError('VALIDATION_ERROR', 'Target schema and table are required');
    }
  }

  private async scheduleETLJob(jobId: string): Promise<void> {
    const job = this.etlJobs.get(jobId);
    if (!job) return;

    // Simulated scheduling
    if (job.schedule.type === 'interval' && job.schedule.intervalMinutes) {
      setInterval(() => {
        this.executeETLJob(jobId).catch(console.error);
      }, job.schedule.intervalMinutes * 60 * 1000);
    }
  }

  async getWarehouseMetrics(warehouseId: string): Promise<WarehouseMetrics> {
    const warehouse = this.warehouses.get(warehouseId);
    if (!warehouse) {
      throw new MCPError('WAREHOUSE_ERROR', `Warehouse ${warehouseId} not found`);
    }

    return this.calculateWarehouseMetrics(warehouse);
  }

  private calculateWarehouseMetrics(warehouse: DataWarehouse): WarehouseMetrics {
    // Simulated metrics calculation
    return {
      queryCount: Math.floor(Math.random() * 10000),
      averageQueryTime: Math.random() * 5000,
      dataVolumeGB: Math.random() * 1000,
      creditUsage: Math.random() * 100,
      userSessions: Math.floor(Math.random() * 50),
      errorRate: Math.random() * 0.05,
      availability: 0.999,
      storageUsage: Math.random() * 500
    };
  }

  async getETLJobStatus(jobId: string): Promise<{
    job: ETLJob;
    currentRun?: ETLRun;
    lastRun?: ETLRun;
    metrics: ETLJobMetrics;
  }> {
    const job = this.etlJobs.get(jobId);
    if (!job) {
      throw new MCPError('ETL_ERROR', `ETL job ${jobId} not found`);
    }

    const currentRun = Array.from(this.runningJobs.values()).find(run => run.jobId === jobId);
    const lastRun = job.runHistory[job.runHistory.length - 1];
    
    const metrics = this.calculateETLJobMetrics(job);

    return {
      job,
      currentRun,
      lastRun,
      metrics
    };
  }

  private calculateETLJobMetrics(job: ETLJob): ETLJobMetrics {
    const recentRuns = job.runHistory.slice(-10);
    
    return {
      totalRuns: job.runHistory.length,
      successfulRuns: job.runHistory.filter(r => r.status === 'completed').length,
      failedRuns: job.runHistory.filter(r => r.status === 'failed').length,
      averageDuration: recentRuns.reduce((sum, r) => sum + (r.duration || 0), 0) / recentRuns.length || 0,
      averageThroughput: recentRuns.reduce((sum, r) => sum + r.recordsLoaded, 0) / recentRuns.length || 0,
      errorRate: recentRuns.length > 0 ? recentRuns.filter(r => r.status === 'failed').length / recentRuns.length : 0,
      lastExecutionTime: job.lastRun || new Date(0),
      nextExecutionTime: job.nextRun || new Date()
    };
  }

  private async saveWarehouses(): Promise<void> {
    const data = Array.from(this.warehouses.values());
    await fs.writeFile(
      path.join(this.configPath, 'warehouses.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveETLJobs(): Promise<void> {
    const data = Array.from(this.etlJobs.values());
    await fs.writeFile(
      path.join(this.configPath, 'etl-jobs.json'),
      JSON.stringify(data, null, 2)
    );
  }

  async getHealthStatus(): Promise<any> {
    const totalWarehouses = this.warehouses.size;
    const activeWarehouses = Array.from(this.warehouses.values()).filter(w => w.status === 'active').length;
    const totalETLJobs = this.etlJobs.size;
    const runningETLJobs = this.runningJobs.size;

    return {
      status: 'healthy',
      totalWarehouses,
      activeWarehouses,
      totalETLJobs,
      runningETLJobs,
      components: {
        warehouse: 'healthy',
        etl: 'healthy',
        monitoring: 'healthy',
        security: 'healthy'
      },
      metrics: {
        etlJobsToday: this.getETLJobsCount('today'),
        averageETLDuration: this.getAverageETLDuration(),
        dataProcessedGB: this.getDataProcessedCount('today'),
        warehouseUtilization: this.getWarehouseUtilization()
      }
    };
  }

  private getETLJobsCount(period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return Array.from(this.etlJobs.values())
      .flatMap(job => job.runHistory)
      .filter(run => run.startTime >= startOfDay)
      .length;
  }

  private getAverageETLDuration(): number {
    const allRuns = Array.from(this.etlJobs.values()).flatMap(job => job.runHistory);
    const completedRuns = allRuns.filter(r => r.status === 'completed' && r.duration);
    
    if (completedRuns.length === 0) return 0;
    
    return completedRuns.reduce((sum, r) => sum + (r.duration || 0), 0) / completedRuns.length;
  }

  private getDataProcessedCount(period: string): number {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const bytesProcessed = Array.from(this.etlJobs.values())
      .flatMap(job => job.runHistory)
      .filter(run => run.startTime >= startOfDay)
      .reduce((sum, run) => sum + run.bytesProcessed, 0);

    return bytesProcessed / (1024 * 1024 * 1024); // Convert to GB
  }

  private getWarehouseUtilization(): number {
    // Simulated warehouse utilization
    return Math.random() * 100;
  }
}

interface WarehouseMetrics {
  queryCount: number;
  averageQueryTime: number;
  dataVolumeGB: number;
  creditUsage: number;
  userSessions: number;
  errorRate: number;
  availability: number;
  storageUsage: number;
}

interface ETLJobMetrics {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  averageDuration: number;
  averageThroughput: number;
  errorRate: number;
  lastExecutionTime: Date;
  nextExecutionTime: Date;
}

export class DataWarehouseMCPServer extends BaseServer {
  private dataWarehouseService: DataWarehouseService;

  constructor() {
    super({
      name: 'data-warehouse-server',
      port: parseInt(process.env.DATA_WAREHOUSE_PORT || '8113'),
      host: process.env.DATA_WAREHOUSE_HOST || 'localhost'
    });
    this.dataWarehouseService = new DataWarehouseService();
  }

  protected async initialize(): Promise<void> {
    // DataWarehouseService doesn't need async initialization
    this.logger.info('Data Warehouse server initialized');
  }

  protected async cleanup(): Promise<void> {
    // Cleanup resources if needed
    this.logger.info('Data Warehouse server cleanup');
  }

  protected setupRoutes(): void {
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.dataWarehouseService.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/warehouses', async (req, res) => {
      try {
        const warehouseId = await this.dataWarehouseService.registerWarehouse(req.body);
        res.json({ id: warehouseId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/etl-jobs', async (req, res) => {
      try {
        const jobId = await this.dataWarehouseService.createETLJob(req.body);
        res.json({ id: jobId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/etl-jobs/:id/execute', async (req, res) => {
      try {
        const runId = await this.dataWarehouseService.executeETLJob(req.params.id);
        res.json({ runId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/warehouses/:id/metrics', async (req, res) => {
      try {
        const metrics = await this.dataWarehouseService.getWarehouseMetrics(req.params.id);
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/etl-jobs/:id/status', async (req, res) => {
      try {
        const status = await this.dataWarehouseService.getETLJobStatus(req.params.id);
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  protected getMCPTools() {
    return [
      {
        name: 'register_warehouse',
        description: 'Register a new data warehouse',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['snowflake', 'redshift', 'bigquery', 'databricks', 'synapse', 'clickhouse', 'postgresql'] },
            connection: { type: 'object' },
            schemas: { type: 'array' },
            configuration: { type: 'object' },
            monitoring: { type: 'object' },
            security: { type: 'object' },
            performance: { type: 'object' },
            status: { type: 'string', enum: ['active', 'inactive', 'maintenance', 'error'] },
            metadata: { type: 'object' }
          },
          required: ['name', 'type', 'connection', 'schemas', 'configuration']
        }
      },
      {
        name: 'create_etl_job',
        description: 'Create a new ETL job',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['extract', 'transform', 'load', 'full_etl'] },
            schedule: { type: 'object' },
            source: { type: 'object' },
            target: { type: 'object' },
            transformations: { type: 'array' },
            validation: { type: 'object' },
            monitoring: { type: 'object' },
            errorHandling: { type: 'object' },
            dependencies: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['active', 'inactive', 'running', 'error', 'completed'] },
            metadata: { type: 'object' }
          },
          required: ['name', 'description', 'type', 'schedule', 'source', 'target', 'metadata']
        }
      },
      {
        name: 'execute_etl_job',
        description: 'Execute an ETL job',
        inputSchema: {
          type: 'object',
          properties: {
            jobId: { type: 'string' }
          },
          required: ['jobId']
        }
      },
      {
        name: 'get_warehouse_metrics',
        description: 'Get warehouse performance metrics',
        inputSchema: {
          type: 'object',
          properties: {
            warehouseId: { type: 'string' }
          },
          required: ['warehouseId']
        }
      },
      {
        name: 'get_etl_job_status',
        description: 'Get ETL job status and metrics',
        inputSchema: {
          type: 'object',
          properties: {
            jobId: { type: 'string' }
          },
          required: ['jobId']
        }
      }
    ];
  }

  protected async handleMCPRequest(method: string, params: any): Promise<any> {
    switch (method) {
      case 'register_warehouse':
        return { id: await this.dataWarehouseService.registerWarehouse(params) };

      case 'create_etl_job':
        return { id: await this.dataWarehouseService.createETLJob(params) };

      case 'execute_etl_job':
        return { runId: await this.dataWarehouseService.executeETLJob(params.jobId) };

      case 'get_warehouse_metrics':
        return await this.dataWarehouseService.getWarehouseMetrics(params.warehouseId);

      case 'get_etl_job_status':
        return await this.dataWarehouseService.getETLJobStatus(params.jobId);

      default:
        throw new MCPError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
    }
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new DataWarehouseMCPServer();
  server.start().catch(console.error);
}