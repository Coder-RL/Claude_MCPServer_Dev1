import { BaseServer } from '../../../shared/src/base-server';
import { MCPError } from '../../../shared/src/errors';
import { withPerformanceMonitoring } from '../../../shared/src/monitoring';
import { withRetry } from '../../../shared/src/retry';
import { HealthChecker } from '../../../shared/src/health';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DataAsset {
  id: string;
  name: string;
  type: 'table' | 'view' | 'dataset' | 'file' | 'stream' | 'api' | 'model';
  location: AssetLocation;
  schema: DataSchema;
  metadata: AssetMetadata;
  classification: DataClassification;
  lineage: DataLineage;
  quality: QualityProfile;
  governance: GovernanceInfo;
  access: AccessInfo;
  lifecycle: LifecycleInfo;
  tags: string[];
  status: 'active' | 'deprecated' | 'archived' | 'deleted';
  created: Date;
  updated: Date;
}

export interface AssetLocation {
  system: string;
  database?: string;
  schema?: string;
  table?: string;
  path?: string;
  url?: string;
  region?: string;
  environment: 'development' | 'staging' | 'production';
  credentials?: string;
}

export interface DataSchema {
  version: string;
  fields: SchemaField[];
  primaryKey?: string[];
  foreignKeys?: ForeignKey[];
  indexes?: SchemaIndex[];
  constraints?: SchemaConstraint[];
  partitioning?: PartitioningInfo;
  statistics?: SchemaStatistics;
}

export interface SchemaField {
  name: string;
  type: string;
  nullable: boolean;
  description?: string;
  format?: string;
  defaultValue?: any;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  pii: boolean;
  businessTerms: string[];
  validations: FieldValidation[];
  quality: FieldQuality;
}

export interface ForeignKey {
  name: string;
  fields: string[];
  referencedAsset: string;
  referencedFields: string[];
  onDelete: 'cascade' | 'restrict' | 'set_null';
  onUpdate: 'cascade' | 'restrict' | 'set_null';
}

export interface SchemaIndex {
  name: string;
  fields: string[];
  type: 'btree' | 'hash' | 'bitmap';
  unique: boolean;
  partial?: string;
}

export interface SchemaConstraint {
  name: string;
  type: 'unique' | 'check' | 'not_null';
  fields: string[];
  condition?: string;
}

export interface PartitioningInfo {
  type: 'range' | 'list' | 'hash';
  fields: string[];
  strategy: string;
  partitions: PartitionInfo[];
}

export interface PartitionInfo {
  name: string;
  condition: string;
  size: number;
  lastModified: Date;
}

export interface SchemaStatistics {
  rowCount: number;
  sizeBytes: number;
  columnStatistics: Record<string, ColumnStatistics>;
  lastUpdated: Date;
}

export interface ColumnStatistics {
  distinctCount: number;
  nullCount: number;
  minValue?: any;
  maxValue?: any;
  avgLength?: number;
  topValues?: ValueFrequency[];
}

export interface ValueFrequency {
  value: any;
  frequency: number;
  percentage: number;
}

export interface FieldValidation {
  type: 'range' | 'pattern' | 'enum' | 'length' | 'custom';
  rule: string;
  parameters: any[];
  message: string;
}

export interface FieldQuality {
  completeness: number;
  validity: number;
  accuracy: number;
  consistency: number;
  lastAssessed: Date;
  issues: QualityIssue[];
}

export interface QualityIssue {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  count: number;
  examples: string[];
}

export interface AssetMetadata {
  title: string;
  description: string;
  purpose: string;
  domain: string;
  subdomain?: string;
  owner: string;
  steward: string;
  custodian: string;
  businessContact: string;
  technicalContact: string;
  documentation: DocumentationInfo;
  businessGlossary: BusinessGlossaryTerm[];
  certifications: CertificationInfo[];
  sla: SLAInfo;
}

export interface DocumentationInfo {
  readme?: string;
  userGuide?: string;
  technicalSpec?: string;
  changelog?: string;
  faq?: string;
  examples?: string;
  lastUpdated: Date;
}

export interface BusinessGlossaryTerm {
  term: string;
  definition: string;
  synonyms: string[];
  domain: string;
  steward: string;
  status: 'draft' | 'approved' | 'deprecated';
  relatedTerms: string[];
}

export interface CertificationInfo {
  type: 'quality' | 'security' | 'compliance' | 'performance';
  certifier: string;
  date: Date;
  validity: number;
  score: number;
  details: Record<string, any>;
}

export interface SLAInfo {
  availability: number;
  freshness: number;
  accuracy: number;
  completeness: number;
  responseTime: number;
  support: string;
  penalties: SLAPenalty[];
}

export interface SLAPenalty {
  metric: string;
  threshold: number;
  penalty: string;
  escalation: string[];
}

export interface DataClassification {
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  confidentiality: 'low' | 'medium' | 'high' | 'critical';
  integrity: 'low' | 'medium' | 'high' | 'critical';
  availability: 'low' | 'medium' | 'high' | 'critical';
  retention: RetentionPolicy;
  disposal: DisposalPolicy;
  regulations: string[];
  dataSubjects?: DataSubjectInfo[];
  processingPurposes: ProcessingPurpose[];
}

export interface RetentionPolicy {
  period: number;
  unit: 'days' | 'months' | 'years';
  reason: string;
  archiveLocation?: string;
  archiveFormat?: string;
  reviewSchedule: string;
}

export interface DisposalPolicy {
  method: 'deletion' | 'anonymization' | 'pseudonymization' | 'archival';
  schedule: string;
  verification: boolean;
  certification: boolean;
  approvals: string[];
}

export interface DataSubjectInfo {
  category: 'customer' | 'employee' | 'vendor' | 'partner' | 'other';
  count: number;
  consent: ConsentInfo[];
  rights: DataSubjectRights[];
}

export interface ConsentInfo {
  purpose: string;
  granted: boolean;
  date: Date;
  method: 'explicit' | 'implicit' | 'legitimate_interest';
  withdrawal?: Date;
}

export interface DataSubjectRights {
  right: 'access' | 'rectification' | 'erasure' | 'portability' | 'objection' | 'restriction';
  enabled: boolean;
  process: string;
  timeframe: number;
}

export interface ProcessingPurpose {
  purpose: string;
  legalBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interests' | 'public_task' | 'legitimate_interests';
  description: string;
  dataTypes: string[];
  retention: number;
  sharing: DataSharingInfo[];
}

export interface DataSharingInfo {
  recipient: string;
  type: 'internal' | 'external' | 'third_party';
  purpose: string;
  legalBasis: string;
  safeguards: string[];
  duration: number;
}

export interface DataLineage {
  upstream: LineageNode[];
  downstream: LineageNode[];
  transformations: TransformationLineage[];
  dependencies: DependencyInfo[];
  impact: ImpactAnalysis;
}

export interface LineageNode {
  assetId: string;
  name: string;
  type: string;
  relationship: 'source' | 'target' | 'intermediate';
  confidence: number;
  lastVerified: Date;
  attributes: LineageAttribute[];
}

export interface LineageAttribute {
  sourceField: string;
  targetField: string;
  transformation?: string;
  confidence: number;
}

export interface TransformationLineage {
  id: string;
  name: string;
  type: 'etl' | 'elt' | 'sql' | 'code' | 'ml' | 'api';
  description: string;
  code?: string;
  schedule?: string;
  lastRun?: Date;
  owner: string;
}

export interface DependencyInfo {
  asset: string;
  dependencyType: 'strong' | 'weak' | 'optional';
  businessCriticality: 'low' | 'medium' | 'high' | 'critical';
  technicalCriticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface ImpactAnalysis {
  downstreamAssets: number;
  affectedSystems: string[];
  businessProcesses: string[];
  estimatedImpact: 'low' | 'medium' | 'high' | 'critical';
  stakeholders: string[];
}

export interface QualityProfile {
  overallScore: number;
  dimensions: QualityDimension[];
  rules: QualityRule[];
  assessments: QualityAssessment[];
  trends: QualityTrend[];
  benchmarks: QualityBenchmark[];
}

export interface QualityDimension {
  name: 'completeness' | 'validity' | 'accuracy' | 'consistency' | 'uniqueness' | 'timeliness' | 'conformity';
  score: number;
  weight: number;
  threshold: number;
  trend: 'improving' | 'stable' | 'declining';
  issues: QualityIssue[];
  lastMeasured: Date;
}

export interface QualityRule {
  id: string;
  name: string;
  description: string;
  dimension: string;
  type: 'statistical' | 'business' | 'referential' | 'format' | 'custom';
  expression: string;
  threshold: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  enabled: boolean;
  schedule: string;
  owner: string;
  lastRun?: Date;
  results?: QualityRuleResult;
}

export interface QualityRuleResult {
  passed: boolean;
  score: number;
  violationCount: number;
  violationPercentage: number;
  examples: any[];
  trend: number[];
  timestamp: Date;
}

export interface QualityAssessment {
  id: string;
  type: 'manual' | 'automated' | 'scheduled';
  scope: string[];
  assessor: string;
  methodology: string;
  startDate: Date;
  endDate: Date;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  findings: QualityFinding[];
  recommendations: QualityRecommendation[];
  score: number;
  certified: boolean;
}

export interface QualityFinding {
  id: string;
  dimension: string;
  field?: string;
  issue: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  impact: string;
  evidence: string[];
  recommendation: string;
  status: 'open' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed';
}

export interface QualityRecommendation {
  id: string;
  type: 'process' | 'technical' | 'governance' | 'training';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  description: string;
  implementation: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  timeline: string;
  owner?: string;
  status: 'proposed' | 'approved' | 'in_progress' | 'completed' | 'rejected';
}

export interface QualityTrend {
  dimension: string;
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly';
  dataPoints: TrendDataPoint[];
  trend: 'improving' | 'stable' | 'declining';
  changeRate: number;
}

export interface TrendDataPoint {
  timestamp: Date;
  value: number;
  violationCount?: number;
}

export interface QualityBenchmark {
  name: string;
  description: string;
  industry: string;
  percentile: number;
  value: number;
  source: string;
  date: Date;
}

export interface GovernanceInfo {
  policies: DataPolicy[];
  controls: DataControl[];
  compliance: ComplianceInfo;
  risk: RiskInfo;
  audit: AuditInfo;
  approval: ApprovalWorkflow;
}

export interface DataPolicy {
  id: string;
  name: string;
  category: 'access' | 'usage' | 'retention' | 'quality' | 'security' | 'privacy';
  description: string;
  scope: string[];
  rules: PolicyRule[];
  exceptions: PolicyException[];
  version: string;
  effectiveDate: Date;
  owner: string;
  approved: boolean;
  lastReviewed: Date;
}

export interface PolicyRule {
  id: string;
  condition: string;
  action: 'allow' | 'deny' | 'restrict' | 'log' | 'approve';
  parameters: Record<string, any>;
  enforcement: 'manual' | 'automatic' | 'semi-automatic';
  severity: 'info' | 'warning' | 'error' | 'critical';
}

export interface PolicyException {
  id: string;
  reason: string;
  requestor: string;
  approver: string;
  approvalDate: Date;
  expiryDate: Date;
  conditions: string[];
  usage: number;
}

export interface DataControl {
  id: string;
  name: string;
  type: 'preventive' | 'detective' | 'corrective' | 'compensating';
  category: 'technical' | 'administrative' | 'physical';
  description: string;
  implementation: string;
  frequency: 'continuous' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
  automated: boolean;
  effectiveness: number;
  lastTested: Date;
  testResults: ControlTestResult[];
  owner: string;
  evidence: string[];
}

export interface ControlTestResult {
  date: Date;
  tester: string;
  result: 'effective' | 'partially_effective' | 'ineffective';
  findings: string[];
  recommendations: string[];
  score: number;
}

export interface ComplianceInfo {
  frameworks: ComplianceFramework[];
  assessments: ComplianceAssessment[];
  violations: ComplianceViolation[];
  certifications: ComplianceCertification[];
  monitoring: ComplianceMonitoring;
}

export interface ComplianceFramework {
  name: string;
  version: string;
  description: string;
  requirements: ComplianceRequirement[];
  applicability: string[];
  status: 'compliant' | 'non_compliant' | 'partially_compliant' | 'not_assessed';
  lastAssessed: Date;
  nextAssessment: Date;
}

export interface ComplianceRequirement {
  id: string;
  title: string;
  description: string;
  mandatory: boolean;
  controls: string[];
  evidence: string[];
  status: 'compliant' | 'non_compliant' | 'not_applicable';
  gaps: string[];
}

export interface ComplianceAssessment {
  id: string;
  framework: string;
  scope: string[];
  assessor: string;
  startDate: Date;
  endDate: Date;
  status: 'planned' | 'in_progress' | 'completed';
  findings: ComplianceFinding[];
  score: number;
  recommendations: string[];
}

export interface ComplianceFinding {
  requirementId: string;
  status: 'compliant' | 'non_compliant' | 'partially_compliant';
  evidence: string[];
  gaps: string[];
  risk: 'low' | 'medium' | 'high' | 'critical';
  remediation: string[];
}

export interface ComplianceViolation {
  id: string;
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected: Date;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  assignee: string;
  dueDate: Date;
  evidence: string[];
  impact: string;
  remediation: string[];
}

export interface ComplianceCertification {
  type: string;
  issuer: string;
  number: string;
  issueDate: Date;
  expiryDate: Date;
  scope: string[];
  conditions: string[];
  status: 'valid' | 'suspended' | 'expired' | 'revoked';
}

export interface ComplianceMonitoring {
  enabled: boolean;
  frequency: string;
  metrics: ComplianceMetric[];
  alerts: ComplianceAlert[];
  reports: ComplianceReport[];
}

export interface ComplianceMetric {
  name: string;
  description: string;
  calculation: string;
  target: number;
  threshold: number;
  current: number;
  trend: 'improving' | 'stable' | 'declining';
}

export interface ComplianceAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  status: 'open' | 'acknowledged' | 'resolved';
  assignee: string;
}

export interface ComplianceReport {
  id: string;
  type: string;
  period: string;
  generated: Date;
  recipients: string[];
  summary: string;
  details: Record<string, any>;
}

export interface RiskInfo {
  assessments: RiskAssessment[];
  register: RiskRegister[];
  mitigation: RiskMitigation[];
  monitoring: RiskMonitoring;
}

export interface RiskAssessment {
  id: string;
  type: 'data_risk' | 'operational_risk' | 'compliance_risk' | 'security_risk';
  scope: string[];
  methodology: string;
  assessor: string;
  date: Date;
  risks: IdentifiedRisk[];
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

export interface IdentifiedRisk {
  id: string;
  category: string;
  description: string;
  likelihood: number;
  impact: number;
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  causes: string[];
  consequences: string[];
  indicators: string[];
}

export interface RiskRegister {
  id: string;
  title: string;
  description: string;
  category: string;
  inherentRisk: number;
  residualRisk: number;
  appetite: number;
  tolerance: number;
  owner: string;
  controls: string[];
  status: 'open' | 'monitoring' | 'mitigated' | 'closed';
  lastReviewed: Date;
}

export interface RiskMitigation {
  riskId: string;
  strategy: 'avoid' | 'reduce' | 'transfer' | 'accept';
  actions: MitigationAction[];
  timeline: string;
  budget: number;
  owner: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  effectiveness: number;
}

export interface MitigationAction {
  id: string;
  description: string;
  type: 'process' | 'technical' | 'training' | 'policy';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  effort: number;
  cost: number;
  deadline: Date;
  assignee: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  dependencies: string[];
}

export interface RiskMonitoring {
  enabled: boolean;
  frequency: string;
  indicators: RiskIndicator[];
  alerts: RiskAlert[];
  reports: RiskReport[];
}

export interface RiskIndicator {
  name: string;
  description: string;
  type: 'leading' | 'lagging';
  calculation: string;
  threshold: number;
  current: number;
  trend: 'improving' | 'stable' | 'worsening';
  lastUpdated: Date;
}

export interface RiskAlert {
  id: string;
  indicator: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  status: 'open' | 'acknowledged' | 'resolved';
  assignee: string;
  actions: string[];
}

export interface RiskReport {
  id: string;
  type: string;
  period: string;
  generated: Date;
  recipients: string[];
  summary: string;
  trends: Record<string, any>;
  recommendations: string[];
}

export interface AuditInfo {
  trails: AuditTrail[];
  logs: AuditLog[];
  reports: AuditReport[];
  reviews: AuditReview[];
  retention: number;
}

export interface AuditTrail {
  id: string;
  timestamp: Date;
  user: string;
  action: string;
  resource: string;
  details: Record<string, any>;
  outcome: 'success' | 'failure' | 'partial';
  risk: 'low' | 'medium' | 'high' | 'critical';
  ipAddress?: string;
  userAgent?: string;
  location?: string;
}

export interface AuditLog {
  id: string;
  category: 'access' | 'modification' | 'deletion' | 'export' | 'sharing' | 'configuration';
  timestamp: Date;
  user: string;
  action: string;
  resource: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  approved?: boolean;
  approver?: string;
}

export interface AuditReport {
  id: string;
  type: 'access' | 'compliance' | 'security' | 'quality' | 'usage';
  period: string;
  generated: Date;
  auditor: string;
  scope: string[];
  findings: AuditFinding[];
  recommendations: string[];
  status: 'draft' | 'final' | 'approved';
}

export interface AuditFinding {
  id: string;
  category: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: string[];
  impact: string;
  recommendation: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
}

export interface AuditReview {
  id: string;
  type: 'periodic' | 'triggered' | 'compliance';
  scope: string[];
  reviewer: string;
  startDate: Date;
  endDate: Date;
  status: 'planned' | 'in_progress' | 'completed';
  checklist: ReviewItem[];
  conclusions: string[];
  actions: string[];
}

export interface ReviewItem {
  item: string;
  status: 'not_reviewed' | 'compliant' | 'non_compliant' | 'needs_improvement';
  comments: string;
  evidence: string[];
}

export interface ApprovalWorkflow {
  enabled: boolean;
  workflows: Workflow[];
  approvers: Approver[];
  decisions: ApprovalDecision[];
}

export interface Workflow {
  id: string;
  name: string;
  trigger: string;
  steps: WorkflowStep[];
  timeout: number;
  escalation: EscalationRule[];
  enabled: boolean;
}

export interface WorkflowStep {
  id: string;
  name: string;
  type: 'approval' | 'review' | 'notification' | 'automation';
  order: number;
  approver?: string;
  conditions: string[];
  timeout: number;
  required: boolean;
}

export interface EscalationRule {
  level: number;
  delay: number;
  approver: string;
  action: 'notify' | 'auto_approve' | 'auto_reject';
}

export interface Approver {
  id: string;
  name: string;
  role: string;
  email: string;
  backup: string[];
  expertise: string[];
  availability: string;
  delegation: DelegationRule[];
}

export interface DelegationRule {
  delegateeTo: string;
  startDate: Date;
  endDate: Date;
  scope: string[];
  conditions: string[];
}

export interface ApprovalDecision {
  id: string;
  workflowId: string;
  stepId: string;
  approver: string;
  decision: 'approved' | 'rejected' | 'conditional' | 'delegated';
  timestamp: Date;
  comments: string;
  conditions: string[];
  evidence: string[];
}

export interface AccessInfo {
  permissions: DataPermission[];
  roles: DataRole[];
  policies: AccessPolicy[];
  requests: AccessRequest[];
  reviews: AccessReview[];
  monitoring: AccessMonitoring;
}

export interface DataPermission {
  id: string;
  principal: string;
  principalType: 'user' | 'group' | 'service' | 'role';
  actions: string[];
  resources: string[];
  conditions: string[];
  granted: Date;
  expires?: Date;
  grantedBy: string;
  reason: string;
  reviewed: Date;
}

export interface DataRole {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  members: string[];
  constraints: RoleConstraint[];
  inheritance: string[];
  created: Date;
  lastModified: Date;
  owner: string;
}

export interface RoleConstraint {
  type: 'time' | 'location' | 'device' | 'attribute' | 'custom';
  condition: string;
  parameters: Record<string, any>;
}

export interface AccessPolicy {
  id: string;
  name: string;
  description: string;
  type: 'rbac' | 'abac' | 'dac' | 'mac';
  rules: AccessRule[];
  effect: 'allow' | 'deny';
  priority: number;
  conditions: string[];
  exceptions: string[];
  enabled: boolean;
  version: string;
  lastModified: Date;
}

export interface AccessRule {
  id: string;
  subject: string;
  action: string;
  resource: string;
  condition?: string;
  effect: 'allow' | 'deny';
  priority: number;
}

export interface AccessRequest {
  id: string;
  requestor: string;
  type: 'access' | 'modification' | 'deletion' | 'export';
  resource: string;
  permissions: string[];
  justification: string;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  submitted: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'withdrawn';
  approver?: string;
  approvalDate?: Date;
  comments?: string;
  conditions?: string[];
  expiryDate?: Date;
}

export interface AccessReview {
  id: string;
  type: 'periodic' | 'triggered' | 'certification';
  scope: string[];
  reviewer: string;
  startDate: Date;
  dueDate: Date;
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue';
  items: ReviewAccessItem[];
  decisions: AccessDecision[];
  summary: string;
}

export interface ReviewAccessItem {
  principal: string;
  resource: string;
  permissions: string[];
  lastUsed: Date;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  justification: string;
  recommendation: 'maintain' | 'modify' | 'revoke' | 'investigate';
}

export interface AccessDecision {
  item: string;
  decision: 'approve' | 'revoke' | 'modify' | 'defer';
  justification: string;
  reviewer: string;
  date: Date;
  newPermissions?: string[];
  reviewDate?: Date;
}

export interface AccessMonitoring {
  enabled: boolean;
  patterns: AccessPattern[];
  anomalies: AccessAnomaly[];
  violations: AccessViolation[];
  reports: AccessReport[];
}

export interface AccessPattern {
  name: string;
  description: string;
  pattern: string;
  threshold: number;
  actions: string[];
  enabled: boolean;
}

export interface AccessAnomaly {
  id: string;
  type: 'unusual_access' | 'privilege_escalation' | 'bulk_download' | 'off_hours' | 'location';
  user: string;
  resource: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected: Date;
  details: Record<string, any>;
  status: 'open' | 'investigating' | 'false_positive' | 'resolved';
  assignee: string;
}

export interface AccessViolation {
  id: string;
  type: 'unauthorized_access' | 'policy_violation' | 'privilege_abuse' | 'data_exfiltration';
  user: string;
  resource: string;
  action: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detected: Date;
  evidence: string[];
  impact: string;
  response: string[];
  status: 'open' | 'investigating' | 'contained' | 'resolved';
}

export interface AccessReport {
  id: string;
  type: 'usage' | 'violations' | 'reviews' | 'certifications';
  period: string;
  generated: Date;
  recipients: string[];
  metrics: Record<string, number>;
  findings: string[];
  recommendations: string[];
}

export interface LifecycleInfo {
  stage: 'creation' | 'active' | 'maintenance' | 'deprecation' | 'archival' | 'disposal';
  policy: LifecyclePolicy;
  history: LifecycleEvent[];
  schedule: LifecycleSchedule;
  automation: LifecycleAutomation;
}

export interface LifecyclePolicy {
  id: string;
  name: string;
  stages: LifecycleStage[];
  triggers: LifecycleTrigger[];
  approvals: boolean;
  notifications: string[];
  owner: string;
}

export interface LifecycleStage {
  name: string;
  duration?: number;
  conditions: string[];
  actions: LifecycleAction[];
  approvals: string[];
  required: boolean;
}

export interface LifecycleAction {
  type: 'notification' | 'archival' | 'deletion' | 'migration' | 'backup' | 'custom';
  description: string;
  parameters: Record<string, any>;
  automated: boolean;
  rollback?: string;
}

export interface LifecycleTrigger {
  type: 'time' | 'usage' | 'quality' | 'compliance' | 'manual';
  condition: string;
  parameters: Record<string, any>;
  stage: string;
}

export interface LifecycleEvent {
  id: string;
  timestamp: Date;
  stage: string;
  action: string;
  user: string;
  automated: boolean;
  result: 'success' | 'failure' | 'partial';
  details: Record<string, any>;
}

export interface LifecycleSchedule {
  enabled: boolean;
  events: ScheduledEvent[];
  nextEvent?: Date;
  lastExecution?: Date;
}

export interface ScheduledEvent {
  id: string;
  type: string;
  schedule: string;
  action: string;
  parameters: Record<string, any>;
  enabled: boolean;
  nextRun: Date;
}

export interface LifecycleAutomation {
  enabled: boolean;
  rules: AutomationRule[];
  workflows: AutomationWorkflow[];
  monitoring: AutomationMonitoring;
}

export interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  conditions: string[];
  actions: string[];
  enabled: boolean;
  priority: number;
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  trigger: string;
  steps: AutomationStep[];
  enabled: boolean;
  timeout: number;
}

export interface AutomationStep {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, any>;
  timeout: number;
  retries: number;
  onFailure: 'stop' | 'continue' | 'retry' | 'escalate';
}

export interface AutomationMonitoring {
  enabled: boolean;
  metrics: AutomationMetric[];
  alerts: AutomationAlert[];
  logs: AutomationLog[];
}

export interface AutomationMetric {
  name: string;
  description: string;
  value: number;
  threshold: number;
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: Date;
}

export interface AutomationAlert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  status: 'open' | 'acknowledged' | 'resolved';
}

export interface AutomationLog {
  id: string;
  timestamp: Date;
  workflow: string;
  step: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  duration: number;
  details: Record<string, any>;
}

export class DataGovernanceService {
  private assets: Map<string, DataAsset> = new Map();
  private qualityRules: Map<string, QualityRule> = new Map();
  private policies: Map<string, DataPolicy> = new Map();
  private workflows: Map<string, Workflow> = new Map();
  private healthChecker: HealthChecker;
  private configPath: string;

  constructor(configPath: string = './data/data-governance') {
    this.configPath = configPath;
    this.healthChecker = new HealthChecker();
  }

  async registerDataAsset(asset: Omit<DataAsset, 'id' | 'created' | 'updated'>): Promise<string> {
    try {
      const id = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const dataAsset: DataAsset = {
        ...asset,
        id,
        created: new Date(),
        updated: new Date()
      };

      await this.validateDataAsset(dataAsset);
      
      this.assets.set(id, dataAsset);
      await this.saveAssets();

      // Initialize quality monitoring
      await this.initializeQualityMonitoring(dataAsset);

      return id;
    } catch (error) {
      throw new MCPError('GOVERNANCE_ERROR', `Failed to register data asset: ${error}`);
    }
  }

  async assessDataQuality(assetId: string, assessmentType: 'full' | 'incremental' | 'targeted'): Promise<string> {
    try {
      const asset = this.assets.get(assetId);
      if (!asset) {
        throw new MCPError('GOVERNANCE_ERROR', `Asset ${assetId} not found`);
      }

      const assessmentId = `qa_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const assessment: QualityAssessment = {
        id: assessmentId,
        type: 'automated',
        scope: [assetId],
        assessor: 'system',
        methodology: 'rule-based',
        startDate: new Date(),
        endDate: new Date(),
        status: 'in_progress',
        findings: [],
        recommendations: [],
        score: 0,
        certified: false
      };

      asset.quality.assessments.push(assessment);

      // Run quality assessment
      await this.runQualityAssessment(asset, assessment, assessmentType);

      assessment.status = 'completed';
      assessment.endDate = new Date();

      await this.saveAssets();

      return assessmentId;
    } catch (error) {
      throw new MCPError('QUALITY_ERROR', `Quality assessment failed: ${error}`);
    }
  }

  private async runQualityAssessment(asset: DataAsset, assessment: QualityAssessment, type: string): Promise<void> {
    // Run quality rules
    const applicableRules = asset.quality.rules.filter(rule => rule.enabled);
    
    for (const rule of applicableRules) {
      const result = await this.executeQualityRule(asset, rule);
      rule.results = result;
      
      if (!result.passed) {
        const finding: QualityFinding = {
          id: `finding_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          dimension: rule.dimension,
          field: rule.name.includes('.') ? rule.name.split('.')[1] : undefined,
          issue: `Quality rule '${rule.name}' failed`,
          severity: rule.severity === 'critical' ? 'critical' : rule.severity === 'error' ? 'high' : 'medium',
          impact: `${result.violationCount} violations found (${result.violationPercentage.toFixed(2)}%)`,
          evidence: result.examples.map(ex => JSON.stringify(ex)),
          recommendation: this.generateRecommendation(rule, result),
          status: 'open'
        };
        
        assessment.findings.push(finding);
      }
    }

    // Calculate dimension scores
    const dimensionScores = new Map<string, number>();
    const ruleCounts = new Map<string, number>();

    for (const rule of applicableRules) {
      if (rule.results) {
        const dimension = rule.dimension;
        const currentScore = dimensionScores.get(dimension) || 0;
        const currentCount = ruleCounts.get(dimension) || 0;
        
        dimensionScores.set(dimension, currentScore + rule.results.score);
        ruleCounts.set(dimension, currentCount + 1);
      }
    }

    // Update quality dimensions
    asset.quality.dimensions = Array.from(dimensionScores.keys()).map(dimension => {
      const totalScore = dimensionScores.get(dimension) || 0;
      const ruleCount = ruleCounts.get(dimension) || 1;
      const avgScore = totalScore / ruleCount;
      
      const existingDimension = asset.quality.dimensions.find(d => d.name === dimension as any);
      const threshold = existingDimension?.threshold || 0.8;
      
      return {
        name: dimension as any,
        score: avgScore,
        weight: existingDimension?.weight || 1.0,
        threshold,
        trend: this.calculateTrend(asset, dimension, avgScore),
        issues: assessment.findings.filter(f => f.dimension === dimension).map(f => ({
          type: f.issue,
          description: f.impact,
          severity: f.severity,
          count: 1,
          examples: f.evidence
        })),
        lastMeasured: new Date()
      };
    });

    // Calculate overall score
    const totalWeight = asset.quality.dimensions.reduce((sum, d) => sum + d.weight, 0);
    const weightedScore = asset.quality.dimensions.reduce((sum, d) => sum + (d.score * d.weight), 0);
    asset.quality.overallScore = totalWeight > 0 ? weightedScore / totalWeight : 0;
    assessment.score = asset.quality.overallScore;

    // Generate recommendations
    assessment.recommendations = this.generateAssessmentRecommendations(assessment);
  }

  private async executeQualityRule(asset: DataAsset, rule: QualityRule): Promise<QualityRuleResult> {
    // Simulate rule execution
    const passed = Math.random() > 0.3; // 70% pass rate simulation
    const score = passed ? Math.random() * 0.3 + 0.7 : Math.random() * 0.6; // 0.7-1.0 if passed, 0.0-0.6 if failed
    const violationCount = passed ? 0 : Math.floor(Math.random() * 100) + 1;
    const totalRecords = 1000; // Simulated total records
    const violationPercentage = (violationCount / totalRecords) * 100;

    const examples = violationCount > 0 ? [
      { field: 'example_field', value: 'invalid_value', reason: 'Does not match expected pattern' },
      { field: 'another_field', value: null, reason: 'Required field is null' }
    ].slice(0, Math.min(violationCount, 5)) : [];

    return {
      passed,
      score,
      violationCount,
      violationPercentage,
      examples,
      trend: [score], // Single point for now, would be historical in real implementation
      timestamp: new Date()
    };
  }

  private generateRecommendation(rule: QualityRule, result: QualityRuleResult): string {
    if (rule.dimension === 'completeness') {
      return `Review data ingestion process to reduce missing values. Consider implementing validation at source.`;
    } else if (rule.dimension === 'validity') {
      return `Implement data validation rules to ensure format compliance. Review transformation logic.`;
    } else if (rule.dimension === 'accuracy') {
      return `Validate source data accuracy and implement reconciliation processes.`;
    } else if (rule.dimension === 'consistency') {
      return `Standardize data formats and implement cross-system validation checks.`;
    } else {
      return `Review and improve data quality processes for ${rule.dimension}.`;
    }
  }

  private calculateTrend(asset: DataAsset, dimension: string, currentScore: number): 'improving' | 'stable' | 'declining' {
    // Simulate trend calculation
    const historical = asset.quality.trends.find(t => t.dimension === dimension);
    if (!historical || historical.dataPoints.length === 0) {
      return 'stable';
    }

    const lastScore = historical.dataPoints[historical.dataPoints.length - 1].value;
    const difference = currentScore - lastScore;
    
    if (Math.abs(difference) < 0.05) return 'stable';
    return difference > 0 ? 'improving' : 'declining';
  }

  private generateAssessmentRecommendations(assessment: QualityAssessment): string[] {
    const recommendations: string[] = [];
    
    const criticalFindings = assessment.findings.filter(f => f.severity === 'critical').length;
    const highFindings = assessment.findings.filter(f => f.severity === 'high').length;

    if (criticalFindings > 0) {
      recommendations.push(`Address ${criticalFindings} critical quality issues immediately`);
    }

    if (highFindings > 0) {
      recommendations.push(`Plan remediation for ${highFindings} high-priority quality issues`);
    }

    if (assessment.score < 0.6) {
      recommendations.push('Implement comprehensive data quality improvement program');
    } else if (assessment.score < 0.8) {
      recommendations.push('Focus on specific dimension improvements to meet quality targets');
    }

    return recommendations;
  }

  async createDataPolicy(policy: Omit<DataPolicy, 'id' | 'effectiveDate' | 'lastReviewed'>): Promise<string> {
    try {
      const id = `policy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const dataPolicy: DataPolicy = {
        ...policy,
        id,
        effectiveDate: new Date(),
        lastReviewed: new Date()
      };

      await this.validateDataPolicy(dataPolicy);
      
      this.policies.set(id, dataPolicy);
      await this.savePolicies();

      return id;
    } catch (error) {
      throw new MCPError('POLICY_ERROR', `Failed to create data policy: ${error}`);
    }
  }

  async evaluateCompliance(assetId: string, frameworks: string[]): Promise<ComplianceAssessment> {
    try {
      const asset = this.assets.get(assetId);
      if (!asset) {
        throw new MCPError('GOVERNANCE_ERROR', `Asset ${assetId} not found`);
      }

      const assessmentId = `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const assessment: ComplianceAssessment = {
        id: assessmentId,
        framework: frameworks.join(','),
        scope: [assetId],
        assessor: 'system',
        startDate: new Date(),
        endDate: new Date(),
        status: 'completed',
        findings: [],
        score: 0,
        recommendations: []
      };

      // Evaluate each framework
      for (const frameworkName of frameworks) {
        const framework = asset.governance.compliance.frameworks.find(f => f.name === frameworkName);
        if (framework) {
          const findings = await this.evaluateFrameworkCompliance(asset, framework);
          assessment.findings.push(...findings);
        }
      }

      // Calculate compliance score
      const totalRequirements = assessment.findings.length;
      const compliantRequirements = assessment.findings.filter(f => f.status === 'compliant').length;
      assessment.score = totalRequirements > 0 ? (compliantRequirements / totalRequirements) * 100 : 100;

      // Generate recommendations
      assessment.recommendations = this.generateComplianceRecommendations(assessment);

      // Update asset compliance info
      asset.governance.compliance.assessments.push(assessment);
      await this.saveAssets();

      return assessment;
    } catch (error) {
      throw new MCPError('COMPLIANCE_ERROR', `Compliance evaluation failed: ${error}`);
    }
  }

  private async evaluateFrameworkCompliance(asset: DataAsset, framework: ComplianceFramework): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    for (const requirement of framework.requirements) {
      const finding: ComplianceFinding = {
        requirementId: requirement.id,
        status: this.simulateComplianceStatus(),
        evidence: this.gatherEvidence(asset, requirement),
        gaps: this.identifyGaps(asset, requirement),
        risk: this.assessComplianceRisk(requirement),
        remediation: this.suggestRemediation(requirement)
      };

      findings.push(finding);
    }

    return findings;
  }

  private simulateComplianceStatus(): 'compliant' | 'non_compliant' | 'partially_compliant' {
    const rand = Math.random();
    if (rand < 0.6) return 'compliant';
    if (rand < 0.8) return 'partially_compliant';
    return 'non_compliant';
  }

  private gatherEvidence(asset: DataAsset, requirement: ComplianceRequirement): string[] {
    // Simulate evidence gathering
    return [
      'Data classification documented',
      'Access controls implemented',
      'Audit logs available',
      'Privacy policy updated'
    ];
  }

  private identifyGaps(asset: DataAsset, requirement: ComplianceRequirement): string[] {
    // Simulate gap identification
    const gaps = [
      'Missing data retention documentation',
      'Incomplete access review process',
      'Insufficient encryption in transit',
      'Limited consent management'
    ];
    
    return gaps.slice(0, Math.floor(Math.random() * gaps.length));
  }

  private assessComplianceRisk(requirement: ComplianceRequirement): 'low' | 'medium' | 'high' | 'critical' {
    if (requirement.mandatory) {
      return Math.random() > 0.7 ? 'high' : 'medium';
    }
    return Math.random() > 0.5 ? 'medium' : 'low';
  }

  private suggestRemediation(requirement: ComplianceRequirement): string[] {
    return [
      'Update data governance procedures',
      'Implement additional controls',
      'Provide staff training',
      'Review and update policies'
    ];
  }

  private generateComplianceRecommendations(assessment: ComplianceAssessment): string[] {
    const recommendations: string[] = [];
    
    const nonCompliantCount = assessment.findings.filter(f => f.status === 'non_compliant').length;
    const partialCount = assessment.findings.filter(f => f.status === 'partially_compliant').length;
    
    if (nonCompliantCount > 0) {
      recommendations.push(`Address ${nonCompliantCount} non-compliant requirements`);
    }
    
    if (partialCount > 0) {
      recommendations.push(`Improve ${partialCount} partially compliant requirements`);
    }
    
    if (assessment.score < 80) {
      recommendations.push('Implement comprehensive compliance improvement program');
    }

    return recommendations;
  }

  async monitorDataAccess(assetId: string, period: 'daily' | 'weekly' | 'monthly'): Promise<AccessReport> {
    try {
      const asset = this.assets.get(assetId);
      if (!asset) {
        throw new MCPError('GOVERNANCE_ERROR', `Asset ${assetId} not found`);
      }

      const reportId = `access_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const report: AccessReport = {
        id: reportId,
        type: 'usage',
        period,
        generated: new Date(),
        recipients: [asset.metadata.owner, asset.metadata.steward],
        metrics: this.calculateAccessMetrics(asset, period),
        findings: this.generateAccessFindings(asset),
        recommendations: this.generateAccessRecommendations(asset)
      };

      // Update asset with monitoring results
      asset.access.reports.push(report);
      await this.saveAssets();

      return report;
    } catch (error) {
      throw new MCPError('ACCESS_ERROR', `Access monitoring failed: ${error}`);
    }
  }

  private calculateAccessMetrics(asset: DataAsset, period: string): Record<string, number> {
    // Simulate access metrics calculation
    return {
      total_accesses: Math.floor(Math.random() * 1000) + 100,
      unique_users: Math.floor(Math.random() * 50) + 10,
      peak_concurrent_users: Math.floor(Math.random() * 20) + 5,
      failed_access_attempts: Math.floor(Math.random() * 10),
      unusual_access_patterns: Math.floor(Math.random() * 5),
      data_exported: Math.floor(Math.random() * 100), // MB
      privilege_escalations: Math.floor(Math.random() * 3),
      off_hours_access: Math.floor(Math.random() * 20)
    };
  }

  private generateAccessFindings(asset: DataAsset): string[] {
    const findings = [
      'Unusual access pattern detected for user john.doe',
      'High volume data export by service account',
      'Off-hours access to sensitive data detected',
      'Failed authentication attempts above threshold',
      'New user with high privilege access',
      'Bulk data access without approval'
    ];

    return findings.slice(0, Math.floor(Math.random() * findings.length));
  }

  private generateAccessRecommendations(asset: DataAsset): string[] {
    return [
      'Review and update access permissions',
      'Implement additional monitoring for sensitive operations',
      'Conduct user access recertification',
      'Enhance authentication requirements for high-risk data',
      'Implement data loss prevention controls'
    ];
  }

  async traceDataLineage(assetId: string, direction: 'upstream' | 'downstream' | 'both', depth: number = 3): Promise<DataLineage> {
    try {
      const asset = this.assets.get(assetId);
      if (!asset) {
        throw new MCPError('GOVERNANCE_ERROR', `Asset ${assetId} not found`);
      }

      const lineage: DataLineage = {
        upstream: direction === 'downstream' ? [] : await this.traceUpstreamLineage(asset, depth),
        downstream: direction === 'upstream' ? [] : await this.traceDownstreamLineage(asset, depth),
        transformations: await this.getTransformationLineage(asset),
        dependencies: await this.analyzeDependencies(asset),
        impact: await this.analyzeImpact(asset)
      };

      // Update asset lineage
      asset.lineage = lineage;
      await this.saveAssets();

      return lineage;
    } catch (error) {
      throw new MCPError('LINEAGE_ERROR', `Lineage tracing failed: ${error}`);
    }
  }

  private async traceUpstreamLineage(asset: DataAsset, depth: number): Promise<LineageNode[]> {
    // Simulate upstream lineage discovery
    if (depth <= 0) return [];

    const upstreamNodes: LineageNode[] = [];
    const nodeCount = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < nodeCount; i++) {
      const node: LineageNode = {
        assetId: `upstream_${i + 1}`,
        name: `Upstream Asset ${i + 1}`,
        type: 'table',
        relationship: 'source',
        confidence: Math.random() * 0.3 + 0.7,
        lastVerified: new Date(Date.now() - Math.random() * 86400000 * 7),
        attributes: this.generateLineageAttributes()
      };
      upstreamNodes.push(node);
    }

    return upstreamNodes;
  }

  private async traceDownstreamLineage(asset: DataAsset, depth: number): Promise<LineageNode[]> {
    // Simulate downstream lineage discovery
    if (depth <= 0) return [];

    const downstreamNodes: LineageNode[] = [];
    const nodeCount = Math.floor(Math.random() * 4) + 1;

    for (let i = 0; i < nodeCount; i++) {
      const node: LineageNode = {
        assetId: `downstream_${i + 1}`,
        name: `Downstream Asset ${i + 1}`,
        type: Math.random() > 0.5 ? 'table' : 'view',
        relationship: 'target',
        confidence: Math.random() * 0.3 + 0.7,
        lastVerified: new Date(Date.now() - Math.random() * 86400000 * 7),
        attributes: this.generateLineageAttributes()
      };
      downstreamNodes.push(node);
    }

    return downstreamNodes;
  }

  private generateLineageAttributes(): LineageAttribute[] {
    const attributes: LineageAttribute[] = [];
    const fieldCount = Math.floor(Math.random() * 5) + 1;

    for (let i = 0; i < fieldCount; i++) {
      attributes.push({
        sourceField: `source_field_${i + 1}`,
        targetField: `target_field_${i + 1}`,
        transformation: Math.random() > 0.5 ? 'direct_copy' : 'calculated',
        confidence: Math.random() * 0.3 + 0.7
      });
    }

    return attributes;
  }

  private async getTransformationLineage(asset: DataAsset): Promise<TransformationLineage[]> {
    // Simulate transformation discovery
    return [
      {
        id: `transform_1`,
        name: 'ETL Process',
        type: 'etl',
        description: 'Daily data transformation process',
        schedule: '0 2 * * *',
        lastRun: new Date(Date.now() - Math.random() * 86400000),
        owner: asset.metadata.owner
      },
      {
        id: `transform_2`,
        name: 'Data Cleansing',
        type: 'sql',
        description: 'Data quality transformation',
        code: 'SELECT * FROM source WHERE quality_score > 0.8',
        owner: asset.metadata.steward
      }
    ];
  }

  private async analyzeDependencies(asset: DataAsset): Promise<DependencyInfo[]> {
    // Simulate dependency analysis
    return [
      {
        asset: 'upstream_system_1',
        dependencyType: 'strong',
        businessCriticality: 'high',
        technicalCriticality: 'critical'
      },
      {
        asset: 'reference_data',
        dependencyType: 'weak',
        businessCriticality: 'medium',
        technicalCriticality: 'medium'
      }
    ];
  }

  private async analyzeImpact(asset: DataAsset): Promise<ImpactAnalysis> {
    // Simulate impact analysis
    return {
      downstreamAssets: Math.floor(Math.random() * 10) + 1,
      affectedSystems: ['CRM', 'Analytics Platform', 'Reporting System'],
      businessProcesses: ['Customer Analytics', 'Financial Reporting', 'Compliance Monitoring'],
      estimatedImpact: Math.random() > 0.5 ? 'high' : 'medium',
      stakeholders: [asset.metadata.owner, asset.metadata.steward, asset.metadata.businessContact]
    };
  }

  private async initializeQualityMonitoring(asset: DataAsset): Promise<void> {
    // Initialize default quality rules based on asset type and schema
    const defaultRules: QualityRule[] = [];

    // Completeness rules
    for (const field of asset.schema.fields) {
      if (!field.nullable) {
        defaultRules.push({
          id: `completeness_${field.name}`,
          name: `Completeness: ${field.name}`,
          description: `Ensure ${field.name} field is not null`,
          dimension: 'completeness',
          type: 'statistical',
          expression: `COUNT(CASE WHEN ${field.name} IS NULL THEN 1 END) / COUNT(*) < 0.05`,
          threshold: 0.95,
          severity: field.pii ? 'critical' : 'warning',
          enabled: true,
          schedule: 'daily',
          owner: asset.metadata.steward
        });
      }
    }

    // Validity rules
    for (const field of asset.schema.fields) {
      if (field.format) {
        defaultRules.push({
          id: `validity_${field.name}`,
          name: `Validity: ${field.name}`,
          description: `Ensure ${field.name} matches expected format`,
          dimension: 'validity',
          type: 'format',
          expression: `REGEXP_LIKE(${field.name}, '${field.format}')`,
          threshold: 0.98,
          severity: 'warning',
          enabled: true,
          schedule: 'daily',
          owner: asset.metadata.steward
        });
      }
    }

    asset.quality.rules.push(...defaultRules);
  }

  private async validateDataAsset(asset: DataAsset): Promise<void> {
    if (!asset.name || asset.name.trim().length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'Asset name is required');
    }

    if (!asset.location.system) {
      throw new MCPError('VALIDATION_ERROR', 'Asset location system is required');
    }

    if (!asset.metadata.owner) {
      throw new MCPError('VALIDATION_ERROR', 'Asset owner is required');
    }

    if (!asset.metadata.steward) {
      throw new MCPError('VALIDATION_ERROR', 'Asset steward is required');
    }

    if (asset.schema.fields.length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'Asset must have at least one field defined');
    }
  }

  private async validateDataPolicy(policy: DataPolicy): Promise<void> {
    if (!policy.name || policy.name.trim().length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'Policy name is required');
    }

    if (!policy.owner) {
      throw new MCPError('VALIDATION_ERROR', 'Policy owner is required');
    }

    if (policy.rules.length === 0) {
      throw new MCPError('VALIDATION_ERROR', 'Policy must have at least one rule');
    }

    if (!policy.approved) {
      throw new MCPError('VALIDATION_ERROR', 'Policy must be approved before activation');
    }
  }

  async getGovernanceMetrics(): Promise<GovernanceMetrics> {
    const totalAssets = this.assets.size;
    const classifiedAssets = Array.from(this.assets.values()).filter(a => a.classification.sensitivity !== 'public').length;
    const qualityScores = Array.from(this.assets.values()).map(a => a.quality.overallScore);
    const averageQualityScore = qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0;

    return {
      totalAssets,
      classifiedAssets,
      governedAssets: Array.from(this.assets.values()).filter(a => a.governance.policies.length > 0).length,
      averageQualityScore,
      policiesActive: this.policies.size,
      complianceScore: this.calculateOverallComplianceScore(),
      risksIdentified: this.countTotalRisks(),
      accessViolations: this.countAccessViolations(),
      dataLineageCoverage: this.calculateLineageCoverage(),
      lifecycleManagedAssets: this.countLifecycleManagedAssets()
    };
  }

  private calculateOverallComplianceScore(): number {
    const allAssessments = Array.from(this.assets.values())
      .flatMap(asset => asset.governance.compliance.assessments);
    
    if (allAssessments.length === 0) return 0;
    
    return allAssessments.reduce((sum, assessment) => sum + assessment.score, 0) / allAssessments.length;
  }

  private countTotalRisks(): number {
    return Array.from(this.assets.values())
      .flatMap(asset => asset.governance.risk.register)
      .filter(risk => risk.status === 'open' || risk.status === 'monitoring')
      .length;
  }

  private countAccessViolations(): number {
    return Array.from(this.assets.values())
      .flatMap(asset => asset.access.monitoring.violations)
      .filter(violation => violation.status === 'open' || violation.status === 'investigating')
      .length;
  }

  private calculateLineageCoverage(): number {
    const assetsWithLineage = Array.from(this.assets.values())
      .filter(asset => asset.lineage.upstream.length > 0 || asset.lineage.downstream.length > 0)
      .length;
    
    return this.assets.size > 0 ? (assetsWithLineage / this.assets.size) * 100 : 0;
  }

  private countLifecycleManagedAssets(): number {
    return Array.from(this.assets.values())
      .filter(asset => asset.lifecycle.policy.stages.length > 0)
      .length;
  }

  private async saveAssets(): Promise<void> {
    const data = Array.from(this.assets.values());
    await fs.writeFile(
      path.join(this.configPath, 'assets.json'),
      JSON.stringify(data, null, 2)
    );
  }

  private async savePolicies(): Promise<void> {
    const data = Array.from(this.policies.values());
    await fs.writeFile(
      path.join(this.configPath, 'policies.json'),
      JSON.stringify(data, null, 2)
    );
  }

  async getHealthStatus(): Promise<any> {
    const metrics = await this.getGovernanceMetrics();

    return {
      status: 'healthy',
      totalAssets: metrics.totalAssets,
      averageQualityScore: metrics.averageQualityScore,
      complianceScore: metrics.complianceScore,
      components: {
        assets: 'healthy',
        quality: metrics.averageQualityScore > 0.8 ? 'healthy' : 'warning',
        policies: 'healthy',
        compliance: metrics.complianceScore > 80 ? 'healthy' : 'warning',
        access: 'healthy',
        lineage: 'healthy'
      },
      metrics
    };
  }
}

interface GovernanceMetrics {
  totalAssets: number;
  classifiedAssets: number;
  governedAssets: number;
  averageQualityScore: number;
  policiesActive: number;
  complianceScore: number;
  risksIdentified: number;
  accessViolations: number;
  dataLineageCoverage: number;
  lifecycleManagedAssets: number;
}

export class DataGovernanceMCPServer extends BaseServer {
  private dataGovernanceService: DataGovernanceService;

  constructor() {
    super({
      name: 'data-governance-server',
      port: parseInt(process.env.DATA_GOVERNANCE_PORT || '8115'),
      host: process.env.DATA_GOVERNANCE_HOST || 'localhost'
    });
    this.dataGovernanceService = new DataGovernanceService();
  }

  protected async initialize(): Promise<void> {
    // DataGovernanceService doesn't need async initialization
    this.logger.info('Data Governance server initialized');
  }

  protected async cleanup(): Promise<void> {
    // Cleanup resources if needed
    this.logger.info('Data Governance server cleanup');
  }

  protected setupRoutes(): void {
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this.dataGovernanceService.getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/assets', async (req, res) => {
      try {
        const assetId = await this.dataGovernanceService.registerDataAsset(req.body);
        res.json({ id: assetId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/assets/:id/quality/assess', async (req, res) => {
      try {
        const assessmentId = await this.dataGovernanceService.assessDataQuality(
          req.params.id,
          req.body.type || 'full'
        );
        res.json({ assessmentId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/policies', async (req, res) => {
      try {
        const policyId = await this.dataGovernanceService.createDataPolicy(req.body);
        res.json({ id: policyId });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/assets/:id/compliance/evaluate', async (req, res) => {
      try {
        const assessment = await this.dataGovernanceService.evaluateCompliance(
          req.params.id,
          req.body.frameworks || []
        );
        res.json(assessment);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/assets/:id/access/monitor', async (req, res) => {
      try {
        const report = await this.dataGovernanceService.monitorDataAccess(
          req.params.id,
          req.body.period || 'daily'
        );
        res.json(report);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/assets/:id/lineage', async (req, res) => {
      try {
        const lineage = await this.dataGovernanceService.traceDataLineage(
          req.params.id,
          req.query.direction as any || 'both',
          parseInt(req.query.depth as string) || 3
        );
        res.json(lineage);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/metrics', async (req, res) => {
      try {
        const metrics = await this.dataGovernanceService.getGovernanceMetrics();
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  protected getMCPTools() {
    return [
      {
        name: 'register_data_asset',
        description: 'Register a new data asset for governance',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string', enum: ['table', 'view', 'dataset', 'file', 'stream', 'api', 'model'] },
            location: { type: 'object' },
            schema: { type: 'object' },
            metadata: { type: 'object' },
            classification: { type: 'object' },
            lineage: { type: 'object' },
            quality: { type: 'object' },
            governance: { type: 'object' },
            access: { type: 'object' },
            lifecycle: { type: 'object' },
            tags: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['active', 'deprecated', 'archived', 'deleted'] }
          },
          required: ['name', 'type', 'location', 'schema', 'metadata', 'classification']
        }
      },
      {
        name: 'assess_data_quality',
        description: 'Assess the quality of a data asset',
        inputSchema: {
          type: 'object',
          properties: {
            assetId: { type: 'string' },
            assessmentType: { type: 'string', enum: ['full', 'incremental', 'targeted'] }
          },
          required: ['assetId']
        }
      },
      {
        name: 'create_data_policy',
        description: 'Create a new data governance policy',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            category: { type: 'string', enum: ['access', 'usage', 'retention', 'quality', 'security', 'privacy'] },
            description: { type: 'string' },
            scope: { type: 'array', items: { type: 'string' } },
            rules: { type: 'array' },
            exceptions: { type: 'array' },
            version: { type: 'string' },
            owner: { type: 'string' },
            approved: { type: 'boolean' }
          },
          required: ['name', 'category', 'description', 'scope', 'rules', 'owner', 'approved']
        }
      },
      {
        name: 'evaluate_compliance',
        description: 'Evaluate compliance against regulatory frameworks',
        inputSchema: {
          type: 'object',
          properties: {
            assetId: { type: 'string' },
            frameworks: { type: 'array', items: { type: 'string' } }
          },
          required: ['assetId', 'frameworks']
        }
      },
      {
        name: 'monitor_data_access',
        description: 'Monitor data access patterns and anomalies',
        inputSchema: {
          type: 'object',
          properties: {
            assetId: { type: 'string' },
            period: { type: 'string', enum: ['daily', 'weekly', 'monthly'] }
          },
          required: ['assetId']
        }
      },
      {
        name: 'trace_data_lineage',
        description: 'Trace data lineage upstream and downstream',
        inputSchema: {
          type: 'object',
          properties: {
            assetId: { type: 'string' },
            direction: { type: 'string', enum: ['upstream', 'downstream', 'both'] },
            depth: { type: 'number', minimum: 1, maximum: 10 }
          },
          required: ['assetId']
        }
      },
      {
        name: 'get_governance_metrics',
        description: 'Get comprehensive data governance metrics',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  protected async handleMCPRequest(method: string, params: any): Promise<any> {
    switch (method) {
      case 'register_data_asset':
        return { id: await this.dataGovernanceService.registerDataAsset(params) };

      case 'assess_data_quality':
        return { assessmentId: await this.dataGovernanceService.assessDataQuality(params.assetId, params.assessmentType || 'full') };

      case 'create_data_policy':
        return { id: await this.dataGovernanceService.createDataPolicy(params) };

      case 'evaluate_compliance':
        return await this.dataGovernanceService.evaluateCompliance(params.assetId, params.frameworks);

      case 'monitor_data_access':
        return await this.dataGovernanceService.monitorDataAccess(params.assetId, params.period || 'daily');

      case 'trace_data_lineage':
        return await this.dataGovernanceService.traceDataLineage(params.assetId, params.direction || 'both', params.depth || 3);

      case 'get_governance_metrics':
        return await this.dataGovernanceService.getGovernanceMetrics();

      default:
        throw new MCPError('METHOD_NOT_FOUND', `Unknown method: ${method}`);
    }
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new DataGovernanceMCPServer();
  server.start().catch(console.error);
}