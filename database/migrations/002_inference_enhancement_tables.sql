-- Migration 002: Inference Enhancement Server Tables
-- Date: 2025-01-20
-- Purpose: Create tables for vector embeddings, knowledge graphs, and reasoning

-- Enable vector extension for PostgreSQL 16
CREATE EXTENSION IF NOT EXISTS vector;

-- Inference Enhancement Schema Tables
CREATE TABLE inference_enhancement.embeddings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    text TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE inference_enhancement.knowledge_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE inference_enhancement.reasoning_chains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID REFERENCES inference_enhancement.knowledge_domains(id) ON DELETE CASCADE,
    input_query TEXT NOT NULL,
    reasoning_steps JSONB NOT NULL,
    final_result TEXT,
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
    execution_time_ms INTEGER,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE inference_enhancement.knowledge_relationships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_embedding_id UUID REFERENCES inference_enhancement.embeddings(id) ON DELETE CASCADE,
    target_embedding_id UUID REFERENCES inference_enhancement.embeddings(id) ON DELETE CASCADE,
    relationship_type VARCHAR(100) NOT NULL,
    strength FLOAT CHECK (strength >= 0 AND strength <= 1),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(source_embedding_id, target_embedding_id, relationship_type)
);

-- Indexes for optimal performance
CREATE INDEX embeddings_domain_idx ON inference_enhancement.embeddings (domain);
CREATE INDEX embeddings_vector_idx ON inference_enhancement.embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX embeddings_created_idx ON inference_enhancement.embeddings (created_at);
CREATE INDEX embeddings_metadata_idx ON inference_enhancement.embeddings USING GIN (metadata);

CREATE INDEX knowledge_domains_name_idx ON inference_enhancement.knowledge_domains (name);
CREATE INDEX reasoning_chains_domain_idx ON inference_enhancement.reasoning_chains (domain_id);
CREATE INDEX reasoning_chains_created_idx ON inference_enhancement.reasoning_chains (created_at);
CREATE INDEX reasoning_chains_confidence_idx ON inference_enhancement.reasoning_chains (confidence_score);

CREATE INDEX relationships_source_idx ON inference_enhancement.knowledge_relationships (source_embedding_id);
CREATE INDEX relationships_target_idx ON inference_enhancement.knowledge_relationships (target_embedding_id);
CREATE INDEX relationships_type_idx ON inference_enhancement.knowledge_relationships (relationship_type);
CREATE INDEX relationships_strength_idx ON inference_enhancement.knowledge_relationships (strength);

-- Insert migration record
INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum) 
VALUES (2, 'inference_enhancement_tables', 0, 'inference_schema_v1')
ON CONFLICT (version) DO NOTHING;