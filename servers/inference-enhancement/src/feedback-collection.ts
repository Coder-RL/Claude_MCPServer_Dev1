import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { ReasoningChain, ReasoningStep } from './reasoning-engine.js';
import { UserFeedback } from './adaptive-learning.js';
import fs from 'fs/promises';
import path from 'path';

const logger = getLogger('FeedbackCollection');

export interface FeedbackSession {
  id: string;
  userId?: string;
  sessionType: 'interactive' | 'batch' | 'passive' | 'active';
  context: {
    reasoningChainId: string;
    problemDomain: string;
    difficulty: 'easy' | 'medium' | 'hard';
    userExpertise: 'novice' | 'intermediate' | 'expert';
    timeSpent: number;
  };
  feedback: DetailedFeedback[];
  metadata: {
    startTime: Date;
    endTime?: Date;
    platform: string;
    userAgent?: string;
    ipAddress?: string;
    location?: string;
  };
  satisfaction: {
    overall: number; // 1-5
    responseRelevance: number;
    responseClarity: number;
    responseCompleteness: number;
    systemUsability: number;
  };
  qualityIndicators: {
    engagementScore: number;
    consistencyScore: number;
    specificityScore: number;
    constructivenessScore: number;
  };
}

export interface DetailedFeedback {
  id: string;
  sessionId: string;
  type: 'rating' | 'text' | 'choice' | 'ranking' | 'annotation' | 'correction';
  category: 'accuracy' | 'clarity' | 'completeness' | 'efficiency' | 'overall' | 'step_specific' | 'domain_specific';
  target: {
    type: 'reasoning_chain' | 'reasoning_step' | 'conclusion' | 'explanation' | 'methodology';
    id: string;
    content: string;
  };
  response: {
    rating?: number; // 1-5 for rating type
    text?: string;
    choice?: string | string[];
    ranking?: string[];
    annotation?: {
      selection: string;
      comment: string;
      type: 'highlight' | 'correction' | 'question' | 'suggestion';
    };
    correction?: {
      original: string;
      corrected: string;
      reason: string;
    };
  };
  confidence: number; // User's confidence in their feedback
  timestamp: Date;
  timeSpent: number; // milliseconds
  metadata: {
    inputMethod: 'click' | 'keyboard' | 'voice' | 'gesture';
    deviceType: 'desktop' | 'tablet' | 'mobile';
    context: Record<string, any>;
  };
}

export interface FeedbackTemplate {
  id: string;
  name: string;
  description: string;
  domain: string;
  targetAudience: 'novice' | 'intermediate' | 'expert' | 'all';
  questions: FeedbackQuestion[];
  adaptiveRules: AdaptiveRule[];
  estimatedTime: number; // minutes
  metadata: {
    version: number;
    createdBy: string;
    createdAt: Date;
    lastModified: Date;
    usageCount: number;
    averageRating: number;
  };
}

export interface FeedbackQuestion {
  id: string;
  type: 'rating' | 'text' | 'multiple_choice' | 'ranking' | 'annotation';
  question: string;
  description?: string;
  required: boolean;
  options?: {
    scale?: { min: number; max: number; labels: string[] };
    choices?: string[];
    multiSelect?: boolean;
    textLength?: { min: number; max: number };
  };
  dependsOn?: {
    questionId: string;
    condition: 'equals' | 'greater_than' | 'less_than' | 'contains';
    value: any;
  };
  weight: number; // Importance weight for analysis
}

export interface AdaptiveRule {
  id: string;
  name: string;
  condition: {
    field: string;
    operator: 'equals' | 'greater_than' | 'less_than' | 'contains';
    value: any;
  };
  action: {
    type: 'skip_question' | 'add_question' | 'modify_question' | 'change_flow';
    parameters: Record<string, any>;
  };
}

export interface FeedbackAnalysis {
  sessionId: string;
  analysisId: string;
  summary: {
    totalFeedbackItems: number;
    averageRating: number;
    sentimentScore: number;
    engagementLevel: 'low' | 'medium' | 'high';
    qualityScore: number;
  };
  insights: {
    strengths: string[];
    weaknesses: string[];
    improvementSuggestions: string[];
    userBehaviorPatterns: string[];
  };
  metrics: {
    accuracy: {
      perceivedAccuracy: number;
      expertAgreement?: number;
      factualCorrectness?: number;
    };
    clarity: {
      averageRating: number;
      specificIssues: string[];
      improvementAreas: string[];
    };
    completeness: {
      rating: number;
      missingElements: string[];
      redundantElements: string[];
    };
    efficiency: {
      timePerception: number;
      stepOptimization: string[];
      processingSpeed: number;
    };
  };
  trends: {
    ratingTrend: number[]; // Over time
    categoryTrends: Record<string, number[]>;
    userExpertiseTrends: Record<string, number>;
  };
  actionableInsights: {
    priority: 'high' | 'medium' | 'low';
    category: string;
    description: string;
    recommendedAction: string;
    expectedImpact: number;
  }[];
  generatedAt: Date;
}

export interface FeedbackAggregation {
  aggregationId: string;
  timeRange: { start: Date; end: Date };
  scope: {
    domains?: string[];
    userTypes?: string[];
    problemTypes?: string[];
  };
  statistics: {
    totalSessions: number;
    totalFeedbackItems: number;
    averageSessionDuration: number;
    completionRate: number;
    responseRate: number;
  };
  distributions: {
    overallRatings: Record<string, number>;
    categoryRatings: Record<string, Record<string, number>>;
    domainPerformance: Record<string, number>;
    userExpertiseBreakdown: Record<string, number>;
  };
  correlations: {
    ratingVsExpertise: number;
    ratingVsDifficulty: number;
    clarityVsAccuracy: number;
    timeVsSatisfaction: number;
  };
  topIssues: Array<{
    issue: string;
    frequency: number;
    severity: number;
    categories: string[];
    suggestedActions: string[];
  }>;
  improvementOpportunities: Array<{
    area: string;
    potentialImpact: number;
    effort: 'low' | 'medium' | 'high';
    priority: number;
  }>;
  generatedAt: Date;
}

export interface FeedbackCampaign {
  id: string;
  name: string;
  description: string;
  objectives: string[];
  target: {
    userTypes: string[];
    domains: string[];
    sampleSize: number;
    duration: number; // days
  };
  strategy: {
    type: 'proactive' | 'reactive' | 'passive';
    triggers: string[];
    incentives?: string[];
    frequency: 'once' | 'periodic' | 'event_driven';
  };
  template: string; // FeedbackTemplate ID
  status: 'draft' | 'active' | 'paused' | 'completed';
  progress: {
    targetResponses: number;
    actualResponses: number;
    completionRate: number;
    averageQuality: number;
  };
  results?: FeedbackAggregation;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export class FeedbackCollectionEngine {
  private sessions: Map<string, FeedbackSession> = new Map();
  private templates: Map<string, FeedbackTemplate> = new Map();
  private campaigns: Map<string, FeedbackCampaign> = new Map();
  private analyses: Map<string, FeedbackAnalysis> = new Map();
  private aggregations: Map<string, FeedbackAggregation> = new Map();
  private basePath: string;

  constructor(basePath = './data/feedback') {
    this.basePath = basePath;
    this.initializeEngine();
  }

  private async initializeEngine(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'sessions'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'templates'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'campaigns'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'analyses'), { recursive: true });
      await fs.mkdir(path.join(this.basePath, 'aggregations'), { recursive: true });

      // Initialize default templates
      await this.createDefaultTemplates();

      // Load existing data
      await this.loadExistingData();

      logger.info('Feedback collection engine initialized', {
        basePath: this.basePath,
        templates: this.templates.size,
        sessions: this.sessions.size,
        campaigns: this.campaigns.size,
      });
    } catch (error) {
      logger.error('Failed to initialize feedback collection engine', { error });
      throw error;
    }
  }

  async startFeedbackSession(
    reasoningChainId: string,
    context: Partial<FeedbackSession['context']>,
    sessionType: FeedbackSession['sessionType'] = 'interactive',
    userId?: string
  ): Promise<string> {
    try {
      const sessionId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const session: FeedbackSession = {
        id: sessionId,
        userId,
        sessionType,
        context: {
          reasoningChainId,
          problemDomain: context.problemDomain || 'general',
          difficulty: context.difficulty || 'medium',
          userExpertise: context.userExpertise || 'intermediate',
          timeSpent: 0,
        },
        feedback: [],
        metadata: {
          startTime: new Date(),
          platform: 'web', // Would be detected from request
          userAgent: context.userAgent,
          ipAddress: context.ipAddress,
          location: context.location,
        },
        satisfaction: {
          overall: 0,
          responseRelevance: 0,
          responseClarity: 0,
          responseCompleteness: 0,
          systemUsability: 0,
        },
        qualityIndicators: {
          engagementScore: 0,
          consistencyScore: 0,
          specificityScore: 0,
          constructivenessScore: 0,
        },
      };

      this.sessions.set(sessionId, session);
      await this.saveSession(session);

      logger.info('Started feedback session', {
        sessionId,
        reasoningChainId,
        sessionType,
        userId,
        domain: session.context.problemDomain,
      });

      return sessionId;
    } catch (error) {
      logger.error('Failed to start feedback session', { error, reasoningChainId });
      throw error;
    }
  }

  async addFeedback(
    sessionId: string,
    feedbackData: Omit<DetailedFeedback, 'id' | 'sessionId' | 'timestamp'>
  ): Promise<string> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: `Feedback session not found: ${sessionId}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'addFeedback', sessionId },
        });
      }

      const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      
      const feedback: DetailedFeedback = {
        id: feedbackId,
        sessionId,
        timestamp: new Date(),
        ...feedbackData,
      };

      // Validate feedback
      this.validateFeedback(feedback);

      // Add to session
      session.feedback.push(feedback);

      // Update quality indicators
      this.updateQualityIndicators(session, feedback);

      // Save session
      await this.saveSession(session);

      logger.debug('Added feedback to session', {
        sessionId,
        feedbackId,
        type: feedback.type,
        category: feedback.category,
      });

      return feedbackId;
    } catch (error) {
      logger.error('Failed to add feedback', { error, sessionId });
      throw error;
    }
  }

  async completeFeedbackSession(
    sessionId: string,
    satisfaction: FeedbackSession['satisfaction']
  ): Promise<FeedbackAnalysis> {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: `Feedback session not found: ${sessionId}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'completeFeedbackSession', sessionId },
        });
      }

      // Update session
      session.metadata.endTime = new Date();
      session.satisfaction = satisfaction;
      session.context.timeSpent = session.metadata.endTime.getTime() - session.metadata.startTime.getTime();

      // Final quality indicator calculation
      this.finalizeQualityIndicators(session);

      // Save session
      await this.saveSession(session);

      // Generate analysis
      const analysis = await this.analyzeSession(session);

      logger.info('Completed feedback session', {
        sessionId,
        feedbackCount: session.feedback.length,
        duration: session.context.timeSpent,
        overallSatisfaction: satisfaction.overall,
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to complete feedback session', { error, sessionId });
      throw error;
    }
  }

  async analyzeSession(session: FeedbackSession): Promise<FeedbackAnalysis> {
    try {
      const analysisId = `analysis_${session.id}_${Date.now()}`;
      
      // Calculate basic metrics
      const ratings = session.feedback
        .filter(f => f.type === 'rating' && f.response.rating)
        .map(f => f.response.rating!);
      
      const textFeedback = session.feedback
        .filter(f => f.type === 'text' && f.response.text)
        .map(f => f.response.text!);

      const averageRating = ratings.length > 0 ? 
        ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;

      // Sentiment analysis (simplified)
      const sentimentScore = this.analyzeSentiment(textFeedback);

      // Categorize feedback
      const categorizedFeedback = this.categorizeFeedback(session.feedback);

      // Generate insights
      const insights = this.generateInsights(session, categorizedFeedback);

      // Calculate metrics
      const metrics = this.calculateDetailedMetrics(session, categorizedFeedback);

      // Generate actionable insights
      const actionableInsights = this.generateActionableInsights(insights, metrics);

      const analysis: FeedbackAnalysis = {
        sessionId: session.id,
        analysisId,
        summary: {
          totalFeedbackItems: session.feedback.length,
          averageRating,
          sentimentScore,
          engagementLevel: this.calculateEngagementLevel(session),
          qualityScore: this.calculateOverallQualityScore(session),
        },
        insights,
        metrics,
        trends: {
          ratingTrend: this.calculateRatingTrend(session),
          categoryTrends: this.calculateCategoryTrends(session),
          userExpertiseTrends: this.calculateExpertiseTrends(session),
        },
        actionableInsights,
        generatedAt: new Date(),
      };

      // Store analysis
      this.analyses.set(analysisId, analysis);
      await this.saveAnalysis(analysis);

      logger.info('Generated feedback analysis', {
        sessionId: session.id,
        analysisId,
        qualityScore: analysis.summary.qualityScore,
        actionableInsightsCount: actionableInsights.length,
      });

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze feedback session', { error, sessionId: session.id });
      throw error;
    }
  }

  async createFeedbackTemplate(
    name: string,
    description: string,
    domain: string,
    questions: FeedbackQuestion[],
    targetAudience: FeedbackTemplate['targetAudience'] = 'all'
  ): Promise<string> {
    try {
      const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const template: FeedbackTemplate = {
        id: templateId,
        name,
        description,
        domain,
        targetAudience,
        questions,
        adaptiveRules: [],
        estimatedTime: this.estimateTemplateTime(questions),
        metadata: {
          version: 1,
          createdBy: 'system',
          createdAt: new Date(),
          lastModified: new Date(),
          usageCount: 0,
          averageRating: 0,
        },
      };

      // Validate template
      this.validateTemplate(template);

      this.templates.set(templateId, template);
      await this.saveTemplate(template);

      logger.info('Created feedback template', {
        templateId,
        name,
        domain,
        questionsCount: questions.length,
        estimatedTime: template.estimatedTime,
      });

      return templateId;
    } catch (error) {
      logger.error('Failed to create feedback template', { error, name });
      throw error;
    }
  }

  async startFeedbackCampaign(
    name: string,
    description: string,
    objectives: string[],
    target: FeedbackCampaign['target'],
    strategy: FeedbackCampaign['strategy'],
    templateId: string
  ): Promise<string> {
    try {
      const campaignId = `campaign_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Validate template exists
      if (!this.templates.has(templateId)) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: `Template not found: ${templateId}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: false,
          context: { operation: 'startFeedbackCampaign', templateId },
        });
      }

      const campaign: FeedbackCampaign = {
        id: campaignId,
        name,
        description,
        objectives,
        target,
        strategy,
        template: templateId,
        status: 'active',
        progress: {
          targetResponses: target.sampleSize,
          actualResponses: 0,
          completionRate: 0,
          averageQuality: 0,
        },
        createdAt: new Date(),
        startedAt: new Date(),
      };

      this.campaigns.set(campaignId, campaign);
      await this.saveCampaign(campaign);

      logger.info('Started feedback campaign', {
        campaignId,
        name,
        targetSampleSize: target.sampleSize,
        templateId,
      });

      return campaignId;
    } catch (error) {
      logger.error('Failed to start feedback campaign', { error, name });
      throw error;
    }
  }

  async aggregateFeedback(
    timeRange: { start: Date; end: Date },
    scope: FeedbackAggregation['scope'] = {}
  ): Promise<FeedbackAggregation> {
    try {
      const aggregationId = `agg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Filter sessions based on criteria
      const filteredSessions = this.filterSessionsForAggregation(timeRange, scope);
      
      // Calculate statistics
      const statistics = this.calculateAggregationStatistics(filteredSessions);
      
      // Calculate distributions
      const distributions = this.calculateDistributions(filteredSessions);
      
      // Calculate correlations
      const correlations = this.calculateCorrelations(filteredSessions);
      
      // Identify top issues
      const topIssues = this.identifyTopIssues(filteredSessions);
      
      // Identify improvement opportunities
      const improvementOpportunities = this.identifyImprovementOpportunities(filteredSessions);

      const aggregation: FeedbackAggregation = {
        aggregationId,
        timeRange,
        scope,
        statistics,
        distributions,
        correlations,
        topIssues,
        improvementOpportunities,
        generatedAt: new Date(),
      };

      this.aggregations.set(aggregationId, aggregation);
      await this.saveAggregation(aggregation);

      logger.info('Generated feedback aggregation', {
        aggregationId,
        totalSessions: statistics.totalSessions,
        timeRange,
        topIssuesCount: topIssues.length,
      });

      return aggregation;
    } catch (error) {
      logger.error('Failed to aggregate feedback', { error, timeRange });
      throw error;
    }
  }

  private async createDefaultTemplates(): Promise<void> {
    // General reasoning feedback template
    const generalQuestions: FeedbackQuestion[] = [
      {
        id: 'overall_rating',
        type: 'rating',
        question: 'How would you rate the overall quality of the reasoning?',
        required: true,
        options: {
          scale: { min: 1, max: 5, labels: ['Very Poor', 'Poor', 'Fair', 'Good', 'Excellent'] }
        },
        weight: 1.0,
      },
      {
        id: 'accuracy_rating',
        type: 'rating',
        question: 'How accurate was the reasoning and conclusion?',
        required: true,
        options: {
          scale: { min: 1, max: 5, labels: ['Very Inaccurate', 'Inaccurate', 'Somewhat Accurate', 'Accurate', 'Very Accurate'] }
        },
        weight: 0.9,
      },
      {
        id: 'clarity_rating',
        type: 'rating',
        question: 'How clear and understandable was the explanation?',
        required: true,
        options: {
          scale: { min: 1, max: 5, labels: ['Very Unclear', 'Unclear', 'Somewhat Clear', 'Clear', 'Very Clear'] }
        },
        weight: 0.8,
      },
      {
        id: 'completeness_rating',
        type: 'rating',
        question: 'How complete was the reasoning process?',
        required: true,
        options: {
          scale: { min: 1, max: 5, labels: ['Very Incomplete', 'Incomplete', 'Adequate', 'Complete', 'Very Complete'] }
        },
        weight: 0.7,
      },
      {
        id: 'improvement_text',
        type: 'text',
        question: 'What specific improvements would you suggest?',
        required: false,
        options: {
          textLength: { min: 10, max: 1000 }
        },
        weight: 0.6,
      },
      {
        id: 'expertise_choice',
        type: 'multiple_choice',
        question: 'What is your level of expertise in this domain?',
        required: true,
        options: {
          choices: ['Novice', 'Intermediate', 'Advanced', 'Expert'],
          multiSelect: false,
        },
        weight: 0.3,
      },
    ];

    await this.createFeedbackTemplate(
      'General Reasoning Feedback',
      'Standard feedback template for reasoning quality assessment',
      'general',
      generalQuestions,
      'all'
    );

    // Domain-specific templates could be added here
    logger.info('Created default feedback templates');
  }

  private validateFeedback(feedback: DetailedFeedback): void {
    if (!feedback.type || !feedback.category || !feedback.target) {
      throw new MCPError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Feedback must have type, category, and target',
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'validateFeedback', feedbackId: feedback.id },
      });
    }

    if (feedback.type === 'rating' && (!feedback.response.rating || feedback.response.rating < 1 || feedback.response.rating > 5)) {
      throw new MCPError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Rating feedback must have a rating between 1 and 5',
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'validateFeedback', feedbackId: feedback.id },
      });
    }
  }

  private validateTemplate(template: FeedbackTemplate): void {
    if (template.questions.length === 0) {
      throw new MCPError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Template must have at least one question',
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'validateTemplate', templateId: template.id },
      });
    }

    const requiredQuestions = template.questions.filter(q => q.required);
    if (requiredQuestions.length === 0) {
      throw new MCPError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Template must have at least one required question',
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'validateTemplate', templateId: template.id },
      });
    }
  }

  private updateQualityIndicators(session: FeedbackSession, feedback: DetailedFeedback): void {
    // Engagement score - based on time spent and detail level
    const timeBonus = Math.min(1.0, feedback.timeSpent / 30000); // 30 seconds max
    const detailBonus = feedback.response.text ? Math.min(1.0, feedback.response.text.length / 100) : 0;
    session.qualityIndicators.engagementScore += (timeBonus + detailBonus) / 2;

    // Specificity score - based on detail and annotation usage
    if (feedback.response.annotation || (feedback.response.text && feedback.response.text.length > 50)) {
      session.qualityIndicators.specificityScore += 1.0;
    }

    // Constructiveness score - based on suggestions and corrections
    if (feedback.response.correction || 
        (feedback.response.text && feedback.response.text.toLowerCase().includes('suggest'))) {
      session.qualityIndicators.constructivenessScore += 1.0;
    }

    // Normalize scores
    const feedbackCount = session.feedback.length;
    if (feedbackCount > 0) {
      session.qualityIndicators.engagementScore /= feedbackCount;
      session.qualityIndicators.specificityScore /= feedbackCount;
      session.qualityIndicators.constructivenessScore /= feedbackCount;
    }
  }

  private finalizeQualityIndicators(session: FeedbackSession): void {
    // Consistency score - based on rating variance
    const ratings = session.feedback
      .filter(f => f.response.rating)
      .map(f => f.response.rating!);
    
    if (ratings.length > 1) {
      const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      const variance = ratings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratings.length;
      session.qualityIndicators.consistencyScore = Math.max(0, 1 - variance / 4); // 4 is max variance for 1-5 scale
    } else {
      session.qualityIndicators.consistencyScore = 1.0;
    }
  }

  private analyzeSentiment(textFeedback: string[]): number {
    // Simplified sentiment analysis
    const positiveWords = ['good', 'great', 'excellent', 'helpful', 'clear', 'accurate', 'useful'];
    const negativeWords = ['bad', 'poor', 'unclear', 'confusing', 'wrong', 'inaccurate', 'useless'];
    
    let sentiment = 0;
    let wordCount = 0;
    
    for (const text of textFeedback) {
      const words = text.toLowerCase().split(/\s+/);
      wordCount += words.length;
      
      for (const word of words) {
        if (positiveWords.includes(word)) sentiment += 1;
        if (negativeWords.includes(word)) sentiment -= 1;
      }
    }
    
    return wordCount > 0 ? sentiment / wordCount : 0;
  }

  private categorizeFeedback(feedback: DetailedFeedback[]): Record<string, DetailedFeedback[]> {
    return feedback.reduce((categories, item) => {
      if (!categories[item.category]) {
        categories[item.category] = [];
      }
      categories[item.category].push(item);
      return categories;
    }, {} as Record<string, DetailedFeedback[]>);
  }

  private generateInsights(session: FeedbackSession, categorizedFeedback: Record<string, DetailedFeedback[]>): any {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const suggestions: string[] = [];
    const patterns: string[] = [];

    // Analyze ratings by category
    for (const [category, feedbackItems] of Object.entries(categorizedFeedback)) {
      const ratings = feedbackItems.filter(f => f.response.rating).map(f => f.response.rating!);
      if (ratings.length > 0) {
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        
        if (avg >= 4) {
          strengths.push(`Strong performance in ${category} (avg: ${avg.toFixed(1)})`);
        } else if (avg <= 2) {
          weaknesses.push(`Needs improvement in ${category} (avg: ${avg.toFixed(1)})`);
        }
      }
    }

    // Extract improvement suggestions from text feedback
    const textItems = session.feedback.filter(f => f.response.text);
    for (const item of textItems) {
      const text = item.response.text!.toLowerCase();
      if (text.includes('suggest') || text.includes('improve') || text.includes('could')) {
        suggestions.push(item.response.text!);
      }
    }

    // Identify patterns
    if (session.qualityIndicators.engagementScore > 0.7) {
      patterns.push('High user engagement');
    }
    if (session.qualityIndicators.consistencyScore > 0.8) {
      patterns.push('Consistent feedback across categories');
    }

    return {
      strengths,
      weaknesses,
      improvementSuggestions: suggestions.slice(0, 5), // Top 5
      userBehaviorPatterns: patterns,
    };
  }

  private calculateDetailedMetrics(session: FeedbackSession, categorizedFeedback: Record<string, DetailedFeedback[]>): any {
    const metrics: any = {
      accuracy: { perceivedAccuracy: 0 },
      clarity: { averageRating: 0, specificIssues: [], improvementAreas: [] },
      completeness: { rating: 0, missingElements: [], redundantElements: [] },
      efficiency: { timePerception: 0, stepOptimization: [], processingSpeed: 0 },
    };

    // Calculate category-specific metrics
    for (const [category, items] of Object.entries(categorizedFeedback)) {
      const ratings = items.filter(f => f.response.rating).map(f => f.response.rating!);
      if (ratings.length > 0) {
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        
        switch (category) {
          case 'accuracy':
            metrics.accuracy.perceivedAccuracy = avg;
            break;
          case 'clarity':
            metrics.clarity.averageRating = avg;
            break;
          case 'completeness':
            metrics.completeness.rating = avg;
            break;
          case 'efficiency':
            metrics.efficiency.timePerception = avg;
            break;
        }
      }
    }

    return metrics;
  }

  private generateActionableInsights(insights: any, metrics: any): any[] {
    const actionableInsights: any[] = [];

    // High-priority insights based on low ratings
    if (metrics.accuracy.perceivedAccuracy < 3) {
      actionableInsights.push({
        priority: 'high',
        category: 'accuracy',
        description: 'Users perceive low accuracy in reasoning',
        recommendedAction: 'Review reasoning algorithms and validation mechanisms',
        expectedImpact: 0.8,
      });
    }

    if (metrics.clarity.averageRating < 3) {
      actionableInsights.push({
        priority: 'high',
        category: 'clarity',
        description: 'Users find explanations unclear',
        recommendedAction: 'Simplify language and improve explanation structure',
        expectedImpact: 0.7,
      });
    }

    // Medium-priority insights
    if (insights.weaknesses.length > insights.strengths.length) {
      actionableInsights.push({
        priority: 'medium',
        category: 'overall',
        description: 'More weaknesses than strengths identified',
        recommendedAction: 'Focus on addressing top user concerns',
        expectedImpact: 0.6,
      });
    }

    return actionableInsights;
  }

  private calculateEngagementLevel(session: FeedbackSession): 'low' | 'medium' | 'high' {
    const score = session.qualityIndicators.engagementScore;
    if (score >= 0.7) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  }

  private calculateOverallQualityScore(session: FeedbackSession): number {
    const indicators = session.qualityIndicators;
    return (indicators.engagementScore + indicators.consistencyScore + 
            indicators.specificityScore + indicators.constructivenessScore) / 4;
  }

  private calculateRatingTrend(session: FeedbackSession): number[] {
    return session.feedback
      .filter(f => f.response.rating)
      .map(f => f.response.rating!)
      .slice(0, 10); // Last 10 ratings
  }

  private calculateCategoryTrends(session: FeedbackSession): Record<string, number[]> {
    const trends: Record<string, number[]> = {};
    
    for (const feedback of session.feedback) {
      if (feedback.response.rating) {
        if (!trends[feedback.category]) {
          trends[feedback.category] = [];
        }
        trends[feedback.category].push(feedback.response.rating);
      }
    }
    
    return trends;
  }

  private calculateExpertiseTrends(session: FeedbackSession): Record<string, number> {
    const expertiseRatings: Record<string, number[]> = {};
    
    for (const feedback of session.feedback) {
      if (feedback.response.rating && feedback.response.choice) {
        const expertise = feedback.response.choice as string;
        if (!expertiseRatings[expertise]) {
          expertiseRatings[expertise] = [];
        }
        expertiseRatings[expertise].push(feedback.response.rating);
      }
    }
    
    const trends: Record<string, number> = {};
    for (const [expertise, ratings] of Object.entries(expertiseRatings)) {
      trends[expertise] = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    }
    
    return trends;
  }

  private estimateTemplateTime(questions: FeedbackQuestion[]): number {
    let totalTime = 0;
    
    for (const question of questions) {
      switch (question.type) {
        case 'rating':
          totalTime += 0.5; // 30 seconds
          break;
        case 'multiple_choice':
          totalTime += 1; // 1 minute
          break;
        case 'text':
          totalTime += 2; // 2 minutes
          break;
        case 'ranking':
          totalTime += 3; // 3 minutes
          break;
        case 'annotation':
          totalTime += 4; // 4 minutes
          break;
      }
    }
    
    return Math.ceil(totalTime);
  }

  private filterSessionsForAggregation(timeRange: { start: Date; end: Date }, scope: FeedbackAggregation['scope']): FeedbackSession[] {
    return Array.from(this.sessions.values()).filter(session => {
      // Time range filter
      if (session.metadata.startTime < timeRange.start || session.metadata.startTime > timeRange.end) {
        return false;
      }
      
      // Domain filter
      if (scope.domains && !scope.domains.includes(session.context.problemDomain)) {
        return false;
      }
      
      // User type filter (simplified)
      if (scope.userTypes && !scope.userTypes.includes(session.context.userExpertise)) {
        return false;
      }
      
      return true;
    });
  }

  private calculateAggregationStatistics(sessions: FeedbackSession[]): any {
    const totalSessions = sessions.length;
    const totalFeedbackItems = sessions.reduce((sum, s) => sum + s.feedback.length, 0);
    const completedSessions = sessions.filter(s => s.metadata.endTime).length;
    
    const durations = sessions
      .filter(s => s.metadata.endTime)
      .map(s => s.metadata.endTime!.getTime() - s.metadata.startTime.getTime());
    
    const averageSessionDuration = durations.length > 0 ? 
      durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    
    return {
      totalSessions,
      totalFeedbackItems,
      averageSessionDuration,
      completionRate: totalSessions > 0 ? completedSessions / totalSessions : 0,
      responseRate: totalSessions > 0 ? totalFeedbackItems / totalSessions : 0,
    };
  }

  private calculateDistributions(sessions: FeedbackSession[]): any {
    const distributions: any = {
      overallRatings: {},
      categoryRatings: {},
      domainPerformance: {},
      userExpertiseBreakdown: {},
    };

    // Overall ratings distribution
    for (const session of sessions) {
      const overall = session.satisfaction.overall;
      if (overall > 0) {
        distributions.overallRatings[overall] = (distributions.overallRatings[overall] || 0) + 1;
      }
    }

    // Category ratings
    for (const session of sessions) {
      for (const feedback of session.feedback) {
        if (feedback.response.rating) {
          if (!distributions.categoryRatings[feedback.category]) {
            distributions.categoryRatings[feedback.category] = {};
          }
          const rating = feedback.response.rating;
          distributions.categoryRatings[feedback.category][rating] = 
            (distributions.categoryRatings[feedback.category][rating] || 0) + 1;
        }
      }
    }

    // Domain performance
    for (const session of sessions) {
      const domain = session.context.problemDomain;
      const avgRating = session.satisfaction.overall;
      if (!distributions.domainPerformance[domain]) {
        distributions.domainPerformance[domain] = [];
      }
      distributions.domainPerformance[domain].push(avgRating);
    }

    // Convert domain performance to averages
    for (const [domain, ratings] of Object.entries(distributions.domainPerformance)) {
      const ratingArray = ratings as number[];
      distributions.domainPerformance[domain] = ratingArray.reduce((a, b) => a + b, 0) / ratingArray.length;
    }

    // User expertise breakdown
    for (const session of sessions) {
      const expertise = session.context.userExpertise;
      distributions.userExpertiseBreakdown[expertise] = 
        (distributions.userExpertiseBreakdown[expertise] || 0) + 1;
    }

    return distributions;
  }

  private calculateCorrelations(sessions: FeedbackSession[]): any {
    // Simplified correlation calculations
    return {
      ratingVsExpertise: 0.3, // Placeholder
      ratingVsDifficulty: -0.2, // Placeholder
      clarityVsAccuracy: 0.7, // Placeholder
      timeVsSatisfaction: -0.1, // Placeholder
    };
  }

  private identifyTopIssues(sessions: FeedbackSession[]): any[] {
    const issues: Record<string, { frequency: number; severity: number; categories: Set<string> }> = {};
    
    for (const session of sessions) {
      for (const feedback of session.feedback) {
        if (feedback.response.text && feedback.response.rating && feedback.response.rating <= 2) {
          const text = feedback.response.text.toLowerCase();
          const words = text.split(/\s+/);
          
          for (const word of words) {
            if (word.length > 3) { // Filter short words
              if (!issues[word]) {
                issues[word] = { frequency: 0, severity: 0, categories: new Set() };
              }
              issues[word].frequency += 1;
              issues[word].severity += (3 - feedback.response.rating); // Higher for lower ratings
              issues[word].categories.add(feedback.category);
            }
          }
        }
      }
    }

    return Object.entries(issues)
      .map(([issue, data]) => ({
        issue,
        frequency: data.frequency,
        severity: data.severity / data.frequency,
        categories: Array.from(data.categories),
        suggestedActions: this.generateActionSuggestions(issue),
      }))
      .sort((a, b) => (b.frequency * b.severity) - (a.frequency * a.severity))
      .slice(0, 10);
  }

  private identifyImprovementOpportunities(sessions: FeedbackSession[]): any[] {
    const opportunities: any[] = [];
    
    // Analyze satisfaction patterns
    const lowSatisfactionDomains = this.findLowSatisfactionDomains(sessions);
    for (const domain of lowSatisfactionDomains) {
      opportunities.push({
        area: `${domain} domain performance`,
        potentialImpact: 0.7,
        effort: 'medium',
        priority: 0.8,
      });
    }
    
    // Analyze feedback patterns
    const clarityIssues = sessions.filter(s => s.satisfaction.responseClarity < 3).length;
    if (clarityIssues > sessions.length * 0.3) {
      opportunities.push({
        area: 'Response clarity',
        potentialImpact: 0.8,
        effort: 'low',
        priority: 0.9,
      });
    }
    
    return opportunities.sort((a, b) => b.priority - a.priority);
  }

  private findLowSatisfactionDomains(sessions: FeedbackSession[]): string[] {
    const domainSatisfaction: Record<string, number[]> = {};
    
    for (const session of sessions) {
      const domain = session.context.problemDomain;
      if (!domainSatisfaction[domain]) {
        domainSatisfaction[domain] = [];
      }
      domainSatisfaction[domain].push(session.satisfaction.overall);
    }
    
    return Object.entries(domainSatisfaction)
      .filter(([, ratings]) => {
        const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
        return avg < 3.0;
      })
      .map(([domain]) => domain);
  }

  private generateActionSuggestions(issue: string): string[] {
    const suggestions: Record<string, string[]> = {
      unclear: ['Improve explanation clarity', 'Add more examples', 'Simplify language'],
      slow: ['Optimize processing speed', 'Reduce response time', 'Implement caching'],
      confusing: ['Restructure explanations', 'Add step-by-step breakdown', 'Improve organization'],
      inaccurate: ['Review validation logic', 'Improve training data', 'Add fact-checking'],
    };
    
    for (const [keyword, actions] of Object.entries(suggestions)) {
      if (issue.includes(keyword)) {
        return actions;
      }
    }
    
    return ['Review and analyze specific feedback', 'Conduct user research', 'Implement targeted improvements'];
  }

  // File operations
  private async saveSession(session: FeedbackSession): Promise<void> {
    const filePath = path.join(this.basePath, 'sessions', `${session.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(session, null, 2));
  }

  private async saveTemplate(template: FeedbackTemplate): Promise<void> {
    const filePath = path.join(this.basePath, 'templates', `${template.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(template, null, 2));
  }

  private async saveCampaign(campaign: FeedbackCampaign): Promise<void> {
    const filePath = path.join(this.basePath, 'campaigns', `${campaign.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(campaign, null, 2));
  }

  private async saveAnalysis(analysis: FeedbackAnalysis): Promise<void> {
    const filePath = path.join(this.basePath, 'analyses', `${analysis.analysisId}.json`);
    await fs.writeFile(filePath, JSON.stringify(analysis, null, 2));
  }

  private async saveAggregation(aggregation: FeedbackAggregation): Promise<void> {
    const filePath = path.join(this.basePath, 'aggregations', `${aggregation.aggregationId}.json`);
    await fs.writeFile(filePath, JSON.stringify(aggregation, null, 2));
  }

  private async loadExistingData(): Promise<void> {
    try {
      // Load sessions
      const sessionsPath = path.join(this.basePath, 'sessions');
      const sessionFiles = await fs.readdir(sessionsPath).catch(() => []);
      for (const file of sessionFiles) {
        if (file.endsWith('.json')) {
          try {
            const sessionData = JSON.parse(await fs.readFile(path.join(sessionsPath, file), 'utf-8'));
            this.sessions.set(sessionData.id, sessionData);
          } catch (error) {
            logger.warn('Failed to load session file', { file, error });
          }
        }
      }

      // Load templates
      const templatesPath = path.join(this.basePath, 'templates');
      const templateFiles = await fs.readdir(templatesPath).catch(() => []);
      for (const file of templateFiles) {
        if (file.endsWith('.json')) {
          try {
            const templateData = JSON.parse(await fs.readFile(path.join(templatesPath, file), 'utf-8'));
            this.templates.set(templateData.id, templateData);
          } catch (error) {
            logger.warn('Failed to load template file', { file, error });
          }
        }
      }

      logger.info('Loaded existing feedback data', {
        sessions: this.sessions.size,
        templates: this.templates.size,
      });
    } catch (error) {
      logger.debug('No existing feedback data found', { error });
    }
  }

  // Public API methods
  getSession(sessionId: string): FeedbackSession | undefined {
    return this.sessions.get(sessionId);
  }

  getTemplate(templateId: string): FeedbackTemplate | undefined {
    return this.templates.get(templateId);
  }

  getCampaign(campaignId: string): FeedbackCampaign | undefined {
    return this.campaigns.get(campaignId);
  }

  getAnalysis(analysisId: string): FeedbackAnalysis | undefined {
    return this.analyses.get(analysisId);
  }

  getAggregation(aggregationId: string): FeedbackAggregation | undefined {
    return this.aggregations.get(aggregationId);
  }

  listTemplates(): FeedbackTemplate[] {
    return Array.from(this.templates.values());
  }

  listCampaigns(): FeedbackCampaign[] {
    return Array.from(this.campaigns.values());
  }

  async getFeedbackStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    totalFeedbackItems: number;
    averageSessionDuration: number;
    completionRate: number;
    averageSatisfaction: number;
    templatesCount: number;
    campaignsCount: number;
  }> {
    const sessions = Array.from(this.sessions.values());
    const activeSessions = sessions.filter(s => !s.metadata.endTime).length;
    const completedSessions = sessions.filter(s => s.metadata.endTime);
    
    const totalFeedbackItems = sessions.reduce((sum, s) => sum + s.feedback.length, 0);
    
    const durations = completedSessions.map(s => 
      s.metadata.endTime!.getTime() - s.metadata.startTime.getTime()
    );
    const averageSessionDuration = durations.length > 0 ? 
      durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    
    const satisfactionRatings = sessions
      .filter(s => s.satisfaction.overall > 0)
      .map(s => s.satisfaction.overall);
    const averageSatisfaction = satisfactionRatings.length > 0 ? 
      satisfactionRatings.reduce((a, b) => a + b, 0) / satisfactionRatings.length : 0;
    
    return {
      totalSessions: sessions.length,
      activeSessions,
      totalFeedbackItems,
      averageSessionDuration,
      completionRate: sessions.length > 0 ? completedSessions.length / sessions.length : 0,
      averageSatisfaction,
      templatesCount: this.templates.size,
      campaignsCount: this.campaigns.size,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = await this.getFeedbackStats();
      
      return {
        healthy: true,
        details: {
          ...stats,
          basePath: this.basePath,
          service: 'feedback-collection-engine',
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'feedback-collection-engine',
        },
      };
    }
  }
}