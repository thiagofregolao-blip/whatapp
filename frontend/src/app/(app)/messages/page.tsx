'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { Avatar, icons } from '@/components/nexo-ui'
const { Search, ChevronRight, ArrowLeft, Send, Star, Sparkles, Check, MessageCircle, Link2, SquarePen, ArrowRight, X } = icons
interface Conversation { id: string | null; chat_id: string; chat_name: string; chat_type: string; sender_name?: string; content?: string; media_type?: string; sent_at?: string; outgoing_content?: string; outgoing_at?: string; from_me?: boolean; draft_content?: string }
interface Entry { id: string; content: string; media_type: string; sender_name: string; sent_at: string; from_me: boolean }
function name(c: Conversation) { return c.chat_name || c.sender_name || 'Contato' }
function when(value?: string) {
  if (!value) return ''
  const d=new Date(value),now=new Date(),yesterday=new Date(); yesterday.setDate(now.getDate()-1)
  if(d.toDateString()===now.toDateString()) return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
  if(d.toDateString()===yesterday.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR',Date.now()-d.getTime()<6*86400000?{weekday:'long'}:{day:'2-digit',month:'short'})
}
export default function Conversations() {
  const {session,user,refreshUser}=useApp()
  const router=useRouter()
  const [rows,setRows]=useState<Conversation[]>([]),[active,setActive]=useState<Conversation|null>(null),[entries,setEntries]=useState<Entry[]>([])
  const [query,setQuery]=useState<string|null>(null),[favorites,setFavorites]=useState<string[]>([]),[read,setRead]=useState<Record<string,string>>({})
  const [reply,setReply]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(true),[threadLoading,setThreadLoading]=useState(false)
  const [compose,setCompose]=useState(false),[contactQuery,setContactQuery]=useState(''),[contacts,setContacts]=useState<any[]>([]),[contactLoading,setContactLoading]=useState(false)
  const [syncing,setSyncing]=useState(false),[syncNotice,setSyncNotice]=useState(''),[onlyDrafts,setOnlyDrafts]=useState(false)
  const sending=useRef(false),bottom=useRef<HTMLDivElement>(null),selectedId=useRef<string|null>(null)
  const store=`nexo-inbox:${user?.id || 'anonymous'}`
  useEffect(() => {if (!user?.id) return;try {const saved=JSON.parse(localStorage.getItem(store)||'{}');setRead(saved.read||{});setFavorites(saved.favorites||[])}catch{}},[store,user?.id])
  function persist(nextRead=read,nextFavorites=favorites){setRead(nextRead);setFavorites(nextFavorites);localStorage.setItem(store,JSON.stringify({read:nextRead,favorites:nextFavorites}))}
  useEffect(() => {const toggle=()=>setQuery(old=>old===null?'':null);window.addEventListener('luna-search',toggle);return()=>window.removeEventListener('luna-search',toggle)},[])
  useEffect(() => {
    let alive=true,inflight=false,loaded=false
    async function refresh(){if(inflight)return;inflight=true;try{const data:Conversation[]=[];let batch:Conversation[];do{batch=await api(`/api/whatsapp/messages/conversations?offset=${data.length}`);data.push(...batch)}while(!loaded&&batch.length===100&&alive);if(alive){const first=!loaded;setRows(old=>first?data:[...data,...old.filter(c=>!data.some(n=>n.chat_id===c.chat_id))]);loaded=true}}catch(e:any){if(alive)setError(e.message)}finally{inflight=false;if(alive)setLoading(false)}}
    refresh();const timer=setInterval(refresh,5000)
    const sent=(e:Event)=>{const d=(e as CustomEvent).detail;if(selectedId.current===d.chat_id)setReply('');setRows(old=>old.map(c=>c.chat_id===d.chat_id?{...c,draft_content:undefined,outgoing_content:d.content,outgoing_at:new Date().toISOString(),from_me:true}:c));refresh()}
    const draft=(e:Event)=>{const d=(e as CustomEvent).detail;setRows(old=>old.some(c=>c.chat_id===d.chat_id)?old.map(c=>c.chat_id===d.chat_id?{...c,draft_content:d.content}:c):[{id:null,chat_id:d.chat_id,chat_name:d.recipient,chat_type:'individual',draft_content:d.content},...old]);selectedId.current=d.chat_id;setActive({id:d.message_id||null,chat_id:d.chat_id,chat_name:d.recipient,chat_type:d.chat_id.endsWith('@g.us')?'group':'individual',draft_content:d.content});setReply(d.content);window.scrollTo(0,0)}
    window.addEventListener('luna-draft',draft);window.addEventListener('luna-sent',sent)
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('luna-draft',draft);window.removeEventListener('luna-sent',sent)}
  },[])
  const activeChatId=active?.chat_id
  useEffect(()=>{if(!activeChatId)return;let alive=true,inflight=false;setThreadLoading(true);async function refresh(){if(inflight)return;inflight=true;try{const data=await api(`/api/whatsapp/messages/conversations/${encodeURIComponent(activeChatId!)}`);if(alive)setEntries(data)}catch(e:any){if(alive)setError(e.message)}finally{inflight=false;if(alive)setThreadLoading(false)}}refresh();const timer=setInterval(refresh,5000);return()=>{alive=false;clearInterval(timer)}},[activeChatId])
  useEffect(()=>{bottom.current?.parentElement?.scrollTo({top:bottom.current.parentElement.scrollHeight})},[entries.length])
  useEffect(()=>{if(!compose)return;let alive=true;setContactLoading(true);const timer=setTimeout(()=>api(`/api/whatsapp/contacts?q=${encodeURIComponent(contactQuery)}`).then(data=>{if(alive)setContacts(data.contacts)}).catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setContactLoading(false)}),200);return()=>{alive=false;clearTimeout(timer)}},[compose,contactQuery])
  function open(c:Conversation){window.scrollTo(0,0);selectedId.current=c.chat_id;setActive(c);setEntries([]);setReply(c.draft_content||'');setError('');setCompose(false);persist({...read,[c.chat_id]:c.sent_at||new Date().toISOString()});if(c.id)window.dispatchEvent(new CustomEvent('luna-select',{detail:c.id}))}
  const unread=(c:Conversation)=>Boolean(c.sent_at)&&!c.from_me&&(!c.outgoing_at||Date.parse(c.sent_at!)>Date.parse(c.outgoing_at))&&(!read[c.chat_id]||Date.parse(c.sent_at!)>Date.parse(read[c.chat_id]))
  const visible=rows.filter(c=>`${name(c)} ${c.content||''} ${c.outgoing_content||''}`.toLocaleLowerCase('pt-BR').includes((query||'').toLocaleLowerCase('pt-BR'))&&(!onlyDrafts||c.draft_content))
  const drafts=rows.filter(c=>c.draft_content).length
  async function sync(){if(syncing)return;setSyncing(true);setError('');try{const data=await api('/api/whatsapp/history/sync',{method:'POST'});setSyncNotice(data.message);await refreshUser()}catch(e:any){setError(e.message)}finally{setSyncing(false)}}
  async function send(){if(!active||!reply.trim()||sending.current)return;const chat=active,text=reply.trim();sending.current=true;setBusy(true);setError('');try{const draft=await api('/api/assistant/drafts',{method:'POST',body:JSON.stringify({chat_id:chat.chat_id,content:text})});await api(`/api/assistant/drafts/${draft.id}/send`,{method:'POST',body:JSON.stringify({authorize:true,confirmation_token:draft.confirmation_token,chat_id:draft.chat_id,content:draft.content})});if(selectedId.current===chat.chat_id){setReply('');setEntries(old=>[...old,{id:draft.id,content:text,media_type:'text',sender_name:'Você',sent_at:new Date().toISOString(),from_me:true}])}window.dispatchEvent(new CustomEvent('luna-sent',{detail:{chat_id:chat.chat_id,content:text}}))}catch(e:any){setError(e.message)}finally{sending.current=false;setBusy(false)}}
  return <main className={`conversations-page ${active?'thread-open':''}`}>
    <section className="conversation-list">
      <button className="message-summary" onClick={()=>drafts?setOnlyDrafts(!onlyDrafts):session?.history_received_at?router.push('/assistant'):sync()} disabled={syncing||(!drafts&&session?.status!=='connected')}>
        <Sparkles size={32}/><span><strong>{drafts?`${drafts} ${drafts===1?'resposta pronta':'respostas prontas'}`:syncing?'Solicitando histórico…':session?.history_received_at?'Luna ao seu lado':'Sincronizar conversas'}</strong><small>{drafts?'Luna preparou seus rascunhos':session?.history_received_at?'Leia e responda por voz':session?.history_requested_at?'Aguardando o histórico do WhatsApp':'Traga suas conversas do WhatsApp'}</small></span><i><ArrowRight size={24}/></i>
      </button>
      {syncNotice&&<p className="sync-note">{syncNotice}</p>}
      {session?.history_error&&<p className="sync-note">{session.history_error}</p>}
      {session?.history_requested_at&&!session?.history_received_at&&Date.now()-Date.parse(session.history_requested_at)>120000&&<p className="sync-note">O WhatsApp ainda não entregou o histórico. Mantenha o celular online. Se continuar assim, <Link href="/onboarding/connect">conecte novamente pelo QR</Link>.</p>}
      {query!==null&&<label className="nexo-search"><Search size={20}/><input autoFocus placeholder="Buscar pessoas ou mensagens" aria-label="Buscar pessoas ou mensagens" value={query} onChange={e=>setQuery(e.target.value)}/></label>}
      <div className="recent-heading"><h2>{onlyDrafts?'Rascunhos':'Recentes'}</h2>{onlyDrafts&&<button onClick={()=>setOnlyDrafts(false)}>Ver todas</button>}</div>
      {error&&<p className="nexo-error" role="alert">{error}</p>}
      {loading&&<p className="empty-copy">Carregando conversas…</p>}
      {!loading&&!visible.length&&<div className="empty-copy"><MessageCircle/><p>{query?'Nenhuma conversa encontrada.':'Suas conversas aparecerão aqui.'}</p>{session?.status!=='connected'&&<Link href="/onboarding/connect"><Link2 size={16}/>Conectar WhatsApp</Link>}</div>}
      {visible.map(c=>{const outgoing=c.outgoing_at&&(!c.sent_at||Date.parse(c.outgoing_at)>Date.parse(c.sent_at));return <button className={`conversation-row ${c.draft_content?'has-draft':''} ${active?.chat_id===c.chat_id?'active':''}`} key={c.chat_id} onClick={()=>open(c)}><Avatar name={name(c)} group={c.chat_type==='group'} chatId={c.chat_id}/><span className="conversation-copy"><strong>{name(c)}</strong><span>{outgoing?`Você: ${c.outgoing_content}`:c.from_me?`Você: ${c.content||'Anexo'}`:c.media_type==='audio'?'Mensagem de áudio':c.content||'Histórico aguardando sincronização'}</span>{c.draft_content&&<em><Sparkles size={16}/>Rascunho da Luna</em>}</span><span className="conversation-meta"><time>{when(outgoing?c.outgoing_at:c.sent_at)}</time>{unread(c)&&<i className="unread-dot" aria-label="Não lida neste app"/>}</span></button>})}
      <button className="compose-fab" aria-label="Nova mensagem" onClick={()=>{setCompose(true);setContactQuery('')}}><SquarePen size={27}/></button>
    </section>
    {active&&<section className="chat-panel"><header className="chat-heading"><button className="icon-button" aria-label="Voltar" onClick={()=>{setActive(null);selectedId.current=null}}><ArrowLeft/></button><Avatar name={name(active)} group={active.chat_type==='group'} chatId={active.chat_id}/><strong>{name(active)}</strong><button className="icon-button" aria-label="Favoritar" onClick={()=>persist(read,favorites.includes(active.chat_id)?favorites.filter(x=>x!==active.chat_id):[...favorites,active.chat_id])}><Star fill={favorites.includes(active.chat_id)?'currentColor':'none'}/></button></header><div className="chat-entries">{threadLoading?<p className="chat-context">Abrindo conversa…</p>:entries.length===0?<p className="chat-context">Nenhuma mensagem sincronizada nesta conversa.</p>:entries.map(m=><div key={m.id} className={`chat-bubble ${m.from_me?'outgoing':''}`}>{!m.from_me&&active.chat_type==='group'&&<strong>{m.sender_name}</strong>}<p>{m.content||(m.media_type==='audio'?'Mensagem de áudio':'Anexo recebido')}</p>{m.media_type==='audio'&&!m.from_me&&<Link href={`/assistant?message=${m.id}`}>Ouvir com Luna →</Link>}<time>{when(m.sent_at)}{m.from_me&&<Check size={12}/>}</time></div>)}<div ref={bottom}/></div>{error&&<p className="nexo-error" role="alert">{error}</p>}<div className="chat-composer">{active.id&&<Link className="suggest-link" href={`/assistant?message=${active.id}`}><Sparkles size={17}/>Pedir ajuda à Luna<ChevronRight size={16}/></Link>}<form onSubmit={e=>{e.preventDefault();send()}}><textarea aria-label="Mensagem" placeholder="Escreva sua mensagem…" value={reply} onChange={e=>setReply(e.target.value)} disabled={busy} rows={2} maxLength={4000}/><button className="nexo-primary send-button" aria-label="Enviar mensagem" disabled={busy||!reply.trim()}><Send size={20}/></button></form></div></section>}
    {compose&&<div className="contact-overlay"><section className="contact-sheet" role="dialog" aria-modal="true" aria-label="Nova mensagem"><header><h2>Nova mensagem</h2><button className="icon-button" aria-label="Fechar contatos" onClick={()=>setCompose(false)}><X/></button></header><label className="nexo-search"><Search size={20}/><input autoFocus placeholder="Nome do contato" value={contactQuery} onChange={e=>setContactQuery(e.target.value)}/></label>{contactLoading?<p>Buscando contatos…</p>:contacts.length?contacts.map(c=><button className="contact-result" key={c.chat_id} onClick={()=>open({id:null,chat_id:c.chat_id,chat_name:c.name,chat_type:c.chat_id.endsWith('@g.us')?'group':'individual'})}><Avatar name={c.name} chatId={c.chat_id}/><strong>{c.name}</strong><ChevronRight size={18}/></button>):<p>Nenhum contato encontrado na agenda sincronizada.</p>}</section></div>}
  </main>
}
