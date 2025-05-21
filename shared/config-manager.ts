import { readFileSync, existsSync, watchFile, unwatchFile } from 'fs';
import { join, resolve } from 'path';
import { getLogger } from './logger.js';
import { MCPError, ErrorCode, ErrorSeverity, createValidationError } from './error-handler.js';

const logger = getLogger('ConfigManager');

export interface ConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required?: boolean;
    default?: any;
    validator?: (value: any) => boolean;
    description?: string;
    env?: string;
    sensitive?: boolean;
  };
}

export interface ConfigOptions {
  configPath?: string;
  environment?: string;
  enableWatcher?: boolean;
  enableEnvOverrides?: boolean;
  enableValidation?: boolean;
  schema?: ConfigSchema;
  secretsPath?: string;
}

export interface ConfigChangeEvent {
  key: string;
  oldValue: any;
  newValue: any;
  timestamp: Date;
}

export class ConfigManager {
  private config: Record<string, any> = {};
  private schema: ConfigSchema;
  private options: Required<ConfigOptions>;
  private watchers: Set<string> = new Set();
  private changeCallbacks: Array<(event: ConfigChangeEvent) => void> = [];
  private lastLoadTime: Date | null = null;
  private configPath: string;

  constructor(options: ConfigOptions = {}) {
    this.options = {
      configPath: options.configPath || './config.json',
      environment: options.environment || process.env.NODE_ENV || 'development',
      enableWatcher: options.enableWatcher ?? true,
      enableEnvOverrides: options.enableEnvOverrides ?? true,
      enableValidation: options.enableValidation ?? true,
      schema: options.schema || {},
      secretsPath: options.secretsPath || './secrets.json',
    };

    this.schema = this.options.schema;
    this.configPath = resolve(this.options.configPath);
    
    this.loadConfiguration();
    
    if (this.options.enableWatcher) {
      this.setupFileWatcher();
    }
  }

  private loadConfiguration(): void {
    try {
      this.config = this.mergeConfigurations();
      
      if (this.options.enableValidation) {
        this.validateConfiguration();
      }

      this.applyDefaults();
      
      if (this.options.enableEnvOverrides) {
        this.applyEnvironmentOverrides();
      }

      this.lastLoadTime = new Date();
      
      logger.info('Configuration loaded successfully', {
        configPath: this.configPath,
        environment: this.options.environment,
        keysLoaded: Object.keys(this.config).length,
      });
    } catch (error) {
      logger.error('Failed to load configuration', { error });
      throw error;
    }
  }

  private mergeConfigurations(): Record<string, any> {
    const configs: Record<string, any>[] = [];

    const baseConfig = this.loadConfigFile(this.configPath);
    if (baseConfig) {
      configs.push(baseConfig);
    }

    const envConfigPath = this.configPath.replace('.json', `.${this.options.environment}.json`);
    const envConfig = this.loadConfigFile(envConfigPath);
    if (envConfig) {
      configs.push(envConfig);
    }

    const secretsConfig = this.loadConfigFile(this.options.secretsPath);
    if (secretsConfig) {
      configs.push(secretsConfig);
    }

    const localConfigPath = this.configPath.replace('.json', '.local.json');
    const localConfig = this.loadConfigFile(localConfigPath);
    if (localConfig) {
      configs.push(localConfig);
    }

    return this.deepMerge(...configs);
  }

  private loadConfigFile(filePath: string): Record<string, any> | null {
    try {
      if (!existsSync(filePath)) {
        logger.debug(`Config file not found: ${filePath}`);
        return null;
      }

      const content = readFileSync(filePath, 'utf-8');
      const config = JSON.parse(content);
      
      logger.debug(`Loaded config file: ${filePath}`);
      return config;
    } catch (error) {
      if (filePath === this.configPath) {
        throw new MCPError({
          code: ErrorCode.CONFIGURATION_ERROR,
          message: `Failed to load required config file: ${filePath}`,
          severity: ErrorSeverity.CRITICAL,
          retryable: false,
          context: { operation: 'loadConfigFile', metadata: { filePath } },
          cause: error instanceof Error ? error : undefined,
        });
      }
      
      logger.warn(`Failed to load optional config file: ${filePath}`, { error });
      return null;
    }
  }

  private deepMerge(...objects: Record<string, any>[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const obj of objects) {
      for (const [key, value] of Object.entries(obj)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = this.deepMerge(result[key] || {}, value);
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  private validateConfiguration(): void {
    const errors: string[] = [];

    for (const [key, schemaEntry] of Object.entries(this.schema)) {
      const value = this.get(key);

      if (schemaEntry.required && (value === undefined || value === null)) {
        errors.push(`Required configuration key '${key}' is missing`);
        continue;
      }

      if (value !== undefined && value !== null) {
        if (!this.validateType(value, schemaEntry.type)) {
          errors.push(`Configuration key '${key}' has invalid type. Expected ${schemaEntry.type}, got ${typeof value}`);
        }

        if (schemaEntry.validator && !schemaEntry.validator(value)) {
          errors.push(`Configuration key '${key}' failed custom validation`);
        }
      }
    }

    if (errors.length > 0) {
      throw createValidationError(
        `Configuration validation failed: ${errors.join(', ')}`,
        { operation: 'validateConfiguration' }
      );
    }
  }

  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null && !Array.isArray(value);
      case 'array':
        return Array.isArray(value);
      default:
        return false;
    }
  }

  private applyDefaults(): void {
    for (const [key, schemaEntry] of Object.entries(this.schema)) {
      if (schemaEntry.default !== undefined && this.get(key) === undefined) {
        this.set(key, schemaEntry.default);
      }
    }
  }

  private applyEnvironmentOverrides(): void {
    for (const [key, schemaEntry] of Object.entries(this.schema)) {
      const envVar = schemaEntry.env || this.keyToEnvVar(key);
      const envValue = process.env[envVar];

      if (envValue !== undefined) {
        try {
          const parsedValue = this.parseEnvironmentValue(envValue, schemaEntry.type);
          this.set(key, parsedValue);
          
          if (!schemaEntry.sensitive) {
            logger.debug(`Applied environment override for ${key}`, { envVar });
          }
        } catch (error) {
          logger.warn(`Failed to parse environment variable ${envVar}`, { error });
        }
      }
    }
  }

  private keyToEnvVar(key: string): string {
    return key.replace(/[A-Z]/g, letter => `_${letter}`).toUpperCase();
  }

  private parseEnvironmentValue(value: string, type: string): any {
    switch (type) {
      case 'string':
        return value;
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Cannot parse '${value}' as number`);
        }
        return num;
      case 'boolean':
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === '1') return true;
        if (lower === 'false' || lower === '0') return false;
        throw new Error(`Cannot parse '${value}' as boolean`);
      case 'object':
      case 'array':
        return JSON.parse(value);
      default:
        return value;
    }
  }

  private setupFileWatcher(): void {
    const filesToWatch = [
      this.configPath,
      this.configPath.replace('.json', `.${this.options.environment}.json`),
      this.options.secretsPath,
      this.configPath.replace('.json', '.local.json'),
    ];

    for (const filePath of filesToWatch) {
      if (existsSync(filePath) && !this.watchers.has(filePath)) {
        watchFile(filePath, { interval: 1000 }, (curr, prev) => {
          if (curr.mtime !== prev.mtime) {
            logger.info(`Configuration file changed: ${filePath}`);
            this.reloadConfiguration();
          }
        });
        
        this.watchers.add(filePath);
        logger.debug(`Watching config file: ${filePath}`);
      }
    }
  }

  private reloadConfiguration(): void {
    try {
      const oldConfig = { ...this.config };
      this.loadConfiguration();
      
      this.notifyConfigChanges(oldConfig, this.config);
      
      logger.info('Configuration reloaded successfully');
    } catch (error) {
      logger.error('Failed to reload configuration', { error });
    }
  }

  private notifyConfigChanges(oldConfig: Record<string, any>, newConfig: Record<string, any>): void {
    const allKeys = new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]);
    
    for (const key of allKeys) {
      const oldValue = oldConfig[key];
      const newValue = newConfig[key];
      
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        const event: ConfigChangeEvent = {
          key,
          oldValue,
          newValue,
          timestamp: new Date(),
        };
        
        for (const callback of this.changeCallbacks) {
          try {
            callback(event);
          } catch (error) {
            logger.error('Error in config change callback', { error, key });
          }
        }
        
        const schemaEntry = this.schema[key];
        if (!schemaEntry?.sensitive) {
          logger.info(`Configuration value changed: ${key}`, { oldValue, newValue });
        } else {
          logger.info(`Sensitive configuration value changed: ${key}`);
        }
      }
    }
  }

  get<T = any>(key: string, defaultValue?: T): T {
    const keys = key.split('.');
    let value: any = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue as T;
      }
    }

    return value as T;
  }

  set(key: string, value: any): void {
    const keys = key.split('.');
    let current = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }

    const lastKey = keys[keys.length - 1];
    const oldValue = current[lastKey];
    current[lastKey] = value;

    if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
      const event: ConfigChangeEvent = {
        key,
        oldValue,
        newValue: value,
        timestamp: new Date(),
      };

      for (const callback of this.changeCallbacks) {
        try {
          callback(event);
        } catch (error) {
          logger.error('Error in config change callback', { error, key });
        }
      }
    }
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  getAll(): Record<string, any> {
    return { ...this.config };
  }

  getSanitized(): Record<string, any> {
    const sanitized = { ...this.config };
    
    for (const [key, schemaEntry] of Object.entries(this.schema)) {
      if (schemaEntry.sensitive && this.has(key)) {
        this.setSensitiveValue(sanitized, key, '[REDACTED]');
      }
    }
    
    return sanitized;
  }

  private setSensitiveValue(obj: any, key: string, value: any): void {
    const keys = key.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
  }

  onChange(callback: (event: ConfigChangeEvent) => void): void {
    this.changeCallbacks.push(callback);
  }

  removeChangeListener(callback: (event: ConfigChangeEvent) => void): void {
    const index = this.changeCallbacks.indexOf(callback);
    if (index !== -1) {
      this.changeCallbacks.splice(index, 1);
    }
  }

  validate(): boolean {
    try {
      this.validateConfiguration();
      return true;
    } catch {
      return false;
    }
  }

  getSchema(): ConfigSchema {
    return { ...this.schema };
  }

  setSchema(schema: ConfigSchema): void {
    this.schema = { ...schema };
    
    if (this.options.enableValidation) {
      this.validateConfiguration();
    }
  }

  reset(): void {
    this.config = {};
    this.loadConfiguration();
  }

  getLastLoadTime(): Date | null {
    return this.lastLoadTime;
  }

  getEnvironment(): string {
    return this.options.environment;
  }

  createChild(key: string): ConfigManager {
    const childConfig = this.get(key, {});
    const childSchema: ConfigSchema = {};
    
    for (const [schemaKey, schemaValue] of Object.entries(this.schema)) {
      if (schemaKey.startsWith(`${key}.`)) {
        const childKey = schemaKey.substring(key.length + 1);
        childSchema[childKey] = schemaValue;
      }
    }

    const childManager = new ConfigManager({
      ...this.options,
      enableWatcher: false,
      schema: childSchema,
    });

    childManager.config = childConfig;
    return childManager;
  }

  destroy(): void {
    for (const filePath of this.watchers) {
      unwatchFile(filePath);
    }
    
    this.watchers.clear();
    this.changeCallbacks = [];
    this.config = {};
    
    logger.info('ConfigManager destroyed');
  }
}

export function createConfigManager(options: ConfigOptions = {}): ConfigManager {
  return new ConfigManager(options);
}

export const defaultSchema: ConfigSchema = {
  'server.port': {
    type: 'number',
    required: true,
    default: 8080,
    env: 'PORT',
    description: 'Server port number',
  },
  'server.host': {
    type: 'string',
    required: true,
    default: '0.0.0.0',
    env: 'HOST',
    description: 'Server host address',
  },
  'database.host': {
    type: 'string',
    required: true,
    env: 'DB_HOST',
    description: 'Database host',
  },
  'database.port': {
    type: 'number',
    required: true,
    default: 5432,
    env: 'DB_PORT',
    description: 'Database port',
  },
  'database.name': {
    type: 'string',
    required: true,
    env: 'DB_NAME',
    description: 'Database name',
  },
  'database.username': {
    type: 'string',
    required: true,
    env: 'DB_USER',
    description: 'Database username',
  },
  'database.password': {
    type: 'string',
    required: true,
    sensitive: true,
    env: 'DB_PASSWORD',
    description: 'Database password',
  },
  'redis.host': {
    type: 'string',
    required: true,
    default: 'localhost',
    env: 'REDIS_HOST',
    description: 'Redis host',
  },
  'redis.port': {
    type: 'number',
    required: true,
    default: 6379,
    env: 'REDIS_PORT',
    description: 'Redis port',
  },
  'redis.password': {
    type: 'string',
    sensitive: true,
    env: 'REDIS_PASSWORD',
    description: 'Redis password',
  },
  'logging.level': {
    type: 'string',
    required: true,
    default: 'info',
    env: 'LOG_LEVEL',
    validator: (value) => ['debug', 'info', 'warn', 'error'].includes(value),
    description: 'Logging level',
  },
};