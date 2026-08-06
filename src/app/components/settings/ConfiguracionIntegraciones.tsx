/**
 * CODEC POS v2.0 — Sección de Integraciones FUNCIONALES
 * Pasarelas de pago, automatización, contabilidad y comunicación
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2, XCircle, ExternalLink, Eye, EyeOff,
  RefreshCw, Save, ChevronDown, Info, Wifi, WifiOff,
  AlertTriangle, Copy, Check, Link2, Shield, Play,
  QrCode, Send, Code2, X, Zap, CreditCard, MessageSquare,
  BarChart3, ShoppingCart, ExternalLink as LinkIcon,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { usePOS } from '../../contexts/POSContext';
import { usePlanRestrictions } from '../../hooks/usePlanRestrictions';
import {
  probarIntegracion, ResultadoTest,
  generarURLQR, generarDatosQRNequi, generarDatosQRDaviplata,
  generarDatosQRBancolombia,
  crearLinkBold, crearPreferenciaMercadoPago,
  APPS_SCRIPT_CODIGO,
} from '../../lib/integracionesService';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────
type EstadoConexion = 'conectado' | 'desconectado' | 'pendiente' | 'error';

interface IntegracionConfig {
  id: string;
  habilitada: boolean;
  estado: EstadoConexion;
  campos: Record<string, string>;
  ultimaPrueba?: string;
  ultimoResultado?: string;
}

interface CampoDefinicion {
  key: string;
  label: string;
  placeholder: string;
  tipo: 'text' | 'password' | 'url' | 'select' | 'textarea';
  requerido: boolean;
  ayuda?: string;
  opciones?: { value: string; label: string }[];
}

interface DefinicionIntegracion {
  id: string;
  nombre: string;
  descripcion: string;
  logo: string;
  colorBg: string;
  categoria: string;
  disponible: boolean;
  premium: boolean;
  sitioWeb: string;
  campos: CampoDefinicion[];
  instrucciones: string[];
  usosSugeridos: string[];
  tieneQR?: boolean;
  tieneLinkPago?: boolean;
  tieneScript?: boolean;
  requiereElectron?: boolean;
}

// ─────────────────────────────────────────────
// CATÁLOGO COMPLETO
// ─────────────────────────────────────────────
const CATEGORIAS = [
  { id: 'pagos_col',   nombre: 'Pagos Colombia',     icono: '🇨🇴' },
  { id: 'pagos_int',   nombre: 'Pasarelas Int.',      icono: '💳' },
  { id: 'automatizacion', nombre: 'Automatización',  icono: '⚡' },
  { id: 'contabilidad',nombre: 'Contabilidad',        icono: '📊' },
  { id: 'comunicacion',nombre: 'Comunicación',        icono: '💬' },
  { id: 'ecommerce',   nombre: 'E-commerce',          icono: '🛒' },
];

const INTEGRACIONES: DefinicionIntegracion[] = [
  // ── PAGOS COLOMBIA ──
  {
    id: 'nequi', nombre: 'Nequi', logo: '💜',
    descripcion: 'Genera QR de cobro automático con el monto de la venta',
    colorBg: 'bg-purple-500/10 border-purple-500/30',
    categoria: 'pagos_col', disponible: true, premium: false,
    sitioWeb: 'https://www.nequi.com.co', tieneQR: true,
    campos: [
      { key: 'numero_nequi', label: 'Número Nequi del negocio', placeholder: '3001234567', tipo: 'text', requerido: true, ayuda: 'Número celular registrado en Nequi para recibir cobros' },
      { key: 'nombre_cuenta', label: 'Nombre de la cuenta', placeholder: 'Minimercado Ejemplo', tipo: 'text', requerido: true },
    ],
    instrucciones: [
      'Descarga la app Nequi y activa "Nequi Empresas" desde tu perfil',
      'Ingresa el número celular de tu cuenta Nequi Empresas',
      'En el POS, selecciona "Nequi" como método de pago',
      'El sistema genera automáticamente el QR con el monto exacto',
      'El cliente escanea el QR desde su app Nequi y paga',
    ],
    usosSugeridos: ['Pagos sin efectivo', 'QR automático por venta', 'Cobros a distancia'],
  },
  {
    id: 'daviplata', nombre: 'Daviplata', logo: '🔴',
    descripcion: 'QR de cobro Daviplata — billetera digital de Davivienda',
    colorBg: 'bg-red-500/10 border-red-500/30',
    categoria: 'pagos_col', disponible: true, premium: false,
    sitioWeb: 'https://www.daviplata.com', tieneQR: true,
    campos: [
      { key: 'numero_daviplata', label: 'Número Daviplata', placeholder: '3101234567', tipo: 'text', requerido: true, ayuda: 'Número celular vinculado a tu cuenta Daviplata' },
      { key: 'nombre_cuenta', label: 'Nombre del comercio', placeholder: 'Mi Tienda', tipo: 'text', requerido: true },
    ],
    instrucciones: [
      'Activa tu cuenta Daviplata con el número del negocio',
      'Para cobros de comercio, solicita "Daviplata Negocios" en la app',
      'Ingresa el número celular aquí',
      'El sistema genera el QR para que el cliente pague desde su Daviplata',
    ],
    usosSugeridos: ['Clientes Davivienda', 'Pagos sin efectivo', 'QR en caja'],
  },
  {
    id: 'transfiya', nombre: 'Bancolombia A la Mano', logo: '🏦',
    descripcion: 'QR de cobro con A la Mano de Bancolombia y red Transfiya',
    colorBg: 'bg-yellow-500/10 border-yellow-500/30',
    categoria: 'pagos_col', disponible: true, premium: false,
    sitioWeb: 'https://www.bancolombia.com', tieneQR: true,
    campos: [
      { key: 'numero_bancolombia', label: 'Número celular / A la Mano', placeholder: '3201234567', tipo: 'text', requerido: true },
      { key: 'tipo_cuenta', label: 'Tipo de cuenta', placeholder: '', tipo: 'select', requerido: true,
        opciones: [{ value: 'a_la_mano', label: 'A la Mano' }, { value: 'ahorros', label: 'Cuenta de Ahorros' }, { value: 'corriente', label: 'Cuenta Corriente' }] },
    ],
    instrucciones: [
      'Abre la app Bancolombia y activa la cuenta A la Mano',
      'Para negocios: solicita QR Empresas en cualquier sucursal',
      'Ingresa el número de celular vinculado a la cuenta',
      'El QR generado permite pagos desde cualquier banco vía Transfiya',
    ],
    usosSugeridos: ['QR interoperable', 'Pagos Bancolombia', 'Sin comisiones básicas'],
  },
  {
    id: 'bold', nombre: 'Bold', logo: '⬛',
    descripcion: 'Genera links de pago Bold con tarjeta crédito/débito y cuotas',
    colorBg: 'bg-gray-500/10 border-gray-500/30',
    categoria: 'pagos_col', disponible: true, premium: true,
    sitioWeb: 'https://bold.co', tieneLinkPago: true,
    campos: [
      { key: 'api_key', label: 'API Key Bold', placeholder: 'bold_pk_live_...', tipo: 'password', requerido: true, ayuda: 'Panel Bold → Configuración → API → Genera tu API Key' },
      { key: 'ambiente', label: 'Ambiente', placeholder: '', tipo: 'select', requerido: true,
        opciones: [{ value: 'sandbox', label: '🧪 Sandbox (pruebas)' }, { value: 'production', label: '🟢 Producción' }] },
    ],
    instrucciones: [
      'Regístrate en bold.co y completa la verificación del negocio',
      'Ve a Configuración → Desarrolladores → Genera tu API Key',
      'Selecciona "Sandbox" para pruebas, "Producción" para cobros reales',
      'El POS generará un link de pago Bold por cada venta que requiera tarjeta',
      'El cliente paga con crédito, débito o en cuotas desde el link',
    ],
    usosSugeridos: ['Tarjetas crédito/débito', 'Cuotas sin intereses', 'Ventas por WhatsApp'],
    requiereElectron: true,
  },
  {
    id: 'wompi', nombre: 'Wompi (Bancolombia)', logo: '🟡',
    descripcion: 'Pasarela oficial de Bancolombia — tarjeta, PSE, Nequi y efectivo',
    colorBg: 'bg-yellow-500/10 border-yellow-500/30',
    categoria: 'pagos_col', disponible: true, premium: true,
    sitioWeb: 'https://wompi.com', tieneLinkPago: true,
    campos: [
      { key: 'pub_key', label: 'Llave Pública', placeholder: 'pub_stagtest_...', tipo: 'text', requerido: true, ayuda: 'Panel Wompi → Configuración → Desarrollador' },
      { key: 'priv_key', label: 'Llave Privada', placeholder: 'prv_stagtest_...', tipo: 'password', requerido: true },
      { key: 'evento_key', label: 'Llave de Eventos', placeholder: 'stagtest_events_...', tipo: 'password', requerido: false, ayuda: 'Para recibir confirmaciones de pago por webhook' },
      { key: 'ambiente', label: 'Ambiente', placeholder: '', tipo: 'select', requerido: true,
        opciones: [{ value: 'sandbox', label: '🧪 Sandbox' }, { value: 'production', label: '🟢 Producción' }] },
    ],
    instrucciones: [
      'Crea cuenta en wompi.com/co y activa tu comercio',
      'Ve a Configuración → Desarrollador → copia las llaves pública y privada',
      'Configura el webhook de eventos con tu llave de eventos para confirmar pagos',
      'Usa Sandbox para pruebas — las tarjetas de prueba están en la documentación Wompi',
    ],
    usosSugeridos: ['Tarjetas', 'PSE', 'Nequi', 'Bancolombia', 'Efecty'],
    requiereElectron: true,
  },

  // ── PASARELAS INTERNACIONALES ──
  {
    id: 'payu', nombre: 'PayU', logo: '🌎',
    descripcion: 'Líder en Latinoamérica — tarjetas, PSE, efectivo en más de 8 países',
    colorBg: 'bg-orange-500/10 border-orange-500/30',
    categoria: 'pagos_int', disponible: true, premium: true,
    sitioWeb: 'https://payu.com',
    campos: [
      { key: 'merchant_id', label: 'Merchant ID', placeholder: '508029', tipo: 'text', requerido: true },
      { key: 'account_id', label: 'Account ID', placeholder: '512321', tipo: 'text', requerido: true },
      { key: 'api_key', label: 'API Key', placeholder: '4Vj8eK4rloUd...', tipo: 'password', requerido: true },
      { key: 'api_login', label: 'API Login', placeholder: 'pRRXKOl8ikMmt9u', tipo: 'text', requerido: true },
      { key: 'ambiente', label: 'Ambiente', placeholder: '', tipo: 'select', requerido: true,
        opciones: [{ value: 'sandbox', label: '🧪 Sandbox' }, { value: 'production', label: '🟢 Producción' }] },
    ],
    instrucciones: [
      'Crea cuenta en payu.com y completa la verificación de comercio',
      'Configuración técnica → API credentials → copia Merchant ID, Account ID, API Key y API Login',
      'Usa Sandbox para pruebas con tarjetas de prueba PayU',
      'El test de conexión usa el comando PING de la API PayU',
    ],
    usosSugeridos: ['Tarjetas internacionales', 'PSE', 'Pagos en efectivo', 'Ecommerce'],
    requiereElectron: true,
  },
  {
    id: 'mercadopago', nombre: 'Mercado Pago', logo: '🛍️',
    descripcion: 'Genera links de pago y QR — tarjetas, Nequi, PSE y más',
    colorBg: 'bg-sky-500/10 border-sky-500/30',
    categoria: 'pagos_int', disponible: true, premium: true,
    sitioWeb: 'https://mercadopago.com.co', tieneLinkPago: true,
    campos: [
      { key: 'public_key', label: 'Public Key', placeholder: 'APP_USR-...', tipo: 'text', requerido: true },
      { key: 'access_token', label: 'Access Token', placeholder: 'APP_USR-...', tipo: 'password', requerido: true, ayuda: 'Panel MP → Tus integraciones → Credenciales de producción' },
    ],
    instrucciones: [
      'Ingresa en mercadopago.com.co con tu cuenta de vendedor',
      'Ve a Tus integraciones → Crear aplicación → copia las credenciales de producción',
      'Para pruebas, usa las Credenciales de prueba (TEST)',
      'El POS generará links de pago y preferencias de cobro automáticamente',
    ],
    usosSugeridos: ['Link de pago', 'QR Point', 'Cuotas sin intereses', 'Múltiples métodos'],
  },
  {
    id: 'stripe', nombre: 'Stripe', logo: '💜',
    descripcion: 'La pasarela más potente para pagos globales y recurrentes',
    colorBg: 'bg-indigo-500/10 border-indigo-500/30',
    categoria: 'pagos_int', disponible: true, premium: true,
    sitioWeb: 'https://stripe.com',
    campos: [
      { key: 'publishable_key', label: 'Publishable Key', placeholder: 'pk_test_...', tipo: 'text', requerido: true },
      { key: 'secret_key', label: 'Secret Key', placeholder: 'sk_test_...', tipo: 'password', requerido: true, ayuda: 'Developers → API Keys en el dashboard de Stripe' },
      { key: 'webhook_secret', label: 'Webhook Secret', placeholder: 'whsec_...', tipo: 'password', requerido: false },
    ],
    instrucciones: [
      'Crea cuenta en stripe.com y completa la activación',
      'Ve a Developers → API Keys → copia Publishable y Secret Key',
      'Para webhooks: Developers → Webhooks → Add endpoint',
      'Usa las claves test (pk_test_ / sk_test_) para pruebas sin cobros reales',
    ],
    usosSugeridos: ['Pagos internacionales', 'Suscripciones', 'Tarjetas globales'],
    requiereElectron: true,
  },

  // ── AUTOMATIZACIÓN ──
  {
    id: 'zapier', nombre: 'Zapier', logo: '⚡',
    descripcion: 'Conecta CODEC POS con +7.000 apps automáticamente — Gmail, Sheets, Slack...',
    colorBg: 'bg-orange-500/10 border-orange-500/30',
    categoria: 'automatizacion', disponible: true, premium: false,
    sitioWeb: 'https://zapier.com',
    campos: [
      { key: 'webhook_url', label: 'URL Catch Hook de Zapier', placeholder: 'https://hooks.zapier.com/hooks/catch/XXXXXX/XXXXXXX/', tipo: 'url', requerido: true, ayuda: 'Zapier → Nuevo Zap → Webhooks by Zapier → Catch Hook → copia la URL' },
    ],
    instrucciones: [
      'Ve a zapier.com → Crear Zap → Trigger: "Webhooks by Zapier" → "Catch Hook"',
      'Zapier generará una URL única — cópiala aquí',
      'Haz click en "Probar Conexión" — se enviará un payload real a Zapier',
      'En Zapier, haz click en "Test trigger" para ver los datos recibidos',
      'Configura la acción: Gmail, Google Sheets, WhatsApp, Notion, etc.',
      'Activa el Zap — desde ese momento recibirá eventos del POS en tiempo real',
    ],
    usosSugeridos: ['Ventas → Google Sheets', 'Stock bajo → Email proveedor', 'Cierre caja → Gmail'],
  },
  {
    id: 'n8n', nombre: 'n8n', logo: '🔄',
    descripcion: 'Automatización open source 100% tuya — instálalo en tu propio servidor',
    colorBg: 'bg-purple-500/10 border-purple-500/30',
    categoria: 'automatizacion', disponible: true, premium: false,
    sitioWeb: 'https://n8n.io',
    campos: [
      { key: 'webhook_url', label: 'URL Webhook n8n', placeholder: 'https://tu-n8n.com/webhook/XXXX', tipo: 'url', requerido: true, ayuda: 'n8n → Nuevo workflow → Nodo Webhook → copia la URL de producción' },
      { key: 'api_key', label: 'API Key n8n (opcional)', placeholder: 'n8n_api_...', tipo: 'password', requerido: false, ayuda: 'Configuración → API → Crear API Key (solo si tu n8n requiere autenticación)' },
    ],
    instrucciones: [
      'Instala n8n: ejecuta "npx n8n" o usa n8n.cloud',
      'Crea un nuevo workflow → agrega nodo "Webhook" como primer nodo',
      'Cambia el webhook a modo "Producción" y copia la URL',
      'Pégala aquí y haz "Probar Conexión" — verás el payload en n8n',
      'Agrega nodos siguientes: Send Email, HTTP Request, Google Sheets, etc.',
      'Activa el workflow en n8n para recibir eventos del POS',
    ],
    usosSugeridos: ['Lógica compleja', 'Sin límites de Zaps', 'Airtable, Notion, Telegram'],
  },
  {
    id: 'make', nombre: 'Make (ex-Integromat)', logo: '🟣',
    descripcion: 'Automatización visual avanzada — flujos complejos con ramificaciones',
    colorBg: 'bg-violet-500/10 border-violet-500/30',
    categoria: 'automatizacion', disponible: true, premium: false,
    sitioWeb: 'https://make.com',
    campos: [
      { key: 'webhook_url', label: 'URL Webhook Make', placeholder: 'https://hook.eu1.make.com/XXXXXXXXXXXXXXXX', tipo: 'url', requerido: true, ayuda: 'Make → Nuevo escenario → Módulo: Webhooks → Custom webhook → copia la URL' },
    ],
    instrucciones: [
      'Ve a make.com → Crear nuevo escenario',
      'Agrega el módulo "Webhooks" → "Custom webhook" como trigger',
      'Haz click en "Add" para crear el webhook y copia la URL',
      'Pégala aquí y usa "Probar Conexión" para enviar datos reales a Make',
      'En Make aparecerá la estructura de los datos — úsalos en los módulos siguientes',
      'Activa el escenario y configura el intervalo de ejecución',
    ],
    usosSugeridos: ['Flujos condicionales', 'Múltiples destinos', 'Transformación de datos'],
  },

  // ── CONTABILIDAD ──
  {
    id: 'siigo', nombre: 'Siigo Nube', logo: '📒',
    descripcion: 'Sincroniza facturas y ventas con Siigo — software contable líder en Colombia',
    colorBg: 'bg-blue-500/10 border-blue-500/30',
    categoria: 'contabilidad', disponible: true, premium: true,
    sitioWeb: 'https://siigo.com',
    campos: [
      { key: 'username', label: 'Email de usuario Siigo', placeholder: 'usuario@empresa.com', tipo: 'text', requerido: true },
      { key: 'access_key', label: 'Access Key API', placeholder: 'TuAccessKey==', tipo: 'password', requerido: true, ayuda: 'En Siigo: Configuración → Integración API → Generar Access Key' },
    ],
    instrucciones: [
      'En Siigo Nube ve a Configuración → Integración API',
      'Haz click en "Generar Access Key" y copia la clave generada',
      'Ingresa tu email de Siigo y la Access Key aquí',
      'El test de conexión verificará las credenciales obteniendo un token JWT',
      'Las ventas del POS se sincronizarán como facturas de venta en Siigo',
    ],
    usosSugeridos: ['Facturas electrónicas DIAN', 'Contabilidad automática', 'Reportes tributarios'],
    requiereElectron: true,
  },
  {
    id: 'alegra', nombre: 'Alegra', logo: '😊',
    descripcion: 'Facturación electrónica y contabilidad en la nube para Colombia',
    colorBg: 'bg-teal-500/10 border-teal-500/30',
    categoria: 'contabilidad', disponible: true, premium: true,
    sitioWeb: 'https://alegra.com',
    campos: [
      { key: 'email', label: 'Email de tu cuenta Alegra', placeholder: 'usuario@empresa.com', tipo: 'text', requerido: true },
      { key: 'token', label: 'Token API', placeholder: 'alg_prod_...', tipo: 'password', requerido: true, ayuda: 'Alegra → Mi perfil → API → Ver o generar token' },
    ],
    instrucciones: [
      'Ingresa a app.alegra.com con tu cuenta',
      'Ve a Mi perfil → API → copia o genera tu token',
      'Ingresa tu email y el token aquí',
      'El test verificará la conexión con la API de empresa de Alegra',
    ],
    usosSugeridos: ['Facturas electrónicas', 'Gestión de clientes', 'Reportes contables'],
  },
  {
    id: 'google_sheets', nombre: 'Google Sheets', logo: '📊',
    descripcion: 'Exporta ventas, gastos e inventario en tiempo real a Google Sheets',
    colorBg: 'bg-green-500/10 border-green-500/30',
    categoria: 'contabilidad', disponible: true, premium: false,
    sitioWeb: 'https://sheets.google.com', tieneScript: true,
    campos: [
      { key: 'webhook_url', label: 'URL del Apps Script Web App', placeholder: 'https://script.google.com/macros/s/.../exec', tipo: 'url', requerido: true, ayuda: 'Crea un Apps Script en tu hoja, pega el código y despliega como Web App' },
      { key: 'spreadsheet_id', label: 'ID del Spreadsheet (referencia)', placeholder: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms', tipo: 'text', requerido: false, ayuda: 'El ID está en la URL de tu hoja (solo referencia visual)' },
    ],
    instrucciones: [
      'Crea una Google Sheet nueva para tu POS',
      'Ve a Extensiones → Apps Script → pega el código que aparece en "Ver Script"',
      'Guarda el script (Ctrl+S) → Implementar → Nueva implementación',
      'Tipo: Aplicación web → Ejecutar como: Yo → Quién tiene acceso: Cualquiera',
      'Haz click en "Implementar" → copia la URL del Web App y pégala aquí',
      'Usa "Probar Conexión" — aparecerá una nueva fila en tu hoja',
    ],
    usosSugeridos: ['Registro de ventas', 'Control de gastos', 'Inventario exportado'],
  },

  // ── COMUNICACIÓN ──
  {
    id: 'telegram', nombre: 'Telegram Bot', logo: '✈️',
    descripcion: 'Recibe alertas del POS en Telegram — stock bajo, ventas, cierres de caja',
    colorBg: 'bg-sky-500/10 border-sky-500/30',
    categoria: 'comunicacion', disponible: true, premium: false,
    sitioWeb: 'https://core.telegram.org/bots',
    campos: [
      { key: 'bot_token', label: 'Token del Bot', placeholder: '1234567890:AAFxxxxxx...', tipo: 'password', requerido: true, ayuda: 'Habla con @BotFather en Telegram → /newbot → copia el token' },
      { key: 'chat_id', label: 'Chat ID', placeholder: '-100123456789 o 123456789', tipo: 'text', requerido: true, ayuda: 'Envía /start a tu bot, luego envía /start a @userinfobot para ver tu ID' },
    ],
    instrucciones: [
      'Abre Telegram → busca @BotFather → envía /newbot',
      'Sigue las instrucciones: elige nombre y username para tu bot',
      '@BotFather te dará un token — cópialo aquí',
      'Inicia una conversación con tu bot en Telegram (haz click en Start)',
      'Para obtener tu Chat ID: busca @userinfobot y envía /start',
      'El "Probar Conexión" enviará un mensaje REAL a tu Telegram',
    ],
    usosSugeridos: ['Alertas stock bajo', 'Resumen de ventas', 'Notificaciones de errores'],
  },
  {
    id: 'whatsapp_business', nombre: 'WhatsApp Business API', logo: '💬',
    descripcion: 'Envía comprobantes y alertas automáticas por WhatsApp Business',
    colorBg: 'bg-green-500/10 border-green-500/30',
    categoria: 'comunicacion', disponible: true, premium: true,
    sitioWeb: 'https://business.whatsapp.com',
    campos: [
      { key: 'phone_number_id', label: 'Phone Number ID', placeholder: '123456789012345', tipo: 'text', requerido: true, ayuda: 'Meta for Developers → WhatsApp → Getting Started → Phone Number ID' },
      { key: 'access_token', label: 'Token de acceso permanente', placeholder: 'EAAxxxxx...', tipo: 'password', requerido: true, ayuda: 'Meta Business Suite → Configuración del sistema → Crear token de acceso del sistema' },
      { key: 'numero_destino', label: 'Número de prueba (con código país)', placeholder: '573001234567', tipo: 'text', requerido: false, ayuda: 'Número para recibir el mensaje de prueba — sin + ni espacios' },
    ],
    instrucciones: [
      'Crea una app en developers.facebook.com → Agregar producto → WhatsApp',
      'En Getting Started: agrega un número de teléfono de negocio verificado',
      'Crea un token de acceso permanente en Meta Business Suite',
      'Copia el Phone Number ID y el Token aquí',
      'El test enviará un mensaje real al número de prueba configurado',
    ],
    usosSugeridos: ['Comprobantes de venta', 'Alertas a proveedores', 'Confirmación de pedidos'],
  },
  {
    id: 'slack', nombre: 'Slack', logo: '🟪',
    descripcion: 'Notificaciones del POS en canales de Slack para tu equipo',
    colorBg: 'bg-purple-500/10 border-purple-500/30',
    categoria: 'comunicacion', disponible: true, premium: false,
    sitioWeb: 'https://slack.com',
    campos: [
      { key: 'webhook_url', label: 'Incoming Webhook URL', placeholder: 'https://hooks.slack.com/services/T.../B.../XXXX', tipo: 'url', requerido: true, ayuda: 'Slack → Apps → Incoming WebHooks → Agregar a Slack → Seleccionar canal → copia la URL' },
    ],
    instrucciones: [
      'Ve a tu workspace en Slack → Apps → busca "Incoming WebHooks"',
      'Haz click en "Agregar a Slack" → selecciona el canal de notificaciones',
      'Slack te dará una URL de webhook — cópiala aquí',
      '"Probar Conexión" enviará un mensaje REAL al canal de Slack',
    ],
    usosSugeridos: ['Alertas del negocio', 'Ventas en tiempo real', 'Notificaciones al equipo'],
  },

  // ── E-COMMERCE ──
  {
    id: 'shopify', nombre: 'Shopify', logo: '🛒',
    descripcion: 'Sincroniza inventario y ventas entre tu POS físico y tienda Shopify',
    colorBg: 'bg-green-500/10 border-green-500/30',
    categoria: 'ecommerce', disponible: true, premium: true,
    sitioWeb: 'https://shopify.com',
    campos: [
      { key: 'shop_domain', label: 'Dominio de la tienda', placeholder: 'mi-tienda.myshopify.com', tipo: 'text', requerido: true },
      { key: 'api_key', label: 'Admin API Access Token', placeholder: 'shpat_...', tipo: 'password', requerido: true, ayuda: 'Shopify Admin → Configuración → Apps → Desarrollar apps → Crear app privada' },
      { key: 'location_id', label: 'Location ID (opcional)', placeholder: 'gid://shopify/Location/123', tipo: 'text', requerido: false },
    ],
    instrucciones: [
      'En Shopify Admin: Configuración → Apps y canales → Desarrollar apps',
      'Crea una app privada con permisos: inventario (lectura/escritura), pedidos (lectura)',
      'Copia el Admin API Access Token generado',
      'El test verificará la conexión con la tienda Shopify',
    ],
    usosSugeridos: ['Sync de inventario', 'Pedidos online → POS', 'Catálogo unificado'],
    requiereElectron: true,
  },
  {
    id: 'woocommerce', nombre: 'WooCommerce', logo: '🔵',
    descripcion: 'Sincroniza tu tienda WordPress/WooCommerce con el inventario del POS',
    colorBg: 'bg-purple-500/10 border-purple-500/30',
    categoria: 'ecommerce', disponible: true, premium: true,
    sitioWeb: 'https://woocommerce.com',
    campos: [
      { key: 'site_url', label: 'URL de tu sitio WordPress', placeholder: 'https://mitienda.com', tipo: 'url', requerido: true },
      { key: 'consumer_key', label: 'Consumer Key', placeholder: 'ck_...', tipo: 'text', requerido: true, ayuda: 'WooCommerce → Configuración → Avanzado → API REST → Agregar clave' },
      { key: 'consumer_secret', label: 'Consumer Secret', placeholder: 'cs_...', tipo: 'password', requerido: true },
    ],
    instrucciones: [
      'En WooCommerce: Configuración → Avanzado → API REST',
      'Agrega una nueva clave con permisos de Lectura/Escritura',
      'Copia el Consumer Key y Consumer Secret aquí',
      'Asegúrate de que tu sitio tenga SSL (HTTPS) activo',
    ],
    usosSugeridos: ['Sync productos', 'Control de stock unificado', 'Pedidos web → POS'],
  },
];

// ─────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────
const STORAGE_KEY = 'codecpos_integraciones_config';

function cargarConfig(): Record<string, IntegracionConfig> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch { return {}; }
}

function guardarConfig(cfg: Record<string, IntegracionConfig>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

// ─────────────────────────────────────────────
// MODAL QR PAGO
// ─────────────────────────────────────────────
function ModalQR({
  integ, campos, darkMode, onClose,
}: { integ: DefinicionIntegracion; campos: Record<string, string>; darkMode: boolean; onClose: () => void }) {
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('Pago CODEC POS');
  const [qrURL, setQrURL] = useState('');
  const [linkPago, setLinkPago] = useState('');
  const [generando, setGenerando] = useState(false);

  const generarQR = () => {
    if (!monto || isNaN(Number(monto))) { toast.error('Ingresa un monto válido'); return; }
    const m = Number(monto);
    let datos = '';
    if (integ.id === 'nequi') datos = generarDatosQRNequi(campos.numero_nequi, m, descripcion);
    else if (integ.id === 'daviplata') datos = generarDatosQRDaviplata(campos.numero_daviplata, m);
    else if (integ.id === 'transfiya') datos = generarDatosQRBancolombia(campos.numero_bancolombia, m, descripcion);
    setQrURL(generarURLQR(datos, 280));
  };

  const generarLink = async () => {
    if (!monto || isNaN(Number(monto))) { toast.error('Ingresa un monto válido'); return; }
    setGenerando(true);
    const m = Number(monto);
    const ref = `POS-${Date.now()}`;
    let resultado;
    if (integ.id === 'bold') {
      resultado = await crearLinkBold(campos.api_key, campos.ambiente || 'sandbox', m, descripcion, ref);
    } else if (integ.id === 'mercadopago') {
      resultado = await crearPreferenciaMercadoPago(campos.access_token, m, descripcion, ref);
    }
    setGenerando(false);
    if (resultado?.ok && resultado.url) {
      setLinkPago(resultado.url);
      toast.success(resultado.mensaje);
    } else {
      toast.error(resultado?.mensaje || 'Error generando link');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={`w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-gray-200'}`}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{integ.logo}</span>
            <div>
              <h3 className="font-bold">{integ.nombre}</h3>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                {integ.tieneQR ? 'Generar QR de cobro' : 'Generar link de pago'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={`text-xs ${darkMode ? 'text-gray-300' : ''}`}>Monto (COP) *</Label>
              <Input
                type="number"
                value={monto}
                onChange={e => setMonto(e.target.value)}
                placeholder="45800"
                className={darkMode ? 'bg-slate-800 border-slate-600 text-white' : ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={`text-xs ${darkMode ? 'text-gray-300' : ''}`}>Descripción</Label>
              <Input
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                placeholder="Pago CODEC POS"
                className={darkMode ? 'bg-slate-800 border-slate-600 text-white' : ''}
              />
            </div>
          </div>

          {integ.tieneQR && (
            <Button onClick={generarQR} className="w-full bg-gradient-to-r from-violet-600 to-purple-600 font-bold">
              <QrCode className="w-4 h-4 mr-2" /> Generar QR
            </Button>
          )}
          {integ.tieneLinkPago && (
            <Button onClick={generarLink} disabled={generando} className="w-full bg-gradient-to-r from-violet-600 to-purple-600 font-bold">
              {generando ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <LinkIcon className="w-4 h-4 mr-2" />}
              {generando ? 'Generando...' : 'Generar Link de Pago'}
            </Button>
          )}

          {/* QR generado */}
          {qrURL && (
            <div className="text-center space-y-3">
              <div className={`inline-block p-3 rounded-2xl ${darkMode ? 'bg-white' : 'bg-white border border-gray-200'}`}>
                <img src={qrURL} alt="QR de pago" className="w-56 h-56 mx-auto" />
              </div>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                El cliente escanea con la app {integ.nombre}
              </p>
              <p className="text-lg font-black text-emerald-500">
                ${Number(monto).toLocaleString('es-CO')} COP
              </p>
            </div>
          )}

          {/* Link de pago generado */}
          {linkPago && (
            <div className={`p-4 rounded-xl space-y-3 ${darkMode ? 'bg-slate-800 border border-slate-600' : 'bg-green-50 border border-green-200'}`}>
              <p className="text-emerald-500 font-bold text-center text-lg">
                💳 ${Number(monto).toLocaleString('es-CO')} COP
              </p>
              <div className={`p-2 rounded-lg font-mono text-xs break-all ${darkMode ? 'bg-slate-700 text-green-400' : 'bg-white text-green-700'}`}>
                {linkPago}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => { navigator.clipboard.writeText(linkPago); toast.success('Link copiado'); }}
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar
                </Button>
                <a href={linkPago} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button size="sm" variant="outline" className={`w-full ${darkMode ? 'border-slate-600' : ''}`}>
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Abrir
                  </Button>
                </a>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MODAL SCRIPT GOOGLE
// ─────────────────────────────────────────────
function ModalScript({ darkMode, onClose }: { darkMode: boolean; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODIGO);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
    toast.success('Código copiado al portapapeles');
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className={`w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden ${darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white'}`}
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">📊</span>
            <div>
              <h3 className="font-bold">Google Apps Script</h3>
              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Código para recibir datos del POS en Google Sheets
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className={`p-3 rounded-xl text-xs flex gap-2 ${darkMode ? 'bg-blue-900/20 text-blue-300' : 'bg-blue-50 text-blue-800'}`}>
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Pega este código en tu Google Apps Script (Extensiones → Apps Script), guarda y despliega como <b>Web App</b> con acceso <b>Cualquiera</b>.</span>
          </div>
          <div className="relative">
            <pre className={`text-xs rounded-xl p-4 overflow-x-auto overflow-y-auto max-h-72 ${darkMode ? 'bg-slate-950 text-emerald-400' : 'bg-gray-900 text-emerald-400'}`}>
              {APPS_SCRIPT_CODIGO}
            </pre>
            <Button
              size="sm"
              className="absolute top-2 right-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={copiar}
            >
              {copiado ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
              {copiado ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
          <div className={`p-3 rounded-xl text-xs space-y-1 ${darkMode ? 'bg-slate-800' : 'bg-gray-50'}`}>
            <p className="font-semibold">Columnas que se crearán automáticamente:</p>
            <div className="grid grid-cols-2 gap-1">
              {['Fecha/Hora', 'Tipo de evento', 'Título', 'Total/Monto', 'Cajero', 'Método de pago', 'Nro. productos', 'JSON completo'].map(col => (
                <span key={col} className={`px-2 py-0.5 rounded ${darkMode ? 'bg-slate-700' : 'bg-white border border-gray-200'}`}>{col}</span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────
export function ConfiguracionIntegraciones() {
  const { darkMode } = usePOS();
  const { planInfo } = usePlanRestrictions();
  const esPremium = planInfo.plan === 'PREMIUM';
  const [configs, setConfigs] = useState<Record<string, IntegracionConfig>>(cargarConfig);
  const [categoriaActiva, setCategoriaActiva] = useState('pagos_col');
  const [abierta, setAbierta] = useState<string | null>(null);
  const [probando, setProbando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [ocultoCampos, setOcultoCampos] = useState<Record<string, boolean>>({});
  const [resultadoTest, setResultadoTest] = useState<Record<string, ResultadoTest>>({});
  const [modalQR, setModalQR] = useState<DefinicionIntegracion | null>(null);
  const [modalScript, setModalScript] = useState(false);

  const integracionesFiltradas = INTEGRACIONES.filter(i => i.categoria === categoriaActiva);
  const totalConectadas = Object.values(configs).filter(c => c.estado === 'conectado').length;

  const getCfg = useCallback((id: string): IntegracionConfig =>
    configs[id] ?? { id, habilitada: false, estado: 'desconectado', campos: {} }, [configs]);

  const setCampo = (id: string, key: string, value: string) => {
    setConfigs(prev => {
      const cfg = getCfg(id);
      return { ...prev, [id]: { ...cfg, campos: { ...cfg.campos, [key]: value } } };
    });
  };

  const toggleHabilitada = (id: string) => {
    setConfigs(prev => {
      const cfg = getCfg(id);
      const nuevo = { ...prev, [id]: { ...cfg, habilitada: !cfg.habilitada } };
      guardarConfig(nuevo);
      return nuevo;
    });
    const integ = INTEGRACIONES.find(i => i.id === id);
    toast.info(getCfg(id).habilitada ? `${integ?.nombre} desactivada` : `${integ?.nombre} activada`);
  };

  const handleGuardar = async (id: string) => {
    const integ = INTEGRACIONES.find(i => i.id === id)!;
    const cfg = getCfg(id);
    for (const campo of integ.campos.filter(c => c.requerido)) {
      if (!cfg.campos[campo.key]?.trim()) {
        toast.error(`"${campo.label}" es obligatorio`); return;
      }
    }
    setGuardando(id);
    await new Promise(r => setTimeout(r, 400));
    const nuevo = { ...configs, [id]: { ...cfg, estado: 'pendiente' as EstadoConexion } };
    guardarConfig(nuevo);
    setConfigs(nuevo);
    setGuardando(null);
    toast.success(`✅ ${integ.nombre} guardada`, { description: 'Usa "Probar Conexión" para verificar' });
  };

  const handleProbar = async (id: string) => {
    const integ = INTEGRACIONES.find(i => i.id === id)!;
    const cfg = getCfg(id);

    // Validar campos requeridos antes de probar
    for (const campo of integ.campos.filter(c => c.requerido)) {
      if (!cfg.campos[campo.key]?.trim()) {
        toast.error(`Completa el campo "${campo.label}" antes de probar`); return;
      }
    }

    setProbando(id);
    setResultadoTest(prev => ({ ...prev, [id]: { ok: false, mensaje: '⏳ Probando conexión...' } }));

    const resultado = await probarIntegracion(id, cfg.campos);

    const nuevoEstado: EstadoConexion = resultado.ok ? 'conectado' : 'error';
    const nuevo = {
      ...configs,
      [id]: {
        ...cfg,
        estado: nuevoEstado,
        ultimaPrueba: new Date().toISOString(),
        ultimoResultado: resultado.mensaje,
      },
    };
    guardarConfig(nuevo);
    setConfigs(nuevo);
    setResultadoTest(prev => ({ ...prev, [id]: resultado }));
    setProbando(null);

    if (resultado.ok) {
      toast.success(`✅ ${integ.nombre}`, { description: resultado.mensaje });
    } else {
      toast.error(`❌ ${integ.nombre}`, { description: resultado.mensaje });
    }
  };

  const estadoBadge: Record<EstadoConexion, { text: string; cls: string }> = {
    conectado: { text: '✓ Conectada', cls: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/20' },
    desconectado: { text: '○ Sin configurar', cls: darkMode ? 'bg-slate-700 text-gray-400 border-slate-600' : 'bg-gray-100 text-gray-500 border-gray-200' },
    pendiente: { text: '⏳ Pendiente prueba', cls: 'bg-amber-500/15 text-amber-600 border-amber-500/20' },
    error: { text: '✗ Error', cls: 'bg-red-500/15 text-red-600 border-red-500/20' },
  };

  const cardBase = `${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-gray-200'} border rounded-2xl overflow-hidden`;

  return (
    <div className="space-y-5">

      {/* ── RESUMEN ── */}
      <div className={`p-4 rounded-2xl flex items-center gap-4 ${darkMode ? 'bg-slate-700/40 border border-slate-600' : 'bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200'}`}>
        <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
          <Link2 className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <p className={`font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {totalConectadas} integración{totalConectadas !== 1 ? 'es' : ''} verificada{totalConectadas !== 1 ? 's' : ''}
          </p>
          <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            19 disponibles · Conexiones directas con APIs oficiales
          </p>
        </div>
        <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-semibold flex-shrink-0 ${navigator.onLine ? (darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700') : (darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-50 text-red-700')}`}>
          {navigator.onLine ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          {navigator.onLine ? 'Online' : 'Offline'}
        </div>
      </div>

      {/* ── PREMIUM GATE ── */}
      {!esPremium && (
        <div className="relative">
          {/* Vista previa borrosa */}
          <div className="pointer-events-none select-none blur-sm opacity-35 space-y-4">
            <div className="flex gap-2 flex-wrap">
              {CATEGORIAS.map(cat => (
                <button key={cat.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border ${darkMode ? 'bg-slate-800 text-gray-400 border-slate-700' : 'bg-white text-gray-600 border-gray-200'}`}>
                  <span>{cat.icono}</span><span>{cat.nombre}</span>
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {[1,2,3].map(n => (
                <div key={n} className={`p-4 rounded-2xl border flex items-center gap-3 ${darkMode ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-gray-200'}`}>
                  <div className={`w-10 h-10 rounded-xl ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`} />
                  <div className="flex-1 space-y-2">
                    <div className={`h-3 rounded w-36 ${darkMode ? 'bg-slate-700' : 'bg-gray-200'}`} />
                    <div className={`h-2 rounded w-52 ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`} />
                  </div>
                  <div className={`h-6 w-20 rounded-full ${darkMode ? 'bg-slate-700' : 'bg-gray-100'}`} />
                </div>
              ))}
            </div>
          </div>

          {/* Tarjeta de bloqueo centrada */}
          <div className="absolute inset-0 flex items-center justify-center z-10 py-4">
            <div
              className={`w-full max-w-sm rounded-2xl shadow-2xl border p-7 text-center ${darkMode ? 'bg-slate-900/95 border-amber-500/40' : 'bg-white/95 border-amber-400/50'}`}
              style={{ backdropFilter: 'blur(14px)' }}
            >
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm0 2h14v2H5v-2z" />
                </svg>
              </div>
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3 ${darkMode ? 'bg-amber-900/40 text-amber-400 border border-amber-700/40' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                ✦ Solo Plan Premium
              </div>
              <h3 className={`text-lg font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Integraciones bloqueadas
              </h3>
              <p className={`text-sm mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                Las <span className="font-semibold text-violet-400">19 integraciones</span> — pasarelas de pago, automatización, contabilidad y mensajería — están disponibles únicamente en el plan <span className="font-semibold text-amber-500">Premium</span>.
              </p>
              <p className={`text-xs mt-2 mb-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Incluye Telegram, Zapier, Wompi, Bold, Siigo, Alegra, Slack y más.
              </p>
              <div className={`p-3 rounded-xl text-xs flex items-start gap-2 mb-5 text-left ${darkMode ? 'bg-amber-900/20 text-amber-300 border border-amber-700/30' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <span>Contacta a <strong>Codec Studio</strong> para activar el plan Premium en tu cuenta.</span>
              </div>
              <a
                href="https://wa.me/573238646844?text=Hola%2C%20quiero%20activar%20las%20integraciones%20del%20plan%20Premium%20en%20CODEC%20POS"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-white text-sm font-bold hover:from-amber-600 hover:to-amber-700 transition-all shadow-md"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.374 0 0 5.373 0 12c0 2.118.555 4.103 1.525 5.83L.057 23.032a.75.75 0 00.92.919l5.347-1.445C7.937 23.46 9.929 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.898 0-3.735-.516-5.32-1.484l-.38-.226-3.95 1.068 1.094-3.882-.247-.396A9.955 9.955 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
                Activar Plan Premium
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── CONTENIDO PREMIUM (solo visible si es Premium) ── */}
      {esPremium && <>

      {/* ── TABS CATEGORÍAS ── */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIAS.map(cat => {
          const count = INTEGRACIONES.filter(i => i.categoria === cat.id && configs[i.id]?.estado === 'conectado').length;
          return (
            <button
              key={cat.id}
              onClick={() => setCategoriaActiva(cat.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                categoriaActiva === cat.id
                  ? darkMode ? 'bg-violet-700 text-white border-violet-600' : 'bg-violet-600 text-white border-violet-500'
                  : darkMode ? 'bg-slate-800 text-gray-400 border-slate-700 hover:border-slate-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              <span>{cat.icono}</span>
              <span className="hidden sm:block">{cat.nombre}</span>
              {count > 0 && <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── LISTA DE INTEGRACIONES ── */}
      <div className="space-y-3">
        {integracionesFiltradas.map(integ => {
          const cfg = getCfg(integ.id);
          const isAbierta = abierta === integ.id;
          const badge = estadoBadge[cfg.estado];
          const resultado = resultadoTest[integ.id];
          const esProbando = probando === integ.id;

          return (
            <motion.div key={integ.id} layout className={cardBase}>

              {/* ── Header ── */}
              <div
                className={`flex items-center gap-4 p-4 cursor-pointer ${isAbierta ? (darkMode ? 'border-b border-slate-700' : 'border-b border-gray-100') : ''}`}
                onClick={() => setAbierta(isAbierta ? null : integ.id)}
              >
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 border ${integ.colorBg}`}>
                  {integ.logo}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{integ.nombre}</span>
                    {integ.premium && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 border border-amber-500/20 font-semibold">👑 Premium</span>}
                    {integ.requiereElectron && <span className={`text-xs px-1.5 py-0.5 rounded-full border font-semibold ${darkMode ? 'bg-slate-700 text-slate-400 border-slate-600' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>🖥️ Electron</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${badge.cls}`}>{badge.text}</span>
                  </div>
                  <p className={`text-xs mt-0.5 truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{integ.descripcion}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  {/* Toggle activo */}
                  <button
                    onClick={() => toggleHabilitada(integ.id)}
                    className={`relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors ${cfg.habilitada ? 'bg-emerald-500' : darkMode ? 'bg-slate-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition ${cfg.habilitada ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                  <motion.div animate={{ rotate: isAbierta ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                  </motion.div>
                </div>
              </div>

              {/* ── Contenido expandible ── */}
              <AnimatePresence initial={false}>
                {isAbierta && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="p-5 space-y-5">

                      {/* Aviso Electron */}
                      {integ.requiereElectron && (
                        <div className={`p-3 rounded-xl flex gap-2 text-xs ${darkMode ? 'bg-blue-900/20 border border-blue-700/30 text-blue-300' : 'bg-blue-50 border border-blue-200 text-blue-800'}`}>
                          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span><b>Nota CORS:</b> Esta API tiene restricciones de CORS en navegadores. Funciona perfectamente en <b>CODEC POS Desktop (Electron)</b>. En el preview web puede mostrar error de red aunque las credenciales sean correctas.</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                        {/* ── Formulario ── */}
                        <div className="space-y-4">
                          <h4 className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>⚙️ Configuración</h4>

                          {integ.campos.map(campo => (
                            <div key={campo.key} className="space-y-1.5">
                              <Label className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                {campo.label} {campo.requerido && <span className="text-red-500">*</span>}
                              </Label>

                              {campo.tipo === 'select' ? (
                                <select
                                  value={cfg.campos[campo.key] ?? ''}
                                  onChange={e => setCampo(integ.id, campo.key, e.target.value)}
                                  className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'} focus:outline-none focus:ring-2 focus:ring-violet-500`}
                                >
                                  <option value="">Seleccionar...</option>
                                  {campo.opciones?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              ) : campo.tipo === 'textarea' ? (
                                <textarea
                                  value={cfg.campos[campo.key] ?? ''}
                                  onChange={e => setCampo(integ.id, campo.key, e.target.value)}
                                  placeholder={campo.placeholder}
                                  rows={3}
                                  className={`w-full px-3 py-2 rounded-lg border text-xs font-mono ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-gray-300'} focus:outline-none focus:ring-2 focus:ring-violet-500`}
                                />
                              ) : (
                                <div className="relative">
                                  <Input
                                    type={campo.tipo === 'password' && !ocultoCampos[`${integ.id}_${campo.key}`] ? 'password' : 'text'}
                                    value={cfg.campos[campo.key] ?? ''}
                                    onChange={e => setCampo(integ.id, campo.key, e.target.value)}
                                    placeholder={campo.placeholder}
                                    className={`text-xs pr-8 ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : ''}`}
                                  />
                                  {campo.tipo === 'password' && (
                                    <button
                                      type="button"
                                      onClick={() => setOcultoCampos(v => ({ ...v, [`${integ.id}_${campo.key}`]: !v[`${integ.id}_${campo.key}`] }))}
                                      className={`absolute right-2 top-1/2 -translate-y-1/2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}
                                    >
                                      {ocultoCampos[`${integ.id}_${campo.key}`] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                </div>
                              )}

                              {campo.ayuda && (
                                <p className={`text-xs flex gap-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                  <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />{campo.ayuda}
                                </p>
                              )}
                            </div>
                          ))}

                          {/* Resultado del test */}
                          {resultado && (
                            <div className={`p-3 rounded-xl flex items-start gap-2 text-xs border ${
                              esProbando ? (darkMode ? 'bg-slate-700 border-slate-600' : 'bg-gray-50 border-gray-200') :
                              resultado.ok
                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                                : 'bg-red-500/10 border-red-500/20 text-red-500'
                            }`}>
                              {esProbando
                                ? <RefreshCw className="w-4 h-4 animate-spin flex-shrink-0" />
                                : resultado.ok
                                ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                : <XCircle className="w-4 h-4 flex-shrink-0" />}
                              <p className="font-semibold">{resultado.mensaje}</p>
                            </div>
                          )}

                          {/* Botones de acción */}
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              size="sm"
                              onClick={() => handleGuardar(integ.id)}
                              disabled={!!guardando}
                              className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 font-bold"
                            >
                              {guardando === integ.id ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                              Guardar
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleProbar(integ.id)}
                              disabled={esProbando}
                              className={`${darkMode ? 'border-slate-600 text-gray-300 hover:text-white' : ''} font-semibold`}
                            >
                              {esProbando ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
                              {esProbando ? 'Probando...' : 'Probar Conexión'}
                            </Button>

                            {/* Botón QR */}
                            {integ.tieneQR && cfg.estado === 'conectado' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setModalQR(integ)}
                                className="border-violet-500 text-violet-500 hover:bg-violet-50"
                              >
                                <QrCode className="w-3.5 h-3.5 mr-1.5" /> Generar QR
                              </Button>
                            )}

                            {/* Botón Link de pago */}
                            {integ.tieneLinkPago && cfg.estado === 'conectado' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setModalQR(integ)}
                                className="border-emerald-500 text-emerald-500 hover:bg-emerald-50"
                              >
                                <CreditCard className="w-3.5 h-3.5 mr-1.5" /> Link de Pago
                              </Button>
                            )}

                            {/* Botón Script */}
                            {integ.tieneScript && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setModalScript(true)}
                                className={`${darkMode ? 'border-slate-600 text-gray-400' : ''}`}
                              >
                                <Code2 className="w-3.5 h-3.5 mr-1.5" /> Ver Script
                              </Button>
                            )}

                            {/* Enlace al sitio */}
                            <a href={integ.sitioWeb} target="_blank" rel="noopener noreferrer"
                              className={`inline-flex items-center px-2.5 py-1.5 rounded-md border text-xs font-semibold transition-colors ${darkMode ? 'border-slate-600 text-gray-400 hover:text-white' : 'border-gray-200 text-gray-500 hover:text-gray-700'}`}>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </div>

                          {cfg.ultimaPrueba && (
                            <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              Última prueba: {new Date(cfg.ultimaPrueba).toLocaleString('es-CO')}
                            </p>
                          )}
                        </div>

                        {/* ── Instrucciones ── */}
                        <div className="space-y-4">
                          <h4 className={`text-xs font-bold uppercase tracking-wide ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>📋 Cómo configurar</h4>
                          <div className="space-y-2">
                            {integ.instrucciones.map((paso, i) => (
                              <div key={i} className="flex items-start gap-2.5">
                                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${darkMode ? 'bg-violet-900/50 text-violet-400' : 'bg-violet-100 text-violet-700'}`}>{i + 1}</span>
                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{paso}</p>
                              </div>
                            ))}
                          </div>

                          <div className={`p-3 rounded-xl ${darkMode ? 'bg-slate-700/50' : 'bg-gray-50'}`}>
                            <p className={`text-xs font-bold mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>💡 Usos sugeridos</p>
                            <div className="flex flex-wrap gap-1.5">
                              {integ.usosSugeridos.map(uso => (
                                <span key={uso} className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-600 text-gray-300' : 'bg-white border border-gray-200 text-gray-600'}`}>{uso}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>

      {/* Nota de seguridad */}
      <div className={`p-4 rounded-xl flex gap-3 border text-xs ${darkMode ? 'bg-slate-800/40 border-slate-700 text-gray-500' : 'bg-gray-50 border-gray-200 text-gray-500'}`}>
        <Shield className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
        <p><b className={darkMode ? 'text-gray-300' : 'text-gray-700'}>🔒 Seguridad total:</b> Todas las credenciales se almacenan únicamente en tu dispositivo (localStorage). Nunca se envían a servidores de Codec Studio. El sistema es 100% local y offline-first — las APIs externas solo se contactan cuando tú las pruebas o el POS dispara un evento.</p>
      </div>

      </>}

      {/* ── MODALES ── */}
      <AnimatePresence>
        {modalQR && (
          <ModalQR integ={modalQR} campos={getCfg(modalQR.id).campos} darkMode={darkMode} onClose={() => setModalQR(null)} />
        )}
        {modalScript && (
          <ModalScript darkMode={darkMode} onClose={() => setModalScript(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
