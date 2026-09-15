CREATE TABLE IF NOT EXISTS reply_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  chat_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  content TEXT NOT NULL,
  confirmation_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','sent','unknown')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  authorized_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reply_drafts_user ON reply_drafts(user_id, created_at DESC);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_id TEXT;

ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'unipile';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'unipile';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source_account_id TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS provider_payload JSONB;
ALTER TABLE reply_drafts ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'unipile';
CREATE TABLE IF NOT EXISTS whatsapp_auth (
  session_id UUID REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  PRIMARY KEY (session_id, key)
);
