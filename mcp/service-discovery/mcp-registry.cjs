#!/usr/bin/env node

/**
 * MCP Service Discovery Registry
 * Centralized registry for all MCP services with health monitoring,
 * load balancing, and automatic failover capabilities
 */

const http = require('http');
const EventEmitter = require('events');

class MCPServiceRegistry extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 3200;
    this.services = new Map();
    this.healthChecks = new Map();
    this.loadBalancers = new Map();
    this.server = null;
    this.startTime = Date.now();
    
    // Configuration
    this.config = {
      healthCheckInterval: options.healthCheckInterval || 30000, // 30 seconds
      failureThreshold: options.failureThreshold || 3,
      recoveryThreshold: options.recoveryThreshold || 2,
      loadBalancingStrategy: options.loadBalancingStrategy || 'round_robin',
      ...options
    };
    
    this.requestCounts = new Map();
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      activeServices: 0
    };
    
    this.initializeServer();
    this.startHealthMonitoring();
  }

  initializeServer() {
    this.server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      this.handleRequest(req, res);
    });
  }

  async handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const method = req.method.toLowerCase();

    try {
      this.metrics.totalRequests++;

      // Health endpoint
      if (path === '/health' && method === 'get') {
        return this.handleHealth(req, res);
      }

      // Registry management endpoints
      if (path === '/registry/services' && method === 'get') {
        return this.handleListServices(req, res);
      }

      if (path === '/registry/services' && method === 'post') {
        return this.handleRegisterService(req, res);
      }

      if (path.startsWith('/registry/services/') && method === 'delete') {
        const serviceId = path.split('/')[3];
        return this.handleUnregisterService(req, res, serviceId);
      }

      // Service discovery endpoints
      if (path === '/discover' && method === 'post') {
        return this.handleServiceDiscovery(req, res);
      }

      if (path === '/proxy' && method === 'post') {
        return this.handleServiceProxy(req, res);
      }

      // Load balancing endpoint
      if (path === '/balance' && method === 'post') {
        return this.handleLoadBalance(req, res);
      }

      // Metrics endpoint
      if (path === '/metrics' && method === 'get') {
        return this.handleMetrics(req, res);
      }

      // Dashboard endpoint
      if (path === '/dashboard' && method === 'get') {
        return this.handleDashboard(req, res);
      }

      // 404 for unknown endpoints
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));

    } catch (error) {
      console.error('Request handling error:', error);
      this.metrics.failedRequests++;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Internal server error', 
        details: error.message 
      }));
    }
  }

  async handleHealth(req, res) {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'mcp-service-registry',
      version: '1.0.0',
      uptime: Date.now() - this.startTime,
      services: {
        total: this.services.size,
        healthy: Array.from(this.services.values()).filter(s => s.status === 'healthy').length,
        unhealthy: Array.from(this.services.values()).filter(s => s.status === 'unhealthy').length
      },
      metrics: this.metrics
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
  }

  async handleListServices(req, res) {
    const services = Array.from(this.services.values()).map(service => ({
      id: service.id,
      name: service.name,
      type: service.type,
      url: service.url,
      status: service.status,
      lastSeen: service.lastSeen,
      responseTime: service.responseTime,
      requestCount: this.requestCounts.get(service.id) || 0,
      capabilities: service.capabilities,
      version: service.version
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      services,
      total: services.length,
      summary: {
        healthy: services.filter(s => s.status === 'healthy').length,
        unhealthy: services.filter(s => s.status === 'unhealthy').length,
        types: [...new Set(services.map(s => s.type))]
      }
    }));
  }

  async handleRegisterService(req, res) {
    const body = await this.readRequestBody(req);
    const serviceInfo = JSON.parse(body);

    const requiredFields = ['name', 'type', 'url'];
    for (const field of requiredFields) {
      if (!serviceInfo[field]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Missing required field: ${field}` }));
        return;
      }
    }

    const serviceId = serviceInfo.id || `${serviceInfo.type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const service = {
      id: serviceId,
      name: serviceInfo.name,
      type: serviceInfo.type,
      url: serviceInfo.url,
      capabilities: serviceInfo.capabilities || [],
      version: serviceInfo.version || '1.0.0',
      status: 'unknown',
      registered: new Date(),
      lastSeen: null,
      responseTime: null,
      failureCount: 0,
      successCount: 0,
      metadata: serviceInfo.metadata || {}
    };

    this.services.set(serviceId, service);
    this.requestCounts.set(serviceId, 0);

    // Immediately check health
    setTimeout(() => this.checkServiceHealth(serviceId), 1000);

    console.log(`📝 Registered service: ${service.name} (${serviceId})`);
    this.emit('service_registered', service);

    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      service_id: serviceId,
      service: {
        id: service.id,
        name: service.name,
        type: service.type,
        url: service.url,
        status: service.status
      }
    }));
  }

  async handleUnregisterService(req, res, serviceId) {
    if (!this.services.has(serviceId)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service not found' }));
      return;
    }

    const service = this.services.get(serviceId);
    this.services.delete(serviceId);
    this.requestCounts.delete(serviceId);
    this.healthChecks.delete(serviceId);

    console.log(`🗑️  Unregistered service: ${service.name} (${serviceId})`);
    this.emit('service_unregistered', service);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      message: 'Service unregistered successfully',
      service_id: serviceId
    }));
  }

  async handleServiceDiscovery(req, res) {
    const body = await this.readRequestBody(req);
    const { type, capabilities, requirements } = JSON.parse(body);

    let candidates = Array.from(this.services.values());

    // Filter by type
    if (type) {
      candidates = candidates.filter(s => s.type === type);
    }

    // Filter by capabilities
    if (capabilities && capabilities.length > 0) {
      candidates = candidates.filter(s => 
        capabilities.every(cap => s.capabilities.includes(cap))
      );
    }

    // Filter by status (only healthy services)
    candidates = candidates.filter(s => s.status === 'healthy');

    // Apply requirements filtering
    if (requirements) {
      if (requirements.minResponseTime) {
        candidates = candidates.filter(s => 
          s.responseTime && s.responseTime <= requirements.minResponseTime
        );
      }
      if (requirements.minSuccessRate) {
        candidates = candidates.filter(s => {
          const total = s.successCount + s.failureCount;
          if (total === 0) return true;
          return (s.successCount / total) >= requirements.minSuccessRate;
        });
      }
    }

    // Sort by performance metrics
    candidates.sort((a, b) => {
      // Primary: Success rate
      const aSuccessRate = a.successCount / Math.max(1, a.successCount + a.failureCount);
      const bSuccessRate = b.successCount / Math.max(1, b.successCount + b.failureCount);
      
      if (Math.abs(aSuccessRate - bSuccessRate) > 0.1) {
        return bSuccessRate - aSuccessRate;
      }
      
      // Secondary: Response time
      return (a.responseTime || Infinity) - (b.responseTime || Infinity);
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      query: { type, capabilities, requirements },
      services: candidates.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        url: s.url,
        capabilities: s.capabilities,
        responseTime: s.responseTime,
        successRate: s.successCount / Math.max(1, s.successCount + s.failureCount)
      })),
      total: candidates.length
    }));
  }

  async handleServiceProxy(req, res) {
    const body = await this.readRequestBody(req);
    const { service_id, path, method = 'GET', data, headers = {} } = JSON.parse(body);

    if (!this.services.has(service_id)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service not found' }));
      return;
    }

    const service = this.services.get(service_id);
    if (service.status !== 'healthy') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Service unavailable' }));
      return;
    }

    try {
      const startTime = Date.now();
      const response = await this.makeRequest(method, `${service.url}${path}`, data, 10000, headers);
      const responseTime = Date.now() - startTime;

      // Update metrics
      this.requestCounts.set(service_id, (this.requestCounts.get(service_id) || 0) + 1);
      service.responseTime = responseTime;
      service.successCount++;
      this.metrics.successfulRequests++;

      res.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        service_id,
        response: {
          statusCode: response.statusCode,
          headers: response.headers,
          body: response.body,
          responseTime
        }
      }));

    } catch (error) {
      service.failureCount++;
      this.metrics.failedRequests++;

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        service_id,
        error: error.message
      }));
    }
  }

  async handleLoadBalance(req, res) {
    const body = await this.readRequestBody(req);
    const { type, path, method = 'GET', data, strategy } = JSON.parse(body);

    // Find healthy services of the specified type
    const candidates = Array.from(this.services.values())
      .filter(s => s.type === type && s.status === 'healthy');

    if (candidates.length === 0) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No healthy services available' }));
      return;
    }

    // Select service based on load balancing strategy
    const selectedService = this.selectServiceForLoadBalancing(candidates, strategy);
    
    try {
      const startTime = Date.now();
      const response = await this.makeRequest(method, `${selectedService.url}${path}`, data);
      const responseTime = Date.now() - startTime;

      // Update metrics
      this.requestCounts.set(selectedService.id, (this.requestCounts.get(selectedService.id) || 0) + 1);
      selectedService.responseTime = responseTime;
      selectedService.successCount++;

      res.writeHead(response.statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        selected_service: {
          id: selectedService.id,
          name: selectedService.name,
          url: selectedService.url
        },
        response: {
          statusCode: response.statusCode,
          body: response.body,
          responseTime
        }
      }));

    } catch (error) {
      selectedService.failureCount++;

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        selected_service: {
          id: selectedService.id,
          name: selectedService.name
        },
        error: error.message
      }));
    }
  }

  selectServiceForLoadBalancing(services, strategy = null) {
    const effectiveStrategy = strategy || this.config.loadBalancingStrategy;

    switch (effectiveStrategy) {
      case 'round_robin':
        return this.selectRoundRobin(services);
      case 'least_connections':
        return this.selectLeastConnections(services);
      case 'response_time':
        return this.selectFastestResponse(services);
      case 'random':
        return services[Math.floor(Math.random() * services.length)];
      default:
        return services[0];
    }
  }

  selectRoundRobin(services) {
    // Simple round-robin based on request counts
    const counts = services.map(s => this.requestCounts.get(s.id) || 0);
    const minCount = Math.min(...counts);
    const candidates = services.filter(s => (this.requestCounts.get(s.id) || 0) === minCount);
    return candidates[0];
  }

  selectLeastConnections(services) {
    // Select service with least active requests (approximated by request count)
    return services.reduce((best, current) => {
      const bestCount = this.requestCounts.get(best.id) || 0;
      const currentCount = this.requestCounts.get(current.id) || 0;
      return currentCount < bestCount ? current : best;
    });
  }

  selectFastestResponse(services) {
    // Select service with fastest average response time
    return services.reduce((best, current) => {
      const bestTime = best.responseTime || Infinity;
      const currentTime = current.responseTime || Infinity;
      return currentTime < bestTime ? current : best;
    });
  }

  async handleMetrics(req, res) {
    const services = Array.from(this.services.values());
    
    const metrics = {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      registry: this.metrics,
      services: {
        total: services.length,
        healthy: services.filter(s => s.status === 'healthy').length,
        unhealthy: services.filter(s => s.status === 'unhealthy').length,
        byType: this.getServicesByType(),
        topPerformers: this.getTopPerformers(5),
        slowest: this.getSlowestServices(5)
      },
      loadBalancing: {
        strategy: this.config.loadBalancingStrategy,
        requestDistribution: this.getRequestDistribution()
      }
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(metrics));
  }

  getServicesByType() {
    const byType = {};
    for (const service of this.services.values()) {
      if (!byType[service.type]) {
        byType[service.type] = { total: 0, healthy: 0 };
      }
      byType[service.type].total++;
      if (service.status === 'healthy') {
        byType[service.type].healthy++;
      }
    }
    return byType;
  }

  getTopPerformers(limit) {
    return Array.from(this.services.values())
      .filter(s => s.responseTime && s.successCount > 0)
      .sort((a, b) => (a.responseTime || Infinity) - (b.responseTime || Infinity))
      .slice(0, limit)
      .map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        responseTime: s.responseTime,
        successRate: s.successCount / (s.successCount + s.failureCount)
      }));
  }

  getSlowestServices(limit) {
    return Array.from(this.services.values())
      .filter(s => s.responseTime)
      .sort((a, b) => (b.responseTime || 0) - (a.responseTime || 0))
      .slice(0, limit)
      .map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        responseTime: s.responseTime
      }));
  }

  getRequestDistribution() {
    const distribution = {};
    for (const [serviceId, count] of this.requestCounts) {
      const service = this.services.get(serviceId);
      if (service) {
        distribution[service.name] = count;
      }
    }
    return distribution;
  }

  async handleDashboard(req, res) {
    const html = this.generateDashboardHTML();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  generateDashboardHTML() {
    const services = Array.from(this.services.values());
    const healthyCount = services.filter(s => s.status === 'healthy').length;
    
    return `
<!DOCTYPE html>
<html>
<head>
    <title>MCP Service Registry Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric-value { font-size: 2em; font-weight: bold; color: #3498db; }
        .services-table { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #34495e; color: white; }
        .status-healthy { color: #27ae60; font-weight: bold; }
        .status-unhealthy { color: #e74c3c; font-weight: bold; }
        .refresh-btn { background: #3498db; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
    </style>
    <script>
        function refreshPage() { location.reload(); }
        setInterval(refreshPage, 30000); // Auto-refresh every 30 seconds
    </script>
</head>
<body>
    <div class="header">
        <h1>🔍 MCP Service Registry Dashboard</h1>
        <p>Real-time monitoring and service discovery</p>
        <button class="refresh-btn" onclick="refreshPage()">Refresh Now</button>
    </div>
    
    <div class="metrics">
        <div class="metric-card">
            <h3>Total Services</h3>
            <div class="metric-value">${services.length}</div>
        </div>
        <div class="metric-card">
            <h3>Healthy Services</h3>
            <div class="metric-value">${healthyCount}</div>
        </div>
        <div class="metric-card">
            <h3>Success Rate</h3>
            <div class="metric-value">${Math.round((this.metrics.successfulRequests / Math.max(1, this.metrics.totalRequests)) * 100)}%</div>
        </div>
        <div class="metric-card">
            <h3>Total Requests</h3>
            <div class="metric-value">${this.metrics.totalRequests}</div>
        </div>
    </div>
    
    <div class="services-table">
        <table>
            <thead>
                <tr>
                    <th>Service Name</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>URL</th>
                    <th>Response Time</th>
                    <th>Requests</th>
                    <th>Success Rate</th>
                </tr>
            </thead>
            <tbody>
                ${services.map(s => {
                  const requests = this.requestCounts.get(s.id) || 0;
                  const successRate = s.successCount > 0 ? 
                    Math.round((s.successCount / (s.successCount + s.failureCount)) * 100) : 0;
                  
                  return `
                    <tr>
                        <td>${s.name}</td>
                        <td>${s.type}</td>
                        <td class="status-${s.status}">${s.status.toUpperCase()}</td>
                        <td>${s.url}</td>
                        <td>${s.responseTime ? s.responseTime + 'ms' : '-'}</td>
                        <td>${requests}</td>
                        <td>${successRate}%</td>
                    </tr>
                  `;
                }).join('')}
            </tbody>
        </table>
    </div>
    
    <div style="margin-top: 20px; text-align: center; color: #7f8c8d;">
        Last updated: ${new Date().toISOString()}<br>
        Registry uptime: ${Math.round((Date.now() - this.startTime) / 1000)}s
    </div>
</body>
</html>`;
  }

  startHealthMonitoring() {
    setInterval(() => {
      this.checkAllServicesHealth();
    }, this.config.healthCheckInterval);
    
    console.log(`💓 Health monitoring started (${this.config.healthCheckInterval}ms intervals)`);
  }

  async checkAllServicesHealth() {
    const healthChecks = Array.from(this.services.keys()).map(serviceId => 
      this.checkServiceHealth(serviceId)
    );
    
    await Promise.allSettled(healthChecks);
    this.updateMetrics();
  }

  async checkServiceHealth(serviceId) {
    if (!this.services.has(serviceId)) return;
    
    const service = this.services.get(serviceId);
    const startTime = Date.now();
    
    try {
      const response = await this.makeRequest('GET', `${service.url}/health`, null, 5000);
      const responseTime = Date.now() - startTime;
      
      if (response.statusCode === 200) {
        service.status = 'healthy';
        service.lastSeen = new Date();
        service.responseTime = responseTime;
        service.successCount++;
        service.failureCount = 0; // Reset failure count on success
        
        this.emit('service_healthy', service);
      } else {
        this.handleHealthCheckFailure(service);
      }
    } catch (error) {
      service.responseTime = Date.now() - startTime;
      this.handleHealthCheckFailure(service);
    }
  }

  handleHealthCheckFailure(service) {
    service.failureCount++;
    
    if (service.failureCount >= this.config.failureThreshold) {
      if (service.status !== 'unhealthy') {
        service.status = 'unhealthy';
        console.log(`⚠️  Service marked unhealthy: ${service.name} (${service.id})`);
        this.emit('service_unhealthy', service);
      }
    }
  }

  updateMetrics() {
    this.metrics.activeServices = Array.from(this.services.values())
      .filter(s => s.status === 'healthy').length;
    
    const responseTimes = Array.from(this.services.values())
      .filter(s => s.responseTime)
      .map(s => s.responseTime);
    
    if (responseTimes.length > 0) {
      this.metrics.averageResponseTime = Math.round(
        responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      );
    }
  }

  async makeRequest(method, url, data = null, timeout = 5000, headers = {}) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MCP-Service-Registry/1.0.0',
          ...headers
        },
        timeout: timeout
      };

      if (data && typeof data === 'object') {
        data = JSON.stringify(data);
        options.headers['Content-Length'] = Buffer.byteLength(data);
      }

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
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeout}ms`));
      });

      if (data) {
        req.write(data);
      }
      req.end();
    });
  }

  async readRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => resolve(body || '{}'));
      req.on('error', reject);
    });
  }

  async registerSelfDiscoveringServices() {
    console.log('🔍 Auto-discovering MCP services...');
    
    const knownServices = [
      { name: 'Memory MCP', type: 'memory', url: 'http://localhost:3201', capabilities: ['storage', 'search', 'persistence'] },
      { name: 'Sequential Thinking MCP', type: 'reasoning', url: 'http://localhost:3202', capabilities: ['thinking', 'workflow'] },
      { name: 'Filesystem MCP', type: 'filesystem', url: 'http://localhost:3203', capabilities: ['files', 'codebase'] },
      { name: 'Qdrant Vector DB', type: 'vector_database', url: 'http://localhost:6333', capabilities: ['vectors', 'similarity'] }
    ];
    
    for (const serviceInfo of knownServices) {
      try {
        // Test if service is reachable
        await this.makeRequest('GET', `${serviceInfo.url}/health`, null, 3000);
        
        // Register the service
        const serviceId = `${serviceInfo.type}_autodiscovered`;
        const service = {
          id: serviceId,
          ...serviceInfo,
          version: '1.0.0',
          status: 'unknown',
          registered: new Date(),
          lastSeen: null,
          responseTime: null,
          failureCount: 0,
          successCount: 0,
          metadata: { autodiscovered: true }
        };
        
        this.services.set(serviceId, service);
        this.requestCounts.set(serviceId, 0);
        
        console.log(`✅ Auto-registered: ${serviceInfo.name}`);
      } catch (error) {
        console.log(`⚠️  Could not reach: ${serviceInfo.name} at ${serviceInfo.url}`);
      }
    }
  }

  start() {
    this.server.listen(this.port, '0.0.0.0', async () => {
      console.log(`🔍 MCP Service Registry started on port ${this.port}`);
      console.log(`📊 Dashboard: http://localhost:${this.port}/dashboard`);
      console.log(`🏥 Health: http://localhost:${this.port}/health`);
      console.log(`📋 Services: http://localhost:${this.port}/registry/services`);
      
      // Auto-discover known services
      await this.registerSelfDiscoveringServices();
      
      // Start first health check
      setTimeout(() => this.checkAllServicesHealth(), 2000);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
    console.log('🛑 MCP Service Registry stopped');
  }
}

// Start the service registry if this file is run directly
if (require.main === module) {
  const registry = new MCPServiceRegistry({
    port: 3200,
    healthCheckInterval: 30000,
    failureThreshold: 3,
    loadBalancingStrategy: 'round_robin'
  });
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down MCP Service Registry...');
    registry.stop();
    process.exit(0);
  });

  registry.start();
}

module.exports = MCPServiceRegistry;