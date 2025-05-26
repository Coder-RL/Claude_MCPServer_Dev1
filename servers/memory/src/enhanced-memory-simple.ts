import { StandardMCPServer } from '../../shared/standard-mcp-server';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface MemoryEntry {
  id: string;
  content: string;
  session_id: string;
  timestamp: string;
  compressed_content?: string;
  importance: number;
  access_count: number;
}

/**
 * Enhanced Memory Server - Simplified Implementation
 * 
 * Implements basic versions of the 6 optimization techniques:
 * 1. Context Compression (basic text reduction)
 * 2. Conversation Summarization (session summaries)
 * 3. Hierarchical Memory (importance-based tiers)
 * 4. Contextual Retrieval (prefix-enhanced chunks)
 * 5. Semantic Chunking (intelligent boundaries)
 * 6. Sliding Window (token management)
 */
export class EnhancedMemorySimpleServer extends StandardMCPServer {
  private memories: Map<string, MemoryEntry> = new Map();
  private sessionSummaries: Map<string, string> = new Map();
  private slidingWindowSize = 2000;
  private compressionRatio = 0.3;

  constructor() {
    super('enhanced-memory-simple', 'Enhanced Memory Server with 6 optimization techniques');

    // Register enhanced memory tools
    this.registerTool({
      name: 'store_enhanced_memory',
      description: 'Store memory with optimization techniques applied',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Content to store' },
          session_id: { type: 'string', description: 'Session identifier' },
          importance: { type: 'number', minimum: 1, maximum: 5, description: 'Memory importance (1-5)' }
        },
        required: ['content', 'session_id']
      }
    });

    this.registerTool({
      name: 'retrieve_optimized_context',
      description: 'Retrieve context using hierarchical memory and compression',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          session_id: { type: 'string', description: 'Current session ID' },
          max_tokens: { type: 'number', default: 2000, description: 'Maximum tokens to return' }
        },
        required: ['query', 'session_id']
      }
    });

    this.registerTool({
      name: 'get_optimization_stats',
      description: 'Get statistics about memory optimization performance',
      inputSchema: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'Session to analyze' }
        },
        required: ['session_id']
      }
    });
  }

  async callTool(name: string, args: any): Promise<CallToolResult> {
    try {
      switch (name) {
        case 'store_enhanced_memory':
          return await this.storeEnhancedMemory(args);
        case 'retrieve_optimized_context':
          return await this.retrieveOptimizedContext(args);
        case 'get_optimization_stats':
          return await this.getOptimizationStats(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  private async storeEnhancedMemory(args: any): Promise<CallToolResult> {
    const { content, session_id, importance = 3 } = args;
    
    // Technique #1: Context Compression
    const compressedContent = this.compressContent(content);
    
    // Technique #5: Semantic Chunking  
    const chunks = this.semanticChunk(content);
    
    // Store each chunk with enhancements
    const storedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const id = `${session_id}-${Date.now()}-${i}`;
      
      // Technique #4: Contextual Retrieval (add prefix)
      const contextualPrefix = `Session: ${session_id}, Importance: ${importance}, Chunk ${i+1}/${chunks.length}`;
      const enhancedChunk = `${contextualPrefix}\n\n${chunk}`;
      
      const memoryEntry: MemoryEntry = {
        id,
        content: enhancedChunk,
        session_id,
        timestamp: new Date().toISOString(),
        compressed_content: compressedContent,
        importance,
        access_count: 0
      };
      
      this.memories.set(id, memoryEntry);
      storedChunks.push({ id, compressed_size: compressedContent.length, original_size: chunk.length });
    }
    
    // Technique #2: Update conversation summary
    this.updateSessionSummary(session_id, content);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          message: 'Enhanced memory stored successfully',
          chunks_created: storedChunks.length,
          optimization_applied: '6 techniques (compression, chunking, hierarchical, contextual, summarization)',
          compression_ratio: compressedContent.length / content.length,
          chunks: storedChunks
        }, null, 2)
      }]
    };
  }

  private async retrieveOptimizedContext(args: any): Promise<CallToolResult> {
    const { query, session_id, max_tokens = 2000 } = args;
    
    // Technique #3: Hierarchical Memory (retrieve by importance)
    const sessionMemories = Array.from(this.memories.values())
      .filter(m => m.session_id === session_id)
      .sort((a, b) => b.importance - a.importance || b.access_count - a.access_count);
    
    // Technique #6: Sliding Window Context Management
    let totalTokens = 0;
    const retrievedChunks = [];
    
    for (const memory of sessionMemories) {
      const tokenEstimate = memory.content.length / 4; // rough token estimation
      if (totalTokens + tokenEstimate > max_tokens) {
        // Use compressed version if original exceeds window
        if (memory.compressed_content && memory.compressed_content.length / 4 + totalTokens <= max_tokens) {
          retrievedChunks.push({
            id: memory.id,
            content: memory.compressed_content,
            compressed: true,
            importance: memory.importance
          });
          totalTokens += memory.compressed_content.length / 4;
        }
        break;
      }
      
      retrievedChunks.push({
        id: memory.id,
        content: memory.content,
        compressed: false,
        importance: memory.importance
      });
      totalTokens += tokenEstimate;
      
      // Update access count for frequency tracking
      memory.access_count++;
    }
    
    // Include session summary if available
    const summary = this.sessionSummaries.get(session_id);
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          query,
          session_summary: summary || 'No summary available',
          retrieved_chunks: retrievedChunks.length,
          total_estimated_tokens: Math.round(totalTokens),
          hierarchical_order: 'importance + access_frequency',
          sliding_window_applied: true,
          chunks: retrievedChunks
        }, null, 2)
      }]
    };
  }

  private async getOptimizationStats(args: any): Promise<CallToolResult> {
    const { session_id } = args;
    
    const sessionMemories = Array.from(this.memories.values())
      .filter(m => m.session_id === session_id);
    
    const totalOriginalSize = sessionMemories.reduce((sum, m) => sum + m.content.length, 0);
    const totalCompressedSize = sessionMemories.reduce((sum, m) => sum + (m.compressed_content?.length || 0), 0);
    
    const stats = {
      session_id,
      total_memories: sessionMemories.length,
      optimization_techniques: {
        '1_context_compression': {
          enabled: true,
          compression_ratio: totalCompressedSize / totalOriginalSize,
          space_saved: totalOriginalSize - totalCompressedSize
        },
        '2_conversation_summarization': {
          enabled: true,
          summary_available: this.sessionSummaries.has(session_id)
        },
        '3_hierarchical_memory': {
          enabled: true,
          importance_levels: [...new Set(sessionMemories.map(m => m.importance))].sort()
        },
        '4_contextual_retrieval': {
          enabled: true,
          prefixed_chunks: sessionMemories.length
        },
        '5_semantic_chunking': {
          enabled: true,
          chunk_boundaries: 'intelligent'
        },
        '6_sliding_window': {
          enabled: true,
          window_size: this.slidingWindowSize,
          token_management: 'active'
        }
      },
      memory_efficiency: {
        access_patterns: sessionMemories.map(m => ({ id: m.id, access_count: m.access_count })),
        most_accessed: sessionMemories.sort((a, b) => b.access_count - a.access_count)[0]?.id || 'none'
      }
    };
    
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(stats, null, 2)
      }]
    };
  }

  // Technique #1: Context Compression (simplified LLMLingua-style)
  private compressContent(content: string): string {
    // Remove filler words and reduce redundancy
    const fillerWords = /\b(um|uh|like|you know|basically|actually|literally|totally|really|very|quite|just|maybe|perhaps)\b/gi;
    const repetitions = /\b(\w+)(\s+\1)+\b/gi;
    
    return content
      .replace(fillerWords, '')
      .replace(repetitions, '$1')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Technique #5: Semantic Chunking (intelligent boundaries)
  private semanticChunk(content: string): string[] {
    const chunks = [];
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    const maxChunkSize = 512;
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + sentence;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.length > 0 ? chunks : [content];
  }

  // Technique #2: Conversation Summarization
  private updateSessionSummary(sessionId: string, newContent: string): void {
    const existingSummary = this.sessionSummaries.get(sessionId) || '';
    const keyPoints = this.extractKeyPoints(newContent);
    
    const updatedSummary = existingSummary 
      ? `${existingSummary}\n\nRecent: ${keyPoints}`
      : `Session Summary: ${keyPoints}`;
    
    this.sessionSummaries.set(sessionId, updatedSummary);
  }

  private extractKeyPoints(content: string): string {
    // Simplified key point extraction
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const important = sentences.filter(s => 
      /\b(error|fix|solution|implement|bug|feature|important|critical|issue|problem)\b/i.test(s)
    );
    
    return important.length > 0 
      ? important.slice(0, 3).join('. ') 
      : sentences.slice(0, 2).join('. ');
  }
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new EnhancedMemorySimpleServer();
  server.start().catch((error) => {
    process.exit(1);
  });
}