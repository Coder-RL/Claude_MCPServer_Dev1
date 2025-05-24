const http = require("http");

// Simple HTTP wrapper for Sequential Thinking MCP
// The actual sequential thinking logic would normally be a stdio MCP server

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.url === "/health") {
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify({
      status: "healthy", 
      service: "sequential-thinking-mcp",
      version: "1.0.0",
      timestamp: new Date().toISOString()
    }));
  } else if (req.url === "/info") {
    res.writeHead(200, {"Content-Type": "application/json"});
    res.end(JSON.stringify({
      name: "Sequential Thinking MCP",
      description: "Provides sequential thinking capabilities",
      tools: ["think_step_by_step", "analyze_sequence", "plan_execution"],
      port: 3202
    }));
  } else {
    res.writeHead(404, {"Content-Type": "application/json"});
    res.end(JSON.stringify({error: "Not Found"}));
  }
});

const PORT = process.env.PORT || 3202;

server.listen(PORT, () => {
  console.log(`Sequential Thinking MCP HTTP wrapper listening on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Sequential Thinking MCP server...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});