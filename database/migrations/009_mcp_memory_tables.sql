-- Migration 009: MCP Memory Enhancement Tables
-- Creates tables for Memory MCP service persistent storage

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create memories table for persistent context storage
CREATE TABLE IF NOT EXISTS mcp_memories (
    id SERIAL PRIMARY KEY,
    memory_id UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    content TEXT NOT NULL,
    embedding_reference TEXT, -- Reference to Qdrant vector ID
    metadata JSONB DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',
    importance INTEGER DEFAULT 1 CHECK (importance >= 1 AND importance <= 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    context_type VARCHAR(50) DEFAULT 'general',
    project_phase VARCHAR(20),
    component_name VARCHAR(100),
    session_id VARCHAR(100),
    user_id VARCHAR(100),
    -- Full-text search support
    search_vector tsvector,
    -- Memory lifecycle
    expires_at TIMESTAMP WITH TIME ZONE,
    archived BOOLEAN DEFAULT FALSE,
    version INTEGER DEFAULT 1
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_memories_memory_id ON mcp_memories(memory_id);
CREATE INDEX IF NOT EXISTS idx_memories_context_type ON mcp_memories(context_type);
CREATE INDEX IF NOT EXISTS idx_memories_project_phase ON mcp_memories(project_phase);
CREATE INDEX IF NOT EXISTS idx_memories_component_name ON mcp_memories(component_name);
CREATE INDEX IF NOT EXISTS idx_memories_session_id ON mcp_memories(session_id);
CREATE INDEX IF NOT EXISTS idx_memories_user_id ON mcp_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_created_at ON mcp_memories(created_at);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON mcp_memories(importance);
CREATE INDEX IF NOT EXISTS idx_memories_tags ON mcp_memories USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_memories_metadata ON mcp_memories USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_memories_search ON mcp_memories USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_memories_active ON mcp_memories(archived, expires_at) WHERE archived = FALSE;

-- Create memory relationships table for linking related memories
CREATE TABLE IF NOT EXISTS mcp_memory_relationships (
    id SERIAL PRIMARY KEY,
    source_memory_id UUID REFERENCES mcp_memories(memory_id) ON DELETE CASCADE,
    target_memory_id UUID REFERENCES mcp_memories(memory_id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL, -- 'related', 'follows', 'references', 'contradicts'
    strength DECIMAL(3,2) DEFAULT 1.0 CHECK (strength >= 0.0 AND strength <= 1.0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(source_memory_id, target_memory_id, relationship_type)
);

-- Create indexes for memory relationships
CREATE INDEX IF NOT EXISTS idx_memory_rel_source ON mcp_memory_relationships(source_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_rel_target ON mcp_memory_relationships(target_memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_rel_type ON mcp_memory_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_memory_rel_strength ON mcp_memory_relationships(strength);

-- Create memory collections table for organizing memories
CREATE TABLE IF NOT EXISTS mcp_memory_collections (
    id SERIAL PRIMARY KEY,
    collection_id UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    owner_id VARCHAR(100),
    is_public BOOLEAN DEFAULT FALSE,
    memory_count INTEGER DEFAULT 0
);

-- Create memory collection memberships
CREATE TABLE IF NOT EXISTS mcp_memory_collection_memberships (
    id SERIAL PRIMARY KEY,
    collection_id UUID REFERENCES mcp_memory_collections(collection_id) ON DELETE CASCADE,
    memory_id UUID REFERENCES mcp_memories(memory_id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(collection_id, memory_id)
);

-- Create memory usage analytics table
CREATE TABLE IF NOT EXISTS mcp_memory_analytics (
    id SERIAL PRIMARY KEY,
    memory_id UUID REFERENCES mcp_memories(memory_id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'accessed', 'updated', 'referenced', 'searched'
    event_data JSONB DEFAULT '{}',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    session_id VARCHAR(100),
    user_id VARCHAR(100),
    relevance_score DECIMAL(3,2)
);

-- Create indexes for analytics
CREATE INDEX IF NOT EXISTS idx_memory_analytics_memory ON mcp_memory_analytics(memory_id);
CREATE INDEX IF NOT EXISTS idx_memory_analytics_event ON mcp_memory_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_memory_analytics_timestamp ON mcp_memory_analytics(timestamp);
CREATE INDEX IF NOT EXISTS idx_memory_analytics_session ON mcp_memory_analytics(session_id);

-- Create function to update search vector
CREATE OR REPLACE FUNCTION update_memory_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector = to_tsvector('english', 
        COALESCE(NEW.content, '') || ' ' || 
        COALESCE(array_to_string(NEW.tags, ' '), '') || ' ' ||
        COALESCE(NEW.context_type, '') || ' ' ||
        COALESCE(NEW.component_name, '')
    );
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic search vector updates
DROP TRIGGER IF EXISTS trig_update_memory_search_vector ON mcp_memories;
CREATE TRIGGER trig_update_memory_search_vector
    BEFORE INSERT OR UPDATE ON mcp_memories
    FOR EACH ROW 
    EXECUTE FUNCTION update_memory_search_vector();

-- Create function to update collection memory count
CREATE OR REPLACE FUNCTION update_collection_memory_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE mcp_memory_collections 
        SET memory_count = memory_count + 1, updated_at = NOW()
        WHERE collection_id = NEW.collection_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE mcp_memory_collections 
        SET memory_count = memory_count - 1, updated_at = NOW()
        WHERE collection_id = OLD.collection_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for collection count updates
DROP TRIGGER IF EXISTS trig_update_collection_count ON mcp_memory_collection_memberships;
CREATE TRIGGER trig_update_collection_count
    AFTER INSERT OR DELETE ON mcp_memory_collection_memberships
    FOR EACH ROW 
    EXECUTE FUNCTION update_collection_memory_count();

-- Create function for memory cleanup (remove expired memories)
CREATE OR REPLACE FUNCTION cleanup_expired_memories()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Archive expired memories instead of deleting them
    UPDATE mcp_memories 
    SET archived = TRUE, updated_at = NOW()
    WHERE expires_at IS NOT NULL 
      AND expires_at < NOW() 
      AND archived = FALSE;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Log cleanup action
    INSERT INTO mcp_memory_analytics (memory_id, event_type, event_data, timestamp)
    SELECT memory_id, 'archived', 
           jsonb_build_object('reason', 'expired', 'archived_at', NOW()), 
           NOW()
    FROM mcp_memories 
    WHERE archived = TRUE AND updated_at >= NOW() - INTERVAL '1 minute';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create views for common queries
CREATE OR REPLACE VIEW active_memories AS
SELECT m.*, 
       array_length(m.tags, 1) as tag_count,
       (SELECT COUNT(*) FROM mcp_memory_relationships r 
        WHERE r.source_memory_id = m.memory_id OR r.target_memory_id = m.memory_id) as relationship_count
FROM mcp_memories m
WHERE m.archived = FALSE 
  AND (m.expires_at IS NULL OR m.expires_at > NOW());

CREATE OR REPLACE VIEW memory_statistics AS
SELECT 
    context_type,
    COUNT(*) as total_memories,
    AVG(importance) as avg_importance,
    MAX(created_at) as latest_memory,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as memories_today,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as memories_this_week
FROM mcp_memories 
WHERE archived = FALSE
GROUP BY context_type;

-- Insert initial data
INSERT INTO mcp_memory_collections (collection_id, name, description, is_public) VALUES
    (uuid_generate_v4(), 'Claude MCP Project', 'Memories related to the Claude MCP Server project development', true),
    (uuid_generate_v4(), 'Architecture Decisions', 'Key architectural and design decisions made during development', true),
    (uuid_generate_v4(), 'Bug Fixes & Solutions', 'Solutions to bugs and issues encountered during development', true),
    (uuid_generate_v4(), 'Learning & Insights', 'Insights and learnings gained throughout the project', true)
ON CONFLICT (collection_id) DO NOTHING;

-- Grant permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mcp_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mcp_user;

COMMENT ON TABLE mcp_memories IS 'Persistent memory storage for MCP with vector search integration';
COMMENT ON TABLE mcp_memory_relationships IS 'Relationships and connections between memories';
COMMENT ON TABLE mcp_memory_collections IS 'Collections for organizing related memories';
COMMENT ON TABLE mcp_memory_analytics IS 'Usage analytics and access patterns for memories';

-- Final status
SELECT 'MCP Memory tables created successfully' as status;