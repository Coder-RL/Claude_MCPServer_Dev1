import { Pool, PoolClient, PoolConfig } from 'pg';
import { logger } from '@shared/logging';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
  fields: any[];
}

export interface TransactionCallback<T> {
  (client: PoolClient): Promise<T>;
}

class DatabasePool {
  private pool: Pool | null = null;
  private isConnected = false;
  private connectionMetrics = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    waitingClients: 0,
    failedConnections: 0,
  };

  constructor(private config: DatabaseConfig) {
    this.initializePool();
  }

  private initializePool(): void {
    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      max: this.config.maxConnections || 20,
      idleTimeoutMillis: this.config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: this.config.connectionTimeoutMillis || 5000,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
    };

    this.pool = new Pool(poolConfig);

    // Connection event handlers
    this.pool.on('connect', (client) => {
      this.connectionMetrics.totalConnections++;
      this.connectionMetrics.activeConnections++;
      logger.debug('PostgreSQL client connected', {
        totalConnections: this.connectionMetrics.totalConnections,
        activeConnections: this.connectionMetrics.activeConnections,
      });
    });

    this.pool.on('acquire', (client) => {
      this.connectionMetrics.activeConnections++;
      this.connectionMetrics.idleConnections--;
      logger.debug('PostgreSQL client acquired from pool');
    });

    this.pool.on('release', (client) => {
      this.connectionMetrics.activeConnections--;
      this.connectionMetrics.idleConnections++;
      logger.debug('PostgreSQL client released to pool');
    });

    this.pool.on('error', (err, client) => {
      this.connectionMetrics.failedConnections++;
      logger.error('PostgreSQL pool error', { error: err.message, stack: err.stack });
    });

    this.pool.on('remove', (client) => {
      this.connectionMetrics.totalConnections--;
      logger.debug('PostgreSQL client removed from pool');
    });
  }

  /**
   * Test the database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.pool) {
        throw new Error('Database pool not initialized');
      }

      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as current_time, version() as version');
      client.release();

      this.isConnected = true;
      logger.info('Database connection test successful', {
        currentTime: result.rows[0].current_time,
        version: result.rows[0].version,
      });

      return true;
    } catch (error) {
      this.isConnected = false;
      logger.error('Database connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Execute a SQL query with parameters
   */
  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const start = Date.now();
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;

      logger.debug('Database query executed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration,
        rowCount: result.rowCount,
      });

      return {
        rows: result.rows,
        rowCount: result.rowCount || 0,
        command: result.command,
        fields: result.fields,
      };
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('Database query failed', {
        query: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        params: params ? params.length : 0,
      });
      throw error;
    }
  }

  /**
   * Execute multiple queries within a transaction
   */
  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      logger.debug('Database transaction started');

      const result = await callback(client);

      await client.query('COMMIT');
      logger.debug('Database transaction committed');

      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Database transaction rolled back', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get connection pool metrics
   */
  getMetrics(): typeof this.connectionMetrics & { isConnected: boolean } {
    return {
      ...this.connectionMetrics,
      isConnected: this.isConnected,
      waitingClients: this.pool?.waitingCount || 0,
      idleConnections: this.pool?.idleCount || 0,
      activeConnections: this.pool?.totalCount || 0 - (this.pool?.idleCount || 0),
    };
  }

  /**
   * Health check for the database connection
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
   * Close the database pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      logger.info('Database pool closed');
    }
  }
}

// Create and export the database instance
const dbConfig: DatabaseConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mcp_enhanced',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_SSL === 'true',
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '5000'),
};

export const db = new DatabasePool(dbConfig);

// Graceful shutdown handler
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing database pool...');
  await db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing database pool...');
  await db.close();
  process.exit(0);
});

export { DatabasePool };