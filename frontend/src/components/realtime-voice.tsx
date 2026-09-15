'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

type VoiceResources = { pc: RTCPeerConnection; stream?: MediaStream; channel?: RTCDataChannel; timer?: ReturnType<typeof setTimeout>; abort: AbortController }

export default function RealtimeVoice({ messageId }: { messageId?: string }) {
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'connected'>('idle')
  const [error, setError] = useState('')
  const [caption, setCaption] = useState('')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const selected = useRef(messageId)
  selected.current = messageId
  const resources = useRef<VoiceResources | null>(null)
  const player = useRef<HTMLAudioElement>(null)

  function stop() {
    const r = resources.current
    resources.current = null
    if (r) { clearTimeout(r.timer); r.abort.abort(); r.stream?.getTracks().forEach(t => t.stop()); r.channel?.close(); r.pc.close() }
    if (player.current) { player.current.pause(); player.current.srcObject = null }
    setPhase('idle')
  }
  useEffect(() => {
    let active = true
    const check = () => api('/api/assistant/status').then(s => { if (active) setConfigured(s.configured) }).catch(() => { if (active) setConfigured(null) })
    check(); const timer = setInterval(check, 30000)
    const hide = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', hide)
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', hide); stop() }
  }, [])

  async function start() {
    if (resources.current) return
    setError(''); setCaption(''); setPhase('connecting')
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) { setError('Abra em HTTPS no Safari ou Chrome para usar o microfone.'); setPhase('idle'); return }
    const r = { pc: new RTCPeerConnection(), abort: new AbortController() } as VoiceResources
    resources.current = r
    const current = () => resources.current === r
    try {
      r.timer = setTimeout(() => { if (current()) { stop(); setError('A conexão de voz demorou demais. Tente novamente.') } }, 35000)
      r.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      if (!current()) { r.stream.getTracks().forEach(t => t.stop()); return }
      r.stream.getTracks().forEach(track => r.pc.addTrack(track, r.stream!))
      r.pc.ontrack = event => {
        if (current() && player.current) { player.current.srcObject = event.streams[0]; player.current.play().catch(() => setError('Toque no player abaixo para ouvir a voz.')) }
      }
      r.pc.onconnectionstatechange = () => {
        if (!current()) return
        if (r.pc.connectionState === 'connected') {
          clearTimeout(r.timer); setPhase('connected')
          r.timer = setTimeout(() => { if (current()) { stop(); setCaption('Chamada encerrada após 10 minutos. Você pode iniciar outra.') } }, 600000)
        } else if (['failed', 'disconnected', 'closed'].includes(r.pc.connectionState)) { stop(); setError('Conexão de voz encerrada. Toque para iniciar novamente.') }
      }
      const channel = r.pc.createDataChannel('oai-events'); r.channel = channel
      const handled = new Set<string>()
      channel.onmessage = async event => {
        if (!current()) return
        let data: any
        try { data = JSON.parse(event.data) } catch { return }
        if (data.type === 'response.output_audio_transcript.done') setCaption(data.transcript)
        if (data.type === 'error') { stop(); setError('A OpenAI interrompeu a sessão de voz. Verifique a configuração e tente novamente.'); return }
        if (data.type !== 'response.function_call_arguments.done' || handled.has(data.call_id)) return
        handled.add(data.call_id)
        let output: any = { error: 'Ferramenta indisponível. Nenhuma ação executada.' }
        try {
          if (data.name === 'consultar_luna') {
            const args = JSON.parse(data.arguments)
            if (typeof args.question !== 'string') throw new Error('Pergunta inválida')
            setCaption('Luna está consultando suas mensagens…')
            output = await api('/api/assistant/chat', { method: 'POST', signal: r.abort.signal, body: JSON.stringify({ question: args.question, message_id: selected.current, history: [] }) })
          }
        } catch (e: any) { output = { error: e.message }; if (current()) setError(e.message) }
        if (!current() || channel.readyState !== 'open') return
        channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: data.call_id, output: JSON.stringify(output) } }))
        channel.send(JSON.stringify({ type: 'response.create' }))
      }
      const offer = await r.pc.createOffer(); await r.pc.setLocalDescription(offer)
      const answer = await api('/api/assistant/realtime', { method: 'POST', signal: r.abort.signal, body: JSON.stringify({ sdp: offer.sdp }) })
      if (current()) await r.pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
    } catch (e: any) { if (current()) { stop(); setError(e.name === 'NotAllowedError' ? 'Permita o microfone para conversar por voz.' : e.message || 'Falha ao iniciar voz.') } }
  }
  return <div className="rounded-2xl border border-emerald-400/30 bg-[#172a32] p-4">
    <h2 className="font-semibold">Luna · voz em tempo real</h2>
    <p className="text-sm text-slate-300 mt-2">Converse por voz e peça à Luna para analisar suas mensagens. A voz é gerada por IA.</p>
    {configured === false && <p role="status" className="text-amber-200 text-sm mt-2">Aguardando a chave da OpenAI no Railway. Texto e voz serão ativados após configurar OPENAI_API_KEY no serviço whatapp.</p>}
    <p className="text-xs text-slate-400 my-3">Ao iniciar, seu microfone é enviado à OpenAI; consultas à Luna usam as mensagens do recorte selecionado. A API é cobrada por uso. Encerre quando terminar. A voz não envia mensagens.</p>
    <button disabled={configured === false && phase === 'idle'} onClick={phase === 'idle' ? start : stop} className="rounded-xl bg-[#4ff07f] text-[#00351b] px-4 py-3 font-semibold disabled:opacity-40">{phase === 'idle' ? 'Conversar por voz' : phase === 'connecting' ? 'Cancelar conexão' : 'Encerrar voz'}</button>
    <p role="status" className="text-sm mt-2">{phase === 'connected' ? 'Microfone ativo · pode falar e interromper a resposta' : phase === 'connecting' ? 'Conectando…' : ''}</p>
    {error && <p role="alert" className="text-red-200 text-sm mt-2">{error}</p>}
    {caption && <p aria-live="polite" className="text-sm text-slate-200 mt-3 whitespace-pre-wrap">{caption}</p>}
    <audio ref={player} autoPlay controls className={phase === 'idle' ? 'hidden' : 'w-full mt-3'} />
  </div>
}
