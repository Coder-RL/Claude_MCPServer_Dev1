export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method?: string;
  params?: any;
  result?: any;
  error?: MCPError;
}

export interface MCPRequest extends MCPMessage {
  method: string;
  params?: any;
}

export interface MCPResponse extends MCPMessage {
  id: string | number | null;
  result?: any;
  error?: MCPError;
}

export interface MCPNotification extends MCPMessage {
  method: string;
  params?: any;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export enum MCPErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  ServerNotInitialized = -32002,
  UnknownErrorCode = -32001,
  RequestFailed = -32000,
  
  // MCP-specific error codes
  ResourceNotFound = -32100,
  ResourceUnavailable = -32101,
  ToolExecutionError = -32200,
  PromptTemplateError = -32300,
  InvalidToolCall = -32400,
  AuthenticationRequired = -32500,
  AuthorizationFailed = -32501,
  RateLimitExceeded = -32600,
  ServiceUnavailable = -32700,
}

export interface ServerCapabilities {
  experimental?: Record<string, any>;
  logging?: {};
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
  sampling?: {};
}

export interface ClientCapabilities {
  experimental?: Record<string, any>;
  roots?: {
    listChanged?: boolean;
  };
  sampling?: {};
}

export interface InitializationOptions {
  serverName: string;
  serverVersion: string;
  capabilities: ServerCapabilities;
  protocolVersion: string;
  instructions?: string;
}

export interface Implementation {
  name: string;
  version: string;
}

export interface InitializeRequest {
  protocolVersion: string;
  capabilities: ClientCapabilities;
  clientInfo: Implementation;
}

export interface InitializeResult {
  protocolVersion: string;
  capabilities: ServerCapabilities;
  serverInfo: Implementation;
  instructions?: string;
}

export interface LoggingLevel {
  level: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
}

export interface LoggingMessage {
  level: LoggingLevel['level'];
  data: any;
  logger?: string;
}

export interface ProgressToken {
  token: string | number;
}

export interface ProgressNotification {
  progressToken: ProgressToken['token'];
  progress: number;
  total?: number;
}

export interface CancelledNotification {
  reason: string;
}

// Resource Types
export interface ResourceReference {
  uri: string;
  type: string;
}

export interface Resource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceTemplate {
  uriTemplate: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface ResourceContents {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

export interface ListResourcesRequest {
  cursor?: string;
}

export interface ListResourcesResult {
  resources: Resource[];
  nextCursor?: string;
}

export interface ListResourceTemplatesResult {
  resourceTemplates: ResourceTemplate[];
}

export interface ReadResourceRequest {
  uri: string;
}

export interface ReadResourceResult {
  contents: ResourceContents[];
}

export interface ResourceUpdatedNotification {
  uri: string;
}

export interface ResourceListChangedNotification {}

// Tool Types
export interface Tool {
  name: string;
  description?: string;
  inputSchema: JSONSchema;
}

export interface ToolCall {
  name: string;
  arguments?: Record<string, any>;
}

export interface ToolResult {
  content: Array<TextContent | ImageContent>;
  isError?: boolean;
}

export interface ListToolsResult {
  tools: Tool[];
}

export interface CallToolRequest {
  name: string;
  arguments?: Record<string, any>;
}

export interface CallToolResult {
  content: Array<TextContent | ImageContent>;
  isError?: boolean;
}

export interface ToolListChangedNotification {}

// Prompt Types
export interface Prompt {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
}

export interface PromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: TextContent | ImageContent;
}

export interface GetPromptRequest {
  name: string;
  arguments?: Record<string, any>;
}

export interface GetPromptResult {
  description?: string;
  messages: PromptMessage[];
}

export interface ListPromptsResult {
  prompts: Prompt[];
}

export interface PromptListChangedNotification {}

// Content Types
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export interface EmbeddedResource {
  type: 'resource';
  resource: ResourceContents;
}

// Root Types
export interface Root {
  uri: string;
  name?: string;
}

export interface ListRootsResult {
  roots: Root[];
}

export interface RootsListChangedNotification {}

// Sampling Types
export interface SamplingMessage {
  role: 'user' | 'assistant';
  content: TextContent | ImageContent;
}

export interface CreateMessageRequest {
  messages: SamplingMessage[];
  modelPreferences?: ModelPreferences;
  systemPrompt?: string;
  includeContext?: string;
  temperature?: number;
  maxTokens: number;
}

export interface CreateMessageResult {
  role: 'assistant';
  content: TextContent | ImageContent;
  model: string;
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens';
}

export interface ModelPreferences {
  hints?: ModelHint[];
  costPriority?: number;
  speedPriority?: number;
  intelligencePriority?: number;
}

export interface ModelHint {
  name?: string;
}

// JSON Schema Types (simplified)
export interface JSONSchema {
  type?: 'null' | 'boolean' | 'object' | 'array' | 'number' | 'string' | 'integer';
  title?: string;
  description?: string;
  default?: any;
  examples?: any[];
  
  // String validation
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  
  // Number validation
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  
  // Array validation
  items?: JSONSchema | JSONSchema[];
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  
  // Object validation
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  minProperties?: number;
  maxProperties?: number;
  
  // Composition
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  
  // Conditional
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;
  
  // References
  $ref?: string;
  definitions?: Record<string, JSONSchema>;
  
  // Enums and constants
  enum?: any[];
  const?: any;
}

// Transport Types
export enum TransportType {
  STDIO = 'stdio',
  WEBSOCKET = 'websocket', 
  HTTP = 'http',
  SSE = 'sse',
}

export interface TransportOptions {
  type: TransportType;
  endpoint?: string;
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  keepAlive?: boolean;
}

export interface TransportMetrics {
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  connectionTime: number;
  lastActivity: Date;
}

// Server Configuration
export interface MCPServerConfig {
  name: string;
  version: string;
  description?: string;
  transport: TransportOptions;
  capabilities: ServerCapabilities;
  environment?: Record<string, string>;
  resources?: ResourceConfig[];
  tools?: ToolConfig[];
  prompts?: PromptConfig[];
  authentication?: AuthenticationConfig;
  rateLimit?: RateLimitConfig;
  logging?: LoggingConfig;
}

export interface ResourceConfig {
  name: string;
  uri: string;
  type: string;
  description?: string;
  mimeType?: string;
  cacheable?: boolean;
  permissions?: string[];
}

export interface ToolConfig {
  name: string;
  description?: string;
  handler: string;
  schema: JSONSchema;
  timeout?: number;
  retries?: number;
  permissions?: string[];
}

export interface PromptConfig {
  name: string;
  description?: string;
  template: string;
  arguments?: PromptArgument[];
  permissions?: string[];
}

export interface AuthenticationConfig {
  type: 'none' | 'bearer' | 'basic' | 'oauth2' | 'custom';
  credentials?: Record<string, string>;
  validation?: {
    endpoint?: string;
    headers?: Record<string, string>;
  };
}

export interface RateLimitConfig {
  requests: number;
  window: number;
  burst?: number;
  keyGenerator?: string;
}

export interface LoggingConfig {
  level: LoggingLevel['level'];
  format: 'json' | 'text';
  destination: 'console' | 'file' | 'syslog';
  file?: string;
}

// Health and Monitoring
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  transport: {
    connected: boolean;
    metrics: TransportMetrics;
  };
  resources: {
    count: number;
    healthy: number;
  };
  tools: {
    count: number;
    healthy: number;
  };
  prompts: {
    count: number;
    healthy: number;
  };
  performance: {
    averageResponseTime: number;
    requestRate: number;
    errorRate: number;
  };
}

// Connection Management
export interface ConnectionInfo {
  id: string;
  clientInfo: Implementation;
  capabilities: ClientCapabilities;
  protocolVersion: string;
  connectedAt: Date;
  lastActivity: Date;
  messageCount: number;
  transport: TransportType;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  averageConnectionTime: number;
  peakConnections: number;
  connectionsByTransport: Record<TransportType, number>;
}

// Server Lifecycle Events
export interface ServerLifecycleEvent {
  type: 'starting' | 'started' | 'stopping' | 'stopped' | 'error' | 'connection' | 'disconnection';
  timestamp: Date;
  data?: any;
}

// Validation Types
export interface ValidationContext {
  method: string;
  params?: any;
  clientCapabilities?: ClientCapabilities;
  serverCapabilities?: ServerCapabilities;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Registry and Discovery
export interface ServerInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  capabilities: ServerCapabilities;
  transport: TransportOptions;
  health: HealthStatus;
  registeredAt: Date;
  lastSeen: Date;
  tags: string[];
  metadata: Record<string, any>;
}

export interface DiscoveryQuery {
  name?: string;
  version?: string;
  tags?: string[];
  capabilities?: string[];
  transport?: TransportType;
  healthStatus?: HealthStatus['status'];
}

// Error Handling
export interface MCPErrorInfo {
  code: MCPErrorCode;
  message: string;
  data?: any;
  method?: string;
  params?: any;
  stack?: string;
}

export function createMCPError(
  code: MCPErrorCode,
  message: string,
  data?: any
): MCPError {
  return {
    code,
    message,
    data,
  };
}

export function isMCPRequest(message: any): message is MCPRequest {
  return (
    message &&
    typeof message === 'object' &&
    message.jsonrpc === '2.0' &&
    typeof message.method === 'string' &&
    (message.id === null || typeof message.id === 'string' || typeof message.id === 'number')
  );
}

export function isMCPResponse(message: any): message is MCPResponse {
  return (
    message &&
    typeof message === 'object' &&
    message.jsonrpc === '2.0' &&
    (message.id === null || typeof message.id === 'string' || typeof message.id === 'number') &&
    (message.result !== undefined || message.error !== undefined) &&
    message.method === undefined
  );
}

export function isMCPNotification(message: any): message is MCPNotification {
  return (
    message &&
    typeof message === 'object' &&
    message.jsonrpc === '2.0' &&
    typeof message.method === 'string' &&
    message.id === undefined
  );
}

export function isMCPMessage(message: any): message is MCPMessage {
  return isMCPRequest(message) || isMCPResponse(message) || isMCPNotification(message);
}