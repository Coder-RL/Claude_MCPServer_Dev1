/**
 * Tests for the Language Model Interface component
 *
 * These tests verify the functionality of the Language Model Interface,
 * including model registration, conversation management, inference,
 * and token counting.
 */

import http from 'http';
import { spawn } from 'child_process';
import chai from 'chai';
const { expect } = chai;

// Test configuration
const SERVER_PORT = 8003;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;
const SERVER_STARTUP_TIMEOUT = 10000; // 10 seconds

describe('Language Model Interface Tests', function() {
  // Increase timeout for the entire test suite
  this.timeout(30000);

  let serverProcess;

  before(async function() {
    console.log('Checking if Language Model Interface server is running...');

    // Check if server is already running
    try {
      const response = await makeRequest('GET', `${SERVER_URL}/health`);
      if (response.statusCode === 200) {
        console.log('Language Model Interface server is running.');
      } else {
        console.warn('Language Model Interface server returned non-200 status code:', response.statusCode);
        this.skip();
      }
    } catch (error) {
      console.error('Language Model Interface server is not running. Please start it with: npm run start:language-model-interface');
      this.skip();
    }
  });

  describe('Basic Functionality', function() {
    it('should respond to health check', async function() {
      const response = await makeRequest('GET', `${SERVER_URL}/health`);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.status).to.equal('healthy');
    });

    it('should list available tools', async function() {
      const response = await makeRequest('GET', `${SERVER_URL}/tools`);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.tools).to.be.an('array');
      expect(data.tools.length).to.be.greaterThan(0);

      // Verify specific tools are available
      const toolNames = data.tools.map(tool => tool.name);
      expect(toolNames).to.include('registerModel');
      expect(toolNames).to.include('createConversation');
      expect(toolNames).to.include('generateChatCompletion');
      expect(toolNames).to.include('countTokens');
    });
  });

  describe('Model Management', function() {
    let modelId;

    it('should register a model', async function() {
      const model = {
        name: 'Test Model',
        provider: 'openai',
        template: 'gpt-4',
        apiEndpoint: 'https://api.example.com/v1'
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/registerModel`, model);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.id).to.be.a('string');

      modelId = data.id;
    });

    it('should get model details', async function() {
      // Skip if model registration failed
      if (!modelId) this.skip();

      const response = await makeRequest('GET', `${SERVER_URL}/tools/getModel?id=${modelId}`);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.model.id).to.equal(modelId);
      expect(data.model.name).to.equal('Test Model');
      expect(data.model.provider).to.equal('openai');
    });

    it('should update model details', async function() {
      // Skip if model registration failed
      if (!modelId) this.skip();

      const updateParams = {
        id: modelId,
        name: 'Updated Test Model',
        apiVersion: 'v2'
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/updateModel`, updateParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.model.name).to.equal('Updated Test Model');
      expect(data.model.apiVersion).to.equal('v2');
    });

    it('should list available models', async function() {
      const response = await makeRequest('GET', `${SERVER_URL}/tools/listModels`);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.models).to.be.an('array');
      expect(data.models.length).to.be.greaterThan(0);
    });
  });

  describe('Conversation Management', function() {
    let modelId;
    let conversationId;

    before(async function() {
      // Register a model for these tests
      const model = {
        name: 'Conversation Test Model',
        provider: 'anthropic',
        template: 'claude-3-opus'
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/registerModel`, model);
      const data = JSON.parse(response.body);

      if (data.success) {
        modelId = data.id;
      }
    });

    it('should create a conversation', async function() {
      // Skip if model registration failed
      if (!modelId) this.skip();

      const conversationParams = {
        modelId,
        title: 'Test Conversation',
        systemMessage: 'You are a helpful assistant.',
        metadata: {
          user: 'test-user',
          purpose: 'testing'
        }
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/createConversation`, conversationParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.conversationId).to.be.a('string');

      conversationId = data.conversationId;
    });

    it('should add a message to the conversation', async function() {
      // Skip if conversation creation failed
      if (!conversationId) this.skip();

      const messageParams = {
        conversationId,
        role: 'user',
        content: 'Hello, how are you?'
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/addMessage`, messageParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.messageId).to.be.a('string');
    });

    it('should get conversation details', async function() {
      // Skip if conversation creation failed
      if (!conversationId) this.skip();

      const response = await makeRequest('GET', `${SERVER_URL}/tools/getConversation?id=${conversationId}`);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.conversation.id).to.equal(conversationId);
      expect(data.conversation.messages).to.be.an('array');
      expect(data.conversation.messages.length).to.be.greaterThan(0);
    });
  });

  describe('Inference', function() {
    let modelId;
    let conversationId;

    before(async function() {
      // Register a model for these tests
      const model = {
        name: 'Inference Test Model',
        provider: 'openai',
        template: 'gpt-4'
      };

      const modelResponse = await makeRequest('POST', `${SERVER_URL}/tools/registerModel`, model);
      const modelData = JSON.parse(modelResponse.body);

      if (modelData.success) {
        modelId = modelData.id;

        // Create a conversation
        const conversationParams = {
          modelId,
          title: 'Inference Test Conversation'
        };

        const convResponse = await makeRequest('POST', `${SERVER_URL}/tools/createConversation`, conversationParams);
        const convData = JSON.parse(convResponse.body);

        if (convData.success) {
          conversationId = convData.conversationId;
        }
      }
    });

    it('should generate a chat completion', async function() {
      // Skip if model registration failed
      if (!modelId) this.skip();

      const messages = [
        { id: '1', role: 'system', content: 'You are a helpful assistant.', createdAt: new Date() },
        { id: '2', role: 'user', content: 'What is the capital of France?', createdAt: new Date() }
      ];

      const completionParams = {
        modelId,
        messages,
        temperature: 0.7,
        maxTokens: 100
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/generateChatCompletion`, completionParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.message).to.be.an('object');
      expect(data.message.role).to.equal('assistant');
      expect(data.message.content).to.be.a('string');
      expect(data.tokenUsage).to.be.an('object');
    });

    it('should generate a completion in a conversation', async function() {
      // Skip if conversation creation failed
      if (!conversationId) this.skip();

      // First add a user message
      const messageParams = {
        conversationId,
        role: 'user',
        content: 'Tell me about quantum computing.'
      };

      await makeRequest('POST', `${SERVER_URL}/tools/addMessage`, messageParams);

      // Then generate a completion
      const completionParams = {
        modelId,
        sessionId: conversationId,
        messages: [
          { id: '1', role: 'user', content: 'Tell me about quantum computing.', createdAt: new Date() }
        ],
        temperature: 0.7,
        maxTokens: 200
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/generateChatCompletion`, completionParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.message).to.be.an('object');
      expect(data.message.content).to.be.a('string');
    });
  });

  describe('Token Management', function() {
    let modelId;

    before(async function() {
      // Register a model for these tests
      const model = {
        name: 'Token Test Model',
        provider: 'openai',
        template: 'gpt-4'
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/registerModel`, model);
      const data = JSON.parse(response.body);

      if (data.success) {
        modelId = data.id;
      }
    });

    it('should count tokens in a text', async function() {
      // Skip if model registration failed
      if (!modelId) this.skip();

      const tokenParams = {
        modelId,
        text: 'This is a test sentence to count tokens. It should have approximately 15 tokens.'
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/countTokens`, tokenParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.tokenCount).to.be.a('number');
      expect(data.tokenCount).to.be.greaterThan(10);
    });

    it('should estimate token usage for a conversation', async function() {
      // Skip if model registration failed
      if (!modelId) this.skip();

      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
        { role: 'assistant', content: 'The capital of France is Paris.' },
        { role: 'user', content: 'What about Germany?' }
      ];

      const estimateParams = {
        modelId,
        messages,
        estimatedResponseLength: 50
      };

      const response = await makeRequest('POST', `${SERVER_URL}/tools/estimateTokenUsage`, estimateParams);
      expect(response.statusCode).to.equal(200);

      const data = JSON.parse(response.body);
      expect(data.success).to.be.true;
      expect(data.promptTokens).to.be.a('number');
      expect(data.estimatedCompletionTokens).to.be.a('number');
      expect(data.estimatedTotalTokens).to.be.a('number');
    });
  });
});

// Helper function to make HTTP requests
function makeRequest(method, url, data = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body
        });
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}
