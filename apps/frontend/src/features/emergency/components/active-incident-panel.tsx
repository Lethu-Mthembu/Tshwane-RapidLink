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
    <section aria-labelledby="active-request-heading" className="elevated-surface bg-white p-5 sm:rounded-2xl sm:p-6">
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-lg ${failed ? 'bg-red-100 text-red-800' : accepted ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-[#003172]'}`}>
          {failed ? <AlertTriangle className="h-5 w-5" /> : accepted ? <CheckCircle2 className="h-5 w-5" /> : <Radio className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-600">Active request · {incident.reference}</p>
          <h2 id="active-request-heading" className="mt-1 text-xl font-extrabold text-[#003172]">{statusCopy(incident, responder)}</h2>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
        <div className="flex gap-2"><Siren className="h-4 w-4 shrink-0 text-slate-500" /><div><dt className="font-semibold text-slate-500">Service</dt><dd className="font-bold text-slate-950">{serviceLabel(incident.service)}</dd></div></div>
        <div className="flex gap-2"><MapPin className="h-4 w-4 shrink-0 text-slate-500" /><div><dt className="font-semibold text-slate-500">Station</dt><dd className="font-bold text-slate-950">{station?.name ?? 'Awaiting usable location'}</dd></div></div>
        <div className="flex gap-2"><Clock3 className="h-4 w-4 shrink-0 text-slate-500" /><div><dt className="font-semibold text-slate-500">Reported</dt><dd className="font-bold text-slate-950">{new Date(incident.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</dd></div></div>
        <div className="flex gap-2"><Navigation className="h-4 w-4 shrink-0 text-slate-500" /><div><dt className="font-semibold text-slate-500">Additional information</dt><dd className="font-bold text-slate-950">{incident.information.length ? 'Sent' : incident.informationError ? 'Saved locally, unsent' : 'Not sent'}</dd></div></div>
      </dl>

      {incident.informationError && <p className="mt-4 text-sm font-semibold text-red-700" role="alert">{incident.informationError} Your original request remains active.</p>}
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {failed ? (
          <Button className="min-h-12" onClick={onRetry}>Retry request</Button>
        ) : (
          <Button className="min-h-12" onClick={onView}>View request</Button>
        )}
        <Button variant="outline" className="min-h-12" onClick={onAddInformation}>Add information</Button>
      </div>
    </section>
  );
}
