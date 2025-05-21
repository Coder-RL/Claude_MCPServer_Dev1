import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { EmbeddingService, KnowledgeChunk, EmbeddingRequest } from './embedding-service.js';

const logger = getLogger('DomainKnowledge');

export interface Domain {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  expertiseLevel: 'basic' | 'intermediate' | 'advanced' | 'expert';
  knowledgeTypes: string[];
  sources: string[];
  lastUpdated: Date;
  metadata: Record<string, any>;
}

export interface KnowledgeSource {
  id: string;
  name: string;
  type: 'document' | 'web' | 'api' | 'database' | 'manual';
  url?: string;
  description?: string;
  credibility: number;
  lastAccessed: Date;
  metadata: Record<string, any>;
}

export interface KnowledgeContext {
  domain: string;
  relevantChunks: KnowledgeChunk[];
  domainInfo: Domain;
  confidence: number;
  reasoning: string[];
  suggestions: string[];
  metadata: Record<string, any>;
}

export interface ReasoningStep {
  id: string;
  step: number;
  description: string;
  input: any;
  output: any;
  confidence: number;
  reasoning: string;
  evidence: KnowledgeChunk[];
  metadata: Record<string, any>;
}

export interface ReasoningChain {
  id: string;
  query: string;
  domain: string;
  steps: ReasoningStep[];
  conclusion: string;
  overallConfidence: number;
  executionTime: number;
  metadata: Record<string, any>;
}

export class DomainKnowledgeOrganizer {
  private embeddingService: EmbeddingService;
  private domains: Map<string, Domain> = new Map();
  private sources: Map<string, KnowledgeSource> = new Map();
  private reasoningChains: Map<string, ReasoningChain> = new Map();

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
    this.initializeDefaultDomains();
  }

  private initializeDefaultDomains(): void {
    const defaultDomains: Domain[] = [
      {
        id: 'general',
        name: 'General Knowledge',
        description: 'Broad, general-purpose knowledge across multiple domains',
        category: 'general',
        tags: ['general', 'common-sense', 'facts'],
        expertiseLevel: 'basic',
        knowledgeTypes: ['facts', 'definitions', 'common-knowledge'],
        sources: ['wikipedia', 'encyclopedias', 'general-references'],
        lastUpdated: new Date(),
        metadata: { defaultDomain: true },
      },
      {
        id: 'technology',
        name: 'Technology & Software',
        description: 'Software development, programming, and technology concepts',
        category: 'technical',
        tags: ['software', 'programming', 'algorithms', 'data-structures'],
        expertiseLevel: 'advanced',
        knowledgeTypes: ['code-examples', 'documentation', 'best-practices', 'tutorials'],
        sources: ['github', 'stackoverflow', 'technical-docs', 'api-references'],
        lastUpdated: new Date(),
        metadata: { programmingLanguages: ['typescript', 'javascript', 'python', 'rust', 'go'] },
      },
      {
        id: 'science',
        name: 'Science & Research',
        description: 'Scientific knowledge, research, and methodologies',
        category: 'academic',
        tags: ['research', 'methodology', 'experiments', 'analysis'],
        expertiseLevel: 'expert',
        knowledgeTypes: ['research-papers', 'methodology', 'experimental-data', 'theories'],
        sources: ['pubmed', 'arxiv', 'scientific-journals', 'research-databases'],
        lastUpdated: new Date(),
        metadata: { fields: ['computer-science', 'biology', 'physics', 'chemistry', 'mathematics'] },
      },
      {
        id: 'business',
        name: 'Business & Strategy',
        description: 'Business operations, strategy, and management knowledge',
        category: 'professional',
        tags: ['strategy', 'operations', 'management', 'finance'],
        expertiseLevel: 'intermediate',
        knowledgeTypes: ['case-studies', 'frameworks', 'best-practices', 'metrics'],
        sources: ['business-journals', 'case-studies', 'reports', 'interviews'],
        lastUpdated: new Date(),
        metadata: { industries: ['technology', 'finance', 'healthcare', 'retail', 'manufacturing'] },
      },
    ];

    for (const domain of defaultDomains) {
      this.domains.set(domain.id, domain);
    }

    logger.info('Initialized default domains', {
      domainCount: defaultDomains.length,
      domains: defaultDomains.map(d => d.name),
    });
  }

  @withPerformanceMonitoring('domain.organize-knowledge')
  async organizeKnowledge(
    content: string,
    suggestedDomain?: string,
    metadata: Record<string, any> = {}
  ): Promise<{
    domain: string;
    chunks: string[];
    embeddings: any[];
    organization: {
      primaryDomain: Domain;
      secondaryDomains: Domain[];
      confidence: number;
      reasoning: string[];
    };
  }> {
    try {
      if (!content || content.trim().length === 0) {
        throw new MCPError({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Content is required for knowledge organization',
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'organizeKnowledge' },
        });
      }

      // Determine the best domain for this content
      const domainAnalysis = await this.analyzeDomain(content, suggestedDomain);
      const selectedDomain = domainAnalysis.primaryDomain;

      // Chunk and embed the content
      const embeddings = await this.embeddingService.chunkAndEmbedText(
        content,
        selectedDomain.id,
        {
          ...metadata,
          domainAnalysis,
          organizedAt: new Date().toISOString(),
          contentLength: content.length,
        }
      );

      const chunks = embeddings.map(emb => emb.text);

      logger.info('Organized knowledge', {
        domain: selectedDomain.name,
        contentLength: content.length,
        chunksCreated: chunks.length,
        confidence: domainAnalysis.confidence,
      });

      return {
        domain: selectedDomain.id,
        chunks,
        embeddings,
        organization: domainAnalysis,
      };
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }

      logger.error('Failed to organize knowledge', { error, suggestedDomain });
      throw new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: `Knowledge organization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        context: { operation: 'organizeKnowledge', suggestedDomain },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  @withPerformanceMonitoring('domain.analyze-domain')
  private async analyzeDomain(
    content: string,
    suggestedDomain?: string
  ): Promise<{
    primaryDomain: Domain;
    secondaryDomains: Domain[];
    confidence: number;
    reasoning: string[];
  }> {
    const analysis = {
      scores: new Map<string, number>(),
      reasoning: [] as string[],
    };

    // If a domain is suggested and exists, give it preference
    if (suggestedDomain && this.domains.has(suggestedDomain)) {
      analysis.scores.set(suggestedDomain, 0.8);
      analysis.reasoning.push(`Suggested domain: ${suggestedDomain}`);
    }

    // Analyze content for domain-specific keywords and patterns
    const contentLower = content.toLowerCase();
    const words = contentLower.split(/\s+/);
    const wordSet = new Set(words);

    for (const [domainId, domain] of this.domains) {
      let score = 0;
      let matchedIndicators: string[] = [];

      // Check for domain tags in content
      for (const tag of domain.tags) {
        if (contentLower.includes(tag)) {
          score += 0.2;
          matchedIndicators.push(`tag:${tag}`);
        }
      }

      // Check for knowledge types
      for (const knowledgeType of domain.knowledgeTypes) {
        if (contentLower.includes(knowledgeType.replace('-', ' '))) {
          score += 0.15;
          matchedIndicators.push(`type:${knowledgeType}`);
        }
      }

      // Domain-specific pattern matching
      switch (domainId) {
        case 'technology':
          if (this.containsTechnicalTerms(contentLower, wordSet)) {
            score += 0.3;
            matchedIndicators.push('technical-patterns');
          }
          break;
        case 'science':
          if (this.containsScientificTerms(contentLower, wordSet)) {
            score += 0.3;
            matchedIndicators.push('scientific-patterns');
          }
          break;
        case 'business':
          if (this.containsBusinessTerms(contentLower, wordSet)) {
            score += 0.3;
            matchedIndicators.push('business-patterns');
          }
          break;
        case 'general':
          // General domain gets a base score but lower priority
          score += 0.1;
          break;
      }

      if (score > 0) {
        analysis.scores.set(domainId, Math.min(score, 1.0));
        if (matchedIndicators.length > 0) {
          analysis.reasoning.push(`${domain.name}: ${matchedIndicators.join(', ')}`);
        }
      }
    }

    // If no domain scored significantly, default to general
    if (analysis.scores.size === 0 || Math.max(...analysis.scores.values()) < 0.3) {
      analysis.scores.set('general', 0.5);
      analysis.reasoning.push('Defaulted to general domain due to unclear categorization');
    }

    // Sort domains by score
    const sortedDomains = Array.from(analysis.scores.entries())
      .sort(([, a], [, b]) => b - a);

    const primaryDomainId = sortedDomains[0][0];
    const primaryDomain = this.domains.get(primaryDomainId)!;
    const confidence = sortedDomains[0][1];

    const secondaryDomains = sortedDomains
      .slice(1, 3) // Take top 2 secondary domains
      .filter(([, score]) => score > 0.2)
      .map(([domainId]) => this.domains.get(domainId)!)
      .filter(Boolean);

    return {
      primaryDomain,
      secondaryDomains,
      confidence,
      reasoning: analysis.reasoning,
    };
  }

  private containsTechnicalTerms(content: string, wordSet: Set<string>): boolean {
    const techTerms = [
      'function', 'variable', 'method', 'class', 'object', 'array', 'string',
      'algorithm', 'database', 'api', 'framework', 'library', 'npm', 'git',
      'repository', 'commit', 'branch', 'merge', 'deploy', 'server', 'client',
      'frontend', 'backend', 'fullstack', 'typescript', 'javascript', 'python',
      'react', 'node', 'express', 'async', 'await', 'promise', 'callback',
    ];

    const matches = techTerms.filter(term => wordSet.has(term) || content.includes(term));
    return matches.length >= 3; // Require multiple technical terms
  }

  private containsScientificTerms(content: string, wordSet: Set<string>): boolean {
    const scienceTerms = [
      'hypothesis', 'experiment', 'research', 'study', 'analysis', 'data',
      'methodology', 'results', 'conclusion', 'peer-review', 'publication',
      'theory', 'model', 'simulation', 'algorithm', 'machine-learning',
      'statistics', 'correlation', 'causation', 'sample', 'population',
      'evidence', 'empirical', 'quantitative', 'qualitative', 'meta-analysis',
    ];

    const matches = scienceTerms.filter(term => wordSet.has(term) || content.includes(term));
    return matches.length >= 3;
  }

  private containsBusinessTerms(content: string, wordSet: Set<string>): boolean {
    const businessTerms = [
      'strategy', 'revenue', 'profit', 'market', 'customer', 'business',
      'management', 'operations', 'finance', 'marketing', 'sales', 'roi',
      'kpi', 'metrics', 'performance', 'growth', 'scale', 'competitive',
      'advantage', 'stakeholder', 'shareholder', 'board', 'executive',
      'budget', 'forecast', 'planning', 'acquisition', 'merger',
    ];

    const matches = businessTerms.filter(term => wordSet.has(term) || content.includes(term));
    return matches.length >= 3;
  }

  @withPerformanceMonitoring('domain.get-knowledge-context')
  async getKnowledgeContext(
    query: string,
    domain?: string,
    limit = 10
  ): Promise<KnowledgeContext> {
    try {
      // If no domain specified, try to infer from query
      let targetDomain = domain;
      let domainInfo: Domain;

      if (!targetDomain) {
        const domainAnalysis = await this.analyzeDomain(query);
        targetDomain = domainAnalysis.primaryDomain.id;
        domainInfo = domainAnalysis.primaryDomain;
      } else {
        domainInfo = this.domains.get(targetDomain) || this.domains.get('general')!;
      }

      // Search for relevant knowledge chunks
      const relevantChunks = await this.embeddingService.searchKnowledge(
        query,
        targetDomain,
        limit
      );

      // Calculate overall confidence based on chunk similarities
      const overallConfidence = relevantChunks.length > 0 ?
        relevantChunks.reduce((sum, chunk) => sum + chunk.confidence, 0) / relevantChunks.length :
        0;

      // Generate reasoning and suggestions
      const reasoning = this.generateReasoningExplanation(query, relevantChunks, domainInfo);
      const suggestions = this.generateSuggestions(query, relevantChunks, domainInfo);

      const context: KnowledgeContext = {
        domain: targetDomain,
        relevantChunks,
        domainInfo,
        confidence: overallConfidence,
        reasoning,
        suggestions,
        metadata: {
          queryLength: query.length,
          chunksFound: relevantChunks.length,
          searchTimestamp: new Date().toISOString(),
          domainCategory: domainInfo.category,
        },
      };

      logger.info('Generated knowledge context', {
        query: query.substring(0, 100),
        domain: targetDomain,
        chunksFound: relevantChunks.length,
        confidence: overallConfidence,
      });

      return context;
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }

      logger.error('Failed to get knowledge context', { error, query, domain });
      throw new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: `Knowledge context generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: { operation: 'getKnowledgeContext', query: query.substring(0, 100), domain },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  private generateReasoningExplanation(
    query: string,
    chunks: KnowledgeChunk[],
    domain: Domain
  ): string[] {
    const reasoning: string[] = [];

    reasoning.push(`Query analyzed within ${domain.name} domain (${domain.category})`);

    if (chunks.length > 0) {
      reasoning.push(`Found ${chunks.length} relevant knowledge chunks with average confidence ${
        (chunks.reduce((sum, c) => sum + c.confidence, 0) / chunks.length).toFixed(2)
      }`);

      const topChunk = chunks[0];
      if (topChunk.confidence > 0.8) {
        reasoning.push(`High-confidence match found (${topChunk.confidence.toFixed(2)}) in domain knowledge`);
      } else if (topChunk.confidence > 0.6) {
        reasoning.push(`Moderate-confidence match found (${topChunk.confidence.toFixed(2)}) - may require additional context`);
      } else {
        reasoning.push(`Low-confidence matches (best: ${topChunk.confidence.toFixed(2)}) - consider broadening search or checking other domains`);
      }

      // Analyze keyword overlap
      const queryWords = new Set(query.toLowerCase().split(/\s+/));
      const commonKeywords = topChunk.keywords.filter(keyword => 
        queryWords.has(keyword) || query.toLowerCase().includes(keyword)
      );

      if (commonKeywords.length > 0) {
        reasoning.push(`Keywords overlap: ${commonKeywords.join(', ')}`);
      }
    } else {
      reasoning.push('No relevant knowledge found in current domain - may need to expand search scope');
    }

    return reasoning;
  }

  private generateSuggestions(
    query: string,
    chunks: KnowledgeChunk[],
    domain: Domain
  ): string[] {
    const suggestions: string[] = [];

    if (chunks.length === 0) {
      suggestions.push('Try rephrasing the query with more specific terms');
      suggestions.push(`Consider searching in related domains: ${domain.category}`);
      suggestions.push('Add more context to the query to improve relevance');
      return suggestions;
    }

    const avgConfidence = chunks.reduce((sum, c) => sum + c.confidence, 0) / chunks.length;

    if (avgConfidence < 0.5) {
      suggestions.push('Results have low confidence - consider refining the query');
      suggestions.push('Try using more specific terminology related to the domain');
    }

    if (chunks.length < 3) {
      suggestions.push('Limited results found - try broader search terms');
    }

    // Suggest related queries based on found keywords
    const allKeywords = chunks.flatMap(c => c.keywords);
    const keywordFreq = allKeywords.reduce((freq, keyword) => {
      freq[keyword] = (freq[keyword] || 0) + 1;
      return freq;
    }, {} as Record<string, number>);

    const topKeywords = Object.entries(keywordFreq)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([keyword]) => keyword);

    if (topKeywords.length > 0) {
      suggestions.push(`Related concepts to explore: ${topKeywords.join(', ')}`);
    }

    if (domain.knowledgeTypes.length > 0) {
      suggestions.push(`Consider focusing on ${domain.knowledgeTypes[0]} or ${domain.knowledgeTypes[1] || 'general concepts'} within this domain`);
    }

    return suggestions;
  }

  // Domain management methods
  async createDomain(domain: Omit<Domain, 'id' | 'lastUpdated'>): Promise<Domain> {
    const newDomain: Domain = {
      ...domain,
      id: this.generateDomainId(domain.name),
      lastUpdated: new Date(),
    };

    this.domains.set(newDomain.id, newDomain);

    logger.info('Created new domain', {
      id: newDomain.id,
      name: newDomain.name,
      category: newDomain.category,
    });

    return newDomain;
  }

  async updateDomain(id: string, updates: Partial<Domain>): Promise<Domain | null> {
    const domain = this.domains.get(id);
    if (!domain) {
      return null;
    }

    const updatedDomain: Domain = {
      ...domain,
      ...updates,
      id, // Preserve ID
      lastUpdated: new Date(),
    };

    this.domains.set(id, updatedDomain);

    logger.info('Updated domain', { id, updates: Object.keys(updates) });
    return updatedDomain;
  }

  async deleteDomain(id: string): Promise<boolean> {
    if (id === 'general') {
      throw new MCPError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Cannot delete the general domain',
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'deleteDomain', id },
      });
    }

    const deleted = this.domains.delete(id);
    if (deleted) {
      logger.info('Deleted domain', { id });
    }
    return deleted;
  }

  getDomain(id: string): Domain | null {
    return this.domains.get(id) || null;
  }

  listDomains(): Domain[] {
    return Array.from(this.domains.values());
  }

  searchDomains(query: string): Domain[] {
    const queryLower = query.toLowerCase();
    return Array.from(this.domains.values()).filter(domain =>
      domain.name.toLowerCase().includes(queryLower) ||
      domain.description.toLowerCase().includes(queryLower) ||
      domain.tags.some(tag => tag.toLowerCase().includes(queryLower)) ||
      domain.category.toLowerCase().includes(queryLower)
    );
  }

  private generateDomainId(name: string): string {
    return name.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }

  async getStats(): Promise<{
    domainCount: number;
    domainsByCategory: Record<string, number>;
    expertiseLevels: Record<string, number>;
    totalKnowledgeTypes: number;
    domains: Domain[];
  }> {
    const domains = Array.from(this.domains.values());
    
    const domainsByCategory = domains.reduce((acc, domain) => {
      acc[domain.category] = (acc[domain.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const expertiseLevels = domains.reduce((acc, domain) => {
      acc[domain.expertiseLevel] = (acc[domain.expertiseLevel] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const allKnowledgeTypes = new Set(domains.flatMap(d => d.knowledgeTypes));

    return {
      domainCount: domains.length,
      domainsByCategory,
      expertiseLevels,
      totalKnowledgeTypes: allKnowledgeTypes.size,
      domains,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const embeddingHealth = await this.embeddingService.healthCheck();
      
      return {
        healthy: embeddingHealth.healthy,
        details: {
          embeddingService: embeddingHealth,
          domainOrganizer: {
            initialized: true,
            domainCount: this.domains.size,
            defaultDomainsLoaded: this.domains.has('general'),
          },
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'domain-knowledge-organizer',
        },
      };
    }
  }
}