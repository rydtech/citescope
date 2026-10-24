import { redirect } from 'next/navigation';
import { isPlatformAdmin } from '@citescope/database';
import { getSession } from './auth';

export async function requirePlatformAdmin() {
  const session = await getSession();
  if (!session) redirect('/auth/login');
  const isAdmin = await isPlatformAdmin(session.user_id);
  if (!isAdmin) redirect('/403');
  return { id: session.user_id, email: session.email };
}
