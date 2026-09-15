'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { connectWhatsapp, getWhatsappStatus, api } from '@/lib/api'
import { useApp } from '@/lib/app-context'
export default function Connect() {
  const { refreshUser } = useApp()
  const [status, setStatus] = useState('disconnected')
  const [qr, setQr] = useState('')
  const [expires, setExpires] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    async function poll() { try { const s = await getWhatsappStatus(); if (active) { setStatus(s?.status || 'disconnected'); setQr(s?.qr_code || ''); setExpires(s?.qr_expires_at ? Date.parse(s.qr_expires_at) : 0); setError(s?.error_message || '') } } catch (e: any) { if (active) setError(e.message) } }
    poll(); const timer = setInterval(poll, 5000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  useEffect(() => { const timer = setInterval(() => setSeconds(Math.max(0, Math.ceil((expires-Date.now())/1000))), 1000); return () => clearInterval(timer) }, [expires])
  async function connect() {
    setBusy(true); setError('')
    try { const result = await connectWhatsapp(); setQr(result.qr_code || ''); setExpires(result.qr_expires_at ? Date.parse(result.qr_expires_at) : 0); setSeconds(0); setStatus(result.status || 'connecting') }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  return <main className="max-w-lg mx-auto px-5 py-10"><h1 className="text-3xl font-semibold">Conecte seu WhatsApp</h1><p className="text-[var(--nx-accent)] text-sm mt-2">Seu WhatsApp, agora no Nexo</p><p className="text-[var(--nx-muted)] mt-3 mb-6">No WhatsApp, abra Configurações (iPhone) ou o menu ⋮ (Android) → Dispositivos conectados → Conectar dispositivo. Para escanear, exiba este QR em outra tela.</p>
    {error && <p role="alert" className="p-4 rounded-xl bg-red-950 mb-4">{error}</p>}
    {status === 'connected' ? <div className="rounded-2xl bg-[var(--nx-soft)] p-6"><h2 className="font-semibold text-[var(--nx-accent)]">WhatsApp conectado</h2><p className="my-3">As novas mensagens recebidas aparecerão no assistente.</p><Link className="underline" href="/messages" onClick={refreshUser}>Abrir conversas</Link><button disabled={busy} className="block mt-6 text-sm underline" onClick={async () => { setBusy(true); try { await api('/api/whatsapp/disconnect', { method: 'DELETE' }); setStatus('disconnected'); setQr(''); await refreshUser() } catch (e: any) { setError(e.message) } finally { setBusy(false) } }}>Desconectar conta</button></div> : <div className="rounded-2xl bg-[var(--nx-panel)] p-6 text-center">
      {qr && seconds > 0 ? <><div className="bg-white p-4 rounded-xl inline-block"><QRCodeSVG value={qr} size={224} /></div><p className="mt-3">Aguardando leitura · {seconds}s</p></> : <p className="text-[var(--nx-muted)] py-6">{qr ? 'QR expirado. Aguarde a atualização automática ou gere outro.' : status === 'connecting' ? 'Preparando a conexão… o QR aparece automaticamente.' : 'Nenhuma conta conectada.'}</p>}
      <button disabled={busy || (status === 'connecting' && (!qr || seconds > 0))} onClick={connect} className="mt-5 rounded-xl bg-[var(--nx-accent)] text-[var(--nx-bg)] font-semibold px-5 py-3 disabled:opacity-40">{busy ? 'Gerando…' : qr && seconds === 0 ? 'Gerar novo QR' : status === 'connecting' ? 'Aguardando conexão…' : qr ? 'Gerar novo QR' : 'Gerar QR Code'}</button>
    </div>}
    <p className="text-sm text-[var(--nx-muted)] mt-6">Mantenha o servidor ligado para receber mensagens. Não é necessária uma conta Unipile. O app recebe novas mensagens após a conexão; o histórico anterior não é importado nesta versão. A IA usa os textos selecionados como contexto.</p>
  </main>
}
