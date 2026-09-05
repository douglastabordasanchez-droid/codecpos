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

  // `_migrations` es un registro auxiliar histórico. La fuente de verdad
  // para archivos ya ejecutados por Supabase CLI es su historial interno.
  // Conciliar por versión+nombre evita repetir SQL que ya vive en producción.
  const cliHistory = new Set(
    (await client.query('select version, name from supabase_migrations.schema_migrations'))
      .rows
      .map((row) => `${row.version}:${row.name}`)
  );
  let reconciled = 0;
  for (const file of files) {
    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match || applied.has(file) || !cliHistory.has(`${match[1]}:${match[2]}`)) continue;
    await client.query('insert into public._migrations (name) values ($1) on conflict do nothing', [file]);
    applied.add(file);
    reconciled++;
  }
  if (reconciled > 0) console.log(`- Historial auxiliar conciliado: ${reconciled} migración(es) ya aplicadas por Supabase CLI.`);

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
