'use client';

import { AlertTriangle, CheckCircle2, Clock3, MapPin, Navigation, Phone, ShieldAlert, UserRound, XCircle } from 'lucide-react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { useMemo, useState } from 'react';

import { ServiceNotice } from '@/components/service-notice';
import { Button } from '@/components/ui/button';
import { serviceLabel } from '@/features/emergency/config';
import { useEmergency } from '@/features/emergency/emergency-context';
import { employeeBusy, employeeDuty, mockEmergencyService } from '@/features/emergency/mock-service';
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
  const { state, online, ready, refresh } = useEmergency();
  const [resultMessage, setResultMessage] = useState('');
  const [accepting, setAccepting] = useState(false);
  const offer = state.offers.find((item) => item.id === params.offerId);
  const incident = state.incidents.find((item) => item.id === offer?.incidentId);
  const employee = state.employees.find((item) => item.id === offer?.employeeId);
  const station = state.stations.find((item) => item.id === incident?.stationId);
  const assignedToThisEmployee = Boolean(incident && employee && incident.assignedEmployeeId === employee.id);
  const assignedElsewhere = Boolean(incident?.assignedEmployeeId && !assignedToThisEmployee);
  const onDuty = employee ? employeeDuty(state, employee.id) : false;
  const busyElsewhere = employee ? employeeBusy(state, employee.id, incident?.id) : false;
  const details = useMemo(() => assignedToThisEmployee && incident ? incident.information : [], [assignedToThisEmployee, incident]);

  const accept = async () => {
    if (!offer) return;
    setAccepting(true);
    const result = await mockEmergencyService.acceptIncident(offer.id);
    refresh();
    setAccepting(false);
    setResultMessage(result.ok ? 'Incident accepted. Client details are now available.' : failureCopy[result.reason ?? 'invalid']);
  };

  const decline = () => {
    if (!offer) return;
    mockEmergencyService.declineIncident(offer.id);
    refresh();
    setResultMessage('Offer declined. The incident remains available to other responders.');
  };

  const updateProgress = (progress: IncidentProgress) => {
    if (!incident || !employee) return;
    mockEmergencyService.updateIncidentProgress(incident.id, employee.id, progress);
    refresh();
  };

  if (!ready) {
    return <main className="min-h-[calc(100vh-4rem)] bg-white"><ServiceNotice /><div className="mx-auto max-w-xl px-4 py-16 text-center"><p className="font-bold text-[#003172]" role="status">Loading incident offer…</p></div></main>;
  }

  if (!offer || !incident || !employee) {
    return <main className="min-h-[calc(100vh-4rem)] bg-white"><ServiceNotice /><div className="mx-auto max-w-xl px-4 py-16 text-center"><ShieldAlert className="mx-auto h-12 w-12 text-red-700" /><h1 className="mt-4 text-2xl font-extrabold text-[#003172]">Invalid or expired response link</h1><p className="mt-2 text-slate-700">This incident offer could not be found or is no longer available.</p></div></main>;
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-white">
      <ServiceNotice />
      {!online && <div className="bg-red-800 px-4 py-3 text-center text-sm font-bold text-white" role="alert">Browser offline — response updates cannot be shared.</div>}
      <div className="mx-auto max-w-2xl px-4 py-7 sm:px-6 sm:py-10">
        <header className="pb-5"><p className="text-sm font-bold text-slate-600">Responder offer for {employee.name} {employee.surname}</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#003172]">{serviceLabel(incident.service)} request</h1><p className="mt-2 font-bold text-slate-700">Incident {incident.reference}</p></header>

        {!assignedToThisEmployee && (
          <section className="mt-6" aria-labelledby="offer-details-heading">
            <h2 id="offer-details-heading" className="text-xl font-extrabold text-slate-950">Incident offer</h2>
            <dl className="elevated-surface mt-4 divide-y divide-slate-100 rounded-2xl bg-white px-5">
              <div className="flex gap-3 py-4"><MapPin className="mt-0.5 h-5 w-5 text-slate-500" /><div><dt className="font-semibold text-slate-500">Approximate area</dt><dd className="font-extrabold text-slate-950">{station?.area ?? 'Location pending'}</dd></div></div>
              <div className="flex gap-3 py-4"><Clock3 className="mt-0.5 h-5 w-5 text-slate-500" /><div><dt className="font-semibold text-slate-500">Time reported</dt><dd className="font-extrabold text-slate-950">{new Date(incident.createdAt).toLocaleString()}</dd></div></div>
              <div className="flex gap-3 py-4"><UserRound className="mt-0.5 h-5 w-5 text-slate-500" /><div><dt className="font-semibold text-slate-500">Current assignment status</dt><dd className="font-extrabold text-slate-950">{assignedElsewhere ? 'Already accepted' : offer.status === 'declined' ? 'You declined this offer' : !employee.active ? 'Employee inactive' : !onDuty ? 'Employee off duty' : busyElsewhere ? 'Already busy' : 'Open for response'}</dd></div></div>
            </dl>
            {assignedElsewhere && <div className="mt-5 flex gap-3 border-l-4 border-amber-600 bg-amber-50 p-4 font-bold text-amber-950"><AlertTriangle className="h-5 w-5 shrink-0" /><p>This incident has already been accepted by another responder.</p></div>}
            {resultMessage && <div className="mt-5 border-l-4 border-[#003172] bg-blue-50 p-4 font-bold text-[#003172]" role="status">{resultMessage}</div>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button className="min-h-14 text-base" onClick={() => void accept()} disabled={accepting || (!assignedElsewhere && offer.status !== 'open') || !online}>{accepting ? 'Checking…' : 'Respond'}</Button>
              <Button variant="outline" className="min-h-14 border-red-300 text-base text-red-800 hover:bg-red-50" onClick={decline} disabled={assignedElsewhere || offer.status !== 'open'}>Decline</Button>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">Opening this page does not accept the incident. Private client information is fetched into this interface only after a successful response.</p>
          </section>
        )}

        {assignedToThisEmployee && (
          <section className="mt-6" aria-labelledby="assigned-heading">
            <div className="flex gap-3 bg-emerald-50 p-4 text-emerald-950"><CheckCircle2 className="h-6 w-6 shrink-0" /><div><h2 id="assigned-heading" className="font-extrabold">Incident assigned to you</h2><p className="mt-1 text-sm font-semibold">Accepted {new Date(incident.acceptedAt!).toLocaleString()}</p></div></div>
            <div className="elevated-surface mt-6 bg-white p-5 sm:rounded-2xl">
              <h3 className="text-xl font-extrabold text-[#003172]">Client details</h3>
              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><dt className="text-sm font-semibold text-slate-500">Client</dt><dd className="font-extrabold">{state.profile.name} {state.profile.surname}</dd></div>
                <div><dt className="text-sm font-semibold text-slate-500">Phone</dt><dd className="font-extrabold">{state.profile.phone}</dd></div>
                <div><dt className="text-sm font-semibold text-slate-500">Next of kin</dt><dd className="font-extrabold">{state.profile.nextOfKin?.name} · {state.profile.nextOfKin?.phone}</dd></div>
                <div><dt className="text-sm font-semibold text-slate-500">Coordinates</dt><dd className="font-extrabold">{incident.location ? `${incident.location.latitude.toFixed(5)}, ${incident.location.longitude.toFixed(5)}` : 'Pending'}</dd>{incident.location && <p className="mt-1 text-sm text-slate-600">Accuracy about {Math.round(incident.location.accuracy)} m · captured {new Date(incident.location.capturedAt).toLocaleString()}</p>}</div>
              </dl>
              <div className="mt-5 grid grid-cols-2 gap-3"><Button asChild><a href={`tel:${state.profile.phone.replace(/\s/g, '')}`}><Phone className="h-4 w-4" /> Call client</a></Button><Button asChild variant="outline"><a href={incident.location ? `https://www.google.com/maps/dir/?api=1&destination=${incident.location.latitude},${incident.location.longitude}` : '#'} target="_blank" rel="noreferrer"><Navigation className="h-4 w-4" /> Navigate</a></Button></div>
            </div>

            <div className="elevated-surface mt-5 bg-white p-5 sm:rounded-2xl"><h3 className="text-lg font-extrabold text-[#003172]">Additional information</h3>{details.length ? <div className="mt-3 space-y-4">{details.map((info) => <div key={info.id} className="rounded-xl bg-slate-50 p-4 shadow-inner"><p className="font-semibold text-slate-900">{info.happened || 'No description supplied.'}</p>{info.landmark && <p className="mt-1 text-sm text-slate-700">Access: {info.landmark}</p>}<div className="mt-3 grid gap-3 sm:grid-cols-2">{info.attachments.map((attachment) => attachment.kind === 'photo' ? <Image key={attachment.id} src={attachment.dataUrl} alt="Client attachment" width={600} height={400} unoptimized className="max-h-56 w-full rounded-lg object-cover" /> : <audio key={attachment.id} controls src={attachment.dataUrl} className="w-full" />)}</div></div>)}</div> : <p className="mt-2 text-sm text-slate-600">No additional information has been sent. New updates will appear here.</p>}</div>

            <div className="mt-5"><h3 className="text-lg font-extrabold text-[#003172]">Incident progress</h3><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{(['accepted', 'en_route', 'arrived', 'completed'] as IncidentProgress[]).map((progress) => <Button key={progress} variant={incident.progress === progress ? 'primary' : 'outline'} onClick={() => updateProgress(progress)} disabled={incident.progress === 'completed' && progress !== 'completed'}>{progress === 'en_route' ? 'En route' : progress.charAt(0).toUpperCase() + progress.slice(1)}</Button>)}</div></div>
          </section>
        )}

        {offer.status === 'declined' && !assignedElsewhere && <div className="mt-6 flex gap-3 bg-slate-100 p-4 text-slate-900"><XCircle className="h-5 w-5 shrink-0" /><p className="font-bold">You declined this offer. It remains available to other responders.</p></div>}
      </div>
    </main>
  );
}
