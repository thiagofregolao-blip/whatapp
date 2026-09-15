import test from 'node:test'
import assert from 'node:assert/strict'
import { askLuna, createVoiceCall, realtimeConfig } from './openai'

test('OpenAI: bounded read-only requests, response parsing and secret stays server-side', async () => {
  const originalFetch = global.fetch
  const key = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL
  process.env.OPENAI_API_KEY = 'test-only-placeholder'
  delete process.env.OPENAI_MODEL
  try {
    global.fetch = (async (url: any, options: any) => {
      assert.equal(url, 'https://api.openai.com/v1/responses')
      const body = JSON.parse(options.body)
      assert.equal(body.model, 'gpt-5.6-luna')
      assert.equal(body.store, false)
      assert.equal(body.tools, undefined)
      assert.equal(JSON.parse(body.input).received_messages[0].content, 'fixture')
      return new Response(JSON.stringify({status:'completed', output:[{type:'message',content:[{type:'output_text',text:'Resposta de teste'}]}]}))
    }) as typeof fetch
    assert.equal(await askLuna('Resumo?', [{content:'fixture'}], []), 'Resposta de teste')
    global.fetch = (async (_url: any, options: any) => {
      const session = JSON.parse(options.body.get('session'))
      assert.deepEqual(session.tools.map((t: any) => t.name), ['consultar_luna', 'abrir_mensagem', 'preparar_resposta', 'cancelar_resposta', 'ouvir_audio'])
      assert.equal(options.body.get('sdp'), 'v=0\r\nfixture')
      assert.ok(!JSON.stringify(session).includes('test-only-placeholder'))
      return new Response('v=0\r\nanswer')
    }) as typeof fetch
    assert.equal(await createVoiceCall('v=0\r\nfixture'), 'v=0\r\nanswer')
    assert.ok(realtimeConfig().tools.every(t => !/enviar|send|autorizar/.test(t.name)))
    global.fetch = (async () => new Response('{}', {status:401})) as typeof fetch
    await assert.rejects(askLuna('oi', [], []), /401/)
    delete process.env.OPENAI_API_KEY
    await assert.rejects(createVoiceCall('v=0\r\nfixture'), /OPENAI_API_KEY/)
  } finally {
    global.fetch = originalFetch
    if (key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = key
    if (model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = model
  }
})
