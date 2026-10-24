import { getDb } from '../client.js';

export interface AuthUser {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  last_sign_in_at: Date | null;
}

export interface AuthSession {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
  created_at: Date;
}

export async function createAuthUser(email: string, passwordHash: string): Promise<AuthUser> {
  const sql = getDb();
  const [user] = await sql<AuthUser[]>`
    INSERT INTO auth_users (email, password_hash) VALUES (${email.toLowerCase().trim()}, ${passwordHash})
    RETURNING *
  `;
  return user!;
}

export async function getAuthUserByEmail(email: string): Promise<AuthUser | null> {
  const sql = getDb();
  const rows = await sql<AuthUser[]>`
    SELECT * FROM auth_users WHERE email = ${email.toLowerCase().trim()} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getAuthUserById(id: string): Promise<AuthUser | null> {
  const sql = getDb();
  const rows = await sql<AuthUser[]>`SELECT * FROM auth_users WHERE id = ${id} LIMIT 1`;
  return rows[0] ?? null;
}

export async function createAuthSession(userId: string): Promise<AuthSession> {
  const sql = getDb();
  const [session] = await sql<AuthSession[]>`
    INSERT INTO auth_sessions (user_id) VALUES (${userId}) RETURNING *
  `;
  return session!;
}

export async function getSessionByToken(token: string): Promise<(AuthSession & { email: string }) | null> {
  const sql = getDb();
  const rows = await sql<(AuthSession & { email: string })[]>`
    SELECT s.*, u.email FROM auth_sessions s
    JOIN auth_users u ON u.id = s.user_id
    WHERE s.token = ${token} AND s.expires_at > NOW()
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function deleteSession(token: string): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM auth_sessions WHERE token = ${token}`;
}

export async function updateLastSignIn(userId: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE auth_users SET last_sign_in_at = NOW() WHERE id = ${userId}`;
}
