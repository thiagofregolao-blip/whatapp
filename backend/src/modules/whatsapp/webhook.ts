import crypto from 'crypto'
import { UnipileWebhookEvent } from '../../types'

export function verifyWebhook(raw: Buffer, signature?: string, token?: string): boolean {
  const secret = process.env.UNIPILE_WEBHOOK_SECRET
  if (!secret) return false
  const equal = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
  // Configure this custom header in the Unipile webhook dashboard.
  if (token && equal(token, secret)) return true
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  return equal(signature || '', expected)
}

export function normalizeWebhook(payload: any): UnipileWebhookEvent {
  if (payload.AccountStatus) {
    const status = payload.AccountStatus
    const event = ['OK','SYNC_SUCCESS','RECONNECTED'].includes(status.message) ? 'account_connected' : ['ERROR','STOPPED','CREDENTIALS','DELETED'].includes(status.message) ? 'account_disconnected' : 'account_pending'
    return { event, account_id: status.account_id, data: {} } as UnipileWebhookEvent
  }
  if (payload.data?.chat_id) return payload
  const a = payload.attachments?.find((item: any) => item.type === 'audio' || item.mimetype?.startsWith('audio/')) || payload.attachments?.[0]
  const timestamp = typeof payload.timestamp === 'number' ? payload.timestamp : Date.parse(payload.timestamp) / 1000
  if (payload.event === 'message_received' && (!payload.message_id || !payload.chat_id || !Number.isFinite(timestamp))) throw new Error('Evento de mensagem inválido')
  return {
    event: payload.event, account_id: payload.account_id,
    data: {
      id: payload.message_id, chat_id: payload.chat_id, chat_name: payload.chat_name,
      from_me: Boolean(payload.is_sender || (payload.account_info?.user_id && payload.account_info.user_id === payload.sender?.attendee_provider_id)),
      sender: { id: payload.sender?.attendee_provider_id, display_name: payload.sender?.attendee_name },
      text: payload.message, timestamp, is_group: payload.is_group || payload.chat_provider_id?.endsWith('@g.us'),
      type: a?.mimetype?.startsWith('audio/') || a?.type === 'audio' ? 'audio' : a ? 'document' : 'text',
      has_media: Boolean(a), attachment_id: a?.id,
    },
  }
}
