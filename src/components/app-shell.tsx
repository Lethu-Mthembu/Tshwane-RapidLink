import { KeyRound, LogOut } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { BrandMark } from '@/components/brand-mark';
import { InstallPrompt } from '@/components/install-prompt';
import { useStaffAuth } from '@/features/auth/staff-auth-context';

export function AppShell({ children }: { children: ReactNode }) {
  const { identity, signOut } = useStaffAuth();
  const navigate = useNavigate();
  const leaveStaffSession = async () => {
    await signOut();
    navigate('/staff/sign-in', { replace: true });
  };
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 bg-white shadow-[0_4px_18px_rgba(15,23,42,0.06)]">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="RapidLink" className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200">
            <BrandMark />
          </Link>
          {identity && <div className="flex items-center gap-1"><Link to="/staff/change-password" className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-bold text-[#003172] outline-none hover:bg-slate-100 focus-visible:ring-4 focus-visible:ring-blue-200"><KeyRound className="h-4 w-4" /> <span className="hidden sm:inline">Change password</span></Link><button type="button" onClick={() => void leaveStaffSession()} className="inline-flex min-h-11 items-center gap-2 px-3 text-sm font-bold text-[#003172] outline-none hover:bg-slate-100 focus-visible:ring-4 focus-visible:ring-blue-200"><LogOut className="h-4 w-4" /> Sign out</button></div>}
        </div>
      </header>
      {children}
      <InstallPrompt />
    </div>
  );
}
