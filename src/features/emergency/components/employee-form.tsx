'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { serviceLabel } from '../config';
import type { Employee, ServiceType, Station } from '../types';

const emptyEmployee = (stationId: string): Omit<Employee, 'id'> => ({
  employeeNumber: '',
  name: '',
  surname: '',
  phone: '',
  service: 'police',
  stationId,
  active: true,
});

export function EmployeeForm({
  station,
  employee,
  serviceLocked = false,
  onSave,
  onCancel,
}: {
  station: Station;
  employee?: Employee;
  serviceLocked?: boolean;
  onSave: (employee: Omit<Employee, 'id'> | Employee) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Omit<Employee, 'id'> | Employee>(employee ?? emptyEmployee(station.id));

  useEffect(() => setForm(employee ?? emptyEmployee(station.id)), [employee, station.id]);

  const fieldClass = 'mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-base text-slate-950 shadow-sm outline-none transition focus:border-[#003172] focus:ring-4 focus:ring-blue-100';
  const labelClass = 'text-sm font-bold text-slate-700';
  const valid = form.employeeNumber.trim() && form.name.trim() && form.surname.trim() && form.phone.trim();

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (valid) onSave(form); }} className="grid gap-5 sm:grid-cols-2">
      <div><label className={labelClass} htmlFor="name">First name</label><input id="name" className={fieldClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
      <div><label className={labelClass} htmlFor="surname">Surname</label><input id="surname" className={fieldClass} value={form.surname} onChange={(event) => setForm({ ...form, surname: event.target.value })} required /></div>
      <div><label className={labelClass} htmlFor="employee-number">Employee number</label><input id="employee-number" className={`${fieldClass} ${employee ? 'bg-slate-100 text-slate-600' : ''}`} value={form.employeeNumber} onChange={(event) => setForm({ ...form, employeeNumber: event.target.value.toUpperCase() })} disabled={Boolean(employee)} required /></div>
      <div><label className={labelClass} htmlFor="phone">Phone number</label><input id="phone" type="tel" inputMode="tel" className={fieldClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+27 71 555 0000" required /></div>
      <div><label className={labelClass} htmlFor="service">Service</label><select id="service" className={`${fieldClass} ${serviceLocked ? 'bg-slate-100 text-slate-600' : ''}`} value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value as ServiceType })} disabled={serviceLocked}>{(['police', 'ambulance', 'fire'] as ServiceType[]).map((service) => <option key={service} value={service}>{serviceLabel(service)}</option>)}</select>{serviceLocked && <p className="mt-1.5 text-xs font-semibold text-amber-700">Service is locked during an active response.</p>}</div>
      <div><label className={labelClass} htmlFor="station">Station</label><input id="station" className={`${fieldClass} bg-slate-100 text-slate-600`} value={station.name} disabled /></div>
      <label className="flex min-h-14 items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 text-sm font-bold text-slate-700 sm:col-span-2"><span><span className="block">Receive emergency requests</span><span className="mt-0.5 block text-xs font-medium text-slate-500">Turn off when this responder should no longer be dispatched.</span></span><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-5 w-5 shrink-0 accent-[#003172]" /></label>
      <div className="grid gap-2 border-t border-slate-100 pt-4 sm:col-span-2 sm:grid-cols-2"><Button type="submit" className="min-h-12" disabled={!valid}>{employee ? 'Save changes' : 'Add responder'}</Button><Button type="button" variant="outline" className="min-h-12" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
