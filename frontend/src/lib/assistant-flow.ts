export type InboxMessage = { id: string; chat_id: string; chat_name: string; sender_name: string; content: string; media_type: string; sent_at: string; urgency_score: number }
export type ReviewDraft = { id: string; chat_id: string; content: string; confirmation_token: string; recipient: string; expires_at: string; voice_code: string }
export function unseenMessages(previous: Set<string> | null, rows: InboxMessage[]) {
  return previous === null ? [] : rows.filter(m => !previous.has(m.id)).reverse()
}
export function confirmationMatches(text: string, code: string) {
  const digits: Record<string, string> = { zero:'0', um:'1', uma:'1', dois:'2', duas:'2', tres:'3', quatro:'4', cinco:'5', seis:'6', sete:'7', oito:'8', nove:'9' }
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.,!?]/g, '').trim()
  const match = /^confirmo (?:o )?envio(?: codigo)? ([a-z\d\s]+)$/.exec(normalized)
  if (!match || !/^\d{4}$/.test(code)) return false
  const value = match[1].split(/\s+/).map(word => digits[word] ?? word).join('')
  return value === code
}
export function canConfirm(draft: ReviewDraft | null, expectedId: string, text: string, now = Date.now()) {
  return Boolean(draft && draft.id === expectedId && new Date(draft.expires_at).getTime() > now && confirmationMatches(text, draft.voice_code))
}
