'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getDigests } from '@/lib/api'

interface Digest {
  id: string
  type: string
  period_start: string
  period_end: string
  total_messages: number
  total_groups: number
  urgent_count: number
  mention_count: number
  content_json?: { overall_summary?: string }
  created_at: string
}

type PeriodFilter = 'all' | '7d' | '30d'
type TypeFilter = 'all' | 'daily' | 'weekly' | 'manual'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function monthLabel(iso: string): string {
  const d = new Date(iso)
  return d
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    .replace(/^./, (c) => c.toUpperCase())
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'agora'
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `há ${days}d`
  return formatDate(iso)
}

export default function HistoryPage() {
  const [digests, setDigests] = useState<Digest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await getDigests()
        setDigests(Array.isArray(data) ? data : [])
      } catch (err: any) {
        setError(err?.message || 'Erro ao carregar histórico')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = useMemo(() => {
    return digests.filter((d) => {
      if (typeFilter !== 'all' && d.type !== typeFilter) return false
      if (periodFilter !== 'all') {
        const days = periodFilter === '7d' ? 7 : 30
        const cutoff = Date.now() - days * 24 * 3600 * 1000
        if (new Date(d.created_at).getTime() < cutoff) return false
      }
      return true
    })
  }, [digests, periodFilter, typeFilter])

  // Group by month
  const grouped = useMemo(() => {
    const map: Record<string, Digest[]> = {}
    for (const d of filtered) {
      const key = monthLabel(d.created_at)
      if (!map[key]) map[key] = []
      map[key].push(d)
    }
    return map
  }, [filtered])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-10 h-10 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#dae2fd]">Histórico de Relatórios</h1>
        <p className="text-sm text-[#bbcbb9] mt-1">
          {digests.length} relatório{digests.length !== 1 ? 's' : ''} gerado
          {digests.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-[#060e20] rounded-xl p-4 mb-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-[#bbcbb9] font-bold mr-2">
              Período:
            </span>
            {(
              [
                { k: 'all' as PeriodFilter, l: 'Todos' },
                { k: '7d' as PeriodFilter, l: 'Últimos 7 dias' },
                { k: '30d' as PeriodFilter, l: 'Últimos 30 dias' },
              ]
            ).map((f) => (
              <button
                key={f.k}
                onClick={() => setPeriodFilter(f.k)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  periodFilter === f.k
                    ? 'bg-[#4ff07f] text-[#0b1326]'
                    : 'bg-[#131b2e] text-[#bbcbb9] hover:text-[#dae2fd]'
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-widest text-[#bbcbb9] font-bold mr-2">
              Tipo:
            </span>
            {(
              [
                { k: 'all' as TypeFilter, l: 'Todos' },
                { k: 'daily' as TypeFilter, l: 'Diário' },
                { k: 'weekly' as TypeFilter, l: 'Semanal' },
                { k: 'manual' as TypeFilter, l: 'Manual' },
              ]
            ).map((f) => (
              <button
                key={f.k}
                onClick={() => setTypeFilter(f.k)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  typeFilter === f.k
                    ? 'bg-[#4ff07f] text-[#0b1326]'
                    : 'bg-[#131b2e] text-[#bbcbb9] hover:text-[#dae2fd]'
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 ? (
        <div className="bg-[#060e20] rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-[#131b2e] flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-[#4ff07f] text-[28px]">history</span>
          </div>
          <h3 className="text-base font-semibold text-[#dae2fd] mb-2">
            Nenhum relatório gerado ainda
          </h3>
          <p className="text-sm text-[#bbcbb9] mb-6">
            Gere seu primeiro relatório para começar a construir o histórico.
          </p>
          <Link
            href="/digest"
            className="inline-block px-5 py-2.5 rounded-xl text-sm font-bold text-[#0b1326] bg-gradient-to-r from-[#4ff07f] to-[#25d366] hover:opacity-90 transition-opacity"
          >
            Gerar primeiro relatório
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([month, items]) => (
            <div key={month}>
              <h2 className="text-[10px] uppercase tracking-widest text-[#bbcbb9] font-bold mb-3 px-1">
                {month}
              </h2>
              <div className="space-y-3">
                {items.map((d) => (
                  <Link
                    key={d.id}
                    href={`/digest?id=${d.id}`}
                    className="block bg-[#060e20] p-5 rounded-xl border border-transparent hover:border-[#4ff07f]/20 transition-colors"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-[#2d3449] flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-[#4ff07f] text-[20px]">
                          summarize
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h3 className="text-sm font-bold text-[#dae2fd]">
                            Resumo de {formatDate(d.created_at)}
                          </h3>
                          <span className="text-[11px] text-[#bbcbb9] flex-shrink-0">
                            {relativeTime(d.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-[#bbcbb9] leading-relaxed line-clamp-2 mb-3">
                          {d.content_json?.overall_summary || 'Sem descrição disponível.'}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#131b2e] text-[#bbcbb9]">
                            {d.total_messages} msgs
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#131b2e] text-[#bbcbb9]">
                            {d.total_groups} grupos
                          </span>
                          {d.urgent_count > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#ffb4ab]/10 text-[#ffb4ab] font-semibold">
                              {d.urgent_count} urgentes
                            </span>
                          )}
                          {d.mention_count > 0 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#72d8c8]/10 text-[#72d8c8] font-semibold">
                              {d.mention_count} menções
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-[#bbcbb9] text-[20px] flex-shrink-0">
                        chevron_right
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
