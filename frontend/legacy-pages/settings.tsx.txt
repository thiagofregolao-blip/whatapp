'use client';

import { useState, useEffect } from 'react'
import {
  getGroups,
  updateGroup,
  addKeyword,
  deleteKeyword,
} from '@/lib/api';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Group {
  id: string;
  name: string;
  participant_count: number;
  message_count_today: number;
  is_monitored: boolean;
}

interface Keyword {
  id: string;
  word: string;
  type: string;
}

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const mockGroups: Group[] = [
  { id: '1', name: 'Produto — Core Team', participant_count: 12, message_count_today: 89, is_monitored: true },
  { id: '2', name: 'Design Sprint', participant_count: 6, message_count_today: 34, is_monitored: true },
  { id: '3', name: 'DevOps Alerts', participant_count: 8, message_count_today: 52, is_monitored: true },
  { id: '4', name: 'Marketing Q2', participant_count: 15, message_count_today: 27, is_monitored: false },
  { id: '5', name: 'RH — Geral', participant_count: 20, message_count_today: 18, is_monitored: false },
];

const mockKeywords: Keyword[] = [
  { id: '1', word: 'urgente', type: 'urgent' },
  { id: '2', word: 'deploy', type: 'deploy' },
  { id: '3', word: 'bug', type: 'urgent' },
  { id: '4', word: 'produção', type: 'urgent' },
  { id: '5', word: 'aprovado', type: 'success' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function keywordPillClass(type: string): string {
  switch (type) {
    case 'urgent':
      return 'bg-red-500/10 text-red-400 border border-red-500/20';
    case 'deploy':
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    case 'success':
      return 'bg-[#4ff07f]/10 text-[#4ff07f] border border-[#4ff07f]/20';
    default:
      return 'bg-[#72d8c8]/10 text-[#72d8c8] border border-[#72d8c8]/20';
  }
}

const dayLabels = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  // Schedule
  const [scheduleTime, setScheduleTime] = useState('22:00');
  const [activeDays, setActiveDays] = useState([false, true, true, true, true, true, false]);
  const [editingTime, setEditingTime] = useState(false);

  // Keywords
  const [keywords, setKeywords] = useState<Keyword[]>(mockKeywords);
  const [newKeyword, setNewKeyword] = useState('');
  const [keywordType, setKeywordType] = useState('urgent');

  // Delivery channels
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [dashboardEnabled, setDashboardEnabled] = useState(true);
  const [emailAddress, setEmailAddress] = useState('');

  // Format
  const [format, setFormat] = useState('detailed');

  // Groups
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const data = await getGroups();
        setGroups(Array.isArray(data) && data.length > 0 ? data : mockGroups);
      } catch {
        setGroups(mockGroups);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  /* -- handlers -- */

  function toggleDay(index: number) {
    setActiveDays((prev) => prev.map((v, i) => (i === index ? !v : v)));
  }

  async function handleAddKeyword() {
    const word = newKeyword.trim();
    if (!word) return;
    try {
      const result = await addKeyword({ word, type: keywordType });
      setKeywords((prev) => [...prev, result]);
    } catch {
      // Fallback: add locally
      setKeywords((prev) => [
        ...prev,
        { id: `local-${Date.now()}`, word, type: keywordType },
      ]);
    }
    setNewKeyword('');
  }

  async function handleRemoveKeyword(kw: Keyword) {
    try {
      await deleteKeyword(kw.id);
    } catch {
      // continue locally
    }
    setKeywords((prev) => prev.filter((k) => k.id !== kw.id));
  }

  async function handleToggleGroup(groupId: string, monitored: boolean) {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, is_monitored: monitored } : g))
    );
    try {
      await updateGroup(groupId, { is_monitored: monitored });
    } catch {
      // revert
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, is_monitored: !monitored } : g))
      );
    }
  }

  async function handleDeleteGroup(groupId: string) {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    try {
      await updateGroup(groupId, { is_excluded: true });
    } catch {
      // silently fail
    }
  }

  const formatOptions = [
    {
      value: 'short',
      label: 'Curto',
      desc: 'Resumo rápido com os pontos principais',
    },
    {
      value: 'detailed',
      label: 'Detalhado',
      desc: 'Análise completa com menções e decisões',
    },
    {
      value: 'executive',
      label: 'Executivo',
      desc: 'Visão estratégica para liderança',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-[#dae2fd]">
          Configurações de Inteligência
        </h1>
        <button className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-[#3c4a3d]/30 text-[#dae2fd] hover:bg-[#131b2e] transition-colors flex items-center gap-2">
          <span className="material-symbols-outlined text-lg">sync</span>
          Sincronizar grupos
        </button>
      </div>

      {/* Bento grid */}
      <div className="grid md:grid-cols-12 gap-6">
        {/* Schedule card */}
        <div className="md:col-span-4 bg-[#131b2e] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-[#4ff07f] text-xl">
              schedule
            </span>
            <h2 className="text-base font-bold text-[#dae2fd]">Horário</h2>
          </div>

          {/* Time display */}
          <div className="flex items-center justify-center mb-6">
            {editingTime ? (
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                onBlur={() => setEditingTime(false)}
                autoFocus
                className="text-4xl font-bold text-[#dae2fd] bg-[#060e20] rounded-xl px-6 py-4 text-center border border-[#4ff07f]/30 outline-none"
              />
            ) : (
              <button
                onClick={() => setEditingTime(true)}
                className="flex items-center gap-3 bg-[#060e20] rounded-xl px-6 py-4 hover:border-[#4ff07f]/30 border border-transparent transition-colors"
              >
                <span className="text-4xl font-bold text-[#dae2fd]">
                  {scheduleTime}
                </span>
                <span className="material-symbols-outlined text-[#bbcbb9] text-lg">
                  edit
                </span>
              </button>
            )}
          </div>

          {/* Day toggles */}
          <div className="flex items-center justify-center gap-2">
            {dayLabels.map((label, i) => (
              <button
                key={i}
                onClick={() => toggleDay(i)}
                className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                  activeDays[i]
                    ? 'bg-[#4ff07f] text-[#0b1326]'
                    : 'bg-[#2d3449] text-[#bbcbb9] hover:bg-[#3c4a3d]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Keywords card */}
        <div className="md:col-span-8 bg-[#131b2e] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-[#72d8c8] text-xl">
              key
            </span>
            <h2 className="text-base font-bold text-[#dae2fd]">
              Filtros & Palavras-chave
            </h2>
          </div>

          {/* Input row */}
          <div className="flex items-center gap-3 mb-5">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword()}
              placeholder="Nova palavra-chave..."
              className="flex-1 bg-[#060e20] rounded-xl px-4 py-2.5 text-sm text-[#dae2fd] placeholder:text-[#bbcbb9]/50 border border-transparent focus:border-[#4ff07f]/30 outline-none transition-colors"
            />
            <select
              value={keywordType}
              onChange={(e) => setKeywordType(e.target.value)}
              className="bg-[#060e20] rounded-xl px-3 py-2.5 text-sm text-[#dae2fd] border border-transparent focus:border-[#4ff07f]/30 outline-none"
            >
              <option value="urgent">Urgente</option>
              <option value="deploy">Deploy</option>
              <option value="success">Sucesso</option>
              <option value="other">Outro</option>
            </select>
            <button
              onClick={handleAddKeyword}
              className="px-4 py-2.5 rounded-xl text-sm font-bold text-[#0b1326] bg-gradient-to-r from-[#4ff07f] to-[#25d366] hover:opacity-90 transition-opacity"
            >
              Adicionar
            </button>
          </div>

          {/* Keyword pills */}
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw) => (
              <span
                key={kw.id}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full ${keywordPillClass(kw.type)}`}
              >
                {kw.word}
                <button
                  onClick={() => handleRemoveKeyword(kw)}
                  className="hover:opacity-70 transition-opacity"
                >
                  <span className="material-symbols-outlined text-[14px]">
                    close
                  </span>
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Delivery channels */}
        <div className="md:col-span-7 bg-[#131b2e] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-[#4ff07f] text-xl">
              send
            </span>
            <h2 className="text-base font-bold text-[#dae2fd]">
              Canais de Entrega
            </h2>
          </div>

          <div className="space-y-4">
            {/* WhatsApp */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-[#060e20]">
              <div className="w-10 h-10 rounded-lg bg-[#4ff07f]/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#4ff07f] text-xl">
                  chat
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[#dae2fd]">WhatsApp</h3>
                <p className="text-xs text-[#bbcbb9]">
                  Receba o briefing diretamente no WhatsApp
                </p>
              </div>
              <button
                onClick={() => setWhatsappEnabled(!whatsappEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  whatsappEnabled ? 'bg-[#4ff07f]' : 'bg-[#2d3449]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    whatsappEnabled ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Email */}
            <div className="p-4 rounded-xl bg-[#060e20]">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-blue-400 text-xl">
                    mail
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[#dae2fd]">Email</h3>
                  <p className="text-xs text-[#bbcbb9]">
                    Resumo formatado enviado por email
                  </p>
                </div>
                <button
                  onClick={() => setEmailEnabled(!emailEnabled)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    emailEnabled ? 'bg-[#4ff07f]' : 'bg-[#2d3449]'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      emailEnabled ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              {emailEnabled && (
                <div className="mt-3 ml-14">
                  <input
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full bg-[#131b2e] rounded-lg px-4 py-2 text-sm text-[#dae2fd] placeholder:text-[#bbcbb9]/50 border border-transparent focus:border-[#4ff07f]/30 outline-none transition-colors"
                  />
                </div>
              )}
            </div>

            {/* Dashboard */}
            <div className="flex items-center gap-4 p-4 rounded-xl bg-[#060e20]">
              <div className="w-10 h-10 rounded-lg bg-[#4ff07f]/10 flex items-center justify-center">
                <span className="material-symbols-outlined text-[#4ff07f] text-xl">
                  dashboard_customize
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[#dae2fd]">Dashboard</h3>
                <p className="text-xs text-[#bbcbb9]">
                  Visualize resumos diretamente no painel
                </p>
              </div>
              <button
                onClick={() => setDashboardEnabled(!dashboardEnabled)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  dashboardEnabled ? 'bg-[#4ff07f]' : 'bg-[#2d3449]'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    dashboardEnabled ? 'left-[22px]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Format card */}
        <div className="md:col-span-5 bg-[#131b2e] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <span className="material-symbols-outlined text-[#99e1d4] text-xl">
              description
            </span>
            <h2 className="text-base font-bold text-[#dae2fd]">
              Formato do Briefing
            </h2>
          </div>

          <div className="space-y-3">
            {formatOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  format === opt.value
                    ? 'bg-[#4ff07f]/10 border-[#4ff07f]/30'
                    : 'bg-[#060e20] border-transparent hover:border-[#3c4a3d]/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      format === opt.value
                        ? 'border-[#4ff07f]'
                        : 'border-[#bbcbb9]/40'
                    }`}
                  >
                    {format === opt.value && (
                      <div className="w-2 h-2 rounded-full bg-[#4ff07f]" />
                    )}
                  </div>
                  <div>
                    <h3
                      className={`text-sm font-semibold ${
                        format === opt.value ? 'text-[#4ff07f]' : 'text-[#dae2fd]'
                      }`}
                    >
                      {opt.label}
                    </h3>
                    <p className="text-xs text-[#bbcbb9] mt-0.5">{opt.desc}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Groups table */}
        <div className="md:col-span-12 bg-[#131b2e] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#2d3449]">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#72d8c8] text-xl">
                groups
              </span>
              <h2 className="text-base font-bold text-[#dae2fd]">
                Grupos Monitorados
              </h2>
            </div>
          </div>

          {/* Table header */}
          <div className="hidden sm:grid grid-cols-12 gap-4 px-6 py-3 text-[10px] uppercase tracking-[0.2em] text-[#bbcbb9] font-bold border-b border-[#2d3449]/50">
            <div className="col-span-5">Nome do Grupo</div>
            <div className="col-span-2 text-center">Mensagens/Dia</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-3 text-right">Ações</div>
          </div>

          {/* Table rows */}
          <div className="divide-y divide-[#2d3449]/30">
            {groups.map((group) => (
              <div
                key={group.id}
                className="grid grid-cols-1 sm:grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-[#171f33] transition-colors"
              >
                {/* Name */}
                <div className="sm:col-span-5 flex items-center gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-[#2d3449] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#4ff07f] text-lg">
                      groups
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-[#dae2fd] truncate">
                    {group.name}
                  </span>
                </div>

                {/* Message count */}
                <div className="sm:col-span-2 text-center">
                  <span className="text-sm text-[#bbcbb9]">
                    {group.message_count_today}
                  </span>
                </div>

                {/* Toggle */}
                <div className="sm:col-span-2 flex justify-center">
                  <button
                    onClick={() =>
                      handleToggleGroup(group.id, !group.is_monitored)
                    }
                    className={`relative w-11 h-6 rounded-full transition-colors ${
                      group.is_monitored ? 'bg-[#4ff07f]' : 'bg-[#2d3449]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                        group.is_monitored ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>

                {/* Actions */}
                <div className="sm:col-span-3 flex justify-end">
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="p-2 rounded-lg text-[#bbcbb9] hover:text-[#ffb4ab] hover:bg-red-500/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-lg">
                      delete
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
