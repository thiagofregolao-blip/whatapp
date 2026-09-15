import { db } from '../../database/connection'
import { WhatsappSession, ConnectWhatsappResponse, Group } from '../../types'

const UNIPILE_BASE_URL = process.env.UNIPILE_BASE_URL!
const UNIPILE_API_KEY = process.env.UNIPILE_API_KEY!

const unipileHeaders = {
  'X-API-KEY': UNIPILE_API_KEY,
  'Content-Type': 'application/json',
}

// ============================================
// Iniciar conexão — gera QR Code
// ============================================
export const initiateConnection = async (userId: string): Promise<ConnectWhatsappResponse> => {
  if (!UNIPILE_BASE_URL || !UNIPILE_API_KEY) throw new Error('Configure UNIPILE_BASE_URL e UNIPILE_API_KEY no backend')
  // Verificar se já tem sessão ativa
  const existing = await db.query(
    `SELECT * FROM whatsapp_sessions
     WHERE user_id = $1 AND status IN ('connected', 'connecting')`,
    [userId]
  )

  if (existing.rows.length > 0) {
    const session = existing.rows[0] as WhatsappSession
    if (session.status === 'connected') {
      throw new Error('WhatsApp já está conectado')
    }
    // Retorna QR existente se ainda válido
    if (session.qr_code && session.qr_expires_at && new Date(session.qr_expires_at) > new Date()) {
      return {
        session_id: session.id,
        qr_code: session.qr_code,
        qr_expires_at: session.qr_expires_at.toISOString(),
      }
    }
  }

  // Criar nova conta no Unipile
  const response = await fetch(`${UNIPILE_BASE_URL}/api/v1/accounts`, {
    method: 'POST',
    headers: unipileHeaders,
    body: JSON.stringify({
      provider: 'WHATSAPP',

    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Erro Unipile: ${err}`)
  }

  const data = await response.json() as {
    object: string
    account_id: string
    checkpoint?: { qrcode?: string | { data: string } }
    qrCodeString?: string
  }

  const challenge = data.checkpoint?.qrcode
  const qrCode = typeof challenge === 'string' ? challenge : challenge?.data || data.qrCodeString
  if (!qrCode) {
    throw new Error('QR Code não retornado pelo Unipile')
  }

  const qrExpires = new Date(Date.now() + 60 * 1000) // 60 segundos

  // Salvar ou atualizar sessão no banco
  const upsertResult = await db.query(
    `INSERT INTO whatsapp_sessions
       (user_id, unipile_account_id, status, qr_code, qr_expires_at)
     VALUES ($1, $2, 'connecting', $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       unipile_account_id = $2,
       status = 'connecting',
       qr_code = $3,
       qr_expires_at = $4,
       updated_at = NOW()
     RETURNING id`,
    [userId, data.account_id, qrCode, qrExpires]
  )

  return {
    session_id: upsertResult.rows[0].id,
    qr_code: qrCode,
    qr_expires_at: qrExpires.toISOString(),
  }
}

// ============================================
// Buscar status da sessão
// ============================================
export const getSessionStatus = async (userId: string): Promise<WhatsappSession | null> => {
  const result = await db.query(
    'SELECT * FROM whatsapp_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  )
  return result.rows[0] || null
}

// ============================================
// Callback do Unipile quando QR é escaneado
// (chamado pelo webhook do Unipile)
// ============================================
export const handleAccountConnected = async (
  unipileAccountId: string,
  phoneNumber?: string,
  displayName?: string
): Promise<void> => {
  await db.query(
    `UPDATE whatsapp_sessions SET
       status = 'connected',
       phone_number_encrypted = COALESCE($2, phone_number_encrypted),
       display_name = COALESCE($3, display_name),
       connected_at = COALESCE(connected_at, NOW()),
       qr_code = NULL,
       qr_expires_at = NULL,
       error_message = NULL,
       updated_at = NOW()
     WHERE unipile_account_id = $1`,
    [unipileAccountId, phoneNumber || null, displayName || null]
  )

  // Sincronizar grupos após conexão
  const session = await db.query(
    'SELECT * FROM whatsapp_sessions WHERE unipile_account_id = $1',
    [unipileAccountId]
  )

  if (session.rows.length > 0) {
    await syncGroups(session.rows[0].user_id, unipileAccountId)
  }
}

// ============================================
// Sincronizar grupos do WhatsApp
// ============================================
export const syncGroups = async (userId: string, unipileAccountId: string): Promise<void> => {
  try {
    const response = await fetch(
      `${UNIPILE_BASE_URL}/api/v1/chats?account_id=${unipileAccountId}&limit=100`,
      { headers: unipileHeaders }
    )

    if (!response.ok) throw new Error('Não foi possível sincronizar as conversas')

    const data = await response.json() as {
      items: Array<{
        id: string
        name?: string
        is_group: boolean
        attendees_count?: number
        last_message_at?: string
      }>
    }

    const session = await db.query(
      'SELECT id FROM whatsapp_sessions WHERE user_id = $1 AND unipile_account_id = $2',
      [userId, unipileAccountId]
    )

    if (session.rows.length === 0) return
    const sessionId = session.rows[0].id

    for (const chat of data.items) {
      if (!chat.is_group) continue

      await db.query(
        `INSERT INTO groups
           (user_id, session_id, whatsapp_chat_id, name, participant_count, last_message_at, synced_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT (user_id, whatsapp_chat_id) DO UPDATE SET
           name = $4,
           participant_count = $5,
           last_message_at = $6,
           synced_at = NOW(),
           updated_at = NOW()`,
        [
          userId,
          sessionId,
          chat.id,
          chat.name || 'Grupo sem nome',
          chat.attendees_count || 0,
          chat.last_message_at ? new Date(chat.last_message_at) : null,
        ]
      )
    }

    console.log(`[Unipile] Sincronizados ${data.items.filter(c => c.is_group).length} grupos para usuário ${userId}`)
  } catch (err) {
    throw err
  }
}

// ============================================
// Listar grupos do usuário
// ============================================
export const listGroups = async (userId: string): Promise<Group[]> => {
  const result = await db.query(
    `SELECT * FROM groups
     WHERE user_id = $1
     ORDER BY last_message_at DESC NULLS LAST`,
    [userId]
  )
  return result.rows
}

// ============================================
// Configurar monitoramento de grupo
// ============================================
export const updateGroupConfig = async (
  userId: string,
  groupId: string,
  config: { is_monitored?: boolean; is_excluded?: boolean }
): Promise<void> => {
  const fields: string[] = []
  const values: unknown[] = []
  let i = 1

  if (config.is_monitored !== undefined) {
    fields.push(`is_monitored = $${i++}`)
    values.push(config.is_monitored)
  }
  if (config.is_excluded !== undefined) {
    fields.push(`is_excluded = $${i++}`)
    values.push(config.is_excluded)
    if (config.is_excluded) {
      fields.push(`is_monitored = false`)
    }
  }

  if (fields.length === 0) return

  values.push(userId, groupId)
  await db.query(
    `UPDATE groups SET ${fields.join(', ')} WHERE user_id = $${i} AND id = $${i + 1}`,
    values
  )
}

// ============================================
// Desconectar WhatsApp
// ============================================
export const disconnect = async (userId: string): Promise<void> => {
  const session = await db.query(
    'SELECT * FROM whatsapp_sessions WHERE user_id = $1 AND status = $2',
    [userId, 'connected']
  )

  if (session.rows.length === 0) {
    throw new Error('Nenhuma sessão ativa encontrada')
  }

  const { unipile_account_id } = session.rows[0]

  // Desconectar no Unipile
  try {
    await fetch(`${UNIPILE_BASE_URL}/api/v1/accounts/${unipile_account_id}`, {
      method: 'DELETE',
      headers: unipileHeaders,
    })
  } catch (err) {
    console.error('[Unipile] Erro ao desconectar:', err)
  }

  await db.query(
    `UPDATE whatsapp_sessions SET
       status = 'disconnected',
       disconnected_at = COALESCE(connected_at, NOW()),
       updated_at = NOW()
     WHERE user_id = $1`,
    [userId]
  )
}
