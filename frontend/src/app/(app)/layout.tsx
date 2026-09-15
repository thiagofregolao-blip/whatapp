'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getMe, getWhatsappStatus } from '@/lib/api'
import { AppContext } from '@/lib/app-context'
import { Avatar, Orb, icons } from '@/components/nexo-ui'
const { MessageCircle, UserRound } = icons
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [session, setSession] = useState<any>(null)
  const [error, setError] = useState('')
  const [theme, setTheme] = useState('dark')
  const path = usePathname()
  async function refreshUser() {
    setError('')
    try { setUser(await getMe()); setSession(await getWhatsappStatus()) }
    catch (e: any) { setError(e.message) }
  }
  useEffect(() => {
    if (!localStorage.getItem('access_token')) { window.location.href='/auth/login'; return }
    refreshUser()
    const readTheme = () => setTheme(localStorage.getItem('nexo-theme') || 'dark')
    readTheme(); window.addEventListener('nexo-preferences', readTheme)
    const timer = setInterval(() => getWhatsappStatus().then(setSession).catch(() => {}), 15000)
    return () => { clearInterval(timer); window.removeEventListener('nexo-preferences', readTheme) }
  }, [])
  return <AppContext.Provider value={{ user, session, refreshUser }}>
    <div className="nexo-shell" data-theme={theme}>
      <header className="nexo-header"><Link href="/messages" className="nexo-brand"><span className="nexo-mark">N</span>Nexo<span className="brand-caption">SEU TEMPO DE VOLTA</span></Link><Link href="/settings" className="profile-link" aria-label="Abrir perfil"><Avatar name={user?.name || user?.email || 'Você'} /><i className={session?.status === 'connected' ? 'online-dot' : 'offline-dot'} /></Link></header>
      {error && <div role="alert" className="nexo-error">{error} <button onClick={refreshUser}>Tentar novamente</button> · <Link href="/auth/login">Entrar novamente</Link></div>}
      {children}
      <nav className="nexo-bottom" aria-label="Navegação principal">
        <Link href="/messages" aria-current={path === '/messages' ? 'page' : undefined}><MessageCircle /><span>Conversas</span></Link>
        <Link href="/assistant" className="agent-tab" aria-current={path === '/assistant' ? 'page' : undefined}><Orb small /><span>Luna</span></Link>
        <Link href="/settings" aria-current={path === '/settings' || path.startsWith('/onboarding') ? 'page' : undefined}><UserRound /><span>Perfil</span></Link>
      </nav>
    </div>
  </AppContext.Provider>
}
