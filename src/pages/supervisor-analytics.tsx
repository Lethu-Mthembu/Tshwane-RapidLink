import { ArrowLeft, RadioTower } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useStaffAuth } from '@/features/auth/staff-auth-context';

interface Responder { id: string; active: boolean; availability: string; last_heartbeat_at?: string }
interface Attendance { responder_id: string; duty_date: string; choice: string; shift_start: string; shift_end: string; ended_at?: string }

export default function SupervisorAnalyticsPage() {
  const { identity, session } = useStaffAuth();
  const [responders, setResponders] = useState<Responder[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [error, setError] = useState('');
  const headers = useMemo<Record<string, string>>(() => session ? { authorization: `Bearer ${session.access_token}` } : {} as Record<string, string>, [session]);
  useEffect(() => { if (!session) return; void fetch('/api/staff/directory', { headers, cache: 'no-store' }).then(async (response) => { if (!response.ok) throw new Error(); const body = await response.json() as { responders: Responder[]; attendance: Attendance[] }; setResponders(body.responders); setAttendance(body.attendance); }).catch(() => setError('Operational data could not be loaded.')); }, [headers, session]);
  const now = Date.now();
  const onDuty = (id: string) => attendance.some((entry) => entry.responder_id === id && entry.choice === 'present' && !entry.ended_at && Date.parse(entry.shift_start) <= now && Date.parse(entry.shift_end) > now);
  const available = responders.filter((responder) => responder.active && responder.availability === 'available' && onDuty(responder.id)).length;
  const unavailable = responders.filter((responder) => responder.active && onDuty(responder.id) && responder.availability !== 'available').length;
  const recentlyConnected = responders.filter((responder) => responder.last_heartbeat_at && now - Date.parse(responder.last_heartbeat_at) < 2 * 60_000).length;
  return <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-6"><div className="mx-auto max-w-5xl"><Button asChild variant="ghost"><Link to="/supervisor"><ArrowLeft className="h-4 w-4" /> Back to responders</Link></Button><header className="mt-4 bg-[#003172] p-6 text-white shadow-[0_12px_34px_rgba(15,23,42,0.14)]"><RadioTower className="h-8 w-8" /><h1 className="mt-3 text-3xl font-black">Operational readiness</h1><p className="mt-2 text-blue-100">{identity?.stationName} · <span className="capitalize">{identity?.service}</span></p></header>{error && <p className="mt-4 bg-red-50 p-4 font-semibold text-red-900" role="alert">{error}</p>}<section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[{label:'Registered responders',value:responders.length},{label:'Available now',value:available},{label:'On duty but unavailable',value:unavailable},{label:'Recently connected',value:recentlyConnected}].map((metric) => <article key={metric.label} className="bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]"><p className="text-3xl font-black text-[#003172]">{metric.value}</p><p className="mt-2 font-semibold text-slate-600">{metric.label}</p></article>)}</section><section className="mt-6 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)]"><h2 className="text-xl font-black text-[#003172]">Data boundary</h2><p className="mt-2 leading-7 text-slate-700">This dashboard intentionally exposes responder readiness and aggregate operational counts only. Client identity, location, incident descriptions and attachments are restricted to the assigned responder workflow.</p></section></div></main>;
}
