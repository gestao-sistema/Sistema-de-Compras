import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useTheme } from '../contexts/ThemeContext'

export default function FloatingActions() {
  const { isDark, toggleTheme } = useTheme()

  return (
    <div style={{
      position: 'fixed', top: 14, right: 18, zIndex: 9500,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <AlertaBell />
      <button
        onClick={toggleTheme}
        title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none',
          background: isDark ? '#1e2035' : '#fff',
          boxShadow: isDark
            ? '0 2px 12px rgba(0,0,0,0.4), inset 0 0 0 1px #2a2d40'
            : '0 2px 12px rgba(0,0,0,0.15), inset 0 0 0 1px #e2e4ec',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s',
          color: isDark ? '#9ca3af' : '#d4a800',
        }}
      >
        {isDark ? <IconMoon /> : <IconBulbOn />}
      </button>
    </div>
  )
}

// ─── Sino de alertas ─────────────────────────────────────────────────────────

function AlertaBell() {
  const [open, setOpen] = useState(false)
  const [aba,  setAba]  = useState('ruptura')
  const ref = useRef(null)

  const { data } = useQuery({
    queryKey:        ['alertas'],
    queryFn:         api.alertas,
    refetchInterval: 5 * 60 * 1000,
    staleTime:       2 * 60 * 1000,
  })

  const ruptura = data?.ruptura || []
  const risco   = data?.risco   || []
  const total   = ruptura.length + risco.length

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (data?.loading || (!data && total === 0)) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`${total} alertas de estoque`}
        style={{
          width: 36, height: 36, borderRadius: '50%', border: 'none',
          background: total > 0 ? '#7f1d1d' : 'var(--bg-card)',
          boxShadow: total > 0
            ? '0 2px 12px rgba(248,113,113,0.35), inset 0 0 0 1px #991b1b'
            : '0 2px 12px rgba(0,0,0,0.2), inset 0 0 0 1px var(--border)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s', position: 'relative',
        }}
      >
        <IconBell color={total > 0 ? '#f87171' : 'var(--text-muted)'} />
        {total > 0 && (
          <span style={{
            position: 'absolute', top: -3, right: -3,
            background: '#f87171', color: '#fff',
            borderRadius: '50%', minWidth: 17, height: 17,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 800, border: '2px solid var(--bg)',
          }}>{total > 99 ? '99+' : total}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 44, right: 0, width: 400, zIndex: 9999,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconBell color="#f87171" size={14} /> Alertas de Estoque
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>✕</button>
          </div>

          {/* Abas */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              { id: 'ruptura', label: `Ruptura (${ruptura.length})`, cor: '#f87171' },
              { id: 'risco',   label: `Risco (${risco.length})`,     cor: '#fb923c' },
            ].map(a => (
              <button key={a.id} onClick={() => setAba(a.id)} style={{
                flex: 1, border: 'none', padding: '9px 0', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: aba === a.id ? 'var(--bg-hover)' : 'transparent',
                color: aba === a.id ? a.cor : 'var(--text-muted)',
                borderBottom: aba === a.id ? `2px solid ${a.cor}` : '2px solid transparent',
                transition: 'all 0.15s',
              }}>{a.label}</button>
            ))}
          </div>

          {/* Lista */}
          <div style={{ maxHeight: 380, overflowY: 'auto', padding: '4px 0' }}>
            {aba === 'ruptura' && ruptura.map((p, i) => (
              <AlertaRow key={i} p={p} badge={{ label: 'RUPTURA', bg: '#7f1d1d', color: '#f87171' }}
                info={`${p.vend30} vend./30d`} />
            ))}
            {aba === 'risco' && risco.map((p, i) => (
              <AlertaRow key={i} p={p} badge={{ label: `${Math.round(p.dde)}d restantes`, bg: '#7c2d12', color: '#fb923c' }}
                info={`saldo: ${p.saldo}`} />
            ))}
            {((aba === 'ruptura' && ruptura.length === 0) || (aba === 'risco' && risco.length === 0)) && (
              <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                Nenhum alerta nesta categoria
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function proxyFoto(url) {
  if (!url) return null
  if (url.startsWith('/api/image-proxy')) return url
  if (url.startsWith('http')) return `/api/image-proxy?url=${encodeURIComponent(url)}`
  return url
}

// ─── Linha de produto com zoom de foto e tooltip ──────────────────────────────

function AlertaRow({ p, badge, info }) {
  const [hovered, setHovered] = useState(false)
  const [fotoPos, setFotoPos] = useState(null)
  const rowRef = useRef(null)

  return (
    <>
      <style>{`
        .alerta-row { transition: background 0.12s; }
        .alerta-row:hover { background: var(--bg-hover); }
      `}</style>

      <div
        ref={rowRef}
        className="alerta-row"
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', position: 'relative', cursor: 'default' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setFotoPos(null) }}
      >
        {/* Foto com zoom */}
        <div
          onMouseEnter={e => setFotoPos({ x: e.clientX, y: e.clientY })}
          onMouseMove={e => setFotoPos({ x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setFotoPos(null)}
          style={{ flexShrink: 0 }}
        >
          {p.foto
            ? <img src={proxyFoto(p.foto)} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6, display: 'block', border: '1px solid var(--border)', transition: 'transform 0.15s', transform: fotoPos ? 'scale(1.08)' : 'scale(1)' }} onError={e => e.target.style.display='none'} />
            : <div style={{ width: 36, height: 36, borderRadius: 6, background: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>
          }
        </div>

        {/* Popup de foto ampliada */}
        {fotoPos && p.foto && (
          <div style={{
            position: 'fixed', zIndex: 99999, pointerEvents: 'none',
            left: fotoPos.x + 16,
            top: Math.min(fotoPos.y - 100, window.innerHeight - 220),
            background: 'var(--bg-card)', border: '2px solid var(--accent)',
            borderRadius: 10, padding: 6,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}>
            <img src={proxyFoto(p.foto)} alt="" style={{ width: 180, height: 180, objectFit: 'contain', display: 'block', borderRadius: 6 }} />
          </div>
        )}

        {/* Info do produto */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: hovered ? 'unset' : 'ellipsis', whiteSpace: hovered ? 'normal' : 'nowrap', transition: 'all 0.15s', lineHeight: 1.4 }}>
            {p.descricao || p.produto}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span>{p.grupo || '-'}</span>
            {p.nomeFornecedor && <><span style={{ opacity: 0.4 }}>·</span><span>{p.nomeFornecedor}</span></>}
          </div>
          {/* Info extra ao passar mouse */}
          {hovered && p.vend30 !== undefined && (
            <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {p.vend30 > 0 && <span style={{ fontSize: 9, fontWeight: 700, background: '#14532d', color: '#4ade80', padding: '1px 5px', borderRadius: 4 }}>{p.vend30} vend/30d</span>}
              {p.saldo !== undefined && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--bg-input)', color: 'var(--text-muted)', padding: '1px 5px', borderRadius: 4 }}>saldo: {p.saldo}</span>}
              {p.dde !== undefined && <span style={{ fontSize: 9, fontWeight: 700, background: '#7c2d12', color: '#fb923c', padding: '1px 5px', borderRadius: 4 }}>DDE: {Math.round(p.dde)}d</span>}
            </div>
          )}
        </div>

        {/* Badge */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: badge.color, background: badge.bg, padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{badge.label}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{info}</div>
        </div>
      </div>
    </>
  )
}

// ─── Ícones SVG ──────────────────────────────────────────────────────────────

function IconBulbOn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21h6M10 17h4M12 3a6 6 0 016 6c0 2.2-1.2 4.1-3 5.2V16H9v-1.8A6 6 0 0112 3z" fill="#fbbf24" stroke="#d97706" strokeWidth="1.5" />
    </svg>
  )
}

function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  )
}

function IconBell({ color = 'currentColor', size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}
