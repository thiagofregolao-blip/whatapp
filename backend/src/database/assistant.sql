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
ALTER TABLE messages ADD COLUMN IF NOT EXISTS from_me BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS whatsapp_chats (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  name TEXT,
  last_message_at TIMESTAMPTZ,
  PRIMARY KEY(user_id, account_id, chat_id)
);

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  name TEXT,
  notify TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  photo_url TEXT,
  photo_checked_at TIMESTAMPTZ,
  PRIMARY KEY(user_id,account_id,chat_id)
);
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS history_requested_at TIMESTAMPTZ;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS history_received_at TIMESTAMPTZ;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS history_progress INTEGER;
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS history_error TEXT;
CREATE TABLE IF NOT EXISTS app_diagnostics (
 id BIGSERIAL PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 event TEXT NOT NULL,
 code TEXT NOT NULL DEFAULT '',
 session_ref TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS app_diagnostics_user_time ON app_diagnostics(user_id,created_at DESC);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcript_status TEXT CHECK (transcript_status IN ('done','failed'));
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcribed_at TIMESTAMPTZ;
