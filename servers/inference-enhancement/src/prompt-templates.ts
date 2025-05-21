import { getLogger } from '../../../shared/logger.js';
import { MCPError, ErrorCode, ErrorSeverity } from '../../../shared/error-handler.js';
import { withPerformanceMonitoring } from '../../../shared/performance-monitor.js';
import { KnowledgeChunk, KnowledgeContext } from './domain-knowledge.js';
import { ReasoningChain, ReasoningStep } from './reasoning-engine.js';

const logger = getLogger('PromptTemplates');

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  domain: string;
  category: 'analysis' | 'synthesis' | 'evaluation' | 'application' | 'reasoning' | 'explanation';
  variables: PromptVariable[];
  template: string;
  examples: PromptExample[];
  metadata: Record<string, any>;
}

export interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  defaultValue?: any;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    options?: any[];
  };
}

export interface PromptExample {
  title: string;
  description: string;
  variables: Record<string, any>;
  expectedOutput: string;
  confidence: number;
}

export interface PromptContext {
  problem: string;
  domain: string;
  knowledgeContext: KnowledgeContext;
  reasoningChain?: ReasoningChain;
  userPreferences?: Record<string, any>;
  constraints?: Record<string, any>;
}

export interface GeneratedPrompt {
  templateId: string;
  prompt: string;
  variables: Record<string, any>;
  metadata: {
    domain: string;
    category: string;
    confidence: number;
    generatedAt: Date;
    context: PromptContext;
  };
}

export const SCIENCE_TEMPLATES: PromptTemplate[] = [
  {
    id: 'scientific-analysis',
    name: 'Scientific Analysis Template',
    description: 'Template for systematic scientific analysis and hypothesis testing',
    domain: 'science',
    category: 'analysis',
    variables: [
      {
        name: 'phenomenon',
        type: 'string',
        required: true,
        description: 'The phenomenon or problem to analyze',
        constraints: { minLength: 10, maxLength: 500 }
      },
      {
        name: 'observations',
        type: 'array',
        required: true,
        description: 'List of relevant observations or data points'
      },
      {
        name: 'hypothesis',
        type: 'string',
        required: false,
        description: 'Existing hypothesis to test or validate'
      },
      {
        name: 'methodology',
        type: 'string',
        required: false,
        description: 'Preferred analysis methodology',
        defaultValue: 'empirical'
      }
    ],
    template: `
Conduct a systematic scientific analysis of the following phenomenon:

**Phenomenon:** {{phenomenon}}

**Available Observations:**
{{#each observations}}
- {{this}}
{{/each}}

{{#if hypothesis}}
**Hypothesis to Test:** {{hypothesis}}
{{/if}}

**Analysis Framework:**
1. **Observation Summary**: Synthesize the key patterns and anomalies in the data
2. **Hypothesis Formation**: {{#if hypothesis}}Evaluate the provided hypothesis{{else}}Generate testable hypotheses{{/if}}
3. **Methodology**: Apply {{methodology}} analysis principles
4. **Evidence Evaluation**: Assess the strength and reliability of supporting evidence
5. **Scientific Reasoning**: Apply logical inference and scientific method
6. **Conclusions**: Draw evidence-based conclusions with confidence intervals
7. **Future Research**: Identify gaps and suggest further investigation

**Output Requirements:**
- Use scientific terminology and principles
- Cite evidence with confidence levels
- Acknowledge limitations and uncertainties
- Provide testable predictions
- Follow peer-review standards for rigor
`,
    examples: [
      {
        title: 'Climate Change Analysis',
        description: 'Analyzing temperature trend data',
        variables: {
          phenomenon: 'Global temperature increases over the past century',
          observations: [
            'Average global temperature increased by 1.1°C since 1880',
            'Arctic ice coverage decreased by 13% per decade',
            'Ocean pH levels decreased by 0.1 units',
            'CO2 levels increased from 280ppm to 415ppm'
          ],
          methodology: 'correlation analysis'
        },
        expectedOutput: 'Systematic analysis with hypothesis testing and evidence evaluation',
        confidence: 0.9
      }
    ],
    metadata: {
      complexity: 'high',
      expertise: 'advanced',
      timeEstimate: '15-30 minutes'
    }
  },
  {
    id: 'experimental-design',
    name: 'Experimental Design Template',
    description: 'Template for designing scientific experiments and studies',
    domain: 'science',
    category: 'application',
    variables: [
      {
        name: 'research_question',
        type: 'string',
        required: true,
        description: 'The primary research question to investigate'
      },
      {
        name: 'variables',
        type: 'object',
        required: true,
        description: 'Independent and dependent variables'
      },
      {
        name: 'constraints',
        type: 'array',
        required: false,
        description: 'Practical constraints and limitations'
      }
    ],
    template: `
Design a rigorous scientific experiment to answer:

**Research Question:** {{research_question}}

**Variables:**
- **Independent Variables:** {{variables.independent}}
- **Dependent Variables:** {{variables.dependent}}
- **Control Variables:** {{variables.control}}

{{#if constraints}}
**Constraints:**
{{#each constraints}}
- {{this}}
{{/each}}
{{/if}}

**Experimental Design Framework:**
1. **Hypothesis Formulation**: State null and alternative hypotheses
2. **Sample Design**: Determine sample size, selection criteria, and randomization
3. **Methodology**: Detail procedures, instruments, and measurements
4. **Controls**: Identify control groups and variables to control
5. **Data Collection**: Specify data types, collection methods, and timeline
6. **Statistical Plan**: Define analysis methods and significance criteria
7. **Validity Considerations**: Address internal and external validity threats
8. **Ethical Considerations**: Identify ethical requirements and approvals needed

**Quality Assurance:**
- Peer review readiness
- Reproducibility requirements
- Bias minimization strategies
`,
    examples: [],
    metadata: {
      complexity: 'high',
      expertise: 'advanced'
    }
  }
];

export const TECHNOLOGY_TEMPLATES: PromptTemplate[] = [
  {
    id: 'technical-architecture',
    name: 'Technical Architecture Analysis',
    description: 'Template for analyzing and designing technical system architectures',
    domain: 'technology',
    category: 'analysis',
    variables: [
      {
        name: 'system_description',
        type: 'string',
        required: true,
        description: 'Description of the system to analyze or design'
      },
      {
        name: 'requirements',
        type: 'array',
        required: true,
        description: 'Functional and non-functional requirements'
      },
      {
        name: 'constraints',
        type: 'array',
        required: false,
        description: 'Technical and business constraints'
      },
      {
        name: 'scale_requirements',
        type: 'object',
        required: false,
        description: 'Performance and scalability requirements'
      }
    ],
    template: `
Analyze and design the technical architecture for:

**System:** {{system_description}}

**Requirements:**
{{#each requirements}}
- {{this}}
{{/each}}

{{#if constraints}}
**Constraints:**
{{#each constraints}}
- {{this}}
{{/each}}
{{/if}}

{{#if scale_requirements}}
**Scale Requirements:**
- **Users:** {{scale_requirements.users}}
- **Throughput:** {{scale_requirements.throughput}}
- **Availability:** {{scale_requirements.availability}}
{{/if}}

**Architecture Analysis Framework:**
1. **System Decomposition**: Break down into logical components and services
2. **Component Design**: Define interfaces, responsibilities, and interactions
3. **Data Architecture**: Design data models, storage, and flow patterns
4. **Integration Patterns**: Specify communication protocols and APIs
5. **Scalability Strategy**: Design for horizontal and vertical scaling
6. **Reliability & Resilience**: Implement fault tolerance and recovery mechanisms
7. **Security Architecture**: Address authentication, authorization, and data protection
8. **Performance Optimization**: Identify bottlenecks and optimization strategies
9. **Technology Stack**: Select appropriate technologies and frameworks
10. **Deployment Strategy**: Design CI/CD and infrastructure requirements

**Technical Deliverables:**
- Architecture diagrams and documentation
- Technology recommendations with rationale
- Risk assessment and mitigation strategies
- Implementation roadmap with milestones
`,
    examples: [
      {
        title: 'E-commerce Platform',
        description: 'Designing a scalable e-commerce system',
        variables: {
          system_description: 'Multi-tenant e-commerce platform with inventory management',
          requirements: [
            'Support 10,000 concurrent users',
            'Real-time inventory updates',
            'Payment processing integration',
            'Mobile-responsive interface'
          ],
          scale_requirements: {
            users: '10,000 concurrent',
            throughput: '1,000 orders/minute',
            availability: '99.9%'
          }
        },
        expectedOutput: 'Comprehensive architecture with microservices design',
        confidence: 0.8
      }
    ],
    metadata: {
      complexity: 'high',
      expertise: 'senior'
    }
  },
  {
    id: 'algorithm-optimization',
    name: 'Algorithm Analysis and Optimization',
    description: 'Template for analyzing algorithm performance and optimization strategies',
    domain: 'technology',
    category: 'evaluation',
    variables: [
      {
        name: 'algorithm_description',
        type: 'string',
        required: true,
        description: 'Description of the algorithm to analyze'
      },
      {
        name: 'current_complexity',
        type: 'string',
        required: false,
        description: 'Current time/space complexity'
      },
      {
        name: 'input_characteristics',
        type: 'object',
        required: true,
        description: 'Input size and distribution characteristics'
      }
    ],
    template: `
Analyze and optimize the following algorithm:

**Algorithm:** {{algorithm_description}}

{{#if current_complexity}}
**Current Complexity:** {{current_complexity}}
{{/if}}

**Input Characteristics:**
- **Size Range:** {{input_characteristics.size_range}}
- **Distribution:** {{input_characteristics.distribution}}
- **Constraints:** {{input_characteristics.constraints}}

**Optimization Analysis Framework:**
1. **Complexity Analysis**: Determine time and space complexity (best, average, worst case)
2. **Bottleneck Identification**: Profile and identify performance bottlenecks
3. **Algorithm Family Assessment**: Compare with alternative algorithmic approaches
4. **Data Structure Optimization**: Evaluate optimal data structures for operations
5. **Caching Strategies**: Identify opportunities for memoization and caching
6. **Parallelization Potential**: Assess parallel and concurrent execution opportunities
7. **Trade-off Analysis**: Evaluate time vs. space vs. complexity trade-offs
8. **Implementation Optimization**: Suggest low-level optimizations and best practices

**Optimization Recommendations:**
- Specific optimization techniques with impact estimates
- Alternative algorithms with complexity comparisons
- Implementation guidelines and code patterns
- Benchmarking and testing strategies
`,
    examples: [],
    metadata: {
      complexity: 'high',
      expertise: 'senior'
    }
  }
];

export const BUSINESS_TEMPLATES: PromptTemplate[] = [
  {
    id: 'strategic-analysis',
    name: 'Business Strategic Analysis',
    description: 'Template for comprehensive business strategy analysis and planning',
    domain: 'business',
    category: 'analysis',
    variables: [
      {
        name: 'business_context',
        type: 'string',
        required: true,
        description: 'Business situation or strategic challenge'
      },
      {
        name: 'market_data',
        type: 'array',
        required: false,
        description: 'Relevant market data and trends'
      },
      {
        name: 'objectives',
        type: 'array',
        required: true,
        description: 'Business objectives and goals'
      },
      {
        name: 'timeframe',
        type: 'string',
        required: false,
        description: 'Strategic planning timeframe',
        defaultValue: '12 months'
      }
    ],
    template: `
Conduct a comprehensive strategic analysis for:

**Business Context:** {{business_context}}

**Strategic Objectives:**
{{#each objectives}}
- {{this}}
{{/each}}

**Planning Timeframe:** {{timeframe}}

{{#if market_data}}
**Market Intelligence:**
{{#each market_data}}
- {{this}}
{{/each}}
{{/if}}

**Strategic Analysis Framework:**
1. **Situation Analysis**: Current position assessment using SWOT analysis
2. **Market Analysis**: Industry trends, competitive landscape, and market dynamics
3. **Stakeholder Analysis**: Identify key stakeholders and their interests
4. **Opportunity Assessment**: Evaluate market opportunities and strategic options
5. **Risk Analysis**: Identify strategic risks and mitigation strategies
6. **Resource Evaluation**: Assess capabilities, resources, and constraints
7. **Strategic Options**: Generate and evaluate alternative strategic approaches
8. **Implementation Planning**: Develop action plans with timelines and milestones
9. **Success Metrics**: Define KPIs and measurement frameworks
10. **Contingency Planning**: Prepare scenarios and adaptive strategies

**Business Deliverables:**
- Executive summary with key recommendations
- Strategic roadmap with priorities and timelines
- Financial projections and resource requirements
- Risk assessment with mitigation plans
- Implementation guidelines and success metrics
`,
    examples: [
      {
        title: 'Digital Transformation',
        description: 'Analyzing digital transformation strategy for traditional retail',
        variables: {
          business_context: 'Traditional retail company seeking digital transformation',
          objectives: [
            'Increase online revenue by 50%',
            'Improve customer experience',
            'Reduce operational costs by 20%'
          ],
          market_data: [
            'E-commerce growing at 15% annually',
            'Customer preference shifting to omnichannel',
            'Competition from digital-native brands'
          ],
          timeframe: '24 months'
        },
        expectedOutput: 'Comprehensive strategic plan with digital roadmap',
        confidence: 0.85
      }
    ],
    metadata: {
      complexity: 'high',
      expertise: 'senior'
    }
  },
  {
    id: 'roi-analysis',
    name: 'ROI and Investment Analysis',
    description: 'Template for financial return on investment analysis',
    domain: 'business',
    category: 'evaluation',
    variables: [
      {
        name: 'investment_description',
        type: 'string',
        required: true,
        description: 'Description of the investment or project'
      },
      {
        name: 'costs',
        type: 'object',
        required: true,
        description: 'Investment costs breakdown'
      },
      {
        name: 'benefits',
        type: 'array',
        required: true,
        description: 'Expected benefits and returns'
      },
      {
        name: 'timeframe',
        type: 'string',
        required: true,
        description: 'Analysis timeframe'
      }
    ],
    template: `
Conduct comprehensive ROI analysis for:

**Investment:** {{investment_description}}

**Cost Structure:**
- **Initial Investment:** {{costs.initial}}
- **Ongoing Costs:** {{costs.ongoing}}
- **Hidden Costs:** {{costs.hidden}}

**Expected Benefits:**
{{#each benefits}}
- {{this}}
{{/each}}

**Analysis Timeframe:** {{timeframe}}

**Financial Analysis Framework:**
1. **Cost-Benefit Analysis**: Quantify all costs and benefits over the timeframe
2. **ROI Calculation**: Calculate multiple ROI metrics (simple, annualized, risk-adjusted)
3. **NPV Analysis**: Net present value calculation with appropriate discount rates
4. **Payback Period**: Determine break-even timeline and cash flow patterns
5. **Sensitivity Analysis**: Test assumptions and identify key success factors
6. **Risk Assessment**: Quantify financial risks and probability scenarios
7. **Opportunity Cost**: Compare with alternative investment options
8. **Total Cost of Ownership**: Include all direct and indirect costs

**Financial Deliverables:**
- ROI summary with multiple calculation methods
- Cash flow projections and break-even analysis
- Risk assessment with scenario modeling
- Recommendations with implementation priorities
`,
    examples: [],
    metadata: {
      complexity: 'medium',
      expertise: 'intermediate'
    }
  }
];

export const GENERAL_TEMPLATES: PromptTemplate[] = [
  {
    id: 'problem-solving',
    name: 'General Problem Solving',
    description: 'Universal template for structured problem solving',
    domain: 'general',
    category: 'reasoning',
    variables: [
      {
        name: 'problem_statement',
        type: 'string',
        required: true,
        description: 'Clear description of the problem to solve'
      },
      {
        name: 'context',
        type: 'array',
        required: false,
        description: 'Relevant context and background information'
      },
      {
        name: 'constraints',
        type: 'array',
        required: false,
        description: 'Known constraints and limitations'
      },
      {
        name: 'success_criteria',
        type: 'array',
        required: false,
        description: 'Criteria for successful solution'
      }
    ],
    template: `
Apply structured problem-solving methodology to:

**Problem:** {{problem_statement}}

{{#if context}}
**Context:**
{{#each context}}
- {{this}}
{{/each}}
{{/if}}

{{#if constraints}}
**Constraints:**
{{#each constraints}}
- {{this}}
{{/each}}
{{/if}}

{{#if success_criteria}}
**Success Criteria:**
{{#each success_criteria}}
- {{this}}
{{/each}}
{{/if}}

**Problem-Solving Framework:**
1. **Problem Definition**: Clarify and decompose the problem into manageable components
2. **Information Gathering**: Identify what information is known, unknown, and needed
3. **Root Cause Analysis**: Determine underlying causes and contributing factors
4. **Solution Generation**: Brainstorm multiple potential solutions and approaches
5. **Option Evaluation**: Assess solutions against criteria, feasibility, and constraints
6. **Solution Design**: Develop detailed implementation plan for selected approach
7. **Risk Assessment**: Identify potential risks and mitigation strategies
8. **Implementation Planning**: Create actionable steps with timelines and resources
9. **Monitoring Strategy**: Define metrics and checkpoints for progress tracking
10. **Contingency Planning**: Prepare alternative approaches and fallback options

**Solution Deliverables:**
- Problem breakdown and analysis
- Recommended solution with clear rationale
- Implementation roadmap with milestones
- Risk assessment and contingency plans
`,
    examples: [
      {
        title: 'Resource Allocation',
        description: 'Optimizing limited resources across competing priorities',
        variables: {
          problem_statement: 'Allocate limited budget across multiple high-priority projects',
          context: [
            'Budget reduced by 30% from previous year',
            'Five projects competing for resources',
            'Each project has different ROI potential'
          ],
          constraints: [
            'Must maintain minimum staffing levels',
            'Cannot delay critical infrastructure projects',
            'Need to show results within 6 months'
          ],
          success_criteria: [
            'Maximize overall ROI',
            'Maintain operational continuity',
            'Achieve measurable progress on all projects'
          ]
        },
        expectedOutput: 'Systematic analysis with prioritized allocation strategy',
        confidence: 0.8
      }
    ],
    metadata: {
      complexity: 'medium',
      expertise: 'intermediate'
    }
  }
];

export class PromptTemplateEngine {
  private templates: Map<string, PromptTemplate> = new Map();
  private templatesByDomain: Map<string, PromptTemplate[]> = new Map();
  private templatesByCategory: Map<string, PromptTemplate[]> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates(): void {
    const allTemplates = [
      ...SCIENCE_TEMPLATES,
      ...TECHNOLOGY_TEMPLATES,
      ...BUSINESS_TEMPLATES,
      ...GENERAL_TEMPLATES,
    ];

    for (const template of allTemplates) {
      this.templates.set(template.id, template);
      
      // Index by domain
      if (!this.templatesByDomain.has(template.domain)) {
        this.templatesByDomain.set(template.domain, []);
      }
      this.templatesByDomain.get(template.domain)!.push(template);
      
      // Index by category
      if (!this.templatesByCategory.has(template.category)) {
        this.templatesByCategory.set(template.category, []);
      }
      this.templatesByCategory.get(template.category)!.push(template);
    }

    logger.info('Initialized prompt templates', {
      totalTemplates: this.templates.size,
      domains: Array.from(this.templatesByDomain.keys()),
      categories: Array.from(this.templatesByCategory.keys()),
    });
  }

  @withPerformanceMonitoring('prompt-templates.generate')
  async generatePrompt(
    templateId: string,
    variables: Record<string, any>,
    context?: Partial<PromptContext>
  ): Promise<GeneratedPrompt> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new MCPError({
        code: ErrorCode.NOT_FOUND,
        message: `Template not found: ${templateId}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'generatePrompt', templateId },
      });
    }

    // Validate variables
    this.validateVariables(template, variables);

    // Compile template with variables
    const compiledPrompt = this.compileTemplate(template.template, variables);

    // Calculate confidence based on variable completeness and context
    const confidence = this.calculatePromptConfidence(template, variables, context);

    const result: GeneratedPrompt = {
      templateId,
      prompt: compiledPrompt,
      variables,
      metadata: {
        domain: template.domain,
        category: template.category,
        confidence,
        generatedAt: new Date(),
        context: context as PromptContext,
      },
    };

    logger.info('Generated prompt from template', {
      templateId,
      domain: template.domain,
      category: template.category,
      confidence,
      promptLength: compiledPrompt.length,
    });

    return result;
  }

  @withPerformanceMonitoring('prompt-templates.select-best')
  async selectBestTemplate(context: PromptContext): Promise<PromptTemplate> {
    const candidates = this.findCandidateTemplates(context);
    
    if (candidates.length === 0) {
      // Fall back to general problem-solving template
      const generalTemplate = this.templates.get('problem-solving');
      if (!generalTemplate) {
        throw new MCPError({
          code: ErrorCode.NOT_FOUND,
          message: 'No suitable templates found and general template not available',
          severity: ErrorSeverity.HIGH,
          retryable: false,
          context: { operation: 'selectBestTemplate', domain: context.domain },
        });
      }
      return generalTemplate;
    }

    // Score templates based on context fit
    const scoredTemplates = candidates.map(template => ({
      template,
      score: this.scoreTemplateForContext(template, context),
    }));

    // Sort by score and return best match
    scoredTemplates.sort((a, b) => b.score - a.score);
    
    const bestTemplate = scoredTemplates[0].template;
    
    logger.info('Selected best template', {
      templateId: bestTemplate.id,
      domain: bestTemplate.domain,
      category: bestTemplate.category,
      score: scoredTemplates[0].score,
      alternatives: scoredTemplates.length - 1,
    });

    return bestTemplate;
  }

  private findCandidateTemplates(context: PromptContext): PromptTemplate[] {
    const candidates: PromptTemplate[] = [];
    
    // Primary: templates for exact domain
    const domainTemplates = this.templatesByDomain.get(context.domain) || [];
    candidates.push(...domainTemplates);
    
    // Secondary: general templates
    const generalTemplates = this.templatesByDomain.get('general') || [];
    candidates.push(...generalTemplates);
    
    // Tertiary: templates from related domains if needed
    if (candidates.length === 0) {
      for (const [domain, templates] of this.templatesByDomain) {
        if (domain !== context.domain && domain !== 'general') {
          candidates.push(...templates);
        }
      }
    }

    return candidates;
  }

  private scoreTemplateForContext(template: PromptTemplate, context: PromptContext): number {
    let score = 0;

    // Domain match (highest weight)
    if (template.domain === context.domain) {
      score += 0.5;
    } else if (template.domain === 'general') {
      score += 0.2;
    }

    // Category relevance based on problem type
    const problemType = this.inferProblemCategory(context.problem);
    if (template.category === problemType) {
      score += 0.3;
    }

    // Knowledge context fit
    if (context.knowledgeContext) {
      const contextTypes = context.knowledgeContext.relevantChunks.map(c => c.domain);
      if (contextTypes.includes(template.domain)) {
        score += 0.1;
      }
    }

    // Template complexity vs context
    const problemComplexity = this.assessProblemComplexity(context.problem);
    const templateComplexity = template.metadata.complexity || 'medium';
    if (this.complexityMatch(problemComplexity, templateComplexity)) {
      score += 0.1;
    }

    return score;
  }

  private inferProblemCategory(problem: string): string {
    const problemLower = problem.toLowerCase();
    
    if (problemLower.includes('analyze') || problemLower.includes('examine') || problemLower.includes('investigate')) {
      return 'analysis';
    } else if (problemLower.includes('combine') || problemLower.includes('integrate') || problemLower.includes('synthesize')) {
      return 'synthesis';
    } else if (problemLower.includes('evaluate') || problemLower.includes('assess') || problemLower.includes('compare')) {
      return 'evaluation';
    } else if (problemLower.includes('implement') || problemLower.includes('apply') || problemLower.includes('execute')) {
      return 'application';
    } else if (problemLower.includes('explain') || problemLower.includes('why') || problemLower.includes('how')) {
      return 'explanation';
    } else {
      return 'reasoning';
    }
  }

  private assessProblemComplexity(problem: string): string {
    const length = problem.length;
    const complexityIndicators = [
      'multiple', 'complex', 'comprehensive', 'systematic', 'advanced',
      'intricate', 'sophisticated', 'multifaceted', 'interdisciplinary'
    ];
    
    const hasComplexityIndicators = complexityIndicators.some(indicator => 
      problem.toLowerCase().includes(indicator)
    );

    if (length > 200 || hasComplexityIndicators) {
      return 'high';
    } else if (length > 100) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private complexityMatch(problemComplexity: string, templateComplexity: string): boolean {
    const complexityOrder = ['low', 'medium', 'high'];
    const problemLevel = complexityOrder.indexOf(problemComplexity);
    const templateLevel = complexityOrder.indexOf(templateComplexity);
    
    // Templates should match or be slightly more sophisticated than the problem
    return templateLevel >= problemLevel && templateLevel <= problemLevel + 1;
  }

  private validateVariables(template: PromptTemplate, variables: Record<string, any>): void {
    const errors: string[] = [];

    for (const variable of template.variables) {
      const value = variables[variable.name];
      
      // Check required variables
      if (variable.required && (value === undefined || value === null)) {
        errors.push(`Required variable '${variable.name}' is missing`);
        continue;
      }

      // Skip validation for undefined optional variables
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      if (!this.validateVariableType(value, variable.type)) {
        errors.push(`Variable '${variable.name}' has invalid type. Expected ${variable.type}`);
      }

      // Constraint validation
      if (variable.constraints) {
        const constraintErrors = this.validateConstraints(value, variable.constraints, variable.name);
        errors.push(...constraintErrors);
      }
    }

    if (errors.length > 0) {
      throw new MCPError({
        code: ErrorCode.VALIDATION_ERROR,
        message: `Template variable validation failed: ${errors.join(', ')}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'validateVariables', templateId: template.id, errors },
      });
    }
  }

  private validateVariableType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'array':
        return Array.isArray(value);
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      default:
        return true;
    }
  }

  private validateConstraints(
    value: any,
    constraints: NonNullable<PromptVariable['constraints']>,
    variableName: string
  ): string[] {
    const errors: string[] = [];

    if (typeof value === 'string') {
      if (constraints.minLength && value.length < constraints.minLength) {
        errors.push(`${variableName} must be at least ${constraints.minLength} characters`);
      }
      if (constraints.maxLength && value.length > constraints.maxLength) {
        errors.push(`${variableName} must be no more than ${constraints.maxLength} characters`);
      }
      if (constraints.pattern && !new RegExp(constraints.pattern).test(value)) {
        errors.push(`${variableName} does not match required pattern`);
      }
    }

    if (constraints.options && !constraints.options.includes(value)) {
      errors.push(`${variableName} must be one of: ${constraints.options.join(', ')}`);
    }

    return errors;
  }

  private compileTemplate(template: string, variables: Record<string, any>): string {
    let compiled = template;
    
    // Simple Handlebars-style template compilation
    // Replace {{variable}} with values
    compiled = compiled.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      const value = variables[varName];
      return value !== undefined ? String(value) : match;
    });

    // Handle {{#if variable}} blocks
    compiled = compiled.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, varName, content) => {
      const value = variables[varName];
      return value ? content : '';
    });

    // Handle {{#each array}} blocks
    compiled = compiled.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (match, varName, content) => {
      const array = variables[varName];
      if (!Array.isArray(array)) return '';
      
      return array.map(item => {
        return content.replace(/\{\{this\}\}/g, String(item));
      }).join('\n');
    });

    // Handle nested object references like {{object.property}}
    compiled = compiled.replace(/\{\{(\w+)\.(\w+)\}\}/g, (match, objName, propName) => {
      const obj = variables[objName];
      if (obj && typeof obj === 'object' && propName in obj) {
        return String(obj[propName]);
      }
      return match;
    });

    return compiled.trim();
  }

  private calculatePromptConfidence(
    template: PromptTemplate,
    variables: Record<string, any>,
    context?: Partial<PromptContext>
  ): number {
    let confidence = 0.7; // Base confidence

    // Variable completeness
    const requiredVars = template.variables.filter(v => v.required).length;
    const providedRequiredVars = template.variables.filter(v => v.required && variables[v.name] !== undefined).length;
    const requiredCompleteness = requiredVars > 0 ? providedRequiredVars / requiredVars : 1;
    confidence *= requiredCompleteness;

    // Optional variable completeness bonus
    const optionalVars = template.variables.filter(v => !v.required).length;
    const providedOptionalVars = template.variables.filter(v => !v.required && variables[v.name] !== undefined).length;
    const optionalBonus = optionalVars > 0 ? (providedOptionalVars / optionalVars) * 0.1 : 0;
    confidence += optionalBonus;

    // Context alignment
    if (context?.domain === template.domain) {
      confidence += 0.1;
    }

    // Template maturity (based on examples)
    if (template.examples.length > 0) {
      confidence += 0.05;
    }

    return Math.min(1.0, confidence);
  }

  getTemplate(templateId: string): PromptTemplate | undefined {
    return this.templates.get(templateId);
  }

  getTemplatesByDomain(domain: string): PromptTemplate[] {
    return this.templatesByDomain.get(domain) || [];
  }

  getTemplatesByCategory(category: string): PromptTemplate[] {
    return this.templatesByCategory.get(category) || [];
  }

  listAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  addTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
    
    // Update indexes
    if (!this.templatesByDomain.has(template.domain)) {
      this.templatesByDomain.set(template.domain, []);
    }
    this.templatesByDomain.get(template.domain)!.push(template);
    
    if (!this.templatesByCategory.has(template.category)) {
      this.templatesByCategory.set(template.category, []);
    }
    this.templatesByCategory.get(template.category)!.push(template);

    logger.info('Added custom prompt template', {
      templateId: template.id,
      domain: template.domain,
      category: template.category,
    });
  }

  async getTemplateStats(): Promise<{
    totalTemplates: number;
    domainDistribution: Record<string, number>;
    categoryDistribution: Record<string, number>;
    averageComplexity: string;
  }> {
    const domains = Array.from(this.templatesByDomain.entries()).reduce((acc, [domain, templates]) => {
      acc[domain] = templates.length;
      return acc;
    }, {} as Record<string, number>);

    const categories = Array.from(this.templatesByCategory.entries()).reduce((acc, [category, templates]) => {
      acc[category] = templates.length;
      return acc;
    }, {} as Record<string, number>);

    const complexities = Array.from(this.templates.values()).map(t => t.metadata.complexity || 'medium');
    const complexityMode = complexities.sort().reduce((acc, curr) => {
      acc[curr] = (acc[curr] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const averageComplexity = Object.entries(complexityMode).sort(([,a], [,b]) => b - a)[0]?.[0] || 'medium';

    return {
      totalTemplates: this.templates.size,
      domainDistribution: domains,
      categoryDistribution: categories,
      averageComplexity,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const stats = await this.getTemplateStats();
      
      return {
        healthy: stats.totalTemplates > 0,
        details: {
          ...stats,
          service: 'prompt-template-engine',
        },
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'prompt-template-engine',
        },
      };
    }
  }
}