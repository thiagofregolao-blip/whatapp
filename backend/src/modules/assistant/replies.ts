import crypto from 'crypto'
import { sendAuthorized } from '../whatsapp/baileys.service'
import { db } from '../../database/connection'

export function assertAuthorization(draft: any, userId: string, input: any) {
  if (!draft || draft.user_id !== userId) throw new Error('Rascunho não encontrado')
  if (draft.status !== 'draft') throw new Error('Rascunho já processado; confira o WhatsApp antes de tentar outro envio')
  if (new Date(draft.expires_at).getTime() <= Date.now()) throw new Error('Rascunho expirado; prepare novamente')
  if (input.authorize !== true || input.confirmation_token !== draft.confirmation_token || input.chat_id !== draft.chat_id || input.content !== draft.content) throw new Error('Autorize explicitamente este texto para este destinatário')
}

export async function createDraft(userId: string, messageId: string, content: string) {
  const found = await db.query(`SELECT m.*, ws.unipile_account_id FROM messages m JOIN whatsapp_sessions ws ON ws.id = m.session_id
    WHERE m.id = $1 AND m.user_id = $2 AND ws.status = 'connected' AND m.provider=ws.provider AND (m.source_account_id IS NULL OR m.source_account_id=ws.unipile_account_id) AND (m.expires_at IS NULL OR m.expires_at > NOW())`, [messageId, userId])
  const m = found.rows[0]
  if (!m) throw new Error('Mensagem indisponível ou WhatsApp desconectado')
  const result = await db.query(`INSERT INTO reply_drafts (user_id, session_id, account_id, message_id, chat_id, recipient, content, confirmation_token, provider)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [userId, m.session_id, m.unipile_account_id, m.id, m.chat_id, m.chat_name || m.sender_name || m.chat_id, content, crypto.randomBytes(32).toString('hex'),m.provider])
  return result.rows[0]
}

export async function sendDraft(userId: string, id: string, input: any, send = sendToProvider) {
  // Commit the claim before external I/O: concurrent clicks and retries cannot send twice.
  const draft = await db.transaction(async client => {
    const result = await client.query('SELECT * FROM reply_drafts WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, userId])
    const d = result.rows[0]
    assertAuthorization(d, userId, input)
    const session = await client.query("SELECT id FROM whatsapp_sessions WHERE id = $1 AND user_id = $2 AND unipile_account_id = $3 AND status = 'connected' AND provider=$4", [d.session_id, userId, d.account_id, d.provider])
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
  if (draft.provider === 'baileys') return sendAuthorized(draft)
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

export async function createChatDraft(userId: string, chatId: string, content: string) {
  const found = await db.query(`SELECT ws.id,ws.unipile_account_id,ws.provider,c.name FROM whatsapp_sessions ws
    JOIN whatsapp_chats c ON c.user_id=ws.user_id AND c.account_id=ws.unipile_account_id
    WHERE ws.user_id=$1 AND c.chat_id=$2 AND ws.status='connected'`, [userId,chatId])
  const s = found.rows[0]
  if (!s) throw new Error('Conversa indisponível na conta conectada')
  return (await db.query(`INSERT INTO reply_drafts(user_id,session_id,account_id,chat_id,recipient,content,confirmation_token,provider)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[userId,s.id,s.unipile_account_id,chatId,s.name || chatId,content,crypto.randomBytes(32).toString('hex'),s.provider])).rows[0]
}
