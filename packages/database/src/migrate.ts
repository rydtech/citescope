import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  const sql = getDb();

  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const migDir = join(__dirname, 'migrations');
  // Only discover numbered migration files (NNN_*.sql). Test fixtures, verify scripts,
  // and other SQL files in this directory must not be executed as migrations.
  const files = readdirSync(migDir)
    .filter(f => /^\d{3}_.*\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const applied = await sql`SELECT 1 FROM _migrations WHERE filename = ${file}`;
    if (applied.length > 0) {
      console.log(`[migrate] Skipping ${file} (already applied)`);
      continue;
    }
    const sqlText = readFileSync(join(migDir, file), 'utf8');
    console.log(`[migrate] Applying ${file}...`);
    await sql.begin(async (tx) => {
      await tx.unsafe(sqlText);
      await tx`INSERT INTO _migrations (filename) VALUES (${file})`;
    });
    console.log(`[migrate] Applied ${file}`);
  }

  await closeDb();
  console.log('[migrate] Done');
}

migrate().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
