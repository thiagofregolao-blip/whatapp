'use client';

import Link from 'next/link';

interface SessionStatus {
  status: string;
  phone?: string;
}

interface SidebarProps {
  currentPath: string;
  sessionStatus?: SessionStatus;
}

const geralLinks = [
  { href: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { href: '/groups', icon: 'groups', label: 'Grupos' },
  { href: '/messages', icon: 'chat', label: 'Mensagens' },
];

const relatoriosLinks = [
  { href: '/digest', icon: 'analytics', label: 'Hoje' },
  { href: '/history', icon: 'history', label: 'Histórico' },
  { href: '/scheduled', icon: 'calendar_today', label: 'Agendados' },
];

function NavLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-[#2d3449] text-[#4ff07f]'
          : 'text-[#bbcbb9] hover:text-[#dae2fd] hover:bg-[#2d3449]/50'
      }`}
    >
      <span className="material-symbols-outlined text-[20px]">{icon}</span>
      {label}
    </Link>
  );
}

export default function Sidebar({ currentPath, sessionStatus }: SidebarProps) {
  const isConnected = sessionStatus?.status === 'connected';

  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-72 bg-[#0b1326] border-r border-[#3c4a3d]/15 z-40">
      {/* Brand */}
      <div className="px-6 py-6">
        <h1 className="text-xl font-bold bg-gradient-to-br from-[#4ff07f] to-[#25d366] bg-clip-text text-transparent">
          ZapDigest
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-6 overflow-y-auto">
        {/* GERAL */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#bbcbb9] font-bold px-3 mb-2">
            Geral
          </p>
          <div className="space-y-1">
            {geralLinks.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                icon={link.icon}
                label={link.label}
                active={currentPath === link.href}
              />
            ))}
          </div>
        </div>

        {/* RELATÓRIOS */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#bbcbb9] font-bold px-3 mb-2">
            Relatórios
          </p>
          <div className="space-y-1">
            {relatoriosLinks.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                icon={link.icon}
                label={link.label}
                active={currentPath === link.href}
              />
            ))}
          </div>
        </div>
      </nav>

      {/* Bottom section */}
      <div className="px-4 pb-4 space-y-3">
        {/* WhatsApp status card */}
        <div className="bg-[#060e20] rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="material-symbols-outlined text-[#bbcbb9] text-[20px]">
                smartphone
              </span>
              <span
                className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#060e20] ${
                  isConnected ? 'bg-[#4ff07f]' : 'bg-[#666]'
                }`}
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-[#dae2fd] truncate">
                WhatsApp
              </p>
              <p className="text-[11px] text-[#bbcbb9] truncate">
                {isConnected
                  ? sessionStatus?.phone || 'Conectado'
                  : 'Desconectado'}
              </p>
            </div>
          </div>
        </div>

        {/* Settings link */}
        <NavLink
          href="/settings"
          icon="settings"
          label="Configurações"
          active={currentPath === '/settings'}
        />
      </div>
    </aside>
  );
}
