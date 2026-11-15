import { createClient } from '@supabase/supabase-js';
import type { AstroCookies } from 'astro';

const URL = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const AT = 'folio-at';
const RT = 'folio-rt';
const base = { auth: { persistSession: false, autoRefreshToken: false } };
const cookieOpts = (maxAge: number) => ({ httpOnly: true, secure: import.meta.env.PROD, sameSite: 'lax' as const, path: '/', maxAge });

export const anon = () => createClient(URL, KEY, base);
// Cliente que actúa con la identidad del usuario: RLS se aplica con su JWT.
export const asUser = (token: string) =>
  createClient(URL, KEY, { ...base, global: { headers: { Authorization: `Bearer ${token}` } } });

export function setSession(cookies: AstroCookies, s: { access_token: string; refresh_token: string }) {
  cookies.set(AT, s.access_token, cookieOpts(3600));
  cookies.set(RT, s.refresh_token, cookieOpts(60 * 60 * 24 * 30));
}
export function clearSession(cookies: AstroCookies) {
  cookies.delete(AT, { path: '/' });
  cookies.delete(RT, { path: '/' });
}

/** Devuelve el cliente admin solo si el token es válido Y el usuario está en `admins`. */
export async function resolveAdmin(cookies: AstroCookies) {
  let at = cookies.get(AT)?.value;
  const rt = cookies.get(RT)?.value;
  let user = null;
  if (at) user = (await anon().auth.getUser(at)).data.user;
  if (!user && rt) {
    const { data } = await anon().auth.refreshSession({ refresh_token: rt });
    if (data.session) { setSession(cookies, data.session); at = data.session.access_token; user = data.session.user; }
  }
  if (!user || !at) return null;
  const client = asUser(at);
  const { data: ok } = await client.rpc('is_admin');
  return ok === true ? { client, email: user.email ?? '' } : null;
}
