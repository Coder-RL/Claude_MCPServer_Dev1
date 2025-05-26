-- Migration 003: UI Testing Server Tables
-- Date: 2025-01-20
-- Purpose: Create tables for screenshots, visual testing, and accessibility reports

-- UI Testing Schema Tables
CREATE TABLE ui_testing.test_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    browser VARCHAR(50) NOT NULL,
    viewport_width INTEGER NOT NULL,
    viewport_height INTEGER NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ui_testing.screenshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES ui_testing.test_sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    selector TEXT,
    full_page BOOLEAN DEFAULT false,
    viewport JSONB NOT NULL,
    image_data BYTEA NOT NULL,
    image_format VARCHAR(10) DEFAULT 'png',
    file_size INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ui_testing.visual_comparisons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES ui_testing.test_sessions(id) ON DELETE CASCADE,
    baseline_screenshot_id UUID REFERENCES ui_testing.screenshots(id) ON DELETE CASCADE,
    comparison_screenshot_id UUID REFERENCES ui_testing.screenshots(id) ON DELETE CASCADE,
    difference_data BYTEA,
    difference_percentage FLOAT CHECK (difference_percentage >= 0 AND difference_percentage <= 100),
    threshold_used FLOAT,
    status VARCHAR(20) CHECK (status IN ('passed', 'failed', 'warning')),
    analysis_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ui_testing.accessibility_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES ui_testing.test_sessions(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    rules_tested INTEGER DEFAULT 0,
    violations JSONB DEFAULT '[]',
    passes JSONB DEFAULT '[]',
    incomplete JSONB DEFAULT '[]',
    inapplicable JSONB DEFAULT '[]',
    score INTEGER CHECK (score >= 0 AND score <= 100),
    level VARCHAR(10) CHECK (level IN ('A', 'AA', 'AAA')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE ui_testing.interaction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES ui_testing.test_sessions(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    selector TEXT,
    coordinates JSONB,
    input_data TEXT,
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for optimal performance
CREATE INDEX test_sessions_name_idx ON ui_testing.test_sessions (name);
CREATE INDEX test_sessions_created_idx ON ui_testing.test_sessions (created_at);

CREATE INDEX screenshots_session_idx ON ui_testing.screenshots (session_id);
CREATE INDEX screenshots_url_idx ON ui_testing.screenshots (url);
CREATE INDEX screenshots_created_idx ON ui_testing.screenshots (created_at);
CREATE INDEX screenshots_metadata_idx ON ui_testing.screenshots USING GIN (metadata);

CREATE INDEX comparisons_session_idx ON ui_testing.visual_comparisons (session_id);
CREATE INDEX comparisons_baseline_idx ON ui_testing.visual_comparisons (baseline_screenshot_id);
CREATE INDEX comparisons_comparison_idx ON ui_testing.visual_comparisons (comparison_screenshot_id);
CREATE INDEX comparisons_status_idx ON ui_testing.visual_comparisons (status);
CREATE INDEX comparisons_created_idx ON ui_testing.visual_comparisons (created_at);

CREATE INDEX accessibility_session_idx ON ui_testing.accessibility_reports (session_id);
CREATE INDEX accessibility_url_idx ON ui_testing.accessibility_reports (url);
CREATE INDEX accessibility_score_idx ON ui_testing.accessibility_reports (score);
CREATE INDEX accessibility_level_idx ON ui_testing.accessibility_reports (level);
CREATE INDEX accessibility_created_idx ON ui_testing.accessibility_reports (created_at);

CREATE INDEX interactions_session_idx ON ui_testing.interaction_logs (session_id);
CREATE INDEX interactions_action_idx ON ui_testing.interaction_logs (action_type);
CREATE INDEX interactions_success_idx ON ui_testing.interaction_logs (success);
CREATE INDEX interactions_created_idx ON ui_testing.interaction_logs (created_at);

-- Insert migration record
INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum) 
VALUES (3, 'ui_testing_tables', 0, 'ui_testing_schema_v1')
ON CONFLICT (version) DO NOTHING;