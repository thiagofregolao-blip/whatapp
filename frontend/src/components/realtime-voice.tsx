'use client'
import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { api } from '@/lib/api'
import { InboxMessage, ReviewDraft, takeVoiceTurn } from '@/lib/assistant-flow'

type VoiceResources = { unmute?: ReturnType<typeof setTimeout>; mutedUntil?: number; pc: RTCPeerConnection; stream?: MediaStream; channel?: RTCDataChannel; timer?: ReturnType<typeof setTimeout>; abort: AbortController; pump?: ReturnType<typeof setInterval>; responding?: boolean; needsResponse?: boolean; speaking?: boolean; audioPlaying?: boolean; pendingTools?: number; flush?: () => void }

type Props = { messageId?: string; incoming: InboxMessage[]; draft: ReviewDraft | null; onAction: (name: string, args: any) => Promise<any>; voiceEvent: { id: number; text: string } | null }
export default function RealtimeVoice(props: Props) {
  const { messageId } = props
  const latest = useRef(props); latest.current = props
  const announced = useRef(new Set<string>())
  const lastVoiceEvent = useRef(0)
  const [phase, setPhase] = useState<'idle' | 'connecting' | 'connected'>('idle')
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const [needsPermission, setNeedsPermission] = useState(false)
  const [needsAudio, setNeedsAudio] = useState(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout>>()
  const retries = useRef(0)
  const startRef = useRef<() => Promise<void>>(async () => {})
  startRef.current = start
  const [error, setError] = useState('')
  const [caption, setCaption] = useState('')
  const [talking,setTalking]=useState(false)
  const diagnosticSession=useRef('')
  const diagnostics=useRef<{event:string;code?:string}[]>([])
  function log(event:string,code?:string){diagnostics.current.push({event,code:code?.replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,80)});diagnostics.current=diagnostics.current.slice(-100)}
  useEffect(()=>{diagnosticSession.current=crypto.randomUUID(); const flush=()=>{const events=diagnostics.current.splice(0,20);if(events.length)void api('/api/assistant/diagnostics',{method:'POST',body:JSON.stringify({session:diagnosticSession.current,events})}).catch(()=>{})};const timer=setInterval(flush,5000);return()=>{clearInterval(timer);flush()}},[])
  const alertMode = useRef('manual')
  const [configured, setConfigured] = useState<boolean | null>(null)
  const selected = useRef(messageId)
  selected.current = messageId
  const resources = useRef<VoiceResources | null>(null)
  const player = useRef<HTMLAudioElement>(null)

  function stop() {
    const r = resources.current
    resources.current = null
    if (r) { log('voice.stopped'); clearTimeout(r.unmute); clearTimeout(r.timer); clearInterval(r.pump); r.abort.abort(); r.stream?.getTracks().forEach(t => t.stop()); r.channel?.close(); r.pc.close() }
    if (player.current) { player.current.pause(); player.current.srcObject = null }
    setPhase('idle');setTalking(false)
  }
  useEffect(() => { if (configured && !paused && !document.hidden) { void startRef.current() } }, [configured,paused])
  useEffect(() => {
    let active = true
    const check = () => api('/api/assistant/status').then(s => { if (active) setConfigured(s.configured) }).catch(() => { if (active) setConfigured(null) })
    const readPreferences = () => { alertMode.current = localStorage.getItem('nexo-alerts') || 'manual' }
    readPreferences(); window.addEventListener('nexo-preferences', readPreferences)
    check(); const timer = setInterval(check, 30000)
    const hide = () => { if (document.hidden) { clearTimeout(retryTimer.current); stop() } else if (!pausedRef.current) { void startRef.current() } }
    document.addEventListener('visibilitychange', hide)
    return () => { active = false; clearTimeout(retryTimer.current); window.removeEventListener('nexo-preferences', readPreferences); clearInterval(timer); document.removeEventListener('visibilitychange', hide); stop() }
  }, [])

  async function start() {
    if (resources.current || pausedRef.current || configured !== true || document.hidden) return
    log('voice.start');setError(''); setNeedsPermission(false); setNeedsAudio(false); setCaption(''); setPhase('connecting')
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) { setError('Abra em HTTPS no Safari ou Chrome para usar o microfone.'); setPhase('idle'); return }
    const r = { pc: new RTCPeerConnection(), abort: new AbortController() } as VoiceResources
    resources.current = r
    const current = () => resources.current === r
    try {
      r.timer = setTimeout(() => { if (current()) { stop(); setError('A conexão de voz demorou demais. Tente novamente.') } }, 35000)
      r.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      if (!current()) { r.stream.getTracks().forEach(t => t.stop()); return }
      r.stream.getTracks().forEach(track => r.pc.addTrack(track, r.stream!))
      r.pc.ontrack = event => {
        if (current() && player.current) { player.current.srcObject = event.streams[0]; player.current.play().catch(() => setNeedsAudio(true)) }
      }
      r.pc.onconnectionstatechange = () => {
        if (!current()) return
        if (r.pc.connectionState === 'connected') {
          clearTimeout(r.timer); setPhase('connected');log('voice.connected')
          retries.current = 0
          const renew = () => { if (!current()) return; if (r.responding || r.speaking || r.pendingTools) { r.timer = setTimeout(renew,10000); return }; stop(); void startRef.current() }
          r.timer = setTimeout(renew, 55 * 60000)
        } else if (['failed', 'disconnected', 'closed'].includes(r.pc.connectionState)) { stop(); setError('Reconectando a voz…'); if (++retries.current <= 3) retryTimer.current = setTimeout(() => { void startRef.current() }, 3000 * retries.current) }
      }
      const channel = r.pc.createDataChannel('oai-events'); r.channel = channel
      const handled = new Set<string>()
      const sentUtterances = new Set<string>()
      const spokenInputs=new Set<string>()
      const blockedInputs=new Set<string>()
      let captureId: string | null=null
      const eventsSeen=new Set<string>()
      let userUtterance: string | null = null
      const respond = () => {
        r.needsResponse = true
        if (r.responding || r.speaking || r.audioPlaying || r.pendingTools) return
        r.needsResponse = false; r.responding = true
        log('voice.response_requested');channel.send(JSON.stringify({ type: 'response.create' }))
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
        if(data.event_id){if(eventsSeen.has(data.event_id))return;eventsSeen.add(data.event_id);if(eventsSeen.size>1000)eventsSeen.delete(eventsSeen.values().next().value!)}
        if (data.type === 'response.created') {r.responding = true;log('voice.response_created')}
        if (data.type === 'response.done') {r.responding = false;log('voice.response_done',data.response?.status || 'unknown')}
        if (data.type === 'output_audio_buffer.started') {
          if(captureId)blockedInputs.add(captureId);r.speaking=false;clearTimeout(r.unmute);r.audioPlaying=true;setTalking(true);r.stream?.getAudioTracks().forEach(t=>t.enabled=false);log('voice.output_started')
        }
        if (data.type === 'output_audio_buffer.stopped' || data.type === 'output_audio_buffer.cleared') {
          r.audioPlaying=false;r.mutedUntil=Date.now()+450;setTalking(false);log('voice.output_stopped')
          clearTimeout(r.unmute);r.unmute=setTimeout(()=>{if(!current() || r.audioPlaying)return;if(channel.readyState==='open')channel.send(JSON.stringify({type:'input_audio_buffer.clear'}));r.stream?.getAudioTracks().forEach(t=>t.enabled=true)},450)
        }
        if(data.type==='conversation.item.input_audio_transcription.completed'){
          if(!takeVoiceTurn(spokenInputs,data.item_id,String(data.transcript || ''),blockedInputs.has(data.item_id) || Boolean(r.audioPlaying) || Date.now()<(r.mutedUntil || 0))){log('voice.input_ignored');return}
          userUtterance=data.item_id;r.speaking=false;log('voice.input_ready');respond()
        }
        if (data.type === 'input_audio_buffer.speech_started') {
          captureId=data.item_id || null
          if(captureId && (r.audioPlaying || Date.now()<(r.mutedUntil || 0)))blockedInputs.add(captureId)
          r.speaking = !r.audioPlaying
          userUtterance = data.item_id || null
        }
        if (data.type === 'input_audio_buffer.speech_stopped') r.speaking = false
        if (data.type === 'response.output_audio_transcript.done') setCaption(data.transcript)
        if (data.type === 'error') {
          const code = String(data.error?.code || 'unknown').replace(/[^a-zA-Z0-9_.-]/g,'_').slice(0,80)
          log('voice.error',code)
          if (code === 'conversation_already_has_active_response') { r.responding=true; r.needsResponse=false; return }
          if (code === 'response_cancel_not_active') return
          stop(); setError(`Voz indisponível (${code}).`); return
        }
        if (data.type !== 'response.function_call_arguments.done' || handled.has(data.call_id)) return
        handled.add(data.call_id);log('voice.tool',data.name)
        r.pendingTools = (r.pendingTools || 0) + 1
        let output: any = { error: 'Ferramenta indisponível. Nenhuma ação executada.' }
        try {
          const args = JSON.parse(data.arguments)
          if (data.name === 'consultar_luna') {
            if (typeof args.question !== 'string') throw new Error('Pergunta inválida')
            setCaption('Luna está consultando suas mensagens…')
            output = await api('/api/assistant/chat', { method: 'POST', signal: r.abort.signal, body: JSON.stringify({ question: args.question, message_id: args.message_id || selected.current, history: [] }) })
          } else if (['buscar_contatos','ler_conversa'].includes(data.name)) {
            if (typeof args.name !== 'string') throw new Error('Qual contato?')
            output = await api(`/api/whatsapp/contacts?q=${encodeURIComponent(args.name)}`)
            if (data.name === 'ler_conversa' && output.total===1) {const contact=output.contacts[0];output={contact:contact.name,messages:(await api(`/api/whatsapp/messages/conversations/${encodeURIComponent(contact.chat_id)}`)).slice(-30)}}
          } else if (['enviar_mensagem','preparar_mensagem'].includes(data.name)) {
            if (typeof args.recipient !== 'string' || typeof args.content !== 'string' || !args.content.trim() || args.content.length>4000) throw new Error('Informe o contato e a mensagem.')
            if (data.name === 'enviar_mensagem') {
              if (!userUtterance || sentUtterances.has(userUtterance)) throw new Error('Este pedido já foi processado. Não repita.')
              sentUtterances.add(userUtterance)
            }
            output = await latest.current.onAction(data.name,args)
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
    } catch (e: any) { if (current()) { stop(); setNeedsPermission(e.name === 'NotAllowedError'); setError(e.name === 'NotAllowedError' ? 'O iPhone precisa da sua permissão para usar o microfone.' : e.message || 'Falha ao iniciar voz.') } }
  }
  return <div className="luna-presence" role="region" aria-label="Luna por voz">
    <span className={`voice-dot ${phase === 'connected' ? 'listening' : ''}`} /><span className="voice-state">{paused ? 'Luna pausada' : phase === 'connected' ? talking ? 'Luna está falando' : 'Luna está ouvindo' : phase === 'connecting' ? 'Luna está conectando…' : configured === false ? 'Configure a IA em Perfil' : 'Luna · voz'}</span>
    <button className="icon-button" aria-label={paused ? 'Retomar microfone' : 'Pausar microfone'} onClick={() => { pausedRef.current=!paused; setPaused(!paused); if (!paused) { clearTimeout(retryTimer.current); stop() } }}>{paused ? <MicOff size={18} /> : <Mic size={18} />}</button>
    {needsPermission && <button className="text-link" onClick={() => startRef.current()}>Permitir microfone</button>}
    {needsAudio && <button className="text-link" onClick={() => { player.current?.play().then(() => setNeedsAudio(false)).catch(() => setError('O navegador bloqueou o áudio.')) }}>Liberar áudio</button>}
    {error && <span className="voice-error" role="alert">{error}</span>}
    {caption && <details className="voice-caption"><summary>Última resposta</summary><p>{caption}</p></details>}
    <audio ref={player} autoPlay playsInline className="hidden" />
  </div>
}
