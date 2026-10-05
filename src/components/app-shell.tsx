import { Cloud, CloudOff, Menu, RadioTower, UsersRound, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { BrandMark } from '@/components/brand-mark';
import { InstallPrompt } from '@/components/install-prompt';
import { useEmergency } from '@/features/emergency/emergency-context';

const links = [{ href: '/client', label: 'Client' }, { href: '/messages', label: 'Responder' }, { href: '/supervisor', label: 'Supervisor' }];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useLocation().pathname;
  const { sessionCode, syncStatus } = useEmergency();
  const [open, setOpen] = useState(false);
  const isRegistration = pathname === '/register';
  const status = syncStatus === 'offline' ? 'Offline' : syncStatus === 'saved' ? 'Saved locally' : syncStatus === 'syncing' ? 'Synchronizing' : 'Synchronized';
  const StatusIcon = syncStatus === 'offline' ? CloudOff : syncStatus === 'synced' ? Cloud : RadioTower;
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 shadow-[0_4px_18px_rgba(15,23,42,0.05)] backdrop-blur-lg">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link
            to="/"
            aria-label="RapidLink home"
            className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"
          >
            <BrandMark />
          </Link>
          {!isRegistration && sessionCode && (
            <span className="hidden rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-extrabold tracking-[0.12em] text-[#003172] sm:inline">
              ROOM {sessionCode}
            </span>
          )}
          {!isRegistration && <nav className="ml-auto hidden items-center gap-1 md:flex" aria-label="Role navigation">{links.map((item) => <Link key={item.href} to={item.href} className={`rounded-lg px-3 py-2 text-sm font-bold ${pathname.startsWith(item.href) ? 'bg-blue-50 text-[#003172]' : 'text-slate-600 hover:bg-slate-50'}`}>{item.label}</Link>)}</nav>}
          {!isRegistration && <span className={`ml-auto flex items-center gap-1.5 whitespace-nowrap text-xs font-bold md:ml-2 ${syncStatus === 'offline' ? 'text-amber-800' : syncStatus === 'synced' ? 'text-emerald-700' : 'text-[#003172]'}`} title={status}>
            <StatusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{status}</span>
            <span className="sr-only sm:hidden">{status}</span>
          </span>}
          {!isRegistration && <button type="button" onClick={() => setOpen((value) => !value)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-[#003172] transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 md:hidden" aria-label="Toggle role menu" aria-expanded={open}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>}
        </div>
        {!isRegistration && open && <nav className="border-t border-slate-100 bg-white px-4 py-3 md:hidden" aria-label="Mobile role navigation"><div className="mx-auto grid max-w-7xl gap-1">{sessionCode && <p className="mb-1 flex items-center gap-2 px-3 text-xs font-extrabold tracking-wider text-slate-500"><UsersRound className="h-4 w-4" /> ROOM {sessionCode}</p>}{links.map((item) => <Link key={item.href} to={item.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 font-bold text-[#003172] hover:bg-blue-50">{item.label}</Link>)}</div></nav>}
      </header>
      {children}
      <InstallPrompt />
    </div>
  );
}
