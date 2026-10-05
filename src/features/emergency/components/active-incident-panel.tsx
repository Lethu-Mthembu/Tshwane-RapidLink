'use client';

import { AlertTriangle, CheckCircle2, Clock3, MapPin, Navigation, Radio, Siren } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { serviceLabel } from '../config';
import type { Employee, Incident, Station } from '../types';

const statusCopy = (incident: Incident, employee?: Employee) => {
  if (incident.progress === 'submission_failed') return 'Request not sent. Check your connection and retry.';
  if (incident.deliveryState === 'no_station') return 'No suitable station was found.';
  if (incident.deliveryState === 'no_responders') return 'No responders are currently on duty at this station.';
  if (incident.deliveryState === 'everyone_declined') return 'Every offered responder declined. No responder has accepted yet.';
  if (incident.deliveryState === 'pending' && !incident.location) return 'Location is needed before a station can receive this request.';
  if (incident.deliveryState === 'pending') return 'Sending request…';
  if (incident.progress === 'waiting') return 'Waiting for a responder.';
  if (incident.progress === 'accepted') return `${employee?.name ?? 'A responder'} accepted your request.`;
  if (incident.progress === 'en_route') return 'Your responder is en route.';
  if (incident.progress === 'arrived') return 'Your responder has arrived.';
  if (incident.progress === 'cancellation_requested') return 'Cancellation sent to your responder.';
  if (incident.progress === 'cancelled') return 'Emergency request cancelled.';
  return 'This incident is completed.';
};

export function ActiveIncidentPanel({
  incident,
  station,
  responder,
  onAddInformation,
  onView,
  onRetry,
}: {
  incident: Incident;
  station?: Station;
  responder?: Employee;
  onAddInformation: () => void;
  onView: () => void;
  onRetry: () => void;
}) {
  const failed = incident.deliveryState === 'failed';
  const accepted = Boolean(incident.assignedEmployeeId);
  return (
    <section aria-labelledby="active-request-heading" className="border border-blue-100 bg-white p-4 shadow-[0_12px_32px_rgba(0,49,114,0.12)] sm:rounded-2xl sm:p-5">
      <div className="flex items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${failed ? 'bg-red-100 text-red-800' : accepted ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-[#003172]'}`}>
          {failed ? <AlertTriangle className="h-5 w-5" /> : accepted ? <CheckCircle2 className="h-5 w-5" /> : <Radio className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-slate-500">Active request · {incident.reference}</p>
          <h2 id="active-request-heading" className="mt-1 text-lg font-extrabold leading-snug text-[#003172]">{statusCopy(incident, responder)}</h2>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
        <div className="flex gap-2"><Siren className="h-4 w-4 shrink-0 text-slate-500" /><div><dt className="font-semibold text-slate-500">Service</dt><dd className="font-bold text-slate-950">{serviceLabel(incident.service)}</dd></div></div>
        <div className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-slate-500" /><div><dt className="font-semibold text-slate-500">Station</dt><dd className="font-bold text-slate-950">{station?.name ?? 'Awaiting usable location'}</dd></div></div>
        <div className="flex gap-2"><Clock3 className="h-4 w-4 shrink-0 text-slate-500" /><div><dt className="font-semibold text-slate-500">Reported</dt><dd className="font-bold text-slate-950">{new Date(incident.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</dd></div></div>
        <div className="flex gap-2"><Navigation className="h-4 w-4 shrink-0 text-slate-500" /><div><dt className="font-semibold text-slate-500">Additional information</dt><dd className="font-bold text-slate-950">{incident.information.length ? 'Sent' : incident.informationError ? 'Pending delivery' : 'Not sent'}</dd></div></div>
      </dl>

      {incident.searchStage > 1 && incident.status === 'WAITING_FOR_RESPONDER' && <div className="mt-4 border-l-4 border-[#003172] bg-blue-50 p-4 text-[#003172]" role="status"><p className="font-extrabold">Search expanded</p><p className="mt-1 text-sm font-semibold">Nearby appropriate stations have also been notified. Your request remains active.</p></div>}
      {incident.escalationStatus === 'ALL_STATIONS_NOTIFIED' && incident.status === 'WAITING_FOR_RESPONDER' && <div className="mt-4 border-l-4 border-amber-600 bg-amber-50 p-4 text-amber-950" role="status"><p className="font-extrabold">No responder has accepted yet</p><p className="mt-1 text-sm font-semibold">All available nearby stations have been notified. Your request remains active.</p></div>}
      {incident.cancellationResponse === 'continued' && <div className="mt-4 border-l-4 border-amber-600 bg-amber-50 p-4 text-amber-950" role="status"><p className="font-extrabold">Response continuing</p><p className="mt-1 text-sm font-semibold">The responder is continuing because assistance is still required or they are already on scene.</p></div>}

      {incident.informationError && <p className="mt-4 text-sm font-semibold text-red-700" role="alert">{incident.informationError} Your original request remains active.</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {failed ? (
          <Button className="min-h-11" onClick={onRetry}>Retry request</Button>
        ) : (
          <Button className="min-h-11" onClick={onView}>View request</Button>
        )}
        <Button variant="outline" className="min-h-11" onClick={onAddInformation}>Add information</Button>
      </div>
    </section>
  );
}
