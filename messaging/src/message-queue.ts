import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface Message {
  id: string;
  topic: string;
  payload: any;
  headers: Record<string, string>;
  timestamp: Date;
  producer: string;
  priority: number;
  expiry?: Date;
  deliveryCount: number;
  maxDeliveryAttempts: number;
  delayUntil?: Date;
  correlationId?: string;
  replyTo?: string;
  metadata: Record<string, any>;
}

export interface Queue {
  name: string;
  type: 'fifo' | 'priority' | 'delayed' | 'pub-sub';
  maxSize: number;
  maxMessageSize: number;
  messageRetention: number; // seconds
  deadLetterQueue?: string;
  dlqThreshold: number;
  encryption: boolean;
  persistence: boolean;
  replication: number; // number of replicas
  consumerGroups: string[];
  metrics: QueueMetrics;
  created: Date;
  lastModified: Date;
}

export interface QueueMetrics {
  totalMessages: number;
  pendingMessages: number;
  processedMessages: number;
  failedMessages: number;
  averageProcessingTime: number;
  throughputPerSecond: number;
  lastActivity: Date;
}

export interface Consumer {
  id: string;
  name: string;
  groupId?: string;
  queues: string[];
  batchSize: number;
  prefetch: number;
  ackTimeout: number; // seconds
  maxConcurrency: number;
  filterExpression?: string;
  processingFunction: (messages: Message[]) => Promise<ProcessingResult[]>;
  status: 'active' | 'paused' | 'stopped' | 'error';
  lastHeartbeat: Date;
  metrics: ConsumerMetrics;
}

export interface ConsumerMetrics {
  messagesProcessed: number;
  messagesAcknowledged: number;
  messagesRejected: number;
  averageProcessingTime: number;
  errorRate: number;
  lastError?: string;
}

export interface ProcessingResult {
  messageId: string;
  status: 'ack' | 'nack' | 'reject' | 'retry';
  error?: string;
  retryDelay?: number; // seconds
  metadata?: Record<string, any>;
}

export interface Producer {
  id: string;
  name: string;
  defaultTopic?: string;
  compressionEnabled: boolean;
  batchingEnabled: boolean;
  batchSize: number;
  batchTimeout: number; // milliseconds
  confirmationRequired: boolean;
  retryPolicy: RetryPolicy;
  metrics: ProducerMetrics;
}

export interface ProducerMetrics {
  messagesSent: number;
  messagesConfirmed: number;
  messagesFailed: number;
  averageLatency: number;
  throughputPerSecond: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
  jitter: boolean;
}

export interface Subscription {
  id: string;
  consumerId: string;
  topic: string;
  partition?: number;
  offset: number;
  autoCommit: boolean;
  commitInterval: number; // milliseconds
  sessionTimeout: number; // milliseconds
  heartbeatInterval: number; // milliseconds
  status: 'active' | 'paused' | 'closed';
}

export class MessageQueue extends EventEmitter {
  private queues = new Map<string, Queue>();
  private messages = new Map<string, Map<string, Message>>(); // queueName -> messageId -> message
  private consumers = new Map<string, Consumer>();
  private producers = new Map<string, Producer>();
  private subscriptions = new Map<string, Subscription>();
  private processingMessages = new Map<string, Set<string>>(); // consumerId -> messageIds
  private delayedMessages = new Map<string, NodeJS.Timeout>(); // messageId -> timeout
  private deadLetterQueues = new Map<string, Message[]>();
  private encryptionKey: Buffer | null = null;
  
  private processingInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.initializeEncryption();
    this.startProcessingLoop();
    this.startMetricsCollection();
    this.startCleanupProcess();
  }

  private initializeEncryption(): void {
    this.encryptionKey = crypto.randomBytes(32);
  }

  createQueue(config: Omit<Queue, 'metrics' | 'created' | 'lastModified'>): void {
    const queue: Queue = {
      ...config,
      metrics: {
        totalMessages: 0,
        pendingMessages: 0,
        processedMessages: 0,
        failedMessages: 0,
        averageProcessingTime: 0,
        throughputPerSecond: 0,
        lastActivity: new Date()
      },
      created: new Date(),
      lastModified: new Date()
    };

    this.queues.set(queue.name, queue);
    this.messages.set(queue.name, new Map());

    // Create dead letter queue if specified
    if (queue.deadLetterQueue) {
      this.deadLetterQueues.set(queue.deadLetterQueue, []);
    }

    this.emit('queue-created', queue);
  }

  deleteQueue(queueName: string, purge: boolean = false): boolean {
    const queue = this.queues.get(queueName);
    if (!queue) {
      return false;
    }

    // Stop all consumers for this queue
    for (const consumer of this.consumers.values()) {
      if (consumer.queues.includes(queueName)) {
        this.stopConsumer(consumer.id);
      }
    }

    // Clean up messages
    if (purge) {
      this.messages.delete(queueName);
    }

    this.queues.delete(queueName);
    this.emit('queue-deleted', { queueName, purged: purge });
    return true;
  }

  async sendMessage(
    queueName: string,
    payload: any,
    options: {
      headers?: Record<string, string>;
      priority?: number;
      expiry?: Date;
      delayUntil?: Date;
      correlationId?: string;
      replyTo?: string;
      producerId?: string;
    } = {}
  ): Promise<string> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    // Check queue size limits
    const queueMessages = this.messages.get(queueName)!;
    if (queueMessages.size >= queue.maxSize) {
      throw new Error(`Queue is full: ${queueName}`);
    }

    // Check message size
    const messageSize = JSON.stringify(payload).length;
    if (messageSize > queue.maxMessageSize) {
      throw new Error(`Message too large: ${messageSize} bytes`);
    }

    const message: Message = {
      id: crypto.randomUUID(),
      topic: queueName,
      payload: queue.encryption ? this.encrypt(payload) : payload,
      headers: options.headers || {},
      timestamp: new Date(),
      producer: options.producerId || 'anonymous',
      priority: options.priority || 0,
      expiry: options.expiry,
      deliveryCount: 0,
      maxDeliveryAttempts: 3,
      delayUntil: options.delayUntil,
      correlationId: options.correlationId,
      replyTo: options.replyTo,
      metadata: {}
    };

    // Handle delayed messages
    if (message.delayUntil && message.delayUntil > new Date()) {
      const delay = message.delayUntil.getTime() - Date.now();
      const timeout = setTimeout(() => {
        this.addMessageToQueue(queueName, message);
        this.delayedMessages.delete(message.id);
      }, delay);
      
      this.delayedMessages.set(message.id, timeout);
    } else {
      this.addMessageToQueue(queueName, message);
    }

    // Update producer metrics
    if (options.producerId) {
      const producer = this.producers.get(options.producerId);
      if (producer) {
        producer.metrics.messagesSent++;
      }
    }

    this.emit('message-sent', { queueName, messageId: message.id });
    return message.id;
  }

  private addMessageToQueue(queueName: string, message: Message): void {
    const queueMessages = this.messages.get(queueName)!;
    queueMessages.set(message.id, message);

    const queue = this.queues.get(queueName)!;
    queue.metrics.totalMessages++;
    queue.metrics.pendingMessages++;
    queue.metrics.lastActivity = new Date();
    queue.lastModified = new Date();

    this.emit('message-queued', { queueName, messageId: message.id });
  }

  registerProducer(config: Omit<Producer, 'metrics'>): string {
    const producer: Producer = {
      ...config,
      metrics: {
        messagesSent: 0,
        messagesConfirmed: 0,
        messagesFailed: 0,
        averageLatency: 0,
        throughputPerSecond: 0
      }
    };

    this.producers.set(producer.id, producer);
    this.emit('producer-registered', producer);
    return producer.id;
  }

  registerConsumer(config: Omit<Consumer, 'lastHeartbeat' | 'metrics'>): string {
    const consumer: Consumer = {
      ...config,
      lastHeartbeat: new Date(),
      metrics: {
        messagesProcessed: 0,
        messagesAcknowledged: 0,
        messagesRejected: 0,
        averageProcessingTime: 0,
        errorRate: 0
      }
    };

    this.consumers.set(consumer.id, consumer);
    this.processingMessages.set(consumer.id, new Set());

    // Create subscriptions for each queue
    for (const queueName of consumer.queues) {
      const subscription: Subscription = {
        id: crypto.randomUUID(),
        consumerId: consumer.id,
        topic: queueName,
        offset: 0,
        autoCommit: true,
        commitInterval: 5000,
        sessionTimeout: 30000,
        heartbeatInterval: 3000,
        status: 'active'
      };

      this.subscriptions.set(subscription.id, subscription);
    }

    this.emit('consumer-registered', consumer);
    return consumer.id;
  }

  stopConsumer(consumerId: string): boolean {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      return false;
    }

    consumer.status = 'stopped';

    // Close subscriptions
    for (const subscription of this.subscriptions.values()) {
      if (subscription.consumerId === consumerId) {
        subscription.status = 'closed';
      }
    }

    // Requeue processing messages
    const processingSet = this.processingMessages.get(consumerId);
    if (processingSet) {
      for (const messageId of processingSet) {
        // Find and requeue the message
        for (const [queueName, queueMessages] of this.messages) {
          const message = queueMessages.get(messageId);
          if (message) {
            message.deliveryCount = 0; // Reset delivery count
            break;
          }
        }
      }
      processingSet.clear();
    }

    this.emit('consumer-stopped', { consumerId });
    return true;
  }

  private startProcessingLoop(): void {
    this.processingInterval = setInterval(async () => {
      await this.processMessages();
    }, 100); // Process every 100ms
  }

  private async processMessages(): Promise<void> {
    for (const consumer of this.consumers.values()) {
      if (consumer.status !== 'active') {
        continue;
      }

      try {
        await this.processConsumerMessages(consumer);
      } catch (error) {
        consumer.status = 'error';
        consumer.metrics.lastError = (error as Error).message;
        this.emit('consumer-error', {
          consumerId: consumer.id,
          error: (error as Error).message
        });
      }
    }
  }

  private async processConsumerMessages(consumer: Consumer): Promise<void> {
    const processingSet = this.processingMessages.get(consumer.id)!;
    
    // Don't exceed max concurrency
    if (processingSet.size >= consumer.maxConcurrency) {
      return;
    }

    const messagesToProcess: Message[] = [];
    const remainingCapacity = Math.min(
      consumer.batchSize,
      consumer.maxConcurrency - processingSet.size
    );

    // Collect messages from subscribed queues
    for (const queueName of consumer.queues) {
      if (messagesToProcess.length >= remainingCapacity) {
        break;
      }

      const messages = this.getMessagesForConsumer(queueName, consumer, remainingCapacity - messagesToProcess.length);
      messagesToProcess.push(...messages);
    }

    if (messagesToProcess.length === 0) {
      return;
    }

    // Mark messages as being processed
    for (const message of messagesToProcess) {
      processingSet.add(message.id);
      message.deliveryCount++;
    }

    // Process messages
    const startTime = Date.now();
    
    try {
      const results = await consumer.processingFunction(messagesToProcess);
      const processingTime = Date.now() - startTime;
      
      // Update consumer metrics
      consumer.metrics.messagesProcessed += messagesToProcess.length;
      consumer.metrics.averageProcessingTime = 
        (consumer.metrics.averageProcessingTime + processingTime) / 2;

      // Handle processing results
      await this.handleProcessingResults(messagesToProcess, results, consumer);

    } catch (error) {
      // Handle processing failure
      await this.handleProcessingFailure(messagesToProcess, consumer, (error as Error).message);
    }

    // Remove from processing set
    for (const message of messagesToProcess) {
      processingSet.delete(message.id);
    }
  }

  private getMessagesForConsumer(queueName: string, consumer: Consumer, limit: number): Message[] {
    const queue = this.queues.get(queueName);
    const queueMessages = this.messages.get(queueName);
    
    if (!queue || !queueMessages) {
      return [];
    }

    const messages = Array.from(queueMessages.values())
      .filter(message => {
        // Skip expired messages
        if (message.expiry && message.expiry < new Date()) {
          return false;
        }

        // Skip delayed messages
        if (message.delayUntil && message.delayUntil > new Date()) {
          return false;
        }

        // Apply filter expression if configured
        if (consumer.filterExpression) {
          return this.evaluateFilterExpression(message, consumer.filterExpression);
        }

        return true;
      })
      .sort((a, b) => {
        // Sort by priority (higher first), then by timestamp
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp.getTime() - b.timestamp.getTime();
      })
      .slice(0, limit);

    return messages;
  }

  private evaluateFilterExpression(message: Message, expression: string): boolean {
    // Simplified filter expression evaluation
    // In production, use a proper expression evaluator
    try {
      const context = {
        headers: message.headers,
        priority: message.priority,
        producer: message.producer,
        topic: message.topic
      };
      
      // Very basic evaluation - in practice use a safe expression evaluator
      return true;
    } catch {
      return false;
    }
  }

  private async handleProcessingResults(
    messages: Message[],
    results: ProcessingResult[],
    consumer: Consumer
  ): Promise<void> {
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const result = results[i] || { messageId: message.id, status: 'nack' };

      switch (result.status) {
        case 'ack':
          await this.acknowledgeMessage(message, consumer);
          break;

        case 'nack':
          await this.negativeAcknowledgeMessage(message, consumer, result.error);
          break;

        case 'reject':
          await this.rejectMessage(message, consumer, result.error);
          break;

        case 'retry':
          await this.retryMessage(message, consumer, result.retryDelay || 60);
          break;
      }
    }
  }

  private async handleProcessingFailure(
    messages: Message[],
    consumer: Consumer,
    error: string
  ): Promise<void> {
    for (const message of messages) {
      await this.negativeAcknowledgeMessage(message, consumer, error);
    }
  }

  private async acknowledgeMessage(message: Message, consumer: Consumer): Promise<void> {
    const queueMessages = this.messages.get(message.topic)!;
    queueMessages.delete(message.id);

    const queue = this.queues.get(message.topic)!;
    queue.metrics.processedMessages++;
    queue.metrics.pendingMessages--;

    consumer.metrics.messagesAcknowledged++;

    this.emit('message-acknowledged', {
      messageId: message.id,
      queueName: message.topic,
      consumerId: consumer.id
    });
  }

  private async negativeAcknowledgeMessage(message: Message, consumer: Consumer, error?: string): Promise<void> {
    const queue = this.queues.get(message.topic)!;

    if (message.deliveryCount >= message.maxDeliveryAttempts) {
      // Send to dead letter queue
      await this.sendToDeadLetterQueue(message, queue, error);
    } else {
      // Requeue for retry
      message.delayUntil = new Date(Date.now() + 30000); // 30 second delay
    }

    consumer.metrics.messagesRejected++;
    queue.metrics.failedMessages++;

    this.emit('message-nacked', {
      messageId: message.id,
      queueName: message.topic,
      consumerId: consumer.id,
      error
    });
  }

  private async rejectMessage(message: Message, consumer: Consumer, error?: string): Promise<void> {
    const queue = this.queues.get(message.topic)!;
    await this.sendToDeadLetterQueue(message, queue, error);

    consumer.metrics.messagesRejected++;
    queue.metrics.failedMessages++;

    this.emit('message-rejected', {
      messageId: message.id,
      queueName: message.topic,
      consumerId: consumer.id,
      error
    });
  }

  private async retryMessage(message: Message, consumer: Consumer, delaySeconds: number): Promise<void> {
    message.delayUntil = new Date(Date.now() + delaySeconds * 1000);
    message.deliveryCount = Math.max(0, message.deliveryCount - 1); // Don't increment delivery count for explicit retries

    this.emit('message-retried', {
      messageId: message.id,
      queueName: message.topic,
      consumerId: consumer.id,
      delaySeconds
    });
  }

  private async sendToDeadLetterQueue(message: Message, queue: Queue, error?: string): Promise<void> {
    if (queue.deadLetterQueue) {
      const dlqMessages = this.deadLetterQueues.get(queue.deadLetterQueue);
      if (dlqMessages) {
        message.metadata.deadLetterReason = error || 'Max delivery attempts exceeded';
        message.metadata.originalQueue = queue.name;
        message.metadata.deadLetterTimestamp = new Date();
        
        dlqMessages.push(message);
      }
    }

    // Remove from original queue
    const queueMessages = this.messages.get(message.topic)!;
    queueMessages.delete(message.id);
    queue.metrics.pendingMessages--;

    this.emit('message-dead-lettered', {
      messageId: message.id,
      originalQueue: queue.name,
      deadLetterQueue: queue.deadLetterQueue,
      reason: error
    });
  }

  private encrypt(data: any): any {
    if (!this.encryptionKey) {
      return data;
    }

    const json = JSON.stringify(data);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    
    let encrypted = cipher.update(json, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return {
      encrypted: true,
      data: encrypted,
      iv: iv.toString('hex')
    };
  }

  private decrypt(encryptedData: any): any {
    if (!encryptedData.encrypted || !this.encryptionKey) {
      return encryptedData;
    }

    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 60000); // Every minute
  }

  private updateMetrics(): void {
    for (const queue of this.queues.values()) {
      const queueMessages = this.messages.get(queue.name)!;
      queue.metrics.pendingMessages = queueMessages.size;
      
      // Calculate throughput (simplified)
      queue.metrics.throughputPerSecond = queue.metrics.processedMessages / 60;
    }

    for (const producer of this.producers.values()) {
      producer.metrics.throughputPerSecond = producer.metrics.messagesSent / 60;
      
      // Reset counters for next period
      producer.metrics.messagesSent = 0;
    }

    this.emit('metrics-updated');
  }

  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredMessages();
      this.cleanupStaleConsumers();
    }, 300000); // Every 5 minutes
  }

  private cleanupExpiredMessages(): void {
    for (const [queueName, queueMessages] of this.messages) {
      const expiredMessages: string[] = [];
      
      for (const [messageId, message] of queueMessages) {
        if (message.expiry && message.expiry < new Date()) {
          expiredMessages.push(messageId);
        }
      }

      for (const messageId of expiredMessages) {
        queueMessages.delete(messageId);
        const queue = this.queues.get(queueName)!;
        queue.metrics.pendingMessages--;
        
        this.emit('message-expired', { messageId, queueName });
      }
    }
  }

  private cleanupStaleConsumers(): void {
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    for (const consumer of this.consumers.values()) {
      const timeSinceHeartbeat = now - consumer.lastHeartbeat.getTime();
      
      if (timeSinceHeartbeat > staleThreshold && consumer.status === 'active') {
        consumer.status = 'stopped';
        this.emit('consumer-stale', { consumerId: consumer.id });
      }
    }
  }

  // Public API methods
  getQueues(): Queue[] {
    return Array.from(this.queues.values());
  }

  getQueue(queueName: string): Queue | null {
    return this.queues.get(queueName) || null;
  }

  getConsumers(): Consumer[] {
    return Array.from(this.consumers.values());
  }

  getProducers(): Producer[] {
    return Array.from(this.producers.values());
  }

  getQueueMessages(queueName: string, limit: number = 100): Message[] {
    const queueMessages = this.messages.get(queueName);
    if (!queueMessages) {
      return [];
    }

    return Array.from(queueMessages.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  getDeadLetterMessages(dlqName: string): Message[] {
    return this.deadLetterQueues.get(dlqName) || [];
  }

  purgeQueue(queueName: string): boolean {
    const queueMessages = this.messages.get(queueName);
    if (!queueMessages) {
      return false;
    }

    const messageCount = queueMessages.size;
    queueMessages.clear();

    const queue = this.queues.get(queueName)!;
    queue.metrics.pendingMessages = 0;

    this.emit('queue-purged', { queueName, messageCount });
    return true;
  }

  getStats(): any {
    const queues = Array.from(this.queues.values());
    const consumers = Array.from(this.consumers.values());
    const producers = Array.from(this.producers.values());

    return {
      queues: {
        total: queues.length,
        totalMessages: queues.reduce((sum, q) => sum + q.metrics.totalMessages, 0),
        pendingMessages: queues.reduce((sum, q) => sum + q.metrics.pendingMessages, 0),
        processedMessages: queues.reduce((sum, q) => sum + q.metrics.processedMessages, 0)
      },
      consumers: {
        total: consumers.length,
        active: consumers.filter(c => c.status === 'active').length,
        stopped: consumers.filter(c => c.status === 'stopped').length,
        error: consumers.filter(c => c.status === 'error').length
      },
      producers: {
        total: producers.length,
        totalMessagesSent: producers.reduce((sum, p) => sum + p.metrics.messagesSent, 0)
      },
      deadLetterQueues: this.deadLetterQueues.size,
      delayedMessages: this.delayedMessages.size
    };
  }

  destroy(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Clear delayed message timers
    for (const timeout of this.delayedMessages.values()) {
      clearTimeout(timeout);
    }

    this.queues.clear();
    this.messages.clear();
    this.consumers.clear();
    this.producers.clear();
    this.subscriptions.clear();
    this.processingMessages.clear();
    this.delayedMessages.clear();
    this.deadLetterQueues.clear();

    this.removeAllListeners();
  }
}