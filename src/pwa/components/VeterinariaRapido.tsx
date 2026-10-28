/**
 * Piezas de Veterinaria que comparten la web y Electron, pensadas para quien
 * no sabe mucho de tecnología: pocos campos, botones grandes.
 *
 *   · CobroRapidoPeluqueria: nombre del perrito + servicio + Cobrar. Sin
 *     tutor, teléfono ni agenda.
 *   · NuevoProductoMascotas: el "+" para crear un producto (entra al
 *     inventario con su cantidad) o un servicio (baño, corte...) que después
 *     aparece en el cobro rápido.
 *
 * No guardan nada: cada plataforma recibe los datos en el callback y los
 * guarda a su manera (Supabase en la web, electronStore en Electron).
 */
import { useEffect, useState } from 'react';
import { Dog, Scissors, ShoppingCart, Package2, Sparkles, X, Loader2, Plus, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { CATEGORIA_CONSULTAS, CATEGORIA_PELUQUERIA } from '../lib/ventasPorArea';

export interface ServicioMascota { nombre: string; precio: number }

/** Los de siempre; los que el negocio crea con el "+" se suman a estos. */
export const SERVICIOS_PELUQUERIA_BASE: ServicioMascota[] = [
  { nombre: 'Baño Básico', precio: 25000 },
  { nombre: 'Baño Medicado', precio: 38000 },
  { nombre: 'Corte de Pelo', precio: 35000 },
  { nombre: 'Corte de Uñas', precio: 12000 },
  { nombre: 'Desparasitación Externa', precio: 20000 },
];

/**
 * Los servicios de peluquería del negocio (su inventario: "BAÑO # 1", "CORTE
 * DE UÑAS"…), sin repetir nombres. Los de ejemplo solo salen si no tiene ninguno.
 */
export function unirServicios(delInventario: ServicioMascota[]): ServicioMascota[] {
  const porNombre = new Map<string, ServicioMascota>();
  for (const s of (delInventario.length > 0 ? delInventario : SERVICIOS_PELUQUERIA_BASE)) {
    if (s.nombre.trim()) porNombre.set(s.nombre.trim().toLowerCase(), { nombre: s.nombre.trim(), precio: s.precio });
  }
  // Orden natural: BAÑO # 1, BAÑO # 2… BAÑO # 10.
  return [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
}

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
const soloDigitos = (v: string) => v.replace(/\D/g, '');

/** Colores de cada plataforma: la web usa la paleta slate (themeClaro.css la repinta), Electron su darkMode. */
export interface TemaVet {
  tarjeta: string; texto: string; suave: string; campo: string; chip: string; chipActivo: string; hoja: string;
}

export const TEMA_WEB: TemaVet = {
  tarjeta: 'bg-slate-900/70 backdrop-blur border border-slate-800 rounded-2xl',
  texto: 'text-white', suave: 'text-slate-400',
  campo: 'w-full h-12 rounded-xl px-4 text-base bg-slate-950 border border-slate-800 text-white outline-none focus:border-purple-500',
  chip: 'bg-slate-950 border border-slate-800 text-slate-300',
  // Morado suave con texto morado: se lee igual en oscuro y en el claro de themeClaro.css.
  chipActivo: 'bg-purple-500/15 border border-purple-500 text-purple-400',
  hoja: 'bg-slate-900 border border-slate-800',
};

export function temaElectron(darkMode: boolean): TemaVet {
  return darkMode
    ? { ...TEMA_WEB, tarjeta: 'bg-slate-800/60 border border-slate-700 rounded-2xl' }
    : {
        tarjeta: 'bg-white border border-gray-200 rounded-2xl shadow-sm',
        texto: 'text-gray-900', suave: 'text-gray-500',
        campo: 'w-full h-12 rounded-xl px-4 text-base bg-gray-50 border border-gray-200 text-gray-900 outline-none focus:border-purple-500',
        chip: 'bg-gray-50 border border-gray-200 text-gray-700',
        chipActivo: 'bg-purple-50 border border-purple-400 text-purple-700',
        hoja: 'bg-white border border-gray-200',
      };
}

// ── Cobro rápido de peluquería ─────────────────────────────────────────────

export function CobroRapidoPeluqueria({ servicios, tema, onCobrar }: {
  servicios: ServicioMascota[];
  tema: TemaVet;
  /** `concepto` ya trae el nombre del perrito: "Corte de Pelo: Toby". */
  onCobrar: (concepto: string, precio: number) => void;
}) {
  const inicial = servicios.find((s) => /corte de pelo/i.test(s.nombre)) || servicios[0];
  const [perrito, setPerrito] = useState('');
  const [servicio, setServicio] = useState<ServicioMascota | undefined>(inicial);
  const [precio, setPrecio] = useState(inicial ? String(inicial.precio) : '');

  // Si llega un servicio nuevo del "+" y no había ninguno elegido.
  useEffect(() => {
    if (!servicio && inicial) { setServicio(inicial); setPrecio(String(inicial.precio)); }
  }, [inicial?.nombre]); // eslint-disable-line react-hooks/exhaustive-deps

  const valor = Number(precio) || 0;
  const listo = !!perrito.trim() && !!servicio && valor > 0;

  const cobrar = () => {
    if (!perrito.trim()) { toast.error('Escribe el nombre del perrito'); return; }
    if (!servicio) { toast.error('Toca el servicio'); return; }
    if (valor <= 0) { toast.error('Escribe el valor'); return; }
    onCobrar(`${servicio.nombre}: ${perrito.trim()}`, valor);
    setPerrito('');
  };

  // Versión compacta de los campos del tema (h-12 → h-11, texto normal).
  const campo = tema.campo.replace('h-12', 'h-11').replace('text-base', 'text-sm');

  return (
    <div className={`${tema.tarjeta} p-4`}>
      <h3 className={`${tema.texto} font-bold text-base flex items-center gap-2 mb-3`}>
        <Scissors className="w-4 h-4 text-purple-500" /> Cobro rápido de peluquería
        <span className={`${tema.suave} text-xs font-normal hidden sm:inline`}>· sin agendar</span>
      </h3>

      {/* Servicio: pastillas pequeñas, la elegida resaltada */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {servicios.map((s) => {
          const activo = servicio?.nombre === s.nombre;
          return (
            <button key={s.nombre} type="button" onClick={() => { setServicio(s); setPrecio(String(s.precio)); }}
              className={`h-9 px-3 rounded-full text-xs font-semibold transition-colors ${activo ? tema.chipActivo : tema.chip}`}>
              {s.nombre} <span className={activo ? 'font-normal' : tema.suave} style={activo ? { color: 'inherit' } : undefined}>· {money(s.precio)}</span>
            </button>
          );
        })}
      </div>

      {/* Perrito, valor y cobrar en una sola fila */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Dog className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-purple-500" />
          <input value={perrito} onChange={(e) => setPerrito(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && listo && cobrar()}
            placeholder="Nombre del perrito" aria-label="Nombre del perrito" className={`${campo} pl-9`} autoComplete="off" />
        </div>
        <div className="relative sm:w-36">
          <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-sm ${tema.suave}`}>$</span>
          <input inputMode="numeric" value={precio} onChange={(e) => setPrecio(soloDigitos(e.target.value))} aria-label="Valor a cobrar" className={`${campo} pl-7`} />
        </div>
        <button onClick={cobrar} disabled={!listo}
          className="h-11 px-5 rounded-xl bg-purple-600 hover:bg-purple-700 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 shrink-0"
          style={{ color: '#fff' }}>
          <ShoppingCart className="w-4 h-4" /> Cobrar
        </button>
      </div>
    </div>
  );
}

// ── "+" Nuevo producto o servicio ──────────────────────────────────────────

export interface NuevoItemMascotas {
  tipo: 'producto' | 'servicio' | 'bulto';
  nombre: string;
  /** Producto y servicio: precio de venta. Bulto: precio por KILO (la báscula pesa en kg). */
  precio: number;
  /** Producto: unidades que hay hoy. Bulto: kilos que hay (bultos × peso). */
  cantidad: number;
  /** Producto: costo por unidad. Bulto: lo que costó un bulto completo. */
  costo: number;
  categoria: string;
  /** Solo bulto. */
  bulto?: { pesoKg: number; especie: 'perro' | 'gato' | 'generales' };
}

/** En Colombia la libra que se pide en la tienda es de 500 g. */
export const KG_POR_LIBRA = 0.5;
const ESPECIES_BULTO = [
  { valor: 'perro', label: 'Perro', categoria: 'Concentrado Perros' },
  { valor: 'gato', label: 'Gato', categoria: 'Concentrado Gatos' },
  { valor: 'generales', label: 'Otro animal', categoria: 'Otros Animales' },
] as const;

export const CATEGORIAS_MASCOTAS = ['Accesorios Mascotas', 'Juguetes', 'Aseo y Belleza', 'Snacks y Premios', 'Medicamentos'];

export function BotonNuevoMascotas({ tema, onGuardar }: {
  tema: TemaVet;
  onGuardar: (item: NuevoItemMascotas) => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button onClick={() => setAbierto(true)}
        className="shrink-0 h-11 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20"
        style={{ color: '#fff' }} title="Crear un producto o un servicio de mascotas">
        <Plus className="w-5 h-5" /> Nuevo
      </button>
      {abierto && <HojaNuevo tema={tema} onGuardar={onGuardar} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function HojaNuevo({ tema, onGuardar, onCerrar }: {
  tema: TemaVet; onGuardar: (item: NuevoItemMascotas) => Promise<void>; onCerrar: () => void;
}) {
  const [tipo, setTipo] = useState<'producto' | 'servicio' | 'bulto' | null>(null);
  const [nombre, setNombre] = useState('');
  const [precio, setPrecio] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costo, setCosto] = useState('');
  const [categoria, setCategoria] = useState(CATEGORIAS_MASCOTAS[0]);
  const [pesoKg, setPesoKg] = useState('');
  const [especie, setEspecie] = useState<'perro' | 'gato' | 'generales'>('perro');
  const [areaServicio, setAreaServicio] = useState<'peluqueria' | 'consultas'>('peluqueria');
  const [guardando, setGuardando] = useState(false);

  // Bulto: la libra que dice el usuario se guarda como precio por kilo.
  const kgBulto = Number(pesoKg.replace(',', '.')) || 0;
  const precioLibra = Number(precio) || 0;
  const precioKilo = precioLibra / KG_POR_LIBRA;
  const costoBulto = Number(costo) || 0;
  const ventaBulto = precioKilo * kgBulto;
  const bultos = Number(cantidad) || 0;

  const guardar = async () => {
    if (!tipo) return;
    if (!nombre.trim()) { toast.error('Escribe el nombre'); return; }
    if (tipo === 'bulto' && kgBulto <= 0) { toast.error('Escribe cuántos kilos trae el bulto'); return; }
    if (!(precioLibra > 0)) { toast.error(tipo === 'bulto' ? 'Escribe en cuánto vendes la libra' : 'Escribe el precio de venta'); return; }
    setGuardando(true);
    try {
      if (tipo === 'bulto') {
        await onGuardar({
          tipo, nombre: nombre.trim(), precio: precioKilo, cantidad: bultos * kgBulto, costo: costoBulto,
          categoria: ESPECIES_BULTO.find((e) => e.valor === especie)!.categoria,
          bulto: { pesoKg: kgBulto, especie },
        });
      } else {
        await onGuardar({
          tipo, nombre: nombre.trim(), precio: precioLibra,
          cantidad: tipo === 'producto' ? bultos : 0,
          costo: costoBulto,
          categoria: tipo === 'producto' ? categoria : areaServicio === 'peluqueria' ? CATEGORIA_PELUQUERIA : CATEGORIA_CONSULTAS,
        });
      }
      toast.success(tipo === 'servicio' ? `Servicio ${nombre.trim()} creado` : `${nombre.trim()} quedó en el inventario`);
      onCerrar();
    } catch (e: any) {
      toast.error('No se pudo guardar', { description: e?.message });
    } finally {
      setGuardando(false);
    }
  };

  const etiqueta = `${tema.suave} text-xs font-bold`;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={onCerrar}>
      <div className={`w-full sm:max-w-md ${tema.hoja} rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className={`${tema.texto} text-lg font-bold`}>{tipo === 'producto' ? 'Nuevo producto' : tipo === 'servicio' ? 'Nuevo servicio' : tipo === 'bulto' ? 'Nuevo bulto (se vende por libra)' : '¿Qué quieres crear?'}</h3>
          <button onClick={onCerrar} className={tema.suave} aria-label="Cerrar"><X className="w-5 h-5" /></button>
        </div>

        {!tipo ? (
          <div className="grid grid-cols-1 gap-3">
            <button onClick={() => setTipo('producto')} className={`${tema.chip} rounded-2xl p-4 flex items-center gap-4 text-left`}>
              <span className="w-12 h-12 rounded-xl bg-sky-500/15 flex items-center justify-center shrink-0"><Package2 className="w-6 h-6 text-sky-500" /></span>
              <span><span className={`block font-bold ${tema.texto}`}>Producto</span><span className={`block text-sm ${tema.suave}`}>Algo que se vende y se cuenta: collar, juguete, champú, medicamento…</span></span>
            </button>
            <button onClick={() => { setTipo('bulto'); setCantidad('1'); }} className={`${tema.chip} rounded-2xl p-4 flex items-center gap-4 text-left`}>
              <span className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0"><Scale className="w-6 h-6 text-amber-500" /></span>
              <span><span className={`block font-bold ${tema.texto}`}>Bulto de concentrado</span><span className={`block text-sm ${tema.suave}`}>Se compra por bulto y se vende por libra en la báscula.</span></span>
            </button>
            <button onClick={() => setTipo('servicio')} className={`${tema.chip} rounded-2xl p-4 flex items-center gap-4 text-left`}>
              <span className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center shrink-0"><Sparkles className="w-6 h-6 text-purple-500" /></span>
              <span><span className={`block font-bold ${tema.texto}`}>Servicio</span><span className={`block text-sm ${tema.suave}`}>Un trabajo que se cobra sin inventario: baño, corte, consulta, vacunación…</span></span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className={etiqueta}>Nombre</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus
                placeholder={tipo === 'producto' ? 'Ej: Collar antipulgas' : tipo === 'bulto' ? 'Ej: Chunky adulto 25 kg' : 'Ej: Baño y corte raza grande'} className={`${tema.campo} mt-1`} />
            </div>
            {tipo === 'bulto' ? (
              <>
                <div>
                  <label className={etiqueta}>¿Para qué animal?</label>
                  <div className="mt-1 grid grid-cols-3 gap-2">
                    {ESPECIES_BULTO.map((e) => (
                      <button key={e.valor} type="button" onClick={() => setEspecie(e.valor)}
                        className={`h-11 rounded-xl text-sm font-bold ${especie === e.valor ? 'bg-amber-500 text-slate-950' : tema.chip}`}>{e.label}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={etiqueta}>¿Cuántos kilos trae el bulto?</label>
                    <input inputMode="decimal" value={pesoKg} onChange={(e) => setPesoKg(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Ej: 25" className={`${tema.campo} mt-1`} />
                  </div>
                  <div>
                    <label className={etiqueta}>¿Cuánto te costó el bulto?</label>
                    <input inputMode="numeric" value={costo} onChange={(e) => setCosto(soloDigitos(e.target.value))} placeholder="Ej: 180000" className={`${tema.campo} mt-1`} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={etiqueta}>¿En cuánto vendes la libra?</label>
                    <input inputMode="numeric" value={precio} onChange={(e) => setPrecio(soloDigitos(e.target.value))} placeholder="Ej: 4500" className={`${tema.campo} mt-1`} />
                  </div>
                  <div>
                    <label className={etiqueta}>¿Cuántos bultos tienes?</label>
                    <input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(soloDigitos(e.target.value))} placeholder="Ej: 1" className={`${tema.campo} mt-1`} />
                  </div>
                </div>
                {kgBulto > 0 && precioLibra > 0 && (
                  <div className={`${tema.chip} rounded-xl p-3 text-sm space-y-0.5`}>
                    <p className={tema.suave}>1 libra = 500 g · kilo a <b className={tema.texto}>{money(precioKilo)}</b></p>
                    <p className={tema.suave}>Vendiendo todo el bulto recibes <b className={tema.texto}>{money(ventaBulto)}</b></p>
                    {costoBulto > 0 && (
                      <p className={`font-bold ${ventaBulto >= costoBulto ? 'text-emerald-500' : 'text-red-500'}`}>
                        {ventaBulto >= costoBulto ? `Ganas ${money(ventaBulto - costoBulto)} por bulto` : `Pierdes ${money(costoBulto - ventaBulto)} por bulto: sube el precio de la libra`}
                      </p>
                    )}
                    {bultos > 0 && <p className={tema.suave}>Entran al inventario <b className={tema.texto}>{(bultos * kgBulto).toLocaleString('es-CO')} kg</b> ({bultos} {bultos === 1 ? 'bulto' : 'bultos'})</p>}
                  </div>
                )}
              </>
            ) : (
              <>
              {tipo === 'servicio' && (
                <div>
                  <label className={etiqueta}>¿De qué área es?</label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {([['peluqueria', 'Peluquería', 'baño, corte, uñas'], ['consultas', 'Veterinaria', 'consulta o procedimiento']] as const).map(([valor, titulo, detalle]) => (
                      <button key={valor} type="button" onClick={() => setAreaServicio(valor)}
                        className={`rounded-xl px-3 py-2 text-left ${areaServicio === valor ? tema.chipActivo : tema.chip}`}>
                        <span className="block text-sm font-bold">{titulo}</span>
                        <span className={`block text-xs ${areaServicio === valor ? 'opacity-80' : tema.suave}`}>{detalle}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className={etiqueta}>Precio de venta</label>
                <input inputMode="numeric" value={precio} onChange={(e) => setPrecio(soloDigitos(e.target.value))} placeholder="Ej: 25000" className={`${tema.campo} mt-1`} />
              </div>
              </>
            )}
            {tipo === 'producto' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={etiqueta}>¿Cuántos tienes?</label>
                    <input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(soloDigitos(e.target.value))} placeholder="Ej: 10" className={`${tema.campo} mt-1`} />
                  </div>
                  <div>
                    <label className={etiqueta}>Costo (opcional)</label>
                    <input inputMode="numeric" value={costo} onChange={(e) => setCosto(soloDigitos(e.target.value))} placeholder="Lo que te costó" className={`${tema.campo} mt-1`} />
                  </div>
                </div>
                <div>
                  <label className={etiqueta}>Tipo de producto</label>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={`${tema.campo} mt-1`}>
                    {CATEGORIAS_MASCOTAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </>
            )}
            <div className="flex gap-3 pt-2">
              <button onClick={() => setTipo(null)} className={`h-12 px-4 rounded-xl ${tema.chip} font-semibold`}>Atrás</button>
              <button onClick={guardar} disabled={guardando}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 font-bold flex items-center justify-center gap-2 disabled:opacity-50" style={{ color: '#fff' }}>
                {guardando && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
