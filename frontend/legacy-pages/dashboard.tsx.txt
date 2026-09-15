'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getDigests, getGroups, generateManualDigest } from '@/lib/api'

interface Group {
  id: string
  name: string
  whatsapp_chat_id: string
  is_monitored: boolean
  message_count_today: number
  last_message_at: string | null
}

interface Digest {
  id: string
  type: string
  period_start: string
  period_end: string
  total_messages: number
  total_groups: number
  urgent_count: number
  mention_count: number
  content_json?: {
    overall_summary?: string
    urgent_items?: Array<{ group?: string; message?: string } | string>
    groups?: Array<{
      chat_name?: string
      name?: string
      message_count?: number
      summary?: string
    }>
  }
  created_at: string
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  } catch {
    return iso
  }
}

export default function DashboardPage() {
  const [digest, setDigest] = useState<Digest | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadData() {
    setLoading(true)
    setError(null)
    try {
      const [digestsRes, groupsRes] = await Promise.all([
        getDigests().catch(() => []),
        getGroups().catch(() => []),
      ])
      setDigest(Array.isArray(digestsRes) && digestsRes.length > 0 ? digestsRes[0] : null)
      setGroups(Array.isArray(groupsRes) ? groupsRes : [])
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleGenerate() {
    setGenerating(true)
    try {
      await generateManualDigest({
        period_hours: 24,
        format: 'detailed',
        channels: ['dashboard'],
      })
      await loadData()
    } catch (err: any) {
      alert(err?.message || 'Erro ao gerar resumo')
    } finally {
      setGenerating(false)
    }
  }

  const monitoredGroups = groups.filter((g) => g.is_monitored)

  const messagesCount = digest?.total_messages ?? 0
  const activeGroupsCount = monitoredGroups.length
  const mentionsCount = digest?.mention_count ?? 0
  const urgentCount = digest?.urgent_count ?? 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-10 h-10 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#dae2fd]">Dashboard</h1>
          <p className="text-sm text-[#bbcbb9] mt-1">
            Visão geral do seu WhatsApp monitorado
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#0b1326] bg-gradient-to-r from-[#4ff07f] to-[#25d366] hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-[#0b1326] border-t-transparent rounded-full animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-lg">auto_awesome</span>
              Gerar resumo agora
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-[#131b2e] border-l-4 border-[#4ff07f] rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#bbcbb9] font-bold mb-2">
            Mensagens
          </p>
          <p className="text-3xl font-bold text-[#dae2fd]">{messagesCount}</p>
          <p className="text-xs text-[#bbcbb9] mt-1">no último resumo</p>
        </div>

        <div className="bg-[#131b2e] border-l-4 border-[#72d8c8] rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#bbcbb9] font-bold mb-2">
            Grupos Ativos
          </p>
          <p className="text-3xl font-bold text-[#dae2fd]">{activeGroupsCount}</p>
          <p className="text-xs text-[#bbcbb9] mt-1">monitorados</p>
        </div>

        <div className="bg-[#131b2e] border-l-4 border-[#99e1d4] rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#bbcbb9] font-bold mb-2">
            Menções
          </p>
          <p className="text-3xl font-bold text-[#dae2fd]">{mentionsCount}</p>
          <p className="text-xs text-[#bbcbb9] mt-1">a você</p>
        </div>

        <div className="bg-[#131b2e] border-l-4 border-[#ffb4ab] rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-[0.15em] text-[#bbcbb9] font-bold mb-2">
            Urgentes
          </p>
          <p className="text-3xl font-bold text-[#dae2fd]">{urgentCount}</p>
          <p className="text-xs text-[#bbcbb9] mt-1">requerem atenção</p>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left/Main: Last digest */}
        <div className="lg:col-span-2 bg-[#060e20] rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4ff07f]">summarize</span>
              <h2 className="text-lg font-bold text-[#dae2fd]">
                {digest ? `Resumo — ${formatDate(digest.created_at)}` : 'Resumo de hoje'}
              </h2>
            </div>
            {digest && (
              <Link
                href={`/digest?id=${digest.id}`}
                className="text-xs text-[#4ff07f] hover:underline flex items-center gap-1"
              >
                Ver completo
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </Link>
            )}
          </div>

          {digest ? (
            <>
              <p className="text-sm text-[#dae2fd] leading-relaxed mb-4">
                {digest.content_json?.overall_summary || 'Sem resumo disponível.'}
              </p>

              {digest.content_json?.urgent_items && digest.content_json.urgent_items.length > 0 && (
                <div className="mt-4 bg-[#131b2e] border border-[#ffb4ab]/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[#ffb4ab] text-lg">
                      priority_high
                    </span>
                    <p className="text-xs font-bold text-[#ffb4ab] uppercase tracking-wide">
                      Itens urgentes
                    </p>
                  </div>
                  <ul className="space-y-1 text-sm text-[#dae2fd]">
                    {digest.content_json.urgent_items.slice(0, 3).map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[#ffb4ab]">•</span>
                        <span>
                          {typeof item === 'string'
                            ? item
                            : `${item.group ? item.group + ': ' : ''}${item.message || ''}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="py-10 text-center">
              <div className="w-16 h-16 rounded-full bg-[#131b2e] flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-[#4ff07f] text-[28px]">
                  auto_awesome
                </span>
              </div>
              <h3 className="text-base font-semibold text-[#dae2fd] mb-2">
                Nenhum resumo gerado ainda
              </h3>
              <p className="text-sm text-[#bbcbb9] mb-6 max-w-md mx-auto">
                Quando as mensagens dos seus grupos começarem a chegar, você poderá gerar seu
                primeiro resumo aqui.
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-[#0b1326] bg-gradient-to-r from-[#4ff07f] to-[#25d366] hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {generating ? 'Gerando...' : 'Gerar meu primeiro resumo'}
              </button>
            </div>
          )}
        </div>

        {/* Right: Quick actions */}
        <div className="space-y-6">
          <div className="bg-[#060e20] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[#72d8c8]">groups</span>
              <h2 className="text-sm font-bold text-[#dae2fd] uppercase tracking-wide">
                Monitoramento
              </h2>
            </div>
            <p className="text-3xl font-bold text-[#dae2fd] mb-1">
              {monitoredGroups.length}
              <span className="text-sm text-[#bbcbb9] font-normal"> / {groups.length}</span>
            </p>
            <p className="text-xs text-[#bbcbb9]">grupos monitorados</p>
            <Link
              href="/groups"
              className="mt-4 block text-center w-full px-4 py-2 rounded-lg text-xs font-semibold border border-[#3c4a3d]/30 text-[#dae2fd] hover:bg-[#131b2e] transition-colors"
            >
              Gerenciar grupos
            </Link>
          </div>

          <div className="bg-[#060e20] rounded-xl p-6">
            <h2 className="text-sm font-bold text-[#dae2fd] uppercase tracking-wide mb-4">
              Atalhos
            </h2>
            <div className="space-y-2">
              <Link
                href="/history"
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-[#dae2fd] hover:bg-[#131b2e] transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#bbcbb9] text-[18px]">
                    history
                  </span>
                  Histórico
                </span>
                <span className="material-symbols-outlined text-[#bbcbb9] text-[16px]">
                  chevron_right
                </span>
              </Link>
              <Link
                href="/scheduled"
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-[#dae2fd] hover:bg-[#131b2e] transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#bbcbb9] text-[18px]">
                    calendar_today
                  </span>
                  Agendados
                </span>
                <span className="material-symbols-outlined text-[#bbcbb9] text-[16px]">
                  chevron_right
                </span>
              </Link>
              <Link
                href="/settings"
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-[#dae2fd] hover:bg-[#131b2e] transition-colors"
              >
                <span className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-[#bbcbb9] text-[18px]">
                    settings
                  </span>
                  Configurações
                </span>
                <span className="material-symbols-outlined text-[#bbcbb9] text-[16px]">
                  chevron_right
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Monitored groups list */}
      {monitoredGroups.length > 0 && (
        <div className="mt-8 bg-[#060e20] rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4ff07f]">groups</span>
              <h2 className="text-lg font-bold text-[#dae2fd]">Grupos Monitorados</h2>
            </div>
            <Link
              href="/groups"
              className="text-xs text-[#4ff07f] hover:underline flex items-center gap-1"
            >
              Ver todos
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {monitoredGroups.slice(0, 9).map((group) => (
              <div
                key={group.id}
                className="flex items-center gap-3 p-3 bg-[#131b2e] rounded-xl"
              >
                <div className="w-10 h-10 rounded-lg bg-[#2d3449] flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-[#bbcbb9] text-[18px]">
                    groups
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#dae2fd] truncate">
                    {group.name || 'Sem nome'}
                  </p>
                  <p className="text-[11px] text-[#bbcbb9]">
                    {group.message_count_today} msgs hoje
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
