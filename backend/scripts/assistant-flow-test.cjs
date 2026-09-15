// Disposable DB. OpenAI and delivery are simulated; no real messages are sent.
process.env.JWT_SECRET = 'test-only-secret-at-least-thirty-two-characters'
process.env.OPENAI_API_KEY = 'test-only-placeholder'
const assert = require('node:assert/strict'), express = require('express'), jwt = require('jsonwebtoken')
const { db } = require('../dist/database/connection')
const { assistantRouter } = require('../dist/modules/assistant/assistant.routes')
const { sendDraft } = require('../dist/modules/assistant/replies')
const { saveMessage } = require('../dist/modules/messages/messages.service')
async function main() {
  assert.ok((await db.query('SELECT current_database() AS name')).rows[0].name.endsWith('_test'))
  const owner = (await db.query("INSERT INTO users(email,password_hash) VALUES($1,'fixture') RETURNING id", [`flow-${Date.now()}@example.invalid`])).rows[0].id
  const other = (await db.query("INSERT INTO users(email,password_hash) VALUES($1,'fixture') RETURNING id", [`other-${Date.now()}@example.invalid`])).rows[0].id
  const originalFetch = global.fetch
  let server, modelCalls = 0, sends = 0
  try {
    const session = (await db.query("INSERT INTO whatsapp_sessions(user_id,unipile_account_id,status) VALUES($1,$2,'connected') RETURNING id",[owner,`fixture-${owner}`])).rows[0].id
    const message = await saveMessage(owner,session,{event:'message_received',account_id:`fixture-${owner}`,data:{id:`flow-${owner}`,chat_id:'fixture-chat',from_me:false,text:'Pode confirmar o recebimento?',timestamp:Date.now()/1000,type:'text',sender:{id:'fixture',display_name:'Contato teste'}}})
    global.fetch = async (url, options) => {
      if (String(url).startsWith('http://127.0.0.1:')) return originalFetch(url,options)
      assert.equal(url,'https://api.openai.com/v1/responses')
      const request = JSON.parse(options.body)
      assert.equal(request.tools,undefined)
      assert.equal(JSON.parse(request.input).received_messages[0].id,message.id)
      modelCalls++
      return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Recebi, obrigado!'}]}]}))
    }
    const app = express(); app.use(express.json()); app.use('/api/assistant',assistantRouter)
    server = await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',()=>resolve(s)) })
    const endpoint = `http://127.0.0.1:${server.address().port}/api/assistant/suggest`
    const query = token => fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({message_id:message.id,instruction:'Confirme que recebi'})})
    assert.equal((await query()).status,401)
    assert.equal((await query(jwt.sign({sub:other},process.env.JWT_SECRET))).status,404)
    assert.equal(modelCalls,0,'Unowned messages never reach OpenAI')
    const response = await query(jwt.sign({sub:owner},process.env.JWT_SECRET))
    assert.equal(response.status,200)
    const draft = (await response.json()).data
    assert.equal(draft.content,'Recebi, obrigado!'); assert.equal(draft.chat_id,'fixture-chat'); assert.equal(draft.status,'draft')
    assert.equal(sends,0,'Suggestion only creates a review draft')
    const input={authorize:true,confirmation_token:draft.confirmation_token,chat_id:draft.chat_id,content:draft.content}
    const deliver = async d => { sends++; assert.equal(d.content,'Recebi, obrigado!'); return {message_id:'simulated'} }
    await assert.rejects(sendDraft(owner,draft.id,{...input,content:'Other text'},deliver))
    const pair = await Promise.allSettled([sendDraft(owner,draft.id,input,deliver),sendDraft(owner,draft.id,input,deliver)])
    assert.equal(pair.filter(x=>x.status==='fulfilled').length,1); assert.equal(sends,1)
    console.log('PASS: authenticated suggestion -> exact review draft -> explicit send once; cross-user access blocked; no real delivery')
  } finally {
    global.fetch=originalFetch
    if(server) await new Promise(resolve=>server.close(resolve))
    await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[owner,other]])
  }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
