import crypto from 'crypto'
import { db } from '../../database/connection'

function key() {
  const value = process.env.BAILEYS_AUTH_KEY || process.env.JWT_SECRET
  if (!value || value.length < 32) throw new Error('Configure BAILEYS_AUTH_KEY com pelo menos 32 caracteres')
  return crypto.createHash('sha256').update(value).digest()
}
export function seal(value: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64')
}
export function unseal(value: string): string {
  const bytes = Buffer.from(value, 'base64')
  const cipher = crypto.createDecipheriv('aes-256-gcm', key(), bytes.subarray(0,12))
  cipher.setAuthTag(bytes.subarray(12,28))
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8')
}
export async function databaseAuth(sessionId: string, lib: any) {
  const read = async (name: string) => {
    const result = await db.query('SELECT encrypted_value FROM whatsapp_auth WHERE session_id=$1 AND key=$2', [sessionId,name])
    return result.rows[0] ? JSON.parse(unseal(result.rows[0].encrypted_value), lib.BufferJSON.reviver) : null
  }
  const write = async (name: string, value: any) => {
    if (value == null) { await db.query('DELETE FROM whatsapp_auth WHERE session_id=$1 AND key=$2', [sessionId,name]); return }
    await db.query('INSERT INTO whatsapp_auth(session_id,key,encrypted_value) VALUES($1,$2,$3) ON CONFLICT(session_id,key) DO UPDATE SET encrypted_value=EXCLUDED.encrypted_value', [sessionId,name,seal(JSON.stringify(value,lib.BufferJSON.replacer))])
  }
  const creds = await read('creds') || lib.initAuthCreds()
  return {
    state: { creds, keys: {
      get: async (type: string, ids: string[]) => {
        const out: Record<string,any> = {}
        for (const id of ids) {
          let value = await read(`${type}:${id}`)
          if (type === 'app-state-sync-key' && value) value = lib.proto.Message.AppStateSyncKeyData.fromObject(value)
          out[id] = value
        }
        return out
      },
      set: async (data: Record<string,Record<string,unknown>>) => {
        for (const [type,items] of Object.entries(data)) for (const [id,value] of Object.entries(items)) await write(`${type}:${id}`,value)
      },
    } },
    saveCreds: () => write('creds',creds),
  }
}
