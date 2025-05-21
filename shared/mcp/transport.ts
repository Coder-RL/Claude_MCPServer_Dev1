import { EventEmitter } from 'events';
import { WebSocket, WebSocketServer } from 'ws';
import * as http from 'http';
import * as https from 'https';
import { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../logger.js';
import { MCPError, ErrorCode, ErrorSeverity, createTimeoutError, createServiceUnavailableError } from '../error-handler.js';
import { withRetry } from '../retry-circuit-breaker.js';
import { 
  MCPMessage, 
  MCPRequest, 
  MCPResponse, 
  MCPNotification, 
  TransportType, 
  TransportOptions, 
  TransportMetrics,
  isMCPMessage 
} from './types.js';

const logger = getLogger('MCPTransport');

export interface TransportHandler {
  onMessage(message: MCPMessage): Promise<MCPMessage | void>;
  onConnect?(connectionId: string): Promise<void>;
  onDisconnect?(connectionId: string, reason?: string): Promise<void>;
  onError?(error: Error): Promise<void>;
}

export abstract class BaseTransport extends EventEmitter {
  protected options: TransportOptions;
  protected handler?: TransportHandler;
  protected metrics: TransportMetrics;
  protected connected = false;
  protected connectionId?: string;
  protected heartbeatInterval?: NodeJS.Timeout;
  protected lastActivity = new Date();

  constructor(options: TransportOptions) {
    super();
    this.options = { timeout: 30000, retries: 3, keepAlive: true, ...options };
    this.metrics = {
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      connectionTime: 0,
      lastActivity: new Date(),
    };
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(message: MCPMessage): Promise<void>;
  abstract isConnected(): boolean;

  setHandler(handler: TransportHandler): void {
    this.handler = handler;
  }

  getMetrics(): TransportMetrics {
    return { ...this.metrics };
  }

  protected updateActivity(): void {
    this.lastActivity = new Date();
    this.metrics.lastActivity = this.lastActivity;
  }

  protected async handleMessage(message: MCPMessage): Promise<void> {
    try {
      this.metrics.messagesReceived++;
      this.updateActivity();

      if (!this.handler) {
        logger.warn('No handler set for transport, discarding message');
        return;
      }

      const response = await this.handler.onMessage(message);
      if (response) {
        await this.send(response);
      }
    } catch (error) {
      this.metrics.errors++;
      logger.error('Error handling message', { error, message });
      
      if (this.handler?.onError) {
        await this.handler.onError(error instanceof Error ? error : new Error(String(error)));
      }
      
      this.emit('error', error);
    }
  }

  protected async handleConnect(connectionId: string): Promise<void> {
    this.connected = true;
    this.connectionId = connectionId;
    this.metrics.connectionTime = Date.now();
    this.updateActivity();

    if (this.options.keepAlive) {
      this.startHeartbeat();
    }

    try {
      if (this.handler?.onConnect) {
        await this.handler.onConnect(connectionId);
      }
      this.emit('connect', connectionId);
    } catch (error) {
      logger.error('Error in connect handler', { error, connectionId });
      this.emit('error', error);
    }
  }

  protected async handleDisconnect(reason?: string): Promise<void> {
    this.connected = false;
    this.stopHeartbeat();

    try {
      if (this.handler?.onDisconnect && this.connectionId) {
        await this.handler.onDisconnect(this.connectionId, reason);
      }
      this.emit('disconnect', this.connectionId, reason);
    } catch (error) {
      logger.error('Error in disconnect handler', { error, reason });
    } finally {
      this.connectionId = undefined;
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivity.getTime();
      const heartbeatInterval = 30000;

      if (inactiveTime > heartbeatInterval) {
        this.sendHeartbeat().catch(error => {
          logger.error('Heartbeat failed', { error });
          this.handleDisconnect('heartbeat_failed');
        });
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  protected async sendHeartbeat(): Promise<void> {
    // Override in subclasses if heartbeat is supported
  }

  protected validateMessage(message: any): MCPMessage {
    if (!isMCPMessage(message)) {
      throw new MCPError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid MCP message format',
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        context: { operation: 'validateMessage', message },
      });
    }
    return message;
  }
}

export class StdioTransport extends BaseTransport {
  private inputBuffer = '';

  constructor(options: Partial<TransportOptions> = {}) {
    super({ type: TransportType.STDIO, ...options });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', this.handleStdinData.bind(this));
      process.stdin.on('end', () => this.handleDisconnect('stdin_closed'));
      process.stdin.on('error', (error) => {
        this.metrics.errors++;
        this.emit('error', error);
      });

      await this.handleConnect('stdio');
      logger.info('STDIO transport connected');
    } catch (error) {
      throw new MCPError({
        code: ErrorCode.NETWORK_ERROR,
        message: `Failed to connect STDIO transport: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        context: { operation: 'connect', transport: 'stdio' },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    process.stdin.removeAllListeners();
    await this.handleDisconnect('manual_disconnect');
    logger.info('STDIO transport disconnected');
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.connected) {
      throw createServiceUnavailableError('STDIO transport', { transport: 'stdio' });
    }

    try {
      const serialized = JSON.stringify(message);
      process.stdout.write(serialized + '\n');
      
      this.metrics.messagesSent++;
      this.updateActivity();
    } catch (error) {
      this.metrics.errors++;
      throw new MCPError({
        code: ErrorCode.NETWORK_ERROR,
        message: `Failed to send message via STDIO: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: { operation: 'send', transport: 'stdio', message },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleStdinData(chunk: string): void {
    this.inputBuffer += chunk;
    
    const lines = this.inputBuffer.split('\n');
    this.inputBuffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          const validatedMessage = this.validateMessage(message);
          this.handleMessage(validatedMessage);
        } catch (error) {
          this.metrics.errors++;
          logger.error('Failed to parse STDIO message', { error, line });
        }
      }
    }
  }
}

export class WebSocketTransport extends BaseTransport {
  private ws?: WebSocket;
  private server?: WebSocketServer;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(options: Partial<TransportOptions> = {}) {
    super({ 
      type: TransportType.WEBSOCKET, 
      endpoint: 'ws://localhost:8080',
      ...options 
    });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.establishConnection();
    } catch (error) {
      throw new MCPError({
        code: ErrorCode.NETWORK_ERROR,
        message: `Failed to connect WebSocket transport: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        context: { 
          operation: 'connect', 
          transport: 'websocket',
          endpoint: this.options.endpoint,
          attempts: this.reconnectAttempts,
        },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.options.endpoint!, {
        headers: this.options.headers,
        timeout: this.options.timeout,
      });

      const timeoutId = setTimeout(() => {
        ws.terminate();
        reject(createTimeoutError('WebSocket connection', this.options.timeout!));
      }, this.options.timeout);

      ws.on('open', async () => {
        clearTimeout(timeoutId);
        this.ws = ws;
        this.reconnectAttempts = 0;
        
        await this.handleConnect(`ws_${Date.now()}`);
        logger.info('WebSocket transport connected', { endpoint: this.options.endpoint });
        resolve();
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          const validatedMessage = this.validateMessage(message);
          this.handleMessage(validatedMessage);
        } catch (error) {
          this.metrics.errors++;
          logger.error('Failed to parse WebSocket message', { error, data: data.toString() });
        }
      });

      ws.on('close', (code, reason) => {
        clearTimeout(timeoutId);
        this.handleDisconnect(`close_${code}_${reason}`);
        
        if (this.options.retries && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.scheduleReconnect();
        }
      });

      ws.on('error', (error) => {
        clearTimeout(timeoutId);
        this.metrics.errors++;
        logger.error('WebSocket error', { error });
        this.emit('error', error);
        reject(error);
      });
    });
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    setTimeout(() => {
      logger.info(`Attempting WebSocket reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      this.establishConnection().catch(error => {
        logger.error('WebSocket reconnection failed', { error, attempt: this.reconnectAttempts });
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.emit('error', new Error('Max reconnection attempts exceeded'));
        }
      });
    }, delay);
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection
    
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = undefined;
    }

    if (this.server) {
      this.server.close();
      this.server = undefined;
    }

    await this.handleDisconnect('manual_disconnect');
    logger.info('WebSocket transport disconnected');
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.connected || !this.ws) {
      throw createServiceUnavailableError('WebSocket transport', { transport: 'websocket' });
    }

    try {
      const serialized = JSON.stringify(message);
      
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(serialized);
        this.metrics.messagesSent++;
        this.updateActivity();
      } else {
        throw new Error(`WebSocket not ready, state: ${this.ws.readyState}`);
      }
    } catch (error) {
      this.metrics.errors++;
      throw new MCPError({
        code: ErrorCode.NETWORK_ERROR,
        message: `Failed to send WebSocket message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        context: { operation: 'send', transport: 'websocket', message },
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  async startServer(port: number, host = '0.0.0.0'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = new WebSocketServer({ 
        port, 
        host,
        perMessageDeflate: false 
      });

      this.server.on('connection', (ws, request) => {
        const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            const validatedMessage = this.validateMessage(message);
            this.handleMessage(validatedMessage);
          } catch (error) {
            this.metrics.errors++;
            logger.error('Failed to parse client WebSocket message', { error, clientId });
          }
        });

        ws.on('close', () => {
          logger.info('Client WebSocket disconnected', { clientId });
        });

        ws.on('error', (error) => {
          this.metrics.errors++;
          logger.error('Client WebSocket error', { error, clientId });
        });

        logger.info('Client WebSocket connected', { clientId });
      });

      this.server.on('listening', () => {
        logger.info(`WebSocket server listening on ${host}:${port}`);
        resolve();
      });

      this.server.on('error', (error) => {
        logger.error('WebSocket server error', { error });
        reject(error);
      });
    });
  }

  protected async sendHeartbeat(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.ping();
    }
  }
}

export class HttpTransport extends BaseTransport {
  private server?: http.Server | https.Server;
  private client?: typeof http | typeof https;

  constructor(options: Partial<TransportOptions> = {}) {
    super({ 
      type: TransportType.HTTP, 
      endpoint: 'http://localhost:8080/mcp',
      ...options 
    });
    
    this.client = this.options.endpoint?.startsWith('https') ? https : http;
  }

  async connect(): Promise<void> {
    // HTTP is stateless, so connection is always successful
    await this.handleConnect('http_client');
    logger.info('HTTP transport ready', { endpoint: this.options.endpoint });
  }

  async disconnect(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server!.close(() => resolve());
      });
      this.server = undefined;
    }

    await this.handleDisconnect('manual_disconnect');
    logger.info('HTTP transport disconnected');
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.options.endpoint) {
      throw new MCPError({
        code: ErrorCode.CONFIGURATION_ERROR,
        message: 'No endpoint configured for HTTP transport',
        severity: ErrorSeverity.HIGH,
        retryable: false,
        context: { operation: 'send', transport: 'http' },
      });
    }

    const sendWithRetry = withRetry(this.sendRequest.bind(this), {
      maxAttempts: this.options.retries || 3,
      baseDelay: 1000,
    });

    try {
      await sendWithRetry(message);
      this.metrics.messagesSent++;
      this.updateActivity();
    } catch (error) {
      this.metrics.errors++;
      throw error;
    }
  }

  private async sendRequest(message: MCPMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.options.endpoint!);
      const data = JSON.stringify(message);
      
      const requestOptions: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...this.options.headers,
        },
        timeout: this.options.timeout,
      };

      const req = this.client!.request(requestOptions, (res) => {
        let responseData = '';
        
        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              if (responseData.trim()) {
                const response = JSON.parse(responseData);
                const validatedResponse = this.validateMessage(response);
                this.handleMessage(validatedResponse);
              }
              resolve();
            } catch (error) {
              this.metrics.errors++;
              reject(new MCPError({
                code: ErrorCode.PROTOCOL_ERROR,
                message: `Invalid response format: ${error instanceof Error ? error.message : 'Unknown error'}`,
                severity: ErrorSeverity.MEDIUM,
                retryable: false,
                context: { operation: 'parseResponse', response: responseData },
                cause: error instanceof Error ? error : undefined,
              }));
            }
          } else {
            reject(new MCPError({
              code: ErrorCode.NETWORK_ERROR,
              message: `HTTP request failed with status ${res.statusCode}`,
              severity: ErrorSeverity.MEDIUM,
              retryable: res.statusCode && res.statusCode >= 500,
              context: { 
                operation: 'sendRequest', 
                statusCode: res.statusCode,
                response: responseData,
              },
            }));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(createTimeoutError('HTTP request', this.options.timeout!));
      });

      req.on('error', (error) => {
        reject(new MCPError({
          code: ErrorCode.NETWORK_ERROR,
          message: `HTTP request error: ${error.message}`,
          severity: ErrorSeverity.MEDIUM,
          retryable: true,
          context: { operation: 'sendRequest', endpoint: this.options.endpoint },
          cause: error,
        }));
      });

      req.write(data);
      req.end();
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  async startServer(port: number, host = '0.0.0.0', path = '/mcp'): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res);
      });

      this.server.listen(port, host, () => {
        logger.info(`HTTP server listening on ${host}:${port}${path}`);
        resolve();
      });

      this.server.on('error', (error) => {
        logger.error('HTTP server error', { error });
        reject(error);
      });
    });
  }

  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', async () => {
      try {
        const message = JSON.parse(body);
        const validatedMessage = this.validateMessage(message);
        
        const response = await this.handler?.onMessage(validatedMessage);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(response ? JSON.stringify(response) : '');
        
        this.metrics.messagesReceived++;
        this.updateActivity();
      } catch (error) {
        this.metrics.errors++;
        logger.error('Failed to handle HTTP request', { error, body });
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: error instanceof Error ? error.message : 'Internal server error' 
        }));
      }
    });

    req.on('error', (error) => {
      this.metrics.errors++;
      logger.error('HTTP request error', { error });
      
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad request' }));
      }
    });
  }
}

export function createTransport(options: TransportOptions): BaseTransport {
  switch (options.type) {
    case TransportType.STDIO:
      return new StdioTransport(options);
    case TransportType.WEBSOCKET:
      return new WebSocketTransport(options);
    case TransportType.HTTP:
      return new HttpTransport(options);
    default:
      throw new MCPError({
        code: ErrorCode.CONFIGURATION_ERROR,
        message: `Unsupported transport type: ${options.type}`,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        context: { operation: 'createTransport', transportType: options.type },
      });
  }
}