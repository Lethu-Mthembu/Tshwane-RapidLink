import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, MapPin, Navigation, Phone, ShieldAlert, UserRound, XCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { serviceLabel } from '@/features/emergency/config';
import { useEmergency } from '@/features/emergency/emergency-context';
import { employeeBusy, employeeDuty, joinSession, normalizeRoomCode, sessionService } from '@/features/emergency/session-service';
import type { AcceptResult, IncidentProgress } from '@/features/emergency/types';

const failureCopy: Record<NonNullable<AcceptResult['reason']>, string> = {
  invalid: 'This response link is invalid or expired.',
  assigned: 'This incident has already been accepted by another responder.',
  off_duty: 'You are no longer on duty and cannot accept this incident.',
  inactive: 'Your employee record is inactive and cannot accept this incident.',
  busy: 'You are already assigned to another active incident.',
};

export default function ResponderOfferPage() {
  const params = useParams<{ offerId: string }>();
  const [searchParams] = useSearchParams();
  const { state, online, ready, refresh, sessionCode } = useEmergency();
  const [resultMessage, setResultMessage] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [joiningLinkedSession, setJoiningLinkedSession] = useState(false);
  const linkedSession = normalizeRoomCode(searchParams.get('session') ?? '');
  const offer = state.offers.find((item) => item.id === params.offerId);
  const incident = state.incidents.find((item) => item.id === offer?.incidentId);
  const employee = state.employees.find((item) => item.id === offer?.employeeId);
  const station = state.stations.find((item) => item.id === employee?.stationId);
  const assignedToThisEmployee = Boolean(incident && employee && incident.assignedEmployeeId === employee.id);
  const assignedElsewhere = Boolean(incident?.assignedEmployeeId && !assignedToThisEmployee);
  const onDuty = employee ? employeeDuty(state, employee.id) : false;
  const busyElsewhere = employee ? employeeBusy(state, employee.id, incident?.id) : false;
  const details = useMemo(() => assignedToThisEmployee && incident ? incident.information : [], [assignedToThisEmployee, incident]);

  useEffect(() => {
    if (linkedSession.length !== 6 || linkedSession === sessionCode) return;
    let active = true;
    setJoiningLinkedSession(true);
    void joinSession(linkedSession)
      .then(() => { if (active) refresh(); })
      .catch(() => { if (active) setResultMessage('This response link could not load its incident.'); })
      .finally(() => { if (active) setJoiningLinkedSession(false); });
    return () => { active = false; };
  }, [linkedSession, refresh, sessionCode]);

  useEffect(() => {
    if (employee) window.localStorage.setItem(`rapidlink-responder-${sessionCode ?? 'local'}`, employee.id);
  }, [employee, sessionCode]);

  const accept = async () => {
    if (!offer) return;
    setAccepting(true);
    const result = await sessionService.acceptIncident(offer.id);
    refresh();
    setAccepting(false);
    setResultMessage(result.ok ? 'Incident accepted. Client details are now available.' : failureCopy[result.reason ?? 'invalid']);
  };

  const decline = () => {
    if (!offer) return;
    sessionService.declineIncident(offer.id);
    refresh();
    setResultMessage('Offer declined. The incident remains available to other responders.');
  };

  const updateProgress = (progress: IncidentProgress) => {
    if (!incident || !employee) return;
    sessionService.updateIncidentProgress(incident.id, employee.id, progress);
    refresh();
  };

  const respondToCancellation = (acknowledge: boolean) => {
    if (!incident || !employee) return;
    sessionService.respondToCancellation(incident.id, employee.id, acknowledge);
    refresh();
    setResultMessage(acknowledge ? 'Cancellation acknowledged. The response has been stopped.' : 'Response will continue. The client has been informed.');
  };

  const requestClosure = () => {
    if (!incident || !employee) return;
    sessionService.requestCompletion(incident.id, employee.id);
    refresh();
    setResultMessage('Closure requested. The incident remains active until the client confirms receiving help.');
  };

  if (!ready || joiningLinkedSession) {
    return <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50"><div className="mx-auto max-w-xl px-4 py-16 text-center"><p className="font-bold text-[#003172]" role="status">Loading request…</p></div></main>;
  }

  if (!offer || !incident || !employee) {
    return <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50"><div className="mx-auto max-w-xl px-4 py-16 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-red-700"><ShieldAlert className="h-7 w-7" /></span><h1 className="mt-4 text-2xl font-extrabold text-[#003172]">Request unavailable</h1><p className="mt-2 text-slate-600">This request has expired or cannot be found.</p><Button asChild variant="outline" className="mt-6"><Link to="/messages">Back to requests</Link></Button></div></main>;
  }

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50">
      {!online && <div className="bg-amber-700 px-4 py-2.5 text-center text-sm font-semibold text-white" role="status">Offline · updates are saved on this device.</div>}
      <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6 sm:py-8">
        <header>
          <Link to="/messages" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#003172] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"><ArrowLeft className="h-4 w-4" /> Requests</Link>
          <div className="mt-4 flex items-start gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-red-700"><ShieldAlert className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-400">{incident.reference}</p>
              <h1 className="mt-0.5 text-2xl font-black tracking-tight text-[#003172]">{serviceLabel(incident.service)} request</h1>
              <p className="mt-1 text-xs font-semibold text-slate-500">Assigned portal · {employee.name} {employee.surname}</p>
            </div>
          </div>
        </header>

        {!assignedToThisEmployee && (
          <section className="mt-5 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]" aria-labelledby="offer-details-heading">
            <div className="border-b border-slate-100 px-5 py-4"><h2 id="offer-details-heading" className="text-lg font-extrabold text-slate-950">Request details</h2></div>
            <dl className="divide-y divide-slate-100 px-5">
              <div className="flex gap-3 py-4"><MapPin className="mt-0.5 h-5 w-5 text-slate-500" /><div><dt className="font-semibold text-slate-500">Approximate area</dt><dd className="font-extrabold text-slate-950">{station?.area ?? 'Location pending'}</dd></div></div>
              <div className="flex gap-3 py-4"><Clock3 className="mt-0.5 h-5 w-5 text-slate-500" /><div><dt className="font-semibold text-slate-500">Time reported</dt><dd className="font-extrabold text-slate-950">{new Date(incident.createdAt).toLocaleString()}</dd></div></div>
              <div className="flex gap-3 py-4"><UserRound className="mt-0.5 h-5 w-5 text-slate-500" /><div><dt className="font-semibold text-slate-500">Current assignment status</dt><dd className="font-extrabold text-slate-950">{incident.status === 'CANCELLED' ? 'Incident cancelled' : assignedElsewhere ? 'Already accepted' : offer.status === 'closed' ? 'Offer closed' : offer.status === 'declined' ? 'You declined this offer' : !employee.active ? 'Employee inactive' : !onDuty ? 'Employee off duty' : busyElsewhere ? 'Already busy' : 'Open for response'}</dd></div></div>
            </dl>
            {assignedElsewhere && <div className="mx-5 mt-4 flex gap-3 rounded-xl bg-amber-50 p-4 font-bold text-amber-950"><AlertTriangle className="h-5 w-5 shrink-0" /><p>This request was accepted by another responder.</p></div>}
            {incident.status === 'CANCELLED' && <div className="mx-5 mt-4 flex gap-3 rounded-xl bg-slate-100 p-4 font-bold text-slate-900"><XCircle className="h-5 w-5 shrink-0" /><p>The client cancelled this request.</p></div>}
            {resultMessage && <div className="mx-5 mt-4 rounded-xl bg-blue-50 p-4 font-bold text-[#003172]" role="status">{resultMessage}</div>}
            <div className="mt-5 grid gap-3 border-t border-slate-100 bg-slate-50/80 p-5 sm:grid-cols-2">
              <Button className="min-h-12 text-base" onClick={() => void accept()} disabled={accepting || assignedElsewhere || offer.status !== 'open' || incident.status !== 'WAITING_FOR_RESPONDER' || !employee.active || !onDuty || busyElsewhere}>{accepting ? 'Accepting…' : 'Accept request'}</Button>
              <Button variant="outline" className="min-h-12 text-base text-red-800 hover:bg-red-50" onClick={decline} disabled={assignedElsewhere || offer.status !== 'open'}>Decline</Button>
            </div>
          </section>
        )}

        {assignedToThisEmployee && (
          <section className="mt-5" aria-labelledby="assigned-heading">
            <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="h-6 w-6 shrink-0" /><div><h2 id="assigned-heading" className="font-extrabold">Assigned to you</h2><p className="mt-1 text-sm font-semibold">Accepted {new Date(incident.acceptedAt!).toLocaleString()}</p></div></div>
            {incident.status === 'CANCELLATION_REQUESTED' && <div className="mt-5 border-l-4 border-red-700 bg-red-50 p-4 text-red-950" role="alert"><h3 className="font-extrabold">Client requested cancellation</h3><p className="mt-1 text-sm font-semibold">Acknowledge only if the response can safely stop. Continue if assistance is still required or you are already on scene.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Button variant="emergency" className="min-h-12" onClick={() => respondToCancellation(true)}>Acknowledge cancellation</Button><Button variant="outline" className="min-h-12" onClick={() => respondToCancellation(false)}>Continue response</Button></div></div>}
            {incident.status === 'CANCELLED' && <div className="mt-5 bg-slate-100 p-4 font-bold text-slate-900" role="status">This emergency request has been cancelled. Do not continue the response.</div>}
            <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
              <h3 className="text-lg font-extrabold text-[#003172]">Client details</h3>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><dt className="text-sm font-semibold text-slate-500">Client</dt><dd className="font-extrabold">{state.profile?.name} {state.profile?.surname}</dd></div>
                <div><dt className="text-sm font-semibold text-slate-500">Phone</dt><dd className="font-extrabold">{state.profile?.phone}</dd></div>
                <div><dt className="text-sm font-semibold text-slate-500">Next of kin</dt><dd className="font-extrabold">{state.profile?.nextOfKin.name} · {state.profile?.nextOfKin.phone}</dd></div>
                <div><dt className="text-sm font-semibold text-slate-500">Coordinates</dt><dd className="font-extrabold">{incident.location ? `${incident.location.latitude.toFixed(5)}, ${incident.location.longitude.toFixed(5)}` : 'Pending'}</dd>{incident.location && <p className="mt-1 text-sm text-slate-600">Accuracy about {Math.round(incident.location.accuracy)} m · captured {new Date(incident.location.capturedAt).toLocaleString()}</p>}</div>
              </dl>
              <div className="mt-5 grid gap-3 sm:grid-cols-2"><Button asChild className="min-h-12"><a href={`tel:${state.profile?.phone.replace(/\s/g, '') ?? ''}`}><Phone className="h-4 w-4" /> Call client</a></Button><Button asChild variant="outline" className="min-h-12"><a href={incident.location ? `https://www.google.com/maps/dir/?api=1&destination=${incident.location.latitude},${incident.location.longitude}` : '#'} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Navigate</a></Button></div>
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"><h3 className="text-lg font-extrabold text-[#003172]">Additional information</h3>{details.length ? <div className="mt-3 space-y-4">{details.map((info) => <div key={info.id} className="rounded-xl bg-slate-50 p-4"><p className="font-semibold text-slate-900">{info.happened || 'No description supplied.'}</p>{info.landmark && <p className="mt-1 text-sm text-slate-700">Access: {info.landmark}</p>}<div className="mt-3 grid gap-3 sm:grid-cols-2">{info.attachments.map((attachment) => attachment.kind === 'photo' ? <img key={attachment.id} src={attachment.dataUrl} alt="Client attachment" width={600} height={400} className="max-h-56 w-full rounded-lg object-cover" /> : <audio key={attachment.id} controls src={attachment.dataUrl} className="w-full" />)}</div></div>)}</div> : <p className="mt-2 text-sm text-slate-500">No additional information.</p>}</div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]"><h3 className="text-lg font-extrabold text-[#003172]">Progress</h3><div className="mt-3 grid grid-cols-3 gap-2">{(['accepted', 'en_route', 'arrived'] as IncidentProgress[]).map((progress) => <Button key={progress} variant={incident.progress === progress ? 'primary' : 'outline'} onClick={() => updateProgress(progress)} disabled={['CANCELLATION_REQUESTED', 'CANCELLED', 'COMPLETED'].includes(incident.status)}>{progress === 'en_route' ? 'En route' : progress.charAt(0).toUpperCase() + progress.slice(1)}</Button>)}</div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4"><p className="font-bold text-slate-900">Close after help is received</p><p className="mt-1 text-sm text-slate-600">After arriving, ask the client to confirm the assistance.</p>{incident.completionRequestStatus === 'pending' && <p className="mt-3 font-bold text-[#003172]" role="status">Waiting for client confirmation.</p>}{incident.completionRequestStatus === 'declined' && <p className="mt-3 font-bold text-amber-900" role="status">The client still needs help.</p>}{incident.completionRequestStatus === 'confirmed' && <p className="mt-3 font-bold text-emerald-800" role="status">Help confirmed. Incident closed.</p>}<Button className="mt-4 min-h-12 w-full" onClick={requestClosure} disabled={incident.status !== 'ARRIVED' || incident.completionRequestStatus === 'pending'}>{incident.completionRequestStatus === 'declined' ? 'Request confirmation again' : 'Request closure'}</Button></div>
            </div>
            {resultMessage && <div className="mt-4 border-l-4 border-[#003172] bg-blue-50 p-4 font-bold text-[#003172]" role="status">{resultMessage}</div>}
          </section>
        )}

        {offer.status === 'declined' && !assignedElsewhere && <div className="mt-6 flex gap-3 rounded-2xl bg-slate-200 p-4 text-slate-900"><XCircle className="h-5 w-5 shrink-0" /><p className="font-bold">You declined this request.</p></div>}
      </div>
    </main>
  );
}
