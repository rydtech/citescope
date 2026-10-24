import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionByToken } from '@citescope/database';

const SESSION_COOKIE = 'cs_session';

export async function getSession() {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionByToken(token).catch(() => null);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) redirect('/auth/login');
  return { id: session.user_id, email: session.email };
}

export { SESSION_COOKIE };
