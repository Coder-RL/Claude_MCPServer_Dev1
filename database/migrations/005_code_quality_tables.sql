-- Migration 005: Code Quality Server Tables
-- Date: 2025-01-20
-- Purpose: Create tables for static analysis, security vulnerabilities, and code metrics

-- Code Quality Schema Tables
CREATE TABLE code_quality.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    repository_url TEXT,
    primary_language VARCHAR(50),
    languages_detected JSONB DEFAULT '[]',
    total_files INTEGER DEFAULT 0,
    total_lines INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE code_quality.analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES code_quality.projects(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL,
    language VARCHAR(50) NOT NULL,
    files_analyzed INTEGER NOT NULL,
    lines_analyzed INTEGER DEFAULT 0,
    issues_found INTEGER NOT NULL,
    warnings_count INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    complexity_score FLOAT,
    maintainability_index FLOAT CHECK (maintainability_index >= 0 AND maintainability_index <= 100),
    technical_debt_hours FLOAT,
    full_report JSONB NOT NULL,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE code_quality.vulnerabilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID REFERENCES code_quality.analyses(id) ON DELETE CASCADE,
    project_id UUID REFERENCES code_quality.projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    column_number INTEGER,
    rule_id VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    category VARCHAR(50) NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    remediation TEXT,
    cwe_id VARCHAR(20),
    cvss_score FLOAT CHECK (cvss_score >= 0 AND cvss_score <= 10),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE code_quality.refactoring_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    analysis_id UUID REFERENCES code_quality.analyses(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    suggestion_type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    suggested_code TEXT,
    impact_score FLOAT CHECK (impact_score >= 0 AND impact_score <= 1),
    effort_estimation_hours FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE code_quality.metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES code_quality.projects(id) ON DELETE CASCADE,
    analysis_id UUID REFERENCES code_quality.analyses(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value FLOAT NOT NULL,
    metric_unit VARCHAR(20),
    threshold_value FLOAT,
    status VARCHAR(20) CHECK (status IN ('good', 'warning', 'poor')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for optimal performance
CREATE INDEX projects_name_idx ON code_quality.projects (name);
CREATE INDEX projects_language_idx ON code_quality.projects (primary_language);
CREATE INDEX projects_created_idx ON code_quality.projects (created_at);

CREATE INDEX analyses_project_idx ON code_quality.analyses (project_id);
CREATE INDEX analyses_type_idx ON code_quality.analyses (analysis_type);
CREATE INDEX analyses_language_idx ON code_quality.analyses (language);
CREATE INDEX analyses_issues_idx ON code_quality.analyses (issues_found);
CREATE INDEX analyses_created_idx ON code_quality.analyses (created_at);

CREATE INDEX vulnerabilities_analysis_idx ON code_quality.vulnerabilities (analysis_id);
CREATE INDEX vulnerabilities_project_idx ON code_quality.vulnerabilities (project_id);
CREATE INDEX vulnerabilities_severity_idx ON code_quality.vulnerabilities (severity);
CREATE INDEX vulnerabilities_category_idx ON code_quality.vulnerabilities (category);
CREATE INDEX vulnerabilities_file_idx ON code_quality.vulnerabilities (file_path);
CREATE INDEX vulnerabilities_cvss_idx ON code_quality.vulnerabilities (cvss_score);

CREATE INDEX refactoring_analysis_idx ON code_quality.refactoring_suggestions (analysis_id);
CREATE INDEX refactoring_file_idx ON code_quality.refactoring_suggestions (file_path);
CREATE INDEX refactoring_priority_idx ON code_quality.refactoring_suggestions (priority);
CREATE INDEX refactoring_type_idx ON code_quality.refactoring_suggestions (suggestion_type);

CREATE INDEX metrics_project_idx ON code_quality.metrics (project_id);
CREATE INDEX metrics_analysis_idx ON code_quality.metrics (analysis_id);
CREATE INDEX metrics_name_idx ON code_quality.metrics (metric_name);
CREATE INDEX metrics_status_idx ON code_quality.metrics (status);

-- Insert migration record
INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum) 
VALUES (5, 'code_quality_tables', 0, 'code_quality_schema_v1')
ON CONFLICT (version) DO NOTHING;