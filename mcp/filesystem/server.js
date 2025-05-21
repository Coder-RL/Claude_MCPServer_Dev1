const http = require("http");
  const fs = require("fs");
  const path = require("path");
  
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, {"Content-Type": "application/json"});
      res.end(JSON.stringify({status: "healthy", service: "filesystem-mcp"}));
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });
  
  server.listen(3203, () => console.log("Filesystem MCP on 3203"));
  
