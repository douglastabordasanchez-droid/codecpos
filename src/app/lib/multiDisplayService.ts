/**
 * 🖥️ SERVICIO DE MULTI-PANTALLA DUAL DISPLAY
 * Sistema para mostrar precios en pantalla secundaria del cliente
 */

export interface ProductoEnPantalla {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  subtotal: number;
  timestamp: number;
}

export interface EstadoPantallaCliente {
  productos: ProductoEnPantalla[];
  total: number;
  totalItems: number;
  ultimaActualizacion: number;
  modoPublicidad: boolean;
  mensajePersonalizado?: string;
}

class MultiDisplayService {
  private ventanaCliente: Window | null = null;
  private estadoActual: EstadoPantallaCliente = {
    productos: [],
    total: 0,
    totalItems: 0,
    ultimaActualizacion: Date.now(),
    modoPublicidad: true,
  };

  /**
   * Detecta si hay múltiples pantallas disponibles
   */
  async detectarPantallas(): Promise<number> {
    // Web API para detectar pantallas (Chrome 100+)
    if ('getScreenDetails' in window) {
      try {
        // @ts-ignore - API experimental
        const screenDetails = await window.getScreenDetails();
        return screenDetails.screens.length;
      } catch (error) {
        console.warn('No se pudo acceder a getScreenDetails:', error);
      }
    }

    // Fallback: usar window.screen
    return window.screen ? 1 : 0;
  }

  /**
   * Obtiene información de todas las pantallas disponibles
   */
  async obtenerInfoPantallas(): Promise<any[]> {
    if ('getScreenDetails' in window) {
      try {
        // @ts-ignore
        const screenDetails = await window.getScreenDetails();
        return screenDetails.screens.map((screen: any, index: number) => ({
          id: index,
          nombre: screen.label || `Pantalla ${index + 1}`,
          ancho: screen.width,
          alto: screen.height,
          esPrincipal: screen.isPrimary,
          left: screen.left,
          top: screen.top,
        }));
      } catch (error) {
        console.error('Error obteniendo info de pantallas:', error);
        return [];
      }
    }

    // Fallback
    return [{
      id: 0,
      nombre: 'Pantalla Principal',
      ancho: window.screen.width,
      alto: window.screen.height,
      esPrincipal: true,
      left: 0,
      top: 0,
    }];
  }

  /**
   * Abre la ventana de la pantalla del cliente
   */
  async abrirPantallaCliente(): Promise<boolean> {
    try {
      const pantallas = await this.obtenerInfoPantallas();
      
      // Buscar pantalla secundaria
      let pantallaSecundaria = pantallas.find(p => !p.esPrincipal);
      
      if (!pantallaSecundaria && pantallas.length > 1) {
        pantallaSecundaria = pantallas[1];
      }

      if (!pantallaSecundaria) {
        pantallaSecundaria = pantallas[0]; // Usar principal si no hay secundaria
      }

      // Configuración de la ventana
      const width = pantallaSecundaria.ancho;
      const height = pantallaSecundaria.alto;
      const left = pantallaSecundaria.left || 0;
      const top = pantallaSecundaria.top || 0;

      const features = [
        `width=${width}`,
        `height=${height}`,
        `left=${left}`,
        `top=${top}`,
        'toolbar=no',
        'location=no',
        'directories=no',
        'status=no',
        'menubar=no',
        'scrollbars=no',
        'resizable=yes',
        'copyhistory=no',
      ].join(',');

      // Abrir ventana
      this.ventanaCliente = window.open(
        '/pantalla-cliente',
        'PantallaCliente',
        features
      );

      if (this.ventanaCliente) {
        // Poner en pantalla completa
        setTimeout(() => {
          if (this.ventanaCliente && !this.ventanaCliente.closed) {
            try {
              this.ventanaCliente.focus();
              // Intentar pantalla completa
              if (this.ventanaCliente.document.documentElement.requestFullscreen) {
                this.ventanaCliente.document.documentElement.requestFullscreen().catch(() => {
                  console.log('No se pudo activar pantalla completa automáticamente');
                });
              }
            } catch (error) {
              console.warn('Error al configurar ventana:', error);
            }
          }
        }, 500);

        // Sincronizar estado inicial
        this.sincronizarEstado();
        
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error abriendo pantalla del cliente:', error);
      return false;
    }
  }

  /**
   * Cierra la ventana de la pantalla del cliente
   */
  cerrarPantallaCliente(): void {
    if (this.ventanaCliente && !this.ventanaCliente.closed) {
      this.ventanaCliente.close();
      this.ventanaCliente = null;
    }
  }

  /**
   * Verifica si la pantalla del cliente está abierta
   */
  estaAbierta(): boolean {
    return this.ventanaCliente !== null && !this.ventanaCliente.closed;
  }

  /**
   * Agrega un producto a la pantalla del cliente
   */
  agregarProducto(producto: Omit<ProductoEnPantalla, 'timestamp'>): void {
    const nuevoProducto: ProductoEnPantalla = {
      ...producto,
      timestamp: Date.now(),
    };

    this.estadoActual.productos.push(nuevoProducto);
    this.estadoActual.total += producto.subtotal;
    this.estadoActual.totalItems += producto.cantidad;
    this.estadoActual.ultimaActualizacion = Date.now();
    this.estadoActual.modoPublicidad = false;

    this.sincronizarEstado();
  }

  /**
   * Actualiza la cantidad de un producto
   */
  actualizarCantidad(id: string, cantidad: number): void {
    const producto = this.estadoActual.productos.find(p => p.id === id);
    if (producto) {
      const diferencia = cantidad - producto.cantidad;
      producto.cantidad = cantidad;
      producto.subtotal = producto.precio * cantidad;
      this.estadoActual.totalItems += diferencia;
      this.estadoActual.total = this.estadoActual.productos.reduce(
        (sum, p) => sum + p.subtotal,
        0
      );
      this.estadoActual.ultimaActualizacion = Date.now();
      this.sincronizarEstado();
    }
  }

  /**
   * Elimina un producto de la pantalla
   */
  eliminarProducto(id: string): void {
    const producto = this.estadoActual.productos.find(p => p.id === id);
    if (producto) {
      this.estadoActual.productos = this.estadoActual.productos.filter(p => p.id !== id);
      this.estadoActual.total -= producto.subtotal;
      this.estadoActual.totalItems -= producto.cantidad;
      this.estadoActual.ultimaActualizacion = Date.now();
      this.sincronizarEstado();
    }
  }

  /**
   * Limpia todos los productos (después de completar venta)
   */
  limpiarPantalla(): void {
    this.estadoActual = {
      productos: [],
      total: 0,
      totalItems: 0,
      ultimaActualizacion: Date.now(),
      modoPublicidad: true,
    };
    this.sincronizarEstado();
  }

  /**
   * Establece un mensaje personalizado
   */
  establecerMensaje(mensaje: string): void {
    this.estadoActual.mensajePersonalizado = mensaje;
    this.sincronizarEstado();
  }

  /**
   * Sincroniza el estado con la ventana del cliente
   */
  private sincronizarEstado(): void {
    if (this.estaAbierta() && this.ventanaCliente) {
      try {
        this.ventanaCliente.postMessage(
          {
            tipo: 'ACTUALIZAR_ESTADO',
            estado: this.estadoActual,
          },
          window.location.origin
        );
      } catch (error) {
        console.error('Error sincronizando estado:', error);
      }
    }
  }

  /**
   * Obtiene el estado actual
   */
  obtenerEstado(): EstadoPantallaCliente {
    return { ...this.estadoActual };
  }
}

// Singleton
export const multiDisplayService = new MultiDisplayService();

// Configuración localStorage
export function obtenerConfigMultiDisplay(): { activo: boolean; autoAbrir: boolean } {
  const config = localStorage.getItem('codec_pos_multi_display');
  return config ? JSON.parse(config) : { activo: false, autoAbrir: false };
}

export function guardarConfigMultiDisplay(config: { activo: boolean; autoAbrir: boolean }): void {
  localStorage.setItem('codec_pos_multi_display', JSON.stringify(config));
}
