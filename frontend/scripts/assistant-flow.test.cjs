const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.join(__dirname, '../src/lib/assistant-flow.ts')
const loaded = new Module(file, module)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file)
const { unseenMessages, confirmationMatches, canConfirm } = loaded.exports

test('Inbox does not announce existing history or repeat the same message', () => {
  const a = {id:'a'}, b = {id:'b'}
  assert.deepEqual(unseenMessages(null, [a]), [])
  assert.deepEqual(unseenMessages(new Set(['a']), [b, a]), [b])
  assert.deepEqual(unseenMessages(new Set(['a', 'b']), [b, a]), [])
})
test('Voice consent requires exact phrase and code; unrelated yes and negation never send', () => {
  for (const text of ['confirmo envio 4821', 'Confirmo envio quatro oito dois um.', 'confirmo o envio código 4 8 2 1']) assert.equal(confirmationMatches(text, '4821'), true)
  for (const text of ['sim', 'pode responder', 'pode enviar', 'não confirmo envio 4821', 'confirmo envio 1234', 'ele disse confirmo envio 4821', 'confirmo envio 4821 mas espera', 'confirmo envio 4821? não', 'confirmo envio']) assert.equal(confirmationMatches(text, '4821'), false, text)
})
test('Late transcripts cannot authorize a replacement, cancelled or expired draft', () => {
  const draft = {id:'current', voice_code:'4821', expires_at:new Date(2000).toISOString()}
  assert.equal(canConfirm(draft,'current','confirmo envio 4821',1000),true)
  assert.equal(canConfirm(draft,'previous','confirmo envio 4821',1000),false)
  assert.equal(canConfirm(null,'current','confirmo envio 4821',1000),false)
  assert.equal(canConfirm(draft,'current','confirmo envio 4821',2001),false)
})
