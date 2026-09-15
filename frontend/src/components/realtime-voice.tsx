'use client'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { InboxMessage, ReviewDraft } from '@/lib/assistant-flow'

type VoiceResources = { pc: RTCPeerConnection; stream?: MediaStream; channel?: RTCDataChannel; timer?: ReturnType<typeof setTimeout>; abort: AbortController; pump?: ReturnType<typeof setInterval>; responding?: boolean; needsResponse?: boolean; speaking?: boolean; audioPlaying?: boolean; pendingTools?: number; flush?: () => void }

type Props = { messageId?: string; incoming: InboxMessage[]; draft: ReviewDraft | null; onAction: (name: string, args: any) => Promise<any>; voiceEvent: { id: number; text: string } | null }
export default function RealtimeVoice(props: Props) {
  const { messageId } = props
  const latest = useRef(props); latest.current = props
  const announced = useRef(new Set<string>())
  const lastVoiceEvent = useRef(0)
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'connected'>('idle')
  const [error, setError] = useState('')
  const [caption, setCaption] = useState('')
  const alertMode = useRef('manual')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const selected = useRef(messageId)
  selected.current = messageId
  const resources = useRef<VoiceResources | null>(null)
  const player = useRef<HTMLAudioElement>(null)

  function stop() {
    const r = resources.current
    resources.current = null
    if (r) { clearTimeout(r.timer); clearInterval(r.pump); r.abort.abort(); r.stream?.getTracks().forEach(t => t.stop()); r.channel?.close(); r.pc.close() }
    if (player.current) { player.current.pause(); player.current.srcObject = null }
    setPhase('idle')
  }
  useEffect(() => {
    let active = true
    const check = () => api('/api/assistant/status').then(s => { if (active) setConfigured(s.configured) }).catch(() => { if (active) setConfigured(null) })
    const readPreferences = () => { alertMode.current = localStorage.getItem('nexo-alerts') || 'manual' }
    readPreferences(); window.addEventListener('nexo-preferences', readPreferences)
    check(); const timer = setInterval(check, 30000)
    const hide = () => { if (document.hidden) stop() }
    document.addEventListener('visibilitychange', hide)
    return () => { active = false; window.removeEventListener('nexo-preferences', readPreferences); clearInterval(timer); document.removeEventListener('visibilitychange', hide); stop() }
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
      const sentUtterances = new Set<string>()
      let userUtterance: string | null = null
      const respond = () => {
        r.needsResponse = true
        if (r.responding || r.speaking || r.audioPlaying || r.pendingTools) return
        r.needsResponse = false; r.responding = true
        channel.send(JSON.stringify({ type: 'response.create' }))
      }
      const tell = (text: string) => { channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } })); respond() }
      r.flush = () => {
        if (!current() || channel.readyState !== 'open' || r.responding || r.speaking || r.audioPlaying || r.pendingTools) return
        if (r.needsResponse) { respond(); return }
        const event = latest.current.voiceEvent
        if (event && lastVoiceEvent.current !== event.id) { lastVoiceEvent.current = event.id; tell(event.text); return }
        if (latest.current.draft || alertMode.current !== 'notify') return
        const fresh = latest.current.incoming.filter(m => !announced.current.has(m.id)).slice(-5)
        if (!fresh.length) return
        fresh.forEach(m => announced.current.add(m.id))
        tell(JSON.stringify({ evento: 'novas_mensagens', orientacao: 'Avise quem escreveu e pergunte se quero saber o conteúdo. Não leia ainda.', mensagens: fresh.map(m => ({ message_id: m.id, remetente: m.sender_name, conversa: m.chat_name, tipo: m.media_type })) }))
      }
      channel.onopen = () => r.flush?.()
      r.pump = setInterval(() => r.flush?.(), 1000)
      channel.onmessage = async event => {
        if (!current()) return
        let data: any
        try { data = JSON.parse(event.data) } catch { return }
        if (data.type === 'response.created') r.responding = true
        if (data.type === 'response.done') r.responding = false
        if (data.type === 'output_audio_buffer.started') r.audioPlaying = true
        if (data.type === 'output_audio_buffer.stopped' || data.type === 'output_audio_buffer.cleared') r.audioPlaying = false
        if (data.type === 'input_audio_buffer.speech_started') {
          r.speaking = true
          userUtterance = data.item_id || null
        }
        if (data.type === 'input_audio_buffer.speech_stopped') r.speaking = false
        if (data.type === 'response.output_audio_transcript.done') setCaption(data.transcript)
        if (data.type === 'error') { stop(); setError('A OpenAI interrompeu a sessão de voz. Verifique a configuração e tente novamente.'); return }
        if (data.type !== 'response.function_call_arguments.done' || handled.has(data.call_id)) return
        handled.add(data.call_id)
        r.pendingTools = (r.pendingTools || 0) + 1
        let output: any = { error: 'Ferramenta indisponível. Nenhuma ação executada.' }
        try {
          const args = JSON.parse(data.arguments)
          if (data.name === 'consultar_luna') {
            if (typeof args.question !== 'string') throw new Error('Pergunta inválida')
            setCaption('Luna está consultando suas mensagens…')
            output = await api('/api/assistant/chat', { method: 'POST', signal: r.abort.signal, body: JSON.stringify({ question: args.question, message_id: args.message_id || selected.current, history: [] }) })
          } else if (['abrir_mensagem', 'preparar_resposta', 'cancelar_resposta', 'ouvir_audio', 'enviar_resposta'].includes(data.name)) {
            if (data.name !== 'cancelar_resposta' && typeof args.message_id !== 'string') throw new Error('Selecione a mensagem correta antes de continuar.')
            if (['preparar_resposta', 'enviar_resposta'].includes(data.name) && (typeof args.content !== 'string' || !args.content.trim() || args.content.length > 4000)) throw new Error('Texto de resposta inválido.')
            if (data.name === 'enviar_resposta') {
              if (!userUtterance || sentUtterances.has(userUtterance)) throw new Error('Este pedido de envio já foi processado. Não repita.')
              sentUtterances.add(userUtterance)
            }
            output = await latest.current.onAction(data.name, args)
          }
        } catch (e: any) { output = { error: e.message }; if (current()) setError(e.message) }
        r.pendingTools = Math.max(0, (r.pendingTools || 1) - 1)
        if (!current() || channel.readyState !== 'open') return
        channel.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: data.call_id, output: JSON.stringify(output) } }))
        respond()
      }
      const offer = await r.pc.createOffer(); await r.pc.setLocalDescription(offer)
      const answer = await api('/api/assistant/realtime', { method: 'POST', signal: r.abort.signal, body: JSON.stringify({ sdp: offer.sdp }) })
      if (current()) await r.pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
    } catch (e: any) { if (current()) { stop(); setError(e.name === 'NotAllowedError' ? 'Permita o microfone para conversar por voz.' : e.message || 'Falha ao iniciar voz.') } }
  }
  return <div className="rounded-2xl border border-emerald-400/30 bg-[var(--nx-panel)] p-4">
    <h2 className="font-semibold">Luna · voz em tempo real</h2>
    <p className="text-sm text-[var(--nx-muted)] mt-2">Pergunte o que chegou, ouça e responda sem digitar. Voz gerada por IA.</p>
    {configured === false && <p role="status" className="text-amber-200 text-sm mt-2">Configure sua chave OpenAI em Perfil para ativar a Luna.</p>}
    <p className="text-xs text-[var(--nx-muted)] my-3">Ao iniciar, seu microfone é enviado à OpenAI; consultas à Luna usam as mensagens do recorte selecionado. A API é cobrada por uso. Encerre quando terminar. Para enviar, basta pedir à Luna. Mantenha esta página aberta para os avisos por voz.</p>
    <button disabled={configured === false && phase === 'idle'} onClick={phase === 'idle' ? start : stop} className="rounded-xl bg-[var(--nx-accent)] text-[var(--nx-bg)] px-4 py-3 font-semibold disabled:opacity-40">{phase === 'idle' ? 'Ativar assistente por voz' : phase === 'connecting' ? 'Cancelar conexão' : 'Encerrar voz'}</button>
    <p role="status" className="text-sm mt-2">{phase === 'connected' ? 'Microfone ativo · pode falar e interromper a resposta' : phase === 'connecting' ? 'Conectando…' : ''}</p>
    {error && <p role="alert" className="text-red-200 text-sm mt-2">{error}</p>}
    {caption && <p aria-live="polite" className="text-sm text-[var(--nx-text)] mt-3 whitespace-pre-wrap">{caption}</p>}
    <audio ref={player} autoPlay controls className={phase === 'idle' ? 'hidden' : 'w-full mt-3'} />
  </div>
}
