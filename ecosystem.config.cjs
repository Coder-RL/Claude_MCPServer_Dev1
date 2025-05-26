module.exports = {
  apps: [
    {
      name: 'data-governance',
      script: 'npx',
      args: ['tsx', 'servers/data-analytics/src/data-governance.ts'],
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      env: {
        DATA_GOVERNANCE_ID: 'data-governance-server',
        NODE_ENV: 'development'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/data-governance-error.log',
      out_file: './logs/pm2/data-governance-out.log',
      log_file: './logs/pm2/data-governance-combined.log'
    },
    {
      name: 'data-pipeline',
      script: 'npx',
      args: ['tsx', 'servers/data-analytics/src/data-pipeline.ts'],
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      env: {
        DATA_PIPELINE_ID: 'data-pipeline-server',
        NODE_ENV: 'development'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/data-pipeline-error.log',
      out_file: './logs/pm2/data-pipeline-out.log',
      log_file: './logs/pm2/data-pipeline-combined.log'
    },
    {
      name: 'data-warehouse',
      script: 'npx',
      args: ['tsx', 'servers/data-analytics/src/data-warehouse.ts'],
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      env: {
        DATA_WAREHOUSE_ID: 'data-warehouse-server',
        NODE_ENV: 'development'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/data-warehouse-error.log',
      out_file: './logs/pm2/data-warehouse-out.log',
      log_file: './logs/pm2/data-warehouse-combined.log'
    },
    {
      name: 'ml-deployment',
      script: 'npx',
      args: ['tsx', 'servers/data-analytics/src/ml-deployment.ts'],
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      env: {
        ML_DEPLOYMENT_ID: 'ml-deployment-server',
        NODE_ENV: 'development'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/ml-deployment-error.log',
      out_file: './logs/pm2/ml-deployment-out.log',
      log_file: './logs/pm2/ml-deployment-combined.log'
    },
    {
      name: 'realtime-analytics',
      script: 'npx',
      args: ['tsx', 'servers/data-analytics/src/realtime-analytics.ts'],
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      env: {
        REALTIME_ANALYTICS_ID: 'realtime-analytics-server',
        NODE_ENV: 'development'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/realtime-analytics-error.log',
      out_file: './logs/pm2/realtime-analytics-out.log',
      log_file: './logs/pm2/realtime-analytics-combined.log'
    },
    {
      name: 'enhanced-memory',
      script: 'npx',
      args: ['tsx', 'servers/memory/src/enhanced-memory-server.ts'],
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      env: {
        ENHANCED_MEMORY_ID: 'enhanced-memory-server',
        NODE_ENV: 'development'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',  // Higher memory for advanced processing
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/enhanced-memory-error.log',
      out_file: './logs/pm2/enhanced-memory-out.log',
      log_file: './logs/pm2/enhanced-memory-combined.log'
    },
    {
      name: 'sequential-thinking',
      script: 'node',
      args: ['mcp/sequential-thinking/server.js'],
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      env: {
        SEQUENTIAL_THINKING_ID: 'sequential-thinking-server',
        NODE_ENV: 'development'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/sequential-thinking-error.log',
      out_file: './logs/pm2/sequential-thinking-out.log',
      log_file: './logs/pm2/sequential-thinking-combined.log'
    },
    {
      name: 'security-vulnerability',
      script: 'npx',
      args: ['tsx', 'servers/security-vulnerability/src/security-vulnerability.ts'],
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      env: {
        SECURITY_ID: 'security-vulnerability-server',
        NODE_ENV: 'development'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/security-vulnerability-error.log',
      out_file: './logs/pm2/security-vulnerability-out.log',
      log_file: './logs/pm2/security-vulnerability-combined.log'
    },
    {
      name: 'ui-design',
      script: 'npx',
      args: ['tsx', 'servers/ui-design/src/ui-design.ts'],
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      env: {
        UI_DESIGN_ID: 'ui-design-server',
        NODE_ENV: 'development'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/ui-design-error.log',
      out_file: './logs/pm2/ui-design-out.log',
      log_file: './logs/pm2/ui-design-combined.log'
    },
    {
      name: 'optimization',
      script: 'npx',
      args: ['tsx', 'servers/optimization/src/optimization.ts'],
      cwd: '/Users/robertlee/GitHubProjects/Claude_MCPServer',
      env: {
        OPTIMIZATION_ID: 'optimization-server',
        NODE_ENV: 'development'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2/optimization-error.log',
      out_file: './logs/pm2/optimization-out.log',
      log_file: './logs/pm2/optimization-combined.log'
    }
  ]
};