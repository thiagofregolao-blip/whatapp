const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const file = path.join(__dirname, '../src/lib/assistant-flow.ts')
const loaded = new Module(file, module)
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, file)
const { unseenMessages, isSendCommand, takeVoiceTurn } = loaded.exports

test('Inbox does not announce existing history or repeat the same message', () => {
  const a = {id:'a'}, b = {id:'b'}
  assert.deepEqual(unseenMessages(null, [a]), [])
  assert.deepEqual(unseenMessages(new Set(['a']), [b, a]), [b])
  assert.deepEqual(unseenMessages(new Set(['a', 'b']), [b, a]), [])
})
test('Direct send commands need no code; quoted, negated or conditional speech is not consent', () => {
  for (const text of ['envia', 'Pode enviar!', 'Luna, manda essa mensagem', 'envie dizendo que não vou']) assert.equal(isSendCommand(text), true, text)
  for (const text of ['sim', 'sugira uma resposta', 'não envia', 'ele disse envia', 'envia depois', 'envia se ele responder']) assert.equal(isSendCommand(text), false, text)
})

test('Voice trace: one response per utterance, echoed speech and duplicates produce none',()=>{
 const seen=new Set()
 assert.equal(takeVoiceTurn(seen,'speech-1','oi',false),true)
 for(let i=0;i<5;i++)assert.equal(takeVoiceTurn(seen,'speech-1','oi',false),false)
 assert.equal(takeVoiceTurn(seen,'echo-1','oi',true),false)
 assert.equal(takeVoiceTurn(seen,'echo-1','oi',false),false)
 assert.equal(takeVoiceTurn(seen,'noise','',false),false)
 assert.equal(takeVoiceTurn(seen,'speech-2','procure Jacir',false),true)
})
