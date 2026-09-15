import { MessageCircle, Sparkles, UserRound, Search, ChevronRight, ArrowLeft, Send, Star, Sun, Moon, KeyRound, Link2, LogOut, Check, Mic, Volume2, Settings2, X } from 'lucide-react'
export const icons = { MessageCircle, Sparkles, UserRound, Search, ChevronRight, ArrowLeft, Send, Star, Sun, Moon, KeyRound, Link2, LogOut, Check, Mic, Volume2, Settings2, X }
export function Orb({ small = false }: { small?: boolean }) { return <span aria-hidden="true" className={`luna-orb ${small ? 'small' : ''}`} /> }
export function Avatar({ name, group = false }: { name: string; group?: boolean }) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || '?'
  const hue = Array.from(name).reduce((n, c) => n + c.charCodeAt(0), 0) % 360
  return <span className={`nexo-avatar ${group ? 'group' : ''}`} style={{ '--avatar-hue': hue } as React.CSSProperties}>{letters}</span>
}
