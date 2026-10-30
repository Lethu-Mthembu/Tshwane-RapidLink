import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

export const staffAuthConfigured = Boolean(url && publishableKey);
export const staffAuth = staffAuthConfigured
  ? createClient(url!, publishableKey!, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null;

export async function currentStaffSession(): Promise<Session | null> {
  if (!staffAuth) return null;
  const { data } = await staffAuth.auth.getSession();
  return data.session;
}

export async function staffAuthorizationHeaders(): Promise<Record<string, string>> {
  const session = await currentStaffSession();
  return session ? { authorization: `Bearer ${session.access_token}` } : {};
}

export async function signInStaff(email: string, password: string) {
  if (!staffAuth) throw new Error('Staff authentication is not configured.');
  const { data, error } = await staffAuth.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOutStaff() {
  if (staffAuth) await staffAuth.auth.signOut();
}

export async function changeStaffPassword(currentPassword: string, newPassword: string) {
  if (!staffAuth) throw new Error('Staff authentication is not configured.');
  const { error } = await staffAuth.auth.updateUser({
    current_password: currentPassword,
    password: newPassword,
  });
  if (error) throw error;
}
