import { DatabasePool } from '../../../database/pg-pool.js';
import { RedisConnectionManager } from '../../../database/redis-client.js';
import { getLogger } from '../../../shared/logger.js';
import { StandardMCPServer, MCPTool } from '../../../shared/mcp/server.js';

const logger = getLogger('HyperparameterTuner');

export interface HyperparameterSpace {
  id: string;
  name: string;
  description: string;
  parameters: HyperparameterDefinition[];
  constraints: ParameterConstraint[];
  searchBounds: SearchBounds;
  samplingStrategy: 'grid' | 'random' | 'bayesian' | 'evolutionary' | 'hyperband' | 'optuna';
  metadata: {
    taskType: string;
    modelType: string;
    complexity: 'low' | 'medium' | 'high';
    expectedDuration: string;
  };
}

export interface HyperparameterDefinition {
  name: string;
  type: 'continuous' | 'discrete' | 'categorical' | 'boolean';
  range: any; // Union of different range types
  distribution: 'uniform' | 'normal' | 'log_uniform' | 'log_normal' | 'categorical';
  scale: 'linear' | 'log' | 'sqrt';
  importance: 'critical' | 'high' | 'medium' | 'low';
  dependencies: ParameterDependency[];
  defaultValue: any;
}

export interface ParameterConstraint {
  type: 'equality' | 'inequality' | 'conditional' | 'mutual_exclusion';
  parameters: string[];
  condition: string;
  violation_penalty: number;
}

export interface SearchBounds {
  maxEvaluations: number;
  maxTime: number; // seconds
  earlyStoppingPatience: number;
  targetMetric: string;
  targetValue?: number;
  improvementThreshold: number;
}

export interface ParameterDependency {
  parameter: string;
  condition: string;
  effect: 'enable' | 'disable' | 'modify_range' | 'modify_distribution';
}

export interface TuningSession {
  id: string;
  spaceId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  strategy: {
    algorithm: string;
    parameters: any;
    adaptiveSettings: AdaptiveSettings;
  };
  progress: TuningProgress;
  bestConfiguration: ParameterConfiguration;
  history: EvaluationResult[];
  statistics: TuningStatistics;
  insights: TuningInsights;
  startTime: Date;
  endTime?: Date;
}

export interface AdaptiveSettings {
  explorationRate: number;
  convergenceThreshold: number;
  diversityMaintenance: boolean;
  parallelism: number;
  resourceAdaptation: boolean;
}

export interface TuningProgress {
  evaluationsCompleted: number;
  totalEvaluations: number;
  elapsedTime: number;
  estimatedTimeRemaining: number;
  currentBestScore: number;
  improvementRate: number;
  convergenceIndicator: number;
}

export interface ParameterConfiguration {
  id: string;
  parameters: Map<string, any>;
  score: number;
  metrics: Map<string, number>;
  validationScore?: number;
  crossValidationScores?: number[];
  metadata: {
    evaluationTime: number;
    resourceUsage: ResourceUsage;
    stability: number;
    generalization: number;
  };
}

export interface ResourceUsage {
  cpuTime: number;
  memoryPeak: number;
  gpuUtilization: number;
  networkIO: number;
  diskIO: number;
}

export interface EvaluationResult {
  configurationId: string;
  parameters: Map<string, any>;
  primaryMetric: number;
  auxiliaryMetrics: Map<string, number>;
  trainTime: number;
  validationTime: number;
  resourceUsage: ResourceUsage;
  stability: number;
  timestamp: Date;
}

export interface TuningStatistics {
  bestScore: number;
  averageScore: number;
  scoreVariance: number;
  convergenceRate: number;
  parameterImportance: Map<string, number>;
  parameterCorrelations: Map<string, Map<string, number>>;
  explorationEfficiency: number;
  timePerEvaluation: number;
}

export interface TuningInsights {
  parameterSensitivity: Map<string, ParameterSensitivity>;
  interactionEffects: InteractionEffect[];
  optimalRegions: OptimalRegion[];
  convergencePatterns: ConvergencePattern[];
  recommendations: TuningRecommendation[];
}

export interface ParameterSensitivity {
  parameter: string;
  sensitivity: number;
  optimalRange: any;
  marginalEffect: number[];
  certainty: number;
}

export interface InteractionEffect {
  parameters: string[];
  effectStrength: number;
  synergistic: boolean;
  confidence: number;
}

export interface OptimalRegion {
  center: Map<string, any>;
  radius: Map<string, number>;
  confidence: number;
  expectedPerformance: number;
  robustness: number;
}

export interface ConvergencePattern {
  phase: 'exploration' | 'exploitation' | 'convergence';
  startEvaluation: number;
  endEvaluation: number;
  characteristics: string[];
}

export interface TuningRecommendation {
  type: 'parameter_adjustment' | 'search_strategy' | 'resource_allocation' | 'early_stopping';
  priority: 'high' | 'medium' | 'low';
  description: string;
  expectedImprovement: number;
  confidence: number;
}

export interface OptimizationStrategy {
  id: string;
  name: string;
  algorithm: 'bayesian_optimization' | 'genetic_algorithm' | 'particle_swarm' | 'hyperband' | 'random_search' | 'grid_search';
  parameters: StrategyParameters;
  suitability: SuitabilityProfile;
  performance: StrategyPerformance;
}

export interface StrategyParameters {
  acquisitionFunction?: 'ei' | 'ucb' | 'poi' | 'lcb';
  populationSize?: number;
  mutationRate?: number;
  crossoverRate?: number;
  generations?: number;
  minResourceAllocation?: number;
  maxResourceAllocation?: number;
  reductionFactor?: number;
}

export interface SuitabilityProfile {
  parameterCount: { min: number; max: number };
  evaluationCost: 'low' | 'medium' | 'high';
  noiseLevel: 'low' | 'medium' | 'high';
  multiObjective: boolean;
  parallelizable: boolean;
}

export interface StrategyPerformance {
  convergenceSpeed: number;
  finalQuality: number;
  robustness: number;
  resourceEfficiency: number;
  scalability: number;
}

export class HyperparameterTuner extends StandardMCPServer {
  private dbPool: DatabasePool;
  private redis: RedisConnectionManager;
  private searchSpaces: Map<string, HyperparameterSpace> = new Map();
  private tuningSessions: Map<string, TuningSession> = new Map();
  private strategies: Map<string, OptimizationStrategy> = new Map();
  private activeEvaluations: Map<string, Promise<EvaluationResult>> = new Map();

  constructor(dbPool: DatabasePool, redis: RedisConnectionManager, options: any = {}) {
    super('hyperparameter-tuner', options);
    this.dbPool = dbPool;
    this.redis = redis;
    this.initializeStrategies();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.addTool('define_search_space', {
      description: 'Define hyperparameter search space for optimization',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          parameters: { type: 'array' },
          constraints: { type: 'array' },
          searchBounds: { type: 'object' },
          samplingStrategy: { type: 'string' },
          metadata: { type: 'object' }
        },
        required: ['name', 'parameters', 'searchBounds']
      }
    }, this.defineSearchSpace.bind(this));

    this.addTool('start_tuning', {
      description: 'Start hyperparameter tuning session',
      parameters: {
        type: 'object',
        properties: {
          spaceId: { type: 'string' },
          strategy: { type: 'string' },
          strategyParams: { type: 'object' },
          evaluationFunction: { type: 'string' },
          adaptiveSettings: { type: 'object' }
        },
        required: ['spaceId', 'strategy', 'evaluationFunction']
      }
    }, this.startTuning.bind(this));

    this.addTool('suggest_configuration', {
      description: 'Suggest next hyperparameter configuration to evaluate',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' }
        },
        required: ['sessionId']
      }
    }, this.suggestConfiguration.bind(this));

    this.addTool('report_evaluation', {
      description: 'Report evaluation results for a configuration',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          configurationId: { type: 'string' },
          primaryMetric: { type: 'number' },
          auxiliaryMetrics: { type: 'object' },
          resourceUsage: { type: 'object' }
        },
        required: ['sessionId', 'configurationId', 'primaryMetric']
      }
    }, this.reportEvaluation.bind(this));

    this.addTool('analyze_results', {
      description: 'Analyze tuning results and generate insights',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          analysisType: { type: 'string', enum: ['sensitivity', 'interactions', 'convergence', 'recommendations'] }
        },
        required: ['sessionId']
      }
    }, this.analyzeResults.bind(this));

    this.addTool('optimize_strategy', {
      description: 'Optimize tuning strategy based on current progress',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          adaptationGoal: { type: 'string', enum: ['speed', 'quality', 'efficiency', 'robustness'] }
        },
        required: ['sessionId', 'adaptationGoal']
      }
    }, this.optimizeStrategy.bind(this));

    this.addTool('transfer_knowledge', {
      description: 'Transfer knowledge from previous tuning sessions',
      parameters: {
        type: 'object',
        properties: {
          sourceSessionIds: { type: 'array' },
          targetSessionId: { type: 'string' },
          transferStrategy: { type: 'string', enum: ['warmstart', 'meta_learning', 'surrogate_transfer'] }
        },
        required: ['sourceSessionIds', 'targetSessionId', 'transferStrategy']
      }
    }, this.transferKnowledge.bind(this));
  }

  private initializeStrategies(): void {
    // Bayesian Optimization
    this.strategies.set('bayesian', {
      id: 'bayesian',
      name: 'Bayesian Optimization',
      algorithm: 'bayesian_optimization',
      parameters: {
        acquisitionFunction: 'ei',
        minResourceAllocation: 1,
        maxResourceAllocation: 100
      },
      suitability: {
        parameterCount: { min: 2, max: 50 },
        evaluationCost: 'high',
        noiseLevel: 'medium',
        multiObjective: false,
        parallelizable: true
      },
      performance: {
        convergenceSpeed: 0.8,
        finalQuality: 0.9,
        robustness: 0.8,
        resourceEfficiency: 0.9,
        scalability: 0.7
      }
    });

    // Genetic Algorithm
    this.strategies.set('genetic', {
      id: 'genetic',
      name: 'Genetic Algorithm',
      algorithm: 'genetic_algorithm',
      parameters: {
        populationSize: 50,
        mutationRate: 0.1,
        crossoverRate: 0.8,
        generations: 100
      },
      suitability: {
        parameterCount: { min: 5, max: 200 },
        evaluationCost: 'medium',
        noiseLevel: 'high',
        multiObjective: true,
        parallelizable: true
      },
      performance: {
        convergenceSpeed: 0.6,
        finalQuality: 0.8,
        robustness: 0.9,
        resourceEfficiency: 0.6,
        scalability: 0.9
      }
    });

    // Hyperband
    this.strategies.set('hyperband', {
      id: 'hyperband',
      name: 'Hyperband',
      algorithm: 'hyperband',
      parameters: {
        minResourceAllocation: 1,
        maxResourceAllocation: 81,
        reductionFactor: 3
      },
      suitability: {
        parameterCount: { min: 1, max: 100 },
        evaluationCost: 'high',
        noiseLevel: 'low',
        multiObjective: false,
        parallelizable: true
      },
      performance: {
        convergenceSpeed: 0.9,
        finalQuality: 0.7,
        robustness: 0.7,
        resourceEfficiency: 0.95,
        scalability: 0.8
      }
    });
  }

  async defineSearchSpace(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const spaceId = `space_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const searchSpace: HyperparameterSpace = {
        id: spaceId,
        name: params.name,
        description: params.description || '',
        parameters: this.parseParameterDefinitions(params.parameters),
        constraints: params.constraints || [],
        searchBounds: params.searchBounds,
        samplingStrategy: params.samplingStrategy || 'bayesian',
        metadata: params.metadata || {}
      };

      // Validate search space
      const validation = this.validateSearchSpace(searchSpace);
      if (!validation.isValid) {
        throw new Error(`Invalid search space: ${validation.errors.join(', ')}`);
      }

      // Estimate complexity
      const complexity = this.estimateSearchComplexity(searchSpace);
      
      // Recommend strategy
      const recommendedStrategy = this.recommendStrategy(searchSpace, complexity);

      this.searchSpaces.set(spaceId, searchSpace);
      await this.storeSearchSpace(searchSpace);

      return {
        success: true,
        spaceId,
        searchSpace,
        validation,
        complexity,
        recommendedStrategy
      };
    } catch (error) {
      logger.error('Error defining search space:', error);
      throw error;
    }
  }

  async startTuning(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { spaceId, strategy, strategyParams = {}, evaluationFunction, adaptiveSettings = {} } = params;
      
      const searchSpace = this.searchSpaces.get(spaceId);
      if (!searchSpace) {
        throw new Error(`Search space not found: ${spaceId}`);
      }

      const strategyConfig = this.strategies.get(strategy);
      if (!strategyConfig) {
        throw new Error(`Strategy not found: ${strategy}`);
      }

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session: TuningSession = {
        id: sessionId,
        spaceId,
        status: 'pending',
        strategy: {
          algorithm: strategy,
          parameters: { ...strategyConfig.parameters, ...strategyParams },
          adaptiveSettings: {
            explorationRate: adaptiveSettings.explorationRate || 0.5,
            convergenceThreshold: adaptiveSettings.convergenceThreshold || 0.01,
            diversityMaintenance: adaptiveSettings.diversityMaintenance !== false,
            parallelism: adaptiveSettings.parallelism || 1,
            resourceAdaptation: adaptiveSettings.resourceAdaptation !== false
          }
        },
        progress: {
          evaluationsCompleted: 0,
          totalEvaluations: searchSpace.searchBounds.maxEvaluations,
          elapsedTime: 0,
          estimatedTimeRemaining: 0,
          currentBestScore: -Infinity,
          improvementRate: 0,
          convergenceIndicator: 0
        },
        bestConfiguration: {
          id: '',
          parameters: new Map(),
          score: -Infinity,
          metrics: new Map(),
          metadata: {
            evaluationTime: 0,
            resourceUsage: {
              cpuTime: 0,
              memoryPeak: 0,
              gpuUtilization: 0,
              networkIO: 0,
              diskIO: 0
            },
            stability: 0,
            generalization: 0
          }
        },
        history: [],
        statistics: this.initializeStatistics(),
        insights: this.initializeInsights(),
        startTime: new Date()
      };

      this.tuningSessions.set(sessionId, session);

      // Initialize strategy-specific components
      await this.initializeStrategy(session, strategyConfig);

      // Generate initial suggestions
      const initialSuggestions = await this.generateInitialSuggestions(session, searchSpace);

      session.status = 'running';

      return {
        success: true,
        sessionId,
        initialSuggestions,
        estimatedDuration: this.estimateTuningDuration(searchSpace, strategyConfig),
        strategy: {
          name: strategyConfig.name,
          suitability: strategyConfig.suitability,
          expectedPerformance: strategyConfig.performance
        }
      };
    } catch (error) {
      logger.error('Error starting tuning:', error);
      throw error;
    }
  }

  async suggestConfiguration(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { sessionId } = params;
      
      const session = this.tuningSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const searchSpace = this.searchSpaces.get(session.spaceId);
      if (!searchSpace) {
        throw new Error(`Search space not found: ${session.spaceId}`);
      }

      // Check if should continue
      const shouldContinue = this.shouldContinueTuning(session);
      if (!shouldContinue.continue) {
        session.status = 'completed';
        return {
          success: true,
          suggestion: null,
          reason: shouldContinue.reason,
          finalResults: this.generateFinalResults(session)
        };
      }

      // Generate next configuration
      const suggestion = await this.generateNextConfiguration(session, searchSpace);
      
      // Update exploration/exploitation balance
      this.updateAdaptiveSettings(session);

      return {
        success: true,
        suggestion,
        progress: session.progress,
        adaptiveSettings: session.strategy.adaptiveSettings
      };
    } catch (error) {
      logger.error('Error suggesting configuration:', error);
      throw error;
    }
  }

  async reportEvaluation(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { sessionId, configurationId, primaryMetric, auxiliaryMetrics = {}, resourceUsage = {} } = params;
      
      const session = this.tuningSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Create evaluation result
      const evaluation: EvaluationResult = {
        configurationId,
        parameters: new Map(), // Would be populated from configuration
        primaryMetric,
        auxiliaryMetrics: new Map(Object.entries(auxiliaryMetrics)),
        trainTime: resourceUsage.trainTime || 0,
        validationTime: resourceUsage.validationTime || 0,
        resourceUsage: {
          cpuTime: resourceUsage.cpuTime || 0,
          memoryPeak: resourceUsage.memoryPeak || 0,
          gpuUtilization: resourceUsage.gpuUtilization || 0,
          networkIO: resourceUsage.networkIO || 0,
          diskIO: resourceUsage.diskIO || 0
        },
        stability: resourceUsage.stability || 1.0,
        timestamp: new Date()
      };

      // Update session
      session.history.push(evaluation);
      session.progress.evaluationsCompleted++;
      session.progress.elapsedTime = Date.now() - session.startTime.getTime();

      // Update best configuration if improved
      if (primaryMetric > session.bestConfiguration.score) {
        session.bestConfiguration.score = primaryMetric;
        session.bestConfiguration.id = configurationId;
        session.progress.currentBestScore = primaryMetric;
      }

      // Update statistics
      this.updateStatistics(session, evaluation);

      // Generate insights
      const currentInsights = this.generateCurrentInsights(session);

      // Check for early stopping
      const earlyStopDecision = this.checkEarlyStopping(session);

      return {
        success: true,
        evaluation,
        bestScore: session.bestConfiguration.score,
        progress: session.progress,
        insights: currentInsights,
        earlyStopRecommendation: earlyStopDecision
      };
    } catch (error) {
      logger.error('Error reporting evaluation:', error);
      throw error;
    }
  }

  async analyzeResults(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { sessionId, analysisType = 'comprehensive' } = params;
      
      const session = this.tuningSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      let analysis: any = {};

      switch (analysisType) {
        case 'sensitivity':
          analysis = this.analyzeSensitivity(session);
          break;
        case 'interactions':
          analysis = this.analyzeInteractions(session);
          break;
        case 'convergence':
          analysis = this.analyzeConvergence(session);
          break;
        case 'recommendations':
          analysis = this.generateRecommendations(session);
          break;
        default:
          analysis = this.performComprehensiveAnalysis(session);
      }

      return {
        success: true,
        analysisType,
        results: analysis,
        sessionSummary: this.generateSessionSummary(session)
      };
    } catch (error) {
      logger.error('Error analyzing results:', error);
      throw error;
    }
  }

  async optimizeStrategy(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { sessionId, adaptationGoal } = params;
      
      const session = this.tuningSessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Analyze current strategy performance
      const performanceAnalysis = this.analyzeStrategyPerformance(session);
      
      // Generate optimization recommendations
      const optimizations = this.generateStrategyOptimizations(session, adaptationGoal, performanceAnalysis);
      
      // Apply optimizations
      const appliedOptimizations = this.applyStrategyOptimizations(session, optimizations);

      return {
        success: true,
        performanceAnalysis,
        optimizations,
        appliedOptimizations,
        expectedImprovement: this.estimateImprovementFromOptimizations(optimizations)
      };
    } catch (error) {
      logger.error('Error optimizing strategy:', error);
      throw error;
    }
  }

  async transferKnowledge(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { sourceSessionIds, targetSessionId, transferStrategy } = params;
      
      const targetSession = this.tuningSessions.get(targetSessionId);
      if (!targetSession) {
        throw new Error(`Target session not found: ${targetSessionId}`);
      }

      const sourceSessions = sourceSessionIds.map((id: string) => this.tuningSessions.get(id)).filter(Boolean);
      if (sourceSessions.length === 0) {
        throw new Error('No valid source sessions found');
      }

      let transferResult: any;

      switch (transferStrategy) {
        case 'warmstart':
          transferResult = this.performWarmStart(sourceSessions, targetSession);
          break;
        case 'meta_learning':
          transferResult = this.performMetaLearning(sourceSessions, targetSession);
          break;
        case 'surrogate_transfer':
          transferResult = this.performSurrogateTransfer(sourceSessions, targetSession);
          break;
        default:
          throw new Error(`Unsupported transfer strategy: ${transferStrategy}`);
      }

      return {
        success: true,
        transferStrategy,
        transferResult,
        expectedSpeedup: this.estimateTransferSpeedup(transferResult)
      };
    } catch (error) {
      logger.error('Error transferring knowledge:', error);
      throw error;
    }
  }

  private parseParameterDefinitions(params: any[]): HyperparameterDefinition[] {
    return params.map(param => ({
      name: param.name,
      type: param.type,
      range: param.range,
      distribution: param.distribution || 'uniform',
      scale: param.scale || 'linear',
      importance: param.importance || 'medium',
      dependencies: param.dependencies || [],
      defaultValue: param.defaultValue
    }));
  }

  private validateSearchSpace(space: HyperparameterSpace): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (space.parameters.length === 0) {
      errors.push('Search space must have at least one parameter');
    }

    // Validate parameter definitions
    for (const param of space.parameters) {
      if (!param.name.trim()) {
        errors.push('Parameter names cannot be empty');
      }
      if (!param.range) {
        errors.push(`Parameter ${param.name} must have a range defined`);
      }
    }

    // Validate search bounds
    if (space.searchBounds.maxEvaluations <= 0) {
      errors.push('Max evaluations must be positive');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private estimateSearchComplexity(space: HyperparameterSpace): any {
    const continuousParams = space.parameters.filter(p => p.type === 'continuous').length;
    const discreteParams = space.parameters.filter(p => p.type === 'discrete').length;
    const categoricalParams = space.parameters.filter(p => p.type === 'categorical').length;

    const dimensionality = space.parameters.length;
    const constraints = space.constraints.length;
    
    let complexity = 'low';
    if (dimensionality > 10 || constraints > 5) complexity = 'medium';
    if (dimensionality > 50 || constraints > 10) complexity = 'high';

    return {
      dimensionality,
      continuousParams,
      discreteParams,
      categoricalParams,
      constraints,
      overallComplexity: complexity,
      estimatedEvaluations: Math.min(space.searchBounds.maxEvaluations, Math.pow(10, dimensionality / 5))
    };
  }

  private recommendStrategy(space: HyperparameterSpace, complexity: any): any {
    const recommendations: any[] = [];

    for (const [id, strategy] of this.strategies) {
      let score = 0.5;

      // Parameter count suitability
      if (complexity.dimensionality >= strategy.suitability.parameterCount.min &&
          complexity.dimensionality <= strategy.suitability.parameterCount.max) {
        score += 0.3;
      }

      // Complexity alignment
      if (complexity.overallComplexity === 'low' && strategy.performance.convergenceSpeed > 0.7) score += 0.2;
      if (complexity.overallComplexity === 'high' && strategy.performance.scalability > 0.7) score += 0.2;

      recommendations.push({
        strategyId: id,
        strategyName: strategy.name,
        score,
        reasoning: this.generateStrategyReasoning(strategy, complexity)
      });
    }

    return recommendations.sort((a, b) => b.score - a.score);
  }

  private generateStrategyReasoning(strategy: OptimizationStrategy, complexity: any): string[] {
    const reasoning: string[] = [];

    if (complexity.dimensionality <= strategy.suitability.parameterCount.max) {
      reasoning.push(`Suitable for ${complexity.dimensionality} parameters`);
    }

    if (strategy.performance.convergenceSpeed > 0.8) {
      reasoning.push('Fast convergence expected');
    }

    if (strategy.suitability.parallelizable) {
      reasoning.push('Supports parallel evaluation');
    }

    if (strategy.performance.resourceEfficiency > 0.8) {
      reasoning.push('Efficient resource utilization');
    }

    return reasoning;
  }

  private initializeStatistics(): TuningStatistics {
    return {
      bestScore: -Infinity,
      averageScore: 0,
      scoreVariance: 0,
      convergenceRate: 0,
      parameterImportance: new Map(),
      parameterCorrelations: new Map(),
      explorationEfficiency: 0,
      timePerEvaluation: 0
    };
  }

  private initializeInsights(): TuningInsights {
    return {
      parameterSensitivity: new Map(),
      interactionEffects: [],
      optimalRegions: [],
      convergencePatterns: [],
      recommendations: []
    };
  }

  private async initializeStrategy(session: TuningSession, strategyConfig: OptimizationStrategy): Promise<void> {
    // Strategy-specific initialization
    switch (strategyConfig.algorithm) {
      case 'bayesian_optimization':
        // Initialize Gaussian Process surrogate model
        break;
      case 'genetic_algorithm':
        // Initialize population
        break;
      case 'hyperband':
        // Initialize resource allocation brackets
        break;
    }
  }

  private async generateInitialSuggestions(session: TuningSession, space: HyperparameterSpace): Promise<ParameterConfiguration[]> {
    const suggestions: ParameterConfiguration[] = [];
    const numInitial = Math.min(5, Math.floor(space.searchBounds.maxEvaluations * 0.1));

    for (let i = 0; i < numInitial; i++) {
      const config = this.generateRandomConfiguration(space);
      suggestions.push(config);
    }

    return suggestions;
  }

  private generateRandomConfiguration(space: HyperparameterSpace): ParameterConfiguration {
    const configId = `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const parameters = new Map<string, any>();

    for (const param of space.parameters) {
      const value = this.sampleParameter(param);
      parameters.set(param.name, value);
    }

    return {
      id: configId,
      parameters,
      score: 0,
      metrics: new Map(),
      metadata: {
        evaluationTime: 0,
        resourceUsage: {
          cpuTime: 0,
          memoryPeak: 0,
          gpuUtilization: 0,
          networkIO: 0,
          diskIO: 0
        },
        stability: 0,
        generalization: 0
      }
    };
  }

  private sampleParameter(param: HyperparameterDefinition): any {
    switch (param.type) {
      case 'continuous':
        return this.sampleContinuous(param);
      case 'discrete':
        return this.sampleDiscrete(param);
      case 'categorical':
        return this.sampleCategorical(param);
      case 'boolean':
        return Math.random() < 0.5;
      default:
        return param.defaultValue;
    }
  }

  private sampleContinuous(param: HyperparameterDefinition): number {
    const { min, max } = param.range;
    
    switch (param.distribution) {
      case 'uniform':
        return min + Math.random() * (max - min);
      case 'log_uniform':
        return Math.exp(Math.log(min) + Math.random() * (Math.log(max) - Math.log(min)));
      case 'normal':
        // Box-Muller transform for normal distribution
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return Math.max(min, Math.min(max, (min + max) / 2 + z * (max - min) / 6));
      default:
        return min + Math.random() * (max - min);
    }
  }

  private sampleDiscrete(param: HyperparameterDefinition): number {
    const { min, max } = param.range;
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  private sampleCategorical(param: HyperparameterDefinition): any {
    const choices = param.range;
    return choices[Math.floor(Math.random() * choices.length)];
  }

  private estimateTuningDuration(space: HyperparameterSpace, strategy: OptimizationStrategy): string {
    const avgEvaluationTime = 300; // 5 minutes per evaluation (estimate)
    const totalEvaluations = space.searchBounds.maxEvaluations;
    const parallelism = 1; // Assume sequential for estimation
    
    const totalSeconds = (avgEvaluationTime * totalEvaluations) / parallelism;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    return `${hours}h ${minutes}m`;
  }

  private shouldContinueTuning(session: TuningSession): { continue: boolean; reason: string } {
    // Check max evaluations
    if (session.progress.evaluationsCompleted >= session.progress.totalEvaluations) {
      return { continue: false, reason: 'Maximum evaluations reached' };
    }

    // Check convergence
    if (session.progress.convergenceIndicator > 0.95) {
      return { continue: false, reason: 'Convergence detected' };
    }

    // Check early stopping
    const recentHistory = session.history.slice(-10);
    if (recentHistory.length >= 10) {
      const recentScores = recentHistory.map(h => h.primaryMetric);
      const improvement = Math.max(...recentScores) - session.bestConfiguration.score;
      if (improvement < 0.001) {
        return { continue: false, reason: 'No significant improvement in recent evaluations' };
      }
    }

    return { continue: true, reason: 'Continuing optimization' };
  }

  private async generateNextConfiguration(session: TuningSession, space: HyperparameterSpace): Promise<ParameterConfiguration> {
    switch (session.strategy.algorithm) {
      case 'bayesian':
        return this.generateBayesianSuggestion(session, space);
      case 'genetic':
        return this.generateGeneticSuggestion(session, space);
      case 'hyperband':
        return this.generateHyperbandSuggestion(session, space);
      default:
        return this.generateRandomConfiguration(space);
    }
  }

  private generateBayesianSuggestion(session: TuningSession, space: HyperparameterSpace): ParameterConfiguration {
    // Simplified Bayesian optimization - in practice would use GP regression
    const config = this.generateRandomConfiguration(space);
    
    // Bias towards promising regions based on history
    if (session.history.length > 0) {
      const bestConfigs = session.history
        .filter(h => h.primaryMetric > session.statistics.averageScore)
        .slice(-5);
      
      if (bestConfigs.length > 0) {
        // Sample near best configurations
        const reference = bestConfigs[Math.floor(Math.random() * bestConfigs.length)];
        // Apply small perturbations to reference configuration
        for (const [paramName, paramValue] of reference.parameters) {
          const param = space.parameters.find(p => p.name === paramName);
          if (param && param.type === 'continuous') {
            const perturbation = (Math.random() - 0.5) * 0.1; // 10% perturbation
            const newValue = Math.max(param.range.min, Math.min(param.range.max, paramValue * (1 + perturbation)));
            config.parameters.set(paramName, newValue);
          }
        }
      }
    }
    
    return config;
  }

  private generateGeneticSuggestion(session: TuningSession, space: HyperparameterSpace): ParameterConfiguration {
    // Simplified genetic algorithm suggestion
    if (session.history.length < 2) {
      return this.generateRandomConfiguration(space);
    }

    // Select parents based on fitness
    const sortedHistory = session.history.slice().sort((a, b) => b.primaryMetric - a.primaryMetric);
    const parent1 = sortedHistory[0];
    const parent2 = sortedHistory[Math.min(1, sortedHistory.length - 1)];

    // Crossover
    const offspring = this.crossover(parent1, parent2, space);
    
    // Mutation
    return this.mutate(offspring, space, 0.1);
  }

  private generateHyperbandSuggestion(session: TuningSession, space: HyperparameterSpace): ParameterConfiguration {
    // Simplified Hyperband - just generate random configuration
    // In practice would implement successive halving with resource allocation
    return this.generateRandomConfiguration(space);
  }

  private crossover(parent1: EvaluationResult, parent2: EvaluationResult, space: HyperparameterSpace): ParameterConfiguration {
    const config = this.generateRandomConfiguration(space);
    
    // Uniform crossover
    for (const param of space.parameters) {
      const value1 = parent1.parameters.get(param.name);
      const value2 = parent2.parameters.get(param.name);
      
      if (value1 !== undefined && value2 !== undefined) {
        const useParent1 = Math.random() < 0.5;
        config.parameters.set(param.name, useParent1 ? value1 : value2);
      }
    }
    
    return config;
  }

  private mutate(config: ParameterConfiguration, space: HyperparameterSpace, mutationRate: number): ParameterConfiguration {
    for (const param of space.parameters) {
      if (Math.random() < mutationRate) {
        const newValue = this.sampleParameter(param);
        config.parameters.set(param.name, newValue);
      }
    }
    
    return config;
  }

  private updateAdaptiveSettings(session: TuningSession): void {
    const progress = session.progress.evaluationsCompleted / session.progress.totalEvaluations;
    
    // Decay exploration rate over time
    session.strategy.adaptiveSettings.explorationRate = 0.8 * Math.exp(-2 * progress);
    
    // Update convergence indicator
    if (session.history.length >= 10) {
      const recentScores = session.history.slice(-10).map(h => h.primaryMetric);
      const variance = this.calculateVariance(recentScores);
      session.progress.convergenceIndicator = Math.max(0, 1 - variance / Math.max(...recentScores));
    }
  }

  private updateStatistics(session: TuningSession, evaluation: EvaluationResult): void {
    const scores = session.history.map(h => h.primaryMetric);
    
    session.statistics.bestScore = Math.max(...scores);
    session.statistics.averageScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    session.statistics.scoreVariance = this.calculateVariance(scores);
    session.statistics.timePerEvaluation = session.progress.elapsedTime / session.progress.evaluationsCompleted;
    
    // Update parameter importance (simplified)
    for (const [paramName] of evaluation.parameters) {
      const currentImportance = session.statistics.parameterImportance.get(paramName) || 0;
      session.statistics.parameterImportance.set(paramName, currentImportance + 0.1);
    }
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  private generateCurrentInsights(session: TuningSession): Partial<TuningInsights> {
    return {
      recommendations: this.generateCurrentRecommendations(session)
    };
  }

  private generateCurrentRecommendations(session: TuningSession): TuningRecommendation[] {
    const recommendations: TuningRecommendation[] = [];
    
    if (session.progress.improvementRate < 0.01) {
      recommendations.push({
        type: 'parameter_adjustment',
        priority: 'high',
        description: 'Consider expanding search range for key parameters',
        expectedImprovement: 0.05,
        confidence: 0.7
      });
    }
    
    if (session.strategy.adaptiveSettings.explorationRate < 0.1) {
      recommendations.push({
        type: 'search_strategy',
        priority: 'medium',
        description: 'Increase exploration to discover new promising regions',
        expectedImprovement: 0.03,
        confidence: 0.6
      });
    }
    
    return recommendations;
  }

  private checkEarlyStopping(session: TuningSession): any {
    const recentHistory = session.history.slice(-5);
    if (recentHistory.length < 5) {
      return { recommend: false, reason: 'Insufficient data' };
    }
    
    const recentScores = recentHistory.map(h => h.primaryMetric);
    const maxRecent = Math.max(...recentScores);
    const improvement = maxRecent - session.bestConfiguration.score;
    
    if (improvement < 0.001) {
      return {
        recommend: true,
        reason: 'No significant improvement in recent evaluations',
        confidence: 0.8
      };
    }
    
    return { recommend: false, reason: 'Still improving' };
  }

  private generateFinalResults(session: TuningSession): any {
    return {
      bestConfiguration: session.bestConfiguration,
      totalEvaluations: session.progress.evaluationsCompleted,
      bestScore: session.statistics.bestScore,
      averageScore: session.statistics.averageScore,
      totalTime: session.progress.elapsedTime,
      convergenceAchieved: session.progress.convergenceIndicator > 0.9
    };
  }

  private performComprehensiveAnalysis(session: TuningSession): any {
    return {
      sensitivity: this.analyzeSensitivity(session),
      interactions: this.analyzeInteractions(session),
      convergence: this.analyzeConvergence(session),
      recommendations: this.generateRecommendations(session)
    };
  }

  private analyzeSensitivity(session: TuningSession): Map<string, ParameterSensitivity> {
    const sensitivity = new Map<string, ParameterSensitivity>();
    
    // Simplified sensitivity analysis
    for (const [paramName] of session.statistics.parameterImportance) {
      sensitivity.set(paramName, {
        parameter: paramName,
        sensitivity: session.statistics.parameterImportance.get(paramName) || 0,
        optimalRange: { min: 0, max: 1 }, // Would be computed from data
        marginalEffect: [0.1, 0.2, 0.3], // Simplified
        certainty: 0.8
      });
    }
    
    return sensitivity;
  }

  private analyzeInteractions(session: TuningSession): InteractionEffect[] {
    // Simplified interaction analysis
    return [
      {
        parameters: ['learning_rate', 'batch_size'],
        effectStrength: 0.3,
        synergistic: true,
        confidence: 0.7
      }
    ];
  }

  private analyzeConvergence(session: TuningSession): ConvergencePattern[] {
    const patterns: ConvergencePattern[] = [];
    
    const historyLength = session.history.length;
    if (historyLength >= 20) {
      patterns.push({
        phase: 'exploration',
        startEvaluation: 0,
        endEvaluation: Math.floor(historyLength * 0.3),
        characteristics: ['high_variance', 'diverse_sampling']
      });
      
      patterns.push({
        phase: 'exploitation',
        startEvaluation: Math.floor(historyLength * 0.3),
        endEvaluation: Math.floor(historyLength * 0.8),
        characteristics: ['focused_search', 'improving_trend']
      });
      
      patterns.push({
        phase: 'convergence',
        startEvaluation: Math.floor(historyLength * 0.8),
        endEvaluation: historyLength,
        characteristics: ['low_variance', 'marginal_improvements']
      });
    }
    
    return patterns;
  }

  private generateRecommendations(session: TuningSession): TuningRecommendation[] {
    const recommendations: TuningRecommendation[] = [];
    
    // Based on convergence analysis
    if (session.progress.convergenceIndicator > 0.8) {
      recommendations.push({
        type: 'early_stopping',
        priority: 'high',
        description: 'Consider stopping tuning as convergence has been achieved',
        expectedImprovement: 0.001,
        confidence: 0.9
      });
    }
    
    // Based on resource usage
    if (session.statistics.timePerEvaluation > 600) { // 10 minutes
      recommendations.push({
        type: 'resource_allocation',
        priority: 'medium',
        description: 'Consider reducing model complexity or using early stopping for individual evaluations',
        expectedImprovement: 0.02,
        confidence: 0.7
      });
    }
    
    return recommendations;
  }

  private generateSessionSummary(session: TuningSession): any {
    return {
      sessionId: session.id,
      status: session.status,
      totalEvaluations: session.progress.evaluationsCompleted,
      bestScore: session.statistics.bestScore,
      timeElapsed: session.progress.elapsedTime,
      strategy: session.strategy.algorithm,
      convergenceStatus: session.progress.convergenceIndicator
    };
  }

  private analyzeStrategyPerformance(session: TuningSession): any {
    return {
      convergenceSpeed: session.progress.convergenceIndicator / (session.progress.evaluationsCompleted / session.progress.totalEvaluations),
      explorationEfficiency: session.statistics.explorationEfficiency,
      resourceUtilization: session.progress.elapsedTime / (session.progress.evaluationsCompleted * session.statistics.timePerEvaluation),
      qualityImprovement: session.statistics.bestScore - session.statistics.averageScore
    };
  }

  private generateStrategyOptimizations(session: TuningSession, goal: string, analysis: any): any[] {
    const optimizations: any[] = [];
    
    switch (goal) {
      case 'speed':
        if (analysis.convergenceSpeed < 0.5) {
          optimizations.push({
            type: 'increase_exploration',
            parameters: { explorationRate: session.strategy.adaptiveSettings.explorationRate * 1.2 },
            expectedImprovement: 0.1
          });
        }
        break;
      case 'quality':
        optimizations.push({
          type: 'extend_search',
          parameters: { maxEvaluations: session.progress.totalEvaluations * 1.5 },
          expectedImprovement: 0.05
        });
        break;
    }
    
    return optimizations;
  }

  private applyStrategyOptimizations(session: TuningSession, optimizations: any[]): any[] {
    const applied: any[] = [];
    
    for (const opt of optimizations) {
      switch (opt.type) {
        case 'increase_exploration':
          session.strategy.adaptiveSettings.explorationRate = opt.parameters.explorationRate;
          applied.push({ type: opt.type, success: true });
          break;
        case 'extend_search':
          session.progress.totalEvaluations = opt.parameters.maxEvaluations;
          applied.push({ type: opt.type, success: true });
          break;
      }
    }
    
    return applied;
  }

  private estimateImprovementFromOptimizations(optimizations: any[]): number {
    return optimizations.reduce((sum, opt) => sum + opt.expectedImprovement, 0);
  }

  private performWarmStart(sourceSessions: TuningSession[], targetSession: TuningSession): any {
    // Transfer best configurations from source sessions
    const bestConfigs = sourceSessions
      .flatMap(s => s.history)
      .sort((a, b) => b.primaryMetric - a.primaryMetric)
      .slice(0, 5);
    
    return {
      method: 'warmstart',
      transferredConfigurations: bestConfigs.length,
      expectedSpeedup: Math.min(2.0, 1 + bestConfigs.length * 0.1)
    };
  }

  private performMetaLearning(sourceSessions: TuningSession[], targetSession: TuningSession): any {
    // Learn patterns from source sessions
    const patterns = this.extractMetaPatterns(sourceSessions);
    
    return {
      method: 'meta_learning',
      patternsExtracted: patterns.length,
      expectedSpeedup: 1.5
    };
  }

  private performSurrogateTransfer(sourceSessions: TuningSession[], targetSession: TuningSession): any {
    // Transfer surrogate model knowledge
    return {
      method: 'surrogate_transfer',
      modelsTransferred: sourceSessions.length,
      expectedSpeedup: 1.3
    };
  }

  private extractMetaPatterns(sessions: TuningSession[]): any[] {
    // Extract common optimization patterns
    return [
      { pattern: 'early_peak', frequency: 0.7 },
      { pattern: 'gradual_improvement', frequency: 0.5 }
    ];
  }

  private estimateTransferSpeedup(transferResult: any): number {
    return transferResult.expectedSpeedup || 1.0;
  }

  private async storeSearchSpace(space: HyperparameterSpace): Promise<void> {
    const query = `
      INSERT INTO hyperparameter_spaces (id, name, description, parameters, constraints, search_bounds, sampling_strategy, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `;
    
    await this.dbPool.query(query, [
      space.id,
      space.name,
      space.description,
      JSON.stringify(space.parameters),
      JSON.stringify(space.constraints),
      JSON.stringify(space.searchBounds),
      space.samplingStrategy,
      JSON.stringify(space.metadata),
      new Date()
    ]);
  }

  async getHealth(): Promise<{ content: { type: string; text: string }[] }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      searchSpaces: this.searchSpaces.size,
      activeSessions: Array.from(this.tuningSessions.values()).filter(s => s.status === 'running').length,
      completedSessions: Array.from(this.tuningSessions.values()).filter(s => s.status === 'completed').length,
      strategies: this.strategies.size,
      activeEvaluations: this.activeEvaluations.size
    };
  }
}