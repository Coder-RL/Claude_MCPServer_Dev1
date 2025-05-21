import * as winston from 'winston';

export interface LoggerConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format?: 'json' | 'text';
  transports?: string[];
  filename?: string;
  maxSize?: string;
  maxFiles?: number;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  format: 'text',
  transports: ['console']
};

export function createLogger(serviceName: string, level: string = 'info', options: Partial<LoggerConfig> = {}): winston.Logger {
  const config = { ...DEFAULT_CONFIG, level: level as any, ...options };
  
  const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.label({ label: serviceName }),
    config.format === 'json' 
      ? winston.format.json()
      : winston.format.printf(({ timestamp, level, message, label, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${label}] ${level}: ${message} ${metaStr}`;
        })
  );

  const transports: winston.transport[] = [];

  // Console transport
  if (config.transports?.includes('console')) {
    transports.push(
      new winston.transports.Console({
        level: config.level,
        format: winston.format.combine(
          winston.format.colorize(),
          logFormat
        )
      })
    );
  }

  // File transport
  if (config.transports?.includes('file') && config.filename) {
    transports.push(
      new winston.transports.File({
        filename: config.filename,
        level: config.level,
        format: logFormat,
        maxsize: parseSize(config.maxSize || '10MB'),
        maxFiles: config.maxFiles || 5
      })
    );
  }

  const logger = winston.createLogger({
    level: config.level,
    format: logFormat,
    transports,
    exitOnError: false
  });

  return logger;
}

function parseSize(size: string): number {
  const units: { [key: string]: number } = {
    'B': 1,
    'KB': 1024,
    'MB': 1024 * 1024,
    'GB': 1024 * 1024 * 1024
  };

  const match = size.match(/^(\d+)(\w+)$/);
  if (!match) {
    throw new Error(`Invalid size format: ${size}`);
  }

  const [, value, unit] = match;
  const multiplier = units[unit.toUpperCase()];
  
  if (!multiplier) {
    throw new Error(`Unknown size unit: ${unit}`);
  }

  return parseInt(value) * multiplier;
}

export default createLogger;