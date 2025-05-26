import { EventEmitter } from 'events';

export interface DocumentationConfig {
  outputFormat: 'markdown' | 'html' | 'json' | 'pdf';
  theme: 'default' | 'dark' | 'minimal' | 'corporate';
  includeExamples: boolean;
  includeSchemas: boolean;
  includeErrorCodes: boolean;
  customSections: CustomSection[];
  branding: BrandingConfig;
}

export interface BrandingConfig {
  logo?: string;
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  footer?: string;
}

export interface CustomSection {
  name: string;
  content: string;
  position: 'before' | 'after';
  anchor: string;
}

export interface DocumentationSource {
  type: 'openapi' | 'code' | 'markdown' | 'database';
  source: string;
  config?: Record<string, any>;
}

export interface GeneratedDocumentation {
  id: string;
  title: string;
  version: string;
  content: string;
  format: string;
  generatedAt: Date;
  sources: DocumentationSource[];
  sections: DocumentationSection[];
  metadata: DocumentationMetadata;
}

export interface DocumentationSection {
  id: string;
  title: string;
  level: number;
  content: string;
  subsections: DocumentationSection[];
  examples?: CodeExample[];
  schemas?: SchemaDefinition[];
}

export interface DocumentationMetadata {
  wordCount: number;
  estimatedReadTime: number;
  lastUpdated: Date;
  version: string;
  tags: string[];
  contributors: string[];
}

export interface CodeExample {
  language: string;
  title: string;
  code: string;
  description?: string;
  output?: string;
}

export interface SchemaDefinition {
  name: string;
  type: string;
  properties: Record<string, PropertyDefinition>;
  required?: string[];
  example?: any;
}

export interface PropertyDefinition {
  type: string;
  description: string;
  format?: string;
  enum?: any[];
  example?: any;
}

export interface APIEndpoint {
  path: string;
  method: string;
  summary: string;
  description: string;
  parameters: Parameter[];
  requestBody?: RequestBody;
  responses: Response[];
  tags: string[];
  operationId: string;
}

export interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  schema: PropertyDefinition;
  description: string;
  example?: any;
}

export interface RequestBody {
  description: string;
  required: boolean;
  content: Record<string, MediaType>;
}

export interface MediaType {
  schema: SchemaDefinition;
  example?: any;
  examples?: Record<string, ExampleObject>;
}

export interface ExampleObject {
  summary?: string;
  description?: string;
  value: any;
}

export interface Response {
  statusCode: string;
  description: string;
  headers?: Record<string, Header>;
  content?: Record<string, MediaType>;
}

export interface Header {
  description: string;
  schema: PropertyDefinition;
}

export interface ChangelogEntry {
  version: string;
  date: Date;
  changes: Change[];
  breaking: boolean;
}

export interface Change {
  type: 'added' | 'changed' | 'deprecated' | 'removed' | 'fixed' | 'security';
  description: string;
  endpoint?: string;
  breaking?: boolean;
}

export class DocumentationGenerator extends EventEmitter {
  private templates = new Map<string, string>();
  private generatedDocs = new Map<string, GeneratedDocumentation>();
  private changelog: ChangelogEntry[] = [];

  constructor() {
    super();
    this.initializeTemplates();
  }

  async generateDocumentation(
    sources: DocumentationSource[],
    config: DocumentationConfig,
    title: string = 'API Documentation'
  ): Promise<string> {
    try {
      const docId = this.generateId();
      
      // Parse sources
      const parsedContent = await this.parseSources(sources);
      
      // Generate sections
      const sections = await this.generateSections(parsedContent, config);
      
      // Apply template
      const content = await this.applyTemplate(sections, config, title);
      
      // Create documentation object
      const documentation: GeneratedDocumentation = {
        id: docId,
        title,
        version: parsedContent.version || '1.0.0',
        content,
        format: config.outputFormat,
        generatedAt: new Date(),
        sources,
        sections,
        metadata: this.generateMetadata(sections, title)
      };

      this.generatedDocs.set(docId, documentation);
      this.emit('documentationGenerated', { documentation });
      
      return docId;
    } catch (error) {
      this.emit('error', { operation: 'generateDocumentation', error });
      throw error;
    }
  }

  async generateAPIReference(
    endpoints: APIEndpoint[],
    schemas: SchemaDefinition[],
    config: DocumentationConfig
  ): Promise<string> {
    const sources: DocumentationSource[] = [
      {
        type: 'openapi',
        source: 'generated',
        config: { endpoints, schemas }
      }
    ];

    return this.generateDocumentation(sources, config, 'API Reference');
  }

  async generateSDKDocumentation(
    sdkPath: string,
    language: string,
    config: DocumentationConfig
  ): Promise<string> {
    const sources: DocumentationSource[] = [
      {
        type: 'code',
        source: sdkPath,
        config: { language }
      }
    ];

    return this.generateDocumentation(sources, config, `${language} SDK Documentation`);
  }

  async generateChangelog(
    entries: ChangelogEntry[],
    format: 'markdown' | 'html' = 'markdown'
  ): Promise<string> {
    let changelog = '';

    if (format === 'markdown') {
      changelog = '# Changelog\n\n';
      changelog += 'All notable changes to this project will be documented in this file.\n\n';

      for (const entry of entries.sort((a, b) => b.date.getTime() - a.date.getTime())) {
        changelog += `## [${entry.version}] - ${entry.date.toISOString().split('T')[0]}\n\n`;
        
        if (entry.breaking) {
          changelog += '**⚠️ BREAKING CHANGES**\n\n';
        }

        const changesByType = this.groupChangesByType(entry.changes);
        
        for (const [type, changes] of Object.entries(changesByType)) {
          if (changes.length > 0) {
            changelog += `### ${this.capitalizeFirst(type)}\n\n`;
            changes.forEach(change => {
              changelog += `- ${change.description}`;
              if (change.endpoint) changelog += ` (${change.endpoint})`;
              if (change.breaking) changelog += ' **[BREAKING]**';
              changelog += '\n';
            });
            changelog += '\n';
          }
        }
      }
    } else if (format === 'html') {
      changelog = this.generateHTMLChangelog(entries);
    }

    return changelog;
  }

  async addChangelogEntry(entry: ChangelogEntry): Promise<void> {
    this.changelog.push(entry);
    this.changelog.sort((a, b) => b.date.getTime() - a.date.getTime());
    this.emit('changelogUpdated', { entry });
  }

  async getDocumentation(docId: string): Promise<GeneratedDocumentation | undefined> {
    return this.generatedDocs.get(docId);
  }

  async updateDocumentation(
    docId: string,
    sources: DocumentationSource[],
    config: DocumentationConfig
  ): Promise<boolean> {
    try {
      const existingDoc = this.generatedDocs.get(docId);
      if (!existingDoc) return false;

      // Regenerate documentation
      const parsedContent = await this.parseSources(sources);
      const sections = await this.generateSections(parsedContent, config);
      const content = await this.applyTemplate(sections, config, existingDoc.title);

      // Update documentation
      existingDoc.content = content;
      existingDoc.sections = sections;
      existingDoc.sources = sources;
      existingDoc.generatedAt = new Date();
      existingDoc.metadata = this.generateMetadata(sections, existingDoc.title);

      this.emit('documentationUpdated', { documentation: existingDoc });
      return true;
    } catch (error) {
      this.emit('error', { operation: 'updateDocumentation', error });
      return false;
    }
  }

  async exportDocumentation(
    docId: string,
    format: 'pdf' | 'docx' | 'epub'
  ): Promise<Buffer> {
    const doc = this.generatedDocs.get(docId);
    if (!doc) {
      throw new Error('Documentation not found');
    }

    // Simulate export - in production integrate with document generation libraries
    const content = `Exported ${doc.title} as ${format}`;
    return Buffer.from(content);
  }

  async generateInteractiveDocumentation(
    docId: string,
    config: {
      enableTryIt: boolean;
      enableCodeGeneration: boolean;
      supportedLanguages: string[];
    }
  ): Promise<string> {
    const doc = this.generatedDocs.get(docId);
    if (!doc) {
      throw new Error('Documentation not found');
    }

    // Generate interactive documentation with API explorer
    const interactiveDoc = await this.createInteractiveTemplate(doc, config);
    return interactiveDoc;
  }

  async validateDocumentation(docId: string): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const doc = this.generatedDocs.get(docId);
    if (!doc) {
      return {
        valid: false,
        errors: ['Documentation not found'],
        warnings: []
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate content structure
    if (!doc.title || doc.title.trim().length === 0) {
      errors.push('Documentation title is required');
    }

    if (doc.sections.length === 0) {
      warnings.push('Documentation has no sections');
    }

    // Check for broken links (simplified)
    const brokenLinks = this.findBrokenLinks(doc.content);
    warnings.push(...brokenLinks.map(link => `Potentially broken link: ${link}`));

    // Check for missing examples
    const endpointSections = doc.sections.filter(s => s.id.includes('endpoint'));
    const sectionsWithoutExamples = endpointSections.filter(s => !s.examples || s.examples.length === 0);
    if (sectionsWithoutExamples.length > 0) {
      warnings.push(`${sectionsWithoutExamples.length} endpoint(s) missing examples`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private async parseSources(sources: DocumentationSource[]): Promise<any> {
    const parsedContent: any = {
      version: '1.0.0',
      endpoints: [],
      schemas: [],
      examples: []
    };

    for (const source of sources) {
      switch (source.type) {
        case 'openapi':
          const openApiContent = await this.parseOpenAPISource(source);
          parsedContent.endpoints.push(...openApiContent.endpoints);
          parsedContent.schemas.push(...openApiContent.schemas);
          break;
        
        case 'code':
          const codeContent = await this.parseCodeSource(source);
          parsedContent.examples.push(...codeContent.examples);
          break;
        
        case 'markdown':
          const markdownContent = await this.parseMarkdownSource(source);
          parsedContent.sections = markdownContent.sections;
          break;
      }
    }

    return parsedContent;
  }

  private async parseOpenAPISource(source: DocumentationSource): Promise<any> {
    // Parse OpenAPI specification
    if (source.config?.endpoints && source.config?.schemas) {
      return {
        endpoints: source.config.endpoints,
        schemas: source.config.schemas
      };
    }

    // In production, parse actual OpenAPI files
    return { endpoints: [], schemas: [] };
  }

  private async parseCodeSource(source: DocumentationSource): Promise<any> {
    // Parse code files and extract documentation comments
    const examples: CodeExample[] = [
      {
        language: source.config?.language || 'javascript',
        title: 'Basic Usage',
        code: '// Example code would be extracted from source files',
        description: 'Basic usage example'
      }
    ];

    return { examples };
  }

  private async parseMarkdownSource(source: DocumentationSource): Promise<any> {
    // Parse markdown files and extract sections
    return { sections: [] };
  }

  private async generateSections(
    parsedContent: any,
    config: DocumentationConfig
  ): Promise<DocumentationSection[]> {
    const sections: DocumentationSection[] = [];

    // Introduction section
    sections.push({
      id: 'introduction',
      title: 'Introduction',
      level: 1,
      content: 'Welcome to the API documentation.',
      subsections: []
    });

    // Authentication section
    sections.push({
      id: 'authentication',
      title: 'Authentication',
      level: 1,
      content: 'Learn how to authenticate your API requests.',
      subsections: []
    });

    // Endpoints sections
    if (parsedContent.endpoints && parsedContent.endpoints.length > 0) {
      const endpointsSection: DocumentationSection = {
        id: 'endpoints',
        title: 'API Endpoints',
        level: 1,
        content: 'Available API endpoints and their usage.',
        subsections: []
      };

      for (const endpoint of parsedContent.endpoints) {
        const endpointSection = await this.generateEndpointSection(endpoint, config);
        endpointsSection.subsections.push(endpointSection);
      }

      sections.push(endpointsSection);
    }

    // Schemas section
    if (config.includeSchemas && parsedContent.schemas?.length > 0) {
      sections.push({
        id: 'schemas',
        title: 'Data Models',
        level: 1,
        content: 'Data models and schemas used by the API.',
        subsections: [],
        schemas: parsedContent.schemas
      });
    }

    // Error codes section
    if (config.includeErrorCodes) {
      sections.push({
        id: 'errors',
        title: 'Error Codes',
        level: 1,
        content: 'Common error codes and their meanings.',
        subsections: []
      });
    }

    // Custom sections
    for (const customSection of config.customSections) {
      sections.push({
        id: customSection.name.toLowerCase().replace(/\s+/g, '-'),
        title: customSection.name,
        level: 1,
        content: customSection.content,
        subsections: []
      });
    }

    return sections;
  }

  private async generateEndpointSection(
    endpoint: APIEndpoint,
    config: DocumentationConfig
  ): Promise<DocumentationSection> {
    let content = `## ${endpoint.method.toUpperCase()} ${endpoint.path}\n\n`;
    content += `${endpoint.description}\n\n`;

    // Parameters
    if (endpoint.parameters.length > 0) {
      content += '### Parameters\n\n';
      for (const param of endpoint.parameters) {
        content += `- **${param.name}** (${param.schema.type}): ${param.description}`;
        if (param.required) content += ' *Required*';
        content += '\n';
      }
      content += '\n';
    }

    // Request body
    if (endpoint.requestBody) {
      content += '### Request Body\n\n';
      content += `${endpoint.requestBody.description}\n\n`;
    }

    // Responses
    content += '### Responses\n\n';
    for (const response of endpoint.responses) {
      content += `**${response.statusCode}**: ${response.description}\n\n`;
    }

    const examples: CodeExample[] = [];
    if (config.includeExamples) {
      examples.push({
        language: 'curl',
        title: 'cURL Example',
        code: this.generateCurlExample(endpoint),
        description: `Example ${endpoint.method.toUpperCase()} request`
      });
    }

    return {
      id: `endpoint-${endpoint.operationId}`,
      title: `${endpoint.method.toUpperCase()} ${endpoint.path}`,
      level: 2,
      content,
      subsections: [],
      examples
    };
  }

  private generateCurlExample(endpoint: APIEndpoint): string {
    let curl = `curl -X ${endpoint.method.toUpperCase()} \\
  https://api.example.com${endpoint.path}`;

    // Add headers
    curl += ` \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`;

    // Add request body for POST/PUT/PATCH
    if (['post', 'put', 'patch'].includes(endpoint.method.toLowerCase()) && endpoint.requestBody) {
      curl += ` \\
  -d '{
    "example": "data"
  }'`;
    }

    return curl;
  }

  private async applyTemplate(
    sections: DocumentationSection[],
    config: DocumentationConfig,
    title: string
  ): Promise<string> {
    const template = this.templates.get(config.outputFormat) || this.templates.get('markdown')!;
    
    let content = template;
    content = content.replace('{{title}}', title);
    content = content.replace('{{generatedAt}}', new Date().toISOString());
    content = content.replace('{{companyName}}', config.branding.companyName);

    // Generate table of contents
    const toc = this.generateTableOfContents(sections);
    content = content.replace('{{tableOfContents}}', toc);

    // Generate sections content
    const sectionsContent = this.generateSectionsContent(sections, config.outputFormat);
    content = content.replace('{{sections}}', sectionsContent);

    return content;
  }

  private generateTableOfContents(sections: DocumentationSection[]): string {
    let toc = '';
    
    for (const section of sections) {
      const indent = '  '.repeat(section.level - 1);
      toc += `${indent}- [${section.title}](#${section.id})\n`;
      
      for (const subsection of section.subsections) {
        const subIndent = '  '.repeat(subsection.level - 1);
        toc += `${subIndent}- [${subsection.title}](#${subsection.id})\n`;
      }
    }

    return toc;
  }

  private generateSectionsContent(
    sections: DocumentationSection[],
    format: string
  ): string {
    let content = '';

    for (const section of sections) {
      content += this.formatSectionHeader(section.title, section.level, format);
      content += section.content + '\n\n';

      // Add examples
      if (section.examples) {
        for (const example of section.examples) {
          content += this.formatCodeExample(example, format);
        }
      }

      // Add schemas
      if (section.schemas) {
        for (const schema of section.schemas) {
          content += this.formatSchema(schema, format);
        }
      }

      // Add subsections
      for (const subsection of section.subsections) {
        content += this.formatSectionHeader(subsection.title, subsection.level, format);
        content += subsection.content + '\n\n';

        if (subsection.examples) {
          for (const example of subsection.examples) {
            content += this.formatCodeExample(example, format);
          }
        }
      }
    }

    return content;
  }

  private formatSectionHeader(title: string, level: number, format: string): string {
    if (format === 'markdown') {
      const hashes = '#'.repeat(level);
      return `${hashes} ${title}\n\n`;
    } else if (format === 'html') {
      return `<h${level}>${title}</h${level}>\n\n`;
    }
    return `${title}\n${'='.repeat(title.length)}\n\n`;
  }

  private formatCodeExample(example: CodeExample, format: string): string {
    if (format === 'markdown') {
      let content = `### ${example.title}\n\n`;
      if (example.description) {
        content += `${example.description}\n\n`;
      }
      content += `\`\`\`${example.language}\n${example.code}\n\`\`\`\n\n`;
      return content;
    } else if (format === 'html') {
      return `<h3>${example.title}</h3>
<pre><code class="${example.language}">${example.code}</code></pre>\n\n`;
    }
    return `${example.title}\n${example.code}\n\n`;
  }

  private formatSchema(schema: SchemaDefinition, format: string): string {
    if (format === 'markdown') {
      let content = `### ${schema.name}\n\n`;
      content += `Type: \`${schema.type}\`\n\n`;
      
      if (Object.keys(schema.properties).length > 0) {
        content += '#### Properties\n\n';
        for (const [propName, propDef] of Object.entries(schema.properties)) {
          content += `- **${propName}** (\`${propDef.type}\`): ${propDef.description}\n`;
        }
        content += '\n';
      }

      if (schema.example) {
        content += '#### Example\n\n';
        content += `\`\`\`json\n${JSON.stringify(schema.example, null, 2)}\n\`\`\`\n\n`;
      }

      return content;
    }
    return `${schema.name}: ${schema.type}\n\n`;
  }

  private generateMetadata(sections: DocumentationSection[], title: string): DocumentationMetadata {
    const content = sections.map(s => s.content).join(' ');
    const wordCount = content.split(/\s+/).length;
    const estimatedReadTime = Math.ceil(wordCount / 200); // 200 words per minute

    return {
      wordCount,
      estimatedReadTime,
      lastUpdated: new Date(),
      version: '1.0.0',
      tags: [],
      contributors: []
    };
  }

  private groupChangesByType(changes: Change[]): Record<string, Change[]> {
    const grouped: Record<string, Change[]> = {
      added: [],
      changed: [],
      deprecated: [],
      removed: [],
      fixed: [],
      security: []
    };

    for (const change of changes) {
      grouped[change.type].push(change);
    }

    return grouped;
  }

  private generateHTMLChangelog(entries: ChangelogEntry[]): string {
    let html = '<div class="changelog">\n';
    html += '<h1>Changelog</h1>\n';

    for (const entry of entries.sort((a, b) => b.date.getTime() - a.date.getTime())) {
      html += `<div class="version">\n`;
      html += `<h2>${entry.version} <span class="date">${entry.date.toISOString().split('T')[0]}</span></h2>\n`;
      
      if (entry.breaking) {
        html += '<div class="breaking-notice">⚠️ Breaking Changes</div>\n';
      }

      const changesByType = this.groupChangesByType(entry.changes);
      
      for (const [type, changes] of Object.entries(changesByType)) {
        if (changes.length > 0) {
          html += `<h3>${this.capitalizeFirst(type)}</h3>\n<ul>\n`;
          changes.forEach(change => {
            html += `<li>${change.description}`;
            if (change.endpoint) html += ` <code>${change.endpoint}</code>`;
            if (change.breaking) html += ' <span class="breaking">[BREAKING]</span>';
            html += '</li>\n';
          });
          html += '</ul>\n';
        }
      }

      html += '</div>\n';
    }

    html += '</div>\n';
    return html;
  }

  private async createInteractiveTemplate(
    doc: GeneratedDocumentation,
    config: any
  ): Promise<string> {
    // Generate interactive documentation with API explorer
    let interactive = `<!DOCTYPE html>
<html>
<head>
    <title>${doc.title} - Interactive Documentation</title>
    <link rel="stylesheet" href="/css/interactive-docs.css">
</head>
<body>
    <div id="app">
        <nav class="sidebar">
            <h2>${doc.title}</h2>
            <!-- Navigation will be generated -->
        </nav>
        <main class="content">
            ${doc.content}
        </main>
    </div>
    <script src="/js/interactive-docs.js"></script>
</body>
</html>`;

    return interactive;
  }

  private findBrokenLinks(content: string): string[] {
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    const brokenLinks: string[] = [];
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      const url = match[2];
      // Simple check for obviously broken links
      if (url.startsWith('#') && !content.includes(url.substring(1))) {
        brokenLinks.push(url);
      }
    }

    return brokenLinks;
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private initializeTemplates(): void {
    // Markdown template
    this.templates.set('markdown', `# {{title}}

*Generated on {{generatedAt}}*

## Table of Contents

{{tableOfContents}}

{{sections}}

---

*Documentation generated by {{companyName}}*
`);

    // HTML template
    this.templates.set('html', `<!DOCTYPE html>
<html>
<head>
    <title>{{title}}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        code { background-color: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
        pre { background-color: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>{{title}}</h1>
        <p><em>Generated on {{generatedAt}}</em></p>
        
        <h2>Table of Contents</h2>
        {{tableOfContents}}
        
        {{sections}}
        
        <hr>
        <p><em>Documentation generated by {{companyName}}</em></p>
    </div>
</body>
</html>
`);

    // JSON template
    this.templates.set('json', `{
  "title": "{{title}}",
  "generatedAt": "{{generatedAt}}",
  "sections": {{sections}},
  "generator": "{{companyName}}"
}`);
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}