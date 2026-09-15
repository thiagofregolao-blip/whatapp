import { Pool, PoolClient } from 'pg'
import dotenv from 'dotenv'

dotenv.config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

pool.on('error', (err) => {
  console.error('[DB] Pool error:', err)
})

export const db = {
  query: (text: string, params?: unknown[]) => pool.query(text, params),

  getClient: async (): Promise<PoolClient> => {
    const client = await pool.connect()
    return client
  },

  transaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await fn(client)
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },
}

export const testConnection = async () => {
  try {
    const res = await db.query('SELECT NOW()')
    console.log('[DB] Conectado:', res.rows[0].now)
  } catch (err) {
    console.error('[DB] Erro na conexão:', err)
    process.exit(1)
  }
}
