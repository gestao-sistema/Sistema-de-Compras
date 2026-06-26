async function get(path, params = {}) {
  const url = new URL('/api' + path, window.location.origin)
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  })
  const res = await fetch(url.toString())
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  status:           ()          => get('/status'),
  dashboard:        (params)    => get('/dashboard', params),
  produtos:         (params)    => get('/produtos', params),
  produtosOptions:  ()          => get('/produtos/options'),
  compras:          (limit)     => get('/compras', { limit }),
  comprasTotais:    (params)    => get('/compras/totais', params),
  sugestoes:        ()          => get('/sugestoes'),
  abc:              (params)    => get('/abc', params),
  pedidos:          (params)    => get('/pedidos', params),
  pedidosPorProduto:()          => get('/pedidos/por-produto'),
  fornecedores:     (params)    => get('/fornecedores', params),
  cliente:          (cpfcnpj)   => get('/blip/clientes', { cpfcnpj }),
  assistencias:     (cpfcnpj, limit) => get('/blip/assistencia', { cpfcnpj, limit }),
  assistenciaItens: (id, cpfcnpj)   => get(`/blip/assistencia/itens/${id}`, { cpfcnpj }),
}

// ─── formatting helpers ───────────────────────────────────────────────────────

export function fBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v ?? 0)
}

export function fNum(v, d = 0) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d }).format(v ?? 0)
}

export function fDate(s) {
  if (!s) return '-'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('pt-BR')
}

export function toRows(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) {
      if (Array.isArray(v) && v.length > 0) return v
    }
    return [data]
  }
  return []
}
