import { EventEmitter } from 'events';

export interface ComplianceFramework {
  id: string;
  name: string;
  version: string;
  description: string;
  jurisdiction: string[];
  controls: ComplianceControl[];
  requirements: ComplianceRequirement[];
  assessments: ComplianceAssessment[];
  enabled: boolean;
  lastUpdated: Date;
}

export interface ComplianceControl {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'preventive' | 'detective' | 'corrective' | 'compensating';
  severity: 'low' | 'medium' | 'high' | 'critical';
  implementation: ControlImplementation;
  testing: ControlTesting;
  status: 'not-implemented' | 'implemented' | 'partially-implemented' | 'not-applicable';
  owner: string;
  lastTested: Date;
  nextTest: Date;
  evidence: Evidence[];
}

export interface ComplianceRequirement {
  id: string;
  name: string;
  description: string;
  framework: string;
  section: string;
  mandatory: boolean;
  applicability: string[];
  implementation: RequirementImplementation;
  status: 'compliant' | 'non-compliant' | 'partial' | 'not-assessed';
  riskRating: 'low' | 'medium' | 'high' | 'critical';
  remediation?: RemediationPlan;
}

export interface ControlImplementation {
  type: 'automated' | 'manual' | 'hybrid';
  frequency: 'real-time' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annually';
  methods: string[];
  tools: string[];
  procedures: string[];
  documentation: string[];
}

export interface ControlTesting {
  frequency: 'monthly' | 'quarterly' | 'semi-annually' | 'annually';
  methods: string[];
  criteria: string[];
  lastResult: TestResult;
  schedule: TestSchedule[];
}

export interface TestResult {
  date: Date;
  tester: string;
  result: 'pass' | 'fail' | 'partial';
  findings: string[];
  recommendations: string[];
  evidence: Evidence[];
}

export interface TestSchedule {
  date: Date;
  tester: string;
  scope: string[];
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
}

export interface RequirementImplementation {
  policies: string[];
  procedures: string[];
  controls: string[];
  systems: string[];
  documentation: string[];
}

export interface RemediationPlan {
  id: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo: string;
  dueDate: Date;
  status: 'planned' | 'in-progress' | 'completed' | 'cancelled';
  actions: RemediationAction[];
  progress: number;
}

export interface RemediationAction {
  id: string;
  description: string;
  type: 'policy' | 'procedure' | 'technical' | 'training' | 'documentation';
  assignedTo: string;
  dueDate: Date;
  status: 'pending' | 'in-progress' | 'completed';
  evidence?: Evidence[];
}

export interface Evidence {
  id: string;
  type: 'document' | 'screenshot' | 'log' | 'report' | 'certification';
  name: string;
  description: string;
  path: string;
  hash: string;
  collectedBy: string;
  collectedAt: Date;
  retentionPeriod: number; // days
  metadata: Record<string, any>;
}

export interface ComplianceAssessment {
  id: string;
  name: string;
  framework: string;
  scope: string[];
  assessor: string;
  startDate: Date;
  endDate: Date;
  status: 'planned' | 'in-progress' | 'completed' | 'cancelled';
  findings: AssessmentFinding[];
  recommendations: string[];
  overallRating: 'compliant' | 'non-compliant' | 'partial';
  nextAssessment: Date;
}

export interface AssessmentFinding {
  id: string;
  control: string;
  requirement: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  likelihood: string;
  riskRating: string;
  recommendation: string;
  status: 'open' | 'in-progress' | 'resolved' | 'accepted';
  assignedTo: string;
  dueDate: Date;
}

export interface ComplianceMetrics {
  framework: string;
  period: {
    start: Date;
    end: Date;
  };
  overallScore: number;
  controlEffectiveness: number;
  complianceRate: number;
  riskExposure: number;
  trends: {
    controlsCounts: Record<string, number>;
    findingsCounts: Record<string, number>;
    riskTrends: Array<{ date: Date; risk: number }>;
  };
}

export class ComplianceFrameworkManager extends EventEmitter {
  private frameworks = new Map<string, ComplianceFramework>();
  private activeFrameworks = new Set<string>();
  private assessmentHistory: ComplianceAssessment[] = [];
  private remediationPlans = new Map<string, RemediationPlan>();
  private evidenceStore = new Map<string, Evidence>();
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.loadStandardFrameworks();
    this.startContinuousMonitoring();
  }

  private loadStandardFrameworks(): void {
    // Load GDPR framework
    this.addFramework({
      id: 'gdpr',
      name: 'General Data Protection Regulation',
      version: '2018',
      description: 'EU data protection regulation',
      jurisdiction: ['EU', 'EEA'],
      controls: this.createGDPRControls(),
      requirements: this.createGDPRRequirements(),
      assessments: [],
      enabled: true,
      lastUpdated: new Date()
    });

    // Load SOX framework
    this.addFramework({
      id: 'sox',
      name: 'Sarbanes-Oxley Act',
      version: '2002',
      description: 'US financial reporting regulation',
      jurisdiction: ['US'],
      controls: this.createSOXControls(),
      requirements: this.createSOXRequirements(),
      assessments: [],
      enabled: true,
      lastUpdated: new Date()
    });

    // Load ISO 27001 framework
    this.addFramework({
      id: 'iso27001',
      name: 'ISO/IEC 27001',
      version: '2013',
      description: 'Information security management standard',
      jurisdiction: ['Global'],
      controls: this.createISO27001Controls(),
      requirements: this.createISO27001Requirements(),
      assessments: [],
      enabled: true,
      lastUpdated: new Date()
    });

    // Load PCI DSS framework
    this.addFramework({
      id: 'pcidss',
      name: 'Payment Card Industry Data Security Standard',
      version: '4.0',
      description: 'Payment card data protection standard',
      jurisdiction: ['Global'],
      controls: this.createPCIDSSControls(),
      requirements: this.createPCIDSSRequirements(),
      assessments: [],
      enabled: true,
      lastUpdated: new Date()
    });
  }

  private createGDPRControls(): ComplianceControl[] {
    return [
      {
        id: 'gdpr-article-5',
        name: 'Principles of Processing Personal Data',
        description: 'Lawfulness, fairness, transparency, purpose limitation, data minimization, accuracy, storage limitation, integrity and confidentiality, accountability',
        category: 'data-processing',
        type: 'preventive',
        severity: 'critical',
        implementation: {
          type: 'hybrid',
          frequency: 'real-time',
          methods: ['policy', 'technical', 'procedural'],
          tools: ['data-loss-prevention', 'access-control', 'audit-logging'],
          procedures: ['data-inventory', 'privacy-impact-assessment'],
          documentation: ['privacy-policy', 'data-processing-records']
        },
        testing: {
          frequency: 'quarterly',
          methods: ['audit', 'penetration-testing', 'privacy-assessment'],
          criteria: ['technical-compliance', 'procedural-compliance'],
          lastResult: {
            date: new Date(),
            tester: 'compliance-team',
            result: 'pass',
            findings: [],
            recommendations: [],
            evidence: []
          },
          schedule: []
        },
        status: 'implemented',
        owner: 'privacy-officer',
        lastTested: new Date(),
        nextTest: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        evidence: []
      },
      {
        id: 'gdpr-article-32',
        name: 'Security of Processing',
        description: 'Appropriate technical and organizational measures to ensure security of processing',
        category: 'security',
        type: 'preventive',
        severity: 'critical',
        implementation: {
          type: 'automated',
          frequency: 'real-time',
          methods: ['encryption', 'access-control', 'monitoring'],
          tools: ['encryption-tools', 'identity-management', 'siem'],
          procedures: ['security-assessment', 'incident-response'],
          documentation: ['security-policy', 'incident-procedures']
        },
        testing: {
          frequency: 'quarterly',
          methods: ['vulnerability-scanning', 'penetration-testing'],
          criteria: ['encryption-validation', 'access-control-validation'],
          lastResult: {
            date: new Date(),
            tester: 'security-team',
            result: 'pass',
            findings: [],
            recommendations: [],
            evidence: []
          },
          schedule: []
        },
        status: 'implemented',
        owner: 'security-officer',
        lastTested: new Date(),
        nextTest: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        evidence: []
      }
    ];
  }

  private createGDPRRequirements(): ComplianceRequirement[] {
    return [
      {
        id: 'gdpr-req-1',
        name: 'Lawful Basis for Processing',
        description: 'Establish and document lawful basis for all personal data processing activities',
        framework: 'gdpr',
        section: 'Article 6',
        mandatory: true,
        applicability: ['all-processing'],
        implementation: {
          policies: ['privacy-policy', 'lawful-basis-policy'],
          procedures: ['data-processing-assessment'],
          controls: ['gdpr-article-5'],
          systems: ['consent-management', 'data-inventory'],
          documentation: ['lawful-basis-register']
        },
        status: 'compliant',
        riskRating: 'high'
      }
    ];
  }

  private createSOXControls(): ComplianceControl[] {
    return [
      {
        id: 'sox-section-302',
        name: 'Corporate Responsibility for Financial Reports',
        description: 'CEO and CFO certification of financial reports',
        category: 'financial-reporting',
        type: 'detective',
        severity: 'critical',
        implementation: {
          type: 'manual',
          frequency: 'quarterly',
          methods: ['certification', 'review'],
          tools: ['financial-reporting-system'],
          procedures: ['executive-certification'],
          documentation: ['certification-forms']
        },
        testing: {
          frequency: 'annually',
          methods: ['audit', 'documentation-review'],
          criteria: ['certification-completeness', 'accuracy'],
          lastResult: {
            date: new Date(),
            tester: 'external-auditor',
            result: 'pass',
            findings: [],
            recommendations: [],
            evidence: []
          },
          schedule: []
        },
        status: 'implemented',
        owner: 'cfo',
        lastTested: new Date(),
        nextTest: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        evidence: []
      }
    ];
  }

  private createSOXRequirements(): ComplianceRequirement[] {
    return [
      {
        id: 'sox-req-1',
        name: 'Internal Controls Over Financial Reporting (ICFR)',
        description: 'Establish and maintain adequate internal controls over financial reporting',
        framework: 'sox',
        section: 'Section 404',
        mandatory: true,
        applicability: ['public-companies'],
        implementation: {
          policies: ['internal-controls-policy'],
          procedures: ['icfr-assessment'],
          controls: ['sox-section-302'],
          systems: ['financial-systems'],
          documentation: ['icfr-documentation']
        },
        status: 'compliant',
        riskRating: 'critical'
      }
    ];
  }

  private createISO27001Controls(): ComplianceControl[] {
    return [
      {
        id: 'iso27001-a5-1',
        name: 'Information Security Policies',
        description: 'A set of policies for information security shall be defined, approved by management, published and communicated to employees and relevant external parties',
        category: 'governance',
        type: 'preventive',
        severity: 'high',
        implementation: {
          type: 'manual',
          frequency: 'annually',
          methods: ['policy-development', 'approval-process'],
          tools: ['document-management'],
          procedures: ['policy-review', 'policy-communication'],
          documentation: ['information-security-policy']
        },
        testing: {
          frequency: 'annually',
          methods: ['audit', 'review'],
          criteria: ['policy-existence', 'policy-communication'],
          lastResult: {
            date: new Date(),
            tester: 'internal-audit',
            result: 'pass',
            findings: [],
            recommendations: [],
            evidence: []
          },
          schedule: []
        },
        status: 'implemented',
        owner: 'ciso',
        lastTested: new Date(),
        nextTest: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        evidence: []
      }
    ];
  }

  private createISO27001Requirements(): ComplianceRequirement[] {
    return [
      {
        id: 'iso27001-req-1',
        name: 'Information Security Management System (ISMS)',
        description: 'Establish, implement, maintain and continually improve an information security management system',
        framework: 'iso27001',
        section: 'Clause 4',
        mandatory: true,
        applicability: ['all-organizations'],
        implementation: {
          policies: ['isms-policy'],
          procedures: ['isms-procedures'],
          controls: ['iso27001-a5-1'],
          systems: ['isms-tools'],
          documentation: ['isms-documentation']
        },
        status: 'compliant',
        riskRating: 'high'
      }
    ];
  }

  private createPCIDSSControls(): ComplianceControl[] {
    return [
      {
        id: 'pcidss-req-1',
        name: 'Install and Maintain Network Security Controls',
        description: 'Network security controls (NSCs) are in place to protect the cardholder data environment',
        category: 'network-security',
        type: 'preventive',
        severity: 'critical',
        implementation: {
          type: 'automated',
          frequency: 'real-time',
          methods: ['firewall', 'network-segmentation'],
          tools: ['firewall-management', 'network-monitoring'],
          procedures: ['firewall-configuration', 'network-assessment'],
          documentation: ['network-diagram', 'firewall-rules']
        },
        testing: {
          frequency: 'quarterly',
          methods: ['vulnerability-scanning', 'penetration-testing'],
          criteria: ['firewall-configuration', 'network-segmentation'],
          lastResult: {
            date: new Date(),
            tester: 'qsa',
            result: 'pass',
            findings: [],
            recommendations: [],
            evidence: []
          },
          schedule: []
        },
        status: 'implemented',
        owner: 'network-administrator',
        lastTested: new Date(),
        nextTest: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        evidence: []
      }
    ];
  }

  private createPCIDSSRequirements(): ComplianceRequirement[] {
    return [
      {
        id: 'pcidss-req-1-network',
        name: 'Build and Maintain a Secure Network and Systems',
        description: 'Install and maintain a firewall configuration to protect cardholder data',
        framework: 'pcidss',
        section: 'Requirement 1',
        mandatory: true,
        applicability: ['card-data-environment'],
        implementation: {
          policies: ['network-security-policy'],
          procedures: ['firewall-management'],
          controls: ['pcidss-req-1'],
          systems: ['firewall-systems'],
          documentation: ['network-documentation']
        },
        status: 'compliant',
        riskRating: 'critical'
      }
    ];
  }

  addFramework(framework: ComplianceFramework): void {
    this.frameworks.set(framework.id, framework);
    this.emit('framework-added', { framework: framework.id });
  }

  removeFramework(frameworkId: string): void {
    const framework = this.frameworks.get(frameworkId);
    if (framework) {
      this.frameworks.delete(frameworkId);
      this.activeFrameworks.delete(frameworkId);
      this.emit('framework-removed', { framework: frameworkId });
    }
  }

  activateFramework(frameworkId: string): void {
    const framework = this.frameworks.get(frameworkId);
    if (framework) {
      this.activeFrameworks.add(frameworkId);
      framework.enabled = true;
      this.emit('framework-activated', { framework: frameworkId });
    }
  }

  deactivateFramework(frameworkId: string): void {
    const framework = this.frameworks.get(frameworkId);
    if (framework) {
      this.activeFrameworks.delete(frameworkId);
      framework.enabled = false;
      this.emit('framework-deactivated', { framework: frameworkId });
    }
  }

  async assessCompliance(frameworkId: string, assessor: string, scope: string[]): Promise<ComplianceAssessment> {
    const framework = this.frameworks.get(frameworkId);
    if (!framework) {
      throw new Error(`Framework not found: ${frameworkId}`);
    }

    const assessment: ComplianceAssessment = {
      id: `assessment-${Date.now()}`,
      name: `${framework.name} Assessment`,
      framework: frameworkId,
      scope,
      assessor,
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      status: 'in-progress',
      findings: [],
      recommendations: [],
      overallRating: 'partial',
      nextAssessment: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    };

    // Perform assessment of controls and requirements
    for (const control of framework.controls) {
      if (scope.includes(control.category)) {
        const finding = await this.assessControl(control);
        if (finding) {
          assessment.findings.push(finding);
        }
      }
    }

    // Calculate overall rating
    assessment.overallRating = this.calculateOverallRating(assessment.findings);
    assessment.status = 'completed';
    assessment.endDate = new Date();

    // Generate recommendations
    assessment.recommendations = this.generateAssessmentRecommendations(assessment.findings);

    this.assessmentHistory.push(assessment);
    framework.assessments.push(assessment);

    this.emit('assessment-completed', { assessment: assessment.id, framework: frameworkId });
    return assessment;
  }

  private async assessControl(control: ComplianceControl): Promise<AssessmentFinding | null> {
    // Simulate control assessment
    // In practice, this would involve testing, evidence review, etc.
    
    if (control.status === 'not-implemented') {
      return {
        id: `finding-${Date.now()}`,
        control: control.id,
        requirement: control.name,
        severity: control.severity,
        description: `Control ${control.name} is not implemented`,
        impact: 'High impact on compliance posture',
        likelihood: 'High',
        riskRating: 'High',
        recommendation: `Implement ${control.name} according to framework requirements`,
        status: 'open',
        assignedTo: control.owner,
        dueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      };
    }

    return null;
  }

  private calculateOverallRating(findings: AssessmentFinding[]): 'compliant' | 'non-compliant' | 'partial' {
    const criticalFindings = findings.filter(f => f.severity === 'critical');
    const highFindings = findings.filter(f => f.severity === 'high');
    
    if (criticalFindings.length > 0) {
      return 'non-compliant';
    } else if (highFindings.length > 3) {
      return 'partial';
    } else if (findings.length === 0) {
      return 'compliant';
    } else {
      return 'partial';
    }
  }

  private generateAssessmentRecommendations(findings: AssessmentFinding[]): string[] {
    const recommendations: string[] = [];
    
    const criticalFindings = findings.filter(f => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      recommendations.push('Address critical findings immediately to maintain compliance');
    }
    
    const highFindings = findings.filter(f => f.severity === 'high');
    if (highFindings.length > 0) {
      recommendations.push('Prioritize remediation of high-severity findings');
    }
    
    // Add specific recommendations based on finding patterns
    const controlCategories = new Set(findings.map(f => f.control));
    if (controlCategories.size > 5) {
      recommendations.push('Consider implementing a comprehensive compliance management program');
    }
    
    return recommendations;
  }

  createRemediationPlan(findingId: string, assignedTo: string, dueDate: Date): RemediationPlan {
    const plan: RemediationPlan = {
      id: `plan-${Date.now()}`,
      description: `Remediation plan for finding ${findingId}`,
      priority: 'high',
      assignedTo,
      dueDate,
      status: 'planned',
      actions: [],
      progress: 0
    };

    this.remediationPlans.set(plan.id, plan);
    this.emit('remediation-plan-created', { plan: plan.id });
    return plan;
  }

  updateRemediationPlan(planId: string, updates: Partial<RemediationPlan>): void {
    const plan = this.remediationPlans.get(planId);
    if (plan) {
      Object.assign(plan, updates);
      this.emit('remediation-plan-updated', { plan: planId });
    }
  }

  addEvidence(evidence: Omit<Evidence, 'id' | 'collectedAt'>): Evidence {
    const fullEvidence: Evidence = {
      id: `evidence-${Date.now()}`,
      collectedAt: new Date(),
      ...evidence
    };

    this.evidenceStore.set(fullEvidence.id, fullEvidence);
    this.emit('evidence-added', { evidence: fullEvidence.id });
    return fullEvidence;
  }

  private startContinuousMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.performContinuousMonitoring();
    }, 24 * 60 * 60 * 1000); // Daily monitoring
  }

  private async performContinuousMonitoring(): Promise<void> {
    for (const frameworkId of this.activeFrameworks) {
      const framework = this.frameworks.get(frameworkId);
      if (!framework) continue;

      // Check for upcoming test dates
      for (const control of framework.controls) {
        if (control.nextTest <= new Date()) {
          this.emit('test-due', { framework: frameworkId, control: control.id });
        }
      }

      // Check remediation plan due dates
      for (const plan of this.remediationPlans.values()) {
        if (plan.dueDate <= new Date() && plan.status !== 'completed') {
          this.emit('remediation-overdue', { plan: plan.id });
        }
      }
    }
  }

  generateMetrics(frameworkId: string, period: { start: Date; end: Date }): ComplianceMetrics {
    const framework = this.frameworks.get(frameworkId);
    if (!framework) {
      throw new Error(`Framework not found: ${frameworkId}`);
    }

    const assessments = framework.assessments.filter(a => 
      a.startDate >= period.start && a.endDate <= period.end
    );

    const findings = assessments.flatMap(a => a.findings);
    
    const metrics: ComplianceMetrics = {
      framework: frameworkId,
      period,
      overallScore: this.calculateOverallScore(framework),
      controlEffectiveness: this.calculateControlEffectiveness(framework),
      complianceRate: this.calculateComplianceRate(framework),
      riskExposure: this.calculateRiskExposure(findings),
      trends: {
        controlsCounts: this.calculateControlsCounts(framework),
        findingsCounts: this.calculateFindingsCounts(findings),
        riskTrends: this.calculateRiskTrends(assessments)
      }
    };

    return metrics;
  }

  private calculateOverallScore(framework: ComplianceFramework): number {
    const implementedControls = framework.controls.filter(c => c.status === 'implemented').length;
    return (implementedControls / framework.controls.length) * 100;
  }

  private calculateControlEffectiveness(framework: ComplianceFramework): number {
    const effectiveControls = framework.controls.filter(c => 
      c.status === 'implemented' && c.testing.lastResult.result === 'pass'
    ).length;
    return (effectiveControls / framework.controls.length) * 100;
  }

  private calculateComplianceRate(framework: ComplianceFramework): number {
    const compliantRequirements = framework.requirements.filter(r => r.status === 'compliant').length;
    return (compliantRequirements / framework.requirements.length) * 100;
  }

  private calculateRiskExposure(findings: AssessmentFinding[]): number {
    const riskWeights = { low: 1, medium: 2, high: 3, critical: 4 };
    const totalRisk = findings.reduce((sum, f) => sum + riskWeights[f.severity], 0);
    return totalRisk;
  }

  private calculateControlsCounts(framework: ComplianceFramework): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const control of framework.controls) {
      counts[control.status] = (counts[control.status] || 0) + 1;
    }
    return counts;
  }

  private calculateFindingsCounts(findings: AssessmentFinding[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const finding of findings) {
      counts[finding.severity] = (counts[finding.severity] || 0) + 1;
    }
    return counts;
  }

  private calculateRiskTrends(assessments: ComplianceAssessment[]): Array<{ date: Date; risk: number }> {
    return assessments.map(a => ({
      date: a.endDate,
      risk: this.calculateRiskExposure(a.findings)
    }));
  }

  getFrameworks(): ComplianceFramework[] {
    return Array.from(this.frameworks.values());
  }

  getActiveFrameworks(): ComplianceFramework[] {
    return Array.from(this.activeFrameworks).map(id => this.frameworks.get(id)!).filter(Boolean);
  }

  getAssessmentHistory(): ComplianceAssessment[] {
    return [...this.assessmentHistory];
  }

  getRemediationPlans(): RemediationPlan[] {
    return Array.from(this.remediationPlans.values());
  }

  getEvidence(): Evidence[] {
    return Array.from(this.evidenceStore.values());
  }

  getStats(): any {
    return {
      frameworks: this.frameworks.size,
      activeFrameworks: this.activeFrameworks.size,
      assessments: this.assessmentHistory.length,
      remediationPlans: this.remediationPlans.size,
      evidence: this.evidenceStore.size,
      monitoringActive: this.monitoringInterval !== null
    };
  }

  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    this.frameworks.clear();
    this.activeFrameworks.clear();
    this.assessmentHistory = [];
    this.remediationPlans.clear();
    this.evidenceStore.clear();
    
    this.removeAllListeners();
  }
}