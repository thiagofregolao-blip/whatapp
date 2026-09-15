'use client'

import { useState, useEffect } from 'react'
import { getGroups, updateGroup, syncWhatsapp } from '@/lib/api'

interface Group {
  id: string
  name: string
  whatsapp_chat_id: string
  is_monitored: boolean
  is_excluded: boolean
  message_count_today: number
  last_message_at: string | null
  participant_count: number
}

type Tab = 'all' | 'monitored' | 'ignored'

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days}d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getGroups()
      setGroups(Array.isArray(data) ? data : [])
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar grupos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSync() {
    setSyncing(true)
    try {
      await syncWhatsapp()
      await load()
      setToast('Grupos sincronizados com sucesso')
      setTimeout(() => setToast(null), 3000)
    } catch (err: any) {
      setToast(err?.message || 'Erro ao sincronizar')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setSyncing(false)
    }
  }

  async function toggleMonitored(group: Group) {
    const newValue = !group.is_monitored
    // Optimistic update
    setGroups((prev) =>
      prev.map((g) => (g.id === group.id ? { ...g, is_monitored: newValue } : g))
    )
    try {
      await updateGroup(group.id, { is_monitored: newValue })
    } catch (err: any) {
      // Revert
      setGroups((prev) =>
        prev.map((g) => (g.id === group.id ? { ...g, is_monitored: !newValue } : g))
      )
      setToast(err?.message || 'Erro ao atualizar grupo')
      setTimeout(() => setToast(null), 3000)
    }
  }

  const filtered = groups
    .filter((g) => {
      if (tab === 'monitored') return g.is_monitored
      if (tab === 'ignored') return !g.is_monitored
      return true
    })
    .filter((g) => {
      if (!search) return true
      return (g.name || '').toLowerCase().includes(search.toLowerCase())
    })

  const monitoredCount = groups.filter((g) => g.is_monitored).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-10 h-10 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#dae2fd]">Grupos</h1>
          <p className="text-sm text-[#bbcbb9] mt-1">
            {monitoredCount} de {groups.length} grupos monitorados
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#0b1326] bg-gradient-to-r from-[#4ff07f] to-[#25d366] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2 flex-shrink-0"
        >
          {syncing ? (
            <>
              <div className="w-4 h-4 border-2 border-[#0b1326] border-t-transparent rounded-full animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-lg">sync</span>
              Sincronizar
            </>
          )}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 p-4 bg-[#4ff07f]/10 border border-[#4ff07f]/20 rounded-xl text-sm text-[#4ff07f]">
          {toast}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Search + tabs */}
      <div className="bg-[#060e20] rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#bbcbb9] text-[20px]">
              search
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar grupos..."
              className="w-full bg-[#131b2e] border border-[#3c4a3d]/20 rounded-lg pl-10 pr-4 py-2.5 text-sm text-[#dae2fd] placeholder:text-[#bbcbb9] focus:outline-none focus:border-[#4ff07f]/40"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {[
            { key: 'all' as Tab, label: 'Todos', count: groups.length },
            { key: 'monitored' as Tab, label: 'Monitorados', count: monitoredCount },
            { key: 'ignored' as Tab, label: 'Ignorados', count: groups.length - monitoredCount },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                tab === t.key
                  ? 'bg-[#4ff07f] text-[#0b1326]'
                  : 'bg-[#131b2e] text-[#bbcbb9] hover:text-[#dae2fd]'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="bg-[#060e20] rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-[#131b2e] flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[#4ff07f] text-[28px]">groups</span>
          </div>
          <h3 className="text-base font-semibold text-[#dae2fd] mb-2">
            {search
              ? 'Nenhum grupo encontrado'
              : tab === 'monitored'
              ? 'Nenhum grupo monitorado'
              : tab === 'ignored'
              ? 'Nenhum grupo ignorado'
              : 'Nenhum grupo'}
          </h3>
          <p className="text-sm text-[#bbcbb9] mb-6">
            {search
              ? 'Tente outro termo de busca.'
              : 'Clique em Sincronizar para buscar seus grupos do WhatsApp.'}
          </p>
          {!search && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#0b1326] bg-gradient-to-r from-[#4ff07f] to-[#25d366] hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Sincronizar agora
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((group) => (
            <div
              key={group.id}
              className="bg-[#060e20] rounded-xl p-4 border border-transparent hover:border-[#4ff07f]/20 transition-colors"
            >
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-[#2d3449] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#bbcbb9]">groups</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#dae2fd] truncate">
                    {group.name || 'Sem nome'}
                  </p>
                  <p className="text-[11px] text-[#bbcbb9] mt-0.5">
                    {group.message_count_today} msgs hoje
                  </p>
                  <p className="text-[11px] text-[#bbcbb9]">
                    Ativo {relativeTime(group.last_message_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-[#3c4a3d]/10">
                <span className="text-xs text-[#bbcbb9]">
                  {group.is_monitored ? 'Monitorado' : 'Ignorado'}
                </span>
                <button
                  onClick={() => toggleMonitored(group)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    group.is_monitored ? 'bg-[#4ff07f]' : 'bg-[#2d3449]'
                  }`}
                  aria-label="Toggle monitoring"
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                      group.is_monitored ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
