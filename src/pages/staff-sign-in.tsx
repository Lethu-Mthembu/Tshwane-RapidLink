import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useStaffAuth } from '@/features/auth/staff-auth-context';
import type { StaffRole } from '@/features/emergency/types';
import { signInStaff } from '@/lib/staff-auth';

export default function StaffSignInPage() {
  const { configured, identity, refreshIdentity } = useStaffAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const destination = (role: StaffRole) => role === 'admin' ? '/admin' : role === 'supervisor' ? '/supervisor' : '/messages';
  if (identity) return <Navigate to={destination(identity.role)} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signInStaff(email.trim(), password);
      const staff = await refreshIdentity();
      if (!staff) throw new Error('This account is not active in the RapidLink staff directory.');
      navigate(destination(staff.role), { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-8">
      <section className="mx-auto max-w-md bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.12)] sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-[#003172]"><ShieldCheck className="h-6 w-6" /></span>
        <h1 className="mt-5 text-2xl font-black text-[#003172]">Staff sign in</h1>
        <p className="mt-2 text-base leading-6 text-slate-600">Responder and supervisor access is tied to an approved staff account.</p>
        {!configured && <p className="mt-4 bg-amber-50 p-3 font-semibold text-amber-950" role="alert">Staff authentication has not been configured for this deployment.</p>}
        {searchParams.get('passwordChanged') === '1' && <p className="mt-4 bg-emerald-50 p-3 font-semibold text-emerald-950" role="status">Password changed. Sign in with your new password.</p>}
        <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block text-sm font-bold text-slate-700">Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" className="mt-2 h-12 w-full border border-slate-300 px-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100" required /></label>
          <label className="block text-sm font-bold text-slate-700">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={10} className="mt-2 h-12 w-full border border-slate-300 px-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100" required /></label>
          {error && <p className="bg-red-50 p-3 font-semibold text-red-900" role="alert">{error}</p>}
          <Button className="min-h-12 w-full" disabled={!configured || submitting}><LockKeyhole className="h-4 w-4" /> {submitting ? 'Signing in…' : 'Sign in securely'}</Button>
        </form>
      </section>
    </main>
  );
}
