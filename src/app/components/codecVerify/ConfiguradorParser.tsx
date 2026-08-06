import { useState } from 'react';
import { motion } from 'motion/react';
import {
  Plus,
  Trash2,
  Save,
  Code,
  TestTube,
  CheckCircle2,
  XCircle,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';

interface ReglaParser {
  id: string;
  banco: string;
  palabrasClave: string[];
  patronMonto: string;
  ejemploMensaje: string;
}

const reglasDefault: ReglaParser[] = [
  {
    id: '1',
    banco: 'Nequi',
    palabrasClave: ['ha recibido', 'nequi', 'recibiste'],
    patronMonto: 'siguiente valor numérico',
    ejemploMensaje: 'Has recibido $45.000 en tu Nequi de María G.',
  },
  {
    id: '2',
    banco: 'Daviplata',
    palabrasClave: ['recibiste', 'daviplata', 'ingresó'],
    patronMonto: 'siguiente valor numérico',
    ejemploMensaje: 'Recibiste $32.500 de Carlos P. en Daviplata',
  },
  {
    id: '3',
    banco: 'Bancolombia',
    palabrasClave: ['transferencia recibida', 'bancolombia'],
    patronMonto: 'valor después de $',
    ejemploMensaje: 'Transferencia recibida: $67.800 de Ana R.',
  },
];

export function ConfiguradorParser() {
  const [reglas, setReglas] = useState<ReglaParser[]>(reglasDefault);
  const [editando, setEditando] = useState<string | null>(null);
  const [mensajePrueba, setMensajePrueba] = useState('');
  const [resultadoPrueba, setResultadoPrueba] = useState<{
    banco: string;
    monto: number;
    exito: boolean;
  } | null>(null);

  const agregarRegla = () => {
    const nueva: ReglaParser = {
      id: Date.now().toString(),
      banco: 'Nuevo Banco',
      palabrasClave: ['palabra clave'],
      patronMonto: 'siguiente valor numérico',
      ejemploMensaje: 'Ejemplo de mensaje...',
    };
    setReglas([...reglas, nueva]);
    setEditando(nueva.id);
  };

  const eliminarRegla = (id: string) => {
    setReglas(reglas.filter(r => r.id !== id));
    toast.success('Regla eliminada');
  };

  const guardarRegla = (id: string, regla: Partial<ReglaParser>) => {
    setReglas(reglas.map(r => (r.id === id ? { ...r, ...regla } : r)));
    setEditando(null);
    toast.success('Regla guardada correctamente');
  };

  const probarParser = () => {
    if (!mensajePrueba) {
      toast.error('Escribe un mensaje de prueba');
      return;
    }

    // Buscar regla coincidente
    for (const regla of reglas) {
      const coincide = regla.palabrasClave.some(palabra =>
        mensajePrueba.toLowerCase().includes(palabra.toLowerCase())
      );

      if (coincide) {
        // Extraer monto
        const match = mensajePrueba.match(/\$?([\d.,]+)/);
        if (match) {
          const monto = parseFloat(match[1].replace(/[.,]/g, ''));
          setResultadoPrueba({
            banco: regla.banco,
            monto,
            exito: true,
          });
          toast.success('✅ Parser funcionó correctamente');
          return;
        }
      }
    }

    setResultadoPrueba({
      banco: 'Desconocido',
      monto: 0,
      exito: false,
    });
    toast.error('❌ No se pudo parsear el mensaje');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border-purple-500/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Code className="w-5 h-5 text-purple-400" />
            Configurador de Parser de Notificaciones
          </CardTitle>
          <CardDescription className="text-purple-300">
            Define cómo extraer información de mensajes de bancos digitales
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Reglas de Parser */}
      <div className="space-y-4">
        {reglas.map((regla, index) => (
          <motion.div
            key={regla.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
                      {index + 1}
                    </div>
                    {editando === regla.id ? (
                      <Input
                        value={regla.banco}
                        onChange={e =>
                          setReglas(
                            reglas.map(r =>
                              r.id === regla.id ? { ...r, banco: e.target.value } : r
                            )
                          )
                        }
                        className="w-48 bg-slate-900 border-slate-600 text-white"
                      />
                    ) : (
                      <h3 className="text-white font-semibold text-lg">{regla.banco}</h3>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {editando === regla.id ? (
                      <Button
                        onClick={() => guardarRegla(regla.id, regla)}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        Guardar
                      </Button>
                    ) : (
                      <Button
                        onClick={() => setEditando(regla.id)}
                        size="sm"
                        variant="outline"
                        className="border-slate-600 text-slate-300"
                      >
                        Editar
                      </Button>
                    )}
                    <Button
                      onClick={() => eliminarRegla(regla.id)}
                      size="sm"
                      variant="outline"
                      className="border-red-500/50 text-red-400 hover:bg-red-500/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Palabras Clave */}
                <div>
                  <label className="text-slate-400 text-sm font-medium mb-2 block">
                    Palabras Clave (separadas por coma):
                  </label>
                  {editando === regla.id ? (
                    <Input
                      value={regla.palabrasClave.join(', ')}
                      onChange={e =>
                        setReglas(
                          reglas.map(r =>
                            r.id === regla.id
                              ? {
                                  ...r,
                                  palabrasClave: e.target.value.split(',').map(s => s.trim()),
                                }
                              : r
                          )
                        )
                      }
                      placeholder="ha recibido, nequi, recibiste"
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {regla.palabrasClave.map((palabra, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-sm border border-purple-500/30"
                        >
                          "{palabra}"
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Patrón de Monto */}
                <div>
                  <label className="text-slate-400 text-sm font-medium mb-2 block">
                    Patrón de Extracción de Monto:
                  </label>
                  {editando === regla.id ? (
                    <Input
                      value={regla.patronMonto}
                      onChange={e =>
                        setReglas(
                          reglas.map(r =>
                            r.id === regla.id ? { ...r, patronMonto: e.target.value } : r
                          )
                        )
                      }
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  ) : (
                    <p className="text-blue-400 font-mono text-sm">
                      Capturar: {regla.patronMonto}
                    </p>
                  )}
                </div>

                {/* Ejemplo de Mensaje */}
                <div>
                  <label className="text-slate-400 text-sm font-medium mb-2 block">
                    Ejemplo de Mensaje:
                  </label>
                  {editando === regla.id ? (
                    <Input
                      value={regla.ejemploMensaje}
                      onChange={e =>
                        setReglas(
                          reglas.map(r =>
                            r.id === regla.id ? { ...r, ejemploMensaje: e.target.value } : r
                          )
                        )
                      }
                      className="bg-slate-900 border-slate-600 text-white"
                    />
                  ) : (
                    <p className="text-slate-300 italic bg-slate-900 p-3 rounded-lg border border-slate-700">
                      "{regla.ejemploMensaje}"
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Botón Agregar Regla */}
        <Button
          onClick={agregarRegla}
          className="w-full border-2 border-dashed border-slate-600 bg-slate-800/30 hover:bg-slate-700/50 text-slate-300"
          variant="outline"
        >
          <Plus className="w-5 h-5 mr-2" />
          Agregar Nueva Regla de Parser
        </Button>
      </div>

      {/* Probador de Parser */}
      <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-500/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <TestTube className="w-5 h-5 text-blue-400" />
            Probador de Parser
          </CardTitle>
          <CardDescription className="text-blue-300">
            Prueba tus reglas con un mensaje real
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-slate-300 text-sm font-medium mb-2 block">
              Mensaje de Prueba:
            </label>
            <Input
              value={mensajePrueba}
              onChange={e => setMensajePrueba(e.target.value)}
              placeholder="Has recibido $45.000 en tu Nequi de María G."
              className="bg-slate-900 border-slate-600 text-white"
            />
          </div>

          <Button
            onClick={probarParser}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Probar Parser
          </Button>

          {/* Resultado */}
          {resultadoPrueba && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`p-4 rounded-lg border ${
                resultadoPrueba.exito
                  ? 'bg-green-500/10 border-green-500/50'
                  : 'bg-red-500/10 border-red-500/50'
              }`}
            >
              <div className="flex items-center gap-3">
                {resultadoPrueba.exito ? (
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                ) : (
                  <XCircle className="w-8 h-8 text-red-400" />
                )}
                <div className="flex-1">
                  <p
                    className={`font-semibold ${
                      resultadoPrueba.exito ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {resultadoPrueba.exito ? '✅ Parser Exitoso' : '❌ Parser Falló'}
                  </p>
                  {resultadoPrueba.exito && (
                    <>
                      <p className="text-white text-2xl font-bold">
                        ${resultadoPrueba.monto.toLocaleString('es-CO')}
                      </p>
                      <p className="text-slate-400 text-sm">
                        Banco detectado: {resultadoPrueba.banco}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
