import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { ReasoningChain, ReasoningStep } from './reasoning-engine.js';
import { LearningExample, UserFeedback } from './adaptive-learning.js';
import { ComprehensiveVerificationResult } from './verification-mechanisms.js';
import fs from 'fs/promises';
import path from 'path';

const logger = getLogger('TrainingPipeline');

export interface TrainingDataPoint {
  id: string;
  input: {
    problem: string;
    domain: string;
    context: Record<string, any>;
    constraints?: Record<string, any>;
  };
  target: {
    reasoning: ReasoningChain;
    solution: any;
    explanation: string;
    confidence: number;
  };
  metadata: {
    source: 'human' | 'synthetic' | 'curated' | 'augmented';
    quality: number; // 0-1 quality score
    difficulty: 'easy' | 'medium' | 'hard';
    tags: string[];
    createdAt: Date;
    validatedAt?: Date;
    validatedBy?: string;
    version: number;
  };
  augmentations?: TrainingAugmentation[];
}

export interface TrainingAugmentation {
  id: string;
  type: 'paraphrase' | 'complexity_adjust' | 'domain_shift' | 'noise_addition' | 'context_variation';
  parameters: Record<string, any>;
  result: {
    modifiedInput: any;
    modifiedTarget?: any;
    qualityImpact: number; // -1 to 1, impact on quality
  };
  appliedAt: Date;
}

export interface DatasetSplit {
  train: TrainingDataPoint[];
  validation: TrainingDataPoint[];
  test: TrainingDataPoint[];
  metadata: {
    splitRatio: [number, number, number]; // train, val, test ratios
    stratifiedBy: string[]; // fields used for stratification
    totalSize: number;
    domainDistribution: Record<string, number>;
    difficultyDistribution: Record<string, number>;
    qualityStats: {
      mean: number;
      std: number;
      min: number;
      max: number;
    };
  };
}

export interface DataValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  quality: {
    dataCompleteness: number;
    labelQuality: number;
    distributionBalance: number;
    overallScore: number;
  };
  recommendations: string[];
}

export interface DataPipelineConfig {
  outputPath: string;
  formats: Array<'json' | 'jsonl' | 'hdf5' | 'csv'>;
  augmentation: {
    enabled: boolean;
    targetMultiplier: number; // How many augmented samples per original
    strategies: string[];
    qualityThreshold: number; // Minimum quality for augmented samples
  };
  validation: {
    enabled: boolean;
    strictMode: boolean;
    customValidators: string[];
  };
  splitting: {
    ratios: [number, number, number]; // train, val, test
    stratifyBy: string[];
    randomSeed: number;
  };
  filtering: {
    minQuality: number;
    maxAge: number; // days
    excludeTags: string[];
    includeDomains: string[];
  };
}

export interface PipelineMetrics {
  totalSamples: number;
  processedSamples: number;
  validSamples: number;
  augmentedSamples: number;
  averageQuality: number;
  processingTime: number;
  memoryUsage: number;
  errorCount: number;
  warningCount: number;
}

export class TrainingDataPipeline {
  private rawData: Map<string, LearningExample> = new Map();
  private processedData: Map<string, TrainingDataPoint> = new Map();
  private validatedData: Map<string, TrainingDataPoint> = new Map();
  private augmentedData: Map<string, TrainingDataPoint> = new Map();
  private config: DataPipelineConfig;

  constructor(config: Partial<DataPipelineConfig> = {}) {
    this.config = {
      outputPath: './data/training',
      formats: ['json', 'jsonl'],
      augmentation: {
        enabled: true,
        targetMultiplier: 2,
        strategies: ['paraphrase', 'complexity_adjust', 'context_variation'],
        qualityThreshold: 0.6,
      },
      validation: {
        enabled: true,
        strictMode: false,
        customValidators: [],
      },
      splitting: {
        ratios: [0.7, 0.15, 0.15],
        stratifyBy: ['domain', 'difficulty'],
        randomSeed: 42,
      },
      filtering: {
        minQuality: 0.5,
        maxAge: 365, // 1 year
        excludeTags: ['test', 'debug'],
        includeDomains: [],
      },
      ...config,
    };

    this.initializePipeline();
  }

  private async initializePipeline(): Promise<void> {
    try {
      await fs.mkdir(this.config.outputPath, { recursive: true });
      await fs.mkdir(path.join(this.config.outputPath, 'raw'), { recursive: true });
      await fs.mkdir(path.join(this.config.outputPath, 'processed'), { recursive: true });
      await fs.mkdir(path.join(this.config.outputPath, 'validated'), { recursive: true });
      await fs.mkdir(path.join(this.config.outputPath, 'augmented'), { recursive: true });
      await fs.mkdir(path.join(this.config.outputPath, 'splits'), { recursive: true });

      logger.info('Training data pipeline initialized', {
        outputPath: this.config.outputPath,
        augmentationEnabled: this.config.augmentation.enabled,
        validationEnabled: this.config.validation.enabled,
      });
    } catch (error) {
      logger.error('Failed to initialize training pipeline', { error });
      throw error;
    }
  }

  @withPerformanceMonitoring('training-pipeline.ingest-data')
  async ingestLearningExamples(examples: LearningExample[]): Promise<PipelineMetrics> {
    const startTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;

    try {
      for (const example of examples) {
        try {
          // Apply filtering
          if (this.shouldIncludeExample(example)) {
            this.rawData.set(example.id, example);
            processedCount++;
          }
        } catch (error) {
          errorCount++;
          logger.warn('Failed to ingest learning example', { exampleId: example.id, error });
        }
      }

      const metrics: PipelineMetrics = {
        totalSamples: examples.length,
        processedSamples: processedCount,
        validSamples: 0, // Will be set after validation
        augmentedSamples: 0, // Will be set after augmentation
        averageQuality: this.calculateAverageQuality(),
        processingTime: Date.now() - startTime,
        memoryUsage: process.memoryUsage().heapUsed,
        errorCount,
        warningCount: 0,
      };

      logger.info('Ingested learning examples', {
        total: examples.length,
        processed: processedCount,
        filtered: examples.length - processedCount,
        errors: errorCount,
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to ingest learning examples', { error });
      throw error;
    }
  }

  @withPerformanceMonitoring('training-pipeline.process-raw-data')
  async processRawData(): Promise<PipelineMetrics> {
    const startTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;

    try {
      for (const [id, example] of this.rawData) {
        try {
          const trainingDataPoint = await this.convertToTrainingData(example);
          this.processedData.set(id, trainingDataPoint);
          processedCount++;
        } catch (error) {
          errorCount++;
          logger.warn('Failed to process raw example', { exampleId: id, error });
        }
      }

      // Save processed data
      await this.saveProcessedData();

      const metrics: PipelineMetrics = {
        totalSamples: this.rawData.size,
        processedSamples: processedCount,
        validSamples: 0,
        augmentedSamples: 0,
        averageQuality: this.calculateProcessedAverageQuality(),
        processingTime: Date.now() - startTime,
        memoryUsage: process.memoryUsage().heapUsed,
        errorCount,
        warningCount: 0,
      };

      logger.info('Processed raw data', {
        input: this.rawData.size,
        output: processedCount,
        errors: errorCount,
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to process raw data', { error });
      throw error;
    }
  }

  @withPerformanceMonitoring('training-pipeline.validate-data')
  async validateData(): Promise<DataValidationResult> {
    try {
      const errors: string[] = [];
      const warnings: string[] = [];
      let validCount = 0;

      // Validate each training data point
      for (const [id, dataPoint] of this.processedData) {
        const validation = await this.validateTrainingDataPoint(dataPoint);
        
        if (validation.isValid) {
          this.validatedData.set(id, dataPoint);
          validCount++;
        } else {
          errors.push(`${id}: ${validation.errors.join(', ')}`);
          warnings.push(...validation.warnings.map(w => `${id}: ${w}`));
        }
      }

      // Calculate quality metrics
      const quality = this.calculateDataQuality();

      // Generate recommendations
      const recommendations = this.generateDataRecommendations(quality, errors, warnings);

      const result: DataValidationResult = {
        isValid: validCount > 0 && quality.overallScore > 0.6,
        errors,
        warnings,
        quality,
        recommendations,
      };

      // Save validated data
      if (result.isValid) {
        await this.saveValidatedData();
      }

      logger.info('Data validation completed', {
        total: this.processedData.size,
        valid: validCount,
        errors: errors.length,
        warnings: warnings.length,
        overallQuality: quality.overallScore,
      });

      return result;
    } catch (error) {
      logger.error('Failed to validate data', { error });
      throw error;
    }
  }

  @withPerformanceMonitoring('training-pipeline.augment-data')
  async augmentData(): Promise<PipelineMetrics> {
    const startTime = Date.now();
    let augmentedCount = 0;
    let errorCount = 0;

    if (!this.config.augmentation.enabled) {
      logger.info('Data augmentation disabled, skipping');
      return this.createEmptyMetrics(startTime);
    }

    try {
      const targetCount = Math.floor(this.validatedData.size * this.config.augmentation.targetMultiplier);
      const augmentationsPerSample = Math.max(1, Math.floor(targetCount / this.validatedData.size));

      for (const [id, dataPoint] of this.validatedData) {
        try {
          for (let i = 0; i < augmentationsPerSample; i++) {
            const augmented = await this.augmentDataPoint(dataPoint, i);
            
            if (augmented && augmented.metadata.quality >= this.config.augmentation.qualityThreshold) {
              const augmentedId = `${id}_aug_${i}`;
              this.augmentedData.set(augmentedId, augmented);
              augmentedCount++;
            }
          }
        } catch (error) {
          errorCount++;
          logger.warn('Failed to augment data point', { dataPointId: id, error });
        }
      }

      // Save augmented data
      await this.saveAugmentedData();

      const metrics: PipelineMetrics = {
        totalSamples: this.validatedData.size,
        processedSamples: this.validatedData.size,
        validSamples: this.validatedData.size,
        augmentedSamples: augmentedCount,
        averageQuality: this.calculateAugmentedAverageQuality(),
        processingTime: Date.now() - startTime,
        memoryUsage: process.memoryUsage().heapUsed,
        errorCount,
        warningCount: 0,
      };

      logger.info('Data augmentation completed', {
        original: this.validatedData.size,
        augmented: augmentedCount,
        errors: errorCount,
        averageQuality: metrics.averageQuality,
      });

      return metrics;
    } catch (error) {
      logger.error('Failed to augment data', { error });
      throw error;
    }
  }

  @withPerformanceMonitoring('training-pipeline.create-splits')
  async createDatasetSplits(): Promise<DatasetSplit> {
    try {
      // Combine validated and augmented data
      const allData = new Map([...this.validatedData, ...this.augmentedData]);
      const dataArray = Array.from(allData.values());

      // Stratified splitting
      const splits = this.stratifiedSplit(dataArray);

      // Calculate metadata
      const metadata = this.calculateSplitMetadata(splits, dataArray);

      const datasetSplit: DatasetSplit = {
        train: splits.train,
        validation: splits.validation,
        test: splits.test,
        metadata,
      };

      // Save splits
      await this.saveSplits(datasetSplit);

      logger.info('Dataset splits created', {
        train: splits.train.length,
        validation: splits.validation.length,
        test: splits.test.length,
        total: dataArray.length,
      });

      return datasetSplit;
    } catch (error) {
      logger.error('Failed to create dataset splits', { error });
      throw error;
    }
  }

  @withPerformanceMonitoring('training-pipeline.export-data')
  async exportData(format: 'json' | 'jsonl' | 'csv', split?: 'train' | 'validation' | 'test'): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `training_data_${split || 'all'}_${timestamp}.${format}`;
      const filepath = path.join(this.config.outputPath, filename);

      let data: TrainingDataPoint[];
      
      if (split) {
        // Load specific split
        const splitPath = path.join(this.config.outputPath, 'splits', `${split}.json`);
        const splitData = JSON.parse(await fs.readFile(splitPath, 'utf-8'));
        data = splitData;
      } else {
        // Export all processed data
        data = Array.from(this.validatedData.values()).concat(Array.from(this.augmentedData.values()));
      }

      switch (format) {
        case 'json':
          await fs.writeFile(filepath, JSON.stringify(data, null, 2));
          break;
        case 'jsonl':
          const jsonlContent = data.map(item => JSON.stringify(item)).join('\n');
          await fs.writeFile(filepath, jsonlContent);
          break;
        case 'csv':
          const csvContent = this.convertToCSV(data);
          await fs.writeFile(filepath, csvContent);
          break;
        default:
          throw new MCPError({
            code: ErrorCode.INVALID_PARAMS,
            message: `Unsupported export format: ${format}`,
            severity: ErrorSeverity.MEDIUM,
            retryable: false,
            context: { operation: 'exportData', format },
          });
      }

      logger.info('Data exported', {
        format,
        split: split || 'all',
        filepath,
        count: data.length,
      });

      return filepath;
    } catch (error) {
      logger.error('Failed to export data', { error, format, split });
      throw error;
    }
  }

  private shouldIncludeExample(example: LearningExample): boolean {
    // Apply filtering criteria
    const quality = this.calculateExampleQuality(example);
    if (quality < this.config.filtering.minQuality) {
      return false;
    }

    // Check age
    const ageInDays = (Date.now() - example.metadata.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageInDays > this.config.filtering.maxAge) {
      return false;
    }

    // Check excluded tags
    const hasExcludedTag = example.metadata.tags?.some(tag => 
      this.config.filtering.excludeTags.includes(tag)
    );
    if (hasExcludedTag) {
      return false;
    }

    // Check included domains
    if (this.config.filtering.includeDomains.length > 0) {
      if (!this.config.filtering.includeDomains.includes(example.domain)) {
        return false;
      }
    }

    return true;
  }

  private calculateExampleQuality(example: LearningExample): number {
    let quality = 0.5; // Base quality

    // Factor in performance
    quality += example.performance.accuracy * 0.3;
    quality += example.performance.confidence * 0.2;
    quality += example.performance.verificationScore * 0.2;

    // Factor in feedback
    if (example.feedback.length > 0) {
      const avgFeedback = example.feedback.reduce((sum, f) => sum + f.rating, 0) / example.feedback.length;
      quality += (avgFeedback / 5) * 0.2; // Normalize to 0-1
    }

    // Factor in completeness
    const hasReasoning = example.reasoning && example.reasoning.steps.length > 0;
    const hasSolution = example.correctSolution !== undefined;
    if (hasReasoning && hasSolution) quality += 0.1;

    return Math.min(1.0, quality);
  }

  private async convertToTrainingData(example: LearningExample): Promise<TrainingDataPoint> {
    const dataPoint: TrainingDataPoint = {
      id: `training_${example.id}`,
      input: {
        problem: example.problem,
        domain: example.domain,
        context: {
          difficulty: example.metadata.difficulty,
          tags: example.metadata.tags,
          source: example.metadata.source,
        },
      },
      target: {
        reasoning: example.reasoning,
        solution: example.correctSolution,
        explanation: this.generateExplanation(example),
        confidence: example.performance.confidence,
      },
      metadata: {
        source: example.metadata.source,
        quality: this.calculateExampleQuality(example),
        difficulty: example.metadata.difficulty,
        tags: example.metadata.tags || [],
        createdAt: new Date(),
        version: 1,
      },
    };

    return dataPoint;
  }

  private generateExplanation(example: LearningExample): string {
    // Generate a human-readable explanation of the reasoning process
    const steps = example.reasoning.steps;
    const explanationParts = [
      `Problem: ${example.problem}`,
      `Domain: ${example.domain}`,
      `Strategy: ${example.reasoning.strategy}`,
      '',
      'Reasoning Steps:',
    ];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      explanationParts.push(`${i + 1}. ${step.description}: ${step.reasoning}`);
    }

    explanationParts.push('');
    explanationParts.push(`Conclusion: ${example.reasoning.finalConclusion}`);
    explanationParts.push(`Confidence: ${(example.reasoning.overallConfidence * 100).toFixed(1)}%`);

    return explanationParts.join('\n');
  }

  private async validateTrainingDataPoint(dataPoint: TrainingDataPoint): Promise<DataValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required field validation
    if (!dataPoint.input.problem || dataPoint.input.problem.trim().length === 0) {
      errors.push('Missing or empty problem statement');
    }

    if (!dataPoint.input.domain) {
      errors.push('Missing domain specification');
    }

    if (!dataPoint.target.reasoning || !dataPoint.target.reasoning.steps || dataPoint.target.reasoning.steps.length === 0) {
      errors.push('Missing or empty reasoning steps');
    }

    if (dataPoint.target.solution === undefined || dataPoint.target.solution === null) {
      warnings.push('Missing target solution');
    }

    // Quality validation
    if (dataPoint.metadata.quality < 0.3) {
      warnings.push('Low quality score');
    }

    // Consistency validation
    if (dataPoint.target.confidence < 0.5 && dataPoint.metadata.quality > 0.8) {
      warnings.push('Inconsistent confidence and quality scores');
    }

    // Content validation
    if (dataPoint.input.problem.length < 10) {
      warnings.push('Very short problem statement');
    }

    if (dataPoint.input.problem.length > 2000) {
      warnings.push('Very long problem statement');
    }

    const quality = {
      dataCompleteness: this.calculateDataCompleteness(dataPoint),
      labelQuality: this.calculateLabelQuality(dataPoint),
      distributionBalance: 0.8, // Placeholder
      overallScore: 0,
    };

    quality.overallScore = (quality.dataCompleteness + quality.labelQuality + quality.distributionBalance) / 3;

    return {
      isValid: errors.length === 0 && quality.overallScore > 0.5,
      errors,
      warnings,
      quality,
      recommendations: this.generateValidationRecommendations(errors, warnings),
    };
  }

  private calculateDataCompleteness(dataPoint: TrainingDataPoint): number {
    let score = 0;
    const maxScore = 8;

    if (dataPoint.input.problem) score++;
    if (dataPoint.input.domain) score++;
    if (dataPoint.input.context) score++;
    if (dataPoint.target.reasoning) score++;
    if (dataPoint.target.solution !== undefined) score++;
    if (dataPoint.target.explanation) score++;
    if (dataPoint.target.confidence > 0) score++;
    if (dataPoint.metadata.tags.length > 0) score++;

    return score / maxScore;
  }

  private calculateLabelQuality(dataPoint: TrainingDataPoint): number {
    let score = 0.5; // Base score

    // Check reasoning quality
    if (dataPoint.target.reasoning.steps.length > 2) score += 0.2;
    if (dataPoint.target.reasoning.overallConfidence > 0.7) score += 0.2;

    // Check explanation quality
    if (dataPoint.target.explanation && dataPoint.target.explanation.length > 100) score += 0.1;

    return Math.min(1.0, score);
  }

  private generateValidationRecommendations(errors: string[], warnings: string[]): string[] {
    const recommendations: string[] = [];

    if (errors.some(e => e.includes('problem statement'))) {
      recommendations.push('Ensure all data points have clear, non-empty problem statements');
    }

    if (errors.some(e => e.includes('reasoning steps'))) {
      recommendations.push('Validate that all reasoning chains have multiple detailed steps');
    }

    if (warnings.some(w => w.includes('quality'))) {
      recommendations.push('Review and improve data quality through better curation');
    }

    if (warnings.some(w => w.includes('short'))) {
      recommendations.push('Consider expanding brief problem statements with more context');
    }

    return recommendations;
  }

  private async augmentDataPoint(dataPoint: TrainingDataPoint, index: number): Promise<TrainingDataPoint | null> {
    try {
      const strategy = this.config.augmentation.strategies[index % this.config.augmentation.strategies.length];
      const augmentation = await this.applyAugmentationStrategy(dataPoint, strategy);

      if (!augmentation) {
        return null;
      }

      const augmentedDataPoint: TrainingDataPoint = {
        ...dataPoint,
        id: `${dataPoint.id}_aug_${index}`,
        input: { ...dataPoint.input, ...augmentation.result.modifiedInput },
        target: augmentation.result.modifiedTarget ? 
          { ...dataPoint.target, ...augmentation.result.modifiedTarget } : 
          dataPoint.target,
        metadata: {
          ...dataPoint.metadata,
          source: 'augmented',
          quality: Math.max(0, dataPoint.metadata.quality + augmentation.result.qualityImpact),
          tags: [...dataPoint.metadata.tags, 'augmented', strategy],
          createdAt: new Date(),
        },
        augmentations: [augmentation],
      };

      return augmentedDataPoint;
    } catch (error) {
      logger.warn('Failed to augment data point', { dataPointId: dataPoint.id, index, error });
      return null;
    }
  }

  private async applyAugmentationStrategy(dataPoint: TrainingDataPoint, strategy: string): Promise<TrainingAugmentation | null> {
    switch (strategy) {
      case 'paraphrase':
        return this.paraphraseAugmentation(dataPoint);
      case 'complexity_adjust':
        return this.complexityAdjustmentAugmentation(dataPoint);
      case 'context_variation':
        return this.contextVariationAugmentation(dataPoint);
      case 'noise_addition':
        return this.noiseAdditionAugmentation(dataPoint);
      case 'domain_shift':
        return this.domainShiftAugmentation(dataPoint);
      default:
        logger.warn('Unknown augmentation strategy', { strategy });
        return null;
    }
  }

  private paraphraseAugmentation(dataPoint: TrainingDataPoint): TrainingAugmentation {
    // Simple paraphrasing by replacing common words/phrases
    const paraphraseMap: Record<string, string> = {
      'analyze': 'examine',
      'determine': 'find',
      'calculate': 'compute',
      'evaluate': 'assess',
      'identify': 'recognize',
      'simple': 'straightforward',
      'complex': 'complicated',
      'important': 'significant',
    };

    let paraphrased = dataPoint.input.problem;
    for (const [original, replacement] of Object.entries(paraphraseMap)) {
      const regex = new RegExp(`\\b${original}\\b`, 'gi');
      paraphrased = paraphrased.replace(regex, replacement);
    }

    return {
      id: `paraphrase_${Date.now()}`,
      type: 'paraphrase',
      parameters: { paraphraseMap },
      result: {
        modifiedInput: { problem: paraphrased },
        qualityImpact: -0.05, // Slight quality decrease due to potential semantic drift
      },
      appliedAt: new Date(),
    };
  }

  private complexityAdjustmentAugmentation(dataPoint: TrainingDataPoint): TrainingAugmentation {
    const currentDifficulty = dataPoint.metadata.difficulty;
    let adjustedProblem = dataPoint.input.problem;
    let qualityImpact = 0;

    if (currentDifficulty === 'easy') {
      // Make it slightly more complex
      adjustedProblem = `Consider the comprehensive implications when you ${adjustedProblem.toLowerCase()}`;
      qualityImpact = 0.1;
    } else if (currentDifficulty === 'hard') {
      // Simplify slightly
      adjustedProblem = adjustedProblem.replace(/comprehensive|complex|intricate/gi, 'basic');
      qualityImpact = -0.1;
    }

    return {
      id: `complexity_${Date.now()}`,
      type: 'complexity_adjust',
      parameters: { originalDifficulty: currentDifficulty },
      result: {
        modifiedInput: { problem: adjustedProblem },
        qualityImpact,
      },
      appliedAt: new Date(),
    };
  }

  private contextVariationAugmentation(dataPoint: TrainingDataPoint): TrainingAugmentation {
    const contextVariations = [
      'Given the current market conditions, ',
      'In a resource-constrained environment, ',
      'Considering industry best practices, ',
      'With a focus on efficiency, ',
      'Taking into account stakeholder concerns, ',
    ];

    const variation = contextVariations[Math.floor(Math.random() * contextVariations.length)];
    const modifiedProblem = variation + dataPoint.input.problem.toLowerCase();

    return {
      id: `context_${Date.now()}`,
      type: 'context_variation',
      parameters: { addedContext: variation },
      result: {
        modifiedInput: { problem: modifiedProblem },
        qualityImpact: 0.05, // Slight quality improvement due to additional context
      },
      appliedAt: new Date(),
    };
  }

  private noiseAdditionAugmentation(dataPoint: TrainingDataPoint): TrainingAugmentation {
    // Add minor spelling/grammatical variations
    let noisyProblem = dataPoint.input.problem;
    
    // Randomly change some punctuation
    if (Math.random() < 0.3) {
      noisyProblem = noisyProblem.replace(/\./g, match => Math.random() < 0.1 ? ',' : match);
    }

    return {
      id: `noise_${Date.now()}`,
      type: 'noise_addition',
      parameters: { noiseLevel: 'low' },
      result: {
        modifiedInput: { problem: noisyProblem },
        qualityImpact: -0.02, // Small quality decrease
      },
      appliedAt: new Date(),
    };
  }

  private domainShiftAugmentation(dataPoint: TrainingDataPoint): TrainingAugmentation {
    // Simple domain mapping (in practice would be more sophisticated)
    const domainMappings: Record<string, string> = {
      'technology': 'business',
      'business': 'science',
      'science': 'technology',
    };

    const newDomain = domainMappings[dataPoint.input.domain] || dataPoint.input.domain;

    return {
      id: `domain_${Date.now()}`,
      type: 'domain_shift',
      parameters: { originalDomain: dataPoint.input.domain, newDomain },
      result: {
        modifiedInput: { domain: newDomain },
        qualityImpact: -0.1, // Quality decrease due to domain mismatch
      },
      appliedAt: new Date(),
    };
  }

  private stratifiedSplit(data: TrainingDataPoint[]): { train: TrainingDataPoint[]; validation: TrainingDataPoint[]; test: TrainingDataPoint[] } {
    // Group data by stratification criteria
    const groups = this.groupDataForStratification(data);
    
    const train: TrainingDataPoint[] = [];
    const validation: TrainingDataPoint[] = [];
    const test: TrainingDataPoint[] = [];

    // Split each group according to ratios
    for (const group of groups) {
      const shuffled = this.shuffleArray(group, this.config.splitting.randomSeed);
      const trainSize = Math.floor(shuffled.length * this.config.splitting.ratios[0]);
      const valSize = Math.floor(shuffled.length * this.config.splitting.ratios[1]);

      train.push(...shuffled.slice(0, trainSize));
      validation.push(...shuffled.slice(trainSize, trainSize + valSize));
      test.push(...shuffled.slice(trainSize + valSize));
    }

    return { train, validation, test };
  }

  private groupDataForStratification(data: TrainingDataPoint[]): TrainingDataPoint[][] {
    const stratifyBy = this.config.splitting.stratifyBy;
    const groups = new Map<string, TrainingDataPoint[]>();

    for (const item of data) {
      const key = stratifyBy.map(field => {
        if (field === 'domain') return item.input.domain;
        if (field === 'difficulty') return item.metadata.difficulty;
        if (field === 'quality') return item.metadata.quality > 0.7 ? 'high' : 'low';
        return 'unknown';
      }).join('_');

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }

    return Array.from(groups.values());
  }

  private shuffleArray<T>(array: T[], seed: number): T[] {
    const shuffled = [...array];
    let random = this.seededRandom(seed);
    
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    return shuffled;
  }

  private seededRandom(seed: number): () => number {
    let state = seed;
    return () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  }

  private calculateSplitMetadata(splits: any, allData: TrainingDataPoint[]): any {
    const domainDistribution = this.calculateDistribution(allData, 'domain');
    const difficultyDistribution = this.calculateDistribution(allData, 'difficulty');
    const qualities = allData.map(d => d.metadata.quality);

    return {
      splitRatio: this.config.splitting.ratios,
      stratifiedBy: this.config.splitting.stratifyBy,
      totalSize: allData.length,
      domainDistribution,
      difficultyDistribution,
      qualityStats: {
        mean: qualities.reduce((a, b) => a + b, 0) / qualities.length,
        std: this.calculateStandardDeviation(qualities),
        min: Math.min(...qualities),
        max: Math.max(...qualities),
      },
    };
  }

  private calculateDistribution(data: TrainingDataPoint[], field: string): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    for (const item of data) {
      let value: string;
      if (field === 'domain') value = item.input.domain;
      else if (field === 'difficulty') value = item.metadata.difficulty;
      else continue;

      distribution[value] = (distribution[value] || 0) + 1;
    }

    return distribution;
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }

  private convertToCSV(data: TrainingDataPoint[]): string {
    const headers = [
      'id', 'problem', 'domain', 'difficulty', 'quality', 'confidence',
      'reasoning_steps', 'solution', 'source', 'created_at'
    ];

    const rows = data.map(item => [
      item.id,
      `"${item.input.problem.replace(/"/g, '""')}"`,
      item.input.domain,
      item.metadata.difficulty,
      item.metadata.quality.toFixed(3),
      item.target.confidence.toFixed(3),
      item.target.reasoning.steps.length,
      `"${String(item.target.solution).replace(/"/g, '""')}"`,
      item.metadata.source,
      item.metadata.createdAt.toISOString(),
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  private async saveProcessedData(): Promise<void> {
    const data = Object.fromEntries(this.processedData);
    const filepath = path.join(this.config.outputPath, 'processed', 'processed_data.json');
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  }

  private async saveValidatedData(): Promise<void> {
    const data = Object.fromEntries(this.validatedData);
    const filepath = path.join(this.config.outputPath, 'validated', 'validated_data.json');
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  }

  private async saveAugmentedData(): Promise<void> {
    const data = Object.fromEntries(this.augmentedData);
    const filepath = path.join(this.config.outputPath, 'augmented', 'augmented_data.json');
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  }

  private async saveSplits(datasetSplit: DatasetSplit): Promise<void> {
    const splitsPath = path.join(this.config.outputPath, 'splits');
    
    await fs.writeFile(
      path.join(splitsPath, 'train.json'),
      JSON.stringify(datasetSplit.train, null, 2)
    );
    await fs.writeFile(
      path.join(splitsPath, 'validation.json'),
      JSON.stringify(datasetSplit.validation, null, 2)
    );
    await fs.writeFile(
      path.join(splitsPath, 'test.json'),
      JSON.stringify(datasetSplit.test, null, 2)
    );
    await fs.writeFile(
      path.join(splitsPath, 'metadata.json'),
      JSON.stringify(datasetSplit.metadata, null, 2)
    );
  }

  private calculateAverageQuality(): number {
    const examples = Array.from(this.rawData.values());
    if (examples.length === 0) return 0;
    
    return examples.reduce((sum, e) => sum + this.calculateExampleQuality(e), 0) / examples.length;
  }

  private calculateProcessedAverageQuality(): number {
    const data = Array.from(this.processedData.values());
    if (data.length === 0) return 0;
    
    return data.reduce((sum, d) => sum + d.metadata.quality, 0) / data.length;
  }

  private calculateAugmentedAverageQuality(): number {
    const combined = [...Array.from(this.validatedData.values()), ...Array.from(this.augmentedData.values())];
    if (combined.length === 0) return 0;
    
    return combined.reduce((sum, d) => sum + d.metadata.quality, 0) / combined.length;
  }

  private calculateDataQuality(): any {
    const validated = Array.from(this.validatedData.values());
    if (validated.length === 0) {
      return {
        dataCompleteness: 0,
        labelQuality: 0,
        distributionBalance: 0,
        overallScore: 0,
      };
    }

    const completeness = validated.reduce((sum, d) => sum + this.calculateDataCompleteness(d), 0) / validated.length;
    const labelQuality = validated.reduce((sum, d) => sum + this.calculateLabelQuality(d), 0) / validated.length;
    
    // Calculate distribution balance
    const domainDist = this.calculateDistribution(validated, 'domain');
    const domainValues = Object.values(domainDist);
    const maxDomainCount = Math.max(...domainValues);
    const minDomainCount = Math.min(...domainValues);
    const distributionBalance = minDomainCount / Math.max(1, maxDomainCount);

    const overallScore = (completeness + labelQuality + distributionBalance) / 3;

    return {
      dataCompleteness: completeness,
      labelQuality,
      distributionBalance,
      overallScore,
    };
  }

  private generateDataRecommendations(quality: any, errors: string[], warnings: string[]): string[] {
    const recommendations: string[] = [];

    if (quality.dataCompleteness < 0.8) {
      recommendations.push('Improve data completeness by ensuring all required fields are populated');
    }

    if (quality.labelQuality < 0.7) {
      recommendations.push('Enhance label quality through more detailed reasoning chains and explanations');
    }

    if (quality.distributionBalance < 0.5) {
      recommendations.push('Address class imbalance by collecting more data for underrepresented categories');
    }

    if (errors.length > warnings.length * 2) {
      recommendations.push('Focus on fixing critical errors before addressing warnings');
    }

    if (quality.overallScore < 0.7) {
      recommendations.push('Consider increasing quality thresholds and implementing stricter validation');
    }

    return recommendations;
  }

  private createEmptyMetrics(startTime: number): PipelineMetrics {
    return {
      totalSamples: 0,
      processedSamples: 0,
      validSamples: 0,
      augmentedSamples: 0,
      averageQuality: 0,
      processingTime: Date.now() - startTime,
      memoryUsage: process.memoryUsage().heapUsed,
      errorCount: 0,
      warningCount: 0,
    };
  }

  getConfig(): DataPipelineConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<DataPipelineConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Pipeline configuration updated', { updates });
  }

  async getPipelineStats(): Promise<{
    rawDataCount: number;
    processedDataCount: number;
    validatedDataCount: number;
    augmentedDataCount: number;
    totalDataCount: number;
    averageQuality: number;
    qualityDistribution: Record<string, number>;
    domainDistribution: Record<string, number>;
  }> {
    const allData = [...Array.from(this.validatedData.values()), ...Array.from(this.augmentedData.values())];
    
    const qualityRanges = {
      'low (0-0.5)': 0,
      'medium (0.5-0.8)': 0,
      'high (0.8-1.0)': 0,
    };

    for (const item of allData) {
      if (item.metadata.quality < 0.5) qualityRanges['low (0-0.5)']++;
      else if (item.metadata.quality < 0.8) qualityRanges['medium (0.5-0.8)']++;
      else qualityRanges['high (0.8-1.0)']++;
    }

    return {
      rawDataCount: this.rawData.size,
      processedDataCount: this.processedData.size,
      validatedDataCount: this.validatedData.size,
      augmentedDataCount: this.augmentedData.size,
      totalDataCount: allData.length,
      averageQuality: this.calculateAugmentedAverageQuality(),
      qualityDistribution: qualityRanges,
      domainDistribution: this.calculateDistribution(allData, 'domain'),
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = await this.getPipelineStats();
      
      return {
        healthy: stats.validatedDataCount > 0,
        details: {
          ...stats,
          configValid: true,
          outputPathAccessible: true,
          service: 'training-data-pipeline',
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'training-data-pipeline',
        },
      };
    }
  }
}