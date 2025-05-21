import { getLogger } from '../../../shared/logger.js';
import { DatabasePool } from '../../../database/pg-pool.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';

const logger = getLogger('VectorDatabase');

export interface Embedding {
  id: string;
  text: string;
  embedding: number[];
  domain: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmbeddingQuery {
  embedding: number[];
  domain?: string;
  limit?: number;
  threshold?: number;
  metadata?: Record<string, any>;
}

export interface SimilarityResult {
  embedding: Embedding;
  similarity: number;
  distance: number;
}

export interface EmbeddingStats {
  totalEmbeddings: number;
  embeddingsByDomain: Record<string, number>;
  averageEmbeddingLength: number;
  oldestEmbedding: Date | null;
  newestEmbedding: Date | null;
}

export class VectorDatabase {
  private db: DatabasePool;
  private initialized = false;

  constructor(db: DatabasePool) {
    this.db = db;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Ensure pgvector extension is available
      await this.ensurePgvectorExtension();
      
      // Verify schema and tables exist
      await this.verifySchema();
      
      this.initialized = true;
      logger.info('Vector database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize vector database', { error });
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Vector database initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.CRITICAL,
        retryable: false,
        context: { operation: 'initialize' },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  private async ensurePgvectorExtension(): Promise<void> {
    try {
      await this.db.query('CREATE EXTENSION IF NOT EXISTS vector;');
      logger.debug('pgvector extension verified');
    } catch (error) {
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: 'pgvector extension is not available. Please install pgvector extension.',
        severity: ErrorSeverity.CRITICAL,
        retryable: false,
        context: { operation: 'ensurePgvectorExtension' },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  private async verifySchema(): Promise<void> {
    try {
      const result = await this.db.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'inference_enhancement' 
        AND table_name = 'embeddings'
      `);

      if (result.rows.length === 0) {
        throw new Error('inference_enhancement.embeddings table not found');
      }

      logger.debug('Vector database schema verified');
    } catch (error) {
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Schema verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        context: { operation: 'verifySchema' },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async storeEmbedding(
    id: string,
    text: string,
    embedding: number[],
    domain: string,
    metadata: Record<string, any> = {}
  ): Promise<Embedding> {
    this.ensureInitialized();

    try {
      const vectorString = `[${embedding.join(',')}]`;
      
      const result = await this.db.query(`
        INSERT INTO inference_enhancement.embeddings 
        (id, text, embedding, domain, metadata, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (id) 
        DO UPDATE SET 
          text = EXCLUDED.text,
          embedding = EXCLUDED.embedding,
          domain = EXCLUDED.domain,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id, text, embedding, domain, metadata, created_at, updated_at
      `, [id, text, vectorString, domain, JSON.stringify(metadata)]);

      const row = result.rows[0];
      const storedEmbedding: Embedding = {
        id: row.id,
        text: row.text,
        embedding: this.parseVectorFromDb(row.embedding),
        domain: row.domain,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };

      logger.debug('Stored embedding', {
        id,
        domain,
        textLength: text.length,
        embeddingDimensions: embedding.length,
      });

      return storedEmbedding;
    } catch (error) {
      logger.error('Failed to store embedding', { error, id, domain });
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Failed to store embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        context: { operation: 'storeEmbedding', id, domain },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async getEmbedding(id: string): Promise<Embedding | null> {
    this.ensureInitialized();

    try {
      const result = await this.db.query(`
        SELECT id, text, embedding, domain, metadata, created_at, updated_at
        FROM inference_enhancement.embeddings
        WHERE id = $1
      `, [id]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        text: row.text,
        embedding: this.parseVectorFromDb(row.embedding),
        domain: row.domain,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    } catch (error) {
      logger.error('Failed to get embedding', { error, id });
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Failed to retrieve embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: { operation: 'getEmbedding', id },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async findSimilarEmbeddings(query: EmbeddingQuery): Promise<SimilarityResult[]> {
    this.ensureInitialized();

    try {
      const { embedding, domain, limit = 10, threshold = 0.7, metadata } = query;
      const vectorString = `[${embedding.join(',')}]`;
      
      let whereConditions = ['1 = 1'];
      const params: any[] = [vectorString, limit];
      let paramIndex = 3;

      if (domain) {
        whereConditions.push(`domain = $${paramIndex}`);
        params.push(domain);
        paramIndex++;
      }

      if (metadata && Object.keys(metadata).length > 0) {
        for (const [key, value] of Object.entries(metadata)) {
          whereConditions.push(`metadata->>'${key}' = $${paramIndex}`);
          params.push(value);
          paramIndex++;
        }
      }

      const sql = `
        SELECT 
          id, text, embedding, domain, metadata, created_at, updated_at,
          1 - (embedding <=> $1::vector) AS similarity,
          embedding <=> $1::vector AS distance
        FROM inference_enhancement.embeddings
        WHERE ${whereConditions.join(' AND ')}
          AND 1 - (embedding <=> $1::vector) >= $${paramIndex}
        ORDER BY embedding <=> $1::vector
        LIMIT $2
      `;
      
      params.push(threshold);

      const result = await this.db.query(sql, params);

      const similarityResults: SimilarityResult[] = result.rows.map(row => ({
        embedding: {
          id: row.id,
          text: row.text,
          embedding: this.parseVectorFromDb(row.embedding),
          domain: row.domain,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
        similarity: parseFloat(row.similarity),
        distance: parseFloat(row.distance),
      }));

      logger.debug('Similarity search completed', {
        domain,
        limit,
        threshold,
        resultsCount: similarityResults.length,
        topSimilarity: similarityResults[0]?.similarity,
      });

      return similarityResults;
    } catch (error) {
      logger.error('Failed to perform similarity search', { error, query });
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Similarity search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: { operation: 'findSimilarEmbeddings', query },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async listEmbeddings(
    domain?: string,
    limit = 100,
    offset = 0,
    orderBy: 'created_at' | 'updated_at' = 'created_at',
    orderDirection: 'ASC' | 'DESC' = 'DESC'
  ): Promise<{ embeddings: Embedding[]; totalCount: number }> {
    this.ensureInitialized();

    try {
      let whereClause = '1 = 1';
      const params: any[] = [limit, offset];
      let paramIndex = 3;

      if (domain) {
        whereClause = `domain = $${paramIndex}`;
        params.push(domain);
        paramIndex++;
      }

      // Get total count
      const countResult = await this.db.query(`
        SELECT COUNT(*) as total
        FROM inference_enhancement.embeddings
        WHERE ${whereClause}
      `, domain ? [domain] : []);
      
      const totalCount = parseInt(countResult.rows[0].total);

      // Get embeddings
      const result = await this.db.query(`
        SELECT id, text, embedding, domain, metadata, created_at, updated_at
        FROM inference_enhancement.embeddings
        WHERE ${whereClause}
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT $1 OFFSET $2
      `, params);

      const embeddings: Embedding[] = result.rows.map(row => ({
        id: row.id,
        text: row.text,
        embedding: this.parseVectorFromDb(row.embedding),
        domain: row.domain,
        metadata: row.metadata,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      logger.debug('Listed embeddings', {
        domain,
        limit,
        offset,
        totalCount,
        returnedCount: embeddings.length,
      });

      return { embeddings, totalCount };
    } catch (error) {
      logger.error('Failed to list embeddings', { error, domain, limit, offset });
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Failed to list embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: { operation: 'listEmbeddings', domain, limit, offset },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async deleteEmbedding(id: string): Promise<boolean> {
    this.ensureInitialized();

    try {
      const result = await this.db.query(`
        DELETE FROM inference_enhancement.embeddings
        WHERE id = $1
      `, [id]);

      const deleted = result.rowCount > 0;
      
      if (deleted) {
        logger.debug('Deleted embedding', { id });
      } else {
        logger.warn('Attempted to delete non-existent embedding', { id });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to delete embedding', { error, id });
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Failed to delete embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: { operation: 'deleteEmbedding', id },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async bulkStoreEmbeddings(embeddings: Array<{
    id: string;
    text: string;
    embedding: number[];
    domain: string;
    metadata?: Record<string, any>;
  }>): Promise<number> {
    this.ensureInitialized();

    if (embeddings.length === 0) {
      return 0;
    }

    try {
      let storedCount = 0;
      const batchSize = 100;

      for (let i = 0; i < embeddings.length; i += batchSize) {
        const batch = embeddings.slice(i, i + batchSize);
        
        await this.db.transaction(async (client) => {
          for (const emb of batch) {
            const vectorString = `[${emb.embedding.join(',')}]`;
            await client.query(`
              INSERT INTO inference_enhancement.embeddings 
              (id, text, embedding, domain, metadata, created_at, updated_at)
              VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
              ON CONFLICT (id) 
              DO UPDATE SET 
                text = EXCLUDED.text,
                embedding = EXCLUDED.embedding,
                domain = EXCLUDED.domain,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
            `, [
              emb.id,
              emb.text,
              vectorString,
              emb.domain,
              JSON.stringify(emb.metadata || {}),
            ]);
            storedCount++;
          }
        });

        logger.debug(`Stored batch ${Math.floor(i / batchSize) + 1}`, {
          batchSize: batch.length,
          totalProcessed: Math.min(i + batchSize, embeddings.length),
          totalEmbeddings: embeddings.length,
        });
      }

      logger.info('Bulk storage completed', {
        totalEmbeddings: embeddings.length,
        storedCount,
        batchSize,
      });

      return storedCount;
    } catch (error) {
      logger.error('Failed to bulk store embeddings', { error, embeddingsCount: embeddings.length });
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Bulk storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        context: { operation: 'bulkStoreEmbeddings', embeddingsCount: embeddings.length },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async getStats(): Promise<EmbeddingStats> {
    this.ensureInitialized();

    try {
      const statsResult = await this.db.query(`
        SELECT 
          COUNT(*) as total_embeddings,
          MIN(created_at) as oldest_embedding,
          MAX(created_at) as newest_embedding
        FROM inference_enhancement.embeddings
      `);

      const domainStatsResult = await this.db.query(`
        SELECT domain, COUNT(*) as count
        FROM inference_enhancement.embeddings
        GROUP BY domain
        ORDER BY count DESC
      `);

      const dimensionsResult = await this.db.query(`
        SELECT vector_dims(embedding) as dimensions
        FROM inference_enhancement.embeddings
        LIMIT 1
      `);

      const stats = statsResult.rows[0];
      const embeddingsByDomain: Record<string, number> = {};
      
      for (const row of domainStatsResult.rows) {
        embeddingsByDomain[row.domain] = parseInt(row.count);
      }

      const averageEmbeddingLength = dimensionsResult.rows.length > 0 ? 
        parseInt(dimensionsResult.rows[0].dimensions) : 0;

      return {
        totalEmbeddings: parseInt(stats.total_embeddings),
        embeddingsByDomain,
        averageEmbeddingLength,
        oldestEmbedding: stats.oldest_embedding,
        newestEmbedding: stats.newest_embedding,
      };
    } catch (error) {
      logger.error('Failed to get vector database stats', { error });
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Failed to get database stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: { operation: 'getStats' },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async clearDomain(domain: string): Promise<number> {
    this.ensureInitialized();

    try {
      const result = await this.db.query(`
        DELETE FROM inference_enhancement.embeddings
        WHERE domain = $1
      `, [domain]);

      const deletedCount = result.rowCount;
      logger.info('Cleared domain embeddings', { domain, deletedCount });
      
      return deletedCount;
    } catch (error) {
      logger.error('Failed to clear domain', { error, domain });
      throw new MCPError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Failed to clear domain: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: { operation: 'clearDomain', domain },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      if (!this.initialized) {
        return {
          healthy: false,
          details: { error: 'Vector database not initialized' },
        };
      }

      // Test basic connectivity
      await this.db.query('SELECT 1');
      
      // Test vector operations
      await this.db.query('SELECT vector_dims(\'[1,2,3]\'::vector)');
      
      // Get basic stats
      const stats = await this.getStats();

      return {
        healthy: true,
        details: {
          initialized: this.initialized,
          stats,
          extensions: ['pgvector'],
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          initialized: this.initialized,
        },
      };
    }
  }

  private parseVectorFromDb(dbVector: any): number[] {
    if (typeof dbVector === 'string') {
      // Parse string representation like "[1,2,3]"
      const cleaned = dbVector.replace(/[\[\]]/g, '');
      return cleaned.split(',').map(Number);
    } else if (Array.isArray(dbVector)) {
      return dbVector.map(Number);
    } else {
      throw new Error(`Invalid vector format: ${typeof dbVector}`);
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Vector database not initialized',
        severity: ErrorSeverity.HIGH,
        retryable: false,
        context: { operation: 'ensureInitialized' },
      });
    }
  }
}