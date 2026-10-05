import { Mail, MessageSquareText } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export type RecoveryMethod = 'sms' | 'email';

export function recoveryDestination(method: RecoveryMethod, phone: string, email: string) {
  if (method === 'sms') {
    const digits = phone.replace(/\D/g, '');
    return `••• ••• ${digits.slice(-4)}`;
  }
  const [name = '', domain = ''] = email.split('@');
  const visible = name.slice(0, Math.min(2, name.length));
  return `${visible}${'•'.repeat(Math.max(3, name.length - visible.length))}@${domain}`;
}

export function PinRecoveryForm({
  phone,
  email,
  onSend,
  onCancel,
}: {
  phone: string;
  email: string;
  onSend: (method: RecoveryMethod) => void;
  onCancel: () => void;
}) {
  const [method, setMethod] = useState<RecoveryMethod>('sms');
  const options = [
    { id: 'sms' as const, label: 'Text message', value: recoveryDestination('sms', phone, email), icon: MessageSquareText },
    { id: 'email' as const, label: 'Email', value: recoveryDestination('email', phone, email), icon: Mail },
  ];

  return (
    <div>
      <fieldset>
        <legend className="text-sm font-bold text-slate-700">Send instructions by</legend>
        <div className="mt-3 grid gap-3">
          {options.map((option) => {
            const Icon = option.icon;
            const selected = method === option.id;
            return (
              <label key={option.id} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${selected ? 'border-[#003172] bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                <input className="sr-only" type="radio" name="pin-recovery-method" value={option.id} checked={selected} onChange={() => setMethod(option.id)} />
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? 'bg-[#003172] text-white' : 'bg-slate-100 text-slate-600'}`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0"><span className="block text-sm font-extrabold text-slate-900">{option.label}</span><span className="block truncate text-sm text-slate-500">{option.value}</span></span>
                <span aria-hidden="true" className={`ml-auto h-4 w-4 shrink-0 rounded-full border-4 ${selected ? 'border-[#003172] bg-white' : 'border-slate-300 bg-white'}`} />
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="mt-6 grid gap-2 sm:grid-cols-2"><Button className="min-h-12" onClick={() => onSend(method)}>Send reset instructions</Button><Button variant="outline" className="min-h-12" onClick={onCancel}>Back</Button></div>
    </div>
  );
}
