import test from 'node:test'
import assert from 'node:assert/strict'
import { assertAuthorization } from './replies'
import { normalizeWebhook, verifyWebhook } from '../whatsapp/webhook'
import crypto from 'crypto'
const draft = { user_id: 'owner', status: 'draft', expires_at: new Date(Date.now()+60000), confirmation_token: 'secret', chat_id: 'chat-A', content: 'Confirmo às 10h.' }
const authorization = { authorize: true, confirmation_token: 'secret', chat_id: 'chat-A', content: 'Confirmo às 10h.' }
test('requires explicit authorization for exact text, recipient and user', () => {
  assert.doesNotThrow(() => assertAuthorization(draft, 'owner', authorization))
  for (const changed of [{ authorize: false }, { authorize: 'true' }, { chat_id: 'chat-B' }, { content: 'Outro texto' }, { confirmation_token: 'wrong' }]) {
    assert.throws(() => assertAuthorization(draft, 'owner', { ...authorization, ...changed }))
  }
  assert.throws(() => assertAuthorization(draft, 'other-owner', authorization))
  assert.throws(() => assertAuthorization(undefined, 'owner', authorization))
})
test('expired and previously claimed drafts cannot be sent', () => {
  for (const status of ['sending', 'sent', 'unknown']) assert.throws(() => assertAuthorization({ ...draft, status }, 'owner', authorization))
  assert.throws(() => assertAuthorization({ ...draft, expires_at: new Date(0) }, 'owner', authorization))
})
test('webhook authentication fails closed and signs exact raw bytes', () => {
  const raw = Buffer.from('{ "event": "message_received" }')
  delete process.env.UNIPILE_WEBHOOK_SECRET
  assert.equal(verifyWebhook(raw), false)
  process.env.UNIPILE_WEBHOOK_SECRET = 'test-secret'
  const signature = crypto.createHmac('sha256', 'test-secret').update(raw).digest('hex')
  assert.equal(verifyWebhook(raw, signature), true)
  assert.equal(verifyWebhook(Buffer.from('{}'), signature), false)
  assert.equal(verifyWebhook(raw, undefined, 'test-secret'), true)
  assert.equal(verifyWebhook(raw, undefined, 'bad'), false)
})
test('normalizes actual Unipile audio and ignores sent messages', () => {
  const result = normalizeWebhook({ event: 'message_received', account_id: 'a', message_id: 'm', chat_id: 'c', timestamp: '2026-09-14T01:00:00Z', sender: { attendee_provider_id: 'self', attendee_name: 'Me' }, account_info: { user_id: 'self' }, attachments: [{ id: 'audio-id', type: 'audio', mimetype: 'audio/ogg' }] })
  assert.equal(result.data.type, 'audio')
  assert.equal(result.data.attachment_id, 'audio-id')
  assert.equal(result.data.from_me, true)
  assert.equal(result.data.chat_id, 'c')
  assert.throws(() => normalizeWebhook({ event: 'message_received' }))
})

test('connection progress does not masquerade as disconnection', () => {
  for (const message of ['CREATION_SUCCESS','CONNECTING']) assert.equal(normalizeWebhook({AccountStatus:{account_id:'a',message}}).event,'account_pending')
  for (const message of ['OK','SYNC_SUCCESS','RECONNECTED']) assert.equal(normalizeWebhook({AccountStatus:{account_id:'a',message}}).event,'account_connected')
  assert.equal(normalizeWebhook({AccountStatus:{account_id:'a',message:'CREDENTIALS'}}).event,'account_disconnected')
})

import { seal, unseal } from '../whatsapp/baileys-auth'
import { normalizeIncoming, assertLiveAccount } from '../whatsapp/baileys.service'
test('Baileys credentials are encrypted and tampering fails closed', () => {
  process.env.BAILEYS_AUTH_KEY='test-key-only-012345678901234567890123456789'
  const encrypted=seal('private session keys')
  assert.equal(unseal(encrypted),'private session keys')
  assert.ok(!encrypted.includes('private session keys'))
  const bytes=Buffer.from(encrypted,'base64');bytes[30]^=1
  assert.throws(()=>unseal(bytes.toString('base64')))
})
test('Baileys receives groups and wrapped audio without ingesting own/system messages', async () => {
  const lib=await import('@whiskeysockets/baileys')
  const raw={key:{id:'a',remoteJid:'123@g.us',participant:'456@s.whatsapp.net',fromMe:false},pushName:'Pessoa',messageTimestamp:1700000000,message:{ephemeralMessage:{message:{audioMessage:{mimetype:'audio/ogg',url:'https://example.invalid/audio',mediaKey:Buffer.from('test')}}}}}
  const result=normalizeIncoming(raw,'account-one',lib)!
  assert.equal(result.data.type,'audio');assert.equal(result.data.is_group,true);assert.equal(result.data.chat_id,'123@g.us')
  assert.notEqual(result.data.id,normalizeIncoming(raw,'account-two',lib)!.data.id)
  assert.equal(normalizeIncoming({...raw,key:{...raw.key,fromMe:true}},'account-one',lib),null)
  assert.equal(normalizeIncoming({...raw,key:{...raw.key,remoteJid:'status@broadcast'}},'account-one',lib),null)
  assert.equal(normalizeIncoming({...raw,message:{protocolMessage:{}}},'account-one',lib),null)
  assert.equal(normalizeIncoming({...raw,message:{viewOnceMessage:{message:{audioMessage:{}}}}},'account-one',lib),null)
})
test('Baileys sender requires exact live owner, session, account and supported recipient', () => {
  const d={user_id:'owner',session_id:'session',account_id:'account',chat_id:'123@g.us'}
  const r={open:true,stopped:false,session:{user_id:'owner',id:'session',unipile_account_id:'account'}}
  assert.doesNotThrow(()=>assertLiveAccount(d,r))
  for(const patch of [{user_id:'other'},{session_id:'other'},{account_id:'other'},{chat_id:'status@broadcast'}])assert.throws(()=>assertLiveAccount({...d,...patch},r))
  assert.throws(()=>assertLiveAccount(d,{...r,open:false}))
  assert.throws(()=>assertLiveAccount(d,{...r,stopped:true}))
})
