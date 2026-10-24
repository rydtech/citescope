import postgres from 'postgres';

let _sql: ReturnType<typeof postgres> | null = null;

export function getDb(connectionString?: string): ReturnType<typeof postgres> {
  if (!_sql) {
    const url = connectionString ?? process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    _sql = postgres(url, {
      max: 10,
      idle_timeout: 30,
      connect_timeout: 10,
    });
  }
  return _sql;
}

export async function closeDb(): Promise<void> {
  if (_sql) {
    await _sql.end();
    _sql = null;
  }
}
