import { DatabasePool } from '../../../database/pg-pool.js';
import { RedisConnectionManager } from '../../../database/redis-client.js';
import { getLogger } from '../../../shared/logger.js';
import { StandardMCPServer, MCPTool } from '../../../shared/mcp/server.js';

const logger = getLogger('MultiHeadAttention');

export interface AttentionConfiguration {
  id: string;
  name: string;
  modelDimension: number;
  numHeads: number;
  keyDimension: number;
  valueDimension: number;
  sequenceLength: number;
  dropoutRate: number;
  architecture: AttentionArchitecture;
  optimization: AttentionOptimization;
  metadata: {
    description: string;
    useCases: string[];
    complexityAnalysis: ComplexityAnalysis;
    paperReference?: string;
  };
}

export interface AttentionArchitecture {
  type: 'scaled_dot_product' | 'additive' | 'multiplicative' | 'multi_scale' | 'sparse' | 'linear';
  implementation: 'standard' | 'flash_attention' | 'linear_attention' | 'synthesizer';
  masking: AttentionMasking;
  normalization: 'layer_norm' | 'rms_norm' | 'batch_norm' | 'none';
  activation: string;
  initializationStrategy: string;
}

export interface AttentionMasking {
  causal: boolean;
  paddingMask: boolean;
  customMask?: boolean;
  lookAhead: number;
  attentionSpan: number;
}

export interface AttentionOptimization {
  gradientCheckpointing: boolean;
  memoryEfficient: boolean;
  fusedKernels: boolean;
  quantization: {
    enabled: boolean;
    precision: 'fp16' | 'int8' | 'int4';
    calibrationDataset?: string;
  };
  parallelization: {
    tensorParallel: boolean;
    sequenceParallel: boolean;
    expertParallel?: boolean;
  };
}

export interface ComplexityAnalysis {
  timeComplexity: string;
  spaceComplexity: string;
  computeFlops: number;
  memoryFootprint: number;
  scalingFactor: number;
}

export interface AttentionWeights {
  query: Float32Array;
  key: Float32Array;
  value: Float32Array;
  outputProjection: Float32Array;
  attentionMatrix: Float32Array;
  gradients?: AttentionGradients;
}

export interface AttentionGradients {
  queryGrad: Float32Array;
  keyGrad: Float32Array;
  valueGrad: Float32Array;
  outputGrad: Float32Array;
  attentionGrad: Float32Array;
}

export interface AttentionMetrics {
  configId: string;
  computationTime: number;
  memoryUsage: number;
  attentionEntropy: number;
  attentionSparsity: number;
  gradientNorm: number;
  numericalStability: number;
  headUtilization: number[];
  attentionPatterns: AttentionPattern[];
}

export interface AttentionPattern {
  headIndex: number;
  patternType: 'local' | 'global' | 'diagonal' | 'random' | 'structured';
  concentration: number;
  coverage: number;
  interpretability: number;
}

export interface AttentionSession {
  id: string;
  configId: string;
  status: 'active' | 'completed' | 'failed';
  inputSequences: InputSequence[];
  outputs: AttentionOutput[];
  metrics: AttentionMetrics[];
  optimizationHistory: OptimizationStep[];
  startTime: Date;
  endTime?: Date;
}

export interface InputSequence {
  id: string;
  tokens: number[];
  embeddings: Float32Array;
  mask?: boolean[];
  sequenceLength: number;
  batchIndex: number;
}

export interface AttentionOutput {
  sequenceId: string;
  attentionWeights: Float32Array[][];
  contextVectors: Float32Array;
  headOutputs: Float32Array[];
  aggregatedOutput: Float32Array;
  confidence: number;
}

export interface OptimizationStep {
  step: number;
  type: 'weight_update' | 'architecture_change' | 'hyperparameter_tune';
  parameters: any;
  improvement: number;
  timestamp: Date;
}

export class MultiHeadAttentionEngine extends StandardMCPServer {
  private dbPool: DatabasePool;
  private redis: RedisConnectionManager;
  private configurations: Map<string, AttentionConfiguration> = new Map();
  private sessions: Map<string, AttentionSession> = new Map();
  private attentionCache: Map<string, AttentionOutput> = new Map();
  private optimizers: Map<string, any> = new Map();

  constructor(dbPool: DatabasePool, redis: RedisConnectionManager, options: any = {}) {
    super('multi-head-attention', options);
    this.dbPool = dbPool;
    this.redis = redis;
    this.initializeStandardConfigurations();
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.addTool('create_attention_config', {
      description: 'Create a new multi-head attention configuration',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          modelDimension: { type: 'number' },
          numHeads: { type: 'number' },
          sequenceLength: { type: 'number' },
          architecture: { type: 'object' },
          optimization: { type: 'object' }
        },
        required: ['name', 'modelDimension', 'numHeads', 'sequenceLength']
      }
    }, this.createAttentionConfig.bind(this));

    this.addTool('compute_attention', {
      description: 'Compute multi-head attention for input sequences',
      parameters: {
        type: 'object',
        properties: {
          configId: { type: 'string' },
          sequences: { type: 'array' },
          options: { type: 'object' }
        },
        required: ['configId', 'sequences']
      }
    }, this.computeAttention.bind(this));

    this.addTool('analyze_attention_patterns', {
      description: 'Analyze attention patterns and head utilization',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          analysisType: { type: 'string', enum: ['patterns', 'heads', 'entropy', 'sparsity'] }
        },
        required: ['sessionId']
      }
    }, this.analyzeAttentionPatterns.bind(this));

    this.addTool('optimize_attention_heads', {
      description: 'Optimize attention head configurations for better performance',
      parameters: {
        type: 'object',
        properties: {
          configId: { type: 'string' },
          optimizationGoal: { type: 'string', enum: ['speed', 'memory', 'accuracy', 'interpretability'] },
          constraints: { type: 'object' }
        },
        required: ['configId', 'optimizationGoal']
      }
    }, this.optimizeAttentionHeads.bind(this));

    this.addTool('visualize_attention', {
      description: 'Generate attention visualization data for analysis',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
          visualizationType: { type: 'string', enum: ['heatmap', 'graph', 'flow', 'hierarchy'] },
          headIndices: { type: 'array' }
        },
        required: ['sessionId', 'visualizationType']
      }
    }, this.visualizeAttention.bind(this));

    this.addTool('benchmark_attention', {
      description: 'Benchmark attention configurations across different scenarios',
      parameters: {
        type: 'object',
        properties: {
          configIds: { type: 'array' },
          benchmarkSuite: { type: 'string' },
          metrics: { type: 'array' }
        },
        required: ['configIds', 'benchmarkSuite']
      }
    }, this.benchmarkAttention.bind(this));
  }

  private initializeStandardConfigurations(): void {
    // BERT-style attention
    this.configurations.set('bert_base', {
      id: 'bert_base',
      name: 'BERT Base Multi-Head Attention',
      modelDimension: 768,
      numHeads: 12,
      keyDimension: 64,
      valueDimension: 64,
      sequenceLength: 512,
      dropoutRate: 0.1,
      architecture: {
        type: 'scaled_dot_product',
        implementation: 'standard',
        masking: {
          causal: false,
          paddingMask: true,
          lookAhead: 0,
          attentionSpan: 512
        },
        normalization: 'layer_norm',
        activation: 'gelu',
        initializationStrategy: 'xavier_uniform'
      },
      optimization: {
        gradientCheckpointing: false,
        memoryEfficient: false,
        fusedKernels: false,
        quantization: {
          enabled: false,
          precision: 'fp16'
        },
        parallelization: {
          tensorParallel: false,
          sequenceParallel: false
        }
      },
      metadata: {
        description: 'Standard BERT-style bidirectional attention',
        useCases: ['text classification', 'named entity recognition', 'question answering'],
        complexityAnalysis: {
          timeComplexity: 'O(n²d)',
          spaceComplexity: 'O(n²)',
          computeFlops: 4 * 768 * 512 * 512,
          memoryFootprint: 768 * 512 * 4,
          scalingFactor: 2.0
        },
        paperReference: 'Devlin et al. (2018) - BERT'
      }
    });

    // GPT-style causal attention
    this.configurations.set('gpt_causal', {
      id: 'gpt_causal',
      name: 'GPT Causal Multi-Head Attention',
      modelDimension: 1024,
      numHeads: 16,
      keyDimension: 64,
      valueDimension: 64,
      sequenceLength: 1024,
      dropoutRate: 0.1,
      architecture: {
        type: 'scaled_dot_product',
        implementation: 'standard',
        masking: {
          causal: true,
          paddingMask: true,
          lookAhead: 0,
          attentionSpan: 1024
        },
        normalization: 'layer_norm',
        activation: 'gelu',
        initializationStrategy: 'normal'
      },
      optimization: {
        gradientCheckpointing: true,
        memoryEfficient: true,
        fusedKernels: true,
        quantization: {
          enabled: false,
          precision: 'fp16'
        },
        parallelization: {
          tensorParallel: true,
          sequenceParallel: false
        }
      },
      metadata: {
        description: 'Causal attention for autoregressive language modeling',
        useCases: ['text generation', 'language modeling', 'code completion'],
        complexityAnalysis: {
          timeComplexity: 'O(n²d)',
          spaceComplexity: 'O(n²)',
          computeFlops: 4 * 1024 * 1024 * 1024,
          memoryFootprint: 1024 * 1024 * 4,
          scalingFactor: 4.0
        },
        paperReference: 'Radford et al. (2019) - GPT-2'
      }
    });

    // Efficient linear attention
    this.configurations.set('linear_efficient', {
      id: 'linear_efficient',
      name: 'Linear Efficient Attention',
      modelDimension: 512,
      numHeads: 8,
      keyDimension: 64,
      valueDimension: 64,
      sequenceLength: 4096,
      dropoutRate: 0.0,
      architecture: {
        type: 'linear',
        implementation: 'linear_attention',
        masking: {
          causal: false,
          paddingMask: true,
          lookAhead: 0,
          attentionSpan: 4096
        },
        normalization: 'rms_norm',
        activation: 'swish',
        initializationStrategy: 'kaiming_uniform'
      },
      optimization: {
        gradientCheckpointing: false,
        memoryEfficient: true,
        fusedKernels: true,
        quantization: {
          enabled: true,
          precision: 'fp16'
        },
        parallelization: {
          tensorParallel: true,
          sequenceParallel: true
        }
      },
      metadata: {
        description: 'Linear attention with O(n) complexity for long sequences',
        useCases: ['long sequence modeling', 'document analysis', 'genomics'],
        complexityAnalysis: {
          timeComplexity: 'O(nd)',
          spaceComplexity: 'O(n)',
          computeFlops: 4 * 512 * 4096 * 64,
          memoryFootprint: 512 * 4096,
          scalingFactor: 0.25
        },
        paperReference: 'Katharopoulos et al. (2020) - Transformers are RNNs'
      }
    });
  }

  async createAttentionConfig(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const configId = `attn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const config: AttentionConfiguration = {
        id: configId,
        name: params.name,
        modelDimension: params.modelDimension,
        numHeads: params.numHeads,
        keyDimension: params.keyDimension || Math.floor(params.modelDimension / params.numHeads),
        valueDimension: params.valueDimension || Math.floor(params.modelDimension / params.numHeads),
        sequenceLength: params.sequenceLength,
        dropoutRate: params.dropoutRate || 0.1,
        architecture: params.architecture || this.getDefaultArchitecture(),
        optimization: params.optimization || this.getDefaultOptimization(),
        metadata: {
          description: params.description || '',
          useCases: params.useCases || [],
          complexityAnalysis: this.calculateComplexityAnalysis(params),
          paperReference: params.paperReference
        }
      };

      // Validate configuration
      const validation = this.validateAttentionConfig(config);
      if (!validation.isValid) {
        throw new Error(`Invalid attention configuration: ${validation.errors.join(', ')}`);
      }

      this.configurations.set(configId, config);
      await this.storeAttentionConfig(config);

      logger.info(`Created attention configuration: ${configId}`);

      return {
        success: true,
        configId,
        configuration: config,
        validation,
        estimatedPerformance: this.estimatePerformance(config)
      };
    } catch (error) {
      logger.error('Error creating attention configuration:', error);
      throw error;
    }
  }

  async computeAttention(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { configId, sequences, options = {} } = params;
      
      const config = this.configurations.get(configId);
      if (!config) {
        throw new Error(`Attention configuration not found: ${configId}`);
      }

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Parse input sequences
      const inputSequences = this.parseInputSequences(sequences, config);
      
      // Create attention session
      const session: AttentionSession = {
        id: sessionId,
        configId,
        status: 'active',
        inputSequences,
        outputs: [],
        metrics: [],
        optimizationHistory: [],
        startTime: new Date()
      };

      this.sessions.set(sessionId, session);

      // Compute attention for each sequence
      const computationResults = await this.executeAttentionComputation(session, config, options);

      session.status = 'completed';
      session.endTime = new Date();
      session.outputs = computationResults.outputs;
      session.metrics = computationResults.metrics;

      return {
        success: true,
        sessionId,
        results: {
          outputs: computationResults.outputs,
          metrics: computationResults.metrics,
          performance: computationResults.performance
        },
        recommendations: this.generateAttentionRecommendations(session, config)
      };
    } catch (error) {
      logger.error('Error computing attention:', error);
      throw error;
    }
  }

  async analyzeAttentionPatterns(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { sessionId, analysisType = 'patterns' } = params;
      
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const config = this.configurations.get(session.configId);
      if (!config) {
        throw new Error(`Configuration not found: ${session.configId}`);
      }

      let analysis: any;

      switch (analysisType) {
        case 'patterns':
          analysis = this.analyzeAttentionPatternTypes(session, config);
          break;
        case 'heads':
          analysis = this.analyzeHeadUtilization(session, config);
          break;
        case 'entropy':
          analysis = this.analyzeAttentionEntropy(session, config);
          break;
        case 'sparsity':
          analysis = this.analyzeAttentionSparsity(session, config);
          break;
        default:
          throw new Error(`Unknown analysis type: ${analysisType}`);
      }

      return {
        success: true,
        sessionId,
        analysisType,
        results: analysis,
        insights: this.generateAnalysisInsights(analysis, analysisType)
      };
    } catch (error) {
      logger.error('Error analyzing attention patterns:', error);
      throw error;
    }
  }

  async optimizeAttentionHeads(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { configId, optimizationGoal, constraints = {} } = params;
      
      const config = this.configurations.get(configId);
      if (!config) {
        throw new Error(`Configuration not found: ${configId}`);
      }

      const optimizationId = `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Generate optimization strategy
      const strategy = this.generateOptimizationStrategy(config, optimizationGoal, constraints);
      
      // Apply optimizations
      const optimizedConfig = await this.applyOptimizations(config, strategy);
      
      // Benchmark improvements
      const benchmark = await this.benchmarkOptimizations(config, optimizedConfig);
      
      // Store optimized configuration
      this.configurations.set(optimizedConfig.id, optimizedConfig);
      await this.storeAttentionConfig(optimizedConfig);

      return {
        success: true,
        optimizationId,
        originalConfigId: configId,
        optimizedConfigId: optimizedConfig.id,
        strategy,
        benchmark,
        improvements: this.calculateImprovements(benchmark)
      };
    } catch (error) {
      logger.error('Error optimizing attention heads:', error);
      throw error;
    }
  }

  async visualizeAttention(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { sessionId, visualizationType, headIndices } = params;
      
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const config = this.configurations.get(session.configId);
      if (!config) {
        throw new Error(`Configuration not found: ${session.configId}`);
      }

      const visualizationData = this.generateVisualizationData(session, config, visualizationType, headIndices);
      
      return {
        success: true,
        sessionId,
        visualizationType,
        data: visualizationData,
        metadata: {
          sequenceLength: config.sequenceLength,
          numHeads: config.numHeads,
          modelDimension: config.modelDimension
        }
      };
    } catch (error) {
      logger.error('Error generating attention visualization:', error);
      throw error;
    }
  }

  async benchmarkAttention(params: any): Promise<{ content: { type: string; text: string }[] }> {
    try {
      const { configIds, benchmarkSuite, metrics = ['speed', 'memory', 'accuracy'] } = params;
      
      const configs = configIds.map((id: string) => this.configurations.get(id)).filter(Boolean);
      if (configs.length === 0) {
        throw new Error('No valid configurations found');
      }

      const benchmarkResults = await this.runBenchmarkSuite(configs, benchmarkSuite, metrics);
      
      return {
        success: true,
        benchmarkSuite,
        results: benchmarkResults,
        summary: this.generateBenchmarkSummary(benchmarkResults),
        recommendations: this.generateBenchmarkRecommendations(benchmarkResults)
      };
    } catch (error) {
      logger.error('Error benchmarking attention configurations:', error);
      throw error;
    }
  }

  private parseInputSequences(sequences: any[], config: AttentionConfiguration): InputSequence[] {
    return sequences.map((seq, index) => ({
      id: `seq_${index}`,
      tokens: seq.tokens || [],
      embeddings: new Float32Array(seq.embeddings || []),
      mask: seq.mask,
      sequenceLength: seq.tokens?.length || seq.embeddings?.length / config.modelDimension,
      batchIndex: index
    }));
  }

  private async executeAttentionComputation(session: AttentionSession, config: AttentionConfiguration, options: any): Promise<{ content: { type: string; text: string }[] }> {
    const startTime = Date.now();
    const outputs: AttentionOutput[] = [];
    const metrics: AttentionMetrics[] = [];

    for (const inputSeq of session.inputSequences) {
      // Simulate attention computation
      const attentionOutput = await this.computeSingleAttention(inputSeq, config, options);
      outputs.push(attentionOutput);

      // Compute metrics
      const computationMetrics = this.computeAttentionMetrics(attentionOutput, config);
      metrics.push(computationMetrics);
    }

    const totalTime = Date.now() - startTime;

    return {
      outputs,
      metrics,
      performance: {
        totalComputationTime: totalTime,
        averageTimePerSequence: totalTime / session.inputSequences.length,
        throughput: session.inputSequences.length / (totalTime / 1000),
        memoryEfficiency: this.calculateMemoryEfficiency(config, session.inputSequences.length)
      }
    };
  }

  private async computeSingleAttention(inputSeq: InputSequence, config: AttentionConfiguration, options: any): Promise<AttentionOutput> {
    const { numHeads, modelDimension, keyDimension, valueDimension } = config;
    const seqLen = inputSeq.sequenceLength;

    // Simulate attention computation
    const attentionWeights = Array.from({ length: numHeads }, () => 
      Array.from({ length: seqLen }, () => new Float32Array(seqLen).map(() => Math.random()))
    );

    const headOutputs = Array.from({ length: numHeads }, () => 
      new Float32Array(seqLen * valueDimension).map(() => Math.random())
    );

    const aggregatedOutput = new Float32Array(seqLen * modelDimension).map(() => Math.random());

    return {
      sequenceId: inputSeq.id,
      attentionWeights,
      contextVectors: aggregatedOutput,
      headOutputs,
      aggregatedOutput,
      confidence: 0.85 + Math.random() * 0.1
    };
  }

  private computeAttentionMetrics(output: AttentionOutput, config: AttentionConfiguration): AttentionMetrics {
    return {
      configId: config.id,
      computationTime: 10 + Math.random() * 90, // Simulated
      memoryUsage: config.modelDimension * config.sequenceLength * 4,
      attentionEntropy: this.calculateAttentionEntropy(output.attentionWeights),
      attentionSparsity: this.calculateAttentionSparsity(output.attentionWeights),
      gradientNorm: 1.0 + Math.random() * 2.0,
      numericalStability: 0.95 + Math.random() * 0.05,
      headUtilization: Array.from({ length: config.numHeads }, () => Math.random()),
      attentionPatterns: this.identifyAttentionPatterns(output.attentionWeights)
    };
  }

  private calculateAttentionEntropy(attentionWeights: Float32Array[][]): number {
    // Simplified entropy calculation
    let totalEntropy = 0;
    let count = 0;

    for (const headWeights of attentionWeights) {
      for (const rowWeights of headWeights) {
        let entropy = 0;
        for (const weight of rowWeights) {
          if (weight > 0) {
            entropy -= weight * Math.log2(weight);
          }
        }
        totalEntropy += entropy;
        count++;
      }
    }

    return count > 0 ? totalEntropy / count : 0;
  }

  private calculateAttentionSparsity(attentionWeights: Float32Array[][]): number {
    let totalValues = 0;
    let zeroValues = 0;

    for (const headWeights of attentionWeights) {
      for (const rowWeights of headWeights) {
        for (const weight of rowWeights) {
          totalValues++;
          if (Math.abs(weight) < 1e-6) {
            zeroValues++;
          }
        }
      }
    }

    return totalValues > 0 ? zeroValues / totalValues : 0;
  }

  private identifyAttentionPatterns(attentionWeights: Float32Array[][]): AttentionPattern[] {
    return attentionWeights.map((headWeights, headIndex) => {
      // Simplified pattern analysis
      const concentration = this.calculateConcentration(headWeights);
      const coverage = this.calculateCoverage(headWeights);
      
      let patternType: AttentionPattern['patternType'] = 'random';
      if (concentration > 0.8) patternType = 'local';
      else if (concentration < 0.3) patternType = 'global';
      else if (this.isDiagonal(headWeights)) patternType = 'diagonal';

      return {
        headIndex,
        patternType,
        concentration,
        coverage,
        interpretability: concentration * coverage
      };
    });
  }

  private calculateConcentration(headWeights: Float32Array[]): number {
    // Measure how concentrated the attention is
    let maxSum = 0;
    for (const rowWeights of headWeights) {
      const sum = Array.from(rowWeights).reduce((a, b) => a + b, 0);
      maxSum = Math.max(maxSum, sum);
    }
    return maxSum;
  }

  private calculateCoverage(headWeights: Float32Array[]): number {
    // Measure how much of the sequence gets attention
    const threshold = 0.1;
    let activePositions = 0;
    let totalPositions = 0;

    for (const rowWeights of headWeights) {
      for (const weight of rowWeights) {
        totalPositions++;
        if (weight > threshold) {
          activePositions++;
        }
      }
    }

    return totalPositions > 0 ? activePositions / totalPositions : 0;
  }

  private isDiagonal(headWeights: Float32Array[]): boolean {
    // Check if attention pattern is diagonal
    let diagonalSum = 0;
    let totalSum = 0;

    for (let i = 0; i < headWeights.length; i++) {
      for (let j = 0; j < headWeights[i].length; j++) {
        totalSum += headWeights[i][j];
        if (Math.abs(i - j) <= 1) {
          diagonalSum += headWeights[i][j];
        }
      }
    }

    return totalSum > 0 ? (diagonalSum / totalSum) > 0.7 : false;
  }

  private analyzeAttentionPatternTypes(session: AttentionSession, config: AttentionConfiguration): any {
    const patterns = {
      local: 0,
      global: 0,
      diagonal: 0,
      structured: 0,
      random: 0
    };

    let totalPatterns = 0;

    for (const output of session.outputs) {
      for (const metric of session.metrics) {
        if (metric.configId === config.id) {
          for (const pattern of metric.attentionPatterns) {
            patterns[pattern.patternType]++;
            totalPatterns++;
          }
        }
      }
    }

    return {
      distribution: totalPatterns > 0 ? 
        Object.fromEntries(Object.entries(patterns).map(([k, v]) => [k, v / totalPatterns])) :
        patterns,
      dominantPattern: Object.entries(patterns).reduce((a, b) => patterns[a[0]] > patterns[b[0]] ? a : b)[0],
      diversity: this.calculatePatternDiversity(patterns),
      insights: this.generatePatternInsights(patterns)
    };
  }

  private analyzeHeadUtilization(session: AttentionSession, config: AttentionConfiguration): any {
    const headUtilizations: number[] = new Array(config.numHeads).fill(0);
    let count = 0;

    for (const metric of session.metrics) {
      if (metric.configId === config.id) {
        for (let i = 0; i < metric.headUtilization.length; i++) {
          headUtilizations[i] += metric.headUtilization[i];
        }
        count++;
      }
    }

    if (count > 0) {
      for (let i = 0; i < headUtilizations.length; i++) {
        headUtilizations[i] /= count;
      }
    }

    return {
      utilizations: headUtilizations,
      averageUtilization: headUtilizations.reduce((a, b) => a + b, 0) / headUtilizations.length,
      utilizationVariance: this.calculateVariance(headUtilizations),
      underutilizedHeads: headUtilizations.filter(u => u < 0.3).length,
      overutilizedHeads: headUtilizations.filter(u => u > 0.8).length,
      recommendations: this.generateHeadOptimizationRecommendations(headUtilizations)
    };
  }

  private analyzeAttentionEntropy(session: AttentionSession, config: AttentionConfiguration): any {
    const entropies: number[] = [];

    for (const metric of session.metrics) {
      if (metric.configId === config.id) {
        entropies.push(metric.attentionEntropy);
      }
    }

    return {
      entropies,
      averageEntropy: entropies.reduce((a, b) => a + b, 0) / entropies.length,
      entropyVariance: this.calculateVariance(entropies),
      interpretation: this.interpretEntropyLevels(entropies),
      insights: this.generateEntropyInsights(entropies)
    };
  }

  private analyzeAttentionSparsity(session: AttentionSession, config: AttentionConfiguration): any {
    const sparsities: number[] = [];

    for (const metric of session.metrics) {
      if (metric.configId === config.id) {
        sparsities.push(metric.attentionSparsity);
      }
    }

    return {
      sparsities,
      averageSparsity: sparsities.reduce((a, b) => a + b, 0) / sparsities.length,
      sparsityVariance: this.calculateVariance(sparsities),
      memoryBenefit: this.calculateSparsityMemoryBenefit(sparsities),
      recommendations: this.generateSparsityRecommendations(sparsities)
    };
  }

  private generateVisualizationData(session: AttentionSession, config: AttentionConfiguration, type: string, headIndices?: number[]): any {
    const selectedHeads = headIndices || Array.from({ length: config.numHeads }, (_, i) => i);
    
    switch (type) {
      case 'heatmap':
        return this.generateHeatmapData(session, config, selectedHeads);
      case 'graph':
        return this.generateGraphData(session, config, selectedHeads);
      case 'flow':
        return this.generateFlowData(session, config, selectedHeads);
      case 'hierarchy':
        return this.generateHierarchyData(session, config, selectedHeads);
      default:
        throw new Error(`Unknown visualization type: ${type}`);
    }
  }

  private generateHeatmapData(session: AttentionSession, config: AttentionConfiguration, headIndices: number[]): any {
    const heatmaps = [];

    for (const output of session.outputs) {
      for (const headIndex of headIndices) {
        if (headIndex < output.attentionWeights.length) {
          heatmaps.push({
            sequenceId: output.sequenceId,
            headIndex,
            matrix: output.attentionWeights[headIndex],
            dimensions: {
              rows: output.attentionWeights[headIndex].length,
              cols: output.attentionWeights[headIndex][0].length
            }
          });
        }
      }
    }

    return {
      type: 'heatmap',
      data: heatmaps,
      colorScale: 'viridis',
      normalization: 'row'
    };
  }

  private generateGraphData(session: AttentionSession, config: AttentionConfiguration, headIndices: number[]): any {
    const graphs = [];

    for (const output of session.outputs) {
      for (const headIndex of headIndices) {
        if (headIndex < output.attentionWeights.length) {
          const nodes = [];
          const edges = [];
          const weights = output.attentionWeights[headIndex];

          // Create nodes
          for (let i = 0; i < weights.length; i++) {
            nodes.push({
              id: i,
              position: i,
              importance: Array.from(weights[i]).reduce((sum, w) => sum + w, 0)
            });
          }

          // Create edges
          for (let i = 0; i < weights.length; i++) {
            for (let j = 0; j < weights[i].length; j++) {
              if (weights[i][j] > 0.1) { // Threshold for edge creation
                edges.push({
                  source: i,
                  target: j,
                  weight: weights[i][j]
                });
              }
            }
          }

          graphs.push({
            sequenceId: output.sequenceId,
            headIndex,
            nodes,
            edges
          });
        }
      }
    }

    return {
      type: 'graph',
      data: graphs,
      layout: 'force_directed',
      edgeThreshold: 0.1
    };
  }

  private generateFlowData(session: AttentionSession, config: AttentionConfiguration, headIndices: number[]): any {
    // Simplified flow visualization data
    return {
      type: 'flow',
      data: headIndices.map(headIndex => ({
        headIndex,
        flows: Array.from({ length: config.sequenceLength }, (_, i) => ({
          position: i,
          inflow: Math.random(),
          outflow: Math.random(),
          netFlow: Math.random() - 0.5
        }))
      })),
      timeSteps: 1
    };
  }

  private generateHierarchyData(session: AttentionSession, config: AttentionConfiguration, headIndices: number[]): any {
    // Simplified hierarchy visualization data
    return {
      type: 'hierarchy',
      data: {
        root: {
          name: 'Attention',
          children: headIndices.map(headIndex => ({
            name: `Head ${headIndex}`,
            value: Math.random() * 100,
            children: Array.from({ length: 5 }, (_, i) => ({
              name: `Pattern ${i}`,
              value: Math.random() * 20
            }))
          }))
        }
      },
      layout: 'tree'
    };
  }

  private async runBenchmarkSuite(configs: AttentionConfiguration[], suite: string, metrics: string[]): Promise<{ content: { type: string; text: string }[] }> {
    const results = [];

    for (const config of configs) {
      const benchmark = {
        configId: config.id,
        configName: config.name,
        metrics: {}
      };

      // Run speed benchmark
      if (metrics.includes('speed')) {
        benchmark.metrics.speed = await this.benchmarkSpeed(config);
      }

      // Run memory benchmark
      if (metrics.includes('memory')) {
        benchmark.metrics.memory = await this.benchmarkMemory(config);
      }

      // Run accuracy benchmark
      if (metrics.includes('accuracy')) {
        benchmark.metrics.accuracy = await this.benchmarkAccuracy(config);
      }

      results.push(benchmark);
    }

    return results;
  }

  private async benchmarkSpeed(config: AttentionConfiguration): Promise<{ content: { type: string; text: string }[] }> {
    // Simulate speed benchmark
    const baseTime = 100; // milliseconds
    const complexityFactor = (config.sequenceLength * config.numHeads * config.modelDimension) / (512 * 8 * 512);
    
    return {
      forwardPassTime: baseTime * complexityFactor,
      backwardPassTime: baseTime * complexityFactor * 1.5,
      throughput: 1000 / (baseTime * complexityFactor),
      efficiency: 1 / complexityFactor
    };
  }

  private async benchmarkMemory(config: AttentionConfiguration): Promise<{ content: { type: string; text: string }[] }> {
    // Simulate memory benchmark
    const baseMemory = config.sequenceLength * config.sequenceLength * 4; // bytes for attention matrix
    const totalMemory = baseMemory * config.numHeads + config.modelDimension * config.sequenceLength * 4;
    
    return {
      attentionMatrixMemory: baseMemory * config.numHeads,
      activationMemory: config.modelDimension * config.sequenceLength * 4,
      totalMemory,
      memoryEfficiency: baseMemory / totalMemory,
      peakMemoryUsage: totalMemory * 1.2
    };
  }

  private async benchmarkAccuracy(config: AttentionConfiguration): Promise<{ content: { type: string; text: string }[] }> {
    // Simulate accuracy benchmark
    const baseAccuracy = 0.85;
    const architectureBonus = config.architecture.type === 'scaled_dot_product' ? 0.05 : 0.0;
    const optimizationPenalty = config.optimization.quantization.enabled ? -0.02 : 0.0;
    
    return {
      taskAccuracy: baseAccuracy + architectureBonus + optimizationPenalty + (Math.random() - 0.5) * 0.1,
      convergenceSpeed: 0.8 + Math.random() * 0.2,
      stability: 0.9 + Math.random() * 0.1,
      robustness: 0.85 + Math.random() * 0.15
    };
  }

  private generateBenchmarkSummary(results: any[]): any {
    const summary = {
      totalConfigs: results.length,
      fastest: null,
      mostMemoryEfficient: null,
      mostAccurate: null,
      overall: {
        avgSpeed: 0,
        avgMemory: 0,
        avgAccuracy: 0
      }
    };

    let fastestTime = Infinity;
    let lowestMemory = Infinity;
    let highestAccuracy = 0;
    let totalSpeed = 0;
    let totalMemory = 0;
    let totalAccuracy = 0;

    for (const result of results) {
      if (result.metrics.speed) {
        const time = result.metrics.speed.forwardPassTime;
        totalSpeed += time;
        if (time < fastestTime) {
          fastestTime = time;
          summary.fastest = result.configId;
        }
      }

      if (result.metrics.memory) {
        const memory = result.metrics.memory.totalMemory;
        totalMemory += memory;
        if (memory < lowestMemory) {
          lowestMemory = memory;
          summary.mostMemoryEfficient = result.configId;
        }
      }

      if (result.metrics.accuracy) {
        const accuracy = result.metrics.accuracy.taskAccuracy;
        totalAccuracy += accuracy;
        if (accuracy > highestAccuracy) {
          highestAccuracy = accuracy;
          summary.mostAccurate = result.configId;
        }
      }
    }

    summary.overall.avgSpeed = totalSpeed / results.length;
    summary.overall.avgMemory = totalMemory / results.length;
    summary.overall.avgAccuracy = totalAccuracy / results.length;

    return summary;
  }

  private generateBenchmarkRecommendations(results: any[]): string[] {
    const recommendations: string[] = [];

    if (results.length > 1) {
      recommendations.push('Compare configurations based on your primary optimization goal');
    }

    const hasQuantized = results.some(r => r.configId.includes('quantized'));
    if (!hasQuantized) {
      recommendations.push('Consider testing quantized versions for improved memory efficiency');
    }

    const hasLinear = results.some(r => r.configId.includes('linear'));
    if (!hasLinear) {
      recommendations.push('Consider linear attention for very long sequences');
    }

    recommendations.push('Monitor attention patterns to ensure model interpretability');
    recommendations.push('Profile memory usage in production environments');

    return recommendations;
  }

  private getDefaultArchitecture(): AttentionArchitecture {
    return {
      type: 'scaled_dot_product',
      implementation: 'standard',
      masking: {
        causal: false,
        paddingMask: true,
        lookAhead: 0,
        attentionSpan: 512
      },
      normalization: 'layer_norm',
      activation: 'gelu',
      initializationStrategy: 'xavier_uniform'
    };
  }

  private getDefaultOptimization(): AttentionOptimization {
    return {
      gradientCheckpointing: false,
      memoryEfficient: false,
      fusedKernels: false,
      quantization: {
        enabled: false,
        precision: 'fp16'
      },
      parallelization: {
        tensorParallel: false,
        sequenceParallel: false
      }
    };
  }

  private calculateComplexityAnalysis(params: any): ComplexityAnalysis {
    const n = params.sequenceLength;
    const d = params.modelDimension;
    const h = params.numHeads;

    return {
      timeComplexity: 'O(n²d)',
      spaceComplexity: 'O(n²h)',
      computeFlops: 4 * d * n * n * h,
      memoryFootprint: d * n * 4 + n * n * h * 4,
      scalingFactor: (n * h) / 1000
    };
  }

  private validateAttentionConfig(config: AttentionConfiguration): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (config.modelDimension % config.numHeads !== 0) {
      errors.push('Model dimension must be divisible by number of heads');
    }

    if (config.keyDimension !== config.valueDimension) {
      errors.push('Key and value dimensions should be equal for standard attention');
    }

    if (config.sequenceLength <= 0) {
      errors.push('Sequence length must be positive');
    }

    if (config.numHeads <= 0) {
      errors.push('Number of heads must be positive');
    }

    if (config.dropoutRate < 0 || config.dropoutRate > 1) {
      errors.push('Dropout rate must be between 0 and 1');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private estimatePerformance(config: AttentionConfiguration): any {
    const complexity = this.calculateComplexityAnalysis(config);
    
    return {
      estimatedSpeed: `${Math.round(100 / complexity.scalingFactor)}ms per forward pass`,
      estimatedMemory: `${Math.round(complexity.memoryFootprint / 1024 / 1024)}MB`,
      scalabilityRating: complexity.scalingFactor < 1 ? 'excellent' : 
                        complexity.scalingFactor < 5 ? 'good' : 'poor',
      recommendedBatchSize: Math.max(1, Math.floor(8192 / config.sequenceLength))
    };
  }

  private generateAttentionRecommendations(session: AttentionSession, config: AttentionConfiguration): string[] {
    const recommendations: string[] = [];

    // Analyze session metrics for recommendations
    const avgEntropy = session.metrics.reduce((sum, m) => sum + m.attentionEntropy, 0) / session.metrics.length;
    const avgSparsity = session.metrics.reduce((sum, m) => sum + m.attentionSparsity, 0) / session.metrics.length;

    if (avgEntropy < 2.0) {
      recommendations.push('Low attention entropy detected - consider increasing model capacity');
    }

    if (avgSparsity > 0.8) {
      recommendations.push('High attention sparsity - consider sparse attention patterns for efficiency');
    }

    if (config.sequenceLength > 2048) {
      recommendations.push('Long sequences detected - consider linear attention or attention chunking');
    }

    recommendations.push('Monitor attention patterns for potential optimization opportunities');

    return recommendations;
  }

  private generateAnalysisInsights(analysis: any, analysisType: string): string[] {
    const insights: string[] = [];

    switch (analysisType) {
      case 'patterns':
        if (analysis.dominantPattern === 'local') {
          insights.push('Model shows local attention bias - good for sequential tasks');
        }
        if (analysis.diversity < 0.3) {
          insights.push('Low pattern diversity - consider attention regularization');
        }
        break;
      case 'heads':
        if (analysis.underutilizedHeads > analysis.utilizations.length / 3) {
          insights.push('Many underutilized heads - consider head pruning');
        }
        break;
      case 'entropy':
        if (analysis.averageEntropy > 4.0) {
          insights.push('High entropy indicates diffuse attention patterns');
        }
        break;
      case 'sparsity':
        if (analysis.averageSparsity > 0.7) {
          insights.push('High sparsity suggests potential for efficient sparse implementations');
        }
        break;
    }

    return insights;
  }

  private generateOptimizationStrategy(config: AttentionConfiguration, goal: string, constraints: any): any {
    const strategy = {
      goal,
      steps: [],
      expectedImprovement: 0
    };

    switch (goal) {
      case 'speed':
        strategy.steps.push('Enable fused kernels');
        strategy.steps.push('Implement gradient checkpointing');
        strategy.steps.push('Optimize tensor parallelization');
        strategy.expectedImprovement = 0.3;
        break;
      case 'memory':
        strategy.steps.push('Enable memory efficient attention');
        strategy.steps.push('Implement activation compression');
        strategy.steps.push('Use sparse attention patterns');
        strategy.expectedImprovement = 0.5;
        break;
      case 'accuracy':
        strategy.steps.push('Increase model dimension');
        strategy.steps.push('Add more attention heads');
        strategy.steps.push('Improve initialization');
        strategy.expectedImprovement = 0.1;
        break;
      case 'interpretability':
        strategy.steps.push('Add attention visualization hooks');
        strategy.steps.push('Implement attention pattern regularization');
        strategy.steps.push('Enable head specialization tracking');
        strategy.expectedImprovement = 0.2;
        break;
    }

    return strategy;
  }

  private async applyOptimizations(config: AttentionConfiguration, strategy: any): Promise<AttentionConfiguration> {
    const optimizedConfig = JSON.parse(JSON.stringify(config));
    optimizedConfig.id = `${config.id}_optimized`;
    optimizedConfig.name = `${config.name} (Optimized for ${strategy.goal})`;

    // Apply strategy-specific optimizations
    for (const step of strategy.steps) {
      switch (step) {
        case 'Enable fused kernels':
          optimizedConfig.optimization.fusedKernels = true;
          break;
        case 'Implement gradient checkpointing':
          optimizedConfig.optimization.gradientCheckpointing = true;
          break;
        case 'Enable memory efficient attention':
          optimizedConfig.optimization.memoryEfficient = true;
          break;
        case 'Increase model dimension':
          optimizedConfig.modelDimension = Math.floor(optimizedConfig.modelDimension * 1.2);
          optimizedConfig.keyDimension = Math.floor(optimizedConfig.modelDimension / optimizedConfig.numHeads);
          optimizedConfig.valueDimension = optimizedConfig.keyDimension;
          break;
      }
    }

    return optimizedConfig;
  }

  private async benchmarkOptimizations(original: AttentionConfiguration, optimized: AttentionConfiguration): Promise<{ content: { type: string; text: string }[] }> {
    const originalBench = await this.benchmarkSpeed(original);
    const optimizedBench = await this.benchmarkSpeed(optimized);

    return {
      original: originalBench,
      optimized: optimizedBench,
      improvement: {
        speedup: originalBench.forwardPassTime / optimizedBench.forwardPassTime,
        memoryReduction: 1 - (optimizedBench.throughput / originalBench.throughput),
        efficiencyGain: optimizedBench.efficiency / originalBench.efficiency
      }
    };
  }

  private calculateImprovements(benchmark: any): any {
    return {
      speedImprovement: `${Math.round((benchmark.improvement.speedup - 1) * 100)}%`,
      memoryImprovement: `${Math.round(benchmark.improvement.memoryReduction * 100)}%`,
      overallGain: benchmark.improvement.efficiencyGain,
      recommendation: benchmark.improvement.speedup > 1.2 ? 'Significant improvement achieved' : 'Marginal improvement'
    };
  }

  private calculateMemoryEfficiency(config: AttentionConfiguration, batchSize: number): number {
    const theoreticalMinimum = config.modelDimension * config.sequenceLength * batchSize * 4;
    const actualUsage = config.sequenceLength * config.sequenceLength * config.numHeads * batchSize * 4 + theoreticalMinimum;
    
    return theoreticalMinimum / actualUsage;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  private calculatePatternDiversity(patterns: any): number {
    const total = Object.values(patterns).reduce((sum: number, count: any) => sum + count, 0);
    if (total === 0) return 0;

    let entropy = 0;
    for (const count of Object.values(patterns)) {
      if (count > 0) {
        const prob = (count as number) / total;
        entropy -= prob * Math.log2(prob);
      }
    }

    return entropy / Math.log2(Object.keys(patterns).length);
  }

  private generatePatternInsights(patterns: any): string[] {
    const insights: string[] = [];
    const total = Object.values(patterns).reduce((sum: number, count: any) => sum + count, 0);

    if (patterns.local / total > 0.6) {
      insights.push('Strong local attention bias detected');
    }
    if (patterns.global / total > 0.4) {
      insights.push('Significant global attention patterns observed');
    }
    if (patterns.diagonal / total > 0.5) {
      insights.push('Diagonal attention pattern dominant');
    }

    return insights;
  }

  private generateHeadOptimizationRecommendations(utilizations: number[]): string[] {
    const recommendations: string[] = [];
    const underutilized = utilizations.filter(u => u < 0.3).length;
    const overutilized = utilizations.filter(u => u > 0.8).length;

    if (underutilized > utilizations.length / 3) {
      recommendations.push('Consider head pruning to remove underutilized heads');
    }
    if (overutilized > utilizations.length / 2) {
      recommendations.push('High head utilization - model may benefit from more heads');
    }
    if (Math.max(...utilizations) - Math.min(...utilizations) > 0.5) {
      recommendations.push('High utilization variance - investigate head specialization');
    }

    return recommendations;
  }

  private interpretEntropyLevels(entropies: number[]): string {
    const avgEntropy = entropies.reduce((a, b) => a + b, 0) / entropies.length;
    
    if (avgEntropy < 2.0) return 'Low entropy - focused attention';
    if (avgEntropy < 4.0) return 'Medium entropy - balanced attention';
    return 'High entropy - diffuse attention';
  }

  private generateEntropyInsights(entropies: number[]): string[] {
    const insights: string[] = [];
    const avgEntropy = entropies.reduce((a, b) => a + b, 0) / entropies.length;
    const variance = this.calculateVariance(entropies);

    if (variance > 1.0) {
      insights.push('High entropy variance indicates inconsistent attention patterns');
    }
    if (avgEntropy < 1.5) {
      insights.push('Very low entropy may indicate attention collapse');
    }
    if (avgEntropy > 5.0) {
      insights.push('Very high entropy may indicate lack of focus');
    }

    return insights;
  }

  private calculateSparsityMemoryBenefit(sparsities: number[]): number {
    const avgSparsity = sparsities.reduce((a, b) => a + b, 0) / sparsities.length;
    return avgSparsity * 0.8; // Approximate memory reduction
  }

  private generateSparsityRecommendations(sparsities: number[]): string[] {
    const recommendations: string[] = [];
    const avgSparsity = sparsities.reduce((a, b) => a + b, 0) / sparsities.length;

    if (avgSparsity > 0.7) {
      recommendations.push('High sparsity - consider sparse attention implementations');
      recommendations.push('Potential for significant memory savings with sparse operations');
    }
    if (avgSparsity < 0.3) {
      recommendations.push('Low sparsity - dense attention patterns detected');
    }

    return recommendations;
  }

  private async storeAttentionConfig(config: AttentionConfiguration): Promise<void> {
    const query = `
      INSERT INTO attention_configurations (id, name, model_dimension, num_heads, sequence_length, architecture, optimization, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (id) DO UPDATE SET
        architecture = $6,
        optimization = $7,
        metadata = $8,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    await this.dbPool.query(query, [
      config.id,
      config.name,
      config.modelDimension,
      config.numHeads,
      config.sequenceLength,
      JSON.stringify(config.architecture),
      JSON.stringify(config.optimization),
      JSON.stringify(config.metadata),
      new Date()
    ]);
  }

  async getHealth(): Promise<{ content: { type: string; text: string }[] }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      configurationsLoaded: this.configurations.size,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.status === 'active').length,
      cacheSize: this.attentionCache.size,
      optimizersActive: this.optimizers.size
    };
  }
}