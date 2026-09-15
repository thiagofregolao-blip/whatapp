import { db } from '../../database/connection'
export async function recordDiagnostic(userId: string, event: string, code = '', session = '') {
  // Only technical identifiers; no transcripts, contacts, SDP, tokens or message text.
  const clean=(s:string)=>s.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,80)
  console.info('[Diagnostic]',{event:clean(event),code:clean(code),session:clean(session)})
  await db.query('INSERT INTO app_diagnostics(user_id,event,code,session_ref) VALUES($1,$2,$3,$4)',[userId,clean(event),clean(code),clean(session)])
  await db.query(`DELETE FROM app_diagnostics WHERE user_id=$1 AND id NOT IN (SELECT id FROM app_diagnostics WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200)`,[userId])
}
