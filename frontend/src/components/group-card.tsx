'use client';

import { Switch } from '@/components/ui/switch';

interface Group {
  id: string;
  name: string;
  participant_count: number;
  message_count_today: number;
  is_monitored: boolean;
  last_message_at?: string;
}

interface GroupCardProps {
  group: Group;
  onToggle?: (id: string, monitored: boolean) => void;
}

export default function GroupCard({ group, onToggle }: GroupCardProps) {
  const isUrgent = group.message_count_today > 40;

  return (
    <div className="bg-[#131b2e] p-4 rounded-xl border border-transparent hover:border-[#4ff07f]/20 transition-colors">
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0 w-11 h-11 rounded-lg bg-[#2d3449] flex items-center justify-center">
          <span className="material-symbols-outlined text-[#4ff07f] text-xl">
            groups
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-[#dae2fd] truncate">
              {group.name}
            </h3>
            <span
              className={`flex-shrink-0 w-2 h-2 rounded-full ${
                isUrgent ? 'bg-red-400' : 'bg-[#4ff07f]'
              }`}
            />
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-[#bbcbb9] flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">person</span>
              {group.participant_count}
            </span>
            <span className="text-xs text-[#bbcbb9] flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">chat_bubble</span>
              {group.message_count_today} hoje
            </span>
          </div>
        </div>

        {/* Toggle */}
        <Switch
          checked={group.is_monitored}
          onCheckedChange={(checked: boolean) =>
            onToggle?.(group.id, checked)
          }
          className="data-checked:bg-[#4ff07f]"
        />
      </div>
    </div>
  );
}
