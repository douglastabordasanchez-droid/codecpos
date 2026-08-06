/**
 * 🖨️ SERVICIO DE GENERACIÓN DE CÓDIGOS DE BARRAS
 * Generación de códigos PLU y EAN-13 para productos sin código
 * 100% offline - jsbarcode
 */

import JsBarcode from 'jsbarcode';
import { openDB } from './indexedDB';
import { logAction } from './logger';
import { getPrinterForSectionOrUndefined } from './sectionPrinterConfig';

export interface CodigoGenerado {
  id: string;
  codigo: string;
  tipo: 'PLU' | 'EAN13' | 'CODE128';
  productoId: string;
  productoNombre: string;
  fechaGeneracion: string;
  usuario: string;
  impreso: boolean;
  vecesImpreso: number;
}

function detectarFormatoCodigoBarras(codigo: string): 'EAN13' | 'CODE128' {
  return /^\d{13}$/.test(codigo) ? 'EAN13' : 'CODE128';
}

export interface PlantillaEtiqueta {
  id: string;
  nombre: string;
  ancho: number; // mm
  alto: number; // mm
  formato: '58mm' | '80mm' | 'custom';
  campos: CampoEtiqueta[];
  activa: boolean;
}

export interface CampoEtiqueta {
  tipo: 'codigo_barras' | 'nombre' | 'precio' | 'categoria' | 'fecha' | 'texto_libre';
  x: number;
  y: number;
  ancho?: number;
  alto?: number;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  align?: 'left' | 'center' | 'right';
  valor?: string; // Para texto libre
}

/**
 * Generar código PLU (4-5 dígitos)
 */
export async function generarCodigoPLU(): Promise<string> {
  try {
    const db = await openDB();
    const codigos = await db.getAll('codigosGenerados');
    
    // Rango PLU: 3000-4999 (códigos internos de la tienda)
    const codigosExistentes = codigos
      .filter(c => c.tipo === 'PLU')
      .map(c => parseInt(c.codigo));
    
    let nuevoCodigo = 3000;
    
    while (codigosExistentes.includes(nuevoCodigo) && nuevoCodigo < 5000) {
      nuevoCodigo++;
    }
    
    if (nuevoCodigo >= 5000) {
      throw new Error('Se han agotado los códigos PLU disponibles');
    }
    
    return nuevoCodigo.toString();
  } catch (error) {
    console.error('Error generando código PLU:', error);
    throw error;
  }
}

/**
 * Generar código EAN-13
 */
export async function generarCodigoEAN13(prefijo = '200'): Promise<string> {
  try {
    const db = await openDB();
    const codigos = await db.getAll('codigosGenerados');
    
    // Generar 9 dígitos aleatorios
    let encontrado = false;
    let codigo = '';
    
    while (!encontrado) {
      const numeroAleatorio = Math.floor(Math.random() * 1000000000)
        .toString()
        .padStart(9, '0');
      
      const codigoSinChecksum = prefijo + numeroAleatorio;
      const checksum = calcularChecksumEAN13(codigoSinChecksum);
      codigo = codigoSinChecksum + checksum;
      
      // Verificar que no exista
      const existe = codigos.some(c => c.codigo === codigo);
      if (!existe) {
        encontrado = true;
      }
    }
    
    return codigo;
  } catch (error) {
    console.error('Error generando código EAN-13:', error);
    throw error;
  }
}

/**
 * Calcular dígito de verificación EAN-13
 */
function calcularChecksumEAN13(codigo: string): string {
  let suma = 0;
  for (let i = 0; i < codigo.length; i++) {
    const digito = parseInt(codigo[i]);
    suma += i % 2 === 0 ? digito : digito * 3;
  }
  const checksum = (10 - (suma % 10)) % 10;
  return checksum.toString();
}

/**
 * Validar código EAN-13
 */
export function validarEAN13(codigo: string): boolean {
  if (!/^\d{13}$/.test(codigo)) {
    return false;
  }
  
  const codigoSinChecksum = codigo.substring(0, 12);
  const checksumEsperado = codigo[12];
  const checksumCalculado = calcularChecksumEAN13(codigoSinChecksum);
  
  return checksumEsperado === checksumCalculado;
}

/**
 * Registrar código generado
 */
export async function registrarCodigoGenerado(datos: {
  codigo: string;
  tipo: CodigoGenerado['tipo'];
  productoId: string;
  productoNombre: string;
}): Promise<CodigoGenerado> {
  try {
    const db = await openDB();
    
    const codigoGenerado: CodigoGenerado = {
      id: `COD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      codigo: datos.codigo,
      tipo: datos.tipo,
      productoId: datos.productoId,
      productoNombre: datos.productoNombre,
      fechaGeneracion: new Date().toISOString(),
      usuario: localStorage.getItem('usuario_actual') || 'Sistema',
      impreso: false,
      vecesImpreso: 0,
    };
    
    await db.put('codigosGenerados', codigoGenerado);
    
    await logAction('codigos_barras', 'codigo_generado', {
      codigo: datos.codigo,
      tipo: datos.tipo,
      producto: datos.productoNombre,
    });
    
    return codigoGenerado;
  } catch (error) {
    console.error('Error registrando código:', error);
    throw error;
  }
}

/**
 * Generar imagen de código de barras (SVG)
 */
export function generarImagenCodigoBarras(
  codigo: string,
  formato: 'EAN13' | 'CODE128' | 'CODE39' = 'EAN13',
  opciones?: {
    ancho?: number;
    alto?: number;
    mostrarTexto?: boolean;
    margen?: number;
  }
): string {
  try {
    // Crear elemento SVG temporal
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    
    JsBarcode(svg, codigo, {
      format: formato,
      width: opciones?.ancho || 2,
      height: opciones?.alto || 100,
      displayValue: opciones?.mostrarTexto !== false,
      margin: opciones?.margen || 10,
      background: '#ffffff',
      lineColor: '#000000',
    });
    
    // Convertir a string
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    
    return svgString;
  } catch (error) {
    console.error('Error generando imagen:', error);
    throw error;
  }
}

/**
 * Generar imagen de código de barras como Data URL
 */
export function generarDataURLCodigoBarras(
  codigo: string,
  formato: 'EAN13' | 'CODE128' | 'CODE39' = 'EAN13'
): string {
  try {
    // Crear canvas temporal
    const canvas = document.createElement('canvas');
    
    JsBarcode(canvas, codigo, {
      format: formato,
      width: 2,
      height: 100,
      displayValue: true,
      margin: 10,
      background: '#ffffff',
      lineColor: '#000000',
    });
    
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Error generando data URL:', error);
    throw error;
  }
}

/**
 * Crear plantilla de etiqueta
 */
export async function crearPlantillaEtiqueta(
  datos: Partial<PlantillaEtiqueta>
): Promise<PlantillaEtiqueta> {
  try {
    const db = await openDB();
    
    const plantilla: PlantillaEtiqueta = {
      id: `PLANT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      nombre: datos.nombre || 'Nueva plantilla',
      ancho: datos.ancho || 58,
      alto: datos.alto || 40,
      formato: datos.formato || '58mm',
      campos: datos.campos || [],
      activa: datos.activa !== undefined ? datos.activa : true,
    };
    
    await db.put('plantillasEtiquetas', plantilla);
    
    await logAction('codigos_barras', 'plantilla_creada', {
      plantillaId: plantilla.id,
      nombre: plantilla.nombre,
    });
    
    return plantilla;
  } catch (error) {
    console.error('Error creando plantilla:', error);
    throw error;
  }
}

/**
 * Obtener plantillas de etiquetas
 */
export async function listarPlantillasEtiquetas(): Promise<PlantillaEtiqueta[]> {
  try {
    const db = await openDB();
    return await db.getAll('plantillasEtiquetas');
  } catch (error) {
    console.error('Error listando plantillas:', error);
    return [];
  }
}

/**
 * Generar HTML de etiqueta para impresión
 */
export function generarHTMLEtiqueta(
  plantilla: PlantillaEtiqueta,
  datos: {
    codigoBarras?: string;
    nombre?: string;
    precio?: number;
    categoria?: string;
  }
): string {
  const anchoMM = plantilla.ancho;
  const altoMM = plantilla.alto;
  
  let html = `
    <div style="
      width: ${anchoMM}mm;
      height: ${altoMM}mm;
      padding: 2mm;
      background: white;
      border: 1px dashed #ccc;
      position: relative;
      page-break-after: always;
    ">
  `;
  
  plantilla.campos.forEach(campo => {
    switch (campo.tipo) {
      case 'codigo_barras':
        if (datos.codigoBarras) {
          const formatoCodigo = detectarFormatoCodigoBarras(datos.codigoBarras);
          const svgCodigo = generarImagenCodigoBarras(datos.codigoBarras, formatoCodigo, {
            ancho: 1,
            alto: 40,
            mostrarTexto: true,
          });
          
          html += `
            <div style="
              position: absolute;
              left: ${campo.x}mm;
              top: ${campo.y}mm;
              width: ${campo.ancho || 40}mm;
            ">
              ${svgCodigo}
            </div>
          `;
        }
        break;
      
      case 'nombre':
        if (datos.nombre) {
          html += `
            <div style="
              position: absolute;
              left: ${campo.x}mm;
              top: ${campo.y}mm;
              width: ${campo.ancho || anchoMM - 4}mm;
              font-size: ${campo.fontSize || 12}px;
              font-weight: ${campo.fontWeight || 'bold'};
              text-align: ${campo.align || 'center'};
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            ">
              ${datos.nombre}
            </div>
          `;
        }
        break;
      
      case 'precio':
        if (datos.precio !== undefined) {
          html += `
            <div style="
              position: absolute;
              left: ${campo.x}mm;
              top: ${campo.y}mm;
              font-size: ${campo.fontSize || 16}px;
              font-weight: ${campo.fontWeight || 'bold'};
              text-align: ${campo.align || 'right'};
            ">
              $${datos.precio.toLocaleString('es-CO')}
            </div>
          `;
        }
        break;
      
      case 'categoria':
        if (datos.categoria) {
          html += `
            <div style="
              position: absolute;
              left: ${campo.x}mm;
              top: ${campo.y}mm;
              font-size: ${campo.fontSize || 10}px;
              text-align: ${campo.align || 'left'};
              color: #666;
            ">
              ${datos.categoria}
            </div>
          `;
        }
        break;
      
      case 'fecha':
        html += `
          <div style="
            position: absolute;
            left: ${campo.x}mm;
            top: ${campo.y}mm;
            font-size: ${campo.fontSize || 8}px;
            text-align: ${campo.align || 'left'};
            color: #999;
          ">
            ${new Date().toLocaleDateString('es-CO')}
          </div>
        `;
        break;
      
      case 'texto_libre':
        if (campo.valor) {
          html += `
            <div style="
              position: absolute;
              left: ${campo.x}mm;
              top: ${campo.y}mm;
              font-size: ${campo.fontSize || 10}px;
              font-weight: ${campo.fontWeight || 'normal'};
              text-align: ${campo.align || 'left'};
            ">
              ${campo.valor}
            </div>
          `;
        }
        break;
    }
  });
  
  html += `</div>`;
  
  return html;
}

/**
 * Imprimir etiquetas
 */
export async function imprimirEtiquetas(
  plantillaId: string,
  productos: Array<{
    codigoBarras: string;
    nombre: string;
    precio: number;
    categoria?: string;
  }>,
  cantidad = 1
): Promise<void> {
  try {
    const db = await openDB();
    const plantilla = await db.get('plantillasEtiquetas', plantillaId);
    
    if (!plantilla) {
      throw new Error('Plantilla no encontrada');
    }
    
    let htmlCompleto = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Etiquetas</title>
        <style>
          @page {
            size: ${plantilla.ancho}mm ${plantilla.alto}mm;
            margin: 0;
          }
          body {
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body>
    `;
    
    productos.forEach(producto => {
      for (let i = 0; i < cantidad; i++) {
        htmlCompleto += generarHTMLEtiqueta(plantilla, producto);
      }
    });
    
    htmlCompleto += `
      </body>
      </html>
    `;
    
    // ── Impresión silenciosa via Electron IPC (Electron) ──────────────────────
    const el = (window as any).electron;
    if (el?.printer?.printLabel) {
      // Leer impresora configurada para etiquetas / códigos de barras
      let printerName = '';
      try {
        printerName = getPrinterForSectionOrUndefined('codigos_barras')
          || localStorage.getItem('printer_barras')
          || localStorage.getItem('pos-printer-etiquetas')
          || localStorage.getItem('pos-default-printer-name')
          || '';
      } catch { /* usar cadena vacía → Windows elige la default */ }

      const result = await el.printer.printLabel({
        printerName,
        html:      htmlCompleto,
        widthMm:   plantilla.ancho,
        heightMm:  plantilla.alto,
      });

      if (!result.ok) {
        console.warn('[Etiquetas] IPC print-label falló:', result.error, '— usando ventana de impresión');
        _imprimirConVentana(htmlCompleto);
      }
    } else {
      // ── Fallback: ventana del navegador (dev / no Electron) ────────────────
      _imprimirConVentana(htmlCompleto);
    }
    
    // Registrar impresión
    for (const producto of productos) {
      const codigo = await db.getAll('codigosGenerados');
      const codigoGenerado = codigo.find(c => c.codigo === producto.codigoBarras);
      
      if (codigoGenerado) {
        await db.put('codigosGenerados', {
          ...codigoGenerado,
          impreso: true,
          vecesImpreso: codigoGenerado.vecesImpreso + cantidad,
        });
      }
    }
    
    await logAction('codigos_barras', 'etiquetas_impresas', {
      cantidad: productos.length * cantidad,
      plantilla: plantilla.nombre,
    });
  } catch (error) {
    console.error('Error imprimiendo etiquetas:', error);
    throw error;
  }
}

function _imprimirConVentana(html: string) {
  const el = (window as any).electron;
  if (el?.print?.printHtml) {
    // Impresión nativa Electron — sin popup ni ventanas emergentes
    const printerName = (() => {
      try {
        return (
          getPrinterForSectionOrUndefined('codigos_barras') ||
          localStorage.getItem('printer_barras') ||
          localStorage.getItem('pos-printer-etiquetas') ||
          localStorage.getItem('pos-default-printer-name') ||
          ''
        );
      } catch { return ''; }
    })();
    el.print.printHtml({ html, silent: true, printerName }).catch(() => {});
  }
}

/**
 * Crear plantillas predefinidas
 */
export async function crearPlantillasPredefinidas(): Promise<void> {
  try {
    const plantillas = await listarPlantillasEtiquetas();
    
    if (plantillas.length > 0) {
      return; // Ya existen plantillas
    }
    
    // Plantilla 58mm básica
    await crearPlantillaEtiqueta({
      nombre: 'Básica 58mm',
      ancho: 58,
      alto: 40,
      formato: '58mm',
      campos: [
        {
          tipo: 'nombre',
          x: 2,
          y: 2,
          ancho: 54,
          fontSize: 11,
          fontWeight: 'bold',
          align: 'center',
        },
        {
          tipo: 'codigo_barras',
          x: 9,
          y: 10,
          ancho: 40,
        },
        {
          tipo: 'precio',
          x: 2,
          y: 30,
          fontSize: 18,
          fontWeight: 'bold',
          align: 'center',
        },
      ],
    });
    
    // Plantilla 80mm con categoría
    await crearPlantillaEtiqueta({
      nombre: 'Completa 80mm',
      ancho: 80,
      alto: 50,
      formato: '80mm',
      campos: [
        {
          tipo: 'nombre',
          x: 2,
          y: 2,
          ancho: 76,
          fontSize: 14,
          fontWeight: 'bold',
          align: 'center',
        },
        {
          tipo: 'categoria',
          x: 2,
          y: 10,
          fontSize: 10,
          align: 'left',
        },
        {
          tipo: 'codigo_barras',
          x: 20,
          y: 15,
          ancho: 40,
        },
        {
          tipo: 'precio',
          x: 2,
          y: 38,
          fontSize: 20,
          fontWeight: 'bold',
          align: 'center',
        },
        {
          tipo: 'fecha',
          x: 60,
          y: 45,
          fontSize: 8,
          align: 'right',
        },
      ],
    });
    
    await logAction('codigos_barras', 'plantillas_predefinidas_creadas', {});
  } catch (error) {
    console.error('Error creando plantillas predefinidas:', error);
  }
}
