'use client';

import type { EmergencyServiceConfig } from '../config';

export function EmergencyButton({
  service,
  active,
  pulsing,
  disabled,
  onActivate,
}: {
  service: EmergencyServiceConfig;
  active: boolean;
  pulsing: boolean;
  disabled: boolean;
  onActivate: () => void;
}) {
  const Icon = service.icon;
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={disabled}
      aria-pressed={active}
      aria-label={service.label}
      className={`relative z-0 flex h-32 w-32 shrink-0 flex-col items-center justify-center overflow-visible rounded-full p-3 text-center transition-[transform,box-shadow,background-color,color] duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed sm:h-36 sm:w-36 sm:p-4 ${
        active
          ? `z-20 bg-[#B91C1C] text-white shadow-[0_16px_34px_rgba(185,28,28,0.30)] ${pulsing ? 'emergency-pulse' : ''}`
          : 'bg-white text-[#003172] shadow-[0_10px_28px_rgba(15,23,42,0.14),0_0_0_1px_rgba(148,163,184,0.22)] hover:-translate-y-1 hover:shadow-[0_16px_34px_rgba(15,23,42,0.18)] disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none'
      }`}
    >
      <Icon className="mb-2 h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.2} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block break-words text-sm font-bold leading-tight sm:text-base">{service.label}</span>
        {active && <span className="mt-1 block text-[11px] font-bold">Active</span>}
      </span>
    </button>
  );
}
