-- Migration 004: Analytics Server Tables
-- Date: 2025-01-20
-- Purpose: Create tables for data analysis, visualizations, and predictive analytics

-- Analytics Schema Tables
CREATE TABLE analytics.datasets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_type VARCHAR(50) NOT NULL,
    source_location TEXT,
    schema_definition JSONB NOT NULL,
    row_count INTEGER DEFAULT 0,
    column_count INTEGER DEFAULT 0,
    file_size INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE analytics.visualizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID REFERENCES analytics.datasets(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    visualization_type VARCHAR(50) NOT NULL,
    configuration JSONB NOT NULL,
    chart_data JSONB,
    output_format VARCHAR(20) DEFAULT 'json',
    width INTEGER,
    height INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE analytics.analysis_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID REFERENCES analytics.datasets(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL,
    parameters JSONB DEFAULT '{}',
    results JSONB NOT NULL,
    statistical_summary JSONB,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE analytics.predictions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID REFERENCES analytics.datasets(id) ON DELETE CASCADE,
    model_type VARCHAR(50) NOT NULL,
    target_column VARCHAR(255) NOT NULL,
    feature_columns JSONB NOT NULL,
    model_parameters JSONB DEFAULT '{}',
    predictions JSONB NOT NULL,
    accuracy_metrics JSONB,
    confidence_intervals JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE analytics.pattern_discoveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dataset_id UUID REFERENCES analytics.datasets(id) ON DELETE CASCADE,
    pattern_type VARCHAR(50) NOT NULL,
    pattern_description TEXT,
    columns_involved JSONB NOT NULL,
    significance_score FLOAT CHECK (significance_score >= 0 AND significance_score <= 1),
    pattern_data JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for optimal performance
CREATE INDEX datasets_name_idx ON analytics.datasets (name);
CREATE INDEX datasets_source_type_idx ON analytics.datasets (source_type);
CREATE INDEX datasets_created_idx ON analytics.datasets (created_at);
CREATE INDEX datasets_metadata_idx ON analytics.datasets USING GIN (metadata);

CREATE INDEX visualizations_dataset_idx ON analytics.visualizations (dataset_id);
CREATE INDEX visualizations_type_idx ON analytics.visualizations (visualization_type);
CREATE INDEX visualizations_name_idx ON analytics.visualizations (name);
CREATE INDEX visualizations_created_idx ON analytics.visualizations (created_at);

CREATE INDEX analysis_dataset_idx ON analytics.analysis_results (dataset_id);
CREATE INDEX analysis_type_idx ON analytics.analysis_results (analysis_type);
CREATE INDEX analysis_created_idx ON analytics.analysis_results (created_at);

CREATE INDEX predictions_dataset_idx ON analytics.predictions (dataset_id);
CREATE INDEX predictions_model_idx ON analytics.predictions (model_type);
CREATE INDEX predictions_target_idx ON analytics.predictions (target_column);
CREATE INDEX predictions_created_idx ON analytics.predictions (created_at);

CREATE INDEX patterns_dataset_idx ON analytics.pattern_discoveries (dataset_id);
CREATE INDEX patterns_type_idx ON analytics.pattern_discoveries (pattern_type);
CREATE INDEX patterns_significance_idx ON analytics.pattern_discoveries (significance_score);
CREATE INDEX patterns_created_idx ON analytics.pattern_discoveries (created_at);

-- Insert migration record
INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum) 
VALUES (4, 'analytics_tables', 0, 'analytics_schema_v1')
ON CONFLICT (version) DO NOTHING;