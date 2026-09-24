import { db } from '../../database/connection'
import { audioOriginal } from '../whatsapp/baileys.service'
import { userApiKey } from './credentials'

export const transcribeModel = () => process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-transcribe'
const inflight = new Map<string, Promise<string | null>>()
let running = 0
const waiting: (() => void)[] = []
// At most two uploads at a time: a history burst must not exhaust memory or the user's quota.
async function slot<T>(work: () => Promise<T>) {
  if (running >= 2) await new Promise<void>(resolve => waiting.push(resolve))
  running++
  try { return await work() } finally { running--; waiting.shift()?.() }
}

export async function audioBytes(m: any): Promise<{ bytes: Buffer; type: string }> {
  if (m.provider === 'baileys') return audioOriginal(m)
  if (!m.attachment_id || !m.unipile_message_id) throw new Error('Áudio original indisponível no provedor')
  if (!process.env.UNIPILE_API_KEY || !process.env.UNIPILE_BASE_URL) throw new Error('Unipile não configurado')
  const upstream = await fetch(`${process.env.UNIPILE_BASE_URL}/api/v1/messages/${encodeURIComponent(m.unipile_message_id)}/attachments/${encodeURIComponent(m.attachment_id)}?account_id=${encodeURIComponent(m.unipile_account_id)}`, { headers: { 'X-API-KEY': process.env.UNIPILE_API_KEY }, signal: AbortSignal.timeout(30000), redirect: 'error' })
  if (!upstream.ok) throw new Error('O provedor não disponibilizou este áudio')
  const type = upstream.headers.get('content-type') || ''
  if (!type.startsWith('audio/') && !type.startsWith('application/octet-stream')) throw new Error('Formato de áudio inesperado')
  // Bound memory even when the provider omits Content-Length.
  const chunks: Uint8Array[] = []; let size = 0
  for await (const chunk of upstream.body as any) {
    size += chunk.length
    if (size > 25 * 1024 * 1024) throw new Error('Áudio excede 25 MB')
    chunks.push(chunk)
  }
  return { bytes: Buffer.concat(chunks), type }
}

const extension = (type: string) => type.includes('mp4') || type.includes('m4a') ? 'm4a' : type.includes('mpeg') || type.includes('mp3') ? 'mp3' : type.includes('wav') ? 'wav' : type.includes('webm') ? 'webm' : 'ogg'
export async function transcribeAudio(bytes: Buffer, type: string, apiKey: string) {
  const mime = type.split(';')[0].trim() === 'application/octet-stream' ? 'audio/ogg' : type.split(';')[0].trim()
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: mime }), `audio.${extension(mime)}`)
  form.set('model', transcribeModel()); form.set('language', 'pt'); form.set('response_format', 'json')
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(90000) })
  if (!response.ok) throw new Error(`OpenAI não transcreveu o áudio (${response.status})`)
  const text = String((await response.json() as any).text || '').trim()
  return text.slice(0, 8000)
}

// Idempotent: a stored transcript is reused; failures are recorded so they are not retried in a loop.
export function transcribeMessage(userId: string, messageId: string, retryFailed = false): Promise<string | null> {
  const key = `${userId}:${messageId}`
  if (inflight.has(key)) return inflight.get(key)!
  const work = (async () => {
    const m = (await db.query(`SELECT m.*, ws.unipile_account_id FROM messages m JOIN whatsapp_sessions ws ON ws.id=m.session_id
      WHERE m.id=$1 AND m.user_id=$2 AND m.media_type='audio' AND (m.expires_at IS NULL OR m.expires_at > NOW())`, [messageId, userId])).rows[0]
    if (!m) throw new Error('Áudio indisponível')
    if (m.transcript_status === 'done') return m.transcript
    if (m.transcript_status === 'failed' && !retryFailed) return null
    const apiKey = await userApiKey(userId)
    try {
      const audio = await slot(() => audioBytes(m))
      const text = await slot(() => transcribeAudio(audio.bytes, audio.type, apiKey))
      await db.query("UPDATE messages SET transcript=$3, transcript_status='done', transcribed_at=NOW() WHERE id=$1 AND user_id=$2", [messageId, userId, text || '(áudio sem fala reconhecível)'])
      return text || '(áudio sem fala reconhecível)'
    } catch (e) {
      await db.query("UPDATE messages SET transcript_status='failed', transcribed_at=NOW() WHERE id=$1 AND user_id=$2", [messageId, userId])
      throw e
    }
  })().finally(() => inflight.delete(key))
  inflight.set(key, work)
  return work
}

// Best effort for context building: never blocks an answer on a failed or slow download.
export async function transcribePending(userId: string, rows: any[], max = 6) {
  const pending = rows.filter(m => m.media_type === 'audio' && !m.transcript_status).sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()).slice(0, max)
  await Promise.all(pending.map(async m => {
    try { m.transcript = await transcribeMessage(userId, m.id); m.transcript_status = 'done' } catch { /* stays marked as not transcribed */ }
  }))
}
