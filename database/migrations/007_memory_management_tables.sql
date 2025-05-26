-- Migration 007: Memory Management Server Tables
-- Date: 2025-01-20
-- Purpose: Create tables for context storage, embeddings, and hierarchical memory

-- Memory Management Schema Tables
CREATE TABLE memory_management.namespaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    retention_policy JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE memory_management.contexts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    namespace_id UUID REFERENCES memory_management.namespaces(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES memory_management.contexts(id) ON DELETE SET NULL,
    title TEXT,
    content TEXT NOT NULL,
    content_type VARCHAR(50) DEFAULT 'text',
    compressed BOOLEAN DEFAULT FALSE,
    compression_ratio FLOAT,
    importance_score FLOAT CHECK (importance_score >= 0 AND importance_score <= 1),
    access_count INTEGER DEFAULT 0,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE memory_management.context_embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    context_id UUID REFERENCES memory_management.contexts(id) ON DELETE CASCADE,
    embedding VECTOR(1536) NOT NULL,
    embedding_model VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE memory_management.context_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_context_id UUID REFERENCES memory_management.contexts(id) ON DELETE CASCADE,
    target_context_id UUID REFERENCES memory_management.contexts(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL,
    strength FLOAT CHECK (strength >= 0 AND strength <= 1),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_context_id, target_context_id, relationship_type)
);

CREATE TABLE memory_management.retrieval_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query TEXT NOT NULL,
    namespace_id UUID REFERENCES memory_management.namespaces(id) ON DELETE CASCADE,
    search_parameters JSONB DEFAULT '{}',
    results_count INTEGER DEFAULT 0,
    execution_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX namespaces_name_idx ON memory_management.namespaces (name);
CREATE INDEX namespaces_created_idx ON memory_management.namespaces (created_at);

CREATE INDEX contexts_namespace_idx ON memory_management.contexts (namespace_id);
CREATE INDEX contexts_parent_idx ON memory_management.contexts (parent_id);
CREATE INDEX contexts_importance_idx ON memory_management.contexts (importance_score);
CREATE INDEX contexts_compressed_idx ON memory_management.contexts (compressed);
CREATE INDEX contexts_accessed_idx ON memory_management.contexts (accessed_at);
CREATE INDEX contexts_metadata_idx ON memory_management.contexts USING GIN (metadata);

CREATE INDEX context_embedding_idx ON memory_management.context_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX context_embeddings_context_idx ON memory_management.context_embeddings (context_id);
CREATE INDEX context_embeddings_model_idx ON memory_management.context_embeddings (embedding_model);

CREATE INDEX relationships_source_idx ON memory_management.context_relationships (source_context_id);
CREATE INDEX relationships_target_idx ON memory_management.context_relationships (target_context_id);
CREATE INDEX relationships_type_idx ON memory_management.context_relationships (relationship_type);
CREATE INDEX relationships_strength_idx ON memory_management.context_relationships (strength);

CREATE INDEX retrieval_namespace_idx ON memory_management.retrieval_sessions (namespace_id);
CREATE INDEX retrieval_created_idx ON memory_management.retrieval_sessions (created_at);

-- Insert migration record
INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum) 
VALUES (7, 'memory_management_tables', 0, 'memory_schema_v1')
ON CONFLICT (version) DO NOTHING;