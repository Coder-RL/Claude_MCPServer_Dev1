#!/usr/bin/env node

// Sequential Thinking MCP Server - STDIO Implementation
console.error("Sequential Thinking MCP Server running on stdio");

class SequentialThinkingServer {
  constructor() {
    this.requestId = 0;
    this.bindMethods();
    this.setupProcess();
  }

  bindMethods() {
    this.handleInput = this.handleInput.bind(this);
    this.sendResponse = this.sendResponse.bind(this);
    this.sendError = this.sendError.bind(this);
  }

  setupProcess() {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', this.handleInput);
    
    process.on('SIGINT', () => {
      console.error('Sequential Thinking MCP Server shutting down...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.error('Sequential Thinking MCP Server shutting down...');
      process.exit(0);
    });
  }

  handleInput(data) {
    const lines = data.trim().split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      try {
        const request = JSON.parse(line);
        this.processRequest(request);
      } catch (error) {
        console.error(`Parse error: ${error.message}`);
        this.sendError('parse_error', error.message);
      }
    }
  }

  processRequest(request) {
    const { id, method, params } = request;

    switch (method) {
      case 'initialize':
        this.sendResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'sequential-thinking',
            version: '1.0.0'
          }
        });
        break;

      case 'tools/list':
        this.sendResponse(id, {
          tools: [
            {
              name: 'think_step_by_step',
              description: 'Break down complex problems into sequential steps',
              inputSchema: {
                type: 'object',
                properties: {
                  problem: {
                    type: 'string',
                    description: 'The complex problem to analyze'
                  },
                  context: {
                    type: 'string',
                    description: 'Additional context for the problem'
                  }
                },
                required: ['problem']
              }
            },
            {
              name: 'analyze_sequence',
              description: 'Analyze a sequence of events or actions',
              inputSchema: {
                type: 'object',
                properties: {
                  sequence: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'The sequence to analyze'
                  }
                },
                required: ['sequence']
              }
            },
            {
              name: 'plan_execution',
              description: 'Create an execution plan with sequential steps',
              inputSchema: {
                type: 'object',
                properties: {
                  goal: {
                    type: 'string',
                    description: 'The goal to achieve'
                  },
                  constraints: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Any constraints to consider'
                  }
                },
                required: ['goal']
              }
            }
          ]
        });
        break;

      case 'tools/call':
        this.handleToolCall(id, params);
        break;

      default:
        this.sendError(id, `Unknown method: ${method}`);
    }
  }

  handleToolCall(id, params) {
    const { name, arguments: args } = params;

    switch (name) {
      case 'think_step_by_step':
        this.thinkStepByStep(id, args);
        break;
      case 'analyze_sequence':
        this.analyzeSequence(id, args);
        break;
      case 'plan_execution':
        this.planExecution(id, args);
        break;
      default:
        this.sendError(id, `Unknown tool: ${name}`);
    }
  }

  thinkStepByStep(id, args) {
    const { problem, context = '' } = args;
    
    const steps = [
      `1. Understanding the Problem: ${problem}`,
      `2. Context Analysis: ${context || 'No additional context provided'}`,
      `3. Breaking Down: Identify key components and dependencies`,
      `4. Sequential Approach: Determine logical order of operations`,
      `5. Validation: Check each step for completeness and accuracy`
    ];

    this.sendResponse(id, {
      content: [
        {
          type: 'text',
          text: `Sequential thinking analysis:\n\n${steps.join('\n\n')}\n\nNext steps: Proceed with detailed analysis of each component.`
        }
      ]
    });
  }

  analyzeSequence(id, args) {
    const { sequence } = args;
    
    const analysis = sequence.map((item, index) => 
      `Step ${index + 1}: ${item} - Dependencies: ${index > 0 ? `Step ${index}` : 'None'}`
    );

    this.sendResponse(id, {
      content: [
        {
          type: 'text',
          text: `Sequence Analysis:\n\n${analysis.join('\n')}\n\nFlow integrity: ${sequence.length} steps identified with clear dependencies.`
        }
      ]
    });
  }

  planExecution(id, args) {
    const { goal, constraints = [] } = args;
    
    const plan = [
      `Execution Plan for: ${goal}`,
      ``,
      `Phase 1: Preparation`,
      `- Gather required resources`,
      `- Validate prerequisites`,
      ``,
      `Phase 2: Implementation`,
      `- Execute core actions`,
      `- Monitor progress`,
      ``,
      `Phase 3: Validation`,
      `- Verify outcomes`,
      `- Document results`,
      ``,
      `Constraints considered: ${constraints.length > 0 ? constraints.join(', ') : 'None specified'}`
    ];

    this.sendResponse(id, {
      content: [
        {
          type: 'text',
          text: plan.join('\n')
        }
      ]
    });
  }

  sendResponse(id, result) {
    const response = {
      jsonrpc: '2.0',
      id,
      result
    };
    console.log(JSON.stringify(response));
  }

  sendError(id, message, code = -1) {
    const response = {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message
      }
    };
    console.log(JSON.stringify(response));
  }
}

new SequentialThinkingServer();