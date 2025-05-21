import { DatabasePool } from '../../../database/pg-pool.js';
import { RedisConnectionManager } from '../../../database/redis-client.js';
import { getLogger } from '../../../shared/logger.js';
import { BaseMCPServer } from '../../../shared/mcp/server.js';

const logger = getLogger('GradientOptimizer');

export interface OptimizationAlgorithm {
  id: string;
  name: string;
  type: 'sgd' | 'adam' | 'rmsprop' | 'adagrad' | 'adadelta' | 'adamw' | 'nadam';
  parameters: OptimizationParameters;
  adaptiveParams: AdaptiveParameters;
  metadata: {
    description: string;
    paperReference?: string;
    implementationNotes: string[];
  };
}

export interface OptimizationParameters {
  learningRate: number;
  momentum?: number;
  beta1?: number;
  beta2?: number;
  epsilon?: number;
  weightDecay?: number;
  rho?: number;
  alpha?: number;
  centered?: boolean;
}

export interface AdaptiveParameters {
  learningRateSchedule: 'constant' | 'exponential' | 'cosine' | 'polynomial' | 'plateau';
  scheduleParams: any;
  gradientClipping: {
    enabled: boolean;
    type: 'norm' | 'value';
    threshold: number;
  };
  warmup: {
    enabled: boolean;
    steps: number;
    initialLr: number;
  };
}

export interface GradientStatistics {
  epoch: number;
  layerGradients: Map<string, LayerGradientStats>;
  globalStats: {
    meanGradientNorm: number;
    maxGradientNorm: number;
    gradientVariance: number;
    deadNeuronCount: number;
    explodingGradientDetected: boolean;
    vanishingGradientDetected: boolean;
  };
  optimizerState: Map<string, any>;
}

export interface LayerGradientStats {
  layerId: string;
  gradientNorm: number;
  weightNorm: number;
  gradientMean: number;
  gradientStd: number;
  updateMagnitude: number;
  signalToNoiseRatio: number;
}

export interface OptimizationSession {
  id: string;
  algorithmId: string;
  networkId: string;
  status: 'active' | 'paused' | 'completed' | 'failed';
  currentEpoch: number;
  gradientHistory: GradientStatistics[];
  convergenceMetrics: ConvergenceMetrics;
  adaptations: OptimizationAdaptation[];
  startTime: Date;
  endTime?: Date;
}

export interface ConvergenceMetrics {
  lossImprovement: number[];
  lossStagnationCount: number;
  gradientMagnitudeTrend: number[];
  learningRateHistory: number[];
  convergenceScore: number;
  plateauDetected: boolean;
  oscillationDetected: boolean;
}

export interface OptimizationAdaptation {
  epoch: number;
  type: 'learning_rate' | 'momentum' | 'algorithm_switch' | 'gradient_clipping';
  oldValue: any;
  newValue: any;
  reason: string;
  impact: string;
}

export class GradientOptimizer extends BaseMCPServer {
  private dbPool: DatabasePool;
  private redis: RedisConnectionManager;
  private algorithms: Map<string, OptimizationAlgorithm> = new Map();
  private sessions: Map<string, OptimizationSession> = new Map();
  private optimizerStates: Map<string, any> = new Map();

  constructor(dbPool: DatabasePool, redis: RedisConnectionManager, options: any = {}) {
    super('gradient-optimizer', options);
    this.dbPool = dbPool;
    this.redis = redis;
    this.initializeDefaultAlgorithms();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.addTool('create_optimizer', {
      description: 'Create a new gradient optimization algorithm configuration',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['sgd', 'adam', 'rmsprop', 'adagrad', 'adadelta', 'adamw', 'nadam'] },
          parameters: { type: 'object' },
          adaptiveParams: { type: 'object' }
        },
        required: ['name', 'type', 'parameters']
      }
    }, this.createOptimizer.bind(this));

    this.addTool('optimize_gradients', {
      description: 'Start gradient optimization for a neural network',
      parameters: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          algorithmId: { type: 'string' },
          gradients: { type: 'object' },
          weights: { type: 'object' }
        },
        required: ['networkId', 'algorithmId', 'gradients', 'weights']
      }
    }, this.optimizeGradients.bind(this));

    this.addTool('analyze_gradients', {
      description: 'Analyze gradient behavior and provide optimization recommendations',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          currentGradients: { type: 'object' }
        },
        required: ['sessionId', 'currentGradients']
      }
    }, this.analyzeGradients.bind(this));

    this.addTool('adapt_optimizer', {
      description: 'Adapt optimizer parameters based on training dynamics',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          adaptationType: { type: 'string' },
          triggerCondition: { type: 'string' }
        },
        required: ['sessionId', 'adaptationType']
      }
    }, this.adaptOptimizer.bind(this));

    this.addTool('get_convergence_status', {
      description: 'Get convergence analysis and optimization recommendations',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' }
        },
        required: ['sessionId']
      }
    }, this.getConvergenceStatus.bind(this));
  }

  private initializeDefaultAlgorithms(): void {
    // Adam optimizer
    this.algorithms.set('adam_default', {
      id: 'adam_default',
      name: 'Adam Default',
      type: 'adam',
      parameters: {
        learningRate: 0.001,
        beta1: 0.9,
        beta2: 0.999,
        epsilon: 1e-8,
        weightDecay: 0
      },
      adaptiveParams: {
        learningRateSchedule: 'constant',
        scheduleParams: {},
        gradientClipping: {
          enabled: false,
          type: 'norm',
          threshold: 1.0
        },
        warmup: {
          enabled: false,
          steps: 0,
          initialLr: 1e-6
        }
      },
      metadata: {
        description: 'Adaptive Moment Estimation optimizer',
        paperReference: 'Kingma & Ba (2014)',
        implementationNotes: ['Computes adaptive learning rates', 'Works well for sparse gradients']
      }
    });

    // SGD with momentum
    this.algorithms.set('sgd_momentum', {
      id: 'sgd_momentum',
      name: 'SGD with Momentum',
      type: 'sgd',
      parameters: {
        learningRate: 0.01,
        momentum: 0.9
      },
      adaptiveParams: {
        learningRateSchedule: 'exponential',
        scheduleParams: { decayRate: 0.96, decaySteps: 1000 },
        gradientClipping: {
          enabled: true,
          type: 'norm',
          threshold: 5.0
        },
        warmup: {
          enabled: false,
          steps: 0,
          initialLr: 1e-6
        }
      },
      metadata: {
        description: 'Stochastic Gradient Descent with momentum',
        implementationNotes: ['Simple and robust', 'Good baseline optimizer']
      }
    });
  }

  async createOptimizer(params: any): Promise<any> {
    try {
      const algorithmId = `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const algorithm: OptimizationAlgorithm = {
        id: algorithmId,
        name: params.name,
        type: params.type,
        parameters: params.parameters,
        adaptiveParams: params.adaptiveParams || this.getDefaultAdaptiveParams(),
        metadata: {
          description: params.description || '',
          paperReference: params.paperReference,
          implementationNotes: params.implementationNotes || []
        }
      };

      // Validate algorithm configuration
      const validation = this.validateAlgorithm(algorithm);
      if (!validation.isValid) {
        throw new Error(`Invalid algorithm: ${validation.errors.join(', ')}`);
      }

      this.algorithms.set(algorithmId, algorithm);
      await this.storeAlgorithm(algorithm);

      return {
        success: true,
        algorithmId,
        algorithm,
        validation
      };
    } catch (error) {
      logger.error('Error creating optimizer:', error);
      throw error;
    }
  }

  async optimizeGradients(params: any): Promise<any> {
    try {
      const { networkId, algorithmId, gradients, weights } = params;
      
      const algorithm = this.algorithms.get(algorithmId);
      if (!algorithm) {
        throw new Error(`Algorithm not found: ${algorithmId}`);
      }

      const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create optimization session
      const session: OptimizationSession = {
        id: sessionId,
        algorithmId,
        networkId,
        status: 'active',
        currentEpoch: 0,
        gradientHistory: [],
        convergenceMetrics: {
          lossImprovement: [],
          lossStagnationCount: 0,
          gradientMagnitudeTrend: [],
          learningRateHistory: [],
          convergenceScore: 0,
          plateauDetected: false,
          oscillationDetected: false
        },
        adaptations: [],
        startTime: new Date()
      };

      this.sessions.set(sessionId, session);

      // Perform gradient optimization step
      const optimizedWeights = await this.performOptimizationStep(algorithm, gradients, weights, sessionId);
      
      // Analyze gradients and update statistics
      const gradientStats = this.computeGradientStatistics(gradients, weights, session.currentEpoch);
      session.gradientHistory.push(gradientStats);

      // Check for optimization issues
      const issues = this.detectOptimizationIssues(gradientStats);
      const recommendations = this.generateRecommendations(gradientStats, algorithm);

      return {
        success: true,
        sessionId,
        optimizedWeights,
        gradientStats,
        issues,
        recommendations
      };
    } catch (error) {
      logger.error('Error optimizing gradients:', error);
      throw error;
    }
  }

  async analyzeGradients(params: any): Promise<any> {
    try {
      const { sessionId, currentGradients } = params;
      
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const algorithm = this.algorithms.get(session.algorithmId);
      if (!algorithm) {
        throw new Error(`Algorithm not found: ${session.algorithmId}`);
      }

      // Compute current gradient statistics
      const currentStats = this.computeGradientStatistics(currentGradients, {}, session.currentEpoch);
      
      // Analyze trends over time
      const trends = this.analyzeTrends(session.gradientHistory, currentStats);
      
      // Detect convergence issues
      const convergenceAnalysis = this.analyzeConvergence(session.convergenceMetrics, currentStats);
      
      // Generate optimization recommendations
      const recommendations = this.generateDetailedRecommendations(trends, convergenceAnalysis, algorithm);

      return {
        success: true,
        analysis: {
          currentStats,
          trends,
          convergenceAnalysis,
          recommendations
        }
      };
    } catch (error) {
      logger.error('Error analyzing gradients:', error);
      throw error;
    }
  }

  async adaptOptimizer(params: any): Promise<any> {
    try {
      const { sessionId, adaptationType, triggerCondition } = params;
      
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const algorithm = this.algorithms.get(session.algorithmId);
      if (!algorithm) {
        throw new Error(`Algorithm not found: ${session.algorithmId}`);
      }

      let adaptation: OptimizationAdaptation;

      switch (adaptationType) {
        case 'learning_rate':
          adaptation = await this.adaptLearningRate(session, algorithm, triggerCondition);
          break;
        case 'momentum':
          adaptation = await this.adaptMomentum(session, algorithm, triggerCondition);
          break;
        case 'gradient_clipping':
          adaptation = await this.adaptGradientClipping(session, algorithm, triggerCondition);
          break;
        case 'algorithm_switch':
          adaptation = await this.switchAlgorithm(session, triggerCondition);
          break;
        default:
          throw new Error(`Unsupported adaptation type: ${adaptationType}`);
      }

      session.adaptations.push(adaptation);
      
      return {
        success: true,
        adaptation,
        updatedSession: {
          id: session.id,
          adaptations: session.adaptations,
          convergenceMetrics: session.convergenceMetrics
        }
      };
    } catch (error) {
      logger.error('Error adapting optimizer:', error);
      throw error;
    }
  }

  async getConvergenceStatus(params: any): Promise<any> {
    try {
      const { sessionId } = params;
      
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const convergenceScore = this.calculateConvergenceScore(session);
      const predictions = this.predictConvergenceBehavior(session);
      const optimizationSuggestions = this.generateOptimizationSuggestions(session);

      return {
        success: true,
        convergenceStatus: {
          score: convergenceScore,
          metrics: session.convergenceMetrics,
          predictions,
          suggestions: optimizationSuggestions,
          sessionSummary: {
            totalEpochs: session.currentEpoch,
            adaptationsApplied: session.adaptations.length,
            issuesDetected: this.countIssuesDetected(session),
            overallHealth: this.assessOptimizationHealth(session)
          }
        }
      };
    } catch (error) {
      logger.error('Error getting convergence status:', error);
      throw error;
    }
  }

  private async performOptimizationStep(algorithm: OptimizationAlgorithm, gradients: any, weights: any, sessionId: string): Promise<any> {
    const optimizedWeights: any = {};
    
    switch (algorithm.type) {
      case 'adam':
        return this.adamOptimizationStep(algorithm, gradients, weights, sessionId);
      case 'sgd':
        return this.sgdOptimizationStep(algorithm, gradients, weights, sessionId);
      case 'rmsprop':
        return this.rmspropOptimizationStep(algorithm, gradients, weights, sessionId);
      default:
        throw new Error(`Unsupported optimizer type: ${algorithm.type}`);
    }
  }

  private adamOptimizationStep(algorithm: OptimizationAlgorithm, gradients: any, weights: any, sessionId: string): any {
    const { learningRate, beta1, beta2, epsilon } = algorithm.parameters;
    const optimizedWeights: any = {};
    
    // Get or initialize optimizer state
    let state = this.optimizerStates.get(sessionId) || {
      m: {},  // First moment estimate
      v: {},  // Second moment estimate
      t: 0    // Time step
    };
    
    state.t += 1;
    
    for (const [layerName, layerGradients] of Object.entries(gradients)) {
      if (!state.m[layerName]) state.m[layerName] = {};
      if (!state.v[layerName]) state.v[layerName] = {};
      
      const layerWeights = weights[layerName];
      optimizedWeights[layerName] = {};
      
      for (const [paramName, grad] of Object.entries(layerGradients as any)) {
        // Initialize moments if not present
        if (!state.m[layerName][paramName]) {
          state.m[layerName][paramName] = 0;
        }
        if (!state.v[layerName][paramName]) {
          state.v[layerName][paramName] = 0;
        }
        
        // Update biased first moment estimate
        state.m[layerName][paramName] = beta1 * state.m[layerName][paramName] + (1 - beta1) * (grad as number);
        
        // Update biased second raw moment estimate
        state.v[layerName][paramName] = beta2 * state.v[layerName][paramName] + (1 - beta2) * Math.pow(grad as number, 2);
        
        // Compute bias-corrected first moment estimate
        const mHat = state.m[layerName][paramName] / (1 - Math.pow(beta1, state.t));
        
        // Compute bias-corrected second raw moment estimate
        const vHat = state.v[layerName][paramName] / (1 - Math.pow(beta2, state.t));
        
        // Update weights
        optimizedWeights[layerName][paramName] = layerWeights[paramName] - learningRate * mHat / (Math.sqrt(vHat) + epsilon);
      }
    }
    
    this.optimizerStates.set(sessionId, state);
    return optimizedWeights;
  }

  private sgdOptimizationStep(algorithm: OptimizationAlgorithm, gradients: any, weights: any, sessionId: string): any {
    const { learningRate, momentum = 0 } = algorithm.parameters;
    const optimizedWeights: any = {};
    
    // Get or initialize momentum state
    let state = this.optimizerStates.get(sessionId) || { velocity: {} };
    
    for (const [layerName, layerGradients] of Object.entries(gradients)) {
      if (!state.velocity[layerName]) state.velocity[layerName] = {};
      
      const layerWeights = weights[layerName];
      optimizedWeights[layerName] = {};
      
      for (const [paramName, grad] of Object.entries(layerGradients as any)) {
        // Initialize velocity if not present
        if (!state.velocity[layerName][paramName]) {
          state.velocity[layerName][paramName] = 0;
        }
        
        // Update velocity
        state.velocity[layerName][paramName] = momentum * state.velocity[layerName][paramName] + learningRate * (grad as number);
        
        // Update weights
        optimizedWeights[layerName][paramName] = layerWeights[paramName] - state.velocity[layerName][paramName];
      }
    }
    
    this.optimizerStates.set(sessionId, state);
    return optimizedWeights;
  }

  private rmspropOptimizationStep(algorithm: OptimizationAlgorithm, gradients: any, weights: any, sessionId: string): any {
    const { learningRate, alpha = 0.99, epsilon = 1e-8 } = algorithm.parameters;
    const optimizedWeights: any = {};
    
    // Get or initialize RMSprop state
    let state = this.optimizerStates.get(sessionId) || { s: {} };
    
    for (const [layerName, layerGradients] of Object.entries(gradients)) {
      if (!state.s[layerName]) state.s[layerName] = {};
      
      const layerWeights = weights[layerName];
      optimizedWeights[layerName] = {};
      
      for (const [paramName, grad] of Object.entries(layerGradients as any)) {
        // Initialize accumulator if not present
        if (!state.s[layerName][paramName]) {
          state.s[layerName][paramName] = 0;
        }
        
        // Update accumulator
        state.s[layerName][paramName] = alpha * state.s[layerName][paramName] + (1 - alpha) * Math.pow(grad as number, 2);
        
        // Update weights
        optimizedWeights[layerName][paramName] = layerWeights[paramName] - learningRate * (grad as number) / (Math.sqrt(state.s[layerName][paramName]) + epsilon);
      }
    }
    
    this.optimizerStates.set(sessionId, state);
    return optimizedWeights;
  }

  private computeGradientStatistics(gradients: any, weights: any, epoch: number): GradientStatistics {
    const layerGradients = new Map<string, LayerGradientStats>();
    let totalGradientNorm = 0;
    let maxGradientNorm = 0;
    let deadNeuronCount = 0;
    
    for (const [layerName, layerGradients_] of Object.entries(gradients)) {
      const gradArray = Object.values(layerGradients_ as any).flat();
      const gradientNorm = Math.sqrt(gradArray.reduce((sum, g) => sum + g * g, 0));
      const gradientMean = gradArray.reduce((sum, g) => sum + g, 0) / gradArray.length;
      const gradientVariance = gradArray.reduce((sum, g) => sum + Math.pow(g - gradientMean, 2), 0) / gradArray.length;
      const gradientStd = Math.sqrt(gradientVariance);
      
      // Count dead neurons (very small gradients)
      const deadCount = gradArray.filter(g => Math.abs(g) < 1e-6).length;
      deadNeuronCount += deadCount;
      
      layerGradients.set(layerName, {
        layerId: layerName,
        gradientNorm,
        weightNorm: 0, // Would need actual weights to compute
        gradientMean,
        gradientStd,
        updateMagnitude: gradientNorm,
        signalToNoiseRatio: Math.abs(gradientMean) / gradientStd
      });
      
      totalGradientNorm += gradientNorm;
      maxGradientNorm = Math.max(maxGradientNorm, gradientNorm);
    }
    
    const meanGradientNorm = totalGradientNorm / Object.keys(gradients).length;
    
    return {
      epoch,
      layerGradients,
      globalStats: {
        meanGradientNorm,
        maxGradientNorm,
        gradientVariance: 0, // Simplified
        deadNeuronCount,
        explodingGradientDetected: maxGradientNorm > 100,
        vanishingGradientDetected: meanGradientNorm < 1e-6
      },
      optimizerState: new Map()
    };
  }

  private detectOptimizationIssues(stats: GradientStatistics): string[] {
    const issues: string[] = [];
    
    if (stats.globalStats.explodingGradientDetected) {
      issues.push('Exploding gradients detected - consider gradient clipping');
    }
    
    if (stats.globalStats.vanishingGradientDetected) {
      issues.push('Vanishing gradients detected - consider different activation functions or normalization');
    }
    
    if (stats.globalStats.deadNeuronCount > 0) {
      issues.push(`${stats.globalStats.deadNeuronCount} dead neurons detected - consider lower learning rate or different initialization`);
    }
    
    return issues;
  }

  private generateRecommendations(stats: GradientStatistics, algorithm: OptimizationAlgorithm): string[] {
    const recommendations: string[] = [];
    
    if (stats.globalStats.meanGradientNorm > 10) {
      recommendations.push('Consider reducing learning rate or enabling gradient clipping');
    }
    
    if (stats.globalStats.meanGradientNorm < 1e-4) {
      recommendations.push('Consider increasing learning rate or using learning rate warmup');
    }
    
    if (algorithm.type === 'sgd' && stats.globalStats.meanGradientNorm > 1) {
      recommendations.push('Consider switching to Adam optimizer for better stability');
    }
    
    return recommendations;
  }

  private validateAlgorithm(algorithm: OptimizationAlgorithm): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (algorithm.parameters.learningRate <= 0) {
      errors.push('Learning rate must be positive');
    }
    
    if (algorithm.type === 'adam') {
      if (algorithm.parameters.beta1 && (algorithm.parameters.beta1 < 0 || algorithm.parameters.beta1 >= 1)) {
        errors.push('Beta1 must be in range [0, 1)');
      }
      if (algorithm.parameters.beta2 && (algorithm.parameters.beta2 < 0 || algorithm.parameters.beta2 >= 1)) {
        errors.push('Beta2 must be in range [0, 1)');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private getDefaultAdaptiveParams(): AdaptiveParameters {
    return {
      learningRateSchedule: 'constant',
      scheduleParams: {},
      gradientClipping: {
        enabled: false,
        type: 'norm',
        threshold: 1.0
      },
      warmup: {
        enabled: false,
        steps: 0,
        initialLr: 1e-6
      }
    };
  }

  private async storeAlgorithm(algorithm: OptimizationAlgorithm): Promise<void> {
    const query = `
      INSERT INTO optimization_algorithms (id, name, type, parameters, adaptive_params, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        parameters = $4,
        adaptive_params = $5,
        metadata = $6,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    await this.dbPool.query(query, [
      algorithm.id,
      algorithm.name,
      algorithm.type,
      JSON.stringify(algorithm.parameters),
      JSON.stringify(algorithm.adaptiveParams),
      JSON.stringify(algorithm.metadata),
      new Date()
    ]);
  }

  private analyzeTrends(history: GradientStatistics[], current: GradientStatistics): any {
    if (history.length < 2) {
      return { message: 'Insufficient data for trend analysis' };
    }
    
    const recentHistory = history.slice(-10); // Last 10 epochs
    const gradientNorms = recentHistory.map(h => h.globalStats.meanGradientNorm);
    
    return {
      gradientTrend: this.calculateTrend(gradientNorms),
      stabilityScore: this.calculateStabilityScore(gradientNorms),
      convergenceIndicator: this.assessConvergence(gradientNorms)
    };
  }

  private calculateTrend(values: number[]): string {
    if (values.length < 2) return 'unknown';
    
    const slope = (values[values.length - 1] - values[0]) / values.length;
    if (slope > 0.01) return 'increasing';
    if (slope < -0.01) return 'decreasing';
    return 'stable';
  }

  private calculateStabilityScore(values: number[]): number {
    if (values.length < 2) return 0;
    
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    
    return Math.max(0, 1 - variance / (mean + 1e-8));
  }

  private assessConvergence(values: number[]): string {
    const recentChange = Math.abs(values[values.length - 1] - values[values.length - 2]);
    const averageChange = values.slice(1).reduce((sum, v, i) => sum + Math.abs(v - values[i]), 0) / (values.length - 1);
    
    if (recentChange < averageChange * 0.1) return 'converging';
    if (recentChange > averageChange * 2) return 'diverging';
    return 'training';
  }

  private analyzeConvergence(metrics: ConvergenceMetrics, currentStats: GradientStatistics): any {
    return {
      plateauRisk: metrics.lossStagnationCount > 5,
      oscillationRisk: metrics.oscillationDetected,
      convergenceHealth: this.calculateConvergenceHealth(metrics),
      recommendations: this.generateConvergenceRecommendations(metrics)
    };
  }

  private calculateConvergenceHealth(metrics: ConvergenceMetrics): string {
    if (metrics.plateauDetected || metrics.oscillationDetected) return 'poor';
    if (metrics.lossStagnationCount > 3) return 'fair';
    return 'good';
  }

  private generateConvergenceRecommendations(metrics: ConvergenceMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.plateauDetected) {
      recommendations.push('Consider reducing learning rate or using learning rate scheduling');
    }
    
    if (metrics.oscillationDetected) {
      recommendations.push('Consider reducing learning rate or increasing batch size');
    }
    
    return recommendations;
  }

  private generateDetailedRecommendations(trends: any, convergenceAnalysis: any, algorithm: OptimizationAlgorithm): string[] {
    const recommendations: string[] = [];
    
    // Add trend-based recommendations
    if (trends.gradientTrend === 'increasing') {
      recommendations.push('Gradients are increasing - consider gradient clipping or learning rate reduction');
    }
    
    if (trends.stabilityScore < 0.5) {
      recommendations.push('Training is unstable - consider reducing learning rate or changing optimizer');
    }
    
    // Add convergence-based recommendations
    recommendations.push(...convergenceAnalysis.recommendations);
    
    return recommendations;
  }

  private async adaptLearningRate(session: OptimizationSession, algorithm: OptimizationAlgorithm, condition: string): Promise<OptimizationAdaptation> {
    const oldRate = algorithm.parameters.learningRate;
    let newRate = oldRate;
    
    switch (condition) {
      case 'plateau':
        newRate = oldRate * 0.5;
        break;
      case 'oscillation':
        newRate = oldRate * 0.8;
        break;
      case 'exploding_gradients':
        newRate = oldRate * 0.1;
        break;
    }
    
    algorithm.parameters.learningRate = newRate;
    
    return {
      epoch: session.currentEpoch,
      type: 'learning_rate',
      oldValue: oldRate,
      newValue: newRate,
      reason: condition,
      impact: 'Adjusted learning rate to improve convergence'
    };
  }

  private async adaptMomentum(session: OptimizationSession, algorithm: OptimizationAlgorithm, condition: string): Promise<OptimizationAdaptation> {
    const oldMomentum = algorithm.parameters.momentum || 0;
    let newMomentum = oldMomentum;
    
    if (condition === 'slow_convergence') {
      newMomentum = Math.min(0.99, oldMomentum + 0.1);
    }
    
    algorithm.parameters.momentum = newMomentum;
    
    return {
      epoch: session.currentEpoch,
      type: 'momentum',
      oldValue: oldMomentum,
      newValue: newMomentum,
      reason: condition,
      impact: 'Adjusted momentum to improve convergence speed'
    };
  }

  private async adaptGradientClipping(session: OptimizationSession, algorithm: OptimizationAlgorithm, condition: string): Promise<OptimizationAdaptation> {
    const oldThreshold = algorithm.adaptiveParams.gradientClipping.threshold;
    const oldEnabled = algorithm.adaptiveParams.gradientClipping.enabled;
    
    algorithm.adaptiveParams.gradientClipping.enabled = true;
    if (condition === 'exploding_gradients') {
      algorithm.adaptiveParams.gradientClipping.threshold = Math.min(oldThreshold, 1.0);
    }
    
    return {
      epoch: session.currentEpoch,
      type: 'gradient_clipping',
      oldValue: { enabled: oldEnabled, threshold: oldThreshold },
      newValue: { enabled: true, threshold: algorithm.adaptiveParams.gradientClipping.threshold },
      reason: condition,
      impact: 'Enabled gradient clipping to prevent exploding gradients'
    };
  }

  private async switchAlgorithm(session: OptimizationSession, condition: string): Promise<OptimizationAdaptation> {
    const oldAlgorithmId = session.algorithmId;
    let newAlgorithmId = oldAlgorithmId;
    
    if (condition === 'poor_convergence' && session.algorithmId === 'sgd_momentum') {
      newAlgorithmId = 'adam_default';
    }
    
    session.algorithmId = newAlgorithmId;
    
    return {
      epoch: session.currentEpoch,
      type: 'algorithm_switch',
      oldValue: oldAlgorithmId,
      newValue: newAlgorithmId,
      reason: condition,
      impact: 'Switched optimization algorithm for better convergence'
    };
  }

  private calculateConvergenceScore(session: OptimizationSession): number {
    // Simplified convergence score calculation
    const recentHistory = session.gradientHistory.slice(-5);
    if (recentHistory.length === 0) return 0;
    
    const avgGradientNorm = recentHistory.reduce((sum, h) => sum + h.globalStats.meanGradientNorm, 0) / recentHistory.length;
    const stability = this.calculateStabilityScore(recentHistory.map(h => h.globalStats.meanGradientNorm));
    
    return Math.min(100, (1 / (avgGradientNorm + 1e-6)) * stability * 50);
  }

  private predictConvergenceBehavior(session: OptimizationSession): any {
    const history = session.gradientHistory;
    if (history.length < 5) {
      return { prediction: 'insufficient_data' };
    }
    
    const recentNorms = history.slice(-5).map(h => h.globalStats.meanGradientNorm);
    const trend = this.calculateTrend(recentNorms);
    
    return {
      prediction: trend === 'decreasing' ? 'converging' : 'needs_attention',
      confidence: this.calculateStabilityScore(recentNorms),
      estimatedEpochsToConvergence: this.estimateEpochsToConvergence(recentNorms)
    };
  }

  private estimateEpochsToConvergence(gradientNorms: number[]): number {
    if (gradientNorms.length < 2) return -1;
    
    const currentNorm = gradientNorms[gradientNorms.length - 1];
    const slope = (gradientNorms[gradientNorms.length - 1] - gradientNorms[0]) / gradientNorms.length;
    
    if (slope >= 0) return -1; // Not converging
    
    const targetNorm = 1e-6;
    return Math.max(0, Math.ceil((currentNorm - targetNorm) / Math.abs(slope)));
  }

  private generateOptimizationSuggestions(session: OptimizationSession): string[] {
    const suggestions: string[] = [];
    
    if (session.adaptations.length === 0) {
      suggestions.push('No adaptations applied yet - monitoring convergence');
    }
    
    const recentAdaptations = session.adaptations.slice(-3);
    if (recentAdaptations.filter(a => a.type === 'learning_rate').length > 2) {
      suggestions.push('Multiple learning rate adjustments - consider different optimizer');
    }
    
    if (session.convergenceMetrics.plateauDetected) {
      suggestions.push('Plateau detected - consider learning rate scheduling or early stopping');
    }
    
    return suggestions;
  }

  private countIssuesDetected(session: OptimizationSession): number {
    return session.gradientHistory.reduce((count, history) => {
      return count + 
        (history.globalStats.explodingGradientDetected ? 1 : 0) +
        (history.globalStats.vanishingGradientDetected ? 1 : 0) +
        (history.globalStats.deadNeuronCount > 0 ? 1 : 0);
    }, 0);
  }

  private assessOptimizationHealth(session: OptimizationSession): string {
    const issueCount = this.countIssuesDetected(session);
    const adaptationCount = session.adaptations.length;
    
    if (issueCount === 0 && adaptationCount <= 2) return 'excellent';
    if (issueCount <= 2 && adaptationCount <= 5) return 'good';
    if (issueCount <= 5) return 'fair';
    return 'poor';
  }

  async getHealth(): Promise<any> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      algorithmsLoaded: this.algorithms.size,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.status === 'active').length,
      optimizerStates: this.optimizerStates.size
    };
  }
}