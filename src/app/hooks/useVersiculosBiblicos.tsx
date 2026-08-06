/**
 * CODECPOS v2.0 - Hook de Versículos Bíblicos
 * Sistema de mensajes de aliento y obediencia a Dios
 */

import { useEffect, useState } from 'react';

interface Versiculo {
  texto: string;
  referencia: string;
  tipo: 'aliento' | 'obediencia' | 'especial';
}

const VERSICULOS_BIBLICOS: Versiculo[] = [
  // ISAÍAS 41:10-12 - VERSÍCULO ESPECIAL
  {
    texto: "No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios que te esfuerzo; siempre te ayudaré, siempre te sustentaré con la diestra de mi justicia.",
    referencia: "Isaías 41:10",
    tipo: 'especial'
  },
  {
    texto: "He aquí que todos los que se enojan contra ti serán avergonzados y confundidos; serán como nada y perecerán los que contienden contigo.",
    referencia: "Isaías 41:11",
    tipo: 'especial'
  },
  {
    texto: "Buscarás a los que tienen contienda contigo, y no los hallarás; serán como nada, y como cosa que no es, aquellos que te hacen la guerra.",
    referencia: "Isaías 41:12",
    tipo: 'especial'
  },

  // MENSAJES DE ALIENTO
  {
    texto: "Todo lo puedo en Cristo que me fortalece.",
    referencia: "Filipenses 4:13",
    tipo: 'aliento'
  },
  {
    texto: "Jehová es mi pastor; nada me faltará.",
    referencia: "Salmos 23:1",
    tipo: 'aliento'
  },
  {
    texto: "Encomienda a Jehová tu camino, y confía en él; y él hará.",
    referencia: "Salmos 37:5",
    tipo: 'aliento'
  },
  {
    texto: "Venid a mí todos los que estáis trabajados y cargados, y yo os haré descansar.",
    referencia: "Mateo 11:28",
    tipo: 'aliento'
  },
  {
    texto: "Porque yo sé los pensamientos que tengo acerca de vosotros, dice Jehová, pensamientos de paz, y no de mal, para daros el fin que esperáis.",
    referencia: "Jeremías 29:11",
    tipo: 'aliento'
  },

  // MENSAJES DE OBEDIENCIA A DIOS
  {
    texto: "Si me amáis, guardad mis mandamientos.",
    referencia: "Juan 14:15",
    tipo: 'obediencia'
  },
  {
    texto: "Fíate de Jehová de todo tu corazón, y no te apoyes en tu propia prudencia. Reconócelo en todos tus caminos, y él enderezará tus veredas.",
    referencia: "Proverbios 3:5-6",
    tipo: 'obediencia'
  },
  {
    texto: "Mas buscad primeramente el reino de Dios y su justicia, y todas estas cosas os serán añadidas.",
    referencia: "Mateo 6:33",
    tipo: 'obediencia'
  },
  {
    texto: "Guardad, pues, las palabras de este pacto, y ponedlas por obra, para que prosperéis en todo lo que hagáis.",
    referencia: "Deuteronomio 29:9",
    tipo: 'obediencia'
  },
  {
    texto: "El que tiene mis mandamientos, y los guarda, ése es el que me ama; y el que me ama, será amado por mi Padre, y yo le amaré, y me manifestaré a él.",
    referencia: "Juan 14:21",
    tipo: 'obediencia'
  },
];

const INTERVALO_HORAS = 36; // 36 horas
const STORAGE_KEY = 'codecpos-ultimo-versiculo';
const VERSICULO_VISTO_KEY = 'codecpos-versiculos-vistos';

export function useVersiculosBiblicos() {
  const [versiculoActual, setVersiculoActual] = useState<Versiculo | null>(null);

  useEffect(() => {
    verificarYMostrarVersiculo();

    // Verificar cada hora si es tiempo de mostrar un nuevo versículo
    const interval = setInterval(() => {
      verificarYMostrarVersiculo();
    }, 60 * 60 * 1000); // Cada 1 hora

    return () => clearInterval(interval);
  }, []);

  const verificarYMostrarVersiculo = () => {
    const ahora = new Date().getTime();
    const ultimoVersiculoStr = localStorage.getItem(STORAGE_KEY);
    
    if (!ultimoVersiculoStr) {
      // Primera vez - mostrar Isaías 41:10
      mostrarVersiculo(VERSICULOS_BIBLICOS[0]);
      return;
    }

    const ultimoVersiculo = JSON.parse(ultimoVersiculoStr);
    const tiempoTranscurrido = ahora - ultimoVersiculo.timestamp;
    const horasTranscurridas = tiempoTranscurrido / (1000 * 60 * 60);

    if (horasTranscurridas >= INTERVALO_HORAS) {
      const nuevoVersiculo = obtenerVersiculoAleatorio();
      mostrarVersiculo(nuevoVersiculo);
    }
  };

  const obtenerVersiculoAleatorio = (): Versiculo => {
    // Obtener versículos ya vistos
    const vistosStr = localStorage.getItem(VERSICULO_VISTO_KEY);
    const vistos: number[] = vistosStr ? JSON.parse(vistosStr) : [];

    // Si ya vimos todos, resetear
    if (vistos.length >= VERSICULOS_BIBLICOS.length) {
      localStorage.setItem(VERSICULO_VISTO_KEY, JSON.stringify([]));
      vistos.length = 0;
    }

    // Obtener versículos no vistos
    const noVistos = VERSICULOS_BIBLICOS.filter((_, index) => !vistos.includes(index));
    
    // Seleccionar uno aleatorio
    const aleatorio = noVistos[Math.floor(Math.random() * noVistos.length)];
    const indice = VERSICULOS_BIBLICOS.indexOf(aleatorio);

    // Marcar como visto
    vistos.push(indice);
    localStorage.setItem(VERSICULO_VISTO_KEY, JSON.stringify(vistos));

    return aleatorio;
  };

  const mostrarVersiculo = (versiculo: Versiculo) => {
    setVersiculoActual(versiculo);

    // Guardar timestamp
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      timestamp: new Date().getTime(),
      referencia: versiculo.referencia
    }));

    // Crear elemento del popup con overlay
    const popupOverlay = document.createElement('div');
    popupOverlay.id = 'versiculo-popup-overlay';
    popupOverlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      cursor: pointer;
      animation: fadeIn 0.3s ease-out;
    `;

    const popupContent = document.createElement('div');
    popupContent.style.cssText = `
      background: linear-gradient(135deg, #2563eb 0%, #7c3aed 50%, #2563eb 100%);
      color: white;
      padding: 32px;
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      border: 2px solid rgba(255, 255, 255, 0.2);
      max-width: 600px;
      width: 100%;
      animation: slideIn 0.4s ease-out;
      cursor: default;
    `;

    popupContent.innerHTML = `
      <style>
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideIn {
          from { transform: scale(0.9) translateY(20px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
      </style>
      <div style="display: flex; align-items: start; gap: 16px;">
        <div style="width: 48px; height: 48px; background: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <span style="font-size: 24px;">✝️</span>
        </div>
        <div style="flex: 1;">
          <h4 style="font-weight: bold; font-size: 20px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            ${versiculo.tipo === 'especial' ? '🌟 ' : ''}Palabra de Dios${versiculo.tipo === 'especial' ? ' 🌟' : ''}
          </h4>
          <p style="font-size: 16px; line-height: 1.6; margin-bottom: 16px; color: rgba(255, 255, 255, 0.95);">
            "${versiculo.texto}"
          </p>
          <p style="font-size: 14px; font-weight: 600; font-style: italic; color: rgba(255, 255, 255, 0.8);">
            — ${versiculo.referencia}
          </p>
          ${versiculo.tipo === 'obediencia' ? `
            <p style="font-size: 13px; margin-top: 12px; color: #fef08a; font-weight: 500;">
              🙏 Camina en obediencia a Sus mandamientos
            </p>
          ` : ''}
          ${versiculo.tipo === 'aliento' ? `
            <p style="font-size: 13px; margin-top: 12px; color: #86efac; font-weight: 500;">
              💚 Él está contigo en tu trabajo diario
            </p>
          ` : ''}
          ${versiculo.tipo === 'especial' ? `
            <p style="font-size: 13px; margin-top: 12px; color: #e9d5ff; font-weight: 500;">
              🌟 No temas, Él es tu fortaleza y sustento
            </p>
          ` : ''}
        </div>
      </div>
      <p style="text-align: center; margin-top: 24px; font-size: 12px; color: rgba(255, 255, 255, 0.6); font-style: italic;">
        Toca en cualquier lugar para cerrar
      </p>
    `;

    // Click en el overlay cierra el popup
    popupOverlay.addEventListener('click', () => {
      popupOverlay.style.animation = 'fadeOut 0.2s ease-out';
      setTimeout(() => {
        document.body.removeChild(popupOverlay);
      }, 200);
    });

    // Prevenir que el click en el contenido cierre el popup
    popupContent.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Agregar animación de fadeOut
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    document.head.appendChild(style);

    popupOverlay.appendChild(popupContent);
    document.body.appendChild(popupOverlay);

    // Auto-cerrar después de 15 segundos
    setTimeout(() => {
      if (document.body.contains(popupOverlay)) {
        popupOverlay.style.animation = 'fadeOut 0.2s ease-out';
        setTimeout(() => {
          if (document.body.contains(popupOverlay)) {
            document.body.removeChild(popupOverlay);
          }
        }, 200);
      }
    }, 15000);
  };

  const obtenerVersiculoDelDia = (): Versiculo => {
    const ultimoVersiculoStr = localStorage.getItem(STORAGE_KEY);
    if (!ultimoVersiculoStr) {
      return VERSICULOS_BIBLICOS[0]; // Isaías 41:10 por defecto
    }

    const ultimoVersiculo = JSON.parse(ultimoVersiculoStr);
    const encontrado = VERSICULOS_BIBLICOS.find(v => v.referencia === ultimoVersiculo.referencia);
    return encontrado || VERSICULOS_BIBLICOS[0];
  };

  return {
    versiculoActual,
    obtenerVersiculoDelDia,
    todosLosVersiculos: VERSICULOS_BIBLICOS,
  };
}