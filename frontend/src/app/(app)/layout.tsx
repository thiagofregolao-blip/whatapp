'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getMe, getWhatsappStatus } from '@/lib/api'
import { AppContext } from '@/lib/app-context'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [error, setError] = useState('')
  async function refreshUser() {
    setError('')
    try {
      setUser(await getMe())
      setSession(await getWhatsappStatus())
    } catch (e: any) { setError(e.message) }
  }
  useEffect(() => {
    if (!localStorage.getItem('access_token')) { window.location.href='/auth/login'; return }
    refreshUser()
  }, [])
  return <AppContext.Provider value={{ user, session, refreshUser }}>
    <div className="min-h-dvh bg-[#0b1326]">
      <header className="border-b border-white/10 px-4 py-4 flex items-center justify-between gap-3">
        <Link href="/assistant" className="font-bold text-[#4ff07f]">Leitor de WhatsApp</Link>
        <nav className="flex gap-4 text-sm"><Link href="/assistant">Assistente</Link><Link href="/onboarding/connect">Conexão</Link><button onClick={() => { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); window.location.href='/auth/login' }}>Sair</button></nav>
      </header>
      {error && <div role="alert" className="p-4 bg-red-950 text-red-100">{error} <button onClick={refreshUser} className="underline">Tentar novamente</button> · <Link href="/auth/login">Entrar novamente</Link></div>}
      {children}
    </div>
  </AppContext.Provider>
}
