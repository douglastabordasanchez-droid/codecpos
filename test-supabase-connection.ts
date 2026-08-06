/**
 * Script de Prueba de Conexión a Supabase
 * Verifica que CODEC POS esté correctamente conectado al proyecto de Supabase
 *
 * Para ejecutar: pnpm exec tsx test-supabase-connection.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

loadEnv();

// Configuración del proyecto (leída de .env, ver .env.example)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

console.log('🔐 PRUEBA DE CONEXIÓN A SUPABASE');
console.log('═══════════════════════════════════════');
console.log(`📡 URL: ${SUPABASE_URL}`);
console.log(`🔑 Anon Key: ${SUPABASE_ANON_KEY.substring(0, 30)}...`);
console.log('═══════════════════════════════════════\n');

// Crear cliente
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function testConnection() {
  console.log('🔍 Probando conexión...\n');

  try {
    // Test 1: Verificar acceso a la base de datos
    console.log('TEST 1: Verificando acceso a base de datos...');
    const { data: tables, error: tablesError } = await supabase
      .from('clientes_pos')
      .select('count', { count: 'exact', head: true });

    if (tablesError) {
      console.log('⚠️  Tabla "clientes_pos" no encontrada o sin acceso');
      console.log('   Error:', tablesError.message);
    } else {
      console.log('✅ Conexión exitosa a tabla "clientes_pos"');
    }

    // Test 2: Listar clientes existentes
    console.log('\nTEST 2: Listando clientes existentes...');
    const { data: clientes, error: clientesError } = await supabase
      .from('clientes_pos')
      .select('id, nombre_negocio, estado, plan')
      .limit(10);

    if (clientesError) {
      console.log('❌ Error obteniendo clientes:', clientesError.message);
    } else {
      console.log(`✅ Clientes encontrados: ${clientes?.length || 0}`);
      if (clientes && clientes.length > 0) {
        console.log('\n📋 Clientes en la base de datos:');
        clientes.forEach((cliente, i) => {
          console.log(`   ${i + 1}. ${cliente.nombre_negocio} - Plan: ${cliente.plan} - Estado: ${cliente.estado}`);
        });
      } else {
        console.log('   ℹ️  No hay clientes registrados aún');
      }
    }

    // Test 3: Verificar tabla usuarios_clientes
    console.log('\nTEST 3: Verificando tabla "usuarios_clientes"...');
    const { data: usuarios, error: usuariosError } = await supabase
      .from('usuarios_clientes')
      .select('count', { count: 'exact', head: true });

    if (usuariosError) {
      console.log('⚠️  Tabla "usuarios_clientes" no encontrada o sin acceso');
      console.log('   Error:', usuariosError.message);
    } else {
      console.log('✅ Conexión exitosa a tabla "usuarios_clientes"');
    }

    console.log('\n═══════════════════════════════════════');
    console.log('✅ PRUEBA DE CONEXIÓN COMPLETADA');
    console.log('═══════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error);
    console.log('\n═══════════════════════════════════════');
    console.log('❌ PRUEBA DE CONEXIÓN FALLIDA');
    console.log('═══════════════════════════════════════');
    process.exit(1);
  }
}

// Ejecutar prueba
testConnection();
