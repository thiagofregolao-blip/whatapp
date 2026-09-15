import { db } from '../../database/connection'
import { Message, UnipileWebhookEvent } from '../../types'


// ============================================
// saveMessage — persiste mensagem do webhook
// ============================================
export const saveMessage = async (
  userId: string,
  sessionId: string,
  event: UnipileWebhookEvent
): Promise<Message | null> => {
  const { data } = event

  // Ignorar mensagens enviadas pelo próprio usuário
  if (data.from_me) return null

  // Dedup: verificar se mensagem já existe
  if (data.id) {
    const exists = await db.query(
      'SELECT id FROM messages WHERE unipile_message_id = $1',
      [data.id]
    )
    if (exists.rows.length > 0) return null
  }

  // Verificar se grupo está sendo monitorado
  const chatType = data.is_group || data.chat_id.includes('@g.us') ? 'group' : 'individual'

  if (chatType === 'group') {
    const group = await db.query(
      `SELECT id, is_monitored, is_excluded FROM groups
       WHERE user_id = $1 AND whatsapp_chat_id = $2`,
      [userId, data.chat_id]
    )

    if (group.rows.length > 0) {
      const { is_monitored, is_excluded } = group.rows[0]
      if (!is_monitored || is_excluded) return null
    }
  }

  // Buscar keywords do usuário
  const keywordsResult = await db.query(
    'SELECT word, type, case_sensitive FROM keywords WHERE user_id = $1 AND is_active = true',
    [userId]
  )
  const keywords = keywordsResult.rows as Array<{
    word: string
    type: string
    case_sensitive: boolean
  }>

  // Detectar menção ao usuário
  const sessionResult = await db.query(
    'SELECT phone_number_encrypted FROM whatsapp_sessions WHERE id = $1',
    [sessionId]
  )
  const userPhone = sessionResult.rows[0]?.phone_number_encrypted
  const isMention = Boolean(userPhone && data.mentions?.some((m) => m.includes(userPhone)))

  // Detectar keywords
  const content = data.text || ''
  const matchedKeywords: string[] = []
  let keywordUrgent = false
  let keywordIgnore = false

  for (const kw of keywords) {
    const text = kw.case_sensitive ? content : content.toLowerCase()
    const word = kw.case_sensitive ? kw.word : kw.word.toLowerCase()

    if (text.includes(word)) {
      matchedKeywords.push(kw.word)
      if (kw.type === 'urgent') keywordUrgent = true
      if (kw.type === 'ignore') keywordIgnore = true

      // Incrementar contador da keyword
      await db.query(
        'UPDATE keywords SET match_count = match_count + 1 WHERE user_id = $1 AND word = $2',
        [userId, kw.word]
      )
    }
  }

  // Ignorar se keyword do tipo 'ignore'
  if (keywordIgnore) return null

  // Calcular urgency_score (1-5)
  const urgencyScore = calculateUrgency({
    isMention,
    keywordUrgent,
    chatType,
    contentLength: content.length,
    hasMedia: data.has_media || false,
  })

  // Buscar group_id se for grupo
  let groupId: string | null = null
  if (chatType === 'group') {
    const g = await db.query(
      'SELECT id FROM groups WHERE user_id = $1 AND whatsapp_chat_id = $2',
      [userId, data.chat_id]
    )
    groupId = g.rows[0]?.id || null
  }

  // Calcular data de expiração baseada no plano
  const userResult = await db.query('SELECT plan FROM users WHERE id = $1', [userId])
  const plan = userResult.rows[0]?.plan || 'free'
  const retentionDays = getRetentionDays(plan)
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + retentionDays)

  // Inserir no banco
  const result = await db.query(
    `INSERT INTO messages (
       user_id, session_id, group_id, chat_id, chat_type, chat_name,
       sender_wa_id, sender_name, content, media_type, has_media, media_url,
       is_mention, is_reply, urgency_score, keyword_matched,
       sent_at, expires_at, unipile_message_id, attachment_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     ON CONFLICT (unipile_message_id) DO NOTHING RETURNING *`,
    [
      userId,
      sessionId,
      groupId,
      data.chat_id,
      chatType,
      data.chat_name || null,
      data.sender?.id || null,
      data.sender?.display_name || null,
      content || null,
      ['audio','image','video','document','sticker'].includes(data.type) ? data.type : 'text',
      data.has_media || false,
      data.media_url || null,
      isMention,
      data.is_reply || false,
      urgencyScore,
      matchedKeywords.length > 0 ? matchedKeywords : null,
      new Date(data.timestamp * 1000),
      expiresAt,
      data.id || null,
      data.attachment_id || null,
    ]
  )

  if (!result.rows.length) return null
  const message: Message = result.rows[0]

  // Atualizar last_message_at do grupo
  if (groupId) {
    await db.query(
      `UPDATE groups SET
         last_message_at = NOW(),
         message_count_today = message_count_today + 1
       WHERE id = $1`,
      [groupId]
    )
  }

  return message
}

// ============================================
// getMessagesByPeriod — para geração do digest
// ============================================
export const getMessagesByPeriod = async (
  userId: string,
  start: Date,
  end: Date,
  chatId?: string
): Promise<Message[]> => {
  const params: unknown[] = [userId, start, end]
  let query = `
    SELECT * FROM messages
    WHERE user_id = $1
      AND sent_at BETWEEN $2 AND $3
      AND included_in_digest = false
  `

  if (chatId) {
    query += ` AND chat_id = $4`
    params.push(chatId)
  }

  query += ` ORDER BY sent_at ASC`

  const result = await db.query(query, params)
  return result.rows
}

// ============================================
// getDigestContext — agrega dados para o Claude
// ============================================
export interface DigestContext {
  userId: string
  periodStart: Date
  periodEnd: Date
  groups: Array<{
    chat_id: string
    chat_name: string
    message_count: number
    messages: Array<{
      sender: string
      content: string
      sent_at: Date
      is_mention: boolean
      urgency_score: number
    }>
  }>
  individuals: Array<{
    chat_id: string
    contact_name: string
    message_count: number
    messages: Array<{
      sender: string
      content: string
      sent_at: Date
      urgency_score: number
    }>
  }>
  stats: {
    total_messages: number
    total_mentions: number
    total_urgent: number
    total_media: number
  }
}

export const getDigestContext = async (
  userId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<DigestContext> => {
  const messages = await getMessagesByPeriod(userId, periodStart, periodEnd)

  const groupMap = new Map<string, DigestContext['groups'][0]>()
  const individualMap = new Map<string, DigestContext['individuals'][0]>()

  let totalMentions = 0
  let totalUrgent = 0
  let totalMedia = 0

  for (const msg of messages) {
    if (!msg.content) continue

    const msgData = {
      sender: msg.sender_name || msg.sender_wa_id || 'Desconhecido',
      content: msg.content,
      sent_at: msg.sent_at,
      is_mention: msg.is_mention,
      urgency_score: msg.urgency_score,
    }

    if (msg.is_mention) totalMentions++
    if (msg.urgency_score >= 4) totalUrgent++
    if (msg.has_media) totalMedia++

    if (msg.chat_type === 'group') {
      if (!groupMap.has(msg.chat_id)) {
        groupMap.set(msg.chat_id, {
          chat_id: msg.chat_id,
          chat_name: msg.chat_name || 'Grupo',
          message_count: 0,
          messages: [],
        })
      }
      const group = groupMap.get(msg.chat_id)!
      group.message_count++
      // Limite de 100 mensagens por grupo para não estourar contexto do Claude
      if (group.messages.length < 100) {
        group.messages.push(msgData)
      }
    } else {
      if (!individualMap.has(msg.chat_id)) {
        individualMap.set(msg.chat_id, {
          chat_id: msg.chat_id,
          contact_name: msg.chat_name || msg.sender_name || 'Contato',
          message_count: 0,
          messages: [],
        })
      }
      const individual = individualMap.get(msg.chat_id)!
      individual.message_count++
      if (individual.messages.length < 50) {
        individual.messages.push(msgData)
      }
    }
  }

  return {
    userId,
    periodStart,
    periodEnd,
    groups: Array.from(groupMap.values()).sort((a, b) => b.message_count - a.message_count),
    individuals: Array.from(individualMap.values()).sort((a, b) => b.message_count - a.message_count),
    stats: {
      total_messages: messages.length,
      total_mentions: totalMentions,
      total_urgent: totalUrgent,
      total_media: totalMedia,
    },
  }
}

// ============================================
// Marcar mensagens como incluídas no digest
// ============================================
export const markMessagesAsDigested = async (
  userId: string,
  digestId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<void> => {
  await db.query(
    `UPDATE messages SET
       included_in_digest = true,
       digest_id = $2
     WHERE user_id = $1
       AND sent_at BETWEEN $3 AND $4
       AND included_in_digest = false`,
    [userId, digestId, periodStart, periodEnd]
  )
}

// ============================================
// Purge de mensagens antigas (LGPD)
// Executar via cron semanal
// ============================================
export const purgeExpiredMessages = async (): Promise<number> => {
  const result = await db.query(
    'DELETE FROM messages WHERE expires_at < NOW() RETURNING id'
  )
  const count = result.rows.length
  if (count > 0) {
    console.log(`[Purge] ${count} mensagens expiradas removidas`)
  }
  return count
}

// ============================================
// Helpers
// ============================================

const calculateUrgency = (params: {
  isMention: boolean
  keywordUrgent: boolean
  chatType: string
  contentLength: number
  hasMedia: boolean
}): number => {
  let score = 1

  // Menção direta ao usuário = +3
  if (params.isMention) score += 3

  // Keyword urgente = +2
  if (params.keywordUrgent) score += 2

  // Conversa individual = +1 base (já é mais pessoal)
  if (params.chatType === 'individual') score += 1

  // Mensagem longa = +0.5 (arredonda para cima)
  if (params.contentLength > 200) score += 1

  return Math.min(score, 5)
}

const getRetentionDays = (plan: string): number => {
  const map: Record<string, number> = {
    free: parseInt(process.env.RETENTION_FREE || '30'),
    pro: parseInt(process.env.RETENTION_PRO || '90'),
    business: parseInt(process.env.RETENTION_BUSINESS || '365'),
  }
  return map[plan] || 30
}
