'use client';

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { createInitialState } from './fixtures';
import { createSession, flushPending, getActiveSessionCode, getSyncStatus, joinSession, readState, receiveRemoteState, sessionService, syncFromRemote } from './session-service';
import type { EmergencyState, SyncStatus } from './types';
import { subscribeToRoom } from '@/lib/supabase-browser';

interface EmergencyContextValue {
  state: EmergencyState;
  online: boolean;
  ready: boolean;
  sessionCode: string | null;
  syncStatus: SyncStatus;
  refresh(): void;
  reset(): void;
}

const EmergencyContext = createContext<EmergencyContextValue | null>(null);

export function EmergencyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EmergencyState>(() => createInitialState());
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);
  const [sessionCode, setSessionCode] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('saved');

  useEffect(() => {
    let code = getActiveSessionCode();
    let disposed = false;
    const bootstrap = async () => {
      const routeChannel = new URLSearchParams(window.location.search).get('session');
      const clientRoute = ['/client', '/register'].some((path) => window.location.pathname.startsWith(path));
      if (routeChannel && routeChannel !== code) code = await joinSession(routeChannel).catch(() => code);
      else if (!code && clientRoute) code = await createSession();
      if (disposed) return;
      setSessionCode(code);
      setState(sessionService.recoverEscalations());
      setOnline(navigator.onLine);
      setSyncStatus(getSyncStatus());
      setReady(true);
      if (code && navigator.onLine) void sync();
    };
    const unsubscribe = sessionService.subscribe((next) => {
      setState(next);
      setSessionCode(getActiveSessionCode());
      setSyncStatus(getSyncStatus());
    });
    const sync = async () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) {
        setSyncStatus('syncing');
        await flushPending();
        setState(await syncFromRemote());
        setState(sessionService.recoverEscalations());
      } else setState(readState());
      setSyncStatus(getSyncStatus());
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    window.addEventListener('focus', sync);
    const poll = window.setInterval(() => { if (navigator.onLine && getActiveSessionCode()) void sync(); }, 2500);
    const escalationCheck = window.setInterval(() => setState(sessionService.recoverEscalations()), 1000);
    void bootstrap();
    return () => {
      disposed = true;
      unsubscribe();
      window.clearInterval(poll);
      window.clearInterval(escalationCheck);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  useEffect(() => {
    if (!sessionCode) return;
    return subscribeToRoom(sessionCode, (remoteState) => {
      setState(receiveRemoteState(sessionCode, remoteState));
      setSyncStatus(getSyncStatus());
    });
  }, [sessionCode]);

  const value = useMemo(
    () => ({
      state, sessionCode, syncStatus,
      online,
      ready,
      refresh: () => setState(readState()),
      reset: () => setState(sessionService.reset()),
    }),
    [online, ready, sessionCode, state, syncStatus],
  );

  return <EmergencyContext.Provider value={value}>{children}</EmergencyContext.Provider>;
}

export function useEmergency() {
  const value = useContext(EmergencyContext);
  if (!value) throw new Error('useEmergency must be used inside EmergencyProvider');
  return value;
}
