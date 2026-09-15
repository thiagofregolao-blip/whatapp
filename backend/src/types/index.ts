// ============================================
// Types compartilhados do WhatsApp Digest SaaS
// ============================================

export type PlanType = 'free' | 'pro' | 'business'
export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'banned'
export type ChatType = 'group' | 'individual'
export type MediaType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'contact' | 'poll'
export type DeliveryChannel = 'whatsapp' | 'email' | 'dashboard'
export type ReportFormat = 'short' | 'detailed' | 'executive'
export type KeywordType = 'urgent' | 'ignore' | 'highlight'
export type DigestType = 'daily' | 'weekly' | 'manual'

// ============================================
// Entidades do banco
// ============================================

export interface User {
  id: string
  email: string
  password_hash: string
  name: string | null
  plan: PlanType
  timezone: string
  language: string
  is_active: boolean
  email_verified: boolean
  datagrow_user_id: string | null
  datagrow_api_key: string | null
  last_login_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface WhatsappSession {
  id: string
  user_id: string
  unipile_account_id: string | null
  phone_number_encrypted: string | null
  display_name: string | null
  status: SessionStatus
  qr_code: string | null
  qr_expires_at: Date | null
  connected_at: Date | null
  last_activity_at: Date | null
  disconnected_at: Date | null
  error_message: string | null
  created_at: Date
  updated_at: Date
}

export interface Group {
  id: string
  user_id: string
  session_id: string
  whatsapp_chat_id: string
  name: string | null
  description: string | null
  participant_count: number
  is_monitored: boolean
  is_excluded: boolean
  last_message_at: Date | null
  message_count_today: number
  synced_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface Message {
  id: string
  user_id: string
  session_id: string
  group_id: string | null
  chat_id: string
  chat_type: ChatType
  chat_name: string | null
  sender_wa_id: string | null
  sender_name: string | null
  content: string | null
  content_encrypted: boolean
  media_type: MediaType
  has_media: boolean
  media_url: string | null
  is_mention: boolean
  is_reply: boolean
  urgency_score: number
  keyword_matched: string[] | null
  sentiment: string | null
  included_in_digest: boolean
  digest_id: string | null
  sent_at: Date
  received_at: Date
  expires_at: Date | null
  unipile_message_id: string | null
}

export interface Keyword {
  id: string
  user_id: string
  word: string
  type: KeywordType
  case_sensitive: boolean
  is_active: boolean
  match_count: number
  created_at: Date
}

export interface Schedule {
  id: string
  user_id: string
  cron_expression: string
  delivery_channels: DeliveryChannel[]
  report_format: ReportFormat
  is_active: boolean
  last_run_at: Date | null
  next_run_at: Date | null
  created_at: Date
  updated_at: Date
}

export interface Digest {
  id: string
  user_id: string
  schedule_id: string | null
  type: DigestType
  period_start: Date
  period_end: Date
  content_json: DigestContentJson
  content_text: string
  content_html: string | null
  total_messages: number
  total_groups: number
  total_individual: number
  urgent_count: number
  mention_count: number
  claude_tokens_input: number
  claude_tokens_output: number
  claude_model: string | null
  delivered_via: DeliveryChannel[] | null
  delivered_at: Date | null
  delivery_error: string | null
  created_at: Date
}

// ============================================
// Estrutura do relatório gerado pela IA
// ============================================

export interface DigestGroupSummary {
  chat_id: string
  chat_name: string
  message_count: number
  participant_count: number
  main_topics: string[]
  decisions: string[]
  mentions: string[]
  urgent_items: string[]
  urgency_level: 1 | 2 | 3 | 4 | 5
  summary: string
}

export interface DigestIndividualSummary {
  chat_id: string
  contact_name: string
  message_count: number
  needs_reply: boolean
  summary: string
  urgency_level: 1 | 2 | 3 | 4 | 5
  last_message_preview: string
}

export interface DigestContentJson {
  period_label: string
  overall_summary: string
  urgent_items: string[]
  groups: DigestGroupSummary[]
  individuals: DigestIndividualSummary[]
  stats: {
    total_messages: number
    active_groups: number
    active_individuals: number
    mentions: number
    media_count: number
  }
  generated_at: string
}

// ============================================
// Webhook Unipile
// ============================================

export interface UnipileWebhookEvent {
  provider?: string
  provider_payload?: unknown
  event: string
  account_id: string
  data: {
    id: string
    chat_id: string
    chat_name?: string
    from_me: boolean
    sender: {
      id: string
      display_name?: string
    }
    text?: string
    timestamp: number
    type: string
    has_media?: boolean
    media_url?: string
    attachment_id?: string
    is_group?: boolean
    mentions?: string[]
    is_reply?: boolean
    reply_to_id?: string
  }
}

// ============================================
// DTOs de request/response
// ============================================

export interface RegisterDto {
  email: string
  password: string
  name?: string
  timezone?: string
}

export interface LoginDto {
  email: string
  password: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  user: Omit<User, 'password_hash'>
}

export interface ConnectWhatsappResponse {
  session_id: string
  qr_code: string
  qr_expires_at: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// ============================================
// Request com usuário autenticado
// ============================================

declare global {
  namespace Express {
    interface Request {
      user?: Omit<User, 'password_hash'>
      session?: WhatsappSession
    }
  }
}
