'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { Avatar, icons } from '@/components/nexo-ui'
const { KeyRound, Link2, Sun, Moon, LogOut, Check, ChevronRight, Volume2, Sparkles } = icons
export default function Profile() {
  const { user, session } = useApp()
  const [settings, setSettings] = useState<any>(null), [mode, setMode] = useState('personal'), [key, setKey] = useState(''), [theme, setTheme] = useState('light'), [alerts, setAlerts] = useState('manual')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  async function load() { const value = await api('/api/assistant/status'); setSettings(value); setMode(value.mode) }
  useEffect(() => { load().catch(e => setError(e.message)); setTheme(localStorage.getItem('luna-theme') || 'light'); setAlerts(localStorage.getItem('nexo-alerts') || 'manual') }, [])
  function preference(name: string, value: string) { localStorage.setItem(name === 'theme' ? 'luna-theme' : `nexo-${name}`, value); window.dispatchEvent(new Event('nexo-preferences')); if (name === 'theme') setTheme(value); else setAlerts(value) }
  async function save() {
    setBusy(true); setError(''); setNotice('')
    try { await api('/api/assistant/settings', { method: 'PUT', body: JSON.stringify({ mode, ...(key.trim() ? { api_key: key.trim() } : {}) }) }); setKey(''); await load(); setNotice('Preferência salva. Reinicie a voz para aplicar.') }
    catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function remove() { setBusy(true); setError(''); try { await api('/api/assistant/settings/key', { method: 'DELETE' }); setKey(''); await load(); setNotice('Chave removida. Encerre a chamada de voz atual, se estiver aberta.') } catch (e: any) { setError(e.message) } finally { setBusy(false) } }
  return <main className="nexo-page profile-page"><div className="page-heading"><div><p className="eyebrow">DO SEU JEITO</p><h1>Seu perfil<span>.</span></h1></div></div>
    <section className="profile-summary"><Avatar name={user?.name || user?.email || 'Você'} /><div><h2>{user?.name || 'Sua conta'}</h2><p>{user?.email}</p></div><span className="small-badge">Assistente</span></section>
    {error && <p role="alert" className="nexo-error">{error}</p>}{notice && <p role="status" className="nexo-notice">{notice}</p>}
    <div className="settings-grid"><section className="nexo-card"><div className="section-icon"><KeyRound /></div><h2>A inteligência é sua</h2><p className="muted">Escolha como usar a Luna. Sua chave fica criptografada no servidor e nunca é exibida de volta.</p>
      <div className="billing-options"><button aria-pressed={mode === 'personal'} className={mode === 'personal' ? 'selected' : ''} onClick={() => setMode('personal')}><KeyRound size={19} /><strong>Minha chave OpenAI</strong><small>Consumo cobrado na sua conta OpenAI</small></button><button aria-pressed={mode === 'platform'} className={mode === 'platform' ? 'selected' : ''} onClick={() => setMode('platform')}><Sparkles size={19} /><strong>Créditos do app</strong><small>{settings?.platform_access ? 'Acesso de teste já habilitado' : 'Compra de créditos em breve'}</small></button></div>
      {mode === 'personal' ? <><label className="field-label" htmlFor="api-key">Chave da API {settings?.key_saved && <span><Check size={14} />Salva</span>}</label><input id="api-key" className="nexo-input" type="password" autoComplete="off" spellCheck={false} placeholder={settings?.key_saved ? 'Cole uma nova chave para substituir' : 'sk-…'} value={key} onChange={e => setKey(e.target.value)} maxLength={512} /><p className="helper">A chave será verificada antes de salvar. Ter uma assinatura ChatGPT não substitui o saldo da API.</p><a className="text-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">Criar chave na OpenAI ↗</a></> : <p className="helper">{settings?.platform_access ? 'Sua conta mantém o acesso de teste existente. Este acesso não representa créditos comprados.' : 'Ainda não há compra ou saldo de créditos disponível. Para usar a Luna agora, adicione sua chave OpenAI.'}</p>}
      <div className="actions"><button className="nexo-primary" disabled={busy || !settings} onClick={save}>{busy ? 'Salvando…' : 'Salvar preferência'}</button>{settings?.key_saved && <button className="text-link" disabled={busy} onClick={remove}>Remover chave</button>}</div>
    </section><div className="settings-stack"><section className="nexo-card"><h2>Conexão WhatsApp</h2><Link className="setting-row" href="/onboarding/connect"><Link2 /><span><strong>{session?.status === 'connected' ? 'WhatsApp conectado' : 'Conectar WhatsApp'}</strong><small>{session?.status === 'connected' ? 'Gerenciar dispositivo vinculado' : 'Leia o QR Code para começar'}</small></span><ChevronRight /></Link></section>
      <section className="nexo-card"><h2>Aparência</h2><div className="segmented"><button aria-pressed={theme === 'light'} onClick={() => preference('theme', 'light')}><Sun size={18} />Claro</button><button aria-pressed={theme === 'dark'} onClick={() => preference('theme', 'dark')}><Moon size={18} />Escuro</button></div><h2 className="mt-6">Avisos por voz</h2><div className="segmented"><button aria-pressed={alerts === 'manual'} onClick={() => preference('alerts', 'manual')}>Só quando eu pedir</button><button aria-pressed={alerts === 'notify'} onClick={() => preference('alerts', 'notify')}><Volume2 size={16} />Avisar chegadas</button></div><p className="helper">Enquanto a tela e a voz estiverem ativas. As mensagens continuam chegando ao servidor nos dois modos.</p></section></div></div>
    <section className="nexo-plan"><div><span className="small-badge">PLANO EM PREPARAÇÃO</span><h2>Plano Essencial <span>R$ 9,90<small>/mês</small></span></h2><p>Conversas organizadas, favoritas e relatório do dia. Voz com chave própria ou créditos à parte.</p><p className="helper">Proposta de plano. Assinatura, franquias e pagamento ainda não ativados.</p></div><Link className="nexo-primary" href="/reports">Conhecer o relatório <ChevronRight size={18} /></Link></section>
    <button className="logout-button" onClick={() => { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); window.location.href='/auth/login' }}><LogOut size={18} />Sair da conta</button>
  </main>
}
