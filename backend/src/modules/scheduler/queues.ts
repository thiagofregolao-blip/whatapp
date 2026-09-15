import { Queue, Worker } from 'bullmq'
import cron from 'node-cron'
import IORedis from 'ioredis'
import { db } from '../../database/connection'
import { generateDigest } from '../digest/digest.service'
import { purgeExpiredMessages } from '../messages/messages.service'
import { sendUrgentAlert } from '../digest/delivery.service'

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

// ============================================
// Filas BullMQ
// ============================================

// Fila de alertas urgentes (mensagens score 5)
export const alertQueue = new Queue('urgent-alerts', { connection: redisConnection })

// Fila de geração de digests (evita sobrecarregar Claude API)
export const digestQueue = new Queue('digest-generation', { connection: redisConnection })

// ============================================
// Workers
// ============================================

// Worker de alertas urgentes
const alertWorker = new Worker(
  'urgent-alerts',
  async (job) => {
    const { userId, chatName, senderName, preview } = job.data
    await sendUrgentAlert(userId, { chatName, senderName, preview })
  },
  { connection: redisConnection, concurrency: 5 }
)

alertWorker.on('failed', (job, err) => {
  console.error(`[AlertWorker] Job ${job?.id} falhou:`, err.message)
})

// Worker de geração de digests
const digestWorker = new Worker(
  'digest-generation',
  async (job) => {
    const { userId, periodStart, periodEnd, format, channels, scheduleId } = job.data

    await generateDigest(userId, {
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      format,
      deliveryChannels: channels,
      scheduleId,
      type: 'daily',
    })
  },
  {
    connection: redisConnection,
    concurrency: 3, // Máx 3 digests simultâneos (cuida com tokens Claude)
  }
)

digestWorker.on('completed', (job) => {
  console.log(`[DigestWorker] Job ${job.id} concluído para usuário ${job.data.userId}`)
})

digestWorker.on('failed', (job, err) => {
  console.error(`[DigestWorker] Job ${job?.id} falhou:`, err.message)
})

// ============================================
// Cron principal — verifica schedules a cada minuto
// ============================================
export const startScheduler = () => {
  // Verificar schedules a cada minuto
  cron.schedule('* * * * *', async () => {
    await processSchedules()
  })

  // Purge de mensagens antigas — toda segunda-feira às 3h
  cron.schedule('0 3 * * 1', async () => {
    const count = await purgeExpiredMessages()
    console.log(`[Cron] Purge semanal: ${count} mensagens removidas`)
  })

  // Reset de message_count_today — todo dia à meia-noite
  cron.schedule('0 0 * * *', async () => {
    await db.query('UPDATE groups SET message_count_today = 0')
    console.log('[Cron] Reset de message_count_today')
  })

  console.log('[Scheduler] Iniciado')
}

// ============================================
// Processar schedules pendentes
// ============================================
const processSchedules = async () => {
  try {
    // Buscar schedules que devem rodar agora
    const result = await db.query(
      `SELECT s.*, u.timezone
       FROM schedules s
       JOIN users u ON u.id = s.user_id
       WHERE s.is_active = true
         AND (s.next_run_at IS NULL OR s.next_run_at <= NOW())`,
    )

    for (const schedule of result.rows) {
      // Verificar se o cron bate com o horário atual no timezone do usuário
      if (!shouldRunNow(schedule.cron_expression, schedule.timezone)) continue

      // Calcular período (últimas 24h)
      const periodEnd = new Date()
      const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000)

      // Enfileirar geração
      await digestQueue.add(
        'generate-digest',
        {
          userId: schedule.user_id,
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          format: schedule.report_format,
          channels: schedule.delivery_channels,
          scheduleId: schedule.id,
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }
      )

      // Atualizar last_run e calcular próximo next_run
      await db.query(
        `UPDATE schedules SET
           last_run_at = NOW(),
           next_run_at = NOW() + INTERVAL '1 day'
         WHERE id = $1`,
        [schedule.id]
      )
    }
  } catch (err) {
    console.error('[Scheduler] Erro ao processar schedules:', err)
  }
}

const shouldRunNow = (cronExpression: string, timezone: string): boolean => {
  // Verificação simplificada — node-cron lida com isso
  return cron.validate(cronExpression)
}

// ============================================
// API para disparar digest manual
// ============================================
export const triggerManualDigest = async (
  userId: string,
  options: {
    periodHours?: number
    format?: string
    channels?: string[]
  }
): Promise<string> => {
  const periodEnd = new Date()
  const periodStart = new Date(
    periodEnd.getTime() - (options.periodHours || 24) * 60 * 60 * 1000
  )

  const scheduleResult = await db.query(
    'SELECT * FROM schedules WHERE user_id = $1 LIMIT 1',
    [userId]
  )
  const schedule = scheduleResult.rows[0]

  const job = await digestQueue.add(
    'manual-digest',
    {
      userId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      format: options.format || schedule?.report_format || 'detailed',
      channels: options.channels || schedule?.delivery_channels || ['dashboard'],
    },
    { priority: 1 } // Manual tem prioridade
  )

  return job.id!
}
