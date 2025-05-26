import { DatabasePool } from '../../../database/pg-pool.js';
import { RedisConnectionManager } from '../../../database/redis-client.js';
import { getLogger } from '../../../shared/logger.js';
import { BaseMCPServer } from '../../../shared/mcp/server.js';

const logger = getLogger('LossFunctionManager');

export interface LossFunction {
  id: string;
  name: string;
  type: 'classification' | 'regression' | 'ranking' | 'generative' | 'custom';
  category: 'cross_entropy' | 'mse' | 'mae' | 'huber' | 'hinge' | 'focal' | 'dice' | 'wasserstein' | 'contrastive' | 'triplet';
  formula: string;
  implementation: LossFunctionImplementation;
  hyperparameters: LossHyperparameters;
  metadata: {
    description: string;
    useCases: string[];
    advantages: string[];
    disadvantages: string[];
    paperReference?: string;
    stabilityNotes: string[];
  };
}

export interface LossFunctionImplementation {
  forwardPass: string; // Mathematical formula or code
  backwardPass: string; // Gradient computation
  numericalStability: {
    epsilon: number;
    logClipping: { min: number; max: number };
    gradientClipping: { enabled: boolean; threshold: number };
  };
  optimizations: {
    vectorized: boolean;
    gpuAccelerated: boolean;
    memoryEfficient: boolean;
  };
}

export interface LossHyperparameters {
  alpha?: number;
  beta?: number;
  gamma?: number;
  delta?: number;
  epsilon?: number;
  temperature?: number;
  margin?: number;
  reduction: 'mean' | 'sum' | 'none';
  weightDecay?: number;
  classWeights?: number[];
  labelSmoothing?: number;
}

export interface LossEvaluation {
  functionId: string;
  taskType: string;
  datasetId: string;
  metrics: {
    convergenceSpeed: number;
    finalLoss: number;
    stability: number;
    gradientQuality: number;
    numericalStability: number;
  };
  performance: {
    computationTime: number;
    memoryUsage: number;
    gpuUtilization: number;
  };
  behaviorAnalysis: {
    plateauDetected: boolean;
    oscillationDetected: boolean;
    explodingGradients: boolean;
    vanishingGradients: boolean;
  };
  timestamp: Date;
}

export interface AdaptiveLossConfig {
  id: string;
  baseFunctionId: string;
  adaptationStrategy: 'dynamic_weighting' | 'curriculum_learning' | 'focal_adaptation' | 'temperature_scaling';
  adaptationParams: {
    updateFrequency: number;
    adaptationRate: number;
    stabilityThreshold: number;
    performanceTarget: number;
  };
  conditions: AdaptationCondition[];
  history: LossAdaptation[];
}

export interface AdaptationCondition {
  metric: 'loss_plateau' | 'gradient_magnitude' | 'accuracy_stagnation' | 'class_imbalance';
  threshold: number;
  operator: 'greater' | 'less' | 'equal';
  duration: number; // Number of epochs
}

export interface LossAdaptation {
  epoch: number;
  trigger: string;
  oldParams: any;
  newParams: any;
  expectedImprovement: string;
  actualImpact: number;
}

export interface LossCombination {
  id: string;
  name: string;
  functions: {
    functionId: string;
    weight: number;
    schedule: 'constant' | 'linear' | 'exponential' | 'cosine';
  }[];
  combinationStrategy: 'weighted_sum' | 'alternating' | 'hierarchical' | 'gate_based';
  metadata: {
    description: string;
    useCase: string;
    expectedBenefits: string[];
  };
}

export class LossFunctionManager extends BaseMCPServer {
  private dbPool: DatabasePool;
  private redis: RedisConnectionManager;
  private lossFunctions: Map<string, LossFunction> = new Map();
  private evaluations: Map<string, LossEvaluation[]> = new Map();
  private adaptiveLosses: Map<string, AdaptiveLossConfig> = new Map();
  private combinations: Map<string, LossCombination> = new Map();
  private compiledFunctions: Map<string, Function> = new Map();

  constructor(dbPool: DatabasePool, redis: RedisConnectionManager, options: any = {}) {
    super('loss-function-manager', options);
    this.dbPool = dbPool;
    this.redis = redis;
    this.initializeStandardLosses();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.addTool('create_loss_function', {
      description: 'Create a custom loss function with hyperparameters',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['classification', 'regression', 'ranking', 'generative', 'custom'] },
          category: { type: 'string' },
          formula: { type: 'string' },
          hyperparameters: { type: 'object' },
          implementation: { type: 'object' }
        },
        required: ['name', 'type', 'category', 'formula']
      }
    }, this.createLossFunction.bind(this));

    this.addTool('evaluate_loss_function', {
      description: 'Evaluate loss function performance on a dataset',
      parameters: {
        type: 'object',
        properties: {
          functionId: { type: 'string' },
          datasetId: { type: 'string' },
          taskType: { type: 'string' },
          evaluationConfig: { type: 'object' }
        },
        required: ['functionId', 'datasetId', 'taskType']
      }
    }, this.evaluateLossFunction.bind(this));

    this.addTool('recommend_loss_function', {
      description: 'Recommend optimal loss function for a specific task and dataset',
      parameters: {
        type: 'object',
        properties: {
          taskType: { type: 'string' },
          datasetCharacteristics: { type: 'object' },
          performanceRequirements: { type: 'object' },
          constraints: { type: 'object' }
        },
        required: ['taskType', 'datasetCharacteristics']
      }
    }, this.recommendLossFunction.bind(this));

    this.addTool('create_adaptive_loss', {
      description: 'Create adaptive loss function that adjusts during training',
      parameters: {
        type: 'object',
        properties: {
          baseFunctionId: { type: 'string' },
          adaptationStrategy: { type: 'string' },
          adaptationParams: { type: 'object' },
          conditions: { type: 'array' }
        },
        required: ['baseFunctionId', 'adaptationStrategy']
      }
    }, this.createAdaptiveLoss.bind(this));

    this.addTool('combine_loss_functions', {
      description: 'Combine multiple loss functions with custom weighting',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          functions: { type: 'array' },
          combinationStrategy: { type: 'string' },
          metadata: { type: 'object' }
        },
        required: ['name', 'functions', 'combinationStrategy']
      }
    }, this.combineLossFunctions.bind(this));

    this.addTool('analyze_loss_landscape', {
      description: 'Analyze loss landscape properties and optimization difficulty',
      parameters: {
        type: 'object',
        properties: {
          functionId: { type: 'string' },
          networkId: { type: 'string' },
          analysisType: { type: 'string', enum: ['curvature', 'sharpness', 'smoothness', 'gradient_flow'] }
        },
        required: ['functionId', 'networkId', 'analysisType']
      }
    }, this.analyzeLossLandscape.bind(this));
  }

  private initializeStandardLosses(): void {
    // Cross-Entropy Loss
    this.lossFunctions.set('cross_entropy', {
      id: 'cross_entropy',
      name: 'Cross-Entropy Loss',
      type: 'classification',
      category: 'cross_entropy',
      formula: '-Σ(y_true * log(y_pred + ε))',
      implementation: {
        forwardPass: 'Math.sum(y_true * Math.log(y_pred + epsilon))',
        backwardPass: '(y_pred - y_true) / batch_size',
        numericalStability: {
          epsilon: 1e-15,
          logClipping: { min: 1e-15, max: 1 - 1e-15 },
          gradientClipping: { enabled: false, threshold: 1.0 }
        },
        optimizations: {
          vectorized: true,
          gpuAccelerated: true,
          memoryEfficient: true
        }
      },
      hyperparameters: {
        reduction: 'mean',
        epsilon: 1e-15,
        labelSmoothing: 0
      },
      metadata: {
        description: 'Standard cross-entropy loss for multi-class classification',
        useCases: ['Multi-class classification', 'Probability calibration'],
        advantages: ['Well-established', 'Probability interpretation', 'Fast convergence'],
        disadvantages: ['Sensitive to outliers', 'Can be overconfident'],
        paperReference: 'Shannon (1948) - Mathematical Theory of Communication',
        stabilityNotes: ['Use log-sum-exp trick for numerical stability']
      }
    });

    // Focal Loss
    this.lossFunctions.set('focal_loss', {
      id: 'focal_loss',
      name: 'Focal Loss',
      type: 'classification',
      category: 'focal',
      formula: '-α(1-p_t)^γ * log(p_t)',
      implementation: {
        forwardPass: '-alpha * Math.pow(1 - p_t, gamma) * Math.log(p_t + epsilon)',
        backwardPass: 'alpha * gamma * Math.pow(1 - p_t, gamma - 1) * Math.log(p_t) + alpha * Math.pow(1 - p_t, gamma) / p_t',
        numericalStability: {
          epsilon: 1e-8,
          logClipping: { min: 1e-8, max: 1 - 1e-8 },
          gradientClipping: { enabled: true, threshold: 10.0 }
        },
        optimizations: {
          vectorized: true,
          gpuAccelerated: true,
          memoryEfficient: true
        }
      },
      hyperparameters: {
        alpha: 1.0,
        gamma: 2.0,
        reduction: 'mean',
        epsilon: 1e-8
      },
      metadata: {
        description: 'Focal loss for addressing class imbalance by down-weighting easy examples',
        useCases: ['Imbalanced classification', 'Object detection', 'Hard example mining'],
        advantages: ['Handles class imbalance', 'Focuses on hard examples', 'Improved performance on rare classes'],
        disadvantages: ['Additional hyperparameters', 'More complex than cross-entropy'],
        paperReference: 'Lin et al. (2017) - Focal Loss for Dense Object Detection',
        stabilityNotes: ['Gamma parameter affects gradient magnitude', 'Monitor for gradient explosion']
      }
    });

    // Huber Loss
    this.lossFunctions.set('huber_loss', {
      id: 'huber_loss',
      name: 'Huber Loss',
      type: 'regression',
      category: 'huber',
      formula: '0.5 * (y_true - y_pred)^2 if |y_true - y_pred| <= δ, else δ * (|y_true - y_pred| - 0.5 * δ)',
      implementation: {
        forwardPass: 'Math.abs(residual) <= delta ? 0.5 * residual^2 : delta * (Math.abs(residual) - 0.5 * delta)',
        backwardPass: 'Math.abs(residual) <= delta ? residual : delta * Math.sign(residual)',
        numericalStability: {
          epsilon: 1e-8,
          logClipping: { min: -1e6, max: 1e6 },
          gradientClipping: { enabled: false, threshold: 1.0 }
        },
        optimizations: {
          vectorized: true,
          gpuAccelerated: true,
          memoryEfficient: true
        }
      },
      hyperparameters: {
        delta: 1.0,
        reduction: 'mean'
      },
      metadata: {
        description: 'Robust loss function that is quadratic for small errors and linear for large errors',
        useCases: ['Robust regression', 'Outlier-resistant training', 'Value function approximation'],
        advantages: ['Robust to outliers', 'Smooth gradient', 'Combines MSE and MAE benefits'],
        disadvantages: ['Additional hyperparameter (delta)', 'Less interpretable than MSE'],
        paperReference: 'Huber (1964) - Robust Estimation of a Location Parameter',
        stabilityNotes: ['Delta parameter controls transition point']
      }
    });

    // Contrastive Loss
    this.lossFunctions.set('contrastive_loss', {
      id: 'contrastive_loss',
      name: 'Contrastive Loss',
      type: 'ranking',
      category: 'contrastive',
      formula: '(1-Y) * 0.5 * D^2 + Y * 0.5 * max(0, margin - D)^2',
      implementation: {
        forwardPass: '(1 - label) * 0.5 * distance^2 + label * 0.5 * Math.max(0, margin - distance)^2',
        backwardPass: '(1 - label) * distance + label * Math.max(0, margin - distance) * (-1)',
        numericalStability: {
          epsilon: 1e-8,
          logClipping: { min: 0, max: 1e6 },
          gradientClipping: { enabled: true, threshold: 10.0 }
        },
        optimizations: {
          vectorized: true,
          gpuAccelerated: true,
          memoryEfficient: false
        }
      },
      hyperparameters: {
        margin: 1.0,
        reduction: 'mean'
      },
      metadata: {
        description: 'Loss for learning embeddings that bring similar pairs closer and push dissimilar pairs apart',
        useCases: ['Siamese networks', 'Face verification', 'Similarity learning'],
        advantages: ['Effective for similarity learning', 'Clear geometric interpretation'],
        disadvantages: ['Requires pair generation', 'Sensitive to margin parameter'],
        paperReference: 'Hadsell et al. (2006) - Dimensionality Reduction by Learning an Invariant Mapping',
        stabilityNotes: ['Margin parameter affects convergence speed']
      }
    });
  }

  async createLossFunction(params: any): Promise<any> {
    try {
      const functionId = `loss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const lossFunction: LossFunction = {
        id: functionId,
        name: params.name,
        type: params.type,
        category: params.category,
        formula: params.formula,
        implementation: params.implementation || this.generateDefaultImplementation(params.formula),
        hyperparameters: params.hyperparameters || this.getDefaultHyperparameters(params.category),
        metadata: {
          description: params.description || '',
          useCases: params.useCases || [],
          advantages: params.advantages || [],
          disadvantages: params.disadvantages || [],
          paperReference: params.paperReference,
          stabilityNotes: params.stabilityNotes || []
        }
      };

      // Validate loss function
      const validation = this.validateLossFunction(lossFunction);
      if (!validation.isValid) {
        throw new Error(`Invalid loss function: ${validation.errors.join(', ')}`);
      }

      // Compile function for efficient execution
      const compiledFunction = this.compileLossFunction(lossFunction);
      this.compiledFunctions.set(functionId, compiledFunction);

      this.lossFunctions.set(functionId, lossFunction);
      await this.storeLossFunction(lossFunction);

      return {
        success: true,
        functionId,
        lossFunction,
        validation,
        compilationStatus: 'successful'
      };
    } catch (error) {
      logger.error('Error creating loss function:', error);
      throw error;
    }
  }

  async evaluateLossFunction(params: any): Promise<any> {
    try {
      const { functionId, datasetId, taskType, evaluationConfig = {} } = params;
      
      const lossFunction = this.lossFunctions.get(functionId);
      if (!lossFunction) {
        throw new Error(`Loss function not found: ${functionId}`);
      }

      // Simulate evaluation process
      const evaluation = await this.performLossEvaluation(lossFunction, datasetId, taskType, evaluationConfig);
      
      // Store evaluation results
      if (!this.evaluations.has(functionId)) {
        this.evaluations.set(functionId, []);
      }
      this.evaluations.get(functionId)!.push(evaluation);

      // Compare with baseline functions
      const comparison = await this.compareWithBaselines(evaluation, taskType);

      return {
        success: true,
        evaluation,
        comparison,
        recommendations: this.generateEvaluationRecommendations(evaluation)
      };
    } catch (error) {
      logger.error('Error evaluating loss function:', error);
      throw error;
    }
  }

  async recommendLossFunction(params: any): Promise<any> {
    try {
      const { taskType, datasetCharacteristics, performanceRequirements = {}, constraints = {} } = params;
      
      // Analyze dataset characteristics
      const datasetAnalysis = this.analyzeDatasetCharacteristics(datasetCharacteristics);
      
      // Score all available loss functions
      const candidates = Array.from(this.lossFunctions.values())
        .filter(lf => this.isCompatible(lf, taskType, datasetAnalysis))
        .map(lf => ({
          lossFunction: lf,
          score: this.scoreLossFunction(lf, taskType, datasetAnalysis, performanceRequirements),
          reasoning: this.generateRecommendationReasoning(lf, taskType, datasetAnalysis)
        }))
        .sort((a, b) => b.score - a.score);

      const topRecommendations = candidates.slice(0, 3);
      
      // Generate custom loss function if needed
      const customSuggestion = await this.suggestCustomLoss(taskType, datasetAnalysis, performanceRequirements);

      return {
        success: true,
        recommendations: topRecommendations,
        datasetAnalysis,
        customSuggestion,
        alternativeApproaches: this.suggestAlternativeApproaches(taskType, datasetAnalysis)
      };
    } catch (error) {
      logger.error('Error recommending loss function:', error);
      throw error;
    }
  }

  async createAdaptiveLoss(params: any): Promise<any> {
    try {
      const { baseFunctionId, adaptationStrategy, adaptationParams = {}, conditions = [] } = params;
      
      const baseFunction = this.lossFunctions.get(baseFunctionId);
      if (!baseFunction) {
        throw new Error(`Base loss function not found: ${baseFunctionId}`);
      }

      const adaptiveId = `adaptive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const adaptiveConfig: AdaptiveLossConfig = {
        id: adaptiveId,
        baseFunctionId,
        adaptationStrategy,
        adaptationParams: {
          updateFrequency: adaptationParams.updateFrequency || 10,
          adaptationRate: adaptationParams.adaptationRate || 0.1,
          stabilityThreshold: adaptationParams.stabilityThreshold || 0.01,
          performanceTarget: adaptationParams.performanceTarget || 0.95,
          ...adaptationParams
        },
        conditions: conditions.map(this.parseAdaptationCondition),
        history: []
      };

      this.adaptiveLosses.set(adaptiveId, adaptiveConfig);
      await this.storeAdaptiveLoss(adaptiveConfig);

      return {
        success: true,
        adaptiveId,
        config: adaptiveConfig,
        estimatedBenefits: this.estimateAdaptiveBenefits(adaptiveConfig, baseFunction)
      };
    } catch (error) {
      logger.error('Error creating adaptive loss:', error);
      throw error;
    }
  }

  async combineLossFunctions(params: any): Promise<any> {
    try {
      const { name, functions, combinationStrategy, metadata = {} } = params;
      
      // Validate all component functions exist
      for (const func of functions) {
        if (!this.lossFunctions.has(func.functionId)) {
          throw new Error(`Loss function not found: ${func.functionId}`);
        }
      }

      const combinationId = `combo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const combination: LossCombination = {
        id: combinationId,
        name,
        functions: functions.map((f: any) => ({
          functionId: f.functionId,
          weight: f.weight || 1.0,
          schedule: f.schedule || 'constant'
        })),
        combinationStrategy,
        metadata: {
          description: metadata.description || '',
          useCase: metadata.useCase || '',
          expectedBenefits: metadata.expectedBenefits || []
        }
      };

      // Validate combination
      const validation = this.validateLossCombination(combination);
      if (!validation.isValid) {
        throw new Error(`Invalid loss combination: ${validation.errors.join(', ')}`);
      }

      this.combinations.set(combinationId, combination);
      await this.storeLossCombination(combination);

      // Generate combined implementation
      const combinedImplementation = this.generateCombinedImplementation(combination);

      return {
        success: true,
        combinationId,
        combination,
        implementation: combinedImplementation,
        validation
      };
    } catch (error) {
      logger.error('Error combining loss functions:', error);
      throw error;
    }
  }

  async analyzeLossLandscape(params: any): Promise<any> {
    try {
      const { functionId, networkId, analysisType } = params;
      
      const lossFunction = this.lossFunctions.get(functionId);
      if (!lossFunction) {
        throw new Error(`Loss function not found: ${functionId}`);
      }

      let analysis: any;

      switch (analysisType) {
        case 'curvature':
          analysis = await this.analyzeCurvature(lossFunction, networkId);
          break;
        case 'sharpness':
          analysis = await this.analyzeSharpness(lossFunction, networkId);
          break;
        case 'smoothness':
          analysis = await this.analyzeSmoothness(lossFunction, networkId);
          break;
        case 'gradient_flow':
          analysis = await this.analyzeGradientFlow(lossFunction, networkId);
          break;
        default:
          throw new Error(`Unsupported analysis type: ${analysisType}`);
      }

      const optimizationDifficulty = this.assessOptimizationDifficulty(analysis);
      const recommendations = this.generateLandscapeRecommendations(analysis, optimizationDifficulty);

      return {
        success: true,
        analysis,
        optimizationDifficulty,
        recommendations
      };
    } catch (error) {
      logger.error('Error analyzing loss landscape:', error);
      throw error;
    }
  }

  private generateDefaultImplementation(formula: string): LossFunctionImplementation {
    return {
      forwardPass: formula,
      backwardPass: 'auto_differentiation', // Placeholder for automatic differentiation
      numericalStability: {
        epsilon: 1e-8,
        logClipping: { min: 1e-8, max: 1e8 },
        gradientClipping: { enabled: false, threshold: 1.0 }
      },
      optimizations: {
        vectorized: true,
        gpuAccelerated: false,
        memoryEfficient: true
      }
    };
  }

  private getDefaultHyperparameters(category: string): LossHyperparameters {
    const defaults: LossHyperparameters = {
      reduction: 'mean'
    };

    switch (category) {
      case 'focal':
        return { ...defaults, alpha: 1.0, gamma: 2.0 };
      case 'huber':
        return { ...defaults, delta: 1.0 };
      case 'contrastive':
        return { ...defaults, margin: 1.0 };
      default:
        return defaults;
    }
  }

  private validateLossFunction(lossFunction: LossFunction): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!lossFunction.name.trim()) {
      errors.push('Loss function name cannot be empty');
    }

    if (!lossFunction.formula.trim()) {
      errors.push('Loss function formula cannot be empty');
    }

    if (lossFunction.hyperparameters.reduction && 
        !['mean', 'sum', 'none'].includes(lossFunction.hyperparameters.reduction)) {
      errors.push('Invalid reduction type');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private compileLossFunction(lossFunction: LossFunction): Function {
    // Simplified compilation - in practice, this would generate optimized code
    return new Function('y_true', 'y_pred', 'params', `
      // Generated loss function for ${lossFunction.name}
      const epsilon = params.epsilon || 1e-8;
      const reduction = params.reduction || 'mean';
      
      // Implementation placeholder
      let loss = 0;
      
      // Apply reduction
      if (reduction === 'mean') {
        return loss / y_true.length;
      } else if (reduction === 'sum') {
        return loss;
      }
      return loss;
    `);
  }

  private async performLossEvaluation(lossFunction: LossFunction, datasetId: string, taskType: string, config: any): Promise<LossEvaluation> {
    // Simulate evaluation metrics
    const evaluation: LossEvaluation = {
      functionId: lossFunction.id,
      taskType,
      datasetId,
      metrics: {
        convergenceSpeed: 0.7 + Math.random() * 0.3,
        finalLoss: Math.random() * 0.5,
        stability: 0.8 + Math.random() * 0.2,
        gradientQuality: 0.6 + Math.random() * 0.4,
        numericalStability: 0.9 + Math.random() * 0.1
      },
      performance: {
        computationTime: 10 + Math.random() * 50, // ms
        memoryUsage: 100 + Math.random() * 500, // MB
        gpuUtilization: Math.random() * 100 // %
      },
      behaviorAnalysis: {
        plateauDetected: Math.random() < 0.2,
        oscillationDetected: Math.random() < 0.15,
        explodingGradients: Math.random() < 0.1,
        vanishingGradients: Math.random() < 0.1
      },
      timestamp: new Date()
    };

    return evaluation;
  }

  private async compareWithBaselines(evaluation: LossEvaluation, taskType: string): Promise<any> {
    const baselines = this.getBaselineFunctions(taskType);
    const comparisons = baselines.map(baseline => ({
      baselineId: baseline.id,
      baselineName: baseline.name,
      convergenceSpeedRatio: evaluation.metrics.convergenceSpeed / (0.7 + Math.random() * 0.2),
      finalLossRatio: evaluation.metrics.finalLoss / (0.3 + Math.random() * 0.4),
      stabilityRatio: evaluation.metrics.stability / (0.8 + Math.random() * 0.1)
    }));

    return {
      baselines: comparisons,
      ranking: this.rankAgainstBaselines(evaluation, baselines),
      improvements: this.identifyImprovements(evaluation, baselines)
    };
  }

  private getBaselineFunctions(taskType: string): LossFunction[] {
    switch (taskType) {
      case 'classification':
        return [this.lossFunctions.get('cross_entropy')!].filter(Boolean);
      case 'regression':
        return [this.lossFunctions.get('huber_loss')!].filter(Boolean);
      default:
        return Array.from(this.lossFunctions.values()).slice(0, 2);
    }
  }

  private rankAgainstBaselines(evaluation: LossEvaluation, baselines: LossFunction[]): string {
    const overallScore = (
      evaluation.metrics.convergenceSpeed +
      (1 - evaluation.metrics.finalLoss) +
      evaluation.metrics.stability +
      evaluation.metrics.gradientQuality
    ) / 4;

    if (overallScore > 0.8) return 'excellent';
    if (overallScore > 0.6) return 'good';
    if (overallScore > 0.4) return 'fair';
    return 'poor';
  }

  private identifyImprovements(evaluation: LossEvaluation, baselines: LossFunction[]): string[] {
    const improvements: string[] = [];

    if (evaluation.metrics.convergenceSpeed > 0.8) {
      improvements.push('Faster convergence than baselines');
    }
    if (evaluation.metrics.stability > 0.9) {
      improvements.push('More stable training than baselines');
    }
    if (evaluation.performance.computationTime < 20) {
      improvements.push('Lower computational overhead');
    }

    return improvements;
  }

  private generateEvaluationRecommendations(evaluation: LossEvaluation): string[] {
    const recommendations: string[] = [];

    if (evaluation.behaviorAnalysis.plateauDetected) {
      recommendations.push('Consider learning rate scheduling to avoid plateaus');
    }
    if (evaluation.behaviorAnalysis.oscillationDetected) {
      recommendations.push('Reduce learning rate or increase batch size to reduce oscillations');
    }
    if (evaluation.metrics.numericalStability < 0.8) {
      recommendations.push('Improve numerical stability with better epsilon values or gradient clipping');
    }
    if (evaluation.performance.memoryUsage > 400) {
      recommendations.push('Optimize memory usage for better scalability');
    }

    return recommendations;
  }

  private analyzeDatasetCharacteristics(characteristics: any): any {
    return {
      size: characteristics.size || 'medium',
      imbalance: characteristics.imbalance || 'balanced',
      noisiness: characteristics.noisiness || 'low',
      complexity: characteristics.complexity || 'medium',
      outliers: characteristics.outliers || 'few',
      distribution: characteristics.distribution || 'normal'
    };
  }

  private isCompatible(lossFunction: LossFunction, taskType: string, datasetAnalysis: any): boolean {
    // Task type compatibility
    if (lossFunction.type !== taskType && lossFunction.type !== 'custom') {
      return false;
    }

    // Dataset-specific compatibility checks
    if (datasetAnalysis.imbalance === 'high' && lossFunction.category !== 'focal') {
      // Focal loss is preferred for imbalanced datasets
      return lossFunction.category === 'cross_entropy'; // Still compatible but not optimal
    }

    return true;
  }

  private scoreLossFunction(lossFunction: LossFunction, taskType: string, datasetAnalysis: any, requirements: any): number {
    let score = 0.5; // Base score

    // Task type alignment
    if (lossFunction.type === taskType) score += 0.2;

    // Dataset-specific scoring
    if (datasetAnalysis.imbalance === 'high' && lossFunction.category === 'focal') score += 0.3;
    if (datasetAnalysis.outliers === 'many' && lossFunction.category === 'huber') score += 0.2;
    if (datasetAnalysis.noisiness === 'high' && lossFunction.metadata.advantages.includes('Robust to outliers')) score += 0.2;

    // Performance requirements
    if (requirements.speed === 'high' && lossFunction.implementation.optimizations.vectorized) score += 0.1;
    if (requirements.memory === 'low' && lossFunction.implementation.optimizations.memoryEfficient) score += 0.1;

    return Math.min(1.0, score);
  }

  private generateRecommendationReasoning(lossFunction: LossFunction, taskType: string, datasetAnalysis: any): string[] {
    const reasoning: string[] = [];

    if (lossFunction.type === taskType) {
      reasoning.push(`Designed specifically for ${taskType} tasks`);
    }

    if (datasetAnalysis.imbalance === 'high' && lossFunction.category === 'focal') {
      reasoning.push('Focal loss handles class imbalance by focusing on hard examples');
    }

    if (datasetAnalysis.outliers === 'many' && lossFunction.category === 'huber') {
      reasoning.push('Huber loss is robust to outliers compared to MSE');
    }

    reasoning.push(...lossFunction.metadata.advantages);

    return reasoning;
  }

  private async suggestCustomLoss(taskType: string, datasetAnalysis: any, requirements: any): Promise<any> {
    const suggestions: any = {
      recommended: false,
      reason: '',
      customFormula: '',
      hyperparameters: {}
    };

    if (datasetAnalysis.imbalance === 'extreme' && taskType === 'classification') {
      suggestions.recommended = true;
      suggestions.reason = 'Extreme class imbalance requires custom focal loss variant';
      suggestions.customFormula = '-α_i * (1-p_t)^γ * log(p_t) with class-specific α_i';
      suggestions.hyperparameters = {
        alpha: 'class_frequencies_inverse',
        gamma: 3.0,
        epsilon: 1e-8
      };
    }

    if (datasetAnalysis.noisiness === 'extreme' && taskType === 'regression') {
      suggestions.recommended = true;
      suggestions.reason = 'High noise levels require robust loss with adaptive threshold';
      suggestions.customFormula = 'Adaptive Huber with dynamic δ based on gradient magnitude';
      suggestions.hyperparameters = {
        initial_delta: 1.0,
        adaptation_rate: 0.01,
        min_delta: 0.1,
        max_delta: 10.0
      };
    }

    return suggestions;
  }

  private suggestAlternativeApproaches(taskType: string, datasetAnalysis: any): string[] {
    const alternatives: string[] = [];

    if (datasetAnalysis.imbalance === 'high') {
      alternatives.push('Consider data augmentation or resampling techniques');
      alternatives.push('Use class weights in addition to appropriate loss function');
    }

    if (datasetAnalysis.noisiness === 'high') {
      alternatives.push('Apply data cleaning and preprocessing');
      alternatives.push('Use ensemble methods for robustness');
    }

    if (datasetAnalysis.size === 'small') {
      alternatives.push('Consider transfer learning or pre-trained models');
      alternatives.push('Use regularization techniques to prevent overfitting');
    }

    return alternatives;
  }

  private parseAdaptationCondition(condition: any): AdaptationCondition {
    return {
      metric: condition.metric,
      threshold: condition.threshold,
      operator: condition.operator || 'greater',
      duration: condition.duration || 5
    };
  }

  private estimateAdaptiveBenefits(config: AdaptiveLossConfig, baseFunction: LossFunction): string[] {
    const benefits: string[] = [];

    switch (config.adaptationStrategy) {
      case 'dynamic_weighting':
        benefits.push('Automatically adjusts loss weights based on training progress');
        benefits.push('Better handling of multi-task objectives');
        break;
      case 'curriculum_learning':
        benefits.push('Gradually increases training difficulty');
        benefits.push('Improved convergence for complex tasks');
        break;
      case 'focal_adaptation':
        benefits.push('Dynamically adjusts focus on hard examples');
        benefits.push('Better performance on imbalanced datasets');
        break;
      case 'temperature_scaling':
        benefits.push('Improves probability calibration');
        benefits.push('Better uncertainty estimation');
        break;
    }

    return benefits;
  }

  private validateLossCombination(combination: LossCombination): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (combination.functions.length === 0) {
      errors.push('Loss combination must include at least one function');
    }

    const totalWeight = combination.functions.reduce((sum, f) => sum + f.weight, 0);
    if (Math.abs(totalWeight - 1.0) > 1e-6 && combination.combinationStrategy === 'weighted_sum') {
      errors.push('Weights must sum to 1.0 for weighted_sum strategy');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private generateCombinedImplementation(combination: LossCombination): string {
    const functionCalls = combination.functions.map(f => 
      `${f.weight} * ${f.functionId}(y_true, y_pred)`
    );

    switch (combination.combinationStrategy) {
      case 'weighted_sum':
        return `(${functionCalls.join(' + ')})`;
      case 'alternating':
        return `epoch % ${combination.functions.length} === 0 ? ${functionCalls[0]} : ...`;
      default:
        return `combined_loss(${functionCalls.join(', ')})`;
    }
  }

  private async analyzeCurvature(lossFunction: LossFunction, networkId: string): Promise<any> {
    // Simulate curvature analysis
    return {
      hessianEigenvalues: Array.from({length: 10}, () => Math.random() * 100),
      conditionNumber: 10 + Math.random() * 1000,
      curvatureType: Math.random() > 0.5 ? 'convex_region' : 'non_convex_region',
      sharpness: Math.random() * 10
    };
  }

  private async analyzeSharpness(lossFunction: LossFunction, networkId: string): Promise<any> {
    return {
      sharpnessMetric: Math.random() * 100,
      flatnessScore: Math.random(),
      generalizationIndicator: 0.5 + Math.random() * 0.5
    };
  }

  private async analyzeSmoothness(lossFunction: LossFunction, networkId: string): Promise<any> {
    return {
      lipschitzConstant: 1 + Math.random() * 10,
      smoothnessScore: Math.random(),
      gradientVariance: Math.random() * 0.1
    };
  }

  private async analyzeGradientFlow(lossFunction: LossFunction, networkId: string): Promise<any> {
    return {
      flowDirection: 'towards_minimum',
      flowMagnitude: Math.random() * 5,
      attractorBasin: 'wide',
      escapeProbability: Math.random() * 0.1
    };
  }

  private assessOptimizationDifficulty(analysis: any): string {
    // Simplified assessment based on analysis results
    if (analysis.conditionNumber && analysis.conditionNumber > 1000) return 'very_hard';
    if (analysis.sharpnessMetric && analysis.sharpnessMetric > 50) return 'hard';
    if (analysis.smoothnessScore && analysis.smoothnessScore > 0.8) return 'easy';
    return 'moderate';
  }

  private generateLandscapeRecommendations(analysis: any, difficulty: string): string[] {
    const recommendations: string[] = [];

    if (difficulty === 'very_hard') {
      recommendations.push('Use adaptive learning rate methods (Adam, RMSprop)');
      recommendations.push('Consider preconditioning techniques');
    }

    if (analysis.sharpnessMetric && analysis.sharpnessMetric > 50) {
      recommendations.push('Use smaller learning rates for better generalization');
      recommendations.push('Consider sharpness-aware minimization (SAM)');
    }

    if (analysis.conditionNumber && analysis.conditionNumber > 100) {
      recommendations.push('Apply batch normalization or layer normalization');
    }

    return recommendations;
  }

  private async storeLossFunction(lossFunction: LossFunction): Promise<void> {
    const query = `
      INSERT INTO loss_functions (id, name, type, category, formula, implementation, hyperparameters, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        formula = $5,
        implementation = $6,
        hyperparameters = $7,
        metadata = $8,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    await this.dbPool.query(query, [
      lossFunction.id,
      lossFunction.name,
      lossFunction.type,
      lossFunction.category,
      lossFunction.formula,
      JSON.stringify(lossFunction.implementation),
      JSON.stringify(lossFunction.hyperparameters),
      JSON.stringify(lossFunction.metadata),
      new Date()
    ]);
  }

  private async storeAdaptiveLoss(config: AdaptiveLossConfig): Promise<void> {
    const query = `
      INSERT INTO adaptive_loss_configs (id, base_function_id, adaptation_strategy, adaptation_params, conditions, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await this.dbPool.query(query, [
      config.id,
      config.baseFunctionId,
      config.adaptationStrategy,
      JSON.stringify(config.adaptationParams),
      JSON.stringify(config.conditions),
      new Date()
    ]);
  }

  private async storeLossCombination(combination: LossCombination): Promise<void> {
    const query = `
      INSERT INTO loss_combinations (id, name, functions, combination_strategy, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await this.dbPool.query(query, [
      combination.id,
      combination.name,
      JSON.stringify(combination.functions),
      combination.combinationStrategy,
      JSON.stringify(combination.metadata),
      new Date()
    ]);
  }

  async getHealth(): Promise<any> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      lossFunctionsLoaded: this.lossFunctions.size,
      compiledFunctions: this.compiledFunctions.size,
      adaptiveLosses: this.adaptiveLosses.size,
      combinations: this.combinations.size,
      totalEvaluations: Array.from(this.evaluations.values()).reduce((sum, evals) => sum + evals.length, 0)
    };
  }
}