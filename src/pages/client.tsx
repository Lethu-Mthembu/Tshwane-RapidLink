import { AlertTriangle, Building2, Camera, Check, CheckCircle2, Clock3, Contact, FileText, IdCard, Info, MapPin, Mic, Phone, Settings, UserRound, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { AccessibleModal } from '@/components/accessible-modal';
import { Button } from '@/components/ui/button';
import { ActiveIncidentPanel } from '@/features/emergency/components/active-incident-panel';
import { AdditionalInfoForm } from '@/features/emergency/components/additional-info-form';
import { EmergencyButton } from '@/features/emergency/components/emergency-button';
import { getBrowserLocation, LocationStatus } from '@/features/emergency/components/location-status';
import { SosButton } from '@/features/emergency/components/sos-button';
import { EMERGENCY_SERVICES, serviceLabel } from '@/features/emergency/config';
import { useEmergency } from '@/features/emergency/emergency-context';
import { deleteDraft, loadDraft, saveDraft } from '@/features/emergency/media-store';
import { sessionService } from '@/features/emergency/session-service';
import { PinRecoveryForm, recoveryDestination, type RecoveryMethod } from '@/features/profile/pin-recovery';
import { verifyCancellationPin } from '@/features/profile/profile-service';
import type { CapturedLocation, IncidentAttachment, IncidentDraft, ServiceType } from '@/features/emergency/types';

type ClientModal = 'prompt' | 'information' | 'status' | 'accepted' | 'cancellation' | 'pin-recovery' | 'pin-recovery-sent' | 'cancellation-result' | 'escalation' | 'confirm-help' | null;

const emptyDraft: IncidentDraft = { happened: '', landmark: '', photo: null, audio: null, dirty: false };
const LOCATION_KEY = 'rapidlink-last-location-v1';
const progressSteps = [
  { id: 'waiting', label: 'Sent' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'en_route', label: 'En route' },
  { id: 'arrived', label: 'Arrived' },
] as const;

export default function ClientPage() {
  const { state, online, ready, refresh } = useEmergency();
  const profile = state.profile;
  const activeIncident = profile ? state.incidents.find(
    (incident) => incident.clientId === profile.id && !['completed', 'cancelled'].includes(incident.progress),
  ) : undefined;
  const lastClosedIncident = profile && !activeIncident ? state.incidents.filter((incident) => incident.clientId === profile.id && ['completed', 'cancelled'].includes(incident.progress)).at(-1) : undefined;
  const completedIncident = lastClosedIncident?.progress === 'completed' ? lastClosedIncident : undefined;
  const cancelledIncident = lastClosedIncident?.progress === 'cancelled' ? lastClosedIncident : undefined;
  const responder = state.employees.find((item) => item.id === activeIncident?.assignedEmployeeId);
  const station = state.stations.find((item) => item.id === (responder?.stationId ?? activeIncident?.stationId));
  const notifiedStations = state.stations.filter((item) => activeIncident?.notifiedStationIds.includes(item.id));
  const [location, setLocation] = useState<CapturedLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [modal, setModal] = useState<ClientModal>(null);
  const [pulsingId, setPulsingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<IncidentDraft>(emptyDraft);
  const [sendingInfo, setSendingInfo] = useState(false);
  const [infoError, setInfoError] = useState('');
  const [acceptedQueued, setAcceptedQueued] = useState(false);
  const [escalationQueued, setEscalationQueued] = useState(false);
  const [completionQueued, setCompletionQueued] = useState(false);
  const [cancellationPin, setCancellationPin] = useState('');
  const [cancellationError, setCancellationError] = useState('');
  const [checkingPin, setCheckingPin] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [cancellationResult, setCancellationResult] = useState<'cancelled' | 'requested' | null>(null);
  const [pinRecoverySent, setPinRecoverySent] = useState<RecoveryMethod | null>(null);
  const [searchCountdownSeconds, setSearchCountdownSeconds] = useState(0);
  const activationGuard = useRef(false);
  const initializedAssignment = useRef(false);
  const previousAssignment = useRef<string | undefined>();
  const seenEscalationStage = useRef(1);
  const seenCompletionRequest = useRef<string | undefined>();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LOCATION_KEY);
      if (stored) setLocation(JSON.parse(stored) as CapturedLocation);
    } catch {
      // Location persistence is optional.
    }
  }, []);

  const activeIncidentId = activeIncident?.id;

  useEffect(() => {
    if (ready && !activeIncident) activationGuard.current = false;
  }, [activeIncident, ready]);

  useEffect(() => {
    if (!activeIncidentId) return;
    void loadDraft(activeIncidentId).then((stored) => { if (stored) setDraft(stored); }).catch(() => undefined);
  }, [activeIncidentId]);

  useEffect(() => {
    if (!activeIncident || !draft.dirty) return;
    void saveDraft(activeIncident.id, draft).catch(() => undefined);
  }, [activeIncident, draft]);

  useEffect(() => {
    if (!ready) return;
    const current = activeIncident?.assignedEmployeeId;
    if (!initializedAssignment.current) {
      previousAssignment.current = current;
      initializedAssignment.current = true;
      return;
    }
    if (current && !previousAssignment.current) {
      if (modal === 'information') setAcceptedQueued(true);
      else setModal('accepted');
    }
    previousAssignment.current = current;
  }, [activeIncident?.assignedEmployeeId, modal, ready]);

  useEffect(() => {
    if (!activeIncidentId) return;
    setEscalationQueued(false);
    setCompletionQueued(false);
    seenCompletionRequest.current = undefined;
    const saved = Number(window.localStorage.getItem(`rapidlink-escalation-seen-${activeIncidentId}`) ?? '1');
    seenEscalationStage.current = Number.isFinite(saved) ? saved : 1;
  }, [activeIncidentId]);

  useEffect(() => {
    if (modal !== 'prompt' || !activeIncident?.nextEscalationAt) {
      setSearchCountdownSeconds(0);
      return;
    }
    const updateCountdown = () => {
      setSearchCountdownSeconds(Math.max(0, Math.ceil((Date.parse(activeIncident.nextEscalationAt!) - Date.now()) / 1000)));
    };
    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [activeIncident?.nextEscalationAt, modal]);

  useEffect(() => {
    if (!activeIncident || activeIncident.searchStage <= seenEscalationStage.current) return;
    if (seenEscalationStage.current < 2) {
      if (modal) setEscalationQueued(true);
      else {
        seenEscalationStage.current = activeIncident.searchStage;
        window.localStorage.setItem(`rapidlink-escalation-seen-${activeIncident.id}`, String(activeIncident.searchStage));
        setModal('escalation');
      }
    } else {
      seenEscalationStage.current = activeIncident.searchStage;
      window.localStorage.setItem(`rapidlink-escalation-seen-${activeIncident.id}`, String(activeIncident.searchStage));
    }
  }, [activeIncident?.id, activeIncident?.searchStage, modal]);

  useEffect(() => {
    const request = activeIncident?.completionRequestStatus === 'pending' ? activeIncident.completionRequestedAt : undefined;
    if (!request || request === seenCompletionRequest.current) return;
    seenCompletionRequest.current = request;
    if (modal) setCompletionQueued(true);
    else setModal('confirm-help');
  }, [activeIncident?.completionRequestStatus, activeIncident?.completionRequestedAt, modal]);

  useEffect(() => {
    const updateLockout = () => {
      const until = state.profileSecurity?.lockedUntil ? Date.parse(state.profileSecurity.lockedUntil) : 0;
      setLockoutSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    };
    updateLockout();
    const timer = window.setInterval(updateLockout, 1000);
    return () => window.clearInterval(timer);
  }, [state.profileSecurity?.lockedUntil]);

  const saveLocation = useCallback(
    (captured: CapturedLocation) => {
      setLocation(captured);
      setLocationError('');
      try {
        window.localStorage.setItem(LOCATION_KEY, JSON.stringify(captured));
      } catch {
        // Current location is still usable for this session.
      }
      if (activeIncident) {
        sessionService.updateIncidentLocation(activeIncident.id, captured, draft.landmark);
        refresh();
      }
    },
    [activeIncident, draft.landmark, refresh],
  );

  const requestLocation = useCallback(async () => {
    setLocationLoading(true);
    setLocationError('');
    try {
      saveLocation(await getBrowserLocation());
    } catch (cause) {
      setLocationError(cause instanceof Error ? cause.message : 'Location could not be determined.');
    } finally {
      setLocationLoading(false);
    }
  }, [saveLocation]);

  const activate = (service: ServiceType) => {
    if (activationGuard.current || activeIncident) return;
    activationGuard.current = true;
    const incidentId = `incident-${crypto.randomUUID()}`;
    sessionService.createIncident({ incidentId, service, location });
    sessionService.submitIncident(incidentId);
    refresh();
    setPulsingId(incidentId);
    setModal('prompt');
    window.setTimeout(() => setPulsingId(null), 5000);

    const capturedAt = location ? Date.parse(location.capturedAt) : 0;
    if (!location || Date.now() - capturedAt > 60_000) {
      void getBrowserLocation()
        .then((fresh) => {
          saveLocation(fresh);
          sessionService.updateIncidentLocation(incidentId, fresh);
          refresh();
        })
        .catch((cause: unknown) => {
          setLocationError(cause instanceof Error ? cause.message : 'Location could not be refreshed.');
        });
    }
  };

  const closeInformation = () => {
    if (completionQueued) setModal('confirm-help');
    else if (escalationQueued && activeIncident && activeIncident.searchStage > 1) {
      seenEscalationStage.current = activeIncident.searchStage;
      window.localStorage.setItem(`rapidlink-escalation-seen-${activeIncident.id}`, String(activeIncident.searchStage));
      setModal('escalation');
    } else setModal(acceptedQueued ? 'accepted' : 'status');
    setAcceptedQueued(false);
    setEscalationQueued(false);
    setCompletionQueued(false);
  };

  const closeModal = () => {
    setCancellationPin('');
    setCancellationError('');
    if (completionQueued) { setCompletionQueued(false); setModal('confirm-help'); return; }
    if (escalationQueued && activeIncident && activeIncident.searchStage > 1) {
      seenEscalationStage.current = activeIncident.searchStage;
      window.localStorage.setItem(`rapidlink-escalation-seen-${activeIncident.id}`, String(activeIncident.searchStage));
      setEscalationQueued(false);
      setModal('escalation');
      return;
    }
    setModal(null);
  };

  const confirmCancellation = async () => {
    if (!activeIncident || cancellationPin.length !== 6 || lockoutSeconds > 0 || checkingPin) return;
    setCheckingPin(true);
    setCancellationError('');
    const result = await verifyCancellationPin(cancellationPin);
    refresh();
    setCheckingPin(false);
    if (!result.ok) {
      setCancellationPin('');
      setCancellationError(result.lockedForSeconds
        ? `Incorrect cancellation PIN. The emergency request is still active. Try again in ${result.lockedForSeconds} seconds.`
        : `Incorrect cancellation PIN. The emergency request is still active. ${result.attemptsRemaining ?? 0} attempts remain.`);
      return;
    }
    const immediatelyCancelled = ['CREATING', 'WAITING_FOR_RESPONDER', 'FAILED'].includes(activeIncident.status);
    sessionService.cancelIncident(activeIncident.id);
    refresh();
    setCancellationPin('');
    setCancellationResult(immediatelyCancelled ? 'cancelled' : 'requested');
    setModal('cancellation-result');
  };

  const confirmHelp = (received: boolean) => {
    if (!activeIncident) return;
    sessionService.confirmHelpReceived(activeIncident.id, received);
    refresh();
    setEscalationQueued(false);
    setCompletionQueued(false);
    setModal(null);
  };

  const sendInformation = () => {
    if (!activeIncident) return;
    setSendingInfo(true);
    setInfoError('');
    const attachments = [draft.photo, draft.audio].filter(Boolean) as IncidentAttachment[];
    const result = sessionService.addIncidentInformation({
      incidentId: activeIncident.id,
      happened: draft.happened,
      landmark: draft.landmark,
      attachments,
    });
    const updated = result.incidents.find((item) => item.id === activeIncident.id);
    refresh();
    setSendingInfo(false);
    if (updated?.informationError) {
      setInfoError(`${updated.informationError} The original request remains active.`);
      return;
    }
    setDraft(emptyDraft);
    void deleteDraft(activeIncident.id).catch(() => undefined);
    closeInformation();
  };

  const statusTitle = useMemo(() => {
    if (!activeIncident) return 'Request status';
    if (activeIncident.progress === 'submission_failed') return 'Request not sent';
    if (activeIncident.status === 'CANCELLATION_REQUESTED') return 'Cancellation sent';
    if (activeIncident.completionRequestStatus === 'pending') return 'Confirm help received';
    if (activeIncident.assignedEmployeeId) return 'Help is on the way';
    if (activeIncident.deliveryState === 'sent' || activeIncident.deliveryState === 'no_responders') return 'Request sent';
    if (!activeIncident.location) return 'Location needed';
    return 'Sending request…';
  }, [activeIncident]);

  const progressIndex = activeIncident
    ? progressSteps.findIndex((step) => step.id === activeIncident.progress)
    : -1;

  if (!profile) return <main className="min-h-[calc(100vh-4rem)] bg-white p-8 text-center font-bold text-[#003172]" role="status">Loading your profile…</main>;

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50">
      {!online && <div className="bg-amber-700 px-4 py-2.5 text-center text-sm font-semibold text-white" role="status">Offline · updates are saved on this device.</div>}
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8">
        {activeIncident && (
          <div className="mb-5 overflow-hidden rounded-2xl">
            <ActiveIncidentPanel
              incident={activeIncident}
              station={station}
              responder={responder}
              onAddInformation={() => setModal('information')}
              onView={() => setModal('status')}
              onRetry={() => { sessionService.submitIncident(activeIncident.id); refresh(); }}
            />
          </div>
        )}

        <section className="relative rounded-3xl bg-white px-4 py-7 text-center shadow-[0_16px_40px_rgba(15,23,42,0.08)] sm:px-6 sm:py-9" aria-labelledby="emergency-actions-heading">
          <h1 id="emergency-actions-heading" className="sr-only">Request emergency help</h1>
          <div className="py-2">
            <SosButton
              active={activeIncident?.service === 'sos'}
              pulsing={!activeIncident || (activeIncident.service === 'sos' && pulsingId === activeIncident.id)}
              disabled={Boolean(activeIncident)}
              onActivate={() => activate('sos')}
            />
          </div>
          <p className="mt-6 text-base font-bold text-slate-950">Press for immediate help</p>
          <p className="mt-1 text-sm text-slate-500">Police and ambulance</p>
        </section>

        <div className="mt-5">
          <LocationStatus location={location} loading={locationLoading} error={locationError} onEnable={() => void requestLocation()} />
        </div>

        <section className="mt-6" aria-labelledby="service-options-heading">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Specific response</p>
            <h2 id="service-options-heading" className="mt-1 text-lg font-bold text-[#003172]">Choose a service</h2>
          </div>
          <div className="mx-auto mt-5 flex max-w-72 flex-wrap justify-center gap-4 sm:max-w-[21rem] sm:gap-5">
            {EMERGENCY_SERVICES.map((service) => (
              <EmergencyButton
                key={service.id}
                service={service}
                active={activeIncident?.service === service.id}
                pulsing={activeIncident?.service === service.id && pulsingId === activeIncident.id}
                disabled={Boolean(activeIncident)}
                onActivate={() => activate(service.id)}
              />
            ))}
          </div>
          {activeIncident && <p className="mt-4 text-center text-sm font-semibold text-red-700">An emergency request is active.</p>}
        </section>

        {completedIncident && <section className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="text-xs font-semibold">{completedIncident.reference}</p><h2 className="mt-0.5 font-bold">Incident completed</h2><p className="mt-1 text-sm">The {serviceLabel(completedIncident.service).toLowerCase()} response is closed.</p></div></div></section>}

        {cancelledIncident && <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900"><div className="flex items-start gap-3"><XCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" /><div><p className="text-xs font-semibold text-slate-500">{cancelledIncident.reference}</p><h2 className="mt-0.5 font-bold">Request cancelled</h2><p className="mt-1 text-sm text-slate-600">Your emergency request was cancelled.</p></div></div></section>}

        <section className="mt-7 pb-4" aria-labelledby="saved-details-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="saved-details-heading" className="text-lg font-bold text-[#003172]">Saved emergency details</h2>
            <Link to="/client/profile" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[#003172] transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"><Settings className="h-4 w-4" /> Edit profile</Link>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#003172]"><UserRound className="h-5 w-5" /></span>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your details</p><h3 className="font-bold text-slate-950">{profile.name} {profile.surname}</h3></div>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-start gap-3"><IdCard className="mt-0.5 h-4 w-4 text-slate-400" /><div><dt className="text-xs text-slate-500">ID number</dt><dd className="font-medium text-slate-800">{profile.southAfricanId || 'Not added'}</dd></div></div>
                <div className="flex items-start gap-3"><Phone className="mt-0.5 h-4 w-4 text-slate-400" /><div><dt className="text-xs text-slate-500">Phone number</dt><dd className="font-medium text-slate-800">{profile.phone}</dd></div></div>
              </dl>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-[#003172]"><Contact className="h-5 w-5" /></span>
                <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next of kin</p><h3 className="font-bold text-slate-950">{profile.nextOfKin.name || 'Not added'}</h3></div>
              </div>
              <dl className="mt-4 text-sm">
                <div className="flex items-start gap-3"><Phone className="mt-0.5 h-4 w-4 text-slate-400" /><div><dt className="text-xs text-slate-500">Phone number</dt><dd className="font-medium text-slate-800">{profile.nextOfKin.phone || 'Not added'}</dd></div></div>
              </dl>
            </article>
          </div>
        </section>

      </div>

      <AccessibleModal open={modal === 'prompt'} title="Alert sent" description="Add details now or continue waiting." onClose={() => setModal('status')}>
        <div className="rounded-lg bg-blue-50 p-4" role="status" aria-live="polite">
          <p className="font-bold text-[#003172]">
            {!activeIncident || activeIncident.deliveryState === 'pending'
              ? 'Sending your emergency request…'
              : activeIncident.deliveryState === 'sent' || activeIncident.deliveryState === 'no_responders'
                ? 'Your emergency request has been sent.'
                : 'Your emergency request was not sent.'}
          </p>
          {activeIncident?.deliveryState === 'failed' && <p className="mt-1 text-sm font-semibold text-red-700">Check your connection and retry from the active request panel.</p>}
        </div>
        {activeIncident?.status === 'WAITING_FOR_RESPONDER' && (
          <div className="mt-5 rounded-xl bg-slate-50 px-5 py-4 text-center">
            <p className="text-sm font-bold text-slate-600">Expanding the station search in</p>
            <p className="mt-1 text-5xl font-black tabular-nums text-[#003172]" aria-hidden="true">{searchCountdownSeconds}</p>
            <p className="text-sm font-semibold text-slate-600">seconds</p>
          </div>
        )}
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button className="min-h-12" onClick={() => setModal('information')}>Add information</Button>
          <Button variant="outline" className="min-h-12" onClick={() => setModal('status')}>View request</Button>
          {activeIncident && activeIncident.status !== 'CANCELLATION_REQUESTED' && <Button variant="ghost" className="min-h-11 sm:col-span-2" onClick={() => { setCancellationPin(''); setCancellationError(''); setModal('cancellation'); }}>Cancel request</Button>}
        </div>
      </AccessibleModal>

      <AccessibleModal open={modal === 'information'} title="Add information" description="This is optional. Your original emergency request remains active." onClose={closeInformation}>
        <AdditionalInfoForm
          draft={draft}
          onChange={setDraft}
          onSend={sendInformation}
          onSkip={closeInformation}
          acceptedNotice={acceptedQueued && responder && station ? `${responder.name} from ${station.name} accepted your request. Your draft is preserved.` : undefined}
          escalationNotice={escalationQueued && activeIncident ? `We’re expanding the search. ${activeIncident.notifiedStationIds.length} nearby stations have now been notified. Your draft is preserved.` : undefined}
          sending={sendingInfo}
          error={infoError}
        />
      </AccessibleModal>

      <AccessibleModal open={modal === 'status'} title={statusTitle} onClose={closeModal}>
        {activeIncident && (
          <div>
            {activeIncident.status === 'CANCELLATION_REQUESTED' ? (
              <div className="border-l-4 border-[#003172] bg-blue-50 p-4 text-[#003172]"><p className="font-bold">Cancellation sent. The assigned responder has been informed. Wait for confirmation that the response has been stopped.</p></div>
            ) : activeIncident.assignedEmployeeId && responder && station ? (
              <div className="border-l-4 border-emerald-600 bg-emerald-50 p-4 text-emerald-950"><p className="font-bold">{responder.name} {responder.surname} from {station.name} has accepted your emergency request.</p></div>
            ) : activeIncident.deliveryState === 'sent' || activeIncident.deliveryState === 'no_responders' ? (
              <p className="text-base leading-7 text-slate-700">Your emergency request has been sent to <strong>{station?.name}</strong>, the nearest appropriate station by straight-line distance. You will be notified as soon as a responder accepts your call.</p>
            ) : activeIncident.deliveryState === 'failed' ? (
              <p className="font-bold text-red-700">Request not sent. Check your connection and try again.</p>
            ) : (
              <p className="font-bold text-[#003172]">{activeIncident.location ? 'Sending request…' : 'Location is unresolved. Enable location or add a landmark so a station can be selected.'}</p>
            )}
            {!['submission_failed', 'submitting'].includes(activeIncident.progress) && (
              <ol className="mt-5 grid grid-cols-4" aria-label="Request progress">
                {progressSteps.map((step, index) => {
                  const reached = progressIndex >= index;
                  return (
                    <li key={step.id} className="relative flex flex-col items-center text-center">
                      {index > 0 && <span className={`absolute right-1/2 top-3 h-0.5 w-full ${progressIndex >= index ? 'bg-emerald-600' : 'bg-slate-200'}`} />}
                      <span className={`relative z-10 grid h-6 w-6 place-items-center rounded-full text-[10px] font-black ${reached ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        {reached ? <Check className="h-3.5 w-3.5" /> : index + 1}
                      </span>
                      <span className={`mt-1.5 text-[10px] font-bold sm:text-xs ${reached ? 'text-emerald-800' : 'text-slate-500'}`}>{step.label}</span>
                    </li>
                  );
                })}
              </ol>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 rounded-xl bg-slate-50 p-4 text-sm shadow-inner">
              <div><dt className="text-xs font-semibold text-slate-500">Reference</dt><dd className="mt-0.5 font-extrabold text-slate-950">{activeIncident.reference}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Service</dt><dd className="mt-0.5 font-extrabold text-slate-950">{serviceLabel(activeIncident.service)}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Station</dt><dd className="mt-0.5 font-extrabold text-slate-950">{station?.name ?? 'Not selected'}</dd></div>
              <div><dt className="text-xs font-semibold text-slate-500">Reported</dt><dd className="mt-0.5 font-extrabold text-slate-950">{new Date(activeIncident.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</dd></div>
            </dl>
            {activeIncident.deliveryState === 'no_responders' && <p className="mt-4 font-semibold text-amber-900">No employees are currently on duty for this service. No responder has accepted yet.</p>}
            {activeIncident.deliveryState === 'everyone_declined' && <p className="mt-4 font-semibold text-amber-900">Every offered responder declined. The request remains active and no responder has accepted yet.</p>}
            {activeIncident.cancellationResponse === 'continued' && <p className="mt-4 border-l-4 border-amber-600 bg-amber-50 p-3 font-semibold text-amber-950">The responder is continuing because assistance is still required or they are already on scene.</p>}

            <section className="mt-5 border-t border-slate-200 pt-4" aria-labelledby="additional-information-heading">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Optional details</p>
                  <h3 id="additional-information-heading" className="mt-0.5 text-sm font-bold text-slate-700">Additional information</h3>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{activeIncident.information.length || 'None'}</span>
              </div>
              {activeIncident.information.length ? (
                <div className="mt-3 space-y-3">
                  {activeIncident.information.map((information) => (
                    <article key={information.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700">
                      {information.happened && <p className="flex items-start gap-2"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span>{information.happened}</span></p>}
                      {information.landmark && <p className="mt-2 flex items-start gap-2"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><span>{information.landmark}</span></p>}
                      {information.attachments.length > 0 && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {information.attachments.map((attachment) => attachment.kind === 'photo' ? (
                            <figure key={attachment.id} className="overflow-hidden rounded-lg bg-slate-100">
                              <img src={attachment.dataUrl} alt="Additional emergency information" className="max-h-32 w-full object-cover" />
                              <figcaption className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold text-slate-500"><Camera className="h-3 w-3" /> Photo</figcaption>
                            </figure>
                          ) : (
                            <div key={attachment.id} className="rounded-lg bg-slate-100 p-2">
                              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500"><Mic className="h-3 w-3" /> Voice recording</p>
                              <audio controls src={attachment.dataUrl} className="w-full" />
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs leading-5 text-slate-500">No additional details added.</p>
              )}
            </section>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button className="min-h-12" onClick={() => setModal('information')}>Add information</Button>
              <Button variant="outline" className="min-h-12" onClick={closeModal}>Close</Button>
              {activeIncident.status !== 'CANCELLATION_REQUESTED' && <Button variant="ghost" className="min-h-11 sm:col-span-2" onClick={() => { setCancellationPin(''); setCancellationError(''); setModal('cancellation'); }}>Cancel request</Button>}
            </div>
          </div>
        )}
      </AccessibleModal>

      <AccessibleModal open={modal === 'accepted'} title="Help is on the way" onClose={closeModal}>
        {responder && station && activeIncident && (
          <div>
            <div className="flex items-start gap-3 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="h-6 w-6 shrink-0" /><p className="font-bold leading-6">{responder.name} {responder.surname} from {station.name} has accepted your emergency request.</p></div>
            <dl className="mt-5 grid gap-3 text-sm">
              <div className="flex gap-3"><Info className="h-4 w-4 text-slate-500" /><div><dt className="font-semibold text-slate-500">Service</dt><dd className="font-bold">{serviceLabel(activeIncident.service)}</dd></div></div>
              <div className="flex gap-3"><MapPin className="h-4 w-4 text-slate-500" /><div><dt className="font-semibold text-slate-500">Station</dt><dd className="font-bold">{station.name}</dd></div></div>
              <div className="flex gap-3"><Clock3 className="h-4 w-4 text-slate-500" /><div><dt className="font-semibold text-slate-500">Accepted</dt><dd className="font-bold">{new Date(activeIncident.acceptedAt!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</dd></div></div>
            </dl>
            <div className="mt-5 grid gap-2 sm:grid-cols-2"><Button onClick={closeModal}>View responder</Button><Button variant="outline" onClick={closeModal}>Close</Button></div>
          </div>
        )}
      </AccessibleModal>

      <AccessibleModal open={modal === 'escalation'} title="We’re expanding the search" description="Nobody has accepted your request yet. We have shared it with another nearby appropriate station." onClose={closeModal}>
        {activeIncident && <div>
          <dl className="divide-y divide-slate-200 bg-slate-50 px-4 text-sm">
            <div className="flex justify-between gap-4 py-3"><dt className="font-semibold text-slate-600">Original station</dt><dd className="text-right font-extrabold">{notifiedStations[0]?.name ?? 'Not available'}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="font-semibold text-slate-600">Newly notified station</dt><dd className="text-right font-extrabold">{notifiedStations.at(-1)?.name ?? 'Not available'}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="font-semibold text-slate-600">Emergency type</dt><dd className="text-right font-extrabold">{serviceLabel(activeIncident.service)}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="font-semibold text-slate-600">Search stage</dt><dd className="font-extrabold">{activeIncident.searchStage}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="font-semibold text-slate-600">Stations notified</dt><dd className="font-extrabold">{activeIncident.notifiedStationIds.length}</dd></div>
            <div className="flex justify-between gap-4 py-3"><dt className="font-semibold text-slate-600">Current status</dt><dd className="font-extrabold">Waiting for a responder</dd></div>
          </dl>
          <Button className="mt-5 min-h-12 w-full" onClick={closeModal}>Continue waiting</Button>
        </div>}
      </AccessibleModal>

      <AccessibleModal open={modal === 'cancellation'} title="Cancel emergency request?" description="Enter your six-digit cancellation PIN to confirm. Your emergency request will remain active unless the correct PIN is entered." onClose={closeModal}>
        <label className="block font-bold text-slate-800">Six-digit cancellation PIN<input autoFocus className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-base tracking-[0.25em] outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100" type="password" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete="current-password" value={cancellationPin} onChange={(event) => setCancellationPin(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={lockoutSeconds > 0 || checkingPin} /></label>
        <button type="button" className="mt-3 text-sm font-bold text-[#003172] hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100" onClick={() => { setPinRecoverySent(null); setModal('pin-recovery'); }}>Forgot PIN?</button>
        {lockoutSeconds > 0 && <p className="mt-3 font-semibold text-red-700" role="status">Too many incorrect attempts. Try again in {lockoutSeconds} seconds. The emergency remains active.</p>}
        {cancellationError && <p className="mt-3 font-semibold text-red-700" role="alert">{cancellationError}</p>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2"><Button variant="outline" className="min-h-12" onClick={closeModal}>Keep request active</Button><Button variant="emergency" className="min-h-12" onClick={() => void confirmCancellation()} disabled={cancellationPin.length !== 6 || lockoutSeconds > 0 || checkingPin}>{checkingPin ? 'Checking PIN…' : 'Confirm cancellation'}</Button></div>
      </AccessibleModal>

      <AccessibleModal open={modal === 'pin-recovery'} title="Reset cancellation PIN" description="Choose where to receive reset instructions. Your emergency request remains active." onClose={() => setModal('cancellation')}>
        <PinRecoveryForm phone={profile.phone} email={profile.email} onSend={(method) => { setPinRecoverySent(method); setModal('pin-recovery-sent'); }} onCancel={() => setModal('cancellation')} />
      </AccessibleModal>

      <AccessibleModal open={modal === 'pin-recovery-sent'} title={pinRecoverySent === 'email' ? 'Check your email' : 'Check your messages'} description="Your emergency request remains active." onClose={() => setModal('cancellation')}>
        {pinRecoverySent && <div><div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><p className="font-bold">Reset instructions were sent to {recoveryDestination(pinRecoverySent, profile.phone, profile.email)}.</p></div><Button className="mt-5 min-h-12 w-full" onClick={() => setModal('cancellation')}>Back to PIN</Button></div>}
      </AccessibleModal>

      <AccessibleModal open={modal === 'cancellation-result'} title={cancellationResult === 'cancelled' ? 'Emergency request cancelled' : 'Cancellation sent'} onClose={closeModal}>
        <div className="flex items-start gap-3 bg-slate-50 p-4"><CheckCircle2 className="h-6 w-6 shrink-0 text-[#003172]" /><p className="font-bold leading-6">{cancellationResult === 'cancelled' ? 'Your emergency request has been cancelled successfully.' : 'The assigned responder has been informed. Wait for confirmation that the response has been stopped.'}</p></div>
        <Button className="mt-5 min-h-12 w-full" onClick={closeModal}>Close</Button>
      </AccessibleModal>

      <AccessibleModal open={modal === 'confirm-help'} title="Confirm help received" description="The responder has requested to close this incident. Confirm only after you have received the help you needed." onClose={() => setModal(null)}>
        <div className="flex items-start gap-3 border-l-4 border-[#003172] bg-blue-50 p-4 text-[#003172]"><Building2 className="h-6 w-6 shrink-0" /><p className="font-bold">Has the responder provided the required assistance?</p></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2"><Button variant="outline" className="min-h-12" onClick={() => confirmHelp(false)}><AlertTriangle className="h-5 w-5" /> I still need help</Button><Button className="min-h-12" onClick={() => confirmHelp(true)}><CheckCircle2 className="h-5 w-5" /> I received help</Button></div>
      </AccessibleModal>
    </main>
  );
}
