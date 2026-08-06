/**
 * 🖨️ PÁGINA DE CÓDIGOS DE BARRAS
 * Generador y diseñador de etiquetas
 */

import React, { useState, useEffect } from 'react';
import { Barcode, Plus, Printer, Download, Edit } from 'lucide-react';
import {
  generarCodigoPLU,
  generarCodigoEAN13,
  registrarCodigoGenerado,
  generarImagenCodigoBarras,
  generarDataURLCodigoBarras,
  PlantillaEtiqueta,
  listarPlantillasEtiquetas,
  crearPlantillasPredefinidas,
  imprimirEtiquetas,
} from '../lib/codigosBarrasService';
import { toast } from 'sonner';

export default function CodigosBarrasPage() {
  const [plantillas, setPlantillas] = useState<PlantillaEtiqueta[]>([]);
  const [vistaActual, setVistaActual] = useState<'generador' | 'plantillas'>('generador');
  const [loading, setLoading] = useState(false);

  // Form generador
  const [formCodigo, setFormCodigo] = useState({
    tipo: 'EAN13' as 'PLU' | 'EAN13',
    productoNombre: '',
    precio: 0,
    categoria: '',
    cantidad: 1,
  });

  const [codigoGenerado, setCodigoGenerado] = useState<string | null>(null);
  const [imagenCodigo, setImagenCodigo] = useState<string | null>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      let plantillasData = await listarPlantillasEtiquetas();
      if (plantillasData.length === 0) {
        await crearPlantillasPredefinidas();
        plantillasData = await listarPlantillasEtiquetas();
      }
      setPlantillas(plantillasData);
    } catch (error) {
      console.error('Error cargando datos:', error);
      toast.error('Error cargando datos');
    }
  };

  const handleGenerarCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const codigo = formCodigo.tipo === 'PLU' 
        ? await generarCodigoPLU()
        : await generarCodigoEAN13();

      setCodigoGenerado(codigo);

      // Generar imagen
      const dataURL = generarDataURLCodigoBarras(codigo, formCodigo.tipo === 'PLU' ? 'CODE128' : 'EAN13');
      setImagenCodigo(dataURL);

      // Registrar en BD
      await registrarCodigoGenerado({
        codigo,
        tipo: formCodigo.tipo === 'PLU' ? 'PLU' : 'EAN13',
        productoId: `PROD-${Date.now()}`,
        productoNombre: formCodigo.productoNombre,
      });

      toast.success('Código generado exitosamente');
    } catch (error) {
      console.error('Error generando código:', error);
      toast.error('Error generando código');
    } finally {
      setLoading(false);
    }
  };

  const handleImprimir = async () => {
    if (!codigoGenerado || !plantillas[0]) return;

    try {
      await imprimirEtiquetas(
        plantillas[0].id,
        [{
          codigoBarras: codigoGenerado,
          nombre: formCodigo.productoNombre,
          precio: formCodigo.precio,
          categoria: formCodigo.categoria,
        }],
        formCodigo.cantidad
      );
      toast.success(`Imprimiendo ${formCodigo.cantidad} etiqueta(s)`);
    } catch (error) {
      toast.error('Error imprimiendo etiquetas');
    }
  };

  const handleDescargar = () => {
    if (!imagenCodigo) return;

    const link = document.createElement('a');
    link.href = imagenCodigo;
    link.download = `codigo-${codigoGenerado}.png`;
    link.click();
    toast.success('Código descargado');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Barcode className="w-8 h-8 text-blue-600" />
          Códigos de Barras
        </h1>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setVistaActual('generador')}
            className={`pb-3 border-b-2 font-semibold ${
              vistaActual === 'generador'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Generador
          </button>
          <button
            onClick={() => setVistaActual('plantillas')}
            className={`pb-3 border-b-2 font-semibold ${
              vistaActual === 'plantillas'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Plantillas ({plantillas.length})
          </button>
        </div>
      </div>

      {/* Vista Generador */}
      {vistaActual === 'generador' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Formulario */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">Generar Nuevo Código</h2>

            <form onSubmit={handleGenerarCodigo} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Tipo de Código *</label>
                <select
                  value={formCodigo.tipo}
                  onChange={(e) => setFormCodigo({ ...formCodigo, tipo: e.target.value as any })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="EAN13">EAN-13 (13 dígitos)</option>
                  <option value="PLU">PLU (4-5 dígitos)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {formCodigo.tipo === 'EAN13' 
                    ? 'Código internacional estándar con checksum automático'
                    : 'Código interno de la tienda para productos sin EAN'
                  }
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Nombre del Producto *</label>
                <input
                  type="text"
                  required
                  value={formCodigo.productoNombre}
                  onChange={(e) => setFormCodigo({ ...formCodigo, productoNombre: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Arroz Diana 500g"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Precio</label>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={formCodigo.precio}
                    onChange={(e) => setFormCodigo({ ...formCodigo, precio: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="$0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Categoría</label>
                  <input
                    type="text"
                    value={formCodigo.categoria}
                    onChange={(e) => setFormCodigo({ ...formCodigo, categoria: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Ej: Granos"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Cantidad a Imprimir</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={formCodigo.cantidad}
                  onChange={(e) => setFormCodigo({ ...formCodigo, cantidad: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-semibold"
              >
                {loading ? 'Generando...' : 'Generar Código'}
              </button>
            </form>
          </div>

          {/* Previsualización */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">Previsualización</h2>

            {!codigoGenerado ? (
              <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-lg">
                <div className="text-center text-gray-500">
                  <Barcode className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Genera un código para ver la previsualización</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Código */}
                <div className="bg-gray-50 p-4 rounded-lg text-center">
                  <div className="text-xs text-gray-500 mb-2">Código Generado</div>
                  <div className="text-2xl font-mono font-bold">{codigoGenerado}</div>
                </div>

                {/* Imagen */}
                {imagenCodigo && (
                  <div className="border rounded-lg p-4 bg-white flex justify-center">
                    <img 
                      src={imagenCodigo} 
                      alt="Código de barras"
                      className="max-w-full"
                    />
                  </div>
                )}

                {/* Etiqueta Preview */}
                <div className="border-2 border-dashed rounded-lg p-4">
                  <div className="text-xs text-gray-500 mb-2 text-center">Vista de Etiqueta</div>
                  <div className="bg-white border rounded p-3 max-w-xs mx-auto">
                    <div className="text-center mb-2">
                      <div className="font-bold text-sm">{formCodigo.productoNombre}</div>
                      {formCodigo.categoria && (
                        <div className="text-xs text-gray-500">{formCodigo.categoria}</div>
                      )}
                    </div>
                    {imagenCodigo && (
                      <img 
                        src={imagenCodigo} 
                        alt="Código"
                        className="w-full mb-2"
                      />
                    )}
                    {formCodigo.precio > 0 && (
                      <div className="text-center text-xl font-bold text-green-600">
                        ${formCodigo.precio.toLocaleString('es-CO')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleDescargar}
                    className="bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700 flex items-center justify-center gap-2"
                  >
                    <Download className="w-5 h-5" />
                    Descargar
                  </button>
                  <button
                    onClick={handleImprimir}
                    className="bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2"
                  >
                    <Printer className="w-5 h-5" />
                    Imprimir ({formCodigo.cantidad})
                  </button>
                </div>

                <button
                  onClick={() => {
                    setCodigoGenerado(null);
                    setImagenCodigo(null);
                    setFormCodigo({ ...formCodigo, productoNombre: '', precio: 0, categoria: '' });
                  }}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
                >
                  Generar Otro Código
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Vista Plantillas */}
      {vistaActual === 'plantillas' && (
        <div>
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              💡 Las plantillas definen cómo se imprimirán las etiquetas en tu impresora térmica.
              Puedes personalizar los campos, posiciones y tamaños.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plantillas.map((plantilla) => (
              <div key={plantilla.id} className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold">{plantilla.nombre}</h3>
                    <div className="text-xs text-gray-500">
                      {plantilla.ancho}mm x {plantilla.alto}mm
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    plantilla.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {plantilla.activa ? 'Activa' : 'Inactiva'}
                  </span>
                </div>

                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-2">Formato:</div>
                  <div className="font-semibold">{plantilla.formato}</div>
                </div>

                <div className="mb-4">
                  <div className="text-xs text-gray-500 mb-2">Campos incluidos:</div>
                  <div className="flex flex-wrap gap-1">
                    {plantilla.campos.map((campo, idx) => (
                      <span key={idx} className="px-2 py-1 bg-gray-100 text-xs rounded">
                        {campo.tipo.replace('_', ' ')}
                      </span>
                    ))}
                  </div>
                </div>

                <button className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2">
                  <Edit className="w-4 h-4" />
                  Editar Plantilla
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
