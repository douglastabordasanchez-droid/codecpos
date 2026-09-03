import { config } from 'dotenv';
config();
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const registered = new Set((await client.query('select name from public._migrations')).rows.map(r => r.name));
const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
const pending = files.filter(f => !registered.has(f));
console.log('No registradas:', pending.length);
console.log(pending.join('\n'));

// Extrae identificadores clave por archivo: tablas creadas, funciones, columnas agregadas
function extraerObjetos(sql) {
  const objetos = [];
  let m;
  const reTable = /create table (?:if not exists )?public\.(\w+)/gi;
  while ((m = reTable.exec(sql))) objetos.push({ tipo: 'table', nombre: m[1] });
  const reFunc = /create (?:or replace )?function public\.(\w+)/gi;
  while ((m = reFunc.exec(sql))) objetos.push({ tipo: 'function', nombre: m[1] });
  const reCol = /alter table public\.(\w+)\s+add column (?:if not exists )?(\w+)/gi;
  while ((m = reCol.exec(sql))) objetos.push({ tipo: 'column', nombre: `${m[1]}.${m[2]}` });
  const reIdx = /create (?:unique )?index (?:if not exists )?(\w+)/gi;
  while ((m = reIdx.exec(sql))) objetos.push({ tipo: 'index', nombre: m[1] });
  return objetos;
}

const resultados = [];
for (const file of pending) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  const objetos = extraerObjetos(sql);
  if (objetos.length === 0) {
    resultados.push({ file, veredicto: 'SIN_OBJETOS_DE_ESQUEMA (probablemente backfill de datos)', detalle: [] });
    continue;
  }
  let existentes = 0;
  const detalle = [];
  for (const obj of objetos) {
    let existe = false;
    if (obj.tipo === 'table') {
      const r = await client.query(`select 1 from information_schema.tables where table_schema='public' and table_name=$1`, [obj.nombre]);
      existe = r.rowCount > 0;
    } else if (obj.tipo === 'function') {
      const r = await client.query(`select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1`, [obj.nombre]);
      existe = r.rowCount > 0;
    } else if (obj.tipo === 'column') {
      const [tabla, col] = obj.nombre.split('.');
      const r = await client.query(`select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`, [tabla, col]);
      existe = r.rowCount > 0;
    } else if (obj.tipo === 'index') {
      const r = await client.query(`select 1 from pg_indexes where schemaname='public' and indexname=$1`, [obj.nombre]);
      existe = r.rowCount > 0;
    }
    detalle.push({ ...obj, existe });
    if (existe) existentes++;
  }
  const veredicto = existentes === objetos.length ? 'APLICADA' : (existentes === 0 ? 'NO_APLICADA' : 'PARCIAL');
  resultados.push({ file, veredicto, detalle });
}

console.log('\n=== RESULTADOS ===');
for (const r of resultados) {
  console.log(`${r.veredicto}\t${r.file}`);
  if (r.veredicto === 'PARCIAL') {
    for (const d of r.detalle) console.log(`   - ${d.tipo} ${d.nombre}: ${d.existe ? 'existe' : 'FALTA'}`);
  }
}

await client.end();
