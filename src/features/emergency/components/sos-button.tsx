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
      className={`relative z-10 mx-auto grid h-52 w-52 place-items-center rounded-full bg-[#B91C1C] text-white shadow-[0_26px_64px_rgba(185,28,28,0.46)] transition-[transform,box-shadow] duration-300 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed sm:h-56 sm:w-56 ${active ? 'scale-[1.04]' : ''} ${pulsing ? 'emergency-pulse' : ''}`}
    >
      <span className="relative z-10 flex flex-col items-center">
        <Siren className="h-10 w-10" aria-hidden="true" />
        <span className="mt-1 text-5xl font-black tracking-tight">SOS</span>
      </span>
    </button>
  );
}
