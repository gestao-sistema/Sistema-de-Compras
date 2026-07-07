import { useState, useRef, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

// Carrega direto do servidor de fotos (desembrulha o proxy antigo)
function proxyFoto(url) {
  if (!url) return null
  if (url.startsWith('/api/image-proxy')) {
    const m = /[?&]url=([^&]+)/.exec(url)
    return m ? decodeURIComponent(m[1]) : url
  }
  return url
}

export default function AlertaPanel() {
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
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (data?.loading || total === 0) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', border: 'none', borderRadius: 8, padding: '7px 10px',
          background: open ? '#7f1d1d' : '#2d0a0a',
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
          transition: 'background 0.15s',
        }}
      >
        <span style={{ fontSize: 14 }}>🔔</span>
        <span style={{ flex: 1, textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#f87171' }}>
          {total} alerta{total > 1 ? 's' : ''}
        </span>
        <span style={{
          background: '#f87171', color: '#fff', borderRadius: '50%',
          width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, flexShrink: 0,
        }}>{total > 99 ? '99+' : total}</span>
      </button>

      {open && (
        <div style={{
          position: 'fixed', left: 208, bottom: 60, width: 380, zIndex: 9999,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>🔔 Alertas de Estoque</div>
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
          <div style={{ maxHeight: 320, overflowY: 'auto', padding: '8px 0' }}>
            {aba === 'ruptura' && ruptura.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: '1px solid var(--border)' }}>
                {p.foto
                  ? <img src={proxyFoto(p.foto)} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--bg-input)' }} onError={e => e.target.style.display='none'} />
                  : <div style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--bg-input)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📦</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao || p.produto}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{p.nomeFornecedor || p.grupo || '-'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#f87171', background: '#7f1d1d', padding: '2px 6px', borderRadius: 4 }}>RUPTURA</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{p.vend30} vend/30d</div>
                </div>
              </div>
            ))}

            {aba === 'risco' && risco.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: '1px solid var(--border)' }}>
                {p.foto
                  ? <img src={proxyFoto(p.foto)} alt="" style={{ width: 34, height: 34, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: 'var(--bg-input)' }} onError={e => e.target.style.display='none'} />
                  : <div style={{ width: 34, height: 34, borderRadius: 6, background: 'var(--bg-input)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚠️</div>
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao || p.produto}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{p.nomeFornecedor || p.grupo || '-'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#fb923c', background: '#7c2d12', padding: '2px 6px', borderRadius: 4 }}>
                    {Math.round(p.dde)}d restantes
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>saldo: {p.saldo}</div>
                </div>
              </div>
            ))}

            {((aba === 'ruptura' && ruptura.length === 0) || (aba === 'risco' && risco.length === 0)) && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Nenhum alerta nesta categoria</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
