import { recordDiagnostic } from '../assistant/diagnostics'
import { rememberContacts, directory } from './contacts'
import crypto from 'crypto'
import pino from 'pino'
import { db } from '../../database/connection'
import { databaseAuth } from './baileys-auth'
import { saveMessage } from '../messages/messages.service'
import { transcribeMessage } from '../assistant/transcription'
import { UnipileWebhookEvent } from '../../types'

const logger = pino({ level: 'silent' })
const runtimes = new Map<string, any>()
const pending = new Map<string, Promise<any>>()
let stopping = false
let ownershipRetry: ReturnType<typeof setTimeout> | undefined
const libPromise = () => import('@whiskeysockets/baileys')
export const isBaileys = () => (process.env.WHATSAPP_PROVIDER || 'baileys') === 'baileys'

export function normalizeIncoming(raw: any, account: string, lib: any, includeOutgoing = false): UnipileWebhookEvent | null {
  const jid = raw.key?.remoteJid
  if (!raw.key?.id || (raw.key.fromMe && !includeOutgoing) || !jid || !/(@s\.whatsapp\.net|@g\.us|@lid)$/.test(jid)) return null
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
    chat_id: jid, is_group: jid.endsWith('@g.us'), from_me: Boolean(raw.key.fromMe),
    sender: { id: raw.key.participant || jid, display_name: raw.pushName || undefined },
    text, timestamp, type: audio ? 'audio' : content.imageMessage ? 'image' : content.videoMessage ? 'video' : content.documentMessage ? 'document' : 'text',
    has_media: Boolean(audio || content.imageMessage || content.videoMessage || content.documentMessage),
    attachment_id: audio ? raw.key.id : undefined,
    mentions: content.extendedTextMessage?.contextInfo?.mentionedJid || audio?.contextInfo?.mentionedJid,
  } }
}
// Technical reason only (never content), to diagnose messages that are not stored.
export function skipReason(raw: any, lib: any, includeOutgoing = true) {
  const jid = String(raw.key?.remoteJid || '')
  if (!raw.key?.id) return 'no_key'
  if (raw.key.fromMe && !includeOutgoing) return 'from_me'
  if (!/(@s\.whatsapp\.net|@g\.us|@lid)$/.test(jid)) return `jid_${jid.split('@')[1] || 'none'}`
  if (!raw.message) return `no_message_stub_${raw.messageStubType ?? 'none'}`
  if (raw.message.viewOnceMessage || raw.message.viewOnceMessageV2) return 'view_once'
  const content = lib.normalizeMessageContent(raw.message)
  return `type_${Object.keys(content || {}).filter(k => k !== 'messageContextInfo')[0] || 'empty'}`
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
  const socket = lib.default({ auth: auth.state, logger, printQRInTerminal: false, markOnlineOnConnect: false, qrTimeout: 45000, syncFullHistory: true, shouldSyncHistoryMessage: () => true, browser: lib.Browsers.macOS('Chrome'), connectTimeoutMs: 25000, defaultQueryTimeoutMs: 25000, generateHighQualityLinkPreview: false,
    getMessage: async () => undefined,
  })
  runtime.socket = socket
  const updateDB = async (state: string, error: string | null = null) => db.query('UPDATE whatsapp_sessions SET status=$2,error_message=$3,qr_code=NULL,qr_expires_at=NULL WHERE id=$1 AND unipile_account_id=$4', [session.id,state,error,session.unipile_account_id])
  socket.ev.on('creds.update', () => { runtime.serial = runtime.serial.then(() => runtime.stopped ? undefined : auth.saveCreds()).catch(() => fail('Falha ao salvar a sessão; reconecte o WhatsApp.')) })
  function fail(message: string) {
    void recordDiagnostic(session.user_id,'whatsapp.connection_failed').catch(()=>{})
    runtime.stopped = true; runtime.open = false; clearTimeout(runtime.retry); socket.end(new Error('Session stopped'))
    updateDB('error',message).catch(() => console.error('[Baileys] Falha na persistência da sessão'))
  }
  socket.ev.on('connection.update', (update: any) => {
    runtime.serial = runtime.serial.then(async () => {
      if (runtime.stopped || stopping || runtimes.get(session.user_id) !== runtime) return
      if (update.qr) void recordDiagnostic(session.user_id,'whatsapp.qr_ready').catch(()=>{})
      if (update.qr) await db.query("UPDATE whatsapp_sessions SET status='connecting',qr_code=$2,qr_expires_at=NOW()+INTERVAL '40 seconds',error_message=NULL WHERE id=$1",[session.id,update.qr])
      if (update.connection === 'open') {
        runtime.open = true; retries = 0
        console.info('[Baileys] Conexão aberta')
        void recordDiagnostic(session.user_id,'whatsapp.connected').catch(()=>{})
        await db.query("UPDATE whatsapp_sessions SET status='connected',display_name=$2,phone_number_encrypted=$3,connected_at=NOW(),qr_code=NULL,qr_expires_at=NULL,error_message=NULL WHERE id=$1",[session.id,socket.user?.name || null,lib.jidNormalizedUser(socket.user?.id || '')])
        if (!session.history_received_at && !session.history_requested_at) void requestHistory(session.user_id).catch(() => {})
        syncGroups(session.user_id).catch(() => console.warn('[Baileys] Grupos pendentes de sincronização'))
      }
      if (update.connection === 'close') {
        runtime.open = false
        const code = update.lastDisconnect?.error?.output?.statusCode
        void recordDiagnostic(session.user_id,'whatsapp.closed',String(code || 'unknown')).catch(()=>{})
        console.info('[Baileys] Conexão fechada', { code, retries })
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
  async function rememberChats(chats: any[]) {
    for (const chat of chats) {
      if (!chat.id || !/(@s\.whatsapp\.net|@g\.us|@lid)$/.test(chat.id)) continue
      const timestamp = Number(chat.conversationTimestamp || 0)
      await db.query(`INSERT INTO whatsapp_chats(user_id,account_id,chat_id,name,last_message_at) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(user_id,account_id,chat_id) DO UPDATE SET name=COALESCE(EXCLUDED.name,whatsapp_chats.name),last_message_at=GREATEST(whatsapp_chats.last_message_at,EXCLUDED.last_message_at)`, [session.user_id,session.unipile_account_id,chat.id,chat.name || chat.subject || chat.notify || null,timestamp ? new Date(timestamp*1000) : null])
    }
  }
  async function ingest(messages: any[], type: string) {
    let accepted = 0, stored = 0
    const skipped: Record<string, number> = {}
    for (const raw of messages) {
      if (runtime.stopped || stopping) return
      const response=lib.normalizeMessageContent(raw.message)?.protocolMessage?.peerDataOperationRequestResponseMessage
      for(const result of response?.peerDataOperationResult || []) {
        const full=result.fullHistorySyncOnDemandRequestResponse
        if(full && full.responseCode !== undefined && Number(full.responseCode)!==0) {
          console.info('[Baileys] Histórico não autorizado pelo aparelho',{code:Number(full.responseCode)})
          await db.query("UPDATE whatsapp_sessions SET history_error='O WhatsApp não liberou o histórico desta sessão. Conecte novamente pelo QR para solicitar a importação inicial.' WHERE id=$1",[session.id])
        }
      }
      const event = normalizeIncoming(raw, session.unipile_account_id, lib, true)
      if (!event) { const reason = skipReason(raw, lib); skipped[reason] = (skipped[reason] || 0) + 1; continue }
      accepted++
      const known = await db.query('SELECT COALESCE(name,notify) AS name FROM whatsapp_contacts WHERE user_id=$1 AND account_id=$2 AND (chat_id=$3 OR $3=ANY(aliases)) AND COALESCE(name,notify) IS NOT NULL UNION ALL SELECT name FROM whatsapp_chats WHERE user_id=$1 AND account_id=$2 AND chat_id=$3 LIMIT 1', [session.user_id,session.unipile_account_id,event.data.chat_id])
      if (event.data.is_group) {
        const group = await db.query('SELECT name FROM groups WHERE user_id=$1 AND whatsapp_chat_id=$2',[session.user_id,event.data.chat_id])
        event.data.chat_name = known.rows[0]?.name || group.rows[0]?.name || event.data.chat_id
      } else event.data.chat_name = known.rows[0]?.name || (!raw.key.fromMe && raw.pushName) || event.data.chat_id
      await rememberChats([{id:event.data.chat_id,name:event.data.chat_name,conversationTimestamp:event.data.timestamp}])
      const saved = await saveMessage(session.user_id,session.id,event,{includeOutgoing:true})
      if (!saved) continue
      stored++
      // New incoming audio only: bulk history is transcribed on demand to spare the user's quota.
      if (type === 'notify' && saved.media_type === 'audio' && !event.data.from_me) void transcribeMessage(session.user_id,saved.id).catch(() => {})
    }
    await db.query('UPDATE whatsapp_sessions SET last_activity_at=NOW() WHERE id=$1',[session.id])
    console.info('[Baileys] Recebimento', { type, received: messages.length, accepted, stored, skipped: Object.keys(skipped).length ? skipped : undefined })
  }
  function queue(task: () => Promise<void>) {
    runtime.serial = runtime.serial.then(async () => {
      if (runtime.stopped || stopping || runtimes.get(session.user_id) !== runtime) return
      await task()
    }).catch(() => console.error('[Baileys] Falha ao persistir lote de sincronização'))
  }
  socket.ev.on('messaging-history.set', ({chats, contacts, messages, progress}: any) => queue(async () => {
    await rememberChats(chats || [])
    await rememberContacts(session.user_id,session.unipile_account_id,contacts || [])
    await ingest(messages || [], 'history')
    await db.query('UPDATE whatsapp_sessions SET history_received_at=NOW(),history_progress=$2,history_error=NULL WHERE id=$1',[session.id,Number.isFinite(progress) ? Math.min(100,Math.max(0,progress)) : null])
    console.info('[Baileys] Histórico sincronizado', { chats:chats?.length || 0, messages:messages?.length || 0, progress })
  }))
  socket.ev.on('contacts.upsert', (contacts: any[]) => queue(() => rememberContacts(session.user_id,session.unipile_account_id,contacts)))
  socket.ev.on('contacts.update', (contacts: any[]) => queue(() => rememberContacts(session.user_id,session.unipile_account_id,contacts)))
  socket.ev.on('chats.upsert', (chats: any[]) => queue(() => rememberChats(chats)))
  socket.ev.on('chats.update', (chats: any[]) => queue(() => rememberChats(chats)))
  socket.ev.on('messages.upsert', ({ messages, type }: any) => {
    if (type === 'notify' || type === 'append') queue(() => ingest(messages,type))
  })
  return runtime
}
export async function connect(userId: string) {
  if (pending.has(userId)) return pending.get(userId)
  const task = (async () => {
    let session = await sessionFor(userId)
    const running = runtimes.get(userId)
    if (running && !running.stopped && session.status !== 'disconnected' && session.status !== 'error' && !(session.qr_code && new Date(session.qr_expires_at).getTime() <= Date.now())) return session
    if (running) { running.stopped=true; clearTimeout(running.retry); running.socket.end(new Error('New connection')); await running.serial }
    const result = await db.query(`INSERT INTO whatsapp_sessions(user_id,unipile_account_id,status,provider) VALUES($1,$2,'connecting','baileys')
      ON CONFLICT(user_id) DO UPDATE SET unipile_account_id=$2,provider='baileys',status='connecting',qr_code=NULL,qr_expires_at=NULL,error_message=NULL,display_name=NULL,phone_number_encrypted=NULL,connected_at=NULL,history_requested_at=NULL,history_received_at=NULL,history_progress=NULL,history_error=NULL RETURNING *`,[userId,`baileys:${crypto.randomUUID()}`])
    session = result.rows[0]
    await db.query('DELETE FROM whatsapp_auth WHERE session_id=$1',[session.id])
    try { await startSocket(session) } catch (error: any) {
      void recordDiagnostic(userId,'whatsapp.start_failed',String(error.code || error.name || 'unknown')).catch(()=>{})
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
  for (const group of Object.values(groups) as any[]) {
    await db.query(`INSERT INTO groups(user_id,session_id,whatsapp_chat_id,name,participant_count,synced_at) VALUES($1,$2,$3,$4,$5,NOW())
    ON CONFLICT(user_id,whatsapp_chat_id) DO UPDATE SET name=$4,participant_count=$5,session_id=$2,synced_at=NOW()`,[userId,r.session.id,group.id,group.subject,group.participants?.length || 0])
    await db.query(`INSERT INTO whatsapp_chats(user_id,account_id,chat_id,name) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,account_id,chat_id) DO UPDATE SET name=$4`,[userId,r.session.unipile_account_id,group.id,group.subject])
  }
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
  if (!lock.rows[0].acquired) {
    owner.release()
    // Let the new deployment pass HTTP health checks before the old owner shuts down.
    // No WhatsApp socket is opened until this process exclusively owns the lock.
    if (!stopping) ownershipRetry = setTimeout(() => {
      if (!stopping) restore().catch(() => { console.error('[Baileys] Falha ao assumir sessões'); process.exit(1) })
    }, 2000)
    return
  }
  owner.on('error', () => { shutdown(); process.exit(1) })
  const sessions = await db.query("SELECT * FROM whatsapp_sessions WHERE provider='baileys' AND status IN ('connected','connecting')")
  for (const s of sessions.rows) {
    await db.query("UPDATE whatsapp_sessions SET status='connecting',qr_code=NULL,qr_expires_at=NULL WHERE id=$1",[s.id])
    try { await startSocket(s) } catch { await db.query("UPDATE whatsapp_sessions SET status='error',error_message='Falha ao restaurar sessão. Conecte novamente.' WHERE id=$1",[s.id]) }
  }
}
export function shutdown() { stopping = true; clearTimeout(ownershipRetry); for (const r of runtimes.values()) { r.stopped=true; clearTimeout(r.retry); r.socket.end(new Error('Server shutdown')) } }

export async function requestHistory(userId: string) {
  const r = runtimes.get(userId)
  if (!r?.open) throw new Error('WhatsApp não conectado')
  const claimed = await db.query(`UPDATE whatsapp_sessions SET history_requested_at=NOW(),history_error=NULL WHERE id=$1 AND (history_requested_at IS NULL OR history_requested_at<NOW()-INTERVAL '5 minutes') RETURNING id`,[r.session.id])
  if (!claimed.rows.length) return { status:'requested', message:'O pedido já foi feito. Aguarde o WhatsApp enviar o histórico.' }
  try {
    const lib = await libPromise()
    await r.socket.sendPeerDataOperationMessage({
      peerDataOperationRequestType: lib.proto.Message.PeerDataOperationRequestType.FULL_HISTORY_SYNC_ON_DEMAND,
      fullHistorySyncOnDemandRequest: { requestMetadata:{requestId:crypto.randomUUID()},historySyncConfig:{storageQuotaMb:10240,supportGroupHistory:true,onDemandReady:true,completeOnDemandReady:true} }
    })
    // Existing conversations can also request earlier messages using a real provider anchor.
    const anchors=(await db.query(`SELECT DISTINCT ON(chat_id) provider_payload->'key' AS key,sent_at FROM messages WHERE user_id=$1 AND session_id=$2 AND source_account_id=$3 AND provider_payload->'key'->>'id' IS NOT NULL ORDER BY chat_id,sent_at ASC LIMIT 50`,[userId,r.session.id,r.session.unipile_account_id])).rows
    let requested=0
    for(const anchor of anchors) { if(!r.open || r.stopped || stopping) break; try {await r.socket.fetchMessageHistory(50,anchor.key,new Date(anchor.sent_at).getTime());requested++}catch{break} }
    console.info('[Baileys] Histórico solicitado ao aparelho',{conversations:requested})
    return { status:'requested', message:'Histórico solicitado. Mantenha o WhatsApp do celular conectado à internet.' }
  } catch {
    await db.query("UPDATE whatsapp_sessions SET history_error='Não foi possível solicitar o histórico. Tente novamente.' WHERE id=$1",[r.session.id])
    throw new Error('Não foi possível solicitar o histórico. Tente novamente.')
  }
}
const photoRequests = new Map<string,Promise<string | null>>()
export async function contactPhoto(userId: string, chatId: string): Promise<string | null> {
  const r = runtimes.get(userId)
  if (!r?.open) return null
  if (chatId === 'self') chatId = r.socket.user?.id?.replace(/:\d+@/,'@') || ''
  else if (!(await directory(userId)).some(c => c.chat_id === chatId || c.aliases?.includes(chatId))) throw new Error('Contato indisponível')
  if (!/(@s\.whatsapp\.net|@g\.us|@lid)$/.test(chatId)) return null
  const account=r.session.unipile_account_id
  const cached=(await db.query('SELECT photo_url,photo_checked_at FROM whatsapp_contacts WHERE user_id=$1 AND account_id=$2 AND chat_id=$3',[userId,account,chatId])).rows[0]
  if (cached?.photo_checked_at && Date.now()-new Date(cached.photo_checked_at).getTime()<3600000) return cached.photo_url
  const key=`${userId}:${account}:${chatId}`
  if (photoRequests.has(key)) return photoRequests.get(key)!
  const work=(async () => {
    let url: string | null=null
    try { const value=await r.socket.profilePictureUrl(chatId,'image',5000); if (value && /^https:\/\//.test(value)) url=value } catch { /* Privacy settings or missing picture. */ }
    await db.query(`INSERT INTO whatsapp_contacts(user_id,account_id,chat_id,photo_url,photo_checked_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(user_id,account_id,chat_id) DO UPDATE SET photo_url=$4,photo_checked_at=NOW()`,[userId,account,chatId,url])
    return url
  })().finally(() => photoRequests.delete(key))
  photoRequests.set(key,work);return work
}
