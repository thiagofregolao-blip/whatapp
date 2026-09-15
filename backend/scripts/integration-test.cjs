// Run only against a disposable test database; no actual provider requests.
const assert = require('node:assert/strict')
const { db } = require('../dist/database/connection')
const { createDraft, sendDraft } = require('../dist/modules/assistant/replies')
const { saveMessage } = require('../dist/modules/messages/messages.service')
const { normalizeWebhook } = require('../dist/modules/whatsapp/webhook')
async function run() {
  const current = await db.query('SELECT current_database() AS name')
  assert.ok(current.rows[0].name.endsWith('_test'), 'Use a disposable database ending in _test')
  const user = (await db.query("INSERT INTO users (email,password_hash) VALUES ($1,'test-only') RETURNING id", [`test-${Date.now()}@example.invalid`])).rows[0].id
  let calls = 0
  try {
    const session = (await db.query("INSERT INTO whatsapp_sessions (user_id,unipile_account_id,status) VALUES ($1,$2,'connected') RETURNING id", [user, `test-account-${user}`])).rows[0].id
    const event = normalizeWebhook({ event: 'message_received', account_id: `test-account-${user}`, message_id: `test-msg-${user}`, chat_id: 'exact-chat', chat_name: 'Test recipient', timestamp: new Date().toISOString(), sender: { attendee_provider_id: 'someone', attendee_name: 'Recipient' }, message: 'Please reply' })
    const m = await saveMessage(user, session, event)
    assert.ok(m.id)
    assert.equal(await saveMessage(user, session, event), null, 'Webhook retries deduplicate')
    const sender = async d => { calls++; assert.equal(d.chat_id, 'exact-chat'); assert.equal(d.content, 'Approved reply'); assert.equal(d.account_id, `test-account-${user}`); await new Promise(r => setTimeout(r, 30)); return { message_id: 'fake-provider-result' } }
    const d = await createDraft(user, m.id, 'Approved reply')
    const auth = { authorize: true, confirmation_token: d.confirmation_token, chat_id: d.chat_id, content: d.content }
    for (const patch of [{ authorize: false }, { content: 'Changed reply' }, { chat_id: 'wrong-chat' }, { confirmation_token: 'wrong' }]) await assert.rejects(sendDraft(user, d.id, { ...auth, ...patch }, sender))
    await assert.rejects(sendDraft('00000000-0000-0000-0000-000000000001', d.id, auth, sender))
    assert.equal(calls, 0)
    const attempts = await Promise.allSettled([sendDraft(user, d.id, auth, sender), sendDraft(user, d.id, auth, sender)])
    assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1)
    assert.equal(calls, 1, 'Concurrent clicks send at most once')
    await assert.rejects(sendDraft(user, d.id, auth, sender))
    const unknown = await createDraft(user, m.id, 'Approved reply')
    const unknownAuth = { ...auth, confirmation_token: unknown.confirmation_token }
    await assert.rejects(sendDraft(user, unknown.id, unknownAuth, async () => { calls++; throw new Error('timeout') }))
    await assert.rejects(sendDraft(user, unknown.id, unknownAuth, sender))
    assert.equal(calls, 2, 'Timeout does not retry')
    const stale = await createDraft(user, m.id, 'Approved reply')
    await db.query("UPDATE whatsapp_sessions SET unipile_account_id='different-account' WHERE id=$1", [session])
    await assert.rejects(sendDraft(user, stale.id, { ...auth, confirmation_token: stale.confirmation_token }, sender))
    assert.equal(calls, 2, 'Account change blocks send')
    const lib = await import('@whiskeysockets/baileys')
    const { databaseAuth } = require('../dist/modules/whatsapp/baileys-auth')
    const authStore = await databaseAuth(session,lib)
    await authStore.saveCreds()
    await authStore.state.keys.set({ 'session': { 'test-recipient': Buffer.from('test-signal-key') } })
    const restored = await databaseAuth(session,lib)
    assert.deepEqual(restored.state.creds.noiseKey,authStore.state.creds.noiseKey)
    assert.equal((await restored.state.keys.get('session',['test-recipient']))['test-recipient'].toString(),'test-signal-key')
    await restored.state.keys.set({ 'session': { 'test-recipient': null } })
    assert.equal((await restored.state.keys.get('session',['test-recipient']))['test-recipient'],null)
    const authRows = await db.query('SELECT encrypted_value FROM whatsapp_auth WHERE session_id=$1',[session])
    assert.ok(authRows.rows.every(row => !row.encrypted_value.includes('noiseKey')))
    await assert.rejects(createDraft(user,m.id,'Must not send old-account message'))
    console.log('PASS: encrypted Baileys auth round-trip, key deletion, stale message account; persistence, deduplication, ownership, exact recipient/text, concurrent send, no timeout retry, account change')
  } finally { await db.query('DELETE FROM users WHERE id=$1', [user]) }
}
run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
