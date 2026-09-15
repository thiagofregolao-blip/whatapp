'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import RealtimeVoice from '@/components/realtime-voice'
import { api, getMessages, getToken } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { InboxMessage as Message, ReviewDraft as Draft, unseenMessages, isSendCommand } from '@/lib/assistant-flow'

type Turn = { role: 'user' | 'assistant'; content: string }

const button = 'rounded-xl border border-[var(--nx-line)] px-4 py-3 text-sm disabled:opacity-40'

export default function Assistant() {
  const { session } = useApp()
  const [messages, setMessages] = useState<Message[]>([])
  const [selected, setSelected] = useState<Message | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [question, setQuestion] = useState('')
  const [reply, setReply] = useState('')
  const [draft, setDraftState] = useState<Draft | null>(null)
  const draftRef = useRef<Draft | null>(null)
  const revision = useRef(0)
  const sendLock = useRef(false)
  const seen = useRef<Set<string> | null>(null)
  const refreshLock = useRef(false)
  const linkedMessage = useRef(false)
  const [incoming, setIncoming] = useState<Message[]>([])
  const [voiceEvent, setVoiceEvent] = useState<{ id: number; text: string } | null>(null)
  function setDraft(value: Draft | null) { draftRef.current = value; setDraftState(value) }
  function invalidateDraft() { revision.current++; setDraft(null) }
  function selectMessage(m: Message | null) { invalidateDraft(); setSelected(m); setReply('') }
  function editReply(value: string) { invalidateDraft(); setReply(value) }
  function installDraft(value: any) {
    const ready: Draft = value
    setReply(ready.content); setDraft(ready)
    return { message_id: value.message_id, recipient: ready.recipient, content: ready.content, status: 'draft_ready' }
  }
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [audioUrl, setAudioUrl] = useState('')
  const [audioLabel, setAudioLabel] = useState('')
  const audio = useRef<HTMLAudioElement>(null)
  const recognition = useRef<any>(null)
  const refresh = useCallback(async () => {
    if (refreshLock.current) return
    refreshLock.current = true
    try {
      const rows: Message[] = await getMessages({ limit: 80 })
      const fresh = unseenMessages(seen.current, rows)
      const known = seen.current || new Set<string>()
      rows.forEach(m => known.add(m.id)); seen.current = known
      if (fresh.length) setIncoming(old => [...old, ...fresh].slice(-80))
      setMessages(rows)
      if (!linkedMessage.current) {
        const id = new URLSearchParams(window.location.search).get('message')
        const target = rows.find(m => m.id === id)
        if (target) { revision.current++; draftRef.current = null; setDraftState(null); setSelected(target); setReply(''); linkedMessage.current = true }
      }
    }
    catch (e: any) { setError(e.message) }
    finally { refreshLock.current = false; setLoading(false) }
  }, [])
  useEffect(() => { refresh(); const timer = setInterval(refresh, 5000); return () => clearInterval(timer) }, [refresh])
  useEffect(() => { setVoiceSupported(Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)); return () => recognition.current?.abort() }, [])
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl) }, [audioUrl])

  function dictate(target: 'question' | 'reply') {
    const Speech = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!Speech) { setNotice('Use o microfone do teclado do iPhone para ditar neste campo.'); return }
    if (listening) { recognition.current?.stop(); return }
    const r = new Speech(); recognition.current = r; r.lang = 'pt-BR'; r.interimResults = false
    r.onresult = (event: any) => {
      const text = event.results[0][0].transcript
      if (target === 'question') setQuestion(previous => `${previous} ${text}`.trim())
      else { invalidateDraft(); setReply(previous => `${previous} ${text}`.trim()) }
    }
    r.onerror = () => { setError('Não foi possível ditar. Permita o microfone ou use o teclado.'); setListening(false) }
    r.onend = () => setListening(false)
    try { r.start(); setListening(true) } catch { setListening(false); setError('Microfone indisponível') }
  }
  async function playOriginal(m: Message) {
    setError(''); setNotice('Carregando áudio original…')
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/whatsapp/messages/${m.id}/audio`, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (!res.ok) throw new Error((await res.json()).error || 'Áudio indisponível')
      setAudioUrl(URL.createObjectURL(await res.blob())); setAudioLabel(`${m.sender_name || 'Contato'} · ${m.chat_name || m.chat_id}`)
      setNotice('Áudio original carregado. Toque no player se o iPhone não iniciar automaticamente.'); return true
    } catch (e: any) { setError(e.message); setNotice(''); return false }
  }
  function findMessage(id: string) {
    const m = messages.find(item => item.id === id) || incoming.find(item => item.id === id)
    if (!m) throw new Error('Mensagem não está mais na caixa de entrada. Atualize e selecione novamente.')
    return m
  }
  async function makeReply(id: string, content?: string, instruction?: string) {
    if (sendLock.current || busy) throw new Error('Aguarde a ação atual terminar.')
    const m = findMessage(id)
    selectMessage(m)
    const version = revision.current
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api(content === undefined ? '/api/assistant/suggest' : '/api/assistant/drafts', {
        method: 'POST', body: JSON.stringify(content === undefined ? { message_id: id, instruction: instruction || 'Sugira uma resposta curta.' } : { message_id: id, content })
      })
      if (revision.current !== version) throw new Error('A seleção ou o texto mudou. O rascunho anterior não foi aplicado.')
      const review = installDraft(result)
      setNotice('Resposta pronta.')
      setTimeout(() => document.getElementById('reply')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0)
      return review
    } finally { setBusy(false) }
  }
  async function suggest(id: string, instruction?: string) {
    try { await makeReply(id, undefined, instruction) } catch (e: any) { setError(e.message) }
  }
  async function ask(text = question) {
    if (!text.trim() || busy) return
    setQuestion(''); setError(''); setTurns(old => [...old, { role: 'user', content: text }])
    if (isSendCommand(text)) {
      try {
        if (!selected) throw new Error('Para quem? Selecione a conversa.')
        const short = /^(?:luna[, ]+)?(?:por favor[, ]+)?(?:pode )?(?:envia|enviar|envie|manda|mandar|mande)(?: (?:agora|isso|essa mensagem|a mensagem|a resposta))?[.! ]*$/i.test(text.trim())
        if (!short && !/^(?:luna[, ]+)?(?:por favor[, ]+)?(?:pode )?(?:envia|enviar|envie|manda|mandar|mande) (?:dizendo|que|com o texto)\b/i.test(text.trim())) throw new Error('Selecione a conversa e escreva a resposta no campo; depois peça para enviar.')
        if (!short) await makeReply(selected.id, undefined, text)
        else if (!draftRef.current && reply.trim()) await makeReply(selected.id, reply)
        if (!draftRef.current) throw new Error('Qual mensagem você quer enviar?')
        const result = await authorize()
        setTurns(old => [...old, { role: 'assistant', content: typeof result === 'string' ? result : result.status === 'sent' ? 'Enviado.' : 'Não consegui confirmar o envio.' }])
      } catch (e: any) { setError(e.message) }
      return
    }
    if (/\b(toca|toque|reproduz|reproduza|ouvir)\b.*\b[áa]udio\b/i.test(text)) {
      const m = selected?.media_type === 'audio' ? selected : null
      setTurns(old => [...old, { role: 'assistant', content: m ? 'Vou abrir o áudio original da mensagem selecionada.' : 'Selecione a mensagem de áudio na caixa de entrada e toque em Ouvir original.' }])
      if (m) await playOriginal(m)
      return
    }
    if (selected && /^(?:luna[, ]+)?(?:responda|responde|escreva|escreve|sugira.*resposta|prepare.*resposta|pode responder|diga que)\b/i.test(text)) {
      await suggest(selected.id, text); return
    }
    setBusy(true)
    try {
      const result = await api('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ question: text, message_id: selected?.id, history: turns.slice(-12) }) })
      setTurns(old => [...old, { role: 'assistant', content: result.answer }])
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function prepare() {
    if (!selected || !reply.trim()) return
    try { await makeReply(selected.id, reply) } catch (e: any) { setError(e.message) }
  }
  async function authorize(expectedId?: string, announce = true) {
    const d = draftRef.current
    if (!d || sendLock.current || (expectedId && d.id !== expectedId)) return 'Não há um rascunho válido para este envio.'
    if (new Date(d.expires_at).getTime() <= Date.now()) { invalidateDraft(); return 'Rascunho expirado. Prepare novamente.' }
    sendLock.current = true; setBusy(true); setError(''); invalidateDraft()
    try {
      await api(`/api/assistant/drafts/${d.id}/send`, { method: 'POST', body: JSON.stringify({ authorize: true, confirmation_token: d.confirmation_token, chat_id: d.chat_id, content: d.content }) })
      const result = `Mensagem enviada para ${d.recipient}.`
      setNotice(result); setReply(''); if (announce) setVoiceEvent({ id: Date.now(), text: `resultado_envio: status sent. Diga apenas: Enviado.` })
      return { status: 'sent', message: 'Enviado.' }
    } catch (e: any) {
      setError(e.message); if (announce) setVoiceEvent({ id: Date.now(), text: `resultado_envio: status unknown. Não confirme sucesso. ${e.message}` }); return { status: 'unknown', error: e.message }
    } finally { sendLock.current = false; setBusy(false) }
  }
  async function voiceAction(name: string, args: any) {
    if (name === 'cancelar_resposta') { invalidateDraft(); return { status: 'cancelled', message: 'Rascunho cancelado. A confirmação anterior não pode enviar.' } }
    const m = findMessage(args.message_id)
    if (name === 'enviar_resposta') {
      const current = draftRef.current
      if (!current || current.chat_id !== m.chat_id || current.content !== args.content) await makeReply(m.id, args.content)
      return authorize(draftRef.current?.id, false)
    }
    if (name === 'preparar_resposta') return makeReply(m.id, args.content)
    if (name === 'abrir_mensagem') {
      if (!draftRef.current && !busy) selectMessage(m)
      return { ...m, next: 'Pergunte se o usuário quer preparar uma resposta. Não envie nada.' }
    }
    if (name === 'ouvir_audio') {
      if (m.media_type !== 'audio') throw new Error('A mensagem não é de áudio')
      if (!await playOriginal(m)) throw new Error('Não foi possível abrir o áudio original.')
      return { status: 'player_aberto', message_id: m.id }
    }
    throw new Error('Ação não suportada')
  }
  return <main className="nexo-page assistant-page">
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6"><div><p className="text-xs tracking-widest uppercase text-[var(--nx-accent)]">SUA ASSISTENTE PESSOAL</p><h1 className="text-3xl font-semibold mt-2">Luna, ao seu lado.</h1><p className="text-sm text-[var(--nx-muted)] mt-2">Menos tela. Mais tempo para você.</p></div><span className="text-sm rounded-full border border-[var(--nx-line)] px-3 py-2">{session?.status === 'connected' ? '● WhatsApp conectado' : '○ WhatsApp não conectado'}</span></div>
    {session?.status !== 'connected' && <div className="rounded-2xl bg-[var(--nx-panel)] p-4 mb-5">Conecte sua conta para receber novas mensagens. <Link className="text-[var(--nx-accent)] underline" href="/onboarding/connect">Conectar por QR Code</Link></div>}
    {error && <p role="alert" className="rounded-xl bg-red-950 p-4 text-red-100 mb-4">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-[var(--nx-soft)] p-4 mb-4">{notice}</p>}
    <div className="grid lg:grid-cols-[340px_1fr] gap-5">
      <section className="rounded-2xl bg-[var(--nx-panel)] border border-[var(--nx-line)] p-4"><div className="flex justify-between items-center"><h2 className="font-semibold">Caixa de entrada</h2><button className={button} onClick={refresh}>Atualizar</button></div><p className="text-xs text-[var(--nx-muted)] mt-2 mb-4">Últimas 80 mensagens recebidas · atualização a cada 5 s</p>
        {loading ? <p>Carregando mensagens…</p> : !messages.length ? <p className="text-[var(--nx-muted)] py-8">Nenhuma mensagem recebida ainda. Novas mensagens aparecerão aqui após a conexão.</p> : <div className="space-y-2 max-h-[420px] lg:max-h-[680px] overflow-y-auto">{messages.map(m => <button key={m.id} onClick={() => selectMessage(m)} className={`w-full text-left rounded-xl p-3 border ${selected?.id === m.id ? 'border-[var(--nx-accent)] bg-[var(--nx-soft)]/40' : 'border-[var(--nx-line)] bg-white/[.02]'}`}><div className="flex justify-between gap-2"><strong className="text-sm break-words">{m.chat_name || m.sender_name || m.chat_id}</strong>{m.urgency_score >= 4 && <span className="text-xs text-amber-300">Atenção</span>}</div><p className="text-xs text-[var(--nx-muted)] mt-1">{m.sender_name || 'Contato'} · {new Date(m.sent_at).toLocaleString('pt-BR')}</p><p className="text-sm mt-2 line-clamp-2 break-words">{m.media_type === 'audio' ? '▶ Mensagem de áudio' : m.content || 'Anexo recebido'}</p></button>)}</div>}
      </section>
      <section className="space-y-4 min-w-0">
        <Link className="report-shortcut" href="/reports">Resumo do dia <span>Ver relatórios →</span></Link>
        <RealtimeVoice messageId={selected?.id} incoming={incoming} draft={draft} onAction={voiceAction} voiceEvent={voiceEvent} />
        {incoming.length > 0 && <div className="rounded-2xl bg-[var(--nx-soft)] border border-emerald-400/30 p-4" role="status"><p className="font-semibold">Luna: chegou mensagem. Quer saber o que é?</p><div className="space-y-2 mt-3">{incoming.slice(-5).map(m => <div key={m.id} className="flex flex-wrap gap-2 items-center"><span className="text-sm flex-1">{m.sender_name || m.chat_name || 'Contato'} · {m.chat_name || 'Conversa'}</span><button className={button} onClick={() => { selectMessage(m); setIncoming(old => old.filter(x => x.id !== m.id)) }}>Ler mensagem</button><button className={button} disabled={busy} onClick={() => suggest(m.id)}>Preparar resposta</button><button className={button} onClick={() => setIncoming(old => old.filter(x => x.id !== m.id))}>Depois</button></div>)}</div></div>}
        {selected && <div className="rounded-2xl bg-[var(--nx-panel)] border border-[var(--nx-accent)]/30 p-4"><div className="flex justify-between gap-3"><h2 className="font-semibold">Selecionada: {selected.chat_name || selected.sender_name || selected.chat_id}</h2><button aria-label="Limpar seleção" onClick={() => selectMessage(null)}>✕</button></div><p className="text-xs text-[var(--nx-muted)] mt-1">Conversa: {selected.chat_id}</p><p className="whitespace-pre-wrap break-words my-3">{selected.content || (selected.media_type === 'audio' ? 'Áudio recebido · conteúdo não transcrito' : 'Mensagem sem texto')}</p>{selected.media_type === 'audio' && <button className={button} onClick={() => playOriginal(selected)}>▶ Ouvir original</button>}</div>}
        {audioUrl && <div className="rounded-xl bg-[var(--nx-panel)] p-3"><p className="text-xs mb-2">Áudio original · {audioLabel}</p><audio ref={audio} src={audioUrl} controls autoPlay className="w-full" onError={() => setError('O navegador não reproduziu este formato de áudio.')} /></div>}
        <div className="rounded-2xl bg-[var(--nx-panel)] border border-[var(--nx-line)] p-4"><h2 className="font-semibold mb-3">Converse com Luna</h2><p className="text-xs text-[var(--nx-muted)]">{selected ? 'Contexto: mensagem selecionada.' : 'Contexto: até 80 mensagens dos últimos 7 dias.'} Conteúdo de áudio não é transcrito nesta versão.</p>
          <div aria-live="polite" className="space-y-3 my-4 max-h-[430px] overflow-y-auto">{!turns.length && <p className="text-[var(--nx-muted)] py-6">Posso ajudar a encontrar pedidos, entender prioridades e sugerir uma resposta.</p>}{turns.map((t,i) => <div key={i} className={`p-3 rounded-xl whitespace-pre-wrap break-words ${t.role === 'user' ? 'bg-[var(--nx-raised)] ml-6' : 'bg-white/5 mr-3'}`}><p className="text-xs text-[var(--nx-accent)] mb-1">{t.role === 'user' ? 'Você' : 'Luna'}</p>{t.content}</div>)}{busy && <p role="status">Processando…</p>}</div>
          <div className="flex flex-wrap gap-2 mb-3"><button disabled={busy} className={button} onClick={() => ask('O que chegou e o que parece importante?')}>O que importa?</button>{selected && <button disabled={busy} className={button} onClick={() => suggest(selected.id)}>Sugerir resposta</button>}</div>
          <form onSubmit={e => { e.preventDefault(); ask() }}><label htmlFor="question" className="sr-only">Pergunta para a IA</label><textarea id="question" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Pergunte ou diga “toca o áudio”…" rows={2} maxLength={4000} className="w-full bg-[var(--nx-input)] rounded-xl p-3 text-base border border-[var(--nx-line)]" /><div className="flex justify-between gap-2 mt-2"><button type="button" className={button} onClick={() => dictate('question')}>{listening ? 'Parar ditado' : '🎙 Ditar pergunta'}</button><button disabled={busy || !question.trim()} className={`${button} bg-[var(--nx-accent)] text-[var(--nx-bg)] font-semibold`}>Perguntar</button></div></form>
          {!voiceSupported && <p className="text-xs text-[var(--nx-muted)] mt-2">Se o ditado do navegador não estiver disponível, use o microfone do teclado do iPhone.</p>}
        </div>
        {selected && <div className="rounded-2xl border border-[var(--nx-line)] p-4 bg-[var(--nx-panel)]"><h2 className="font-semibold">Sua resposta</h2><p className="text-sm text-[var(--nx-muted)] my-2">Luna preenche a sugestão aqui. Você pode editar ou pedir para enviar.</p><label htmlFor="reply" className="sr-only">Texto da resposta</label><textarea id="reply" disabled={busy} rows={3} maxLength={4000} value={reply} onChange={e => editReply(e.target.value)} className="w-full bg-[var(--nx-input)] rounded-xl p-3 text-base border border-[var(--nx-line)]" /><div className="flex flex-wrap gap-2 mt-2"><button className={button} onClick={() => dictate('reply')}>🎙 Ditar resposta</button><button disabled={busy || !reply.trim()} className={button} onClick={prepare}>Revisar rascunho</button></div>
          {draft && <div className="mt-4 p-4 rounded-xl border border-amber-400/60"><h3 className="font-semibold text-amber-200">Resposta pronta</h3><p className="mt-2">Para: <strong>{draft.recipient}</strong></p><p className="text-xs text-[var(--nx-muted)] break-all">Conversa: {draft.chat_id}</p><p className="whitespace-pre-wrap break-words my-4">{draft.content}</p><p className="text-xs mb-3">Expira às {new Date(draft.expires_at).toLocaleTimeString('pt-BR')}. O botão abaixo autoriza exatamente este texto nesta conversa.</p><p className="text-sm text-amber-100 mb-3">Peça para enviar por voz ou use o botão abaixo.</p><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => authorize()} className={`${button} bg-[var(--nx-accent)] text-[var(--nx-bg)] font-semibold`}>Enviar agora</button><button disabled={busy} onClick={invalidateDraft} className={button}>Cancelar</button></div></div>}
        </div>}
      </section>
    </div>
  </main>
}
