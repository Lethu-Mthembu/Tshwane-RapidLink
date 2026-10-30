import { Building2, RefreshCw, Send, ShieldCheck, UserCog } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { useStaffAuth } from '@/features/auth/staff-auth-context';

interface StationScope { id: string; station_key: string; name: string; area: string; service: 'police' | 'ambulance' | 'fire' }
interface Account { id: string; role: 'admin' | 'supervisor' | 'responder'; station_service_id: string | null; email: string; active: boolean; created_at: string }
interface Invitation { id: string; role: string; station_service_id: string | null; email: string; expires_at: string }

export default function AdminPage() {
  const { session } = useStaffAuth();
  const [stations, setStations] = useState<StationScope[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [form, setForm] = useState({ role: 'supervisor' as 'admin' | 'supervisor', stationServiceId: '', email: '' });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const headers = useMemo<Record<string, string>>(() => session ? { authorization: `Bearer ${session.access_token}` } : {} as Record<string, string>, [session]);
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true); setError('');
    const [directoryResponse, invitationResponse] = await Promise.all([
      fetch('/api/staff/directory', { headers, cache: 'no-store' }),
      fetch('/api/staff/invitations', { headers, cache: 'no-store' }),
    ]).catch(() => [null, null] as const);
    if (!directoryResponse?.ok || !invitationResponse?.ok) setError('The staff directory could not be loaded.');
    else {
      const directory = await directoryResponse.json() as { stations: StationScope[]; accounts: Account[] };
      const pending = await invitationResponse.json() as { invitations: Invitation[] };
      setStations(directory.stations); setAccounts(directory.accounts); setInvitations(pending.invitations);
      if (!form.stationServiceId && directory.stations[0]) setForm((current) => ({ ...current, stationServiceId: directory.stations[0].id }));
    }
    setLoading(false);
  }, [form.stationServiceId, headers, session]);
  useEffect(() => { void load(); }, [load]);

  const invite = async (event: React.FormEvent) => {
    event.preventDefault(); setSending(true); setError(''); setStatus('');
    const response = await fetch('/api/staff/invitations', { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ ...form, stationServiceId: form.role === 'admin' ? undefined : form.stationServiceId }) }).catch(() => null);
    const body = response ? await response.json() as { message?: string } : null;
    if (!response?.ok) setError(body?.message ?? 'The invitation could not be sent.');
    else { setStatus(body?.message ?? 'Invitation sent.'); setForm((current) => ({ ...current, email: '' })); await load(); }
    setSending(false);
  };
  const scopeName = (id: string | null) => id ? stations.find((station) => station.id === id) : undefined;

  return <main className="min-h-[calc(100vh-4.5rem)] bg-slate-50 px-4 py-6 sm:px-6"><div className="mx-auto max-w-6xl">
    <header className="bg-[#003172] p-6 text-white shadow-[0_14px_38px_rgba(15,23,42,0.16)]"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-blue-100">Organisation administration</p><h1 className="mt-1 text-3xl font-black">Staff access control</h1><p className="mt-2 max-w-2xl text-blue-100">Create scoped supervisor invitations and additional administrator invitations. Responders are invited by their station/service supervisors.</p></div><ShieldCheck className="h-9 w-9 shrink-0" /></div></header>
    {error && <p className="mt-5 bg-red-50 p-4 font-semibold text-red-900" role="alert">{error}</p>}{status && <p className="mt-5 bg-emerald-50 p-4 font-semibold text-emerald-950" role="status">{status}</p>}
    <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
      <section className="bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.09)]"><h2 className="flex items-center gap-2 text-xl font-black text-[#003172]"><Send className="h-5 w-5" /> Send invitation</h2><form className="mt-5 space-y-4" onSubmit={(event) => void invite(event)}><label className="block font-bold text-slate-700">Account type<select className="mt-2 h-12 w-full border border-slate-300 px-3" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as 'admin' | 'supervisor' })}><option value="supervisor">Supervisor</option><option value="admin">Administrator</option></select></label>{form.role === 'supervisor' && <label className="block font-bold text-slate-700">Station and service<select className="mt-2 h-12 w-full border border-slate-300 px-3" value={form.stationServiceId} onChange={(event) => setForm({ ...form, stationServiceId: event.target.value })} required>{stations.map((station) => <option key={station.id} value={station.id}>{station.name} · {station.service}</option>)}</select></label>}<label className="block font-bold text-slate-700">Work email<input className="mt-2 h-12 w-full border border-slate-300 px-3" type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label><Button className="min-h-12 w-full" disabled={sending}>{sending ? 'Sending…' : 'Send email invitation'}</Button></form></section>
      <section className="bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.09)]"><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-black text-[#003172]"><UserCog className="h-5 w-5" /> Staff accounts</h2><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" /> Refresh</Button></div><div className="mt-4 space-y-3">{accounts.map((account) => { const scope = scopeName(account.station_service_id); return <article key={account.id} className="border-l-4 border-[#003172] bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-extrabold text-slate-950">{account.email}</p><p className="mt-1 text-sm font-semibold text-slate-600">{account.role}{scope ? ` · ${scope.name} · ${scope.service}` : ''}</p></div><span className="bg-white px-2 py-1 text-xs font-bold text-slate-700">{account.active ? 'Active' : 'Disabled'}</span></div></article>; })}{!loading && !accounts.length && <p className="py-8 text-center text-slate-600">No staff accounts exist yet.</p>}</div></section>
    </div>
    <section className="mt-6 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.09)]"><h2 className="flex items-center gap-2 text-xl font-black text-[#003172]"><Building2 className="h-5 w-5" /> Pending invitations</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{invitations.map((invitation) => { const scope = scopeName(invitation.station_service_id); return <article key={invitation.id} className="bg-slate-50 p-4"><p className="font-extrabold">{invitation.email}</p><p className="mt-1 text-sm text-slate-600">{invitation.role}{scope ? ` · ${scope.name} · ${scope.service}` : ''}</p><p className="mt-2 text-xs font-semibold text-slate-500">Expires {new Date(invitation.expires_at).toLocaleString()}</p></article>; })}{!invitations.length && <p className="text-slate-600">No pending invitations.</p>}</div></section>
  </div></main>;
}
