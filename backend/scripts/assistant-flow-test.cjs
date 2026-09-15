// Disposable DB. OpenAI and delivery are simulated; no real messages are sent.
process.env.JWT_SECRET = 'test-only-secret-at-least-thirty-two-characters'
process.env.OPENAI_API_KEY = 'test-only-placeholder'
process.env.AI_KEYS_ENCRYPTION_KEY = 'fixture-master-secret-at-least-32-characters'
const assert = require('node:assert/strict'), express = require('express'), jwt = require('jsonwebtoken')
const { db } = require('../dist/database/connection')
const { assistantRouter, messagesRouter } = require('../dist/modules/assistant/assistant.routes')
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
      if (String(url).startsWith('https://api.openai.com/v1/models/')) return new Response('{}')
      assert.equal(url,'https://api.openai.com/v1/responses')
      assert.equal(options.headers.Authorization, 'Bearer sk-fixture-personal-key-at-least-20')
      const request = JSON.parse(options.body)
      assert.equal(request.tools,undefined)
      assert.equal(JSON.parse(request.input).received_messages[0].id,message.id)
      modelCalls++
      return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Recebi, obrigado!'}]}]}))
    }
    const app = express(); app.use(express.json()); app.use('/api/assistant',assistantRouter); app.use('/api/whatsapp/messages',messagesRouter)
    server = await new Promise(resolve => { const s=app.listen(0,'127.0.0.1',()=>resolve(s)) })
    const endpoint = `http://127.0.0.1:${server.address().port}/api/assistant/suggest`
    const query = token => fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json', ...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({message_id:message.id,instruction:'Confirme que recebi'})})
    assert.equal((await query()).status,401)
    assert.equal((await query(jwt.sign({sub:other},process.env.JWT_SECRET))).status,404)
    assert.equal(modelCalls,0,'Unowned messages never reach OpenAI')
    const root = endpoint.replace('/api/assistant/suggest','')
    const headers = { 'Content-Type':'application/json', Authorization:`Bearer ${jwt.sign({sub:owner},process.env.JWT_SECRET)}` }
    const status = async (tokenHeaders=headers) => (await (await fetch(root+'/api/assistant/status',{headers:tokenHeaders})).json()).data
    assert.equal((await status()).configured,false,'New users cannot consume global API key')
    const saved = await fetch(root+'/api/assistant/settings',{method:'PUT',headers,body:JSON.stringify({mode:'personal',api_key:'sk-fixture-personal-key-at-least-20'})})
    assert.equal(saved.status,200)
    assert.equal((await status()).configured,true)
    assert.ok(!JSON.stringify(await status()).includes('sk-fixture'))
    const stored = (await db.query('SELECT encrypted_key FROM user_ai_settings WHERE user_id=$1',[owner])).rows[0].encrypted_key
    assert.ok(!stored.includes('sk-fixture'))
    assert.equal((await status({Authorization:`Bearer ${jwt.sign({sub:other},process.env.JWT_SECRET)}`})).configured,false)
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
    const list = await (await fetch(root+'/api/whatsapp/messages/conversations',{headers})).json()
    assert.equal(list.data.length,1)
    const thread = await (await fetch(root+'/api/whatsapp/messages/conversations/fixture-chat',{headers})).json()
    assert.equal(thread.data.length,2); assert.ok(thread.data.some(m=>m.from_me))
    const foreign = await (await fetch(root+'/api/whatsapp/messages/conversations/fixture-chat',{headers:{Authorization:`Bearer ${jwt.sign({sub:other},process.env.JWT_SECRET)}`}})).json()
    assert.equal(foreign.data.length,0)
    const date = (await db.query("SELECT to_char(NOW() AT TIME ZONE timezone,'YYYY-MM-DD') AS day FROM users WHERE id=$1",[owner])).rows[0].day
    const beforeReport = modelCalls
    const report = () => fetch(root+'/api/assistant/reports',{method:'POST',headers,body:JSON.stringify({date})})
    const generated = await Promise.all([report(),report()])
    assert.ok(generated.every(r=>r.status===200))
    assert.equal(modelCalls,beforeReport+1,'Concurrent requests generate a daily report only once')
    const foreignReports = await (await fetch(root+'/api/assistant/reports',{headers:{Authorization:`Bearer ${jwt.sign({sub:other},process.env.JWT_SECRET)}`}})).json()
    assert.equal(foreignReports.data.length,0)
    await fetch(root+'/api/assistant/settings/key',{method:'DELETE',headers})
    assert.equal((await status()).configured,false,'Removing own key never falls back to platform')
    const sentHistory = await saveMessage(owner,session,{event:'message_received',account_id:`fixture-${owner}`,data:{id:`sent-history-${owner}`,chat_id:'fixture-chat',from_me:true,text:'Mensagem enviada no telefone',timestamp:Date.now()/1000,type:'text'}},{includeOutgoing:true})
    assert.ok(sentHistory)
    const outgoing = (await db.query('SELECT from_me FROM messages WHERE id=$1',[sentHistory.id])).rows[0]
    assert.equal(outgoing.from_me,true)
    await db.query('INSERT INTO whatsapp_chats(user_id,account_id,chat_id,name) VALUES($1,$2,$3,$4)',[owner,`fixture-${owner}`,'empty-history-chat','Conversa sem mensagens'])
    const allChats = await (await fetch(root+'/api/whatsapp/messages/conversations',{headers})).json()
    assert.ok(allChats.data.some(c=>c.chat_id==='empty-history-chat'))
    const bcrypt = require('bcryptjs')
    await db.query('UPDATE users SET password_hash=$2 WHERE id=$1',[owner,await bcrypt.hash('fixture-login-password',4)])
    const email = (await db.query('SELECT email FROM users WHERE id=$1',[owner])).rows[0].email
    const authService = require('../dist/modules/auth/auth.service')
    const logged = await authService.login({email:` ${email.toUpperCase()} `,password:'fixture-login-password'})
    assert.ok(logged.access_token)
    await assert.rejects(authService.login({email,password:'incorrect'}),/Credenciais/)
    const {rememberContacts,directory}=require('../dist/modules/whatsapp/contacts')
    const {createNamedDraft}=require('../dist/modules/assistant/replies')
    await rememberContacts(owner,`fixture-${owner}`,[{id:'551199900001@s.whatsapp.net',name:'José da Silva',lid:'123@lid'},{id:'551199900002@s.whatsapp.net',name:'Ana Souza'},{id:'551199900003@s.whatsapp.net',name:'Ana Lima'}])
    assert.equal((await directory(owner,'jose')).length,1,'Accent-insensitive contact search does not need a received message')
    assert.equal((await directory(other,'jose')).length,0,'Contact search remains scoped to the user')
    const ambiguous=await createNamedDraft(owner,'Ana','Mensagem fictícia')
    assert.equal(ambiguous.status,'ambiguous');assert.equal(ambiguous.contacts.length,2)
    assert.equal((await createNamedDraft(owner,'Inexistente','Teste')).status,'not_found')
    const named=await createNamedDraft(owner,'jose','Mensagem fictícia')
    assert.equal(named.message_id,null);assert.equal(named.chat_id,'551199900001@s.whatsapp.net')
    let namedSends=0
    const namedInput={authorize:true,confirmation_token:named.confirmation_token,chat_id:named.chat_id,content:named.content}
    const deliverNamed=async d=>{namedSends++;assert.equal(d.recipient,'José da Silva');return {message_id:'named-fixture'}}
    await assert.rejects(sendDraft(other,named.id,namedInput,deliverNamed))
    const namedPair=await Promise.allSettled([sendDraft(owner,named.id,namedInput,deliverNamed),sendDraft(owner,named.id,namedInput,deliverNamed)])
    assert.equal(namedPair.filter(r=>r.status==='fulfilled').length,1);assert.equal(namedSends,1)
    await db.query('UPDATE whatsapp_sessions SET unipile_account_id=$2 WHERE id=$1',[session,'switched-account'])
    assert.equal((await directory(owner,'jose')).length,0,'Old account contacts cannot receive new sends')
    console.log('PASS: personal key isolation/removal, encrypted storage, private conversations, cached daily report, send once, named contacts and ambiguity; no real delivery')
  } finally {
    global.fetch=originalFetch
    if(server) await new Promise(resolve=>server.close(resolve))
    await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[[owner,other]])
  }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
