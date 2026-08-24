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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden bg-gradient-to-br from-slate-900/95 via-slate-800/95 to-slate-900/95 backdrop-blur-xl border-emerald-500/20">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-white" />
            </div>
            Pago Mixto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 overflow-y-auto flex-1 pr-1" style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}>
          {/* Total a Pagar */}
          <Card className="bg-gradient-to-br from-emerald-500/10 to-cyan-600/10 border-emerald-500/30">
            <CardContent className="p-4">
              {ivaHabilitado && subtotal && iva ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Subtotal:</span>
                    <span className="text-white font-semibold">
                      {formatCurrency(subtotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-emerald-400">IVA ({porcentajeIVA}%):</span>
                    <span className="text-emerald-400 font-semibold">
                      {formatCurrency(iva)}
                    </span>
                  </div>
                  <div className="h-px bg-slate-700 my-2"></div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Total a Pagar:</span>
                    <span className="text-3xl font-bold text-white">
                      {formatCurrency(totalVenta)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Total a Pagar:</span>
                  <span className="text-3xl font-bold text-white">
                    {formatCurrency(totalVenta)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Botón de Distribución Automática */}
          <Button
            onClick={distribuirAutomatico}
            variant="outline"
            className="w-full border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400"
          >
            <DollarSign className="w-4 h-4 mr-2" />
            Distribuir Automáticamente (50/50)
          </Button>

          {/* Métodos de Pago */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Efectivo */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-400" />
                Efectivo
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <Input
                  type="text"
                  value={efectivo}
                  onChange={handleInputChange(setEfectivo)}
                  className="pl-7 bg-slate-800/50 border-slate-700 text-white text-lg"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Tarjeta */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-blue-400" />
                Tarjeta
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <Input
                  type="text"
                  value={tarjeta}
                  onChange={handleInputChange(setTarjeta)}
                  className="pl-7 bg-slate-800/50 border-slate-700 text-white text-lg"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Nequi */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-purple-400" />
                Nequi
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <Input
                  type="text"
                  value={nequi}
                  onChange={handleInputChange(setNequi)}
                  className="pl-7 bg-slate-800/50 border-slate-700 text-white text-lg"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Daviplata */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-red-400" />
                Daviplata
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <Input
                  type="text"
                  value={daviplata}
                  onChange={handleInputChange(setDaviplata)}
                  className="pl-7 bg-slate-800/50 border-slate-700 text-white text-lg"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Transferencia */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
                Transferencia
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <Input
                  type="text"
                  value={transferencia}
                  onChange={handleInputChange(setTransferencia)}
                  className="pl-7 bg-slate-800/50 border-slate-700 text-white text-lg"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Rappi */}
            <div className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                <Bike className="w-4 h-4 text-orange-400" />
                Rappi
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <Input
                  type="text"
                  value={rappi}
                  onChange={handleInputChange(setRappi)}
                  className="pl-7 bg-slate-800/50 border-slate-700 text-white text-lg"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Resumen */}
          <Card className={`border ${
            esValido ? 'bg-emerald-500/10 border-emerald-500/30' : 
            diferencia > 0 ? 'bg-yellow-500/10 border-yellow-500/30' : 
            'bg-red-500/10 border-red-500/30'
          }`}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Total Ingresado:</span>
                <span className="text-xl font-bold text-white">
                  {formatCurrency(totalPagado)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Diferencia:</span>
                <div className="flex items-center gap-2">
                  {esValido ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      <span className="text-xl font-bold text-emerald-400">
                        {formatCurrency(0)}
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-yellow-400" />
                      <span className={`text-xl font-bold ${
                        diferencia > 0 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {diferencia > 0 ? '+' : ''}{formatCurrency(Math.abs(diferencia))}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {!esValido && (
                <p className="text-sm text-yellow-400 flex items-center gap-2 mt-2">
                  <AlertCircle className="w-4 h-4" />
                  {diferencia > 0 
                    ? `Falta ingresar ${formatCurrency(diferencia)}` 
                    : `Sobran ${formatCurrency(Math.abs(diferencia))}`
                  }
                </p>
              )}
            </CardContent>
          </Card>

          {/* Botones */}
          <div className="flex gap-3">
            <Button
              onClick={handleClose}
              variant="outline"
              className="flex-1 border-slate-700 hover:bg-slate-800 text-white"
            >
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
