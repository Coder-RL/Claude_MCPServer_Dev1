import { createClient, RedisClientType, RedisDefaultModules, RedisFunctions, RedisModules, RedisScripts } from 'redis';
import { logger } from '@shared/logging';

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  database?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  commandTimeout?: number;
}

export type RedisClient = RedisClientType<RedisDefaultModules & RedisModules, RedisFunctions, RedisScripts>;

class RedisConnectionManager {
  private client: RedisClient | null = null;
  private isConnected = false;
  private connectionMetrics = {
    connectionAttempts: 0,
    successfulConnections: 0,
    failedConnections: 0,
    reconnections: 0,
    lastConnectionTime: null as Date | null,
    commands: {
      executed: 0,
      failed: 0,
      totalLatency: 0,
    },
  };

  constructor(private config: RedisConfig) {
    this.initializeClient();
  }

  private initializeClient(): void {
    const clientConfig = {
      url: this.config.url || `redis://${this.config.host || 'localhost'}:${this.config.port || 6379}`,
      password: this.config.password,
      database: this.config.database || 0,
      socket: {
        connectTimeout: this.config.connectTimeout || 5000,
        commandTimeout: this.config.commandTimeout || 5000,
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            logger.error('Redis maximum reconnection attempts reached');
            return false;
          }
          const delay = Math.min(retries * 100, 3000);
          logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        },
      },
    };

    this.client = createClient(clientConfig);

    // Connection event handlers
    this.client.on('connect', () => {
      this.connectionMetrics.connectionAttempts++;
      logger.info('Redis connecting...');
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      this.connectionMetrics.successfulConnections++;
      this.connectionMetrics.lastConnectionTime = new Date();
      logger.info('Redis connection ready', {
        attempts: this.connectionMetrics.connectionAttempts,
        successful: this.connectionMetrics.successfulConnections,
      });
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      this.connectionMetrics.failedConnections++;
      logger.error('Redis connection error', {
        error: error.message,
        attempts: this.connectionMetrics.connectionAttempts,
        failed: this.connectionMetrics.failedConnections,
      });
    });

    this.client.on('reconnecting', () => {
      this.connectionMetrics.reconnections++;
      logger.info('Redis reconnecting...', {
        reconnections: this.connectionMetrics.reconnections,
      });
    });

    this.client.on('end', () => {
      this.isConnected = false;
      logger.info('Redis connection ended');
    });
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    try {
      await this.client.connect();
      logger.info('Redis client connected successfully');
    } catch (error) {
      logger.error('Failed to connect to Redis', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Test the Redis connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.client || !this.isConnected) {
        return false;
      }

      const start = Date.now();
      const result = await this.client.ping();
      const latency = Date.now() - start;

      logger.debug('Redis ping successful', { result, latency });
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis ping failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Execute Redis command with metrics tracking
   */
  private async executeCommand<T>(operation: string, command: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await command();
      const duration = Date.now() - start;

      this.connectionMetrics.commands.executed++;
      this.connectionMetrics.commands.totalLatency += duration;

      logger.debug(`Redis ${operation} executed`, {
        duration,
        avgLatency: this.connectionMetrics.commands.totalLatency / this.connectionMetrics.commands.executed,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.connectionMetrics.commands.failed++;

      logger.error(`Redis ${operation} failed`, {
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Set a key-value pair with optional expiration
   */
  async set(key: string, value: string, expireInSeconds?: number): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    return this.executeCommand('SET', async () => {
      if (expireInSeconds) {
        return await this.client!.setEx(key, expireInSeconds, value);
      }
      return await this.client!.set(key, value);
    });
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    return this.executeCommand('GET', () => this.client!.get(key));
  }

  /**
   * Set JSON object with optional expiration
   */
  async setJSON(key: string, object: any, expireInSeconds?: number): Promise<string | null> {
    const serialized = JSON.stringify(object);
    return this.set(key, serialized, expireInSeconds);
  }

  /**
   * Get and parse JSON object
   */
  async getJSON<T = any>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Failed to parse JSON from Redis', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Delete one or more keys
   */
  async del(keys: string | string[]): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    const keyArray = Array.isArray(keys) ? keys : [keys];
    return this.executeCommand('DEL', () => this.client!.del(keyArray));
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    const result = await this.executeCommand('EXISTS', () => this.client!.exists(key));
    return result === 1;
  }

  /**
   * Set expiration for a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    const result = await this.executeCommand('EXPIRE', () => this.client!.expire(key, seconds));
    return result;
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    return this.executeCommand('TTL', () => this.client!.ttl(key));
  }

  /**
   * Get all keys matching a pattern
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    return this.executeCommand('KEYS', () => this.client!.keys(pattern));
  }

  /**
   * Publish a message to a channel
   */
  async publish(channel: string, message: string): Promise<number> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    return this.executeCommand('PUBLISH', () => this.client!.publish(channel, message));
  }

  /**
   * Subscribe to channels
   */
  async subscribe(channels: string[], onMessage: (channel: string, message: string) => void): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not connected');
    }

    const subscriber = this.client.duplicate();
    await subscriber.connect();

    await subscriber.subscribe(channels, (message, channel) => {
      logger.debug('Redis message received', { channel, messageLength: message.length });
      onMessage(channel, message);
    });

    logger.info('Redis subscribed to channels', { channels });
  }

  /**
   * Get connection metrics
   */
  getMetrics(): typeof this.connectionMetrics & { isConnected: boolean } {
    return {
      ...this.connectionMetrics,
      isConnected: this.isConnected,
      commands: { ...this.connectionMetrics.commands },
    };
  }

  /**
   * Health check for Redis connection
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    metrics: ReturnType<typeof this.getMetrics>;
    latency?: number;
  }> {
    const start = Date.now();
    try {
      const isConnected = await this.testConnection();
      const latency = Date.now() - start;

      return {
        status: isConnected ? 'healthy' : 'unhealthy',
        metrics: this.getMetrics(),
        latency,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: this.getMetrics(),
      };
    }
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('Redis client disconnected');
    }
  }
}

// Create and export the Redis instance
const redisConfig: RedisConfig = {
  url: process.env.REDIS_URL,
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  database: parseInt(process.env.REDIS_DATABASE || '0'),
  connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '5000'),
  commandTimeout: parseInt(process.env.REDIS_COMMAND_TIMEOUT || '5000'),
};

export const redis = new RedisConnectionManager(redisConfig);

// Graceful shutdown handler
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing Redis connection...');
  await redis.close();
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing Redis connection...');
  await redis.close();
});

export { RedisConnectionManager };