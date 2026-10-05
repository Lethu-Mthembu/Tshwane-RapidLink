import { ArrowLeft, ArrowRight, Check, Contact, Eye, EyeOff, KeyRound, UserRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useEmergency } from '@/features/emergency/emergency-context';
import { emptyProfileInput, pinFieldClass, ProfileFields } from '@/features/profile/profile-fields';
import { registerProfile } from '@/features/profile/profile-service';
import { normalizePhone, validatePin, validateProfile, type ProfileErrors } from '@/features/profile/validation';
import type { RegistrationStatus } from '@/features/emergency/types';

const steps = [
  { label: 'Your details', title: 'Tell us about you', description: 'The essentials responders use to identify and contact you.', icon: UserRound },
  { label: 'Emergency contact', title: 'Add your next of kin', description: 'Someone responders can contact if you need support.', icon: Contact },
  { label: 'Safety PIN', title: 'Create a cancellation PIN', description: 'Use these six digits if you need to cancel an active alert.', icon: KeyRound },
] as const;

const personalKeys: (keyof ProfileErrors)[] = ['name', 'surname', 'email', 'southAfricanId', 'phone'];
const nextOfKinKeys: (keyof ProfileErrors)[] = ['nextOfKinFirstName', 'nextOfKinSurname', 'nextOfKinPhone'];

function selectErrors(errors: ProfileErrors, keys: (keyof ProfileErrors)[]) {
  return keys.reduce<ProfileErrors>((selected, key) => {
    if (errors[key]) selected[key] = errors[key];
    return selected;
  }, {});
}

function PinField({
  id,
  label,
  value,
  visible,
  error,
  onChange,
  onToggle,
}: {
  id: string;
  label: string;
  value: string;
  visible: boolean;
  error?: string;
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
          autoComplete="new-password"
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

export default function RegisterPage() {
  const navigate = useNavigate();
  const { refresh } = useEmergency();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState(emptyProfileInput);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [status, setStatus] = useState<RegistrationStatus>('NOT_REGISTERED');
  const [message, setMessage] = useState('');
  const currentStep = steps[step]!;
  const StepIcon = currentStep.icon;

  const continueToNextStep = () => {
    const validation = validateProfile(profile);
    const currentErrors = selectErrors(validation, step === 0 ? personalKeys : nextOfKinKeys);
    setErrors(currentErrors);
    if (Object.keys(currentErrors).length) return;
    setMessage('');
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (step < steps.length - 1) {
      continueToNextStep();
      return;
    }
    if (status === 'SAVING') return;
    const profileErrors = validateProfile(profile);
    const nextErrors: ProfileErrors = { ...profileErrors, ...validatePin(pin, confirmPin) };
    setErrors(nextErrors);
    if (Object.keys(profileErrors).length) {
      setStep(personalKeys.some((key) => profileErrors[key]) ? 0 : 1);
      setStatus('SAVE_FAILED');
      setMessage('Check the highlighted details.');
      return;
    }
    if (nextErrors.pin || nextErrors.confirmPin) {
      setStatus('SAVE_FAILED');
      setMessage('Check your cancellation PIN.');
      return;
    }
    setStatus('SAVING');
    setMessage('Saving your profile…');
    try {
      await registerProfile({
        ...profile,
        name: profile.name.trim(),
        surname: profile.surname.trim(),
        email: profile.email.trim(),
        phone: normalizePhone(profile.phone),
        nextOfKin: { name: profile.nextOfKin.name.trim(), phone: normalizePhone(profile.nextOfKin.phone) },
      }, pin);
      refresh();
      setStatus('REGISTERED');
      navigate('/client', { replace: true });
    } catch {
      setStatus('SAVE_FAILED');
      setMessage('Your profile could not be saved. Try again.');
    }
  };

  const sameNumber = normalizePhone(profile.phone) && normalizePhone(profile.phone) === normalizePhone(profile.nextOfKin.phone);

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-[linear-gradient(180deg,#eff6ff_0%,#f8fafc_34%,#f8fafc_100%)]">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="text-center">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-red-700">Welcome to RapidLink</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-[#003172] sm:text-4xl">Create your emergency profile</h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600 sm:text-base">Three quick steps so help can reach the right person faster.</p>
        </header>

        <ol className="mt-8 grid grid-cols-3 gap-2" aria-label="Registration progress">
          {steps.map((item, index) => (
            <li key={item.label} aria-current={step === index ? 'step' : undefined}>
              <div className={`h-1.5 rounded-full ${index <= step ? 'bg-[#003172]' : 'bg-slate-200'}`} />
              <div className="mt-2 flex items-center gap-1.5">
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-black ${index < step ? 'bg-emerald-600 text-white' : index === step ? 'bg-[#003172] text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {index < step ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                <span className={`hidden text-[11px] font-bold sm:block ${index === step ? 'text-[#003172]' : 'text-slate-500'}`}>{item.label}</span>
              </div>
            </li>
          ))}
        </ol>

        <form className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.10)]" onSubmit={(event) => void submit(event)} noValidate>
          <div className="p-5 sm:p-7">
            <div className="flex items-start gap-3 border-b border-slate-100 pb-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#003172]"><StepIcon className="h-5 w-5" /></span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Step {step + 1} of {steps.length}</p>
                <h2 className="mt-0.5 text-xl font-extrabold text-slate-950">{currentStep.title}</h2>
                <p className="mt-1 text-sm leading-5 text-slate-500">{currentStep.description}</p>
              </div>
            </div>

            <div className="mt-6">
              {step === 0 && <ProfileFields value={profile} errors={errors} onChange={setProfile} section="personal" />}
              {step === 1 && (
                <>
                  <ProfileFields value={profile} errors={errors} onChange={setProfile} section="nextOfKin" />
                  {sameNumber && <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-950" role="status">Use a different number from your own where possible.</p>}
                </>
              )}
              {step === 2 && (
                <div>
                  <div className="rounded-2xl bg-blue-50 p-4 text-sm text-[#003172]">
                    <p className="font-extrabold">Choose six memorable digits</p>
                    <p className="mt-1 leading-5 text-blue-900">You’ll need this PIN to cancel an active emergency request.</p>
                  </div>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <PinField id="cancellation-pin" label="Cancellation PIN" value={pin} visible={showPin} error={errors.pin} onChange={setPin} onToggle={() => setShowPin((visible) => !visible)} />
                    <PinField id="confirm-cancellation-pin" label="Confirm PIN" value={confirmPin} visible={showConfirmation} error={errors.confirmPin} onChange={setConfirmPin} onToggle={() => setShowConfirmation((visible) => !visible)} />
                  </div>
                </div>
              )}
            </div>

            <div aria-live="polite" className={`mt-5 min-h-5 text-sm font-semibold ${status === 'SAVE_FAILED' ? 'text-red-700' : 'text-slate-600'}`}>{message}</div>
          </div>

          <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-7">
            {step > 0 && (
              <Button type="button" variant="ghost" className="min-h-12 px-3" onClick={() => { setErrors({}); setMessage(''); setStep((current) => current - 1); }}>
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            )}
            <Button type="submit" className="ml-auto min-h-12 min-w-36 px-5 text-base" disabled={status === 'SAVING'}>
              {status === 'SAVING' ? 'Saving…' : step === steps.length - 1 ? 'Finish setup' : 'Continue'}
              {status !== 'SAVING' && step < steps.length - 1 && <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </form>

        <p className="mt-5 text-center text-xs leading-5 text-slate-500">Your details are only shown to an assigned responder.</p>
      </div>
    </main>
  );
}
