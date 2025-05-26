import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { ReasoningChain, ReasoningStep } from './reasoning-engine.js';
import { ComprehensiveVerificationResult } from './verification-mechanisms.js';
import { ReasoningPattern } from './reasoning-persistence.js';

const logger = getLogger('AdaptiveLearning');

export interface LearningExample {
  id: string;
  problem: string;
  domain: string;
  correctSolution: any;
  reasoning: ReasoningChain;
  performance: {
    accuracy: number;
    confidence: number;
    executionTime: number;
    verificationScore: number;
  };
  feedback: UserFeedback[];
  metadata: {
    createdAt: Date;
    difficulty: 'easy' | 'medium' | 'hard';
    tags: string[];
    source: 'human' | 'synthetic' | 'pattern';
  };
}

export interface UserFeedback {
  id: string;
  userId?: string;
  type: 'accuracy' | 'clarity' | 'completeness' | 'efficiency' | 'overall';
  rating: number; // 1-5 scale
  comments?: string;
  specific: {
    stepId?: string;
    aspect: string;
    suggestion?: string;
  };
  timestamp: Date;
  weight: number; // Feedback importance weight
}

export interface LearningMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  confidenceCalibration: number;
  learningRate: number;
  improvementTrend: number[];
  domainPerformance: Record<string, number>;
  strategyPerformance: Record<string, number>;
}

export interface AdaptationRule {
  id: string;
  name: string;
  description: string;
  condition: (example: LearningExample, metrics: LearningMetrics) => boolean;
  adaptation: (currentStrategy: any) => any;
  weight: number;
  successCount: number;
  totalApplications: number;
}

export interface LearningObjective {
  metric: string;
  targetValue: number;
  currentValue: number;
  priority: 'high' | 'medium' | 'low';
  strategy: 'maximize' | 'minimize' | 'stabilize';
  constraints?: {
    maxChangePer: number;
    minThreshold?: number;
    maxThreshold?: number;
  };
}

export class AdaptiveLearningEngine {
  private learningExamples: Map<string, LearningExample> = new Map();
  private adaptationRules: Map<string, AdaptationRule> = new Map();
  private learningObjectives: Map<string, LearningObjective> = new Map();
  private performanceHistory: LearningMetrics[] = [];
  private adaptationHistory: Array<{
    timestamp: Date;
    rule: string;
    before: any;
    after: any;
    performance: LearningMetrics;
  }> = [];

  constructor() {
    this.initializeAdaptationRules();
    this.initializeLearningObjectives();
  }

  private initializeAdaptationRules(): void {
    const rules: AdaptationRule[] = [
      {
        id: 'low-confidence-adaptation',
        name: 'Low Confidence Strategy Adaptation',
        description: 'Adapt strategy when confidence consistently falls below threshold',
        condition: (example, metrics) => metrics.confidenceCalibration < 0.6,
        adaptation: (strategy) => ({
          ...strategy,
          evidenceThreshold: Math.max(0.5, (strategy.evidenceThreshold || 0.7) - 0.1),
          verificationLevel: 'enhanced',
          confidenceBoost: true,
        }),
        weight: 0.8,
        successCount: 0,
        totalApplications: 0,
      },
      {
        id: 'accuracy-improvement',
        name: 'Accuracy-Based Parameter Tuning',
        description: 'Adjust parameters to improve accuracy based on feedback',
        condition: (example, metrics) => metrics.accuracy < 0.7,
        adaptation: (strategy) => ({
          ...strategy,
          stepValidation: 'strict',
          evidenceWeight: Math.min(1.0, (strategy.evidenceWeight || 0.8) + 0.1),
          crossValidation: true,
        }),
        weight: 0.9,
        successCount: 0,
        totalApplications: 0,
      },
      {
        id: 'efficiency-optimization',
        name: 'Efficiency Optimization',
        description: 'Optimize for faster execution while maintaining quality',
        condition: (example, metrics) => {
          const avgTime = example.performance.executionTime;
          return avgTime > 30000 && metrics.accuracy > 0.8; // 30 seconds
        },
        adaptation: (strategy) => ({
          ...strategy,
          maxSteps: Math.max(3, (strategy.maxSteps || 5) - 1),
          parallelProcessing: true,
          cacheEnabled: true,
        }),
        weight: 0.6,
        successCount: 0,
        totalApplications: 0,
      },
      {
        id: 'domain-specialization',
        name: 'Domain-Specific Adaptation',
        description: 'Adapt parameters based on domain-specific performance patterns',
        condition: (example, metrics) => {
          const domainPerf = metrics.domainPerformance[example.domain] || 0;
          return domainPerf < metrics.accuracy - 0.15; // Domain significantly underperforming
        },
        adaptation: (strategy) => ({
          ...strategy,
          domainWeights: {
            ...strategy.domainWeights,
            [strategy.currentDomain]: (strategy.domainWeights?.[strategy.currentDomain] || 1.0) + 0.2,
          },
          specializationEnabled: true,
        }),
        weight: 0.7,
        successCount: 0,
        totalApplications: 0,
      },
      {
        id: 'feedback-driven-adaptation',
        name: 'User Feedback Integration',
        description: 'Adapt based on user feedback patterns and ratings',
        condition: (example, metrics) => {
          const avgRating = example.feedback.reduce((sum, f) => sum + f.rating, 0) / Math.max(1, example.feedback.length);
          return avgRating < 3.5 && example.feedback.length >= 2;
        },
        adaptation: (strategy) => {
          const feedbackCategories = example.feedback.reduce((acc, f) => {
            acc[f.type] = (acc[f.type] || 0) + f.rating;
            return acc;
          }, {} as Record<string, number>);
          
          const adaptations: any = { ...strategy };
          
          if (feedbackCategories.clarity && feedbackCategories.clarity < 3) {
            adaptations.explanationDepth = 'detailed';
            adaptations.stepByStepMode = true;
          }
          
          if (feedbackCategories.completeness && feedbackCategories.completeness < 3) {
            adaptations.comprehensiveAnalysis = true;
            adaptations.alternativeConsideration = true;
          }
          
          return adaptations;
        },
        weight: 0.85,
        successCount: 0,
        totalApplications: 0,
      }
    ];

    for (const rule of rules) {
      this.adaptationRules.set(rule.id, rule);
    }

    logger.info('Initialized adaptation rules', {
      rules: this.adaptationRules.size,
      ruleIds: Array.from(this.adaptationRules.keys()),
    });
  }

  private initializeLearningObjectives(): void {
    const objectives: LearningObjective[] = [
      {
        metric: 'accuracy',
        targetValue: 0.85,
        currentValue: 0.7,
        priority: 'high',
        strategy: 'maximize',
        constraints: {
          maxChangePer: 0.1,
          minThreshold: 0.6,
        },
      },
      {
        metric: 'confidenceCalibration',
        targetValue: 0.8,
        currentValue: 0.65,
        priority: 'high',
        strategy: 'maximize',
        constraints: {
          maxChangePer: 0.05,
          minThreshold: 0.5,
        },
      },
      {
        metric: 'executionTime',
        targetValue: 20000, // 20 seconds
        currentValue: 35000, // 35 seconds
        priority: 'medium',
        strategy: 'minimize',
        constraints: {
          maxChangePer: 5000,
          minThreshold: 5000, // Don't go below 5 seconds
        },
      },
      {
        metric: 'userSatisfaction',
        targetValue: 4.0, // out of 5
        currentValue: 3.2,
        priority: 'high',
        strategy: 'maximize',
        constraints: {
          maxChangePer: 0.2,
          minThreshold: 2.0,
        },
      },
      {
        metric: 'learningRate',
        targetValue: 0.1,
        currentValue: 0.05,
        priority: 'medium',
        strategy: 'maximize',
        constraints: {
          maxChangePer: 0.02,
          maxThreshold: 0.3,
        },
      }
    ];

    for (const objective of objectives) {
      this.learningObjectives.set(objective.metric, objective);
    }

    logger.info('Initialized learning objectives', {
      objectives: this.learningObjectives.size,
      metrics: Array.from(this.learningObjectives.keys()),
    });
  }

  async addLearningExample(
    problem: string,
    domain: string,
    correctSolution: any,
    reasoning: ReasoningChain,
    verificationResult?: ComprehensiveVerificationResult,
    feedback: UserFeedback[] = []
  ): Promise<string> {
    try {
      const exampleId = `example_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const example: LearningExample = {
        id: exampleId,
        problem,
        domain,
        correctSolution,
        reasoning,
        performance: {
          accuracy: this.calculateAccuracy(reasoning, correctSolution),
          confidence: reasoning.overallConfidence,
          executionTime: reasoning.executionTime,
          verificationScore: verificationResult?.overallScore || 0,
        },
        feedback,
        metadata: {
          createdAt: new Date(),
          difficulty: this.assessDifficulty(problem, reasoning),
          tags: this.extractTags(problem, domain, reasoning),
          source: 'human',
        },
      };

      this.learningExamples.set(exampleId, example);

      // Trigger learning update
      await this.updateLearningMetrics();
      await this.evaluateAdaptations(example);

      logger.info('Added learning example', {
        exampleId,
        domain,
        accuracy: example.performance.accuracy,
        confidence: example.performance.confidence,
        difficulty: example.metadata.difficulty,
      });

      return exampleId;
    } catch (error) {
      logger.error('Failed to add learning example', { error, problem: problem.substring(0, 100) });
      throw error;
    }
  }

  async updateLearningMetrics(): Promise<LearningMetrics> {
    try {
      const examples = Array.from(this.learningExamples.values());
      
      if (examples.length === 0) {
        const emptyMetrics: LearningMetrics = {
          accuracy: 0,
          precision: 0,
          recall: 0,
          f1Score: 0,
          confidenceCalibration: 0,
          learningRate: 0,
          improvementTrend: [],
          domainPerformance: {},
          strategyPerformance: {},
        };
        return emptyMetrics;
      }

      // Calculate overall metrics
      const accuracy = examples.reduce((sum, e) => sum + e.performance.accuracy, 0) / examples.length;
      const confidence = examples.reduce((sum, e) => sum + e.performance.confidence, 0) / examples.length;
      
      // Calculate precision, recall, F1 score (simplified binary classification)
      const truePositives = examples.filter(e => e.performance.accuracy > 0.8 && e.performance.confidence > 0.7).length;
      const falsePositives = examples.filter(e => e.performance.accuracy <= 0.8 && e.performance.confidence > 0.7).length;
      const falseNegatives = examples.filter(e => e.performance.accuracy > 0.8 && e.performance.confidence <= 0.7).length;
      
      const precision = truePositives / Math.max(1, truePositives + falsePositives);
      const recall = truePositives / Math.max(1, truePositives + falseNegatives);
      const f1Score = 2 * (precision * recall) / Math.max(0.001, precision + recall);

      // Calculate confidence calibration (how well confidence predicts accuracy)
      const confidenceCalibration = this.calculateConfidenceCalibration(examples);

      // Calculate learning rate (improvement over time)
      const learningRate = this.calculateLearningRate(examples);

      // Calculate improvement trend
      const improvementTrend = this.calculateImprovementTrend(examples);

      // Calculate domain-specific performance
      const domainPerformance = this.calculateDomainPerformance(examples);

      // Calculate strategy-specific performance
      const strategyPerformance = this.calculateStrategyPerformance(examples);

      const metrics: LearningMetrics = {
        accuracy,
        precision,
        recall,
        f1Score,
        confidenceCalibration,
        learningRate,
        improvementTrend,
        domainPerformance,
        strategyPerformance,
      };

      this.performanceHistory.push(metrics);
      
      // Update learning objectives with current values
      this.updateObjectiveCurrentValues(metrics);

      logger.debug('Updated learning metrics', {
        accuracy,
        precision,
        recall,
        f1Score,
        confidenceCalibration,
        examplesCount: examples.length,
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to update learning metrics', { error });
      throw error;
    }
  }

  async evaluateAdaptations(newExample: LearningExample): Promise<any[]> {
    try {
      const currentMetrics = await this.updateLearningMetrics();
      const appliedAdaptations: any[] = [];

      for (const rule of this.adaptationRules.values()) {
        if (rule.condition(newExample, currentMetrics)) {
          const currentStrategy = this.getCurrentStrategy(newExample.domain);
          const adaptedStrategy = rule.adaptation(currentStrategy);
          
          // Apply adaptation
          const adaptation = {
            ruleId: rule.id,
            ruleName: rule.name,
            before: currentStrategy,
            after: adaptedStrategy,
            confidence: this.calculateAdaptationConfidence(rule, currentMetrics),
            expectedImprovement: this.estimateImprovement(rule, currentMetrics),
          };

          appliedAdaptations.push(adaptation);
          
          // Update rule statistics
          rule.totalApplications += 1;
          
          // Record adaptation in history
          this.adaptationHistory.push({
            timestamp: new Date(),
            rule: rule.id,
            before: currentStrategy,
            after: adaptedStrategy,
            performance: currentMetrics,
          });

          logger.info('Applied adaptation rule', {
            ruleId: rule.id,
            domain: newExample.domain,
            confidence: adaptation.confidence,
            expectedImprovement: adaptation.expectedImprovement,
          });
        }
      }

      return appliedAdaptations;
    } catch (error) {
      logger.error('Failed to evaluate adaptations', { error });
      throw error;
    }
  }

  async integrateFeedback(exampleId: string, feedback: UserFeedback): Promise<void> {
    try {
      const example = this.learningExamples.get(exampleId);
      if (!example) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: `Learning example not found: ${exampleId}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'integrateFeedback', exampleId },
        });
      }

      // Add feedback to example
      example.feedback.push(feedback);

      // Calculate feedback weight based on consistency and user reliability
      feedback.weight = this.calculateFeedbackWeight(feedback, example);

      // Update performance metrics based on feedback
      this.updatePerformanceFromFeedback(example, feedback);

      // Trigger re-evaluation of adaptations with new feedback
      await this.evaluateAdaptations(example);

      logger.info('Integrated user feedback', {
        exampleId,
        feedbackType: feedback.type,
        rating: feedback.rating,
        weight: feedback.weight,
      });
    } catch (error) {
      logger.error('Failed to integrate feedback', { error, exampleId });
      throw error;
    }
  }

  async generateSyntheticExamples(
    domain: string,
    count: number = 10,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium'
  ): Promise<string[]> {
    try {
      const existingExamples = Array.from(this.learningExamples.values())
        .filter(e => e.domain === domain);

      if (existingExamples.length < 3) {
        throw new MCPError({
          code: ErrorCode.INVALID_PARAMS,
          message: `Need at least 3 existing examples for domain ${domain} to generate synthetic examples`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'generateSyntheticExamples', domain, existingCount: existingExamples.length },
        });
      }

      const syntheticExampleIds: string[] = [];

      for (let i = 0; i < count; i++) {
        const templateExample = existingExamples[Math.floor(Math.random() * existingExamples.length)];
        const syntheticExample = await this.createSyntheticExample(templateExample, difficulty);
        
        this.learningExamples.set(syntheticExample.id, syntheticExample);
        syntheticExampleIds.push(syntheticExample.id);
      }

      logger.info('Generated synthetic examples', {
        domain,
        count: syntheticExampleIds.length,
        difficulty,
        totalExamples: this.learningExamples.size,
      });

      return syntheticExampleIds;
    } catch (error) {
      logger.error('Failed to generate synthetic examples', { error, domain, count });
      throw error;
    }
  }

  private calculateAccuracy(reasoning: ReasoningChain, correctSolution: any): number {
    // Simplified accuracy calculation - in practice would be more sophisticated
    const solutionSimilarity = this.calculateSolutionSimilarity(reasoning.finalConclusion, correctSolution);
    const confidenceAlignment = Math.abs(reasoning.overallConfidence - solutionSimilarity);
    
    // Combine solution similarity with confidence alignment
    return solutionSimilarity * 0.8 + (1 - confidenceAlignment) * 0.2;
  }

  private calculateSolutionSimilarity(conclusion: string, correctSolution: any): number {
    // Simplified similarity calculation
    const conclusionWords = conclusion.toLowerCase().split(/\s+/);
    const solutionWords = String(correctSolution).toLowerCase().split(/\s+/);
    
    const commonWords = conclusionWords.filter(word => solutionWords.includes(word));
    const totalWords = Math.max(conclusionWords.length, solutionWords.length);
    
    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }

  private assessDifficulty(problem: string, reasoning: ReasoningChain): 'easy' | 'medium' | 'hard' {
    const factors = [
      reasoning.steps.length > 5, // Many steps
      reasoning.executionTime > 25000, // Slow execution (25+ seconds)
      reasoning.overallConfidence < 0.7, // Low confidence
      problem.length > 200, // Long problem description
      reasoning.validationResults?.some(r => !r.passed), // Failed validations
    ];

    const difficultyScore = factors.filter(f => f).length;
    
    if (difficultyScore >= 4) return 'hard';
    if (difficultyScore >= 2) return 'medium';
    return 'easy';
  }

  private extractTags(problem: string, domain: string, reasoning: ReasoningChain): string[] {
    const tags: string[] = [];
    
    tags.push(`domain:${domain}`);
    tags.push(`strategy:${reasoning.strategy}`);
    tags.push(`steps:${reasoning.steps.length}`);
    
    const problemLower = problem.toLowerCase();
    
    // Add content-based tags
    if (problemLower.includes('analysis')) tags.push('analytical');
    if (problemLower.includes('design')) tags.push('design');
    if (problemLower.includes('optimization')) tags.push('optimization');
    if (problemLower.includes('comparison')) tags.push('comparative');
    if (problemLower.includes('prediction')) tags.push('predictive');
    
    // Add performance-based tags
    if (reasoning.overallConfidence > 0.8) tags.push('high-confidence');
    if (reasoning.executionTime > 30000) tags.push('complex');
    if (reasoning.steps.length > 5) tags.push('multi-step');
    
    return tags;
  }

  private calculateConfidenceCalibration(examples: LearningExample[]): number {
    if (examples.length === 0) return 0;

    // Group examples by confidence ranges and calculate accuracy within each range
    const ranges = [
      { min: 0.0, max: 0.2 },
      { min: 0.2, max: 0.4 },
      { min: 0.4, max: 0.6 },
      { min: 0.6, max: 0.8 },
      { min: 0.8, max: 1.0 },
    ];

    let totalCalibration = 0;
    let validRanges = 0;

    for (const range of ranges) {
      const rangeExamples = examples.filter(e => 
        e.performance.confidence >= range.min && e.performance.confidence < range.max
      );

      if (rangeExamples.length > 0) {
        const avgConfidence = rangeExamples.reduce((sum, e) => sum + e.performance.confidence, 0) / rangeExamples.length;
        const avgAccuracy = rangeExamples.reduce((sum, e) => sum + e.performance.accuracy, 0) / rangeExamples.length;
        
        // Good calibration means confidence ≈ accuracy
        const calibration = 1 - Math.abs(avgConfidence - avgAccuracy);
        totalCalibration += calibration;
        validRanges++;
      }
    }

    return validRanges > 0 ? totalCalibration / validRanges : 0;
  }

  private calculateLearningRate(examples: LearningExample[]): number {
    if (examples.length < 2) return 0;

    // Sort examples by creation time
    const sortedExamples = examples.sort((a, b) => a.metadata.createdAt.getTime() - b.metadata.createdAt.getTime());
    
    // Calculate improvement in accuracy over time
    const windowSize = Math.min(10, Math.floor(examples.length / 2));
    const earlyExamples = sortedExamples.slice(0, windowSize);
    const recentExamples = sortedExamples.slice(-windowSize);
    
    const earlyAccuracy = earlyExamples.reduce((sum, e) => sum + e.performance.accuracy, 0) / earlyExamples.length;
    const recentAccuracy = recentExamples.reduce((sum, e) => sum + e.performance.accuracy, 0) / recentExamples.length;
    
    return Math.max(0, recentAccuracy - earlyAccuracy);
  }

  private calculateImprovementTrend(examples: LearningExample[]): number[] {
    if (examples.length < 5) return [];

    const sortedExamples = examples.sort((a, b) => a.metadata.createdAt.getTime() - b.metadata.createdAt.getTime());
    const windowSize = 5;
    const trend: number[] = [];

    for (let i = windowSize; i <= sortedExamples.length; i++) {
      const window = sortedExamples.slice(i - windowSize, i);
      const avgAccuracy = window.reduce((sum, e) => sum + e.performance.accuracy, 0) / window.length;
      trend.push(avgAccuracy);
    }

    return trend;
  }

  private calculateDomainPerformance(examples: LearningExample[]): Record<string, number> {
    const domainPerformance: Record<string, number> = {};
    
    const domainGroups = examples.reduce((groups, example) => {
      if (!groups[example.domain]) groups[example.domain] = [];
      groups[example.domain].push(example);
      return groups;
    }, {} as Record<string, LearningExample[]>);

    for (const [domain, domainExamples] of Object.entries(domainGroups)) {
      const avgAccuracy = domainExamples.reduce((sum, e) => sum + e.performance.accuracy, 0) / domainExamples.length;
      domainPerformance[domain] = avgAccuracy;
    }

    return domainPerformance;
  }

  private calculateStrategyPerformance(examples: LearningExample[]): Record<string, number> {
    const strategyPerformance: Record<string, number> = {};
    
    const strategyGroups = examples.reduce((groups, example) => {
      const strategy = example.reasoning.strategy;
      if (!groups[strategy]) groups[strategy] = [];
      groups[strategy].push(example);
      return groups;
    }, {} as Record<string, LearningExample[]>);

    for (const [strategy, strategyExamples] of Object.entries(strategyGroups)) {
      const avgAccuracy = strategyExamples.reduce((sum, e) => sum + e.performance.accuracy, 0) / strategyExamples.length;
      strategyPerformance[strategy] = avgAccuracy;
    }

    return strategyPerformance;
  }

  private updateObjectiveCurrentValues(metrics: LearningMetrics): void {
    // Update objectives with current metric values
    const accuracyObj = this.learningObjectives.get('accuracy');
    if (accuracyObj) accuracyObj.currentValue = metrics.accuracy;

    const confidenceObj = this.learningObjectives.get('confidenceCalibration');
    if (confidenceObj) confidenceObj.currentValue = metrics.confidenceCalibration;

    const learningRateObj = this.learningObjectives.get('learningRate');
    if (learningRateObj) learningRateObj.currentValue = metrics.learningRate;

    // Calculate user satisfaction from feedback
    const examples = Array.from(this.learningExamples.values());
    const allFeedback = examples.flatMap(e => e.feedback);
    if (allFeedback.length > 0) {
      const avgRating = allFeedback.reduce((sum, f) => sum + f.rating, 0) / allFeedback.length;
      const satisfactionObj = this.learningObjectives.get('userSatisfaction');
      if (satisfactionObj) satisfactionObj.currentValue = avgRating;
    }
  }

  private getCurrentStrategy(domain: string): any {
    // Return current strategy parameters - in practice would retrieve from strategy manager
    return {
      evidenceThreshold: 0.7,
      maxSteps: 5,
      verificationLevel: 'standard',
      evidenceWeight: 0.8,
      domainWeights: {},
      currentDomain: domain,
    };
  }

  private calculateAdaptationConfidence(rule: AdaptationRule, metrics: LearningMetrics): number {
    const successRate = rule.totalApplications > 0 ? rule.successCount / rule.totalApplications : 0.5;
    const ruleWeight = rule.weight;
    const metricQuality = (metrics.accuracy + metrics.confidenceCalibration) / 2;
    
    return (successRate * 0.4 + ruleWeight * 0.3 + metricQuality * 0.3);
  }

  private estimateImprovement(rule: AdaptationRule, metrics: LearningMetrics): number {
    // Estimate expected improvement from applying this rule
    const baseImprovement = rule.weight * 0.1; // Base expected improvement
    const metricGap = 1.0 - metrics.accuracy; // Room for improvement
    
    return Math.min(0.3, baseImprovement * metricGap); // Cap at 30% improvement
  }

  private calculateFeedbackWeight(feedback: UserFeedback, example: LearningExample): number {
    let weight = 1.0;
    
    // Adjust weight based on feedback consistency
    const similarFeedback = example.feedback.filter(f => f.type === feedback.type);
    if (similarFeedback.length > 0) {
      const avgRating = similarFeedback.reduce((sum, f) => sum + f.rating, 0) / similarFeedback.length;
      const consistency = 1 - Math.abs(feedback.rating - avgRating) / 4; // 4 is max rating difference
      weight *= consistency;
    }
    
    // Adjust weight based on feedback specificity
    if (feedback.specific.stepId || feedback.comments) {
      weight *= 1.2; // Boost weight for specific feedback
    }
    
    return Math.max(0.1, Math.min(2.0, weight)); // Clamp between 0.1 and 2.0
  }

  private updatePerformanceFromFeedback(example: LearningExample, feedback: UserFeedback): void {
    // Adjust performance metrics based on user feedback
    const ratingNormalized = feedback.rating / 5.0; // Normalize to 0-1
    const weight = feedback.weight;
    
    // Update accuracy based on feedback
    if (feedback.type === 'accuracy' || feedback.type === 'overall') {
      example.performance.accuracy = (example.performance.accuracy * 0.7) + (ratingNormalized * weight * 0.3);
    }
    
    // Update confidence calibration
    if (feedback.type === 'overall') {
      const targetConfidence = ratingNormalized;
      const confidenceAdjustment = (targetConfidence - example.performance.confidence) * weight * 0.1;
      example.performance.confidence = Math.max(0, Math.min(1, example.performance.confidence + confidenceAdjustment));
    }
  }

  private async createSyntheticExample(template: LearningExample, difficulty: 'easy' | 'medium' | 'hard'): Promise<LearningExample> {
    const syntheticId = `synthetic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create variations of the template problem
    const variations = this.generateProblemVariations(template.problem, difficulty);
    const selectedVariation = variations[Math.floor(Math.random() * variations.length)];
    
    // Modify performance based on difficulty
    const difficultyMultipliers = {
      easy: { accuracy: 1.1, confidence: 1.05, time: 0.8 },
      medium: { accuracy: 1.0, confidence: 1.0, time: 1.0 },
      hard: { accuracy: 0.9, confidence: 0.95, time: 1.3 }
    };
    
    const multiplier = difficultyMultipliers[difficulty];
    
    const syntheticExample: LearningExample = {
      id: syntheticId,
      problem: selectedVariation,
      domain: template.domain,
      correctSolution: this.generateSyntheticSolution(template.correctSolution, difficulty),
      reasoning: { ...template.reasoning, id: `reasoning_${syntheticId}` },
      performance: {
        accuracy: Math.min(1.0, template.performance.accuracy * multiplier.accuracy),
        confidence: Math.min(1.0, template.performance.confidence * multiplier.confidence),
        executionTime: template.performance.executionTime * multiplier.time,
        verificationScore: template.performance.verificationScore * multiplier.accuracy,
      },
      feedback: [], // Start with no feedback
      metadata: {
        createdAt: new Date(),
        difficulty,
        tags: [...template.metadata.tags, 'synthetic'],
        source: 'synthetic',
      },
    };

    return syntheticExample;
  }

  private generateProblemVariations(problem: string, difficulty: 'easy' | 'medium' | 'hard'): string[] {
    // Simplified problem variation generation
    const baseVariations = [
      problem.replace(/\b(analyze|examine)\b/gi, 'evaluate'),
      problem.replace(/\b(simple|basic)\b/gi, difficulty === 'hard' ? 'complex' : 'standard'),
      problem.replace(/\b(small|limited)\b/gi, difficulty === 'easy' ? 'manageable' : 'extensive'),
    ];
    
    return [problem, ...baseVariations];
  }

  private generateSyntheticSolution(templateSolution: any, difficulty: 'easy' | 'medium' | 'hard'): any {
    // For now, return a slightly modified version of the template solution
    if (typeof templateSolution === 'string') {
      const modifiers = {
        easy: 'straightforward',
        medium: 'systematic',
        hard: 'comprehensive'
      };
      
      return `${modifiers[difficulty]} ${templateSolution}`;
    }
    
    return templateSolution;
  }

  getLearningExamples(domain?: string): LearningExample[] {
    const examples = Array.from(this.learningExamples.values());
    return domain ? examples.filter(e => e.domain === domain) : examples;
  }

  getPerformanceHistory(): LearningMetrics[] {
    return [...this.performanceHistory];
  }

  getAdaptationHistory(): typeof this.adaptationHistory {
    return [...this.adaptationHistory];
  }

  getLearningObjectives(): LearningObjective[] {
    return Array.from(this.learningObjectives.values());
  }

  async getAdaptiveStats(): Promise<{
    totalExamples: number;
    totalAdaptations: number;
    currentMetrics: LearningMetrics;
    objectiveProgress: Record<string, number>;
    topPerformingDomains: string[];
    learningTrend: 'improving' | 'stable' | 'declining';
  }> {
    const currentMetrics = await this.updateLearningMetrics();
    
    const objectiveProgress = Object.fromEntries(
      Array.from(this.learningObjectives.entries()).map(([key, obj]) => [
        key,
        obj.currentValue / obj.targetValue
      ])
    );

    const domainPerf = Object.entries(currentMetrics.domainPerformance)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([domain]) => domain);

    // Determine learning trend from recent performance history
    const recentHistory = this.performanceHistory.slice(-5);
    let trend: 'improving' | 'stable' | 'declining' = 'stable';
    
    if (recentHistory.length >= 3) {
      const firstAccuracy = recentHistory[0].accuracy;
      const lastAccuracy = recentHistory[recentHistory.length - 1].accuracy;
      const improvement = lastAccuracy - firstAccuracy;
      
      if (improvement > 0.05) trend = 'improving';
      else if (improvement < -0.05) trend = 'declining';
    }

    return {
      totalExamples: this.learningExamples.size,
      totalAdaptations: this.adaptationHistory.length,
      currentMetrics,
      objectiveProgress,
      topPerformingDomains: domainPerf,
      learningTrend: trend,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = await this.getAdaptiveStats();
      
      return {
        healthy: stats.totalExamples > 0,
        details: {
          ...stats,
          adaptationRules: this.adaptationRules.size,
          learningObjectives: this.learningObjectives.size,
          service: 'adaptive-learning-engine',
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'adaptive-learning-engine',
        },
      };
    }
  }
}