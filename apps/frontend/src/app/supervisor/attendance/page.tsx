'use client';

import { ArrowLeft, Clock3, History } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ServiceNotice } from '@/components/service-notice';
import { Button } from '@/components/ui/button';
import { useEmergency } from '@/features/emergency/emergency-context';
import { employeeBusy, employeeDuty, mockEmergencyService } from '@/features/emergency/mock-service';
import type { AttendanceChoice } from '@/features/emergency/types';

const STATION_ID = 'station-central';
const localInputValue = (iso: string) => {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export default function AttendancePage() {
  const { state, refresh } = useEmergency();
  const [notice, setNotice] = useState('');
  const employees = state.employees.filter((item) => item.stationId === STATION_ID && item.active);
  const latestByEmployee = useMemo(
    () => Object.fromEntries(employees.map((employee) => [employee.id, state.attendance.filter((entry) => entry.employeeId === employee.id).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]])),
    [employees, state.attendance],
  );
  const [edits, setEdits] = useState<Record<string, { choice: AttendanceChoice; start: string; end: string }>>({});

  const row = (employeeId: string) => {
    const entry = latestByEmployee[employeeId];
    return edits[employeeId] ?? {
      choice: entry?.choice ?? 'absent',
      start: localInputValue(entry?.shiftStart ?? new Date().toISOString()),
      end: localInputValue(entry?.shiftEnd ?? new Date(Date.now() + 8 * 60 * 60_000).toISOString()),
    };
  };

  const save = (employeeId: string) => {
    const value = row(employeeId);
    if (Date.parse(value.end) <= Date.parse(value.start)) {
      setNotice('Shift end must be after shift start. Shifts crossing midnight need the next calendar date.');
      return;
    }
    mockEmergencyService.saveAttendance({ employeeId, date: value.start.slice(0, 10), shiftStart: new Date(value.start).toISOString(), shiftEnd: new Date(value.end).toISOString(), choice: value.choice });
    refresh();
    setNotice('Attendance saved.');
  };

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-white">
      <ServiceNotice />
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
        <header className="pb-6"><Link href="/supervisor" className="inline-flex min-h-11 items-center gap-2 font-bold text-[#003172]"><ArrowLeft className="h-4 w-4" /> Employee management</Link><h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#003172]">Daily attendance</h1><p className="mt-2 text-base text-slate-700">Supervisors record attendance. Employees do not sign themselves on.</p></header>
        {notice && <div className="mt-5 border-l-4 border-[#003172] bg-blue-50 p-3 font-bold text-[#003172]" role="status">{notice}</div>}
        <div className="elevated-surface mt-6 overflow-x-auto bg-white sm:rounded-2xl">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="bg-[#003172] text-white"><tr><th className="p-4">Employee</th><th className="p-4">Attendance</th><th className="p-4">Shift start</th><th className="p-4">Shift end</th><th className="p-4">Duty / response</th><th className="p-4">Actions</th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {employees.map((employee) => {
                const value = row(employee.id);
                const active = employeeDuty(state, employee.id);
                const busy = employeeBusy(state, employee.id);
                return <tr key={employee.id} className="align-top"><td className="p-4"><p className="font-extrabold">{employee.name} {employee.surname}</p><p className="mt-1 font-semibold text-slate-500">{employee.employeeNumber}</p></td><td className="p-4"><select aria-label={`Attendance for ${employee.name} ${employee.surname}`} value={value.choice} onChange={(event) => setEdits({ ...edits, [employee.id]: { ...value, choice: event.target.value as AttendanceChoice } })} className="h-11 rounded-lg border border-slate-300 px-3 text-base"><option value="present">Present</option><option value="absent">Absent</option><option value="leave">On leave</option></select></td><td className="p-4"><input aria-label={`Shift start for ${employee.name}`} type="datetime-local" value={value.start} onChange={(event) => setEdits({ ...edits, [employee.id]: { ...value, start: event.target.value } })} className="h-11 rounded-lg border border-slate-300 px-3 text-base" /></td><td className="p-4"><input aria-label={`Shift end for ${employee.name}`} type="datetime-local" value={value.end} onChange={(event) => setEdits({ ...edits, [employee.id]: { ...value, end: event.target.value } })} className="h-11 rounded-lg border border-slate-300 px-3 text-base" /></td><td className="p-4"><span className={`inline-flex rounded-full px-2.5 py-1 font-bold ${!active ? 'bg-slate-100 text-slate-700' : busy ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{!active ? 'Off duty' : busy ? 'On duty · busy' : 'On duty · available'}</span>{busy && <p className="mt-2 max-w-48 text-xs font-semibold text-slate-600">Ending the shift will not remove the active assignment.</p>}</td><td className="p-4"><div className="flex gap-2"><Button size="sm" onClick={() => save(employee.id)}>Save / correct</Button><Button size="sm" variant="outline" disabled={!active} onClick={() => { mockEmergencyService.endShift(employee.id); refresh(); setNotice('Shift ended. Any active assignment remains attached.'); }}>End shift</Button></div></td></tr>;
              })}
            </tbody>
          </table>
        </div>

        <section className="mt-8" aria-labelledby="history-heading"><h2 id="history-heading" className="flex items-center gap-2 text-xl font-extrabold text-[#003172]"><History className="h-5 w-5" /> Change history</h2><div className="elevated-surface mt-3 divide-y divide-slate-100 rounded-2xl bg-white px-5">{state.attendance.slice().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 12).map((entry) => { const employee = state.employees.find((item) => item.id === entry.employeeId); return <div key={`${entry.id}-${entry.updatedAt}`} className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_auto]"><p><strong>{employee?.name} {employee?.surname}</strong> · {entry.choice === 'leave' ? 'On leave' : entry.choice}</p><p className="flex items-center gap-2 text-slate-600"><Clock3 className="h-4 w-4" /> {new Date(entry.updatedAt).toLocaleString()} · {entry.updatedBy}</p></div>; })}</div></section>
      </div>
    </main>
  );
}
