'use client';

import { Siren } from 'lucide-react';

export function SosButton({
  active,
  pulsing,
  disabled,
  onActivate,
}: {
  active: boolean;
  pulsing: boolean;
  disabled: boolean;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={disabled}
      aria-pressed={active}
      aria-label="SOS — request police and ambulance"
      className={`relative z-10 mx-auto grid h-48 w-48 place-items-center rounded-full bg-[#B91C1C] text-white shadow-[0_22px_50px_rgba(185,28,28,0.38)] transition-[transform,box-shadow] duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed sm:h-52 sm:w-52 ${active ? 'emergency-active' : ''} ${pulsing ? 'emergency-pulse' : ''}`}
    >
      <span className="absolute inset-3 rounded-full bg-red-500/40" aria-hidden="true" />
      <span className="absolute inset-7 rounded-full bg-[#B91C1C] shadow-inner" aria-hidden="true" />
      <span className="relative z-10 flex flex-col items-center">
        <Siren className="h-9 w-9" aria-hidden="true" />
        <span className="mt-1 text-4xl font-black tracking-tight">SOS</span>
        <span className="mt-1 max-w-32 text-sm font-bold leading-5">Police + Ambulance</span>
        {active && <span className="mt-2 text-xs font-extrabold">Request active</span>}
      </span>
    </button>
  );
}
