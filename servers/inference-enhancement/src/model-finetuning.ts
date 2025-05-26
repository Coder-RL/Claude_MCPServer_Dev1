import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { TrainingDataPoint, DatasetSplit } from './training-pipeline.js';
import { LearningMetrics, LearningObjective } from './adaptive-learning.js';
import fs from 'fs/promises';
import path from 'path';

const logger = getLogger('ModelFineTuning');

export interface FineTuningConfig {
  model: {
    name: string;
    version: string;
    architecture: 'transformer' | 'lstm' | 'gru' | 'hybrid';
    parameters: {
      hiddenSize: number;
      numLayers: number;
      attentionHeads?: number;
      dropoutRate: number;
      learningRate: number;
      batchSize: number;
      maxSequenceLength: number;
    };
  };
  training: {
    epochs: number;
    warmupSteps: number;
    maxSteps?: number;
    evaluationSteps: number;
    saveSteps: number;
    gradientAccumulationSteps: number;
    maxGradientNorm: number;
    weightDecay: number;
    adamBeta1: number;
    adamBeta2: number;
    adamEpsilon: number;
  };
  optimization: {
    scheduler: 'linear' | 'cosine' | 'polynomial' | 'constant';
    optimizerType: 'adam' | 'adamw' | 'sgd' | 'rmsprop';
    mixedPrecision: boolean;
    gradientCheckpointing: boolean;
  };
  objectives: {
    primary: string; // 'accuracy' | 'perplexity' | 'bleu' | 'rouge'
    secondary: string[];
    weights: Record<string, number>;
  };
  regularization: {
    earlyStoppingPatience: number;
    earlyStoppingThreshold: number;
    l1Regularization: number;
    l2Regularization: number;
    dropoutScheduling: boolean;
  };
  data: {
    maxSamplesPerEpoch?: number;
    shuffleData: boolean;
    balanceClasses: boolean;
    augmentationProbability: number;
  };
}

export interface FineTuningJob {
  id: string;
  name: string;
  description: string;
  config: FineTuningConfig;
  dataset: {
    trainSize: number;
    validationSize: number;
    testSize: number;
    domains: string[];
    qualityStats: any;
  };
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    currentEpoch: number;
    currentStep: number;
    totalSteps: number;
    estimatedTimeRemaining: number;
    lastUpdateTime: Date;
  };
  metrics: FineTuningMetrics;
  checkpoints: ModelCheckpoint[];
  logs: FineTuningLog[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface FineTuningMetrics {
  training: {
    loss: number[];
    accuracy: number[];
    perplexity: number[];
    learningRate: number[];
    gradientNorm: number[];
  };
  validation: {
    loss: number[];
    accuracy: number[];
    perplexity: number[];
    f1Score: number[];
    bleuScore: number[];
  };
  evaluation: {
    domainSpecific: Record<string, any>;
    difficultySpecific: Record<string, any>;
    qualityImprovement: number;
    convergenceMetrics: {
      stepsToConverge: number;
      finalLoss: number;
      stabilityScore: number;
    };
  };
}

export interface ModelCheckpoint {
  id: string;
  jobId: string;
  epoch: number;
  step: number;
  metrics: {
    trainLoss: number;
    validationLoss: number;
    accuracy: number;
    f1Score: number;
  };
  filePath: string;
  size: number;
  createdAt: Date;
  isBest: boolean;
  metadata: Record<string, any>;
}

export interface FineTuningLog {
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
  data?: Record<string, any>;
}

export interface ModelEvaluation {
  jobId: string;
  evaluationId: string;
  metrics: {
    overall: {
      accuracy: number;
      precision: number;
      recall: number;
      f1Score: number;
      bleuScore: number;
      rougeScore: number;
    };
    domain: Record<string, {
      accuracy: number;
      sampleCount: number;
      confidence: number;
    }>;
    difficulty: Record<string, {
      accuracy: number;
      averageConfidence: number;
      errorRate: number;
    }>;
    quality: {
      highQuality: { accuracy: number; count: number };
      mediumQuality: { accuracy: number; count: number };
      lowQuality: { accuracy: number; count: number };
    };
  };
  comparisons: {
    baselineModel?: string;
    performanceImprovement: number;
    significanceTest: {
      pValue: number;
      isSignificant: boolean;
      confidenceInterval: [number, number];
    };
  };
  recommendations: string[];
  evaluatedAt: Date;
}

export interface HyperparameterTuning {
  id: string;
  jobIds: string[];
  searchSpace: {
    learningRate: { min: number; max: number; scale: 'linear' | 'log' };
    batchSize: { values: number[] };
    hiddenSize: { values: number[] };
    numLayers: { min: number; max: number };
    dropoutRate: { min: number; max: number };
  };
  strategy: 'grid' | 'random' | 'bayesian' | 'evolutionary';
  objective: string;
  budget: {
    maxTrials: number;
    maxDuration: number; // milliseconds
    maxResources: number;
  };
  results: {
    bestParams: Record<string, any>;
    bestScore: number;
    allTrials: Array<{
      params: Record<string, any>;
      score: number;
      duration: number;
      status: string;
    }>;
  };
  status: 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export class ModelFineTuningEngine {
  private jobs: Map<string, FineTuningJob> = new Map();
  private checkpoints: Map<string, ModelCheckpoint[]> = new Map();
  private evaluations: Map<string, ModelEvaluation[]> = new Map();
  private tuningExperiments: Map<string, HyperparameterTuning> = new Map();
  private basePath: string;

  constructor(basePath = './models/finetuning') {
    this.basePath = basePath;
    this.initializeEngine();
  }

  private async initializeEngine(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'jobs'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'checkpoints'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'evaluations'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'configs'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'logs'), { recursive: true });

      // Load existing jobs
      await this.loadExistingJobs();

      logger.info('Model fine-tuning engine initialized', {
        basePath: this.basePath,
        existingJobs: this.jobs.size,
      });
    } catch (error) {
      logger.error('Failed to initialize fine-tuning engine', { error });
      throw error;
    }
  }

  async createFineTuningJob(
    name: string,
    description: string,
    config: FineTuningConfig,
    dataset: DatasetSplit
  ): Promise<string> {
    try {
      const jobId = `ft_job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const job: FineTuningJob = {
        id: jobId,
        name,
        description,
        config,
        dataset: {
          trainSize: dataset.train.length,
          validationSize: dataset.validation.length,
          testSize: dataset.test.length,
          domains: [...new Set(dataset.train.map(d => d.input.domain))],
          qualityStats: this.calculateQualityStats(dataset.train),
        },
        status: 'pending',
        progress: {
          currentEpoch: 0,
          currentStep: 0,
          totalSteps: this.calculateTotalSteps(dataset.train.length, config),
          estimatedTimeRemaining: 0,
          lastUpdateTime: new Date(),
        },
        metrics: this.initializeMetrics(),
        checkpoints: [],
        logs: [],
        createdAt: new Date(),
      };

      // Validate configuration
      await this.validateFineTuningConfig(config, dataset);

      // Save job
      this.jobs.set(jobId, job);
      await this.saveJob(job);

      // Initialize checkpoint storage
      this.checkpoints.set(jobId, []);

      logger.info('Created fine-tuning job', {
        jobId,
        name,
        trainSize: job.dataset.trainSize,
        validationSize: job.dataset.validationSize,
        totalSteps: job.progress.totalSteps,
      });

      return jobId;
    } catch (error) {
      logger.error('Failed to create fine-tuning job', { error, name });
      throw error;
    }
  }

  async startFineTuningJob(jobId: string): Promise<void> {
    try {
      const job = this.jobs.get(jobId);
      if (!job) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: `Fine-tuning job not found: ${jobId}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'startFineTuningJob', jobId },
        });
      }

      if (job.status !== 'pending') {
        throw new MCPError({
          code: ErrorCode.INVALID_PARAMS,
          message: `Cannot start job in status: ${job.status}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'startFineTuningJob', jobId, status: job.status },
        });
      }

      // Update job status
      job.status = 'running';
      job.startedAt = new Date();
      job.progress.lastUpdateTime = new Date();

      // Log start
      this.addLog(job, 'info', 'Fine-tuning job started', {
        config: job.config,
        dataset: job.dataset,
      });

      // Start the actual training process (simulated for now)
      await this.executeTraining(job);

      logger.info('Started fine-tuning job', { jobId, name: job.name });
    } catch (error) {
      const job = this.jobs.get(jobId);
      if (job) {
        job.status = 'failed';
        job.error = error instanceof Error ? error.message : 'Unknown error';
        this.addLog(job, 'error', 'Job failed to start', { error: job.error });
      }
      logger.error('Failed to start fine-tuning job', { error, jobId });
      throw error;
    }
  }

  private async executeTraining(job: FineTuningJob): Promise<void> {
    try {
      const config = job.config;
      const totalSteps = job.progress.totalSteps;
      let currentStep = 0;

      this.addLog(job, 'info', 'Training execution started', {
        epochs: config.training.epochs,
        totalSteps,
        batchSize: config.model.parameters.batchSize,
      });

      // Simulate training loop
      for (let epoch = 0; epoch < config.training.epochs; epoch++) {
        job.progress.currentEpoch = epoch + 1;
        
        // Training epoch
        const epochMetrics = await this.simulateEpochTraining(job, epoch, currentStep);
        currentStep += epochMetrics.steps;
        
        // Validation
        const validationMetrics = await this.simulateValidation(job, epoch);
        
        // Update metrics
        this.updateTrainingMetrics(job, epochMetrics);
        this.updateValidationMetrics(job, validationMetrics);
        
        // Create checkpoint
        if ((epoch + 1) % (config.training.saveSteps / 100) === 0 || epoch === config.training.epochs - 1) {
          await this.createCheckpoint(job, epoch, currentStep, epochMetrics, validationMetrics);
        }
        
        // Check early stopping
        if (this.shouldEarlyStop(job, validationMetrics)) {
          this.addLog(job, 'info', 'Early stopping triggered', {
            epoch: epoch + 1,
            patience: config.regularization.earlyStoppingPatience,
          });
          break;
        }
        
        // Update progress
        job.progress.currentStep = currentStep;
        job.progress.estimatedTimeRemaining = this.estimateTimeRemaining(job, currentStep, totalSteps);
        job.progress.lastUpdateTime = new Date();
        
        // Save job state
        await this.saveJob(job);
        
        this.addLog(job, 'info', `Completed epoch ${epoch + 1}`, {
          trainLoss: epochMetrics.loss,
          validationLoss: validationMetrics.loss,
          accuracy: validationMetrics.accuracy,
        });
      }

      // Complete job
      job.status = 'completed';
      job.completedAt = new Date();
      
      // Final evaluation
      await this.performFinalEvaluation(job);
      
      this.addLog(job, 'info', 'Training completed successfully', {
        totalEpochs: job.progress.currentEpoch,
        totalSteps: currentStep,
        finalMetrics: this.getFinalMetrics(job),
      });

    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Training failed';
      this.addLog(job, 'error', 'Training execution failed', { error: job.error });
      throw error;
    }
  }

  private async simulateEpochTraining(job: FineTuningJob, epoch: number, startStep: number): Promise<any> {
    // Simulate training metrics for one epoch
    const config = job.config;
    const stepsPerEpoch = Math.ceil(job.dataset.trainSize / config.model.parameters.batchSize);
    
    // Simulate improving metrics over time
    const progressFactor = Math.min(1.0, (epoch + 1) / config.training.epochs);
    const noiseFactor = (Math.random() - 0.5) * 0.1; // Add some noise
    
    const baseLoss = 2.0;
    const targetLoss = 0.5;
    const loss = baseLoss - (baseLoss - targetLoss) * progressFactor + noiseFactor;
    
    const baseAccuracy = 0.3;
    const targetAccuracy = 0.85;
    const accuracy = baseAccuracy + (targetAccuracy - baseAccuracy) * progressFactor + noiseFactor * 0.1;
    
    const perplexity = Math.exp(loss);
    const learningRate = config.model.parameters.learningRate * Math.pow(0.95, epoch); // Decay
    const gradientNorm = 1.0 - progressFactor * 0.3 + Math.abs(noiseFactor);

    return {
      steps: stepsPerEpoch,
      loss: Math.max(0.1, loss),
      accuracy: Math.max(0.0, Math.min(1.0, accuracy)),
      perplexity: Math.max(1.0, perplexity),
      learningRate,
      gradientNorm: Math.max(0.1, gradientNorm),
    };
  }

  private async simulateValidation(job: FineTuningJob, epoch: number): Promise<any> {
    // Simulate validation metrics
    const config = job.config;
    const progressFactor = Math.min(1.0, (epoch + 1) / config.training.epochs);
    const noiseFactor = (Math.random() - 0.5) * 0.05; // Less noise than training
    
    const baseLoss = 2.2;
    const targetLoss = 0.6;
    const loss = baseLoss - (baseLoss - targetLoss) * progressFactor + noiseFactor;
    
    const baseAccuracy = 0.25;
    const targetAccuracy = 0.82;
    const accuracy = baseAccuracy + (targetAccuracy - baseAccuracy) * progressFactor + noiseFactor * 0.1;
    
    const perplexity = Math.exp(loss);
    const f1Score = accuracy * 0.95; // Slightly lower than accuracy
    const bleuScore = accuracy * 0.8; // BLEU typically lower

    return {
      loss: Math.max(0.2, loss),
      accuracy: Math.max(0.0, Math.min(1.0, accuracy)),
      perplexity: Math.max(1.0, perplexity),
      f1Score: Math.max(0.0, Math.min(1.0, f1Score)),
      bleuScore: Math.max(0.0, Math.min(1.0, bleuScore)),
    };
  }

  private updateTrainingMetrics(job: FineTuningJob, epochMetrics: any): void {
    job.metrics.training.loss.push(epochMetrics.loss);
    job.metrics.training.accuracy.push(epochMetrics.accuracy);
    job.metrics.training.perplexity.push(epochMetrics.perplexity);
    job.metrics.training.learningRate.push(epochMetrics.learningRate);
    job.metrics.training.gradientNorm.push(epochMetrics.gradientNorm);
  }

  private updateValidationMetrics(job: FineTuningJob, validationMetrics: any): void {
    job.metrics.validation.loss.push(validationMetrics.loss);
    job.metrics.validation.accuracy.push(validationMetrics.accuracy);
    job.metrics.validation.perplexity.push(validationMetrics.perplexity);
    job.metrics.validation.f1Score.push(validationMetrics.f1Score);
    job.metrics.validation.bleuScore.push(validationMetrics.bleuScore);
  }

  private async createCheckpoint(job: FineTuningJob, epoch: number, step: number, trainMetrics: any, valMetrics: any): Promise<void> {
    const checkpointId = `checkpoint_${job.id}_epoch_${epoch}_step_${step}`;
    const fileName = `${checkpointId}.pt`;
    const filePath = path.join(this.basePath, 'checkpoints', fileName);
    
    // Determine if this is the best checkpoint so far
    const isBest = this.isBestCheckpoint(job, valMetrics);
    
    const checkpoint: ModelCheckpoint = {
      id: checkpointId,
      jobId: job.id,
      epoch,
      step,
      metrics: {
        trainLoss: trainMetrics.loss,
        validationLoss: valMetrics.loss,
        accuracy: valMetrics.accuracy,
        f1Score: valMetrics.f1Score,
      },
      filePath,
      size: Math.floor(Math.random() * 1000000 + 500000), // Simulate file size in bytes
      createdAt: new Date(),
      isBest,
      metadata: {
        config: job.config,
        epoch,
        step,
      },
    };

    // Save checkpoint metadata
    await fs.writeFile(
      filePath.replace('.pt', '.json'),
      JSON.stringify(checkpoint, null, 2)
    );

    // Add to job and storage
    job.checkpoints.push(checkpoint);
    const jobCheckpoints = this.checkpoints.get(job.id) || [];
    jobCheckpoints.push(checkpoint);
    this.checkpoints.set(job.id, jobCheckpoints);

    this.addLog(job, 'info', 'Checkpoint created', {
      checkpointId,
      epoch,
      step,
      isBest,
      validationLoss: valMetrics.loss,
      accuracy: valMetrics.accuracy,
    });
  }

  private isBestCheckpoint(job: FineTuningJob, valMetrics: any): boolean {
    const existingCheckpoints = this.checkpoints.get(job.id) || [];
    if (existingCheckpoints.length === 0) return true;
    
    // Find current best based on primary objective
    const primaryObjective = job.config.objectives.primary;
    
    if (primaryObjective === 'accuracy') {
      const bestAccuracy = Math.max(...existingCheckpoints.map(c => c.metrics.accuracy));
      return valMetrics.accuracy > bestAccuracy;
    } else {
      // For loss-based metrics, lower is better
      const bestLoss = Math.min(...existingCheckpoints.map(c => c.metrics.validationLoss));
      return valMetrics.loss < bestLoss;
    }
  }

  private shouldEarlyStop(job: FineTuningJob, valMetrics: any): boolean {
    const config = job.config.regularization;
    const patience = config.earlyStoppingPatience;
    const threshold = config.earlyStoppingThreshold;
    
    const recentMetrics = job.metrics.validation.loss.slice(-patience);
    if (recentMetrics.length < patience) return false;
    
    // Check if validation loss hasn't improved by threshold for patience epochs
    const bestRecentLoss = Math.min(...recentMetrics);
    const currentLoss = valMetrics.loss;
    
    return (currentLoss - bestRecentLoss) < threshold;
  }

  private estimateTimeRemaining(job: FineTuningJob, currentStep: number, totalSteps: number): number {
    if (currentStep === 0) return 0;
    
    const elapsedTime = job.startedAt ? Date.now() - job.startedAt.getTime() : 0;
    const stepsRemaining = totalSteps - currentStep;
    const avgTimePerStep = elapsedTime / currentStep;
    
    return stepsRemaining * avgTimePerStep;
  }

  private async performFinalEvaluation(job: FineTuningJob): Promise<void> {
    // Simulate comprehensive evaluation on test set
    const evaluationId = `eval_${job.id}_final`;
    
    const evaluation: ModelEvaluation = {
      jobId: job.id,
      evaluationId,
      metrics: {
        overall: {
          accuracy: 0.82 + Math.random() * 0.1,
          precision: 0.80 + Math.random() * 0.1,
          recall: 0.78 + Math.random() * 0.1,
          f1Score: 0.79 + Math.random() * 0.1,
          bleuScore: 0.65 + Math.random() * 0.1,
          rougeScore: 0.70 + Math.random() * 0.1,
        },
        domain: this.generateDomainSpecificMetrics(job),
        difficulty: this.generateDifficultySpecificMetrics(job),
        quality: this.generateQualitySpecificMetrics(job),
      },
      comparisons: {
        performanceImprovement: 0.15 + Math.random() * 0.1,
        significanceTest: {
          pValue: 0.01 + Math.random() * 0.02,
          isSignificant: true,
          confidenceInterval: [0.12, 0.18],
        },
      },
      recommendations: this.generateRecommendations(job),
      evaluatedAt: new Date(),
    };

    // Store evaluation
    const jobEvaluations = this.evaluations.get(job.id) || [];
    jobEvaluations.push(evaluation);
    this.evaluations.set(job.id, jobEvaluations);

    // Save evaluation
    const evalPath = path.join(this.basePath, 'evaluations', `${evaluationId}.json`);
    await fs.writeFile(evalPath, JSON.stringify(evaluation, null, 2));

    this.addLog(job, 'info', 'Final evaluation completed', {
      evaluationId,
      overallAccuracy: evaluation.metrics.overall.accuracy,
      improvement: evaluation.comparisons.performanceImprovement,
    });
  }

  private generateDomainSpecificMetrics(job: FineTuningJob): Record<string, any> {
    const domains = job.dataset.domains;
    const metrics: Record<string, any> = {};
    
    for (const domain of domains) {
      metrics[domain] = {
        accuracy: 0.75 + Math.random() * 0.15,
        sampleCount: Math.floor(job.dataset.testSize / domains.length),
        confidence: 0.80 + Math.random() * 0.15,
      };
    }
    
    return metrics;
  }

  private generateDifficultySpecificMetrics(job: FineTuningJob): Record<string, any> {
    return {
      easy: {
        accuracy: 0.90 + Math.random() * 0.08,
        averageConfidence: 0.85 + Math.random() * 0.10,
        errorRate: 0.05 + Math.random() * 0.03,
      },
      medium: {
        accuracy: 0.80 + Math.random() * 0.10,
        averageConfidence: 0.75 + Math.random() * 0.15,
        errorRate: 0.15 + Math.random() * 0.05,
      },
      hard: {
        accuracy: 0.65 + Math.random() * 0.15,
        averageConfidence: 0.60 + Math.random() * 0.20,
        errorRate: 0.25 + Math.random() * 0.10,
      },
    };
  }

  private generateQualitySpecificMetrics(job: FineTuningJob): any {
    return {
      highQuality: {
        accuracy: 0.88 + Math.random() * 0.08,
        count: Math.floor(job.dataset.testSize * 0.4),
      },
      mediumQuality: {
        accuracy: 0.78 + Math.random() * 0.10,
        count: Math.floor(job.dataset.testSize * 0.5),
      },
      lowQuality: {
        accuracy: 0.65 + Math.random() * 0.15,
        count: Math.floor(job.dataset.testSize * 0.1),
      },
    };
  }

  private generateRecommendations(job: FineTuningJob): string[] {
    const recommendations: string[] = [];
    const finalMetrics = this.getFinalMetrics(job);
    
    if (finalMetrics.accuracy < 0.8) {
      recommendations.push('Consider increasing model capacity or training duration');
    }
    
    if (job.metrics.validation.loss[job.metrics.validation.loss.length - 1] > 1.0) {
      recommendations.push('Validation loss is still high; consider more regularization');
    }
    
    if (job.progress.currentEpoch < job.config.training.epochs) {
      recommendations.push('Training stopped early; consider adjusting early stopping criteria');
    }
    
    recommendations.push('Monitor model performance on real-world data');
    recommendations.push('Consider ensemble methods for improved robustness');
    
    return recommendations;
  }

  async startHyperparameterTuning(
    name: string,
    baseConfig: FineTuningConfig,
    searchSpace: HyperparameterTuning['searchSpace'],
    strategy: HyperparameterTuning['strategy'],
    budget: HyperparameterTuning['budget']
  ): Promise<string> {
    try {
      const tuningId = `hp_tuning_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const tuning: HyperparameterTuning = {
        id: tuningId,
        jobIds: [],
        searchSpace,
        strategy,
        objective: baseConfig.objectives.primary,
        budget,
        results: {
          bestParams: {},
          bestScore: strategy === 'grid' ? -Infinity : 0,
          allTrials: [],
        },
        status: 'running',
        createdAt: new Date(),
      };

      this.tuningExperiments.set(tuningId, tuning);

      // Generate parameter combinations based on strategy
      const paramCombinations = this.generateParameterCombinations(searchSpace, strategy, budget.maxTrials);
      
      // Start jobs for each combination
      for (let i = 0; i < Math.min(paramCombinations.length, budget.maxTrials); i++) {
        const params = paramCombinations[i];
        const jobConfig = this.applyParameters(baseConfig, params);
        
        // Create and start job (would need dataset)
        // For now, simulate the trial
        const trial = await this.simulateHyperparameterTrial(params, jobConfig);
        tuning.results.allTrials.push(trial);
        
        // Update best if this trial is better
        if (this.isBetterTrial(trial, tuning.results.bestScore, strategy)) {
          tuning.results.bestParams = params;
          tuning.results.bestScore = trial.score;
        }
      }

      tuning.status = 'completed';
      tuning.completedAt = new Date();

      logger.info('Hyperparameter tuning completed', {
        tuningId,
        trials: tuning.results.allTrials.length,
        bestScore: tuning.results.bestScore,
        bestParams: tuning.results.bestParams,
      });

      return tuningId;
    } catch (error) {
      logger.error('Failed to start hyperparameter tuning', { error, name });
      throw error;
    }
  }

  private generateParameterCombinations(
    searchSpace: HyperparameterTuning['searchSpace'],
    strategy: string,
    maxTrials: number
  ): Array<Record<string, any>> {
    const combinations: Array<Record<string, any>> = [];
    
    if (strategy === 'random') {
      for (let i = 0; i < maxTrials; i++) {
        const params: Record<string, any> = {};
        
        // Learning rate
        if (searchSpace.learningRate.scale === 'log') {
          const logMin = Math.log(searchSpace.learningRate.min);
          const logMax = Math.log(searchSpace.learningRate.max);
          params.learningRate = Math.exp(logMin + Math.random() * (logMax - logMin));
        } else {
          params.learningRate = searchSpace.learningRate.min + 
            Math.random() * (searchSpace.learningRate.max - searchSpace.learningRate.min);
        }
        
        // Batch size
        params.batchSize = searchSpace.batchSize.values[
          Math.floor(Math.random() * searchSpace.batchSize.values.length)
        ];
        
        // Hidden size
        params.hiddenSize = searchSpace.hiddenSize.values[
          Math.floor(Math.random() * searchSpace.hiddenSize.values.length)
        ];
        
        // Number of layers
        params.numLayers = Math.floor(
          searchSpace.numLayers.min + Math.random() * (searchSpace.numLayers.max - searchSpace.numLayers.min + 1)
        );
        
        // Dropout rate
        params.dropoutRate = searchSpace.dropoutRate.min + 
          Math.random() * (searchSpace.dropoutRate.max - searchSpace.dropoutRate.min);
        
        combinations.push(params);
      }
    } else if (strategy === 'grid') {
      // Grid search - simplified for demonstration
      const learningRates = [searchSpace.learningRate.min, 
        (searchSpace.learningRate.min + searchSpace.learningRate.max) / 2, 
        searchSpace.learningRate.max];
      
      for (const lr of learningRates) {
        for (const bs of searchSpace.batchSize.values.slice(0, 2)) {
          for (const hs of searchSpace.hiddenSize.values.slice(0, 2)) {
            if (combinations.length >= maxTrials) break;
            combinations.push({
              learningRate: lr,
              batchSize: bs,
              hiddenSize: hs,
              numLayers: searchSpace.numLayers.min,
              dropoutRate: searchSpace.dropoutRate.min,
            });
          }
        }
      }
    }
    
    return combinations.slice(0, maxTrials);
  }

  private applyParameters(baseConfig: FineTuningConfig, params: Record<string, any>): FineTuningConfig {
    const config = JSON.parse(JSON.stringify(baseConfig)); // Deep copy
    
    if (params.learningRate) config.model.parameters.learningRate = params.learningRate;
    if (params.batchSize) config.model.parameters.batchSize = params.batchSize;
    if (params.hiddenSize) config.model.parameters.hiddenSize = params.hiddenSize;
    if (params.numLayers) config.model.parameters.numLayers = params.numLayers;
    if (params.dropoutRate) config.model.parameters.dropoutRate = params.dropoutRate;
    
    return config;
  }

  private async simulateHyperparameterTrial(params: Record<string, any>, config: FineTuningConfig): Promise<any> {
    // Simulate a hyperparameter trial
    const startTime = Date.now();
    
    // Simple scoring based on parameters (in practice would run actual training)
    let score = 0.7; // Base score
    
    // Learning rate impact
    const optimalLR = 0.001;
    const lrPenalty = Math.abs(Math.log(params.learningRate) - Math.log(optimalLR)) * 0.1;
    score -= lrPenalty;
    
    // Batch size impact
    if (params.batchSize >= 16 && params.batchSize <= 64) score += 0.05;
    
    // Hidden size impact
    if (params.hiddenSize >= 256 && params.hiddenSize <= 512) score += 0.03;
    
    // Add some noise
    score += (Math.random() - 0.5) * 0.1;
    score = Math.max(0.5, Math.min(0.95, score));
    
    const duration = Math.random() * 3600000 + 1800000; // 30min - 90min
    
    return {
      params,
      score,
      duration,
      status: 'completed',
    };
  }

  private isBetterTrial(trial: any, currentBest: number, strategy: string): boolean {
    return trial.score > currentBest;
  }

  private addLog(job: FineTuningJob, level: FineTuningLog['level'], message: string, data?: Record<string, any>): void {
    const log: FineTuningLog = {
      timestamp: new Date(),
      level,
      message,
      data,
    };
    
    job.logs.push(log);
    
    // Also log to main logger
    logger[level](`[Job ${job.id}] ${message}`, data);
  }

  private async validateFineTuningConfig(config: FineTuningConfig, dataset: DatasetSplit): Promise<void> {
    const errors: string[] = [];
    
    // Validate model parameters
    if (config.model.parameters.batchSize > dataset.train.length) {
      errors.push('Batch size cannot be larger than training dataset size');
    }
    
    if (config.model.parameters.learningRate <= 0 || config.model.parameters.learningRate > 1) {
      errors.push('Learning rate must be between 0 and 1');
    }
    
    if (config.training.epochs <= 0) {
      errors.push('Number of epochs must be positive');
    }
    
    if (config.regularization.earlyStoppingPatience <= 0) {
      errors.push('Early stopping patience must be positive');
    }
    
    if (errors.length > 0) {
      throw new MCPError({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Invalid fine-tuning configuration: ${errors.join(', ')}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'validateFineTuningConfig', errors },
      });
    }
  }

  private calculateTotalSteps(trainSize: number, config: FineTuningConfig): number {
    const stepsPerEpoch = Math.ceil(trainSize / config.model.parameters.batchSize);
    return stepsPerEpoch * config.training.epochs;
  }

  private calculateQualityStats(trainData: TrainingDataPoint[]): any {
    const qualities = trainData.map(d => d.metadata.quality);
    return {
      mean: qualities.reduce((a, b) => a + b, 0) / qualities.length,
      std: this.calculateStandardDeviation(qualities),
      min: Math.min(...qualities),
      max: Math.max(...qualities),
    };
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }

  private initializeMetrics(): FineTuningMetrics {
    return {
      training: {
        loss: [],
        accuracy: [],
        perplexity: [],
        learningRate: [],
        gradientNorm: [],
      },
      validation: {
        loss: [],
        accuracy: [],
        perplexity: [],
        f1Score: [],
        bleuScore: [],
      },
      evaluation: {
        domainSpecific: {},
        difficultySpecific: {},
        qualityImprovement: 0,
        convergenceMetrics: {
          stepsToConverge: 0,
          finalLoss: 0,
          stabilityScore: 0,
        },
      },
    };
  }

  private getFinalMetrics(job: FineTuningJob): any {
    const metrics = job.metrics;
    return {
      accuracy: metrics.validation.accuracy[metrics.validation.accuracy.length - 1] || 0,
      loss: metrics.validation.loss[metrics.validation.loss.length - 1] || Infinity,
      f1Score: metrics.validation.f1Score[metrics.validation.f1Score.length - 1] || 0,
    };
  }

  private async saveJob(job: FineTuningJob): Promise<void> {
    const jobPath = path.join(this.basePath, 'jobs', `${job.id}.json`);
    await fs.writeFile(jobPath, JSON.stringify(job, null, 2));
  }

  private async loadExistingJobs(): Promise<void> {
    try {
      const jobsPath = path.join(this.basePath, 'jobs');
      const files = await fs.readdir(jobsPath);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const jobData = JSON.parse(await fs.readFile(path.join(jobsPath, file), 'utf-8'));
            this.jobs.set(jobData.id, jobData);
          } catch (error) {
            logger.warn('Failed to load job file', { file, error });
          }
        }
      }
    } catch (error) {
      // Jobs directory might not exist yet
      logger.debug('No existing jobs found', { error });
    }
  }

  // Public API methods
  getJob(jobId: string): FineTuningJob | undefined {
    return this.jobs.get(jobId);
  }

  getJobs(): FineTuningJob[] {
    return Array.from(this.jobs.values());
  }

  getJobsByStatus(status: FineTuningJob['status']): FineTuningJob[] {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  getCheckpoints(jobId: string): ModelCheckpoint[] {
    return this.checkpoints.get(jobId) || [];
  }

  getBestCheckpoint(jobId: string): ModelCheckpoint | undefined {
    const checkpoints = this.getCheckpoints(jobId);
    return checkpoints.find(cp => cp.isBest);
  }

  getEvaluations(jobId: string): ModelEvaluation[] {
    return this.evaluations.get(jobId) || [];
  }

  getHyperparameterTuning(tuningId: string): HyperparameterTuning | undefined {
    return this.tuningExperiments.get(tuningId);
  }

  async cancelJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (job && job.status === 'running') {
      job.status = 'cancelled';
      this.addLog(job, 'info', 'Job cancelled by user');
      await this.saveJob(job);
    }
  }

  async getFineTuningStats(): Promise<{
    totalJobs: number;
    jobsByStatus: Record<string, number>;
    totalCheckpoints: number;
    totalEvaluations: number;
    averageTrainingTime: number;
    successRate: number;
  }> {
    const jobs = Array.from(this.jobs.values());
    const statusCounts = jobs.reduce((acc, job) => {
      acc[job.status] = (acc[job.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const completedJobs = jobs.filter(j => j.status === 'completed');
    const averageTrainingTime = completedJobs.length > 0 ? 
      completedJobs.reduce((sum, job) => {
        const duration = job.completedAt && job.startedAt ? 
          job.completedAt.getTime() - job.startedAt.getTime() : 0;
        return sum + duration;
      }, 0) / completedJobs.length : 0;

    const successRate = jobs.length > 0 ? completedJobs.length / jobs.length : 0;

    return {
      totalJobs: jobs.length,
      jobsByStatus: statusCounts,
      totalCheckpoints: Array.from(this.checkpoints.values()).reduce((sum, cps) => sum + cps.length, 0),
      totalEvaluations: Array.from(this.evaluations.values()).reduce((sum, evals) => sum + evals.length, 0),
      averageTrainingTime,
      successRate,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = await this.getFineTuningStats();
      const runningJobs = this.getJobsByStatus('running').length;
      
      return {
        healthy: true,
        details: {
          ...stats,
          runningJobs,
          basePath: this.basePath,
          service: 'model-finetuning-engine',
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'model-finetuning-engine',
        },
      };
    }
  }
}