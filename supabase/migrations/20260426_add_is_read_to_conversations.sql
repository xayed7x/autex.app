-- Add is_read column to conversations
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS is_read boolean DEFAULT true;

-- Update existing conversations to be read
UPDATE public.conversations SET is_read = true WHERE is_read IS NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_conversations_is_read ON public.conversations(is_read);
