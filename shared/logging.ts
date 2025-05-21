export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  metadata?: Record<string, any>;
  source?: string;
  traceId?: string;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  filePath?: string;
  enableStructured: boolean;
  source?: string;
}

class Logger {
  private config: LoggerConfig;

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: this.parseLogLevel(process.env.LOG_LEVEL) || LogLevel.INFO,
      enableConsole: process.env.LOG_CONSOLE !== 'false',
      enableFile: process.env.LOG_FILE === 'true',
      filePath: process.env.LOG_FILE_PATH || './logs/app.log',
      enableStructured: process.env.LOG_STRUCTURED === 'true',
      source: process.env.LOG_SOURCE || 'claude-mcp-server',
      ...config,
    };
  }

  private parseLogLevel(level?: string): LogLevel | undefined {
    if (!level) return undefined;
    
    switch (level.toUpperCase()) {
      case 'ERROR':
        return LogLevel.ERROR;
      case 'WARN':
        return LogLevel.WARN;
      case 'INFO':
        return LogLevel.INFO;
      case 'DEBUG':
        return LogLevel.DEBUG;
      default:
        return undefined;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.config.level;
  }

  private formatMessage(level: LogLevel, message: string, metadata?: Record<string, any>): string {
    const timestamp = new Date().toISOString();
    const levelStr = LogLevel[level];

    if (this.config.enableStructured) {
      const logEntry: LogEntry = {
        timestamp,
        level: levelStr,
        message,
        metadata,
        source: this.config.source,
      };
      return JSON.stringify(logEntry);
    }

    const metadataStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
    return `[${timestamp}] ${levelStr.padEnd(5)} ${message}${metadataStr}`;
  }

  private output(level: LogLevel, formattedMessage: string): void {
    if (this.config.enableConsole) {
      switch (level) {
        case LogLevel.ERROR:
          console.error(formattedMessage);
          break;
        case LogLevel.WARN:
          console.warn(formattedMessage);
          break;
        case LogLevel.INFO:
          console.info(formattedMessage);
          break;
        case LogLevel.DEBUG:
          console.debug(formattedMessage);
          break;
      }
    }

    // File logging can be implemented here if needed
    if (this.config.enableFile) {
      // TODO: Implement file logging
    }
  }

  error(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const formatted = this.formatMessage(LogLevel.ERROR, message, metadata);
    this.output(LogLevel.ERROR, formatted);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const formatted = this.formatMessage(LogLevel.WARN, message, metadata);
    this.output(LogLevel.WARN, formatted);
  }

  info(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const formatted = this.formatMessage(LogLevel.INFO, message, metadata);
    this.output(LogLevel.INFO, formatted);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const formatted = this.formatMessage(LogLevel.DEBUG, message, metadata);
    this.output(LogLevel.DEBUG, formatted);
  }

  /**
   * Create a child logger with additional context
   */
  child(source: string, defaultMetadata?: Record<string, any>): Logger {
    const childLogger = new Logger({
      ...this.config,
      source: `${this.config.source}:${source}`,
    });

    if (defaultMetadata) {
      // Override methods to include default metadata
      const originalError = childLogger.error.bind(childLogger);
      const originalWarn = childLogger.warn.bind(childLogger);
      const originalInfo = childLogger.info.bind(childLogger);
      const originalDebug = childLogger.debug.bind(childLogger);

      childLogger.error = (message: string, metadata?: Record<string, any>) => {
        originalError(message, { ...defaultMetadata, ...metadata });
      };

      childLogger.warn = (message: string, metadata?: Record<string, any>) => {
        originalWarn(message, { ...defaultMetadata, ...metadata });
      };

      childLogger.info = (message: string, metadata?: Record<string, any>) => {
        originalInfo(message, { ...defaultMetadata, ...metadata });
      };

      childLogger.debug = (message: string, metadata?: Record<string, any>) => {
        originalDebug(message, { ...defaultMetadata, ...metadata });
      };
    }

    return childLogger;
  }
}

// Create and export the default logger instance
export const logger = new Logger();

// Export the Logger class for custom instances
export { Logger };