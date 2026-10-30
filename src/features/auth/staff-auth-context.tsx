import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import type { StaffIdentity, StaffRole } from '@/features/emergency/types';
import { currentStaffSession, signOutStaff, staffAuth, staffAuthConfigured } from '@/lib/staff-auth';

interface StaffAuthValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  identity: StaffIdentity | null;
  refreshIdentity(): Promise<StaffIdentity | null>;
  signOut(): Promise<void>;
}

const StaffAuthContext = createContext<StaffAuthValue | null>(null);

export function StaffAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [identity, setIdentity] = useState<StaffIdentity | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshIdentity = useCallback(async () => {
    const current = await currentStaffSession();
    setSession(current);
    if (!current) {
      setIdentity(null);
      return null;
    }
    const response = await fetch('/api/staff/me', {
      headers: { authorization: `Bearer ${current.access_token}` },
      cache: 'no-store',
    });
    if (!response.ok) {
      setIdentity(null);
      return null;
    }
    const body = await response.json() as { staff?: StaffIdentity };
    setIdentity(body.staff ?? null);
    return body.staff ?? null;
  }, []);

  useEffect(() => {
    let active = true;
    void refreshIdentity().finally(() => { if (active) setLoading(false); });
    const subscription = staffAuth?.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setIdentity(null);
      else window.setTimeout(() => { void refreshIdentity(); }, 0);
    });
    return () => {
      active = false;
      subscription?.data.subscription.unsubscribe();
    };
  }, [refreshIdentity]);

  const value = useMemo<StaffAuthValue>(() => ({
    configured: staffAuthConfigured,
    loading,
    session,
    identity,
    refreshIdentity,
    signOut: async () => { await signOutStaff(); setSession(null); setIdentity(null); },
  }), [identity, loading, refreshIdentity, session]);

  return <StaffAuthContext.Provider value={value}>{children}</StaffAuthContext.Provider>;
}

export function useStaffAuth() {
  const value = useContext(StaffAuthContext);
  if (!value) throw new Error('useStaffAuth must be used inside StaffAuthProvider');
  return value;
}

export function hasStaffRole(identity: StaffIdentity | null, roles: StaffRole[]) {
  return Boolean(identity && roles.includes(identity.role));
}
