'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getGroups, updateGroup } from '@/lib/api';

interface Group {
  id: string;
  name: string;
  participant_count?: number;
  is_monitored: boolean;
}

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

export default function OnboardingGroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadGroups() {
      try {
        const data = await getGroups();
        setGroups(Array.isArray(data) ? data : data.groups ?? []);
      } catch {
        // Groups may not be synced yet
      } finally {
        setLoading(false);
      }
    }
    loadGroups();
  }, []);

  async function handleToggle(group: Group) {
    const newValue = !group.is_monitored;
    setToggling((prev) => ({ ...prev, [group.id]: true }));

    // Optimistic update
    setGroups((prev) =>
      prev.map((g) => (g.id === group.id ? { ...g, is_monitored: newValue } : g))
    );

    try {
      await updateGroup(group.id, { is_monitored: newValue });
    } catch {
      // Revert on failure
      setGroups((prev) =>
        prev.map((g) =>
          g.id === group.id ? { ...g, is_monitored: !newValue } : g
        )
      );
    } finally {
      setToggling((prev) => ({ ...prev, [group.id]: false }));
    }
  }

  function selectAll() {
    groups.forEach((g) => {
      if (!g.is_monitored) handleToggle(g);
    });
  }

  function deselectAll() {
    groups.forEach((g) => {
      if (g.is_monitored) handleToggle(g);
    });
  }

  const monitoredCount = groups.filter((g) => g.is_monitored).length;

  return (
    <div className="min-h-screen bg-[#0b1326] p-4 md:p-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold bg-gradient-to-br from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
              ZapDigest
            </h1>
            <span className="text-xs text-[#bbcbb9] bg-[#222a3d] px-2.5 py-1 rounded-full font-medium">
              Setup Wizard
            </span>
          </div>
          <StepDots current={2} />
        </div>
        <ProgressBar step={2} />
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-[#dae2fd] mb-2">
            Escolha os grupos para monitorar
          </h2>
          <p className="text-sm text-[#bbcbb9]">
            Selecione quais grupos o ZapDigest deve acompanhar para gerar seus resumos
            inteligentes.
          </p>
        </div>

        {/* Actions bar */}
        {groups.length > 0 && (
          <div className="flex items-center justify-between mb-6">
            <p className="text-sm text-[#bbcbb9]">
              <span className="text-[#4ff07f] font-semibold">{monitoredCount}</span> de{' '}
              {groups.length} grupos selecionados
            </p>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#222a3d] text-[#dae2fd] hover:bg-[#2d3449] transition-colors"
              >
                Selecionar todos
              </button>
              <button
                onClick={deselectAll}
                className="text-xs px-3 py-1.5 rounded-lg bg-[#222a3d] text-[#bbcbb9] hover:bg-[#2d3449] transition-colors"
              >
                Deselecionar todos
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-[#bbcbb9]">Carregando grupos...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && groups.length === 0 && (
          <div className="bg-[#131b2e] rounded-2xl border border-[#222a3d] p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-[#222a3d] flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-[#bbcbb9] text-[28px]">
                groups
              </span>
            </div>
            <p className="text-[#dae2fd] font-medium mb-1">
              Nenhum grupo encontrado
            </p>
            <p className="text-sm text-[#bbcbb9]">
              Seus grupos aparecerão aqui após a sincronização com o WhatsApp.
            </p>
          </div>
        )}

        {/* Groups grid */}
        {!loading && groups.length > 0 && (
          <div className="grid md:grid-cols-2 gap-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className={`bg-[#131b2e] rounded-xl border p-4 transition-all cursor-pointer ${
                  group.is_monitored
                    ? 'border-[#4ff07f]/30 bg-[#131b2e]'
                    : 'border-[#222a3d] hover:border-[#2d3449]'
                }`}
                onClick={() => handleToggle(group)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#222a3d] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[#bbcbb9] text-[20px]">
                      groups
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#dae2fd] truncate">
                      {group.name}
                    </p>
                    {group.participant_count != null && (
                      <p className="text-[11px] text-[#bbcbb9]">
                        {group.participant_count} participantes
                      </p>
                    )}
                  </div>
                  {/* Toggle switch */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggle(group);
                    }}
                    disabled={toggling[group.id]}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                      group.is_monitored ? 'bg-[#4ff07f]' : 'bg-[#2d3449]'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                        group.is_monitored ? 'translate-x-[22px]' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Continue button */}
        <div className="mt-8 flex justify-end">
          <button
            onClick={() => router.push('/onboarding/schedule')}
            className="px-8 py-3 rounded-xl bg-gradient-to-r from-[#4ff07f] to-[#25d366] text-[#0b1326] font-semibold text-sm hover:shadow-[0_0_20px_rgba(79,240,127,0.3)] transition-all"
          >
            Continuar
            <span className="material-symbols-outlined text-[16px] ml-1 align-middle">
              arrow_forward
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
