#!/usr/bin/env tsx
/**
 * First-admin provisioning script.
 *
 * Usage:
 *   ADMIN_BOOTSTRAP_SECRET=<secret> DATABASE_URL=<url> tsx scripts/provision-admin.ts
 *
 * This script is the ONLY way to create the first platform administrator.
 * It requires ADMIN_BOOTSTRAP_SECRET to match the env var set during deployment.
 * Never expose this script through a public HTTP endpoint.
 */

import { createInterface } from 'node:readline';

const secret = process.env.ADMIN_BOOTSTRAP_SECRET;
if (!secret) {
  console.error('ERROR: ADMIN_BOOTSTRAP_SECRET environment variable is not set.');
  process.exit(1);
}

const providedSecret = process.argv[2];
if (!providedSecret || providedSecret !== secret) {
  console.error('ERROR: Incorrect bootstrap secret. Aborting.');
  process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
function prompt(q: string): Promise<string> {
  return new Promise(resolve => rl.question(q, resolve));
}

async function main() {
  console.log('\n=== CiteScope Platform Admin Provisioning ===\n');
  console.log('WARNING: This creates a privileged platform administrator.');
  console.log('Verify the identity of the user before proceeding.\n');

  const userId = await prompt('Enter Supabase user ID (UUID): ');
  const userEmail = await prompt('Enter user email: ');
  const confirm = await prompt(`Grant admin to ${userEmail} (${userId})? [yes/no]: `);

  if (confirm.trim().toLowerCase() !== 'yes') {
    console.log('Aborted.');
    rl.close();
    return;
  }

  // Dynamic import to avoid loading DB before validation
  const { getDb, grantPlatformAdmin, closeDb } = await import('../packages/database/src/index.js');
  const sql = getDb();

  // Verify user exists in Supabase (workspace_memberships as proxy)
  // In production, verify against Supabase auth.users
  console.log('\nGranting platform admin...');

  const grant = await grantPlatformAdmin({
    user_id: userId.trim(),
    user_email: userEmail.trim(),
    granted_by: null, // Bootstrap — no existing admin
    notes: 'Provisioned via bootstrap script',
  });

  console.log(`\nSuccess! Platform admin grant created:`);
  console.log(`  ID: ${grant.id}`);
  console.log(`  User: ${grant.user_email}`);
  console.log(`  Granted at: ${grant.granted_at}`);
  console.log('\nThe user can now access /admin after signing in.');
  console.log('Require MFA before exposing to production customer data.\n');

  await closeDb();
  rl.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
