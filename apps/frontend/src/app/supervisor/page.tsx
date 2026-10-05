'use client';

import { CalendarCheck, Pencil, Plus, Search, ShieldCheck, UserX } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AccessibleModal } from '@/components/accessible-modal';
import { ServiceNotice } from '@/components/service-notice';
import { Button } from '@/components/ui/button';
import { EmployeeForm } from '@/features/emergency/components/employee-form';
import { serviceLabel } from '@/features/emergency/config';
import { useEmergency } from '@/features/emergency/emergency-context';
import { employeeBusy, employeeDuty, mockEmergencyService } from '@/features/emergency/mock-service';
import type { Employee, ServiceType } from '@/features/emergency/types';

const SUPERVISOR_STATION_ID = 'station-central';

export default function SupervisorPage() {
  const { state, refresh } = useEmergency();
  const station = state.stations.find((item) => item.id === SUPERVISOR_STATION_ID)!;
  const [query, setQuery] = useState('');
  const [service, setService] = useState<ServiceType | 'all'>('all');
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const employees = useMemo(
    () =>
      state.employees.filter(
        (employee) =>
          employee.stationId === station.id &&
          (service === 'all' || employee.service === service) &&
          `${employee.name} ${employee.surname} ${employee.employeeNumber}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [query, service, state.employees, station.id],
  );

  const save = (employee: Omit<Employee, 'id'> | Employee) => {
    if ('id' in employee) mockEmergencyService.updateEmployee(employee);
    else mockEmergencyService.addEmployee(employee);
    refresh();
    setEditing(null);
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-white">
      <ServiceNotice />
      <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="flex items-center gap-2 text-sm font-bold text-slate-600"><ShieldCheck className="h-4 w-4" /> Supervisor · {station.name}</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight text-[#003172]">Employee management</h1><p className="mt-2 max-w-2xl text-base text-slate-700">Manage this station’s staff records. Adding an employee does not mark them on duty.</p></div>
          <div className="flex flex-wrap gap-2 sm:shrink-0"><Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Add employee</Button><Button asChild variant="outline"><Link href="/supervisor/attendance"><CalendarCheck className="h-4 w-4" /> Daily attendance</Link></Button></div>
        </header>

        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_220px]">
          <label className="relative"><span className="sr-only">Search employees</span><Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-500" /><input className="h-12 w-full rounded-lg border border-slate-300 pl-11 pr-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or employee number" /></label>
          <label><span className="sr-only">Filter by service</span><select value={service} onChange={(event) => setService(event.target.value as ServiceType | 'all')} className="h-12 w-full rounded-lg border border-slate-300 px-3 text-base outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100"><option value="all">All services</option><option value="police">Police</option><option value="ambulance">Ambulance</option><option value="fire">Firefighters</option></select></label>
        </div>

        <div className="elevated-surface mt-5 overflow-x-auto bg-white sm:rounded-2xl">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#003172] text-white"><tr><th className="p-4">Employee</th><th className="p-4">Service</th><th className="p-4">Phone</th><th className="p-4">Duty / response</th><th className="p-4">Record status</th><th className="p-4"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {employees.map((employee) => {
                const onDuty = employeeDuty(state, employee.id);
                const busy = employeeBusy(state, employee.id);
                return <tr key={employee.id} className="align-top"><td className="p-4"><p className="font-extrabold text-slate-950">{employee.name} {employee.surname}</p><p className="mt-1 font-semibold text-slate-500">{employee.employeeNumber}</p></td><td className="p-4 font-bold">{serviceLabel(employee.service)}</td><td className="p-4 font-semibold text-slate-700">{employee.phone}</td><td className="p-4"><span className={`inline-flex rounded-full px-2.5 py-1 font-bold ${!onDuty ? 'bg-slate-100 text-slate-700' : busy ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{!onDuty ? 'Off duty' : busy ? 'On duty · busy' : 'On duty · available'}</span></td><td className="p-4 font-bold">{employee.active ? 'Active' : 'Inactive'}</td><td className="p-4"><Button size="sm" variant="outline" onClick={() => setEditing(employee)}><Pencil className="h-4 w-4" /> Edit</Button></td></tr>;
              })}
            </tbody>
          </table>
          {!employees.length && <div className="p-8 text-center"><UserX className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-2 font-bold">No employees match this filter.</p></div>}
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-600">Employee records and attendance shown here belong to this station.</p>
      </div>

      <AccessibleModal open={editing !== null} title={editing === 'new' ? 'Add employee' : 'Edit employee'} description="Attendance is managed separately and is not changed by this form." onClose={() => setEditing(null)}>
        {editing && <EmployeeForm station={station} employee={editing === 'new' ? undefined : editing} onSave={save} onCancel={() => setEditing(null)} />}
      </AccessibleModal>
    </main>
  );
}
