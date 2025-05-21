import { DatabasePool } from '../../../database/pg-pool.js';
import { RedisConnectionManager } from '../../../database/redis-client.js';
import { getLogger } from '../../../shared/logger.js';
import { BaseMCPServer } from '../../../shared/mcp/server.js';

const logger = getLogger('ActivationFunctionOptimizer');

export interface ActivationFunction {
  id: string;
  name: string;
  category: 'basic' | 'advanced' | 'adaptive' | 'custom';
  formula: string;
  derivative: string;
  properties: ActivationProperties;
  implementation: ActivationImplementation;
  performance: ActivationPerformance;
  metadata: {
    description: string;
    applications: string[];
    advantages: string[];
    disadvantages: string[];
    paperReference?: string;
    stability: 'low' | 'medium' | 'high';
  };
}

export interface ActivationProperties {
  range: { min: number; max: number };
  monotonic: boolean;
  differentiable: boolean;
  continuous: boolean;
  zeroCentered: boolean;
  bounded: boolean;
  saturating: boolean;
  vanishingGradientRisk: 'low' | 'medium' | 'high';
  explodingGradientRisk: 'low' | 'medium' | 'high';
  computationalComplexity: 'O(1)' | 'O(log n)' | 'O(n)';
}

export interface ActivationImplementation {
  forwardCode: string;
  backwardCode: string;
  numericalStability: {
    inputClipping: { enabled: boolean; min: number; max: number };
    outputClipping: { enabled: boolean; min: number; max: number };
    epsilon: number;
  };
  optimizations: {
    vectorized: boolean;
    inPlace: boolean;
    approximation?: string;
    lookupTable?: boolean;
  };
}

export interface ActivationPerformance {
  forwardPassTime: number; // microseconds
  backwardPassTime: number; // microseconds
  memoryUsage: number; // bytes per element
  accuracyLoss: number; // percentage
  gpuEfficiency: number; // 0-1 scale
}

export interface LayerActivationAnalysis {
  layerId: string;
  functionId: string;
  epoch: number;
  statistics: {
    activationMean: number;
    activationStd: number;
    activationRange: { min: number; max: number };
    gradientMean: number;
    gradientStd: number;
    deadNeuronRatio: number;
    saturatedNeuronRatio: number;
    activationDistribution: number[];
  };
  health: {
    vanishingGradientDetected: boolean;
    explodingGradientDetected: boolean;
    deadNeuronsProblem: boolean;
    saturationProblem: boolean;
    overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
  };
}

export interface OptimizationSession {
  id: string;
  networkId: string;
  status: 'active' | 'completed' | 'failed';
  strategy: 'evolutionary' | 'gradient_based' | 'bayesian' | 'neural_architecture_search';
  searchSpace: ActivationSearchSpace;
  currentCandidate: ActivationCandidate;
  history: ActivationCandidate[];
  metrics: OptimizationMetrics;
  startTime: Date;
  endTime?: Date;
}

export interface ActivationSearchSpace {
  functions: string[]; // Allowed activation function IDs
  adaptiveParameters: {
    learningRates: number[];
    temperatureRange: { min: number; max: number };
    shapeParameters: { min: number; max: number };
  };
  constraints: {
    maxComplexity: 'O(1)' | 'O(log n)' | 'O(n)';
    preserveMonotonicity: boolean;
    maintainBounds: boolean;
    vanishingGradientThreshold: number;
  };
}

export interface ActivationCandidate {
  id: string;
  functionId: string;
  parameters: any;
  layerAssignments: Map<string, string>;
  score: number;
  metrics: {
    convergenceSpeed: number;
    finalAccuracy: number;
    stability: number;
    efficiency: number;
  };
  timestamp: Date;
}

export interface OptimizationMetrics {
  generationsCompleted: number;
  bestScore: number;
  averageScore: number;
  diversityIndex: number;
  convergenceRate: number;
  explorationVsExploitation: number;
}

export interface AdaptiveActivation {
  id: string;
  baseFunction: string;
  adaptationMechanism: 'parameter_learning' | 'shape_morphing' | 'ensemble_weighting' | 'context_switching';
  adaptiveParameters: {
    [key: string]: {
      initialValue: number;
      learningRate: number;
      bounds: { min: number; max: number };
      schedule: 'constant' | 'decay' | 'cyclic';
    };
  };
  updateRule: string;
  history: ParameterUpdate[];
}

export interface ParameterUpdate {
  epoch: number;
  parameterId: string;
  oldValue: number;
  newValue: number;
  gradient: number;
  performanceImpact: number;
}

export class ActivationFunctionOptimizer extends BaseMCPServer {
  private dbPool: DatabasePool;
  private redis: RedisConnectionManager;
  private activationFunctions: Map<string, ActivationFunction> = new Map();
  private optimizationSessions: Map<string, OptimizationSession> = new Map();
  private adaptiveActivations: Map<string, AdaptiveActivation> = new Map();
  private layerAnalyses: Map<string, LayerActivationAnalysis[]> = new Map();
  private compiledFunctions: Map<string, { forward: Function; backward: Function }> = new Map();

  constructor(dbPool: DatabasePool, redis: RedisConnectionManager, options: any = {}) {
    super('activation-function-optimizer', options);
    this.dbPool = dbPool;
    this.redis = redis;
    this.initializeStandardActivations();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.addTool('create_activation_function', {
      description: 'Create custom activation function with optimized implementation',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          formula: { type: 'string' },
          derivative: { type: 'string' },
          properties: { type: 'object' },
          implementation: { type: 'object' }
        },
        required: ['name', 'formula', 'derivative']
      }
    }, this.createActivationFunction.bind(this));

    this.addTool('analyze_layer_activations', {
      description: 'Analyze activation patterns and health in network layers',
      parameters: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          layerIds: { type: 'array' },
          activationData: { type: 'object' },
          gradientData: { type: 'object' }
        },
        required: ['networkId', 'layerIds', 'activationData']
      }
    }, this.analyzeLayerActivations.bind(this));

    this.addTool('optimize_activations', {
      description: 'Optimize activation functions for a neural network',
      parameters: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          strategy: { type: 'string', enum: ['evolutionary', 'gradient_based', 'bayesian', 'neural_architecture_search'] },
          searchSpace: { type: 'object' },
          optimizationConfig: { type: 'object' }
        },
        required: ['networkId', 'strategy']
      }
    }, this.optimizeActivations.bind(this));

    this.addTool('recommend_activation', {
      description: 'Recommend optimal activation function for specific layer and task',
      parameters: {
        type: 'object',
        properties: {
          layerType: { type: 'string' },
          networkType: { type: 'string' },
          taskType: { type: 'string' },
          constraints: { type: 'object' },
          currentProblems: { type: 'array' }
        },
        required: ['layerType', 'networkType', 'taskType']
      }
    }, this.recommendActivation.bind(this));

    this.addTool('create_adaptive_activation', {
      description: 'Create adaptive activation function that learns during training',
      parameters: {
        type: 'object',
        properties: {
          baseFunction: { type: 'string' },
          adaptationMechanism: { type: 'string' },
          adaptiveParameters: { type: 'object' },
          updateRule: { type: 'string' }
        },
        required: ['baseFunction', 'adaptationMechanism']
      }
    }, this.createAdaptiveActivation.bind(this));

    this.addTool('benchmark_activations', {
      description: 'Benchmark activation functions on computational performance',
      parameters: {
        type: 'object',
        properties: {
          functionIds: { type: 'array' },
          benchmarkType: { type: 'string', enum: ['speed', 'memory', 'accuracy', 'stability'] },
          inputSizes: { type: 'array' },
          deviceType: { type: 'string', enum: ['cpu', 'gpu', 'both'] }
        },
        required: ['functionIds', 'benchmarkType']
      }
    }, this.benchmarkActivations.bind(this));
  }

  private initializeStandardActivations(): void {
    // ReLU
    this.activationFunctions.set('relu', {
      id: 'relu',
      name: 'Rectified Linear Unit',
      category: 'basic',
      formula: 'max(0, x)',
      derivative: 'x > 0 ? 1 : 0',
      properties: {
        range: { min: 0, max: Infinity },
        monotonic: true,
        differentiable: false, // at x=0
        continuous: true,
        zeroCentered: false,
        bounded: false,
        saturating: false,
        vanishingGradientRisk: 'low',
        explodingGradientRisk: 'medium',
        computationalComplexity: 'O(1)'
      },
      implementation: {
        forwardCode: 'Math.max(0, x)',
        backwardCode: 'x > 0 ? 1 : 0',
        numericalStability: {
          inputClipping: { enabled: false, min: -Infinity, max: Infinity },
          outputClipping: { enabled: true, min: 0, max: 1e6 },
          epsilon: 1e-8
        },
        optimizations: {
          vectorized: true,
          inPlace: true,
          approximation: '',
          lookupTable: false
        }
      },
      performance: {
        forwardPassTime: 0.1,
        backwardPassTime: 0.05,
        memoryUsage: 4,
        accuracyLoss: 0,
        gpuEfficiency: 0.95
      },
      metadata: {
        description: 'Simple and efficient activation function that outputs max(0, x)',
        applications: ['Hidden layers', 'CNNs', 'Deep networks'],
        advantages: ['Simple computation', 'No vanishing gradient', 'Sparse activation'],
        disadvantages: ['Dead neurons', 'Not zero-centered', 'Unbounded output'],
        stability: 'high'
      }
    });

    // Swish/SiLU
    this.activationFunctions.set('swish', {
      id: 'swish',
      name: 'Swish (SiLU)',
      category: 'advanced',
      formula: 'x * sigmoid(x)',
      derivative: 'sigmoid(x) + x * sigmoid(x) * (1 - sigmoid(x))',
      properties: {
        range: { min: -0.278, max: Infinity },
        monotonic: false,
        differentiable: true,
        continuous: true,
        zeroCentered: false,
        bounded: false,
        saturating: false,
        vanishingGradientRisk: 'low',
        explodingGradientRisk: 'low',
        computationalComplexity: 'O(1)'
      },
      implementation: {
        forwardCode: 'x * (1 / (1 + Math.exp(-x)))',
        backwardCode: 'const sig = 1 / (1 + Math.exp(-x)); return sig + x * sig * (1 - sig);',
        numericalStability: {
          inputClipping: { enabled: true, min: -50, max: 50 },
          outputClipping: { enabled: false, min: -Infinity, max: Infinity },
          epsilon: 1e-8
        },
        optimizations: {
          vectorized: true,
          inPlace: false,
          approximation: 'tanh_approx',
          lookupTable: true
        }
      },
      performance: {
        forwardPassTime: 0.8,
        backwardPassTime: 1.2,
        memoryUsage: 8,
        accuracyLoss: 0.01,
        gpuEfficiency: 0.85
      },
      metadata: {
        description: 'Smooth, non-monotonic activation that can output negative values',
        applications: ['Transformer models', 'Modern CNNs', 'NLP tasks'],
        advantages: ['Smooth', 'Self-gated', 'Good empirical results'],
        disadvantages: ['More computation', 'Less interpretable'],
        paperReference: 'Ramachandran et al. (2017) - Searching for Activation Functions',
        stability: 'high'
      }
    });

    // GELU
    this.activationFunctions.set('gelu', {
      id: 'gelu',
      name: 'Gaussian Error Linear Unit',
      category: 'advanced',
      formula: '0.5 * x * (1 + tanh(√(2/π) * (x + 0.044715 * x³)))',
      derivative: 'complex_gelu_derivative',
      properties: {
        range: { min: -0.17, max: Infinity },
        monotonic: false,
        differentiable: true,
        continuous: true,
        zeroCentered: false,
        bounded: false,
        saturating: false,
        vanishingGradientRisk: 'low',
        explodingGradientRisk: 'low',
        computationalComplexity: 'O(1)'
      },
      implementation: {
        forwardCode: '0.5 * x * (1 + Math.tanh(Math.sqrt(2/Math.PI) * (x + 0.044715 * x * x * x)))',
        backwardCode: 'gelu_backward_complex',
        numericalStability: {
          inputClipping: { enabled: true, min: -10, max: 10 },
          outputClipping: { enabled: false, min: -Infinity, max: Infinity },
          epsilon: 1e-8
        },
        optimizations: {
          vectorized: true,
          inPlace: false,
          approximation: 'erf_approx',
          lookupTable: true
        }
      },
      performance: {
        forwardPassTime: 1.5,
        backwardPassTime: 2.0,
        memoryUsage: 12,
        accuracyLoss: 0.005,
        gpuEfficiency: 0.8
      },
      metadata: {
        description: 'Probabilistic activation based on Gaussian distribution',
        applications: ['BERT', 'GPT', 'Transformer models', 'NLP'],
        advantages: ['Smooth', 'Probabilistic interpretation', 'Good for transformers'],
        disadvantages: ['Computational overhead', 'Complex derivative'],
        paperReference: 'Hendrycks & Gimpel (2016) - Gaussian Error Linear Units',
        stability: 'medium'
      }
    });

    // Mish
    this.activationFunctions.set('mish', {
      id: 'mish',
      name: 'Mish',
      category: 'advanced',
      formula: 'x * tanh(ln(1 + eˣ))',
      derivative: 'complex_mish_derivative',
      properties: {
        range: { min: -0.31, max: Infinity },
        monotonic: false,
        differentiable: true,
        continuous: true,
        zeroCentered: false,
        bounded: false,
        saturating: false,
        vanishingGradientRisk: 'low',
        explodingGradientRisk: 'low',
        computationalComplexity: 'O(1)'
      },
      implementation: {
        forwardCode: 'x * Math.tanh(Math.log(1 + Math.exp(x)))',
        backwardCode: 'mish_backward_complex',
        numericalStability: {
          inputClipping: { enabled: true, min: -50, max: 50 },
          outputClipping: { enabled: false, min: -Infinity, max: Infinity },
          epsilon: 1e-8
        },
        optimizations: {
          vectorized: true,
          inPlace: false,
          approximation: 'softplus_approx',
          lookupTable: true
        }
      },
      performance: {
        forwardPassTime: 2.0,
        backwardPassTime: 2.5,
        memoryUsage: 16,
        accuracyLoss: 0.002,
        gpuEfficiency: 0.75
      },
      metadata: {
        description: 'Self-regularized non-monotonic activation function',
        applications: ['Computer vision', 'Object detection', 'Classification'],
        advantages: ['Self-regularized', 'Unbounded above', 'Good empirical results'],
        disadvantages: ['Computational complexity', 'Memory intensive'],
        paperReference: 'Misra (2019) - Mish: A Self Regularized Non-Monotonic Neural Activation Function',
        stability: 'medium'
      }
    });
  }

  async createActivationFunction(params: any): Promise<any> {
    try {
      const functionId = `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const activationFunction: ActivationFunction = {
        id: functionId,
        name: params.name,
        category: 'custom',
        formula: params.formula,
        derivative: params.derivative,
        properties: params.properties || this.inferProperties(params.formula),
        implementation: params.implementation || this.generateDefaultImplementation(params.formula, params.derivative),
        performance: await this.benchmarkFunction(params.formula, params.derivative),
        metadata: {
          description: params.description || '',
          applications: params.applications || [],
          advantages: params.advantages || [],
          disadvantages: params.disadvantages || [],
          paperReference: params.paperReference,
          stability: params.stability || 'medium'
        }
      };

      // Validate function
      const validation = this.validateActivationFunction(activationFunction);
      if (!validation.isValid) {
        throw new Error(`Invalid activation function: ${validation.errors.join(', ')}`);
      }

      // Compile function
      const compiled = this.compileActivationFunction(activationFunction);
      this.compiledFunctions.set(functionId, compiled);

      this.activationFunctions.set(functionId, activationFunction);
      await this.storeActivationFunction(activationFunction);

      return {
        success: true,
        functionId,
        activationFunction,
        validation,
        performanceBenchmark: activationFunction.performance
      };
    } catch (error) {
      logger.error('Error creating activation function:', error);
      throw error;
    }
  }

  async analyzeLayerActivations(params: any): Promise<any> {
    try {
      const { networkId, layerIds, activationData, gradientData = {} } = params;
      
      const analyses: LayerActivationAnalysis[] = [];
      
      for (const layerId of layerIds) {
        const layerActivations = activationData[layerId];
        const layerGradients = gradientData[layerId];
        
        if (!layerActivations) {
          throw new Error(`No activation data found for layer: ${layerId}`);
        }

        const analysis = this.computeLayerAnalysis(layerId, layerActivations, layerGradients);
        analyses.push(analysis);
      }

      // Store analyses
      this.layerAnalyses.set(networkId, analyses);

      // Generate recommendations
      const recommendations = this.generateLayerRecommendations(analyses);
      
      // Detect global patterns
      const globalPatterns = this.detectGlobalPatterns(analyses);

      return {
        success: true,
        analyses,
        recommendations,
        globalPatterns,
        networkHealth: this.assessNetworkHealth(analyses)
      };
    } catch (error) {
      logger.error('Error analyzing layer activations:', error);
      throw error;
    }
  }

  async optimizeActivations(params: any): Promise<any> {
    try {
      const { networkId, strategy, searchSpace = {}, optimizationConfig = {} } = params;
      
      const sessionId = `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session: OptimizationSession = {
        id: sessionId,
        networkId,
        status: 'active',
        strategy,
        searchSpace: this.buildSearchSpace(searchSpace),
        currentCandidate: await this.generateInitialCandidate(searchSpace),
        history: [],
        metrics: {
          generationsCompleted: 0,
          bestScore: 0,
          averageScore: 0,
          diversityIndex: 1.0,
          convergenceRate: 0,
          explorationVsExploitation: 0.5
        },
        startTime: new Date()
      };

      this.optimizationSessions.set(sessionId, session);

      // Start optimization process
      const result = await this.executeOptimization(session, optimizationConfig);

      return {
        success: true,
        sessionId,
        initialResult: result,
        estimatedDuration: this.estimateOptimizationDuration(strategy, searchSpace)
      };
    } catch (error) {
      logger.error('Error optimizing activations:', error);
      throw error;
    }
  }

  async recommendActivation(params: any): Promise<any> {
    try {
      const { layerType, networkType, taskType, constraints = {}, currentProblems = [] } = params;
      
      // Score all available activation functions
      const candidates = Array.from(this.activationFunctions.values())
        .map(func => ({
          function: func,
          score: this.scoreActivationFunction(func, layerType, networkType, taskType, constraints),
          reasoning: this.generateRecommendationReasoning(func, layerType, networkType, taskType, currentProblems)
        }))
        .sort((a, b) => b.score - a.score);

      const topRecommendations = candidates.slice(0, 3);
      
      // Problem-specific recommendations
      const problemSolutions = this.recommendForProblems(currentProblems);
      
      // Architecture-specific advice
      const architectureAdvice = this.getArchitectureSpecificAdvice(networkType, taskType);

      return {
        success: true,
        recommendations: topRecommendations,
        problemSolutions,
        architectureAdvice,
        customSuggestion: await this.suggestCustomActivation(layerType, networkType, taskType, constraints)
      };
    } catch (error) {
      logger.error('Error recommending activation:', error);
      throw error;
    }
  }

  async createAdaptiveActivation(params: any): Promise<any> {
    try {
      const { baseFunction, adaptationMechanism, adaptiveParameters = {}, updateRule = 'gradient_descent' } = params;
      
      const baseFunc = this.activationFunctions.get(baseFunction);
      if (!baseFunc) {
        throw new Error(`Base function not found: ${baseFunction}`);
      }

      const adaptiveId = `adaptive_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const adaptiveActivation: AdaptiveActivation = {
        id: adaptiveId,
        baseFunction,
        adaptationMechanism,
        adaptiveParameters: this.processAdaptiveParameters(adaptiveParameters, adaptationMechanism),
        updateRule,
        history: []
      };

      this.adaptiveActivations.set(adaptiveId, adaptiveActivation);
      await this.storeAdaptiveActivation(adaptiveActivation);

      // Generate implementation
      const implementation = this.generateAdaptiveImplementation(adaptiveActivation, baseFunc);

      return {
        success: true,
        adaptiveId,
        configuration: adaptiveActivation,
        implementation,
        expectedBenefits: this.predictAdaptiveBenefits(adaptiveActivation)
      };
    } catch (error) {
      logger.error('Error creating adaptive activation:', error);
      throw error;
    }
  }

  async benchmarkActivations(params: any): Promise<any> {
    try {
      const { functionIds, benchmarkType, inputSizes = [1000, 10000, 100000], deviceType = 'cpu' } = params;
      
      const results: any = {
        benchmarkType,
        deviceType,
        inputSizes,
        results: new Map(),
        summary: {},
        recommendations: []
      };

      for (const functionId of functionIds) {
        const func = this.activationFunctions.get(functionId);
        if (!func) {
          logger.warn(`Function not found for benchmarking: ${functionId}`);
          continue;
        }

        const benchmarkResult = await this.runBenchmark(func, benchmarkType, inputSizes, deviceType);
        results.results.set(functionId, benchmarkResult);
      }

      // Generate summary and recommendations
      results.summary = this.generateBenchmarkSummary(results.results, benchmarkType);
      results.recommendations = this.generateBenchmarkRecommendations(results.results, benchmarkType);

      return {
        success: true,
        benchmark: results
      };
    } catch (error) {
      logger.error('Error benchmarking activations:', error);
      throw error;
    }
  }

  private inferProperties(formula: string): ActivationProperties {
    // Simplified property inference based on formula analysis
    const hasMax = formula.includes('max');
    const hasExp = formula.includes('exp') || formula.includes('sigmoid') || formula.includes('tanh');
    const hasPower = formula.includes('^') || formula.includes('**');
    
    return {
      range: hasMax ? { min: 0, max: Infinity } : { min: -Infinity, max: Infinity },
      monotonic: hasMax && !hasPower,
      differentiable: !hasMax,
      continuous: true,
      zeroCentered: !hasMax,
      bounded: formula.includes('tanh') || formula.includes('sigmoid'),
      saturating: formula.includes('tanh') || formula.includes('sigmoid'),
      vanishingGradientRisk: hasExp ? 'medium' : 'low',
      explodingGradientRisk: hasPower ? 'medium' : 'low',
      computationalComplexity: hasExp || hasPower ? 'O(log n)' : 'O(1)'
    };
  }

  private generateDefaultImplementation(formula: string, derivative: string): ActivationImplementation {
    return {
      forwardCode: formula.replace(/x/g, 'input'),
      backwardCode: derivative.replace(/x/g, 'input'),
      numericalStability: {
        inputClipping: { enabled: false, min: -Infinity, max: Infinity },
        outputClipping: { enabled: false, min: -Infinity, max: Infinity },
        epsilon: 1e-8
      },
      optimizations: {
        vectorized: true,
        inPlace: false,
        lookupTable: false
      }
    };
  }

  private async benchmarkFunction(formula: string, derivative: string): Promise<ActivationPerformance> {
    // Simulate performance benchmarking
    const complexity = formula.length + derivative.length;
    const baseTime = 0.1;
    
    return {
      forwardPassTime: baseTime * (1 + complexity * 0.01),
      backwardPassTime: baseTime * (1 + complexity * 0.015),
      memoryUsage: 4 + complexity * 0.5,
      accuracyLoss: 0,
      gpuEfficiency: Math.max(0.5, 1 - complexity * 0.01)
    };
  }

  private validateActivationFunction(func: ActivationFunction): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!func.name.trim()) {
      errors.push('Activation function name cannot be empty');
    }

    if (!func.formula.trim()) {
      errors.push('Formula cannot be empty');
    }

    if (!func.derivative.trim()) {
      errors.push('Derivative cannot be empty');
    }

    if (func.properties.range.min >= func.properties.range.max) {
      errors.push('Invalid range: min must be less than max');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private compileActivationFunction(func: ActivationFunction): { forward: Function; backward: Function } {
    // Simplified compilation - in practice, this would generate optimized code
    const forwardFn = new Function('x', `
      const input = x;
      return ${func.implementation.forwardCode};
    `);

    const backwardFn = new Function('x', `
      const input = x;
      return ${func.implementation.backwardCode};
    `);

    return { forward: forwardFn, backward: backwardFn };
  }

  private computeLayerAnalysis(layerId: string, activations: number[], gradients?: number[]): LayerActivationAnalysis {
    const activationMean = activations.reduce((sum, a) => sum + a, 0) / activations.length;
    const activationStd = Math.sqrt(activations.reduce((sum, a) => sum + Math.pow(a - activationMean, 2), 0) / activations.length);
    const activationRange = {
      min: Math.min(...activations),
      max: Math.max(...activations)
    };

    const deadNeuronRatio = activations.filter(a => Math.abs(a) < 1e-6).length / activations.length;
    const saturatedNeuronRatio = activations.filter(a => Math.abs(a) > 0.99).length / activations.length;

    let gradientMean = 0, gradientStd = 0;
    let vanishingGradientDetected = false, explodingGradientDetected = false;

    if (gradients) {
      gradientMean = gradients.reduce((sum, g) => sum + g, 0) / gradients.length;
      gradientStd = Math.sqrt(gradients.reduce((sum, g) => sum + Math.pow(g - gradientMean, 2), 0) / gradients.length);
      
      vanishingGradientDetected = Math.abs(gradientMean) < 1e-6;
      explodingGradientDetected = Math.abs(gradientMean) > 100;
    }

    // Generate activation distribution (simplified histogram)
    const activationDistribution = this.generateHistogram(activations, 20);

    const overallHealth = this.assessLayerHealth(deadNeuronRatio, saturatedNeuronRatio, vanishingGradientDetected, explodingGradientDetected);

    return {
      layerId,
      functionId: 'unknown', // Would be provided in real implementation
      epoch: 0, // Would be provided in real implementation
      statistics: {
        activationMean,
        activationStd,
        activationRange,
        gradientMean,
        gradientStd,
        deadNeuronRatio,
        saturatedNeuronRatio,
        activationDistribution
      },
      health: {
        vanishingGradientDetected,
        explodingGradientDetected,
        deadNeuronsProblem: deadNeuronRatio > 0.1,
        saturationProblem: saturatedNeuronRatio > 0.5,
        overallHealth
      }
    };
  }

  private generateHistogram(data: number[], bins: number): number[] {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binWidth = (max - min) / bins;
    const histogram = new Array(bins).fill(0);

    for (const value of data) {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
      histogram[binIndex]++;
    }

    return histogram;
  }

  private assessLayerHealth(deadRatio: number, saturatedRatio: number, vanishing: boolean, exploding: boolean): 'excellent' | 'good' | 'fair' | 'poor' {
    if (exploding || deadRatio > 0.3) return 'poor';
    if (vanishing || saturatedRatio > 0.7 || deadRatio > 0.1) return 'fair';
    if (saturatedRatio > 0.3 || deadRatio > 0.05) return 'good';
    return 'excellent';
  }

  private generateLayerRecommendations(analyses: LayerActivationAnalysis[]): string[] {
    const recommendations: string[] = [];

    for (const analysis of analyses) {
      if (analysis.health.deadNeuronsProblem) {
        recommendations.push(`Layer ${analysis.layerId}: Consider switching from ReLU to Leaky ReLU or ELU to reduce dead neurons`);
      }
      if (analysis.health.vanishingGradientDetected) {
        recommendations.push(`Layer ${analysis.layerId}: Use ReLU, Swish, or GELU to mitigate vanishing gradients`);
      }
      if (analysis.health.explodingGradientDetected) {
        recommendations.push(`Layer ${analysis.layerId}: Apply gradient clipping or use bounded activation functions`);
      }
      if (analysis.health.saturationProblem) {
        recommendations.push(`Layer ${analysis.layerId}: Consider unbounded activations like ReLU or Swish`);
      }
    }

    return recommendations;
  }

  private detectGlobalPatterns(analyses: LayerActivationAnalysis[]): any {
    const patterns = {
      vanishingGradientLayers: analyses.filter(a => a.health.vanishingGradientDetected).length,
      deadNeuronLayers: analyses.filter(a => a.health.deadNeuronsProblem).length,
      healthyLayers: analyses.filter(a => a.health.overallHealth === 'excellent' || a.health.overallHealth === 'good').length,
      averageDeadNeuronRatio: analyses.reduce((sum, a) => sum + a.statistics.deadNeuronRatio, 0) / analyses.length,
      networkWideIssues: []
    };

    if (patterns.vanishingGradientLayers > analyses.length * 0.3) {
      patterns.networkWideIssues.push('widespread_vanishing_gradients');
    }
    if (patterns.deadNeuronLayers > analyses.length * 0.3) {
      patterns.networkWideIssues.push('widespread_dead_neurons');
    }

    return patterns;
  }

  private assessNetworkHealth(analyses: LayerActivationAnalysis[]): string {
    const healthyLayers = analyses.filter(a => a.health.overallHealth === 'excellent' || a.health.overallHealth === 'good').length;
    const healthRatio = healthyLayers / analyses.length;

    if (healthRatio > 0.8) return 'excellent';
    if (healthRatio > 0.6) return 'good';
    if (healthRatio > 0.4) return 'fair';
    return 'poor';
  }

  private buildSearchSpace(searchSpace: any): ActivationSearchSpace {
    return {
      functions: searchSpace.functions || ['relu', 'swish', 'gelu', 'mish'],
      adaptiveParameters: {
        learningRates: searchSpace.learningRates || [0.001, 0.01, 0.1],
        temperatureRange: searchSpace.temperatureRange || { min: 0.1, max: 2.0 },
        shapeParameters: searchSpace.shapeParameters || { min: 0.1, max: 3.0 }
      },
      constraints: {
        maxComplexity: searchSpace.maxComplexity || 'O(1)',
        preserveMonotonicity: searchSpace.preserveMonotonicity || false,
        maintainBounds: searchSpace.maintainBounds || false,
        vanishingGradientThreshold: searchSpace.vanishingGradientThreshold || 1e-6
      }
    };
  }

  private async generateInitialCandidate(searchSpace: any): Promise<ActivationCandidate> {
    const candidateId = `candidate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id: candidateId,
      functionId: 'relu', // Default starting point
      parameters: {},
      layerAssignments: new Map(),
      score: 0,
      metrics: {
        convergenceSpeed: 0,
        finalAccuracy: 0,
        stability: 0,
        efficiency: 0
      },
      timestamp: new Date()
    };
  }

  private async executeOptimization(session: OptimizationSession, config: any): Promise<any> {
    // Simulate optimization process
    session.metrics.generationsCompleted = 1;
    session.currentCandidate.score = 0.7 + Math.random() * 0.3;
    session.history.push(session.currentCandidate);

    return {
      generation: 1,
      bestCandidate: session.currentCandidate,
      improvement: 0.1,
      convergenceStatus: 'improving'
    };
  }

  private estimateOptimizationDuration(strategy: string, searchSpace: any): string {
    const complexityFactors = {
      evolutionary: 2,
      gradient_based: 1,
      bayesian: 1.5,
      neural_architecture_search: 3
    };

    const baseDuration = 30; // minutes
    const factor = complexityFactors[strategy as keyof typeof complexityFactors] || 1;
    const searchSpaceSize = Object.keys(searchSpace).length + 1;

    return `${Math.round(baseDuration * factor * searchSpaceSize)} minutes`;
  }

  private scoreActivationFunction(func: ActivationFunction, layerType: string, networkType: string, taskType: string, constraints: any): number {
    let score = 0.5; // Base score

    // Layer type compatibility
    if (layerType === 'output') {
      if (taskType === 'classification' && func.properties.bounded) score += 0.2;
      if (taskType === 'regression' && !func.properties.bounded) score += 0.2;
    } else if (layerType === 'hidden') {
      if (func.properties.vanishingGradientRisk === 'low') score += 0.2;
      if (!func.properties.saturating) score += 0.1;
    }

    // Network type compatibility
    if (networkType === 'deep' && func.properties.vanishingGradientRisk === 'low') score += 0.2;
    if (networkType === 'cnn' && func.id === 'relu') score += 0.15;
    if (networkType === 'transformer' && (func.id === 'gelu' || func.id === 'swish')) score += 0.2;

    // Performance constraints
    if (constraints.speed === 'high' && func.performance.forwardPassTime < 0.5) score += 0.1;
    if (constraints.memory === 'low' && func.performance.memoryUsage < 8) score += 0.1;

    return Math.min(1.0, score);
  }

  private generateRecommendationReasoning(func: ActivationFunction, layerType: string, networkType: string, taskType: string, problems: string[]): string[] {
    const reasoning: string[] = [];

    // Add function-specific advantages
    reasoning.push(...func.metadata.advantages);

    // Add problem-specific reasoning
    if (problems.includes('dead_neurons') && func.id !== 'relu') {
      reasoning.push('Avoids dead neuron problem unlike ReLU');
    }
    if (problems.includes('vanishing_gradients') && func.properties.vanishingGradientRisk === 'low') {
      reasoning.push('Low vanishing gradient risk');
    }

    // Add task-specific reasoning
    if (taskType === 'nlp' && (func.id === 'gelu' || func.id === 'swish')) {
      reasoning.push('Proven effective in NLP tasks and transformer models');
    }

    return reasoning;
  }

  private recommendForProblems(problems: string[]): any {
    const solutions: any = {};

    if (problems.includes('dead_neurons')) {
      solutions.dead_neurons = {
        recommendations: ['leaky_relu', 'elu', 'swish'],
        explanation: 'These activations maintain gradient flow for negative inputs'
      };
    }

    if (problems.includes('vanishing_gradients')) {
      solutions.vanishing_gradients = {
        recommendations: ['relu', 'swish', 'mish'],
        explanation: 'These activations preserve gradient magnitude in deeper layers'
      };
    }

    if (problems.includes('saturation')) {
      solutions.saturation = {
        recommendations: ['relu', 'leaky_relu', 'swish'],
        explanation: 'Unbounded activations prevent saturation issues'
      };
    }

    return solutions;
  }

  private getArchitectureSpecificAdvice(networkType: string, taskType: string): any {
    const advice: any = {};

    switch (networkType) {
      case 'cnn':
        advice.general = 'ReLU family works well for CNNs due to computational efficiency';
        advice.hidden_layers = 'ReLU, Leaky ReLU, or Swish for hidden layers';
        advice.output_layer = 'Softmax for classification, linear for regression';
        break;
      case 'transformer':
        advice.general = 'GELU and Swish are preferred in transformer architectures';
        advice.hidden_layers = 'GELU in feed-forward layers';
        advice.attention = 'Standard attention mechanism uses softmax';
        break;
      case 'rnn':
        advice.general = 'Tanh traditionally used, but modern activations can improve performance';
        advice.gates = 'Sigmoid for gates, tanh for candidate values';
        advice.output = 'ReLU or Swish for output transformations';
        break;
    }

    return advice;
  }

  private async suggestCustomActivation(layerType: string, networkType: string, taskType: string, constraints: any): Promise<any> {
    // Generate custom activation suggestion based on requirements
    if (constraints.speed === 'critical' && constraints.accuracy === 'high') {
      return {
        suggested: true,
        name: 'Optimized ReLU Variant',
        formula: 'max(0.01x, x)',  // Leaky ReLU
        reasoning: 'Minimal computation overhead while avoiding dead neurons',
        parameters: { alpha: 0.01 }
      };
    }

    if (taskType === 'generation' && networkType === 'transformer') {
      return {
        suggested: true,
        name: 'Temperature-Scaled GELU',
        formula: 'temperature * GELU(x/temperature)',
        reasoning: 'Allows dynamic control of activation sharpness for generation tasks',
        parameters: { temperature: 1.0 }
      };
    }

    return { suggested: false };
  }

  private processAdaptiveParameters(params: any, mechanism: string): any {
    const processed: any = {};

    switch (mechanism) {
      case 'parameter_learning':
        processed.alpha = {
          initialValue: params.alpha || 0.2,
          learningRate: params.alphaLR || 0.01,
          bounds: { min: 0.01, max: 1.0 },
          schedule: 'constant'
        };
        break;
      case 'temperature_scaling':
        processed.temperature = {
          initialValue: params.temperature || 1.0,
          learningRate: params.tempLR || 0.001,
          bounds: { min: 0.1, max: 10.0 },
          schedule: 'decay'
        };
        break;
    }

    return processed;
  }

  private generateAdaptiveImplementation(adaptive: AdaptiveActivation, baseFunc: ActivationFunction): string {
    switch (adaptive.adaptationMechanism) {
      case 'parameter_learning':
        return `
          // Adaptive ${baseFunc.name}
          const alpha = getLearnableParameter('alpha');
          return ${baseFunc.implementation.forwardCode.replace(/x/g, `(alpha * x)`)};
        `;
      case 'temperature_scaling':
        return `
          // Temperature-scaled ${baseFunc.name}
          const temp = getLearnableParameter('temperature');
          return temp * (${baseFunc.implementation.forwardCode.replace(/x/g, `(x / temp)`)});
        `;
      default:
        return baseFunc.implementation.forwardCode;
    }
  }

  private predictAdaptiveBenefits(adaptive: AdaptiveActivation): string[] {
    const benefits: string[] = [];

    switch (adaptive.adaptationMechanism) {
      case 'parameter_learning':
        benefits.push('Learns optimal activation shape during training');
        benefits.push('Adapts to task-specific requirements');
        break;
      case 'temperature_scaling':
        benefits.push('Improves calibration and uncertainty estimation');
        benefits.push('Dynamic control of activation sharpness');
        break;
      case 'ensemble_weighting':
        benefits.push('Combines benefits of multiple activation functions');
        benefits.push('Learns optimal combination weights');
        break;
    }

    return benefits;
  }

  private async runBenchmark(func: ActivationFunction, benchmarkType: string, inputSizes: number[], deviceType: string): Promise<any> {
    const results: any = {
      functionId: func.id,
      benchmarkType,
      measurements: {}
    };

    for (const size of inputSizes) {
      switch (benchmarkType) {
        case 'speed':
          results.measurements[size] = {
            forwardTime: func.performance.forwardPassTime * (size / 1000),
            backwardTime: func.performance.backwardPassTime * (size / 1000),
            throughput: size / (func.performance.forwardPassTime * size / 1000)
          };
          break;
        case 'memory':
          results.measurements[size] = {
            peakMemory: func.performance.memoryUsage * size,
            averageMemory: func.performance.memoryUsage * size * 0.8
          };
          break;
        case 'accuracy':
          results.measurements[size] = {
            numericalAccuracy: 1 - func.performance.accuracyLoss,
            stabilityScore: func.metadata.stability === 'high' ? 0.95 : 0.8
          };
          break;
      }
    }

    return results;
  }

  private generateBenchmarkSummary(results: Map<string, any>, benchmarkType: string): any {
    const summary: any = {
      bestPerformer: '',
      worstPerformer: '',
      averagePerformance: {},
      rankings: []
    };

    // Simplified summary generation
    const functionIds = Array.from(results.keys());
    if (functionIds.length > 0) {
      summary.bestPerformer = functionIds[0];
      summary.worstPerformer = functionIds[functionIds.length - 1];
      summary.rankings = functionIds.map((id, index) => ({ functionId: id, rank: index + 1 }));
    }

    return summary;
  }

  private generateBenchmarkRecommendations(results: Map<string, any>, benchmarkType: string): string[] {
    const recommendations: string[] = [];

    switch (benchmarkType) {
      case 'speed':
        recommendations.push('For high-performance applications, prioritize ReLU and Leaky ReLU');
        recommendations.push('Consider approximations for complex functions like GELU');
        break;
      case 'memory':
        recommendations.push('Use in-place operations where possible');
        recommendations.push('Avoid lookup tables for memory-constrained environments');
        break;
      case 'accuracy':
        recommendations.push('Balance numerical precision with computational efficiency');
        recommendations.push('Monitor activation statistics during training');
        break;
    }

    return recommendations;
  }

  private async storeActivationFunction(func: ActivationFunction): Promise<void> {
    const query = `
      INSERT INTO activation_functions (id, name, category, formula, derivative, properties, implementation, performance, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        formula = $4,
        derivative = $5,
        properties = $6,
        implementation = $7,
        performance = $8,
        metadata = $9,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    await this.dbPool.query(query, [
      func.id,
      func.name,
      func.category,
      func.formula,
      func.derivative,
      JSON.stringify(func.properties),
      JSON.stringify(func.implementation),
      JSON.stringify(func.performance),
      JSON.stringify(func.metadata),
      new Date()
    ]);
  }

  private async storeAdaptiveActivation(adaptive: AdaptiveActivation): Promise<void> {
    const query = `
      INSERT INTO adaptive_activations (id, base_function, adaptation_mechanism, adaptive_parameters, update_rule, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    await this.dbPool.query(query, [
      adaptive.id,
      adaptive.baseFunction,
      adaptive.adaptationMechanism,
      JSON.stringify(adaptive.adaptiveParameters),
      adaptive.updateRule,
      new Date()
    ]);
  }

  async getHealth(): Promise<any> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activationFunctionsLoaded: this.activationFunctions.size,
      optimizationSessions: this.optimizationSessions.size,
      adaptiveActivations: this.adaptiveActivations.size,
      compiledFunctions: this.compiledFunctions.size,
      layerAnalyses: Array.from(this.layerAnalyses.values()).reduce((sum, analyses) => sum + analyses.length, 0)
    };
  }
}