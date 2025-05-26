import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface StreamEvent {
  id: string;
  streamName: string;
  eventType: string;
  data: any;
  metadata: Record<string, any>;
  timestamp: Date;
  version: number;
  correlationId?: string;
  causationId?: string;
  aggregate?: {
    id: string;
    type: string;
    version: number;
  };
  partition?: string;
  headers: Record<string, string>;
}

export interface EventStream {
  name: string;
  description: string;
  partitions: number;
  replicationFactor: number;
  retentionPeriod: number; // hours
  retentionSize: number; // bytes
  compressionType: 'none' | 'gzip' | 'snappy' | 'lz4';
  cleanupPolicy: 'delete' | 'compact';
  segmentSize: number; // bytes
  indexInterval: number; // bytes
  created: Date;
  lastModified: Date;
  configuration: StreamConfiguration;
  metrics: StreamMetrics;
}

export interface StreamConfiguration {
  maxMessageSize: number;
  minInSyncReplicas: number;
  uncleanLeaderElection: boolean;
  messageTimestampType: 'create-time' | 'log-append-time';
  messageDownConversionEnable: boolean;
  logMessageFormatVersion: string;
  flushMessages: number;
  flushMs: number;
}

export interface StreamMetrics {
  totalEvents: number;
  eventsPerSecond: number;
  bytesPerSecond: number;
  totalSize: number;
  lastActivity: Date;
  partitionMetrics: Map<number, PartitionMetrics>;
}

export interface PartitionMetrics {
  partition: number;
  offset: number;
  logSize: number;
  logStartOffset: number;
  logEndOffset: number;
  events: number;
  leaderId?: string;
  replicas: string[];
  inSyncReplicas: string[];
}

export interface StreamProducer {
  id: string;
  name: string;
  streamName: string;
  partitioner: PartitioningStrategy;
  serializer: SerializationType;
  compression: 'none' | 'gzip' | 'snappy' | 'lz4';
  batchSize: number;
  lingerMs: number;
  acks: 'none' | 'leader' | 'all';
  retries: number;
  retryBackoffMs: number;
  bufferMemory: number;
  maxBlockMs: number;
  requestTimeoutMs: number;
  transactional: boolean;
  transactionalId?: string;
  metrics: ProducerMetrics;
}

export interface ProducerMetrics {
  recordsSent: number;
  bytesSent: number;
  recordsPerSecond: number;
  bytesPerSecond: number;
  averageLatency: number;
  maxLatency: number;
  errorRate: number;
  retryRate: number;
  batchSizeAvg: number;
  batchSizeMax: number;
}

export interface StreamConsumer {
  id: string;
  name: string;
  groupId: string;
  streamNames: string[];
  autoOffsetReset: 'earliest' | 'latest' | 'none';
  enableAutoCommit: boolean;
  autoCommitIntervalMs: number;
  maxPollRecords: number;
  maxPollIntervalMs: number;
  sessionTimeoutMs: number;
  heartbeatIntervalMs: number;
  fetchMinBytes: number;
  fetchMaxWaitMs: number;
  fetchMaxBytes: number;
  maxPartitionFetchBytes: number;
  checkCrcs: boolean;
  isolationLevel: 'read-uncommitted' | 'read-committed';
  processingFunction: (events: StreamEvent[]) => Promise<void>;
  status: 'running' | 'paused' | 'stopped' | 'error';
  assignment: ConsumerAssignment[];
  metrics: ConsumerMetrics;
}

export interface ConsumerAssignment {
  stream: string;
  partition: number;
  offset: number;
  lag: number;
}

export interface ConsumerMetrics {
  recordsConsumed: number;
  bytesConsumed: number;
  recordsPerSecond: number;
  bytesPerSecond: number;
  recordsLag: number;
  recordsLagMax: number;
  commitRate: number;
  joinRate: number;
  syncRate: number;
  heartbeatRate: number;
  lastPoll: Date;
  lastCommit: Date;
}

export interface ConsumerGroup {
  id: string;
  state: 'stable' | 'preparingRebalance' | 'completingRebalance' | 'dead';
  protocolType: string;
  protocol: string;
  members: ConsumerGroupMember[];
  coordinator: string;
  generationId: number;
  created: Date;
  lastModified: Date;
}

export interface ConsumerGroupMember {
  memberId: string;
  clientId: string;
  clientHost: string;
  assignment: PartitionAssignment[];
  lastHeartbeat: Date;
}

export interface PartitionAssignment {
  stream: string;
  partitions: number[];
}

export type PartitioningStrategy = 'round-robin' | 'sticky' | 'range' | 'cooperative-sticky' | 'hash' | 'custom';
export type SerializationType = 'json' | 'avro' | 'protobuf' | 'string' | 'binary';

export interface EventProjection {
  id: string;
  name: string;
  streamName: string;
  eventTypes: string[];
  projectionFunction: (event: StreamEvent) => any;
  state: any;
  lastProcessedOffset: number;
  lastProcessedTimestamp: Date;
  status: 'running' | 'paused' | 'stopped' | 'rebuilding' | 'error';
  checkpointInterval: number; // milliseconds
}

export interface Snapshot {
  id: string;
  projectionId: string;
  state: any;
  version: number;
  timestamp: Date;
  checksum: string;
}

export class EventStreaming extends EventEmitter {
  private streams = new Map<string, EventStream>();
  private events = new Map<string, Map<number, StreamEvent[]>>(); // streamName -> partition -> events
  private producers = new Map<string, StreamProducer>();
  private consumers = new Map<string, StreamConsumer>();
  private consumerGroups = new Map<string, ConsumerGroup>();
  private projections = new Map<string, EventProjection>();
  private snapshots = new Map<string, Snapshot[]>(); // projectionId -> snapshots
  private offsets = new Map<string, Map<number, number>>(); // streamName -> partition -> offset
  
  private processingInterval: NodeJS.Timeout | null = null;
  private metricsInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startProcessingLoop();
    this.startMetricsCollection();
    this.startCleanupProcess();
    this.startHeartbeatProcess();
  }

  createStream(config: Omit<EventStream, 'created' | 'lastModified' | 'metrics'>): void {
    const stream: EventStream = {
      ...config,
      created: new Date(),
      lastModified: new Date(),
      metrics: {
        totalEvents: 0,
        eventsPerSecond: 0,
        bytesPerSecond: 0,
        totalSize: 0,
        lastActivity: new Date(),
        partitionMetrics: new Map()
      }
    };

    // Initialize partitions
    const streamEvents = new Map<number, StreamEvent[]>();
    const streamOffsets = new Map<number, number>();
    
    for (let i = 0; i < stream.partitions; i++) {
      streamEvents.set(i, []);
      streamOffsets.set(i, 0);
      
      stream.metrics.partitionMetrics.set(i, {
        partition: i,
        offset: 0,
        logSize: 0,
        logStartOffset: 0,
        logEndOffset: 0,
        events: 0,
        replicas: [],
        inSyncReplicas: []
      });
    }

    this.streams.set(stream.name, stream);
    this.events.set(stream.name, streamEvents);
    this.offsets.set(stream.name, streamOffsets);

    this.emit('stream-created', stream);
  }

  deleteStream(streamName: string): boolean {
    const stream = this.streams.get(streamName);
    if (!stream) {
      return false;
    }

    // Stop all consumers and producers for this stream
    for (const consumer of this.consumers.values()) {
      if (consumer.streamNames.includes(streamName)) {
        this.stopConsumer(consumer.id);
      }
    }

    for (const producer of this.producers.values()) {
      if (producer.streamName === streamName) {
        this.stopProducer(producer.id);
      }
    }

    this.streams.delete(streamName);
    this.events.delete(streamName);
    this.offsets.delete(streamName);

    this.emit('stream-deleted', { streamName });
    return true;
  }

  createProducer(config: Omit<StreamProducer, 'metrics'>): string {
    const producer: StreamProducer = {
      ...config,
      metrics: {
        recordsSent: 0,
        bytesSent: 0,
        recordsPerSecond: 0,
        bytesPerSecond: 0,
        averageLatency: 0,
        maxLatency: 0,
        errorRate: 0,
        retryRate: 0,
        batchSizeAvg: 0,
        batchSizeMax: 0
      }
    };

    this.producers.set(producer.id, producer);
    this.emit('producer-created', producer);
    return producer.id;
  }

  createConsumer(config: Omit<StreamConsumer, 'assignment' | 'metrics'>): string {
    const consumer: StreamConsumer = {
      ...config,
      assignment: [],
      metrics: {
        recordsConsumed: 0,
        bytesConsumed: 0,
        recordsPerSecond: 0,
        bytesPerSecond: 0,
        recordsLag: 0,
        recordsLagMax: 0,
        commitRate: 0,
        joinRate: 0,
        syncRate: 0,
        heartbeatRate: 0,
        lastPoll: new Date(),
        lastCommit: new Date()
      }
    };

    this.consumers.set(consumer.id, consumer);
    
    // Create or join consumer group
    this.joinConsumerGroup(consumer);

    this.emit('consumer-created', consumer);
    return consumer.id;
  }

  async publishEvent(
    streamName: string,
    eventType: string,
    data: any,
    options: {
      partition?: number;
      partitionKey?: string;
      headers?: Record<string, string>;
      correlationId?: string;
      causationId?: string;
      aggregate?: { id: string; type: string; version: number };
      producerId?: string;
    } = {}
  ): Promise<string> {
    const stream = this.streams.get(streamName);
    if (!stream) {
      throw new Error(`Stream not found: ${streamName}`);
    }

    const producer = options.producerId ? this.producers.get(options.producerId) : null;
    
    // Determine partition
    const partition = options.partition !== undefined 
      ? options.partition 
      : this.selectPartition(streamName, options.partitionKey, producer?.partitioner || 'round-robin');

    if (partition >= stream.partitions) {
      throw new Error(`Invalid partition: ${partition}`);
    }

    // Get current offset
    const streamOffsets = this.offsets.get(streamName)!;
    const currentOffset = streamOffsets.get(partition)!;

    const event: StreamEvent = {
      id: crypto.randomUUID(),
      streamName,
      eventType,
      data: this.serializeData(data, producer?.serializer || 'json'),
      metadata: {},
      timestamp: new Date(),
      version: 1,
      correlationId: options.correlationId,
      causationId: options.causationId,
      aggregate: options.aggregate,
      partition: partition.toString(),
      headers: options.headers || {}
    };

    // Add to stream
    const streamEvents = this.events.get(streamName)!;
    const partitionEvents = streamEvents.get(partition)!;
    partitionEvents.push(event);

    // Update offset
    streamOffsets.set(partition, currentOffset + 1);

    // Update metrics
    stream.metrics.totalEvents++;
    stream.metrics.lastActivity = new Date();
    
    const partitionMetrics = stream.metrics.partitionMetrics.get(partition)!;
    partitionMetrics.events++;
    partitionMetrics.offset = currentOffset + 1;
    partitionMetrics.logEndOffset = currentOffset + 1;
    partitionMetrics.logSize += JSON.stringify(event).length;

    // Update producer metrics
    if (producer) {
      producer.metrics.recordsSent++;
      producer.metrics.bytesSent += JSON.stringify(event).length;
    }

    // Apply retention policy
    await this.applyRetentionPolicy(streamName, partition);

    this.emit('event-published', {
      streamName,
      eventId: event.id,
      partition,
      offset: currentOffset + 1
    });

    return event.id;
  }

  private selectPartition(streamName: string, partitionKey: string | undefined, strategy: PartitioningStrategy): number {
    const stream = this.streams.get(streamName)!;
    
    switch (strategy) {
      case 'round-robin':
        return Math.floor(Math.random() * stream.partitions);
      
      case 'hash':
        if (partitionKey) {
          const hash = crypto.createHash('md5').update(partitionKey).digest('hex');
          return parseInt(hash.substring(0, 8), 16) % stream.partitions;
        }
        return 0;
      
      case 'range':
        return 0; // Simplified - would use actual range partitioning
      
      default:
        return Math.floor(Math.random() * stream.partitions);
    }
  }

  private serializeData(data: any, type: SerializationType): any {
    switch (type) {
      case 'json':
        return data;
      case 'string':
        return typeof data === 'string' ? data : JSON.stringify(data);
      case 'binary':
        return Buffer.from(JSON.stringify(data));
      case 'avro':
      case 'protobuf':
        // Would integrate with actual serialization libraries
        return data;
      default:
        return data;
    }
  }

  private async applyRetentionPolicy(streamName: string, partition: number): Promise<void> {
    const stream = this.streams.get(streamName)!;
    const streamEvents = this.events.get(streamName)!;
    const partitionEvents = streamEvents.get(partition)!;

    if (stream.cleanupPolicy === 'delete') {
      // Time-based retention
      const cutoffTime = new Date(Date.now() - stream.retentionPeriod * 60 * 60 * 1000);
      const eventsToKeep = partitionEvents.filter(event => event.timestamp > cutoffTime);
      
      // Size-based retention
      let totalSize = 0;
      const sizeConstrainedEvents = [];
      
      for (let i = eventsToKeep.length - 1; i >= 0; i--) {
        const eventSize = JSON.stringify(eventsToKeep[i]).length;
        if (totalSize + eventSize <= stream.retentionSize) {
          sizeConstrainedEvents.unshift(eventsToKeep[i]);
          totalSize += eventSize;
        } else {
          break;
        }
      }
      
      streamEvents.set(partition, sizeConstrainedEvents);
      
      // Update partition metrics
      const partitionMetrics = stream.metrics.partitionMetrics.get(partition)!;
      partitionMetrics.logStartOffset = partitionMetrics.logEndOffset - sizeConstrainedEvents.length;
      partitionMetrics.logSize = totalSize;
    }
  }

  private joinConsumerGroup(consumer: StreamConsumer): void {
    let consumerGroup = this.consumerGroups.get(consumer.groupId);
    
    if (!consumerGroup) {
      consumerGroup = {
        id: consumer.groupId,
        state: 'stable',
        protocolType: 'consumer',
        protocol: 'range',
        members: [],
        coordinator: 'coordinator-1',
        generationId: 1,
        created: new Date(),
        lastModified: new Date()
      };
      
      this.consumerGroups.set(consumer.groupId, consumerGroup);
    }

    // Add member to group
    const member: ConsumerGroupMember = {
      memberId: consumer.id,
      clientId: consumer.name,
      clientHost: 'localhost',
      assignment: consumer.streamNames.map(stream => ({ stream, partitions: [] })),
      lastHeartbeat: new Date()
    };

    consumerGroup.members.push(member);
    consumerGroup.lastModified = new Date();

    // Trigger rebalance
    this.rebalanceConsumerGroup(consumer.groupId);
  }

  private rebalanceConsumerGroup(groupId: string): void {
    const consumerGroup = this.consumerGroups.get(groupId);
    if (!consumerGroup) {
      return;
    }

    consumerGroup.state = 'preparingRebalance';
    consumerGroup.generationId++;

    // Simple round-robin assignment strategy
    const streamPartitions = new Map<string, number[]>();
    
    // Collect all partitions from all streams
    for (const member of consumerGroup.members) {
      for (const assignment of member.assignment) {
        const stream = this.streams.get(assignment.stream);
        if (stream) {
          if (!streamPartitions.has(assignment.stream)) {
            streamPartitions.set(assignment.stream, Array.from({length: stream.partitions}, (_, i) => i));
          }
        }
      }
    }

    // Assign partitions to members
    let memberIndex = 0;
    for (const [streamName, partitions] of streamPartitions) {
      for (const partition of partitions) {
        const member = consumerGroup.members[memberIndex % consumerGroup.members.length];
        const streamAssignment = member.assignment.find(a => a.stream === streamName);
        
        if (streamAssignment) {
          streamAssignment.partitions.push(partition);
        }
        
        memberIndex++;
      }
    }

    // Update consumer assignments
    for (const member of consumerGroup.members) {
      const consumer = this.consumers.get(member.memberId);
      if (consumer) {
        consumer.assignment = [];
        
        for (const assignment of member.assignment) {
          for (const partition of assignment.partitions) {
            const currentOffset = this.offsets.get(assignment.stream)?.get(partition) || 0;
            
            consumer.assignment.push({
              stream: assignment.stream,
              partition,
              offset: currentOffset,
              lag: 0
            });
          }
        }
      }
    }

    consumerGroup.state = 'stable';
    this.emit('consumer-group-rebalanced', { groupId, generationId: consumerGroup.generationId });
  }

  private startProcessingLoop(): void {
    this.processingInterval = setInterval(async () => {
      await this.processConsumers();
      await this.processProjections();
    }, 100); // Process every 100ms
  }

  private async processConsumers(): Promise<void> {
    for (const consumer of this.consumers.values()) {
      if (consumer.status !== 'running') {
        continue;
      }

      try {
        await this.processConsumerMessages(consumer);
      } catch (error) {
        consumer.status = 'error';
        this.emit('consumer-error', {
          consumerId: consumer.id,
          error: (error as Error).message
        });
      }
    }
  }

  private async processConsumerMessages(consumer: StreamConsumer): Promise<void> {
    const eventsToProcess: StreamEvent[] = [];
    const maxRecords = Math.min(consumer.maxPollRecords, 100);

    // Collect events from assigned partitions
    for (const assignment of consumer.assignment) {
      const streamEvents = this.events.get(assignment.stream);
      if (!streamEvents) continue;

      const partitionEvents = streamEvents.get(assignment.partition);
      if (!partitionEvents) continue;

      // Get events starting from current offset
      const availableEvents = partitionEvents.slice(assignment.offset);
      const eventsToTake = Math.min(availableEvents.length, maxRecords - eventsToProcess.length);
      
      eventsToProcess.push(...availableEvents.slice(0, eventsToTake));

      if (eventsToProcess.length >= maxRecords) {
        break;
      }
    }

    if (eventsToProcess.length === 0) {
      return;
    }

    // Process events
    const startTime = Date.now();
    
    try {
      await consumer.processingFunction(eventsToProcess);
      
      // Update offsets and metrics
      for (const event of eventsToProcess) {
        const assignment = consumer.assignment.find(a => 
          a.stream === event.streamName && a.partition === parseInt(event.partition || '0')
        );
        
        if (assignment) {
          assignment.offset++;
        }
      }

      const processingTime = Date.now() - startTime;
      consumer.metrics.recordsConsumed += eventsToProcess.length;
      consumer.metrics.bytesConsumed += eventsToProcess.reduce((sum, e) => 
        sum + JSON.stringify(e).length, 0
      );
      consumer.metrics.lastPoll = new Date();

      // Auto-commit offsets if enabled
      if (consumer.enableAutoCommit) {
        await this.commitConsumerOffsets(consumer);
      }

    } catch (error) {
      throw error;
    }
  }

  private async commitConsumerOffsets(consumer: StreamConsumer): Promise<void> {
    consumer.metrics.lastCommit = new Date();
    consumer.metrics.commitRate++;
    
    this.emit('offsets-committed', {
      consumerId: consumer.id,
      groupId: consumer.groupId,
      assignments: consumer.assignment
    });
  }

  createProjection(config: Omit<EventProjection, 'state' | 'lastProcessedOffset' | 'lastProcessedTimestamp'>): string {
    const projection: EventProjection = {
      ...config,
      state: {},
      lastProcessedOffset: 0,
      lastProcessedTimestamp: new Date(0)
    };

    this.projections.set(projection.id, projection);
    this.snapshots.set(projection.id, []);

    this.emit('projection-created', projection);
    return projection.id;
  }

  private async processProjections(): Promise<void> {
    for (const projection of this.projections.values()) {
      if (projection.status !== 'running') {
        continue;
      }

      try {
        await this.processProjection(projection);
      } catch (error) {
        projection.status = 'error';
        this.emit('projection-error', {
          projectionId: projection.id,
          error: (error as Error).message
        });
      }
    }
  }

  private async processProjection(projection: EventProjection): Promise<void> {
    const streamEvents = this.events.get(projection.streamName);
    if (!streamEvents) return;

    let eventsProcessed = 0;
    
    // Process events from all partitions
    for (const [partition, events] of streamEvents) {
      const eventsToProcess = events.filter(event => 
        event.timestamp > projection.lastProcessedTimestamp &&
        (projection.eventTypes.length === 0 || projection.eventTypes.includes(event.eventType))
      );

      for (const event of eventsToProcess) {
        const projectedData = projection.projectionFunction(event);
        
        // Update projection state
        projection.state = { ...projection.state, ...projectedData };
        projection.lastProcessedOffset++;
        projection.lastProcessedTimestamp = event.timestamp;
        
        eventsProcessed++;
      }
    }

    // Create snapshot if checkpoint interval reached
    if (eventsProcessed > 0 && Date.now() - projection.lastProcessedTimestamp.getTime() > projection.checkpointInterval) {
      await this.createSnapshot(projection);
    }
  }

  private async createSnapshot(projection: EventProjection): Promise<void> {
    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      projectionId: projection.id,
      state: JSON.parse(JSON.stringify(projection.state)), // Deep clone
      version: projection.lastProcessedOffset,
      timestamp: new Date(),
      checksum: crypto.createHash('md5').update(JSON.stringify(projection.state)).digest('hex')
    };

    const projectionSnapshots = this.snapshots.get(projection.id)!;
    projectionSnapshots.push(snapshot);

    // Keep only recent snapshots (last 10)
    if (projectionSnapshots.length > 10) {
      projectionSnapshots.splice(0, projectionSnapshots.length - 10);
    }

    this.emit('snapshot-created', {
      projectionId: projection.id,
      snapshotId: snapshot.id,
      version: snapshot.version
    });
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 60000); // Every minute
  }

  private updateMetrics(): void {
    // Update stream metrics
    for (const stream of this.streams.values()) {
      stream.metrics.eventsPerSecond = stream.metrics.totalEvents / 60;
      
      let totalSize = 0;
      const streamEvents = this.events.get(stream.name)!;
      
      for (const events of streamEvents.values()) {
        totalSize += events.reduce((sum, event) => sum + JSON.stringify(event).length, 0);
      }
      
      stream.metrics.totalSize = totalSize;
      stream.metrics.bytesPerSecond = totalSize / 60;
    }

    // Update producer metrics
    for (const producer of this.producers.values()) {
      producer.metrics.recordsPerSecond = producer.metrics.recordsSent / 60;
      producer.metrics.bytesPerSecond = producer.metrics.bytesSent / 60;
      
      // Reset counters for next period
      producer.metrics.recordsSent = 0;
      producer.metrics.bytesSent = 0;
    }

    // Update consumer metrics
    for (const consumer of this.consumers.values()) {
      consumer.metrics.recordsPerSecond = consumer.metrics.recordsConsumed / 60;
      consumer.metrics.bytesPerSecond = consumer.metrics.bytesConsumed / 60;
      
      // Calculate lag
      consumer.metrics.recordsLag = 0;
      for (const assignment of consumer.assignment) {
        const currentOffset = this.offsets.get(assignment.stream)?.get(assignment.partition) || 0;
        const lag = currentOffset - assignment.offset;
        assignment.lag = lag;
        consumer.metrics.recordsLag += lag;
        consumer.metrics.recordsLagMax = Math.max(consumer.metrics.recordsLagMax, lag);
      }
      
      // Reset counters for next period
      consumer.metrics.recordsConsumed = 0;
      consumer.metrics.bytesConsumed = 0;
    }

    this.emit('metrics-updated');
  }

  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEvents();
      this.cleanupStaleConsumers();
    }, 300000); // Every 5 minutes
  }

  private cleanupExpiredEvents(): void {
    for (const [streamName, stream] of this.streams) {
      if (stream.cleanupPolicy === 'delete') {
        for (let partition = 0; partition < stream.partitions; partition++) {
          this.applyRetentionPolicy(streamName, partition);
        }
      }
    }
  }

  private cleanupStaleConsumers(): void {
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    const now = Date.now();

    for (const [groupId, group] of this.consumerGroups) {
      const staleMembers = group.members.filter(member => 
        now - member.lastHeartbeat.getTime() > staleThreshold
      );

      if (staleMembers.length > 0) {
        // Remove stale members
        group.members = group.members.filter(member => 
          now - member.lastHeartbeat.getTime() <= staleThreshold
        );

        // Trigger rebalance if members were removed
        if (group.members.length > 0) {
          this.rebalanceConsumerGroup(groupId);
        } else {
          // Remove empty group
          this.consumerGroups.delete(groupId);
        }
      }
    }
  }

  private startHeartbeatProcess(): void {
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeats();
    }, 3000); // Every 3 seconds
  }

  private sendHeartbeats(): void {
    for (const [groupId, group] of this.consumerGroups) {
      for (const member of group.members) {
        const consumer = this.consumers.get(member.memberId);
        if (consumer && consumer.status === 'running') {
          member.lastHeartbeat = new Date();
          consumer.metrics.heartbeatRate++;
        }
      }
    }
  }

  // Public API methods
  stopProducer(producerId: string): boolean {
    const producer = this.producers.get(producerId);
    if (producer) {
      this.producers.delete(producerId);
      this.emit('producer-stopped', { producerId });
      return true;
    }
    return false;
  }

  stopConsumer(consumerId: string): boolean {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      return false;
    }

    consumer.status = 'stopped';
    
    // Remove from consumer group
    for (const group of this.consumerGroups.values()) {
      group.members = group.members.filter(m => m.memberId !== consumerId);
      if (group.members.length === 0) {
        this.consumerGroups.delete(group.id);
      } else {
        this.rebalanceConsumerGroup(group.id);
      }
    }

    this.emit('consumer-stopped', { consumerId });
    return true;
  }

  getStreams(): EventStream[] {
    return Array.from(this.streams.values());
  }

  getStream(streamName: string): EventStream | null {
    return this.streams.get(streamName) || null;
  }

  getStreamEvents(streamName: string, partition?: number, fromOffset?: number, limit: number = 100): StreamEvent[] {
    const streamEvents = this.events.get(streamName);
    if (!streamEvents) {
      return [];
    }

    if (partition !== undefined) {
      const partitionEvents = streamEvents.get(partition) || [];
      const startIndex = fromOffset || 0;
      return partitionEvents.slice(startIndex, startIndex + limit);
    }

    // Return events from all partitions
    const allEvents: StreamEvent[] = [];
    for (const events of streamEvents.values()) {
      allEvents.push(...events);
    }

    return allEvents
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(0, limit);
  }

  getConsumerGroups(): ConsumerGroup[] {
    return Array.from(this.consumerGroups.values());
  }

  getProjections(): EventProjection[] {
    return Array.from(this.projections.values());
  }

  getProjectionSnapshots(projectionId: string): Snapshot[] {
    return this.snapshots.get(projectionId) || [];
  }

  getStats(): any {
    const streams = Array.from(this.streams.values());
    const producers = Array.from(this.producers.values());
    const consumers = Array.from(this.consumers.values());

    return {
      streams: {
        total: streams.length,
        totalEvents: streams.reduce((sum, s) => sum + s.metrics.totalEvents, 0),
        totalSize: streams.reduce((sum, s) => sum + s.metrics.totalSize, 0),
        totalPartitions: streams.reduce((sum, s) => sum + s.partitions, 0)
      },
      producers: {
        total: producers.length,
        totalRecordsSent: producers.reduce((sum, p) => sum + p.metrics.recordsSent, 0),
        totalBytesSent: producers.reduce((sum, p) => sum + p.metrics.bytesSent, 0)
      },
      consumers: {
        total: consumers.length,
        running: consumers.filter(c => c.status === 'running').length,
        totalRecordsConsumed: consumers.reduce((sum, c) => sum + c.metrics.recordsConsumed, 0),
        totalLag: consumers.reduce((sum, c) => sum + c.metrics.recordsLag, 0)
      },
      consumerGroups: this.consumerGroups.size,
      projections: {
        total: this.projections.size,
        running: Array.from(this.projections.values()).filter(p => p.status === 'running').length
      },
      snapshots: Array.from(this.snapshots.values()).reduce((sum, snaps) => sum + snaps.length, 0)
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
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.streams.clear();
    this.events.clear();
    this.producers.clear();
    this.consumers.clear();
    this.consumerGroups.clear();
    this.projections.clear();
    this.snapshots.clear();
    this.offsets.clear();

    this.removeAllListeners();
  }
}