import { useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  FileText,
  Download,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';

interface ConfirmacionExterna {
  id: string;
  numeroFactura: string;
  monto: number;
  banco: string;
  remitente: string;
  timestamp: string;
  vinculado: boolean;
  verificadoPor: string;
}

const confirmacionesDemo: ConfirmacionExterna[] = [
  {
    id: '1',
    numeroFactura: 'FAC000145',
    monto: 45000,
    banco: 'Nequi',
    remitente: 'María González',
    timestamp: '2026-02-20 14:23:15',
    vinculado: true,
    verificadoPor: 'Emisor',
  },
  {
    id: '2',
    numeroFactura: 'FAC000146',
    monto: 32500,
    banco: 'Daviplata',
    remitente: 'Carlos Pérez',
    timestamp: '2026-02-20 14:45:30',
    vinculado: true,
    verificadoPor: 'Emisor',
  },
  {
    id: '3',
    numeroFactura: 'FAC000147',
    monto: 67800,
    banco: 'Bancolombia',
    remitente: 'Ana Rodríguez',
    timestamp: '2026-02-20 15:12:45',
    vinculado: true,
    verificadoPor: 'Emisor',
  },
  {
    id: '4',
    numeroFactura: 'Pendiente',
    monto: 25000,
    banco: 'Nequi',
    remitente: 'Cliente Anónimo',
    timestamp: '2026-02-20 15:34:20',
    vinculado: false,
    verificadoPor: 'Emisor',
  },
];

export function AuditoriaDigital() {
  const [confirmaciones, setConfirmaciones] = useState<ConfirmacionExterna[]>(confirmacionesDemo);
  const [filtro, setFiltro] = useState<'todos' | 'vinculados' | 'pendientes'>('todos');

  const confirmacionesFiltradas = confirmaciones.filter(conf => {
    if (filtro === 'vinculados') return conf.vinculado;
    if (filtro === 'pendientes') return !conf.vinculado;
    return true;
  });

  const totalConfirmado = confirmaciones
    .filter(c => c.vinculado)
    .reduce((sum, c) => sum + c.monto, 0);

  const totalPendiente = confirmaciones
    .filter(c => !c.vinculado)
    .reduce((sum, c) => sum + c.monto, 0);

  const exportarReporte = () => {
    const csv = [
      ['Factura', 'Monto', 'Banco', 'Remitente', 'Fecha', 'Estado', 'Verificado Por'].join(','),
      ...confirmaciones.map(c =>
        [
          c.numeroFactura,
          c.monto,
          c.banco,
          c.remitente,
          c.timestamp,
          c.vinculado ? 'Vinculado' : 'Pendiente',
          c.verificadoPor,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria-digital-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getBancoColor = (banco: string) => {
    const colores = {
      nequi: 'text-purple-400 bg-purple-500/10',
      daviplata: 'text-red-400 bg-red-500/10',
      bancolombia: 'text-yellow-400 bg-yellow-500/10',
      dale: 'text-green-400 bg-green-500/10',
    };
    return colores[banco.toLowerCase() as keyof typeof colores] || 'text-blue-400 bg-blue-500/10';
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-400" />
              Auditoría Digital
            </CardTitle>
            <CardDescription className="text-slate-400">
              Confirmaciones recibidas del Emisor
            </CardDescription>
          </div>
          <Button
            onClick={exportarReporte}
            size="sm"
            variant="outline"
            className="border-slate-600 text-slate-300 hover:bg-slate-700"
          >
            <Download className="w-4 h-4 mr-1" />
            Exportar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Resumen */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            <p className="text-green-400 text-sm font-medium">Confirmados</p>
            <p className="text-green-400 text-2xl font-bold">
              ${totalConfirmado.toLocaleString('es-CO')}
            </p>
            <p className="text-green-300 text-xs">
              {confirmaciones.filter(c => c.vinculado).length} transacciones
            </p>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
            <p className="text-yellow-400 text-sm font-medium">Pendientes</p>
            <p className="text-yellow-400 text-2xl font-bold">
              ${totalPendiente.toLocaleString('es-CO')}
            </p>
            <p className="text-yellow-300 text-xs">
              {confirmaciones.filter(c => !c.vinculado).length} sin vincular
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex gap-2">
          <Button
            onClick={() => setFiltro('todos')}
            size="sm"
            variant={filtro === 'todos' ? 'default' : 'outline'}
            className={filtro === 'todos' ? 'bg-purple-600' : 'border-slate-600 text-slate-400'}
          >
            Todos ({confirmaciones.length})
          </Button>
          <Button
            onClick={() => setFiltro('vinculados')}
            size="sm"
            variant={filtro === 'vinculados' ? 'default' : 'outline'}
            className={filtro === 'vinculados' ? 'bg-green-600' : 'border-slate-600 text-slate-400'}
          >
            Vinculados ({confirmaciones.filter(c => c.vinculado).length})
          </Button>
          <Button
            onClick={() => setFiltro('pendientes')}
            size="sm"
            variant={filtro === 'pendientes' ? 'default' : 'outline'}
            className={filtro === 'pendientes' ? 'bg-yellow-600' : 'border-slate-600 text-slate-400'}
          >
            Pendientes ({confirmaciones.filter(c => !c.vinculado).length})
          </Button>
        </div>

        {/* Tabla de confirmaciones */}
        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <div className="overflow-x-auto max-h-96">
            <table className="w-full">
              <thead className="bg-slate-900/50 sticky top-0">
                <tr className="text-left text-xs text-slate-400 uppercase">
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Factura</th>
                  <th className="px-4 py-3">Monto</th>
                  <th className="px-4 py-3">Banco</th>
                  <th className="px-4 py-3">Remitente</th>
                  <th className="px-4 py-3">Fecha/Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {confirmacionesFiltradas.map((conf, index) => (
                  <motion.tr
                    key={conf.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="hover:bg-slate-700/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      {conf.vinculado ? (
                        <div className="flex items-center gap-1 text-green-400">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs">OK</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-yellow-400">
                          <Clock className="w-4 h-4" />
                          <span className="text-xs">Pend.</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-mono ${
                        conf.vinculado ? 'text-white' : 'text-yellow-400'
                      }`}>
                        {conf.numeroFactura}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white font-semibold">
                        ${conf.monto.toLocaleString('es-CO')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded ${getBancoColor(conf.banco)}`}>
                        {conf.banco}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-sm">
                      {conf.remitente}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono">
                      {conf.timestamp}
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {confirmacionesFiltradas.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <Filter className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No hay confirmaciones con este filtro</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}