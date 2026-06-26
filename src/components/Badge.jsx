export function BadgeABC({ value }) {
  if (!value || value === '-') return <span style={{ color: '#4b5063' }}>-</span>
  return <span className={`badge badge-${value}`}>{value}</span>
}

export function BadgeStatus({ value }) {
  if (!value) return <span style={{ color: '#4b5063' }}>-</span>
  const v = String(value).toLowerCase()
  const cls =
    v.includes('risco') || v.includes('rupt') || v.includes('críti') ? 'badge-risco' :
    v.includes('alert') || v.includes('aten') ? 'badge-alerta' :
    'badge-ok'
  return <span className={`badge ${cls}`}>{value}</span>
}

export function BadgeDDE({ value }) {
  if (value == null || value === 9999) return <span style={{ color: '#4b5063' }}>S/V</span>
  const v = Number(value)
  const cls = v === 0 ? 'badge-risco' : v <= 30 ? 'badge-alerta' : 'badge-ok'
  return <span className={`badge ${cls}`}>{v}d</span>
}
