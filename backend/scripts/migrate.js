require('dotenv').config()
const fs = require('node:fs')
const path = require('node:path')
const { Pool } = require('pg')
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await client.query("SELECT to_regclass('public.users') AS table_name")
    if (!existing.rows[0].table_name) await client.query(fs.readFileSync(path.join(__dirname,'../src/database/schema.sql'), 'utf8'))
    await client.query(fs.readFileSync(path.join(__dirname,'../src/database/assistant.sql'), 'utf8'))
    // Fails visibly if an old installation has duplicate sessions; never deletes data.
    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS unique_session_user ON whatsapp_sessions(user_id)')
    await client.query('COMMIT')
    console.log('Database schema ready')
  } catch (e) { await client.query('ROLLBACK'); throw e }
  finally { client.release(); await pool.end() }
}
main().catch(e => { console.error(e.message); process.exitCode=1 })
