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
  onSave,
  onCancel,
}: {
  station: Station;
  employee?: Employee;
  onSave: (employee: Omit<Employee, 'id'> | Employee) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Omit<Employee, 'id'> | Employee>(employee ?? emptyEmployee(station.id));

  useEffect(() => setForm(employee ?? emptyEmployee(station.id)), [employee, station.id]);

  const fieldClass = 'mt-1 h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:border-[#003172] focus:ring-4 focus:ring-blue-100';
  const valid = form.employeeNumber.trim() && form.name.trim() && form.surname.trim() && form.phone.trim();

  return (
    <form onSubmit={(event) => { event.preventDefault(); if (valid) onSave(form); }} className="grid gap-4 sm:grid-cols-2">
      <div><label className="font-bold" htmlFor="employee-number">Employee number</label><input id="employee-number" className={fieldClass} value={form.employeeNumber} onChange={(event) => setForm({ ...form, employeeNumber: event.target.value })} required /></div>
      <div><label className="font-bold" htmlFor="phone">Phone number</label><input id="phone" type="tel" className={fieldClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></div>
      <div><label className="font-bold" htmlFor="name">Name</label><input id="name" className={fieldClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
      <div><label className="font-bold" htmlFor="surname">Surname</label><input id="surname" className={fieldClass} value={form.surname} onChange={(event) => setForm({ ...form, surname: event.target.value })} required /></div>
      <div><label className="font-bold" htmlFor="service">Service type</label><select id="service" className={fieldClass} value={form.service} onChange={(event) => setForm({ ...form, service: event.target.value as ServiceType })}>{(['police', 'ambulance', 'fire'] as ServiceType[]).map((service) => <option key={service} value={service}>{serviceLabel(service)}</option>)}</select></div>
      <div><label className="font-bold" htmlFor="station">Station</label><input id="station" className={`${fieldClass} bg-slate-100`} value={station.name} disabled /><p className="mt-1 text-xs font-semibold text-slate-500">This supervisor account is scoped to one station.</p></div>
      <label className="flex min-h-12 items-center gap-3 font-bold sm:col-span-2"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-5 w-5 accent-[#003172]" /> Employee is active</label>
      <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2"><Button type="submit" disabled={!valid}>{employee ? 'Save employee changes' : 'Add employee'}</Button><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button></div>
    </form>
  );
}
