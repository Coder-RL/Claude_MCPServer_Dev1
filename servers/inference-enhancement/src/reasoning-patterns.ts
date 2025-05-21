import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { ReasoningChain, ReasoningStep, ReasoningStrategy } from './reasoning-engine.js';
import { KnowledgeContext } from './domain-knowledge.js';
import { ReasoningPattern, ReasoningStepPattern } from './reasoning-persistence.js';

const logger = getLogger('ReasoningPatterns');

export interface PatternMatchResult {
  pattern: ReasoningPattern;
  confidence: number;
  matchReasons: string[];
  suggestedAdaptations: string[];
}

export interface ReasoningTemplate {
  id: string;
  name: string;
  description: string;
  domain: string;
  applicability: {
    problemTypes: string[];
    domains: string[];
    complexity: 'low' | 'medium' | 'high';
    evidenceRequirements: {
      minimumChunks: number;
      minimumConfidence: number;
    };
  };
  steps: ReasoningStepTemplate[];
  expectedOutcomes: {
    confidenceRange: [number, number];
    typicalExecutionTime: number;
    successFactors: string[];
  };
  variations: ReasoningTemplateVariation[];
  metadata: Record<string, any>;
}

export interface ReasoningStepTemplate {
  order: number;
  type: 'analysis' | 'synthesis' | 'evaluation' | 'application';
  name: string;
  description: string;
  inputs: string[];
  processes: string[];
  outputs: string[];
  verification: {
    criteria: string[];
    minimumConfidence: number;
  };
  adaptable: boolean;
}

export interface ReasoningTemplateVariation {
  name: string;
  description: string;
  conditions: string[];
  modifications: {
    stepOrder?: number[];
    additionalSteps?: ReasoningStepTemplate[];
    removedSteps?: number[];
    parameterAdjustments?: Record<string, any>;
  };
}

export interface PatternApplication {
  patternId: string;
  templateId: string;
  context: {
    problem: string;
    domain: string;
    knowledgeContext: KnowledgeContext;
  };
  adaptations: string[];
  confidence: number;
  estimatedComplexity: 'low' | 'medium' | 'high';
  estimatedTime: number;
}

export const SCIENTIFIC_REASONING_PATTERNS: ReasoningPattern[] = [
  {
    id: 'scientific-hypothesis-testing',
    name: 'Scientific Hypothesis Testing Pattern',
    description: 'Systematic pattern for testing scientific hypotheses using evidence',
    domain: 'science',
    pattern: {
      triggerConditions: [
        'domain:science',
        'problem contains hypothesis',
        'evidence available',
        'testable claims present'
      ],
      reasoningSteps: [
        {
          type: 'analysis',
          description: 'Analyze the hypothesis and identify testable predictions',
          evidenceRequirements: {
            minCount: 2,
            minConfidence: 0.7,
            domains: ['science']
          },
          expectedOutputs: ['testable predictions', 'null hypothesis', 'alternative hypothesis']
        },
        {
          type: 'evaluation',
          description: 'Evaluate evidence against predictions',
          evidenceRequirements: {
            minCount: 3,
            minConfidence: 0.6,
            domains: ['science']
          },
          expectedOutputs: ['evidence assessment', 'statistical significance', 'confidence intervals']
        },
        {
          type: 'synthesis',
          description: 'Synthesize findings and draw conclusions',
          evidenceRequirements: {
            minCount: 1,
            minConfidence: 0.8,
            domains: ['science']
          },
          expectedOutputs: ['conclusion', 'limitations', 'future research directions']
        }
      ],
      expectedOutcomes: [
        'Evidence-based conclusion',
        'Statistical assessment',
        'Reproducible methodology'
      ]
    },
    usageCount: 0,
    successRate: 0.85,
    averageConfidence: 0.82,
    examples: [],
    metadata: {
      complexity: 'high',
      timeEstimate: '15-25 minutes',
      prerequisites: ['statistical knowledge', 'scientific method understanding']
    }
  },
  {
    id: 'observational-pattern-analysis',
    name: 'Observational Pattern Analysis',
    description: 'Pattern for analyzing observational data to identify trends and correlations',
    domain: 'science',
    pattern: {
      triggerConditions: [
        'domain:science',
        'observational data available',
        'pattern identification needed',
        'correlation analysis required'
      ],
      reasoningSteps: [
        {
          type: 'analysis',
          description: 'Analyze observational data for patterns and anomalies',
          evidenceRequirements: {
            minCount: 5,
            minConfidence: 0.6,
            domains: ['science']
          },
          expectedOutputs: ['data patterns', 'statistical trends', 'anomaly identification']
        },
        {
          type: 'synthesis',
          description: 'Synthesize patterns into coherent explanations',
          evidenceRequirements: {
            minCount: 3,
            minConfidence: 0.7,
            domains: ['science']
          },
          expectedOutputs: ['pattern explanation', 'causal hypotheses', 'correlation analysis']
        },
        {
          type: 'evaluation',
          description: 'Evaluate the strength and reliability of identified patterns',
          evidenceRequirements: {
            minCount: 2,
            minConfidence: 0.8,
            domains: ['science']
          },
          expectedOutputs: ['reliability assessment', 'confidence intervals', 'validation methods']
        }
      ],
      expectedOutcomes: [
        'Identified patterns with confidence levels',
        'Explanatory hypotheses',
        'Validation methodology'
      ]
    },
    usageCount: 0,
    successRate: 0.78,
    averageConfidence: 0.75,
    examples: [],
    metadata: {
      complexity: 'medium',
      timeEstimate: '10-20 minutes',
      prerequisites: ['data analysis skills', 'statistical understanding']
    }
  }
];

export const TECHNOLOGY_REASONING_PATTERNS: ReasoningPattern[] = [
  {
    id: 'system-architecture-analysis',
    name: 'System Architecture Analysis Pattern',
    description: 'Comprehensive pattern for analyzing and designing system architectures',
    domain: 'technology',
    pattern: {
      triggerConditions: [
        'domain:technology',
        'system design required',
        'architecture analysis needed',
        'technical requirements present'
      ],
      reasoningSteps: [
        {
          type: 'analysis',
          description: 'Analyze system requirements and constraints',
          evidenceRequirements: {
            minCount: 3,
            minConfidence: 0.8,
            domains: ['technology']
          },
          expectedOutputs: ['functional requirements', 'non-functional requirements', 'constraints analysis']
        },
        {
          type: 'synthesis',
          description: 'Synthesize architecture components and patterns',
          evidenceRequirements: {
            minCount: 4,
            minConfidence: 0.7,
            domains: ['technology']
          },
          expectedOutputs: ['component design', 'interaction patterns', 'data flow design']
        },
        {
          type: 'evaluation',
          description: 'Evaluate architecture against quality attributes',
          evidenceRequirements: {
            minCount: 2,
            minConfidence: 0.8,
            domains: ['technology']
          },
          expectedOutputs: ['quality assessment', 'trade-off analysis', 'risk evaluation']
        },
        {
          type: 'application',
          description: 'Apply architecture patterns and best practices',
          evidenceRequirements: {
            minCount: 3,
            minConfidence: 0.7,
            domains: ['technology']
          },
          expectedOutputs: ['implementation strategy', 'technology stack', 'deployment plan']
        }
      ],
      expectedOutcomes: [
        'Comprehensive architecture design',
        'Implementation roadmap',
        'Quality assurance strategy'
      ]
    },
    usageCount: 0,
    successRate: 0.81,
    averageConfidence: 0.79,
    examples: [],
    metadata: {
      complexity: 'high',
      timeEstimate: '20-35 minutes',
      prerequisites: ['system design knowledge', 'architecture patterns', 'quality attributes understanding']
    }
  },
  {
    id: 'performance-optimization-analysis',
    name: 'Performance Optimization Analysis',
    description: 'Systematic approach to analyzing and optimizing system performance',
    domain: 'technology',
    pattern: {
      triggerConditions: [
        'domain:technology',
        'performance issues identified',
        'optimization required',
        'bottleneck analysis needed'
      ],
      reasoningSteps: [
        {
          type: 'analysis',
          description: 'Analyze performance bottlenecks and metrics',
          evidenceRequirements: {
            minCount: 4,
            minConfidence: 0.7,
            domains: ['technology']
          },
          expectedOutputs: ['bottleneck identification', 'performance metrics', 'resource utilization']
        },
        {
          type: 'evaluation',
          description: 'Evaluate optimization strategies and trade-offs',
          evidenceRequirements: {
            minCount: 3,
            minConfidence: 0.8,
            domains: ['technology']
          },
          expectedOutputs: ['optimization strategies', 'trade-off analysis', 'cost-benefit assessment']
        },
        {
          type: 'application',
          description: 'Apply optimization techniques and measure results',
          evidenceRequirements: {
            minCount: 2,
            minConfidence: 0.7,
            domains: ['technology']
          },
          expectedOutputs: ['implementation plan', 'measurement strategy', 'validation approach']
        }
      ],
      expectedOutcomes: [
        'Optimization implementation plan',
        'Performance improvement estimates',
        'Monitoring and validation strategy'
      ]
    },
    usageCount: 0,
    successRate: 0.83,
    averageConfidence: 0.77,
    examples: [],
    metadata: {
      complexity: 'medium',
      timeEstimate: '15-25 minutes',
      prerequisites: ['performance analysis skills', 'optimization techniques', 'measurement methodologies']
    }
  }
];

export const BUSINESS_REASONING_PATTERNS: ReasoningPattern[] = [
  {
    id: 'strategic-decision-making',
    name: 'Strategic Decision Making Pattern',
    description: 'Comprehensive framework for business strategic decision analysis',
    domain: 'business',
    pattern: {
      triggerConditions: [
        'domain:business',
        'strategic decision required',
        'multiple options present',
        'business impact analysis needed'
      ],
      reasoningSteps: [
        {
          type: 'analysis',
          description: 'Analyze business context and strategic options',
          evidenceRequirements: {
            minCount: 4,
            minConfidence: 0.7,
            domains: ['business']
          },
          expectedOutputs: ['context analysis', 'option identification', 'stakeholder assessment']
        },
        {
          type: 'evaluation',
          description: 'Evaluate options against business criteria',
          evidenceRequirements: {
            minCount: 3,
            minConfidence: 0.8,
            domains: ['business']
          },
          expectedOutputs: ['criteria evaluation', 'risk assessment', 'financial analysis']
        },
        {
          type: 'synthesis',
          description: 'Synthesize recommendations with implementation strategy',
          evidenceRequirements: {
            minCount: 2,
            minConfidence: 0.8,
            domains: ['business']
          },
          expectedOutputs: ['strategic recommendation', 'implementation plan', 'success metrics']
        }
      ],
      expectedOutcomes: [
        'Evidence-based strategic recommendation',
        'Implementation roadmap',
        'Risk mitigation strategy'
      ]
    },
    usageCount: 0,
    successRate: 0.79,
    averageConfidence: 0.74,
    examples: [],
    metadata: {
      complexity: 'high',
      timeEstimate: '20-30 minutes',
      prerequisites: ['business strategy knowledge', 'financial analysis skills', 'risk assessment abilities']
    }
  },
  {
    id: 'market-opportunity-analysis',
    name: 'Market Opportunity Analysis',
    description: 'Systematic approach to analyzing market opportunities and competitive landscape',
    domain: 'business',
    pattern: {
      triggerConditions: [
        'domain:business',
        'market analysis required',
        'opportunity assessment needed',
        'competitive landscape analysis'
      ],
      reasoningSteps: [
        {
          type: 'analysis',
          description: 'Analyze market size, trends, and dynamics',
          evidenceRequirements: {
            minCount: 5,
            minConfidence: 0.6,
            domains: ['business']
          },
          expectedOutputs: ['market size analysis', 'trend identification', 'growth projections']
        },
        {
          type: 'evaluation',
          description: 'Evaluate competitive landscape and positioning',
          evidenceRequirements: {
            minCount: 3,
            minConfidence: 0.7,
            domains: ['business']
          },
          expectedOutputs: ['competitive analysis', 'positioning assessment', 'differentiation opportunities']
        },
        {
          type: 'synthesis',
          description: 'Synthesize opportunity assessment and entry strategy',
          evidenceRequirements: {
            minCount: 2,
            minConfidence: 0.8,
            domains: ['business']
          },
          expectedOutputs: ['opportunity assessment', 'entry strategy', 'success probability']
        }
      ],
      expectedOutcomes: [
        'Market opportunity evaluation',
        'Competitive positioning strategy',
        'Market entry recommendations'
      ]
    },
    usageCount: 0,
    successRate: 0.76,
    averageConfidence: 0.71,
    examples: [],
    metadata: {
      complexity: 'medium',
      timeEstimate: '15-25 minutes',
      prerequisites: ['market analysis skills', 'competitive intelligence', 'business development knowledge']
    }
  }
];

export const REASONING_TEMPLATES: ReasoningTemplate[] = [
  {
    id: 'systematic-problem-solving',
    name: 'Systematic Problem Solving Template',
    description: 'Universal template for structured problem-solving across domains',
    domain: 'general',
    applicability: {
      problemTypes: ['analytical', 'complex', 'multi-faceted'],
      domains: ['general', 'science', 'technology', 'business'],
      complexity: 'medium',
      evidenceRequirements: {
        minimumChunks: 2,
        minimumConfidence: 0.6
      }
    },
    steps: [
      {
        order: 1,
        type: 'analysis',
        name: 'Problem Decomposition',
        description: 'Break down the complex problem into manageable components',
        inputs: ['problem statement', 'context information', 'constraints'],
        processes: ['component identification', 'relationship mapping', 'priority assessment'],
        outputs: ['problem components', 'component relationships', 'priority ranking'],
        verification: {
          criteria: ['all major components identified', 'relationships clearly defined'],
          minimumConfidence: 0.7
        },
        adaptable: true
      },
      {
        order: 2,
        type: 'analysis',
        name: 'Information Gathering',
        description: 'Collect and analyze relevant information for each component',
        inputs: ['problem components', 'knowledge base', 'evidence sources'],
        processes: ['information search', 'relevance assessment', 'quality evaluation'],
        outputs: ['relevant information', 'information gaps', 'confidence assessments'],
        verification: {
          criteria: ['sufficient information collected', 'information quality verified'],
          minimumConfidence: 0.6
        },
        adaptable: true
      },
      {
        order: 3,
        type: 'synthesis',
        name: 'Solution Generation',
        description: 'Generate multiple potential solutions based on gathered information',
        inputs: ['relevant information', 'problem components', 'constraints'],
        processes: ['brainstorming', 'solution design', 'feasibility assessment'],
        outputs: ['solution options', 'feasibility analysis', 'resource requirements'],
        verification: {
          criteria: ['multiple solutions generated', 'feasibility assessed'],
          minimumConfidence: 0.7
        },
        adaptable: true
      },
      {
        order: 4,
        type: 'evaluation',
        name: 'Solution Evaluation',
        description: 'Evaluate solutions against criteria and select the best approach',
        inputs: ['solution options', 'evaluation criteria', 'constraints'],
        processes: ['criteria application', 'comparative analysis', 'risk assessment'],
        outputs: ['solution rankings', 'selected solution', 'implementation strategy'],
        verification: {
          criteria: ['thorough evaluation completed', 'clear selection rationale'],
          minimumConfidence: 0.8
        },
        adaptable: false
      },
      {
        order: 5,
        type: 'application',
        name: 'Implementation Planning',
        description: 'Develop detailed implementation plan with monitoring strategy',
        inputs: ['selected solution', 'resources', 'timeline'],
        processes: ['step planning', 'resource allocation', 'monitoring design'],
        outputs: ['implementation plan', 'resource allocation', 'success metrics'],
        verification: {
          criteria: ['detailed plan created', 'monitoring strategy defined'],
          minimumConfidence: 0.7
        },
        adaptable: true
      }
    ],
    expectedOutcomes: {
      confidenceRange: [0.7, 0.9],
      typicalExecutionTime: 1800000, // 30 minutes in milliseconds
      successFactors: [
        'Clear problem definition',
        'Sufficient evidence available',
        'Appropriate domain knowledge',
        'Stakeholder alignment'
      ]
    },
    variations: [
      {
        name: 'Rapid Problem Solving',
        description: 'Accelerated version for time-critical situations',
        conditions: ['time pressure', 'urgent decision needed'],
        modifications: {
          stepOrder: [1, 2, 4, 5], // Skip synthesis step
          parameterAdjustments: {
            minimumConfidence: 0.5,
            timeMultiplier: 0.5
          }
        }
      },
      {
        name: 'Collaborative Problem Solving',
        description: 'Enhanced version for multi-stakeholder problems',
        conditions: ['multiple stakeholders', 'conflicting interests'],
        modifications: {
          additionalSteps: [
            {
              order: 1.5,
              type: 'analysis',
              name: 'Stakeholder Analysis',
              description: 'Analyze stakeholder interests and constraints',
              inputs: ['stakeholder list', 'interest assessment'],
              processes: ['interest mapping', 'conflict identification'],
              outputs: ['stakeholder map', 'conflict analysis'],
              verification: {
                criteria: ['all stakeholders identified'],
                minimumConfidence: 0.6
              },
              adaptable: true
            }
          ]
        }
      }
    ],
    metadata: {
      author: 'reasoning-pattern-library',
      version: '1.0',
      lastUpdated: '2024-01-01',
      usageStatistics: {
        totalApplications: 0,
        successRate: 0.8,
        averageConfidence: 0.75
      }
    }
  }
];

export class ReasoningPatternLibrary {
  private patterns: Map<string, ReasoningPattern> = new Map();
  private templates: Map<string, ReasoningTemplate> = new Map();
  private patternsByDomain: Map<string, ReasoningPattern[]> = new Map();
  private templatesByDomain: Map<string, ReasoningTemplate[]> = new Map();

  constructor() {
    this.initializeLibrary();
  }

  private initializeLibrary(): void {
    // Load predefined patterns
    const allPatterns = [
      ...SCIENTIFIC_REASONING_PATTERNS,
      ...TECHNOLOGY_REASONING_PATTERNS,
      ...BUSINESS_REASONING_PATTERNS,
    ];

    for (const pattern of allPatterns) {
      this.patterns.set(pattern.id, pattern);
      
      if (!this.patternsByDomain.has(pattern.domain)) {
        this.patternsByDomain.set(pattern.domain, []);
      }
      this.patternsByDomain.get(pattern.domain)!.push(pattern);
    }

    // Load predefined templates
    for (const template of REASONING_TEMPLATES) {
      this.templates.set(template.id, template);
      
      if (!this.templatesByDomain.has(template.domain)) {
        this.templatesByDomain.set(template.domain, []);
      }
      this.templatesByDomain.get(template.domain)!.push(template);
    }

    logger.info('Reasoning pattern library initialized', {
      patterns: this.patterns.size,
      templates: this.templates.size,
      domains: Array.from(this.patternsByDomain.keys()),
    });
  }

  async findMatchingPatterns(
    problem: string,
    domain: string,
    knowledgeContext: KnowledgeContext
  ): Promise<PatternMatchResult[]> {
    try {
      const candidates = this.getCandidatePatterns(domain);
      const results: PatternMatchResult[] = [];

      for (const pattern of candidates) {
        const matchResult = await this.evaluatePatternMatch(pattern, problem, domain, knowledgeContext);
        if (matchResult.confidence > 0.3) { // Minimum threshold for consideration
          results.push(matchResult);
        }
      }

      // Sort by confidence
      results.sort((a, b) => b.confidence - a.confidence);

      logger.debug('Found matching patterns', {
        problem: problem.substring(0, 100),
        domain,
        candidates: candidates.length,
        matches: results.length,
        topConfidence: results[0]?.confidence || 0,
      });

      return results;
    } catch (error) {
      logger.error('Failed to find matching patterns', { problem: problem.substring(0, 100), domain, error });
      throw error;
    }
  }

  async applyPattern(
    patternId: string,
    problem: string,
    domain: string,
    knowledgeContext: KnowledgeContext,
    adaptations: string[] = []
  ): Promise<PatternApplication> {
    try {
      const pattern = this.patterns.get(patternId);
      if (!pattern) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: `Pattern not found: ${patternId}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'applyPattern', patternId },
        });
      }

      // Find best matching template
      const template = await this.selectBestTemplate(pattern, problem, domain);
      
      // Calculate application confidence
      const confidence = this.calculateApplicationConfidence(pattern, problem, domain, knowledgeContext);
      
      // Estimate complexity and time
      const complexity = this.estimateComplexity(pattern, knowledgeContext);
      const estimatedTime = this.estimateExecutionTime(pattern, complexity);

      const application: PatternApplication = {
        patternId,
        templateId: template?.id || 'default',
        context: {
          problem,
          domain,
          knowledgeContext,
        },
        adaptations,
        confidence,
        estimatedComplexity: complexity,
        estimatedTime,
      };

      // Update pattern usage statistics
      pattern.usageCount += 1;
      
      logger.info('Applied reasoning pattern', {
        patternId,
        templateId: application.templateId,
        confidence,
        complexity,
        estimatedTime,
      });

      return application;
    } catch (error) {
      logger.error('Failed to apply pattern', { patternId, error });
      throw error;
    }
  }

  async generateReasoningStrategy(
    problem: string,
    domain: string,
    knowledgeContext: KnowledgeContext
  ): Promise<ReasoningStrategy> {
    try {
      // Find best matching patterns
      const matchingPatterns = await this.findMatchingPatterns(problem, domain, knowledgeContext);
      
      if (matchingPatterns.length === 0) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: 'No suitable reasoning patterns found for the given problem',
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'generateReasoningStrategy', domain, problem: problem.substring(0, 100) },
        });
      }

      const bestPattern = matchingPatterns[0].pattern;
      
      // Generate custom strategy based on the pattern
      const strategy: ReasoningStrategy = {
        name: `pattern-based-${bestPattern.id}`,
        description: `Strategy derived from ${bestPattern.name} pattern`,
        
        async apply(problem: string, context: KnowledgeContext) {
          return await this.executePatternBasedReasoning(bestPattern, problem, context);
        },
        
        isApplicable(problem: string, domain: string): boolean {
          return bestPattern.pattern.triggerConditions.some(condition => 
            this.evaluateCondition(condition, problem, domain)
          );
        }
      };

      logger.info('Generated reasoning strategy from pattern', {
        patternId: bestPattern.id,
        strategyName: strategy.name,
        confidence: matchingPatterns[0].confidence,
      });

      return strategy;
    } catch (error) {
      logger.error('Failed to generate reasoning strategy', { problem: problem.substring(0, 100), domain, error });
      throw error;
    }
  }

  private getCandidatePatterns(domain: string): ReasoningPattern[] {
    const candidates: ReasoningPattern[] = [];
    
    // Primary: patterns for exact domain
    const domainPatterns = this.patternsByDomain.get(domain) || [];
    candidates.push(...domainPatterns);
    
    // Secondary: general patterns
    const generalPatterns = this.patternsByDomain.get('general') || [];
    candidates.push(...generalPatterns);
    
    return candidates;
  }

  private async evaluatePatternMatch(
    pattern: ReasoningPattern,
    problem: string,
    domain: string,
    knowledgeContext: KnowledgeContext
  ): Promise<PatternMatchResult> {
    let confidence = 0;
    const matchReasons: string[] = [];
    const suggestedAdaptations: string[] = [];

    // Evaluate trigger conditions
    let triggersMatched = 0;
    for (const condition of pattern.pattern.triggerConditions) {
      if (this.evaluateCondition(condition, problem, domain)) {
        triggersMatched++;
        matchReasons.push(`Trigger condition met: ${condition}`);
      }
    }
    
    const triggerScore = triggersMatched / pattern.pattern.triggerConditions.length;
    confidence += triggerScore * 0.4;

    // Evaluate domain alignment
    if (pattern.domain === domain) {
      confidence += 0.3;
      matchReasons.push('Exact domain match');
    } else if (pattern.domain === 'general') {
      confidence += 0.1;
      matchReasons.push('General domain applicable');
    }

    // Evaluate evidence requirements
    const evidenceScore = this.evaluateEvidenceRequirements(pattern, knowledgeContext);
    confidence += evidenceScore * 0.2;
    
    if (evidenceScore > 0.7) {
      matchReasons.push('Sufficient evidence available');
    } else if (evidenceScore < 0.5) {
      suggestedAdaptations.push('Gather additional evidence');
    }

    // Evaluate pattern success rate
    confidence += pattern.successRate * 0.1;
    
    if (pattern.successRate > 0.8) {
      matchReasons.push('High historical success rate');
    }

    // Consider complexity match
    const problemComplexity = this.assessProblemComplexity(problem);
    const patternComplexity = pattern.metadata.complexity || 'medium';
    
    if (this.complexityMatch(problemComplexity, patternComplexity)) {
      confidence += 0.05;
      matchReasons.push('Appropriate complexity level');
    } else {
      suggestedAdaptations.push(`Adjust for ${problemComplexity} complexity`);
    }

    return {
      pattern,
      confidence: Math.min(1.0, confidence),
      matchReasons,
      suggestedAdaptations,
    };
  }

  private evaluateCondition(condition: string, problem: string, domain: string): boolean {
    const conditionLower = condition.toLowerCase();
    const problemLower = problem.toLowerCase();
    
    // Handle domain conditions
    if (conditionLower.startsWith('domain:')) {
      const requiredDomain = conditionLower.substring(7);
      return domain === requiredDomain;
    }
    
    // Handle keyword conditions
    if (conditionLower.includes('contains')) {
      const keyword = conditionLower.split('contains')[1]?.trim();
      return keyword ? problemLower.includes(keyword) : false;
    }
    
    // Handle direct keyword matching
    return problemLower.includes(conditionLower);
  }

  private evaluateEvidenceRequirements(
    pattern: ReasoningPattern,
    knowledgeContext: KnowledgeContext
  ): number {
    const steps = pattern.pattern.reasoningSteps;
    let totalScore = 0;
    
    for (const step of steps) {
      const requirements = step.evidenceRequirements;
      const availableEvidence = knowledgeContext.relevantChunks;
      
      // Check count requirement
      const countScore = Math.min(1, availableEvidence.length / requirements.minCount);
      
      // Check confidence requirement
      const avgConfidence = availableEvidence.length > 0 ? 
        availableEvidence.reduce((sum, chunk) => sum + chunk.confidence, 0) / availableEvidence.length : 0;
      const confidenceScore = avgConfidence >= requirements.minConfidence ? 1 : avgConfidence / requirements.minConfidence;
      
      // Check domain alignment
      const domainScore = requirements.domains.includes(knowledgeContext.domain) ? 1 : 0.5;
      
      const stepScore = (countScore + confidenceScore + domainScore) / 3;
      totalScore += stepScore;
    }
    
    return steps.length > 0 ? totalScore / steps.length : 0;
  }

  private assessProblemComplexity(problem: string): 'low' | 'medium' | 'high' {
    const length = problem.length;
    const complexityIndicators = [
      'multiple', 'complex', 'comprehensive', 'systematic', 'advanced',
      'intricate', 'sophisticated', 'multifaceted', 'interdisciplinary'
    ];
    
    const hasComplexityIndicators = complexityIndicators.some(indicator => 
      problem.toLowerCase().includes(indicator)
    );

    if (length > 200 || hasComplexityIndicators) {
      return 'high';
    } else if (length > 100) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private complexityMatch(problemComplexity: string, patternComplexity: string): boolean {
    const complexityOrder = ['low', 'medium', 'high'];
    const problemLevel = complexityOrder.indexOf(problemComplexity);
    const patternLevel = complexityOrder.indexOf(patternComplexity);
    
    return Math.abs(problemLevel - patternLevel) <= 1;
  }

  private async selectBestTemplate(
    pattern: ReasoningPattern,
    problem: string,
    domain: string
  ): Promise<ReasoningTemplate | null> {
    const candidates = this.templatesByDomain.get(domain) || this.templatesByDomain.get('general') || [];
    
    if (candidates.length === 0) {
      return null;
    }
    
    // Simple selection - in practice would be more sophisticated
    return candidates[0];
  }

  private calculateApplicationConfidence(
    pattern: ReasoningPattern,
    problem: string,
    domain: string,
    knowledgeContext: KnowledgeContext
  ): number {
    let confidence = pattern.averageConfidence * 0.5; // Base on historical performance
    
    // Adjust for domain match
    if (pattern.domain === domain) {
      confidence += 0.2;
    } else if (pattern.domain === 'general') {
      confidence += 0.1;
    }
    
    // Adjust for evidence quality
    const evidenceScore = this.evaluateEvidenceRequirements(pattern, knowledgeContext);
    confidence += evidenceScore * 0.3;
    
    return Math.min(1.0, confidence);
  }

  private estimateComplexity(pattern: ReasoningPattern, knowledgeContext: KnowledgeContext): 'low' | 'medium' | 'high' {
    const stepCount = pattern.pattern.reasoningSteps.length;
    const evidenceComplexity = knowledgeContext.relevantChunks.length;
    const patternComplexity = pattern.metadata.complexity || 'medium';
    
    if (stepCount > 4 || evidenceComplexity > 10 || patternComplexity === 'high') {
      return 'high';
    } else if (stepCount > 2 || evidenceComplexity > 5 || patternComplexity === 'medium') {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private estimateExecutionTime(pattern: ReasoningPattern, complexity: 'low' | 'medium' | 'high'): number {
    const baseTime = pattern.metadata.timeEstimate ? 
      this.parseTimeEstimate(pattern.metadata.timeEstimate) : 900000; // 15 minutes default
    
    const multipliers = { low: 0.7, medium: 1.0, high: 1.5 };
    return baseTime * multipliers[complexity];
  }

  private parseTimeEstimate(timeStr: string): number {
    // Parse time estimates like "15-25 minutes" or "30 minutes"
    const matches = timeStr.match(/(\d+)(?:-(\d+))?\s*minutes?/);
    if (matches) {
      const min = parseInt(matches[1]);
      const max = matches[2] ? parseInt(matches[2]) : min;
      return ((min + max) / 2) * 60000; // Convert to milliseconds
    }
    return 900000; // 15 minutes default
  }

  private async executePatternBasedReasoning(
    pattern: ReasoningPattern,
    problem: string,
    context: KnowledgeContext
  ): Promise<any> {
    // This would implement the actual reasoning logic based on the pattern
    // For now, return a placeholder structure
    const graphId = `pattern-${pattern.id}-${Date.now()}`;
    
    return {
      id: graphId,
      nodes: new Map(),
      edges: [],
      root: 'start',
      conclusion: `Applied ${pattern.name} to analyze: ${problem}`,
      overallConfidence: pattern.averageConfidence,
      metadata: {
        patternId: pattern.id,
        patternName: pattern.name,
        appliedAt: new Date().toISOString(),
      },
    };
  }

  addPattern(pattern: ReasoningPattern): void {
    this.patterns.set(pattern.id, pattern);
    
    if (!this.patternsByDomain.has(pattern.domain)) {
      this.patternsByDomain.set(pattern.domain, []);
    }
    this.patternsByDomain.get(pattern.domain)!.push(pattern);
    
    logger.info('Added reasoning pattern', {
      patternId: pattern.id,
      domain: pattern.domain,
      name: pattern.name,
    });
  }

  addTemplate(template: ReasoningTemplate): void {
    this.templates.set(template.id, template);
    
    if (!this.templatesByDomain.has(template.domain)) {
      this.templatesByDomain.set(template.domain, []);
    }
    this.templatesByDomain.get(template.domain)!.push(template);
    
    logger.info('Added reasoning template', {
      templateId: template.id,
      domain: template.domain,
      name: template.name,
    });
  }

  getPattern(patternId: string): ReasoningPattern | undefined {
    return this.patterns.get(patternId);
  }

  getTemplate(templateId: string): ReasoningTemplate | undefined {
    return this.templates.get(templateId);
  }

  getPatternsByDomain(domain: string): ReasoningPattern[] {
    return this.patternsByDomain.get(domain) || [];
  }

  getTemplatesByDomain(domain: string): ReasoningTemplate[] {
    return this.templatesByDomain.get(domain) || [];
  }

  listAllPatterns(): ReasoningPattern[] {
    return Array.from(this.patterns.values());
  }

  listAllTemplates(): ReasoningTemplate[] {
    return Array.from(this.templates.values());
  }

  async getLibraryStats(): Promise<{
    totalPatterns: number;
    totalTemplates: number;
    domainDistribution: Record<string, { patterns: number; templates: number }>;
    mostUsedPatterns: Array<{ id: string; name: string; usageCount: number }>;
    averageSuccessRate: number;
  }> {
    const patterns = Array.from(this.patterns.values());
    const templates = Array.from(this.templates.values());
    
    const domainDistribution: Record<string, { patterns: number; templates: number }> = {};
    
    for (const [domain, domainPatterns] of this.patternsByDomain) {
      domainDistribution[domain] = {
        patterns: domainPatterns.length,
        templates: this.templatesByDomain.get(domain)?.length || 0,
      };
    }
    
    const mostUsedPatterns = patterns
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5)
      .map(p => ({ id: p.id, name: p.name, usageCount: p.usageCount }));
    
    const averageSuccessRate = patterns.length > 0 ? 
      patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length : 0;

    return {
      totalPatterns: patterns.length,
      totalTemplates: templates.length,
      domainDistribution,
      mostUsedPatterns,
      averageSuccessRate,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = await this.getLibraryStats();
      
      return {
        healthy: stats.totalPatterns > 0 && stats.totalTemplates > 0,
        details: {
          ...stats,
          service: 'reasoning-pattern-library',
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'reasoning-pattern-library',
        },
      };
    }
  }
}