import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createAuthUser, createAuthSession } from '@citescope/database';
import { SESSION_COOKIE } from '@/lib/auth';
import { getClientIp, checkRateLimit } from '@/lib/rate-limit';

const SignupSchema = z.object({
  email: z.string().email('Invalid email format').max(256, 'Email must not exceed 256 characters'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
});

export async function POST(req: NextRequest) {
  // Rate limiting — uses the shared bounded limiter; IP is sourced from the actual
  // connection (req.ip) rather than a spoofable X-Forwarded-For header.
  const ip = getClientIp(req);
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const rawBody = await req.json().catch(() => null);
  const parsed = SignupSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid request' }, { status: 400 });
  }
  const body = parsed.data;

  const passwordHash = await bcrypt.hash(body.password, 12);

  let user;
  try {
    user = await createAuthUser(body.email, passwordHash);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }

  const session = await createAuthSession(user.id);

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
