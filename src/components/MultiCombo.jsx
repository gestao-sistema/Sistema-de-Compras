import { useState, useEffect, useRef, useMemo } from 'react'

// Opção pode ser string ("Pago") ou objeto ({ value, label }).
// value é o que fica em `value`/`onChange`; label é o que aparece e é pesquisável.
const norm = o => (typeof o === 'string' ? { value: o, label: o } : o)

// Multi-seleção suspensa com busca e checkbox. `value` é um array de values.
export default function MultiCombo({ value = [], onChange, options = [], placeholder = 'Todos', width = 220 }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  const opts = useMemo(() => options.map(norm), [options])

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const term = query.trim().toLowerCase()
  const filtered = term ? opts.filter(o => o.label.toLowerCase().includes(term)) : opts
  const shown = filtered.slice(0, 200)
  const sel = new Set(value)

  function toggle(v) {
    if (sel.has(v)) onChange(value.filter(x => x !== v))
    else onChange([...value, v])
  }

  const labelOf = v => (opts.find(o => o.value === v)?.label ?? v)
  const resumo = value.length === 0 ? '' : value.length === 1 ? labelOf(value[0]) : `${value.length} selecionados`

  return (
    <div ref={ref} style={{ position: 'relative', width }}>
      <input
        className="inp text-xs" style={{ width: '100%' }}
        value={open ? query : resumo}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
      />
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 2,
                      background: 'var(--bg-card)', border: '1px solid var(--border2)', borderRadius: 6,
                      maxHeight: 280, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          {value.length > 0 && (
            <div onMouseDown={e => { e.preventDefault(); onChange([]) }}
              style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', color: '#f87171',
                       borderBottom: '1px solid var(--border)' }}>
              ✕ Limpar seleção ({value.length})
            </div>
          )}
          {shown.map(o => {
            const checked = sel.has(o.value)
            return (
              <div key={o.value} onMouseDown={e => { e.preventDefault(); toggle(o.value) }} title={o.label}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', fontSize: 12,
                         cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden',
                         background: checked ? 'var(--bg-hover)' : 'transparent',
                         color: checked ? 'var(--text)' : 'var(--text-nav)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = checked ? 'var(--bg-hover)' : 'transparent' }}>
                <input type="checkbox" checked={checked} readOnly tabIndex={-1}
                  style={{ accentColor: 'var(--accent)', pointerEvents: 'none', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
              </div>
            )
          })}
          {shown.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-dim)' }}>Nada encontrado</div>
          )}
          {filtered.length > shown.length && (
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-dim)' }}>+{filtered.length - shown.length} … refine a busca</div>
          )}
        </div>
      )}
    </div>
  )
}
