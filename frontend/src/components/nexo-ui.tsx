'use client'
import { useEffect, useState, useRef } from 'react'
import { api } from '@/lib/api'
import { useApp } from '@/lib/app-context'
import { MessageCircle, Sparkles, UserRound, Search, ChevronRight, ArrowLeft, Send, Star, Sun, Moon, KeyRound, Link2, LogOut, Check, Mic, Volume2, Settings2, X, SquarePen, ArrowRight, RefreshCw } from 'lucide-react'
export const icons = { MessageCircle, Sparkles, UserRound, Search, ChevronRight, ArrowLeft, Send, Star, Sun, Moon, KeyRound, Link2, LogOut, Check, Mic, Volume2, Settings2, X, SquarePen, ArrowRight, RefreshCw }
export function Orb({ small = false }: { small?: boolean }) { return <span aria-hidden="true" className={`luna-orb ${small ? 'small' : ''}`} /> }
export function Avatar({ name, group = false, chatId }: { name: string; group?: boolean; chatId?: string }) {
  const {user,session}=useApp()
  const [photo,setPhoto]=useState<string | null>(null)
  const element=useRef<HTMLSpanElement>(null)
  useEffect(() => {
    setPhoto(null)
    if (!chatId || !user?.id || session?.status!=='connected') return
    let alive=true
    const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();api(`/api/whatsapp/contacts/${encodeURIComponent(chatId)}/photo`).then(data => {if(alive) setPhoto(data.url || null)}).catch(() => {})},{rootMargin:'100px'})
    if(element.current)observer.observe(element.current)
    return () => {alive=false;observer.disconnect()}
  },[chatId,user?.id,session?.connected_at,session?.status])
  const letters = name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'
  const hue = Array.from(name).reduce((n, c) => n + c.charCodeAt(0), 0) % 360
  return <span ref={element} className={`nexo-avatar ${group ? 'group' : ''}`} style={{ '--avatar-hue': hue } as React.CSSProperties}>{photo ? <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setPhoto(null)} /> : letters}</span>
}
