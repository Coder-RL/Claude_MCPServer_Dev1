import { EventEmitter } from 'events';
import { writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import * as crypto from 'crypto';

export interface AuditEvent {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'critical';
  category: string;
  action: string;
  actor: ActorInfo;
  resource?: ResourceInfo;
  outcome: 'success' | 'failure' | 'partial';
  duration?: number;
  request?: RequestInfo;
  response?: ResponseInfo;
  metadata?: Record<string, any>;
  compliance?: ComplianceInfo;
  signature?: string;
}

export interface ActorInfo {
  id: string;
  type: 'user' | 'service' | 'system' | 'api';
  name: string;
  email?: string;
  roles?: string[];
  permissions?: string[];
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ResourceInfo {
  id: string;
  type: string;
  name: string;
  path?: string;
  classification?: 'public' | 'internal' | 'confidential' | 'restricted';
  owner?: string;
  attributes?: Record<string, any>;
}

export interface RequestInfo {
  id: string;
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
  parameters?: Record<string, any>;
  size?: number;
}

export interface ResponseInfo {
  statusCode?: number;
  headers?: Record<string, string>;
  body?: any;
  size?: number;
  error?: string;
}

export interface ComplianceInfo {
  frameworks: string[]; // GDPR, SOX, HIPAA, PCI-DSS, etc.
  controls: string[];
  requirements: string[];
  dataClassification?: string;
  retentionPeriod?: number;
  jurisdiction?: string;
}

export interface AuditConfig {
  enabled: boolean;
  level: 'debug' | 'info' | 'warn' | 'error';
  format: 'json' | 'text' | 'structured';
  storage: {
    type: 'file' | 'database' | 'remote' | 'elasticsearch';
    path?: string;
    connection?: any;
    retention: number; // days
    compression: boolean;
    encryption: boolean;
    rotation: {
      enabled: boolean;
      size: number; // bytes
      interval: number; // hours
    };
  };
  filtering: {
    categories: string[];
    actors: string[];
    resources: string[];
    excludeCategories?: string[];
  };
  realtime: {
    enabled: boolean;
    webhook?: string;
    channels: string[];
  };
  compliance: {
    frameworks: string[];
    autoClassify: boolean;
    dataMapping: Record<string, string>;
  };
}

export interface AuditQuery {
  startTime?: Date;
  endTime?: Date;
  levels?: string[];
  categories?: string[];
  actors?: string[];
  resources?: string[];
  outcomes?: string[];
  compliance?: string[];
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface AuditReport {
  id: string;
  title: string;
  description: string;
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalEvents: number;
    successRate: number;
    failureRate: number;
    categoryCounts: Record<string, number>;
    actorCounts: Record<string, number>;
    complianceStatus: Record<string, any>;
  };
  events: AuditEvent[];
  violations: ComplianceViolation[];
  recommendations: string[];
  generatedAt: Date;
  generatedBy: string;
}

export interface ComplianceViolation {
  id: string;
  framework: string;
  control: string;
  requirement: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  events: string[];
  detectedAt: Date;
  status: 'open' | 'investigating' | 'resolved' | 'false-positive';
  assignedTo?: string;
  remediation?: string;
}

export class AuditLogger extends EventEmitter {
  private config: AuditConfig;
  private currentLogFile: string | null = null;
  private rotationTimer: NodeJS.Timeout | null = null;
  private eventBuffer: AuditEvent[] = [];
  private bufferTimer: NodeJS.Timeout | null = null;
  private encryptionKey: Buffer | null = null;
  private complianceRules = new Map<string, any>();
  private violations: ComplianceViolation[] = [];

  constructor(config: AuditConfig) {
    super();
    this.config = config;
    this.initialize();
  }

  private initialize(): void {
    if (!this.config.enabled) {
      return;
    }

    // Setup storage
    this.setupStorage();
    
    // Setup encryption if enabled
    if (this.config.storage.encryption) {
      this.setupEncryption();
    }
    
    // Setup rotation if enabled
    if (this.config.storage.rotation.enabled) {
      this.setupRotation();
    }
    
    // Setup buffering for performance
    this.setupBuffering();
    
    // Load compliance rules
    this.loadComplianceRules();
    
    this.emit('initialized');
  }

  private setupStorage(): void {
    if (this.config.storage.type === 'file') {
      const logDir = dirname(this.config.storage.path || './logs/audit');
      if (!existsSync(logDir)) {
        mkdirSync(logDir, { recursive: true });
      }
      
      this.currentLogFile = this.config.storage.path || join(logDir, 'audit.log');
    }
  }

  private setupEncryption(): void {
    const keyPath = join(dirname(this.config.storage.path || './logs'), '.audit-key');
    
    if (existsSync(keyPath)) {
      this.encryptionKey = Buffer.from(require('fs').readFileSync(keyPath, 'utf8'), 'hex');
    } else {
      this.encryptionKey = crypto.randomBytes(32);
      writeFileSync(keyPath, this.encryptionKey.toString('hex'), { mode: 0o600 });
    }
  }

  private setupRotation(): void {
    const interval = this.config.storage.rotation.interval * 60 * 60 * 1000; // Convert hours to ms
    
    this.rotationTimer = setInterval(() => {
      this.rotateLogFile();
    }, interval);
  }

  private setupBuffering(): void {
    // Flush buffer every 5 seconds or when it reaches 100 events
    this.bufferTimer = setInterval(() => {
      this.flushBuffer();
    }, 5000);
  }

  private loadComplianceRules(): void {
    // Load compliance rules for different frameworks
    this.complianceRules.set('GDPR', {
      dataProcessing: {
        lawfulBasis: ['consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests'],
        personalDataAccess: { logRequired: true, justificationRequired: true },
        dataRetention: { maxPeriod: 2555, unit: 'days' } // 7 years
      },
      rightsRequests: {
        responseTimeLimit: 30, // days
        logRequired: true
      }
    });

    this.complianceRules.set('SOX', {
      financialData: {
        accessControl: { segregationOfDuties: true, approvalRequired: true },
        auditTrail: { comprehensive: true, immutable: true },
        retentionPeriod: 2555 // 7 years
      }
    });

    this.complianceRules.set('HIPAA', {
      phi: {
        accessControl: { minimumNecessary: true, authorizationRequired: true },
        auditTrail: { comprehensive: true, encrypted: true },
        retentionPeriod: 2190 // 6 years
      }
    });
  }

  async log(event: Omit<AuditEvent, 'id' | 'timestamp' | 'signature'>): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const auditEvent: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date(),
      signature: '',
      ...event
    };

    // Apply compliance classification
    if (this.config.compliance.autoClassify) {
      auditEvent.compliance = this.classifyEvent(auditEvent);
    }

    // Generate signature for integrity
    auditEvent.signature = await this.signEvent(auditEvent);

    // Check for compliance violations
    await this.checkComplianceViolations(auditEvent);

    // Filter event based on configuration
    if (!this.shouldLogEvent(auditEvent)) {
      return;
    }

    // Add to buffer
    this.eventBuffer.push(auditEvent);

    // Flush buffer if it's full
    if (this.eventBuffer.length >= 100) {
      await this.flushBuffer();
    }

    // Emit real-time events
    if (this.config.realtime.enabled) {
      this.emitRealtimeEvent(auditEvent);
    }

    this.emit('event-logged', auditEvent);
  }

  private classifyEvent(event: AuditEvent): ComplianceInfo {
    const compliance: ComplianceInfo = {
      frameworks: [],
      controls: [],
      requirements: []
    };

    // GDPR classification
    if (this.isPersonalDataEvent(event)) {
      compliance.frameworks.push('GDPR');
      compliance.controls.push('Article 5', 'Article 6');
      compliance.requirements.push('Lawful basis for processing', 'Data minimization');
      compliance.dataClassification = 'personal';
      compliance.retentionPeriod = 2555; // 7 years
    }

    // SOX classification
    if (this.isFinancialDataEvent(event)) {
      compliance.frameworks.push('SOX');
      compliance.controls.push('Section 302', 'Section 404');
      compliance.requirements.push('Financial reporting controls', 'Internal controls');
      compliance.dataClassification = 'financial';
      compliance.retentionPeriod = 2555; // 7 years
    }

    // HIPAA classification
    if (this.isHealthDataEvent(event)) {
      compliance.frameworks.push('HIPAA');
      compliance.controls.push('164.312', '164.308');
      compliance.requirements.push('Access control', 'Audit controls');
      compliance.dataClassification = 'phi';
      compliance.retentionPeriod = 2190; // 6 years
    }

    return compliance;
  }

  private isPersonalDataEvent(event: AuditEvent): boolean {
    const personalDataCategories = ['user_data', 'profile', 'authentication', 'personal_information'];
    return personalDataCategories.includes(event.category) ||
           event.resource?.classification === 'personal' ||
           event.metadata?.containsPersonalData === true;
  }

  private isFinancialDataEvent(event: AuditEvent): boolean {
    const financialCategories = ['financial_data', 'payment', 'billing', 'transaction'];
    return financialCategories.includes(event.category) ||
           event.resource?.classification === 'financial' ||
           event.metadata?.containsFinancialData === true;
  }

  private isHealthDataEvent(event: AuditEvent): boolean {
    const healthCategories = ['health_data', 'medical_record', 'phi'];
    return healthCategories.includes(event.category) ||
           event.resource?.classification === 'phi' ||
           event.metadata?.containsHealthData === true;
  }

  private async signEvent(event: AuditEvent): Promise<string> {
    if (!this.encryptionKey) {
      return '';
    }

    const eventData = JSON.stringify({
      id: event.id,
      timestamp: event.timestamp,
      category: event.category,
      action: event.action,
      actor: event.actor,
      resource: event.resource,
      outcome: event.outcome
    });

    const hmac = crypto.createHmac('sha256', this.encryptionKey);
    hmac.update(eventData);
    return hmac.digest('hex');
  }

  private async checkComplianceViolations(event: AuditEvent): Promise<void> {
    if (!event.compliance) {
      return;
    }

    for (const framework of event.compliance.frameworks) {
      const rules = this.complianceRules.get(framework);
      if (!rules) continue;

      // Check for violations based on framework rules
      const violations = await this.evaluateComplianceRules(event, framework, rules);
      
      for (const violation of violations) {
        this.violations.push(violation);
        this.emit('compliance-violation', violation);
      }
    }
  }

  private async evaluateComplianceRules(event: AuditEvent, framework: string, rules: any): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];

    // Example: Check for unauthorized access to sensitive data
    if (framework === 'GDPR' && event.category === 'data_access' && event.outcome === 'failure') {
      if (event.resource?.classification === 'personal') {
        violations.push({
          id: crypto.randomUUID(),
          framework,
          control: 'Article 32',
          requirement: 'Security of processing',
          severity: 'high',
          description: 'Unauthorized access attempt to personal data',
          events: [event.id],
          detectedAt: new Date(),
          status: 'open'
        });
      }
    }

    // Example: Check for missing approval in financial transactions
    if (framework === 'SOX' && event.category === 'financial_transaction' && !event.metadata?.approvedBy) {
      violations.push({
        id: crypto.randomUUID(),
        framework,
        control: 'Section 404',
        requirement: 'Internal controls over financial reporting',
        severity: 'critical',
        description: 'Financial transaction without proper approval',
        events: [event.id],
        detectedAt: new Date(),
        status: 'open'
      });
    }

    return violations;
  }

  private shouldLogEvent(event: AuditEvent): boolean {
    // Check level filtering
    const levels = ['debug', 'info', 'warn', 'error', 'critical'];
    const configLevelIndex = levels.indexOf(this.config.level);
    const eventLevelIndex = levels.indexOf(event.level);
    
    if (eventLevelIndex < configLevelIndex) {
      return false;
    }

    // Check category filtering
    if (this.config.filtering.categories.length > 0 && 
        !this.config.filtering.categories.includes(event.category)) {
      return false;
    }

    // Check exclude categories
    if (this.config.filtering.excludeCategories && 
        this.config.filtering.excludeCategories.includes(event.category)) {
      return false;
    }

    // Check actor filtering
    if (this.config.filtering.actors.length > 0 && 
        !this.config.filtering.actors.includes(event.actor.id)) {
      return false;
    }

    return true;
  }

  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.writeEvents(events);
    } catch (error) {
      // Return events to buffer if write fails
      this.eventBuffer.unshift(...events);
      this.emit('write-error', error);
    }
  }

  private async writeEvents(events: AuditEvent[]): Promise<void> {
    switch (this.config.storage.type) {
      case 'file':
        await this.writeToFile(events);
        break;
      case 'database':
        await this.writeToDatabase(events);
        break;
      case 'remote':
        await this.writeToRemote(events);
        break;
      case 'elasticsearch':
        await this.writeToElasticsearch(events);
        break;
    }
  }

  private async writeToFile(events: AuditEvent[]): Promise<void> {
    if (!this.currentLogFile) {
      throw new Error('Log file not configured');
    }

    let content = '';
    
    for (const event of events) {
      let line: string;
      
      if (this.config.format === 'json') {
        line = JSON.stringify(event) + '\n';
      } else {
        line = this.formatEvent(event) + '\n';
      }
      
      if (this.config.storage.encryption && this.encryptionKey) {
        line = this.encrypt(line);
      }
      
      content += line;
    }

    if (this.config.storage.compression) {
      // Implement compression
    }

    appendFileSync(this.currentLogFile, content);

    // Check if rotation is needed
    if (this.config.storage.rotation.enabled) {
      await this.checkRotation();
    }
  }

  private async writeToDatabase(events: AuditEvent[]): Promise<void> {
    // Implement database storage
    throw new Error('Database storage not implemented');
  }

  private async writeToRemote(events: AuditEvent[]): Promise<void> {
    // Implement remote storage
    throw new Error('Remote storage not implemented');
  }

  private async writeToElasticsearch(events: AuditEvent[]): Promise<void> {
    // Implement Elasticsearch storage
    throw new Error('Elasticsearch storage not implemented');
  }

  private formatEvent(event: AuditEvent): string {
    const timestamp = event.timestamp.toISOString();
    const level = event.level.toUpperCase().padEnd(8);
    const category = event.category.padEnd(15);
    const action = event.action.padEnd(20);
    const actor = `${event.actor.type}:${event.actor.id}`.padEnd(20);
    const outcome = event.outcome.padEnd(10);
    
    let message = `${timestamp} ${level} ${category} ${action} ${actor} ${outcome}`;
    
    if (event.resource) {
      message += ` resource=${event.resource.type}:${event.resource.id}`;
    }
    
    if (event.duration) {
      message += ` duration=${event.duration}ms`;
    }
    
    return message;
  }

  private encrypt(data: string): string {
    if (!this.encryptionKey) {
      return data;
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}\n`;
  }

  private async checkRotation(): Promise<void> {
    if (!this.currentLogFile) {
      return;
    }

    const stats = statSync(this.currentLogFile);
    
    if (stats.size > this.config.storage.rotation.size) {
      await this.rotateLogFile();
    }
  }

  private async rotateLogFile(): Promise<void> {
    if (!this.currentLogFile) {
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rotatedFile = this.currentLogFile.replace('.log', `_${timestamp}.log`);
    
    // Rename current file
    require('fs').renameSync(this.currentLogFile, rotatedFile);
    
    // Compress if enabled
    if (this.config.storage.compression) {
      // Implement compression
    }
    
    // Clean up old files based on retention policy
    await this.cleanupOldFiles();
    
    this.emit('log-rotated', { from: this.currentLogFile, to: rotatedFile });
  }

  private async cleanupOldFiles(): Promise<void> {
    if (!this.currentLogFile) {
      return;
    }

    const logDir = dirname(this.currentLogFile);
    const files = readdirSync(logDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.storage.retention);

    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = join(logDir, file);
        const stats = statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          unlinkSync(filePath);
          this.emit('log-deleted', { file: filePath });
        }
      }
    }
  }

  private emitRealtimeEvent(event: AuditEvent): void {
    // Emit to configured channels
    for (const channel of this.config.realtime.channels) {
      this.emit(`realtime:${channel}`, event);
    }

    // Send to webhook if configured
    if (this.config.realtime.webhook) {
      this.sendWebhook(event);
    }
  }

  private async sendWebhook(event: AuditEvent): Promise<void> {
    if (!this.config.realtime.webhook) {
      return;
    }

    try {
      const response = await fetch(this.config.realtime.webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.statusText}`);
      }
    } catch (error) {
      this.emit('webhook-error', { error: (error as Error).message, event: event.id });
    }
  }

  async query(query: AuditQuery): Promise<AuditEvent[]> {
    // For file storage, this would parse log files
    // For database storage, this would query the database
    // This is a simplified implementation
    
    if (this.config.storage.type === 'file') {
      return this.queryFromFile(query);
    }
    
    throw new Error('Query not implemented for current storage type');
  }

  private async queryFromFile(query: AuditQuery): Promise<AuditEvent[]> {
    // Simplified file query implementation
    // In production, this would be more sophisticated
    return [];
  }

  async generateReport(
    title: string,
    description: string,
    period: { start: Date; end: Date },
    generatedBy: string
  ): Promise<AuditReport> {
    const events = await this.query({
      startTime: period.start,
      endTime: period.end
    });

    const summary = this.generateSummary(events);
    const violations = this.violations.filter(v => 
      v.detectedAt >= period.start && v.detectedAt <= period.end
    );
    
    const recommendations = this.generateRecommendations(events, violations);

    const report: AuditReport = {
      id: crypto.randomUUID(),
      title,
      description,
      period,
      summary,
      events,
      violations,
      recommendations,
      generatedAt: new Date(),
      generatedBy
    };

    this.emit('report-generated', report);
    return report;
  }

  private generateSummary(events: AuditEvent[]): any {
    const summary = {
      totalEvents: events.length,
      successRate: 0,
      failureRate: 0,
      categoryCounts: {} as Record<string, number>,
      actorCounts: {} as Record<string, number>,
      complianceStatus: {} as Record<string, any>
    };

    let successCount = 0;
    let failureCount = 0;

    for (const event of events) {
      // Count outcomes
      if (event.outcome === 'success') successCount++;
      else if (event.outcome === 'failure') failureCount++;

      // Count categories
      summary.categoryCounts[event.category] = (summary.categoryCounts[event.category] || 0) + 1;

      // Count actors
      summary.actorCounts[event.actor.id] = (summary.actorCounts[event.actor.id] || 0) + 1;

      // Count compliance frameworks
      if (event.compliance) {
        for (const framework of event.compliance.frameworks) {
          summary.complianceStatus[framework] = (summary.complianceStatus[framework] || 0) + 1;
        }
      }
    }

    summary.successRate = events.length > 0 ? successCount / events.length : 0;
    summary.failureRate = events.length > 0 ? failureCount / events.length : 0;

    return summary;
  }

  private generateRecommendations(events: AuditEvent[], violations: ComplianceViolation[]): string[] {
    const recommendations: string[] = [];

    // Analyze patterns and generate recommendations
    if (violations.length > 0) {
      recommendations.push('Address identified compliance violations immediately');
    }

    const failureRate = events.filter(e => e.outcome === 'failure').length / events.length;
    if (failureRate > 0.1) {
      recommendations.push('High failure rate detected - review authentication and authorization controls');
    }

    const uniqueActors = new Set(events.map(e => e.actor.id)).size;
    if (uniqueActors < events.length * 0.1) {
      recommendations.push('Consider implementing role-based access controls to distribute access');
    }

    return recommendations;
  }

  getViolations(status?: string): ComplianceViolation[] {
    if (status) {
      return this.violations.filter(v => v.status === status);
    }
    return [...this.violations];
  }

  updateViolationStatus(violationId: string, status: ComplianceViolation['status'], assignedTo?: string, remediation?: string): void {
    const violation = this.violations.find(v => v.id === violationId);
    if (violation) {
      violation.status = status;
      if (assignedTo) violation.assignedTo = assignedTo;
      if (remediation) violation.remediation = remediation;
      
      this.emit('violation-updated', violation);
    }
  }

  getStats(): any {
    return {
      config: {
        enabled: this.config.enabled,
        level: this.config.level,
        storageType: this.config.storage.type,
        encryptionEnabled: this.config.storage.encryption,
        rotationEnabled: this.config.storage.rotation.enabled
      },
      buffer: {
        size: this.eventBuffer.length,
        isActive: this.bufferTimer !== null
      },
      violations: {
        total: this.violations.length,
        open: this.violations.filter(v => v.status === 'open').length,
        resolved: this.violations.filter(v => v.status === 'resolved').length
      },
      compliance: {
        frameworks: Array.from(this.complianceRules.keys()),
        autoClassificationEnabled: this.config.compliance.autoClassify
      }
    };
  }

  async shutdown(): Promise<void> {
    // Flush any remaining events
    await this.flushBuffer();

    // Clear timers
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
    }
    
    if (this.bufferTimer) {
      clearInterval(this.bufferTimer);
    }

    this.removeAllListeners();
    this.emit('shutdown');
  }
}