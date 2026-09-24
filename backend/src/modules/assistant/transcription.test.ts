import test from 'node:test'
import assert from 'node:assert/strict'
import { transcribeAudio } from './transcription'

test('Transcription: sends WhatsApp voice notes as ogg in Portuguese and bounds the result', async () => {
  const originalFetch = global.fetch
  try {
    global.fetch = (async (url: any, options: any) => {
      assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions')
      assert.equal(options.headers.Authorization, 'Bearer test-only-placeholder')
      const file = options.body.get('file')
      assert.equal(file.name, 'audio.ogg')
      assert.equal(file.type, 'audio/ogg')
      assert.equal(options.body.get('language'), 'pt')
      return new Response(JSON.stringify({ text: '  chego às dez  ' }))
    }) as typeof fetch
    assert.equal(await transcribeAudio(Buffer.from('fixture'), 'audio/ogg; codecs=opus', 'test-only-placeholder'), 'chego às dez')
    global.fetch = (async () => new Response('{}', { status: 429 })) as typeof fetch
    await assert.rejects(transcribeAudio(Buffer.from('fixture'), 'audio/ogg', 'test-only-placeholder'), /429/)
  } finally { global.fetch = originalFetch }
})
