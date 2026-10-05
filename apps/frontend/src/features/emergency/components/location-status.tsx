'use client';

import { LocateFixed, MapPin, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DEMO_COORDINATES } from '../config';
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
  onPreset,
}: {
  location: CapturedLocation | null;
  loading: boolean;
  error: string;
  onEnable: () => void;
  onPreset: (location: CapturedLocation) => void;
}) {
  return (
    <section aria-labelledby="location-heading" className="elevated-surface rounded-2xl bg-white px-4 py-4 text-center">
      <h2 id="location-heading" className="text-lg font-extrabold text-[#003172]">
        {location ? 'Location ready' : 'Location not enabled'}
      </h2>
      <p className="mt-1 max-w-md text-sm font-medium leading-5 text-slate-600">
        {location
          ? `Accuracy about ${Math.round(location.accuracy)} m · captured ${new Date(location.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Enable location before an emergency for faster station matching.'}
      </p>
      {error && <p className="mt-2 max-w-md text-sm font-semibold text-red-700" role="alert">{error}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="subtle" className="min-h-12" onClick={onEnable} disabled={loading}>
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          {loading ? 'Finding location…' : location ? 'Refresh location' : 'Enable location'}
        </Button>
        <Button type="button" variant="ghost" className="min-h-12 text-[#B91C1C] hover:bg-red-50 hover:text-[#991B1B]" onClick={() => onPreset({ ...DEMO_COORDINATES, capturedAt: new Date().toISOString(), source: 'demo' })}>
          <MapPin className="h-4 w-4" /> Use Pretoria Central
        </Button>
      </div>
    </section>
  );
}
