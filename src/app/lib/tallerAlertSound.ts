// CODEC POS v2.0 — Sonido de alerta para nuevas reparaciones asignadas
// Usa Web Audio API (sin archivos externos) — tres notas ascendentes tipo "ding"

export function playTallerAlertSound(): void {
  try {
    const ctx = new AudioContext();

    const playNote = (freq: number, startAt: number, duration: number, volume = 0.22) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startAt);
      gain.gain.setValueAtTime(volume, startAt);
      // Fade-out suave para evitar "clic" al terminar
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      osc.start(startAt);
      osc.stop(startAt + duration + 0.01);
    };

    const t = ctx.currentTime;
    playNote(880,  t,        0.14);  // La4  — primer ding
    playNote(1100, t + 0.18, 0.14);  // Do#5 — segundo ding
    playNote(1320, t + 0.36, 0.20);  // Mi5  — tercer ding (más largo)
  } catch {
    // AudioContext no disponible (e.g., en entorno sin audio) — silencio sin error
  }
}
