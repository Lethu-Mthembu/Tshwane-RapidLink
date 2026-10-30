import { ShieldPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

export default function StaffBootstrapPage() {
  const [form, setForm] = useState({ email: '', password: '', bootstrapSecret: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setSubmitting(true);
    const response = await fetch('/api/staff/bootstrap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) }).catch(() => null);
    const body = response ? await response.json() as { message?: string } : null;
    if (!response?.ok) setError(body?.message ?? 'Administrator setup failed.'); else setMessage(body?.message ?? 'Administrator access created.');
    setSubmitting(false);
  };
  const input = 'mt-2 h-12 w-full border border-slate-300 px-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100';
  return <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-8"><section className="mx-auto max-w-md bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.12)] sm:p-8"><ShieldPlus className="h-9 w-9 text-[#003172]" /><h1 className="mt-4 text-2xl font-black text-[#003172]">Initial administrator setup</h1><p className="mt-2 text-slate-600">This one-time route creates the first organisation administrator. It closes after that account exists.</p>{!message ? <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}><label className="block text-sm font-bold">Work email<input className={input} type="email" autoComplete="username" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><label className="block text-sm font-bold">Password<input className={input} type="password" autoComplete="new-password" minLength={12} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label><label className="block text-sm font-bold">Bootstrap secret<input className={input} type="password" autoComplete="off" value={form.bootstrapSecret} onChange={(event) => setForm({ ...form, bootstrapSecret: event.target.value })} required /></label>{error && <p className="bg-red-50 p-3 font-semibold text-red-900" role="alert">{error}</p>}<Button className="min-h-12 w-full" disabled={submitting}>{submitting ? 'Creating…' : 'Create administrator'}</Button></form> : <div className="mt-6 bg-emerald-50 p-4 text-emerald-950"><p className="font-bold">{message}</p><Button asChild className="mt-4 w-full"><Link to="/staff/sign-in">Sign in</Link></Button></div>}</section></main>;
}
