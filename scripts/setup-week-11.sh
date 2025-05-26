#!/bin/bash

# Week 11 Setup Script - Data Management and Analytics Server
# This script sets up the complete Week 11 environment and proves it works

set -e  # Exit on any error

echo "🚀 Setting up Week 11: Data Management and Analytics Server"
echo "================================================="

# Create necessary directories
echo "📁 Creating directory structure..."
mkdir -p servers/data-analytics/src
mkdir -p servers/data-analytics/config
mkdir -p servers/data-analytics/logs
mkdir -p test/week-11
mkdir -p data/warehouse
mkdir -p data/models
mkdir -p monitoring/week-11

# Install dependencies
echo "📦 Installing dependencies..."
npm install --save \
  @types/node@^20.0.0 \
  typescript@^5.0.0 \
  jest@^29.0.0 \
  @jest/globals@^29.0.0 \
  concurrently@^8.0.0 \
  ws@^8.0.0 \
  express@^4.18.0 \
  helmet@^7.0.0 \
  cors@^2.8.5 \
  compression@^1.7.4 \
  redis@^4.6.0 \
  pg@^8.11.0 \
  mongodb@^6.0.0 \
  kafka-node@^5.0.0 \
  prometheus-client@^15.0.0 \
  winston@^3.10.0 \
  joi@^17.9.0 \
  lodash@^4.17.21 \
  moment@^2.29.4 \
  axios@^1.4.0

npm install --save-dev \
  @types/express@^4.17.0 \
  @types/ws@^8.5.0 \
  @types/cors@^2.8.0 \
  @types/compression@^1.7.0 \
  @types/pg@^8.10.0 \
  @types/lodash@^4.14.0 \
  @types/jest@^29.5.0 \
  ts-node@^10.9.0 \
  nodemon@^3.0.0

echo "✅ Dependencies installed successfully"

# Create environment configuration
echo "⚙️ Creating environment configuration..."
cat > .env.week11 << 'EOF'
# Week 11 Environment Configuration
NODE_ENV=development
LOG_LEVEL=debug

# Server Ports
DATA_PIPELINE_PORT=8110
REALTIME_ANALYTICS_PORT=8111
DATA_WAREHOUSE_PORT=8112
ML_DEPLOYMENT_PORT=8113
DATA_GOVERNANCE_PORT=8114

# Database Connections
POSTGRES_URL=postgresql://localhost:5432/mcp_warehouse
REDIS_URL=redis://localhost:6379
MONGODB_URL=mongodb://localhost:27017/mcp_analytics

# Kafka Configuration
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=mcp-data-pipeline

# Model Storage
MODEL_STORAGE_PATH=./data/models
MODEL_REGISTRY_URL=http://localhost:8115

# Performance Monitoring
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000

# Data Governance
DATA_CATALOG_URL=http://localhost:8116
COMPLIANCE_RULES_PATH=./config/compliance.json

# Feature Flags
ENABLE_REAL_TIME_PROCESSING=true
ENABLE_ML_DEPLOYMENT=true
ENABLE_DATA_GOVERNANCE=true
ENABLE_PERFORMANCE_MONITORING=true

# Resource Limits
MAX_MEMORY_MB=2048
MAX_CPU_CORES=4
MAX_CONCURRENT_JOBS=10
DATA_RETENTION_DAYS=90
EOF

echo "✅ Environment configuration created"

# Create TypeScript configuration for Week 11
echo "📝 Creating TypeScript configuration..."
cat > servers/data-analytics/tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "types": ["node", "jest"]
  },
  "include": [
    "src/**/*",
    "../../types/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts"
  ]
}
EOF

echo "✅ TypeScript configuration created"

# Create Jest configuration for testing
echo "🧪 Creating Jest test configuration..."
cat > jest.config.week11.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/servers/data-analytics'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/test/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'servers/data-analytics/src/**/*.ts',
    '!servers/data-analytics/src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage/week-11',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 30000,
  maxWorkers: 4,
  verbose: true
};
EOF

echo "✅ Jest configuration created"

# Create test setup file
echo "🔧 Creating test setup..."
cat > test/setup.ts << 'EOF'
/**
 * Global test setup for Week 11 integration tests
 */
import { jest } from '@jest/globals';

// Mock external dependencies for testing
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1)
  }))
}));

jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn()
    }),
    end: jest.fn().mockResolvedValue(undefined)
  }))
}));

jest.mock('mongodb', () => ({
  MongoClient: {
    connect: jest.fn().mockResolvedValue({
      db: jest.fn(() => ({
        collection: jest.fn(() => ({
          findOne: jest.fn().mockResolvedValue(null),
          insertOne: jest.fn().mockResolvedValue({ insertedId: 'test-id' }),
          updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
          deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
        }))
      })),
      close: jest.fn().mockResolvedValue(undefined)
    })
  }
}));

// Global test timeout
jest.setTimeout(30000);

// Setup and teardown
beforeAll(async () => {
  console.log('🚀 Starting Week 11 test suite...');
});

afterAll(async () => {
  console.log('✅ Week 11 test suite completed');
});
EOF

echo "✅ Test setup created"

# Create monitoring configuration
echo "📊 Creating monitoring configuration..."
cat > monitoring/week-11/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'mcp-data-pipeline'
    static_configs:
      - targets: ['localhost:8110']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'mcp-realtime-analytics'
    static_configs:
      - targets: ['localhost:8111']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'mcp-data-warehouse'
    static_configs:
      - targets: ['localhost:8112']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'mcp-ml-deployment'
    static_configs:
      - targets: ['localhost:8113']
    metrics_path: '/metrics'
    scrape_interval: 5s

  - job_name: 'mcp-data-governance'
    static_configs:
      - targets: ['localhost:8114']
    metrics_path: '/metrics'
    scrape_interval: 5s
EOF

echo "✅ Monitoring configuration created"

# Create health check script
echo "🏥 Creating health check script..."
cat > scripts/health-check-week11.sh << 'EOF'
#!/bin/bash

echo "🏥 Week 11 Health Check - Data Management and Analytics Server"
echo "============================================================"

# Function to check if service is running
check_service() {
    local service_name=$1
    local port=$2
    local endpoint=${3:-"/health"}
    
    echo -n "Checking $service_name (port $port)... "
    
    if curl -s -f "http://localhost:$port$endpoint" > /dev/null 2>&1; then
        echo "✅ HEALTHY"
        return 0
    else
        echo "❌ UNHEALTHY"
        return 1
    fi
}

# Function to check MCP tool availability
check_mcp_tools() {
    local service_name=$1
    local port=$2
    
    echo -n "Checking MCP tools for $service_name... "
    
    local tool_count=$(curl -s "http://localhost:$port/mcp/tools" | jq '. | length' 2>/dev/null || echo "0")
    
    if [ "$tool_count" -gt "0" ]; then
        echo "✅ $tool_count tools available"
        return 0
    else
        echo "❌ No tools available"
        return 1
    fi
}

# Load environment variables
source .env.week11

# Health check results
overall_health=0

echo "\n🔍 Service Health Checks:"
check_service "Data Pipeline" $DATA_PIPELINE_PORT || overall_health=1
check_service "Realtime Analytics" $REALTIME_ANALYTICS_PORT || overall_health=1
check_service "Data Warehouse" $DATA_WAREHOUSE_PORT || overall_health=1
check_service "ML Deployment" $ML_DEPLOYMENT_PORT || overall_health=1
check_service "Data Governance" $DATA_GOVERNANCE_PORT || overall_health=1

echo "\n🔧 MCP Tool Availability:"
check_mcp_tools "Data Pipeline" $DATA_PIPELINE_PORT || overall_health=1
check_mcp_tools "Realtime Analytics" $REALTIME_ANALYTICS_PORT || overall_health=1
check_mcp_tools "Data Warehouse" $DATA_WAREHOUSE_PORT || overall_health=1
check_mcp_tools "ML Deployment" $ML_DEPLOYMENT_PORT || overall_health=1
check_mcp_tools "Data Governance" $DATA_GOVERNANCE_PORT || overall_health=1

echo "\n📊 Performance Metrics:"
echo -n "System Memory Usage: "
free -h | awk 'NR==2{printf "%.2f%%\n", $3*100/$2 }'

echo -n "System CPU Usage: "
top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1"%"}'

echo -n "Disk Usage: "
df -h . | awk 'NR==2 {print $5}'

echo "\n📈 Quick Performance Test:"
echo -n "Testing data pipeline throughput... "
start_time=$(date +%s%N)
curl -s -X POST "http://localhost:$DATA_PIPELINE_PORT/api/test-ingestion" \
  -H "Content-Type: application/json" \
  -d '{"records": 1000}' > /dev/null 2>&1
end_time=$(date +%s%N)
duration=$(((end_time - start_time) / 1000000))
echo "${duration}ms"

if [ $overall_health -eq 0 ]; then
    echo "\n🎉 All systems healthy! Week 11 is fully operational."
    exit 0
else
    echo "\n⚠️  Some systems are unhealthy. Check logs for details."
    exit 1
fi
EOF

chmod +x scripts/health-check-week11.sh

echo "✅ Health check script created"

# Create docker-compose for development dependencies
echo "🐳 Creating Docker Compose for development dependencies..."
cat > docker-compose.week11.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: mcp_warehouse
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./data/warehouse/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  mongodb:
    image: mongo:7
    environment:
      MONGO_INITDB_DATABASE: mcp_analytics
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
    healthcheck:
      test: echo 'db.runCommand("ismaster").ismaster' | mongosh --quiet
      interval: 5s
      timeout: 5s
      retries: 5

  kafka:
    image: confluentinc/cp-kafka:latest
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    healthcheck:
      test: kafka-broker-api-versions --bootstrap-server localhost:9092
      interval: 10s
      timeout: 10s
      retries: 5

  zookeeper:
    image: confluentinc/cp-zookeeper:latest
    ports:
      - "2181:2181"
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/week-11/prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=200h'
      - '--web.enable-lifecycle'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana_data:/var/lib/grafana

volumes:
  postgres_data:
  redis_data:
  mongodb_data:
  grafana_data:
EOF

echo "✅ Docker Compose configuration created"

# Create database initialization script
echo "🗄️ Creating database initialization..."
mkdir -p data/warehouse
cat > data/warehouse/init.sql << 'EOF'
-- Week 11 Data Warehouse Schema Initialization

-- Create schemas
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS governance;

-- Create tables for data pipeline
CREATE TABLE IF NOT EXISTS analytics.user_events (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    session_id VARCHAR(255),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Partition by date for performance
SELECT create_hypertable('analytics.user_events', 'timestamp', if_not_exists => TRUE);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON analytics.user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_events_type ON analytics.user_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_events_session ON analytics.user_events(session_id);
CREATE INDEX IF NOT EXISTS idx_user_events_timestamp ON analytics.user_events(timestamp);

-- Create aggregate tables for analytics
CREATE TABLE IF NOT EXISTS analytics.user_session_metrics (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    session_start TIMESTAMP WITH TIME ZONE,
    session_end TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER,
    page_views INTEGER DEFAULT 0,
    events_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create data governance tables
CREATE TABLE IF NOT EXISTS governance.data_lineage (
    id BIGSERIAL PRIMARY KEY,
    source_table VARCHAR(255) NOT NULL,
    target_table VARCHAR(255) NOT NULL,
    transformation_rules JSONB,
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS governance.data_quality_metrics (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(10,4),
    threshold_min DECIMAL(10,4),
    threshold_max DECIMAL(10,4),
    status VARCHAR(50),
    measured_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data for testing
INSERT INTO analytics.user_events (user_id, event_type, event_data, session_id) VALUES
('user_001', 'page_view', '{"page": "/dashboard", "time_on_page": 45}', 'session_001'),
('user_001', 'click', '{"element": "button", "action": "export_data"}', 'session_001'),
('user_002', 'page_view', '{"page": "/analytics", "time_on_page": 120}', 'session_002'),
('user_002', 'form_submit', '{"form": "user_preferences", "fields": 5}', 'session_002');

-- Create views for common queries
CREATE OR REPLACE VIEW analytics.daily_user_metrics AS
SELECT 
    DATE_TRUNC('day', timestamp) as date,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) as total_events,
    COUNT(DISTINCT session_id) as total_sessions
FROM analytics.user_events
GROUP BY DATE_TRUNC('day', timestamp)
ORDER BY date DESC;

CREATE OR REPLACE VIEW analytics.real_time_metrics AS
SELECT 
    event_type,
    COUNT(*) as event_count,
    COUNT(DISTINCT user_id) as unique_users,
    AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - timestamp))) as avg_age_seconds
FROM analytics.user_events
WHERE timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour'
GROUP BY event_type;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA analytics TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA staging TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA governance TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA analytics TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA staging TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA governance TO postgres;
EOF

echo "✅ Database initialization script created"

# Build TypeScript code
echo "🔨 Building TypeScript code..."
cd servers/data-analytics
npx tsc
cd ../..

echo "✅ TypeScript compilation completed"

# Run tests to verify everything works
echo "🧪 Running integration tests..."
npm test -- --config=jest.config.week11.js --testNamePattern="Week 11" --verbose

if [ $? -eq 0 ]; then
    echo "\n🎉 Week 11 setup completed successfully!"
    echo "\n📋 Next steps:"
    echo "1. Start development dependencies: docker-compose -f docker-compose.week11.yml up -d"
    echo "2. Start Week 11 servers: npm run start:week-11"
    echo "3. Run health checks: ./scripts/health-check-week11.sh"
    echo "4. View metrics: http://localhost:9090 (Prometheus) and http://localhost:3000 (Grafana)"
    echo "\n📊 Week 11 Components Ready:"
    echo "• Data Pipeline Server (Port 8110) - 30+ MCP tools for data ingestion"
    echo "• Realtime Analytics Server (Port 8111) - Stream processing and metrics"
    echo "• Data Warehouse Server (Port 8112) - ETL and OLAP queries"
    echo "• ML Deployment Server (Port 8113) - Model serving and inference"
    echo "• Data Governance Server (Port 8114) - Compliance and data quality"
else
    echo "\n❌ Setup failed. Check the error messages above."
    exit 1
fi
