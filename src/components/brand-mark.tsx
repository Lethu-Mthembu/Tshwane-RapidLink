import { cn } from '@/lib/utils';

export function RapidLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn('shrink-0', className)}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1" y="1" width="46" height="46" rx="14" fill="#003172" />
      <rect x="1" y="1" width="46" height="46" rx="14" stroke="#00265A" strokeWidth="2" />
      <path
        d="m19.5 29.5-3 3a5 5 0 0 1-7-7l5-5a5 5 0 0 1 7 0M28.5 18.5l3-3a5 5 0 1 1 7 7l-5 5a5 5 0 0 1-7 0M17 31l14-14"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="35" cy="13" r="6.5" fill="#DC2626" stroke="white" strokeWidth="2" />
      <path d="M35 9.75v6.5M31.75 13h6.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <RapidLinkIcon className="h-10 w-10 drop-shadow-sm" />
      <span className="leading-none">
        <span className="block text-[9px] font-extrabold uppercase tracking-[0.2em] text-slate-500">Tshwane</span>
        <span className="mt-1 block text-[19px] font-black tracking-[-0.04em] text-[#003172]">
          Rapid<span className="text-red-600">Link</span>
        </span>
      </span>
    </div>
  );
}
