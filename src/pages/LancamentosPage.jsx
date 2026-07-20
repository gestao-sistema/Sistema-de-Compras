import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const labelMes = m => { const [y, mm] = m.split('-'); return `${MESES[+mm - 1]} / ${y}` }
const labelDia = d => { const [, mm, dd] = d.split('-'); return `${dd}/${mm}` }

// Notação compacta para os KPIs (valores chegam a bilhões e estouram o card)
const fBRLc = v => {
  const a = Math.abs(v || 0)
  if (a >= 1e9) return `R$ ${(v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`
  return fBRL(v)
}
const fNumc = v => {
  const a = Math.abs(v || 0)
  if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (a >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return fNum(v)
}

export default function LancamentosPage() {
  const [expandMes, setExpandMes] = useState({})
  const [expandDia, setExpandDia] = useState({})
  const [fornBusca, setFornBusca] = useState('')

  const q = useQuery({
    queryKey:  ['lancamentos'],
    queryFn:   api.lancamentos,
    staleTime: 5 * 60 * 1000,
    // Enquanto o backend gera a 1ª carga, faz polling a cada 15s
    refetchInterval: query => (query.state.data?.building ? 15000 : false),
  })

  const data     = q.data || {}
  const building  = data.building === true
  const meses     = data.meses || []
  const total     = data.totalGeral || { pecas: 0, valorCusto: 0, valorVenda: 0, skus: 0, lancamentos: 0, fornecedores: 0 }
  const fb        = fornBusca.trim().toLowerCase()

  function toggleMes(m) { setExpandMes(p => ({ ...p, [m]: !p[m] })) }
  function toggleDia(k) { setExpandDia(p => ({ ...p, [k]: !p[k] })) }
  function expandAll()  { const a = {}; meses.forEach(m => { a[m.mes] = true }); setExpandMes(a) }
  function collapseAll(){ setExpandMes({}); setExpandDia({}) }

  return (
    <div className="page-body space-y-4">

      {/* KPIs */}
      <div className="flex flex-wrap gap-4">
        <KPI label="Valor a Custo"  value={fBRLc(total.valorCusto)} title={fBRL(total.valorCusto)} color="#a3e635" />
        <KPI label="Valor a Venda"  value={fBRLc(total.valorVenda)} title={fBRL(total.valorVenda)} color="#f5c518" />
        <KPI label="Peças"          value={fNumc(total.pecas)}      title={fNum(total.pecas)}       color="#818cf8" />
        <KPI label="SKUs"           value={fNum(total.skus)}                                        color="#00b4d8" />
        <KPI label="Lançamentos"    value={fNum(total.lancamentos)}                                 color="#f472b6" />
        <KPI label="Fornecedores"   value={fNum(total.fornecedores)}                                color="#60a5fa" />
      </div>

      {/* Nota + controles */}
      <div className="card">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Filtrar fornecedor</div>
            <input value={fornBusca} onChange={e => setFornBusca(e.target.value)} placeholder="Nome do fornecedor…" className="inp text-xs" style={{ width: 220 }} />
          </div>
          {fb && <button onClick={() => setFornBusca('')} className="btn-ghost text-xs self-end">✕ Limpar</button>}
          <div className="ml-auto flex gap-2 self-end">
            <button onClick={expandAll}   className="btn-ghost text-xs">⊞ Expandir</button>
            <button onClick={collapseAll} className="btn-ghost text-xs">⊟ Recolher</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10 }}>
          Agrupado por <b>data de lançamento</b> das entradas. Valores calculados sobre o <b>custo</b> e o <b>preço de venda</b> atuais do produto × quantidade lançada.
        </div>
      </div>

      {/* Estados */}
      {q.isLoading
        ? <div className="state-box"><div className="spinner" /><p>Carregando lançamentos…</p></div>
        : building
        ? <div className="state-box">
            <div className="spinner" />
            <p>Preparando os dados pela primeira vez…</p>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              A base de lançamentos é grande e está sendo baixada em segundo plano (pode levar alguns minutos). A tela atualiza sozinha assim que ficar pronta.
            </p>
          </div>
        : q.isError
        ? <div className="state-box"><p style={{ color: '#f87171' }}>Erro: {q.error?.message}</p></div>
        : meses.length === 0
        ? <div className="state-box"><p>Nenhum lançamento encontrado.</p></div>
        : (
          <div className="space-y-3">
            {meses.map(M => {
              const isMesOpen = !!expandMes[M.mes]
              return (
                <div key={M.mes} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {/* Header mês */}
                  <div onClick={() => toggleMes(M.mes)} style={{
                    cursor: 'pointer', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16,
                    background: isMesOpen ? 'var(--bg-hover)' : 'var(--bg-card2)',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = isMesOpen ? 'var(--bg-hover)' : 'var(--bg-card2)'}>
                    <span style={{ color: '#f5c518', fontSize: 13, width: 14 }}>{isMesOpen ? '▼' : '▶'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{labelMes(M.mes)}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {fNum(M.pecas)} peças · {fNum(M.skus)} SKUs · {fNum(M.lancamentos)} lançamentos · {fNum(M.fornecedores)} fornecedores
                      </div>
                    </div>
                    <ValoresResumo custo={M.valorCusto} venda={M.valorVenda} />
                  </div>

                  {/* Dias do mês */}
                  {isMesOpen && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {M.dias.map(D => {
                        const diaKey = `${M.mes}::${D.dia}`
                        const isDiaOpen = !!expandDia[diaKey]
                        const forns = fb ? D.fornecedores.filter(f => f.nome.toLowerCase().includes(fb)) : D.fornecedores
                        return (
                          <div key={D.dia}>
                            {/* Header dia */}
                            <div onClick={() => toggleDia(diaKey)} style={{
                              cursor: 'pointer', padding: '10px 20px 10px 36px', display: 'flex', alignItems: 'center', gap: 14,
                              background: isDiaOpen ? 'var(--bg-card2)' : 'var(--bg-card)', borderBottom: '1px solid var(--border)',
                            }}
                              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                              onMouseLeave={e => e.currentTarget.style.background = isDiaOpen ? 'var(--bg-card2)' : 'var(--bg-card)'}>
                              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{isDiaOpen ? '▼' : '▶'}</span>
                              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#f5c518', fontSize: 13, width: 48 }}>{labelDia(D.dia)}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {fNum(D.pecas)} peças · {fNum(D.skus)} SKUs · {fNum(D.fornecedores?.length || 0)} forn.
                              </span>
                              <div style={{ marginLeft: 'auto', display: 'flex', gap: 24 }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#a3e635', fontWeight: 700 }}>{fBRL(D.valorCusto)}</span>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f5c518', fontWeight: 700 }}>{fBRL(D.valorVenda)}</span>
                              </div>
                            </div>

                            {/* Fornecedores do dia */}
                            {isDiaOpen && (
                              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr style={{ background: 'var(--bg-card2)' }}>
                                    <th style={{ ...th, textAlign: 'left', paddingLeft: 52 }}>Fornecedor</th>
                                    <th style={th}>SKUs</th>
                                    <th style={th}>Peças</th>
                                    <th style={th}>Valor a Custo</th>
                                    <th style={th}>Valor a Venda</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {forns.length === 0 ? (
                                    <tr><td colSpan={5} style={{ padding: '10px 20px 10px 52px', fontSize: 12, color: 'var(--text-dim)' }}>Nenhum fornecedor corresponde ao filtro.</td></tr>
                                  ) : forns.map((f, i) => (
                                    <tr key={f.nome} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}>
                                      <td style={{ padding: '6px 10px 6px 52px', fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>{f.nome}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#00b4d8' }}>{fNum(f.skus)}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#818cf8', fontWeight: 700 }}>{fNum(f.pecas)}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#a3e635', fontWeight: 700 }}>{fBRL(f.valorCusto)}</td>
                                      <td style={{ padding: '6px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#f5c518', fontWeight: 700 }}>{fBRL(f.valorVenda)}</td>
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
          </div>
        )}
    </div>
  )
}

function ValoresResumo({ custo, venda }) {
  return (
    <div style={{ display: 'flex', gap: 32, flexShrink: 0 }}>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>A Custo</div>
        <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#a3e635', fontSize: 14 }}>{fBRL(custo)}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>A Venda</div>
        <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#f5c518', fontSize: 14 }}>{fBRL(venda)}</div>
      </div>
    </div>
  )
}

function KPI({ label, value, title, color }) {
  return (
    <div className="card flex-1" style={{ borderLeft: `3px solid ${color}`, minWidth: 150, overflow: 'hidden' }}>
      <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div title={title || value} style={{ fontSize: 20, fontWeight: 900, color, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

const th = {
  padding: '6px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 10,
  borderBottom: '1px solid var(--border)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
}
