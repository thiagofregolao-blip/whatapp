// Disposable DB and ephemeral handshake. No phone linked or messages sent.
process.env.JWT_SECRET='fixture-secret-for-qr-flow-at-least-32-characters';process.env.BAILEYS_AUTH_KEY=process.env.JWT_SECRET;process.env.WHATSAPP_PROVIDER='baileys'
const assert=require('node:assert/strict'),express=require('express'),jwt=require('jsonwebtoken'),{db}=require('../dist/database/connection'),baileys=require('../dist/modules/whatsapp/baileys.service')
async function main(){
 assert.ok((await db.query('SELECT current_database() AS name')).rows[0].name.endsWith('_test'))
 const owner=(await db.query("INSERT INTO users(email,password_hash) VALUES($1,'fixture') RETURNING id",[`qr-${Date.now()}@example.invalid`])).rows[0].id
 let server
 try{
  const app=express();app.use(express.json());app.use('/api/whatsapp',require('../dist/modules/whatsapp/whatsapp.routes').default);app.use('/api/assistant',require('../dist/modules/assistant/assistant.routes').assistantRouter)
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});const root=`http://127.0.0.1:${server.address().port}`
  const web={Authorization:`Bearer ${jwt.sign({sub:owner,device:'web'},process.env.JWT_SECRET)}`},phone={Authorization:`Bearer ${jwt.sign({sub:owner,device:'pwa'},process.env.JWT_SECRET)}`}
  assert.equal((await fetch(root+'/api/whatsapp/connect',{method:'POST',headers:web})).status,200)
  let s;for(let i=0;i<40;i++){s=(await (await fetch(root+'/api/whatsapp/status',{headers:web})).json()).data;if(s?.qr_code)break;await new Promise(r=>setTimeout(r,500))}
  assert.ok(s?.qr_code,'Provider generated and persisted QR');assert.equal(s.status,'connecting')
  const pwa=(await (await fetch(root+'/api/whatsapp/status',{headers:phone})).json()).data;assert.equal(pwa.connection_id,s.connection_id)
  const again=(await (await fetch(root+'/api/whatsapp/connect',{method:'POST',headers:web})).json()).data;assert.equal(again.qr_code,s.qr_code)
  const events=(await (await fetch(root+'/api/assistant/diagnostics',{headers:phone})).json()).data;assert.ok(events.some(e=>e.event==='whatsapp.qr_ready'));assert.ok(!JSON.stringify(events).includes(s.qr_code))
  console.log('PASS: live QR persisted, web/PWA share connection, generation idempotent, diagnostics exclude QR; no phone linked or messages sent')
 }finally{baileys.shutdown();if(server)await new Promise(r=>server.close(r));await db.query('DELETE FROM users WHERE id=$1',[owner])}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
