'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateSchedule } from '@/lib/api';

const DAYS = [
  { label: 'D', name: 'Dom', cron: '0' },
  { label: 'S', name: 'Seg', cron: '1' },
  { label: 'T', name: 'Ter', cron: '2' },
  { label: 'Q', name: 'Qua', cron: '3' },
  { label: 'Q', name: 'Qui', cron: '4' },
  { label: 'S', name: 'Sex', cron: '5' },
  { label: 'S', name: 'Sáb', cron: '6' },
];

const FORMATS = [
  {
    value: 'short',
    label: 'Curto',
    description: 'Resumo rápido com os pontos principais em poucas linhas.',
  },
  {
    value: 'detailed',
    label: 'Detalhado',
    description:
      'Análise completa com contexto, decisões e itens de ação organizados por grupo.',
  },
  {
    value: 'executive',
    label: 'Executivo',
    description:
      'Formato profissional com KPIs, riscos e recomendações para tomada de decisão.',
  },
];

const CHANNELS = [
  { key: 'whatsapp', icon: 'chat', label: 'WhatsApp' },
  { key: 'email', icon: 'mail', label: 'Email' },
  { key: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
];

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3">
      {[1, 2, 3].map((step) => (
        <div
          key={step}
          className={`w-3 h-3 rounded-full transition-all ${
            step <= current
              ? 'bg-[#4ff07f] shadow-[0_0_10px_rgba(79,240,127,0.5)]'
              : 'bg-[#2d3449]'
          }`}
        />
      ))}
      <span className="ml-2 text-xs text-[#bbcbb9] font-medium tracking-wide">
        Step {String(current).padStart(2, '0')} / 03
      </span>
    </div>
  );
}

function ProgressBar({ step }: { step: number }) {
  return (
    <div className="w-full h-1 bg-[#222a3d] rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-[#4ff07f] to-[#25d366] rounded-full transition-all duration-500"
        style={{ width: `${(step / 3) * 100}%` }}
      />
    </div>
  );
}

export default function OnboardingSchedulePage() {
  const router = useRouter();
  const [hour, setHour] = useState('22');
  const [minute, setMinute] = useState('00');
  const [activeDays, setActiveDays] = useState<boolean[]>([
    false, true, true, true, true, true, false,
  ]);
  const [channels, setChannels] = useState<Record<string, boolean>>({
    whatsapp: true,
    email: true,
    dashboard: true,
  });
  const [format, setFormat] = useState('detailed');
  const [submitting, setSubmitting] = useState(false);

  function toggleDay(index: number) {
    setActiveDays((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }

  function toggleChannel(key: string) {
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function buildCron(): string {
    const h = parseInt(hour, 10);
    const m = parseInt(minute, 10);
    const dayList = DAYS.filter((_, i) => activeDays[i])
      .map((d) => d.cron)
      .join(',');
    return `${m} ${h} * * ${dayList || '*'}`;
  }

  async function handleFinish() {
    setSubmitting(true);
    try {
      const activeChannels = Object.entries(channels)
        .filter(([, v]) => v)
        .map(([k]) => k);

      await updateSchedule({
        cron_expression: buildCron(),
        delivery_channels: activeChannels,
        report_format: format,
      });

      router.push('/dashboard');
    } catch {
      // Allow continuing even if schedule save fails
      router.push('/dashboard');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0b1326] p-4 md:p-8">
      {/* Header */}
      <div className="max-w-3xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold bg-gradient-to-br from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
              ZapDigest
            </h1>
            <span className="text-xs text-[#bbcbb9] bg-[#222a3d] px-2.5 py-1 rounded-full font-medium">
              Setup Wizard
            </span>
          </div>
          <StepDots current={3} />
        </div>
        <ProgressBar step={3} />
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-[#dae2fd] mb-2">
            Configure seu resumo diário
          </h2>
          <p className="text-sm text-[#bbcbb9]">
            Defina quando e como você quer receber seus resumos inteligentes.
          </p>
        </div>

        {/* Time picker */}
        <div className="bg-[#131b2e] rounded-2xl border border-[#222a3d] p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[#4ff07f] text-[20px]">
              schedule
            </span>
            <h3 className="text-sm font-semibold text-[#dae2fd]">
              Horário do resumo
            </h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-[#171f33] rounded-xl border border-[#222a3d] overflow-hidden">
              <input
                type="text"
                value={hour}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                  if (v === '' || (parseInt(v) >= 0 && parseInt(v) <= 23)) setHour(v);
                }}
                onBlur={() => setHour(String(parseInt(hour || '0', 10)).padStart(2, '0'))}
                className="w-16 text-center text-2xl font-bold font-mono text-[#dae2fd] bg-transparent py-3 outline-none"
                maxLength={2}
              />
              <span className="text-2xl font-bold text-[#bbcbb9]">:</span>
              <input
                type="text"
                value={minute}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                  if (v === '' || (parseInt(v) >= 0 && parseInt(v) <= 59)) setMinute(v);
                }}
                onBlur={() =>
                  setMinute(String(parseInt(minute || '0', 10)).padStart(2, '0'))
                }
                className="w-16 text-center text-2xl font-bold font-mono text-[#dae2fd] bg-transparent py-3 outline-none"
                maxLength={2}
              />
            </div>
            <p className="text-xs text-[#bbcbb9]">
              Você receberá o resumo nesse horário nos dias selecionados.
            </p>
          </div>
        </div>

        {/* Day toggles */}
        <div className="bg-[#131b2e] rounded-2xl border border-[#222a3d] p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[#4ff07f] text-[20px]">
              calendar_today
            </span>
            <h3 className="text-sm font-semibold text-[#dae2fd]">
              Dias da semana
            </h3>
          </div>
          <div className="flex gap-2">
            {DAYS.map((day, i) => (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                title={day.name}
                className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  activeDays[i]
                    ? 'bg-[#4ff07f] text-[#0b1326] shadow-[0_0_12px_rgba(79,240,127,0.3)]'
                    : 'bg-[#222a3d] text-[#bbcbb9] hover:bg-[#2d3449]'
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        </div>

        {/* Delivery channels */}
        <div className="bg-[#131b2e] rounded-2xl border border-[#222a3d] p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[#4ff07f] text-[20px]">
              send
            </span>
            <h3 className="text-sm font-semibold text-[#dae2fd]">
              Canais de entrega
            </h3>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {CHANNELS.map((ch) => (
              <button
                key={ch.key}
                onClick={() => toggleChannel(ch.key)}
                className={`flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  channels[ch.key]
                    ? 'bg-[#4ff07f]/5 border-[#4ff07f]/30 text-[#dae2fd]'
                    : 'bg-[#171f33] border-[#222a3d] text-[#bbcbb9] hover:border-[#2d3449]'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {ch.icon}
                </span>
                <span className="text-sm font-medium">{ch.label}</span>
                {channels[ch.key] && (
                  <span className="material-symbols-outlined text-[#4ff07f] text-[16px] ml-auto">
                    check_circle
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Format selection */}
        <div className="bg-[#131b2e] rounded-2xl border border-[#222a3d] p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-[#4ff07f] text-[20px]">
              description
            </span>
            <h3 className="text-sm font-semibold text-[#dae2fd]">
              Formato do resumo
            </h3>
          </div>
          <div className="space-y-3">
            {FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFormat(f.value)}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  format === f.value
                    ? 'bg-[#4ff07f]/5 border-[#4ff07f]/30'
                    : 'bg-[#171f33] border-[#222a3d] hover:border-[#2d3449]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      format === f.value
                        ? 'border-[#4ff07f]'
                        : 'border-[#2d3449]'
                    }`}
                  >
                    {format === f.value && (
                      <div className="w-2.5 h-2.5 rounded-full bg-[#4ff07f]" />
                    )}
                  </div>
                  <div>
                    <p
                      className={`text-sm font-semibold ${
                        format === f.value ? 'text-[#dae2fd]' : 'text-[#bbcbb9]'
                      }`}
                    >
                      {f.label}
                    </p>
                    <p className="text-xs text-[#bbcbb9] mt-0.5">{f.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Finish button */}
        <div className="flex justify-end pb-8">
          <button
            onClick={handleFinish}
            disabled={submitting}
            className="px-10 py-3.5 rounded-xl bg-gradient-to-r from-[#4ff07f] to-[#25d366] text-[#0b1326] font-bold text-sm hover:shadow-[0_0_24px_rgba(79,240,127,0.35)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[#0b1326] border-t-transparent rounded-full animate-spin" />
                Salvando...
              </span>
            ) : (
              <span className="flex items-center gap-1">
                Finalizar configuração
                <span className="material-symbols-outlined text-[18px]">
                  check_circle
                </span>
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
