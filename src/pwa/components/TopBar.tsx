import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Menu, Bell, ShieldCheck, ShieldOff, PanelBottomClose, PanelBottomOpen } from 'lucide-react';
import { SideMenu } from './SideMenu';
import { usePwaAuth } from '../contexts/PwaAuthContext';
import { codecVerifyPwaActivo, alternarCodecVerifyPwa, suscribirNotificacionesPagoPwa } from '../lib/codecVerifyPwa';
import logo from '/logo.png';

interface Props {
  navInferiorVisible: boolean;
  onToggleNavInferior: () => void;
}

export function TopBar({ navInferiorVisible, onToggleNavInferior }: Props) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [verifyActivo, setVerifyActivo] = useState(codecVerifyPwaActivo);
  const navigate = useNavigate();
  const { empleado } = usePwaAuth();

  useEffect(() => {
    const actualizar = () => setVerifyActivo(codecVerifyPwaActivo());
    window.addEventListener('codecverify-pwa:config-changed', actualizar);
    return () => window.removeEventListener('codecverify-pwa:config-changed', actualizar);
  }, []);

  useEffect(() => {
    if (!verifyActivo || !empleado) return;
    const unsubscribe = suscribirNotificacionesPagoPwa(empleado.cliente_id, (row) => {
      const monto = `$${Number(row.monto).toLocaleString('es-CO')}`;
      if (row.origen === 'automatizacion') {
        toast.success(`✅ Pago verificado automáticamente: ${monto} · ${(row.entidad || '').toUpperCase()}`, { duration: 8000 });
      } else {
        toast.info(`💰 Pago manual reportado: ${monto} · ${(row.entidad || '').toUpperCase()}`, { duration: 8000 });
      }
    });
    return () => unsubscribe?.();
  }, [verifyActivo, empleado?.cliente_id]);

  const toggleVerify = () => {
    const nuevo = alternarCodecVerifyPwa();
    setVerifyActivo(nuevo);
    toast.success(nuevo ? 'Codec Verify activado en este celular' : 'Codec Verify desactivado');
  };

  return (
    <>
      <div className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80">
        <div className="h-14 px-4 flex items-center justify-between">
          <button
            onClick={() => setMenuAbierto(true)}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 active:bg-slate-900"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <img src={logo} alt="CODEC POS" className="w-5 h-5 object-contain" />
            <span className="text-white text-sm font-black tracking-tight">CODEC POS</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={toggleVerify}
              className={`w-9 h-9 rounded-lg flex items-center justify-center active:bg-slate-900 ${verifyActivo ? 'text-emerald-400' : 'text-slate-500'}`}
              aria-label={verifyActivo ? 'Codec Verify activo' : 'Codec Verify inactivo'}
              title={verifyActivo ? 'Codec Verify activo — toca para desactivar' : 'Codec Verify inactivo — toca para activar'}
            >
              {verifyActivo ? <ShieldCheck className="w-5 h-5" /> : <ShieldOff className="w-5 h-5" />}
            </button>
            <button
              onClick={() => navigate('/alertas')}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 active:bg-slate-900"
              aria-label="Alertas"
            >
              <Bell className="w-5 h-5" />
            </button>
            <button
              onClick={onToggleNavInferior}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-300 active:bg-slate-900"
              aria-label={navInferiorVisible ? 'Ocultar menú inferior' : 'Mostrar menú inferior'}
              title={navInferiorVisible ? 'Ocultar menú inferior' : 'Mostrar menú inferior'}
            >
              {navInferiorVisible ? <PanelBottomClose className="w-5 h-5" /> : <PanelBottomOpen className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
      <SideMenu open={menuAbierto} onClose={() => setMenuAbierto(false)} />
    </>
  );
}
