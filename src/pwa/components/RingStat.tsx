interface RingStatProps {
  label: string;
  value: string;
  pct: number;
  colorFrom: string;
  colorTo: string;
  size?: number;
}

/**
 * Anillo de estadística con look "3D": gradiente cónico + sombra interior
 * (filtro SVG) que simula bisel/profundidad sin depender de WebGL — liviano
 * y nítido en pantallas de celular.
 */
export function RingStat({ label, value, pct, colorFrom, colorTo, size = 108 }: RingStatProps) {
  const stroke = size * 0.13;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const gradientId = `ring-${label.replace(/\s+/g, '-')}`;
  const shadowId = `${gradientId}-shadow`;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={colorFrom} />
              <stop offset="100%" stopColor={colorTo} />
            </linearGradient>
            <filter id={shadowId} x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor={colorTo} floodOpacity="0.55" />
            </filter>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-800" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            filter={`url(#${shadowId})`}
            style={{ transition: 'stroke-dashoffset 0.6s ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-black" style={{ fontSize: size * 0.22 }}>{value}</span>
        </div>
      </div>
      <span className="text-slate-400 text-[11px] font-semibold text-center leading-tight">{label}</span>
    </div>
  );
}
