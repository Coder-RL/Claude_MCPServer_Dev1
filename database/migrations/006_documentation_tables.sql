-- Migration 006: Documentation Generation Server Tables
-- Date: 2025-01-20
-- Purpose: Create tables for documentation projects, generated docs, and architecture diagrams

-- Documentation Schema Tables
CREATE TABLE documentation.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    repository_url TEXT,
    documentation_type VARCHAR(50) NOT NULL,
    primary_language VARCHAR(50),
    frameworks_detected JSONB DEFAULT '[]',
    total_files INTEGER DEFAULT 0,
    documentation_coverage FLOAT CHECK (documentation_coverage >= 0 AND documentation_coverage <= 100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE documentation.documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES documentation.projects(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    format VARCHAR(50) NOT NULL DEFAULT 'markdown',
    source_files JSONB DEFAULT '[]',
    word_count INTEGER,
    generated_from VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE documentation.api_specifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES documentation.projects(id) ON DELETE CASCADE,
    api_name VARCHAR(255) NOT NULL,
    specification_format VARCHAR(20) NOT NULL,
    specification_content JSONB NOT NULL,
    endpoints_count INTEGER DEFAULT 0,
    version VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE documentation.diagrams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES documentation.projects(id) ON DELETE CASCADE,
    diagram_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    mermaid_source TEXT,
    svg_content TEXT,
    png_data BYTEA,
    components_analyzed JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX projects_name_idx ON documentation.projects (name);
CREATE INDEX projects_type_idx ON documentation.projects (documentation_type);
CREATE INDEX projects_language_idx ON documentation.projects (primary_language);
CREATE INDEX projects_created_idx ON documentation.projects (created_at);

CREATE INDEX documents_project_idx ON documentation.documents (project_id);
CREATE INDEX documents_type_idx ON documentation.documents (document_type);
CREATE INDEX documents_title_idx ON documentation.documents (title);
CREATE INDEX documents_created_idx ON documentation.documents (created_at);

CREATE INDEX api_specs_project_idx ON documentation.api_specifications (project_id);
CREATE INDEX api_specs_name_idx ON documentation.api_specifications (api_name);
CREATE INDEX api_specs_format_idx ON documentation.api_specifications (specification_format);

CREATE INDEX diagrams_project_idx ON documentation.diagrams (project_id);
CREATE INDEX diagrams_type_idx ON documentation.diagrams (diagram_type);
CREATE INDEX diagrams_title_idx ON documentation.diagrams (title);

-- Insert migration record
INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum) 
VALUES (6, 'documentation_tables', 0, 'documentation_schema_v1')
ON CONFLICT (version) DO NOTHING;