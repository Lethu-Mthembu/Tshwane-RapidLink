import { ArrowLeft, CalendarCheck, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { serviceLabel } from '@/features/emergency/config';
import { useEmergency } from '@/features/emergency/emergency-context';
import { employeeBusy, employeeDuty, sessionService } from '@/features/emergency/session-service';
import type { AttendanceChoice } from '@/features/emergency/types';

const STATION_ID = 'station-garankuwa';
const inputClass = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-[#003172] focus:ring-4 focus:ring-blue-100';

const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const timeValue = (iso: string) => {
  const value = new Date(iso);
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
};

const localIso = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();

export default function AttendancePage() {
  const { state, online, refresh } = useEmergency();
  const station = state.stations.find((item) => item.id === STATION_ID);
  const today = localDateKey();
  const [notice, setNotice] = useState('');
  const [defaults] = useState(() => {
    const start = new Date();
    const end = new Date(start.getTime() + 8 * 60 * 60_000);
    return { start: timeValue(start.toISOString()), end: timeValue(end.toISOString()) };
  });
  const employees = useMemo(
    () => state.employees.filter((item) => item.stationId === STATION_ID && item.active),
    [state.employees],
  );
  const todayByEmployee = useMemo(
    () => Object.fromEntries(employees.map((employee) => [
      employee.id,
      state.attendance.find((entry) => entry.employeeId === employee.id && entry.date === today),
    ])),
    [employees, state.attendance, today],
  );
  const [edits, setEdits] = useState<Record<string, { choice: AttendanceChoice; start: string; end: string }>>({});

  const row = (employeeId: string) => {
    const entry = todayByEmployee[employeeId];
    return edits[employeeId] ?? {
      choice: entry?.choice ?? 'absent',
      start: entry ? timeValue(entry.shiftStart) : defaults.start,
      end: entry ? timeValue(entry.shiftEnd) : defaults.end,
    };
  };

  const save = (employeeId: string) => {
    const value = row(employeeId);
    const shiftStart = localIso(today, value.start);
    const shiftEnd = localIso(today, value.end);
    if (value.choice === 'present' && Date.parse(shiftEnd) <= Date.parse(shiftStart)) {
      setNotice('Shift end must be after shift start.');
      return;
    }
    sessionService.saveAttendance({ employeeId, date: today, shiftStart, shiftEnd, choice: value.choice });
    refresh();
    setNotice('Attendance saved.');
  };

  const endShift = (employeeId: string) => {
    sessionService.endShift(employeeId);
    refresh();
    setNotice('Shift ended.');
  };

  const onDutyCount = employees.filter((employee) => employeeDuty(state, employee.id)).length;
  const respondingCount = employees.filter((employee) => employeeDuty(state, employee.id) && employeeBusy(state, employee.id)).length;
  const availableCount = onDutyCount - respondingCount;
  const noticeIsError = notice.startsWith('Shift end');

  return (
    <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50">
      {!online && <div className="bg-amber-700 px-4 py-2.5 text-center text-sm font-semibold text-white" role="status">Offline · updates are saved on this device.</div>}
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <Link to="/supervisor" className="inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#003172] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200"><ArrowLeft className="h-4 w-4" /> Station team</Link>

        <header className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_14px_38px_rgba(15,23,42,0.08)]">
          <div className="flex items-start gap-3 p-5 sm:p-6">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#003172]"><CalendarCheck className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Supervisor</p><h1 className="mt-0.5 text-2xl font-black tracking-tight text-[#003172] sm:text-3xl">Attendance</h1><p className="mt-1 truncate text-sm font-semibold text-slate-500">{station?.name} · {new Date().toLocaleDateString()}</p></div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-100 bg-slate-50/80 py-3 text-center">
            <div className="px-2"><p className="text-xl font-black text-[#003172]">{onDutyCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">On duty</p></div>
            <div className="px-2"><p className="text-xl font-black text-emerald-700">{availableCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Available</p></div>
            <div className="px-2"><p className="text-xl font-black text-amber-700">{respondingCount}</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Responding</p></div>
          </div>
        </header>

        {notice && <div className={`mt-4 rounded-xl p-3 text-sm font-bold ${noticeIsError ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-[#003172]'}`} role={noticeIsError ? 'alert' : 'status'}>{notice}</div>}

        <section className="mt-6 pb-4" aria-labelledby="attendance-heading">
          <div><h2 id="attendance-heading" className="text-lg font-bold text-[#003172]">Today’s roster</h2><p className="mt-0.5 text-xs font-semibold text-slate-500">Only on-duty responders receive new requests.</p></div>

          <div className="mt-4 space-y-3 lg:hidden">
            {employees.map((employee) => {
              const value = row(employee.id);
              const onDuty = employeeDuty(state, employee.id);
              const busy = employeeBusy(state, employee.id);
              const dispatchLabel = !onDuty ? 'Off duty' : busy ? 'Responding' : 'Available';
              const dispatchClasses = !onDuty ? 'bg-slate-100 text-slate-700' : busy ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900';
              return (
                <article key={employee.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#003172]"><UserRound className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1"><h3 className="font-extrabold text-slate-950">{employee.name} {employee.surname}</h3><p className="text-xs font-semibold text-slate-500">{employee.employeeNumber} · {serviceLabel(employee.service)}</p></div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${dispatchClasses}`}>{dispatchLabel}</span>
                  </div>
                  <label className="mt-4 block text-xs font-bold text-slate-600" htmlFor={`attendance-${employee.id}`}>Today</label>
                  <select id={`attendance-${employee.id}`} aria-label={`Attendance for ${employee.name} ${employee.surname}`} value={value.choice} onChange={(event) => setEdits({ ...edits, [employee.id]: { ...value, choice: event.target.value as AttendanceChoice } })} className={`${inputClass} mt-1.5`}><option value="present">On duty</option><option value="absent">Absent</option><option value="leave">On leave</option></select>
                  {value.choice === 'present' && <div className="mt-4 grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-600">Starts<input aria-label={`Shift start for ${employee.name}`} type="time" value={value.start} onChange={(event) => setEdits({ ...edits, [employee.id]: { ...value, start: event.target.value } })} className={`${inputClass} mt-1.5`} /></label><label className="text-xs font-bold text-slate-600">Ends<input aria-label={`Shift end for ${employee.name}`} type="time" value={value.end} onChange={(event) => setEdits({ ...edits, [employee.id]: { ...value, end: event.target.value } })} className={`${inputClass} mt-1.5`} /></label></div>}
                  <div className="mt-4 grid grid-cols-2 gap-2"><Button className="min-h-11" aria-label={`Save attendance for ${employee.name}`} onClick={() => save(employee.id)}>Save</Button><Button variant="outline" className="min-h-11" disabled={!onDuty} onClick={() => endShift(employee.id)}>End shift</Button></div>
                </article>
              );
            })}
          </div>

          <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.06)] lg:block">
            <table className="w-full min-w-[940px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Responder</th><th className="px-4 py-3">Service</th><th className="px-4 py-3">Today</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Dispatch status</th><th className="px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((employee) => {
                  const value = row(employee.id);
                  const onDuty = employeeDuty(state, employee.id);
                  const busy = employeeBusy(state, employee.id);
                  const dispatchLabel = !onDuty ? 'Off duty' : busy ? 'Responding' : 'Available';
                  const dispatchClasses = !onDuty ? 'bg-slate-100 text-slate-700' : busy ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900';
                  return (
                    <tr key={employee.id} className="align-middle">
                      <td className="px-4 py-4"><p className="font-extrabold text-slate-950">{employee.name} {employee.surname}</p><p className="mt-0.5 text-xs font-semibold text-slate-500">{employee.employeeNumber}</p></td>
                      <td className="px-4 py-4 font-bold text-slate-700">{serviceLabel(employee.service)}</td>
                      <td className="px-4 py-4"><select aria-label={`Attendance for ${employee.name} ${employee.surname}`} value={value.choice} onChange={(event) => setEdits({ ...edits, [employee.id]: { ...value, choice: event.target.value as AttendanceChoice } })} className={inputClass}><option value="present">On duty</option><option value="absent">Absent</option><option value="leave">On leave</option></select></td>
                      <td className="px-4 py-4">{value.choice === 'present' ? <div className="flex min-w-[230px] items-center gap-2"><input aria-label={`Shift start for ${employee.name}`} type="time" value={value.start} onChange={(event) => setEdits({ ...edits, [employee.id]: { ...value, start: event.target.value } })} className={inputClass} /><span className="text-slate-400">to</span><input aria-label={`Shift end for ${employee.name}`} type="time" value={value.end} onChange={(event) => setEdits({ ...edits, [employee.id]: { ...value, end: event.target.value } })} className={inputClass} /></div> : <span className="font-semibold text-slate-400">Not applicable</span>}</td>
                      <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${dispatchClasses}`}>{dispatchLabel}</span></td>
                      <td className="px-4 py-4"><div className="flex justify-end gap-2"><Button size="sm" aria-label={`Save attendance for ${employee.name}`} onClick={() => save(employee.id)}>Save</Button><Button size="sm" variant="outline" disabled={!onDuty} onClick={() => endShift(employee.id)}>End shift</Button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
