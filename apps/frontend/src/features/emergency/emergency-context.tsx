'use client';

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import { createInitialState } from './fixtures';
import { mockEmergencyService, readState } from './mock-service';
import type { EmergencyState } from './types';

interface EmergencyContextValue {
  state: EmergencyState;
  online: boolean;
  ready: boolean;
  refresh(): void;
  reset(): void;
}

const EmergencyContext = createContext<EmergencyContextValue | null>(null);

export function EmergencyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<EmergencyState>(() => createInitialState());
  const [online, setOnline] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setState(mockEmergencyService.recoverUnavailableIncidents());
    setOnline(navigator.onLine);
    setReady(true);
    const unsubscribe = mockEmergencyService.subscribe(setState);
    const sync = () => {
      setOnline(navigator.onLine);
      setState(readState());
    };
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    window.addEventListener('focus', sync);
    return () => {
      unsubscribe();
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const value = useMemo(
    () => ({
      state,
      online,
      ready,
      refresh: () => setState(readState()),
      reset: () => setState(mockEmergencyService.reset()),
    }),
    [online, ready, state],
  );

  return <EmergencyContext.Provider value={value}>{children}</EmergencyContext.Provider>;
}

export function useEmergency() {
  const value = useContext(EmergencyContext);
  if (!value) throw new Error('useEmergency must be used inside EmergencyProvider');
  return value;
}
