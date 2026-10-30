import { ArrowLeft, CalendarCheck } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useStaffAuth } from '@/features/auth/staff-auth-context';

interface Responder { id: string; employee_number: string; name: string; surname: string }
interface Attendance { id: string; responder_id: string; duty_date: string; shift_start: string; shift_end: string; choice: 'present' | 'absent' | 'leave'; ended_at?: string }

export default function AttendancePage() {
  const { session, identity } = useStaffAuth();
  const [responders, setResponders] = useState<Responder[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const headers = useMemo<Record<string, string>>(() => session ? { authorization: `Bearer ${session.access_token}` } : {} as Record<string, string>, [session]);
  const load = useCallback(async () => {
    if (!session) return;
    const response = await fetch('/api/staff/directory', { headers, cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return setError('Attendance data could not be loaded.');
    const body = await response.json() as { responders: Responder[]; attendance: Attendance[] };
    setResponders(body.responders);
    setAttendance(body.attendance);
  }, [headers, session]);
  useEffect(() => { void load(); }, [load]);
  const today = new Date().toISOString().slice(0, 10);
  const latest = (id: string) => attendance.find((entry) => entry.responder_id === id && entry.duty_date === today);
  const save = async (responderId: string, choice: Attendance['choice']) => {
    setSaving(responderId); setError(''); setMessage('');
    const start = new Date(); start.setHours(6, 0, 0, 0);
    const end = new Date(); end.setHours(18, 0, 0, 0);
    const response = await fetch('/api/staff/attendance', {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ responderId, date: today, shiftStart: start.toISOString(), shiftEnd: end.toISOString(), choice }),
    }).catch(() => null);
    const body = response ? await response.json() as { message?: string } : null;
    if (!response?.ok) setError(body?.message ?? 'Attendance could not be saved.');
    else { setMessage('Attendance saved.'); await load(); }
    setSaving('');
  };
  return <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-6"><div className="mx-auto max-w-4xl">
    <Button asChild variant="ghost"><Link to="/supervisor"><ArrowLeft className="h-4 w-4" /> Back to responders</Link></Button>
    <header className="mt-4 bg-white p-6 shadow-[0_12px_34px_rgba(15,23,42,0.09)]"><CalendarCheck className="h-7 w-7 text-[#003172]" /><h1 className="mt-3 text-3xl font-black text-[#003172]">Attendance</h1><p className="mt-2 font-semibold text-slate-600">{identity?.stationName} · <span className="capitalize">{identity?.service}</span> · {today}</p></header>
    {error && <p className="mt-4 bg-red-50 p-4 font-semibold text-red-900" role="alert">{error}</p>}{message && <p className="mt-4 bg-emerald-50 p-4 font-semibold text-emerald-950" role="status">{message}</p>}
    <section className="mt-5 space-y-3">{responders.map((responder) => { const entry = latest(responder.id); return <article key={responder.id} className="bg-white p-4 shadow-[0_7px_22px_rgba(15,23,42,0.07)] sm:flex sm:items-center sm:justify-between"><div><h2 className="font-extrabold">{responder.name} {responder.surname}</h2><p className="text-sm font-semibold text-slate-500">{responder.employee_number} · {entry?.choice ?? 'Not recorded'}</p></div><div className="mt-3 grid grid-cols-3 gap-2 sm:mt-0">{(['present', 'absent', 'leave'] as const).map((choice) => <Button key={choice} size="sm" variant={entry?.choice === choice ? 'primary' : 'outline'} onClick={() => void save(responder.id, choice)} disabled={saving === responder.id} className="capitalize">{choice}</Button>)}</div></article>; })}{!responders.length && <p className="bg-white p-8 text-center text-slate-600">No responders have accepted invitations for this station/service.</p>}</section>
  </div></main>;
}
