/**
 * Week 11 Integration Tests - Data Management and Analytics Server
 * Comprehensive test suite proving all components work as documented
 */
import { jest } from '@jest/globals';
import { DataPipelineServer } from '../servers/data-analytics/src/data-pipeline';
import { RealtimeAnalyticsServer } from '../servers/data-analytics/src/realtime-analytics';
import { DataWarehouseServer } from '../servers/data-analytics/src/data-warehouse';
import { MLDeploymentServer } from '../servers/data-analytics/src/ml-deployment';
import { DataGovernanceServer } from '../servers/data-analytics/src/data-governance';

describe('Week 11: Data Management and Analytics Server - Integration Tests', () => {
  let dataPipeline: DataPipelineServer;
  let realtimeAnalytics: RealtimeAnalyticsServer;
  let dataWarehouse: DataWarehouseServer;
  let mlDeployment: MLDeploymentServer;
  let dataGovernance: DataGovernanceServer;

  beforeAll(async () => {
    // Initialize all Week 11 servers
    dataPipeline = new DataPipelineServer();
    realtimeAnalytics = new RealtimeAnalyticsServer();
    dataWarehouse = new DataWarehouseServer();
    mlDeployment = new MLDeploymentServer();
    dataGovernance = new DataGovernanceServer();

    // Start all servers
    await Promise.all([
      dataPipeline.start(),
      realtimeAnalytics.start(),
      dataWarehouse.start(),
      mlDeployment.start(),
      dataGovernance.start()
    ]);
  });

  afterAll(async () => {
    // Cleanup all servers
    await Promise.all([
      dataPipeline.stop(),
      realtimeAnalytics.stop(),
      dataWarehouse.stop(),
      mlDeployment.stop(),
      dataGovernance.stop()
    ]);
  });

  describe('Data Pipeline Server', () => {
    test('should process data ingestion from multiple sources', async () => {
      const testData = {
        source: 'api',
        data: { users: 1000, events: 50000 },
        timestamp: new Date().toISOString()
      };

      const result = await dataPipeline.ingestData(testData);
      expect(result.success).toBe(true);
      expect(result.processedRecords).toBeGreaterThan(0);
      expect(result.pipeline).toBeDefined();
    });

    test('should handle real-time streaming data', async () => {
      const streamConfig = {
        source: 'kafka',
        topic: 'user-events',
        batchSize: 1000
      };

      const stream = await dataPipeline.createStream(streamConfig);
      expect(stream.isActive()).toBe(true);
      expect(stream.getMetrics().throughput).toBeGreaterThan(0);
    });

    test('should validate data quality and transformations', async () => {
      const rawData = { id: '123', name: 'Test User', email: 'invalid-email' };
      const validation = await dataPipeline.validateData(rawData);
      
      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Invalid email format');
      expect(validation.transformedData).toBeDefined();
    });
  });

  describe('Realtime Analytics Server', () => {
    test('should generate real-time metrics and dashboards', async () => {
      const metricsQuery = {
        timeRange: '1h',
        metrics: ['user_count', 'revenue', 'conversion_rate'],
        granularity: '5m'
      };

      const analytics = await realtimeAnalytics.generateMetrics(metricsQuery);
      expect(analytics.data).toBeDefined();
      expect(analytics.data.length).toBeGreaterThan(0);
      expect(analytics.lastUpdated).toBeDefined();
    });

    test('should handle streaming analytics with windowing', async () => {
      const windowConfig = {
        type: 'tumbling',
        duration: '5m',
        aggregations: ['count', 'sum', 'avg']
      };

      const window = await realtimeAnalytics.createWindow(windowConfig);
      expect(window.isProcessing()).toBe(true);
      expect(window.getResults().length).toBeGreaterThanOrEqual(0);
    });

    test('should trigger alerts based on thresholds', async () => {
      const alertConfig = {
        metric: 'error_rate',
        threshold: 0.05,
        condition: 'greater_than',
        window: '10m'
      };

      const alert = await realtimeAnalytics.configureAlert(alertConfig);
      expect(alert.id).toBeDefined();
      expect(alert.isActive).toBe(true);
    });
  });

  describe('Data Warehouse Server', () => {
    test('should perform ETL operations on large datasets', async () => {
      const etlJob = {
        source: 'production_db',
        destination: 'analytics_warehouse',
        transformations: ['clean_nulls', 'normalize_dates', 'aggregate_metrics']
      };

      const job = await dataWarehouse.runETL(etlJob);
      expect(job.status).toBe('completed');
      expect(job.recordsProcessed).toBeGreaterThan(0);
      expect(job.executionTime).toBeLessThan(30000); // 30 seconds max
    });

    test('should execute complex analytical queries', async () => {
      const query = `
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*) as user_count,
          AVG(session_duration) as avg_session
        FROM user_sessions 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date DESC;
      `;

      const result = await dataWarehouse.executeQuery(query);
      expect(result.rows).toBeDefined();
      expect(result.executionTime).toBeLessThan(5000); // 5 seconds max
      expect(result.rowCount).toBeGreaterThanOrEqual(0);
    });

    test('should manage data partitioning and indexing', async () => {
      const tableConfig = {
        name: 'user_events',
        partitionBy: 'date',
        indexes: ['user_id', 'event_type'],
        compressionType: 'zstd'
      };

      const table = await dataWarehouse.createOptimizedTable(tableConfig);
      expect(table.isPartitioned).toBe(true);
      expect(table.indexes.length).toBe(2);
      expect(table.compressionRatio).toBeGreaterThan(0.5);
    });
  });

  describe('ML Deployment Server', () => {
    test('should deploy and serve machine learning models', async () => {
      const modelConfig = {
        name: 'user_churn_predictor',
        version: '1.0.0',
        framework: 'tensorflow',
        modelPath: '/models/churn_model.pb'
      };

      const deployment = await mlDeployment.deployModel(modelConfig);
      expect(deployment.status).toBe('active');
      expect(deployment.endpoint).toBeDefined();
      expect(deployment.healthCheck()).resolves.toBe(true);
    });

    test('should handle model inference requests', async () => {
      const inferenceRequest = {
        modelName: 'user_churn_predictor',
        input: {
          user_id: '12345',
          features: {
            days_since_last_login: 7,
            total_sessions: 45,
            avg_session_duration: 12.5
          }
        }
      };

      const prediction = await mlDeployment.predict(inferenceRequest);
      expect(prediction.probability).toBeGreaterThanOrEqual(0);
      expect(prediction.probability).toBeLessThanOrEqual(1);
      expect(prediction.confidence).toBeDefined();
      expect(prediction.responseTime).toBeLessThan(100); // 100ms max
    });

    test('should monitor model performance and drift', async () => {
      const monitoring = await mlDeployment.getModelMetrics('user_churn_predictor');
      expect(monitoring.accuracy).toBeGreaterThan(0.8);
      expect(monitoring.latency.p95).toBeLessThan(200);
      expect(monitoring.drift.score).toBeLessThan(0.1);
      expect(monitoring.requestCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Data Governance Server', () => {
    test('should enforce data privacy and compliance rules', async () => {
      const dataRequest = {
        userId: 'user123',
        dataTypes: ['personal_info', 'payment_data'],
        purpose: 'analytics',
        requester: 'data_science_team'
      };

      const approval = await dataGovernance.requestDataAccess(dataRequest);
      expect(approval.status).toBe('approved');
      expect(approval.conditions).toBeDefined();
      expect(approval.expirationTime).toBeDefined();
    });

    test('should track data lineage and audit trails', async () => {
      const lineage = await dataGovernance.getDataLineage('user_sessions');
      expect(lineage.sources).toBeDefined();
      expect(lineage.transformations).toBeDefined();
      expect(lineage.destinations).toBeDefined();
      expect(lineage.lastUpdated).toBeDefined();
    });

    test('should manage data quality metrics and validation', async () => {
      const qualityCheck = {
        dataset: 'user_profiles',
        rules: [
          { field: 'email', type: 'format', pattern: 'email' },
          { field: 'age', type: 'range', min: 13, max: 120 },
          { field: 'created_at', type: 'not_null' }
        ]
      };

      const qualityReport = await dataGovernance.runQualityCheck(qualityCheck);
      expect(qualityReport.overallScore).toBeGreaterThan(0.9);
      expect(qualityReport.passedRules).toBeGreaterThanOrEqual(0);
      expect(qualityReport.failedRows).toBeDefined();
    });
  });

  describe('Integration Tests - Cross-Server Communication', () => {
    test('should handle end-to-end data flow from ingestion to analytics', async () => {
      // 1. Ingest data through pipeline
      const testData = {
        source: 'api',
        data: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          user_id: `user_${i}`,
          event_type: 'page_view',
          timestamp: new Date().toISOString()
        }))
      };

      const ingestionResult = await dataPipeline.ingestData(testData);
      expect(ingestionResult.success).toBe(true);

      // 2. Process real-time analytics
      const analyticsResult = await realtimeAnalytics.processIncomingData(testData.data);
      expect(analyticsResult.metricsGenerated).toBeGreaterThan(0);

      // 3. Store in data warehouse
      const warehouseResult = await dataWarehouse.loadData(testData.data);
      expect(warehouseResult.rowsInserted).toBe(1000);

      // 4. Validate with governance
      const governanceResult = await dataGovernance.validateDataCompliance(testData.data);
      expect(governanceResult.complianceScore).toBeGreaterThan(0.95);
    });

    test('should demonstrate MCP tool integration', async () => {
      // Test MCP tools are properly registered and callable
      const tools = await dataPipeline.listTools();
      expect(tools.length).toBeGreaterThan(30); // Week 11 should have 30+ tools
      expect(tools.some(t => t.name === 'ingest_data')).toBe(true);
      expect(tools.some(t => t.name === 'generate_analytics')).toBe(true);
      expect(tools.some(t => t.name === 'run_etl')).toBe(true);
    });
  });
});

/**
 * Performance Benchmarks
 * These tests ensure Week 11 components meet performance requirements
 */
describe('Week 11: Performance Benchmarks', () => {
  test('data pipeline should handle 10k records/second', async () => {
    const start = Date.now();
    const testData = Array.from({ length: 10000 }, (_, i) => ({ id: i, data: 'test' }));
    
    const result = await dataPipeline.ingestBatch(testData);
    const duration = Date.now() - start;
    
    expect(result.success).toBe(true);
    expect(duration).toBeLessThan(1000); // Should process in under 1 second
  });

  test('realtime analytics should update within 100ms', async () => {
    const start = Date.now();
    const metrics = await realtimeAnalytics.generateMetrics({ timeRange: '5m' });
    const duration = Date.now() - start;
    
    expect(metrics).toBeDefined();
    expect(duration).toBeLessThan(100);
  });

  test('ML inference should respond within 50ms', async () => {
    const start = Date.now();
    const prediction = await mlDeployment.predict({
      modelName: 'test_model',
      input: { feature1: 1.0, feature2: 2.0 }
    });
    const duration = Date.now() - start;
    
    expect(prediction).toBeDefined();
    expect(duration).toBeLessThan(50);
  });
});
