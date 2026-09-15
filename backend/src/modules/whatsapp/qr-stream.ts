import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { getUserById } from '../auth/auth.service'

const JWT_SECRET = process.env.JWT_SECRET!

// ============================================
// Mapa de conexões SSE abertas: userId → Response
// ============================================
const sseConnections = new Map<string, Response>()

// ============================================
// GET /whatsapp/qr-stream?token=JWT
// SSE endpoint para streaming de QR Code em tempo real
// ============================================
export const handleQRStream = async (req: Request, res: Response) => {
  // Autenticar via query param (SSE não suporta headers customizados)
  const token = req.query.token as string
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não fornecido' })
  }

  let userId: string
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string }
    const user = await getUserById(payload.sub)
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Usuário inativo ou não encontrado' })
    }
    userId = user.id
  } catch {
    return res.status(401).json({ success: false, error: 'Token inválido ou expirado' })
  }

  // Fechar conexão anterior se existir
  const existing = sseConnections.get(userId)
  if (existing) {
    try { existing.end() } catch {}
    sseConnections.delete(userId)
  }

  // Configurar SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Nginx proxy buffering off
  })

  // Enviar evento inicial
  sendSSE(res, { type: 'connected', message: 'SSE stream aberto' })

  // Registrar conexão
  sseConnections.set(userId, res)

  // Heartbeat a cada 15s para manter conexão viva
  const heartbeat = setInterval(() => {
    sendSSE(res, { type: 'ping' })
  }, 15_000)

  // Timeout de 5 minutos (QR Code não escaneado)
  const timeout = setTimeout(() => {
    sendSSE(res, { type: 'timeout', message: 'QR Code expirou. Gere um novo.' })
    cleanup()
  }, 5 * 60 * 1000)

  // Limpeza quando cliente desconectar
  const cleanup = () => {
    clearInterval(heartbeat)
    clearTimeout(timeout)
    sseConnections.delete(userId)
    try { res.end() } catch {}
  }

  req.on('close', cleanup)
}

// ============================================
// Enviar evento SSE formatado
// ============================================
const sendSSE = (res: Response, data: Record<string, unknown>) => {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`)
  } catch {}
}

// ============================================
// Notificar SSE do usuário (chamado pelo webhook)
// ============================================
export const notifyQRUpdate = (userId: string, qrData: string) => {
  const res = sseConnections.get(userId)
  if (res) {
    sendSSE(res, { type: 'qr', data: qrData })
  }
}

export const notifyAccountConnected = (userId: string, phone?: string, name?: string) => {
  const res = sseConnections.get(userId)
  if (res) {
    sendSSE(res, { type: 'connected_wa', phone: phone || null, name: name || null })
    // Fechar conexão SSE após notificar — o fluxo terminou
    setTimeout(() => {
      sseConnections.delete(userId)
      try { res.end() } catch {}
    }, 1000)
  }
}

// ============================================
// Buscar userId pelo unipile_account_id (usado no webhook)
// ============================================
export const getConnectionForAccount = (accountId: string): void => {
  // Não precisa — o webhook já busca o userId no banco
  // Esta função existe caso queiramos um cache futuro
}

export const hasActiveConnection = (userId: string): boolean => {
  return sseConnections.has(userId)
}
