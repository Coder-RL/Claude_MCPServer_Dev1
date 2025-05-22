import { EventEmitter } from 'events';

export interface SDKDefinition {
  id: string;
  name: string;
  language: string;
  version: string;
  description: string;
  documentation: string;
  examples: CodeExample[];
  installation: InstallationInfo;
  apiReference: APIReference;
  dependencies: Dependency[];
  license: string;
  repository: string;
  maintainers: string[];
  lastUpdated: Date;
}

export interface CodeExample {
  id: string;
  title: string;
  description: string;
  code: string;
  language: string;
  category: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  runnable: boolean;
  outputs?: string;
}

export interface InstallationInfo {
  packageManager: string;
  command: string;
  requirements: Record<string, string>;
  environment: Record<string, string>;
  postInstall?: string[];
}

export interface APIReference {
  baseUrl: string;
  version: string;
  authentication: AuthenticationInfo;
  endpoints: EndpointInfo[];
  schemas: SchemaInfo[];
  errorCodes: ErrorCodeInfo[];
}

export interface AuthenticationInfo {
  type: 'none' | 'bearer' | 'basic' | 'api_key' | 'oauth2';
  description: string;
  parameters?: Record<string, string>;
}

export interface EndpointInfo {
  id: string;
  path: string;
  method: string;
  summary: string;
  description: string;
  parameters: ParameterInfo[];
  requestBody?: RequestBodyInfo;
  responses: ResponseInfo[];
  examples: EndpointExample[];
  tags: string[];
}

export interface ParameterInfo {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  type: string;
  description: string;
  example?: any;
  enum?: any[];
}

export interface RequestBodyInfo {
  description: string;
  required: boolean;
  contentType: string;
  schema: string;
  example?: any;
}

export interface ResponseInfo {
  statusCode: number;
  description: string;
  contentType: string;
  schema?: string;
  example?: any;
}

export interface EndpointExample {
  name: string;
  description: string;
  request: {
    parameters?: Record<string, any>;
    body?: any;
    headers?: Record<string, string>;
  };
  response: {
    statusCode: number;
    body: any;
    headers?: Record<string, string>;
  };
}

export interface SchemaInfo {
  name: string;
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  description: string;
  properties?: Record<string, PropertyInfo>;
  required?: string[];
  example?: any;
}

export interface PropertyInfo {
  type: string;
  description: string;
  example?: any;
  enum?: any[];
  format?: string;
}

export interface ErrorCodeInfo {
  code: number;
  name: string;
  description: string;
  example?: any;
}

export interface Dependency {
  name: string;
  version: string;
  type: 'runtime' | 'development' | 'peer';
  description?: string;
}

export interface IntegrationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  platform: string;
  framework?: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  prerequisites: string[];
  steps: IntegrationStep[];
  files: TemplateFile[];
  variables: TemplateVariable[];
  tags: string[];
  lastUpdated: Date;
}

export interface IntegrationStep {
  id: string;
  title: string;
  description: string;
  type: 'install' | 'configure' | 'code' | 'test' | 'deploy';
  content: string;
  codeBlocks?: CodeBlock[];
  commands?: string[];
  validation?: ValidationInfo;
}

export interface CodeBlock {
  language: string;
  filename?: string;
  code: string;
  highlight?: number[];
}

export interface ValidationInfo {
  type: 'command' | 'http' | 'file' | 'manual';
  instruction: string;
  expected?: string;
}

export interface TemplateFile {
  path: string;
  content: string;
  type: 'code' | 'config' | 'documentation' | 'test';
  templated: boolean;
}

export interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'choice';
  required: boolean;
  defaultValue?: any;
  choices?: string[];
  validation?: string;
}

export interface TutorialInfo {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedTime: string;
  prerequisites: string[];
  learningObjectives: string[];
  chapters: TutorialChapter[];
  resources: Resource[];
  quiz?: Quiz;
  tags: string[];
  author: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TutorialChapter {
  id: string;
  title: string;
  content: string;
  codeExamples: CodeExample[];
  exercises: Exercise[];
  nextChapter?: string;
  estimatedTime: string;
}

export interface Exercise {
  id: string;
  title: string;
  description: string;
  type: 'code' | 'quiz' | 'project';
  difficulty: 'easy' | 'medium' | 'hard';
  starterCode?: string;
  solution?: string;
  hints: string[];
  validation: ExerciseValidation;
}

export interface ExerciseValidation {
  type: 'unit_test' | 'output_match' | 'manual';
  criteria: string;
  testCases?: TestCase[];
}

export interface TestCase {
  input: any;
  expectedOutput: any;
  description: string;
}

export interface Resource {
  type: 'link' | 'file' | 'video' | 'book';
  title: string;
  url?: string;
  description?: string;
  duration?: string;
}

export interface Quiz {
  id: string;
  title: string;
  questions: QuizQuestion[];
  passingScore: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: 'multiple_choice' | 'true_false' | 'short_answer';
  options?: string[];
  correctAnswer: string | string[];
  explanation?: string;
}

export interface PlaygroundEnvironment {
  id: string;
  name: string;
  description: string;
  language: string;
  runtime: string;
  template: string;
  packages: string[];
  files: PlaygroundFile[];
  settings: PlaygroundSettings;
  features: PlaygroundFeature[];
}

export interface PlaygroundFile {
  path: string;
  content: string;
  readonly: boolean;
  hidden: boolean;
}

export interface PlaygroundSettings {
  theme: 'light' | 'dark';
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  autoSave: boolean;
  linting: boolean;
  formatting: boolean;
}

export interface PlaygroundFeature {
  name: string;
  enabled: boolean;
  config?: Record<string, any>;
}

export interface DeveloperMetrics {
  sdks: {
    total: number;
    byLanguage: Record<string, number>;
    downloads: Record<string, number>;
    popularity: { name: string; downloads: number }[];
  };
  documentation: {
    totalPages: number;
    totalExamples: number;
    averageRating: number;
    popularPages: { path: string; views: number }[];
  };
  tutorials: {
    total: number;
    completed: number;
    averageCompletionTime: number;
    popularTutorials: { id: string; completions: number }[];
  };
  playground: {
    totalEnvironments: number;
    activeSessions: number;
    totalExecutions: number;
    popularTemplates: { id: string; usage: number }[];
  };
  community: {
    totalUsers: number;
    activeUsers: number;
    contributions: number;
    issuesReported: number;
  };
}

export class DeveloperHub extends EventEmitter {
  private sdks = new Map<string, SDKDefinition>();
  private integrationTemplates = new Map<string, IntegrationTemplate>();
  private tutorials = new Map<string, TutorialInfo>();
  private playgrounds = new Map<string, PlaygroundEnvironment>();
  private codeExamples = new Map<string, CodeExample>();
  private apiDocumentation = new Map<string, APIReference>();

  constructor() {
    super();
    this.initializeBuiltInContent();
  }

  // SDK Management
  async registerSDK(sdk: SDKDefinition): Promise<boolean> {
    try {
      this.sdks.set(sdk.id, sdk);
      this.emit('sdkRegistered', { sdk });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'registerSDK', error });
      return false;
    }
  }

  async getSDKs(language?: string): Promise<SDKDefinition[]> {
    let sdks = Array.from(this.sdks.values());
    
    if (language) {
      sdks = sdks.filter(sdk => sdk.language === language);
    }

    return sdks.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  }

  async getSDK(id: string): Promise<SDKDefinition | undefined> {
    return this.sdks.get(id);
  }

  async updateSDK(id: string, updates: Partial<SDKDefinition>): Promise<boolean> {
    const sdk = this.sdks.get(id);
    if (!sdk) return false;

    Object.assign(sdk, updates, { lastUpdated: new Date() });
    this.emit('sdkUpdated', { sdk });
    return true;
  }

  // Integration Templates
  async createIntegrationTemplate(template: IntegrationTemplate): Promise<string> {
    const templateId = template.id || this.generateId();
    template.id = templateId;
    
    this.integrationTemplates.set(templateId, template);
    this.emit('integrationTemplateCreated', { template });
    
    return templateId;
  }

  async getIntegrationTemplates(
    category?: string,
    platform?: string,
    difficulty?: string
  ): Promise<IntegrationTemplate[]> {
    let templates = Array.from(this.integrationTemplates.values());

    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    if (platform) {
      templates = templates.filter(t => t.platform === platform);
    }

    if (difficulty) {
      templates = templates.filter(t => t.difficulty === difficulty);
    }

    return templates.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
  }

  async generateIntegrationCode(
    templateId: string,
    variables: Record<string, any>
  ): Promise<{ files: TemplateFile[]; instructions: string } | null> {
    const template = this.integrationTemplates.get(templateId);
    if (!template) return null;

    // Validate variables
    const validation = this.validateTemplateVariables(template, variables);
    if (!validation.valid) {
      throw new Error(`Variable validation failed: ${validation.error}`);
    }

    // Process template files
    const processedFiles = template.files.map(file => ({
      ...file,
      content: file.templated ? this.processTemplate(file.content, variables) : file.content
    }));

    // Generate step-by-step instructions
    const instructions = this.generateInstructions(template, variables);

    return { files: processedFiles, instructions };
  }

  // Tutorials
  async createTutorial(tutorial: TutorialInfo): Promise<string> {
    const tutorialId = tutorial.id || this.generateId();
    tutorial.id = tutorialId;
    
    this.tutorials.set(tutorialId, tutorial);
    this.emit('tutorialCreated', { tutorial });
    
    return tutorialId;
  }

  async getTutorials(
    category?: string,
    difficulty?: string,
    tags?: string[]
  ): Promise<TutorialInfo[]> {
    let tutorials = Array.from(this.tutorials.values());

    if (category) {
      tutorials = tutorials.filter(t => t.category === category);
    }

    if (difficulty) {
      tutorials = tutorials.filter(t => t.difficulty === difficulty);
    }

    if (tags && tags.length > 0) {
      tutorials = tutorials.filter(t => 
        tags.some(tag => t.tags.includes(tag))
      );
    }

    return tutorials.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async getTutorial(id: string): Promise<TutorialInfo | undefined> {
    return this.tutorials.get(id);
  }

  async completeTutorialChapter(
    tutorialId: string,
    chapterId: string,
    userId: string
  ): Promise<boolean> {
    const tutorial = this.tutorials.get(tutorialId);
    if (!tutorial) return false;

    const chapter = tutorial.chapters.find(c => c.id === chapterId);
    if (!chapter) return false;

    this.emit('chapterCompleted', { tutorialId, chapterId, userId });
    return true;
  }

  // Code Examples
  async addCodeExample(example: CodeExample): Promise<string> {
    const exampleId = example.id || this.generateId();
    example.id = exampleId;
    
    this.codeExamples.set(exampleId, example);
    this.emit('codeExampleAdded', { example });
    
    return exampleId;
  }

  async getCodeExamples(
    language?: string,
    category?: string,
    difficulty?: string
  ): Promise<CodeExample[]> {
    let examples = Array.from(this.codeExamples.values());

    if (language) {
      examples = examples.filter(e => e.language === language);
    }

    if (category) {
      examples = examples.filter(e => e.category === category);
    }

    if (difficulty) {
      examples = examples.filter(e => e.difficulty === difficulty);
    }

    return examples;
  }

  async runCodeExample(exampleId: string): Promise<{ output: string; error?: string }> {
    const example = this.codeExamples.get(exampleId);
    if (!example || !example.runnable) {
      return { output: '', error: 'Example not found or not runnable' };
    }

    try {
      // Simulate code execution - in production integrate with code execution service
      const output = example.outputs || 'Code executed successfully';
      this.emit('codeExampleRun', { exampleId, output });
      return { output };
    } catch (error) {
      return { output: '', error: error.message };
    }
  }

  // Playground Environments
  async createPlaygroundEnvironment(environment: PlaygroundEnvironment): Promise<string> {
    const envId = environment.id || this.generateId();
    environment.id = envId;
    
    this.playgrounds.set(envId, environment);
    this.emit('playgroundCreated', { environment });
    
    return envId;
  }

  async getPlaygroundEnvironments(language?: string): Promise<PlaygroundEnvironment[]> {
    let environments = Array.from(this.playgrounds.values());
    
    if (language) {
      environments = environments.filter(env => env.language === language);
    }

    return environments;
  }

  async forkPlayground(
    environmentId: string,
    userId: string,
    modifications?: Partial<PlaygroundEnvironment>
  ): Promise<string> {
    const originalEnv = this.playgrounds.get(environmentId);
    if (!originalEnv) {
      throw new Error('Playground environment not found');
    }

    const forkedEnv: PlaygroundEnvironment = {
      ...originalEnv,
      id: this.generateId(),
      name: `${originalEnv.name} (Fork)`,
      ...modifications
    };

    this.playgrounds.set(forkedEnv.id, forkedEnv);
    this.emit('playgroundForked', { original: environmentId, fork: forkedEnv.id, userId });
    
    return forkedEnv.id;
  }

  async executePlaygroundCode(
    environmentId: string,
    code: string,
    userId: string
  ): Promise<{ output: string; error?: string; executionTime: number }> {
    const environment = this.playgrounds.get(environmentId);
    if (!environment) {
      return { output: '', error: 'Environment not found', executionTime: 0 };
    }

    const startTime = Date.now();
    
    try {
      // Simulate code execution - in production integrate with secure execution service
      const output = `Output from ${environment.runtime}:\nHello, World!`;
      const executionTime = Date.now() - startTime;
      
      this.emit('codeExecuted', { environmentId, userId, executionTime });
      return { output, executionTime };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return { output: '', error: error.message, executionTime };
    }
  }

  // API Documentation
  async generateAPIDocumentation(
    serviceName: string,
    endpoints: EndpointInfo[],
    schemas: SchemaInfo[]
  ): Promise<string> {
    const apiRef: APIReference = {
      baseUrl: `https://api.example.com/v1`,
      version: '1.0.0',
      authentication: {
        type: 'bearer',
        description: 'Bearer token authentication'
      },
      endpoints,
      schemas,
      errorCodes: this.getDefaultErrorCodes()
    };

    const docId = this.generateId();
    this.apiDocumentation.set(docId, apiRef);
    
    this.emit('apiDocumentationGenerated', { docId, serviceName, apiRef });
    return docId;
  }

  async getAPIDocumentation(docId: string): Promise<APIReference | undefined> {
    return this.apiDocumentation.get(docId);
  }

  // Search and Discovery
  async searchContent(
    query: string,
    type?: 'sdk' | 'tutorial' | 'example' | 'template' | 'playground'
  ): Promise<{
    sdks: SDKDefinition[];
    tutorials: TutorialInfo[];
    examples: CodeExample[];
    templates: IntegrationTemplate[];
    playgrounds: PlaygroundEnvironment[];
  }> {
    const results = {
      sdks: [] as SDKDefinition[],
      tutorials: [] as TutorialInfo[],
      examples: [] as CodeExample[],
      templates: [] as IntegrationTemplate[],
      playgrounds: [] as PlaygroundEnvironment[]
    };

    if (!type || type === 'sdk') {
      results.sdks = Array.from(this.sdks.values()).filter(sdk =>
        this.matchesQuery(sdk.name, query) ||
        this.matchesQuery(sdk.description, query) ||
        sdk.tags?.some(tag => this.matchesQuery(tag, query))
      );
    }

    if (!type || type === 'tutorial') {
      results.tutorials = Array.from(this.tutorials.values()).filter(tutorial =>
        this.matchesQuery(tutorial.title, query) ||
        this.matchesQuery(tutorial.description, query) ||
        tutorial.tags.some(tag => this.matchesQuery(tag, query))
      );
    }

    if (!type || type === 'example') {
      results.examples = Array.from(this.codeExamples.values()).filter(example =>
        this.matchesQuery(example.title, query) ||
        this.matchesQuery(example.description, query) ||
        example.tags.some(tag => this.matchesQuery(tag, query))
      );
    }

    if (!type || type === 'template') {
      results.templates = Array.from(this.integrationTemplates.values()).filter(template =>
        this.matchesQuery(template.name, query) ||
        this.matchesQuery(template.description, query) ||
        template.tags.some(tag => this.matchesQuery(tag, query))
      );
    }

    if (!type || type === 'playground') {
      results.playgrounds = Array.from(this.playgrounds.values()).filter(playground =>
        this.matchesQuery(playground.name, query) ||
        this.matchesQuery(playground.description, query)
      );
    }

    return results;
  }

  // Analytics and Metrics
  async getDeveloperMetrics(): Promise<DeveloperMetrics> {
    const sdksByLanguage: Record<string, number> = {};
    const sdkDownloads: Record<string, number> = {};
    
    for (const sdk of this.sdks.values()) {
      sdksByLanguage[sdk.language] = (sdksByLanguage[sdk.language] || 0) + 1;
      sdkDownloads[sdk.id] = Math.floor(Math.random() * 10000); // Simulated
    }

    const popularSDKs = Object.entries(sdkDownloads)
      .map(([id, downloads]) => ({
        name: this.sdks.get(id)?.name || id,
        downloads
      }))
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 10);

    return {
      sdks: {
        total: this.sdks.size,
        byLanguage: sdksByLanguage,
        downloads: sdkDownloads,
        popularity: popularSDKs
      },
      documentation: {
        totalPages: this.apiDocumentation.size,
        totalExamples: this.codeExamples.size,
        averageRating: 4.5,
        popularPages: []
      },
      tutorials: {
        total: this.tutorials.size,
        completed: Math.floor(this.tutorials.size * 0.7),
        averageCompletionTime: 45,
        popularTutorials: []
      },
      playground: {
        totalEnvironments: this.playgrounds.size,
        activeSessions: Math.floor(Math.random() * 50),
        totalExecutions: Math.floor(Math.random() * 1000),
        popularTemplates: []
      },
      community: {
        totalUsers: Math.floor(Math.random() * 5000),
        activeUsers: Math.floor(Math.random() * 500),
        contributions: Math.floor(Math.random() * 200),
        issuesReported: Math.floor(Math.random() * 50)
      }
    };
  }

  // Helper Methods
  private validateTemplateVariables(
    template: IntegrationTemplate,
    variables: Record<string, any>
  ): { valid: boolean; error?: string } {
    for (const variable of template.variables) {
      if (variable.required && !(variable.name in variables)) {
        return { valid: false, error: `Required variable ${variable.name} missing` };
      }

      if (variable.name in variables) {
        const value = variables[variable.name];
        const validation = this.validateVariableValue(variable, value);
        if (!validation.valid) {
          return validation;
        }
      }
    }

    return { valid: true };
  }

  private validateVariableValue(
    variable: TemplateVariable,
    value: any
  ): { valid: boolean; error?: string } {
    if (variable.type === 'choice' && variable.choices) {
      if (!variable.choices.includes(value)) {
        return { valid: false, error: `Invalid choice for ${variable.name}` };
      }
    }

    if (variable.validation) {
      const regex = new RegExp(variable.validation);
      if (!regex.test(String(value))) {
        return { valid: false, error: `Value for ${variable.name} doesn't match pattern` };
      }
    }

    return { valid: true };
  }

  private processTemplate(content: string, variables: Record<string, any>): string {
    let processed = content;
    
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processed = processed.replace(placeholder, String(value));
    }

    return processed;
  }

  private generateInstructions(
    template: IntegrationTemplate,
    variables: Record<string, any>
  ): string {
    let instructions = `# ${template.name} Integration\n\n`;
    instructions += `${template.description}\n\n`;
    
    if (template.prerequisites.length > 0) {
      instructions += `## Prerequisites\n`;
      template.prerequisites.forEach(prereq => {
        instructions += `- ${prereq}\n`;
      });
      instructions += '\n';
    }

    instructions += `## Steps\n\n`;
    template.steps.forEach((step, index) => {
      instructions += `### ${index + 1}. ${step.title}\n\n`;
      instructions += `${step.description}\n\n`;
      
      if (step.commands && step.commands.length > 0) {
        instructions += `Run the following commands:\n\n`;
        step.commands.forEach(cmd => {
          instructions += `\`\`\`bash\n${this.processTemplate(cmd, variables)}\n\`\`\`\n\n`;
        });
      }

      if (step.codeBlocks && step.codeBlocks.length > 0) {
        step.codeBlocks.forEach(block => {
          if (block.filename) {
            instructions += `Create ${block.filename}:\n\n`;
          }
          instructions += `\`\`\`${block.language}\n${this.processTemplate(block.code, variables)}\n\`\`\`\n\n`;
        });
      }

      if (step.validation) {
        instructions += `**Validation:** ${step.validation.instruction}\n\n`;
      }
    });

    return instructions;
  }

  private matchesQuery(text: string, query: string): boolean {
    return text.toLowerCase().includes(query.toLowerCase());
  }

  private getDefaultErrorCodes(): ErrorCodeInfo[] {
    return [
      {
        code: 400,
        name: 'Bad Request',
        description: 'The request was invalid or cannot be served'
      },
      {
        code: 401,
        name: 'Unauthorized',
        description: 'Authentication credentials were missing or incorrect'
      },
      {
        code: 403,
        name: 'Forbidden',
        description: 'The request is understood, but it has been refused or access is not allowed'
      },
      {
        code: 404,
        name: 'Not Found',
        description: 'The requested resource could not be found'
      },
      {
        code: 500,
        name: 'Internal Server Error',
        description: 'An error occurred on the server'
      }
    ];
  }

  private initializeBuiltInContent(): void {
    // Initialize built-in SDKs
    const builtInSDKs: SDKDefinition[] = [
      {
        id: 'nodejs-sdk',
        name: 'Node.js SDK',
        language: 'JavaScript',
        version: '1.0.0',
        description: 'Official Node.js SDK for Claude MCP Server',
        documentation: 'Complete Node.js integration with TypeScript support',
        examples: [],
        installation: {
          packageManager: 'npm',
          command: 'npm install @claude-mcp/nodejs-sdk',
          requirements: { 'node': '>=14.0.0' },
          environment: { 'NODE_ENV': 'development' }
        },
        apiReference: {
          baseUrl: 'https://api.claude-mcp.com/v1',
          version: '1.0.0',
          authentication: {
            type: 'bearer',
            description: 'Bearer token authentication'
          },
          endpoints: [],
          schemas: [],
          errorCodes: []
        },
        dependencies: [
          { name: 'axios', version: '^1.0.0', type: 'runtime' },
          { name: 'typescript', version: '^4.5.0', type: 'development' }
        ],
        license: 'MIT',
        repository: 'https://github.com/claude-mcp/nodejs-sdk',
        maintainers: ['Claude MCP Team'],
        lastUpdated: new Date()
      }
    ];

    builtInSDKs.forEach(sdk => this.sdks.set(sdk.id, sdk));

    // Initialize built-in templates
    const builtInTemplates: IntegrationTemplate[] = [
      {
        id: 'express-integration',
        name: 'Express.js Integration',
        description: 'Integrate Claude MCP Server with Express.js application',
        category: 'Web Framework',
        platform: 'Node.js',
        framework: 'Express.js',
        difficulty: 'beginner',
        estimatedTime: '15 minutes',
        prerequisites: ['Node.js installed', 'Basic Express.js knowledge'],
        steps: [
          {
            id: 'install',
            title: 'Install Dependencies',
            description: 'Install the required packages',
            type: 'install',
            content: 'Install the Claude MCP SDK and Express middleware',
            commands: ['npm install @claude-mcp/nodejs-sdk @claude-mcp/express-middleware']
          },
          {
            id: 'configure',
            title: 'Configure Integration',
            description: 'Set up the MCP client in your Express app',
            type: 'configure',
            content: 'Add MCP configuration to your Express application',
            codeBlocks: [
              {
                language: 'javascript',
                filename: 'app.js',
                code: `const express = require('express');
const { MCPClient } = require('@claude-mcp/nodejs-sdk');
const { mcpMiddleware } = require('@claude-mcp/express-middleware');

const app = express();
const mcpClient = new MCPClient({
  apiKey: '{{apiKey}}',
  endpoint: '{{endpoint}}'
});

app.use(mcpMiddleware(mcpClient));

app.listen(3000, () => {
  console.log('Server running on port 3000');
});`
              }
            ]
          }
        ],
        files: [],
        variables: [
          {
            name: 'apiKey',
            description: 'Your Claude MCP API key',
            type: 'string',
            required: true
          },
          {
            name: 'endpoint',
            description: 'MCP server endpoint',
            type: 'string',
            required: true,
            defaultValue: 'https://api.claude-mcp.com/v1'
          }
        ],
        tags: ['express', 'nodejs', 'web'],
        lastUpdated: new Date()
      }
    ];

    builtInTemplates.forEach(template => this.integrationTemplates.set(template.id, template));

    // Initialize built-in code examples
    const builtInExamples: CodeExample[] = [
      {
        id: 'basic-connection',
        title: 'Basic MCP Connection',
        description: 'Connect to Claude MCP Server and send a simple request',
        code: `const { MCPClient } = require('@claude-mcp/nodejs-sdk');

const client = new MCPClient({
  apiKey: 'your-api-key',
  endpoint: 'https://api.claude-mcp.com/v1'
});

async function sendRequest() {
  try {
    const response = await client.chat.completions.create({
      model: 'claude-3-sonnet',
      messages: [
        { role: 'user', content: 'Hello, Claude!' }
      ]
    });
    
    console.log(response.choices[0].message.content);
  } catch (error) {
    console.error('Error:', error);
  }
}

sendRequest();`,
        language: 'javascript',
        category: 'Getting Started',
        tags: ['basic', 'connection', 'nodejs'],
        difficulty: 'beginner',
        runnable: true,
        outputs: 'Hello! How can I help you today?'
      }
    ];

    builtInExamples.forEach(example => this.codeExamples.set(example.id, example));

    // Initialize playground environments
    const builtInPlaygrounds: PlaygroundEnvironment[] = [
      {
        id: 'nodejs-playground',
        name: 'Node.js Playground',
        description: 'Try out Claude MCP SDK in Node.js',
        language: 'javascript',
        runtime: 'node',
        template: 'const { MCPClient } = require("@claude-mcp/nodejs-sdk");\n\n// Your code here',
        packages: ['@claude-mcp/nodejs-sdk'],
        files: [
          {
            path: 'index.js',
            content: 'const { MCPClient } = require("@claude-mcp/nodejs-sdk");\n\n// Your code here',
            readonly: false,
            hidden: false
          }
        ],
        settings: {
          theme: 'dark',
          fontSize: 14,
          tabSize: 2,
          wordWrap: true,
          autoSave: true,
          linting: true,
          formatting: true
        },
        features: [
          { name: 'intellisense', enabled: true },
          { name: 'debugging', enabled: true },
          { name: 'terminal', enabled: true }
        ]
      }
    ];

    builtInPlaygrounds.forEach(playground => this.playgrounds.set(playground.id, playground));
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}