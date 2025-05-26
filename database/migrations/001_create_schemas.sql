-- Migration 001: Create all MCP server schemas
-- Date: 2025-01-20
-- Purpose: Initialize database with isolated schemas for each MCP server

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create schemas for each MCP server
CREATE SCHEMA IF NOT EXISTS inference_enhancement;
CREATE SCHEMA IF NOT EXISTS ui_testing;
CREATE SCHEMA IF NOT EXISTS analytics;
CREATE SCHEMA IF NOT EXISTS code_quality;
CREATE SCHEMA IF NOT EXISTS documentation;
CREATE SCHEMA IF NOT EXISTS memory_management;
CREATE SCHEMA IF NOT EXISTS web_access;

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version INTEGER PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    execution_time_ms INTEGER,
    checksum VARCHAR(64)
);

-- Insert this migration record
INSERT INTO public.schema_migrations (version, name, execution_time_ms, checksum) 
VALUES (1, 'create_schemas', 0, 'initial_schemas_migration')
ON CONFLICT (version) DO NOTHING;