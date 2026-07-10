import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'

const fMoeda = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

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

export default function FinanceiroPage() {
  const [hover, setHover]   = useState(null)   // { cliente, x, y }
  const [expV, setExpV]     = useState(null)   // key do vendedor expandido

  const [de, setDe]             = useState('')
  const [ate, setAte]           = useState('')
  const [situacao, setSituacao] = useState('todas')
  const [vencidas, setVencidas] = useState(false)
  const [cliente, setCliente]   = useState('')
  const [modalidade, setModalidade] = useState('')

  const q = useQuery({
    queryKey: ['financeiro', de, ate, situacao, vencidas, cliente, modalidade],
    queryFn: () => api.financeiro({ de, ate, situacao, vencidas: vencidas || undefined, cliente, modalidade }),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })

  const temFiltro = de || ate || situacao !== 'todas' || vencidas || cliente || modalidade
  function limpar() { setDe(''); setAte(''); setSituacao('todas'); setVencidas(false); setCliente(''); setModalidade('') }

  const d      = q.data || {}
  const cards  = d.cards || {}
  const linhas = d.vendedores || []
  const modal  = d.modalidade || []

  return (
    <div>
      <div className="page-body space-y-4">
        {q.isError && <div className="err-box">{q.error.message}</div>}
        {d.erro && <div className="err-box">{d.erro}</div>}

        {/* Cards de resumo + Modalidade */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr 1.4fr' }}>
          <CardValor titulo="Concluído" sub="valor recebido"        valor={cards.concluido} cor="#4ade80" />
          <CardValor titulo="Pendente"  sub="em aberto a receber"   valor={cards.pendente}  cor="#fb923c" />
          <CardValor titulo="Total Geral" sub={`${fNum(cards.pctPend, 1)}% pendência`} valor={cards.total} cor="var(--accent-title, var(--accent))" pct={cards.pctPend} />
          <PainelModalidade modalidade={modal} total={d.modalidadeTotal} />
        </div>

        {/* Filtros */}
        <div className="card flex flex-wrap items-end gap-3">
          <Campo label="Emissão (de)"><input type="date" value={de} onChange={e => setDe(e.target.value)} className="inp text-xs" /></Campo>
          <Campo label="Emissão (até)"><input type="date" value={ate} onChange={e => setAte(e.target.value)} className="inp text-xs" /></Campo>
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
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent-title, var(--accent))' }}>
              Contas a Receber por Responsável {linhas.length > 0 && `(${fNum(linhas.length)})`}
            </span>
          </div>

          {q.isLoading ? (
            <div className="state-box"><div className="spinner" /><p>Carregando financeiro…</p></div>
          ) : (
            <div className="tbl-scroll" style={{ maxHeight: '64vh' }}>
              <table className="tbl" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <Th>Responsável pela venda</Th>
                    <Th align="right">Concluído</Th>
                    <Th align="right">Pendente</Th>
                    <Th align="right">Total</Th>
                    <Th align="center">% Pendência</Th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 && (
                    <tr><td colSpan={5}><div className="state-box text-sm">Nenhum dado financeiro</div></td></tr>
                  )}
                  {linhas.map((v, i) => {
                    const alta = v.pctPend >= 20
                    const clientes = v.clientes || []
                    const key = `${v.codigo}-${i}`
                    const aberto = expV === key
                    const rank = i + 1
                    const rc = rankColor(rank)
                    const topo = rank <= 3
                    return [
                      <tr key={key}
                        onClick={() => setExpV(aberto ? null : key)}
                        onMouseEnter={e => setHover({ cliente: v, x: e.clientX, y: e.clientY })}
                        onMouseMove={e => setHover(h => h && h.cliente === v ? { ...h, x: e.clientX, y: e.clientY } : h)}
                        onMouseLeave={() => setHover(null)}
                        style={{ cursor: 'pointer', background: aberto ? 'var(--bg-hover)' : (i % 2 ? 'var(--bg-alt, rgba(255,255,255,0.015))' : undefined) }}>
                        <td style={{ borderLeft: `3px solid ${topo ? rc : 'transparent'}` }}>
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
                              <div style={{ color: 'var(--text-dim)', fontSize: 11, fontFamily: 'monospace', marginLeft: 17 }}>
                                {v.codigo ? `#${v.codigo} · ` : ''}{fNum(v.clientesCount)} cliente{v.clientesCount === 1 ? '' : 's'}
                                {(v.modalidades || []).length > 0 && ' · passe o mouse p/ modalidades'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', color: '#4ade80', fontWeight: 700, fontFamily: 'monospace' }}>{fMoeda(v.pago)}</td>
                        <td style={{ textAlign: 'right', color: '#fb923c', fontWeight: 700, fontFamily: 'monospace' }}>{fMoeda(v.pend)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text)', fontWeight: 800, fontFamily: 'monospace' }}>{fMoeda(v.total)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', minWidth: 64, padding: '4px 10px', borderRadius: 6,
                            fontWeight: 800, fontSize: 13, fontFamily: 'monospace',
                            background: alta ? '#7f1d1d' : 'var(--bg-input)',
                            color: alta ? '#fca5a5' : 'var(--text-muted)',
                          }}>
                            {fNum(v.pctPend, 1)}%
                          </span>
                        </td>
                      </tr>,
                      aberto && (
                        <tr key={key + '-exp'}>
                          <td colSpan={5} style={{ padding: 0, background: 'var(--bg)' }}>
                            <ClientesVendedor clientes={clientes} vkey={key} setHover={setHover} />
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
function ClientesVendedor({ clientes, vkey, setHover }) {
  const [expC, setExpC] = useState(null)
  const lista = [...(clientes || [])].sort((a, b) => b.total - a.total)
  return (
    <div style={{ padding: '4px 0 8px 0' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ textAlign: 'left', padding: '6px 8px 6px 40px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)' }}>Cliente</th>
            {['Concluído', 'Pendente', 'Total'].map(h => (
              <th key={h} style={{ textAlign: 'right', padding: '6px 8px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
            <th style={{ textAlign: 'center', padding: '6px 8px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>% Pend.</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((c, i) => {
            const alta = c.pctPend >= 20
            const contas = c.contas || []
            const key = `${vkey}-${c.codigo}-${i}`
            const open = expC === key
            return [
              <tr key={key}
                onClick={() => setExpC(open ? null : key)}
                onMouseEnter={e => setHover({ cliente: c, x: e.clientX, y: e.clientY })}
                onMouseMove={e => setHover(h => h && h.cliente === c ? { ...h, x: e.clientX, y: e.clientY } : h)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)', background: open ? 'var(--bg-hover)' : undefined }}>
                <td style={{ padding: '5px 8px 5px 40px' }}>
                  <div style={{ color: 'var(--text)', fontWeight: 600, fontSize: 12 }}>
                    <span style={{ color: 'var(--accent-title, var(--accent))', marginRight: 6, fontSize: 10 }}>{open ? '▼' : '▶'}</span>
                    {c.nome}
                  </div>
                  <div style={{ color: 'var(--text-dim)', fontSize: 10, fontFamily: 'monospace', marginLeft: 16 }}>#{c.codigo} · {fNum(contas.length)} conta{contas.length === 1 ? '' : 's'}</div>
                </td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#4ade80', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{fMoeda(c.pago)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: '#fb923c', fontWeight: 600, fontFamily: 'monospace', fontSize: 12 }}>{fMoeda(c.pend)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--text)', fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>{fMoeda(c.total)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', minWidth: 54, padding: '2px 8px', borderRadius: 5,
                    fontWeight: 700, fontSize: 11, fontFamily: 'monospace',
                    background: alta ? '#7f1d1d' : 'var(--bg-input)',
                    color: alta ? '#fca5a5' : 'var(--text-muted)',
                  }}>
                    {fNum(c.pctPend, 1)}%
                  </span>
                </td>
              </tr>,
              open && (
                <tr key={key + '-exp'}>
                  <td colSpan={5} style={{ padding: 0, background: 'var(--bg-card)' }}>
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
      <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--accent)' }}>{label}</div>
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
            {['Documento', 'Emissão', 'Histórico', 'Vencimento', 'Concluído', 'Pendente', 'Total', 'Situação'].map((h, i) => (
              <th key={h} style={{ textAlign: i >= 4 && i <= 6 ? 'right' : i === 7 ? 'center' : 'left', padding: '6px 8px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lista.map((c, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', color: 'var(--accent-title, var(--accent))', whiteSpace: 'nowrap' }}>{c.prefixo} {c.numero}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.emissao || '—'}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, color: 'var(--text-sec)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.historico}>{c.historico || '—'}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.vencimento || '—'}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', textAlign: 'right', color: '#4ade80' }}>{fMoeda(c.pago)}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', textAlign: 'right', color: '#fb923c' }}>{fMoeda(c.pend)}</td>
              <td style={{ padding: '5px 8px', fontSize: 11, fontFamily: 'monospace', textAlign: 'right', color: 'var(--text)', fontWeight: 700 }}>{fMoeda(c.total)}</td>
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
