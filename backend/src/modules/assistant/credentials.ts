import crypto from 'crypto'
import { db } from '../../database/connection'

function encryptionKey() {
  const secret = process.env.AI_KEYS_ENCRYPTION_KEY || process.env.BAILEYS_AUTH_KEY
  if (!secret || secret.length < 32) throw new Error('O armazenamento seguro de chaves ainda não foi configurado.')
  return crypto.createHash('sha256').update(`nexo:user-openai:${secret}`).digest()
}
export function encryptUserKey(userId: string, key: string) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(userId))
  const data = Buffer.concat([cipher.update(key, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64')).join('.')
}
export function decryptUserKey(userId: string, encrypted: string) {
  const [iv, tag, data] = encrypted.split('.').map(x => Buffer.from(x, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv)
  decipher.setAAD(Buffer.from(userId)); decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
export async function userAiSettings(userId: string) {
  const row = (await db.query('SELECT mode, encrypted_key, platform_access FROM user_ai_settings WHERE user_id=$1', [userId])).rows[0]
  return row || { mode: 'personal', encrypted_key: null, platform_access: false }
}
export async function userApiKey(userId: string) {
  const settings = await userAiSettings(userId)
  if (settings.mode === 'personal' && settings.encrypted_key) return decryptUserKey(userId, settings.encrypted_key)
  if (settings.mode === 'platform' && settings.platform_access && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY
  throw new Error(settings.mode === 'personal' ? 'Adicione sua chave OpenAI em Perfil para ativar a Luna.' : 'Créditos do app ainda não estão disponíveis nesta conta. Use sua chave OpenAI.')
}
