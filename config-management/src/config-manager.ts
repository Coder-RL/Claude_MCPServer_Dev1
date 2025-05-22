import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync, watchFile, unwatchFile } from 'fs';
import { join } from 'path';
import * as crypto from 'crypto';

export interface ConfigSource {
  id: string;
  type: 'file' | 'env' | 'vault' | 'remote' | 'database';
  priority: number;
  path?: string;
  url?: string;
  credentials?: any;
  refreshInterval?: number;
  format?: 'json' | 'yaml' | 'env' | 'toml';
  encryption?: EncryptionConfig;
  validation?: ValidationConfig;
}

export interface EncryptionConfig {
  enabled: boolean;
  algorithm: string;
  key?: string;
  keyDerivation?: {
    algorithm: string;
    salt: string;
    iterations: number;
  };
}

export interface ValidationConfig {
  schema?: any;
  rules?: ValidationRule[];
}

export interface ValidationRule {
  path: string;
  type: 'required' | 'type' | 'range' | 'regex' | 'custom';
  value?: any;
  message?: string;
  validator?: (value: any) => boolean | string;
}

export interface ConfigValue {
  key: string;
  value: any;
  source: string;
  priority: number;
  encrypted: boolean;
  lastModified: Date;
  metadata?: Record<string, any>;
}

export interface ConfigTemplate {
  id: string;
  name: string;
  description?: string;
  variables: TemplateVariable[];
  content: string;
  outputPath?: string;
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  default?: any;
  description?: string;
  validation?: ValidationRule;
}

export class ConfigManager extends EventEmitter {
  private sources = new Map<string, ConfigSource>();
  private values = new Map<string, ConfigValue>();
  private templates = new Map<string, ConfigTemplate>();
  private watchers = new Map<string, NodeJS.Timeout>();
  private secretsCache = new Map<string, { value: any; expires: number }>();
  private encryptionKey: Buffer | null = null;
  private isInitialized = false;

  constructor(private baseDir: string = process.cwd()) {
    super();
    this.initializeEncryption();
  }

  private initializeEncryption(): void {
    const keyPath = join(this.baseDir, '.config-key');
    
    if (existsSync(keyPath)) {
      try {
        this.encryptionKey = readFileSync(keyPath);
      } catch (error) {
        console.warn('Failed to load encryption key:', error);
      }
    } else {
      // Generate new encryption key
      this.encryptionKey = crypto.randomBytes(32);
      try {
        writeFileSync(keyPath, this.encryptionKey, { mode: 0o600 });
      } catch (error) {
        console.warn('Failed to save encryption key:', error);
      }
    }
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Load default sources
    await this.addDefaultSources();
    
    // Load all configurations
    await this.loadAllConfigurations();
    
    this.isInitialized = true;
    this.emit('initialized');
  }

  private async addDefaultSources(): Promise<void> {
    // Environment variables source
    this.addSource({
      id: 'env',
      type: 'env',
      priority: 100
    });

    // Local config files
    const configFiles = [
      { path: 'config.json', format: 'json' as const },
      { path: 'config.yaml', format: 'yaml' as const },
      { path: '.env', format: 'env' as const }
    ];

    for (const file of configFiles) {
      const fullPath = join(this.baseDir, file.path);
      if (existsSync(fullPath)) {
        this.addSource({
          id: `file-${file.format}`,
          type: 'file',
          priority: 50,
          path: fullPath,
          format: file.format
        });
      }
    }
  }

  addSource(source: ConfigSource): void {
    this.sources.set(source.id, source);
    
    // Set up file watching for file sources
    if (source.type === 'file' && source.path) {
      this.watchFile(source);
    }
    
    // Set up refresh interval for remote sources
    if (source.refreshInterval && source.refreshInterval > 0) {
      this.setupSourceRefresh(source);
    }
    
    this.emit('source-added', source);
  }

  removeSource(sourceId: string): void {
    const source = this.sources.get(sourceId);
    if (!source) {
      return;
    }

    // Remove file watcher
    if (source.type === 'file' && source.path) {
      unwatchFile(source.path);
    }

    // Clear refresh interval
    const interval = this.watchers.get(sourceId);
    if (interval) {
      clearInterval(interval);
      this.watchers.delete(sourceId);
    }

    // Remove values from this source
    for (const [key, value] of this.values) {
      if (value.source === sourceId) {
        this.values.delete(key);
      }
    }

    this.sources.delete(sourceId);
    this.emit('source-removed', source);
  }

  private watchFile(source: ConfigSource): void {
    if (!source.path) return;

    watchFile(source.path, { interval: 1000 }, async () => {
      try {
        await this.loadConfigurationFromSource(source);
        this.emit('source-updated', source.id);
      } catch (error) {
        this.emit('error', new Error(`Failed to reload config from ${source.path}: ${error}`));
      }
    });
  }

  private setupSourceRefresh(source: ConfigSource): void {
    const interval = setInterval(async () => {
      try {
        await this.loadConfigurationFromSource(source);
      } catch (error) {
        this.emit('error', new Error(`Failed to refresh config from ${source.id}: ${error}`));
      }
    }, source.refreshInterval! * 1000);

    this.watchers.set(source.id, interval);
  }

  private async loadAllConfigurations(): Promise<void> {
    const sources = Array.from(this.sources.values())
      .sort((a, b) => b.priority - a.priority);

    for (const source of sources) {
      try {
        await this.loadConfigurationFromSource(source);
      } catch (error) {
        this.emit('error', new Error(`Failed to load config from ${source.id}: ${error}`));
      }
    }
  }

  private async loadConfigurationFromSource(source: ConfigSource): Promise<void> {
    let data: Record<string, any> = {};

    switch (source.type) {
      case 'file':
        data = await this.loadFromFile(source);
        break;
      case 'env':
        data = this.loadFromEnvironment(source);
        break;
      case 'vault':
        data = await this.loadFromVault(source);
        break;
      case 'remote':
        data = await this.loadFromRemote(source);
        break;
      case 'database':
        data = await this.loadFromDatabase(source);
        break;
      default:
        throw new Error(`Unsupported source type: ${source.type}`);
    }

    // Decrypt values if needed
    if (source.encryption?.enabled) {
      data = this.decryptData(data, source.encryption);
    }

    // Validate configuration
    if (source.validation) {
      this.validateConfiguration(data, source.validation);
    }

    // Store values
    this.storeValues(data, source);
  }

  private async loadFromFile(source: ConfigSource): Promise<Record<string, any>> {
    if (!source.path || !existsSync(source.path)) {
      return {};
    }

    const content = readFileSync(source.path, 'utf8');
    
    switch (source.format) {
      case 'json':
        return JSON.parse(content);
      case 'yaml':
        // In production, use a YAML parser like 'js-yaml'
        throw new Error('YAML parsing not implemented');
      case 'env':
        return this.parseEnvFile(content);
      case 'toml':
        // In production, use a TOML parser
        throw new Error('TOML parsing not implemented');
      default:
        return JSON.parse(content);
    }
  }

  private loadFromEnvironment(source: ConfigSource): Record<string, any> {
    const data: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        data[key] = this.parseEnvValue(value);
      }
    }
    
    return data;
  }

  private async loadFromVault(source: ConfigSource): Promise<Record<string, any>> {
    // Simplified vault client - in production, use actual vault client
    if (!source.url || !source.credentials) {
      throw new Error('Vault source requires URL and credentials');
    }

    try {
      const response = await fetch(`${source.url}/v1/secret/data/config`, {
        headers: {
          'X-Vault-Token': source.credentials.token,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Vault request failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.data?.data || {};
    } catch (error) {
      throw new Error(`Failed to load from vault: ${error}`);
    }
  }

  private async loadFromRemote(source: ConfigSource): Promise<Record<string, any>> {
    if (!source.url) {
      throw new Error('Remote source requires URL');
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (source.credentials) {
        if (source.credentials.type === 'bearer') {
          headers['Authorization'] = `Bearer ${source.credentials.token}`;
        } else if (source.credentials.type === 'basic') {
          const auth = Buffer.from(`${source.credentials.username}:${source.credentials.password}`).toString('base64');
          headers['Authorization'] = `Basic ${auth}`;
        }
      }

      const response = await fetch(source.url, { headers });
      
      if (!response.ok) {
        throw new Error(`Remote request failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to load from remote: ${error}`);
    }
  }

  private async loadFromDatabase(source: ConfigSource): Promise<Record<string, any>> {
    // Simplified database client - in production, use actual database client
    throw new Error('Database source not implemented');
  }

  private parseEnvFile(content: string): Record<string, any> {
    const data: Record<string, any> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          data[key.trim()] = this.parseEnvValue(value);
        }
      }
    }

    return data;
  }

  private parseEnvValue(value: string): any {
    // Try to parse as JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    // Parse booleans
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Parse numbers
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);

    return value;
  }

  private decryptData(data: Record<string, any>, config: EncryptionConfig): Record<string, any> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const decrypted: Record<string, any> = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string' && value.startsWith('enc:')) {
        try {
          const encrypted = value.substring(4);
          const [ivHex, encryptedHex] = encrypted.split(':');
          const iv = Buffer.from(ivHex, 'hex');
          const encryptedBuffer = Buffer.from(encryptedHex, 'hex');
          
          const decipher = crypto.createDecipherGCM(config.algorithm, this.encryptionKey);
          decipher.setIV(iv);
          
          let decryptedValue = decipher.update(encryptedBuffer, undefined, 'utf8');
          decryptedValue += decipher.final('utf8');
          
          decrypted[key] = this.parseEnvValue(decryptedValue);
        } catch (error) {
          throw new Error(`Failed to decrypt value for key ${key}: ${error}`);
        }
      } else {
        decrypted[key] = value;
      }
    }

    return decrypted;
  }

  private validateConfiguration(data: Record<string, any>, config: ValidationConfig): void {
    if (config.rules) {
      for (const rule of config.rules) {
        const value = this.getNestedValue(data, rule.path);
        const isValid = this.validateRule(value, rule);
        
        if (!isValid) {
          throw new Error(rule.message || `Validation failed for ${rule.path}`);
        }
      }
    }

    // JSON Schema validation would go here in production
    if (config.schema) {
      // Use a library like ajv for JSON schema validation
    }
  }

  private validateRule(value: any, rule: ValidationRule): boolean {
    switch (rule.type) {
      case 'required':
        return value !== undefined && value !== null && value !== '';
      
      case 'type':
        return typeof value === rule.value;
      
      case 'range':
        if (typeof value === 'number' && Array.isArray(rule.value)) {
          return value >= rule.value[0] && value <= rule.value[1];
        }
        return false;
      
      case 'regex':
        if (typeof value === 'string' && rule.value instanceof RegExp) {
          return rule.value.test(value);
        }
        return false;
      
      case 'custom':
        return rule.validator ? rule.validator(value) === true : true;
      
      default:
        return true;
    }
  }

  private storeValues(data: Record<string, any>, source: ConfigSource): void {
    const timestamp = new Date();
    
    for (const [key, value] of Object.entries(data)) {
      const existingValue = this.values.get(key);
      
      // Only update if this source has higher or equal priority
      if (!existingValue || source.priority >= existingValue.priority) {
        this.values.set(key, {
          key,
          value,
          source: source.id,
          priority: source.priority,
          encrypted: source.encryption?.enabled || false,
          lastModified: timestamp,
          metadata: {
            sourceType: source.type,
            sourcePath: source.path || source.url
          }
        });
        
        this.emit('value-updated', { key, value, source: source.id });
      }
    }
  }

  get<T = any>(key: string, defaultValue?: T): T {
    const configValue = this.values.get(key);
    
    if (configValue) {
      return configValue.value as T;
    }
    
    // Try nested key access
    const nestedValue = this.getNestedValue(Object.fromEntries(
      Array.from(this.values.entries()).map(([k, v]) => [k, v.value])
    ), key);
    
    return nestedValue !== undefined ? nestedValue as T : defaultValue as T;
  }

  set(key: string, value: any, sourceId: string = 'runtime'): void {
    const source = this.sources.get(sourceId) || {
      id: sourceId,
      type: 'env' as const,
      priority: 1000
    };

    this.values.set(key, {
      key,
      value,
      source: sourceId,
      priority: source.priority,
      encrypted: false,
      lastModified: new Date()
    });

    this.emit('value-updated', { key, value, source: sourceId });
  }

  has(key: string): boolean {
    return this.values.has(key) || this.getNestedValue(
      Object.fromEntries(Array.from(this.values.entries()).map(([k, v]) => [k, v.value])),
      key
    ) !== undefined;
  }

  delete(key: string): boolean {
    const deleted = this.values.delete(key);
    if (deleted) {
      this.emit('value-deleted', { key });
    }
    return deleted;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  encrypt(value: string): string {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not available');
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipherGCM('aes-256-gcm', this.encryptionKey);
    cipher.setIV(iv);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `enc:${iv.toString('hex')}:${encrypted}`;
  }

  addTemplate(template: ConfigTemplate): void {
    this.templates.set(template.id, template);
    this.emit('template-added', template);
  }

  generateFromTemplate(templateId: string, variables: Record<string, any>): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Validate required variables
    for (const variable of template.variables) {
      if (variable.required && !(variable.name in variables)) {
        throw new Error(`Required variable missing: ${variable.name}`);
      }
    }

    // Replace variables in template content
    let content = template.content;
    
    for (const variable of template.variables) {
      const value = variables[variable.name] || variable.default;
      const placeholder = new RegExp(`\\$\\{${variable.name}\\}`, 'g');
      content = content.replace(placeholder, String(value));
    }

    return content;
  }

  getAllValues(): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, configValue] of this.values) {
      result[key] = configValue.value;
    }
    
    return result;
  }

  getMetadata(key: string): ConfigValue | undefined {
    return this.values.get(key);
  }

  getSources(): ConfigSource[] {
    return Array.from(this.sources.values());
  }

  getStats(): any {
    return {
      sources: this.sources.size,
      values: this.values.size,
      templates: this.templates.size,
      watchers: this.watchers.size,
      cacheSize: this.secretsCache.size,
      isInitialized: this.isInitialized
    };
  }

  async reload(): Promise<void> {
    this.values.clear();
    await this.loadAllConfigurations();
    this.emit('reloaded');
  }

  destroy(): void {
    // Clear all watchers
    for (const interval of this.watchers.values()) {
      clearInterval(interval);
    }
    
    // Unwatch all files
    for (const source of this.sources.values()) {
      if (source.type === 'file' && source.path) {
        unwatchFile(source.path);
      }
    }
    
    this.sources.clear();
    this.values.clear();
    this.templates.clear();
    this.watchers.clear();
    this.secretsCache.clear();
    this.removeAllListeners();
  }
}