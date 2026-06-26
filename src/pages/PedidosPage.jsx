import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'
import FotoZoom from '../components/FotoZoom'

export default function PedidosPage() {
  const [search,      setSearch]      = useState('')
  const [dataInicio,  setDataInicio]  = useState('')
  const [dataFim,     setDataFim]     = useState('')
  const [expandForn,  setExpandForn]  = useState({})
  const [expandPed,   setExpandPed]   = useState({})
  const [visivel,     setVisivel]     = useState(15)

  const q = useQuery({
    queryKey:  ['pedidos'],
    queryFn:   api.pedidos,
    staleTime: 5 * 60 * 1000,
  })

  const data     = q.data || { total: 0, fornecedores: [], totalSaldo: 0, totalValor: 0, items: [] }
  const allItems = data.items || []
  const sq       = search.trim().toLowerCase()

  function parseDMY(s) {
    if (!s) return null
    const [d, m, y] = s.split('/')
    return d && m && y ? new Date(`${y}-${m}-${d}`) : null
  }

  const filtered = useMemo(() => {
    const dtIni = dataInicio ? new Date(dataInicio) : null
    const dtFim = dataFim    ? new Date(dataFim)    : null
    return allItems.filter(it => {
      if (sq && !(it.descricao || '').toLowerCase().includes(sq) && !(it.produto || '').includes(sq) && !(it.nomeFornecedor || '').toLowerCase().includes(sq)) return false
      if (dtIni || dtFim) {
        const dt = parseDMY(it.emissao)
        if (dtIni && dt && dt < dtIni) return false
        if (dtFim && dt && dt > dtFim) return false
      }
      return true
    })
  }, [allItems, sq, dataInicio, dataFim])

  // Agrupa: fornecedor → pedido → itens
  const grouped = useMemo(() => {
    const byForn = {}
    filtered.forEach(it => {
      const nome = it.nomeFornecedor || 'Sem fornecedor'
      if (!byForn[nome]) byForn[nome] = { nome, pedidos: {} }
      if (!byForn[nome].pedidos[it.pedido]) byForn[nome].pedidos[it.pedido] = { pedido: it.pedido, emissao: it.emissao, itens: [] }
      byForn[nome].pedidos[it.pedido].itens.push(it)
    })
    return Object.values(byForn)
      .map(f => ({ ...f, pedidos: Object.values(f.pedidos).sort((a, b) => a.pedido.localeCompare(b.pedido)) }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  }, [filtered])

  const totalSaldoFiltrado = filtered.reduce((s, i) => s + i.qtdSaldo, 0)
  const totalValorFiltrado = filtered.reduce((s, i) => s + i.valorTotal, 0)
  const hasFilter = sq || dataInicio || dataFim

  function toggleForn(nome) { setExpandForn(p => ({ ...p, [nome]: !p[nome] })) }
  function togglePed(key)   { setExpandPed(p =>  ({ ...p, [key]:  !p[key]  })) }
  function expandAll()  { const a = {}; grouped.forEach(f => { a[f.nome] = true }); setExpandForn(a) }
  function collapseAll(){ setExpandForn({}) }
  function reset()      { setSearch(''); setDataInicio(''); setDataFim(''); setVisivel(15) }

  const groupedVisiveis = grouped.slice(0, visivel)

  return (
    <div className="page-body space-y-4" style={{ paddingTop: 16 }}>

      {/* KPIs */}
      <div className="flex gap-4">
        <KPI label="Fornecedores"   value={fNum(grouped.length)}              color="#f5c518" />
        <KPI label="Pedidos em Aberto" value={fNum(grouped.reduce((s, f) => s + f.pedidos.length, 0))} color="#00b4d8" />
        <KPI label="Saldo a Receber"   value={fNum(totalSaldoFiltrado)}       color="#818cf8" />
        <KPI label="Valor Total"        value={fBRL(totalValorFiltrado)}      color="#a3e635" />
      </div>

      {/* Filtros */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Emissão — De</div>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="inp text-xs" style={{ width: 140 }} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Até</div>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="inp text-xs" style={{ width: 140 }} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Buscar</div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Fornecedor, código ou descrição…" className="inp text-xs" style={{ width: 220 }} />
          </div>
          {hasFilter && <button onClick={reset} className="btn-ghost text-xs self-end">✕ Limpar</button>}
          <div className="ml-auto flex gap-2 self-end">
            <button onClick={expandAll}   className="btn-ghost text-xs">⊞ Expandir</button>
            <button onClick={collapseAll} className="btn-ghost text-xs">⊟ Recolher</button>
          </div>
        </div>
      </div>

      {/* Lista por fornecedor */}
      {q.isLoading
        ? <div className="state-box"><div className="spinner" /><p>Carregando pedidos…</p></div>
        : q.isError
        ? <div className="state-box"><p style={{ color: '#f87171' }}>Erro: {q.error?.message}</p></div>
        : grouped.length === 0
        ? <div className="state-box"><p>Nenhum pedido pendente.</p></div>
        : (
          <div className="space-y-3">
            {groupedVisiveis.map(f => {
              const isFornOpen = !!expandForn[f.nome]
              const totalFornSaldo = f.pedidos.reduce((s, p) => s + p.itens.reduce((ss, i) => ss + i.qtdSaldo, 0), 0)
              const totalFornValor = f.pedidos.reduce((s, p) => s + p.itens.reduce((ss, i) => ss + i.valorTotal, 0), 0)

              return (
                <div key={f.nome} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Header fornecedor */}
                  <div onClick={() => toggleForn(f.nome)} style={{
                    cursor: 'pointer', padding: '14px 20px',
                    display: 'flex', alignItems: 'center', gap: 16,
                    background: isFornOpen ? '#1a1c30' : '#181929',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = '#1e2038'}
                    onMouseLeave={e => e.currentTarget.style.background = isFornOpen ? '#1a1c30' : '#181929'}>

                    <span style={{ color: '#f5c518', fontSize: 13, width: 14 }}>{isFornOpen ? '▼' : '▶'}</span>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#e8eaf0' }}>{f.nome}</div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                        {f.pedidos.length} pedido{f.pedidos.length !== 1 ? 's' : ''} ·{' '}
                        {fNum(f.pedidos.reduce((s, p) => s + p.itens.length, 0))} itens pendentes
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 32, flexShrink: 0 }}>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>Saldo</div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#818cf8', fontSize: 14 }}>{fNum(totalFornSaldo)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase' }}>Valor Total</div>
                        <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#a3e635', fontSize: 14 }}>{fBRL(totalFornValor)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Pedidos do fornecedor */}
                  {isFornOpen && (
                    <div style={{ borderTop: '1px solid #22253a' }}>
                      {f.pedidos.map(ped => {
                        const pedKey  = `${f.nome}::${ped.pedido}`
                        const isPedOpen = !!expandPed[pedKey]
                        const saldoTot  = ped.itens.reduce((s, i) => s + i.qtdSaldo,  0)
                        const valTot    = ped.itens.reduce((s, i) => s + i.valorTotal, 0)

                        return (
                          <div key={ped.pedido}>
                            {/* Header pedido */}
                            <div onClick={() => togglePed(pedKey)} style={{
                              cursor: 'pointer', padding: '10px 20px 10px 36px',
                              display: 'flex', alignItems: 'center', gap: 14,
                              background: isPedOpen ? '#14162a' : '#141520',
                              borderBottom: '1px solid #1e2038',
                            }}
                              onMouseEnter={e => e.currentTarget.style.background = '#1a1c32'}
                              onMouseLeave={e => e.currentTarget.style.background = isPedOpen ? '#14162a' : '#141520'}>

                              <span style={{ color: '#9ca3af', fontSize: 11 }}>{isPedOpen ? '▼' : '▶'}</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#f5c518', fontSize: 13 }}>#{ped.pedido}</span>
                              <span style={{ fontSize: 11, color: '#6b7280' }}>{ped.emissao}</span>
                              <span style={{ fontSize: 11, color: '#9ca3af' }}>{ped.itens.length} iten{ped.itens.length !== 1 ? 's' : ''}</span>
                              <div style={{ marginLeft: 'auto', display: 'flex', gap: 24 }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#818cf8', fontWeight: 700 }}>{fNum(saldoTot)} un.</span>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#a3e635', fontWeight: 700 }}>{fBRL(valTot)}</span>
                              </div>
                            </div>

                            {/* Produtos do pedido */}
                            {isPedOpen && (
                              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ background: '#0f1020' }}>
                                    <th style={th}>Foto</th>
                                    <th style={th}>Código</th>
                                    <th style={{ ...th, textAlign: 'left' }}>Descrição</th>
                                    <th style={th}>Grupo</th>
                                    <th style={th}>Almox</th>
                                    <th style={th}>Qtd</th>
                                    <th style={th}>Saldo</th>
                                    <th style={th}>Valor</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ped.itens.map((it, i) => (
                                    <tr key={i} style={{ background: i % 2 === 0 ? '#12131e' : '#141520', borderBottom: '1px solid #1a1c2e' }}>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', width: 44 }}>
                                        <FotoZoom
                                          url={it.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(it.fotoUrl)}` : null}
                                          alt={it.descricao} size={32} />
                                      </td>
                                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: '#f5c518', whiteSpace: 'nowrap' }}>{it.produto}</td>
                                      <td style={{ padding: '6px 10px', fontSize: 12, color: '#d1d5db' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }} title={it.descricao}>{it.descricao}</div>
                                      </td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11, color: '#00b4d8' }}>{it.grupo}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', fontSize: 11 }}>
                                        <span style={{ background: '#0f1e30', border: '1px solid #1e3050', borderRadius: 4, padding: '2px 6px', color: '#60a5fa', fontSize: 10 }}>
                                          Almox {it.almox}
                                        </span>
                                      </td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', color: '#e8eaf0' }}>{fNum(it.quantidade)}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: '#818cf8' }}>{fNum(it.qtdSaldo)}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, color: '#a3e635' }}>{fBRL(it.valorTotal)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {visivel < grouped.length && (
              <button
                onClick={() => setVisivel(v => v + 15)}
                className="btn-ghost w-full text-xs"
                style={{ marginTop: 4 }}
              >
                ↓ Carregar mais ({grouped.length - visivel} restantes)
              </button>
            )}
          </div>
        )}
    </div>
  )
}

function KPI({ label, value, color }) {
  return (
    <div className="card flex-1" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#6b7280' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}

const th = {
  padding: '6px 10px', textAlign: 'center',
  color: '#6b7280', fontSize: 10,
  borderBottom: '1px solid #1e2038',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
}
