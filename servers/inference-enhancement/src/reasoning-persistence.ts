import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { ReasoningChain, ReasoningStep, ReasoningGraph, VerificationResult } from './reasoning-engine.js';
import { ComprehensiveVerificationResult } from './verification-mechanisms.js';
import { GeneratedPrompt } from './prompt-templates.js';
import fs from 'fs/promises';
import path from 'path';

const logger = getLogger('ReasoningPersistence');

export interface ReasoningChainMetadata {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  domain: string;
  strategy: string;
  problem: string;
  confidence: number;
  stepsCount: number;
  executionTime: number;
  tags: string[];
  version: number;
  status: 'active' | 'archived' | 'failed';
}

export interface ReasoningChainStorage {
  metadata: ReasoningChainMetadata;
  chain: ReasoningChain;
  verificationResult?: ComprehensiveVerificationResult;
  prompts?: GeneratedPrompt[];
  artifacts?: Record<string, any>;
}

export interface ReasoningPattern {
  id: string;
  name: string;
  description: string;
  domain: string;
  pattern: {
    triggerConditions: string[];
    reasoningSteps: ReasoningStepPattern[];
    expectedOutcomes: string[];
  };
  usageCount: number;
  successRate: number;
  averageConfidence: number;
  examples: string[];
  metadata: Record<string, any>;
}

export interface ReasoningStepPattern {
  type: 'analysis' | 'synthesis' | 'evaluation' | 'application';
  description: string;
  evidenceRequirements: {
    minCount: number;
    minConfidence: number;
    domains: string[];
  };
  expectedOutputs: string[];
}

export interface PersistenceQuery {
  domain?: string;
  strategy?: string;
  confidenceRange?: [number, number];
  dateRange?: [Date, Date];
  tags?: string[];
  status?: 'active' | 'archived' | 'failed';
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'confidence' | 'executionTime' | 'stepsCount';
  sortOrder?: 'asc' | 'desc';
}

export interface AnalysisResult {
  totalChains: number;
  domainDistribution: Record<string, number>;
  strategyDistribution: Record<string, number>;
  averageConfidence: number;
  averageExecutionTime: number;
  successRate: number;
  commonPatterns: string[];
  insights: string[];
}

export class ReasoningPersistenceEngine {
  private storagePath: string;
  private chainIndex: Map<string, ReasoningChainMetadata> = new Map();
  private patternLibrary: Map<string, ReasoningPattern> = new Map();

  constructor(storagePath = './data/reasoning') {
    this.storagePath = storagePath;
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
      await fs.mkdir(path.join(this.storagePath, 'chains'), { recursive: true });
      await fs.mkdir(path.join(this.storagePath, 'patterns'), { recursive: true });
      await fs.mkdir(path.join(this.storagePath, 'exports'), { recursive: true });
      
      // Load existing index
      await this.loadChainIndex();
      await this.loadPatternLibrary();

      logger.info('Reasoning persistence engine initialized', {
        storagePath: this.storagePath,
        existingChains: this.chainIndex.size,
        existingPatterns: this.patternLibrary.size,
      });
    } catch (error) {
      logger.error('Failed to initialize reasoning persistence engine', { error });
      throw error;
    }
  }

  async storeReasoningChain(
    chain: ReasoningChain,
    verificationResult?: ComprehensiveVerificationResult,
    prompts?: GeneratedPrompt[],
    artifacts?: Record<string, any>
  ): Promise<void> {
    try {
      const metadata: ReasoningChainMetadata = {
        id: chain.id,
        createdAt: new Date(),
        updatedAt: new Date(),
        domain: chain.domain,
        strategy: chain.strategy,
        problem: chain.problem.substring(0, 200), // Truncate for indexing
        confidence: chain.overallConfidence,
        stepsCount: chain.steps.length,
        executionTime: chain.executionTime,
        tags: this.extractTags(chain),
        version: 1,
        status: chain.overallConfidence > 0.6 ? 'active' : 'failed',
      };

      const storage: ReasoningChainStorage = {
        metadata,
        chain,
        verificationResult,
        prompts,
        artifacts,
      };

      // Store chain data
      const chainPath = path.join(this.storagePath, 'chains', `${chain.id}.json`);
      await fs.writeFile(chainPath, JSON.stringify(storage, null, 2));

      // Update index
      this.chainIndex.set(chain.id, metadata);
      await this.saveChainIndex();

      // Extract and store patterns
      if (chain.overallConfidence > 0.7) {
        await this.extractAndStorePatterns(chain);
      }

      logger.info('Stored reasoning chain', {
        chainId: chain.id,
        domain: chain.domain,
        strategy: chain.strategy,
        confidence: chain.overallConfidence,
        stepsCount: chain.steps.length,
      });
    } catch (error) {
      logger.error('Failed to store reasoning chain', { chainId: chain.id, error });
      throw error;
    }
  }

  async loadReasoningChain(chainId: string): Promise<ReasoningChainStorage | null> {
    try {
      const chainPath = path.join(this.storagePath, 'chains', `${chainId}.json`);
      
      try {
        const data = await fs.readFile(chainPath, 'utf-8');
        const storage: ReasoningChainStorage = JSON.parse(data);
        
        // Convert date strings back to Date objects
        storage.metadata.createdAt = new Date(storage.metadata.createdAt);
        storage.metadata.updatedAt = new Date(storage.metadata.updatedAt);
        if (storage.chain.metadata?.timestamp) {
          storage.chain.metadata.timestamp = new Date(storage.chain.metadata.timestamp);
        }

        logger.debug('Loaded reasoning chain', { chainId });
        return storage;
      } catch (fileError) {
        if ((fileError as any).code === 'ENOENT') {
          return null;
        }
        throw fileError;
      }
    } catch (error) {
      logger.error('Failed to load reasoning chain', { chainId, error });
      throw error;
    }
  }

  async queryReasoningChains(query: PersistenceQuery = {}): Promise<ReasoningChainMetadata[]> {
    try {
      let results = Array.from(this.chainIndex.values());

      // Apply filters
      if (query.domain) {
        results = results.filter(chain => chain.domain === query.domain);
      }
      
      if (query.strategy) {
        results = results.filter(chain => chain.strategy === query.strategy);
      }
      
      if (query.confidenceRange) {
        const [min, max] = query.confidenceRange;
        results = results.filter(chain => chain.confidence >= min && chain.confidence <= max);
      }
      
      if (query.dateRange) {
        const [start, end] = query.dateRange;
        results = results.filter(chain => 
          chain.createdAt >= start && chain.createdAt <= end
        );
      }
      
      if (query.tags && query.tags.length > 0) {
        results = results.filter(chain => 
          query.tags!.some(tag => chain.tags.includes(tag))
        );
      }
      
      if (query.status) {
        results = results.filter(chain => chain.status === query.status);
      }

      // Sort results
      const sortBy = query.sortBy || 'createdAt';
      const sortOrder = query.sortOrder || 'desc';
      
      results.sort((a, b) => {
        let aVal: any = a[sortBy as keyof ReasoningChainMetadata];
        let bVal: any = b[sortBy as keyof ReasoningChainMetadata];
        
        if (aVal instanceof Date) aVal = aVal.getTime();
        if (bVal instanceof Date) bVal = bVal.getTime();
        
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return sortOrder === 'asc' ? comparison : -comparison;
      });

      // Apply pagination
      const offset = query.offset || 0;
      const limit = query.limit || results.length;
      results = results.slice(offset, offset + limit);

      logger.debug('Queried reasoning chains', {
        totalFound: results.length,
        query: { ...query, results: undefined },
      });

      return results;
    } catch (error) {
      logger.error('Failed to query reasoning chains', { query, error });
      throw error;
    }
  }

  async analyzeReasoningChains(query: PersistenceQuery = {}): Promise<AnalysisResult> {
    try {
      const chains = await this.queryReasoningChains({ ...query, limit: undefined, offset: undefined });
      
      if (chains.length === 0) {
        return {
          totalChains: 0,
          domainDistribution: {},
          strategyDistribution: {},
          averageConfidence: 0,
          averageExecutionTime: 0,
          successRate: 0,
          commonPatterns: [],
          insights: [],
        };
      }

      // Calculate distributions
      const domainDistribution = chains.reduce((acc, chain) => {
        acc[chain.domain] = (acc[chain.domain] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const strategyDistribution = chains.reduce((acc, chain) => {
        acc[chain.strategy] = (acc[chain.strategy] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate averages
      const averageConfidence = chains.reduce((sum, chain) => sum + chain.confidence, 0) / chains.length;
      const averageExecutionTime = chains.reduce((sum, chain) => sum + chain.executionTime, 0) / chains.length;
      
      // Calculate success rate (chains with confidence > 0.6)
      const successfulChains = chains.filter(chain => chain.confidence > 0.6).length;
      const successRate = successfulChains / chains.length;

      // Identify common patterns
      const commonPatterns = this.identifyCommonPatterns(chains);

      // Generate insights
      const insights = this.generateInsights(chains, {
        domainDistribution,
        strategyDistribution,
        averageConfidence,
        successRate,
      });

      const result: AnalysisResult = {
        totalChains: chains.length,
        domainDistribution,
        strategyDistribution,
        averageConfidence,
        averageExecutionTime,
        successRate,
        commonPatterns,
        insights,
      };

      logger.info('Completed reasoning chains analysis', {
        totalChains: chains.length,
        averageConfidence,
        successRate,
        topDomain: Object.keys(domainDistribution).sort((a, b) => domainDistribution[b] - domainDistribution[a])[0],
      });

      return result;
    } catch (error) {
      logger.error('Failed to analyze reasoning chains', { query, error });
      throw error;
    }
  }

  async exportReasoningData(
    format: 'json' | 'csv' | 'summary',
    query: PersistenceQuery = {}
  ): Promise<string> {
    try {
      const chains = await this.queryReasoningChains(query);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `reasoning-export-${timestamp}.${format}`;
      const filepath = path.join(this.storagePath, 'exports', filename);

      let content: string;

      switch (format) {
        case 'json':
          content = await this.exportAsJson(chains, query);
          break;
        case 'csv':
          content = await this.exportAsCsv(chains);
          break;
        case 'summary':
          content = await this.exportAsSummary(chains, query);
          break;
        default:
          throw new MCPError({
            code: ErrorCode.INVALID_PARAMS,
            message: `Unsupported export format: ${format}`,
            severity: ErrorSeverity.MEDIUM,
            retryable: false,
            context: { operation: 'exportReasoningData', format },
          });
      }

      await fs.writeFile(filepath, content);

      logger.info('Exported reasoning data', {
        format,
        chains: chains.length,
        filepath,
      });

      return filepath;
    } catch (error) {
      logger.error('Failed to export reasoning data', { format, query, error });
      throw error;
    }
  }

  async storeReasoningPattern(pattern: ReasoningPattern): Promise<void> {
    try {
      this.patternLibrary.set(pattern.id, pattern);
      
      const patternPath = path.join(this.storagePath, 'patterns', `${pattern.id}.json`);
      await fs.writeFile(patternPath, JSON.stringify(pattern, null, 2));
      
      await this.savePatternLibrary();

      logger.info('Stored reasoning pattern', {
        patternId: pattern.id,
        domain: pattern.domain,
        usageCount: pattern.usageCount,
        successRate: pattern.successRate,
      });
    } catch (error) {
      logger.error('Failed to store reasoning pattern', { patternId: pattern.id, error });
      throw error;
    }
  }

  getReasoningPatterns(domain?: string): ReasoningPattern[] {
    const patterns = Array.from(this.patternLibrary.values());
    return domain ? patterns.filter(p => p.domain === domain) : patterns;
  }

  async archiveOldChains(daysOld: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const oldChains = Array.from(this.chainIndex.values()).filter(
        chain => chain.createdAt < cutoffDate && chain.status === 'active'
      );

      let archivedCount = 0;
      for (const chain of oldChains) {
        chain.status = 'archived';
        chain.updatedAt = new Date();
        archivedCount++;
      }

      await this.saveChainIndex();

      logger.info('Archived old reasoning chains', {
        archivedCount,
        cutoffDate,
        daysOld,
      });

      return archivedCount;
    } catch (error) {
      logger.error('Failed to archive old chains', { daysOld, error });
      throw error;
    }
  }

  private extractTags(chain: ReasoningChain): string[] {
    const tags: string[] = [];
    
    // Add domain tag
    tags.push(`domain:${chain.domain}`);
    
    // Add strategy tag
    tags.push(`strategy:${chain.strategy}`);
    
    // Add confidence level tag
    if (chain.overallConfidence > 0.8) {
      tags.push('high-confidence');
    } else if (chain.overallConfidence > 0.6) {
      tags.push('medium-confidence');
    } else {
      tags.push('low-confidence');
    }
    
    // Add complexity tag based on steps count
    if (chain.steps.length > 6) {
      tags.push('complex');
    } else if (chain.steps.length > 3) {
      tags.push('moderate');
    } else {
      tags.push('simple');
    }
    
    // Add performance tag based on execution time
    if (chain.executionTime > 30000) {
      tags.push('slow');
    } else if (chain.executionTime > 10000) {
      tags.push('moderate-speed');
    } else {
      tags.push('fast');
    }

    return tags;
  }

  private async extractAndStorePatterns(chain: ReasoningChain): Promise<void> {
    try {
      // Extract pattern from successful chain
      const patternId = `pattern-${chain.strategy}-${chain.domain}-${Date.now()}`;
      
      const stepPatterns: ReasoningStepPattern[] = chain.steps.map(step => ({
        type: step.type,
        description: step.description,
        evidenceRequirements: {
          minCount: Math.max(1, step.evidenceUsed.length),
          minConfidence: Math.max(0.5, Math.min(...step.evidenceUsed.map(e => e.confidence))),
          domains: [...new Set(step.evidenceUsed.map(e => e.domain))],
        },
        expectedOutputs: [typeof step.output === 'object' ? JSON.stringify(step.output) : String(step.output)],
      }));

      const pattern: ReasoningPattern = {
        id: patternId,
        name: `${chain.strategy} pattern for ${chain.domain}`,
        description: `Extracted from successful reasoning chain with ${(chain.overallConfidence * 100).toFixed(1)}% confidence`,
        domain: chain.domain,
        pattern: {
          triggerConditions: [
            `domain:${chain.domain}`,
            `strategy:${chain.strategy}`,
            `complexity:${chain.steps.length > 4 ? 'high' : 'medium'}`,
          ],
          reasoningSteps: stepPatterns,
          expectedOutcomes: [chain.finalConclusion],
        },
        usageCount: 1,
        successRate: 1.0,
        averageConfidence: chain.overallConfidence,
        examples: [chain.id],
        metadata: {
          extractedFrom: chain.id,
          extractedAt: new Date().toISOString(),
          originalProblem: chain.problem,
        },
      };

      await this.storeReasoningPattern(pattern);
    } catch (error) {
      logger.warn('Failed to extract pattern from chain', { chainId: chain.id, error });
      // Don't throw - pattern extraction is optional
    }
  }

  private identifyCommonPatterns(chains: ReasoningChainMetadata[]): string[] {
    const patterns: string[] = [];
    
    // Common domain-strategy combinations
    const combinations = chains.reduce((acc, chain) => {
      const key = `${chain.domain}-${chain.strategy}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const commonCombinations = Object.entries(combinations)
      .filter(([, count]) => count >= Math.max(2, chains.length * 0.1))
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    patterns.push(...commonCombinations.map(([combo]) => combo));

    // Common complexity patterns
    const complexityDistribution = chains.reduce((acc, chain) => {
      const complexity = chain.stepsCount > 4 ? 'high' : chain.stepsCount > 2 ? 'medium' : 'low';
      acc[complexity] = (acc[complexity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const dominantComplexity = Object.entries(complexityDistribution)
      .sort(([, a], [, b]) => b - a)[0];
    
    if (dominantComplexity) {
      patterns.push(`complexity:${dominantComplexity[0]}`);
    }

    return patterns;
  }

  private generateInsights(
    chains: ReasoningChainMetadata[],
    analysis: { domainDistribution: Record<string, number>; strategyDistribution: Record<string, number>; averageConfidence: number; successRate: number }
  ): string[] {
    const insights: string[] = [];

    // Domain insights
    const topDomain = Object.entries(analysis.domainDistribution)
      .sort(([, a], [, b]) => b - a)[0];
    if (topDomain) {
      insights.push(`Most common domain: ${topDomain[0]} (${((topDomain[1] / chains.length) * 100).toFixed(1)}%)`);
    }

    // Strategy insights
    const topStrategy = Object.entries(analysis.strategyDistribution)
      .sort(([, a], [, b]) => b - a)[0];
    if (topStrategy) {
      insights.push(`Most used strategy: ${topStrategy[0]} (${((topStrategy[1] / chains.length) * 100).toFixed(1)}%)`);
    }

    // Confidence insights
    if (analysis.averageConfidence > 0.8) {
      insights.push('High overall confidence in reasoning chains');
    } else if (analysis.averageConfidence < 0.6) {
      insights.push('Low overall confidence suggests need for better evidence or methodology');
    }

    // Success rate insights
    if (analysis.successRate > 0.8) {
      insights.push('Excellent success rate indicates effective reasoning strategies');
    } else if (analysis.successRate < 0.6) {
      insights.push('Low success rate suggests need for strategy optimization');
    }

    // Performance insights
    const fastChains = chains.filter(c => c.executionTime < 10000).length;
    if (fastChains / chains.length > 0.7) {
      insights.push('Most chains execute quickly, indicating efficient processing');
    }

    return insights;
  }

  private async exportAsJson(chains: ReasoningChainMetadata[], query: PersistenceQuery): Promise<string> {
    const data = {
      exportInfo: {
        timestamp: new Date().toISOString(),
        query,
        totalChains: chains.length,
      },
      chains,
    };
    return JSON.stringify(data, null, 2);
  }

  private async exportAsCsv(chains: ReasoningChainMetadata[]): Promise<string> {
    const headers = [
      'id', 'createdAt', 'domain', 'strategy', 'confidence', 
      'stepsCount', 'executionTime', 'status', 'tags'
    ];
    
    const rows = chains.map(chain => [
      chain.id,
      chain.createdAt.toISOString(),
      chain.domain,
      chain.strategy,
      chain.confidence.toFixed(3),
      chain.stepsCount.toString(),
      chain.executionTime.toString(),
      chain.status,
      chain.tags.join(';'),
    ]);

    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
  }

  private async exportAsSummary(chains: ReasoningChainMetadata[], query: PersistenceQuery): Promise<string> {
    const analysis = await this.analyzeReasoningChains(query);
    
    return `
REASONING CHAINS ANALYSIS SUMMARY
================================

Generated: ${new Date().toISOString()}
Query: ${JSON.stringify(query, null, 2)}

OVERVIEW
--------
Total Chains: ${analysis.totalChains}
Average Confidence: ${(analysis.averageConfidence * 100).toFixed(1)}%
Success Rate: ${(analysis.successRate * 100).toFixed(1)}%
Average Execution Time: ${analysis.averageExecutionTime.toFixed(0)}ms

DOMAIN DISTRIBUTION
-------------------
${Object.entries(analysis.domainDistribution)
  .sort(([, a], [, b]) => b - a)
  .map(([domain, count]) => `${domain}: ${count} (${((count / analysis.totalChains) * 100).toFixed(1)}%)`)
  .join('\n')}

STRATEGY DISTRIBUTION
---------------------
${Object.entries(analysis.strategyDistribution)
  .sort(([, a], [, b]) => b - a)
  .map(([strategy, count]) => `${strategy}: ${count} (${((count / analysis.totalChains) * 100).toFixed(1)}%)`)
  .join('\n')}

COMMON PATTERNS
---------------
${analysis.commonPatterns.join('\n')}

INSIGHTS
--------
${analysis.insights.join('\n')}
`;
  }

  private async loadChainIndex(): Promise<void> {
    try {
      const indexPath = path.join(this.storagePath, 'chain-index.json');
      const data = await fs.readFile(indexPath, 'utf-8');
      const indexData = JSON.parse(data);
      
      this.chainIndex.clear();
      for (const [id, metadata] of Object.entries(indexData)) {
        const chainMetadata = metadata as any;
        chainMetadata.createdAt = new Date(chainMetadata.createdAt);
        chainMetadata.updatedAt = new Date(chainMetadata.updatedAt);
        this.chainIndex.set(id, chainMetadata);
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.warn('Failed to load chain index', { error });
      }
    }
  }

  private async saveChainIndex(): Promise<void> {
    try {
      const indexPath = path.join(this.storagePath, 'chain-index.json');
      const indexData = Object.fromEntries(this.chainIndex);
      await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2));
    } catch (error) {
      logger.error('Failed to save chain index', { error });
      throw error;
    }
  }

  private async loadPatternLibrary(): Promise<void> {
    try {
      const patternIndexPath = path.join(this.storagePath, 'pattern-index.json');
      const data = await fs.readFile(patternIndexPath, 'utf-8');
      const patternIds = JSON.parse(data);
      
      this.patternLibrary.clear();
      for (const patternId of patternIds) {
        try {
          const patternPath = path.join(this.storagePath, 'patterns', `${patternId}.json`);
          const patternData = await fs.readFile(patternPath, 'utf-8');
          const pattern = JSON.parse(patternData);
          this.patternLibrary.set(patternId, pattern);
        } catch (patternError) {
          logger.warn('Failed to load pattern', { patternId, error: patternError });
        }
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.warn('Failed to load pattern library', { error });
      }
    }
  }

  private async savePatternLibrary(): Promise<void> {
    try {
      const patternIndexPath = path.join(this.storagePath, 'pattern-index.json');
      const patternIds = Array.from(this.patternLibrary.keys());
      await fs.writeFile(patternIndexPath, JSON.stringify(patternIds, null, 2));
    } catch (error) {
      logger.error('Failed to save pattern library', { error });
      throw error;
    }
  }

  async getStorageStats(): Promise<{
    totalChains: number;
    totalPatterns: number;
    storageSize: number;
    oldestChain: Date | null;
    newestChain: Date | null;
  }> {
    try {
      const chains = Array.from(this.chainIndex.values());
      const sortedByDate = chains.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      
      // Calculate storage size (approximation)
      let storageSize = 0;
      try {
        const files = await fs.readdir(path.join(this.storagePath, 'chains'));
        for (const file of files) {
          const stat = await fs.stat(path.join(this.storagePath, 'chains', file));
          storageSize += stat.size;
        }
      } catch {
        // Ignore if directory doesn't exist
      }

      return {
        totalChains: chains.length,
        totalPatterns: this.patternLibrary.size,
        storageSize,
        oldestChain: sortedByDate.length > 0 ? sortedByDate[0].createdAt : null,
        newestChain: sortedByDate.length > 0 ? sortedByDate[sortedByDate.length - 1].createdAt : null,
      };
    } catch (error) {
      logger.error('Failed to get storage stats', { error });
      throw error;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = await this.getStorageStats();
      
      // Check if storage directory is accessible
      await fs.access(this.storagePath);
      
      return {
        healthy: true,
        details: {
          ...stats,
          storagePath: this.storagePath,
          service: 'reasoning-persistence-engine',
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'reasoning-persistence-engine',
        },
      };
    }
  }
}