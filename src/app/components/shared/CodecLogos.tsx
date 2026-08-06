/**
 * CODEC POS v2.0 - Logos Oficiales
 * Usa logo.png importado directamente para funcionar en .exe
 */

import React, { useState } from 'react';
import logoImage from '/logo.png';

// ─── SVG LOGO INLINE (fallback si no existe logo.png) ──────────────────
const CodecSVGLogo: React.FC<{ size?: number; className?: string }> = ({ size = 64, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 256 256"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Fondo redondeado azul oscuro */}
    <rect width="256" height="256" rx="52" fill="#0f172a"/>
    <rect width="256" height="256" rx="52" fill="url(#bgGrad)"/>
    
    {/* Borde sutil */}
    <rect x="3" y="3" width="250" height="250" rx="50" stroke="url(#borderGrad)" strokeWidth="3" fill="none"/>

    {/* Círculo esmeralda */}
    <circle cx="128" cy="128" r="72" fill="url(#circleGrad)"/>
    {/* Brillo interior */}
    <circle cx="108" cy="108" r="36" fill="url(#shineGrad)"/>

    {/* Texto "CP" */}
    <text
      x="128"
      y="148"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
      fontWeight="900"
      fontSize="80"
      fill="white"
      style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.4))' }}
    >
      CP
    </text>

    {/* Punto verde brillante */}
    <circle cx="186" cy="186" r="16" fill="url(#dotGrad)"/>

    {/* Línea decorativa superior */}
    <line x1="64" y1="36" x2="192" y2="36" stroke="url(#lineGrad)" strokeWidth="4" strokeLinecap="round"/>

    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="256" y2="256">
        <stop offset="0%" stopColor="#0f172a"/>
        <stop offset="100%" stopColor="#1e293b"/>
      </linearGradient>
      <linearGradient id="borderGrad" x1="0" y1="0" x2="256" y2="256">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0.6"/>
        <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.3"/>
      </linearGradient>
      <radialGradient id="circleGrad" cx="40%" cy="35%" r="60%">
        <stop offset="0%" stopColor="#34d399"/>
        <stop offset="50%" stopColor="#10b981"/>
        <stop offset="100%" stopColor="#059669"/>
      </radialGradient>
      <radialGradient id="shineGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="white" stopOpacity="0.25"/>
        <stop offset="100%" stopColor="white" stopOpacity="0"/>
      </radialGradient>
      <radialGradient id="dotGrad" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#6ee7b7"/>
        <stop offset="100%" stopColor="#10b981"/>
      </radialGradient>
      <linearGradient id="lineGrad" x1="64" y1="36" x2="192" y2="36">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0"/>
        <stop offset="50%" stopColor="#10b981" stopOpacity="0.8"/>
        <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
      </linearGradient>
    </defs>
  </svg>
);

// ─── COMPONENTE CON FALLBACK ──────────────────────────────────────────────────
const CodecLogoImage: React.FC<{ size?: number; className?: string }> = ({ size = 64, className = '' }) => {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return <CodecSVGLogo size={size} className={className} />;
  }

  return (
    <img
      src={logoImage}
      alt="CODEC POS"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
      onError={() => setImgError(true)}
    />
  );
};

// ─── EXPORTS PÚBLICOS ─────────────────────────────────────────────────────────

/**
 * Logo principal de CODEC (imagen PNG si existe, SVG sino)
 * Coloca tu logo en /public/logo.png (mínimo 512×512px)
 */
export const CodecLogoIcon: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 64,
}) => <CodecLogoImage size={size} className={className} />;

/**
 * Logo horizontal con texto (para header, configuración)
 */
export const CodecLogoHorizontal: React.FC<{ className?: string; height?: number }> = ({
  className = '',
  height = 40,
}) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <CodecLogoImage size={height} />
    <div>
      <h1
        className="font-black text-white tracking-tight leading-none"
        style={{ fontSize: height * 0.6 }}
      >
        CODEC
      </h1>
      <p
        className="text-amber-400 font-bold leading-none"
        style={{ fontSize: height * 0.3 }}
      >
        POS v2.0
      </p>
    </div>
  </div>
);

/**
 * Favicon circular (para sidebar colapsado)
 */
export const CodecFavicon: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 48,
}) => (
  <div
    className={`rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center border border-slate-600/50 shadow-xl p-1 ${className}`}
    style={{ width: size, height: size }}
  >
    <CodecLogoImage size={size * 0.8} />
  </div>
);

/**
 * Logo completo con glow (pantallas de bienvenida)
 */
export const CodecLogoFull: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 120,
}) => (
  <div className={`relative ${className}`} style={{ width: size, height: size }}>
    <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/30 to-cyan-500/30 rounded-3xl blur-xl" />
    <div className="relative w-full h-full bg-gradient-to-br from-slate-700 to-slate-800 rounded-3xl flex items-center justify-center border border-slate-600/50 shadow-2xl">
      <CodecLogoImage size={size * 0.65} />
    </div>
  </div>
);

/**
 * Versión minimalista (impresos, facturas)
 */
export const CodecLogoMinimal: React.FC<{ className?: string; size?: number }> = ({
  className = '',
  size = 64,
}) => <CodecLogoImage size={size} className={className} />;