import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { EmbeddingService, KnowledgeChunk } from './embedding-service.js';
import { DomainKnowledgeOrganizer, KnowledgeContext } from './domain-knowledge.js';

const logger = getLogger('ReasoningEngine');

export interface ReasoningNode {
  id: string;
  type: 'premise' | 'inference' | 'conclusion' | 'assumption' | 'evidence';
  content: string;
  confidence: number;
  dependencies: string[];
  supportingEvidence: KnowledgeChunk[];
  metadata: Record<string, any>;
}

export interface ReasoningGraph {
  id: string;
  nodes: Map<string, ReasoningNode>;
  edges: Array<{ from: string; to: string; type: 'supports' | 'contradicts' | 'requires' | 'implies' }>;
  root: string;
  conclusion: string;
  overallConfidence: number;
  metadata: Record<string, any>;
}

export interface ReasoningStrategy {
  name: string;
  description: string;
  apply(problem: string, context: KnowledgeContext): Promise<ReasoningGraph>;
  isApplicable(problem: string, domain: string): boolean;
}

export interface ReasoningStep {
  id: string;
  stepNumber: number;
  type: 'analysis' | 'synthesis' | 'evaluation' | 'application';
  description: string;
  input: any;
  output: any;
  reasoning: string;
  confidence: number;
  evidenceUsed: KnowledgeChunk[];
  verificationResult?: VerificationResult;
  metadata: Record<string, any>;
}

export interface ReasoningChain {
  id: string;
  problem: string;
  domain: string;
  strategy: string;
  steps: ReasoningStep[];
  reasoningGraph: ReasoningGraph;
  finalConclusion: string;
  overallConfidence: number;
  validationResults: VerificationResult[];
  executionTime: number;
  metadata: Record<string, any>;
}

export interface VerificationResult {
  passed: boolean;
  confidence: number;
  issues: string[];
  suggestions: string[];
  evidenceSupport: number;
  logicalConsistency: number;
  domainAlignment: number;
}

export class DeductiveReasoningStrategy implements ReasoningStrategy {
  name = 'deductive';
  description = 'Top-down reasoning from general principles to specific conclusions';

  async apply(problem: string, context: KnowledgeContext): Promise<ReasoningGraph> {
    const graphId = `deductive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nodes = new Map<string, ReasoningNode>();
    const edges: Array<{ from: string; to: string; type: 'supports' | 'contradicts' | 'requires' | 'implies' }> = [];

    // Create premise nodes from high-confidence knowledge
    const premises = context.relevantChunks
      .filter(chunk => chunk.confidence > 0.8)
      .slice(0, 3); // Top 3 most confident chunks

    for (let i = 0; i < premises.length; i++) {
      const premise = premises[i];
      const nodeId = `premise_${i}`;
      
      nodes.set(nodeId, {
        id: nodeId,
        type: 'premise',
        content: premise.summary,
        confidence: premise.confidence,
        dependencies: [],
        supportingEvidence: [premise],
        metadata: {
          originalChunk: premise.id,
          keywords: premise.keywords,
        },
      });
    }

    // Create inference nodes
    const inferenceNode: ReasoningNode = {
      id: 'main_inference',
      type: 'inference',
      content: `Applying deductive reasoning to: ${problem}`,
      confidence: 0.7,
      dependencies: Array.from(nodes.keys()),
      supportingEvidence: premises,
      metadata: {
        strategy: 'deductive',
        premiseCount: premises.length,
      },
    };

    nodes.set('main_inference', inferenceNode);

    // Create edges from premises to inference
    for (const premiseId of Array.from(nodes.keys()).filter(id => id.startsWith('premise_'))) {
      edges.push({ from: premiseId, to: 'main_inference', type: 'supports' });
    }

    // Create conclusion node
    const conclusionNode: ReasoningNode = {
      id: 'conclusion',
      type: 'conclusion',
      content: this.generateDeductiveConclusion(problem, premises),
      confidence: Math.min(0.9, premises.reduce((sum, p) => sum + p.confidence, 0) / premises.length),
      dependencies: ['main_inference'],
      supportingEvidence: premises,
      metadata: {
        derivedFrom: 'main_inference',
        evidenceCount: premises.length,
      },
    };

    nodes.set('conclusion', conclusionNode);
    edges.push({ from: 'main_inference', to: 'conclusion', type: 'implies' });

    const overallConfidence = Array.from(nodes.values())
      .reduce((sum, node) => sum + node.confidence, 0) / nodes.size;

    return {
      id: graphId,
      nodes,
      edges,
      root: Array.from(nodes.keys()).find(id => id.startsWith('premise_')) || 'premise_0',
      conclusion: conclusionNode.content,
      overallConfidence,
      metadata: {
        strategy: 'deductive',
        nodeCount: nodes.size,
        edgeCount: edges.length,
        premiseCount: premises.length,
      },
    };
  }

  isApplicable(problem: string, domain: string): boolean {
    const problemLower = problem.toLowerCase();
    return problemLower.includes('if') && problemLower.includes('then') ||
           problemLower.includes('given') ||
           problemLower.includes('assume') ||
           domain === 'science' || domain === 'technology';
  }

  private generateDeductiveConclusion(problem: string, premises: KnowledgeChunk[]): string {
    const keyInsights = premises.map(p => p.summary).join('; ');
    return `Based on the established principles (${keyInsights}), the deductive analysis of "${problem}" suggests a systematic approach following logical inference patterns.`;
  }
}

export class InductiveReasoningStrategy implements ReasoningStrategy {
  name = 'inductive';
  description = 'Bottom-up reasoning from specific observations to general patterns';

  async apply(problem: string, context: KnowledgeContext): Promise<ReasoningGraph> {
    const graphId = `inductive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nodes = new Map<string, ReasoningNode>();
    const edges: Array<{ from: string; to: string; type: 'supports' | 'contradicts' | 'requires' | 'implies' }> = [];

    // Create evidence nodes from all relevant chunks
    const evidenceChunks = context.relevantChunks.slice(0, 5); // Top 5 chunks

    for (let i = 0; i < evidenceChunks.length; i++) {
      const evidence = evidenceChunks[i];
      const nodeId = `evidence_${i}`;
      
      nodes.set(nodeId, {
        id: nodeId,
        type: 'evidence',
        content: evidence.content.substring(0, 200), // Truncate for readability
        confidence: evidence.confidence,
        dependencies: [],
        supportingEvidence: [evidence],
        metadata: {
          domain: evidence.domain,
          keywords: evidence.keywords.slice(0, 5),
        },
      });
    }

    // Create pattern inference node
    const patterns = this.identifyPatterns(evidenceChunks);
    const patternNode: ReasoningNode = {
      id: 'pattern_analysis',
      type: 'inference',
      content: `Identified patterns: ${patterns.join('; ')}`,
      confidence: 0.6,
      dependencies: Array.from(nodes.keys()),
      supportingEvidence: evidenceChunks,
      metadata: {
        patterns,
        evidenceCount: evidenceChunks.length,
      },
    };

    nodes.set('pattern_analysis', patternNode);

    // Create edges from evidence to pattern analysis
    for (const evidenceId of Array.from(nodes.keys()).filter(id => id.startsWith('evidence_'))) {
      edges.push({ from: evidenceId, to: 'pattern_analysis', type: 'supports' });
    }

    // Create generalization node
    const generalizationNode: ReasoningNode = {
      id: 'generalization',
      type: 'conclusion',
      content: this.generateInductiveGeneralization(problem, patterns, evidenceChunks),
      confidence: Math.min(0.8, evidenceChunks.reduce((sum, e) => sum + e.confidence, 0) / evidenceChunks.length),
      dependencies: ['pattern_analysis'],
      supportingEvidence: evidenceChunks,
      metadata: {
        patternsUsed: patterns,
        generalizationType: 'inductive',
      },
    };

    nodes.set('generalization', generalizationNode);
    edges.push({ from: 'pattern_analysis', to: 'generalization', type: 'implies' });

    const overallConfidence = Array.from(nodes.values())
      .reduce((sum, node) => sum + node.confidence, 0) / nodes.size;

    return {
      id: graphId,
      nodes,
      edges,
      root: Array.from(nodes.keys()).find(id => id.startsWith('evidence_')) || 'evidence_0',
      conclusion: generalizationNode.content,
      overallConfidence,
      metadata: {
        strategy: 'inductive',
        nodeCount: nodes.size,
        edgeCount: edges.length,
        patternsFound: patterns.length,
      },
    };
  }

  isApplicable(problem: string, domain: string): boolean {
    const problemLower = problem.toLowerCase();
    return problemLower.includes('pattern') ||
           problemLower.includes('trend') ||
           problemLower.includes('observe') ||
           problemLower.includes('example') ||
           domain === 'business' || domain === 'general';
  }

  private identifyPatterns(evidence: KnowledgeChunk[]): string[] {
    const patterns: string[] = [];
    
    // Analyze keywords for common themes
    const allKeywords = evidence.flatMap(e => e.keywords);
    const keywordFreq = allKeywords.reduce((freq, keyword) => {
      freq[keyword] = (freq[keyword] || 0) + 1;
      return freq;
    }, {} as Record<string, number>);

    const commonKeywords = Object.entries(keywordFreq)
      .filter(([, count]) => count >= 2)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([keyword]) => keyword);

    if (commonKeywords.length > 0) {
      patterns.push(`Recurring themes: ${commonKeywords.join(', ')}`);
    }

    // Analyze confidence levels
    const highConfidenceCount = evidence.filter(e => e.confidence > 0.8).length;
    if (highConfidenceCount > evidence.length * 0.6) {
      patterns.push('High confidence evidence pattern');
    }

    // Domain consistency
    const domains = new Set(evidence.map(e => e.domain));
    if (domains.size === 1) {
      patterns.push(`Consistent domain focus: ${Array.from(domains)[0]}`);
    } else if (domains.size > 1) {
      patterns.push(`Cross-domain insights: ${Array.from(domains).join(', ')}`);
    }

    return patterns;
  }

  private generateInductiveGeneralization(
    problem: string,
    patterns: string[],
    evidence: KnowledgeChunk[]
  ): string {
    const patternSummary = patterns.length > 0 ? patterns.join('; ') : 'varied evidence patterns';
    const avgConfidence = evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length;
    
    return `Inductive analysis of "${problem}" reveals ${patternSummary}. Based on ${evidence.length} evidence sources with average confidence ${(avgConfidence * 100).toFixed(1)}%, the generalized insight suggests systematic patterns that can inform broader understanding.`;
  }
}

export class AbductiveReasoningStrategy implements ReasoningStrategy {
  name = 'abductive';
  description = 'Inference to the best explanation from incomplete information';

  async apply(problem: string, context: KnowledgeContext): Promise<ReasoningGraph> {
    const graphId = `abductive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nodes = new Map<string, ReasoningNode>();
    const edges: Array<{ from: string; to: string; type: 'supports' | 'contradicts' | 'requires' | 'implies' }> = [];

    // Create observation node from the problem
    const observationNode: ReasoningNode = {
      id: 'observation',
      type: 'premise',
      content: `Observed phenomenon: ${problem}`,
      confidence: 0.9,
      dependencies: [],
      supportingEvidence: [],
      metadata: {
        type: 'observation',
        originalProblem: problem,
      },
    };

    nodes.set('observation', observationNode);

    // Generate multiple hypotheses
    const hypotheses = this.generateHypotheses(problem, context);
    
    for (let i = 0; i < hypotheses.length; i++) {
      const hypothesis = hypotheses[i];
      const nodeId = `hypothesis_${i}`;
      
      nodes.set(nodeId, {
        id: nodeId,
        type: 'assumption',
        content: hypothesis.explanation,
        confidence: hypothesis.plausibility,
        dependencies: ['observation'],
        supportingEvidence: hypothesis.supportingEvidence,
        metadata: {
          ranking: i + 1,
          explanatoryPower: hypothesis.explanatoryPower,
        },
      });

      edges.push({ from: 'observation', to: nodeId, type: 'requires' });
    }

    // Select best explanation
    const bestHypothesis = hypotheses[0]; // Assume sorted by quality
    const bestExplanationNode: ReasoningNode = {
      id: 'best_explanation',
      type: 'conclusion',
      content: `Best explanation: ${bestHypothesis.explanation}`,
      confidence: bestHypothesis.plausibility,
      dependencies: ['hypothesis_0'],
      supportingEvidence: bestHypothesis.supportingEvidence,
      metadata: {
        selectionCriteria: ['explanatory power', 'plausibility', 'evidence support'],
        alternativeCount: hypotheses.length - 1,
      },
    };

    nodes.set('best_explanation', bestExplanationNode);
    edges.push({ from: 'hypothesis_0', to: 'best_explanation', type: 'implies' });

    const overallConfidence = Array.from(nodes.values())
      .reduce((sum, node) => sum + node.confidence, 0) / nodes.size;

    return {
      id: graphId,
      nodes,
      edges,
      root: 'observation',
      conclusion: bestExplanationNode.content,
      overallConfidence,
      metadata: {
        strategy: 'abductive',
        hypothesesGenerated: hypotheses.length,
        bestExplanationRanking: 1,
      },
    };
  }

  isApplicable(problem: string, domain: string): boolean {
    const problemLower = problem.toLowerCase();
    return problemLower.includes('why') ||
           problemLower.includes('explain') ||
           problemLower.includes('cause') ||
           problemLower.includes('reason') ||
           problemLower.includes('mystery') ||
           problemLower.includes('unexpected');
  }

  private generateHypotheses(problem: string, context: KnowledgeContext): Array<{
    explanation: string;
    plausibility: number;
    explanatoryPower: number;
    supportingEvidence: KnowledgeChunk[];
  }> {
    const hypotheses = [];

    // Hypothesis 1: Domain-specific explanation
    if (context.relevantChunks.length > 0) {
      const topChunk = context.relevantChunks[0];
      hypotheses.push({
        explanation: `Domain-specific explanation based on ${context.domainInfo.name} principles: ${topChunk.summary}`,
        plausibility: topChunk.confidence * 0.9,
        explanatoryPower: 0.8,
        supportingEvidence: [topChunk],
      });
    }

    // Hypothesis 2: Pattern-based explanation
    const keywords = context.relevantChunks.flatMap(c => c.keywords).slice(0, 5);
    if (keywords.length > 0) {
      hypotheses.push({
        explanation: `Pattern-based explanation involving key factors: ${keywords.join(', ')}`,
        plausibility: 0.7,
        explanatoryPower: 0.6,
        supportingEvidence: context.relevantChunks.slice(0, 2),
      });
    }

    // Hypothesis 3: General explanation
    hypotheses.push({
      explanation: `General systematic explanation based on available evidence and reasoning principles`,
      plausibility: 0.5,
      explanatoryPower: 0.4,
      supportingEvidence: context.relevantChunks.slice(0, 1),
    });

    // Sort by combined score (plausibility * explanatory power)
    return hypotheses.sort((a, b) => (b.plausibility * b.explanatoryPower) - (a.plausibility * a.explanatoryPower));
  }
}

export class MultiStepReasoningEngine {
  private embeddingService: EmbeddingService;
  private domainOrganizer: DomainKnowledgeOrganizer;
  private strategies: Map<string, ReasoningStrategy> = new Map();
  private reasoningChains: Map<string, ReasoningChain> = new Map();

  constructor(embeddingService: EmbeddingService, domainOrganizer: DomainKnowledgeOrganizer) {
    this.embeddingService = embeddingService;
    this.domainOrganizer = domainOrganizer;
    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    const strategies = [
      new DeductiveReasoningStrategy(),
      new InductiveReasoningStrategy(),
      new AbductiveReasoningStrategy(),
    ];

    for (const strategy of strategies) {
      this.strategies.set(strategy.name, strategy);
    }

    logger.info('Initialized reasoning strategies', {
      strategies: Array.from(this.strategies.keys()),
    });
  }

  async executeReasoningChain(
    problem: string,
    options: {
      domain?: string;
      strategy?: string;
      maxSteps?: number;
      enableVerification?: boolean;
      requireHighConfidence?: boolean;
    } = {}
  ): Promise<ReasoningChain> {
    const {
      domain,
      strategy,
      maxSteps = 10,
      enableVerification = true,
      requireHighConfidence = false,
    } = options;

    const startTime = Date.now();
    const chainId = `chain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Get knowledge context
      const context = await this.domainOrganizer.getKnowledgeContext(problem, domain);

      // Select reasoning strategy
      const selectedStrategy = strategy ? 
        this.strategies.get(strategy) : 
        this.selectBestStrategy(problem, context.domain);

      if (!selectedStrategy) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: `Reasoning strategy not found: ${strategy}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'executeReasoningChain', strategy },
        });
      }

      // Build reasoning graph
      const reasoningGraph = await selectedStrategy.apply(problem, context);

      // Execute reasoning steps
      const steps = await this.generateReasoningSteps(problem, context, reasoningGraph, maxSteps);

      // Validate reasoning chain
      const validationResults = enableVerification ? 
        await this.validateReasoningChain(steps, context) : 
        [];

      // Check confidence requirement
      if (requireHighConfidence && reasoningGraph.overallConfidence < 0.7) {
        throw new MCPError({
          code: ErrorCode.VALIDATION_ERROR,
          message: `Reasoning confidence ${reasoningGraph.overallConfidence.toFixed(2)} below required threshold 0.7`,
          severity: ErrorSeverity.MEDIUM,
          retryable: true,
          context: { operation: 'executeReasoningChain', confidence: reasoningGraph.overallConfidence },
        });
      }

      const executionTime = Date.now() - startTime;

      const reasoningChain: ReasoningChain = {
        id: chainId,
        problem,
        domain: context.domain,
        strategy: selectedStrategy.name,
        steps,
        reasoningGraph,
        finalConclusion: reasoningGraph.conclusion,
        overallConfidence: reasoningGraph.overallConfidence,
        validationResults,
        executionTime,
        metadata: {
          knowledgeChunksUsed: context.relevantChunks.length,
          domainInfo: context.domainInfo.name,
          stepsGenerated: steps.length,
          enabledVerification: enableVerification,
        },
      };

      this.reasoningChains.set(chainId, reasoningChain);

      logger.info('Reasoning chain executed successfully', {
        chainId,
        problem: problem.substring(0, 100),
        strategy: selectedStrategy.name,
        confidence: reasoningGraph.overallConfidence,
        stepsCount: steps.length,
        executionTime,
      });

      return reasoningChain;
    } catch (error) {
      logger.error('Failed to execute reasoning chain', { error, problem: problem.substring(0, 100) });
      throw error;
    }
  }

  private selectBestStrategy(problem: string, domain: string): ReasoningStrategy | undefined {
    // Score each strategy based on applicability
    const strategyScores = new Map<string, number>();

    for (const [name, strategy] of this.strategies) {
      const score = strategy.isApplicable(problem, domain) ? 1.0 : 0.5;
      strategyScores.set(name, score);
    }

    // Select strategy with highest score
    const bestStrategy = Array.from(strategyScores.entries())
      .sort(([, a], [, b]) => b - a)[0];

    return bestStrategy ? this.strategies.get(bestStrategy[0]) : this.strategies.get('deductive');
  }

  private async generateReasoningSteps(
    problem: string,
    context: KnowledgeContext,
    graph: ReasoningGraph,
    maxSteps: number
  ): Promise<ReasoningStep[]> {
    const steps: ReasoningStep[] = [];

    // Step 1: Problem analysis
    steps.push({
      id: `step_1`,
      stepNumber: 1,
      type: 'analysis',
      description: 'Analyze the problem and identify key components',
      input: problem,
      output: {
        problemType: this.classifyProblem(problem),
        keyComponents: this.extractKeyComponents(problem),
        domainAlignment: context.domainInfo.name,
      },
      reasoning: `Problem analyzed within ${context.domainInfo.name} domain with ${context.relevantChunks.length} relevant knowledge sources`,
      confidence: 0.8,
      evidenceUsed: context.relevantChunks.slice(0, 2),
      metadata: {
        domain: context.domain,
        analysisType: 'structural',
      },
    });

    // Step 2: Knowledge integration
    steps.push({
      id: `step_2`,
      stepNumber: 2,
      type: 'synthesis',
      description: 'Integrate relevant domain knowledge',
      input: steps[0].output,
      output: {
        integratedKnowledge: context.relevantChunks.map(c => ({
          summary: c.summary,
          confidence: c.confidence,
          relevance: c.confidence,
        })),
        synthesisResults: 'Domain knowledge successfully integrated into reasoning framework',
      },
      reasoning: `Synthesized ${context.relevantChunks.length} knowledge chunks with average confidence ${
        (context.relevantChunks.reduce((sum, c) => sum + c.confidence, 0) / context.relevantChunks.length).toFixed(2)
      }`,
      confidence: context.confidence,
      evidenceUsed: context.relevantChunks,
      metadata: {
        synthesisMethod: 'weighted_integration',
        chunkCount: context.relevantChunks.length,
      },
    });

    // Step 3: Reasoning graph application
    steps.push({
      id: `step_3`,
      stepNumber: 3,
      type: 'application',
      description: `Apply ${graph.metadata.strategy} reasoning strategy`,
      input: steps[1].output,
      output: {
        strategyApplied: graph.metadata.strategy,
        reasoningNodes: graph.nodes.size,
        logicalConnections: graph.edges.length,
        intermediateConclusions: Array.from(graph.nodes.values())
          .filter(n => n.type === 'inference' || n.type === 'conclusion')
          .map(n => ({ content: n.content, confidence: n.confidence })),
      },
      reasoning: `Applied ${graph.metadata.strategy} strategy creating ${graph.nodes.size} reasoning nodes with ${graph.edges.length} logical connections`,
      confidence: graph.overallConfidence,
      evidenceUsed: context.relevantChunks.slice(0, 3),
      metadata: {
        strategy: graph.metadata.strategy,
        graphStructure: {
          nodes: graph.nodes.size,
          edges: graph.edges.length,
        },
      },
    });

    // Step 4: Conclusion evaluation
    steps.push({
      id: `step_4`,
      stepNumber: 4,
      type: 'evaluation',
      description: 'Evaluate reasoning quality and draw final conclusion',
      input: steps[2].output,
      output: {
        finalConclusion: graph.conclusion,
        confidenceAssessment: {
          overall: graph.overallConfidence,
          factors: ['evidence_quality', 'logical_consistency', 'domain_alignment'],
        },
        qualityMetrics: {
          evidenceSupport: context.relevantChunks.length,
          logicalCoherence: graph.edges.length / Math.max(graph.nodes.size - 1, 1),
          domainRelevance: context.confidence,
        },
      },
      reasoning: `Evaluated reasoning quality considering evidence support, logical consistency, and domain alignment`,
      confidence: graph.overallConfidence,
      evidenceUsed: context.relevantChunks,
      metadata: {
        evaluationCriteria: ['evidence_quality', 'logical_consistency', 'domain_alignment'],
        finalConfidence: graph.overallConfidence,
      },
    });

    // Add additional steps if needed and within limit
    if (steps.length < maxSteps && graph.overallConfidence < 0.8) {
      steps.push({
        id: `step_${steps.length + 1}`,
        stepNumber: steps.length + 1,
        type: 'evaluation',
        description: 'Identify potential improvements and alternative approaches',
        input: steps[steps.length - 1].output,
        output: {
          improvements: context.suggestions,
          alternatives: context.reasoning,
          confidenceGaps: graph.overallConfidence < 0.7 ? ['insufficient_evidence', 'domain_uncertainty'] : [],
        },
        reasoning: 'Analyzed potential improvements to strengthen reasoning confidence',
        confidence: 0.6,
        evidenceUsed: [],
        metadata: {
          improvementType: 'confidence_enhancement',
          threshold: 0.8,
        },
      });
    }

    return steps;
  }

  private classifyProblem(problem: string): string {
    const problemLower = problem.toLowerCase();
    
    if (problemLower.includes('calculate') || problemLower.includes('compute')) {
      return 'computational';
    } else if (problemLower.includes('analyze') || problemLower.includes('compare')) {
      return 'analytical';
    } else if (problemLower.includes('design') || problemLower.includes('create')) {
      return 'creative';
    } else if (problemLower.includes('explain') || problemLower.includes('why')) {
      return 'explanatory';
    } else if (problemLower.includes('predict') || problemLower.includes('forecast')) {
      return 'predictive';
    } else {
      return 'general';
    }
  }

  private extractKeyComponents(problem: string): string[] {
    const words = problem.toLowerCase().split(/\s+/);
    const keyWords = words.filter(word => 
      word.length > 3 && 
      !['this', 'that', 'with', 'from', 'they', 'them', 'have', 'been', 'will', 'would', 'could', 'should'].includes(word)
    );
    
    return keyWords.slice(0, 5); // Top 5 key components
  }

  private async validateReasoningChain(
    steps: ReasoningStep[],
    context: KnowledgeContext
  ): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    for (const step of steps) {
      const verification = await this.validateReasoningStep(step, context);
      results.push(verification);
      
      // Store verification result in step
      step.verificationResult = verification;
    }

    return results;
  }

  private async validateReasoningStep(
    step: ReasoningStep,
    context: KnowledgeContext
  ): Promise<VerificationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Validate evidence support
    const evidenceSupport = step.evidenceUsed.length > 0 ? 
      step.evidenceUsed.reduce((sum, e) => sum + e.confidence, 0) / step.evidenceUsed.length : 
      0;

    if (evidenceSupport < 0.6) {
      issues.push('Low evidence support');
      suggestions.push('Gather additional supporting evidence');
    }

    // Validate logical consistency
    const logicalConsistency = step.confidence > 0.5 && step.reasoning.length > 10 ? 0.8 : 0.4;
    
    if (logicalConsistency < 0.6) {
      issues.push('Questionable logical consistency');
      suggestions.push('Review reasoning logic and assumptions');
    }

    // Validate domain alignment
    const domainAlignment = context.confidence;
    
    if (domainAlignment < 0.6) {
      issues.push('Poor domain alignment');
      suggestions.push('Seek domain-specific expertise or knowledge');
    }

    const passed = issues.length === 0;
    const overallConfidence = (evidenceSupport + logicalConsistency + domainAlignment) / 3;

    return {
      passed,
      confidence: overallConfidence,
      issues,
      suggestions,
      evidenceSupport,
      logicalConsistency,
      domainAlignment,
    };
  }

  getReasoningChain(chainId: string): ReasoningChain | undefined {
    return this.reasoningChains.get(chainId);
  }

  listReasoningChains(): ReasoningChain[] {
    return Array.from(this.reasoningChains.values());
  }

  getStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }

  async getReasoningStats(): Promise<{
    totalChains: number;
    strategyCounts: Record<string, number>;
    averageConfidence: number;
    averageExecutionTime: number;
    successRate: number;
  }> {
    const chains = Array.from(this.reasoningChains.values());
    
    const strategyCounts = chains.reduce((counts, chain) => {
      counts[chain.strategy] = (counts[chain.strategy] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);

    const averageConfidence = chains.length > 0 ? 
      chains.reduce((sum, c) => sum + c.overallConfidence, 0) / chains.length : 0;

    const averageExecutionTime = chains.length > 0 ? 
      chains.reduce((sum, c) => sum + c.executionTime, 0) / chains.length : 0;

    const successfulChains = chains.filter(c => c.overallConfidence > 0.6).length;
    const successRate = chains.length > 0 ? successfulChains / chains.length : 0;

    return {
      totalChains: chains.length,
      strategyCounts,
      averageConfidence,
      averageExecutionTime,
      successRate,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const embeddingHealth = await this.embeddingService.healthCheck();
      const domainHealth = await this.domainOrganizer.healthCheck();
      const stats = await this.getReasoningStats();

      return {
        healthy: embeddingHealth.healthy && domainHealth.healthy,
        details: {
          embeddingService: embeddingHealth,
          domainOrganizer: domainHealth,
          reasoningEngine: {
            strategiesAvailable: this.strategies.size,
            chainsExecuted: stats.totalChains,
            averageConfidence: stats.averageConfidence,
            successRate: stats.successRate,
          },
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'multi-step-reasoning-engine',
        },
      };
    }
  }
}