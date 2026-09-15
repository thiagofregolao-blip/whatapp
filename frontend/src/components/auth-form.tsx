'use client'
import { useState } from 'react'
import Link from 'next/link'
import { login, register } from '@/lib/api'
export default function AuthForm({ creating=false }: { creating?: boolean }) {
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false)
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError('')
    const f=new FormData(e.currentTarget)
    try {
      const fields={ email:String(f.get('email')), password:String(f.get('password')) }
      const result=creating ? await register({...fields,name:String(f.get('name')),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone}) : await login(fields)
      localStorage.setItem('access_token',result.access_token);localStorage.setItem('refresh_token',result.refresh_token)
      window.location.href='/assistant'
    } catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  return <main className="min-h-dvh max-w-md mx-auto px-6 py-16"><Link href="/" className="text-[#4ff07f] font-semibold">Leitor de WhatsApp</Link><h1 className="text-3xl font-semibold mt-10">{creating?'Crie sua conta':'Bem-vindo de volta'}</h1><p className="text-slate-400 mt-3 mb-8">Seu assistente pessoal para entender o que chegou.</p>{error&&<p role="alert" className="bg-red-950 p-4 rounded-xl mb-4">{error}</p>}<form onSubmit={submit} className="space-y-5">{creating&&<label className="block">Nome<input name="name" autoComplete="name" required minLength={2} maxLength={100} className="block w-full bg-[#131b2e] border border-white/20 rounded-xl p-3 mt-2 text-base" /></label>}<label className="block">E-mail<input name="email" type="email" autoComplete="email" required className="block w-full bg-[#131b2e] border border-white/20 rounded-xl p-3 mt-2 text-base" /></label><label className="block">Senha<input name="password" type="password" autoComplete={creating?'new-password':'current-password'} minLength={creating?8:1} required className="block w-full bg-[#131b2e] border border-white/20 rounded-xl p-3 mt-2 text-base" /></label><button disabled={busy} className="w-full rounded-xl bg-[#4ff07f] text-[#00351b] font-semibold p-3 disabled:opacity-40">{busy?'Aguarde…':creating?'Criar conta':'Entrar'}</button></form><p className="text-sm text-slate-400 mt-6">{creating?'Já tem conta?':'Primeira vez?'} <Link className="text-[#4ff07f] underline" href={creating?'/auth/login':'/auth/register'}>{creating?'Entrar':'Criar conta'}</Link></p></main>
}
