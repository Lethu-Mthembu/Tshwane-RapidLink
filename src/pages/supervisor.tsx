import { BarChart3, CalendarCheck, Search, Send, ShieldCheck, UserRound, UserX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AccessibleModal } from '@/components/accessible-modal';
import { Button } from '@/components/ui/button';
import { useStaffAuth } from '@/features/auth/staff-auth-context';

interface ResponderRow {
  id: string; employee_number: string; name: string; surname: string; phone: string; active: boolean;
  availability: 'available' | 'temporarily_unavailable'; availability_reason?: string; last_heartbeat_at?: string;
}
interface AttendanceRow { responder_id: string; choice: 'present' | 'absent' | 'leave'; shift_start: string; shift_end: string; ended_at?: string }

export default function SupervisorPage() {
  const { identity, session } = useStaffAuth();
  const [responders, setResponders] = useState<ResponderRow[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [query, setQuery] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ employeeNumber: '', name: '', surname: '', phone: '', email: '' });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const authHeaders = useMemo<Record<string, string>>(() => session ? { authorization: `Bearer ${session.access_token}` } : {} as Record<string, string>, [session]);
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError('');
    const response = await fetch('/api/staff/directory', { headers: authHeaders, cache: 'no-store' }).catch(() => null);
    if (!response?.ok) setError('The station responder directory could not be loaded.');
    else { const body = await response.json() as { responders: ResponderRow[]; attendance: AttendanceRow[] }; setResponders(body.responders); setAttendance(body.attendance); }
    setLoading(false);
  }, [authHeaders, session]);
  useEffect(() => { void load(); }, [load]);
  const activeAttendance = (id: string) => attendance.find((entry) => entry.responder_id === id && entry.choice === 'present' && !entry.ended_at && Date.parse(entry.shift_start) <= Date.now() && Date.parse(entry.shift_end) > Date.now());
  const status = (responder: ResponderRow) => !responder.active ? 'Disabled' : !activeAttendance(responder.id) ? 'Off duty' : responder.availability !== 'available' ? 'Unavailable' : 'Available';
  const visible = responders.filter((responder) => `${responder.name} ${responder.surname} ${responder.employee_number}`.toLowerCase().includes(query.toLowerCase()));
  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setSending(true); setError(''); setNotice('');
    const response = await fetch('/api/staff/invitations', { method: 'POST', headers: { ...authHeaders, 'content-type': 'application/json' }, body: JSON.stringify({ role: 'responder', ...form }) }).catch(() => null);
    const body = response ? await response.json() as { message?: string } : null;
    if (!response?.ok) setError(body?.message ?? 'The responder invitation could not be sent.');
    else { setNotice(body?.message ?? 'Invitation sent.'); setInviteOpen(false); setForm({ employeeNumber: '', name: '', surname: '', phone: '', email: '' }); }
    setSending(false);
  };
  const onDuty = responders.filter((responder) => activeAttendance(responder.id)).length;
  const available = responders.filter((responder) => status(responder) === 'Available').length;

  return <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50"><div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
    <header className="bg-white shadow-[0_14px_38px_rgba(15,23,42,0.09)]"><div className="flex items-start gap-3 p-6"><span className="grid h-11 w-11 place-items-center bg-blue-50 text-[#003172]"><ShieldCheck className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-semibold text-slate-500">Supervisor</p><h1 className="text-2xl font-black text-[#003172]">{identity?.stationName}</h1><p className="mt-1 font-bold capitalize text-slate-600">{identity?.service} service</p></div></div><div className="grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-3 text-center"><div><p className="text-xl font-black text-[#003172]">{responders.length}</p><p className="text-xs font-bold text-slate-500">Responders</p></div><div><p className="text-xl font-black text-[#003172]">{onDuty}</p><p className="text-xs font-bold text-slate-500">On duty</p></div><div><p className="text-xl font-black text-emerald-700">{available}</p><p className="text-xs font-bold text-slate-500">Available</p></div></div><div className="grid gap-2 p-4 sm:flex sm:justify-end"><Button onClick={() => setInviteOpen(true)}><Send className="h-4 w-4" /> Invite responder</Button><Button asChild variant="outline"><Link to="/supervisor/attendance"><CalendarCheck className="h-4 w-4" /> Attendance</Link></Button><Button asChild variant="outline"><Link to="/supervisor/analytics"><BarChart3 className="h-4 w-4" /> Operations</Link></Button></div></header>
    {error && <p className="mt-5 bg-red-50 p-4 font-semibold text-red-900" role="alert">{error}</p>}{notice && <p className="mt-5 bg-emerald-50 p-4 font-semibold text-emerald-950" role="status">{notice}</p>}
    <section className="mt-6"><h2 className="text-xl font-black text-[#003172]">Station responders</h2><label className="relative mt-4 block"><span className="sr-only">Search responders</span><Search className="absolute left-3 top-3.5 h-5 w-5 text-slate-400" /><input className="h-12 w-full bg-white pl-11 pr-3 shadow-[0_6px_20px_rgba(15,23,42,0.07)] outline-none focus:ring-4 focus:ring-blue-100" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or employee number" /></label><div className="mt-4 grid gap-3 md:grid-cols-2">{visible.map((responder) => { const label = status(responder); return <article key={responder.id} className="bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.07)]"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center bg-blue-50 text-[#003172]"><UserRound className="h-5 w-5" /></span><div className="min-w-0 flex-1"><h3 className="font-extrabold text-slate-950">{responder.name} {responder.surname}</h3><p className="text-sm font-semibold text-slate-500">{responder.employee_number}</p></div><span className={`px-2.5 py-1 text-xs font-bold ${label === 'Available' ? 'bg-emerald-100 text-emerald-900' : 'bg-slate-100 text-slate-700'}`}>{label}</span></div><a href={`tel:${responder.phone}`} className="mt-4 inline-block font-semibold text-[#003172]">{responder.phone}</a>{responder.availability_reason && <p className="mt-2 text-sm text-slate-600">{responder.availability_reason}</p>}</article>; })}</div>{!loading && !visible.length && <div className="mt-4 bg-white px-5 py-10 text-center shadow-[0_8px_24px_rgba(15,23,42,0.07)]"><UserX className="mx-auto h-7 w-7 text-slate-500" /><p className="mt-3 font-extrabold">No responders found</p><p className="mt-1 text-slate-600">Responders only appear after accepting an invitation.</p></div>}</section>
  </div><AccessibleModal open={inviteOpen} title="Invite responder" description={`The responder will be restricted to ${identity?.stationName ?? 'this station'} · ${identity?.service ?? 'this service'}. No responder record is created until the invitation is accepted.`} onClose={() => setInviteOpen(false)}><form className="space-y-4" onSubmit={(event) => void invite(event)}>{(['employeeNumber','name','surname','phone','email'] as const).map((field) => <label key={field} className="block font-bold capitalize text-slate-700">{field === 'employeeNumber' ? 'Employee number' : field}<input type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'} className="mt-2 h-12 w-full border border-slate-300 px-3" value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} required /></label>)}<Button className="min-h-12 w-full" disabled={sending}>{sending ? 'Sending…' : 'Send email invitation'}</Button></form></AccessibleModal></main>;
}
