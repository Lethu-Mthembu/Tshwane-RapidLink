import { Activity, ArrowLeft, CheckCircle2, Clock3, FileSearch, Search, ShieldCheck, UserRound, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AccessibleModal } from '@/components/accessible-modal';
import { Button } from '@/components/ui/button';
import { serviceLabel } from '@/features/emergency/config';
import { useEmergency } from '@/features/emergency/emergency-context';
import type { Incident, ServiceType } from '@/features/emergency/types';

const SUPERVISOR_STATION_ID = 'station-garankuwa';
type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled';

const activeStatuses = new Set(['CREATING', 'WAITING_FOR_RESPONDER', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'CANCELLATION_REQUESTED']);

function minutesBetween(start: string, end?: string) {
  if (!end) return null;
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 60_000);
}

function durationLabel(minutes: number | null) {
  if (minutes === null) return '—';
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return `${hours}h${remainder ? ` ${remainder}m` : ''}`;
}

function statusLabel(incident: Incident) {
  if (incident.status === 'WAITING_FOR_RESPONDER') return 'Waiting';
  if (incident.status === 'EN_ROUTE') return 'En route';
  if (incident.status === 'CANCELLATION_REQUESTED') return 'Cancellation requested';
  if (incident.status === 'COMPLETED') return 'Completed';
  if (incident.status === 'CANCELLED') return 'Cancelled';
  if (incident.status === 'FAILED') return 'Failed';
  return incident.status.charAt(0) + incident.status.slice(1).toLowerCase();
}

function statusClasses(incident: Incident) {
  if (incident.status === 'COMPLETED') return 'bg-emerald-100 text-emerald-900';
  if (incident.status === 'CANCELLED' || incident.status === 'FAILED') return 'bg-slate-100 text-slate-700';
  if (incident.status === 'CANCELLATION_REQUESTED') return 'bg-amber-100 text-amber-900';
  if (incident.status === 'WAITING_FOR_RESPONDER') return 'bg-red-100 text-red-800';
  return 'bg-blue-100 text-[#003172]';
}

function auditLabel(type: string) {
  const labels: Record<string, string> = {
    'incident-created': 'Report created',
    submitted: 'Sent to responders',
    'search-expanded': 'Search expanded',
    accepted: 'Accepted by a responder',
    'offer-declined': 'Offer declined',
    'information-added': 'Client added information',
    'progress-accepted': 'Assignment confirmed',
    'progress-en-route': 'Responder en route',
    'progress-arrived': 'Responder arrived',
    'cancellation-requested': 'Cancellation requested',
    'cancellation-acknowledged': 'Cancellation accepted',
    'cancellation-continued': 'Response continued',
    'closure-requested': 'Closure requested',
    'closure-declined': 'More help requested',
    completed: 'Help received and report closed',
    cancelled: 'Report cancelled',
  };
  return labels[type] ?? 'Report updated';
}

export default function SupervisorAnalyticsPage() {
  const { state, online } = useEmergency();
  const station = state.stations.find((item) => item.id === SUPERVISOR_STATION_ID)!;
  const [service, setService] = useState<ServiceType | 'all'>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  const stationEmployees = useMemo(
    () => state.employees.filter((employee) => employee.stationId === station.id),
    [state.employees, station.id],
  );
  const stationEmployeeIds = useMemo(() => new Set(stationEmployees.map((employee) => employee.id)), [stationEmployees]);
  const incidents = useMemo(
    () => state.incidents
      .filter((incident) => incident.stationId === station.id || incident.notifiedStationIds.includes(station.id) || Boolean(incident.assignedEmployeeId && stationEmployeeIds.has(incident.assignedEmployeeId)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [state.incidents, station.id, stationEmployeeIds],
  );

  const acceptedIncidents = incidents.filter((incident) => incident.acceptedAt);
  const averageAcceptance = acceptedIncidents.length
    ? acceptedIncidents.reduce((sum, incident) => sum + (minutesBetween(incident.createdAt, incident.acceptedAt) ?? 0), 0) / acceptedIncidents.length
    : null;
  const activeCount = incidents.filter((incident) => activeStatuses.has(incident.status)).length;
  const completedCount = incidents.filter((incident) => incident.status === 'COMPLETED').length;
  const cancelledCount = incidents.filter((incident) => incident.status === 'CANCELLED').length;
  const unansweredCount = incidents.filter((incident) => incident.deliveryState === 'no_responders' || incident.deliveryState === 'everyone_declined').length;
  const serviceCounts = (['sos', 'police', 'ambulance', 'fire'] as ServiceType[]).map((item) => ({
    service: item,
    count: incidents.filter((incident) => incident.service === item).length,
  }));
  const responderStats = stationEmployees
    .map((employee) => {
      const assigned = incidents.filter((incident) => incident.assignedEmployeeId === employee.id);
      return {
        employee,
        assigned: assigned.length,
        active: assigned.filter((incident) => activeStatuses.has(incident.status)).length,
        completed: assigned.filter((incident) => incident.status === 'COMPLETED').length,
      };
    })
    .filter((item) => item.assigned > 0)
    .sort((a, b) => b.assigned - a.assigned);

  const visibleIncidents = incidents.filter((incident) => {
    const assigned = state.employees.find((employee) => employee.id === incident.assignedEmployeeId && employee.stationId === station.id);
    const matchesQuery = `${incident.reference} ${assigned?.name ?? ''} ${assigned?.surname ?? ''} ${assigned?.employeeNumber ?? ''}`.toLowerCase().includes(query.toLowerCase());
    const matchesService = service === 'all' || incident.service === service;
    const matchesStatus = status === 'all'
      || (status === 'active' && activeStatuses.has(incident.status))
      || incident.status.toLowerCase() === status;
    return matchesQuery && matchesService && matchesStatus;
  });

  const selectedIncident = state.incidents.find((incident) => incident.id === selectedIncidentId) ?? null;
  const selectedAssignedEmployee = state.employees.find((employee) => employee.id === selectedIncident?.assignedEmployeeId);
  const selectedResponder = selectedAssignedEmployee?.stationId === station.id ? selectedAssignedEmployee : undefined;
  const selectedStationOffers = selectedIncident ? state.offers.filter((offer) => offer.incidentId === selectedIncident.id && stationEmployeeIds.has(offer.employeeId)) : [];
  const selectedAudit = selectedIncident ? state.audit.filter((entry) => entry.message.includes(selectedIncident.reference)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)) : [];

  const responderName = (incident: Incident) => {
    const employee = state.employees.find((item) => item.id === incident.assignedEmployeeId);
    if (!employee) return 'Unassigned';
    return employee.stationId === station.id ? `${employee.name} ${employee.surname}` : 'External responder';
  };

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50">
      {!online && <div className="bg-amber-700 px-4 py-2.5 text-center text-sm font-semibold text-white" role="status">Offline · showing data saved on this device.</div>}
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <Link to="/supervisor" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#003172] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"><ArrowLeft className="h-4 w-4" /> Station team</Link>

        <header className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
          <div className="flex items-start gap-3 p-5 sm:p-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#003172]"><FileSearch className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Supervisor</p><h1 className="mt-0.5 text-2xl font-black tracking-tight text-[#003172] sm:text-3xl">Reports</h1><p className="mt-1 truncate text-sm font-semibold text-slate-500">{station.name}</p></div>
          </div>
          <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/80 text-center sm:grid-cols-4 sm:divide-x sm:divide-slate-200">
            <div className="border-b border-r border-slate-200 px-2 py-3 sm:border-b-0"><p className="text-xl font-black text-[#003172]">{incidents.length}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reported</p></div>
            <div className="border-b border-slate-200 px-2 py-3 sm:border-b-0"><p className="text-xl font-black text-red-700">{activeCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Active</p></div>
            <div className="border-r border-slate-200 px-2 py-3 sm:border-r-0"><p className="text-xl font-black text-emerald-700">{completedCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Completed</p></div>
            <div className="px-2 py-3"><p className="text-xl font-black text-[#003172]">{durationLabel(averageAcceptance)}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Avg. acceptance</p></div>
          </div>
        </header>

        <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 text-[#003172]" /> Client identity and sensitive incident details are hidden.</p>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]" aria-labelledby="breakdown-heading">
          <div className="border-b border-slate-100 px-4 py-3 sm:px-5"><h2 id="breakdown-heading" className="font-bold text-[#003172]">Breakdown</h2></div>
          <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-4 sm:divide-y-0">
            {serviceCounts.map((item) => <div key={item.service} className="flex items-center justify-between gap-3 px-4 py-3"><span className="text-sm font-semibold text-slate-600">{serviceLabel(item.service)}</span><strong className="text-lg text-slate-950">{item.count}</strong></div>)}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs font-semibold text-slate-600 sm:px-5"><span>{acceptedIncidents.length} accepted</span><span>{cancelledCount} cancelled</span><span>{unansweredCount} unanswered</span></div>
        </section>

        {responderStats.length > 0 && <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]" aria-labelledby="responder-activity-heading">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5"><UserRound className="h-4 w-4 text-[#003172]" /><h2 id="responder-activity-heading" className="font-bold text-[#003172]">Responder activity</h2></div>
          <div className="hidden grid-cols-[1fr_90px_90px_90px] bg-slate-50 px-5 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:grid"><span className="text-left">Responder</span><span>Assigned</span><span>Active</span><span>Completed</span></div>
          <div className="divide-y divide-slate-100">{responderStats.map((item) => <div key={item.employee.id} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 sm:grid-cols-[1fr_90px_90px_90px] sm:px-5"><div><p className="font-bold text-slate-900">{item.employee.name} {item.employee.surname}</p><p className="text-xs font-semibold text-slate-500">{item.employee.employeeNumber} · {serviceLabel(item.employee.service)}</p></div><p className="text-right text-sm font-bold text-[#003172] sm:text-center"><span className="sm:hidden">{item.assigned} assigned</span><span className="hidden sm:inline">{item.assigned}</span></p><p className="hidden text-center text-sm font-bold text-amber-700 sm:block">{item.active}</p><p className="hidden text-center text-sm font-bold text-emerald-700 sm:block">{item.completed}</p></div>)}</div>
        </section>}

        <section className="mt-7 pb-4" aria-labelledby="incident-log-heading">
          <div><h2 id="incident-log-heading" className="text-lg font-bold text-[#003172]">Report log</h2><p className="mt-0.5 text-xs font-semibold text-slate-500">{visibleIncidents.length} report{visibleIncidents.length === 1 ? '' : 's'}</p></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_160px_160px]">
            <label className="relative"><span className="sr-only">Search report log</span><Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" /><input className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-3 text-base outline-none transition focus:border-[#003172] focus:ring-4 focus:ring-blue-100" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reference or responder" /></label>
            <label><span className="sr-only">Filter by service</span><select value={service} onChange={(event) => setService(event.target.value as ServiceType | 'all')} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100"><option value="all">All services</option><option value="sos">SOS</option><option value="police">Police</option><option value="ambulance">Ambulance</option><option value="fire">Firefighters</option></select></label>
            <label><span className="sr-only">Filter by status</span><select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100"><option value="all">All statuses</option><option value="active">Active</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></label>
          </div>

          <div className="mt-4 space-y-3 lg:hidden">
            {visibleIncidents.map((incident) => <article key={incident.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-500">{incident.reference}</p><h3 className="mt-1 font-extrabold text-slate-950">{serviceLabel(incident.service)}</h3></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusClasses(incident)}`}>{statusLabel(incident)}</span></div><dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs"><div><dt className="font-semibold text-slate-500">Responder</dt><dd className="mt-0.5 font-bold text-slate-900">{responderName(incident)}</dd></div><div><dt className="font-semibold text-slate-500">Accepted in</dt><dd className="mt-0.5 font-bold text-slate-900">{durationLabel(minutesBetween(incident.createdAt, incident.acceptedAt))}</dd></div><div className="col-span-2"><dt className="font-semibold text-slate-500">Reported</dt><dd className="mt-0.5 font-bold text-slate-900">{new Date(incident.createdAt).toLocaleString()}</dd></div></dl><Button variant="outline" className="mt-3 min-h-11 w-full" onClick={() => setSelectedIncidentId(incident.id)}><FileSearch className="h-4 w-4" /> View report</Button></article>)}
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)] lg:block">
            <table className="w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Report</th><th className="px-4 py-3">Service</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Responder</th><th className="px-4 py-3">Accepted in</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-slate-100">{visibleIncidents.map((incident) => <tr key={incident.id}><td className="px-4 py-4"><p className="font-extrabold text-slate-950">{incident.reference}</p><p className="mt-0.5 text-xs text-slate-500">{new Date(incident.createdAt).toLocaleString()}</p></td><td className="px-4 py-4 font-bold text-slate-700">{serviceLabel(incident.service)}</td><td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses(incident)}`}>{statusLabel(incident)}</span></td><td className="px-4 py-4 font-bold text-slate-800">{responderName(incident)}</td><td className="px-4 py-4 font-bold text-slate-700">{durationLabel(minutesBetween(incident.createdAt, incident.acceptedAt))}</td><td className="px-4 py-4 text-right"><Button size="sm" variant="outline" onClick={() => setSelectedIncidentId(incident.id)}><FileSearch className="h-4 w-4" /> View</Button></td></tr>)}</tbody></table>
          </div>

          {!visibleIncidents.length && <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><FileSearch className="mx-auto h-6 w-6 text-slate-400" /><p className="mt-3 font-extrabold text-slate-950">No reports found</p></div>}
        </section>
      </div>

      <AccessibleModal open={selectedIncident !== null} title={selectedIncident ? `Report ${selectedIncident.reference}` : 'Report'} description="Client personal information is hidden." onClose={() => setSelectedIncidentId(null)}>
        {selectedIncident && <div>
          <div className="flex items-center justify-between gap-3"><p className="font-extrabold text-slate-950">{serviceLabel(selectedIncident.service)}</p><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClasses(selectedIncident)}`}>{statusLabel(selectedIncident)}</span></div>
          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-slate-100 py-5 text-sm">
            <div><dt className="text-xs font-semibold text-slate-500">Reported</dt><dd className="mt-1 font-bold text-slate-900">{new Date(selectedIncident.createdAt).toLocaleString()}</dd></div>
            <div><dt className="text-xs font-semibold text-slate-500">Responder</dt><dd className="mt-1 font-bold text-slate-900">{selectedResponder ? `${selectedResponder.name} ${selectedResponder.surname}` : selectedAssignedEmployee ? 'External responder' : 'Unassigned'}</dd></div>
            <div><dt className="text-xs font-semibold text-slate-500">Employee number</dt><dd className="mt-1 font-bold text-slate-900">{selectedResponder?.employeeNumber ?? '—'}</dd></div>
            <div><dt className="text-xs font-semibold text-slate-500">Accepted in</dt><dd className="mt-1 font-bold text-slate-900">{durationLabel(minutesBetween(selectedIncident.createdAt, selectedIncident.acceptedAt))}</dd></div>
            <div><dt className="text-xs font-semibold text-slate-500">Resolution time</dt><dd className="mt-1 font-bold text-slate-900">{durationLabel(minutesBetween(selectedIncident.createdAt, selectedIncident.completedAt))}</dd></div>
            <div><dt className="text-xs font-semibold text-slate-500">Stations notified</dt><dd className="mt-1 font-bold text-slate-900">{selectedIncident.notifiedStationIds.length}</dd></div>
          </dl>

          <section className="mt-5" aria-labelledby="handling-heading"><h3 id="handling-heading" className="font-extrabold text-[#003172]">How it was handled</h3><div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm"><div className="flex gap-3 p-3"><Activity className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /><p className="text-slate-700">{selectedStationOffers.length} responder offer{selectedStationOffers.length === 1 ? '' : 's'} sent; {selectedStationOffers.filter((offer) => offer.status === 'declined').length} declined.</p></div><div className="flex gap-3 p-3">{selectedIncident.status === 'COMPLETED' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /> : selectedIncident.status === 'CANCELLED' ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[#003172]" />}<p className="text-slate-700">{selectedIncident.status === 'COMPLETED' ? 'The client confirmed that help was received.' : selectedIncident.status === 'CANCELLED' ? `The request was cancelled${selectedIncident.cancellationResponse === 'acknowledged' ? ' and acknowledged by the responder' : ''}.` : `The report is ${statusLabel(selectedIncident).toLowerCase()}.`}</p></div></div></section>

          <section className="mt-5 border-t border-slate-200 pt-4" aria-labelledby="activity-heading"><h3 id="activity-heading" className="font-extrabold text-[#003172]">Activity</h3>{selectedAudit.length ? <ol className="mt-3 space-y-3">{selectedAudit.map((entry) => <li key={entry.id} className="flex gap-3 text-sm"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#003172]" /><div><p className="font-bold text-slate-800">{auditLabel(entry.type)}</p><p className="text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p></div></li>)}</ol> : <p className="mt-2 text-sm text-slate-500">No activity recorded.</p>}</section>
          <p className="mt-5 flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0 text-[#003172]" /> Location, descriptions and attachments remain restricted.</p>
          <Button className="mt-5 min-h-12 w-full" onClick={() => setSelectedIncidentId(null)}>Close</Button>
        </div>}
      </AccessibleModal>
    </main>
  );
}
