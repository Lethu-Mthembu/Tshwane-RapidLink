import { BarChart3, CalendarCheck, Pencil, Plus, Search, ShieldCheck, UserRound, UserX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AccessibleModal } from '@/components/accessible-modal';
import { Button } from '@/components/ui/button';
import { EmployeeForm } from '@/features/emergency/components/employee-form';
import { serviceLabel } from '@/features/emergency/config';
import { useEmergency } from '@/features/emergency/emergency-context';
import { employeeBusy, employeeDuty, sessionService } from '@/features/emergency/session-service';
import type { Employee, ServiceType } from '@/features/emergency/types';

const SUPERVISOR_STATION_ID = 'station-garankuwa';

function availability(state: Parameters<typeof employeeDuty>[0], employeeId: string) {
  const employee = state.employees.find((item) => item.id === employeeId);
  const onDuty = employeeDuty(state, employeeId);
  const busy = employeeBusy(state, employeeId);
  return {
    onDuty,
    busy,
    label: !employee?.active ? 'Disabled' : !onDuty ? 'Off duty' : busy ? 'Responding' : 'Available',
    classes: !employee?.active || !onDuty ? 'bg-slate-100 text-slate-700' : busy ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900',
  };
}

export default function SupervisorPage() {
  const { state, online, refresh } = useEmergency();
  const station = state.stations.find((item) => item.id === SUPERVISOR_STATION_ID)!;
  const [query, setQuery] = useState('');
  const [service, setService] = useState<ServiceType | 'all'>('all');
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const stationEmployees = useMemo(
    () => state.employees.filter((employee) => employee.stationId === station.id),
    [state.employees, station.id],
  );
  const employees = useMemo(
    () => stationEmployees.filter(
      (employee) =>
        (service === 'all' || employee.service === service) &&
        `${employee.name} ${employee.surname} ${employee.employeeNumber}`.toLowerCase().includes(query.toLowerCase()),
    ),
    [query, service, stationEmployees],
  );
  const onDutyCount = stationEmployees.filter((employee) => employee.active && employeeDuty(state, employee.id)).length;
  const availableCount = stationEmployees.filter((employee) => employee.active && employeeDuty(state, employee.id) && !employeeBusy(state, employee.id)).length;

  const save = (employee: Omit<Employee, 'id'> | Employee) => {
    if ('id' in employee) sessionService.updateEmployee(employee);
    else sessionService.addEmployee(employee);
    refresh();
    setEditing(null);
  };

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50">
      {!online && <div className="bg-amber-700 px-4 py-2.5 text-center text-sm font-semibold text-white" role="status">Offline · updates are saved on this device.</div>}
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
          <div className="flex items-start gap-3 p-5 sm:p-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#003172]"><ShieldCheck className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Supervisor</p>
              <h1 className="mt-0.5 text-2xl font-black tracking-tight text-[#003172] sm:text-3xl">Station team</h1>
              <p className="mt-1 truncate text-sm font-semibold text-slate-500">{station.name}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-100 bg-slate-50/80 py-3 text-center">
            <div className="px-2"><p className="text-xl font-black text-[#003172]">{stationEmployees.length}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Responders</p></div>
            <div className="px-2"><p className="text-xl font-black text-[#003172]">{onDutyCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">On duty</p></div>
            <div className="px-2"><p className="text-xl font-black text-emerald-700">{availableCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Available</p></div>
          </div>
          <div className="grid gap-2 p-4 sm:flex sm:justify-end sm:px-6">
            <Button onClick={() => setEditing('new')} className="min-h-12"><Plus className="h-4 w-4" /> Add responder</Button>
            <Button asChild variant="outline" className="min-h-12"><Link to="/supervisor/attendance"><CalendarCheck className="h-4 w-4" /> Attendance</Link></Button>
            <Button asChild variant="outline" className="min-h-12"><Link to="/supervisor/analytics"><BarChart3 className="h-4 w-4" /> Reports</Link></Button>
          </div>
        </header>

        <section className="mt-6" aria-labelledby="team-heading">
          <div className="flex items-end justify-between gap-3">
            <div><h2 id="team-heading" className="text-lg font-bold text-[#003172]">Responders</h2><p className="mt-0.5 text-xs font-semibold text-slate-500">{employees.length} shown</p></div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_190px]">
            <label className="relative"><span className="sr-only">Search responders</span><Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" /><input className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-3 text-base outline-none transition focus:border-[#003172] focus:ring-4 focus:ring-blue-100" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search responders" /></label>
            <label><span className="sr-only">Filter by service</span><select value={service} onChange={(event) => setService(event.target.value as ServiceType | 'all')} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-[#003172] focus:ring-4 focus:ring-blue-100"><option value="all">All services</option><option value="police">Police</option><option value="ambulance">Ambulance</option><option value="fire">Firefighters</option></select></label>
          </div>

          <div className="mt-4 space-y-3 md:hidden">
            {employees.map((employee) => {
              const status = availability(state, employee.id);
              return (
                <article key={employee.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#003172]"><UserRound className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1"><h3 className="font-extrabold text-slate-950">{employee.name} {employee.surname}</h3><p className="text-xs font-semibold text-slate-500">{employee.employeeNumber} · {serviceLabel(employee.service)}</p></div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${status.classes}`}>{status.label}</span>
                  </div>
                  <a href={`tel:${employee.phone.replace(/\s/g, '')}`} className="mt-4 inline-block text-sm font-semibold text-[#003172] hover:underline">{employee.phone}</a>
                  <Button variant="outline" className="mt-3 min-h-11 w-full" onClick={() => setEditing(employee)}><Pencil className="h-4 w-4" /> Edit responder</Button>
                </article>
              );
            })}
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Responder</th><th className="px-4 py-3">Service</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Dispatch status</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((employee) => {
                  const status = availability(state, employee.id);
                  return <tr key={employee.id} className="align-middle"><td className="px-4 py-4"><p className="font-extrabold text-slate-950">{employee.name} {employee.surname}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{employee.employeeNumber}</p></td><td className="px-4 py-4 font-bold text-slate-700">{serviceLabel(employee.service)}</td><td className="px-4 py-4"><a href={`tel:${employee.phone.replace(/\s/g, '')}`} className="font-semibold text-[#003172] hover:underline">{employee.phone}</a></td><td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${status.classes}`}>{status.label}</span></td><td className="px-4 py-4 text-right"><Button size="sm" variant="outline" onClick={() => setEditing(employee)}><Pencil className="h-4 w-4" /> Edit</Button></td></tr>;
                })}
              </tbody>
            </table>
          </div>

          {!employees.length && <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-500"><UserX className="h-6 w-6" /></span><p className="mt-3 font-extrabold text-slate-950">No matching responders</p><p className="mt-1 text-sm text-slate-500">Try another name or service.</p></div>}
        </section>
      </div>

      <AccessibleModal open={editing !== null} title={editing === 'new' ? 'Add responder' : 'Edit responder'} description={editing === 'new' ? 'Add a responder to this station.' : 'Update contact details, service or request access.'} onClose={() => setEditing(null)}>
        {editing && <EmployeeForm station={station} employee={editing === 'new' ? undefined : editing} serviceLocked={editing !== 'new' && employeeBusy(state, editing.id)} onSave={save} onCancel={() => setEditing(null)} />}
      </AccessibleModal>
    </main>
  );
}
