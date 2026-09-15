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

-- Existing accounts keep their explicitly configured platform access; new accounts
-- have no platform subsidy unless it is provisioned separately.
DO $$ BEGIN
  IF to_regclass('public.user_ai_settings') IS NULL THEN
    CREATE TABLE user_ai_settings (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'personal' CHECK (mode IN ('personal','platform')),
      encrypted_key TEXT,
      platform_access BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO user_ai_settings(user_id, mode, platform_access)
      SELECT id, 'platform', TRUE FROM users;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS daily_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  content TEXT NOT NULL,
  message_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, report_date)
);
