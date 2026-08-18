/**
 * Modal de Detalle de Cuenta de Cartera - CodecPOS v2.0
 * Historial de abonos de un cliente a crédito + registrar nuevo abono +
 * enviar recordatorio por WhatsApp.
 */

import { useState } from 'react';
import { X, Send, Wallet, CheckCircle2, User, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { registrarAbono, type CuentaCartera } from '../../lib/carteraService';
import { cajaDiariaService } from '../../lib/cajaDiariaService';

interface ModalDetalleCuentaCarteraProps {
  isOpen: boolean;
  onClose: () => void;
  cuenta: CuentaCartera | null;
  darkMode: boolean;
  usuarioActual?: { id?: string; nombreCompleto?: string; username?: string } | null;
  onCuentaActualizada: (cuenta: CuentaCartera) => void;
}

const METODOS_ABONO = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'tarjeta', label: 'Tarjeta' },
  { id: 'transferencia', label: 'Transferencia' },
  { id: 'nequi', label: 'Nequi' },
  { id: 'daviplata', label: 'Daviplata' },
];

const fmt = (v: number) =>
  `$${Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;

export function ModalDetalleCuentaCartera({
  isOpen,
  onClose,
  cuenta,
  darkMode,
  usuarioActual,
  onCuentaActualizada,
}: ModalDetalleCuentaCarteraProps) {
  const [montoAbono, setMontoAbono] = useState('0');
  const [metodoAbono, setMetodoAbono] = useState('efectivo');
  const [registrando, setRegistrando] = useState(false);

  if (!cuenta) return null;

  const montoAbonoNum = Math.min(
    Math.max(0, parseFloat(montoAbono.replace(/[^0-9]/g, '')) || 0),
    cuenta.saldo
  );

  const handleRegistrarAbono = async () => {
    if (montoAbonoNum <= 0) {
      toast.error('Ingresa un monto mayor a cero');
      return;
    }
    setRegistrando(true);
    try {
      const fechaOperativa = (() => {
        const ahora = new Date();
        const tzOffsetMs = ahora.getTimezoneOffset() * 60000;
        return new Date(ahora.getTime() - tzOffsetMs).toISOString().split('T')[0];
      })();
      const sesionCajaActiva = usuarioActual?.id
        ? cajaDiariaService.getSesionActiva(usuarioActual.id, fechaOperativa)
        : null;

      const actualizada = await registrarAbono(cuenta.id, montoAbonoNum, metodoAbono, {
        sesionCajaId: sesionCajaActiva?.id,
        usuario: usuarioActual?.nombreCompleto || usuarioActual?.username || 'Sistema',
      });

      toast.success('Abono registrado', {
        description: actualizada.saldo <= 0
          ? 'La cuenta quedó totalmente pagada'
          : `Saldo restante: ${fmt(actualizada.saldo)}`,
      });
      setMontoAbono('0');
      onCuentaActualizada(actualizada);
    } catch (error: any) {
      toast.error(error?.message || 'No se pudo registrar el abono');
    } finally {
      setRegistrando(false);
    }
  };

  const enviarRecordatorioWhatsApp = () => {
    const config = JSON.parse(localStorage.getItem('codec_pos_config') || '{}');
    const nombreEmpresa = config.nombreComercial || config.razonSocial || 'MI NEGOCIO';
    const mensaje = `Hola ${cuenta.clienteNombre}, te recordamos que tienes un saldo pendiente de ${fmt(cuenta.saldo)} con ${nombreEmpresa} (factura ${cuenta.numeroFactura}), con vencimiento el ${format(new Date(cuenta.fechaVencimiento), "dd 'de' MMMM", { locale: es })}. ¡Gracias por tu preferencia!`;
    if (cuenta.clienteTelefono) {
      const telLimpio = cuenta.clienteTelefono.replace(/\D/g, '');
      window.open(`https://wa.me/${telLimpio}?text=${encodeURIComponent(mensaje)}`, '_blank');
    } else {
      navigator.clipboard?.writeText(mensaje);
      toast.info('No hay teléfono registrado — copiamos el mensaje al portapapeles');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border-orange-500/20">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl font-bold text-white flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" />
            </div>
            Cuenta de Cartera
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
          <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400">
              <User className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold truncate">{cuenta.clienteNombre}</p>
              <p className="text-xs text-slate-400">{cuenta.clienteDocumento} · {cuenta.clienteTelefono || 'Sin teléfono'}</p>
            </div>
          </div>

          <Card className="bg-slate-800/60 border-slate-700">
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Factura:</span>
                <span className="text-slate-200 font-semibold">{cuenta.numeroFactura}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Total de la venta:</span>
                <span className="text-slate-200 font-semibold">{fmt(cuenta.total)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Total abonado:</span>
                <span className="text-emerald-400 font-semibold">{fmt(cuenta.totalAbonado)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Saldo pendiente:</span>
                <span className="text-xl font-bold text-orange-400">{fmt(cuenta.saldo)}</span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-700">
                <span className="text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> Vence:</span>
                <span className="text-slate-300">{format(new Date(cuenta.fechaVencimiento), "dd 'de' MMMM yyyy", { locale: es })}</span>
              </div>
            </CardContent>
          </Card>

          {cuenta.abonos.length > 0 && (
            <div className="space-y-2">
              <Label className="text-slate-300">Historial de abonos</Label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {[...cuenta.abonos].reverse().map((a) => (
                  <div key={a.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-800/50 border border-slate-700">
                    <span className="text-slate-300">
                      {format(new Date(a.fecha), "dd/MM/yyyy", { locale: es })} · {a.metodoPago}
                    </span>
                    <span className="text-emerald-400 font-semibold">{fmt(a.monto)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {cuenta.estado !== 'pagada' && (
            <div className="space-y-3 pt-2 border-t border-slate-700">
              <Label className="text-slate-300">Registrar nuevo abono</Label>
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
              <div className="grid grid-cols-3 gap-2">
                {METODOS_ABONO.map((m) => (
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
              <Button
                onClick={handleRegistrarAbono}
                disabled={registrando || montoAbonoNum <= 0}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                {registrando ? 'Registrando...' : 'Registrar abono'}
              </Button>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={onClose} variant="outline" className="flex-1 border-slate-700 hover:bg-slate-800 text-white">
              <X className="w-4 h-4 mr-2" /> Cerrar
            </Button>
            <Button
              onClick={enviarRecordatorioWhatsApp}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
            >
              <Send className="w-4 h-4 mr-2" /> Recordatorio
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
