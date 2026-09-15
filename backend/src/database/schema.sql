-- ============================================
-- WhatsApp Digest SaaS — Schema completo
-- Execute: psql -U postgres -d whatsapp_digest -f schema.sql
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUM types
-- ============================================
CREATE TYPE plan_type AS ENUM ('free', 'pro', 'business');
CREATE TYPE session_status AS ENUM ('connecting', 'connected', 'disconnected', 'error', 'banned');
CREATE TYPE chat_type AS ENUM ('group', 'individual');
CREATE TYPE media_type AS ENUM ('text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contact', 'poll');
CREATE TYPE delivery_channel AS ENUM ('whatsapp', 'email', 'dashboard');
CREATE TYPE report_format AS ENUM ('short', 'detailed', 'executive');
CREATE TYPE keyword_type AS ENUM ('urgent', 'ignore', 'highlight');
CREATE TYPE digest_type AS ENUM ('daily', 'weekly', 'manual');

-- ============================================
-- plans — planos do SaaS
-- ============================================
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name plan_type UNIQUE NOT NULL,
  max_groups INTEGER NOT NULL DEFAULT 3,        -- -1 = ilimitado
  max_digests_per_day INTEGER NOT NULL DEFAULT 1,
  retention_days INTEGER NOT NULL DEFAULT 30,
  max_keywords INTEGER NOT NULL DEFAULT 5,
  price_brl DECIMAL(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (name, max_groups, max_digests_per_day, retention_days, max_keywords, price_brl) VALUES
  ('free',     3,   1, 30,  5,   0.00),
  ('pro',     -1,   3, 90,  50,  29.00),
  ('business',-1,   6, 365, 200, 79.00);

-- ============================================
-- users — contas dos usuários
-- ============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  plan plan_type NOT NULL DEFAULT 'free',
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  language VARCHAR(5) NOT NULL DEFAULT 'pt-BR',
  is_active BOOLEAN NOT NULL DEFAULT true,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  -- Integração futura DataGrow
  datagrow_user_id UUID,
  datagrow_api_key VARCHAR(255),
  -- Controle
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_plan ON users(plan);

-- ============================================
-- refresh_tokens — autenticação
-- ============================================
CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ============================================
-- whatsapp_sessions — conexões Unipile
-- ============================================
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unipile_account_id VARCHAR(255) UNIQUE,       -- ID retornado pelo Unipile
  phone_number_encrypted TEXT,                   -- AES-256
  display_name VARCHAR(100),
  status session_status NOT NULL DEFAULT 'connecting',
  qr_code TEXT,                                  -- Base64, temporário
  qr_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_sessions_user ON whatsapp_sessions(user_id);
CREATE INDEX idx_sessions_unipile ON whatsapp_sessions(unipile_account_id);
CREATE INDEX idx_sessions_status ON whatsapp_sessions(status);

-- ============================================
-- groups — grupos do WhatsApp do usuário
-- ============================================
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  whatsapp_chat_id VARCHAR(255) NOT NULL,       -- ID nativo WA ex: 120363@g.us
  name VARCHAR(255),
  description TEXT,
  participant_count INTEGER DEFAULT 0,
  is_monitored BOOLEAN NOT NULL DEFAULT true,
  is_excluded BOOLEAN NOT NULL DEFAULT false,   -- usuário optou por não monitorar
  last_message_at TIMESTAMPTZ,
  message_count_today INTEGER NOT NULL DEFAULT 0,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, whatsapp_chat_id)
);

CREATE INDEX idx_groups_user ON groups(user_id);
CREATE INDEX idx_groups_monitored ON groups(user_id, is_monitored) WHERE is_monitored = true;
CREATE INDEX idx_groups_last_msg ON groups(last_message_at DESC);

-- ============================================
-- messages — tabela principal (coração do sistema)
-- ============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES whatsapp_sessions(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,

  -- Identificação da conversa
  chat_id VARCHAR(255) NOT NULL,               -- ID do grupo ou contato
  chat_type chat_type NOT NULL,
  chat_name VARCHAR(255),                       -- Nome do grupo ou contato

  -- Remetente
  sender_wa_id VARCHAR(50),                    -- phone@s.whatsapp.net
  sender_name VARCHAR(100),                    -- Nome salvo no celular

  -- Conteúdo
  content TEXT,                                -- Texto (encriptado em v2)
  content_encrypted BOOLEAN NOT NULL DEFAULT false,
  media_type media_type NOT NULL DEFAULT 'text',
  has_media BOOLEAN NOT NULL DEFAULT false,
  attachment_id TEXT,
  media_url TEXT,                              -- URL temporária do Unipile

  -- Inteligência
  is_mention BOOLEAN NOT NULL DEFAULT false,   -- Mencionou o usuário?
  is_reply BOOLEAN NOT NULL DEFAULT false,
  urgency_score SMALLINT NOT NULL DEFAULT 1 CHECK (urgency_score BETWEEN 1 AND 5),
  keyword_matched VARCHAR(100)[],              -- Palavras-chave encontradas
  sentiment VARCHAR(20),                       -- positive | neutral | negative (v2)

  -- Controle de digest
  included_in_digest BOOLEAN NOT NULL DEFAULT false,
  digest_id UUID,                              -- Preenchido após geração

  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL,               -- Timestamp original da mensagem
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,                      -- Para purge LGPD

  -- Dedup
  unipile_message_id VARCHAR(255) UNIQUE      -- ID do Unipile para evitar duplicatas
);

-- Índices críticos de performance
CREATE INDEX idx_messages_user_period
  ON messages(user_id, sent_at DESC);

CREATE INDEX idx_messages_user_chat
  ON messages(user_id, chat_id, sent_at DESC);

CREATE INDEX idx_messages_urgent
  ON messages(user_id, urgency_score DESC)
  WHERE urgency_score >= 4;

CREATE INDEX idx_messages_mentions
  ON messages(user_id, is_mention)
  WHERE is_mention = true;

CREATE INDEX idx_messages_digest_pending
  ON messages(user_id, included_in_digest)
  WHERE included_in_digest = false;

CREATE INDEX idx_messages_expires
  ON messages(expires_at)
  WHERE expires_at IS NOT NULL;

-- ============================================
-- keywords — palavras-chave de alerta
-- ============================================
CREATE TABLE keywords (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word VARCHAR(100) NOT NULL,
  type keyword_type NOT NULL DEFAULT 'urgent',
  case_sensitive BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  match_count INTEGER NOT NULL DEFAULT 0,      -- Quantas vezes foi encontrada
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, word)
);

CREATE INDEX idx_keywords_user ON keywords(user_id, is_active) WHERE is_active = true;

-- ============================================
-- schedules — agendamentos de relatório
-- ============================================
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cron_expression VARCHAR(50) NOT NULL,        -- ex: "0 22 * * *" = 22h todo dia
  delivery_channels delivery_channel[] NOT NULL DEFAULT '{dashboard}',
  report_format report_format NOT NULL DEFAULT 'detailed',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_user ON schedules(user_id);
CREATE INDEX idx_schedules_next_run ON schedules(next_run_at) WHERE is_active = true;

-- ============================================
-- digests — relatórios gerados
-- ============================================
CREATE TABLE digests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_id UUID REFERENCES schedules(id) ON DELETE SET NULL,
  type digest_type NOT NULL DEFAULT 'daily',

  -- Período analisado
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Conteúdo
  content_json JSONB NOT NULL,                 -- Estrutura completa do relatório
  content_text TEXT NOT NULL,                  -- Versão formatada para WhatsApp
  content_html TEXT,                           -- Versão HTML para email

  -- Métricas do digest
  total_messages INTEGER NOT NULL DEFAULT 0,
  total_groups INTEGER NOT NULL DEFAULT 0,
  total_individual INTEGER NOT NULL DEFAULT 0,
  urgent_count INTEGER NOT NULL DEFAULT 0,
  mention_count INTEGER NOT NULL DEFAULT 0,

  -- Controle de custo
  claude_tokens_input INTEGER NOT NULL DEFAULT 0,
  claude_tokens_output INTEGER NOT NULL DEFAULT 0,
  claude_model VARCHAR(50),

  -- Entrega
  delivered_via delivery_channel[],
  delivered_at TIMESTAMPTZ,
  delivery_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_digests_user ON digests(user_id, created_at DESC);
CREATE INDEX idx_digests_period ON digests(user_id, period_start, period_end);

-- ============================================
-- Trigger: updated_at automático
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_groups_updated BEFORE UPDATE ON groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_schedules_updated BEFORE UPDATE ON schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- View: resumo de atividade do usuário
-- ============================================
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT
  u.id AS user_id,
  u.email,
  u.plan,
  COUNT(DISTINCT g.id) AS total_groups_monitored,
  COUNT(DISTINCT m.id) FILTER (WHERE m.sent_at >= NOW() - INTERVAL '24 hours') AS messages_today,
  COUNT(DISTINCT m.id) FILTER (WHERE m.urgency_score >= 4 AND m.sent_at >= NOW() - INTERVAL '24 hours') AS urgent_today,
  COUNT(DISTINCT d.id) FILTER (WHERE d.created_at >= NOW() - INTERVAL '24 hours') AS digests_today,
  ws.status AS session_status,
  ws.last_activity_at
FROM users u
LEFT JOIN whatsapp_sessions ws ON ws.user_id = u.id
LEFT JOIN groups g ON g.user_id = u.id AND g.is_monitored = true
LEFT JOIN messages m ON m.user_id = u.id
LEFT JOIN digests d ON d.user_id = u.id
GROUP BY u.id, u.email, u.plan, ws.status, ws.last_activity_at;
