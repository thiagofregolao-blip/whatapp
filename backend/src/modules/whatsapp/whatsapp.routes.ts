import { Router, Request, Response, NextFunction } from 'express'
import { verifyWebhook, normalizeWebhook } from './webhook'
import { authenticate } from '../../middleware/auth'
import * as unipileService from './unipile.service'
import { saveMessage } from '../messages/messages.service'
import { UnipileWebhookEvent, ApiResponse } from '../../types'
import { db } from '../../database/connection'
import { handleQRStream, notifyQRUpdate, notifyAccountConnected } from './qr-stream'

const router = Router()
const safe = (fn: (req: Request, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next) }

// ============================================
// POST /whatsapp/connect — iniciar conexão + QR
// ============================================
router.post('/connect', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await unipileService.initiateConnection(req.user!.id)
    res.json({ success: true, data: result } as ApiResponse)
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// GET /whatsapp/status — status da sessão
// ============================================
router.get('/status', authenticate, safe(async (req: Request, res: Response) => {
  const session = await unipileService.getSessionStatus(req.user!.id)
  res.json({
    success: true,
    data: session
      ? {
          status: session.status,
          display_name: session.display_name,
          connected_at: session.connected_at,
          last_activity_at: session.last_activity_at,
        }
      : null,
  })
}))

// ============================================
// DELETE /whatsapp/disconnect
// ============================================
router.delete('/disconnect', authenticate, async (req: Request, res: Response) => {
  try {
    await unipileService.disconnect(req.user!.id)
    res.json({ success: true, message: 'WhatsApp desconectado' })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// GET /whatsapp/groups — listar grupos
// ============================================
router.get('/groups', authenticate, safe(async (req: Request, res: Response) => {
  const groups = await unipileService.listGroups(req.user!.id)
  res.json({ success: true, data: groups })
}))

// ============================================
// PUT /whatsapp/groups/:groupId — configurar grupo
// ============================================
router.put('/groups/:groupId', authenticate, async (req: Request, res: Response) => {
  try {
    const { is_monitored, is_excluded } = req.body
    await unipileService.updateGroupConfig(req.user!.id, req.params.groupId, {
      is_monitored,
      is_excluded,
    })
    res.json({ success: true, message: 'Configuração atualizada' })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// POST /whatsapp/sync — sincronizar grupos manualmente
// ============================================
router.post('/sync', authenticate, async (req: Request, res: Response) => {
  try {
    const session = await unipileService.getSessionStatus(req.user!.id)
    if (!session?.unipile_account_id || session.status !== 'connected') {
      return res.status(400).json({ success: false, error: 'WhatsApp não conectado' })
    }
    await unipileService.syncGroups(req.user!.id, session.unipile_account_id)
    res.json({ success: true, message: 'Grupos sincronizados' })
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message })
  }
})

// ============================================
// GET /whatsapp/qr-stream — SSE para QR Code em tempo real
// Autenticação via query param ?token=JWT
// ============================================
router.get('/qr-stream', handleQRStream)

// ============================================
// POST /whatsapp/webhook — recebe eventos do Unipile
// IMPORTANTE: não tem autenticação JWT, usa HMAC
// ============================================
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const raw = req.body as Buffer
    if (!verifyWebhook(raw, req.headers['x-unipile-signature'] as string, req.headers['x-webhook-secret'] as string)) {
      return res.status(401).json({ error: 'Webhook não autorizado' })
    }
    const event = normalizeWebhook(JSON.parse(raw.toString('utf8')))
    if (!event.account_id) return res.status(400).json({ error: 'account_id ausente' })
    // Acknowledge only after persistence, so failures can be retried by the provider.
    await processWebhookEvent(event)
    res.status(200).json({ received: true })
  } catch (err: any) {
    console.error('[Webhook] Erro:', err)
    res.status(500).json({ error: 'Erro interno' })
  }
})

// ============================================
// Processar evento do webhook
// ============================================
const processWebhookEvent = async (event: UnipileWebhookEvent): Promise<void> => {
  console.log(`[Webhook] Evento: ${event.event}, account: ${event.account_id}`)

  switch (event.event) {
    case 'account_connected':
      await unipileService.handleAccountConnected(
        event.account_id,
        event.data?.sender?.id,
        event.data?.sender?.display_name
      )
      // Notificar SSE do usuário que WhatsApp conectou
      {
        const connSession = await db.query(
          'SELECT user_id FROM whatsapp_sessions WHERE unipile_account_id = $1',
          [event.account_id]
        )
        if (connSession.rows.length > 0) {
          notifyAccountConnected(
            connSession.rows[0].user_id,
            event.data?.sender?.id,
            event.data?.sender?.display_name
          )
        }
      }
      break

    case 'account_disconnected':
    case 'account_error':
      await db.query(
        `UPDATE whatsapp_sessions SET
           status = $2,
           error_message = $3,
           updated_at = NOW()
         WHERE unipile_account_id = $1`,
        [
          event.account_id,
          event.event === 'account_disconnected' ? 'disconnected' : 'error',
          event.event === 'account_error' ? 'Erro de conexão reportado pelo Unipile' : null,
        ]
      )
      break

    case 'message_received':
      // Buscar sessão pelo account_id
      const sessionResult = await db.query(
        `SELECT ws.id, ws.user_id FROM whatsapp_sessions ws
         WHERE ws.unipile_account_id = $1 AND ws.status = 'connected'`,
        [event.account_id]
      )

      if (sessionResult.rows.length === 0) {
        console.warn(`[Webhook] Sessão não encontrada para account ${event.account_id}`)
        return
      }

      const { id: sessionId, user_id: userId } = sessionResult.rows[0]

      // Atualizar last_activity
      await db.query(
        'UPDATE whatsapp_sessions SET last_activity_at = NOW() WHERE id = $1',
        [sessionId]
      )

      // Salvar mensagem
      await saveMessage(userId, sessionId, event)
      break

    case 'qrcode':
      // QR Code atualizado
      await db.query(
        `UPDATE whatsapp_sessions SET
           qr_code = $2,
           qr_expires_at = NOW() + INTERVAL '60 seconds',
           updated_at = NOW()
         WHERE unipile_account_id = $1`,
        [event.account_id, event.data?.text]
      )
      // Notificar SSE do usuário com novo QR Code
      {
        const qrSession = await db.query(
          'SELECT user_id FROM whatsapp_sessions WHERE unipile_account_id = $1',
          [event.account_id]
        )
        if (qrSession.rows.length > 0 && event.data?.text) {
          notifyQRUpdate(qrSession.rows[0].user_id, event.data.text)
        }
      }
      break

    default:
      console.log(`[Webhook] Evento não tratado: ${event.event}`)
  }
}

export default router
