import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { getAuthUserByEmail, createAuthSession, updateLastSignIn } from '@citescope/database';
import { SESSION_COOKIE } from '@/lib/auth';
import { getClientIp, checkRateLimit } from '@/lib/rate-limit';

const LoginSchema = z.object({
  email: z.string().email('Invalid email format').max(256, 'Email must not exceed 256 characters'),
  password: z.string().min(1, 'Password is required').max(128, 'Password must not exceed 128 characters'),
});

export async function POST(req: NextRequest) {
  // Rate limiting — uses the shared bounded limiter; IP is sourced from the actual
  // connection (req.ip) rather than a spoofable X-Forwarded-For header.
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
  }
  const body = parsed.data;

  const user = await getAuthUserByEmail(body.email).catch(() => null);
  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const valid = await bcrypt.compare(body.password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const session = await createAuthSession(user.id);
  await updateLastSignIn(user.id);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: session.expires_at,
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
