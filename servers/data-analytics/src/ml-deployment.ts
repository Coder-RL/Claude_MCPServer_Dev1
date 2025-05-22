import { BaseServer } from '../../../shared/src/base-server';
import { MCPError } from '../../../shared/src/errors';
import { withPerformanceMonitoring } from '../../../shared/src/monitoring';
import { withRetry } from '../../../shared/src/retry';
import { HealthChecker } from '../../../shared/src/health';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface MLModel {
  id: string;
  name: string;
  version: string;
  type: 'classification' | 'regression' | 'clustering' | 'recommendation' | 'nlp' | 'computer_vision' | 'time_series';
  framework: 'tensorflow' | 'pytorch' | 'scikit_learn' | 'xgboost' | 'lightgbm' | 'onnx' | 'custom';
  artifact: ModelArtifact;
  schema: ModelSchema;
  metadata: ModelMetadata;
  deployment: DeploymentConfig;
  monitoring: ModelMonitoring;
  performance: ModelPerformance;
  status: 'training' | 'ready' | 'deployed' | 'deprecated' | 'failed';
  created: Date;
  updated: Date;
  tags: string[];
}

export interface ModelArtifact {
  location: string;
  type: 'file' | 's3' | 'gcs' | 'azure_blob' | 'mlflow' | 'kubeflow' | 'docker';
  path: string;
  size: number;
  checksum: string;
  compression: 'none' | 'gzip' | 'zip' | 'tar';
  dependencies: ModelDependency[];
  environment: EnvironmentConfig;
  serialization: 'pickle' | 'joblib' | 'onnx' | 'savedmodel' | 'torchscript' | 'pmml';
}

export interface ModelDependency {
  name: string;
  version: string;
  type: 'python' | 'system' | 'docker' | 'conda';
  source?: string;
  optional: boolean;
}

export interface EnvironmentConfig {
  runtime: 'python' | 'r' | 'java' | 'nodejs' | 'docker';
  version: string;
  packages: Package[];
  environmentFile?: string;
  dockerImage?: string;
  customRuntime?: CustomRuntime;
}

export interface Package {
  name: string;
  version: string;
  source: 'pip' | 'conda' | 'npm' | 'maven' | 'custom';
  extras?: string[];
}

export interface CustomRuntime {
  baseImage: string;
  commands: string[];
  environmentVariables: Record<string, string>;
  ports: number[];
  healthCheck: HealthCheckConfig;
}

export interface HealthCheckConfig {
  enabled: boolean;
  endpoint: string;
  method: 'GET' | 'POST';
  timeout: number;
  interval: number;
  retries: number;
  startPeriod: number;
}

export interface ModelSchema {
  input: SchemaDefinition;
  output: SchemaDefinition;
  preprocessing?: PreprocessingStep[];
  postprocessing?: PostprocessingStep[];
  validation: ValidationConfig;
}

export interface SchemaDefinition {
  type: 'structured' | 'text' | 'image' | 'audio' | 'video' | 'tabular' | 'time_series';
  format: string;
  fields?: FieldDefinition[];
  shape?: number[];
  dtype?: string;
  encoding?: string;
  examples: any[];
  constraints?: ConstraintDefinition[];
}

export interface FieldDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date' | 'binary';
  required: boolean;
  nullable: boolean;
  description?: string;
  validation?: FieldValidation;
  transformation?: FieldTransformation;
}

export interface FieldValidation {
  minValue?: number;
  maxValue?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: any[];
  custom?: string;
}

export interface FieldTransformation {
  type: 'normalize' | 'standardize' | 'encode' | 'tokenize' | 'embed' | 'custom';
  parameters: Record<string, any>;
  code?: string;
}

export interface ConstraintDefinition {
  type: 'range' | 'pattern' | 'custom';
  description: string;
  condition: string;
  severity: 'error' | 'warning';
}

export interface PreprocessingStep {
  id: string;
  name: string;
  type: 'feature_engineering' | 'normalization' | 'encoding' | 'imputation' | 'scaling' | 'custom';
  order: number;
  enabled: boolean;
  parameters: Record<string, any>;
  code?: string;
  language?: 'python' | 'r' | 'javascript';
}

export interface PostprocessingStep {
  id: string;
  name: string;
  type: 'prediction_transformation' | 'confidence_calculation' | 'classification_mapping' | 'custom';
  order: number;
  enabled: boolean;
  parameters: Record<string, any>;
  code?: string;
  language?: 'python' | 'r' | 'javascript';
}

export interface ValidationConfig {
  enabled: boolean;
  strict: boolean;
  rules: ValidationRule[];
  customValidators: CustomValidator[];
}

export interface ValidationRule {
  field: string;
  rule: string;
  parameters: any[];
  errorMessage: string;
}

export interface CustomValidator {
  name: string;
  code: string;
  language: 'python' | 'javascript';
  parameters: Record<string, any>;
}

export interface ModelMetadata {
  description: string;
  author: string;
  organization: string;
  domain: string;
  useCase: string;
  algorithm: string;
  metrics: TrainingMetrics;
  datasets: DatasetInfo[];
  hyperparameters: Record<string, any>;
  evaluationResults: EvaluationResult[];
  businessMetrics: BusinessMetric[];
  compliance: ComplianceInfo;
  documentation: DocumentationInfo;
}

export interface TrainingMetrics {
  accuracy?: number;
  precision?: number;
  recall?: number;
  f1Score?: number;
  auc?: number;
  mse?: number;
  rmse?: number;
  mae?: number;
  r2?: number;
  customMetrics?: Record<string, number>;
}

export interface DatasetInfo {
  name: string;
  version: string;
  size: number;
  source: string;
  description: string;
  features: number;
  samples: number;
  splits: DatasetSplit[];
}

export interface DatasetSplit {
  name: 'train' | 'validation' | 'test';
  size: number;
  percentage: number;
}

export interface EvaluationResult {
  dataset: string;
  metrics: Record<string, number>;
  confusionMatrix?: number[][];
  rocCurve?: ROCPoint[];
  featureImportance?: FeatureImportance[];
  timestamp: Date;
}

export interface ROCPoint {
  fpr: number;
  tpr: number;
  threshold: number;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  rank: number;
}

export interface BusinessMetric {
  name: string;
  value: number;
  unit: string;
  description: string;
  target?: number;
  threshold?: number;
}

export interface ComplianceInfo {
  gdprCompliant: boolean;
  fairnessValidated: boolean;
  biasAssessment: BiasAssessment;
  explainability: ExplainabilityInfo;
  auditTrail: AuditEntry[];
}

export interface BiasAssessment {
  performed: boolean;
  date?: Date;
  results: BiasResult[];
  mitigationActions: string[];
}

export interface BiasResult {
  protectedAttribute: string;
  biasMetric: string;
  value: number;
  threshold: number;
  passed: boolean;
}

export interface ExplainabilityInfo {
  method: 'lime' | 'shap' | 'permutation' | 'integrated_gradients' | 'custom';
  globalExplanations: boolean;
  localExplanations: boolean;
  featureAttributions: boolean;
}

export interface AuditEntry {
  timestamp: Date;
  action: string;
  user: string;
  details: Record<string, any>;
}

export interface DocumentationInfo {
  modelCard?: string;
  technicalDocs?: string;
  userGuide?: string;
  changelog?: string;
  licenses: string[];
}

export interface DeploymentConfig {
  strategy: 'blue_green' | 'canary' | 'rolling' | 'recreate' | 'shadow';
  target: DeploymentTarget;
  scaling: ScalingConfig;
  routing: RoutingConfig;
  rollback: RollbackConfig;
  testing: DeploymentTesting;
  approval: ApprovalConfig;
}

export interface DeploymentTarget {
  type: 'kubernetes' | 'docker' | 'serverless' | 'edge' | 'batch' | 'streaming';
  environment: 'development' | 'staging' | 'production';
  region: string[];
  infrastructure: InfrastructureConfig;
  networking: NetworkingConfig;
  security: SecurityConfig;
}

export interface InfrastructureConfig {
  compute: ComputeRequirements;
  storage: StorageRequirements;
  gpu: GPURequirements;
  availability: AvailabilityConfig;
}

export interface ComputeRequirements {
  cpu: number;
  memory: number;
  minInstances: number;
  maxInstances: number;
  instanceType?: string;
  architecture: 'x86_64' | 'arm64' | 'gpu';
}

export interface StorageRequirements {
  size: number;
  type: 'ssd' | 'hdd' | 'network';
  iops?: number;
  throughput?: number;
  encryption: boolean;
}

export interface GPURequirements {
  required: boolean;
  type?: 'nvidia_t4' | 'nvidia_v100' | 'nvidia_a100' | 'amd_mi100' | 'custom';
  memory?: number;
  count?: number;
}

export interface AvailabilityConfig {
  zones: string[];
  replication: number;
  backup: boolean;
  disasterRecovery: boolean;
}

export interface NetworkingConfig {
  loadBalancer: LoadBalancerConfig;
  ingress: IngressConfig;
  serviceDiscovery: ServiceDiscoveryConfig;
}

export interface LoadBalancerConfig {
  type: 'application' | 'network' | 'classic';
  algorithm: 'round_robin' | 'least_connections' | 'ip_hash' | 'weighted';
  healthCheck: HealthCheckConfig;
  ssl: SSLConfig;
}

export interface SSLConfig {
  enabled: boolean;
  certificate?: string;
  protocols: string[];
  ciphers: string[];
}

export interface IngressConfig {
  enabled: boolean;
  host: string;
  path: string;
  annotations: Record<string, string>;
}

export interface ServiceDiscoveryConfig {
  enabled: boolean;
  registry: 'consul' | 'etcd' | 'kubernetes' | 'eureka';
  namespace: string;
}

export interface SecurityConfig {
  authentication: AuthConfig;
  authorization: AuthzConfig;
  encryption: EncryptionConfig;
  networking: NetworkSecurityConfig;
}

export interface AuthConfig {
  enabled: boolean;
  methods: string[];
  providers: AuthProvider[];
}

export interface AuthProvider {
  type: 'apikey' | 'oauth2' | 'jwt' | 'mtls' | 'custom';
  configuration: Record<string, any>;
}

export interface AuthzConfig {
  enabled: boolean;
  policies: AuthzPolicy[];
  defaultAction: 'allow' | 'deny';
}

export interface AuthzPolicy {
  name: string;
  subjects: string[];
  actions: string[];
  resources: string[];
  conditions: string[];
}

export interface EncryptionConfig {
  inTransit: boolean;
  atRest: boolean;
  keyManagement: 'aws_kms' | 'azure_kv' | 'gcp_kms' | 'vault' | 'custom';
}

export interface NetworkSecurityConfig {
  firewallRules: FirewallRule[];
  allowedIPs: string[];
  rateLimiting: RateLimitConfig;
}

export interface FirewallRule {
  name: string;
  source: string;
  destination: string;
  ports: number[];
  protocol: 'tcp' | 'udp' | 'icmp';
  action: 'allow' | 'deny';
}

export interface RateLimitConfig {
  enabled: boolean;
  requestsPerMinute: number;
  burst: number;
  keyBy: 'ip' | 'user' | 'api_key';
}

export interface ScalingConfig {
  autoScaling: AutoScalingConfig;
  horizontalPodAutoscaler?: HPAConfig;
  verticalPodAutoscaler?: VPAConfig;
}

export interface AutoScalingConfig {
  enabled: boolean;
  minReplicas: number;
  maxReplicas: number;
  targetCPU: number;
  targetMemory: number;
  targetLatency: number;
  targetThroughput: number;
  scaleUpPolicy: ScalingPolicy;
  scaleDownPolicy: ScalingPolicy;
}

export interface ScalingPolicy {
  type: 'percent' | 'pods';
  value: number;
  periodSeconds: number;
}

export interface HPAConfig {
  enabled: boolean;
  minReplicas: number;
  maxReplicas: number;
  metrics: HPAMetric[];
}

export interface HPAMetric {
  type: 'cpu' | 'memory' | 'custom' | 'external';
  target: number;
  resource?: string;
}

export interface VPAConfig {
  enabled: boolean;
  updatePolicy: 'off' | 'initial' | 'auto';
  minAllowed: ResourceRequirements;
  maxAllowed: ResourceRequirements;
}

export interface ResourceRequirements {
  cpu: string;
  memory: string;
}

export interface RoutingConfig {
  traffic: TrafficSplit[];
  abTesting: ABTestingConfig;
  canaryRules: CanaryRule[];
}

export interface TrafficSplit {
  version: string;
  weight: number;
  conditions?: RoutingCondition[];
}

export interface RoutingCondition {
  type: 'header' | 'cookie' | 'query' | 'path' | 'user_attribute';
  key: string;
  operator: 'equals' | 'contains' | 'regex' | 'in';
  value: string | string[];
}

export interface ABTestingConfig {
  enabled: boolean;
  experiments: ABExperiment[];
  defaultVersion: string;
}

export interface ABExperiment {
  id: string;
  name: string;
  versions: string[];
  trafficSplit: number[];
  startDate: Date;
  endDate: Date;
  successMetrics: string[];
  hypothesis: string;
}

export interface CanaryRule {
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte';
  action: 'promote' | 'rollback' | 'pause';
}

export interface RollbackConfig {
  enabled: boolean;
  automatic: boolean;
  triggers: RollbackTrigger[];
  strategy: 'immediate' | 'gradual';
  preserveData: boolean;
}

export interface RollbackTrigger {
  type: 'error_rate' | 'latency' | 'throughput' | 'custom_metric';
  threshold: number;
  duration: number;
  action: 'rollback' | 'alert';
}

export interface DeploymentTesting {
  preDeployment: TestSuite[];
  postDeployment: TestSuite[];
  canaryTesting: CanaryTestConfig;
  shadowTesting: ShadowTestConfig;
}

export interface TestSuite {
  name: string;
  type: 'unit' | 'integration' | 'performance' | 'security' | 'acceptance';
  tests: TestCase[];
  timeout: number;
  parallel: boolean;
}

export interface TestCase {
  name: string;
  description: string;
  input: any;
  expectedOutput: any;
  tolerance?: number;
  timeout?: number;
}

export interface CanaryTestConfig {
  enabled: boolean;
  duration: number;
  trafficPercentage: number;
  successCriteria: SuccessCriterion[];
}

export interface ShadowTestConfig {
  enabled: boolean;
  duration: number;
  trafficPercentage: number;
  compareMetrics: string[];
}

export interface SuccessCriterion {
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'gte' | 'lte';
}

export interface ApprovalConfig {
  required: boolean;
  approvers: string[];
  minApprovals: number;
  timeout: number;
  automaticApproval: AutoApprovalConfig;
}

export interface AutoApprovalConfig {
  enabled: boolean;
  conditions: ApprovalCondition[];
}

export interface ApprovalCondition {
  type: 'test_results' | 'metrics' | 'time_based' | 'user_approval';
  criteria: string;
  required: boolean;
}

export interface ModelMonitoring {
  dataMonitoring: DataMonitoringConfig;
  performanceMonitoring: PerformanceMonitoringConfig;
  businessMonitoring: BusinessMonitoringConfig;
  alerting: AlertingConfig;
  logging: LoggingConfig;
}

export interface DataMonitoringConfig {
  enabled: boolean;
  driftDetection: DriftDetectionConfig;
  qualityChecks: QualityCheckConfig[];
  outlierDetection: OutlierDetectionConfig;
  sampling: SamplingConfig;
}

export interface DriftDetectionConfig {
  enabled: boolean;
  methods: string[];
  threshold: number;
  windowSize: number;
  features: string[];
  referenceData: string;
}

export interface QualityCheckConfig {
  name: string;
  type: 'completeness' | 'validity' | 'consistency' | 'accuracy';
  threshold: number;
  enabled: boolean;
}

export interface OutlierDetectionConfig {
  enabled: boolean;
  method: 'isolation_forest' | 'local_outlier_factor' | 'one_class_svm' | 'statistical';
  threshold: number;
  action: 'flag' | 'reject' | 'log';
}

export interface SamplingConfig {
  enabled: boolean;
  rate: number;
  strategy: 'random' | 'systematic' | 'stratified';
  maxSamples: number;
}

export interface PerformanceMonitoringConfig {
  enabled: boolean;
  metrics: PerformanceMetric[];
  sla: SLAConfig;
  benchmarking: BenchmarkingConfig;
}

export interface PerformanceMetric {
  name: string;
  type: 'latency' | 'throughput' | 'accuracy' | 'precision' | 'recall' | 'custom';
  aggregation: 'avg' | 'p50' | 'p95' | 'p99' | 'max' | 'min';
  window: number;
  threshold?: number;
}

export interface SLAConfig {
  latency: number;
  availability: number;
  throughput: number;
  accuracy: number;
  penalties: SLAPenalty[];
}

export interface SLAPenalty {
  condition: string;
  penalty: number;
  unit: 'percentage' | 'fixed';
}

export interface BenchmarkingConfig {
  enabled: boolean;
  baselines: Baseline[];
  schedule: string;
  metrics: string[];
}

export interface Baseline {
  name: string;
  version: string;
  metrics: Record<string, number>;
  date: Date;
}

export interface BusinessMonitoringConfig {
  enabled: boolean;
  kpis: KPIConfig[];
  businessRules: BusinessRule[];
  reporting: ReportingConfig;
}

export interface KPIConfig {
  name: string;
  description: string;
  calculation: string;
  target: number;
  threshold: number;
  unit: string;
}

export interface BusinessRule {
  id: string;
  name: string;
  condition: string;
  action: 'alert' | 'block' | 'log' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ReportingConfig {
  enabled: boolean;
  schedule: string;
  recipients: string[];
  format: 'email' | 'dashboard' | 'api' | 'file';
  template: string;
}

export interface AlertingConfig {
  enabled: boolean;
  channels: AlertChannel[];
  rules: AlertRule[];
  escalation: EscalationConfig;
}

export interface AlertChannel {
  id: string;
  type: 'email' | 'slack' | 'pagerduty' | 'webhook' | 'sms';
  configuration: Record<string, any>;
  enabled: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  threshold: number;
  window: number;
  channels: string[];
  enabled: boolean;
}

export interface EscalationConfig {
  enabled: boolean;
  levels: EscalationLevel[];
  timeout: number;
}

export interface EscalationLevel {
  level: number;
  channels: string[];
  delay: number;
}

export interface LoggingConfig {
  enabled: boolean;
  level: 'debug' | 'info' | 'warn' | 'error';
  destinations: LogDestination[];
  format: 'json' | 'text' | 'structured';
  retention: number;
  sampling: number;
}

export interface LogDestination {
  type: 'file' | 'console' | 'elasticsearch' | 'cloudwatch' | 'datadog';
  configuration: Record<string, any>;
  enabled: boolean;
}

export interface ModelPerformance {
  latency: LatencyMetrics;
  throughput: ThroughputMetrics;
  resource: ResourceMetrics;
  accuracy: AccuracyMetrics;
  availability: AvailabilityMetrics;
}

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  average: number;
  max: number;
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  predictionsPerSecond: number;
  batchSize: number;
  utilization: number;
}

export interface ResourceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  gpuUsage?: number;
  networkUsage: number;
  storageUsage: number;
}

export interface AccuracyMetrics {
  online: number;
  offline: number;
  drift: number;
  degradation: number;
  lastEvaluated: Date;
}

export interface AvailabilityMetrics {
  uptime: number;
  healthScore: number;
  errorRate: number;
  lastDowntime?: Date;
}

export interface ModelEndpoint {
  id: string;
  modelId: string;
  version: string;
  url: string;
  status: 'deploying' | 'active' | 'inactive' | 'error' | 'updating';
  deployment: ActiveDeployment;
  traffic: TrafficMetrics;
  health: EndpointHealth;
  created: Date;
  updated: Date;
}

export interface ActiveDeployment {
  id: string;
  strategy: string;
  startTime: Date;
  completionTime?: Date;
  rolloutPercentage: number;
  instances: DeploymentInstance[];
  configuration: Record<string, any>;
}

export interface DeploymentInstance {
  id: string;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';
  host: string;
  port: number;
  version: string;
  health: InstanceHealth;
  resources: InstanceResources;
  startTime: Date;
}

export interface InstanceHealth {
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastCheck: Date;
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  timestamp: Date;
  duration: number;
}

export interface InstanceResources {
  cpu: number;
  memory: number;
  gpu?: number;
  network: number;
  storage: number;
}

export interface TrafficMetrics {
  requestsPerSecond: number;
  totalRequests: number;
  errorRate: number;
  latency: LatencyMetrics;
  throughput: number;
  bandwidth: number;
}

export interface EndpointHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  score: number;
  components: ComponentHealth[];
  lastUpdated: Date;
}

export interface ComponentHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  metrics: Record<string, number>;
}

export interface InferenceRequest {
  id: string;
  modelId: string;
  endpointId: string;
  input: any;
  options?: InferenceOptions;
  metadata?: Record<string, any>;
  timestamp: Date;
  clientId?: string;
  sessionId?: string;
}

export interface InferenceOptions {
  timeout?: number;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  explainability?: boolean;
  confidenceThreshold?: number;
  preprocessingOptions?: Record<string, any>;
  postprocessingOptions?: Record<string, any>;
  cacheable?: boolean;
  asynchronous?: boolean;
}

export interface InferenceResponse {
  id: string;
  requestId: string;
  output: any;
  confidence?: number;
  predictions?: Prediction[];
  explanations?: Explanation[];
  metadata: ResponseMetadata;
  timestamp: Date;
  latency: number;
}

export interface Prediction {
  class?: string;
  probability?: number;
  value?: number;
  confidence?: number;
  ranking?: number;
}

export interface Explanation {
  type: 'feature_importance' | 'attention' | 'gradient' | 'counterfactual';
  method: string;
  data: any;
  metadata?: Record<string, any>;
}

export interface ResponseMetadata {
  modelVersion: string;
  instanceId: string;
  processingTime: number;
  preprocessingTime?: number;
  inferenceTime: number;
  postprocessingTime?: number;
  cached: boolean;
  warnings?: string[];
  debug?: Record<string, any>;
}

export class MLDeploymentService {
  private models: Map<string, MLModel> = new Map();
  private endpoints: Map<string, ModelEndpoint> = new Map();
  private deployments: Map<string, ActiveDeployment> = new Map();
  private healthChecker: HealthChecker;
  private configPath: string;

  constructor(configPath: string = './data/ml-deployment') {
    this.configPath = configPath;
    this.healthChecker = new HealthChecker();
  }

  async registerModel(model: Omit<MLModel, 'id' | 'created' | 'updated'>): Promise<string> {
    try {
      const id = `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const mlModel: MLModel = {
        ...model,
        id,
        created: new Date(),
        updated: new Date()
      };

      await this.validateModel(mlModel);
      
      this.models.set(id, mlModel);
      await this.saveModels();

      return id;
    } catch (error) {
      throw new MCPError('MODEL_ERROR', `Failed to register model: ${error}`);
    }
  }

  async deployModel(modelId: string, deploymentConfig?: Partial<DeploymentConfig>): Promise<string> {
    try {
      const model = this.models.get(modelId);
      if (!model) {
        throw new MCPError('MODEL_ERROR', `Model ${modelId} not found`);
      }

      if (model.status !== 'ready') {
        throw new MCPError('MODEL_ERROR', `Model ${modelId} is not ready for deployment`);
      }

      const endpointId = `endpoint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const deploymentId = `deployment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Merge deployment configuration
      const finalConfig = { ...model.deployment, ...deploymentConfig };

      const deployment: ActiveDeployment = {
        id: deploymentId,
        strategy: finalConfig.strategy,
        startTime: new Date(),
        rolloutPercentage: 0,
        instances: [],
        configuration: finalConfig
      };

      this.deployments.set(deploymentId, deployment);

      const endpoint: ModelEndpoint = {
        id: endpointId,
        modelId,
        version: model.version,
        url: this.generateEndpointURL(endpointId),
        status: 'deploying',
        deployment,
        traffic: {
          requestsPerSecond: 0,
          totalRequests: 0,
          errorRate: 0,
          latency: { p50: 0, p95: 0, p99: 0, average: 0, max: 0 },
          throughput: 0,
          bandwidth: 0
        },
        health: {
          overall: 'healthy',
          score: 100,
          components: [],
          lastUpdated: new Date()
        },
        created: new Date(),
        updated: new Date()
      };

      this.endpoints.set(endpointId, endpoint);

      // Start deployment process
      this.startDeployment(endpoint, model).catch(error => {
        endpoint.status = 'error';
        console.error(`Deployment failed for model ${modelId}:`, error);
      });

      await this.saveEndpoints();

      return endpointId;
    } catch (error) {
      throw new MCPError('DEPLOYMENT_ERROR', `Failed to deploy model: ${error}`);
    }
  }

  private async startDeployment(endpoint: ModelEndpoint, model: MLModel): Promise<void> {
    try {
      // Simulate deployment phases
      await this.deployPhase('preparation', endpoint, model);
      await this.deployPhase('provisioning', endpoint, model);
      await this.deployPhase('loading', endpoint, model);
      await this.deployPhase('validation', endpoint, model);
      await this.deployPhase('activation', endpoint, model);

      endpoint.status = 'active';
      endpoint.deployment.completionTime = new Date();
      endpoint.deployment.rolloutPercentage = 100;

      model.status = 'deployed';
      await this.saveModels();
      await this.saveEndpoints();

    } catch (error) {
      endpoint.status = 'error';
      throw error;
    }
  }

  private async deployPhase(phase: string, endpoint: ModelEndpoint, model: MLModel): Promise<void> {
    console.log(`Starting deployment phase: ${phase} for model ${model.id}`);
    
    // Simulate phase duration
    await new Promise(resolve => setTimeout(resolve, 1000));

    switch (phase) {
      case 'preparation':
        await this.prepareDeployment(endpoint, model);
        break;
      case 'provisioning':
        await this.provisionResources(endpoint, model);
        break;
      case 'loading':
        await this.loadModel(endpoint, model);
        break;
      case 'validation':
        await this.validateDeployment(endpoint, model);
        break;
      case 'activation':
        await this.activateEndpoint(endpoint, model);
        break;
    }

    console.log(`Completed deployment phase: ${phase} for model ${model.id}`);
  }

  private async prepareDeployment(endpoint: ModelEndpoint, model: MLModel): Promise<void> {
    // Simulate preparing deployment environment
    endpoint.deployment.rolloutPercentage = 10;
  }

  private async provisionResources(endpoint: ModelEndpoint, model: MLModel): Promise<void> {
    // Simulate provisioning compute resources
    const instanceCount = model.deployment.scaling.autoScaling.minReplicas;
    
    for (let i = 0; i < instanceCount; i++) {
      const instance: DeploymentInstance = {
        id: `instance_${i + 1}`,
        status: 'starting',
        host: `host-${i + 1}`,
        port: 8080 + i,
        version: model.version,
        health: {
          status: 'unknown',
          lastCheck: new Date(),
          checks: []
        },
        resources: {
          cpu: 0,
          memory: 0,
          gpu: model.deployment.target.infrastructure.gpu.required ? 0 : undefined,
          network: 0,
          storage: 0
        },
        startTime: new Date()
      };

      endpoint.deployment.instances.push(instance);
    }

    endpoint.deployment.rolloutPercentage = 30;
  }

  private async loadModel(endpoint: ModelEndpoint, model: MLModel): Promise<void> {
    // Simulate loading model artifacts
    for (const instance of endpoint.deployment.instances) {
      instance.status = 'running';
      instance.health.status = 'healthy';
    }

    endpoint.deployment.rolloutPercentage = 60;
  }

  private async validateDeployment(endpoint: ModelEndpoint, model: MLModel): Promise<void> {
    // Simulate running validation tests
    if (model.deployment.testing.postDeployment.length > 0) {
      await this.runDeploymentTests(endpoint, model);
    }

    endpoint.deployment.rolloutPercentage = 80;
  }

  private async activateEndpoint(endpoint: ModelEndpoint, model: MLModel): Promise<void> {
    // Simulate activating the endpoint
    endpoint.deployment.rolloutPercentage = 100;
  }

  private async runDeploymentTests(endpoint: ModelEndpoint, model: MLModel): Promise<void> {
    // Simulate running post-deployment tests
    for (const testSuite of model.deployment.testing.postDeployment) {
      for (const testCase of testSuite.tests) {
        // Simulate test execution
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  async predict(request: InferenceRequest): Promise<InferenceResponse> {
    try {
      const endpoint = this.endpoints.get(request.endpointId);
      if (!endpoint) {
        throw new MCPError('ENDPOINT_ERROR', `Endpoint ${request.endpointId} not found`);
      }

      if (endpoint.status !== 'active') {
        throw new MCPError('ENDPOINT_ERROR', `Endpoint ${request.endpointId} is not active`);
      }

      const model = this.models.get(endpoint.modelId);
      if (!model) {
        throw new MCPError('MODEL_ERROR', `Model ${endpoint.modelId} not found`);
      }

      const startTime = Date.now();

      // Validate input
      await this.validateInput(request.input, model.schema.input);

      // Preprocess input
      const preprocessedInput = await this.preprocessInput(request.input, model.schema.preprocessing || []);

      // Perform inference
      const rawOutput = await this.performInference(preprocessedInput, model, endpoint);

      // Postprocess output
      const processedOutput = await this.postprocessOutput(rawOutput, model.schema.postprocessing || []);

      // Calculate confidence and explanations
      const confidence = this.calculateConfidence(rawOutput, model);
      const explanations = request.options?.explainability ? 
        await this.generateExplanations(request.input, rawOutput, model) : undefined;

      const latency = Date.now() - startTime;

      // Update metrics
      endpoint.traffic.totalRequests++;
      endpoint.traffic.latency.average = (endpoint.traffic.latency.average + latency) / 2;
      
      if (latency > endpoint.traffic.latency.max) {
        endpoint.traffic.latency.max = latency;
      }

      const response: InferenceResponse = {
        id: `response_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        requestId: request.id,
        output: processedOutput,
        confidence,
        predictions: this.formatPredictions(rawOutput, model),
        explanations,
        metadata: {
          modelVersion: model.version,
          instanceId: this.selectInstance(endpoint).id,
          processingTime: latency,
          inferenceTime: latency * 0.7, // Simulated breakdown
          preprocessingTime: latency * 0.15,
          postprocessingTime: latency * 0.15,
          cached: false,
          warnings: []
        },
        timestamp: new Date(),
        latency
      };

      return response;
    } catch (error) {
      throw new MCPError('INFERENCE_ERROR', `Prediction failed: ${error}`);
    }
  }

  private async validateInput(input: any, schema: SchemaDefinition): Promise<void> {
    // Simulate input validation based on schema
    if (schema.type === 'structured' && typeof input !== 'object') {
      throw new MCPError('VALIDATION_ERROR', 'Input must be an object for structured schema');
    }

    if (schema.fields) {
      for (const field of schema.fields) {
        if (field.required && !(field.name in input)) {
          throw new MCPError('VALIDATION_ERROR', `Required field '${field.name}' is missing`);
        }
      }
    }
  }

  private async preprocessInput(input: any, steps: PreprocessingStep[]): Promise<any> {
    let processedInput = input;

    for (const step of steps.filter(s => s.enabled).sort((a, b) => a.order - b.order)) {
      processedInput = await this.applyPreprocessingStep(processedInput, step);
    }

    return processedInput;
  }

  private async applyPreprocessingStep(input: any, step: PreprocessingStep): Promise<any> {
    switch (step.type) {
      case 'normalization':
        return this.normalizeInput(input, step.parameters);
      case 'encoding':
        return this.encodeInput(input, step.parameters);
      case 'feature_engineering':
        return this.engineerFeatures(input, step.parameters);
      case 'custom':
        if (step.code && step.language === 'javascript') {
          const processingFunction = new Function('input', 'parameters', step.code);
          return processingFunction(input, step.parameters);
        }
        return input;
      default:
        return input;
    }
  }

  private normalizeInput(input: any, parameters: Record<string, any>): any {
    // Simulated normalization
    return input;
  }

  private encodeInput(input: any, parameters: Record<string, any>): any {
    // Simulated encoding
    return input;
  }

  private engineerFeatures(input: any, parameters: Record<string, any>): any {
    // Simulated feature engineering
    return input;
  }

  private async performInference(input: any, model: MLModel, endpoint: ModelEndpoint): Promise<any> {
    // Simulate model inference based on type
    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate processing time

    switch (model.type) {
      case 'classification':
        return this.simulateClassification(input, model);
      case 'regression':
        return this.simulateRegression(input, model);
      case 'clustering':
        return this.simulateClustering(input, model);
      case 'nlp':
        return this.simulateNLP(input, model);
      case 'computer_vision':
        return this.simulateComputerVision(input, model);
      default:
        return { prediction: Math.random() };
    }
  }

  private simulateClassification(input: any, model: MLModel): any {
    const classes = ['class_a', 'class_b', 'class_c'];
    const probabilities = classes.map(() => Math.random());
    const sum = probabilities.reduce((a, b) => a + b, 0);
    const normalizedProbs = probabilities.map(p => p / sum);

    return {
      predictions: classes.map((cls, i) => ({
        class: cls,
        probability: normalizedProbs[i],
        confidence: normalizedProbs[i]
      })),
      predicted_class: classes[normalizedProbs.indexOf(Math.max(...normalizedProbs))]
    };
  }

  private simulateRegression(input: any, model: MLModel): any {
    return {
      prediction: Math.random() * 100,
      confidence: Math.random() * 0.3 + 0.7
    };
  }

  private simulateClustering(input: any, model: MLModel): any {
    return {
      cluster: Math.floor(Math.random() * 5),
      distance: Math.random() * 10,
      confidence: Math.random() * 0.3 + 0.7
    };
  }

  private simulateNLP(input: any, model: MLModel): any {
    return {
      tokens: ['token1', 'token2', 'token3'],
      sentiment: Math.random() > 0.5 ? 'positive' : 'negative',
      confidence: Math.random() * 0.3 + 0.7
    };
  }

  private simulateComputerVision(input: any, model: MLModel): any {
    return {
      objects: [
        { class: 'person', confidence: 0.95, bbox: [10, 20, 100, 200] },
        { class: 'car', confidence: 0.87, bbox: [150, 50, 300, 180] }
      ],
      scene: 'outdoor',
      confidence: Math.random() * 0.3 + 0.7
    };
  }

  private async postprocessOutput(output: any, steps: PostprocessingStep[]): Promise<any> {
    let processedOutput = output;

    for (const step of steps.filter(s => s.enabled).sort((a, b) => a.order - b.order)) {
      processedOutput = await this.applyPostprocessingStep(processedOutput, step);
    }

    return processedOutput;
  }

  private async applyPostprocessingStep(output: any, step: PostprocessingStep): Promise<any> {
    switch (step.type) {
      case 'prediction_transformation':
        return this.transformPrediction(output, step.parameters);
      case 'confidence_calculation':
        return this.calculateConfidenceScore(output, step.parameters);
      case 'classification_mapping':
        return this.mapClassification(output, step.parameters);
      case 'custom':
        if (step.code && step.language === 'javascript') {
          const processingFunction = new Function('output', 'parameters', step.code);
          return processingFunction(output, step.parameters);
        }
        return output;
      default:
        return output;
    }
  }

  private transformPrediction(output: any, parameters: Record<string, any>): any {
    // Simulated prediction transformation
    return output;
  }

  private calculateConfidenceScore(output: any, parameters: Record<string, any>): any {
    // Simulated confidence calculation
    return { ...output, confidence: Math.random() * 0.3 + 0.7 };
  }

  private mapClassification(output: any, parameters: Record<string, any>): any {
    // Simulated classification mapping
    return output;
  }

  private calculateConfidence(output: any, model: MLModel): number {
    // Calculate overall confidence score
    if (output.confidence !== undefined) {
      return output.confidence;
    }

    if (output.predictions && Array.isArray(output.predictions)) {
      const maxProb = Math.max(...output.predictions.map(p => p.probability || 0));
      return maxProb;
    }

    return Math.random() * 0.3 + 0.7; // Default confidence
  }

  private async generateExplanations(input: any, output: any, model: MLModel): Promise<Explanation[]> {
    if (!model.metadata.compliance.explainability.localExplanations) {
      return [];
    }

    // Simulate explanation generation
    return [
      {
        type: 'feature_importance',
        method: model.metadata.compliance.explainability.method,
        data: {
          features: ['feature1', 'feature2', 'feature3'],
          importance: [0.5, 0.3, 0.2]
        }
      }
    ];
  }

  private formatPredictions(output: any, model: MLModel): Prediction[] | undefined {
    if (output.predictions && Array.isArray(output.predictions)) {
      return output.predictions;
    }

    if (model.type === 'classification' && output.predicted_class) {
      return [{
        class: output.predicted_class,
        confidence: output.confidence || 0.5
      }];
    }

    if (model.type === 'regression' && output.prediction !== undefined) {
      return [{
        value: output.prediction,
        confidence: output.confidence || 0.5
      }];
    }

    return undefined;
  }

  private selectInstance(endpoint: ModelEndpoint): DeploymentInstance {
    // Simple round-robin instance selection
    const healthyInstances = endpoint.deployment.instances.filter(i => i.health.status === 'healthy');
    
    if (healthyInstances.length === 0) {
      throw new MCPError('ENDPOINT_ERROR', 'No healthy instances available');
    }

    return healthyInstances[Math.floor(Math.random() * healthyInstances.length)];
  }

  private generateEndpointURL(endpointId: string): string {
    return `https://api.ml-platform.com/v1/endpoints/${endpointId}/predict`;
  }

  async undeployModel(endpointId: string): Promise<void> {
    try {
      const endpoint = this.endpoints.get(endpointId);
      if (!endpoint) {
        throw new MCPError('ENDPOINT_ERROR', `Endpoint ${endpointId} not found`);
      }

      endpoint.status = 'inactive';

      // Stop all instances
      for (const instance of endpoint.deployment.instances) {
        instance.status = 'stopping';
        // Simulate graceful shutdown
        await new Promise(resolve => setTimeout(resolve, 100));
        instance.status = 'stopped';
      }

      // Update model status
      const model = this.models.get(endpoint.modelId);
      if (model) {
        model.status = 'ready';
        await this.saveModels();
      }

      await this.saveEndpoints();
    } catch (error) {
      throw new MCPError('DEPLOYMENT_ERROR', `Failed to undeploy model: ${error}`);
    }
  }

  async getModelMetrics(modelId: string): Promise<ModelPerformance> {
    const model = this.models.get(modelId);
    if (!model) {
      throw new MCPError('MODEL_ERROR', `Model ${modelId} not found`);
    }

    return this.calculateModelMetrics(model);
  }

  private calculateModelMetrics(model: MLModel): ModelPerformance {
    // Calculate aggregated metrics from all endpoints using this model
    const modelEndpoints = Array.from(this.endpoints.values()).filter(e => e.modelId === model.id);
    
    if (modelEndpoints.length === 0) {
      return {
        latency: { p50: 0, p95: 0, p99: 0, average: 0, max: 0 },
        throughput: { requestsPerSecond: 0, predictionsPerSecond: 0, batchSize: 1, utilization: 0 },
        resource: { cpuUsage: 0, memoryUsage: 0, networkUsage: 0, storageUsage: 0 },
        accuracy: { online: 0, offline: 0, drift: 0, degradation: 0, lastEvaluated: new Date() },
        availability: { uptime: 0, healthScore: 0, errorRate: 0 }
      };
    }

    // Aggregate metrics from all endpoints
    const totalRequests = modelEndpoints.reduce((sum, e) => sum + e.traffic.totalRequests, 0);
    const avgLatency = modelEndpoints.reduce((sum, e) => sum + e.traffic.latency.average, 0) / modelEndpoints.length;
    const maxLatency = Math.max(...modelEndpoints.map(e => e.traffic.latency.max));

    return {
      latency: {
        p50: avgLatency * 0.8,
        p95: avgLatency * 1.5,
        p99: avgLatency * 2.0,
        average: avgLatency,
        max: maxLatency
      },
      throughput: {
        requestsPerSecond: modelEndpoints.reduce((sum, e) => sum + e.traffic.requestsPerSecond, 0),
        predictionsPerSecond: modelEndpoints.reduce((sum, e) => sum + e.traffic.requestsPerSecond, 0),
        batchSize: 1,
        utilization: Math.random() * 100
      },
      resource: {
        cpuUsage: Math.random() * 100,
        memoryUsage: Math.random() * 100,
        gpuUsage: model.deployment.target.infrastructure.gpu.required ? Math.random() * 100 : undefined,
        networkUsage: Math.random() * 100,
        storageUsage: Math.random() * 100
      },
      accuracy: {
        online: model.metadata.metrics.accuracy || 0.85,
        offline: model.metadata.metrics.accuracy || 0.85,
        drift: Math.random() * 0.1,
        degradation: Math.random() * 0.05,
        lastEvaluated: new Date()
      },
      availability: {
        uptime: 0.999,
        healthScore: modelEndpoints.reduce((sum, e) => sum + e.health.score, 0) / modelEndpoints.length,
        errorRate: modelEndpoints.reduce((sum, e) => sum + e.traffic.errorRate, 0) / modelEndpoints.length
      }
    };
  }

  async getEndpointStatus(endpointId: string): Promise<ModelEndpoint> {
    const endpoint = this.endpoints.get(endpointId);
    if (!endpoint) {
      throw new MCPError('ENDPOINT_ERROR', `Endpoint ${endpointId} not found`);
    }

    // Update health status
    endpoint.health = await this.checkEndpointHealth(endpoint);
    endpoint.updated = new Date();

    return endpoint;
  }

  private async checkEndpointHealth(endpoint: ModelEndpoint): Promise<EndpointHealth> {
    // Simulate health checking
    const components: ComponentHealth[] = [
      {
        name: 'load_balancer',
        status: 'healthy',
        metrics: { response_time: Math.random() * 10 }
      },
      {
        name: 'model_inference',
        status: 'healthy',
        metrics: { prediction_latency: Math.random() * 50 }
      },
      {
        name: 'data_pipeline',
        status: 'healthy',
        metrics: { throughput: Math.random() * 1000 }
      }
    ];

    const healthyComponents = components.filter(c => c.status === 'healthy').length;
    const score = (healthyComponents / components.length) * 100;

    return {
      overall: score > 80 ? 'healthy' : score > 50 ? 'degraded' : 'unhealthy',
      score,
      components,
      lastUpdated: new Date()
    };
  }

  private async validateModel(model: MLModel): Promise<void> {
    if (!model.name || model.name.trim().length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'Model name is required');
    }

    if (!model.version || model.version.trim().length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'Model version is required');
    }

    if (!model.artifact.location) {
      throw new MCPError('VALIDATION_ERROR', 'Model artifact location is required');
    }

    if (!model.schema.input.type) {
      throw new MCPError('VALIDATION_ERROR', 'Input schema type is required');
    }

    if (!model.schema.output.type) {
      throw new MCPError('VALIDATION_ERROR', 'Output schema type is required');
    }
  }

  private async saveModels(): Promise<void> {
    const data = Array.from(this.models.values());
    await fs.writeFile(
      path.join(this.configPath, 'models.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async saveEndpoints(): Promise<void> {
    const data = Array.from(this.endpoints.values());
    await fs.writeFile(
      path.join(this.configPath, 'endpoints.json'),
      JSON.stringify(data, null, 2)
    );
  }

  async getHealthStatus(): Promise<any> {
    const totalModels = this.models.size;
    const deployedModels = Array.from(this.models.values()).filter(m => m.status === 'deployed').length;
    const totalEndpoints = this.endpoints.size;
    const activeEndpoints = Array.from(this.endpoints.values()).filter(e => e.status === 'active').length;

    return {
      status: 'healthy',
      totalModels,
      deployedModels,
      totalEndpoints,
      activeEndpoints,
      components: {
        models: 'healthy',
        endpoints: 'healthy',
        inference: 'healthy',
        monitoring: 'healthy'
      },
      metrics: {
        averageLatency: this.calculateAverageLatency(),
        totalPredictions: this.getTotalPredictions(),
        errorRate: this.calculateOverallErrorRate(),
        resourceUtilization: this.calculateResourceUtilization()
      }
    };
  }

  private calculateAverageLatency(): number {
    const activeEndpoints = Array.from(this.endpoints.values()).filter(e => e.status === 'active');
    if (activeEndpoints.length === 0) return 0;
    
    const totalLatency = activeEndpoints.reduce((sum, e) => sum + e.traffic.latency.average, 0);
    return totalLatency / activeEndpoints.length;
  }

  private getTotalPredictions(): number {
    return Array.from(this.endpoints.values()).reduce((sum, e) => sum + e.traffic.totalRequests, 0);
  }

  private calculateOverallErrorRate(): number {
    const endpoints = Array.from(this.endpoints.values());
    if (endpoints.length === 0) return 0;
    
    const totalRequests = endpoints.reduce((sum, e) => sum + e.traffic.totalRequests, 0);
    const totalErrors = endpoints.reduce((sum, e) => sum + (e.traffic.totalRequests * e.traffic.errorRate), 0);
    
    return totalRequests > 0 ? totalErrors / totalRequests : 0;
  }

  private calculateResourceUtilization(): number {
    // Simulated resource utilization across all deployments
    return Math.random() * 100;
  }
}

export class MLDeploymentMCPServer extends BaseServer {
  private mlDeploymentService: MLDeploymentService;

  constructor() {
    super({
      name: 'ml-deployment-server',
      port: parseInt(process.env.ML_DEPLOYMENT_PORT || '8114'),
      host: process.env.ML_DEPLOYMENT_HOST || 'localhost'
    });
    this.mlDeploymentService = new MLDeploymentService();
  }

  protected async initialize(): Promise<void> {
    // MLDeploymentService doesn't need async initialization
    this.logger.info('ML Deployment server initialized');
  }

  protected async cleanup(): Promise<void> {
    // Cleanup resources if needed
    this.logger.info('ML Deployment server cleanup');
  }

  protected setupRoutes(): void {
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.mlDeploymentService.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/models', async (req, res) => {
      try {
        const modelId = await this.mlDeploymentService.registerModel(req.body);
        res.json({ id: modelId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/models/:id/deploy', async (req, res) => {
      try {
        const endpointId = await this.mlDeploymentService.deployModel(req.params.id, req.body);
        res.json({ endpointId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/endpoints/:id/predict', async (req, res) => {
      try {
        const request: InferenceRequest = {
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          modelId: '',
          endpointId: req.params.id,
          input: req.body.input,
          options: req.body.options,
          metadata: req.body.metadata,
          timestamp: new Date(),
          clientId: req.headers['x-client-id'] as string,
          sessionId: req.headers['x-session-id'] as string
        };

        const response = await this.mlDeploymentService.predict(request);
        res.json(response);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.delete('/endpoints/:id', async (req, res) => {
      try {
        await this.mlDeploymentService.undeployModel(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/models/:id/metrics', async (req, res) => {
      try {
        const metrics = await this.mlDeploymentService.getModelMetrics(req.params.id);
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/endpoints/:id/status', async (req, res) => {
      try {
        const status = await this.mlDeploymentService.getEndpointStatus(req.params.id);
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  protected getMCPTools() {
    return [
      {
        name: 'register_model',
        description: 'Register a new ML model for deployment',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            type: { type: 'string', enum: ['classification', 'regression', 'clustering', 'recommendation', 'nlp', 'computer_vision', 'time_series'] },
            framework: { type: 'string', enum: ['tensorflow', 'pytorch', 'scikit_learn', 'xgboost', 'lightgbm', 'onnx', 'custom'] },
            artifact: { type: 'object' },
            schema: { type: 'object' },
            metadata: { type: 'object' },
            deployment: { type: 'object' },
            monitoring: { type: 'object' },
            performance: { type: 'object' },
            status: { type: 'string', enum: ['training', 'ready', 'deployed', 'deprecated', 'failed'] },
            tags: { type: 'array', items: { type: 'string' } }
          },
          required: ['name', 'version', 'type', 'framework', 'artifact', 'schema', 'metadata', 'deployment']
        }
      },
      {
        name: 'deploy_model',
        description: 'Deploy a registered model to an endpoint',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string' },
            deploymentConfig: { type: 'object' }
          },
          required: ['modelId']
        }
      },
      {
        name: 'predict',
        description: 'Make a prediction using a deployed model',
        inputSchema: {
          type: 'object',
          properties: {
            endpointId: { type: 'string' },
            input: { type: 'object' },
            options: { type: 'object' },
            metadata: { type: 'object' }
          },
          required: ['endpointId', 'input']
        }
      },
      {
        name: 'undeploy_model',
        description: 'Undeploy a model endpoint',
        inputSchema: {
          type: 'object',
          properties: {
            endpointId: { type: 'string' }
          },
          required: ['endpointId']
        }
      },
      {
        name: 'get_model_metrics',
        description: 'Get performance metrics for a model',
        inputSchema: {
          type: 'object',
          properties: {
            modelId: { type: 'string' }
          },
          required: ['modelId']
        }
      },
      {
        name: 'get_endpoint_status',
        description: 'Get status and health of a model endpoint',
        inputSchema: {
          type: 'object',
          properties: {
            endpointId: { type: 'string' }
          },
          required: ['endpointId']
        }
      }
    ];
  }

  protected async handleMCPRequest(method: string, params: any): Promise<any> {
    switch (method) {
      case 'register_model':
        return { id: await this.mlDeploymentService.registerModel(params) };

      case 'deploy_model':
        return { endpointId: await this.mlDeploymentService.deployModel(params.modelId, params.deploymentConfig) };

      case 'predict':
        const request: InferenceRequest = {
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          modelId: '',
          endpointId: params.endpointId,
          input: params.input,
          options: params.options,
          metadata: params.metadata,
          timestamp: new Date()
        };
        return await this.mlDeploymentService.predict(request);

      case 'undeploy_model':
        await this.mlDeploymentService.undeployModel(params.endpointId);
        return { success: true };

      case 'get_model_metrics':
        return await this.mlDeploymentService.getModelMetrics(params.modelId);

      case 'get_endpoint_status':
        return await this.mlDeploymentService.getEndpointStatus(params.endpointId);

      default:
        throw new MCPError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
    }
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MLDeploymentMCPServer();
  server.start().catch(console.error);
}