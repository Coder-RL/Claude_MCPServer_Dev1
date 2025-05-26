-- Migration 008: Web Access Server Tables
-- Date: 2025-01-20
-- Purpose: Create tables for web content caching, search history, and API usage tracking

-- Web Access Schema Tables
CREATE TABLE web_access.providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    provider_type VARCHAR(50) NOT NULL,
    base_url TEXT,
    api_version VARCHAR(20),
    daily_quota INTEGER DEFAULT 0,
    monthly_quota INTEGER DEFAULT 0,
    cost_per_request DECIMAL(10,6),
    active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE web_access.cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    method VARCHAR(10) DEFAULT 'GET',
    headers JSONB,
    content JSONB NOT NULL,
    content_type VARCHAR(100),
    status INTEGER NOT NULL,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    size_bytes INTEGER,
    fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    hit_count INTEGER DEFAULT 0,
    metadata JSONB
);

CREATE TABLE web_access.search_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    provider_id UUID REFERENCES web_access.providers(id) ON DELETE SET NULL,
    search_type VARCHAR(50) DEFAULT 'web',
    filters JSONB DEFAULT '{}',
    results JSONB NOT NULL,
    results_count INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    search_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB
);

CREATE TABLE web_access.api_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID REFERENCES web_access.providers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 1,
    quota_limit INTEGER NOT NULL,
    cost_incurred DECIMAL(10,6) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (provider_id, date)
);

CREATE TABLE web_access.screenshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    viewport JSONB NOT NULL,
    full_page BOOLEAN DEFAULT FALSE,
    image_data BYTEA NOT NULL,
    image_format VARCHAR(10) DEFAULT 'png',
    file_size INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE web_access.extracted_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    extraction_type VARCHAR(50) NOT NULL,
    selector TEXT,
    extracted_data JSONB NOT NULL,
    content_structure JSONB,
    extraction_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX providers_name_idx ON web_access.providers (name);
CREATE INDEX providers_type_idx ON web_access.providers (provider_type);
CREATE INDEX providers_active_idx ON web_access.providers (active);

CREATE INDEX cache_url_idx ON web_access.cache (url);
CREATE INDEX cache_key_idx ON web_access.cache (cache_key);
CREATE INDEX cache_expires_idx ON web_access.cache (expires_at);
CREATE INDEX cache_fetched_idx ON web_access.cache (fetched_at);
CREATE INDEX cache_hit_count_idx ON web_access.cache (hit_count);

CREATE INDEX search_history_query_idx ON web_access.search_history (query);
CREATE INDEX search_history_provider_idx ON web_access.search_history (provider_id);
CREATE INDEX search_history_time_idx ON web_access.search_history (search_time);
CREATE INDEX search_history_type_idx ON web_access.search_history (search_type);

CREATE INDEX api_usage_provider_date_idx ON web_access.api_usage (provider_id, date);
CREATE INDEX api_usage_date_idx ON web_access.api_usage (date);
CREATE INDEX api_usage_count_idx ON web_access.api_usage (usage_count);

CREATE INDEX screenshots_url_idx ON web_access.screenshots (url);
CREATE INDEX screenshots_created_idx ON web_access.screenshots (created_at);

CREATE INDEX extracted_url_idx ON web_access.extracted_content (url);
CREATE INDEX extracted_type_idx ON web_access.extracted_content (extraction_type);
CREATE INDEX extracted_created_idx ON web_access.extracted_content (created_at);

-- Insert migration record
INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum) 
VALUES (8, 'web_access_tables', 0, 'web_access_schema_v1')
ON CONFLICT (version) DO NOTHING;