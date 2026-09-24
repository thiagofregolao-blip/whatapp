'use client'
import { useSyncExternalStore } from 'react'
import { api } from '@/lib/api'

// One shared, lightweight poll for the whole app. Screens reload their data only
// when this version changes, and nothing is polled while the app is in background.
let version = ''
let timer: ReturnType<typeof setInterval> | undefined
let inflight = false
const listeners = new Set<() => void>()
async function check() {
  if (inflight || document.hidden) return
  inflight = true
  try {
    const next = (await api('/api/whatsapp/messages/updates')).version as string
    if (next !== version) { version = next; listeners.forEach(l => l()) }
  } catch { /* keep the last known version */ } finally { inflight = false }
}
const visible = () => { if (!document.hidden) void check() }
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) { void check(); timer = setInterval(check, 4000); document.addEventListener('visibilitychange', visible) }
  return () => { listeners.delete(listener); if (!listeners.size) { clearInterval(timer); document.removeEventListener('visibilitychange', visible) } }
}
export function useInboxVersion() { return useSyncExternalStore(subscribe, () => version, () => '') }
export function refreshInboxVersion() { void check() }
