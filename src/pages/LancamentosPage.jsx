import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const [expandMes, setExpandMes] = useState({})
  const [expandDia, setExpandDia] = useState({})
  const [expandForn, setExpandForn] = useState({})
  const [expandLanc, setExpandLanc] = useState({})
  const [fornBusca, setFornBusca] = useState('')
  const [skuBusca, setSkuBusca] = useState('')
  const [sel, setSel] = useState('todos')   // filtro de status: todos | efetivado | parcial

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
  const fb        = fornBusca.trim().toLowerCase()
  const sb        = skuBusca.trim().toLowerCase()

  // Valores do status selecionado (com fallback p/ o seed antigo em formato plano)
  const VAZIO = { pecas: 0, valorCusto: 0, valorVenda: 0, skus: 0, lancamentos: 0, fornecedores: 0 }
  const pick  = node => (node && (node[sel] || node.todos)) || node || VAZIO
  const total = pick(data.totalGeral)
  const lancMatch = L => sel === 'todos'
    ? true
    : sel === 'parcial' ? /parcial/i.test(L.status) : (/efetiv/i.test(L.status) && !/parcial/i.test(L.status))
  // Filtro de SKU (código ou descrição) — atua no detalhe (meses recentes)
  const itemMatch = it => !sb || (it.sku || '').toLowerCase().includes(sb) || (it.descricao || '').toLowerCase().includes(sb)
  const lancVisivel = L => lancMatch(L) && (!sb || (L.itens || []).some(itemMatch))
  const fornVisivel = f => pick(f).pecas > 0 && (!fb || f.nome.toLowerCase().includes(fb)) && (!sb || (f.lancs || []).some(lancVisivel))
  const diaVisivel  = D => pick(D).pecas > 0 && (!sb || (D.fornecedores || []).some(fornVisivel))
  const mesVisivel  = M => pick(M).pecas > 0 && (!sb || (M.dias || []).some(diaVisivel))

  function toggleMes(m) { setExpandMes(p => ({ ...p, [m]: !p[m] })) }
  function toggleDia(k) { setExpandDia(p => ({ ...p, [k]: !p[k] })) }
  function toggleForn(k) { setExpandForn(p => ({ ...p, [k]: !p[k] })) }
  function toggleLanc(k) { setExpandLanc(p => ({ ...p, [k]: !p[k] })) }
  function expandAll()  { const a = {}; meses.forEach(m => { a[m.mes] = true }); setExpandMes(a) }
  function collapseAll(){ setExpandMes({}); setExpandDia({}) }

  return (
    <div className="page-body space-y-4">

      <div className="flex items-center justify-between">
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>Lançamentos (entradas)</div>
        <button onClick={() => navigate('/lancamentos/dash')} className="text-xs font-bold rounded"
          style={{ background: 'var(--accent)', color: 'var(--accent-text)', padding: '7px 14px', border: 'none', cursor: 'pointer' }}>
          📊 Dashboard
        </button>
      </div>

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
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Status</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[['todos', 'Todos'], ['efetivado', 'Efetivado'], ['parcial', 'Parcialmente']].map(([k, lbl]) => (
                <button key={k} onClick={() => setSel(k)}
                  className="text-xs font-semibold rounded"
                  style={sel === k
                    ? { background: k === 'efetivado' ? '#4ade80' : k === 'parcial' ? '#f5c518' : 'var(--accent)', color: '#0d0e16', padding: '6px 12px', border: '1px solid transparent' }
                    : { background: 'var(--bg-input)', color: 'var(--text-nav)', border: '1px solid var(--border2)', padding: '6px 12px' }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Filtrar fornecedor</div>
            <input value={fornBusca} onChange={e => setFornBusca(e.target.value)} placeholder="Nome do fornecedor…" className="inp text-xs" style={{ width: 200 }} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Filtrar SKU</div>
            <input value={skuBusca} onChange={e => setSkuBusca(e.target.value)} placeholder="Código ou descrição…" className="inp text-xs" style={{ width: 200 }} />
          </div>
          {(fb || sb) && <button onClick={() => { setFornBusca(''); setSkuBusca('') }} className="btn-ghost text-xs self-end">✕ Limpar</button>}
          <div className="ml-auto flex gap-2 self-end">
            <button onClick={expandAll}   className="btn-ghost text-xs">⊞ Expandir</button>
            <button onClick={collapseAll} className="btn-ghost text-xs">⊟ Recolher</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 10 }}>
          Agrupado por <b>data de lançamento</b> das entradas. Valores sobre o <b>custo</b> e o <b>preço de venda</b> atuais × quantidade lançada.
          {sb && <span style={{ color: '#f5c518' }}> · Filtro de SKU atua no detalhe (meses mais recentes).</span>}
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
            {meses.filter(mesVisivel).map(M => {
              const isMesOpen = !!expandMes[M.mes]
              const mv = pick(M)
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
                        {fNum(mv.pecas)} peças · {fNum(mv.skus)} SKUs · {fNum(mv.lancamentos)} lançamentos · {fNum(mv.fornecedores)} fornecedores
                      </div>
                    </div>
                    <ValoresResumo custo={mv.valorCusto} venda={mv.valorVenda} />
                  </div>

                  {/* Dias do mês */}
                  {isMesOpen && (
                    <div style={{ borderTop: '1px solid var(--border)' }}>
                      {M.dias.filter(diaVisivel).map(D => {
                        const diaKey = `${M.mes}::${D.dia}`
                        const isDiaOpen = !!expandDia[diaKey]
                        const dv = pick(D)
                        const forns = (D.fornecedores || []).filter(fornVisivel)
                        const temDetalhe = (data.detalheMeses || []).includes(M.mes)
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
                                {fNum(dv.pecas)} peças · {fNum(dv.skus)} SKUs · {fNum(dv.fornecedores ?? forns.length)} forn.
                              </span>
                              <div style={{ marginLeft: 'auto', display: 'flex', gap: 24 }}>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#a3e635', fontWeight: 700 }}>{fBRL(dv.valorCusto)}</span>
                                <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f5c518', fontWeight: 700 }}>{fBRL(dv.valorVenda)}</span>
                              </div>
                            </div>

                            {/* Fornecedores do dia (expansíveis → lançamentos → programados) */}
                            {isDiaOpen && (
                              <div style={{ background: 'var(--bg-card)' }}>
                                {/* cabeçalho */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 20px 5px 52px', background: 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}>
                                  <span style={{ flex: 1, ...thTxt }}>Fornecedor</span>
                                  <span style={{ width: 70, textAlign: 'center', ...thTxt }}>SKUs</span>
                                  <span style={{ width: 80, textAlign: 'center', ...thTxt }}>Peças</span>
                                  <span style={{ width: 120, textAlign: 'right', ...thTxt }}>A Custo</span>
                                  <span style={{ width: 120, textAlign: 'right', ...thTxt }}>A Venda</span>
                                </div>
                                {forns.length === 0 ? (
                                  <div style={{ padding: '10px 20px 10px 52px', fontSize: 12, color: 'var(--text-dim)' }}>Nenhum fornecedor corresponde ao filtro.</div>
                                ) : forns.map((f, i) => {
                                  const fornKey = `${diaKey}::${f.nome}`
                                  const fv = pick(f)
                                  const lancsF = (f.lancs || []).filter(lancVisivel)
                                  const temDet  = lancsF.length > 0
                                  const isFornOpen = temDet && !!expandForn[fornKey]
                                  return (
                                    <div key={f.nome}>
                                      {/* Linha do fornecedor */}
                                      <div onClick={() => temDet && toggleForn(fornKey)} style={{
                                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 20px 6px 52px',
                                        background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)', borderBottom: '1px solid var(--border)',
                                        cursor: temDet ? 'pointer' : 'default',
                                      }}>
                                        <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
                                          <span style={{ color: 'var(--text-muted)', fontSize: 10, width: 10 }}>{temDet ? (isFornOpen ? '▼' : '▶') : ''}</span>
                                          {f.nome}
                                        </span>
                                        <span style={{ width: 70, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#00b4d8' }}>{fNum(fv.skus)}</span>
                                        <span style={{ width: 80, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#818cf8', fontWeight: 700 }}>{fNum(fv.pecas)}</span>
                                        <span style={{ width: 120, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: '#a3e635', fontWeight: 700 }}>{fBRL(fv.valorCusto)}</span>
                                        <span style={{ width: 120, textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: '#f5c518', fontWeight: 700 }}>{fBRL(fv.valorVenda)}</span>
                                      </div>

                                      {/* Lançamentos do fornecedor (filtrados pelo status) */}
                                      {isFornOpen && lancsF.map(L => {
                                        const lancKey = `${fornKey}::${L.codigo}`
                                        const isLancOpen = !!expandLanc[lancKey]
                                        const itensF = (L.itens || []).filter(itemMatch)
                                        return (
                                          <div key={L.codigo}>
                                            <div onClick={() => toggleLanc(lancKey)} style={{
                                              display: 'flex', alignItems: 'center', gap: 10, padding: '5px 20px 5px 72px',
                                              background: 'var(--bg)', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                                            }}>
                                              <span style={{ color: 'var(--text-muted)', fontSize: 10, width: 10 }}>{isLancOpen ? '▼' : '▶'}</span>
                                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lançamento</span>
                                              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#f5c518', fontWeight: 700 }}>#{L.numeroEntrada || L.codigo}</span>
                                              <StatusBadge status={L.status} />
                                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{itensF.length} programado{itensF.length !== 1 ? 's' : ''}</span>
                                              <div style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
                                                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#818cf8', fontWeight: 700 }}>{fNum(L.pecas)} pç</span>
                                                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#a3e635', fontWeight: 700 }}>{fBRL(L.valorCusto)}</span>
                                              </div>
                                            </div>

                                            {/* Programados (itens) do lançamento */}
                                            {isLancOpen && (
                                              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                                                <thead>
                                                  <tr style={{ background: 'var(--bg-card2)' }}>
                                                    <th style={{ ...th, textAlign: 'left', paddingLeft: 92 }}>SKU</th>
                                                    <th style={{ ...th, textAlign: 'left' }}>Descrição</th>
                                                    <th style={th}>Item</th>
                                                    <th style={th}>Seq.</th>
                                                    <th style={th}>Qtd</th>
                                                    <th style={th}>A Custo</th>
                                                    <th style={th}>A Venda</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {itensF.map((it, j) => (
                                                    <tr key={j} style={{ background: j % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}>
                                                      <td style={{ padding: '5px 10px 5px 92px', fontFamily: 'monospace', fontSize: 11, color: '#f5c518', whiteSpace: 'nowrap' }}>{it.sku}</td>
                                                      <td style={{ padding: '5px 10px', fontSize: 11, color: 'var(--text)' }}>
                                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320 }} title={it.descricao}>{it.descricao}</div>
                                                      </td>
                                                      <td style={{ padding: '5px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{it.item}</td>
                                                      <td style={{ padding: '5px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{it.sequencia}</td>
                                                      <td style={{ padding: '5px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: '#818cf8', fontWeight: 700 }}>{fNum(it.qtd)}</td>
                                                      <td style={{ padding: '5px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: '#a3e635', fontWeight: 700 }}>{fBRL(it.valorCusto)}</td>
                                                      <td style={{ padding: '5px 10px', textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: '#f5c518', fontWeight: 700 }}>{fBRL(it.valorVenda)}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )
                                })}
                                {/* aviso quando o mês não tem drill-down */}
                                {!temDetalhe && (
                                  <div style={{ padding: '6px 20px 6px 52px', fontSize: 10, color: 'var(--text-dim)', fontStyle: 'italic' }}>
                                    Detalhe (lançamento → programados) disponível apenas nos meses mais recentes.
                                  </div>
                                )}
                              </div>
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

const thTxt = {
  color: 'var(--text-muted)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
}

function StatusBadge({ status }) {
  const s = String(status || '').toLowerCase()
  const efet = s.includes('efetiv') && !s.includes('parcial')
  const cor = efet ? '#4ade80' : s.includes('parcial') ? '#f5c518' : '#9ca3af'
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: cor, border: `1px solid ${cor}`, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      {status || '—'}
    </span>
  )
}
