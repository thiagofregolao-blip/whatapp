const assert=require('node:assert/strict'); const {db}=require('../dist/database/connection')
const base=process.env.TEST_API_URL||'http://127.0.0.1:43101'
async function req(path,body,token,extra={}) {const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} : {}),...extra},body:body?JSON.stringify(body):undefined});return {status:r.status,json:await r.json()}}
async function run(){
 assert.ok((await db.query('SELECT current_database() AS n')).rows[0].n.endsWith('_test'))
 let user
 try {
 const r=await req('/api/auth/register',{email:`test-${Date.now()}@example.invalid`,password:'TestOnly-pass123',name:'API Test'});assert.equal(r.status,201);user=r.json.data.user.id;const token=r.json.data.access_token
 assert.equal((await req('/api/whatsapp/messages')).status,401)
 assert.equal((await req('/api/whatsapp/status',null,token)).json.data,null)
 assert.equal((await req('/api/whatsapp/connect',{},token)).status,400)
 assert.match((await req('/api/assistant/chat',{question:'O que chegou?'},token)).json.data.answer,/Não há mensagens/)
 await db.query("INSERT INTO whatsapp_sessions(user_id,unipile_account_id,status) VALUES($1,$2,'connected')",[user,`http-${user}`])
 const event={event:'message_received',account_id:`http-${user}`,message_id:`audio-${user}`,chat_id:'chat-test',timestamp:new Date().toISOString(),sender:{attendee_provider_id:'someone',attendee_name:'Test sender'},attachments:[{id:'test-audio',mimetype:'audio/ogg',type:'audio'}]}
 assert.equal((await req('/api/whatsapp/webhook',event)).status,401)
 for(let i=0;i<2;i++) assert.equal((await req('/api/whatsapp/webhook',event,null,{'x-webhook-secret':'local-test-webhook'})).status,200)
 const messages=(await req('/api/whatsapp/messages',null,token)).json.data;assert.equal(messages.length,1);assert.equal(messages[0].media_type,'audio')
 assert.equal((await req('/api/assistant/chat',{question:'O que chegou?'},token)).status,503)
 const draft=(await req('/api/assistant/drafts',{message_id:messages[0].id,content:'Resposta de teste'},token)).json.data
 assert.equal((await req(`/api/assistant/drafts/${draft.id}/send`,{authorize:false},token)).status,400)
 assert.equal((await req('/api/whatsapp/messages/'+messages[0].id+'/audio',null,token)).status,503)
 assert.equal((await db.query('SELECT status FROM reply_drafts WHERE id=$1',[draft.id])).rows[0].status,'draft')
 console.log('PASS: HTTP auth, disconnected state, missing keys, webhook authentication, audio persistence, deduplication, send rejection')
 }finally{if(user)await db.query('DELETE FROM users WHERE id=$1',[user])}
}
run().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})
