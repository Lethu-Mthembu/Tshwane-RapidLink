import { Clock3, ExternalLink, Inbox, MapPin, MessageSquareText, Radio, UsersRound } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { serviceLabel } from '@/features/emergency/config';
import { useEmergency } from '@/features/emergency/emergency-context';
import type { Employee, Incident, IncidentOffer, ResponderMessage, Station } from '@/features/emergency/types';

interface SmsItem {
  message: ResponderMessage;
  offer: IncidentOffer;
  incident: Incident;
  employee: Employee;
  station: Station | undefined;
}

interface SmsGroup {
  incident: Incident;
  messages: SmsItem[];
}

function offerLabel(item: SmsItem) {
  if (item.incident.status === 'COMPLETED') return 'Completed';
  if (item.incident.status === 'CANCELLED') return 'Cancelled';
  if (item.offer.status === 'accepted') return 'Accepted';
  if (item.offer.status === 'declined') return 'Declined';
  if (item.incident.assignedEmployeeId && item.incident.assignedEmployeeId !== item.employee.id) return 'Accepted by another';
  if (item.offer.status === 'open') return 'Awaiting response';
  return 'Closed';
}

function offerClasses(item: SmsItem) {
  const label = offerLabel(item);
  if (label === 'Accepted') return 'bg-emerald-100 text-emerald-900';
  if (label === 'Awaiting response') return 'bg-red-100 text-red-800';
  if (label === 'Declined') return 'bg-amber-100 text-amber-900';
  return 'bg-slate-100 text-slate-700';
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr${hours === 1 ? '' : 's'} ago` : new Date(value).toLocaleDateString();
}

function incidentPriority(incident: Incident) {
  if (incident.status === 'WAITING_FOR_RESPONDER' && !incident.assignedEmployeeId) return 0;
  if (['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'CANCELLATION_REQUESTED'].includes(incident.status)) return 1;
  return 2;
}

function recipientPriority(item: SmsItem) {
  if (item.offer.status === 'open' && !item.incident.assignedEmployeeId) return 0;
  if (item.offer.status === 'accepted' || item.incident.assignedEmployeeId === item.employee.id) return 1;
  return 2;
}

export default function ResponderMessagesPage() {
  const { state, online, sessionCode } = useEmergency();

  const items = useMemo<SmsItem[]>(() => state.messages
    .map((message) => {
      const offer = state.offers.find((item) => item.id === message.offerId);
      const incident = state.incidents.find((item) => item.id === message.incidentId);
      const employee = state.employees.find((item) => item.id === message.employeeId);
      if (!offer || !incident || !employee) return null;
      return {
        message,
        offer,
        incident,
        employee,
        station: state.stations.find((station) => station.id === employee.stationId),
      } satisfies SmsItem;
    })
    .filter((item): item is SmsItem => item !== null)
    .sort((a, b) => Date.parse(b.message.createdAt) - Date.parse(a.message.createdAt)), [state.employees, state.incidents, state.messages, state.offers, state.stations]);

  const groups = useMemo<SmsGroup[]>(() => {
    const grouped = new Map<string, SmsGroup>();
    for (const item of items) {
      const group = grouped.get(item.incident.id);
      if (group) group.messages.push(item);
      else grouped.set(item.incident.id, { incident: item.incident, messages: [item] });
    }
    for (const group of grouped.values()) {
      group.messages.sort((a, b) => recipientPriority(a) - recipientPriority(b) || Date.parse(b.message.createdAt) - Date.parse(a.message.createdAt));
    }
    return [...grouped.values()].sort((a, b) => incidentPriority(a.incident) - incidentPriority(b.incident) || Date.parse(b.incident.createdAt) - Date.parse(a.incident.createdAt));
  }, [items]);

  const awaitingCount = items.filter((item) => item.offer.status === 'open' && !item.incident.assignedEmployeeId).length;
  const recipientCount = new Set(items.map((item) => item.employee.id)).size;

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50">
      {!online && <div className="bg-amber-700 px-4 py-2.5 text-center text-sm font-semibold text-white" role="status">Offline · updates are saved on this device.</div>}
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
          <div className="flex items-start gap-3 p-5 sm:p-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#003172]"><MessageSquareText className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Responder alerts</p><h1 className="mt-0.5 text-2xl font-black tracking-tight text-[#003172] sm:text-3xl">SMS alerts</h1><p className="mt-1 text-sm font-semibold text-slate-500">The same alert is sent to every eligible nearby responder.</p></div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-100 bg-slate-50/80 py-3 text-center">
            <div className="px-2"><p className="text-xl font-black text-[#003172]">{items.length}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Messages</p></div>
            <div className="px-2"><p className="text-xl font-black text-[#003172]">{recipientCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Responders</p></div>
            <div className="px-2"><p className="text-xl font-black text-red-700">{awaitingCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Awaiting</p></div>
          </div>
        </header>

        <div className="mt-6 space-y-7">
          {groups.map((group) => (
            <section key={group.incident.id} aria-labelledby={`incident-${group.incident.id}`}>
              <div className="flex items-end justify-between gap-3">
                <div><p className="text-xs font-bold text-slate-500">{group.incident.reference}</p><h2 id={`incident-${group.incident.id}`} className="mt-0.5 text-lg font-extrabold text-[#003172]">{serviceLabel(group.incident.service)} alert</h2></div>
                <span className="text-xs font-bold text-slate-500">{group.messages.length} recipient{group.messages.length === 1 ? '' : 's'}</span>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {group.messages.map((item) => (
                  <article key={item.message.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                    <div className="flex items-start gap-3 border-b border-slate-100 p-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#003172] text-xs font-black text-white">{item.employee.name[0]}{item.employee.surname[0]}</span>
                      <div className="min-w-0 flex-1"><p className="truncate font-extrabold text-slate-950">{item.employee.name} {item.employee.surname}</p><a href={`tel:${item.employee.phone.replace(/\s/g, '')}`} className="text-xs font-semibold text-slate-500 hover:text-[#003172] hover:underline">{item.employee.phone}</a></div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${offerClasses(item)}`}>{offerLabel(item)}</span>
                    </div>

                    <div className="p-4">
                      <div className="rounded-2xl rounded-tl-sm bg-slate-100 p-4 text-sm leading-6 text-slate-800">
                        <p className="font-extrabold text-[#003172]">RapidLink emergency alert</p>
                        <p className="mt-2 whitespace-pre-line">{item.message.body ?? `${serviceLabel(item.incident.service)} assistance requested near ${item.station?.area ?? 'your response area'}.`}</p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-500"><span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {item.station?.area ?? 'Location pending'}</span><span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {relativeTime(item.message.createdAt)}</span></div>
                        <p className="mt-3 text-xs font-bold text-slate-600">Reference: {item.incident.reference}</p>
                      </div>
                      <Button asChild variant={item.offer.status === 'open' && !item.incident.assignedEmployeeId ? 'emergency' : 'outline'} className="mt-4 min-h-11 w-full"><Link to={`/responder/offers/${item.offer.id}${sessionCode ? `?session=${encodeURIComponent(sessionCode)}` : ''}`} target="_blank" rel="noopener noreferrer"><Radio className="h-4 w-4" /> {item.offer.status === 'open' && !item.incident.assignedEmployeeId ? 'Open response link' : 'View response'} <ExternalLink className="h-4 w-4" /></Link></Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}

          {!groups.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500"><Inbox className="h-6 w-6" /></span><h2 className="mt-3 font-extrabold text-slate-950">No SMS alerts</h2><p className="mt-1 text-sm text-slate-500">New emergency alerts will appear here.</p></div>}
        </div>

        {items.length > 0 && <p className="mt-7 flex items-center justify-center gap-2 pb-4 text-center text-xs font-semibold text-slate-500"><UsersRound className="h-4 w-4" /> The first responder to accept is assigned. All other response links then close.</p>}
      </div>
    </main>
  );
}
