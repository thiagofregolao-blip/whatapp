import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { askLuna, createVoiceCall, textModel, voiceModel } from './openai'
import { db } from '../../database/connection'
import { authenticate } from '../../middleware/auth'
import { audioOriginal } from '../whatsapp/baileys.service'
import { createDraft, sendDraft } from './replies'

export const assistantRouter = Router()
export const messagesRouter = Router()
const route = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => { Promise.resolve(fn(req, res)).catch(next) }
assistantRouter.use(authenticate)
messagesRouter.use(authenticate)
const visible = '(expires_at IS NULL OR expires_at > NOW())'

messagesRouter.get('/', route(async (req, res) => {
  const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0), group_id: z.string().uuid().optional(), min_urgency: z.coerce.number().int().min(1).max(5).default(1), only_mentions: z.enum(['true','false']).optional() }).parse(req.query)
  const result = await db.query(`SELECT id, chat_id, chat_name, chat_type, sender_name, content, media_type, has_media, urgency_score, sent_at, is_mention FROM messages WHERE user_id=$1 AND ${visible}
    AND ($2::uuid IS NULL OR group_id=$2) AND urgency_score >= $3 AND ($4=false OR is_mention=true) ORDER BY sent_at DESC LIMIT $5 OFFSET $6`, [req.user!.id, q.group_id || null, q.min_urgency, q.only_mentions === 'true', q.limit, q.offset])
  res.json({ success: true, data: result.rows })
}))

messagesRouter.get('/:id/audio', route(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id)
  const found = await db.query(`SELECT m.*, ws.unipile_account_id FROM messages m JOIN whatsapp_sessions ws ON ws.id=m.session_id WHERE m.id=$1 AND m.user_id=$2 AND m.media_type='audio' AND (m.expires_at IS NULL OR m.expires_at > NOW()) AND ws.status='connected'`, [id, req.user!.id])
  const m = found.rows[0]
  if (m?.provider === 'baileys') {
    try {
      const audio = await audioOriginal(m)
      res.setHeader('Content-Type',audio.type)
      res.setHeader('Cache-Control','no-store')
      return res.send(audio.bytes)
    } catch (e: any) { return res.status(502).json({error:e.message}) }
  }
  if (!m?.attachment_id || !m.unipile_message_id) return res.status(404).json({ error: 'Áudio original indisponível no provedor' })
  if (!process.env.UNIPILE_API_KEY || !process.env.UNIPILE_BASE_URL) return res.status(503).json({ error: 'Unipile não configurado' })
  const upstream = await fetch(`${process.env.UNIPILE_BASE_URL}/api/v1/messages/${encodeURIComponent(m.unipile_message_id)}/attachments/${encodeURIComponent(m.attachment_id)}?account_id=${encodeURIComponent(m.unipile_account_id)}`, { headers: { 'X-API-KEY': process.env.UNIPILE_API_KEY }, signal: AbortSignal.timeout(30000), redirect: 'error' })
  if (!upstream.ok) return res.status(502).json({ error: 'O provedor não disponibilizou este áudio' })
  const type = upstream.headers.get('content-type') || ''
  if (!type.startsWith('audio/') && !type.startsWith('application/octet-stream')) return res.status(502).json({ error: 'Formato de áudio inesperado' })
  // Bound memory even when the provider omits Content-Length.
  const chunks: Uint8Array[] = []; let size = 0
  for await (const chunk of upstream.body as any) {
    size += chunk.length
    if (size > 25 * 1024 * 1024) throw new Error('Áudio excede 25 MB')
    chunks.push(chunk)
  }
  res.setHeader('Content-Type', type)
  res.setHeader('Cache-Control', 'no-store')
  res.send(Buffer.concat(chunks))
}))

assistantRouter.get('/status', route(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.json({ success: true, data: { configured: Boolean(process.env.OPENAI_API_KEY), model: textModel(), voice_model: voiceModel() } })
}))
const aiLimit = rateLimit({ windowMs: 60000, max: 20, keyGenerator: req => req.user!.id, standardHeaders: true, legacyHeaders: false, message: { error: 'Aguarde um minuto antes de fazer mais consultas à IA.' } })
assistantRouter.use(['/chat', '/realtime', '/suggest'], aiLimit)
assistantRouter.post('/realtime', route(async (req, res) => {
  const { sdp } = z.object({ sdp: z.string().min(10).max(100000).startsWith('v=0') }).strict().parse(req.body)
  res.setHeader('Cache-Control', 'no-store')
  res.json({ success: true, data: { sdp: await createVoiceCall(sdp) } })
}))

assistantRouter.post('/chat', route(async (req, res) => {
  const input = z.object({ question: z.string().trim().min(1).max(4000), message_id: z.string().uuid().optional(), history: z.array(z.object({ role: z.enum(['user','assistant']), content: z.string().max(6000) })).max(12).default([]) }).parse(req.body)
  const found = await db.query(`SELECT id, chat_id, chat_name, sender_name, content, media_type, urgency_score, sent_at FROM messages WHERE user_id=$1 AND ${visible} AND sent_at > NOW() - INTERVAL '7 days' AND ($2::uuid IS NULL OR id=$2) ORDER BY sent_at DESC LIMIT 80`, [req.user!.id, input.message_id || null])
  const rows = found.rows.map(m => ({ ...m, content: m.content?.slice(0, 2000) }))
  const answer = await askLuna(input.question, rows, input.history)
  res.json({ success: true, data: { answer, sources: rows.map(m => ({ id: m.id, chat_name: m.chat_name, sent_at: m.sent_at })) } })
}))
assistantRouter.post('/suggest', route(async (req, res) => {
  const input = z.object({ message_id: z.string().uuid(), instruction: z.string().trim().max(4000).default('Sugira uma resposta curta e apropriada.') }).strict().parse(req.body)
  const found = await db.query(`SELECT id, chat_id, chat_name, sender_name, content, media_type, sent_at FROM messages WHERE id=$1 AND user_id=$2 AND ${visible}`, [input.message_id, req.user!.id])
  if (!found.rows.length) return res.status(404).json({ error: 'Mensagem indisponível' })
  const content = z.string().trim().min(1).max(4000).parse(await askLuna(input.instruction, found.rows, [], 'reply'))
  res.json({ success: true, data: await createDraft(req.user!.id, input.message_id, content) })
}))
assistantRouter.post('/drafts', route(async (req, res) => {
  const input = z.object({ message_id: z.string().uuid(), content: z.string().trim().min(1).max(4000) }).strict().parse(req.body)
  res.json({ success: true, data: await createDraft(req.user!.id, input.message_id, input.content) })
}))
assistantRouter.post('/drafts/:id/send', route(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id)
  const input = z.object({ authorize: z.literal(true), confirmation_token: z.string().length(64), chat_id: z.string().min(1), content: z.string().min(1).max(4000) }).strict().parse(req.body)
  res.json({ success: true, data: await sendDraft(req.user!.id, id, input) })
}))
assistantRouter.use((err: Error, _req: Request, res: Response, _next: NextFunction) => res.status(400).json({ success: false, error: err instanceof z.ZodError ? 'Dados inválidos; revise sua solicitação' : err.message }))
