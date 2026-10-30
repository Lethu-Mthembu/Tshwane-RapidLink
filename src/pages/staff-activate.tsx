import { KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';

export default function StaffActivatePage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 12) return setError('Use at least 12 characters.');
    if (password !== confirm) return setError('The passwords do not match.');
    setSubmitting(true);
    const response = await fetch('/api/staff/activate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, password }),
    }).catch(() => null);
    const body = response ? await response.json() as { message?: string } : null;
    if (!response?.ok) setError(body?.message ?? 'Activation failed.');
    else setMessage(body?.message ?? 'Responder access activated.');
    setSubmitting(false);
  };

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-8">
      <section className="mx-auto max-w-md bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.12)] sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-[#003172]"><ShieldCheck className="h-6 w-6" /></span>
        <h1 className="mt-5 text-2xl font-black text-[#003172]">Activate staff access</h1>
        <p className="mt-2 text-base text-slate-600">Create the password for your approved RapidLink staff account.</p>
        {!message ? <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-bold text-slate-700">Password<input type="password" autoComplete="new-password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12 w-full border border-slate-300 px-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100" required /></label>
          <label className="block text-sm font-bold text-slate-700">Confirm password<input type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={(event) => setConfirm(event.target.value)} className="mt-2 h-12 w-full border border-slate-300 px-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100" required /></label>
          {error && <p className="bg-red-50 p-3 font-semibold text-red-900" role="alert">{error}</p>}
          <Button className="min-h-12 w-full" disabled={submitting || !token}><KeyRound className="h-4 w-4" /> {submitting ? 'Activating…' : 'Activate account'}</Button>
        </form> : <div className="mt-6 bg-emerald-50 p-4 text-emerald-950" role="status"><p className="font-bold">{message}</p><Button asChild className="mt-4 w-full"><Link to="/staff/sign-in">Continue to sign in</Link></Button></div>}
      </section>
    </main>
  );
}
