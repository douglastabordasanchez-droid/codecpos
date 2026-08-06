/**
 * Hook para gestionar versículos bíblicos aleatorios
 */

import { useState, useEffect } from 'react';

const versiculos = [
  { texto: "Todo lo puedo en Cristo que me fortalece", cita: "Filipenses 4:13" },
  { texto: "Confía en el Señor de todo corazón", cita: "Proverbios 3:5" },
  { texto: "Jehová es mi pastor, nada me faltará", cita: "Salmos 23:1" },
  { texto: "El que comenzó la buena obra, la perfeccionará", cita: "Filipenses 1:6" },
  { texto: "Mas buscad primeramente el reino de Dios", cita: "Mateo 6:33" },
];

export function useVersiculosBiblicos() {
  const [versiculoActual, setVersiculoActual] = useState(versiculos[0]);

  useEffect(() => {
    // Seleccionar versículo aleatorio al cargar
    const randomIndex = Math.floor(Math.random() * versiculos.length);
    setVersiculoActual(versiculos[randomIndex]);

    // Cambiar versículo cada 2 horas
    const interval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * versiculos.length);
      setVersiculoActual(versiculos[randomIndex]);
    }, 2 * 60 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return versiculoActual;
}
