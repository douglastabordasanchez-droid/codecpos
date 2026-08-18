/**
 * Modal de Venta a Cartera (crédito a clientes) - CodecPOS v2.0
 * Busca o crea un cliente, define cuánto paga ahora y en cuántos días
 * vence el saldo restante.
 */

import { useState, useEffect, useRef } from 'react';
import {
  X,
  Search,
  UserPlus,
  User,
  CheckCircle2,
  Wallet,
  Calendar,
  ArrowLeft,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { toast } from 'sonner';
import {
  Cliente,
  buscarClientesPorTexto,
  crearCliente,
} from '../../lib/fidelizacionService';

export interface DatosVentaCartera {
  clienteId: string;
  clienteNombre: string;
  clienteTelefono?: string;
  clienteDocumento?: string;
  montoAbonoInicial: number;
  metodoAbonoInicial: string;
  diasCredito: number;
}

interface ModalVentaCarteraProps {
  isOpen: boolean;
  onClose: () => void;
  totalVenta: number;
  diasCreditoDefault?: number;
  metodosAbono?: Array<{ id: string; label: string }>;
  onConfirm: (datos: DatosVentaCartera) => void;
}

const METODOS_ABONO_DEFAULT = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'nequi', label: 'Nequi' },
  { id: 'daviplata', label: 'Daviplata' },
];

export function ModalVentaCartera({
  isOpen,
  onClose,
  totalVenta,
  diasCreditoDefault = 30,
  metodosAbono = METODOS_ABONO_DEFAULT,
  onConfirm,
}: ModalVentaCarteraProps) {
  const [paso, setPaso] = useState<'buscar' | 'crear' | 'credito'>('buscar');
  const [busqueda, setBusqueda] = useState('');
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoDocumento, setNuevoDocumento] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevaDireccion, setNuevaDireccion] = useState('');
  const [creandoCliente, setCreandoCliente] = useState(false);

  const [montoAbono, setMontoAbono] = useState('0');
  const [metodoAbono, setMetodoAbono] = useState(metodosAbono[0]?.id || 'efectivo');
  const [diasCredito, setDiasCredito] = useState(String(diasCreditoDefault));

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    reset();
  }, [isOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!busqueda.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    debounceRef.current = setTimeout(async () => {
      const res = await buscarClientesPorTexto(busqueda).catch(() => []);
      setResultados(res);
      setBuscando(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busqueda]);

  const reset = () => {
    setPaso('buscar');
    setBusqueda('');
    setResultados([]);
    setClienteSeleccionado(null);
    setNuevoNombre('');
    setNuevoDocumento('');
    setNuevoTelefono('');
    setNuevaDireccion('');
    setMontoAbono('0');
    setMetodoAbono(metodosAbono[0]?.id || 'efectivo');
    setDiasCredito(String(diasCreditoDefault));
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const seleccionarCliente = (c: Cliente) => {
    setClienteSeleccionado(c);
    setPaso('credito');
  };

  const handleCrearCliente = async () => {
    if (!nuevoNombre.trim() || !nuevoDocumento.trim() || !nuevoTelefono.trim()) {
      toast.error('Nombre, cédula y teléfono son obligatorios');
      return;
    }
    setCreandoCliente(true);
    try {
      const cliente = await crearCliente({
        nombre: nuevoNombre.trim(),
        documento: nuevoDocumento.trim(),
        telefono: nuevoTelefono.trim(),
        direccion: nuevaDireccion.trim() || undefined,
      });
      toast.success(`Cliente ${cliente.nombre} creado`);
      seleccionarCliente(cliente);
    } catch (error) {
      toast.error('No se pudo crear el cliente');
      console.error(error);
    } finally {
      setCreandoCliente(false);
    }
  };

  const parseMonto = (v: string) => {
    const n = parseFloat(v.replace(/[^0-9]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  const montoAbonoNum = Math.min(parseMonto(montoAbono), totalVenta);
  const saldoPendiente = Math.max(0, totalVenta - montoAbonoNum);
  const diasCreditoNum = Math.max(1, parseInt(diasCredito) || diasCreditoDefault);
  const fechaVencimiento = new Date();
  fechaVencimiento.setDate(fechaVencimiento.getDate() + diasCreditoNum);

  const formatCurrency = (value: number) =>
    `$${value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const handleConfirmar = () => {
    if (!clienteSeleccionado) return;
    if (saldoPendiente <= 0) {
      toast.error('Si el cliente paga el total, usa un método de pago normal en vez de Cartera');
      return;
    }
    onConfirm({
      clienteId: clienteSeleccionado.id,
      clienteNombre: clienteSeleccionado.nombre,
      clienteTelefono: clienteSeleccionado.telefono,
      clienteDocumento: clienteSeleccionado.documento,
      montoAbonoInicial: montoAbonoNum,
      metodoAbonoInicial: metodoAbono,
      diasCredito: diasCreditoNum,
    });
    reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border-orange-500/20">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            Venta a Cartera
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto flex-1 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
          <Card className="bg-gradient-to-br from-orange-500/10 to-amber-600/10 border-orange-500/30">
            <CardContent className="p-4 flex items-center justify-between">
              <span className="text-slate-300">Total de la factura:</span>
              <span className="text-2xl font-bold text-white">{formatCurrency(totalVenta)}</span>
            </CardContent>
          </Card>

          {paso === 'buscar' && (
            <div className="space-y-3">
              <Label className="text-slate-300">Buscar cliente (nombre, cédula o teléfono)</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  autoFocus
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Ej: Pedro Pérez, 1020304050..."
                  className="pl-9 bg-slate-800/50 border-slate-700 text-white"
                />
              </div>

              {buscando && <p className="text-sm text-slate-400">Buscando...</p>}

              {!buscando && resultados.length > 0 && (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {resultados.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => seleccionarCliente(c)}
                      className="w-full text-left p-3 rounded-xl bg-slate-800/60 hover:bg-slate-700/70 border border-slate-700 transition-colors flex items-center gap-3"
                    >
                      <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold">
                        {c.nombre.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold truncate">{c.nombre}</p>
                        <p className="text-xs text-slate-400">{c.documento} · {c.telefono || 'Sin teléfono'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!buscando && busqueda.trim() && resultados.length === 0 && (
                <p className="text-sm text-slate-400">Sin resultados para "{busqueda}"</p>
              )}

              <Button
                onClick={() => setPaso('crear')}
                variant="outline"
                className="w-full border-orange-500/30 hover:bg-orange-500/10 text-orange-400"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Crear cliente nuevo
              </Button>
            </div>
          )}

          {paso === 'crear' && (
            <div className="space-y-3">
              <button
                onClick={() => setPaso('buscar')}
                className="text-sm text-slate-400 hover:text-white flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" /> Volver a buscar
              </button>

              <div className="space-y-2">
                <Label className="text-slate-300">Nombre completo *</Label>
                <Input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white" placeholder="Pedro Pérez" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Cédula *</Label>
                <Input value={nuevoDocumento} onChange={(e) => setNuevoDocumento(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white" placeholder="1020304050" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Teléfono *</Label>
                <Input value={nuevoTelefono} onChange={(e) => setNuevoTelefono(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white" placeholder="3001234567" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Dirección (opcional)</Label>
                <Input value={nuevaDireccion} onChange={(e) => setNuevaDireccion(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white" placeholder="Calle 10 # 5-20" />
              </div>

              <Button
                onClick={handleCrearCliente}
                disabled={creandoCliente}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                {creandoCliente ? 'Creando...' : 'Crear y continuar'}
              </Button>
            </div>
          )}

          {paso === 'credito' && clienteSeleccionado && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">{clienteSeleccionado.nombre}</p>
                  <p className="text-xs text-slate-400">{clienteSeleccionado.documento} · {clienteSeleccionado.telefono || 'Sin teléfono'}</p>
                </div>
                <button onClick={() => setPaso('buscar')} className="text-xs text-orange-400 hover:text-orange-300">Cambiar</button>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-300">¿Cuánto paga ahora?</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                  <Input
                    type="text"
                    value={montoAbono}
                    onChange={(e) => setMontoAbono(e.target.value.replace(/[^0-9]/g, ''))}
                    className="pl-7 bg-slate-800/50 border-slate-700 text-white text-lg"
                    placeholder="0"
                  />
                </div>
              </div>

              {montoAbonoNum > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-300">Método del abono</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {metodosAbono.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setMetodoAbono(m.id)}
                        className={`py-2 rounded-lg text-sm font-semibold border transition-colors ${
                          metodoAbono === m.id
                            ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                            : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-700/60'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-slate-300 flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Días de crédito
                </Label>
                <Input
                  type="number"
                  min={1}
                  value={diasCredito}
                  onChange={(e) => setDiasCredito(e.target.value)}
                  className="bg-slate-800/50 border-slate-700 text-white"
                />
              </div>

              <Card className="bg-slate-800/60 border-slate-700">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Saldo pendiente:</span>
                    <span className="text-xl font-bold text-orange-400">{formatCurrency(saldoPendiente)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Vence el:</span>
                    <span className="text-slate-200 font-semibold">
                      {fechaVencimiento.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-3">
                <Button onClick={handleClose} variant="outline" className="flex-1 border-slate-700 hover:bg-slate-800 text-white">
                  <X className="w-4 h-4 mr-2" /> Cancelar
                </Button>
                <Button
                  onClick={handleConfirmar}
                  disabled={saldoPendiente <= 0}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Confirmar venta
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
