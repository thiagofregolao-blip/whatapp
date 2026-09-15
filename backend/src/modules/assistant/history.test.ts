import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeIncoming } from '../whatsapp/baileys.service'
test('History can import sent messages without accepting system or view-once content', () => {
  const lib = { normalizeMessageContent: (message:any) => message, BufferJSON: { replacer: undefined } }
  const raw = { key:{id:'fixture',remoteJid:'5511000000000@s.whatsapp.net',fromMe:true}, messageTimestamp:1700000000, message:{conversation:'Resposta enviada'} }
  assert.equal(normalizeIncoming(raw,'account',lib),null)
  assert.equal(normalizeIncoming(raw,'account',lib,true)?.data.from_me,true)
  assert.equal(normalizeIncoming({...raw,message:{protocolMessage:{}}},'account',lib,true),null)
  assert.equal(normalizeIncoming({...raw,message:{viewOnceMessage:{}}},'account',lib,true),null)
})
