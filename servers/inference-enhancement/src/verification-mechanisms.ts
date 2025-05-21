import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { ReasoningChain, ReasoningStep, ReasoningNode, ReasoningGraph, VerificationResult } from './reasoning-engine.js';
import { KnowledgeChunk, KnowledgeContext } from './domain-knowledge.js';

const logger = getLogger('VerificationMechanisms');

export interface VerificationRule {
  id: string;
  name: string;
  description: string;
  category: 'logical' | 'evidential' | 'domain' | 'consistency';
  weight: number;
  isApplicable(step: ReasoningStep, context: VerificationContext): boolean;
  verify(step: ReasoningStep, context: VerificationContext): Promise<RuleVerificationResult>;
}

export interface RuleVerificationResult {
  ruleId: string;
  passed: boolean;
  score: number; // 0-1
  confidence: number; // 0-1
  issues: string[];
  suggestions: string[];
  metadata: Record<string, any>;
}

export interface VerificationContext {
  chain: ReasoningChain;
  knowledgeContext: KnowledgeContext;
  previousSteps: ReasoningStep[];
  domainExperts?: any[];
  constraints?: Record<string, any>;
}

export interface ComprehensiveVerificationResult {
  chainId: string;
  overallScore: number;
  overallConfidence: number;
  passed: boolean;
  categoryScores: Record<string, number>;
  stepResults: Map<string, VerificationResult>;
  ruleResults: RuleVerificationResult[];
  criticalIssues: string[];
  recommendations: string[];
  metadata: Record<string, any>;
}

export class LogicalConsistencyRule implements VerificationRule {
  id = 'logical-consistency';
  name = 'Logical Consistency Verification';
  description = 'Verifies that reasoning steps follow logical principles and avoid contradictions';
  category = 'logical' as const;
  weight = 0.3;

  isApplicable(step: ReasoningStep, context: VerificationContext): boolean {
    return step.type === 'analysis' || step.type === 'synthesis' || step.type === 'application';
  }

  async verify(step: ReasoningStep, context: VerificationContext): Promise<RuleVerificationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 1.0;

    // Check for logical contradictions with previous steps
    const contradictions = this.detectContradictions(step, context.previousSteps);
    if (contradictions.length > 0) {
      issues.push(`Logical contradictions detected: ${contradictions.join(', ')}`);
      score -= 0.4;
      suggestions.push('Review reasoning logic and resolve contradictions');
    }

    // Validate inference validity
    const inferenceScore = this.validateInference(step);
    if (inferenceScore < 0.7) {
      issues.push('Weak logical inference');
      score -= 0.3;
      suggestions.push('Strengthen logical connection between premises and conclusions');
    }

    // Check reasoning chain completeness
    const completenessScore = this.assessCompleteness(step, context.chain);
    if (completenessScore < 0.6) {
      issues.push('Incomplete reasoning chain');
      score -= 0.2;
      suggestions.push('Provide additional intermediate reasoning steps');
    }

    score = Math.max(0, score * inferenceScore * completenessScore);

    return {
      ruleId: this.id,
      passed: score >= 0.6 && issues.length === 0,
      score,
      confidence: 0.8,
      issues,
      suggestions,
      metadata: {
        contradictions: contradictions.length,
        inferenceScore,
        completenessScore,
      },
    };
  }

  private detectContradictions(step: ReasoningStep, previousSteps: ReasoningStep[]): string[] {
    const contradictions: string[] = [];
    const currentClaims = this.extractClaims(step.reasoning);
    
    for (const prevStep of previousSteps) {
      const prevClaims = this.extractClaims(prevStep.reasoning);
      for (const claim of currentClaims) {
        for (const prevClaim of prevClaims) {
          if (this.areContradictory(claim, prevClaim)) {
            contradictions.push(`"${claim}" contradicts previous claim "${prevClaim}"`);
          }
        }
      }
    }

    return contradictions;
  }

  private extractClaims(reasoning: string): string[] {
    // Simplified claim extraction - in practice would use NLP
    const sentences = reasoning.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.map(s => s.trim()).slice(0, 3); // Top 3 claims
  }

  private areContradictory(claim1: string, claim2: string): boolean {
    // Simplified contradiction detection
    const negationWords = ['not', 'never', 'no', 'false', 'incorrect'];
    const claim1Lower = claim1.toLowerCase();
    const claim2Lower = claim2.toLowerCase();
    
    // Check for explicit negations
    const hasNegation1 = negationWords.some(word => claim1Lower.includes(word));
    const hasNegation2 = negationWords.some(word => claim2Lower.includes(word));
    
    if (hasNegation1 !== hasNegation2) {
      // One is negated, check if they refer to similar concepts
      const words1 = claim1Lower.split(/\s+/).filter(w => w.length > 3);
      const words2 = claim2Lower.split(/\s+/).filter(w => w.length > 3);
      const commonWords = words1.filter(w => words2.includes(w));
      return commonWords.length > 2;
    }

    return false;
  }

  private validateInference(step: ReasoningStep): number {
    // Score based on reasoning strength indicators
    let score = 0.5; // Base score
    
    const reasoning = step.reasoning.toLowerCase();
    
    // Positive indicators
    if (reasoning.includes('therefore') || reasoning.includes('thus') || reasoning.includes('consequently')) {
      score += 0.2;
    }
    if (reasoning.includes('because') || reasoning.includes('since') || reasoning.includes('given that')) {
      score += 0.2;
    }
    if (step.evidenceUsed.length > 0) {
      score += 0.1;
    }

    // Negative indicators
    if (reasoning.includes('maybe') || reasoning.includes('possibly') || reasoning.includes('might')) {
      score -= 0.1;
    }

    return Math.min(1.0, Math.max(0, score));
  }

  private assessCompleteness(step: ReasoningStep, chain: ReasoningChain): number {
    // Assess if reasoning step adequately addresses the problem component
    const stepWords = step.reasoning.toLowerCase().split(/\s+/);
    const problemWords = chain.problem.toLowerCase().split(/\s+/);
    
    const relevantWords = problemWords.filter(w => w.length > 3);
    const addressedWords = relevantWords.filter(w => stepWords.includes(w));
    
    return relevantWords.length > 0 ? addressedWords.length / relevantWords.length : 0.5;
  }
}

export class EvidentialSupportRule implements VerificationRule {
  id = 'evidential-support';
  name = 'Evidential Support Verification';
  description = 'Verifies that reasoning steps are adequately supported by evidence';
  category = 'evidential' as const;
  weight = 0.35;

  isApplicable(step: ReasoningStep): boolean {
    return true; // All steps should have some evidence support
  }

  async verify(step: ReasoningStep, context: VerificationContext): Promise<RuleVerificationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 1.0;

    // Check evidence quantity
    const evidenceCount = step.evidenceUsed.length;
    if (evidenceCount === 0) {
      issues.push('No supporting evidence provided');
      score -= 0.5;
      suggestions.push('Provide supporting evidence from knowledge base');
    } else if (evidenceCount < 2 && step.type !== 'evaluation') {
      issues.push('Insufficient evidence support');
      score -= 0.2;
      suggestions.push('Add additional supporting evidence');
    }

    // Check evidence quality
    const evidenceQuality = this.assessEvidenceQuality(step.evidenceUsed);
    if (evidenceQuality < 0.6) {
      issues.push('Low quality evidence');
      score -= 0.3;
      suggestions.push('Seek higher quality evidence sources');
    }

    // Check evidence relevance
    const evidenceRelevance = this.assessEvidenceRelevance(step, step.evidenceUsed);
    if (evidenceRelevance < 0.7) {
      issues.push('Evidence not directly relevant');
      score -= 0.2;
      suggestions.push('Ensure evidence directly supports the reasoning step');
    }

    // Check evidence consistency
    const evidenceConsistency = this.assessEvidenceConsistency(step.evidenceUsed);
    if (evidenceConsistency < 0.6) {
      issues.push('Inconsistent evidence');
      score -= 0.3;
      suggestions.push('Resolve inconsistencies in evidence');
    }

    score = Math.max(0, score * evidenceQuality * evidenceRelevance * evidenceConsistency);

    return {
      ruleId: this.id,
      passed: score >= 0.7 && issues.length <= 1,
      score,
      confidence: 0.9,
      issues,
      suggestions,
      metadata: {
        evidenceCount,
        evidenceQuality,
        evidenceRelevance,
        evidenceConsistency,
      },
    };
  }

  private assessEvidenceQuality(evidence: KnowledgeChunk[]): number {
    if (evidence.length === 0) return 0;
    
    return evidence.reduce((sum, chunk) => sum + chunk.confidence, 0) / evidence.length;
  }

  private assessEvidenceRelevance(step: ReasoningStep, evidence: KnowledgeChunk[]): number {
    if (evidence.length === 0) return 0;

    const stepKeywords = this.extractKeywords(step.reasoning);
    let totalRelevance = 0;

    for (const chunk of evidence) {
      const chunkKeywords = chunk.keywords;
      const commonKeywords = stepKeywords.filter(k => chunkKeywords.includes(k));
      const relevance = chunkKeywords.length > 0 ? commonKeywords.length / chunkKeywords.length : 0;
      totalRelevance += relevance;
    }

    return evidence.length > 0 ? totalRelevance / evidence.length : 0;
  }

  private assessEvidenceConsistency(evidence: KnowledgeChunk[]): number {
    if (evidence.length <= 1) return 1.0;

    // Check domain consistency
    const domains = evidence.map(e => e.domain);
    const uniqueDomains = new Set(domains);
    const domainConsistency = uniqueDomains.size === 1 ? 1.0 : 0.8;

    // Check confidence variance
    const confidences = evidence.map(e => e.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const variance = confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidences.length;
    const confidenceConsistency = variance < 0.1 ? 1.0 : Math.max(0.5, 1.0 - variance);

    return (domainConsistency + confidenceConsistency) / 2;
  }

  private extractKeywords(text: string): string[] {
    return text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3 && !/^(the|and|for|are|but|not|you|all|can|had|her|was|one|our|out|day|get|has|him|his|how|its|may|new|now|old|see|two|way|who|boy|did|does|each|from|have|here|just|like|make|most|over|said|some|time|very|what|with|would|your|come|could|first|into|look|many|more|only|other|such|take|than|them|well|were)$/.test(word))
      .slice(0, 10);
  }
}

export class DomainAlignmentRule implements VerificationRule {
  id = 'domain-alignment';
  name = 'Domain Alignment Verification';
  description = 'Verifies that reasoning aligns with domain-specific principles and conventions';
  category = 'domain' as const;
  weight = 0.25;

  isApplicable(step: ReasoningStep, context: VerificationContext): boolean {
    return context.knowledgeContext.domain !== 'general';
  }

  async verify(step: ReasoningStep, context: VerificationContext): Promise<RuleVerificationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 1.0;

    const domain = context.knowledgeContext.domain;
    const domainInfo = context.knowledgeContext.domainInfo;

    // Check domain vocabulary usage
    const vocabularyScore = this.assessDomainVocabulary(step, domainInfo);
    if (vocabularyScore < 0.5) {
      issues.push('Limited use of domain-specific vocabulary');
      score -= 0.2;
      suggestions.push(`Incorporate more ${domain} domain terminology`);
    }

    // Check adherence to domain principles
    const principleScore = this.assessDomainPrinciples(step, domain);
    if (principleScore < 0.6) {
      issues.push('Reasoning may not align with domain principles');
      score -= 0.3;
      suggestions.push(`Ensure reasoning follows ${domain} domain principles`);
    }

    // Check methodological appropriateness
    const methodScore = this.assessMethodologicalFit(step, domain);
    if (methodScore < 0.7) {
      issues.push('Reasoning method may not be appropriate for domain');
      score -= 0.2;
      suggestions.push(`Consider domain-appropriate reasoning methods for ${domain}`);
    }

    score = Math.max(0, score * vocabularyScore * principleScore * methodScore);

    return {
      ruleId: this.id,
      passed: score >= 0.6,
      score,
      confidence: 0.7,
      issues,
      suggestions,
      metadata: {
        domain,
        vocabularyScore,
        principleScore,
        methodScore,
      },
    };
  }

  private assessDomainVocabulary(step: ReasoningStep, domainInfo: any): number {
    const stepText = step.reasoning.toLowerCase();
    const domainKeywords = domainInfo.characteristics?.keywords || [];
    
    if (domainKeywords.length === 0) return 0.8; // Default when no domain keywords available

    const matchingKeywords = domainKeywords.filter((keyword: string) => 
      stepText.includes(keyword.toLowerCase())
    );

    return domainKeywords.length > 0 ? matchingKeywords.length / domainKeywords.length : 0.8;
  }

  private assessDomainPrinciples(step: ReasoningStep, domain: string): number {
    const reasoning = step.reasoning.toLowerCase();
    
    switch (domain) {
      case 'science':
        return this.assessScientificPrinciples(reasoning);
      case 'technology':
        return this.assessTechnicalPrinciples(reasoning);
      case 'business':
        return this.assessBusinessPrinciples(reasoning);
      default:
        return 0.8; // Default score for general domain
    }
  }

  private assessScientificPrinciples(reasoning: string): number {
    let score = 0.5;
    
    // Look for scientific method indicators
    if (reasoning.includes('hypothesis') || reasoning.includes('theory') || reasoning.includes('evidence')) {
      score += 0.2;
    }
    if (reasoning.includes('experiment') || reasoning.includes('observation') || reasoning.includes('data')) {
      score += 0.2;
    }
    if (reasoning.includes('analysis') || reasoning.includes('correlation') || reasoning.includes('causation')) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  private assessTechnicalPrinciples(reasoning: string): number {
    let score = 0.5;
    
    // Look for technical analysis indicators
    if (reasoning.includes('system') || reasoning.includes('process') || reasoning.includes('architecture')) {
      score += 0.2;
    }
    if (reasoning.includes('performance') || reasoning.includes('optimization') || reasoning.includes('implementation')) {
      score += 0.2;
    }
    if (reasoning.includes('requirement') || reasoning.includes('specification') || reasoning.includes('design')) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  private assessBusinessPrinciples(reasoning: string): number {
    let score = 0.5;
    
    // Look for business analysis indicators
    if (reasoning.includes('strategy') || reasoning.includes('market') || reasoning.includes('customer')) {
      score += 0.2;
    }
    if (reasoning.includes('value') || reasoning.includes('cost') || reasoning.includes('benefit')) {
      score += 0.2;
    }
    if (reasoning.includes('risk') || reasoning.includes('opportunity') || reasoning.includes('competitive')) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  private assessMethodologicalFit(step: ReasoningStep, domain: string): number {
    const stepType = step.type;
    
    // Domain-specific methodological preferences
    const domainPreferences: Record<string, string[]> = {
      science: ['analysis', 'evaluation'],
      technology: ['application', 'synthesis'],
      business: ['evaluation', 'analysis'],
      general: ['analysis', 'synthesis', 'evaluation', 'application'],
    };

    const preferredTypes = domainPreferences[domain] || domainPreferences.general;
    return preferredTypes.includes(stepType) ? 0.9 : 0.6;
  }
}

export class ConsistencyRule implements VerificationRule {
  id = 'step-consistency';
  name = 'Step Consistency Verification';
  description = 'Verifies consistency between reasoning steps in the chain';
  category = 'consistency' as const;
  weight = 0.1;

  isApplicable(step: ReasoningStep, context: VerificationContext): boolean {
    return context.previousSteps.length > 0;
  }

  async verify(step: ReasoningStep, context: VerificationContext): Promise<RuleVerificationResult> {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 1.0;

    // Check confidence consistency
    const confidenceConsistency = this.assessConfidenceConsistency(step, context.previousSteps);
    if (confidenceConsistency < 0.6) {
      issues.push('Confidence levels inconsistent with previous steps');
      score -= 0.3;
      suggestions.push('Review confidence assessment for consistency');
    }

    // Check output-input consistency
    const ioConsistency = this.assessInputOutputConsistency(step, context.previousSteps);
    if (ioConsistency < 0.7) {
      issues.push('Step input does not properly build on previous outputs');
      score -= 0.4;
      suggestions.push('Ensure step inputs properly reference previous step outputs');
    }

    // Check reasoning flow consistency
    const flowConsistency = this.assessReasoningFlow(step, context.previousSteps);
    if (flowConsistency < 0.5) {
      issues.push('Reasoning flow is disjointed');
      score -= 0.3;
      suggestions.push('Improve logical flow between reasoning steps');
    }

    score = Math.max(0, score * confidenceConsistency * ioConsistency * flowConsistency);

    return {
      ruleId: this.id,
      passed: score >= 0.7,
      score,
      confidence: 0.8,
      issues,
      suggestions,
      metadata: {
        confidenceConsistency,
        ioConsistency,
        flowConsistency,
      },
    };
  }

  private assessConfidenceConsistency(step: ReasoningStep, previousSteps: ReasoningStep[]): number {
    if (previousSteps.length === 0) return 1.0;

    const currentConfidence = step.confidence;
    const prevConfidences = previousSteps.map(s => s.confidence);
    const avgPrevConfidence = prevConfidences.reduce((a, b) => a + b, 0) / prevConfidences.length;

    // Confidence should generally maintain or decrease slightly due to uncertainty accumulation
    const expectedRange = [avgPrevConfidence - 0.2, avgPrevConfidence + 0.1];
    
    if (currentConfidence >= expectedRange[0] && currentConfidence <= expectedRange[1]) {
      return 1.0;
    } else {
      const deviation = Math.min(
        Math.abs(currentConfidence - expectedRange[0]),
        Math.abs(currentConfidence - expectedRange[1])
      );
      return Math.max(0, 1.0 - deviation);
    }
  }

  private assessInputOutputConsistency(step: ReasoningStep, previousSteps: ReasoningStep[]): number {
    if (previousSteps.length === 0) return 1.0;

    const lastStep = previousSteps[previousSteps.length - 1];
    const stepInput = JSON.stringify(step.input || {});
    const lastOutput = JSON.stringify(lastStep.output || {});

    // Check if current step input references previous step output
    const hasReference = this.hasOutputReference(stepInput, lastOutput);
    
    return hasReference ? 1.0 : 0.5;
  }

  private hasOutputReference(currentInput: string, previousOutput: string): boolean {
    // Simplified check - in practice would be more sophisticated
    try {
      const inputObj = JSON.parse(currentInput);
      const outputObj = JSON.parse(previousOutput);
      
      // Check if any input fields reference output fields
      const inputKeys = Object.keys(inputObj);
      const outputKeys = Object.keys(outputObj);
      
      return inputKeys.some(key => outputKeys.includes(key)) || 
             outputKeys.some(key => currentInput.includes(key));
    } catch {
      // If parsing fails, check string similarity
      return currentInput.length > 0 && previousOutput.length > 0 &&
             this.calculateStringSimilarity(currentInput, previousOutput) > 0.2;
    }
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = str1.toLowerCase().split(/\s+/);
    const words2 = str2.toLowerCase().split(/\s+/);
    const commonWords = words1.filter(w => words2.includes(w));
    
    return Math.max(words1.length, words2.length) > 0 ? 
      commonWords.length / Math.max(words1.length, words2.length) : 0;
  }

  private assessReasoningFlow(step: ReasoningStep, previousSteps: ReasoningStep[]): number {
    // Assess if step types follow logical progression
    const typeProgression = previousSteps.map(s => s.type).concat(step.type);
    
    // Define ideal progressions
    const idealProgressions = [
      ['analysis', 'synthesis', 'application', 'evaluation'],
      ['analysis', 'application', 'evaluation'],
      ['synthesis', 'application', 'evaluation'],
    ];

    // Find best matching progression
    let bestMatch = 0;
    for (const ideal of idealProgressions) {
      const match = this.calculateProgressionMatch(typeProgression, ideal);
      bestMatch = Math.max(bestMatch, match);
    }

    return bestMatch;
  }

  private calculateProgressionMatch(actual: string[], ideal: string[]): number {
    let matches = 0;
    let idealIndex = 0;

    for (const actualType of actual) {
      if (idealIndex < ideal.length && actualType === ideal[idealIndex]) {
        matches++;
        idealIndex++;
      }
    }

    return ideal.length > 0 ? matches / ideal.length : 0;
  }
}

export class VerificationEngine {
  private rules: Map<string, VerificationRule> = new Map();

  constructor() {
    this.initializeRules();
  }

  private initializeRules(): void {
    const rules = [
      new LogicalConsistencyRule(),
      new EvidentialSupportRule(),
      new DomainAlignmentRule(),
      new ConsistencyRule(),
    ];

    for (const rule of rules) {
      this.rules.set(rule.id, rule);
    }

    logger.info('Initialized verification rules', {
      rules: Array.from(this.rules.keys()),
    });
  }

  async comprehensiveVerification(
    chain: ReasoningChain,
    knowledgeContext: KnowledgeContext
  ): Promise<ComprehensiveVerificationResult> {
    const startTime = Date.now();
    
    try {
      const stepResults = new Map<string, VerificationResult>();
      const ruleResults: RuleVerificationResult[] = [];
      const categoryScores: Record<string, number> = {};
      const criticalIssues: string[] = [];
      const recommendations: string[] = [];

      // Verify each step
      for (let i = 0; i < chain.steps.length; i++) {
        const step = chain.steps[i];
        const previousSteps = chain.steps.slice(0, i);
        
        const context: VerificationContext = {
          chain,
          knowledgeContext,
          previousSteps,
        };

        const stepResult = await this.verifyStep(step, context);
        stepResults.set(step.id, stepResult);
        
        // Collect rule results
        ruleResults.push(...stepResult.ruleResults);
        
        // Identify critical issues
        if (!stepResult.passed) {
          criticalIssues.push(`Step ${step.stepNumber}: ${stepResult.issues.join(', ')}`);
        }
        
        // Collect recommendations
        recommendations.push(...stepResult.suggestions);
      }

      // Calculate category scores
      const categories = ['logical', 'evidential', 'domain', 'consistency'];
      for (const category of categories) {
        const categoryRules = ruleResults.filter(r => {
          const rule = this.rules.get(r.ruleId);
          return rule?.category === category;
        });
        
        if (categoryRules.length > 0) {
          categoryScores[category] = categoryRules.reduce((sum, r) => sum + r.score, 0) / categoryRules.length;
        } else {
          categoryScores[category] = 1.0;
        }
      }

      // Calculate overall scores
      const overallScore = this.calculateOverallScore(ruleResults);
      const overallConfidence = this.calculateOverallConfidence(ruleResults);
      const passed = overallScore >= 0.7 && criticalIssues.length === 0;

      const result: ComprehensiveVerificationResult = {
        chainId: chain.id,
        overallScore,
        overallConfidence,
        passed,
        categoryScores,
        stepResults,
        ruleResults,
        criticalIssues,
        recommendations: [...new Set(recommendations)], // Remove duplicates
        metadata: {
          verificationTime: Date.now() - startTime,
          rulesApplied: ruleResults.length,
          stepsVerified: chain.steps.length,
          domain: knowledgeContext.domain,
        },
      };

      logger.info('Comprehensive verification completed', {
        chainId: chain.id,
        overallScore,
        passed,
        criticalIssues: criticalIssues.length,
        executionTime: result.metadata.verificationTime,
      });

      return result;
    } catch (error) {
      logger.error('Comprehensive verification failed', { error, chainId: chain.id });
      throw error;
    }
  }

  private async verifyStep(
    step: ReasoningStep,
    context: VerificationContext
  ): Promise<VerificationResult> {
    const ruleResults: RuleVerificationResult[] = [];
    const issues: string[] = [];
    const suggestions: string[] = [];

    // Apply all applicable rules
    for (const rule of this.rules.values()) {
      if (rule.isApplicable(step, context)) {
        try {
          const result = await rule.verify(step, context);
          ruleResults.push(result);
          
          if (!result.passed) {
            issues.push(...result.issues);
            suggestions.push(...result.suggestions);
          }
        } catch (error) {
          logger.error('Rule verification failed', { rule: rule.id, step: step.id, error });
          // Continue with other rules
        }
      }
    }

    // Calculate weighted scores
    const weightedScore = this.calculateWeightedScore(ruleResults);
    const confidence = this.calculateStepConfidence(ruleResults);

    return {
      passed: weightedScore >= 0.7 && issues.length === 0,
      confidence,
      issues,
      suggestions,
      evidenceSupport: this.calculateEvidenceSupport(step),
      logicalConsistency: this.calculateLogicalConsistency(ruleResults),
      domainAlignment: this.calculateDomainAlignment(ruleResults),
      ruleResults,
    };
  }

  private calculateWeightedScore(results: RuleVerificationResult[]): number {
    if (results.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const result of results) {
      const rule = this.rules.get(result.ruleId);
      if (rule) {
        weightedSum += result.score * rule.weight;
        totalWeight += rule.weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private calculateStepConfidence(results: RuleVerificationResult[]): number {
    if (results.length === 0) return 0;
    
    return results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  }

  private calculateEvidenceSupport(step: ReasoningStep): number {
    return step.evidenceUsed.length > 0 ? 
      step.evidenceUsed.reduce((sum, e) => sum + e.confidence, 0) / step.evidenceUsed.length : 0;
  }

  private calculateLogicalConsistency(results: RuleVerificationResult[]): number {
    const logicalRule = results.find(r => r.ruleId === 'logical-consistency');
    return logicalRule?.score || 0.5;
  }

  private calculateDomainAlignment(results: RuleVerificationResult[]): number {
    const domainRule = results.find(r => r.ruleId === 'domain-alignment');
    return domainRule?.score || 0.8;
  }

  private calculateOverallScore(results: RuleVerificationResult[]): number {
    if (results.length === 0) return 0;

    let weightedSum = 0;
    let totalWeight = 0;

    for (const result of results) {
      const rule = this.rules.get(result.ruleId);
      if (rule) {
        weightedSum += result.score * rule.weight;
        totalWeight += rule.weight;
      }
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private calculateOverallConfidence(results: RuleVerificationResult[]): number {
    if (results.length === 0) return 0;
    
    return results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  }

  getRules(): VerificationRule[] {
    return Array.from(this.rules.values());
  }

  addRule(rule: VerificationRule): void {
    this.rules.set(rule.id, rule);
    logger.info('Added verification rule', { ruleId: rule.id, category: rule.category });
  }

  removeRule(ruleId: string): boolean {
    const removed = this.rules.delete(ruleId);
    if (removed) {
      logger.info('Removed verification rule', { ruleId });
    }
    return removed;
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const rulesCount = this.rules.size;
      const categories = new Set(Array.from(this.rules.values()).map(r => r.category));

      return {
        healthy: rulesCount > 0,
        details: {
          rulesLoaded: rulesCount,
          categoriesAvailable: Array.from(categories),
          service: 'verification-engine',
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'verification-engine',
        },
      };
    }
  }
}