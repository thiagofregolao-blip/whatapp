import crypto from 'crypto'
import pino from 'pino'
import { db } from '../../database/connection'
import { databaseAuth } from './baileys-auth'
import { saveMessage } from '../messages/messages.service'
import { UnipileWebhookEvent } from '../../types'

const logger = pino({ level: 'silent' })
const runtimes = new Map<string, any>()
const pending = new Map<string, Promise<any>>()
let stopping = false
const libPromise = () => import('@whiskeysockets/baileys')
export const isBaileys = () => (process.env.WHATSAPP_PROVIDER || 'baileys') === 'baileys'

export function normalizeIncoming(raw: any, account: string, lib: any): UnipileWebhookEvent | null {
  const jid = raw.key?.remoteJid
  if (!raw.key?.id || raw.key.fromMe || !jid || !/(@s\.whatsapp\.net|@g\.us|@lid)$/.test(jid)) return null
  // Do not persist view-once content or system/protocol events.
  if (raw.message?.viewOnceMessage || raw.message?.viewOnceMessageV2) return null
  const content = lib.normalizeMessageContent(raw.message)
  if (!content) return null
  const audio = content.audioMessage
  const text = content.conversation || content.extendedTextMessage?.text || content.imageMessage?.caption || content.videoMessage?.caption
  if (!text && !audio && !content.imageMessage && !content.videoMessage && !content.documentMessage) return null
  const timestamp = Number(raw.messageTimestamp)
  if (!Number.isFinite(timestamp)) return null
  return { event: 'message_received', account_id: account, provider: 'baileys', provider_payload: JSON.parse(JSON.stringify(raw, lib.BufferJSON.replacer)), data: {
    id: `baileys:${crypto.createHash('sha256').update(`${account}:${jid}:${raw.key.id}`).digest('hex')}`,
    chat_id: jid, is_group: jid.endsWith('@g.us'), from_me: false,
    sender: { id: raw.key.participant || jid, display_name: raw.pushName || undefined },
    text, timestamp, type: audio ? 'audio' : content.imageMessage ? 'image' : content.videoMessage ? 'video' : content.documentMessage ? 'document' : 'text',
    has_media: Boolean(audio || content.imageMessage || content.videoMessage || content.documentMessage),
    attachment_id: audio ? raw.key.id : undefined,
    mentions: content.extendedTextMessage?.contextInfo?.mentionedJid || audio?.contextInfo?.mentionedJid,
  } }
}
async function sessionFor(userId: string): Promise<any> {
  return (await db.query('SELECT * FROM whatsapp_sessions WHERE user_id=$1',[userId])).rows[0] || null
}
export async function status(userId: string) { return sessionFor(userId) }

async function startSocket(session: any, retries=0): Promise<any> {
  const lib = await libPromise()
  const auth = await databaseAuth(session.id, lib)
  await auth.saveCreds()
  if (stopping) return
  const runtime: any = { session, open: false, socket: null, serial: Promise.resolve(), stopped: false, retry: null }
  runtimes.set(session.user_id, runtime)
  const socket = lib.default({ auth: auth.state, logger, printQRInTerminal: false, markOnlineOnConnect: false, qrTimeout: 45000, syncFullHistory: false, shouldSyncHistoryMessage: () => false, connectTimeoutMs: 25000, defaultQueryTimeoutMs: 25000, generateHighQualityLinkPreview: false,
    getMessage: async () => undefined,
  })
  runtime.socket = socket
  const updateDB = async (state: string, error: string | null = null) => db.query('UPDATE whatsapp_sessions SET status=$2,error_message=$3,qr_code=NULL,qr_expires_at=NULL WHERE id=$1 AND unipile_account_id=$4', [session.id,state,error,session.unipile_account_id])
  socket.ev.on('creds.update', () => { runtime.serial = runtime.serial.then(() => runtime.stopped ? undefined : auth.saveCreds()).catch(() => fail('Falha ao salvar a sessão; reconecte o WhatsApp.')) })
  function fail(message: string) {
    runtime.stopped = true; runtime.open = false; clearTimeout(runtime.retry); socket.end(new Error('Session stopped'))
    updateDB('error',message).catch(() => console.error('[Baileys] Falha na persistência da sessão'))
  }
  socket.ev.on('connection.update', (update: any) => {
    runtime.serial = runtime.serial.then(async () => {
      if (runtime.stopped || stopping || runtimes.get(session.user_id) !== runtime) return
      if (update.qr) await db.query("UPDATE whatsapp_sessions SET status='connecting',qr_code=$2,qr_expires_at=NOW()+INTERVAL '40 seconds',error_message=NULL WHERE id=$1",[session.id,update.qr])
      if (update.connection === 'open') {
        runtime.open = true; retries = 0
        await db.query("UPDATE whatsapp_sessions SET status='connected',display_name=$2,phone_number_encrypted=$3,connected_at=NOW(),qr_code=NULL,qr_expires_at=NULL,error_message=NULL WHERE id=$1",[session.id,socket.user?.name || null,lib.jidNormalizedUser(socket.user?.id || '')])
        syncGroups(session.user_id).catch(() => console.warn('[Baileys] Grupos pendentes de sincronização'))
      }
      if (update.connection === 'close') {
        runtime.open = false
        const code = update.lastDisconnect?.error?.output?.statusCode
        const loggedOut = code === lib.DisconnectReason.loggedOut || code === lib.DisconnectReason.badSession || code === lib.DisconnectReason.connectionReplaced
        if (loggedOut || retries >= 5 || (!auth.state.creds.registered && code !== lib.DisconnectReason.restartRequired)) {
          runtime.stopped = true
          await updateDB('disconnected', loggedOut ? 'Sessão encerrada. Gere um novo QR Code.' : 'Conexão interrompida. Tente conectar novamente.')
          return
        }
        await updateDB('connecting')
        runtime.retry = setTimeout(() => {
          if (runtime.stopped || stopping) return
          startSocket(session, runtime.open ? 0 : retries+1).catch(() => fail('Não foi possível reconectar. Gere um novo QR Code.'))
        }, Math.min(1000 * 2**retries, 15000))
      }
    }).catch(() => fail('Erro na conexão. Tente conectar novamente.'))
  })
  socket.ev.on('messages.upsert', ({ messages, type }: any) => {
    if (type !== 'notify') return
    runtime.serial = runtime.serial.then(async () => {
      if (runtime.stopped || !runtime.open) return
      for (const raw of messages) {
        const event = normalizeIncoming(raw, session.unipile_account_id,lib)
        if (!event) continue
        if (event.data.is_group) {
          const group = await db.query('SELECT name FROM groups WHERE user_id=$1 AND whatsapp_chat_id=$2',[session.user_id,event.data.chat_id])
          event.data.chat_name = group.rows[0]?.name || event.data.chat_id
        } else event.data.chat_name = raw.pushName || event.data.chat_id
        await saveMessage(session.user_id,session.id,event)
      }
      await db.query('UPDATE whatsapp_sessions SET last_activity_at=NOW() WHERE id=$1',[session.id])
    }).catch(() => fail('Falha ao guardar mensagens. Verifique o banco e reconecte.'))
  })
  return runtime
}
export async function connect(userId: string) {
  if (pending.has(userId)) return pending.get(userId)
  const task = (async () => {
    let session = await sessionFor(userId)
    const running = runtimes.get(userId)
    if (running && !running.stopped && !(session.qr_code && new Date(session.qr_expires_at).getTime() <= Date.now())) return session
    if (running) { running.stopped=true; clearTimeout(running.retry); running.socket.end(new Error('New connection')); await running.serial }
    const result = await db.query(`INSERT INTO whatsapp_sessions(user_id,unipile_account_id,status,provider) VALUES($1,$2,'connecting','baileys')
      ON CONFLICT(user_id) DO UPDATE SET unipile_account_id=$2,provider='baileys',status='connecting',qr_code=NULL,qr_expires_at=NULL,error_message=NULL,display_name=NULL,phone_number_encrypted=NULL,connected_at=NULL RETURNING *`,[userId,`baileys:${crypto.randomUUID()}`])
    session = result.rows[0]
    await db.query('DELETE FROM whatsapp_auth WHERE session_id=$1',[session.id])
    try { await startSocket(session) } catch {
      await db.query("UPDATE whatsapp_sessions SET status='error',error_message='Falha ao iniciar Baileys. Tente novamente.' WHERE id=$1",[session.id])
      throw new Error('Falha ao iniciar Baileys. Tente novamente.')
    }
    return session
  })()
  pending.set(userId,task)
  try { return await task } finally { pending.delete(userId) }
}
export async function disconnect(userId: string) {
  const runtime = runtimes.get(userId)
  if (runtime) {
    runtime.stopped = true; runtime.open = false; clearTimeout(runtime.retry)
    try { await runtime.socket.logout() } catch { /* Clear local access even when offline. */ } finally { runtime.socket.end(new Error('User disconnected')); runtimes.delete(userId) }
    await runtime.serial
  }
  const session = await sessionFor(userId)
  if (!session || session.provider !== 'baileys') return
  await db.query('DELETE FROM whatsapp_auth WHERE session_id=$1',[session.id])
  await db.query("UPDATE whatsapp_sessions SET status='disconnected',qr_code=NULL,qr_expires_at=NULL,disconnected_at=NOW() WHERE id=$1",[session.id])
}
export async function syncGroups(userId: string) {
  const r = runtimes.get(userId)
  if (!r?.open) throw new Error('WhatsApp não conectado')
  const groups: any = await r.socket.groupFetchAllParticipating()
  for (const group of Object.values(groups) as any[]) await db.query(`INSERT INTO groups(user_id,session_id,whatsapp_chat_id,name,participant_count,synced_at) VALUES($1,$2,$3,$4,$5,NOW())
    ON CONFLICT(user_id,whatsapp_chat_id) DO UPDATE SET name=$4,participant_count=$5,session_id=$2,synced_at=NOW()`,[userId,r.session.id,group.id,group.subject,group.participants?.length || 0])
}
export function assertLiveAccount(draft: any, runtime: any) {
  if (!runtime?.open || runtime.stopped || runtime.session.unipile_account_id !== draft.account_id || runtime.session.user_id !== draft.user_id || runtime.session.id !== draft.session_id) throw new Error('A conta conectada mudou ou está offline')
  if (!/(@s\.whatsapp\.net|@g\.us|@lid)$/.test(draft.chat_id)) throw new Error('Destinatário inválido')
}
export async function sendAuthorized(draft: any) {
  const runtime = runtimes.get(draft.user_id)
  assertLiveAccount(draft,runtime)
  // Called exclusively after the database has claimed explicit authorization.
  const sent = await runtime.socket.sendMessage(draft.chat_id,{text:draft.content})
  if (!sent?.key?.id) throw new Error('Envio não confirmado')
  return { message_id: sent.key.id }
}
export async function audioOriginal(message: any) {
  const r = runtimes.get(message.user_id)
  if (!r?.open || r.session.unipile_account_id !== message.source_account_id) throw new Error('Reconecte a conta original para ouvir este áudio')
  const lib = await libPromise()
  const raw = JSON.parse(JSON.stringify(message.provider_payload),lib.BufferJSON.reviver)
  const content = lib.normalizeMessageContent(raw.message)
  if (!content?.audioMessage) throw new Error('Áudio indisponível')
  const stream = await lib.downloadMediaMessage(raw,'stream',{}, { logger, reuploadRequest:r.socket.updateMediaMessage })
  const chunks: Buffer[] = []; let length = 0
  for await (const chunk of stream) { length += chunk.length; if (length > 25*1024*1024) { stream.destroy(); throw new Error('Áudio excede 25 MB') }; chunks.push(chunk) }
  return { bytes:Buffer.concat(chunks), type:content.audioMessage.mimetype || 'audio/ogg' }
}
export async function restore() {
  // One backend owns all local sockets; a second instance must not fight for the session.
  const owner = await db.getClient()
  const lock = await owner.query("SELECT pg_try_advisory_lock(734920105) AS acquired")
  if (!lock.rows[0].acquired) { owner.release(); throw new Error('Outro backend já controla as conexões Baileys neste banco') }
  owner.on('error', () => { shutdown(); process.exit(1) })
  const sessions = await db.query("SELECT * FROM whatsapp_sessions WHERE provider='baileys' AND status IN ('connected','connecting')")
  for (const s of sessions.rows) {
    await db.query("UPDATE whatsapp_sessions SET status='connecting',qr_code=NULL,qr_expires_at=NULL WHERE id=$1",[s.id])
    try { await startSocket(s) } catch { await db.query("UPDATE whatsapp_sessions SET status='error',error_message='Falha ao restaurar sessão. Conecte novamente.' WHERE id=$1",[s.id]) }
  }
}
export function shutdown() { stopping = true; for (const r of runtimes.values()) { r.stopped=true; clearTimeout(r.retry); r.socket.end(new Error('Server shutdown')) } }
