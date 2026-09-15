import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'

import { testConnection } from './database/connection'


import { assistantRouter, messagesRouter } from './modules/assistant/assistant.routes'
import authRoutes from './modules/auth/auth.routes'
import whatsappRoutes from './modules/whatsapp/whatsapp.routes'


dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) throw new Error('Configure JWT_SECRET com pelo menos 32 caracteres')

// ============================================
// Middlewares globais
// ============================================
app.use(helmet())
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
}))

// Rate limiting global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000,
  message: { success: false, error: 'Muitas requisições. Tente novamente em 15 minutos.' },
}))

// Rate limiting mais apertado para auth
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Muitas tentativas de login.' },
}))

// Parse JSON (ANTES das rotas, mas DEPOIS do webhook que precisa do raw body)
app.use('/api/whatsapp/webhook', express.raw({ type: 'application/json' }))
app.use(express.json({ limit: '1mb' }))

// ============================================
// Rotas
// ============================================
app.get('/health', (_, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.use('/api/assistant', assistantRouter)
app.use('/api/whatsapp/messages', messagesRouter)
app.use('/api/auth', authRoutes)
app.use('/api/whatsapp', whatsappRoutes)
// Legacy digest jobs are retained in source but not exposed in this first version.

// 404
app.use((_, res) => {
  res.status(404).json({ success: false, error: 'Rota não encontrada' })
})

// Error handler global
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err)
  res.status(500).json({ success: false, error: 'Erro interno do servidor' })
})

// ============================================
// Inicialização
// ============================================
const start = async () => {
  await testConnection()
  // No background sending or scheduled jobs in the personal assistant.

  app.listen(Number(PORT), process.env.HOST || '127.0.0.1', () => {
    console.log(`Leitor de WhatsApp: backend na porta ${PORT}`)
  })
}

start().catch(console.error)

export default app
