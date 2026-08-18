import { useState, useEffect, useRef } from 'react'

// ─── Icon library (all hand-drawn SVG, no emojis) ────────────────────────────

const Icons = {
  logo: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="1" width="7" height="7" rx="2" fill="currentColor"/>
      <rect x="10" y="1" width="7" height="7" rx="2" fill="currentColor" opacity="0.45"/>
      <rect x="1" y="10" width="7" height="7" rx="2" fill="currentColor" opacity="0.45"/>
      <rect x="10" y="10" width="7" height="7" rx="2" fill="currentColor"/>
    </svg>
  ),
  check: (c = 'currentColor') => (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1.5 6L4.5 9L10.5 3" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  arrow: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  play: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6.5 5.5L10.5 8L6.5 10.5V5.5Z" fill="currentColor"/>
    </svg>
  ),
  star: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="#FBBF24">
      <path d="M6.5 1L7.9 4.8H12L8.9 7.1L10 11L6.5 8.7L3 11L4.1 7.1L1 4.8H5.1L6.5 1Z"/>
    </svg>
  ),
  wifi: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M2 9C5.31 5.69 9.43 4 11 4C12.57 4 16.69 5.69 20 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M5 12C7.24 9.76 9.26 9 11 9C12.74 9 14.76 9.76 17 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M8 15C9.1 13.9 10.1 13.5 11 13.5C11.9 13.5 12.9 13.9 14 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="11" cy="18" r="1.2" fill="currentColor"/>
    </svg>
  ),
  wifiOff: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M2 9C3.8 7.2 5.9 6 8 5.2M14 5.5C16 6.3 18 7.8 20 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M7 12.5C8.4 11.1 9.7 10.5 11 10.5C12.3 10.5 13.6 11.1 15 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M8 15C9.1 13.9 10.1 13.5 11 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="11" cy="18" r="1.2" fill="currentColor"/>
      <path d="M3 3L19 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  cloud: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M16 15H6a4 4 0 01-.5-7.9A5.5 5.5 0 0116.5 9H17a3 3 0 010 6H16z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11 11v5M9 14l2 2 2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  voice: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="7.5" y="3" width="5" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M4 10.5C4 13.81 6.69 16.5 10 16.5C13.31 16.5 16 13.81 16 10.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M10 16.5V19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M7 19H13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
  agent: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M3.5 17C3.5 13.96 6.46 12 10 12C13.54 12 16.5 13.96 16.5 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M13.5 4.5L15 3M15 3L16.5 1.5M15 3L16.5 4.5M15 3L13.5 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  ),
  shieldCheck: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 2L4 5.5V10.5C4 14.5 7 18.1 11 19.5C15 18.1 18 14.5 18 10.5V5.5L11 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M7.5 11L9.5 13L14.5 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  cart: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M2 2.5H4L6.5 13.5H15.5L17.5 7H5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="8" cy="16.5" r="1.2" fill="currentColor"/>
      <circle cx="14" cy="16.5" r="1.2" fill="currentColor"/>
    </svg>
  ),
  box: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 7L10 3.5L17 7V14L10 17.5L3 14V7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M10 3.5V17.5M3 7L10 10.5L17 7" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
    </svg>
  ),
  users: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M2.5 17C2.5 14.24 4.96 12 8 12C11.04 12 13.5 14.24 13.5 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M13 5C14.66 5 16 6.34 16 8C16 9.66 14.66 11 13 11" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M15 13.5C16.6 14.1 17.5 15.4 17.5 17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
  truck: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M2 5H13V14H2V5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M13 8H16L18 11V14H13V8Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <circle cx="5" cy="15.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="15.5" cy="15.5" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  wallet: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 5H16C16.55 5 17 5.45 17 6V15C17 15.55 16.55 16 16 16H4C3.45 16 3 15.55 3 15V6C3 5.45 3.45 5 4 5H16" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M3 9H17" stroke="currentColor" strokeWidth="1.7"/>
      <circle cx="14" cy="12.5" r="1.2" fill="currentColor"/>
    </svg>
  ),
  book: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 3H16V17H4V3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M4 3C4 3 6.5 2 10 3.5C13.5 2 16 3 16 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <path d="M7 8H13M7 11H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  receipt: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 2V18L6.5 16L9 18L11.5 16L14 18L16 16.5V2H4Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M7.5 7H12.5M7.5 10H12.5M7.5 13H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  barChart: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 17V7M8 17V10M13 17V4M18 17V11" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
      <path d="M1.5 17H19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
  wrench: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M13.5 3C11.02 3 9 5.02 9 7.5C9 8.06 9.11 8.59 9.3 9.07L3 15.37L4.63 17L10.93 10.7C11.41 10.89 11.94 11 12.5 11C14.98 11 17 8.98 17 6.5C17 5.86 16.84 5.25 16.56 4.73L14 7.29L12.71 6L15.27 3.44C14.75 3.16 14.14 3 13.5 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
    </svg>
  ),
  palette: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 3C6.13 3 3 6.13 3 10C3 13.87 6.13 17 10 17C10.55 17 11 16.55 11 16C11 15.73 10.89 15.5 10.72 15.33C10.55 15.16 10.45 14.93 10.45 14.67C10.45 14.12 10.9 13.67 11.45 13.67H13C15.21 13.67 17 11.88 17 9.67C17 5.98 13.87 3 10 3Z" stroke="currentColor" strokeWidth="1.7"/>
      <circle cx="7" cy="9" r="1.2" fill="currentColor"/>
      <circle cx="10" cy="6.5" r="1.2" fill="currentColor"/>
      <circle cx="13" cy="9" r="1.2" fill="currentColor"/>
    </svg>
  ),
  balloon: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <ellipse cx="10" cy="8.5" rx="5.5" ry="6" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M10 14.5V18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="1.5 2"/>
      <path d="M8 18H12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
  building: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 17V4H11V17M11 8H17V17" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M1.5 17H18.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
      <rect x="5.5" y="7" width="2" height="2.5" rx="0.5" fill="currentColor" opacity="0.6"/>
      <rect x="8.5" y="7" width="2" height="2.5" rx="0.5" fill="currentColor" opacity="0.6"/>
      <rect x="5.5" y="11.5" width="2" height="2.5" rx="0.5" fill="currentColor" opacity="0.6"/>
      <rect x="8.5" y="11.5" width="2" height="2.5" rx="0.5" fill="currentColor" opacity="0.6"/>
      <rect x="13" y="11.5" width="2" height="2.5" rx="0.5" fill="currentColor" opacity="0.4"/>
    </svg>
  ),
  smartphone: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="5" y="2" width="10" height="16" rx="2" stroke="currentColor" strokeWidth="1.7"/>
      <path d="M8.5 15.5H11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 5H15" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2V12M2 7H12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  x: (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 2L8 8M8 2L2 8" stroke="#94A3B8" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  sparkle: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 1V4M8 12V15M1 8H4M12 8H15M3.5 3.5L5.6 5.6M10.4 10.4L12.5 12.5M12.5 3.5L10.4 5.6M5.6 10.4L3.5 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  ),
  chevronDown: (open: boolean) => (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
      style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.22s ease' }}>
      <path d="M3 5L7 9L11 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  nequi: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8" fill="#6D28D9" opacity="0.15"/>
      <text x="9" y="13" textAnchor="middle" fontSize="9" fontWeight="700" fill="#6D28D9" fontFamily="DM Sans,sans-serif">N</text>
    </svg>
  ),
  daviplata: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8" fill="#EA580C" opacity="0.12"/>
      <text x="9" y="13" textAnchor="middle" fontSize="9" fontWeight="700" fill="#EA580C" fontFamily="DM Sans,sans-serif">D</text>
    </svg>
  ),
  bancolombia: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="8" fill="#FBBF24" opacity="0.15"/>
      <text x="9" y="13" textAnchor="middle" fontSize="9" fontWeight="700" fill="#B45309" fontFamily="DM Sans,sans-serif">B</text>
    </svg>
  ),
  menu: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 5H17M3 10H17M3 15H17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
    </svg>
  ),
}

// ─── Primitives ───────────────────────────────────────────────────────────────

function Tag({ children, variant = 'orange' }: { children: React.ReactNode; variant?: 'orange' | 'green' | 'navy' | 'light' }) {
  const styles: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    green:  'bg-emerald-50 text-emerald-700 border-emerald-200',
    navy:   'bg-slate-900 text-white border-slate-800',
    light:  'bg-white/10 text-white border-white/20',
  }
  return (
    <span className={`section-tag border ${styles[variant]}`}>{children}</span>
  )
}

function CheckRow({ children, dark = false }: { children: string; dark?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${dark ? 'bg-orange-500/20' : 'bg-emerald-100'}`}>
        {Icons.check(dark ? '#FB923C' : '#059669')}
      </div>
      <span className={`text-sm leading-relaxed ${dark ? 'text-slate-300' : 'text-slate-600'}`}>{children}</span>
    </div>
  )
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  const links = ['Funcionalidades', 'Módulos', 'App móvil', 'Precios']

  return (
    <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'nav-glass shadow-sm border-b border-slate-200/60' : ''}`}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg,#EA580C,#C2410C)' }}>
            {Icons.logo}
          </div>
          <span className="font-bold text-slate-900 text-lg tracking-tight" style={{ fontFamily: "'DM Sans',sans-serif" }}>
            Codec<span className="text-orange-600">POS</span>
          </span>
        </div>

        <div className="hidden md:flex items-center gap-7">
          {links.map(l => (
            <a key={l} href="#" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">{l}</a>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <a href="#" className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5 transition-colors">Iniciar sesión</a>
          <button className="btn-brand text-sm font-semibold px-5 py-2.5 rounded-xl">Probar gratis</button>
        </div>

        <button className="md:hidden p-2 text-slate-700" onClick={() => setOpen(!open)}>{Icons.menu}</button>
      </div>

      {open && (
        <div className="md:hidden nav-glass border-t border-slate-200/60 px-6 py-5 flex flex-col gap-4">
          {links.map(l => (
            <a key={l} href="#" className="text-sm font-medium text-slate-700">{l}</a>
          ))}
          <button className="btn-brand text-sm font-semibold px-5 py-3 rounded-xl">Probar gratis 14 días</button>
        </div>
      )}
    </nav>
  )
}

// ─── Hero Dashboard ───────────────────────────────────────────────────────────

function LiveCounter({ base }: { base: number }) {
  const [val, setVal] = useState(base)
  useEffect(() => {
    const id = setInterval(() => setVal(v => v + Math.floor(Math.random() * 140000 + 30000)), 2600)
    return () => clearInterval(id)
  }, [])
  const fmt = (n: number) => '$' + (n / 1000000).toFixed(2).replace('.', ',') + 'M'
  return <span style={{ animation: 'counter-tick 0.4s ease-out' }}>{fmt(val)}</span>
}

function HeroDashboard() {
  const bars = [55, 70, 48, 88, 76, 62, 95, 84, 71, 90, 97, 86]
  return (
    <div className="relative w-full max-w-md mx-auto animate-float">
      {/* Main panel */}
      <div className="rounded-2xl shadow-2xl overflow-hidden dark-panel" style={{ transform: 'rotateX(3deg) rotateY(-5deg)' }}>
        {/* Titlebar */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-white/5">
          <div className="flex gap-1.5">
            {['#EF4444','#FBBF24','#22C55E'].map(c => (
              <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c, opacity: 0.8 }}/>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ animation: 'pulse-dot 1.5s ease-in-out infinite' }}/>
            <span className="text-xs text-emerald-400" style={{ fontFamily: "'JetBrains Mono',monospace" }}>En línea</span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { label: 'Ventas hoy', el: <LiveCounter base={4312850}/>, up: '+12.4%' },
              { label: 'Facturas', el: <span>347</span>, up: '+8' },
              { label: 'Alertas stock', el: <span>3</span>, up: '−1' },
            ].map((k, i) => (
              <div key={i} className="rounded-xl p-3" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
                <div className="text-xs text-slate-500 mb-1" style={{ fontFamily:"'JetBrains Mono',monospace" }}>{k.label}</div>
                <div className="text-sm font-bold text-white" style={{ fontFamily:"'DM Sans',sans-serif" }}>{k.el}</div>
                <div className={`text-xs mt-0.5 font-medium ${i === 2 ? 'text-red-400' : 'text-emerald-400'}`}>{k.up}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="rounded-xl p-4" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-medium">Ventas por hora</span>
              <span className="text-xs text-orange-400" style={{ fontFamily:"'JetBrains Mono',monospace" }}>HOY</span>
            </div>
            <div className="flex items-end gap-1 h-14">
              {bars.map((h, i) => (
                <div key={i} className="flex-1 rounded-sm"
                  style={{
                    height:`${h}%`,
                    background: i >= bars.length - 2
                      ? 'linear-gradient(to top, #EA580C, #FB923C)'
                      : i >= bars.length - 5
                      ? 'rgba(234,88,12,0.4)'
                      : 'rgba(255,255,255,0.07)',
                    transformOrigin: 'bottom',
                    animation: `bar-grow 0.5s ease-out ${i * 45}ms both`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Transactions */}
          <div className="space-y-2">
            {[
              { store: 'Tienda Centro', amount: '+$87.500', method: 'Nequi', ok: true },
              { store: 'Tienda Norte',  amount: '+$124.000', method: 'Efectivo', ok: false },
              { store: 'Tienda Sur',   amount: '+$56.000',  method: 'Daviplata', ok: true },
            ].map((tx, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
                    style={{ background:'rgba(234,88,12,0.14)', color:'#FB923C' }}>
                    {tx.store[7]}
                  </div>
                  <div>
                    <div className="text-xs text-white font-medium">{tx.store}</div>
                    <div className="text-xs text-slate-500">{tx.method}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-400" style={{ fontFamily:"'JetBrains Mono',monospace" }}>{tx.amount}</span>
                  {tx.ok && (
                    <div className="w-4 h-4 rounded flex items-center justify-center" style={{ background:'rgba(5,150,105,0.2)' }}>
                      {Icons.check('#10B981')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating verify notification */}
      <div className="absolute -bottom-6 -left-8 glass-light rounded-2xl px-4 py-3 shadow-xl animate-float-b">
        <div className="flex items-center gap-3">
          <div className="relative w-8 h-8 flex-shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500" style={{ animation:'ping-ring 1.8s ease-out infinite' }}/>
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">{Icons.shieldCheck}</div>
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900">Nequi confirmado</div>
            <div className="text-xs text-emerald-600">+$45.000 · automático</div>
          </div>
        </div>
      </div>

      {/* Floating offline badge */}
      <div className="absolute -top-4 -right-6 glass-light rounded-xl px-3 py-2 shadow-xl">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-500" style={{ animation:'pulse-dot 2s ease-in-out infinite' }}/>
          <span className="text-xs font-semibold text-slate-700">Sin internet · Sigue funcionando</span>
        </div>
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-20"
      style={{ background:'linear-gradient(155deg,#FFFBF7 0%,#FFF7ED 35%,#ECFDF5 100%)' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage:'linear-gradient(rgba(234,88,12,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(234,88,12,0.04) 1px,transparent 1px)', backgroundSize:'52px 52px' }}/>
      <div className="absolute top-32 right-1/4 w-80 h-80 rounded-full pointer-events-none"
        style={{ background:'radial-gradient(circle,rgba(234,88,12,0.1) 0%,transparent 70%)', filter:'blur(48px)' }}/>
      <div className="absolute bottom-20 left-1/4 w-72 h-72 rounded-full pointer-events-none"
        style={{ background:'radial-gradient(circle,rgba(5,150,105,0.1) 0%,transparent 70%)', filter:'blur(48px)' }}/>

      <div className="max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-16 items-center w-full">
        <div className="animate-slide-up">
          <div className="flex items-center gap-2 mb-6">
            <Tag variant="orange">Hecho para Colombia</Tag>
            <Tag variant="green">DIAN · Nequi · Daviplata</Tag>
          </div>

          <h1 className="text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight text-slate-900 mb-6"
            style={{ fontFamily:"'DM Sans',sans-serif" }}>
            El sistema que{' '}
            <span className="gradient-text">controla todo</span>{' '}
            tu negocio
          </h1>

          <p className="text-lg text-slate-600 leading-relaxed mb-8 max-w-lg">
            Ventas, inventario, contabilidad, facturación electrónica DIAN y confirmación automática de pagos — en un solo sistema que{' '}
            <strong className="text-slate-900">sigue funcionando aunque se vaya el internet</strong>.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 mb-8">
            <button className="btn-brand px-8 py-3.5 rounded-xl text-base font-bold flex items-center justify-center gap-2">
              Probar gratis 14 días
              <span>{Icons.arrow}</span>
            </button>
            <button className="px-8 py-3.5 rounded-xl text-base font-semibold text-slate-700 border border-slate-300 bg-white hover:border-orange-300 hover:text-orange-700 transition-all flex items-center justify-center gap-2">
              <span className="text-orange-600">{Icons.play}</span>
              Ver cómo funciona
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-5 text-sm text-slate-500">
            {['Sin tarjeta de crédito', 'Sin permanencia', 'Soporte en español'].map((item, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="text-emerald-600">{Icons.check('#059669')}</span>{item}
              </span>
            ))}
          </div>

          <div className="mt-10 pt-8 border-t border-slate-200/70 flex items-center gap-6">
            <div className="flex -space-x-2">
              {['#EA580C','#059669','#7C3AED','#B45309'].map((c, i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: c }}>
                  {['JR','MC','PL','AV'][i]}
                </div>
              ))}
            </div>
            <div>
              <div className="flex gap-0.5 mb-0.5">{[...Array(5)].map((_,i) => <span key={i}>{Icons.star}</span>)}</div>
              <p className="text-xs text-slate-500">Ya lo usan <strong className="text-slate-700">negocios en toda Colombia</strong></p>
            </div>
          </div>
        </div>

        <div className="flex justify-center">
          <HeroDashboard/>
        </div>
      </div>
    </section>
  )
}

// ─── Problems ─────────────────────────────────────────────────────────────────

function Problems() {
  const items = [
    { icon: Icons.barChart, title: 'No sabes cuánto vendes de verdad', desc: 'Números dispersos entre cuadernos, WhatsApp y la memoria del cajero.' },
    { icon: Icons.box,      title: 'Inventario desactualizado',          desc: 'Vendes algo que ya no tienes, o descubres el faltante cuando ya es tarde.' },
    { icon: Icons.book,     title: 'Información dispersa',               desc: 'Ventas en un lado, gastos en otro, facturas en ningún lado.' },
    { icon: Icons.wifiOff,  title: 'Dependes del internet para vender',  desc: 'Se cae la conexión y el negocio se detiene con ella.' },
    { icon: Icons.wallet,   title: 'No conoces tu rentabilidad real',    desc: 'Vendes mucho, pero no sabes cuánto de eso es ganancia de verdad.' },
    { icon: Icons.building, title: 'Varias tiendas, cero visibilidad',   desc: 'Cada local es una isla — te toca llamar o ir físicamente para saber cómo va.' },
  ]

  return (
    <section className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <Tag variant="orange">El problema real</Tag>
          <h2 className="text-4xl font-bold text-slate-900 mt-4 mb-4" style={{ fontFamily:"'DM Sans',sans-serif" }}>
            Administrar un negocio a ciegas<br/>es agotador
          </h2>
          <p className="text-lg text-slate-500 max-w-lg mx-auto">
            Si te suena familiar alguno de estos puntos, Codec POS se construyó exactamente para resolverlo.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item, i) => (
            <div key={i} className="group rounded-2xl p-6 border border-slate-100 bg-slate-50 hover:bg-white hover:border-orange-100 hover:shadow-md transition-all duration-200 card-lift">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 mb-4">{item.icon}</div>
              <h3 className="font-semibold text-slate-900 mb-2" style={{ fontFamily:"'DM Sans',sans-serif" }}>{item.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-slate-700 font-medium mt-10">
          Codec POS pone todo eso en un solo lugar —{' '}
          <span className="text-orange-600 font-semibold">desde tu computador y desde tu celular.</span>
        </p>
      </div>
    </section>
  )
}

// ─── Offline / Online ─────────────────────────────────────────────────────────

function OfflineSection() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep(s => (s + 1) % 3), 2800)
    return () => clearInterval(id)
  }, [])

  const steps = [
    { label: 'Hay internet', desc: 'Codec POS sincroniza ventas, inventario y reportes con la nube en tiempo real.', accent: '#10B981', icon: Icons.wifi },
    { label: 'Se va la conexión', desc: 'Tu negocio sigue vendiendo sin interrupciones. Nada se detiene en la caja.', accent: '#EA580C', icon: Icons.wifiOff },
    { label: 'Vuelve el internet', desc: 'Todo se sincroniza solo, con respaldo automático en la nube. No pierdes nada.', accent: '#3B82F6', icon: Icons.cloud },
  ]

  return (
    <section className="py-28 relative overflow-hidden" style={{ background:'linear-gradient(135deg,#0F172A 0%,#1E2D3D 100%)' }}>
      {/* Grid */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage:'linear-gradient(rgba(255,255,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.03) 1px,transparent 1px)', backgroundSize:'52px 52px' }}/>

      {/* Orange glow left */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{ background:'radial-gradient(circle,rgba(234,88,12,0.15) 0%,transparent 65%)', filter:'blur(40px)' }}/>
      {/* Green glow right */}
      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{ background:'radial-gradient(circle,rgba(5,150,105,0.12) 0%,transparent 65%)', filter:'blur(40px)' }}/>

      <div className="max-w-6xl mx-auto px-6 relative z-10">
        {/* Header */}
        <div className="text-center mb-20">
          <Tag variant="light">La base de todo</Tag>
          <h2 className="text-5xl font-bold text-white mt-5 mb-5 leading-tight" style={{ fontFamily:"'DM Sans',sans-serif" }}>
            Funciona con internet.<br/>
            <span style={{ color:'#FB923C' }}>Funciona sin internet.</span>
          </h2>
          <p className="text-slate-400 text-xl max-w-xl mx-auto">
            La mayoría de sistemas se detienen apenas se va la conexión. Codec POS no.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Steps */}
          <div className="space-y-4">
            {steps.map((s, i) => (
              <button key={i} onClick={() => setStep(i)}
                className="w-full text-left rounded-2xl p-6 transition-all duration-300 border"
                style={{
                  background: step === i ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.02)',
                  borderColor: step === i ? `${s.accent}50` : 'rgba(255,255,255,0.06)',
                  boxShadow: step === i ? `0 0 32px ${s.accent}18` : 'none',
                }}>
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-all"
                    style={{ background: step === i ? `${s.accent}22` : 'rgba(255,255,255,0.05)', color: step === i ? s.accent : '#475569' }}>
                    {s.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold mb-1 transition-colors"
                      style={{ color: step === i ? s.accent : '#64748B', fontFamily:"'DM Sans',sans-serif" }}>
                      {s.label}
                    </div>
                    <div className={`text-sm leading-relaxed transition-colors ${step === i ? 'text-slate-300' : 'text-slate-600'}`}>
                      {s.desc}
                    </div>
                  </div>
                  {step === i && (
                    <div className="flex-shrink-0 w-2 h-2 rounded-full" style={{ background: s.accent, boxShadow:`0 0 8px ${s.accent}` }}/>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Visual orbit */}
          <div className="flex justify-center items-center">
            <div className="relative w-72 h-72">
              {/* Orbit rings */}
              {[110, 80, 50].map((r, i) => (
                <div key={i} className="absolute rounded-full border"
                  style={{
                    inset: `${(110 - r) / 2}px`,
                    borderColor: 'rgba(255,255,255,0.06)',
                    animation: `spin-slow ${18 + i * 8}s linear infinite ${i % 2 ? 'reverse' : ''}`,
                  }}/>
              ))}

              {/* Center */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-2xl flex items-center justify-center"
                  style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.09)', color: steps[step].accent, transition:'color 0.4s' }}>
                  <div style={{ transform:'scale(2.2)' }}>{steps[step].icon}</div>
                </div>
              </div>

              {/* Orbiting dots */}
              {[0, 72, 144, 216, 288].map((angle, i) => {
                const rad = (angle * Math.PI) / 180
                const r = 100
                return (
                  <div key={i} className="absolute w-3 h-3 rounded-full"
                    style={{
                      left:`calc(50% + ${Math.cos(rad) * r}px - 6px)`,
                      top:`calc(50% + ${Math.sin(rad) * r}px - 6px)`,
                      background: i % 2 === 0 ? '#EA580C' : '#059669',
                      opacity: 0.75,
                      animation:`pulse-dot ${1.4 + i * 0.28}s ease-in-out infinite`,
                    }}/>
                )
              })}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-20 grid grid-cols-3 gap-6 border-t border-white/5 pt-16">
          {[
            { val: '99.9%', label: 'Uptime garantizado', color: '#10B981' },
            { val: 'Sin límite', label: 'Ventas offline almacenadas', color: '#FB923C' },
            { val: 'Automático', label: 'Sincronización al reconectar', color: '#60A5FA' },
          ].map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-3xl font-bold mb-1" style={{ color: s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
              <div className="text-sm text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Features ─────────────────────────────────────────────────────────────────

function Features() {
  const features = [
    { icon: Icons.cart,     title: 'Ventas',                  desc: 'Controla tus ventas y toda la operación del día, desde la caja principal.' },
    { icon: Icons.box,      title: 'Inventario',              desc: 'Control de existencias y movimientos, con alertas cuando algo se está agotando.' },
    { icon: Icons.users,    title: 'Clientes',                desc: 'Administra tus clientes y su información en un solo lugar.' },
    { icon: Icons.truck,    title: 'Proveedores',             desc: 'Gestiona proveedores y compras sin perder el hilo.' },
    { icon: Icons.wallet,   title: 'Gastos',                  desc: 'Registra y controla los gastos del negocio, día a día.' },
    { icon: Icons.book,     title: 'Contabilidad',            desc: 'Control financiero integrado — ingresos, gastos y flujo de caja, sin un sistema aparte.' },
    { icon: Icons.receipt,  title: 'Facturación electrónica', desc: 'Preparada para la DIAN — activarla es cuestión de configurar tu firma digital.' },
    { icon: Icons.barChart, title: 'Reportes',               desc: 'La información que necesitas para tomar decisiones, no solo para archivar.' },
  ]

  return (
    <section className="py-24 bg-white" id="funcionalidades">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <Tag variant="orange">Todo lo que necesitas, integrado</Tag>
          <h2 className="text-4xl font-bold text-slate-900 mt-4 mb-4" style={{ fontFamily:"'DM Sans',sans-serif" }}>
            Un sistema completo,<br/>no una app más para agregar
          </h2>
          <p className="text-lg text-slate-500 max-w-lg mx-auto">
            Cada función ya viene incluida — no son promesas de "próximamente".
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <div key={i} className="group rounded-2xl p-6 border border-slate-100 hover:border-orange-100 hover:shadow-lg transition-all duration-200 card-lift bg-white">
              <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center mb-4">{f.icon}</div>
              <h3 className="font-semibold text-slate-900 mb-2" style={{ fontFamily:"'DM Sans',sans-serif" }}>{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Codec Verify — enhanced with voice agent ─────────────────────────────────

function VoiceBars({ active }: { active: boolean }) {
  const heights = [0.3, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.4, 1, 0.7, 0.5, 0.9, 0.6, 0.8, 0.3]
  return (
    <div className="flex items-center gap-[3px] h-8">
      {heights.map((h, i) => (
        <div key={i} className="voice-bar"
          style={{
            height: `${h * 100}%`,
            background: active ? '#EA580C' : '#CBD5E1',
            animation: active ? `voice-wave ${0.6 + (i % 5) * 0.15}s ease-in-out infinite alternate ${i * 40}ms` : 'none',
            transition: 'background 0.3s',
          }}/>
      ))}
    </div>
  )
}

function VerifySection() {
  const [state, setState] = useState<'waiting' | 'verifying' | 'confirmed'>('waiting')
  const [agentSpeaking, setAgentSpeaking] = useState(false)
  const [buyerNotified, setBuyerNotified] = useState(false)

  useEffect(() => {
    const cycle = () => {
      setState('waiting')
      setAgentSpeaking(false)
      setBuyerNotified(false)

      setTimeout(() => setState('verifying'), 1200)
      setTimeout(() => {
        setState('confirmed')
        setBuyerNotified(true)
      }, 3000)
      setTimeout(() => setAgentSpeaking(true), 3400)
      setTimeout(() => setAgentSpeaking(false), 5600)
    }
    cycle()
    const id = setInterval(cycle, 7500)
    return () => clearInterval(id)
  }, [])

  const stateColors = { waiting: '#94A3B8', verifying: '#EA580C', confirmed: '#059669' }
  const stateLabels = { waiting: 'Esperando pago…', verifying: 'Verificando transferencia…', confirmed: 'Pago confirmado' }

  return (
    <section className="py-28 relative overflow-hidden" style={{ background:'linear-gradient(155deg,#FFF7ED 0%,#ECFDF5 60%,#F0FDF4 100%)' }}>
      {/* Accent orbs */}
      <div className="absolute -left-24 top-1/2 w-80 h-80 rounded-full pointer-events-none"
        style={{ background:'radial-gradient(circle,rgba(234,88,12,0.1) 0%,transparent 70%)', filter:'blur(48px)' }}/>
      <div className="absolute -right-24 top-1/2 w-80 h-80 rounded-full pointer-events-none"
        style={{ background:'radial-gradient(circle,rgba(5,150,105,0.1) 0%,transparent 70%)', filter:'blur(48px)' }}/>

      <div className="max-w-6xl mx-auto px-6">
        {/* Hero headline */}
        <div className="text-center mb-20">
          <Tag variant="green">Exclusivo · Codec Verify</Tag>
          <h2 className="text-5xl font-bold text-slate-900 mt-5 mb-5 leading-tight" style={{ fontFamily:"'DM Sans',sans-serif" }}>
            Pagos confirmados solos.<br/>
            <span className="text-orange-600">Con voz.</span> Sin tocar nada.
          </h2>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Cuando llega un pago por Nequi, Daviplata o Bancolombia, Codec Verify lo confirma automáticamente — y el agente de voz lo anuncia al cajero y al cliente en tiempo real.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-16 items-start">
          {/* Left: how it works */}
          <div className="space-y-6">
            {/* Step 1 — payment arrives */}
            <div className={`rounded-2xl p-6 border transition-all duration-400 ${state !== 'waiting' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-white'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${state !== 'waiting' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {Icons.wallet}
                </div>
                <div>
                  <div className="font-semibold text-slate-900 mb-1" style={{ fontFamily:"'DM Sans',sans-serif" }}>
                    1. El cliente transfiere
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    El cliente paga por Nequi, Daviplata o Bancolombia. Codec Verify detecta la transferencia en segundos.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2 — verification */}
            <div className={`rounded-2xl p-6 border transition-all duration-400 ${state === 'verifying' ? 'border-orange-200 bg-orange-50' : state === 'confirmed' ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-white'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${state === 'verifying' ? 'bg-orange-100 text-orange-600' : state === 'confirmed' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {Icons.shieldCheck}
                </div>
                <div>
                  <div className="font-semibold text-slate-900 mb-1" style={{ fontFamily:"'DM Sans',sans-serif" }}>
                    2. Verificación automática
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Sin que el cajero revise el celular. Sin preguntar "¿ya te llegó?". El sistema lo hace solo.
                  </p>
                  {state === 'verifying' && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full border-2 border-orange-500 border-t-transparent animate-spin"/>
                      <span className="text-xs text-orange-600 font-medium" style={{ fontFamily:"'JetBrains Mono',monospace" }}>Procesando…</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3 — notification to buyer */}
            <div className={`rounded-2xl p-6 border transition-all duration-400 ${buyerNotified ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-white'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${buyerNotified ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {Icons.smartphone}
                </div>
                <div>
                  <div className="font-semibold text-slate-900 mb-1" style={{ fontFamily:"'DM Sans',sans-serif" }}>
                    3. El cliente recibe su notificación
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    La confirmación llega al dispositivo del cliente al instante — sin papel, sin demora.
                  </p>
                  {buyerNotified && (
                    <div className="mt-3 inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 rounded-full px-3 py-1 text-xs font-semibold animate-fade-in">
                      <span>{Icons.check('#059669')}</span> Notificación enviada
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 4 — voice agent */}
            <div className={`rounded-2xl p-6 border-2 transition-all duration-400 relative overflow-hidden ${agentSpeaking ? 'border-orange-400 bg-orange-50' : 'border-dashed border-orange-200 bg-orange-50/40'}`}
              style={{ boxShadow: agentSpeaking ? '0 0 0 4px rgba(234,88,12,0.12)' : 'none' }}>
              {agentSpeaking && (
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background:'radial-gradient(ellipse at 50% 50%,rgba(234,88,12,0.06) 0%,transparent 70%)' }}/>
              )}
              <div className="flex items-start gap-4 relative z-10">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all ${agentSpeaking ? 'bg-orange-500 text-white animate-glow-orange' : 'bg-orange-100 text-orange-600'}`}>
                  {Icons.agent}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-slate-900" style={{ fontFamily:"'DM Sans',sans-serif" }}>
                      4. El agente de voz lo anuncia
                    </span>
                    {agentSpeaking && (
                      <span className="text-xs bg-orange-200 text-orange-700 rounded-full px-2 py-0.5 font-bold" style={{ fontFamily:"'JetBrains Mono',monospace" }}>EN VIVO</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed mb-3">
                    Un agente de voz anuncia la confirmación en el punto de venta. El cajero escucha, el cliente escucha. Ambos saben que el pago llegó.
                  </p>

                  {/* Voice visualizer */}
                  <div className={`rounded-xl px-4 py-3 flex items-center gap-4 transition-all ${agentSpeaking ? 'bg-white border border-orange-200 shadow-sm' : 'bg-white/50 border border-slate-100'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${agentSpeaking ? 'bg-orange-100 text-orange-600' : 'bg-slate-100 text-slate-400'}`}>
                      {Icons.voice}
                    </div>
                    <div className="flex-1">
                      {agentSpeaking ? (
                        <div className="animate-fade-in">
                          <div className="text-xs font-semibold text-orange-700 mb-1" style={{ fontFamily:"'JetBrains Mono',monospace" }}>Codec Agent · Hablando</div>
                          <VoiceBars active={true}/>
                          <div className="text-xs text-slate-500 mt-1.5 italic">"Pago de $45.000 confirmado — Nequi"</div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs font-semibold text-slate-400 mb-1" style={{ fontFamily:"'JetBrains Mono',monospace" }}>Codec Agent · En espera</div>
                          <VoiceBars active={false}/>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: payment terminal mockup */}
          <div className="flex justify-center items-start pt-4">
            <div className="relative w-80">
              {/* Terminal */}
              <div className="rounded-3xl shadow-2xl overflow-hidden dark-panel">
                <div className="px-5 py-4 flex items-center justify-between border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: stateColors[state], animation:'pulse-dot 1.4s ease-in-out infinite' }}/>
                    <span className="text-xs font-semibold" style={{ color: stateColors[state], fontFamily:"'JetBrains Mono',monospace", transition:'color 0.3s' }}>
                      {stateLabels[state]}
                    </span>
                  </div>
                  <span className="text-xs text-slate-600" style={{ fontFamily:"'JetBrains Mono',monospace" }}>Codec Verify</span>
                </div>

                <div className="p-6">
                  {/* Circle status */}
                  <div className="flex justify-center mb-6">
                    <div className="relative">
                      {state === 'confirmed' && (
                        <>
                          <div className="absolute inset-0 rounded-full border-2 border-emerald-500" style={{ animation:'ping-ring 1.2s ease-out 1' }}/>
                          <div className="absolute inset-0 rounded-full border-2 border-emerald-500" style={{ animation:'ping-ring 1.2s ease-out 0.4s 1' }}/>
                        </>
                      )}
                      <div className="w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500"
                        style={{ background: state === 'confirmed' ? '#059669' : state === 'verifying' ? 'rgba(234,88,12,0.15)' : 'rgba(255,255,255,0.06)' }}>
                        {state === 'confirmed' ? (
                          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="animate-fade-in">
                            <path d="M7 18L14 25L29 11" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        ) : state === 'verifying' ? (
                          <div className="w-8 h-8 rounded-full border-3 border-orange-500 border-t-transparent animate-spin" style={{ borderWidth:3 }}/>
                        ) : (
                          <div className="text-slate-600">{Icons.shieldCheck}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-center mb-6">
                    <div className="text-3xl font-bold text-white mb-1" style={{ fontFamily:"'DM Sans',sans-serif",
                      color: state === 'confirmed' ? '#10B981' : state === 'verifying' ? '#FB923C' : '#475569',
                      transition:'color 0.4s' }}>
                      +$45.000
                    </div>
                    <div className="text-sm text-slate-500">Transferencia Nequi</div>
                  </div>

                  {/* App icons */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {[
                      { icon: Icons.nequi, label:'Nequi', active: true },
                      { icon: Icons.daviplata, label:'Daviplata', active: false },
                      { icon: Icons.bancolombia, label:'Bancolombia', active: false },
                    ].map((app, i) => (
                      <div key={i} className="rounded-xl p-2.5 text-center"
                        style={{ background: app.active ? 'rgba(234,88,12,0.1)' : 'rgba(255,255,255,0.03)', border:`1px solid ${app.active ? 'rgba(234,88,12,0.25)' : 'rgba(255,255,255,0.05)'}` }}>
                        <div className="flex justify-center mb-1">{app.icon}</div>
                        <div className="text-xs text-slate-400">{app.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Voice agent bar */}
                  <div className={`rounded-xl p-3 flex items-center gap-3 transition-all ${agentSpeaking ? 'bg-orange-500/10 border border-orange-500/25' : 'border border-white/5'}`}
                    style={{ background: agentSpeaking ? undefined : 'rgba(255,255,255,0.02)' }}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${agentSpeaking ? 'bg-orange-500 text-white' : 'bg-white/5 text-slate-500'}`}>
                      {Icons.agent}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold mb-0.5" style={{ color: agentSpeaking ? '#FB923C' : '#475569', fontFamily:"'JetBrains Mono',monospace" }}>
                        {agentSpeaking ? 'Agente hablando' : 'Agente de voz'}
                      </div>
                      <VoiceBars active={agentSpeaking}/>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating buyer notification */}
              {buyerNotified && (
                <div className="absolute -bottom-5 -left-10 glass-light rounded-2xl px-4 py-3 shadow-xl animate-slide-up">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 text-emerald-700">
                      {Icons.smartphone}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">Notificación al cliente</div>
                      <div className="text-xs text-emerald-600">Pago confirmado · $45.000</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Benefits row */}
        <div className="mt-20 grid sm:grid-cols-3 gap-6">
          {[
            { icon: Icons.shieldCheck, title: 'Sin comisión por transacción', desc: 'No pagas nada extra por cada pago verificado. Sin cuenta de comercio.' },
            { icon: Icons.agent,       title: 'Agente de voz en tiempo real', desc: 'Confirmación audible para cajero y cliente. Cero ambigüedad, cero errores humanos.' },
            { icon: Icons.sparkle,     title: 'Nequi, Daviplata y Bancolombia', desc: 'Las transferencias más usadas en Colombia, integradas desde el primer día.' },
          ].map((b, i) => (
            <div key={i} className="rounded-2xl p-6 bg-white border border-slate-100 hover:border-orange-100 hover:shadow-md transition-all card-lift">
              <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center mb-4">{b.icon}</div>
              <h4 className="font-semibold text-slate-900 mb-2" style={{ fontFamily:"'DM Sans',sans-serif" }}>{b.title}</h4>
              <p className="text-sm text-slate-500 leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Modules ─────────────────────────────────────────────────────────────────

function Modules() {
  const mods = [
    { icon: Icons.wrench,  title: 'Taller de Reparaciones', desc: 'Recepción de equipos, cotización, cobro y técnico asignado — de principio a fin.', plan: 'Básico' },
    { icon: Icons.palette, title: 'Artes Gráficas',         desc: 'Catálogo por escalas de precio y facturación con abono, para imprentas y talleres.', plan: 'Premium' },
    { icon: Icons.balloon, title: 'Papelería y Piñatería',  desc: 'Globos por calibre y color, carga masiva de inventario — pensado para este negocio.', plan: 'Premium' },
  ]
  return (
    <section className="py-24 bg-white" id="modulos">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <Tag variant="orange">Para negocios con operación especializada</Tag>
          <h2 className="text-4xl font-bold text-slate-900 mt-4 mb-4" style={{ fontFamily:"'DM Sans',sans-serif" }}>
            Módulos hechos para<br/>tu tipo de negocio
          </h2>
          <p className="text-lg text-slate-500 max-w-lg mx-auto">
            Si tu negocio necesita algo más que un POS genérico, Codec POS ya lo trae.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {mods.map((m, i) => (
            <div key={i} className="rounded-2xl p-7 border border-slate-100 hover:border-orange-100 hover:shadow-lg card-lift transition-all duration-200 relative overflow-hidden bg-white">
              <div className="absolute top-0 right-0 w-28 h-28 rounded-full pointer-events-none"
                style={{ background:'rgba(234,88,12,0.05)', transform:'translate(30%,-30%)' }}/>
              <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center mb-5">{m.icon}</div>
              <h3 className="font-semibold text-slate-900 text-lg mb-2" style={{ fontFamily:"'DM Sans',sans-serif" }}>{m.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-5">{m.desc}</p>
              <span className={`inline-flex text-xs font-bold px-3 py-1 rounded-full border ${m.plan === 'Básico' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}
                style={{ fontFamily:"'JetBrains Mono',monospace" }}>
                {m.plan}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Mobile App ───────────────────────────────────────────────────────────────

function MobileApp() {
  return (
    <section className="py-24" id="app-movil" style={{ background:'linear-gradient(160deg,#0F172A,#1A2744)' }}>
      <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <Tag variant="light">En tu bolsillo</Tag>
          <h2 className="text-4xl font-bold text-white mt-5 mb-5 leading-tight" style={{ fontFamily:"'DM Sans',sans-serif" }}>
            Tu negocio también<br/>
            <span style={{ color:'#FB923C' }}>desde tu celular</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed mb-8">
            La app móvil de Codec POS no es una versión "solo para mirar" — puedes operar ventas, revisar inventario, registrar gastos y administrar tu negocio desde donde estés.
          </p>
          <div className="space-y-3 mb-10">
            <CheckRow dark>Vende directamente desde el celular, con descuento de inventario real</CheckRow>
            <CheckRow dark>Revisa tus métricas del día sin estar frente al computador</CheckRow>
            <CheckRow dark>Misma información, sincronizada con tu sistema principal</CheckRow>
          </div>
          <button className="btn-brand px-7 py-3.5 rounded-xl text-base font-bold">
            Probar gratis 14 días
          </button>
        </div>

        {/* Phone mockup */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="w-56 rounded-[2.5rem] overflow-hidden shadow-2xl"
              style={{ background:'#0F172A', border:'1px solid rgba(255,255,255,0.1)', padding:'6px' }}>
              <div className="rounded-[2rem] overflow-hidden" style={{ background:'#1E293B' }}>
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-16 h-1 rounded-full bg-white/10"/>
                </div>
                <div className="px-4 pb-5">
                  <div className="text-xs text-slate-500 mb-1">Mi Tienda</div>
                  <div className="text-white font-bold text-lg mb-4" style={{ fontFamily:"'DM Sans',sans-serif" }}>Buenos días</div>
                  <div className="rounded-2xl p-4 mb-3" style={{ background:'linear-gradient(135deg,#EA580C,#C2410C)' }}>
                    <div className="text-xs text-orange-200 mb-1">Ventas de hoy</div>
                    <div className="text-2xl font-bold text-white" style={{ fontFamily:"'DM Sans',sans-serif" }}>$1.230.000</div>
                    <div className="text-xs text-orange-200 mt-1">↑ +18.4% vs ayer</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[{l:'Productos',v:'312'},{l:'Clientes',v:'47'}].map((s,i) => (
                      <div key={i} className="rounded-xl p-3" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>
                        <div className="text-xs text-slate-500 mb-0.5">{s.l}</div>
                        <div className="text-base font-bold text-white" style={{ fontFamily:"'JetBrains Mono',monospace" }}>{s.v}</div>
                      </div>
                    ))}
                  </div>
                  <button className="w-full rounded-xl py-3 text-sm font-bold text-white"
                    style={{ background:'linear-gradient(135deg,#059669,#047857)' }}>
                    Vender
                  </button>
                </div>
              </div>
            </div>
            <div className="absolute -right-10 top-14 glass-light rounded-xl px-3 py-2 shadow-xl text-xs">
              <div className="font-semibold text-slate-900">Sync automático</div>
              <div className="text-slate-500 text-xs">hace 2 seg</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Multi-store ──────────────────────────────────────────────────────────────

function MultiStore() {
  const stores = [
    { name:'Tienda Centro', sales:'$2.340.000', active: true },
    { name:'Tienda Norte',  sales:'$1.890.000', active: true },
    { name:'Tienda Sur',    sales:'$1.120.000', active: false },
  ]
  return (
    <section className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
        <div className="order-2 md:order-1 space-y-3">
          {stores.map((s, i) => (
            <div key={i} className="rounded-2xl p-4 border border-slate-100 bg-slate-50 hover:shadow-md hover:border-orange-100 card-lift transition-all">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center">
                    {Icons.building}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900 text-sm" style={{ fontFamily:"'DM Sans',sans-serif" }}>{s.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full ${s.active ? 'bg-emerald-500' : 'bg-amber-400'}`}/>
                      <span className="text-xs text-slate-500">{s.active ? 'En operación' : 'Baja actividad'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-slate-900 text-sm" style={{ fontFamily:"'JetBrains Mono',monospace" }}>{s.sales}</div>
                  <div className="text-xs text-emerald-600">hoy</div>
                </div>
              </div>
            </div>
          ))}
          <button className="w-full rounded-2xl py-3 text-sm font-semibold text-orange-600 border border-dashed border-orange-200 hover:bg-orange-50 transition-colors flex items-center justify-center gap-2">
            <span>{Icons.plus}</span> Vincular tienda
          </button>
        </div>

        <div className="order-1 md:order-2">
          <Tag variant="orange">Para negocios que crecen</Tag>
          <h2 className="text-4xl font-bold text-slate-900 mt-4 mb-5 leading-tight" style={{ fontFamily:"'DM Sans',sans-serif" }}>
            Administra varias tiendas<br/>
            <span className="text-orange-600">desde un solo lugar</span>
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed mb-6">
            Con un solo inicio de sesión puedes ver las métricas de todas tus sucursales — ventas, gastos y devoluciones de cada local, sin tener que entrar local por local.
          </p>
          <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-50 border border-orange-100">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0">{Icons.building}</div>
            <div>
              <div className="font-semibold text-slate-900 text-sm">Multi-tienda incluido en Premium</div>
              <div className="text-xs text-slate-500">Agrega las sucursales que necesites</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

function Pricing() {
  const [annual, setAnnual] = useState(false)

  const plans = [
    {
      name: 'Básico',
      price: annual ? 24990 : 29990,
      desc: 'Todo lo esencial para operar tu negocio del día a día.',
      features: ['1 administrador + usuarios según plan','1 tienda / instalación','Ventas, inventario, clientes, gastos, contabilidad','1 módulo especializado incluido','Funciona online y offline','Soporte en español'],
      missing: ['App móvil','Codec Verify','Facturación DIAN','Multi-tienda','Reportes avanzados'],
      highlight: false,
    },
    {
      name: 'Premium',
      price: annual ? 66990 : 79990,
      badge: 'Más elegido',
      desc: 'Para negocios que necesitan todo el poder de Codec POS.',
      features: ['Usuarios ilimitados','Varias tiendas / instalaciones','App móvil completa','Codec Verify + Facturación DIAN','Multi-tienda, reportes avanzados y respaldo','2 o más módulos especializados','Todo lo del plan Básico'],
      missing: [],
      highlight: true,
    },
  ]

  const fmt = (n: number) => '$' + n.toLocaleString('es-CO')

  return (
    <section className="py-24" id="precios" style={{ background:'linear-gradient(160deg,#FFFBF7 0%,#FFF7ED 100%)' }}>
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-12">
          <Tag variant="orange">Planes</Tag>
          <h2 className="text-4xl font-bold text-slate-900 mt-4 mb-4" style={{ fontFamily:"'DM Sans',sans-serif" }}>
            Un plan para cada etapa<br/>de tu negocio
          </h2>
          <p className="text-slate-500 text-lg mb-8">Empieza gratis 14 días. Sin tarjeta de crédito.</p>

          <div className="inline-flex items-center gap-1 bg-white rounded-full border border-slate-200 p-1.5 shadow-sm">
            {[false, true].map((isAnnual) => (
              <button key={String(isAnnual)} onClick={() => setAnnual(isAnnual)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all flex items-center gap-2 ${annual === isAnnual ? 'text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                style={{ background: annual === isAnnual ? 'linear-gradient(135deg,#EA580C,#C2410C)' : 'transparent' }}>
                {isAnnual ? 'Anual' : 'Mensual'}
                {isAnnual && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${annual ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                    −17%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {plans.map((plan, i) => (
            <div key={i} className={`relative rounded-3xl p-8 transition-all ${plan.highlight ? 'shadow-2xl' : 'border border-slate-200 bg-white shadow-sm hover:shadow-md card-lift'}`}
              style={plan.highlight ? { background:'#0F172A', border:'1px solid rgba(255,255,255,0.06)' } : {}}>

              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg"
                    style={{ background:'linear-gradient(135deg,#EA580C,#C2410C)' }}>
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className={`text-xl font-bold mb-2 ${plan.highlight ? 'text-white' : 'text-slate-900'}`}
                  style={{ fontFamily:"'DM Sans',sans-serif" }}>{plan.name}</h3>
                <div className="flex items-end gap-1 mb-3">
                  <span className={`text-4xl font-bold ${plan.highlight ? 'text-white' : 'text-slate-900'}`}
                    style={{ fontFamily:"'DM Sans',sans-serif" }}>{fmt(plan.price)}</span>
                  <span className={`text-sm mb-2 ${plan.highlight ? 'text-slate-400' : 'text-slate-400'}`}>/mes</span>
                </div>
                <p className={`text-sm ${plan.highlight ? 'text-slate-400' : 'text-slate-500'}`}>{plan.desc}</p>
              </div>

              <button className={`w-full py-3.5 rounded-xl font-bold text-sm mb-6 transition-all ${plan.highlight ? 'btn-brand animate-glow-orange' : 'border border-slate-200 text-slate-700 bg-slate-50 hover:border-orange-300 hover:text-orange-700 hover:bg-orange-50'}`}>
                Empezar prueba gratis
              </button>

              <div className="space-y-2.5">
                {plan.features.map((f, j) => (
                  <div key={j} className="flex items-start gap-2.5">
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${plan.highlight ? 'bg-orange-500/20' : 'bg-emerald-100'}`}>
                      {Icons.check(plan.highlight ? '#FB923C' : '#059669')}
                    </div>
                    <span className={`text-sm ${plan.highlight ? 'text-slate-300' : 'text-slate-700'}`}>{f}</span>
                  </div>
                ))}
                {plan.missing.map((f, j) => (
                  <div key={j} className="flex items-start gap-2.5 opacity-30">
                    <div className="w-4 h-4 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {Icons.x}
                    </div>
                    <span className="text-sm text-slate-400 line-through">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">
          Precios de referencia · Sin permanencia · Cancela cuando quieras
        </p>
      </div>
    </section>
  )
}

// ─── FAQ ─────────────────────────────────────────────────────────────────────

function FAQ() {
  const [open, setOpen] = useState<number | null>(null)
  const faqs = [
    { q:'¿Qué es Codec POS?', a:'Codec POS es un sistema de punto de venta colombiano que integra ventas, inventario, contabilidad, facturación electrónica DIAN y confirmación automática de pagos con voz — todo en un solo lugar. Funciona con y sin internet.' },
    { q:'¿Funciona sin internet?', a:'Sí. Si se va la conexión, el negocio sigue operando con normalidad. Cuando vuelve el internet, todo se sincroniza automáticamente sin perder ningún dato.' },
    { q:'¿Qué es el agente de voz de Codec Verify?', a:'Es un agente que anuncia en voz alta cada pago confirmado en el punto de venta. El cajero y el cliente escuchan la confirmación al instante — sin mirar pantallas ni preguntar si llegó el pago.' },
    { q:'¿Cuánto dura la prueba gratuita?', a:'14 días completos sin tarjeta de crédito. Tienes acceso a todas las funciones del plan que elijas durante ese período.' },
    { q:'¿Puedo usarlo desde el celular?', a:'Sí. La app móvil no es una versión recortada — puedes vender, revisar inventario, registrar gastos y ver reportes desde donde estés, con sincronización en tiempo real.' },
    { q:'¿Puedo administrar varias tiendas?', a:'Sí, con el plan Premium puedes ver las métricas de todas tus sucursales en un solo tablero — ventas, gastos y devoluciones de cada local, sin cambiar de sesión.' },
    { q:'¿Codec POS funciona con la DIAN?', a:'Sí. La facturación electrónica DIAN ya está integrada. Solo configuras tu firma digital y empiezas a emitir facturas válidas.' },
    { q:'¿Puedo cancelar en cualquier momento?', a:'Sí. Sin permanencia mínima ni penalización. Cancelas cuando quieras desde tu cuenta.' },
  ]

  return (
    <section className="py-24 bg-white" id="preguntas">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <Tag variant="orange">Preguntas frecuentes</Tag>
          <h2 className="text-4xl font-bold text-slate-900 mt-4 mb-4" style={{ fontFamily:"'DM Sans',sans-serif" }}>
            Todo lo que quieres saber<br/>antes de empezar
          </h2>
        </div>
        <div className="space-y-2.5">
          {faqs.map((faq, i) => (
            <div key={i} className={`rounded-2xl border overflow-hidden transition-all ${open === i ? 'border-orange-200 shadow-sm' : 'border-slate-100'}`}>
              <button className="w-full text-left px-6 py-5 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
                onClick={() => setOpen(open === i ? null : i)}>
                <span className="font-semibold text-slate-900 text-sm" style={{ fontFamily:"'DM Sans',sans-serif" }}>{faq.q}</span>
                <div className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${open === i ? 'bg-orange-500 border-orange-500 text-white' : 'border-slate-200 text-slate-400'}`}>
                  {Icons.chevronDown(open === i)}
                </div>
              </button>
              {open === i && (
                <div className="px-6 pb-5 animate-fade-in">
                  <p className="text-sm text-slate-600 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── CTA ─────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <section className="py-28 relative overflow-hidden" style={{ background:'linear-gradient(135deg,#7C2D12 0%,#EA580C 50%,#C2410C 100%)' }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ backgroundImage:'linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)', backgroundSize:'52px 52px' }}/>
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full pointer-events-none"
        style={{ background:'radial-gradient(circle,rgba(255,255,255,0.08) 0%,transparent 70%)' }}/>
      <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full pointer-events-none"
        style={{ background:'radial-gradient(circle,rgba(0,0,0,0.12) 0%,transparent 70%)' }}/>

      <div className="max-w-3xl mx-auto px-6 text-center relative z-10">
        <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-8">
          <div className="w-2 h-2 rounded-full bg-emerald-400" style={{ animation:'pulse-dot 1.4s ease-in-out infinite' }}/>
          <span className="text-white/90 text-xs font-bold" style={{ fontFamily:"'JetBrains Mono',monospace", letterSpacing:'0.06em' }}>
            14 DÍAS GRATIS · SIN TARJETA
          </span>
        </div>

        <h2 className="text-5xl font-bold text-white mb-5 leading-tight" style={{ fontFamily:"'DM Sans',sans-serif" }}>
          Empieza a controlar<br/>tu negocio hoy
        </h2>
        <p className="text-orange-100 text-xl mb-10">
          Prueba Codec POS gratis durante 14 días.<br/>Sin permanencia. Cancela cuando quieras.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button className="px-10 py-4 rounded-xl text-base font-bold bg-white text-orange-700 hover:bg-orange-50 transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5">
            Probar Codec POS gratis
          </button>
          <button className="px-10 py-4 rounded-xl text-base font-semibold border border-white/30 text-white hover:bg-white/10 transition-all">
            Ver planes
          </button>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-orange-100 text-sm">
          {['Sin tarjeta de crédito','Sin permanencia','Soporte en español'].map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="text-emerald-300">{Icons.check('#6EE7B7')}</span>{item}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer style={{ background:'#0F172A', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-4 gap-10 mb-12">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ background:'linear-gradient(135deg,#EA580C,#C2410C)' }}>
                {Icons.logo}
              </div>
              <span className="font-bold text-white text-lg" style={{ fontFamily:"'DM Sans',sans-serif" }}>
                Codec<span className="text-orange-500">POS</span>
              </span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mb-4">
              Sistema de punto de venta colombiano. Ventas, inventario, contabilidad y facturación electrónica DIAN — en un solo lugar.
            </p>
            <p className="text-slate-600 text-xs">Un producto de <span className="text-slate-400">Codec Studio</span></p>
          </div>

          <div>
            <h4 className="font-semibold text-white text-sm mb-5" style={{ fontFamily:"'DM Sans',sans-serif" }}>Producto</h4>
            <div className="space-y-3">
              {['Funcionalidades','Módulos','App móvil','Precios','Codec Verify'].map(l => (
                <a key={l} href="#" className="block text-sm text-slate-400 hover:text-white transition-colors">{l}</a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-semibold text-white text-sm mb-5" style={{ fontFamily:"'DM Sans',sans-serif" }}>Empresa</h4>
            <div className="space-y-3">
              {['Sobre nosotros','Blog','Soporte','Términos','Privacidad'].map(l => (
                <a key={l} href="#" className="block text-sm text-slate-400 hover:text-white transition-colors">{l}</a>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-slate-500 text-xs">© 2026 Codec Studio. Todos los derechos reservados.</p>
          <div className="flex items-center gap-2">
            <Tag variant="green">Hecho en Colombia</Tag>
            <Tag variant="orange">DIAN Certificado</Tag>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <div style={{ fontFamily:"'Inter',sans-serif" }}>
      <Nav/>
      <Hero/>
      <Problems/>
      <OfflineSection/>
      <Features/>
      <VerifySection/>
      <Modules/>
      <MobileApp/>
      <MultiStore/>
      <Pricing/>
      <FAQ/>
      <CTA/>
      <Footer/>
    </div>
  )
}
