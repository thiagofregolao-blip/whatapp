'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { getSchedule, updateSchedule, getDigests } from '@/lib/api'

interface Schedule {
  id: string
  user_id: string
  cron_expression: string
  delivery_channels: string[]
  report_format: string
  is_active: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
}

interface Digest {
  id: string
  created_at: string
  type: string
  total_messages: number
}

const DAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/**
 * Parser simplificado do cron: esperamos formato "M H DOM MON DOW"
 * ex: "0 22 * * *" => hora 22, minuto 0, todos os dias
 * ex: "0 22 * * 1,2,3,4,5" => hora 22, minuto 0, seg-sex
 */
function parseCron(cron: string): { hour: string; minute: string; days: boolean[] } {
  const parts = cron.trim().split(/\s+/)
  if (parts.length < 5) {
    return { hour: '22', minute: '00', days: [true, true, true, true, true, true, true] }
  }
  const [min, hour, , , dow] = parts
  const days = new Array(7).fill(false)
  if (dow === '*') {
    days.fill(true)
  } else {
    dow.split(',').forEach((d) => {
      const n = parseInt(d, 10)
      if (!isNaN(n) && n >= 0 && n <= 6) days[n] = true
    })
  }
  return {
    hour: hour.padStart(2, '0'),
    minute: min.padStart(2, '0'),
    days,
  }
}

function buildCron(hour: string, minute: string, days: boolean[]): string {
  const allDays = days.every(Boolean)
  const dow = allDays
    ? '*'
    : days
        .map((v, i) => (v ? String(i) : null))
        .filter(Boolean)
        .join(',')
  return `${parseInt(minute, 10)} ${parseInt(hour, 10)} * * ${dow}`
}

function formatNextRun(iso: string | null): string {
  if (!iso) return 'Aguardando primeira execução'
  const d = new Date(iso)
  const diff = d.getTime() - Date.now()
  if (diff < 0) return 'Pendente'
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) {
    const mins = Math.floor(diff / 60000)
    return `Em ${mins} min`
  }
  if (hours < 24) return `Em ${hours}h`
  const days = Math.floor(hours / 24)
  return `Em ${days}d ${hours % 24}h`
}

function formatDigestDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ScheduledPage() {
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [digests, setDigests] = useState<Digest[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  // Editable state
  const [hour, setHour] = useState('22')
  const [minute, setMinute] = useState('00')
  const [days, setDays] = useState<boolean[]>([true, true, true, true, true, true, true])
  const [channels, setChannels] = useState<Record<string, boolean>>({
    whatsapp: false,
    email: false,
    dashboard: true,
  })
  const [format, setFormat] = useState<'short' | 'detailed' | 'executive'>('detailed')
  const [isActive, setIsActive] = useState(true)

  // Original state for diff
  const [original, setOriginal] = useState<string>('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [sch, digs] = await Promise.all([
        getSchedule().catch(() => null),
        getDigests().catch(() => []),
      ])
      setSchedule(sch)
      setDigests(Array.isArray(digs) ? digs.slice(0, 10) : [])

      if (sch) {
        const parsed = parseCron(sch.cron_expression || '0 22 * * *')
        setHour(parsed.hour)
        setMinute(parsed.minute)
        setDays(parsed.days)
        setFormat((sch.report_format as any) || 'detailed')
        setIsActive(sch.is_active)
        const chs: Record<string, boolean> = { whatsapp: false, email: false, dashboard: false }
        ;(sch.delivery_channels || []).forEach((c: string) => (chs[c] = true))
        setChannels(chs)
        setOriginal(
          JSON.stringify({
            hour: parsed.hour,
            minute: parsed.minute,
            days: parsed.days,
            format: sch.report_format,
            isActive: sch.is_active,
            channels: chs,
          })
        )
      }
    } catch (err: any) {
      setError(err?.message || 'Erro ao carregar agendamento')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const current = JSON.stringify({ hour, minute, days, format, isActive, channels })
  const hasChanges = original && current !== original

  async function handleSave() {
    // Validation
    if (!days.some(Boolean)) {
      setToast('Selecione pelo menos um dia')
      setTimeout(() => setToast(null), 3000)
      return
    }
    const activeChannels = Object.entries(channels)
      .filter(([, v]) => v)
      .map(([k]) => k)
    if (activeChannels.length === 0) {
      setToast('Selecione pelo menos um canal de entrega')
      setTimeout(() => setToast(null), 3000)
      return
    }

    setSaving(true)
    try {
      const cron = buildCron(hour, minute, days)
      await updateSchedule({
        cron_expression: cron,
        delivery_channels: activeChannels,
        report_format: format,
        is_active: isActive,
      })
      await load()
      setToast('Agendamento atualizado com sucesso')
      setTimeout(() => setToast(null), 3000)
    } catch (err: any) {
      setToast(err?.message || 'Erro ao salvar agendamento')
      setTimeout(() => setToast(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  function toggleDay(i: number) {
    setDays((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
  }

  function toggleChannel(k: string) {
    setChannels((prev) => ({ ...prev, [k]: !prev[k] }))
  }

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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#dae2fd]">Agendamentos</h1>
        <p className="text-sm text-[#bbcbb9] mt-1">
          Configure quando e como receber seus resumos automáticos
        </p>
      </div>

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

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Configuration - 2 cols */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#060e20] rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4ff07f]">schedule</span>
                <h2 className="text-lg font-bold text-[#dae2fd]">Agendamento Atual</h2>
              </div>
              {isActive ? (
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#4ff07f]/10 text-[#4ff07f] font-bold uppercase">
                  Ativo
                </span>
              ) : (
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#bbcbb9]/10 text-[#bbcbb9] font-bold uppercase">
                  Pausado
                </span>
              )}
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between p-4 bg-[#131b2e] rounded-lg mb-6">
              <div>
                <p className="text-sm font-semibold text-[#dae2fd]">
                  {isActive ? 'Agendamento ativo' : 'Agendamento pausado'}
                </p>
                <p className="text-xs text-[#bbcbb9] mt-1">
                  {isActive
                    ? 'Os resumos serão gerados automaticamente'
                    : 'Nenhum resumo será gerado automaticamente'}
                </p>
              </div>
              <button
                onClick={() => setIsActive(!isActive)}
                className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${
                  isActive ? 'bg-[#4ff07f]' : 'bg-[#2d3449]'
                }`}
                aria-label="Toggle active"
              >
                <div
                  className={`absolute top-0.5 w-6 h-6 rounded-full bg-white transition-transform ${
                    isActive ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Time picker */}
            <div className="mb-6">
              <label className="text-[10px] uppercase tracking-widest text-[#bbcbb9] font-bold block mb-3">
                Horário
              </label>
              <div className="flex items-center gap-2 bg-[#131b2e] rounded-lg p-4 w-fit">
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={hour}
                  onChange={(e) =>
                    setHour(String(Math.max(0, Math.min(23, Number(e.target.value)))).padStart(2, '0'))
                  }
                  className="w-16 bg-transparent text-2xl font-bold text-[#dae2fd] text-center focus:outline-none"
                />
                <span className="text-2xl font-bold text-[#dae2fd]">:</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={minute}
                  onChange={(e) =>
                    setMinute(String(Math.max(0, Math.min(59, Number(e.target.value)))).padStart(2, '0'))
                  }
                  className="w-16 bg-transparent text-2xl font-bold text-[#dae2fd] text-center focus:outline-none"
                />
              </div>
            </div>

            {/* Days */}
            <div className="mb-6">
              <label className="text-[10px] uppercase tracking-widest text-[#bbcbb9] font-bold block mb-3">
                Dias da semana
              </label>
              <div className="flex gap-2">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`w-10 h-10 rounded-full text-xs font-bold transition-colors ${
                      days[i]
                        ? 'bg-[#4ff07f] text-[#0b1326]'
                        : 'bg-[#131b2e] text-[#bbcbb9] hover:text-[#dae2fd]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Channels */}
            <div className="mb-6">
              <label className="text-[10px] uppercase tracking-widest text-[#bbcbb9] font-bold block mb-3">
                Canais de entrega
              </label>
              <div className="space-y-2">
                {[
                  { k: 'whatsapp', l: 'WhatsApp', icon: 'chat' },
                  { k: 'email', l: 'E-mail', icon: 'mail' },
                  { k: 'dashboard', l: 'Dashboard', icon: 'dashboard' },
                ].map((c) => (
                  <div
                    key={c.k}
                    className="flex items-center justify-between p-3 bg-[#131b2e] rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[#bbcbb9]">{c.icon}</span>
                      <span className="text-sm text-[#dae2fd]">{c.l}</span>
                    </div>
                    <button
                      onClick={() => toggleChannel(c.k)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        channels[c.k] ? 'bg-[#4ff07f]' : 'bg-[#2d3449]'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                          channels[c.k] ? 'translate-x-5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Format */}
            <div className="mb-6">
              <label className="text-[10px] uppercase tracking-widest text-[#bbcbb9] font-bold block mb-3">
                Formato do briefing
              </label>
              <div className="space-y-2">
                {[
                  { k: 'short' as const, l: 'Curto', d: 'Apenas tópicos essenciais' },
                  { k: 'detailed' as const, l: 'Detalhado', d: 'Contexto completo e recomendações' },
                  { k: 'executive' as const, l: 'Executivo', d: 'Visão macro para decisões' },
                ].map((f) => (
                  <label
                    key={f.k}
                    className={`block p-3 rounded-lg cursor-pointer border transition-colors ${
                      format === f.k
                        ? 'bg-[#2d3449] border-[#4ff07f]/40'
                        : 'bg-[#131b2e] border-transparent hover:bg-[#2d3449]/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="format"
                        value={f.k}
                        checked={format === f.k}
                        onChange={() => setFormat(f.k)}
                        className="accent-[#4ff07f]"
                      />
                      <div>
                        <p
                          className={`text-sm font-medium ${
                            format === f.k ? 'text-[#4ff07f]' : 'text-[#dae2fd]'
                          }`}
                        >
                          {f.l}
                        </p>
                        <p className="text-xs text-[#bbcbb9]">{f.d}</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!hasChanges || saving}
              className="w-full py-3 rounded-xl text-sm font-bold text-[#0b1326] bg-gradient-to-r from-[#4ff07f] to-[#25d366] hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            >
              {saving ? 'Salvando...' : hasChanges ? 'Salvar alterações' : 'Sem alterações'}
            </button>
          </div>

          {/* Next run card */}
          <div className="bg-[#060e20] rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-[#72d8c8]">event_upcoming</span>
              <h2 className="text-sm font-bold text-[#dae2fd] uppercase tracking-wide">
                Próxima execução
              </h2>
            </div>
            <p className="text-2xl font-bold text-[#dae2fd]">
              {formatNextRun(schedule?.next_run_at ?? null)}
            </p>
            {schedule?.next_run_at && (
              <p className="text-xs text-[#bbcbb9] mt-1">
                {new Date(schedule.next_run_at).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
        </div>

        {/* Recent executions - 1 col */}
        <div className="bg-[#060e20] rounded-xl p-6 h-fit">
          <div className="flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-[#4ff07f]">history</span>
            <h2 className="text-sm font-bold text-[#dae2fd] uppercase tracking-wide">
              Execuções recentes
            </h2>
          </div>
          {digests.length === 0 ? (
            <p className="text-sm text-[#bbcbb9] text-center py-8">Nenhuma execução ainda</p>
          ) : (
            <div className="space-y-2">
              {digests.map((d) => (
                <Link
                  key={d.id}
                  href={`/digest?id=${d.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-[#131b2e] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-[#4ff07f]/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-[#4ff07f] text-[16px]">
                      check
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[#dae2fd]">
                      {formatDigestDate(d.created_at)}
                    </p>
                    <p className="text-[10px] text-[#bbcbb9]">
                      {d.total_messages} msgs • {d.type}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-[#bbcbb9] text-[16px]">
                    chevron_right
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
