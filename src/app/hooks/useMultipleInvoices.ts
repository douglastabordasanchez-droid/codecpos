/**
 * 🧾 Hook para gestionar múltiples facturas simultáneas
 */

import { useState, useEffect, useCallback } from 'react';

interface ItemCarrito {
  producto: any;
  cantidad: number;
  peso?: number;
}

interface FacturaData {
  id: string;
  numero: number;
  carrito: ItemCarrito[];
  searchTerm: string;
  createdAt: number;
}

const STORAGE_KEY = 'codecpos_facturas_activas';

export function useMultipleInvoices() {
  const [facturas, setFacturas] = useState<FacturaData[]>([]);
  const [facturaActivaId, setFacturaActivaId] = useState<string>('');

  // Cargar facturas del localStorage al montar
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setFacturas(parsed.facturas || []);
        setFacturaActivaId(parsed.facturaActivaId || '');
      } catch (error) {
        console.error('Error cargando facturas:', error);
        inicializarPrimeraFactura();
      }
    } else {
      inicializarPrimeraFactura();
    }
  }, []);

  // Guardar facturas en localStorage cuando cambian
  useEffect(() => {
    if (facturas.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        facturas,
        facturaActivaId
      }));
    }
  }, [facturas, facturaActivaId]);

  const inicializarPrimeraFactura = () => {
    const primeraFactura: FacturaData = {
      id: 'factura-1',
      numero: 1,
      carrito: [],
      searchTerm: '',
      createdAt: Date.now(),
    };
    setFacturas([primeraFactura]);
    setFacturaActivaId(primeraFactura.id);
  };

  const facturaActiva = facturas.find(f => f.id === facturaActivaId) || facturas[0];

  const agregarFactura = useCallback(() => {
    if (facturas.length >= 10) return null;

    const nuevoNumero = Math.max(...facturas.map(f => f.numero), 0) + 1;
    const nuevaFactura: FacturaData = {
      id: `factura-${Date.now()}`,
      numero: nuevoNumero,
      carrito: [],
      searchTerm: '',
      createdAt: Date.now(),
    };

    setFacturas(prev => [...prev, nuevaFactura]);
    setFacturaActivaId(nuevaFactura.id);
    return nuevaFactura;
  }, [facturas]);

  const eliminarFactura = useCallback((id: string) => {
    if (facturas.length === 1) return false;

    const index = facturas.findIndex(f => f.id === id);
    const nuevasFacturas = facturas.filter(f => f.id !== id);
    setFacturas(nuevasFacturas);

    // Si eliminamos la activa, cambiar a otra
    if (id === facturaActivaId) {
      const nuevaActiva = nuevasFacturas[Math.max(0, index - 1)];
      setFacturaActivaId(nuevaActiva.id);
    }

    return true;
  }, [facturas, facturaActivaId]);

  const cambiarFactura = useCallback((numero: number) => {
    const factura = facturas.find(f => f.numero === numero);
    if (factura) {
      setFacturaActivaId(factura.id);
      return true;
    }
    return false;
  }, [facturas]);

  const actualizarCarrito = useCallback((nuevoCarrito: ItemCarrito[]) => {
    setFacturas(prev => prev.map(f => 
      f.id === facturaActivaId 
        ? { ...f, carrito: nuevoCarrito }
        : f
    ));
  }, [facturaActivaId]);

  const actualizarSearchTerm = useCallback((searchTerm: string) => {
    setFacturas(prev => prev.map(f => 
      f.id === facturaActivaId 
        ? { ...f, searchTerm }
        : f
    ));
  }, [facturaActivaId]);

  const limpiarFacturaActual = useCallback(() => {
    setFacturas(prev => prev.map(f => 
      f.id === facturaActivaId 
        ? { ...f, carrito: [], searchTerm: '' }
        : f
    ));
  }, [facturaActivaId]);

  const getFacturasPorNumero = useCallback(() => {
    return facturas.map(f => ({
      numero: f.numero,
      itemsCount: f.carrito.reduce((sum, item) => sum + item.cantidad, 0),
      total: f.carrito.reduce((total, item) => {
        if (item.producto.pesable && item.peso) {
          return total + (item.producto.precio * item.peso);
        }
        return total + (item.producto.precio * item.cantidad);
      }, 0)
    }));
  }, [facturas]);

  return {
    facturas,
    facturaActiva,
    facturaActivaId,
    agregarFactura,
    eliminarFactura,
    cambiarFactura,
    actualizarCarrito,
    actualizarSearchTerm,
    limpiarFacturaActual,
    getFacturasPorNumero,
  };
}
