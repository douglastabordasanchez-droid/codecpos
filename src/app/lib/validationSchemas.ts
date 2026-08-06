/**
 * Esquemas de Validación con Zod
 * Validación robusta de datos para CODEC POS v2.0
 */

import { z } from 'zod';

// ==================== PRODUCTO ====================
export const ProductoSchema = z.object({
  id: z.string().optional(),
  codigo: z.string()
    .min(1, 'El código es requerido')
    .max(50, 'El código es muy largo')
    .trim()
    .regex(/^[a-zA-Z0-9-_]+$/, 'El código solo puede contener letras, números, guiones y guiones bajos'),
  nombre: z.string()
    .min(1, 'El nombre es requerido')
    .max(200, 'El nombre es muy largo')
    .trim(),
  precio: z.number()
    .positive('El precio debe ser mayor a 0')
    .max(999999999, 'El precio es demasiado alto')
    .finite('El precio debe ser un número válido'),
  costo: z.number()
    .nonnegative('El costo no puede ser negativo')
    .max(999999999, 'El costo es demasiado alto')
    .finite('El costo debe ser un número válido'),
  stock: z.number()
    .nonnegative('El stock no puede ser negativo')
    .max(999999, 'El stock es demasiado alto')
    .int('El stock debe ser un número entero'),
  minStock: z.number()
    .nonnegative('El stock mínimo no puede ser negativo')
    .max(999999, 'El stock mínimo es demasiado alto')
    .int('El stock mínimo debe ser un número entero')
    .optional()
    .default(5),
  categoria: z.string()
    .min(1, 'La categoría es requerida')
    .max(100, 'La categoría es muy larga')
    .trim(),
  unidad: z.enum(['unidad', 'kg', 'gr', 'lt', 'ml', 'paquete', 'caja', 'docena'], {
    errorMap: () => ({ message: 'Unidad de medida no válida' })
  }).default('unidad'),
  iva: z.number()
    .min(0, 'El IVA no puede ser negativo')
    .max(100, 'El IVA no puede ser mayor a 100%')
    .default(0),
  aplicaIVA: z.boolean().optional().default(false),
  pesable: z.boolean().optional().default(false),
  activo: z.boolean().optional().default(true),
  fechaVencimiento: z.string().optional(),
  proveedor: z.string().max(200, 'El nombre del proveedor es muy largo').optional(),
  imagenUrl: z.string().url('URL de imagen no válida').optional().or(z.literal('')),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
});

export type ProductoValidado = z.infer<typeof ProductoSchema>;

// ==================== VENTA ====================
export const VentaSchema = z.object({
  id: z.string(),
  numero: z.number().int().positive(),
  fecha: z.string(),
  items: z.array(z.object({
    productoId: z.string(),
    nombre: z.string(),
    cantidad: z.number().positive(),
    precio: z.number().positive(),
    subtotal: z.number().nonnegative(),
  })).min(1, 'Debe haber al menos un producto en la venta'),
  subtotal: z.number().nonnegative(),
  iva: z.number().nonnegative(),
  total: z.number().positive('El total debe ser mayor a 0'),
  metodoPago: z.enum(['efectivo', 'tarjeta', 'transferencia', 'nequi', 'daviplata', 'mixto']),
  metodosMultiples: z.array(z.object({
    metodo: z.string(),
    monto: z.number().positive()
  })).optional(),
  efectivoRecibido: z.number().positive().optional(),
  cambio: z.number().nonnegative().optional(),
  cajero: z.string(),
  puntoVentaId: z.string().optional(),
  cliente: z.string().optional(),
  createdAt: z.number(),
});

export type VentaValidada = z.infer<typeof VentaSchema>;

// ==================== USUARIO ====================
export const UsuarioSchema = z.object({
  id: z.string(),
  username: z.string()
    .min(3, 'El usuario debe tener al menos 3 caracteres')
    .max(50, 'El usuario es muy largo')
    .regex(/^[a-zA-Z0-9_]+$/, 'El usuario solo puede contener letras, números y guiones bajos'),
  password: z.string()
    .min(6, 'La contraseña debe tener al menos 6 caracteres')
    .max(100, 'La contraseña es muy larga'),
  nombre: z.string()
    .min(1, 'El nombre es requerido')
    .max(200, 'El nombre es muy largo')
    .trim(),
  rol: z.enum(['admin', 'cajero', 'empleado']),
  activo: z.boolean().default(true),
  permisos: z.array(z.string()).optional().default([]),
  createdAt: z.number().optional(),
});

export type UsuarioValidado = z.infer<typeof UsuarioSchema>;

// ==================== CONFIGURACIÓN ====================
export const ConfiguracionSchema = z.object({
  razonSocial: z.string().max(200).optional(),
  nombreComercial: z.string()
    .min(1, 'El nombre comercial es requerido')
    .max(200, 'El nombre comercial es muy largo')
    .trim(),
  nit: z.string()
    .min(5, 'El NIT debe tener al menos 5 dígitos')
    .max(15, 'El NIT es muy largo')
    .regex(/^\d+$/, 'El NIT solo puede contener números'),
  digitoVerificacion: z.string()
    .length(1, 'El dígito de verificación debe ser un solo carácter')
    .regex(/^\d$/, 'El DV debe ser un número')
    .optional(),
  direccion: z.string().max(300).optional(),
  telefono: z.string()
    .max(20, 'El teléfono es muy largo')
    .regex(/^[\d\s\(\)\-\+]+$/, 'Formato de teléfono no válido')
    .optional(),
  email: z.string()
    .email('Email no válido')
    .max(200)
    .optional()
    .or(z.literal('')),
  ciudad: z.string().max(100).optional(),
  logoUrl: z.string().optional(),
  ivaHabilitado: z.boolean().default(false),
  porcentajeIVA: z.number()
    .min(0, 'El IVA no puede ser negativo')
    .max(100, 'El IVA no puede ser mayor a 100%')
    .default(19),
  mensajeTirilla: z.string().max(200).optional(),
  eslogan: z.string().max(100).optional(),
});

export type ConfiguracionValidada = z.infer<typeof ConfiguracionSchema>;

// ==================== GASTO ====================
export const GastoSchema = z.object({
  id: z.string(),
  concepto: z.string()
    .min(1, 'El concepto es requerido')
    .max(200, 'El concepto es muy largo')
    .trim(),
  monto: z.number()
    .positive('El monto debe ser mayor a 0')
    .max(999999999, 'El monto es demasiado alto'),
  categoria: z.string()
    .min(1, 'La categoría es requerida')
    .max(100),
  fecha: z.string(),
  comprobante: z.string().optional(),
  usuario: z.string(),
  createdAt: z.number(),
});

export type GastoValidado = z.infer<typeof GastoSchema>;

// ==================== HELPERS DE VALIDACIÓN ====================

/**
 * Valida un producto y retorna el resultado
 */
export function validarProducto(data: unknown) {
  return ProductoSchema.safeParse(data);
}

/**
 * Valida una venta y retorna el resultado
 */
export function validarVenta(data: unknown) {
  return VentaSchema.safeParse(data);
}

/**
 * Valida un usuario y retorna el resultado
 */
export function validarUsuario(data: unknown) {
  return UsuarioSchema.safeParse(data);
}

/**
 * Valida configuración y retorna el resultado
 */
export function validarConfiguracion(data: unknown) {
  return ConfiguracionSchema.safeParse(data);
}

/**
 * Valida un gasto y retorna el resultado
 */
export function validarGasto(data: unknown) {
  return GastoSchema.safeParse(data);
}

/**
 * Formatea errores de Zod para mostrar al usuario
 */
export function formatearErroresZod(errors: z.ZodError): string {
  return errors.errors
    .map(err => `${err.path.join('.')}: ${err.message}`)
    .join(', ');
}
