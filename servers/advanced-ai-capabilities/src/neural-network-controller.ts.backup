import { DatabasePool } from '../../../database/pg-pool.js';
import { RedisConnectionManager } from '../../../database/redis-client.js';
import { getLogger } from '../../../shared/logger.js';
import { BaseMCPServer } from '../../../shared/mcp/server.js';

const logger = getLogger('NeuralNetworkController');

export interface NetworkArchitecture {
  id: string;
  name: string;
  type: 'feedforward' | 'cnn' | 'rnn' | 'lstm' | 'gru' | 'transformer';
  layers: NetworkLayer[];
  inputShape: number[];
  outputShape: number[];
  parameters: NetworkParameters;
  metadata: {
    created: Date;
    version: string;
    description: string;
    tags: string[];
  };
}

export interface NetworkLayer {
  id: string;
  type: 'dense' | 'conv2d' | 'maxpool' | 'dropout' | 'batch_norm' | 'attention';
  config: LayerConfig;
  trainable: boolean;
  weights?: Float32Array;
  biases?: Float32Array;
}

export interface LayerConfig {
  units?: number;
  activationFunction: 'relu' | 'sigmoid' | 'tanh' | 'softmax' | 'linear' | 'gelu';
  kernelSize?: [number, number];
  strides?: [number, number];
  padding?: 'same' | 'valid';
  dropoutRate?: number;
  attentionHeads?: number;
  keyDim?: number;
}

export interface NetworkParameters {
  learningRate: number;
  optimizer: 'adam' | 'sgd' | 'rmsprop' | 'adagrad';
  lossFunction: 'mse' | 'categorical_crossentropy' | 'binary_crossentropy' | 'sparse_categorical_crossentropy';
  metrics: string[];
  batchSize: number;
  epochs: number;
  validationSplit: number;
}

export interface TrainingSession {
  id: string;
  networkId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  progress: {
    currentEpoch: number;
    totalEpochs: number;
    loss: number;
    accuracy: number;
    valLoss: number;
    valAccuracy: number;
  };
  metrics: TrainingMetrics;
  startTime: Date;
  endTime?: Date;
  checkpoints: string[];
}

export interface TrainingMetrics {
  epochLosses: number[];
  epochAccuracies: number[];
  validationLosses: number[];
  validationAccuracies: number[];
  learningRateSchedule: number[];
  gradientNorms: number[];
  weightHistograms: Map<string, number[]>;
}

export class NeuralNetworkController extends BaseMCPServer {
  private dbPool: DatabasePool;
  private redis: RedisConnectionManager;
  private networks: Map<string, NetworkArchitecture> = new Map();
  private trainingSessions: Map<string, TrainingSession> = new Map();
  private modelCache: Map<string, any> = new Map();

  constructor(dbPool: DatabasePool, redis: RedisConnectionManager, options: any = {}) {
    super('neural-network-controller', options);
    this.dbPool = dbPool;
    this.redis = redis;
    this.initializeRoutes();
  }

  private initializeRoutes(): void {
    this.addTool('create_network', {
      description: 'Create a new neural network architecture',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          type: { type: 'string', enum: ['feedforward', 'cnn', 'rnn', 'lstm', 'gru', 'transformer'] },
          layers: { type: 'array' },
          inputShape: { type: 'array' },
          outputShape: { type: 'array' },
          parameters: { type: 'object' }
        },
        required: ['name', 'type', 'layers', 'inputShape', 'outputShape', 'parameters']
      }
    }, this.createNetwork.bind(this));

    this.addTool('modify_network', {
      description: 'Modify existing network architecture',
      parameters: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          modifications: { type: 'object' }
        },
        required: ['networkId', 'modifications']
      }
    }, this.modifyNetwork.bind(this));

    this.addTool('start_training', {
      description: 'Start training a neural network',
      parameters: {
        type: 'object',
        properties: {
          networkId: { type: 'string' },
          datasetId: { type: 'string' },
          parameters: { type: 'object' }
        },
        required: ['networkId', 'datasetId']
      }
    }, this.startTraining.bind(this));

    this.addTool('get_training_status', {
      description: 'Get training session status and metrics',
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' }
        },
        required: ['sessionId']
      }
    }, this.getTrainingStatus.bind(this));

    this.addTool('optimize_architecture', {
      description: 'Auto-optimize network architecture for given task',
      parameters: {
        type: 'object',
        properties: {
          taskType: { type: 'string' },
          datasetInfo: { type: 'object' },
          constraints: { type: 'object' }
        },
        required: ['taskType', 'datasetInfo']
      }
    }, this.optimizeArchitecture.bind(this));
  }

  async createNetwork(params: any): Promise<any> {
    try {
      const networkId = `net_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const network: NetworkArchitecture = {
        id: networkId,
        name: params.name,
        type: params.type,
        layers: this.parseLayerDefinitions(params.layers),
        inputShape: params.inputShape,
        outputShape: params.outputShape,
        parameters: params.parameters,
        metadata: {
          created: new Date(),
          version: '1.0.0',
          description: params.description || '',
          tags: params.tags || []
        }
      };

      // Validate architecture
      const validation = this.validateArchitecture(network);
      if (!validation.isValid) {
        throw new Error(`Invalid architecture: ${validation.errors.join(', ')}`);
      }

      // Store in database
      await this.storeNetwork(network);
      
      // Cache in memory
      this.networks.set(networkId, network);

      logger.info(`Created neural network: ${networkId}`);
      
      return {
        success: true,
        networkId,
        architecture: network,
        validation
      };
    } catch (error) {
      logger.error('Error creating network:', error);
      throw error;
    }
  }

  async modifyNetwork(params: any): Promise<any> {
    try {
      const { networkId, modifications } = params;
      
      let network = this.networks.get(networkId);
      if (!network) {
        network = await this.loadNetwork(networkId);
      }

      if (!network) {
        throw new Error(`Network not found: ${networkId}`);
      }

      // Apply modifications
      if (modifications.layers) {
        network.layers = this.parseLayerDefinitions(modifications.layers);
      }
      if (modifications.parameters) {
        network.parameters = { ...network.parameters, ...modifications.parameters };
      }

      // Validate modified architecture
      const validation = this.validateArchitecture(network);
      if (!validation.isValid) {
        throw new Error(`Invalid modifications: ${validation.errors.join(', ')}`);
      }

      // Update version
      network.metadata.version = this.incrementVersion(network.metadata.version);

      // Save changes
      await this.storeNetwork(network);
      this.networks.set(networkId, network);

      return {
        success: true,
        networkId,
        architecture: network,
        validation
      };
    } catch (error) {
      logger.error('Error modifying network:', error);
      throw error;
    }
  }

  async startTraining(params: any): Promise<any> {
    try {
      const { networkId, datasetId, parameters = {} } = params;
      
      const network = this.networks.get(networkId) || await this.loadNetwork(networkId);
      if (!network) {
        throw new Error(`Network not found: ${networkId}`);
      }

      const sessionId = `train_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session: TrainingSession = {
        id: sessionId,
        networkId,
        status: 'pending',
        progress: {
          currentEpoch: 0,
          totalEpochs: parameters.epochs || network.parameters.epochs,
          loss: 0,
          accuracy: 0,
          valLoss: 0,
          valAccuracy: 0
        },
        metrics: {
          epochLosses: [],
          epochAccuracies: [],
          validationLosses: [],
          validationAccuracies: [],
          learningRateSchedule: [],
          gradientNorms: [],
          weightHistograms: new Map()
        },
        startTime: new Date(),
        checkpoints: []
      };

      this.trainingSessions.set(sessionId, session);

      // Start training asynchronously
      this.executeTraining(session, network, datasetId, parameters);

      return {
        success: true,
        sessionId,
        status: session.status,
        estimatedDuration: this.estimateTrainingDuration(network, parameters)
      };
    } catch (error) {
      logger.error('Error starting training:', error);
      throw error;
    }
  }

  async getTrainingStatus(params: any): Promise<any> {
    try {
      const { sessionId } = params;
      
      const session = this.trainingSessions.get(sessionId);
      if (!session) {
        throw new Error(`Training session not found: ${sessionId}`);
      }

      return {
        success: true,
        session: {
          id: session.id,
          networkId: session.networkId,
          status: session.status,
          progress: session.progress,
          startTime: session.startTime,
          endTime: session.endTime,
          checkpoints: session.checkpoints,
          metrics: {
            epochLosses: session.metrics.epochLosses,
            epochAccuracies: session.metrics.epochAccuracies,
            validationLosses: session.metrics.validationLosses,
            validationAccuracies: session.metrics.validationAccuracies
          }
        }
      };
    } catch (error) {
      logger.error('Error getting training status:', error);
      throw error;
    }
  }

  async optimizeArchitecture(params: any): Promise<any> {
    try {
      const { taskType, datasetInfo, constraints = {} } = params;
      
      // Architecture optimization based on task type and data characteristics
      let optimizedArchitecture: Partial<NetworkArchitecture>;

      switch (taskType) {
        case 'image_classification':
          optimizedArchitecture = this.optimizeForImageClassification(datasetInfo, constraints);
          break;
        case 'text_classification':
          optimizedArchitecture = this.optimizeForTextClassification(datasetInfo, constraints);
          break;
        case 'time_series':
          optimizedArchitecture = this.optimizeForTimeSeries(datasetInfo, constraints);
          break;
        case 'regression':
          optimizedArchitecture = this.optimizeForRegression(datasetInfo, constraints);
          break;
        default:
          throw new Error(`Unsupported task type: ${taskType}`);
      }

      const recommendations = this.generateArchitectureRecommendations(optimizedArchitecture, datasetInfo);

      return {
        success: true,
        optimizedArchitecture,
        recommendations,
        estimatedPerformance: this.estimatePerformance(optimizedArchitecture, datasetInfo)
      };
    } catch (error) {
      logger.error('Error optimizing architecture:', error);
      throw error;
    }
  }

  private parseLayerDefinitions(layerDefs: any[]): NetworkLayer[] {
    return layerDefs.map((def, index) => ({
      id: `layer_${index}`,
      type: def.type,
      config: def.config,
      trainable: def.trainable !== false
    }));
  }

  private validateArchitecture(network: NetworkArchitecture): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate input/output shapes
    if (network.inputShape.length === 0) {
      errors.push('Input shape cannot be empty');
    }
    if (network.outputShape.length === 0) {
      errors.push('Output shape cannot be empty');
    }

    // Validate layers
    if (network.layers.length === 0) {
      errors.push('Network must have at least one layer');
    }

    // Validate layer sequence for specific architectures
    if (network.type === 'cnn') {
      const hasConvLayers = network.layers.some(layer => layer.type === 'conv2d');
      if (!hasConvLayers) {
        errors.push('CNN networks must have at least one Conv2D layer');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  private async storeNetwork(network: NetworkArchitecture): Promise<void> {
    const query = `
      INSERT INTO neural_networks (id, name, type, architecture, parameters, metadata, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (id) 
      DO UPDATE SET 
        architecture = $4,
        parameters = $5,
        metadata = $6,
        updated_at = CURRENT_TIMESTAMP
    `;
    
    await this.dbPool.query(query, [
      network.id,
      network.name,
      network.type,
      JSON.stringify(network.layers),
      JSON.stringify(network.parameters),
      JSON.stringify(network.metadata),
      network.metadata.created
    ]);
  }

  private async loadNetwork(networkId: string): Promise<NetworkArchitecture | null> {
    const query = 'SELECT * FROM neural_networks WHERE id = $1';
    const result = await this.dbPool.query(query, [networkId]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      layers: JSON.parse(row.architecture),
      inputShape: JSON.parse(row.input_shape),
      outputShape: JSON.parse(row.output_shape),
      parameters: JSON.parse(row.parameters),
      metadata: JSON.parse(row.metadata)
    };
  }

  private async executeTraining(session: TrainingSession, network: NetworkArchitecture, datasetId: string, parameters: any): Promise<void> {
    try {
      session.status = 'running';
      
      // Simulate training process
      const totalEpochs = parameters.epochs || network.parameters.epochs;
      
      for (let epoch = 1; epoch <= totalEpochs; epoch++) {
        // Simulate epoch training
        const loss = Math.max(0.1, 2.0 * Math.exp(-epoch * 0.1));
        const accuracy = Math.min(0.99, 0.5 + 0.4 * (1 - Math.exp(-epoch * 0.1)));
        const valLoss = loss * (1 + Math.random() * 0.2);
        const valAccuracy = accuracy * (0.95 + Math.random() * 0.05);

        session.progress = {
          currentEpoch: epoch,
          totalEpochs,
          loss,
          accuracy,
          valLoss,
          valAccuracy
        };

        session.metrics.epochLosses.push(loss);
        session.metrics.epochAccuracies.push(accuracy);
        session.metrics.validationLosses.push(valLoss);
        session.metrics.validationAccuracies.push(valAccuracy);

        // Save checkpoint every 10 epochs
        if (epoch % 10 === 0) {
          const checkpointId = `checkpoint_${session.id}_epoch_${epoch}`;
          session.checkpoints.push(checkpointId);
        }

        // Short delay to simulate training time
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      session.status = 'completed';
      session.endTime = new Date();
      
      logger.info(`Training completed for session: ${session.id}`);
    } catch (error) {
      session.status = 'failed';
      session.endTime = new Date();
      logger.error(`Training failed for session: ${session.id}`, error);
    }
  }

  private optimizeForImageClassification(datasetInfo: any, constraints: any): Partial<NetworkArchitecture> {
    const imageSize = datasetInfo.inputSize || [224, 224, 3];
    const numClasses = datasetInfo.numClasses || 10;

    return {
      type: 'cnn',
      inputShape: imageSize,
      outputShape: [numClasses],
      layers: [
        { id: 'conv1', type: 'conv2d', config: { units: 32, kernelSize: [3, 3], activationFunction: 'relu' }, trainable: true },
        { id: 'pool1', type: 'maxpool', config: { kernelSize: [2, 2], activationFunction: 'linear' }, trainable: true },
        { id: 'conv2', type: 'conv2d', config: { units: 64, kernelSize: [3, 3], activationFunction: 'relu' }, trainable: true },
        { id: 'pool2', type: 'maxpool', config: { kernelSize: [2, 2], activationFunction: 'linear' }, trainable: true },
        { id: 'dense1', type: 'dense', config: { units: 128, activationFunction: 'relu' }, trainable: true },
        { id: 'dropout', type: 'dropout', config: { dropoutRate: 0.5, activationFunction: 'linear' }, trainable: true },
        { id: 'output', type: 'dense', config: { units: numClasses, activationFunction: 'softmax' }, trainable: true }
      ]
    };
  }

  private optimizeForTextClassification(datasetInfo: any, constraints: any): Partial<NetworkArchitecture> {
    const maxLength = datasetInfo.maxSequenceLength || 100;
    const vocabSize = datasetInfo.vocabularySize || 10000;
    const numClasses = datasetInfo.numClasses || 2;

    return {
      type: 'lstm',
      inputShape: [maxLength],
      outputShape: [numClasses],
      layers: [
        { id: 'embedding', type: 'dense', config: { units: 128, activationFunction: 'linear' }, trainable: true },
        { id: 'lstm1', type: 'dense', config: { units: 64, activationFunction: 'tanh' }, trainable: true },
        { id: 'dropout', type: 'dropout', config: { dropoutRate: 0.3, activationFunction: 'linear' }, trainable: true },
        { id: 'output', type: 'dense', config: { units: numClasses, activationFunction: 'softmax' }, trainable: true }
      ]
    };
  }

  private optimizeForTimeSeries(datasetInfo: any, constraints: any): Partial<NetworkArchitecture> {
    const sequenceLength = datasetInfo.sequenceLength || 50;
    const features = datasetInfo.features || 1;

    return {
      type: 'lstm',
      inputShape: [sequenceLength, features],
      outputShape: [1],
      layers: [
        { id: 'lstm1', type: 'dense', config: { units: 50, activationFunction: 'tanh' }, trainable: true },
        { id: 'dropout1', type: 'dropout', config: { dropoutRate: 0.2, activationFunction: 'linear' }, trainable: true },
        { id: 'lstm2', type: 'dense', config: { units: 25, activationFunction: 'tanh' }, trainable: true },
        { id: 'dropout2', type: 'dropout', config: { dropoutRate: 0.2, activationFunction: 'linear' }, trainable: true },
        { id: 'output', type: 'dense', config: { units: 1, activationFunction: 'linear' }, trainable: true }
      ]
    };
  }

  private optimizeForRegression(datasetInfo: any, constraints: any): Partial<NetworkArchitecture> {
    const inputFeatures = datasetInfo.inputFeatures || 10;
    const outputFeatures = datasetInfo.outputFeatures || 1;

    return {
      type: 'feedforward',
      inputShape: [inputFeatures],
      outputShape: [outputFeatures],
      layers: [
        { id: 'dense1', type: 'dense', config: { units: 128, activationFunction: 'relu' }, trainable: true },
        { id: 'dropout1', type: 'dropout', config: { dropoutRate: 0.3, activationFunction: 'linear' }, trainable: true },
        { id: 'dense2', type: 'dense', config: { units: 64, activationFunction: 'relu' }, trainable: true },
        { id: 'dropout2', type: 'dropout', config: { dropoutRate: 0.3, activationFunction: 'linear' }, trainable: true },
        { id: 'output', type: 'dense', config: { units: outputFeatures, activationFunction: 'linear' }, trainable: true }
      ]
    };
  }

  private generateArchitectureRecommendations(architecture: Partial<NetworkArchitecture>, datasetInfo: any): string[] {
    const recommendations: string[] = [];

    if (datasetInfo.dataSize && datasetInfo.dataSize < 1000) {
      recommendations.push('Consider data augmentation or transfer learning for small datasets');
    }

    if (architecture.layers && architecture.layers.length > 10) {
      recommendations.push('Deep architecture detected - consider batch normalization and residual connections');
    }

    recommendations.push('Use early stopping to prevent overfitting');
    recommendations.push('Consider learning rate scheduling for better convergence');

    return recommendations;
  }

  private estimatePerformance(architecture: Partial<NetworkArchitecture>, datasetInfo: any): any {
    // Simplified performance estimation
    return {
      estimatedAccuracy: 0.85 + Math.random() * 0.1,
      estimatedTrainingTime: '2-4 hours',
      memoryRequirement: '2-4 GB',
      computeComplexity: 'Medium'
    };
  }

  private estimateTrainingDuration(network: NetworkArchitecture, parameters: any): string {
    const epochs = parameters.epochs || network.parameters.epochs;
    const complexity = network.layers.length * epochs;
    
    if (complexity < 100) return '5-15 minutes';
    if (complexity < 500) return '30-60 minutes';
    return '1-3 hours';
  }

  private incrementVersion(version: string): string {
    const parts = version.split('.');
    const patch = parseInt(parts[2] || '0') + 1;
    return `${parts[0]}.${parts[1]}.${patch}`;
  }

  async getHealth(): Promise<any> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      networksLoaded: this.networks.size,
      activeTrainingSessions: Array.from(this.trainingSessions.values()).filter(s => s.status === 'running').length,
      cacheSize: this.modelCache.size
    };
  }
}