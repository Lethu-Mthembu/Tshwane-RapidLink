'use client';

import { LocateFixed, MapPin, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { CapturedLocation } from '../types';

export function getBrowserLocation(): Promise<CapturedLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location is unavailable in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
          source: 'browser',
        }),
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Enable it in browser settings or add a landmark.'
            : error.code === error.TIMEOUT
              ? 'Location timed out. Try again or add a landmark.'
              : 'Your location could not be determined. Try again or add a landmark.';
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function LocationStatus({
  location,
  loading,
  error,
  onEnable,
}: {
  location: CapturedLocation | null;
  loading: boolean;
  error: string;
  onEnable: () => void;
}) {
  return (
    <section aria-labelledby="location-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${location ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          <MapPin className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="location-heading" className="font-bold text-slate-950">{location ? 'Location ready' : 'Enable your location'}</h2>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            {location
              ? `±${Math.round(location.accuracy)} m · ${new Date(location.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Used to find the closest response station.'}
          </p>
        </div>
      </div>
      {error && <p className="mt-3 text-sm font-medium text-red-700" role="alert">{error}</p>}
      <div className="mt-3">
        <Button type="button" variant="subtle" className="min-h-11 w-full px-3" onClick={onEnable} disabled={loading}>
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          {loading ? 'Finding…' : location ? 'Refresh' : 'Enable'}
        </Button>
      </div>
    </section>
  );
}
