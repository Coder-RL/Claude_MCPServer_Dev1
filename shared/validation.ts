import { MCPError, ErrorCode, ErrorSeverity } from './error-handler.js';
import { getLogger } from './logger.js';

const logger = getLogger('Validation');

export interface ValidationRule<T = any> {
  name: string;
  validator: (value: T) => boolean | Promise<boolean>;
  message: string;
  severity?: ErrorSeverity;
}

export interface FieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date' | 'email' | 'uuid' | 'url';
  required?: boolean;
  nullable?: boolean;
  default?: any;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp | string;
  enum?: any[];
  custom?: ValidationRule[];
  items?: FieldSchema;
  properties?: Record<string, FieldSchema>;
  description?: string;
}

export interface ValidationSchema {
  [key: string]: FieldSchema;
}

export interface ValidationError {
  field: string;
  value: any;
  rule: string;
  message: string;
  severity: ErrorSeverity;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  data: any;
}

export class SchemaValidator {
  private schema: ValidationSchema;
  private globalRules: ValidationRule[] = [];

  constructor(schema: ValidationSchema = {}) {
    this.schema = schema;
  }

  addGlobalRule(rule: ValidationRule): void {
    this.globalRules.push(rule);
  }

  removeGlobalRule(ruleName: string): void {
    this.globalRules = this.globalRules.filter(rule => rule.name !== ruleName);
  }

  async validate(data: any, options: { 
    strict?: boolean;
    allowUnknown?: boolean;
    removeUnknown?: boolean;
  } = {}): Promise<ValidationResult> {
    const { strict = false, allowUnknown = true, removeUnknown = false } = options;
    
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      data: this.cloneData(data),
    };

    if (data === null || data === undefined) {
      result.valid = false;
      result.errors.push({
        field: 'root',
        value: data,
        rule: 'required',
        message: 'Data cannot be null or undefined',
        severity: ErrorSeverity.HIGH,
      });
      return result;
    }

    if (typeof data !== 'object' || Array.isArray(data)) {
      result.valid = false;
      result.errors.push({
        field: 'root',
        value: data,
        rule: 'type',
        message: 'Data must be an object',
        severity: ErrorSeverity.HIGH,
      });
      return result;
    }

    await this.validateObject(data, this.schema, result, '', {
      strict,
      allowUnknown,
      removeUnknown,
    });

    for (const rule of this.globalRules) {
      try {
        const isValid = await rule.validator(result.data);
        if (!isValid) {
          const error: ValidationError = {
            field: 'global',
            value: result.data,
            rule: rule.name,
            message: rule.message,
            severity: rule.severity || ErrorSeverity.MEDIUM,
          };

          if (error.severity === ErrorSeverity.LOW) {
            result.warnings.push(error);
          } else {
            result.errors.push(error);
            result.valid = false;
          }
        }
      } catch (error) {
        logger.error(`Error in global validation rule ${rule.name}`, { error });
        result.errors.push({
          field: 'global',
          value: result.data,
          rule: rule.name,
          message: `Validation rule error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: ErrorSeverity.HIGH,
        });
        result.valid = false;
      }
    }

    return result;
  }

  private async validateObject(
    obj: any,
    schema: ValidationSchema,
    result: ValidationResult,
    path: string,
    options: { strict: boolean; allowUnknown: boolean; removeUnknown: boolean }
  ): Promise<void> {
    const processedFields = new Set<string>();

    for (const [fieldName, fieldSchema] of Object.entries(schema)) {
      const fieldPath = path ? `${path}.${fieldName}` : fieldName;
      const value = obj[fieldName];
      
      processedFields.add(fieldName);

      if (value === undefined || value === null) {
        if (fieldSchema.required && !fieldSchema.nullable) {
          result.errors.push({
            field: fieldPath,
            value,
            rule: 'required',
            message: `Field '${fieldPath}' is required`,
            severity: ErrorSeverity.HIGH,
          });
          result.valid = false;
          continue;
        }

        if (value === null && !fieldSchema.nullable) {
          result.errors.push({
            field: fieldPath,
            value,
            rule: 'nullable',
            message: `Field '${fieldPath}' cannot be null`,
            severity: ErrorSeverity.HIGH,
          });
          result.valid = false;
          continue;
        }

        if (value === undefined && fieldSchema.default !== undefined) {
          this.setNestedValue(result.data, fieldPath, fieldSchema.default);
        }

        continue;
      }

      await this.validateField(value, fieldSchema, result, fieldPath);
    }

    if (!options.allowUnknown) {
      for (const key of Object.keys(obj)) {
        if (!processedFields.has(key)) {
          const fieldPath = path ? `${path}.${key}` : key;
          
          if (options.removeUnknown) {
            this.deleteNestedValue(result.data, fieldPath);
          } else if (options.strict) {
            result.errors.push({
              field: fieldPath,
              value: obj[key],
              rule: 'unknown',
              message: `Unknown field '${fieldPath}' is not allowed`,
              severity: ErrorSeverity.MEDIUM,
            });
            result.valid = false;
          } else {
            result.warnings.push({
              field: fieldPath,
              value: obj[key],
              rule: 'unknown',
              message: `Unknown field '${fieldPath}' detected`,
              severity: ErrorSeverity.LOW,
            });
          }
        }
      }
    }
  }

  private async validateField(
    value: any,
    schema: FieldSchema,
    result: ValidationResult,
    path: string
  ): Promise<void> {
    if (!this.validateType(value, schema.type)) {
      result.errors.push({
        field: path,
        value,
        rule: 'type',
        message: `Field '${path}' must be of type ${schema.type}`,
        severity: ErrorSeverity.HIGH,
      });
      result.valid = false;
      return;
    }

    const typeValidation = await this.validateTypeSpecific(value, schema, path);
    if (!typeValidation.valid) {
      result.errors.push(...typeValidation.errors);
      result.warnings.push(...typeValidation.warnings);
      result.valid = result.valid && typeValidation.valid;
    }

    if (schema.custom) {
      for (const rule of schema.custom) {
        try {
          const isValid = await rule.validator(value);
          if (!isValid) {
            const error: ValidationError = {
              field: path,
              value,
              rule: rule.name,
              message: rule.message,
              severity: rule.severity || ErrorSeverity.MEDIUM,
            };

            if (error.severity === ErrorSeverity.LOW) {
              result.warnings.push(error);
            } else {
              result.errors.push(error);
              result.valid = false;
            }
          }
        } catch (error) {
          logger.error(`Error in custom validation rule ${rule.name} for field ${path}`, { error });
          result.errors.push({
            field: path,
            value,
            rule: rule.name,
            message: `Custom validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            severity: ErrorSeverity.HIGH,
          });
          result.valid = false;
        }
      }
    }
  }

  private validateType(value: any, type: string): boolean {
    switch (type) {
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
      case 'date':
        return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
      case 'email':
        return typeof value === 'string' && this.isValidEmail(value);
      case 'uuid':
        return typeof value === 'string' && this.isValidUUID(value);
      case 'url':
        return typeof value === 'string' && this.isValidURL(value);
      default:
        return false;
    }
  }

  private async validateTypeSpecific(
    value: any,
    schema: FieldSchema,
    path: string
  ): Promise<Pick<ValidationResult, 'valid' | 'errors' | 'warnings'>> {
    const result = { valid: true, errors: [] as ValidationError[], warnings: [] as ValidationError[] };

    switch (schema.type) {
      case 'string':
      case 'email':
      case 'uuid':
      case 'url':
        this.validateStringConstraints(value, schema, path, result);
        break;
      case 'number':
        this.validateNumberConstraints(value, schema, path, result);
        break;
      case 'array':
        await this.validateArrayConstraints(value, schema, path, result);
        break;
      case 'object':
        if (schema.properties) {
          await this.validateObject(value, schema.properties, result as ValidationResult, path, {
            strict: false,
            allowUnknown: true,
            removeUnknown: false,
          });
        }
        break;
    }

    if (schema.enum && !schema.enum.includes(value)) {
      result.errors.push({
        field: path,
        value,
        rule: 'enum',
        message: `Field '${path}' must be one of: ${schema.enum.join(', ')}`,
        severity: ErrorSeverity.HIGH,
      });
      result.valid = false;
    }

    return result;
  }

  private validateStringConstraints(
    value: string,
    schema: FieldSchema,
    path: string,
    result: Pick<ValidationResult, 'valid' | 'errors' | 'warnings'>
  ): void {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      result.errors.push({
        field: path,
        value,
        rule: 'minLength',
        message: `Field '${path}' must be at least ${schema.minLength} characters long`,
        severity: ErrorSeverity.MEDIUM,
      });
      result.valid = false;
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      result.errors.push({
        field: path,
        value,
        rule: 'maxLength',
        message: `Field '${path}' must be at most ${schema.maxLength} characters long`,
        severity: ErrorSeverity.MEDIUM,
      });
      result.valid = false;
    }

    if (schema.pattern) {
      const regex = typeof schema.pattern === 'string' ? new RegExp(schema.pattern) : schema.pattern;
      if (!regex.test(value)) {
        result.errors.push({
          field: path,
          value,
          rule: 'pattern',
          message: `Field '${path}' does not match the required pattern`,
          severity: ErrorSeverity.MEDIUM,
        });
        result.valid = false;
      }
    }
  }

  private validateNumberConstraints(
    value: number,
    schema: FieldSchema,
    path: string,
    result: Pick<ValidationResult, 'valid' | 'errors' | 'warnings'>
  ): void {
    if (schema.min !== undefined && value < schema.min) {
      result.errors.push({
        field: path,
        value,
        rule: 'min',
        message: `Field '${path}' must be at least ${schema.min}`,
        severity: ErrorSeverity.MEDIUM,
      });
      result.valid = false;
    }

    if (schema.max !== undefined && value > schema.max) {
      result.errors.push({
        field: path,
        value,
        rule: 'max',
        message: `Field '${path}' must be at most ${schema.max}`,
        severity: ErrorSeverity.MEDIUM,
      });
      result.valid = false;
    }
  }

  private async validateArrayConstraints(
    value: any[],
    schema: FieldSchema,
    path: string,
    result: Pick<ValidationResult, 'valid' | 'errors' | 'warnings'>
  ): Promise<void> {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      result.errors.push({
        field: path,
        value,
        rule: 'minLength',
        message: `Array '${path}' must have at least ${schema.minLength} items`,
        severity: ErrorSeverity.MEDIUM,
      });
      result.valid = false;
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      result.errors.push({
        field: path,
        value,
        rule: 'maxLength',
        message: `Array '${path}' must have at most ${schema.maxLength} items`,
        severity: ErrorSeverity.MEDIUM,
      });
      result.valid = false;
    }

    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        await this.validateField(value[i], schema.items, result as ValidationResult, `${path}[${i}]`);
      }
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  private isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private cloneData(data: any): any {
    return JSON.parse(JSON.stringify(data));
  }

  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  private deleteNestedValue(obj: any, path: string): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current) || typeof current[key] !== 'object') {
        return;
      }
      current = current[key];
    }

    delete current[keys[keys.length - 1]];
  }

  getSchema(): ValidationSchema {
    return { ...this.schema };
  }

  setSchema(schema: ValidationSchema): void {
    this.schema = { ...schema };
  }

  mergeSchema(additionalSchema: ValidationSchema): void {
    this.schema = { ...this.schema, ...additionalSchema };
  }
}

export class Serializer {
  private transformers: Map<string, (value: any) => any> = new Map();
  private deserializers: Map<string, (value: any) => any> = new Map();

  addTransformer(type: string, transformer: (value: any) => any): void {
    this.transformers.set(type, transformer);
  }

  addDeserializer(type: string, deserializer: (value: any) => any): void {
    this.deserializers.set(type, deserializer);
  }

  serialize(data: any, schema?: ValidationSchema): string {
    try {
      const transformed = this.transformData(data, schema || {});
      return JSON.stringify(transformed, null, 2);
    } catch (error) {
      throw new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: `Serialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'serialize' },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  deserialize<T = any>(serializedData: string, schema?: ValidationSchema): T {
    try {
      const parsed = JSON.parse(serializedData);
      return this.deserializeData(parsed, schema || {}) as T;
    } catch (error) {
      throw new MCPError({
        code: ErrorCode.INTERNAL_ERROR,
        message: `Deserialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'deserialize' },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  private transformData(data: any, schema: ValidationSchema): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.transformData(item, schema));
    }

    if (typeof data === 'object') {
      const transformed: any = {};
      
      for (const [key, value] of Object.entries(data)) {
        const fieldSchema = schema[key];
        
        if (fieldSchema?.type && this.transformers.has(fieldSchema.type)) {
          const transformer = this.transformers.get(fieldSchema.type)!;
          transformed[key] = transformer(value);
        } else if (typeof value === 'object' && fieldSchema?.properties) {
          transformed[key] = this.transformData(value, fieldSchema.properties);
        } else {
          transformed[key] = value;
        }
      }
      
      return transformed;
    }

    return data;
  }

  private deserializeData(data: any, schema: ValidationSchema): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(item => this.deserializeData(item, schema));
    }

    if (typeof data === 'object') {
      const deserialized: any = {};
      
      for (const [key, value] of Object.entries(data)) {
        const fieldSchema = schema[key];
        
        if (fieldSchema?.type && this.deserializers.has(fieldSchema.type)) {
          const deserializer = this.deserializers.get(fieldSchema.type)!;
          deserialized[key] = deserializer(value);
        } else if (typeof value === 'object' && fieldSchema?.properties) {
          deserialized[key] = this.deserializeData(value, fieldSchema.properties);
        } else {
          deserialized[key] = value;
        }
      }
      
      return deserialized;
    }

    return data;
  }
}

export const defaultSerializer = new Serializer();

defaultSerializer.addTransformer('date', (value: Date) => value.toISOString());
defaultSerializer.addDeserializer('date', (value: string) => new Date(value));

export function createValidator(schema: ValidationSchema): SchemaValidator {
  return new SchemaValidator(schema);
}

export function validateData(data: any, schema: ValidationSchema): Promise<ValidationResult> {
  const validator = new SchemaValidator(schema);
  return validator.validate(data);
}

export function createValidationRule(
  name: string,
  validator: (value: any) => boolean | Promise<boolean>,
  message: string,
  severity: ErrorSeverity = ErrorSeverity.MEDIUM
): ValidationRule {
  return { name, validator, message, severity };
}

export const commonValidationRules = {
  notEmpty: createValidationRule(
    'notEmpty',
    (value: any) => value !== null && value !== undefined && value !== '',
    'Value cannot be empty'
  ),
  
  positiveNumber: createValidationRule(
    'positiveNumber',
    (value: number) => typeof value === 'number' && value > 0,
    'Value must be a positive number'
  ),
  
  nonEmptyArray: createValidationRule(
    'nonEmptyArray',
    (value: any[]) => Array.isArray(value) && value.length > 0,
    'Array cannot be empty'
  ),
  
  validPort: createValidationRule(
    'validPort',
    (value: number) => typeof value === 'number' && value >= 1 && value <= 65535,
    'Port must be between 1 and 65535'
  ),
  
  alphanumeric: createValidationRule(
    'alphanumeric',
    (value: string) => typeof value === 'string' && /^[a-zA-Z0-9]+$/.test(value),
    'Value must contain only alphanumeric characters'
  ),
};