interface RingStatProps {
  label: string;
  value: string;
  pct: number;
  colorFrom: string;
  colorTo: string;
  size?: number;
  onClick?: () => void;
}

/**
 * Anillo de estadística con look "3D": gradiente cónico + sombra interior
 * (filtro SVG) que simula bisel/profundidad sin depender de WebGL — liviano
 * y nítido en pantallas de celular. El tamaño de letra se adapta al largo
 * del valor (p. ej. "$123.000" vs "4") para que nunca se salga del anillo.
 */
export function RingStat({ label, value, pct, colorFrom, colorTo, size = 108, onClick }: RingStatProps) {
  const stroke = size * 0.115;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const gradientId = `ring-${label.replace(/\s+/g, '-')}`;
  const shadowId = `${gradientId}-shadow`;

  // Área útil dentro del anillo ≈ diámetro interior; el ancho de texto real
  // de dígitos/mayúsculas anchos ronda ~0.62× el tamaño de letra por
  // carácter — se despeja el tamaño máximo que cabe y se limita al valor
  // "cómodo" por defecto (22% del tamaño del anillo).
  const diametroUtil = size - stroke * 2.4;
  const porCaracter = Math.max(1, value.length) * 0.62;
  const fontSizeMax = size * 0.24;
  const fontSize = Math.min(fontSizeMax, diametroUtil / porCaracter);

  const Wrapper = onClick ? 'button' : 'div';

  return (
    <Wrapper
      onClick={onClick}
      className={`flex flex-col items-center gap-2 ${onClick ? 'active:scale-95 transition-transform' : ''}`}
    >
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
        <div className="absolute inset-0 flex items-center justify-center px-1">
          <span className="text-white font-black leading-none whitespace-nowrap" style={{ fontSize }}>{value}</span>
        </div>
      </div>
      <span className="text-slate-400 text-[11px] font-semibold text-center leading-tight">{label}</span>
    </Wrapper>
  );
}
