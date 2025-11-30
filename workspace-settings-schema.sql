-- Workspace Settings Table for AI Configuration
-- This stores per-workspace AI chatbot settings

CREATE TABLE IF NOT EXISTS workspace_settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  
  -- Bot Personality
  business_name text,
  greeting_message text DEFAULT 'আসসালামু আলাইকুম! 👋
আমি আপনার AI assistant।
আপনি কোন product খুঁজছেন?',
  conversation_tone text DEFAULT 'friendly' CHECK (conversation_tone IN ('friendly', 'professional', 'casual')),
  bengali_percent integer DEFAULT 80 CHECK (bengali_percent >= 0 AND bengali_percent <= 100),
  use_emojis boolean DEFAULT true,
  
  -- Product Matching
  confidence_threshold integer DEFAULT 75 CHECK (confidence_threshold >= 50 AND confidence_threshold <= 100),
  show_image_confirmation boolean DEFAULT true,
  
  -- Delivery Information
  delivery_charge_inside_dhaka numeric DEFAULT 60,
  delivery_charge_outside_dhaka numeric DEFAULT 120,
  delivery_time text DEFAULT '3-5 business days',
  auto_mention_delivery boolean DEFAULT true,
  
  -- Payment Methods
  payment_methods jsonb DEFAULT '{
    "bkash": {"enabled": true, "number": ""},
    "nagad": {"enabled": true, "number": ""},
    "cod": {"enabled": false}
  }'::jsonb,
  payment_message text DEFAULT 'Payment করতে আমাদের bKash এ send করুন।
Screenshot পাঠালে আমরা verify করব।',
  
  -- AI Behavior Rules
  behavior_rules jsonb DEFAULT '{
    "multiProduct": false,
    "askSize": true,
    "showStock": true,
    "offerAlternatives": false,
    "sendConfirmation": true
  }'::jsonb,
  
  -- Advanced Configuration (JSON)
  advanced_config jsonb DEFAULT '{
    "model": "gpt-4-turbo",
    "temperature": 0.7,
    "maxTokens": 1000
  }'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(workspace_id)
);

-- Enable RLS
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their workspace settings"
  ON workspace_settings FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their workspace settings"
  ON workspace_settings FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their workspace settings"
  ON workspace_settings FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their workspace settings"
  ON workspace_settings FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Create index for faster lookups
CREATE INDEX idx_workspace_settings_workspace_id ON workspace_settings(workspace_id);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workspace_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspace_settings_updated_at
  BEFORE UPDATE ON workspace_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_settings_updated_at();
