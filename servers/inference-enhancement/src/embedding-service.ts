import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { VectorDatabase, Embedding, SimilarityResult } from './vector-database.js';

const logger = getLogger('EmbeddingService');

export interface EmbeddingRequest {
  text: string;
  domain: string;
  metadata?: Record<string, any>;
  id?: string;
}

export interface KnowledgeChunk {
  id: string;
  content: string;
  summary: string;
  keywords: string[];
  domain: string;
  confidence: number;
  sources: string[];
  metadata: Record<string, any>;
}

export interface EmbeddingConfig {
  modelName: string;
  dimensions: number;
  maxTokens: number;
  chunkSize: number;
  chunkOverlap: number;
  batchSize: number;
}

export interface EmbeddingProvider {
  name: string;
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
  getConfig(): EmbeddingConfig;
  healthCheck(): Promise<boolean>;
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  name = 'mock-provider';
  private config: EmbeddingConfig = {
    modelName: 'mock-embedding-model',
    dimensions: 1536,
    maxTokens: 8192,
    chunkSize: 1000,
    chunkOverlap: 200,
    batchSize: 100,
  };

  async generateEmbedding(text: string): Promise<number[]> {
    // Generate deterministic mock embedding based on text content
    const hash = this.simpleHash(text);
    const embedding = new Array(this.config.dimensions).fill(0).map((_, i) => {
      return Math.sin((hash + i) * 0.1) * 0.5 + 0.5;
    });
    
    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    for (const text of texts) {
      embeddings.push(await this.generateEmbedding(text));
    }
    return embeddings;
  }

  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

export class EmbeddingService {
  private vectorDb: VectorDatabase;
  private provider: EmbeddingProvider;
  private config: EmbeddingConfig;

  constructor(vectorDb: VectorDatabase, provider: EmbeddingProvider) {
    this.vectorDb = vectorDb;
    this.provider = provider;
    this.config = provider.getConfig();
  }

  async createEmbedding(request: EmbeddingRequest): Promise<Embedding> {
    try {
      const { text, domain, metadata = {}, id } = request;
      
      if (!text || text.trim().length === 0) {
        throw new MCPError({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Text content is required for embedding generation',
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'createEmbedding', domain },
        });
      }

      if (text.length > this.config.maxTokens * 4) { // Rough token estimation
        throw new MCPError({
          code: ErrorCode.VALIDATION_ERROR,
          message: `Text too long. Maximum length is approximately ${this.config.maxTokens * 4} characters`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'createEmbedding', textLength: text.length, maxLength: this.config.maxTokens * 4 },
        });
      }

      const processedText = this.preprocessText(text);
      const embedding = await this.provider.generateEmbedding(processedText);
      
      const embeddingId = id || this.generateEmbeddingId(text, domain);
      const enhancedMetadata = {
        ...metadata,
        textLength: text.length,
        processedLength: processedText.length,
        provider: this.provider.name,
        model: this.config.modelName,
        dimensions: embedding.length,
        createdBy: 'embedding-service',
      };

      const storedEmbedding = await this.vectorDb.storeEmbedding(
        embeddingId,
        text,
        embedding,
        domain,
        enhancedMetadata
      );

      logger.info('Created embedding', {
        id: embeddingId,
        domain,
        textLength: text.length,
        dimensions: embedding.length,
      });

      return storedEmbedding;
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      
      logger.error('Failed to create embedding', { error, request });
      throw new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: `Embedding creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        context: { operation: 'createEmbedding', domain: request.domain },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async createBatchEmbeddings(requests: EmbeddingRequest[]): Promise<Embedding[]> {
    if (requests.length === 0) {
      return [];
    }

    try {
      const processed: Array<{
        request: EmbeddingRequest;
        processedText: string;
        embeddingId: string;
      }> = [];

      // Preprocess all texts and generate IDs
      for (const request of requests) {
        const { text, domain, id } = request;
        
        if (!text || text.trim().length === 0) {
          logger.warn('Skipping empty text in batch', { domain });
          continue;
        }

        const processedText = this.preprocessText(text);
        const embeddingId = id || this.generateEmbeddingId(text, domain);
        
        processed.push({
          request,
          processedText,
          embeddingId,
        });
      }

      if (processed.length === 0) {
        throw new MCPError({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'No valid texts found in batch request',
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'createBatchEmbeddings', originalCount: requests.length },
        });
      }

      // Generate embeddings in batches
      const embeddings: number[][] = [];
      const batchSize = Math.min(this.config.batchSize, processed.length);
      
      for (let i = 0; i < processed.length; i += batchSize) {
        const batch = processed.slice(i, i + batchSize);
        const texts = batch.map(item => item.processedText);
        
        logger.debug(`Processing embedding batch ${Math.floor(i / batchSize) + 1}`, {
          batchSize: texts.length,
          totalBatches: Math.ceil(processed.length / batchSize),
        });

        const batchEmbeddings = await this.provider.generateBatchEmbeddings(texts);
        embeddings.push(...batchEmbeddings);
      }

      // Store all embeddings in database
      const embeddingData = processed.map((item, index) => ({
        id: item.embeddingId,
        text: item.request.text,
        embedding: embeddings[index],
        domain: item.request.domain,
        metadata: {
          ...item.request.metadata,
          textLength: item.request.text.length,
          processedLength: item.processedText.length,
          provider: this.provider.name,
          model: this.config.modelName,
          dimensions: embeddings[index].length,
          createdBy: 'embedding-service',
          batchProcessed: true,
        },
      }));

      const storedCount = await this.vectorDb.bulkStoreEmbeddings(embeddingData);
      
      logger.info('Created batch embeddings', {
        requestCount: requests.length,
        processedCount: processed.length,
        storedCount,
        batchSize: this.config.batchSize,
      });

      // Return stored embeddings
      const results: Embedding[] = [];
      for (const item of embeddingData) {
        const stored = await this.vectorDb.getEmbedding(item.id);
        if (stored) {
          results.push(stored);
        }
      }

      return results;
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      
      logger.error('Failed to create batch embeddings', { error, requestCount: requests.length });
      throw new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: `Batch embedding creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        context: { operation: 'createBatchEmbeddings', requestCount: requests.length },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async searchKnowledge(
    query: string,
    domain?: string,
    limit = 10,
    threshold = 0.7
  ): Promise<KnowledgeChunk[]> {
    try {
      if (!query || query.trim().length === 0) {
        throw new MCPError({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Search query is required',
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'searchKnowledge' },
        });
      }

      const processedQuery = this.preprocessText(query);
      const queryEmbedding = await this.provider.generateEmbedding(processedQuery);
      
      const similarityResults = await this.vectorDb.findSimilarEmbeddings({
        embedding: queryEmbedding,
        domain,
        limit,
        threshold,
      });

      const knowledgeChunks: KnowledgeChunk[] = similarityResults.map(result => 
        this.embeddingToKnowledgeChunk(result, query)
      );

      logger.info('Knowledge search completed', {
        query: query.substring(0, 100),
        domain,
        limit,
        threshold,
        resultsCount: knowledgeChunks.length,
        topSimilarity: similarityResults[0]?.similarity,
      });

      return knowledgeChunks;
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      
      logger.error('Failed to search knowledge', { error, query, domain });
      throw new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: `Knowledge search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: { operation: 'searchKnowledge', query: query.substring(0, 100), domain },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async chunkAndEmbedText(
    text: string,
    domain: string,
    metadata: Record<string, any> = {}
  ): Promise<Embedding[]> {
    try {
      if (!text || text.trim().length === 0) {
        throw new MCPError({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Text content is required',
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'chunkAndEmbedText', domain },
        });
      }

      const chunks = this.chunkText(text);
      
      if (chunks.length === 0) {
        throw new MCPError({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'No valid chunks generated from text',
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'chunkAndEmbedText', textLength: text.length },
        });
      }

      const requests: EmbeddingRequest[] = chunks.map((chunk, index) => ({
        text: chunk,
        domain,
        metadata: {
          ...metadata,
          chunkIndex: index,
          totalChunks: chunks.length,
          chunkLength: chunk.length,
          originalTextLength: text.length,
        },
      }));

      const embeddings = await this.createBatchEmbeddings(requests);

      logger.info('Chunked and embedded text', {
        domain,
        originalLength: text.length,
        chunksCreated: chunks.length,
        embeddingsCreated: embeddings.length,
        avgChunkSize: Math.round(chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length),
      });

      return embeddings;
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      
      logger.error('Failed to chunk and embed text', { error, domain, textLength: text.length });
      throw new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: `Text chunking and embedding failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        context: { operation: 'chunkAndEmbedText', domain, textLength: text.length },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async getEmbedding(id: string): Promise<Embedding | null> {
    return this.vectorDb.getEmbedding(id);
  }

  async deleteEmbedding(id: string): Promise<boolean> {
    return this.vectorDb.deleteEmbedding(id);
  }

  async listEmbeddings(domain?: string, limit = 100, offset = 0) {
    return this.vectorDb.listEmbeddings(domain, limit, offset);
  }

  async getStats() {
    return this.vectorDb.getStats();
  }

  async clearDomain(domain: string) {
    return this.vectorDb.clearDomain(domain);
  }

  private preprocessText(text: string): string {
    // Basic text preprocessing
    return text
      .trim()
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s.,;:!?()-]/g, '') // Remove special characters except common punctuation
      .substring(0, this.config.maxTokens * 4); // Rough character limit
  }

  private chunkText(text: string): string[] {
    const chunks: string[] = [];
    const sentences = this.splitIntoSentences(text);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + sentence;
      
      if (potentialChunk.length <= this.config.chunkSize) {
        currentChunk = potentialChunk;
      } else {
        // If we have accumulated content, save it as a chunk
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          
          // Start new chunk with overlap if configured
          if (this.config.chunkOverlap > 0) {
            const words = currentChunk.split(' ');
            const overlapWords = words.slice(-Math.floor(this.config.chunkOverlap / 10)); // Approximate word overlap
            currentChunk = overlapWords.join(' ') + ' ' + sentence;
          } else {
            currentChunk = sentence;
          }
        } else {
          // If single sentence is too long, split it further
          if (sentence.length > this.config.chunkSize) {
            const parts = this.splitLongSentence(sentence);
            chunks.push(...parts);
          } else {
            currentChunk = sentence;
          }
        }
      }
    }
    
    // Add the final chunk if it has content
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 10); // Filter out very short chunks
  }

  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - can be enhanced with more sophisticated NLP
    return text
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => s + '.');
  }

  private splitLongSentence(sentence: string): string[] {
    const chunks: string[] = [];
    const words = sentence.split(' ');
    
    let currentChunk = '';
    for (const word of words) {
      const potentialChunk = currentChunk + (currentChunk ? ' ' : '') + word;
      
      if (potentialChunk.length <= this.config.chunkSize) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = word;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  private generateEmbeddingId(text: string, domain: string): string {
    // Generate a deterministic ID based on content and domain
    const content = text.substring(0, 1000); // First 1000 chars for ID generation
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    
    return `emb_${domain}_${timestamp}_${random}`;
  }

  private embeddingToKnowledgeChunk(result: SimilarityResult, query: string): KnowledgeChunk {
    const { embedding, similarity } = result;
    
    // Extract keywords from the text (simple implementation)
    const keywords = this.extractKeywords(embedding.text);
    
    // Generate a summary (simple truncation for now)
    const summary = embedding.text.length > 200 ? 
      embedding.text.substring(0, 200) + '...' : 
      embedding.text;

    return {
      id: embedding.id,
      content: embedding.text,
      summary,
      keywords,
      domain: embedding.domain,
      confidence: similarity,
      sources: [embedding.metadata.source || 'embedded-knowledge'].filter(Boolean),
      metadata: {
        ...embedding.metadata,
        similarity,
        query: query.substring(0, 100),
        retrievedAt: new Date().toISOString(),
      },
    };
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - can be enhanced with more sophisticated NLP
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3); // Filter short words

    // Get word frequency
    const frequency: Record<string, number> = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    // Return top frequent words as keywords
    return Object.entries(frequency)
      .filter(([word, count]) => count > 1) // Words that appear more than once
      .sort(([, a], [, b]) => b - a) // Sort by frequency
      .slice(0, 10) // Top 10
      .map(([word]) => word);
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const [vectorDbHealth, providerHealth] = await Promise.all([
        this.vectorDb.healthCheck(),
        this.provider.healthCheck(),
      ]);

      const healthy = vectorDbHealth.healthy && providerHealth;

      return {
        healthy,
        details: {
          vectorDatabase: vectorDbHealth,
          embeddingProvider: {
            name: this.provider.name,
            healthy: providerHealth,
            config: this.config,
          },
          service: {
            initialized: true,
            config: this.config,
          },
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'embedding-service',
        },
      };
    }
  }
}