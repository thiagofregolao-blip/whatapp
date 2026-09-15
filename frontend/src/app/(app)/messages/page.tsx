'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { Avatar, Orb, icons } from '@/components/nexo-ui'
const { Search, ChevronRight, ArrowLeft, Send, Star, Sparkles, Check, MessageCircle, Link2 } = icons
interface Conversation { id: string; chat_id: string; chat_name: string; chat_type: string; sender_name: string; content: string; media_type: string; sent_at: string; outgoing_content?: string; outgoing_at?: string }
interface Entry { id: string; content: string; media_type: string; sender_name: string; sent_at: string; from_me: boolean }
function name(c: Conversation) { return c.chat_name || c.sender_name || c.chat_id }
function when(value: string) { const date = new Date(value); return date.toDateString() === new Date().toDateString() ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) }
export default function Conversations() {
  const { session, user } = useApp()
  const [rows, setRows] = useState<Conversation[]>([]), [active, setActive] = useState<Conversation | null>(null), [entries, setEntries] = useState<Entry[]>([])
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('Todas'), [favorites, setFavorites] = useState<string[]>([]), [read, setRead] = useState<Record<string, string>>({})
  const [reply, setReply] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [loading, setLoading] = useState(true), [threadLoading, setThreadLoading] = useState(false)
  const sending = useRef(false), bottom = useRef<HTMLDivElement>(null), selectedId = useRef<string | null>(null)
  const store = `nexo-inbox:${user?.id || 'anonymous'}`
  useEffect(() => { if (!user?.id) return; try { const saved = JSON.parse(localStorage.getItem(store) || '{}'); setRead(saved.read || {}); setFavorites(saved.favorites || []) } catch {} }, [store, user?.id])
  function persist(nextRead = read, nextFavorites = favorites) { setRead(nextRead); setFavorites(nextFavorites); localStorage.setItem(store, JSON.stringify({ read: nextRead, favorites: nextFavorites })) }
  useEffect(() => {
    let alive = true, inflight = false
    async function refresh() { if (inflight) return; inflight = true; try { const data = await api('/api/whatsapp/messages/conversations'); if (alive) setRows(data) } catch (e: any) { if (alive) setError(e.message) } finally { inflight = false; if (alive) setLoading(false) } }
    refresh(); const timer = setInterval(refresh, 5000); return () => { alive = false; clearInterval(timer) }
  }, [])
  const activeChatId = active?.chat_id
  useEffect(() => {
    if (!activeChatId) return
    const chatId = activeChatId
    let alive = true, inflight = false
    setThreadLoading(true)
    async function refresh() { if (inflight) return; inflight = true; try { const data = await api(`/api/whatsapp/messages/conversations/${encodeURIComponent(chatId)}`); if (alive) setEntries(data) } catch (e: any) { if (alive) setError(e.message) } finally { inflight = false; if (alive) setThreadLoading(false) } }
    refresh(); const timer = setInterval(refresh, 5000); return () => { alive = false; clearInterval(timer) }
  }, [activeChatId])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }) }, [entries.length])
  function open(c: Conversation) { selectedId.current = c.chat_id; setActive(c); setEntries([]); setReply(''); setError(''); persist({ ...read, [c.chat_id]: c.sent_at }) }
  const unread = (c: Conversation) => !read[c.chat_id] || Date.parse(c.sent_at) > Date.parse(read[c.chat_id])
  const visible = rows.filter(c => `${name(c)} ${c.content || ''} ${c.outgoing_content || ''}`.toLowerCase().includes(query.toLowerCase()) && (filter !== 'Não lidas' || unread(c)) && (filter !== 'Favoritas' || favorites.includes(c.chat_id)) && (filter !== 'Grupos' || c.chat_type === 'group'))
  async function send() {
    if (!active || !reply.trim() || sending.current) return
    const target = active, content = reply.trim(); sending.current = true; setBusy(true); setError('')
    try {
      const d = await api('/api/assistant/drafts', { method: 'POST', body: JSON.stringify({ message_id: target.id, content }) })
      if (selectedId.current !== target.chat_id) throw new Error('Conversa alterada; mensagem não enviada.')
      await api(`/api/assistant/drafts/${d.id}/send`, { method: 'POST', body: JSON.stringify({ authorize: true, confirmation_token: d.confirmation_token, chat_id: d.chat_id, content: d.content }) })
      if (selectedId.current === target.chat_id) { setReply(''); setEntries(await api(`/api/whatsapp/messages/conversations/${encodeURIComponent(target.chat_id)}`)) }
      setRows(await api('/api/whatsapp/messages/conversations'))
    } catch (e: any) { setError(e.message) } finally { sending.current = false; setBusy(false) }
  }
  return <main className={`nexo-page conversations-page ${active ? 'thread-open' : ''}`}>
    <section className="inbox-panel">
      <div className="page-heading"><div><p className="eyebrow">TUDO EM UM SÓ LUGAR</p><h1>Conversas<span>.</span></h1></div><span className="live-pill"><i />{session?.status === 'connected' ? 'Conectado' : 'Desconectado'}</span></div>
      <label className="nexo-search"><Search size={21} /><input aria-label="Buscar conversas" placeholder="Buscar pessoas ou mensagens" value={query} onChange={e => setQuery(e.target.value)} /><kbd>⌕</kbd></label>
      <Link href="/assistant" className="luna-banner"><Orb /><div><span className="agent-eyebrow">SUA ASSISTENTE PESSOAL</span><h2>Agente Luna</h2><p>{rows.length ? `${rows.length} conversas disponíveis para consultar` : 'Sua próxima conversa começa aqui.'}</p></div><span className="banner-action">Conversar <ChevronRight size={18} /></span></Link>
      <div className="inbox-filters" role="group" aria-label="Filtrar conversas">{['Todas', 'Não lidas', 'Grupos', 'Favoritas'].map(f => <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className={filter === f ? 'selected' : ''}>{f}{f === 'Todas' && <span>{rows.length}</span>}{f === 'Não lidas' && rows.some(unread) && <span>{rows.filter(unread).length}</span>}</button>)}</div>
      {!active && error && <p role="alert" className="nexo-error">{error}</p>}
      <div className="conversation-list">{loading ? <div className="nexo-empty">Carregando suas conversas…</div> : !visible.length ? <div className="nexo-empty"><MessageCircle size={38} /><h2>{query ? 'Nenhuma conversa encontrada' : 'Um espaço para suas conversas'}</h2><p>{session?.status === 'connected' ? 'As mensagens recebidas após a conexão aparecem aqui.' : 'Vincule seu WhatsApp para começar.'}</p>{session?.status !== 'connected' && <Link className="nexo-primary" href="/onboarding/connect"><Link2 size={18} />Conectar WhatsApp</Link>}</div> : visible.map(c => {
        const outgoing = c.outgoing_at && Date.parse(c.outgoing_at) > Date.parse(c.sent_at)
        return <button className={`conversation-row ${active?.chat_id === c.chat_id ? 'active' : ''}`} key={c.chat_id} onClick={() => open(c)}><Avatar name={name(c)} group={c.chat_type === 'group'} /><span className="conversation-copy"><strong>{name(c)}{favorites.includes(c.chat_id) && <Star size={13} fill="currentColor" />}</strong><span>{outgoing ? `Você: ${c.outgoing_content}` : c.media_type === 'audio' ? 'Mensagem de áudio' : c.content || 'Anexo recebido'}</span></span><span className="conversation-meta"><time>{when(outgoing ? c.outgoing_at! : c.sent_at)}</time>{unread(c) ? <i className="unread-dot" aria-label="Não lida neste app" /> : outgoing ? <Check size={16} /> : <ChevronRight size={19} />}</span></button>
      })}</div>
      <p className="inbox-footnote">Leitura e favoritas salvas neste aparelho · até 100 conversas</p>
    </section>
    {active && <section className="chat-panel"><header className="chat-heading"><button className="icon-button" aria-label="Voltar às conversas" onClick={() => { selectedId.current = null; setActive(null) }}><ArrowLeft /></button><Avatar name={name(active)} /><div><h2>{name(active)}</h2><p>{active.chat_type === 'group' ? 'Grupo' : 'Conversa'} · WhatsApp</p></div><button className="icon-button" aria-label={favorites.includes(active.chat_id) ? 'Remover favorita' : 'Favoritar conversa'} aria-pressed={favorites.includes(active.chat_id)} onClick={() => persist(read, favorites.includes(active.chat_id) ? favorites.filter(id => id !== active.chat_id) : [...favorites, active.chat_id])}><Star fill={favorites.includes(active.chat_id) ? 'currentColor' : 'none'} /></button></header>
      <div className="chat-entries"><p className="chat-context">Mensagens recebidas e respostas enviadas pelo Nexo.<br />O histórico anterior à conexão não é importado.</p>{threadLoading ? <p className="chat-context">Abrindo conversa…</p> : entries.map(m => <div key={m.id} className={`chat-bubble ${m.from_me ? 'outgoing' : ''}`}>{!m.from_me && active.chat_type === 'group' && <strong>{m.sender_name}</strong>}<p>{m.content || (m.media_type === 'audio' ? 'Mensagem de áudio' : 'Anexo recebido')}</p>{m.media_type === 'audio' && !m.from_me && <Link href={`/assistant?message=${m.id}`}>Ouvir com Luna →</Link>}<time>{when(m.sent_at)}{m.from_me && <Check size={12} />}</time></div>)}<div ref={bottom} /></div>
      {error && <p role="alert" className="nexo-error">{error}</p>}
      <div className="chat-composer"><Link className="suggest-link" href={`/assistant?message=${active.id}`}><Sparkles size={17} />Pedir ajuda à Luna<ChevronRight size={16} /></Link><form onSubmit={e => { e.preventDefault(); send() }}><textarea aria-label="Mensagem" placeholder="Escreva sua mensagem…" value={reply} onChange={e => setReply(e.target.value)} disabled={busy} rows={2} maxLength={4000} /><button className="nexo-primary send-button" aria-label="Enviar mensagem" disabled={busy || !reply.trim()}><Send size={20} /></button></form></div>
    </section>}
  </main>
}
