import React, { useState, useEffect, useCallback } from 'react';
import { Bell, AlertTriangle, TrendingDown, Calendar, Package, DollarSign, CheckCircle, X } from 'lucide-react';
import { electronStore } from '../../lib/electronStore';

interface Notification {
  id: string;
  type: 'warning' | 'info' | 'success' | 'alert';
  title: string;
  message: string;
  icon: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  timestamp: Date;
  read: boolean;
  priority: 'high' | 'medium' | 'low';
}

export const SmartNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // 🧠 Generar notificaciones inteligentes (usa electronStore como fuente de verdad)
  const generateSmartNotifications = useCallback(async (): Promise<Notification[]> => {
    const newNotifications: Notification[] = [];
    const [productos, ventas] = await Promise.all([
      electronStore.obtenerProductos().catch(() => []),
      electronStore.obtenerVentas().catch(() => []),
    ]);
    const today = new Date();

    // 1️⃣ Productos por vencer próximamente (7 días)
    const productosPorVencer = productos.filter((p: any) => {
      if (!p.fechaVencimiento) return false;
      const vencimiento = new Date(p.fechaVencimiento);
      const diasRestantes = Math.ceil((vencimiento.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return diasRestantes > 0 && diasRestantes <= 7;
    });

    if (productosPorVencer.length > 0) {
      newNotifications.push({
        id: `vencimiento-${Date.now()}`,
        type: 'warning',
        title: '⚠️ Productos Próximos a Vencer',
        message: `${productosPorVencer.length} producto(s) vencen en los próximos 7 días`,
        icon: <Calendar className="w-5 h-5 text-orange-400" />,
        action: {
          label: 'Ver Productos',
          onClick: () => {
            // Navegar a inventario con filtro de vencimientos
            window.location.hash = '#/pos/productos?filter=vencimiento';
          }
        },
        timestamp: new Date(),
        read: false,
        priority: 'high',
      });
    }

    // 2️⃣ Productos con bajo stock (menos de 5 unidades)
    const productosBajoStock = productos.filter((p: any) => p.cantidad < 5 && p.cantidad > 0);
    
    if (productosBajoStock.length > 0) {
      newNotifications.push({
        id: `stock-${Date.now()}`,
        type: 'alert',
        title: '📦 Stock Bajo',
        message: `${productosBajoStock.length} producto(s) con menos de 5 unidades`,
        icon: <Package className="w-5 h-5 text-red-400" />,
        action: {
          label: 'Reabastecer',
          onClick: () => {
            window.location.hash = '#/pos/productos?filter=bajo-stock';
          }
        },
        timestamp: new Date(),
        read: false,
        priority: 'high',
      });
    }

    // 3️⃣ Productos sin ventas en 30 días (baja rotación)
    const hace30Dias = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const productosBajaRotacion = productos.filter((p: any) => {
      const ventasProducto = ventas.filter((v: any) => 
        v.productos?.some((prod: any) => prod.id === p.id) &&
        new Date(v.fecha) > hace30Dias
      );
      return ventasProducto.length === 0 && p.cantidad > 0;
    });

    if (productosBajaRotacion.length >= 5) {
      newNotifications.push({
        id: `rotacion-${Date.now()}`,
        type: 'info',
        title: '📊 Productos de Baja Rotación',
        message: `${productosBajaRotacion.length} productos sin ventas en 30 días`,
        icon: <TrendingDown className="w-5 h-5 text-yellow-400" />,
        action: {
          label: 'Ver Análisis',
          onClick: () => {
            window.location.hash = '#/pos/reportes?tab=rotacion';
          }
        },
        timestamp: new Date(),
        read: false,
        priority: 'medium',
      });
    }

    // 4️⃣ Meta de ventas diaria
    const ventasHoy = ventas.filter((v: any) => {
      const fecha = new Date(v.fecha);
      return fecha.toDateString() === today.toDateString();
    });
    
    const totalVentasHoy = ventasHoy.reduce((sum: number, v: any) => sum + (v.total || 0), 0);
    const metaDiaria = 500000; // Meta de ejemplo: $500.000 COP
    
    if (totalVentasHoy >= metaDiaria) {
      newNotifications.push({
        id: `meta-${Date.now()}`,
        type: 'success',
        title: '🎉 ¡Meta Diaria Alcanzada!',
        message: `Has vendido $${totalVentasHoy.toLocaleString('es-CO')} hoy`,
        icon: <DollarSign className="w-5 h-5 text-green-400" />,
        timestamp: new Date(),
        read: false,
        priority: 'medium',
      });
    }

    // 5️⃣ Recordatorio de cierre de caja
    const hora = today.getHours();
    const reportesRaw = localStorage.getItem('pos-reportes-generados');
    const cierresHoy = reportesRaw
      ? JSON.parse(reportesRaw).filter((c: any) => {
          if (c.tipo !== 'cierres') return false;
          const fecha = new Date(c.fechaGeneracion);
          return fecha.toDateString() === today.toDateString();
        })
      : [];

    if (hora >= 19 && cierresHoy.length === 0) {
      newNotifications.push({
        id: `cierre-${Date.now()}`,
        type: 'warning',
        title: '⏰ Recordatorio de Cierre',
        message: 'No has realizado el cierre de caja hoy',
        icon: <AlertTriangle className="w-5 h-5 text-orange-400" />,
        action: {
          label: 'Cerrar Caja',
          onClick: () => {
            window.location.hash = '#/pos/cierre';
          }
        },
        timestamp: new Date(),
        read: false,
        priority: 'high',
      });
    }

    return newNotifications;
  }, []);

  // ♻️ Actualizar notificaciones cada 5 minutos
  useEffect(() => {
    const updateNotifications = async () => {
      const smart = await generateSmartNotifications();
      const stored = JSON.parse(localStorage.getItem('codecpos_notifications') || '[]');
      const combined = [...smart, ...stored];
      const unique = combined.filter((notif, index, self) =>
        index === self.findIndex((n) => n.id === notif.id)
      );
      setNotifications(unique.slice(0, 20));
      setUnreadCount(unique.filter(n => !n.read).length);
    };

    updateNotifications();
    const interval = setInterval(updateNotifications, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [generateSmartNotifications]);

  // ✓ Marcar como leída
  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  // 🗑️ Eliminar notificación
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  return (
    <>
      {/* Botón de notificaciones */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
      >
        <Bell className="w-6 h-6 text-white" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel de notificaciones */}
      {showPanel && (
        <div className="absolute right-4 top-20 w-96 max-h-[600px] bg-slate-800/95 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Bell className="w-5 h-5" />
                Notificaciones
              </h3>
              <button
                onClick={() => setShowPanel(false)}
                className="text-white/60 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {unreadCount > 0 && (
              <p className="text-white/70 text-sm mt-1">
                {unreadCount} nueva(s) notificación(es)
              </p>
            )}
          </div>

          {/* Lista de notificaciones */}
          <div className="overflow-y-auto max-h-[500px]">
            {notifications.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-white/60">No hay notificaciones</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-4 hover:bg-white/5 transition-colors ${
                      !notif.read ? 'bg-blue-500/5 border-l-2 border-blue-500' : ''
                    }`}
                    onClick={() => markAsRead(notif.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {notif.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-semibold text-sm mb-1">
                          {notif.title}
                        </h4>
                        <p className="text-white/70 text-sm mb-2">
                          {notif.message}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-white/50 text-xs">
                            {notif.timestamp.toLocaleTimeString('es-CO', { 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })}
                          </span>
                          {notif.action && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                notif.action?.onClick();
                                setShowPanel(false);
                              }}
                              className="text-blue-400 hover:text-blue-300 text-xs font-semibold"
                            >
                              {notif.action.label} →
                            </button>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotification(notif.id);
                        }}
                        className="text-white/40 hover:text-white/80"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
