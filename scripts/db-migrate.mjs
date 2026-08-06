import { config } from 'dotenv';
config();

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase/migrations');

if (!process.env.DATABASE_URL) {
  console.error('Falta DATABASE_URL en .env');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  await client.query(`
    create table if not exists public._migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await client.query('select name from public._migrations')).rows.map((r) => r.name)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ranAny = false;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`- ${file} (ya aplicada)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`> Aplicando ${file}...`);

    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public._migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`  OK: ${file}`);
      ranAny = true;
    } catch (err) {
      await client.query('rollback');
      console.error(`  FALLO en ${file}:`, err.message);
      process.exitCode = 1;
      break;
    }
  }

  if (!ranAny && process.exitCode !== 1) {
    console.log('Sin migraciones nuevas por aplicar.');
  }

  await client.end();
}

main().catch((err) => {
  console.error('Error fatal:', err.message);
  process.exit(1);
});
