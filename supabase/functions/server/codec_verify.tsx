/**
 * CODEC VERIFY - Módulo de Conexión con App Móvil
 * Endpoints para que la app móvil se conecte y vea datos reales del POS
 */

import * as kv from "./kv_store.tsx";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// ============================================================================
// TIPOS
// ============================================================================

interface PINTemporal {
  pin: string;
  expira: number;
  usado: boolean;
  creadoEn: number;
}

interface TokenCodecVerify {
  token: string;
  creadoEn: number;
  activo: boolean;
}

// ============================================================================
// GESTIÓN DE PINES TEMPORALES
// ============================================================================

/**
 * Genera un PIN de 6 dígitos válido por 10 minutos
 */
export async function generarPIN(): Promise<string> {
  const pin = Math.floor(100000 + Math.random() * 900000).toString();
  const expira = Date.now() + (10 * 60 * 1000); // 10 minutos
  
  const pinData: PINTemporal = {
    pin: pin,
    expira: expira,
    usado: false,
    creadoEn: Date.now(),
  };
  
  await kv.set(`codecverify:pin:${pin}`, pinData);
  
  console.log('✅ PIN generado:', pin, 'Expira en 10 minutos');
  
  return pin;
}

/**
 * Valida un PIN y retorna si es válido
 */
export async function validarPIN(pin: string): Promise<{ valido: boolean; mensaje?: string }> {
  const pinData = await kv.get(`codecverify:pin:${pin}`) as PINTemporal | null;
  
  if (!pinData) {
    return { valido: false, mensaje: 'PIN inválido o expirado' };
  }
  
  if (Date.now() > pinData.expira) {
    await kv.del(`codecverify:pin:${pin}`);
    return { valido: false, mensaje: 'El PIN expiró. Genera uno nuevo desde el POS.' };
  }
  
  if (pinData.usado) {
    return { valido: false, mensaje: 'Este PIN ya fue utilizado' };
  }
  
  return { valido: true };
}

/**
 * Marca un PIN como usado
 */
export async function marcarPINComoUsado(pin: string): Promise<void> {
  const pinData = await kv.get(`codecverify:pin:${pin}`) as PINTemporal | null;
  
  if (pinData) {
    pinData.usado = true;
    await kv.set(`codecverify:pin:${pin}`, pinData);
  }
}

/**
 * Genera un token simple para Codec Verify (válido 30 días)
 */
export async function generarTokenCodecVerify(): Promise<string> {
  const token = `cv_${Date.now()}_${Math.random().toString(36).substr(2, 20)}`;
  
  const tokenData: TokenCodecVerify = {
    token: token,
    creadoEn: Date.now(),
    activo: true,
  };
  
  await kv.set(`codecverify:token:${token}`, tokenData);
  
  return token;
}

/**
 * Valida un token de Codec Verify
 */
export async function validarTokenCodecVerify(token: string): Promise<boolean> {
  const tokenData = await kv.get(`codecverify:token:${token}`) as TokenCodecVerify | null;
  
  if (!tokenData) {
    return false;
  }
  
  // Token válido por 30 días
  const expiracion = 30 * 24 * 60 * 60 * 1000; // 30 días en ms
  if (Date.now() - tokenData.creadoEn > expiracion) {
    await kv.del(`codecverify:token:${token}`);
    return false;
  }
  
  return tokenData.activo;
}

// ============================================================================
// OBTENER DATOS REALES DEL POS
// ============================================================================

/**
 * Obtiene datos del negocio desde configuración
 */
export async function obtenerDatosNegocio() {
  // Intenta obtener de configuración guardada
  const config = await kv.get('pos:configuracion:negocio');
  
  if (config) {
    return config;
  }
  
  // Valores por defecto
  return {
    nombre: 'CODEC POS v2.0',
    nit: '900123456-7',
    direccion: 'Calle 123 #45-67, Bogotá, Colombia',
    telefono: '+57 300 123 4567',
  };
}

/**
 * Obtiene estadísticas del dashboard
 */
export async function obtenerDashboard() {
  // Obtener ventas de hoy
  const hoy = new Date().toISOString().split('T')[0];
  const ventasHoyData = await kv.getByPrefix(`pos:venta:${hoy}`);
  
  const ventasHoy = ventasHoyData.reduce((sum: number, venta: any) => {
    return sum + (venta.value?.total || 0);
  }, 0);
  
  // Obtener ventas del mes
  const mesActual = new Date().toISOString().substring(0, 7); // YYYY-MM
  const ventasMesData = await kv.getByPrefix(`pos:venta:${mesActual}`);
  
  const ventasMes = ventasMesData.reduce((sum: number, venta: any) => {
    return sum + (venta.value?.total || 0);
  }, 0);
  
  // Contar productos vendidos hoy
  let productosVendidos = 0;
  ventasHoyData.forEach((venta: any) => {
    if (venta.value?.productos) {
      productosVendidos += venta.value.productos.reduce((sum: number, p: any) => sum + (p.cantidad || 0), 0);
    }
  });
  
  // Obtener productos con bajo stock
  const inventarioData = await kv.getByPrefix('pos:producto:');
  const bajoStock = inventarioData.filter((item: any) => {
    const producto = item.value;
    return producto.cantidad <= (producto.stockMinimo || 10);
  }).length;
  
  return {
    ventasHoy: Math.round(ventasHoy),
    ventasMes: Math.round(ventasMes),
    productosVendidos: productosVendidos,
    bajoStock: bajoStock,
  };
}

/**
 * Obtiene lista de ventas del día
 */
export async function obtenerVentas() {
  const hoy = new Date().toISOString().split('T')[0];
  const ventasData = await kv.getByPrefix(`pos:venta:${hoy}`);
  
  // Ordenar por fecha descendente (más recientes primero)
  const ventas = ventasData
    .map((item: any) => item.value)
    .sort((a: any, b: any) => {
      const fechaA = new Date(a.fecha).getTime();
      const fechaB = new Date(b.fecha).getTime();
      return fechaB - fechaA;
    })
    .slice(0, 100); // Máximo 100 ventas
  
  return ventas;
}

/**
 * Obtiene inventario completo
 */
export async function obtenerInventario() {
  const inventarioData = await kv.getByPrefix('pos:producto:');
  
  const productos = inventarioData.map((item: any) => {
    const producto = item.value;
    return {
      id: producto.id,
      codigo: producto.codigoBarras || producto.ean || '',
      nombre: producto.nombre,
      categoria: producto.categoria || 'Sin categoría',
      precio: producto.precio,
      cantidad: producto.cantidad || 0,
      stockMinimo: producto.stockMinimo || 10,
    };
  });
  
  return productos;
}

/**
 * Obtiene estadísticas para gráficos
 */
export async function obtenerEstadisticas() {
  // Ventas de los últimos 7 días
  const ventasPorDia = [];
  
  for (let i = 6; i >= 0; i--) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - i);
    const fechaStr = fecha.toISOString().split('T')[0];
    
    const ventasDiaData = await kv.getByPrefix(`pos:venta:${fechaStr}`);
    const totalDia = ventasDiaData.reduce((sum: number, venta: any) => {
      return sum + (venta.value?.total || 0);
    }, 0);
    
    ventasPorDia.push({
      fecha: fechaStr,
      total: Math.round(totalDia),
    });
  }
  
  // Productos más vendidos (últimos 7 días)
  const productosVendidos: { [key: string]: { nombre: string; cantidad: number } } = {};
  
  for (let i = 6; i >= 0; i--) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - i);
    const fechaStr = fecha.toISOString().split('T')[0];
    
    const ventasDiaData = await kv.getByPrefix(`pos:venta:${fechaStr}`);
    
    ventasDiaData.forEach((venta: any) => {
      if (venta.value?.productos) {
        venta.value.productos.forEach((p: any) => {
          const key = p.id || p.nombre;
          if (!productosVendidos[key]) {
            productosVendidos[key] = { nombre: p.nombre, cantidad: 0 };
          }
          productosVendidos[key].cantidad += p.cantidad || 0;
        });
      }
    });
  }
  
  const productosMasVendidos = Object.values(productosVendidos)
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10);
  
  // Categorías (desde inventario)
  const inventarioData = await kv.getByPrefix('pos:producto:');
  const categorias: { [key: string]: number } = {};
  
  inventarioData.forEach((item: any) => {
    const categoria = item.value?.categoria || 'Sin categoría';
    categorias[categoria] = (categorias[categoria] || 0) + 1;
  });
  
  const totalProductos = inventarioData.length;
  const categoriasArray = Object.entries(categorias)
    .map(([nombre, cantidad]) => ({
      nombre: nombre,
      porcentaje: Math.round((cantidad / totalProductos) * 100),
    }))
    .sort((a, b) => b.porcentaje - a.porcentaje);
  
  return {
    ventasPorDia,
    productosMasVendidos,
    categorias: categoriasArray,
  };
}
