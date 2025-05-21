import { RedisConnectionManager } from '../../database/redis-client.js';
import { getLogger } from '../../shared/logger.js';

const logger = getLogger('MessageBus');

export interface MessagePayload {
  id: string;
  type: string;
  source: string;
  target?: string;
  data: any;
  timestamp: number;
  ttl?: number;
}

export interface StreamMessage {
  id: string;
  fields: Record<string, string>;
}

export interface ConsumerOptions {
  group: string;
  consumer: string;
  block?: number;
  count?: number;
  startId?: string;
}

export interface MessageHandler {
  (message: MessagePayload): Promise<void>;
}

export interface MessageBusMetrics {
  messagesSent: number;
  messagesReceived: number;
  messagesProcessed: number;
  messagesFailed: number;
  activeConsumers: number;
  streamCount: number;
}

export class MessageBus {
  private redis: RedisConnectionManager;
  private consumers: Map<string, { handler: MessageHandler; running: boolean }> = new Map();
  private metrics: MessageBusMetrics = {
    messagesSent: 0,
    messagesReceived: 0,
    messagesProcessed: 0,
    messagesFailed: 0,
    activeConsumers: 0,
    streamCount: 0,
  };
  private shutdownPromise: Promise<void> | null = null;

  constructor(redis: RedisConnectionManager) {
    this.redis = redis;
    this.setupSignalHandlers();
  }

  private setupSignalHandlers(): void {
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  async publishMessage(streamName: string, message: MessagePayload): Promise<string> {
    try {
      const serializedMessage = this.serializeMessage(message);
      const messageId = await this.redis.getClient().xadd(
        streamName,
        '*',
        'payload', serializedMessage
      );

      this.metrics.messagesSent++;
      logger.debug(`Message published to stream ${streamName}`, {
        messageId,
        type: message.type,
        source: message.source,
        target: message.target,
      });

      if (message.ttl) {
        await this.redis.getClient().expire(streamName, message.ttl);
      }

      return messageId;
    } catch (error) {
      logger.error(`Failed to publish message to stream ${streamName}`, { error });
      throw error;
    }
  }

  async subscribeToStream(
    streamName: string,
    options: ConsumerOptions,
    handler: MessageHandler
  ): Promise<void> {
    const consumerKey = `${streamName}:${options.group}:${options.consumer}`;
    
    if (this.consumers.has(consumerKey)) {
      throw new Error(`Consumer ${consumerKey} already exists`);
    }

    try {
      await this.createConsumerGroup(streamName, options.group, options.startId || '0');
      
      this.consumers.set(consumerKey, { handler, running: true });
      this.metrics.activeConsumers++;

      this.startConsumer(streamName, options, handler);
      
      logger.info(`Subscribed to stream ${streamName}`, {
        group: options.group,
        consumer: options.consumer,
      });
    } catch (error) {
      logger.error(`Failed to subscribe to stream ${streamName}`, { error });
      throw error;
    }
  }

  private async createConsumerGroup(streamName: string, groupName: string, startId: string): Promise<void> {
    try {
      await this.redis.getClient().xgroup('CREATE', streamName, groupName, startId, 'MKSTREAM');
      logger.debug(`Created consumer group ${groupName} for stream ${streamName}`);
    } catch (error: any) {
      if (error.message?.includes('BUSYGROUP')) {
        logger.debug(`Consumer group ${groupName} already exists for stream ${streamName}`);
      } else {
        throw error;
      }
    }
  }

  private async startConsumer(
    streamName: string,
    options: ConsumerOptions,
    handler: MessageHandler
  ): Promise<void> {
    const consumerKey = `${streamName}:${options.group}:${options.consumer}`;
    
    const processMessages = async (): Promise<void> => {
      const consumer = this.consumers.get(consumerKey);
      if (!consumer?.running) {
        return;
      }

      try {
        const results = await this.redis.getClient().xreadgroup(
          'GROUP', options.group, options.consumer,
          'COUNT', options.count || 10,
          'BLOCK', options.block || 1000,
          'STREAMS', streamName, '>'
        );

        if (results && results.length > 0) {
          for (const [stream, messages] of results) {
            for (const [messageId, fields] of messages) {
              await this.processMessage(streamName, options, messageId, fields, handler);
            }
          }
        }
      } catch (error) {
        if (consumer?.running) {
          logger.error(`Error reading from stream ${streamName}`, { error });
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      if (consumer?.running) {
        setImmediate(processMessages);
      }
    };

    processMessages();
  }

  private async processMessage(
    streamName: string,
    options: ConsumerOptions,
    messageId: string,
    fields: string[],
    handler: MessageHandler
  ): Promise<void> {
    try {
      const payload = fields[1];
      const message = this.deserializeMessage(payload);
      
      this.metrics.messagesReceived++;
      
      logger.debug(`Processing message from stream ${streamName}`, {
        messageId,
        type: message.type,
        source: message.source,
      });

      await handler(message);
      
      await this.redis.getClient().xack(streamName, options.group, messageId);
      this.metrics.messagesProcessed++;
      
      logger.debug(`Successfully processed message ${messageId}`);
    } catch (error) {
      this.metrics.messagesFailed++;
      logger.error(`Failed to process message ${messageId}`, { error });
      
      await this.handleFailedMessage(streamName, options, messageId, error);
    }
  }

  private async handleFailedMessage(
    streamName: string,
    options: ConsumerOptions,
    messageId: string,
    error: any
  ): Promise<void> {
    const deadLetterStream = `${streamName}:dead-letter`;
    
    try {
      await this.redis.getClient().xadd(
        deadLetterStream,
        '*',
        'originalStream', streamName,
        'originalMessageId', messageId,
        'error', error.message || 'Unknown error',
        'timestamp', Date.now().toString(),
        'consumerGroup', options.group,
        'consumer', options.consumer
      );
      
      await this.redis.getClient().xack(streamName, options.group, messageId);
      
      logger.info(`Moved failed message to dead letter queue`, {
        originalStream: streamName,
        messageId,
        deadLetterStream,
      });
    } catch (dlqError) {
      logger.error(`Failed to handle failed message`, { 
        messageId, 
        originalError: error,
        dlqError 
      });
    }
  }

  async unsubscribeFromStream(streamName: string, options: ConsumerOptions): Promise<void> {
    const consumerKey = `${streamName}:${options.group}:${options.consumer}`;
    const consumer = this.consumers.get(consumerKey);
    
    if (!consumer) {
      logger.warn(`Consumer ${consumerKey} not found`);
      return;
    }

    consumer.running = false;
    this.consumers.delete(consumerKey);
    this.metrics.activeConsumers--;
    
    try {
      await this.redis.getClient().xgroup(
        'DELCONSUMER', streamName, options.group, options.consumer
      );
      
      logger.info(`Unsubscribed from stream ${streamName}`, {
        group: options.group,
        consumer: options.consumer,
      });
    } catch (error) {
      logger.error(`Failed to delete consumer ${consumerKey}`, { error });
    }
  }

  async getStreamInfo(streamName: string): Promise<any> {
    try {
      const info = await this.redis.getClient().xinfo('STREAM', streamName);
      return this.parseStreamInfo(info);
    } catch (error) {
      logger.error(`Failed to get stream info for ${streamName}`, { error });
      throw error;
    }
  }

  async listStreams(): Promise<string[]> {
    try {
      const keys = await this.redis.getClient().keys('*');
      const streams: string[] = [];
      
      for (const key of keys) {
        const type = await this.redis.getClient().type(key);
        if (type === 'stream') {
          streams.push(key);
        }
      }
      
      this.metrics.streamCount = streams.length;
      return streams;
    } catch (error) {
      logger.error('Failed to list streams', { error });
      throw error;
    }
  }

  async trimStream(streamName: string, maxLength: number): Promise<number> {
    try {
      const trimmed = await this.redis.getClient().xtrim(streamName, 'MAXLEN', '~', maxLength);
      logger.info(`Trimmed stream ${streamName}`, { trimmed, maxLength });
      return trimmed;
    } catch (error) {
      logger.error(`Failed to trim stream ${streamName}`, { error });
      throw error;
    }
  }

  async getPendingMessages(streamName: string, groupName: string): Promise<any[]> {
    try {
      const pending = await this.redis.getClient().xpending(streamName, groupName);
      return Array.isArray(pending) ? pending : [];
    } catch (error) {
      logger.error(`Failed to get pending messages for ${streamName}:${groupName}`, { error });
      throw error;
    }
  }

  getMetrics(): MessageBusMetrics {
    return { ...this.metrics };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const streams = await this.listStreams();
      const redisHealth = await this.redis.healthCheck();
      
      return {
        healthy: redisHealth.healthy && this.metrics.activeConsumers >= 0,
        details: {
          redis: redisHealth,
          metrics: this.metrics,
          streamCount: streams.length,
          activeConsumers: this.metrics.activeConsumers,
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  private serializeMessage(message: MessagePayload): string {
    return JSON.stringify(message);
  }

  private deserializeMessage(payload: string): MessagePayload {
    try {
      return JSON.parse(payload);
    } catch (error) {
      logger.error('Failed to deserialize message payload', { error, payload });
      throw new Error('Invalid message payload format');
    }
  }

  private parseStreamInfo(info: any[]): any {
    const result: any = {};
    for (let i = 0; i < info.length; i += 2) {
      result[info[i]] = info[i + 1];
    }
    return result;
  }

  async shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown();
    return this.shutdownPromise;
  }

  private async performShutdown(): Promise<void> {
    logger.info('Shutting down Message Bus...');
    
    const consumerKeys = Array.from(this.consumers.keys());
    
    for (const consumerKey of consumerKeys) {
      const consumer = this.consumers.get(consumerKey);
      if (consumer) {
        consumer.running = false;
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    this.consumers.clear();
    this.metrics.activeConsumers = 0;
    
    logger.info('Message Bus shutdown complete');
  }
}