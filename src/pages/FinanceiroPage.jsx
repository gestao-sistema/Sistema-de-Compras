import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'

const fMoeda = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

const AMARELO = '#f5c518'   // detalhes (qtd de clientes/contas etc.) em amarelo
// Fundos das expansões: classes theme-aware em index.css (.fin-exp-clientes / .fin-exp-contas)

// Cor estável por forma de pagamento (mesma cor no tooltip e no painel)
const MOD_PALETTE = ['#60a5fa', '#f472b6', '#facc15', '#4ade80', '#c084fc', '#fb923c', '#22d3ee', '#f87171', '#a3e635', '#e879f9', '#38bdf8', '#fbbf24', '#34d399', '#fca5a5', '#818cf8', '#f9a8d4']
function modColor(forma) {
  let h = 0
  for (const ch of String(forma || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return MOD_PALETTE[h % MOD_PALETTE.length]
}

// Cor do ranking: top 3 ouro/prata/bronze, demais neutro
function rankColor(rank) {
  return rank === 1 ? '#f5c518' : rank === 2 ? '#cbd5e1' : rank === 3 ? '#cd7f32' : 'var(--text-dim)'
}

// Larguras fixas compartilhadas entre a tabela do vendedor e a de clientes, para os
// valores ficarem alinhados verticalmente (Recebido embaixo de Recebido, etc.).
const COLS_FIN = ['36%', '18%', '18%', '18%', '10%']
function ColsFin() {
  return <colgroup>{COLS_FIN.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
}

// Handlers do tooltip de modalidade — aplicados só nas células Valor Devido/Recebido
function hoverHandlers(setHover, ent) {
  return {
    onMouseEnter: e => setHover({ cliente: ent, x: e.clientX, y: e.clientY }),
    onMouseMove:  e => setHover(h => (h && h.cliente === ent ? { ...h, x: e.clientX, y: e.clientY } : h)),
    onMouseLeave: () => setHover(null),
  }
}

export default function FinanceiroPage() {
  const [hover, setHover]   = useState(null)   // { cliente, x, y }
  const [expV, setExpV]     = useState(null)   // key do vendedor expandido

  const [de, setDe]             = useState('')
  const [ate, setAte]           = useState('')
  const [pagDe, setPagDe]       = useState('')
  const [pagAte, setPagAte]     = useState('')
  const [situacao, setSituacao] = useState('todas')
  const [vencidas, setVencidas] = useState(false)
  const [cliente, setCliente]   = useState('')
  const [modalidade, setModalidade] = useState('')

  const q = useQuery({
    queryKey: ['financeiro', de, ate, pagDe, pagAte, situacao, vencidas, cliente, modalidade],
    queryFn: () => api.financeiro({ de, ate, pagDe, pagAte, situacao, vencidas: vencidas || undefined, cliente, modalidade }),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    // enquanto o backend ainda monta o cache (1ª carga), repolla a cada 4s
    refetchInterval: query => (query.state.data?.carregando ? 4000 : false),
  })

  const temFiltro = de || ate || pagDe || pagAte || situacao !== 'todas' || vencidas || cliente || modalidade
  function limpar() { setDe(''); setAte(''); setPagDe(''); setPagAte(''); setSituacao('todas'); setVencidas(false); setCliente(''); setModalidade('') }

  const d      = q.data || {}
  const cards  = d.cards || {}
  const linhas = d.vendedores || []
  const modal  = d.modalidade || []

  return (
    <div>
      <div style={{ height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding: '40px 32px 16px' }}>
        {q.isError && <div className="err-box" style={{ flexShrink: 0 }}>{q.error.message}</div>}
        {d.erro && <div className="err-box" style={{ flexShrink: 0 }}>{d.erro}</div>}

        {/* Cards de resumo + Modalidade */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr 1.4fr', flexShrink: 0 }}>
          <CardValor titulo="Concluído" sub="valor recebido"        valor={cards.concluido} cor="#4ade80" />
          <CardValor titulo="Pendente"  sub="em aberto a receber"   valor={cards.pendente}  cor="#fb923c" />
          <CardValor titulo="Total Geral" sub={`${fNum(cards.pctPend, 1)}% pendência`} valor={cards.total} cor="var(--accent-title, var(--accent))" pct={cards.pctPend} />
          <PainelModalidade modalidade={modal} total={d.modalidadeTotal} />
        </div>

        {/* Filtros */}
        <div className="card flex flex-wrap items-end gap-3" style={{ flexShrink: 0, marginTop: 12 }}>
          <Campo label="Emissão (de)"><input type="date" value={de} onChange={e => setDe(e.target.value)} className="inp text-xs" /></Campo>
          <Campo label="Emissão (até)"><input type="date" value={ate} onChange={e => setAte(e.target.value)} className="inp text-xs" /></Campo>
          <Campo label="Pagamento (de)"><input type="date" value={pagDe} onChange={e => setPagDe(e.target.value)} className="inp text-xs" /></Campo>
          <Campo label="Pagamento (até)"><input type="date" value={pagAte} onChange={e => setPagAte(e.target.value)} className="inp text-xs" /></Campo>
          <Campo label="Situação">
            <select value={situacao} onChange={e => setSituacao(e.target.value)} className="inp text-xs" style={{ minWidth: 120 }}>
              <option value="todas">Todas</option>
              <option value="pago">Pago</option>
              <option value="aberto">Em aberto</option>
            </select>
          </Campo>
          <Campo label="Modalidade">
            <select value={modalidade} onChange={e => setModalidade(e.target.value)} className="inp text-xs" style={{ minWidth: 170, maxWidth: 220 }}>
              <option value="">Todas</option>
              {modal.map(m => <option key={m.forma} value={m.forma}>{m.forma}</option>)}
            </select>
          </Campo>
          <Campo label="Cliente">
            <input value={cliente} onChange={e => setCliente(e.target.value)} placeholder="nome ou código" className="inp text-xs" style={{ width: 180 }} />
          </Campo>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingBottom: 6 }}>
            <input type="checkbox" checked={vencidas} onChange={e => setVencidas(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-nav)' }}>Só vencidas</span>
          </label>
          {temFiltro && <button onClick={limpar} className="btn-ghost text-xs" style={{ paddingBottom: 6 }}>✕ Limpar</button>}
          {q.isFetching && <span className="ml-auto text-xs self-center" style={{ color: 'var(--text-dim)' }}>atualizando…</span>}
        </div>

        {/* Tabela por responsável (vendedor → cliente → contas) */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: 12 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent-title, var(--accent))' }}>
              Contas a Receber por Responsável {linhas.length > 0 && `(${fNum(linhas.length)})`}
            </span>
          </div>

          {q.isLoading || d.carregando ? (
            <div className="state-box">
              <div className="spinner" />
              <p>Preparando dados financeiros…</p>
              <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>A primeira carga busca todo o histórico e pode levar 1–2 min. Depois fica instantâneo.</p>
            </div>
          ) : (
            <div className="tbl-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
              <table className="tbl" style={{ width: '100%', tableLayout: 'fixed' }}>
                <ColsFin />
                <thead>
                  <tr>
                    <Th align="center">Responsável pela venda</Th>
                    <Th align="center">R$ Valor Devido</Th>
                    <Th align="center">R$ Valor Recebido</Th>
                    <Th align="center">R$ Valor Pendente</Th>
                    <Th align="center">% Pendência</Th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 && (
                    <tr><td colSpan={5}><div className="state-box text-sm">Nenhum dado financeiro</div></td></tr>
                  )}
                  {linhas.map((v, i) => {
                    const alta = v.pctPend > 10
                    const clientes = v.clientes || []
                    const key = `${v.codigo}-${i}`
                    const aberto = expV === key
                    const rank = i + 1
                    const rc = rankColor(rank)
                    const topo = rank <= 3
                    return [
                      <tr key={key}
                        onClick={() => setExpV(aberto ? null : key)}
                        style={{ cursor: 'pointer', background: aberto ? 'var(--bg-hover)' : (i % 2 ? 'var(--bg-alt, rgba(255,255,255,0.015))' : undefined) }}>
                        <td style={{ boxShadow: topo ? `inset 3px 0 0 ${rc}` : undefined, overflow: 'hidden' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              flexShrink: 0, width: 24, height: 24, borderRadius: '50%',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 800, fontFamily: 'monospace',
                              background: topo ? rc : 'var(--bg-input)',
                              color: topo ? '#1a1a1a' : 'var(--text-muted)',
                              border: topo ? 'none' : '1px solid var(--border)',
                            }}>{rank}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>
                                <span style={{ color: 'var(--accent-title, var(--accent))', marginRight: 6, fontSize: 11 }}>{aberto ? '▼' : '▶'}</span>
                                {v.nome}
                              </div>
                              <div style={{ color: AMARELO, fontSize: 11, fontFamily: 'monospace', marginLeft: 17 }}>
                                {v.codigo ? `#${v.codigo} · ` : ''}{fNum(v.clientesCount)} cliente{v.clientesCount === 1 ? '' : 's'}
                                {(v.modalidades || []).length > 0 && ' · passe o mouse p/ modalidades'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', color: '#93c5fd', fontWeight: 800, fontFamily: 'monospace' }}>{fMoeda(v.total)}</td>
                        <td {...hoverHandlers(setHover, v)} style={{ textAlign: 'center', color: '#4ade80', fontWeight: 700, fontFamily: 'monospace', cursor: 'help' }}>{fMoeda(v.pago)}</td>
                        <td style={{ textAlign: 'center', color: '#fb923c', fontWeight: 700, fontFamily: 'monospace' }}>{fMoeda(v.pend)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={alta ? 'blink-alerta' : undefined} style={{
                            display: 'inline-block', minWidth: 64, padding: '4px 10px', borderRadius: 6,
                            fontWeight: 800, fontSize: 13, fontFamily: 'monospace',
                            background: 'var(--bg-input)',
                            color: alta ? '#f87171' : '#f5c518',
                          }}>
                            {fNum(v.pctPend, 1)}%
                          </span>
                        </td>
                      </tr>,
                      aberto && (
                        <tr key={key + '-exp'}>
                          <td colSpan={5} className="fin-exp-clientes" style={{ padding: 0, boxShadow: `inset 3px 0 0 ${rc}` }}>
                            <ClientesVendedor clientes={clientes} vkey={key} vnome={v.nome} setHover={setHover} />
                          </td>
                        </tr>
                      ),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Tooltip: valor por modalidade do cliente */}
      {hover && (hover.cliente.modalidades || []).length > 0 && (
        <div style={{
          position: 'fixed', zIndex: 99999, pointerEvents: 'none',
          left: Math.min(hover.x + 16, window.innerWidth - 300),
          top: Math.min(hover.y + 12, window.innerHeight - 20 - Math.min(hover.cliente.modalidades.length, 12) * 22 - 40),
          background: 'var(--bg-card)', border: '1px solid var(--accent-title, var(--accent))',
          borderRadius: 10, padding: '10px 12px', minWidth: 240, maxWidth: 300,
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-title, var(--accent))', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {hover.cliente.nome}
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recebido por modalidade</div>
          {hover.cliente.modalidades.slice(0, 12).map((m, k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: modColor(m.forma) }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.forma}</span>
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: modColor(m.forma), fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fMoeda(m.valor)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Clientes de um vendedor — cada cliente expande em suas contas
function ClientesVendedor({ clientes, vkey, vnome, setHover }) {
  const [expC, setExpC] = useState(null)
  const lista = [...(clientes || [])].sort((a, b) => b.total - a.total)
  const subHeadStyle = { textAlign: 'center', padding: '5px 8px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#7b8496', whiteSpace: 'nowrap' }
  return (
    <div style={{ padding: '0 0 10px 0' }}>
      {/* Legenda do nível — deixa claro que é o detalhamento do vendedor */}
      <div style={{ padding: '8px 8px 6px 40px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: AMARELO, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ opacity: 0.7 }}>↳</span> Clientes de {vnome} <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>({fNum(lista.length)})</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <ColsFin />
        <thead>
          <tr style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.25)' }}>
            <th style={{ ...subHeadStyle, textAlign: 'left', paddingLeft: 40 }}>Cliente</th>
            {['R$ Valor Devido', 'R$ Valor Recebido', 'R$ Valor Pendente'].map(h => (
              <th key={h} style={subHeadStyle}>{h}</th>
            ))}
            <th style={subHeadStyle}>% Pend.</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((c, i) => {
            const alta = c.pctPend > 10
            const contas = c.contas || []
            const key = `${vkey}-${c.codigo}-${i}`
            const open = expC === key
            return [
              <tr key={key}
                onClick={() => setExpC(open ? null : key)}
                style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', background: open ? 'var(--bg-hover)' : undefined }}>
                <td style={{ padding: '5px 8px 5px 40px', overflow: 'hidden' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--accent-title, var(--accent))', marginRight: 6, fontSize: 10 }}>{open ? '▼' : '▶'}</span>
                    {c.nome}
                  </div>
                  <div style={{ color: AMARELO, fontSize: 10, fontFamily: 'monospace', marginLeft: 16 }}>#{c.codigo} · {fNum(contas.length)} conta{contas.length === 1 ? '' : 's'}</div>
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'center', color: '#93c5fd', fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{fMoeda(c.total)}</td>
                <td {...hoverHandlers(setHover, c)} style={{ padding: '5px 8px', textAlign: 'center', color: '#4ade80', fontWeight: 600, fontFamily: 'monospace', fontSize: 12, cursor: 'help' }}>{fMoeda(c.pago)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center', color: '#fb923c', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{fMoeda(c.pend)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                  <span className={alta ? 'blink-alerta' : undefined} style={{
                    display: 'inline-block', minWidth: 54, padding: '2px 8px', borderRadius: 5,
                    fontWeight: 700, fontSize: 11, fontFamily: 'monospace',
                    background: 'var(--bg-input)',
                    color: alta ? '#f87171' : '#f5c518',
                  }}>
                    {fNum(c.pctPend, 1)}%
                  </span>
                </td>
              </tr>,
              open && (
                <tr key={key + '-exp'}>
                  <td colSpan={5} className="fin-exp-contas" style={{ padding: 0 }}>
                    <ContasCliente contas={contas} />
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}

function CardValor({ titulo, sub, valor, cor, pct }) {
  return (
    <div className="card flex flex-col justify-between" style={{ minHeight: 104 }}>
      <span className="kpi-label">{titulo}</span>
      <div className="font-black tracking-tight" style={{ color: cor, fontSize: 'clamp(16px,2vw,26px)', lineHeight: 1.1, margin: '6px 0 4px' }}>
        {fBRL(valor)}
      </div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

function PainelModalidade({ modalidade, total }) {
  const top = (modalidade || []).slice(0, 6)
  return (
    <div className="card" style={{ minHeight: 104 }}>
      <span className="kpi-label">Modalidade de Pagamento</span>
      <div style={{ fontSize: 9.5, color: 'var(--text-dim)', marginTop: 1 }}>recebido por forma (histórico)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
        {top.map((m, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: modColor(m.forma) }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={m.forma}>{m.forma}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fBRL(m.valor)}</span>
            <span style={{ fontSize: 10.5, color: 'var(--accent-title, var(--accent))', fontFamily: 'monospace', minWidth: 42, textAlign: 'right' }}>{fNum(m.pct, 1)}%</span>
          </div>
        ))}
        {top.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>—</span>}
      </div>
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--accent-title, var(--accent))' }}>{label}</div>
      {children}
    </div>
  )
}

function ContasCliente({ contas }) {
  const lista = [...(contas || [])].sort((a, b) => b.total - a.total)
  return (
    <div style={{ padding: '4px 14px 10px 56px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Documento', 'Emissão', 'Vencimento', 'Histórico', 'Pagamento', 'R$ Valor Devido', 'R$ Valor Recebido', 'R$ Valor Pendente', 'Situação'].map((h, i) => (
              <th key={h} style={{ textAlign: 'center', padding: '6px 8px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lista.map((c, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', color: 'var(--accent-title, var(--accent))', whiteSpace: 'nowrap' }}>{c.prefixo} {c.numero}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.emissao || '—'}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', color: c.vencimento ? '#f87171' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>{c.vencimento || '—'}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'center', color: 'var(--text-sec)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.historico}>{c.historico || '—'}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', color: c.pagamento ? '#4ade80' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>{c.pagamento || '—'}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', color: '#93c5fd', fontWeight: 700 }}>{fMoeda(c.total)}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', color: '#4ade80' }}>{fMoeda(c.pago)}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', color: '#fb923c' }}>{fMoeda(c.pend)}</td>
              <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: c.aberto ? '#7c2d12' : '#14532d', color: c.aberto ? '#fdba74' : '#86efac' }}>
                  {c.aberto ? 'EM ABERTO' : 'PAGO'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{ textAlign: align, whiteSpace: 'nowrap', padding: '10px 14px', fontSize: 11, fontWeight: 700,
                 textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', top: 0,
                 background: 'var(--bg-card)', zIndex: 10, color: 'var(--accent-title, var(--accent))' }}>
      {children}
    </th>
  )
}
