import { timingSafeEqual } from 'node:crypto';

import { getSupabaseServerUrl, serviceRequestHeaders } from '../../src/lib/auth-server.js';
import { supabaseConfigured } from '../../src/lib/supabase-server.js';
import { bodyAs, methodNotAllowed, type ApiRequest, type ApiResponse } from '../../src/lib/vercel-api.js';

interface BootstrapBody { email?: string; password?: string; bootstrapSecret?: string }
interface OrganisationRow { id: string }

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== 'POST') return methodNotAllowed(response, 'POST');
  if (!supabaseConfigured) return response.status(503).json({ message: 'Staff authentication is not configured.' });
  const body = bodyAs<BootstrapBody>(request);
  const configuredSecret = process.env.RAPIDLINK_BOOTSTRAP_SECRET ?? '';
  if (!body?.bootstrapSecret || !configuredSecret || !safeEqual(body.bootstrapSecret, configuredSecret)) return response.status(403).json({ message: 'Invalid bootstrap secret.' });
  const email = body.email?.trim().toLowerCase() ?? '';
  if (!email || !body.password || body.password.length < 12) return response.status(400).json({ message: 'A valid email and 12-character password are required.' });
  const url = getSupabaseServerUrl();
  if (!url) return response.status(503).json({ message: 'Staff authentication is not configured.' });
  const existing = await fetch(`${url}/rest/v1/rapidlink_staff_accounts?role=eq.admin&active=eq.true&select=id&limit=1`, { headers: serviceRequestHeaders(), cache: 'no-store' });
  if (!existing.ok) return response.status(502).json({ message: 'Administrator access could not be checked.' });
  if ((await existing.json() as unknown[]).length) return response.status(409).json({ message: 'Initial administrator setup has already been completed.' });
  const organisationResponse = await fetch(`${url}/rest/v1/rapidlink_organisations?slug=eq.tshwane-rapidlink&active=eq.true&select=id&limit=1`, { headers: serviceRequestHeaders(), cache: 'no-store' });
  const organisation = organisationResponse.ok ? (await organisationResponse.json() as OrganisationRow[])[0] : undefined;
  if (!organisation) return response.status(503).json({ message: 'RapidLink organisation setup is incomplete.' });
  const created = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify({ email, password: body.password, email_confirm: true, app_metadata: { rapidlink_role: 'staff' } }),
  });
  if (!created.ok) return response.status(400).json({ message: 'The administrator account could not be created.' });
  const user = await created.json() as { id: string };
  const membership = await fetch(`${url}/rest/v1/rapidlink_staff_accounts`, {
    method: 'POST',
    headers: serviceRequestHeaders({ 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify({ organisation_id: organisation.id, auth_user_id: user.id, role: 'admin', email }),
  });
  if (!membership.ok) {
    await fetch(`${url}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: serviceRequestHeaders() });
    return response.status(502).json({ message: 'Administrator access could not be attached. No account was retained.' });
  }
  return response.status(201).json({ message: 'Initial administrator access created.' });
}
