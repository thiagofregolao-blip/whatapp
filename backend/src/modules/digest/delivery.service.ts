import { db } from '../../database/connection'
import { DeliveryChannel } from '../../types'
// Reports are available only in the dashboard. External sends require a reply draft.
export const deliverDigest = async (userId: string, digestId: string, _text: string, _html: string | null, _channels: DeliveryChannel[]): Promise<void> => {
  await db.query("UPDATE digests SET delivered_via = '{dashboard}', delivered_at = NOW() WHERE id = $1 AND user_id = $2", [digestId, userId])
}
export const sendUrgentAlert = async (_userId: string, _data: {chatName?: string; senderName?: string; preview: string}): Promise<void> => {}
