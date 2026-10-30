import { ArrowLeft, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useStaffAuth } from '@/features/auth/staff-auth-context';
import { changeStaffPassword } from '@/lib/staff-auth';

export default function StaffChangePasswordPage() {
  const { identity, signOut } = useStaffAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const destination = identity?.role === 'admin' ? '/admin' : identity?.role === 'supervisor' ? '/supervisor' : '/messages';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 12) {
      setError('The new password must contain at least 12 characters.');
      return;
    }
    if (currentPassword === newPassword) {
      setError('The new password must be different from the current password.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('The new password and confirmation do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await changeStaffPassword(currentPassword, newPassword);
      await signOut();
      navigate('/staff/sign-in?passwordChanged=1', { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The password could not be changed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-8">
      <section className="mx-auto max-w-lg bg-white p-6 shadow-[0_14px_38px_rgba(15,23,42,0.12)] sm:p-8">
        <Button asChild variant="ghost" className="mb-5"><Link to={destination}><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
        <span className="grid h-12 w-12 place-items-center bg-blue-50 text-[#003172]"><KeyRound className="h-6 w-6" /></span>
        <h1 className="mt-5 text-2xl font-black text-[#003172]">Change password</h1>
        <p className="mt-2 text-base leading-6 text-slate-600">Enter your current password before choosing a new password. You will be signed out after the change.</p>
        <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block font-bold text-slate-700">Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" className="mt-2 h-12 w-full border border-slate-300 px-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100" required /></label>
          <label className="block font-bold text-slate-700">New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={12} className="mt-2 h-12 w-full border border-slate-300 px-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100" aria-describedby="new-password-guidance" required /></label>
          <p id="new-password-guidance" className="text-sm text-slate-600">Use at least 12 characters and do not reuse the current password.</p>
          <label className="block font-bold text-slate-700">Confirm new password<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={12} className="mt-2 h-12 w-full border border-slate-300 px-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100" required /></label>
          {error && <p className="bg-red-50 p-3 font-semibold text-red-900" role="alert">{error}</p>}
          <Button className="min-h-12 w-full" disabled={submitting || !currentPassword || !newPassword || !confirmation}>{submitting ? 'Changing password…' : 'Change password'}</Button>
        </form>
      </section>
    </main>
  );
}
