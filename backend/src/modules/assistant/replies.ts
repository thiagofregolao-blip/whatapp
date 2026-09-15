import crypto from 'crypto'
import { db } from '../../database/connection'

export function assertAuthorization(draft: any, userId: string, input: any) {
  if (!draft || draft.user_id !== userId) throw new Error('Rascunho não encontrado')
  if (draft.status !== 'draft') throw new Error('Rascunho já processado; confira o WhatsApp antes de tentar outro envio')
  if (new Date(draft.expires_at).getTime() <= Date.now()) throw new Error('Rascunho expirado; prepare novamente')
  if (input.authorize !== true || input.confirmation_token !== draft.confirmation_token || input.chat_id !== draft.chat_id || input.content !== draft.content) throw new Error('Autorize explicitamente este texto para este destinatário')
}

export async function createDraft(userId: string, messageId: string, content: string) {
  const found = await db.query(`SELECT m.*, ws.unipile_account_id FROM messages m JOIN whatsapp_sessions ws ON ws.id = m.session_id
    WHERE m.id = $1 AND m.user_id = $2 AND ws.status = 'connected' AND (m.expires_at IS NULL OR m.expires_at > NOW())`, [messageId, userId])
  const m = found.rows[0]
  if (!m) throw new Error('Mensagem indisponível ou WhatsApp desconectado')
  const result = await db.query(`INSERT INTO reply_drafts (user_id, session_id, account_id, message_id, chat_id, recipient, content, confirmation_token)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [userId, m.session_id, m.unipile_account_id, m.id, m.chat_id, m.chat_name || m.sender_name || m.chat_id, content, crypto.randomBytes(32).toString('hex')])
  return result.rows[0]
}

export async function sendDraft(userId: string, id: string, input: any, send = sendToProvider) {
  // Commit the claim before external I/O: concurrent clicks and retries cannot send twice.
  const draft = await db.transaction(async client => {
    const result = await client.query('SELECT * FROM reply_drafts WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId])
    const d = result.rows[0]
    assertAuthorization(d, userId, input)
    const session = await client.query("SELECT id FROM whatsapp_sessions WHERE id = $1 AND user_id = $2 AND unipile_account_id = $3 AND status = 'connected'", [d.session_id, userId, d.account_id])
    if (!session.rows.length) throw new Error('A conta conectada mudou; prepare um novo rascunho')
    await client.query("UPDATE reply_drafts SET status = 'sending', authorized_at = NOW() WHERE id = $1", [id])
    return d
  })
  try {
    const result = await send(draft)
    await db.query("UPDATE reply_drafts SET status = 'sent', sent_at = NOW(), provider_message_id = $2 WHERE id = $1", [id, result.message_id || result.id || null])
    return { status: 'sent', id }
  } catch {
    await db.query("UPDATE reply_drafts SET status = 'unknown' WHERE id = $1", [id])
    throw new Error('Não foi possível confirmar o envio. Confira a conversa no WhatsApp. Não repetiremos automaticamente.')
  }
}

async function sendToProvider(draft: any): Promise<any> {
  if (!process.env.UNIPILE_BASE_URL || !process.env.UNIPILE_API_KEY) throw new Error('Unipile não configurado')
  const form = new FormData()
  form.set('text', draft.content)
  form.set('account_id', draft.account_id)
  const response = await fetch(`${process.env.UNIPILE_BASE_URL}/api/v1/chats/${encodeURIComponent(draft.chat_id)}/messages`, {
    method: 'POST', headers: { 'X-API-KEY': process.env.UNIPILE_API_KEY }, body: form, signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error('Falha no provedor')
  return response.json()
}
