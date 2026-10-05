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
      className={`relative z-0 flex h-[9.5rem] w-[9.5rem] flex-col items-center justify-center overflow-visible rounded-full p-5 text-center shadow-[0_14px_30px_rgba(15,23,42,0.16),0_3px_10px_rgba(15,23,42,0.10)] transition-[transform,box-shadow,background-color,color] duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-200 disabled:cursor-not-allowed sm:h-[11.5rem] sm:w-[11.5rem] sm:p-6 ${
        active
          ? `emergency-active z-20 bg-[#B91C1C] text-white ${pulsing ? 'emergency-pulse' : ''}`
          : 'bg-white text-[#003172] hover:-translate-y-1 hover:shadow-[0_20px_38px_rgba(15,23,42,0.20)] disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-[0_8px_20px_rgba(15,23,42,0.10)]'
      }`}
    >
      <Icon className="mb-3 h-8 w-8 sm:h-9 sm:w-9" strokeWidth={2.2} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block break-words text-lg font-extrabold leading-tight sm:text-xl">{service.label}</span>
        <span className={`mx-auto mt-1 hidden max-w-[8rem] break-words text-xs font-semibold leading-4 min-[420px]:block ${active ? 'text-white' : 'text-slate-600'}`}>
          {active ? 'Request active' : service.shortDescription}
        </span>
      </span>
    </button>
  );
}
