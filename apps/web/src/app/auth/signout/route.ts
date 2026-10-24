import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { deleteSession } from '@citescope/database';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const cookieStore = cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await deleteSession(token).catch(() => {});
  }
  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
