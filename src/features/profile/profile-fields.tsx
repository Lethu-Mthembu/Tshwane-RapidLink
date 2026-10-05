import type { ChangeEvent } from 'react';

import type { ProfileInput } from './profile-service';
import type { ProfileErrors } from './validation';

const fieldClass = 'mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base text-slate-950 shadow-sm outline-none transition focus:border-[#003172] focus:ring-4 focus:ring-blue-100';
const labelClass = 'block text-sm font-bold text-slate-700';

export const emptyProfileInput: ProfileInput = {
  name: '', surname: '', email: '', southAfricanId: '', phone: '', nextOfKin: { name: '', phone: '' },
};

const phoneDigits = (value: string) => value.replace(/\D/g, '').replace(/^27/, '').replace(/^0/, '').slice(0, 9);

function splitName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? '', surname: parts.slice(1).join(' ') };
}

function PhoneField({
  id,
  label,
  value,
  error,
  autoComplete,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <div className={`mt-2 flex h-12 overflow-hidden rounded-xl border bg-white shadow-sm transition focus-within:ring-4 ${error ? 'border-red-400 focus-within:ring-red-100' : 'border-slate-200 focus-within:border-[#003172] focus-within:ring-blue-100'}`}>
        <span className="grid place-items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-extrabold text-[#003172]">+27</span>
        <input
          id={id}
          className="min-w-0 flex-1 bg-transparent px-3.5 text-base text-slate-950 outline-none"
          type="tel"
          inputMode="numeric"
          value={phoneDigits(value)}
          onChange={(event) => {
            const digits = phoneDigits(event.target.value);
            onChange(digits ? `+27${digits}` : '');
          }}
          autoComplete={autoComplete}
          placeholder="72 123 4567"
          maxLength={11}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
      </div>
      {error && <span id={`${id}-error`} className="mt-1.5 block text-sm font-semibold text-red-700">{error}</span>}
    </div>
  );
}

export function ProfileFields({
  value,
  errors,
  onChange,
  section = 'all',
}: {
  value: ProfileInput;
  errors: ProfileErrors;
  onChange: (value: ProfileInput) => void;
  section?: 'all' | 'personal' | 'nextOfKin';
}) {
  const text = (key: keyof Omit<ProfileInput, 'nextOfKin'>) => (event: ChangeEvent<HTMLInputElement>) => {
    const next = key === 'southAfricanId' ? event.target.value.replace(/\D/g, '').slice(0, 13) : event.target.value;
    onChange({ ...value, [key]: next });
  };
  const nextOfKin = splitName(value.nextOfKin.name);
  const kinLabelPrefix = section === 'all' ? 'Next-of-kin ' : '';
  const kinName = (key: 'firstName' | 'surname') => (event: ChangeEvent<HTMLInputElement>) => {
    const next = { ...nextOfKin, [key]: event.target.value };
    onChange({ ...value, nextOfKin: { ...value.nextOfKin, name: `${next.firstName.trim()} ${next.surname.trim()}`.trim() } });
  };

  return (
    <div className="space-y-5">
      {(section === 'all' || section === 'personal') && (
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>First name<input className={fieldClass} value={value.name} onChange={text('name')} autoComplete="given-name" aria-invalid={Boolean(errors.name)} />{errors.name && <span className="mt-1.5 block text-sm font-semibold text-red-700">{errors.name}</span>}</label>
          <label className={labelClass}>Surname<input className={fieldClass} value={value.surname} onChange={text('surname')} autoComplete="family-name" aria-invalid={Boolean(errors.surname)} />{errors.surname && <span className="mt-1.5 block text-sm font-semibold text-red-700">{errors.surname}</span>}</label>
          <label className={`${labelClass} sm:col-span-2`}>Email address<input className={fieldClass} type="email" value={value.email} onChange={text('email')} autoComplete="email" placeholder="you@example.com" aria-invalid={Boolean(errors.email)} />{errors.email && <span className="mt-1.5 block text-sm font-semibold text-red-700">{errors.email}</span>}</label>
          <label className={labelClass}>South African ID number<input className={fieldClass} value={value.southAfricanId} onChange={text('southAfricanId')} inputMode="numeric" pattern="[0-9]*" maxLength={13} autoComplete="off" placeholder="13 digits" aria-invalid={Boolean(errors.southAfricanId)} />{errors.southAfricanId && <span className="mt-1.5 block text-sm font-semibold text-red-700">{errors.southAfricanId}</span>}</label>
          <PhoneField id="client-phone" label="Mobile number" value={value.phone} error={errors.phone} autoComplete="tel" onChange={(phone) => onChange({ ...value, phone })} />
        </div>
      )}

      {(section === 'all' || section === 'nextOfKin') && (
        <div className="grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>{kinLabelPrefix}First name<input className={fieldClass} value={nextOfKin.firstName} onChange={kinName('firstName')} autoComplete="off" aria-invalid={Boolean(errors.nextOfKinFirstName)} />{errors.nextOfKinFirstName && <span className="mt-1.5 block text-sm font-semibold text-red-700">{errors.nextOfKinFirstName}</span>}</label>
          <label className={labelClass}>{kinLabelPrefix}Surname<input className={fieldClass} value={nextOfKin.surname} onChange={kinName('surname')} autoComplete="off" aria-invalid={Boolean(errors.nextOfKinSurname)} />{errors.nextOfKinSurname && <span className="mt-1.5 block text-sm font-semibold text-red-700">{errors.nextOfKinSurname}</span>}</label>
          <div className="sm:col-span-2">
            <PhoneField id="next-of-kin-phone" label={`${kinLabelPrefix}Mobile number`} value={value.nextOfKin.phone} error={errors.nextOfKinPhone} autoComplete="off" onChange={(phone) => onChange({ ...value, nextOfKin: { ...value.nextOfKin, phone } })} />
          </div>
        </div>
      )}
    </div>
  );
}

export const pinFieldClass = `${fieldClass} pr-12 tracking-[0.3em]`;
