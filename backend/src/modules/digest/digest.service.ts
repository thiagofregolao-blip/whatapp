import Anthropic from '@anthropic-ai/sdk'
import { db } from '../../database/connection'
import { getDigestContext, markMessagesAsDigested, DigestContext } from '../messages/messages.service'
import { DigestContentJson, DigestType, ReportFormat, DeliveryChannel } from '../../types'
import { deliverDigest } from './delivery.service'

const anthropic = { messages: { create: (input: Anthropic.MessageCreateParamsNonStreaming) => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create(input) } }
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001'

// ============================================
// Gerar digest completo para um usuário
// ============================================
export const generateDigest = async (
  userId: string,
  options: {
    periodStart: Date
    periodEnd: Date
    format: ReportFormat
    deliveryChannels: DeliveryChannel[]
    scheduleId?: string
    type?: DigestType
  }
): Promise<string> => {
  const context = await getDigestContext(userId, options.periodStart, options.periodEnd)

  if (context.stats.total_messages === 0) {
    console.log(`[Digest] Nenhuma mensagem para usuário ${userId} no período`)
    return ''
  }

  // Buscar idioma do usuário
  const userResult = await db.query('SELECT language, name FROM users WHERE id = $1', [userId])
  const { language, name } = userResult.rows[0] || { language: 'pt-BR', name: 'Usuário' }

  // Chamar Claude API
  const { contentJson, contentText, contentHtml, tokensInput, tokensOutput } =
    await callClaudeForDigest(context, options.format, language)

  // Salvar no banco
  const digestResult = await db.query(
    `INSERT INTO digests (
       user_id, schedule_id, type,
       period_start, period_end,
       content_json, content_text, content_html,
       total_messages, total_groups, total_individual,
       urgent_count, mention_count,
       claude_tokens_input, claude_tokens_output, claude_model
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [
      userId,
      options.scheduleId || null,
      options.type || 'daily',
      options.periodStart,
      options.periodEnd,
      JSON.stringify(contentJson),
      contentText,
      contentHtml,
      context.stats.total_messages,
      context.groups.length,
      context.individuals.length,
      context.stats.total_urgent,
      context.stats.total_mentions,
      tokensInput,
      tokensOutput,
      CLAUDE_MODEL,
    ]
  )

  const digestId = digestResult.rows[0].id

  // Marcar mensagens como processadas
  await markMessagesAsDigested(userId, digestId, options.periodStart, options.periodEnd)

  // Entregar o digest
  await deliverDigest(userId, digestId, contentText, contentHtml, options.deliveryChannels)

  // Atualizar digest com info de entrega
  await db.query(
    `UPDATE digests SET
       delivered_via = $2,
       delivered_at = NOW()
     WHERE id = $1`,
    [digestId, options.deliveryChannels]
  )

  console.log(
    `[Digest] Gerado para ${userId}: ${context.stats.total_messages} msgs, ` +
    `${tokensInput + tokensOutput} tokens`
  )

  return digestId
}

// ============================================
// Claude API — análise inteligente
// ============================================
const callClaudeForDigest = async (
  context: DigestContext,
  format: ReportFormat,
  language: string
): Promise<{
  contentJson: DigestContentJson
  contentText: string
  contentHtml: string
  tokensInput: number
  tokensOutput: number
}> => {
  const periodLabel = formatPeriodLabel(context.periodStart, context.periodEnd)
  const langInstruction = language === 'pt-BR'
    ? 'Responda em português brasileiro.'
    : language === 'es'
    ? 'Responde en español.'
    : 'Respond in English.'

  const formatInstruction = {
    short: 'Seja conciso. Máximo 2 frases por grupo. Destaque apenas o mais importante.',
    detailed: 'Seja detalhado mas claro. 3-5 pontos por grupo. Inclua decisões e menções.',
    executive: 'Formato executivo. Foco em decisões, ações necessárias e urgências. Sem detalhes supérfluos.',
  }[format]

  // Construir contexto das mensagens
  const groupsContext = context.groups.map(g => {
    const msgs = g.messages
      .slice(0, 50)
      .map(m => `[${m.sender}${m.is_mention ? ' ⚑' : ''}]: ${m.content}`)
      .join('\n')
    return `GRUPO: ${g.chat_name} (${g.message_count} mensagens)\n${msgs}`
  }).join('\n\n---\n\n')

  const individualsContext = context.individuals.map(i => {
    const msgs = i.messages
      .slice(0, 20)
      .map(m => `[${m.sender}]: ${m.content}`)
      .join('\n')
    return `INDIVIDUAL: ${i.contact_name} (${i.message_count} mensagens)\n${msgs}`
  }).join('\n\n---\n\n')

  const systemPrompt = `Você é um assistente pessoal de WhatsApp. Sua função é analisar mensagens e gerar relatórios inteligentes.
${langInstruction}
${formatInstruction}

Você deve responder APENAS com JSON válido, sem markdown, sem texto adicional.`

  const userPrompt = `Analise as mensagens abaixo do período: ${periodLabel}

${groupsContext ? `=== GRUPOS ===\n${groupsContext}` : ''}
${individualsContext ? `\n=== CONVERSAS INDIVIDUAIS ===\n${individualsContext}` : ''}

Gere um JSON com esta estrutura exata:
{
  "period_label": "${periodLabel}",
  "overall_summary": "Resumo geral do dia em 1-2 frases",
  "urgent_items": ["item urgente 1", "item urgente 2"],
  "groups": [
    {
      "chat_id": "id_do_grupo",
      "chat_name": "Nome do Grupo",
      "message_count": 42,
      "main_topics": ["tópico 1", "tópico 2"],
      "decisions": ["decisão tomada 1"],
      "mentions": ["você foi mencionado sobre X"],
      "urgent_items": ["item urgente"],
      "urgency_level": 1,
      "summary": "Resumo do grupo"
    }
  ],
  "individuals": [
    {
      "chat_id": "id_conversa",
      "contact_name": "Nome do Contato",
      "message_count": 5,
      "needs_reply": true,
      "summary": "Resumo da conversa",
      "urgency_level": 3,
      "last_message_preview": "Prévia da última mensagem"
    }
  ],
  "stats": {
    "total_messages": ${context.stats.total_messages},
    "active_groups": ${context.groups.length},
    "active_individuals": ${context.individuals.length},
    "mentions": ${context.stats.total_mentions},
    "media_count": ${context.stats.total_media}
  },
  "generated_at": "${new Date().toISOString()}"
}`

  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: userPrompt }],
    system: systemPrompt,
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

  let contentJson: DigestContentJson
  try {
    contentJson = JSON.parse(rawText)
  } catch {
    // Fallback se JSON inválido
    contentJson = buildFallbackDigest(context, periodLabel)
  }

  const contentText = buildWhatsAppText(contentJson)
  const contentHtml = buildEmailHtml(contentJson)

  return {
    contentJson,
    contentText,
    contentHtml,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
  }
}

// ============================================
// Formata texto para WhatsApp
// ============================================
const buildWhatsAppText = (digest: DigestContentJson): string => {
  const lines: string[] = []

  lines.push(`📊 *Seu resumo WhatsApp*`)
  lines.push(`_${digest.period_label}_`)
  lines.push('')
  lines.push(digest.overall_summary)
  lines.push('')

  if (digest.urgent_items.length > 0) {
    lines.push(`🚨 *Urgente*`)
    digest.urgent_items.forEach(item => lines.push(`• ${item}`))
    lines.push('')
  }

  if (digest.groups.length > 0) {
    lines.push(`👥 *Grupos*`)
    digest.groups.forEach(g => {
      lines.push(``)
      lines.push(`*${g.chat_name}* (${g.message_count} msgs)`)
      lines.push(g.summary)
      if (g.mentions.length > 0) {
        lines.push(`_Menções: ${g.mentions.join(', ')}_`)
      }
      if (g.decisions.length > 0) {
        lines.push(`✅ ${g.decisions.join(' | ')}`)
      }
    })
    lines.push('')
  }

  if (digest.individuals.length > 0) {
    lines.push(`💬 *Conversas individuais*`)
    digest.individuals.forEach(i => {
      const needsReply = i.needs_reply ? ' ↩️ aguarda resposta' : ''
      lines.push(`• *${i.contact_name}*${needsReply}: ${i.summary}`)
    })
    lines.push('')
  }

  lines.push(`📈 ${digest.stats.total_messages} msgs | ${digest.stats.active_groups} grupos | ${digest.stats.mentions} menções`)

  return lines.join('\n')
}

// ============================================
// Formata HTML para email
// ============================================
const buildEmailHtml = (digest: DigestContentJson): string => {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #25D366; }
    h2 { color: #128C7E; border-bottom: 1px solid #eee; padding-bottom: 8px; }
    .urgent { background: #FFF3CD; border: 1px solid #FFC107; padding: 12px; border-radius: 8px; margin: 16px 0; }
    .group { background: #F8F9FA; padding: 12px; border-radius: 8px; margin: 8px 0; }
    .mention { color: #128C7E; font-style: italic; }
    .stats { background: #E8F5E9; padding: 12px; border-radius: 8px; text-align: center; }
    .badge { display: inline-block; background: #25D366; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; }
  </style>
</head>
<body>
  <h1>📊 Resumo WhatsApp</h1>
  <p><em>${digest.period_label}</em></p>
  <p>${digest.overall_summary}</p>

  ${digest.urgent_items.length > 0 ? `
  <div class="urgent">
    <strong>🚨 Urgente</strong>
    <ul>${digest.urgent_items.map(i => `<li>${i}</li>`).join('')}</ul>
  </div>` : ''}

  ${digest.groups.length > 0 ? `
  <h2>👥 Grupos</h2>
  ${digest.groups.map(g => `
  <div class="group">
    <strong>${g.chat_name}</strong> <span class="badge">${g.message_count} msgs</span>
    <p>${g.summary}</p>
    ${g.mentions.length > 0 ? `<p class="mention">Menções: ${g.mentions.join(', ')}</p>` : ''}
    ${g.decisions.length > 0 ? `<p>✅ ${g.decisions.join(' | ')}</p>` : ''}
  </div>`).join('')}` : ''}

  ${digest.individuals.length > 0 ? `
  <h2>💬 Individuais</h2>
  <ul>
    ${digest.individuals.map(i =>
      `<li><strong>${i.contact_name}</strong>${i.needs_reply ? ' ↩️' : ''}: ${i.summary}</li>`
    ).join('')}
  </ul>` : ''}

  <div class="stats">
    ${digest.stats.total_messages} mensagens &nbsp;|&nbsp;
    ${digest.stats.active_groups} grupos &nbsp;|&nbsp;
    ${digest.stats.mentions} menções
  </div>
</body>
</html>`
}

const buildFallbackDigest = (context: DigestContext, periodLabel: string): DigestContentJson => ({
  period_label: periodLabel,
  overall_summary: `${context.stats.total_messages} mensagens em ${context.groups.length} grupos e ${context.individuals.length} conversas individuais.`,
  urgent_items: [],
  groups: context.groups.map(g => ({
    chat_id: g.chat_id,
    chat_name: g.chat_name,
    participant_count: 0,
    message_count: g.message_count,
    main_topics: [],
    decisions: [],
    mentions: [],
    urgent_items: [],
    urgency_level: 1 as const,
    summary: `${g.message_count} mensagens recebidas.`,
  })),
  individuals: context.individuals.map(i => ({
    chat_id: i.chat_id,
    contact_name: i.contact_name,
    message_count: i.message_count,
    needs_reply: false,
    summary: `${i.message_count} mensagens.`,
    urgency_level: 1 as const,
    last_message_preview: '',
  })),
  stats: { total_messages: context.stats.total_messages, active_groups: context.groups.length, active_individuals: context.individuals.length, mentions: context.stats.total_mentions, media_count: context.stats.total_media },
  generated_at: new Date().toISOString(),
})

const formatPeriodLabel = (start: Date, end: Date): string => {
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
  }
  return `${start.toLocaleString('pt-BR', opts)} até ${end.toLocaleString('pt-BR', opts)}`
}

// ============================================
// Listar digests do usuário
// ============================================
export const listDigests = async (userId: string, limit = 10) => {
  const result = await db.query(
    `SELECT id, type, period_start, period_end, total_messages,
            total_groups, urgent_count, delivered_at, created_at
     FROM digests
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  )
  return result.rows
}

export const getDigestById = async (userId: string, digestId: string) => {
  const result = await db.query(
    'SELECT * FROM digests WHERE id = $1 AND user_id = $2',
    [digestId, userId]
  )
  return result.rows[0] || null
}
