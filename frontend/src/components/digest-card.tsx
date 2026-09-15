'use client';

import Link from 'next/link';

interface Digest {
  id: string;
  type: string;
  period_start: string;
  period_end: string;
  total_messages: number;
  total_groups: number;
  urgent_count: number;
  mention_count: number;
  content_json?: {
    overall_summary?: string;
  };
  created_at: string;
}

interface DigestCardProps {
  digest: Digest;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function typeBadgeLabel(type: string): string {
  switch (type) {
    case 'daily':
      return 'Diário';
    case 'weekly':
      return 'Semanal';
    case 'custom':
      return 'Personalizado';
    default:
      return type;
  }
}

function MetricPill({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[#131b2e] ${
        color || 'text-[#bbcbb9]'
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      <span className="font-medium">{value}</span>
      <span className="text-[#bbcbb9]/70">{label}</span>
    </span>
  );
}

export default function DigestCard({ digest }: DigestCardProps) {
  const summary = digest.content_json?.overall_summary;
  const truncatedSummary =
    summary && summary.length > 150
      ? summary.slice(0, 150) + '...'
      : summary;

  return (
    <Link href={`/digest?id=${digest.id}`} className="block group">
      <div className="bg-[#060e20] p-6 rounded-xl border border-[#3c4a3d]/10 hover:border-[#4ff07f]/20 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-[#bbcbb9]">
            {formatDate(digest.period_start)}
          </span>
          <span className="text-[10px] uppercase tracking-wider font-bold px-2.5 py-1 rounded-full bg-[#2d3449] text-[#4ff07f]">
            {typeBadgeLabel(digest.type)}
          </span>
        </div>

        {/* Summary */}
        {truncatedSummary && (
          <p className="text-sm text-[#dae2fd] leading-relaxed mb-4">
            {truncatedSummary}
          </p>
        )}

        {/* Metrics */}
        <div className="flex flex-wrap gap-2">
          <MetricPill
            icon="chat_bubble"
            value={digest.total_messages}
            label="msgs"
          />
          <MetricPill
            icon="groups"
            value={digest.total_groups}
            label="grupos"
          />
          {digest.urgent_count > 0 && (
            <MetricPill
              icon="warning"
              value={digest.urgent_count}
              label="urgentes"
              color="text-red-400"
            />
          )}
          {digest.mention_count > 0 && (
            <MetricPill
              icon="alternate_email"
              value={digest.mention_count}
              label="menções"
              color="text-[#4ff07f]"
            />
          )}
        </div>
      </div>
    </Link>
  );
}
