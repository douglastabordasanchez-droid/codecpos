/**
 * Modal de Pago Mixto - CodecPOS v2.0
 * Permite distribuir el pago entre múltiples métodos
 */

import { memo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Banknote,
  CreditCard,
  Smartphone,
  ArrowRightLeft,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  Bike,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { PagoMixtoDetalle } from '../../lib/electronStore';

interface PagoMixtoModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalVenta: number;
  subtotal?: number;
  iva?: number;
  porcentajeIVA?: number;
  ivaHabilitado?: boolean;
  /** Modo de Electron; sin él se ve oscuro como antes. */
  darkMode?: boolean;
  onConfirm: (pagoMixto: PagoMixtoDetalle) => void;
}

function PagoMixtoModalComponent({
  isOpen, 
  onClose, 
  totalVenta,
  subtotal,
  iva,
  porcentajeIVA,
  ivaHabilitado = false,
  darkMode = true,
  onConfirm
}: PagoMixtoModalProps) {
  const [efectivo, setEfectivo] = useState<string>('0');
  const [tarjeta, setTarjeta] = useState<string>('0');
  const [nequi, setNequi] = useState<string>('0');
  const [daviplata, setDaviplata] = useState<string>('0');
  const [transferencia, setTransferencia] = useState<string>('0');
  const [rappi, setRappi] = useState<string>('0');

  const parseAmount = (value: string): number => {
    const num = parseFloat(value.replace(/[^0-9.]/g, ''));
    return isNaN(num) ? 0 : num;
  };

  const totalPagado =
    parseAmount(efectivo) +
    parseAmount(tarjeta) +
    parseAmount(nequi) +
    parseAmount(daviplata) +
    parseAmount(transferencia) +
    parseAmount(rappi);

  const diferencia = totalVenta - totalPagado;
  const esValido = Math.abs(diferencia) < 0.01; // Tolerancia de 1 centavo

  const handleConfirm = () => {
    if (!esValido) return;

    const pagoMixto: PagoMixtoDetalle = {
      efectivo: parseAmount(efectivo) || undefined,
      tarjeta: parseAmount(tarjeta) || undefined,
      nequi: parseAmount(nequi) || undefined,
      daviplata: parseAmount(daviplata) || undefined,
      transferencia: parseAmount(transferencia) || undefined,
      rappi: parseAmount(rappi) || undefined,
    };

    onConfirm(pagoMixto);
    handleClose();
  };

  const handleClose = () => {
    setEfectivo('0');
    setTarjeta('0');
    setNequi('0');
    setDaviplata('0');
    setTransferencia('0');
    setRappi('0');
    onClose();
  };

  const formatCurrency = (value: number): string => {
    return `$${value.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const handleInputChange = (setter: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setter(value);
  };

  const distribuirAutomatico = () => {
    // Distribuir equitativamente entre efectivo y tarjeta
    const mitad = Math.floor(totalVenta / 2);
    setEfectivo(mitad.toString());
    setTarjeta((totalVenta - mitad).toString());
    setNequi('0');
    setDaviplata('0');
    setTransferencia('0');
    setRappi('0');
  };

  // Colores de cada modo: Electron pasa su darkMode (antes el modal era siempre oscuro).
  const t = darkMode
    ? {
        fondo: 'bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border-emerald-500/20',
        titulo: 'text-white', texto: 'text-white', suave: 'text-slate-400', etiqueta: 'text-slate-300',
        total: 'bg-gradient-to-br from-emerald-500/10 to-cyan-600/10 border-emerald-500/30', linea: 'bg-slate-700',
        campo: 'bg-slate-800/50 border-slate-700 text-white', iva: 'text-emerald-400',
        distribuir: 'border-emerald-500/30 bg-transparent hover:bg-emerald-500/10 text-emerald-400',
        falta: 'text-emerald-400 hover:bg-emerald-500/10', cancelar: 'border-slate-700 bg-transparent hover:bg-slate-800 text-white',
        ok: 'bg-emerald-500/10 border-emerald-500/30', debe: 'bg-yellow-500/10 border-yellow-500/30', sobra: 'bg-red-500/10 border-red-500/30',
        okTxt: 'text-emerald-400', debeTxt: 'text-yellow-400', sobraTxt: 'text-red-400',
      }
    : {
        fondo: 'bg-white border-gray-200',
        titulo: 'text-gray-900', texto: 'text-gray-900', suave: 'text-gray-500', etiqueta: 'text-gray-700',
        total: 'bg-emerald-50 border-emerald-200', linea: 'bg-emerald-200',
        campo: 'bg-gray-50 border-gray-300 text-gray-900', iva: 'text-emerald-700',
        distribuir: 'border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-700',
        falta: 'text-emerald-700 hover:bg-emerald-50', cancelar: 'border-gray-300 bg-white hover:bg-gray-50 text-gray-700',
        ok: 'bg-emerald-50 border-emerald-200', debe: 'bg-amber-50 border-amber-200', sobra: 'bg-red-50 border-red-200',
        okTxt: 'text-emerald-700', debeTxt: 'text-amber-700', sobraTxt: 'text-red-600',
      };

  const medios: Array<{ nombre: string; valor: string; poner: (v: string) => void; Icono: typeof Banknote; color: string }> = [
    { nombre: 'Efectivo', valor: efectivo, poner: setEfectivo, Icono: Banknote, color: 'text-emerald-500' },
    { nombre: 'Tarjeta', valor: tarjeta, poner: setTarjeta, Icono: CreditCard, color: 'text-blue-500' },
    { nombre: 'Nequi', valor: nequi, poner: setNequi, Icono: Smartphone, color: 'text-purple-500' },
    { nombre: 'Daviplata', valor: daviplata, poner: setDaviplata, Icono: Smartphone, color: 'text-red-500' },
    { nombre: 'Transferencia', valor: transferencia, poner: setTransferencia, Icono: ArrowRightLeft, color: 'text-cyan-500' },
    { nombre: 'Rappi', valor: rappi, poner: setRappi, Icono: Bike, color: 'text-orange-500' },
  ];

  /** Pone en este medio lo que falta para completar el total. */
  const completarCon = (m: (typeof medios)[number]) => {
    const resto = totalVenta - (totalPagado - parseAmount(m.valor));
    m.poner(String(Math.max(0, Math.round(resto))));
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className={`max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ${t.fondo}`}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className={`text-2xl font-bold ${t.titulo} flex items-center gap-3`}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            Pago Mixto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 overflow-y-auto flex-1 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: darkMode ? '#334155 transparent' : '#cbd5e1 transparent' }}>
          {/* Total a Pagar */}
          <Card className={t.total}>
            <CardContent className="p-4">
              {ivaHabilitado && subtotal && iva ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className={t.suave}>Subtotal:</span>
                    <span className={`${t.texto} font-semibold`}>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className={t.iva}>IVA ({porcentajeIVA}%):</span>
                    <span className={`${t.iva} font-semibold`}>{formatCurrency(iva)}</span>
                  </div>
                  <div className={`h-px ${t.linea} my-2`}></div>
                  <div className="flex items-center justify-between">
                    <span className={t.etiqueta}>Total a Pagar:</span>
                    <span className={`text-3xl font-bold ${t.texto}`}>{formatCurrency(totalVenta)}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className={t.etiqueta}>Total a Pagar:</span>
                  <span className={`text-3xl font-bold ${t.texto}`}>{formatCurrency(totalVenta)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Botón de Distribución Automática */}
          <Button onClick={distribuirAutomatico} variant="outline" className={`w-full ${t.distribuir}`}>
            <DollarSign className="w-4 h-4 mr-2" />
            Distribuir Automáticamente (50/50)
          </Button>

          {/* Métodos de Pago */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {medios.map((m) => (
              <div key={m.nombre} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className={`${t.etiqueta} flex items-center gap-2`}>
                    <m.Icono className={`w-4 h-4 ${m.color}`} />
                    {m.nombre}
                  </Label>
                  {!esValido && diferencia > 0 && (
                    <button type="button" onClick={() => completarCon(m)} className={`text-xs font-semibold px-2 py-0.5 rounded-md ${t.falta}`}>
                      + Lo que falta
                    </button>
                  )}
                </div>
                <div className="relative">
                  <span className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.suave}`}>$</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={m.valor}
                    onChange={handleInputChange(m.poner)}
                    onFocus={(e) => e.target.select()}
                    className={`pl-7 text-lg ${t.campo}`}
                    placeholder="0"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Resumen */}
          <Card className={`border ${esValido ? t.ok : diferencia > 0 ? t.debe : t.sobra}`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className={t.etiqueta}>Total Ingresado:</span>
                <span className={`text-xl font-bold ${t.texto}`}>{formatCurrency(totalPagado)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={t.etiqueta}>Diferencia:</span>
                <div className="flex items-center gap-2">
                  {esValido ? (
                    <>
                      <CheckCircle2 className={`w-5 h-5 ${t.okTxt}`} />
                      <span className={`text-xl font-bold ${t.okTxt}`}>{formatCurrency(0)}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className={`w-5 h-5 ${diferencia > 0 ? t.debeTxt : t.sobraTxt}`} />
                      <span className={`text-xl font-bold ${diferencia > 0 ? t.debeTxt : t.sobraTxt}`}>
                        {diferencia > 0 ? '+' : ''}{formatCurrency(Math.abs(diferencia))}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {!esValido && (
                <p className={`text-sm flex items-center gap-2 mt-2 ${diferencia > 0 ? t.debeTxt : t.sobraTxt}`}>
                  <AlertCircle className="w-4 h-4" />
                  {diferencia > 0
                    ? `Falta ingresar ${formatCurrency(diferencia)}`
                    : `Sobran ${formatCurrency(Math.abs(diferencia))}`}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Botones */}
          <div className="flex gap-3">
            <Button onClick={handleClose} variant="outline" className={`flex-1 ${t.cancelar}`}>
              <X className="w-4 h-4 mr-2" />
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!esValido}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-600 hover:to-cyan-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Confirmar Pago
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Memoizado: evita re-renders del formulario de pago mixto cuando el padre
// (POSPageNew) cambia por algo ajeno a este modal mientras está abierto.
export const PagoMixtoModal = memo(PagoMixtoModalComponent);
