import { db } from '../../database/connection'
export const normalizedName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu,' ').trim()
export function matchContacts(rows: any[], query: string) {
  const q = normalizedName(query)
  if (!q) return rows
  const exact = rows.filter(c => [c.name,c.notify].some(n => n && normalizedName(n) === q))
  if (exact.length) return exact
  return rows.filter(c => q.split(' ').every(token => normalizedName(`${c.name || ''} ${c.notify || ''}`).split(' ').some(word => word.startsWith(token))))
}
export async function directory(userId: string, query = '') {
  const rows = (await db.query(`WITH entries AS (
    SELECT c.chat_id,COALESCE(c.name,c.notify,c.chat_id) AS name,c.notify,c.aliases,0 AS priority FROM whatsapp_contacts c JOIN whatsapp_sessions ws ON ws.user_id=c.user_id AND ws.unipile_account_id=c.account_id WHERE c.user_id=$1 AND (c.name IS NOT NULL OR c.notify IS NOT NULL)
    UNION ALL SELECT c.chat_id,COALESCE(c.name,c.chat_id),NULL,ARRAY[]::text[],1 FROM whatsapp_chats c JOIN whatsapp_sessions ws ON ws.user_id=c.user_id AND ws.unipile_account_id=c.account_id WHERE c.user_id=$1
    UNION ALL SELECT m.chat_id,COALESCE(m.chat_name,m.sender_name,m.chat_id),NULL,ARRAY[]::text[],2 FROM messages m JOIN whatsapp_sessions ws ON ws.id=m.session_id AND ws.user_id=m.user_id AND ws.unipile_account_id=m.source_account_id WHERE m.user_id=$1 AND (m.expires_at IS NULL OR m.expires_at>NOW())
  ) SELECT DISTINCT ON(chat_id) chat_id,name,notify,aliases FROM entries ORDER BY chat_id,priority`,[userId])).rows
  const byId=new Map(rows.map(c=>[c.chat_id,c])); const shadowed=new Set<string>()
  for(const c of rows) for(const alias of c.aliases || []) {const other=byId.get(alias); if(other && (!other.aliases?.includes(c.chat_id) || c.chat_id<alias)) shadowed.add(alias)}
  const canonical = rows.filter(c => !shadowed.has(c.chat_id))
  return matchContacts(canonical,query)
}
export async function rememberContacts(userId: string, account: string, contacts: any[]) {
  for (const c of contacts) {
    if (!c.id || !/(@s\.whatsapp\.net|@lid|@g\.us)$/.test(c.id)) continue
    const aliases = [...new Set([c.lid,c.phoneNumber].filter(x => x && x !== c.id))]
    await db.query(`INSERT INTO whatsapp_contacts(user_id,account_id,chat_id,name,notify,aliases) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(user_id,account_id,chat_id) DO UPDATE SET name=COALESCE(EXCLUDED.name,whatsapp_contacts.name),notify=COALESCE(EXCLUDED.notify,whatsapp_contacts.notify),aliases=ARRAY(SELECT DISTINCT unnest(whatsapp_contacts.aliases || EXCLUDED.aliases))`,[userId,account,c.id,c.name || null,c.notify || c.verifiedName || null,aliases])
    if (c.name || c.notify) await db.query('UPDATE whatsapp_chats SET name=$4 WHERE user_id=$1 AND account_id=$2 AND (chat_id=$3 OR chat_id=ANY($5::text[]))',[userId,account,c.id,c.name || c.notify,aliases])
    if ('imgUrl' in c) await db.query('UPDATE whatsapp_contacts SET photo_checked_at=NULL WHERE user_id=$1 AND account_id=$2 AND chat_id=$3',[userId,account,c.id])
  }
}
