export type InboxMessage = { id: string; chat_id: string; chat_name: string; sender_name: string; content: string; media_type: string; sent_at: string; urgency_score: number }
export type ReviewDraft = { id: string; chat_id: string; content: string; confirmation_token: string; recipient: string; expires_at: string }
export function unseenMessages(previous: Set<string> | null, rows: InboxMessage[]) {
  return previous === null ? [] : rows.filter(m => !previous.has(m.id)).reverse()
}
// Only a direct user command is actionable; quoted, negated and conditional requests are not.
export function isSendCommand(text: string) {
  const value = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  return /^(?:luna[, ]+)?(?:por favor[, ]+)?(?:pode |poderia )?(?:envia|enviar|envie|manda|mandar|mande)(?:\b)/.test(value)
    && !/\b(nao|espera|aguarda|depois|se)\b/.test(value.split(/(?:dizendo|com o texto|mensagem:)/)[0])
}

export function takeVoiceTurn(seen: Set<string>, id: string | undefined, text: string, blocked: boolean): boolean {
  if (!id || seen.has(id)) return false
  seen.add(id)
  return !blocked && Boolean(text.trim())
}
