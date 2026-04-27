-- =============================================================
-- Migration: Semantic Example Embeddings via pgvector
-- Purpose: Enable cosine similarity search for conversation
--          examples instead of injecting all 50 into every prompt.
-- =============================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Embeddings table
CREATE TABLE conversation_example_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  example_index INTEGER NOT NULL,
  customer_text TEXT NOT NULL,
  agent_text TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'faq',
  embedding vector(1536),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. HNSW index for fast cosine similarity search
--    (HNSW works well regardless of row count, unlike ivfflat)
CREATE INDEX idx_example_embeddings_hnsw
  ON conversation_example_embeddings
  USING hnsw (embedding vector_cosine_ops);

-- 4. B-tree index for workspace_id filtering
CREATE INDEX idx_example_embeddings_workspace
  ON conversation_example_embeddings (workspace_id);

-- 5. RPC function for cosine similarity search
--    (Supabase JS client cannot use pgvector <=> operator directly)
CREATE OR REPLACE FUNCTION match_conversation_examples(
  query_embedding vector(1536),
  target_workspace_id UUID,
  match_count INTEGER DEFAULT 4
)
RETURNS TABLE (
  customer_text TEXT,
  agent_text TEXT,
  type TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cee.customer_text,
    cee.agent_text,
    cee.type,
    1 - (cee.embedding <=> query_embedding) AS similarity
  FROM conversation_example_embeddings cee
  WHERE cee.workspace_id = target_workspace_id
  ORDER BY cee.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
