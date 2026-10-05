'use client';

import { ExternalLink, Inbox, MessageSquareText, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ServiceNotice } from '@/components/service-notice';
import { Button } from '@/components/ui/button';
import { serviceLabel } from '@/features/emergency/config';
import { useEmergency } from '@/features/emergency/emergency-context';

export default function ResponderMessagesPage() {
  const { state, reset } = useEmergency();
  const [employeeId, setEmployeeId] = useState('all');
  const messages = useMemo(
    () => state.messages.filter((message) => employeeId === 'all' || message.employeeId === employeeId).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [employeeId, state.messages],
  );

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-white">
      <ServiceNotice />
      <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-slate-600"><MessageSquareText className="h-4 w-4" /> Responder communications</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#003172]">Responder messages</h1>
            <p className="mt-2 max-w-2xl text-base text-slate-700">Each eligible on-duty responder receives a unique link for the active incident.</p>
          </div>
          <Button variant="outline" onClick={reset}><RotateCcw className="h-4 w-4" /> Clear workflow data</Button>
        </header>
        <div className="mt-6 max-w-sm">
          <label htmlFor="employee-filter" className="font-bold text-slate-950">Filter by employee</label>
          <select id="employee-filter" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100">
            <option value="all">All employees</option>
            {state.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} {employee.surname} · {employee.employeeNumber}</option>)}
          </select>
        </div>

        <div className="mt-6 space-y-3">
          {messages.map((message) => {
            const employee = state.employees.find((item) => item.id === message.employeeId)!;
            const incident = state.incidents.find((item) => item.id === message.incidentId)!;
            const station = state.stations.find((item) => item.id === incident.stationId);
            const offer = state.offers.find((item) => item.id === message.offerId)!;
            return (
              <article key={message.id} className="elevated-surface bg-white p-4 sm:rounded-2xl sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div><p className="break-words font-extrabold text-slate-950">To: {employee.name} {employee.surname} · {employee.phone}</p><p className="mt-1 text-sm font-semibold text-slate-500">SMS · {new Date(message.createdAt).toLocaleString()}</p></div>
                  <span className={`w-fit rounded-full px-3 py-1 text-sm font-bold ${offer.status === 'open' ? 'bg-blue-100 text-[#003172]' : offer.status === 'accepted' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{offer.status}</span>
                </div>
                <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-800 shadow-inner"><p><strong>{serviceLabel(incident.service)} request</strong></p><p>Approximate area: {station?.area ?? 'Location pending'}</p><p>Reported: {new Date(incident.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p><p className="break-all">Reference: {incident.reference}</p></div>
                <Button asChild className="mt-4 w-full sm:w-auto"><Link href={`/responder/offers/${offer.id}`} target="_blank" rel="noopener noreferrer">Open response link <ExternalLink className="h-4 w-4" /></Link></Button>
              </article>
            );
          })}
          {!messages.length && <div className="elevated-surface bg-white p-6 text-center sm:rounded-2xl sm:p-8"><Inbox className="mx-auto h-10 w-10 text-slate-400" /><h2 className="mt-3 text-lg font-extrabold text-slate-950">No responder messages</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Use the client interface, enable a location or choose Pretoria Central, and start a request. Matching on-duty employees will appear here.</p><Button asChild className="mt-4"><Link href="/client">Open client interface</Link></Button></div>}
        </div>
      </div>
    </main>
  );
}
