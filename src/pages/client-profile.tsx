import { ArrowLeft, CheckCircle2, Contact, Eye, EyeOff, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { AccessibleModal } from '@/components/accessible-modal';
import { useEmergency } from '@/features/emergency/emergency-context';
import { PinRecoveryForm, recoveryDestination, type RecoveryMethod } from '@/features/profile/pin-recovery';
import { pinFieldClass, ProfileFields } from '@/features/profile/profile-fields';
import { changeCancellationPin, updateProfile } from '@/features/profile/profile-service';
import { normalizePhone, validatePin, validateProfile, type ProfileErrors } from '@/features/profile/validation';

function PinInput({
  id,
  label,
  value,
  visible,
  error,
  autoComplete,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  error?: string;
  autoComplete: 'current-password' | 'new-password';
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-bold text-slate-700">{label}</label>
      <div className="relative mt-2">
        <input
          id={id}
          className={`${pinFieldClass} mt-0`}
          type={visible ? 'text' : 'password'}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-1 grid w-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-[#003172] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
      {error && <span id={`${id}-error`} className="mt-1.5 block text-sm font-semibold text-red-700">{error}</span>}
    </div>
  );
}

export default function ClientProfilePage() {
  const { state, refresh } = useEmergency();
  const current = state.profile!;
  const [profile, setProfile] = useState({ name: current.name, surname: current.surname, email: current.email, southAfricanId: current.southAfricanId, phone: current.phone, nextOfKin: { ...current.nextOfKin } });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentPin, setCurrentPin] = useState('');
  const [nextPin, setNextPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinMessage, setPinMessage] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNextPin, setShowNextPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoverySent, setRecoverySent] = useState<RecoveryMethod | null>(null);

  const saveDetails = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors = validateProfile(profile);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { setMessage('Check the highlighted details.'); return; }
    setSaving(true);
    updateProfile({ ...profile, phone: normalizePhone(profile.phone), nextOfKin: { ...profile.nextOfKin, phone: normalizePhone(profile.nextOfKin.phone) } });
    refresh();
    setSaving(false);
    setMessage('Changes saved.');
  };

  const changePin = async (event: FormEvent) => {
    event.preventDefault();
    const pinErrors = validatePin(nextPin, confirmPin);
    const nextErrors: ProfileErrors = { ...pinErrors };
    if (!/^\d{6}$/.test(currentPin)) nextErrors.currentPin = 'Enter your current six-digit PIN.';
    setErrors((existing) => ({
      ...existing,
      currentPin: nextErrors.currentPin,
      pin: nextErrors.pin,
      confirmPin: nextErrors.confirmPin,
    }));
    if (Object.keys(nextErrors).length) return;
    setPinMessage('Checking your PIN…');
    const result = await changeCancellationPin(currentPin, nextPin);
    refresh();
    if (!result.ok) {
      setPinMessage(result.lockedForSeconds ? `Try again in ${result.lockedForSeconds} seconds.` : `Current PIN is incorrect. ${result.attemptsRemaining ?? 0} attempts remain.`);
      return;
    }
    setCurrentPin('');
    setNextPin('');
    setConfirmPin('');
    setPinMessage('PIN changed.');
  };

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50">
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8">
        <Link to="/client" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#003172] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"><ArrowLeft className="h-4 w-4" /> Emergency page</Link>

        <header className="mt-4">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Your account</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-[#003172]">Emergency profile</h1>
        </header>

        <form className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.08)]" onSubmit={saveDetails} noValidate>
          <div className="p-5 sm:p-7">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#003172]"><UserRound className="h-5 w-5" /></span>
              <div><h2 className="text-lg font-extrabold text-slate-950">Your details</h2><p className="text-sm text-slate-500">Information shared with your responder.</p></div>
            </div>
            <div className="mt-6"><ProfileFields value={profile} errors={errors} onChange={setProfile} section="personal" /></div>

            <div className="mt-8 flex items-center gap-3 border-b border-slate-100 pb-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#003172]"><Contact className="h-5 w-5" /></span>
              <div><h2 className="text-lg font-extrabold text-slate-950">Next of kin</h2><p className="text-sm text-slate-500">Your emergency contact.</p></div>
            </div>
            <div className="mt-6"><ProfileFields value={profile} errors={errors} onChange={setProfile} section="nextOfKin" /></div>

            <div className={`mt-5 min-h-5 text-sm font-semibold ${message === 'Changes saved.' ? 'text-emerald-700' : 'text-red-700'}`} aria-live="polite">
              {message && <span className="inline-flex items-center gap-1.5">{message === 'Changes saved.' && <CheckCircle2 className="h-4 w-4" />}{message}</span>}
            </div>
          </div>
          <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-7">
            <Button className="min-h-12 w-full sm:w-auto" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
          </div>
        </form>

        <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.06)]">
          <div className="flex items-center gap-3 border-b border-slate-100 p-5 sm:px-7">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-700"><KeyRound className="h-5 w-5" /></span>
            <div><h2 className="text-lg font-extrabold text-slate-950">Cancellation PIN</h2><p className="text-sm text-slate-500">Change the PIN used to cancel an alert.</p></div>
          </div>
          <form className="p-5 sm:p-7" onSubmit={(event) => void changePin(event)} noValidate>
            <div className="rounded-2xl bg-blue-50 p-4 text-sm text-[#003172]"><p className="flex items-center gap-2 font-extrabold"><ShieldCheck className="h-4 w-4" /> Keep it private</p><p className="mt-1 text-blue-900">Use six digits that you can remember quickly.</p></div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><PinInput id="current-pin" label="Current PIN" value={currentPin} visible={showCurrentPin} error={errors.currentPin} autoComplete="current-password" onChange={setCurrentPin} onToggle={() => setShowCurrentPin((visible) => !visible)} /></div>
              <PinInput id="new-pin" label="New PIN" value={nextPin} visible={showNextPin} error={errors.pin} autoComplete="new-password" onChange={setNextPin} onToggle={() => setShowNextPin((visible) => !visible)} />
              <PinInput id="confirm-new-pin" label="Confirm new PIN" value={confirmPin} visible={showConfirmPin} error={errors.confirmPin} autoComplete="new-password" onChange={setConfirmPin} onToggle={() => setShowConfirmPin((visible) => !visible)} />
            </div>
            <div className={`mt-5 min-h-5 text-sm font-semibold ${pinMessage === 'PIN changed.' ? 'text-emerald-700' : 'text-slate-600'}`} aria-live="polite">{pinMessage}</div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><Button variant="outline" className="min-h-12">Change PIN</Button><Button type="button" variant="ghost" className="min-h-12" onClick={() => { setRecoverySent(null); setRecoveryOpen(true); }}>Forgot PIN?</Button></div>
          </form>
        </section>
      </div>

      <AccessibleModal open={recoveryOpen} title={recoverySent ? (recoverySent === 'email' ? 'Check your email' : 'Check your messages') : 'Reset cancellation PIN'} description={recoverySent ? undefined : 'Choose where to receive reset instructions.'} onClose={() => setRecoveryOpen(false)}>
        {recoverySent ? <div><div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p className="font-bold">Reset instructions were sent to {recoveryDestination(recoverySent, current.phone, current.email)}.</p></div><Button className="mt-5 min-h-12 w-full" onClick={() => setRecoveryOpen(false)}>Done</Button></div> : <PinRecoveryForm phone={current.phone} email={current.email} onSend={setRecoverySent} onCancel={() => setRecoveryOpen(false)} />}
      </AccessibleModal>
    </main>
  );
}
