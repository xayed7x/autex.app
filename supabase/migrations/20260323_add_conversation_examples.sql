-- Add conversation_examples column to workspace_settings
-- Stores few-shot example conversations for AI tone training
-- Structure: [{ id, customer, agent, scenario? }]

ALTER TABLE workspace_settings 
ADD COLUMN IF NOT EXISTS conversation_examples JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN workspace_settings.conversation_examples IS 'Few-shot example conversations for AI training. Each entry has id, customer message, agent response, and optional scenario tag.';
