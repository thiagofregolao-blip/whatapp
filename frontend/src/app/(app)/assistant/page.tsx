'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { api, getMessages, getToken } from '@/lib/api'
import { useApp } from '@/lib/app-context'

type Message = { id: string; chat_id: string; chat_name: string; sender_name: string; content: string; media_type: string; sent_at: string; urgency_score: number }
type Turn = { role: 'user' | 'assistant'; content: string }
type Draft = { id: string; chat_id: string; content: string; confirmation_token: string; recipient: string; expires_at: string }
const button = 'rounded-xl border border-white/15 px-4 py-3 text-sm disabled:opacity-40'

export default function Assistant() {
  const { session } = useApp()
  const [messages, setMessages] = useState<Message[]>([])
  const [selected, setSelected] = useState<Message | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [question, setQuestion] = useState('')
  const [reply, setReply] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
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
    try { setMessages(await getMessages({ limit: 80 })); setError('') }
    catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { refresh(); const timer = setInterval(refresh, 30000); return () => clearInterval(timer) }, [refresh])
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
      else { setReply(previous => `${previous} ${text}`.trim()); setDraft(null) }
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
      setNotice('Áudio original carregado. Toque no player se o iPhone não iniciar automaticamente.')
    } catch (e: any) { setError(e.message); setNotice('') }
  }
  async function ask(text = question) {
    if (!text.trim() || busy) return
    setQuestion(''); setError(''); setTurns(old => [...old, { role: 'user', content: text }])
    if (/\b(toca|toque|reproduz|reproduza|ouvir)\b.*\b[áa]udio\b/i.test(text)) {
      const m = selected?.media_type === 'audio' ? selected : null
      setTurns(old => [...old, { role: 'assistant', content: m ? 'Vou abrir o áudio original da mensagem selecionada.' : 'Selecione a mensagem de áudio na caixa de entrada e toque em Ouvir original.' }])
      if (m) await playOriginal(m)
      return
    }
    setBusy(true)
    try {
      const result = await api('/api/assistant/chat', { method: 'POST', body: JSON.stringify({ question: text, message_id: selected?.id, history: turns.slice(-12) }) })
      setTurns(old => [...old, { role: 'assistant', content: result.answer }])
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function prepare() {
    if (!selected || !reply.trim()) return
    setBusy(true); setError(''); setNotice('')
    try { setDraft(await api('/api/assistant/drafts', { method: 'POST', body: JSON.stringify({ message_id: selected.id, content: reply }) })) }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function authorize() {
    if (!draft || busy) return
    setBusy(true); setError('')
    try {
      await api(`/api/assistant/drafts/${draft.id}/send`, { method: 'POST', body: JSON.stringify({ authorize: true, confirmation_token: draft.confirmation_token, chat_id: draft.chat_id, content: draft.content }) })
      setNotice(`Mensagem enviada para ${draft.recipient}.`); setReply(''); setDraft(null)
    } catch (e: any) { setError(e.message); setDraft(null) } finally { setBusy(false) }
  }
  return <main className="max-w-6xl mx-auto px-4 py-6 pb-16">
    <div className="flex flex-wrap items-center justify-between gap-4 mb-6"><div><p className="text-xs tracking-widest uppercase text-[#72d8c8]">Seu WhatsApp, com contexto</p><h1 className="text-3xl font-semibold mt-2">O que merece sua atenção?</h1><p className="text-sm text-slate-400 mt-2">Pergunte, ouça o original e prepare respostas. Você autoriza cada envio.</p></div><span className="text-sm rounded-full border border-white/15 px-3 py-2">{session?.status === 'connected' ? '● WhatsApp conectado' : '○ WhatsApp não conectado'}</span></div>
    {session?.status !== 'connected' && <div className="rounded-2xl bg-[#172a32] p-4 mb-5">Conecte sua conta para receber novas mensagens. <Link className="text-[#4ff07f] underline" href="/onboarding/connect">Conectar por QR Code</Link></div>}
    {error && <p role="alert" className="rounded-xl bg-red-950 p-4 text-red-100 mb-4">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-950 p-4 mb-4">{notice}</p>}
    <div className="grid lg:grid-cols-[340px_1fr] gap-5">
      <section className="rounded-2xl bg-[#131b2e] border border-white/10 p-4"><div className="flex justify-between items-center"><h2 className="font-semibold">Caixa de entrada</h2><button className={button} onClick={refresh}>Atualizar</button></div><p className="text-xs text-slate-400 mt-2 mb-4">Últimas 80 mensagens recebidas · atualização a cada 30 s</p>
        {loading ? <p>Carregando mensagens…</p> : !messages.length ? <p className="text-slate-400 py-8">Nenhuma mensagem recebida ainda. Novas mensagens aparecerão aqui após a conexão.</p> : <div className="space-y-2 max-h-[420px] lg:max-h-[680px] overflow-y-auto">{messages.map(m => <button key={m.id} onClick={() => { setSelected(m); setDraft(null); setReply('') }} className={`w-full text-left rounded-xl p-3 border ${selected?.id === m.id ? 'border-[#4ff07f] bg-emerald-950/40' : 'border-white/5 bg-white/[.02]'}`}><div className="flex justify-between gap-2"><strong className="text-sm break-words">{m.chat_name || m.sender_name || m.chat_id}</strong>{m.urgency_score >= 4 && <span className="text-xs text-amber-300">Atenção</span>}</div><p className="text-xs text-slate-400 mt-1">{m.sender_name || 'Contato'} · {new Date(m.sent_at).toLocaleString('pt-BR')}</p><p className="text-sm mt-2 line-clamp-2 break-words">{m.media_type === 'audio' ? '▶ Mensagem de áudio' : m.content || 'Anexo recebido'}</p></button>)}</div>}
      </section>
      <section className="space-y-4 min-w-0">
        {selected && <div className="rounded-2xl bg-[#172a32] border border-[#4ff07f]/30 p-4"><div className="flex justify-between gap-3"><h2 className="font-semibold">Selecionada: {selected.chat_name || selected.sender_name || selected.chat_id}</h2><button aria-label="Limpar seleção" onClick={() => { setSelected(null); setDraft(null); setReply('') }}>✕</button></div><p className="text-xs text-slate-400 mt-1">Conversa: {selected.chat_id}</p><p className="whitespace-pre-wrap break-words my-3">{selected.content || (selected.media_type === 'audio' ? 'Áudio recebido · conteúdo não transcrito' : 'Mensagem sem texto')}</p>{selected.media_type === 'audio' && <button className={button} onClick={() => playOriginal(selected)}>▶ Ouvir original</button>}</div>}
        {audioUrl && <div className="rounded-xl bg-[#172a32] p-3"><p className="text-xs mb-2">Áudio original · {audioLabel}</p><audio ref={audio} src={audioUrl} controls autoPlay className="w-full" onError={() => setError('O navegador não reproduziu este formato de áudio.')} /></div>}
        <div className="rounded-2xl bg-[#131b2e] border border-white/10 p-4"><h2 className="font-semibold mb-3">Converse com seu assistente</h2><p className="text-xs text-slate-400">{selected ? 'Contexto: mensagem selecionada.' : 'Contexto: até 80 mensagens dos últimos 7 dias.'} Conteúdo de áudio não é transcrito nesta versão.</p>
          <div aria-live="polite" className="space-y-3 my-4 max-h-[430px] overflow-y-auto">{!turns.length && <p className="text-slate-400 py-6">Posso ajudar a encontrar pedidos, entender prioridades e sugerir uma resposta.</p>}{turns.map((t,i) => <div key={i} className={`p-3 rounded-xl whitespace-pre-wrap break-words ${t.role === 'user' ? 'bg-[#233d3a] ml-6' : 'bg-white/5 mr-3'}`}><p className="text-xs text-[#72d8c8] mb-1">{t.role === 'user' ? 'Você' : 'Assistente'}</p>{t.content}</div>)}{busy && <p role="status">Processando…</p>}</div>
          <div className="flex flex-wrap gap-2 mb-3"><button disabled={busy} className={button} onClick={() => ask('O que chegou e o que parece importante?')}>O que importa?</button>{selected && <button disabled={busy} className={button} onClick={() => ask('Sugira uma resposta curta para esta mensagem. Apenas o rascunho, sem enviar.')}>Sugerir resposta</button>}</div>
          <form onSubmit={e => { e.preventDefault(); ask() }}><label htmlFor="question" className="sr-only">Pergunta para a IA</label><textarea id="question" value={question} onChange={e => setQuestion(e.target.value)} placeholder="Pergunte ou diga “toca o áudio”…" rows={2} maxLength={4000} className="w-full bg-[#060e20] rounded-xl p-3 text-base border border-white/15" /><div className="flex justify-between gap-2 mt-2"><button type="button" className={button} onClick={() => dictate('question')}>{listening ? 'Parar ditado' : '🎙 Ditar pergunta'}</button><button disabled={busy || !question.trim()} className={`${button} bg-[#4ff07f] text-[#00351b] font-semibold`}>Perguntar</button></div></form>
          {!voiceSupported && <p className="text-xs text-slate-400 mt-2">Se o ditado do navegador não estiver disponível, use o microfone do teclado do iPhone.</p>}
        </div>
        {selected && <div className="rounded-2xl border border-white/10 p-4 bg-[#131b2e]"><h2 className="font-semibold">Sua resposta</h2><p className="text-sm text-slate-400 my-2">Escreva, dite ou cole a sugestão da IA. Preparar não envia.</p><label htmlFor="reply" className="sr-only">Texto da resposta</label><textarea id="reply" rows={3} maxLength={4000} value={reply} onChange={e => { setReply(e.target.value); setDraft(null) }} className="w-full bg-[#060e20] rounded-xl p-3 text-base border border-white/15" /><div className="flex flex-wrap gap-2 mt-2"><button className={button} onClick={() => dictate('reply')}>🎙 Ditar resposta</button><button disabled={busy || !reply.trim()} className={button} onClick={prepare}>Revisar rascunho</button></div>
          {draft && <div className="mt-4 p-4 rounded-xl border border-amber-400/60"><h3 className="font-semibold text-amber-200">Autorizar este envio</h3><p className="mt-2">Para: <strong>{draft.recipient}</strong></p><p className="text-xs text-slate-400 break-all">Conversa: {draft.chat_id}</p><p className="whitespace-pre-wrap break-words my-4">{draft.content}</p><p className="text-xs mb-3">Expira às {new Date(draft.expires_at).toLocaleTimeString('pt-BR')}. O botão abaixo autoriza exatamente este texto nesta conversa.</p><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={authorize} className={`${button} bg-[#4ff07f] text-[#00351b] font-semibold`}>Autorizar e enviar agora</button><button disabled={busy} onClick={() => setDraft(null)} className={button}>Cancelar</button></div></div>}
        </div>}
      </section>
    </div>
  </main>
}
