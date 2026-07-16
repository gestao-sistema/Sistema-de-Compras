import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'
import ExportFinanceiro from '../components/ExportFinanceiro'
import MultiCombo from '../components/MultiCombo'

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

// Rótulo amigável da forma de pagamento (nota de crédito usada como pagamento)
const formaLabel = f => (/nota de cr[eé]dito/i.test(f || '') ? 'Nota de crédito (usada)' : f)

// Cor do ranking: top 3 ouro/prata/bronze, demais neutro
function rankColor(rank) {
  return rank === 1 ? '#f5c518' : rank === 2 ? '#cbd5e1' : rank === 3 ? '#cd7f32' : 'var(--text-dim)'
}

// Larguras fixas compartilhadas entre a tabela do vendedor e a de clientes, para os
// valores ficarem alinhados verticalmente (Recebido embaixo de Recebido, etc.).
const COLS_FIN = ['30%', '16%', '16%', '16%', '14%', '8%']
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
  const [situacaoF, setSituacaoF]     = useState([])   // ['pago','aberto']
  const [vencidas, setVencidas] = useState(false)
  const [clienteF, setClienteF]       = useState([])   // códigos de cliente
  const [vendedorF, setVendedorF]     = useState([])   // vendedores (responsáveis)
  const [modalidadeF, setModalidadeF] = useState([])   // formas de pagamento
  const [parcelaF, setParcelaF]       = useState([])   // parcelas

  const q = useQuery({
    queryKey: ['financeiro', de, ate, pagDe, pagAte, situacaoF, vencidas, clienteF, vendedorF, modalidadeF, parcelaF],
    queryFn: () => api.financeiro({
      de, ate, pagDe, pagAte,
      situacao:   situacaoF.join('|'),
      vencidas:   vencidas || undefined,
      cliente:    clienteF.join('|'),
      vendedor:   vendedorF.join('|'),
      modalidade: modalidadeF.join('|'),
      parcela:    parcelaF.join('|'),
    }),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    // enquanto o backend ainda monta o cache (1ª carga), repolla a cada 4s
    refetchInterval: query => (query.state.data?.carregando ? 4000 : false),
  })

  const temFiltro = de || ate || pagDe || pagAte || situacaoF.length || vencidas || clienteF.length || vendedorF.length || modalidadeF.length || parcelaF.length
  function limpar() { setDe(''); setAte(''); setPagDe(''); setPagAte(''); setSituacaoF([]); setVencidas(false); setClienteF([]); setVendedorF([]); setModalidadeF([]); setParcelaF([]) }

  const d      = q.data || {}
  const cards  = d.cards || {}
  const linhas = d.vendedores || []
  const modal  = d.modalidade || []
  const clientesOpc = d.clientes || []
  const clienteOptions = clientesOpc.map(c => ({ value: c.codigo, label: `${c.nome} · #${c.codigo}` }))
  const vendedoresOpc = d.vendedoresOpcoes || []
  const vendedorOptions = vendedoresOpc.map(v => ({ value: v.codigo, label: v.nome }))
  const parcelasOpc = d.parcelas || []
  const modalidadeOpc = d.modalidadesOpcoes || []
  const SITUACAO_OPTS = [{ value: 'pago', label: 'Pago' }, { value: 'aberto', label: 'Em aberto' }]
  // Faceting: mostra só as situações presentes no resultado filtrado (fallback: ambas)
  const situacoesDisp = d.situacoes || ['pago', 'aberto']
  const situacaoOptions = SITUACAO_OPTS.filter(o => situacoesDisp.includes(o.value) || situacaoF.includes(o.value))

  return (
    <div>
      <div style={{ height: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', padding: '18px 32px 16px' }}>
        {q.isError && <div className="err-box" style={{ flexShrink: 0 }}>{q.error.message}</div>}
        {d.erro && <div className="err-box" style={{ flexShrink: 0 }}>{d.erro}</div>}

        {/* Cards de resumo + Modalidade */}
        <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr 1.4fr', flexShrink: 0 }}>
          <CardValor titulo="Concluído" sub="valor recebido"        valor={cards.concluido} cor="#4ade80" />
          <CardValor titulo="Pendente"  sub="em aberto a receber"   valor={cards.pendente}  cor="#fb923c" />
          <CardValor titulo="Total Geral Líquido" sub={`${fNum(cards.pctPend, 1)}% pendência`} valor={cards.total} cor="var(--accent-title, var(--accent))" pct={cards.pctPend}
            hoverContent={<ComposicaoTotal c={cards.composicao} />}
            rodape={<NotasCreditoResumo total={cards.notaCredito} tipos={cards.notaCreditoTipos} outrosTotal={cards.outrosCredito} outrosTipos={cards.outrosCreditoTipos} />} />
          <PainelModalidade modalidade={modal} total={d.modalidadeTotal} />
        </div>

        {/* Filtros */}
        <div className="card flex flex-wrap items-end gap-3" style={{ flexShrink: 0, marginTop: 10 }}>
          <Campo label="Emissão (de)"><input type="date" value={de} onChange={e => setDe(e.target.value)} className="inp text-xs" /></Campo>
          <Campo label="Emissão (até)"><input type="date" value={ate} onChange={e => setAte(e.target.value)} className="inp text-xs" /></Campo>
          <Campo label="Pagamento (de)"><input type="date" value={pagDe} onChange={e => setPagDe(e.target.value)} className="inp text-xs" /></Campo>
          <Campo label="Pagamento (até)"><input type="date" value={pagAte} onChange={e => setPagAte(e.target.value)} className="inp text-xs" /></Campo>
          <Campo label="Situação">
            <MultiCombo value={situacaoF} onChange={setSituacaoF} options={situacaoOptions} width={150} />
          </Campo>
          <Campo label="Modalidade">
            <MultiCombo value={modalidadeF} onChange={setModalidadeF} options={modalidadeOpc.map(f => ({ value: f, label: formaLabel(f) }))} width={200} />
          </Campo>
          <Campo label="Parcela">
            <MultiCombo value={parcelaF} onChange={setParcelaF} options={parcelasOpc} width={130} />
          </Campo>
          <Campo label="Cliente">
            <MultiCombo value={clienteF} onChange={setClienteF} options={clienteOptions} placeholder="todos os clientes" width={240} />
          </Campo>
          <Campo label="Vendedor(a)">
            <MultiCombo value={vendedorF} onChange={setVendedorF} options={vendedorOptions} placeholder="todas as vendedoras" width={200} />
          </Campo>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', paddingBottom: 6 }}>
            <input type="checkbox" checked={vencidas} onChange={e => setVencidas(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-nav)' }}>Só vencidas</span>
          </label>
          {temFiltro && <button onClick={limpar} className="btn-ghost text-xs" style={{ paddingBottom: 6 }}>✕ Limpar</button>}
          {q.isFetching && <span className="ml-auto text-xs self-center" style={{ color: 'var(--text-dim)' }}>atualizando…</span>}
        </div>

        {/* Tabela por responsável (vendedor → cliente → contas) */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', marginTop: 10 }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent-title, var(--accent))' }}>
              Contas a Receber por Responsável {linhas.length > 0 && `(${fNum(linhas.length)})`}
            </span>
            {linhas.length > 0 && <ExportFinanceiro vendedores={linhas} cards={cards} />}
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
                    <Th align="center">R$ Devido</Th>
                    <Th align="center">NC (devolução)</Th>
                    <Th align="center">R$ Recebido</Th>
                    <Th align="center">R$ Pendente</Th>
                    <Th align="center">% Pend.</Th>
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
                        <td style={{ textAlign: 'center', color: v.notaCredito ? '#f472b6' : 'var(--text-dim)', fontWeight: v.notaCredito ? 700 : 400, fontFamily: 'monospace' }}>{v.notaCredito ? fMoeda(v.notaCredito) : '—'}</td>
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
                          <td colSpan={6} className="fin-exp-clientes" style={{ padding: 0, boxShadow: `inset 3px 0 0 ${rc}` }}>
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
                <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formaLabel(m.forma)}</span>
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
      {/* Legenda do nível 2 (Cliente) — azul, casando com o fundo azulado da expansão */}
      <div style={{ padding: '8px 8px 6px 40px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#60a5fa' }} />
          Clientes de {vnome}
        </span>
        <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>({fNum(lista.length)})</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <ColsFin />
        <thead>
          <tr style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.25)' }}>
            <th style={{ ...subHeadStyle, textAlign: 'left', paddingLeft: 40 }}>Cliente</th>
            {['R$ Devido', 'NC (devolução)', 'R$ Recebido', 'R$ Pendente'].map(h => (
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
                <td style={{ padding: '5px 8px', textAlign: 'center', color: c.notaCredito ? '#f472b6' : 'var(--text-dim)', fontWeight: c.notaCredito ? 700 : 400, fontFamily: 'monospace', fontSize: 12 }}>{c.notaCredito ? fMoeda(c.notaCredito) : '—'}</td>
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
                  <td colSpan={6} className="fin-exp-contas" style={{ padding: 0, boxShadow: 'inset 4px 0 0 #34d399' }}>
                    <ContasCliente contas={contas} cnome={c.nome} />
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

// Rótulos amigáveis por tipo (prefixo) de nota de crédito
const NC_TIPO_LABEL = { ORC: 'Devolução', ASS: 'Assistência', NC: 'Baixa/ajuste', NCI: 'Baixa/ajuste' }

// Créditos que abatem o total, em 2 colunas lado a lado (após uma barra divisória):
// notas de crédito (devolução/assistência) e outros créditos (adiantamentos: PIX, baixa…).
function NotasCreditoResumo({ total, tipos, outrosTotal, outrosTipos }) {
  const nc = tipos || [], outros = outrosTipos || []
  const linha = (rotulo, valor) => (
    <div key={rotulo} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 9.5, color: 'var(--text-dim)' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rotulo}</span>
      <span style={{ color: '#f472b6', whiteSpace: 'nowrap' }}>{fMoeda(valor)}</span>
    </div>
  )
  const coluna = (titulo, tot, itens, labelFn) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{titulo}: <strong style={{ color: '#f472b6' }}>{fMoeda(tot || 0)}</strong></div>
      <div style={{ marginTop: 1 }}>{itens.map(t => linha(labelFn(t.tipo), t.valor))}</div>
    </div>
  )
  return (
    <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border2)', fontFamily: 'monospace', lineHeight: 1.3, display: 'flex', gap: 14 }}>
      {coluna('Notas de crédito', total, nc, t => NC_TIPO_LABEL[t] || t)}
      {coluna('Outros créditos', outrosTotal, outros, t => t)}
    </div>
  )
}

function CardValor({ titulo, sub, valor, cor, pct, rodape, hoverContent }) {
  const [pos, setPos] = useState(null)
  const hov = hoverContent ? {
    onMouseEnter: e => setPos({ x: e.clientX, y: e.clientY }),
    onMouseMove:  e => setPos({ x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setPos(null),
  } : {}
  return (
    <div className="card flex flex-col justify-between" style={{ minHeight: 104, cursor: hoverContent ? 'help' : undefined }} {...hov}>
      <span className="kpi-label">{titulo}{hoverContent && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-dim)' }} title="Passe o mouse para ver a composição">ⓘ</span>}</span>
      <div className="font-black tracking-tight" style={{ color: cor, fontSize: 'clamp(16px,2vw,26px)', lineHeight: 1.1, margin: '6px 0 4px' }}>
        {fBRL(valor)}
      </div>
      <div className="kpi-sub">{sub}</div>
      {rodape && <div className="kpi-sub" style={{ marginTop: 2, fontFamily: 'monospace' }}>{rodape}</div>}
      {pos && hoverContent && (
        <div style={{ position: 'fixed', zIndex: 99999, pointerEvents: 'none',
                      left: Math.min(pos.x + 16, window.innerWidth - 320),
                      top: Math.min(pos.y + 12, window.innerHeight - 280),
                      background: 'var(--bg-card)', border: '1px solid var(--accent-title, var(--accent))',
                      borderRadius: 10, padding: '10px 12px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
          {hoverContent}
        </div>
      )}
    </div>
  )
}

// Waterfall da composição do Total Geral (de onde vem o valor)
function ComposicaoTotal({ c }) {
  if (!c) return null
  const linha = (rot, val, bold, cor) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, fontSize: 11.5, fontFamily: 'monospace', padding: '2px 0', fontWeight: bold ? 800 : 500 }}>
      <span style={{ color: bold ? 'var(--text)' : 'var(--text-muted)' }}>{rot}</span>
      <span style={{ color: cor || 'var(--text)', whiteSpace: 'nowrap' }}>{fMoeda(val)}</span>
    </div>
  )
  const div = <div style={{ borderTop: '1px solid var(--border)', margin: '3px 0' }} />
  const gerado = (c.recPositivo || 0) + (c.pendente || 0)   // Entradas + Pendente (antes de deduzir)
  return (
    <div style={{ minWidth: 300 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-title, var(--accent))', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
        Composição do Total Geral
      </div>
      {/* Bloco 1 — o que foi gerado (positivos) */}
      {linha('Entradas (dinheiro/cartão/pix/cheque)', c.recPositivo, false, '#4ade80')}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, fontSize: 10, fontStyle: 'italic', color: 'var(--text-dim)', padding: '1px 0' }}>
        <span>· nota de crédito usada (ref., não soma)</span>
        <span style={{ color: '#60a5fa', whiteSpace: 'nowrap' }}>{fMoeda(c.ncUsada)}</span>
      </div>
      {linha('(+) Pendente (em aberto)', c.pendente, false, '#fb923c')}
      {div}
      {linha('= Total Gerado', gerado, true, '#a3e635')}
      {div}
      {/* Bloco 2 — o que subtrai */}
      {linha('(−) Notas de crédito (devolução)', c.notaCredito, false, '#f472b6')}
      {linha('(−) Outros créditos', c.outrosCredito, false, '#f472b6')}
      {c.estornos ? linha('(−) Estornos/cancelamentos', c.estornos, false, '#fb923c') : null}
      {div}
      {linha('= Total Geral Líquido', c.total, true)}
      <div style={{ fontSize: 9, color: 'var(--text-dim)', paddingLeft: 4, marginTop: 2 }}>
        líquido = concluído {fMoeda(c.recebido)} + pendente {fMoeda(c.pendente)}
      </div>
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
            <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={m.forma}>{formaLabel(m.forma)}</span>
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

function ContasCliente({ contas, cnome }) {
  const [exp, setExp] = useState(null)
  const lista = [...(contas || [])].sort((a, b) => b.total - a.total)
  const cellCentro = { padding: '5px 6px', fontSize: 11, fontFamily: 'monospace', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  return (
    <div style={{ padding: '4px 14px 10px 40px' }}>
      {/* Legenda do nível 3 (Títulos/SKU) — verde, casando com o fundo esverdeado da expansão */}
      <div style={{ padding: '6px 8px 6px 0', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#34d399', display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399' }} />
          Títulos{cnome ? ` de ${cnome}` : ''}
        </span>
        <span style={{ color: 'var(--text-dim)', fontWeight: 600 }}>({fNum(lista.length)})</span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '9%'  }} />{/* Documento */}
          <col style={{ width: '7%'  }} />{/* Emissão */}
          <col style={{ width: '7%'  }} />{/* Vencimento */}
          <col style={{ width: '22%' }} />{/* Histórico */}
          <col style={{ width: '7%'  }} />{/* Pagamento */}
          <col style={{ width: '5%'  }} />{/* Parcela */}
          <col style={{ width: '9%'  }} />{/* R$ Devido */}
          <col style={{ width: '9%'  }} />{/* NC (devolução) */}
          <col style={{ width: '9%'  }} />{/* R$ Recebido */}
          <col style={{ width: '9%'  }} />{/* R$ Pendente */}
          <col style={{ width: '8%'  }} />{/* Situação */}
        </colgroup>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Documento', 'Emissão', 'Vencimento', 'Histórico', 'Pagamento', 'Parcela', 'R$ Devido', 'NC (devolução)', 'R$ Recebido', 'R$ Pendente', 'Situação'].map((h, i) => (
              <th key={h} style={{ textAlign: 'center', padding: '6px 6px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.02em', color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lista.map((c, i) => {
            const temParcelas = (c.parcelas || []).length > 1
            const open = exp === i
            const ehNC = !!c.notaCredito
            return [
              <tr key={i}
                onClick={temParcelas ? () => setExp(open ? null : i) : undefined}
                style={{ borderBottom: '1px solid var(--border)', cursor: temParcelas ? 'pointer' : 'default', background: open ? 'var(--bg-hover)' : undefined }}>
                <td style={{ ...cellCentro, color: 'var(--accent-title, var(--accent))' }}>
                  {temParcelas && <span style={{ marginRight: 5, fontSize: 9 }}>{open ? '▼' : '▶'}</span>}
                  {c.prefixo} {c.numero}
                </td>
                <td style={{ ...cellCentro, color: 'var(--text-muted)' }}>{c.emissao || '—'}</td>
                <td style={{ ...cellCentro, color: c.vencimento ? '#f87171' : 'var(--text-dim)' }}>{c.vencimento || '—'}</td>
                <td style={{ padding: '5px 8px', fontSize: 11, textAlign: 'center', color: 'var(--text-sec)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.historico}>{c.historico || '—'}</td>
                <td style={{ ...cellCentro, color: c.pagamento ? '#4ade80' : 'var(--text-dim)' }}>{c.pagamento || '—'}</td>
                <td style={{ ...cellCentro, color: 'var(--text-muted)' }} title={temParcelas ? `${c.parcelas.length} parcelas` : undefined}>{c.parcela || '—'}</td>
                <td style={{ ...cellCentro, color: '#93c5fd', fontWeight: 700 }}>{fMoeda(c.total)}</td>
                <td style={{ ...cellCentro, color: ehNC ? '#f472b6' : 'var(--text-dim)', fontWeight: ehNC ? 700 : 400 }}>{ehNC ? fMoeda(c.notaCredito) : '—'}</td>
                <td style={{ ...cellCentro, color: '#4ade80' }}>{fMoeda(c.pago)}</td>
                <td style={{ ...cellCentro, color: '#fb923c' }}>{fMoeda(c.pend)}</td>
                <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: c.aberto ? '#7c2d12' : '#14532d', color: c.aberto ? '#fdba74' : '#86efac' }}>
                    {c.aberto ? 'EM ABERTO' : 'PAGO'}
                  </span>
                </td>
              </tr>,
              open && temParcelas && (
                <tr key={i + '-p'}>
                  <td colSpan={11} style={{ padding: 0, background: 'rgba(0,0,0,0.25)' }}>
                    <ParcelasConta parcelas={c.parcelas} />
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

// Detalhamento das parcelas de um título (devido / recebido / pendente por parcela)
function ParcelasConta({ parcelas }) {
  const lista = [...(parcelas || [])].sort((a, b) => String(a.parcela).localeCompare(String(b.parcela), 'pt-BR', { numeric: true }))
  const tD = lista.reduce((s, p) => s + (p.devido || 0), 0)
  const tR = lista.reduce((s, p) => s + (p.recebido || 0), 0)
  const tP = lista.reduce((s, p) => s + (p.pendente || 0), 0)
  const cel = { padding: '4px 8px', fontSize: 10.5, fontFamily: 'monospace', textAlign: 'center', whiteSpace: 'nowrap' }
  const head = { ...cel, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7b8496' }
  return (
    <div style={{ padding: '6px 8px 8px 40px' }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#f5c518', marginBottom: 4 }}>
        ↳ Parcelas ({lista.length})
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th style={{ ...head, textAlign: 'left', paddingLeft: 8 }}>Parcela</th>
            <th style={head}>Vencimento</th>
            <th style={head}>Data de Pagamento</th>
            <th style={head}>R$ Devido</th>
            <th style={head}>R$ Recebido</th>
            <th style={head}>R$ Pendente</th>
            <th style={head}>Situação</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((p, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ ...cel, textAlign: 'left', paddingLeft: 8, color: 'var(--accent-title, var(--accent))', fontWeight: 700 }}>{p.parcela || '—'}</td>
              <td style={{ ...cel, color: p.aberto ? '#f87171' : 'var(--text-muted)' }}>{p.vencimento || '—'}</td>
              <td style={{ ...cel, color: p.pagamento ? '#4ade80' : 'var(--text-dim)' }}>{p.pagamento || '—'}</td>
              <td style={{ ...cel, color: '#93c5fd', fontWeight: 700 }}>{fMoeda(p.devido)}</td>
              <td style={{ ...cel, color: '#4ade80' }}>{fMoeda(p.recebido)}</td>
              <td style={{ ...cel, color: '#fb923c' }}>{fMoeda(p.pendente)}</td>
              <td style={{ ...cel }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: p.aberto ? '#7c2d12' : '#14532d', color: p.aberto ? '#fdba74' : '#86efac' }}>
                  {p.aberto ? 'EM ABERTO' : 'PAGO'}
                </span>
              </td>
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid var(--border2)' }}>
            <td style={{ ...cel, textAlign: 'left', paddingLeft: 8, fontWeight: 800, color: 'var(--text)' }}>TOTAL</td>
            <td style={cel}></td>
            <td style={cel}></td>
            <td style={{ ...cel, color: '#93c5fd', fontWeight: 800 }}>{fMoeda(tD)}</td>
            <td style={{ ...cel, color: '#4ade80', fontWeight: 800 }}>{fMoeda(tR)}</td>
            <td style={{ ...cel, color: '#fb923c', fontWeight: 800 }}>{fMoeda(tP)}</td>
            <td style={cel}></td>
          </tr>
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
