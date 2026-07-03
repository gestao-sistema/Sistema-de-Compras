import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'
import KPICard from '../components/KPICard'

const fBRL2 = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

const UNID = '#f5c518'  // quantidade (amarelo)
// Identidade de cor por coluna
const PROD = '#38bdf8'  // Produto  → azul
const CLI  = '#c084fc'  // Cliente  → roxo
const FORN = '#22d3ee'  // Fornecedor → ciano


export default function AssistenciasPage() {
  const status = 'todas'
  const [busca,  setBusca]  = useState('')
  const [sortK,  setSortK]  = useState('diasEmAberto')
  const [sortD,  setSortD]  = useState('desc')
  const [pageSize, setPageSize] = useState(50)
  const [page,     setPage]     = useState(0)

  const [clienteF,    setClienteF]    = useState([])
  const [fornecedorF, setFornecedorF] = useState([])
  const [servicoF,    setServicoF]    = useState([])
  const [statusF,     setStatusF]     = useState([])
  const [osClienteF,  setOsClienteF]  = useState('')
  const [osFornF,     setOsFornF]     = useState('')

  const q = useQuery({
    queryKey: ['assistencias-geral', status],
    queryFn: () => api.assistenciasGeral(status),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })

  const data  = q.data || {}
  const rows  = data.rows || []

  const opcoes = useMemo(() => {
    const cli = new Set(), forn = new Set(), serv = new Set(), st = new Set()
    rows.forEach(r => {
      if (r.clienteNome)   cli.add(r.clienteNome)
      if (r.fornecedor)    forn.add(r.fornecedor)
      if (r.servicoDesc)   serv.add(r.servicoDesc)
      if (r.statusProduto) st.add(r.statusProduto)
    })
    const ord = arr => [...arr].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return { clientes: ord(cli), fornecedores: ord(forn), servicos: ord(serv), statuses: ord(st) }
  }, [rows])

  const filtradas = useMemo(() => {
    const term = busca.trim().toLowerCase()
    const osC  = osClienteF.trim().toLowerCase()
    const osF  = osFornF.trim().toLowerCase()

    const out = rows.filter(r => {
      if (term && !(
        (r.clienteNome || '').toLowerCase().includes(term) ||
        (r.cliente || '').toLowerCase().includes(term) ||
        (r.produto || '').toLowerCase().includes(term) ||
        (r.produtoCod || '').toLowerCase().includes(term) ||
        (r.fornecedor || '').toLowerCase().includes(term) ||
        (r.osCliente || '').toLowerCase().includes(term)
      )) return false
      if (clienteF.length    && !clienteF.includes(r.clienteNome))     return false
      if (fornecedorF.length && !fornecedorF.includes(r.fornecedor))   return false
      if (servicoF.length    && !servicoF.includes(r.servicoDesc))     return false
      if (statusF.length     && !statusF.includes(r.statusProduto))    return false
      if (osC && !(
        (r.osCliente || '').toLowerCase().includes(osC) ||
        (r.cliente   || '').toLowerCase().includes(osC)
      )) return false
      if (osF && !(
        (r.osFornecedor  || '').toLowerCase().includes(osF) ||
        (r.fornecedorCod || '').toLowerCase().includes(osF)
      )) return false
      return true
    })

    const sorted = [...out].sort((a, b) => {
      const va = a[sortK], vb = b[sortK]
      const na = Number(va), nb = Number(vb)
      const bothNum = va != null && vb != null && !isNaN(na) && !isNaN(nb) && typeof va !== 'string'
      let cmp
      if (bothNum) cmp = na - nb
      else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true })
      return sortD === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [rows, busca, sortK, sortD, clienteF, fornecedorF, servicoF, statusF, osClienteF, osFornF])

  // Ordenação já roda sobre TODAS as linhas filtradas (acima); aqui só fatiamos a página
  const totalPages = Math.max(1, Math.ceil(filtradas.length / pageSize))
  const pageSafe   = Math.min(page, totalPages - 1)
  const inicio     = pageSafe * pageSize
  const visiveis   = filtradas.slice(inicio, inicio + pageSize)

  // Volta para a 1ª página quando muda filtro, busca, ordenação ou tamanho de página
  useEffect(() => { setPage(0) },
    [busca, sortK, sortD, clienteF, fornecedorF, servicoF, statusF, osClienteF, osFornF, pageSize])

  // Cards recalculados a partir das linhas filtradas (dedup por OSS)
  const cards = useMemo(() => {
    const oss = new Map()  // cliente|osCliente -> { aberta, temForn, dias }
    let totalSku = 0, valorAberto = 0, valorFechado = 0
    for (const r of filtradas) {
      totalSku++
      const key = `${r.cliente}|${r.osCliente}`
      if (!oss.has(key)) oss.set(key, { aberta: r.aberta, temForn: r.temForn, dias: r.diasEmAberto })
      if (r.aberta) valorAberto += r.valorTotal || 0
      else          valorFechado += r.valorTotal || 0
    }
    let ossEncerradas = 0, ossSolicitada = 0, ossFornecedores = 0, slaSoma = 0, slaBase = 0
    for (const o of oss.values()) {
      if (!o.aberta)          ossEncerradas++       // tem data de encerramento
      else if (!o.temForn)    ossSolicitada++       // aberta e sem OSS de fornecedor
      else                    ossFornecedores++     // aberta, com fornecedor, sem retorno
      // SLA = média de dias em aberto de todas as OSS (aberta = até hoje; encerrada = até o retorno)
      if (o.dias != null) { slaSoma += o.dias; slaBase++ }
    }
    return {
      ossEncerradas, ossSolicitada, ossFornecedores, totalSku,
      slaMedio: slaBase ? Math.round(slaSoma / slaBase) : 0, slaBase,
      valorAberto, valorFechado, valorTotal: valorAberto + valorFechado,
    }
  }, [filtradas])

  function changeSort(k) {
    if (sortK === k) setSortD(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortK(k); setSortD('desc') }
  }
  function limparFiltros() {
    setClienteF([]); setFornecedorF([]); setServicoF([]); setStatusF([])
    setOsClienteF(''); setOsFornF(''); setBusca('')
  }
  const temFiltro = clienteF.length || fornecedorF.length || servicoF.length || statusF.length || osClienteF || osFornF || busca

  return (
    <div>
      <div className="page-body space-y-4">
        {/* Cards */}
        <div className="grid gap-3 titulos-dourados" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          <KPICard label="OS Encerradas"    value={fNum(cards.ossEncerradas)}   sub="com data de encerramento"        color="green"  icon="✓" />
          <KPICard label="OS Solicitada"    value={fNum(cards.ossSolicitada)}   sub="sem OS de fornecedor"            color="orange" icon="◷" />
          <KPICard label="OS Fornecedores"  value={fNum(cards.ossFornecedores)} sub="com fornecedor, sem retorno"     color="purple" icon="◭" />
          <KPICard label="Total SKU"        value={fNum(cards.totalSku)}        sub="itens de produto"                color="cyan"   icon="◈" />
          <KPICard label="SLA"              value={`${fNum(cards.slaMedio)} d`}  sub="média de dias em aberto"         color="yellow" icon="⏱" />
          <CardValores cards={cards} />
        </div>

        {/* Tabela */}
        <div className="card">
          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-3 mb-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <Campo label="Cliente">
              <MultiCombo value={clienteF} onChange={setClienteF} options={opcoes.clientes} width={230} />
            </Campo>
            <Campo label="Fornecedor">
              <MultiCombo value={fornecedorF} onChange={setFornecedorF} options={opcoes.fornecedores} width={200} />
            </Campo>
            <Campo label="Serviço">
              <MultiCombo value={servicoF} onChange={setServicoF} options={opcoes.servicos} width={220} />
            </Campo>
            <Campo label="Status">
              <MultiCombo value={statusF} onChange={setStatusF} options={opcoes.statuses} width={150} />
            </Campo>
            <Campo label="OS / Cód. Cliente">
              <input value={osClienteF} onChange={e => setOsClienteF(e.target.value)} placeholder="nº OS ou código" className="inp text-xs" style={{ width: 150 }} />
            </Campo>
            <Campo label="OS / Cód. Fornecedor">
              <input value={osFornF} onChange={e => setOsFornF(e.target.value)} placeholder="nº OS ou código" className="inp text-xs" style={{ width: 160 }} />
            </Campo>
            {temFiltro && (
              <button onClick={limparFiltros} className="btn-ghost text-xs self-end">✕ Limpar filtros</button>
            )}
            <div className="ml-auto flex items-center gap-3 self-end">
              {q.isFetching && <span className="text-xs" style={{ color: 'var(--text-dim)' }}>atualizando…</span>}
              <input value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Cliente, produto, fornecedor…" className="inp w-64 text-xs" />
            </div>
          </div>

          {q.isLoading && (
            <div className="state-box"><div className="spinner" /><p>Carregando assistências…</p></div>
          )}
          {q.isError && <div className="err-box">{q.error.message}</div>}

          {!q.isLoading && !q.isError && (
            <>
              <p className="text-xs mb-2" style={{ color: 'var(--text-dim)' }}>
                {fNum(filtradas.length)} {filtradas.length === 1 ? 'linha' : 'linhas'}
                {filtradas.length > 0 && ` — ${fNum(inicio + 1)}–${fNum(inicio + visiveis.length)}`}
              </p>
              <Tabela rows={visiveis} sortK={sortK} sortD={sortD} onSort={changeSort} statusFiltro={status} />

              <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                  <span>Por página:</span>
                  {[50, 100, 1000].map(n => (
                    <button key={n} onClick={() => setPageSize(n)}
                      className="px-2.5 py-0.5 rounded font-semibold transition-all"
                      style={pageSize === n
                        ? { background: 'var(--accent)', color: 'var(--accent-text)' }
                        : { background: 'var(--bg-input)', color: 'var(--text-nav)', border: '1px solid var(--border2)' }}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(Math.max(0, pageSafe - 1))} disabled={pageSafe === 0}
                    className="px-3 py-1 rounded text-xs font-semibold"
                    style={{ background: 'var(--bg-input)', color: pageSafe === 0 ? 'var(--text-dim)' : 'var(--text)', border: '1px solid var(--border2)' }}>
                    ← Anterior
                  </button>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{pageSafe + 1} / {fNum(totalPages)}</span>
                  <button onClick={() => setPage(Math.min(totalPages - 1, pageSafe + 1))} disabled={pageSafe >= totalPages - 1}
                    className="px-3 py-1 rounded text-xs font-semibold"
                    style={{ background: 'var(--bg-input)', color: pageSafe >= totalPages - 1 ? 'var(--text-dim)' : 'var(--text)', border: '1px solid var(--border2)' }}>
                    Próximo →
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Combobox pesquisável ───────────────────────────────────────────────────────

// Multi-seleção com busca e checkbox (value é array)
function MultiCombo({ value = [], onChange, options, placeholder = 'Todos', width = 220 }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const term = query.trim().toLowerCase()
  const filtered = term ? options.filter(o => o.toLowerCase().includes(term)) : options
  const shown = filtered.slice(0, 200)
  const sel = new Set(value)

  function toggle(o) {
    if (sel.has(o)) onChange(value.filter(x => x !== o))
    else onChange([...value, o])
  }

  const resumo = value.length === 0 ? '' : value.length === 1 ? value[0] : `${value.length} selecionados`

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
                      maxHeight: 260, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
          {value.length > 0 && (
            <div onMouseDown={e => { e.preventDefault(); onChange([]) }}
              style={{ padding: '6px 10px', fontSize: 11, cursor: 'pointer', color: '#f87171',
                       borderBottom: '1px solid var(--border)' }}>
              ✕ Limpar seleção ({value.length})
            </div>
          )}
          {shown.map(o => {
            const checked = sel.has(o)
            return (
              <div key={o} onMouseDown={e => { e.preventDefault(); toggle(o) }} title={o}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 10px', fontSize: 12,
                         cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden',
                         background: checked ? 'var(--bg-hover)' : 'transparent',
                         color: checked ? 'var(--text)' : 'var(--text-nav)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.background = checked ? 'var(--bg-hover)' : 'transparent' }}>
                <input type="checkbox" checked={checked} readOnly tabIndex={-1}
                  style={{ accentColor: 'var(--accent)', pointerEvents: 'none', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o}</span>
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

// ─── Campo de filtro (label + controle) ────────────────────────────────────────

function Campo({ label, children }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--accent)' }}>{label}</div>
      {children}
    </div>
  )
}

// ─── Card de valores (3 métricas em um) ─────────────────────────────────────────

function CardValores({ cards }) {
  return (
    <div className="card flex flex-col justify-between" style={{ minHeight: 100 }}>
      <span className="kpi-label">Valor dos Serviços</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
        <Linha label="Em aberto" value={cards.valorAberto}  color="#fb923c" />
        <Linha label="Fechadas"  value={cards.valorFechado} color="#4ade80" />
        <Linha label="Total"     value={cards.valorTotal}   color="var(--text)" bold />
      </div>
    </div>
  )
}
function Linha({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? 800 : 700, color }}>{fBRL(value)}</span>
    </div>
  )
}

// ─── Tabela ──────────────────────────────────────────────────────────────────

function statusColor(s) {
  const v = String(s || '').toLowerCase()
  if (/efetivad|recebid|retornad|conclu/.test(v)) return { bg: '#14532d', fg: '#4ade80' }
  if (/aprovad/.test(v))                            return { bg: '#0c4a6e', fg: '#38bdf8' }
  if (/envi|aprova.?.?o|pendent/.test(v))           return { bg: '#713f12', fg: '#fbbf24' }
  if (/entrada|cadastr/.test(v))                    return { bg: '#334155', fg: '#cbd5e1' }
  return { bg: 'var(--bg-input)', fg: 'var(--text-muted)' }
}

function diasColor(d) {
  if (d == null) return 'var(--text-dim)'
  if (d > 60) return '#f87171'
  if (d > 30) return '#fb923c'
  return 'var(--text)'
}

function TH({ k, label, align = 'left', sortK, sortD, onSort }) {
  const active = sortK === k
  return (
    <th onClick={() => onSort(k)} title={label}
      style={{ textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', overflow: 'hidden',
               textOverflow: 'ellipsis', padding: '8px 6px', fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
               letterSpacing: '0.03em', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10 }}>
      <span style={{ color: 'var(--accent)', fontWeight: active ? 800 : 600 }}>{label}{active ? (sortD === 'asc' ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )
}

function Tabela({ rows, sortK, sortD, onSort, statusFiltro }) {
  const mostrarEncerramento = statusFiltro !== 'abertas'
  const nCols = mostrarEncerramento ? 13 : 11
  const thp = { sortK, sortD, onSort }

  return (
    <div className="tbl-scroll" style={{ maxHeight: '62vh', overflowX: 'hidden' }}>
      <table className="tbl tbl-compact" style={{ width: '100%' }}>
        <colgroup>
          <col style={{ width: '12%' }} />{/* Produto */}
          <col style={{ width: '11%' }} />{/* Cliente */}
          <col style={{ width: '10%' }} />{/* Fornecedor */}
          <col style={{ width: '11%' }} />{/* Serviço */}
          <col style={{ width: '7%'  }} />{/* Status */}
          <col style={{ width: '6%'  }} />{/* Entrada */}
          <col style={{ width: '6%'  }} />{/* Dias em aberto */}
          <col style={{ width: '6%'  }} />{/* Encerrada em */}
          <col style={{ width: '5%'  }} />{/* Durou */}
          <col style={{ width: '6%'  }} />{/* R$ Unit */}
          <col style={{ width: '5%'  }} />{/* Peso */}
          <col style={{ width: '7%'  }} />{/* R$ Serviço */}
          <col style={{ width: '8%'  }} />{/* R$ Total */}
        </colgroup>
        <thead>
          <tr>
            <TH k="produto"       label="SKU" {...thp} />
            <TH k="clienteNome"   label="Cliente" {...thp} />
            <TH k="fornecedor"    label="Fornecedor" {...thp} />
            <TH k="servicoDesc"   label="Serviço" {...thp} />
            <TH k="statusProduto" label="Status" {...thp} />
            <TH k="dataEntrada"   label="Entrada" align="center" {...thp} />
            <TH k="diasEmAberto"  label="Dias aberto" align="center" {...thp} />
            {mostrarEncerramento && <TH k="dataEncerramento" label="Encerrada" align="center" {...thp} />}
            {mostrarEncerramento && <TH k="diasDuracao"      label="Durou" align="center" {...thp} />}
            <TH k="valorUnit"     label="R$ Unit." align="right" {...thp} />
            <TH k="peso"          label="Peso (g)" align="right" {...thp} />
            <TH k="valor"         label="R$ Serviço" align="right" {...thp} />
            <TH k="valorTotal"    label="R$ Total" align="right" {...thp} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={nCols}><div className="state-box text-sm">Nenhuma OS encontrada</div></td></tr>
          )}
          {rows.map((r, i) => {
            const sc = statusColor(r.statusProduto)
            return (
              <tr key={i}>
                {/* PRODUTO */}
                <td style={{ borderLeft: `3px solid ${PROD}` }}>
                  <div className="cut" style={{ color: 'var(--text)', fontWeight: 700, fontSize: 12 }} title={r.produto}>
                    {r.produto || '-'}
                  </div>
                  <div className="cut" style={{ fontSize: 10.5, fontFamily: 'monospace' }}>
                    <span style={{ color: PROD, fontWeight: 700 }}>{r.produtoCod}</span>
                    {r.quantidade > 1 && <span style={{ color: UNID, fontWeight: 700 }}> · {fNum(r.quantidade)} un</span>}
                  </div>
                </td>
                {/* CLIENTE */}
                <td style={{ borderLeft: `3px solid ${CLI}` }}>
                  <div className="cut" style={{ color: CLI, fontWeight: 700, fontSize: 12 }} title={r.clienteNome}>{r.clienteNome || '-'}</div>
                  <div className="cut" style={{ color: CLI, opacity: 0.75, fontSize: 10.5, fontFamily: 'monospace', fontWeight: 600 }}>
                    #{r.cliente} · OS {r.osCliente}
                  </div>
                </td>
                {/* FORNECEDOR */}
                <td style={{ borderLeft: `3px solid ${FORN}` }}>
                  <div className="cut" style={{ color: FORN, fontWeight: 700, fontSize: 12 }} title={r.fornecedor}>
                    {r.fornecedor || '-'}
                  </div>
                  {r.osFornecedor && (
                    <div className="cut" style={{ color: FORN, opacity: 0.75, fontSize: 10.5, fontFamily: 'monospace', fontWeight: 600 }}>OS forn. {r.osFornecedor}</div>
                  )}
                </td>
                <td>
                  <div className="cut" style={{ color: 'var(--text-muted)', fontSize: 12 }} title={r.servicoDesc}>
                    {r.servicoDesc || '-'}
                  </div>
                </td>
                <td>
                  <span className="badge cut" style={{ background: sc.bg, color: sc.fg, fontSize: 10.5, display: 'inline-block', maxWidth: '100%' }} title={r.statusProduto}>
                    {r.statusProduto || '-'}
                  </span>
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11.5 }}>{r.dataEntrada || '-'}</td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: 11.5,
                             color: r.dataEncerramento ? 'var(--text-muted)' : diasColor(r.diasEmAberto) }}>
                  {r.diasEmAberto != null ? `${fNum(r.diasEmAberto)} d` : '—'}
                </td>
                {mostrarEncerramento && (
                  <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11.5, color: r.dataEncerramento ? '#4ade80' : 'var(--text-dim)' }}>
                    {r.dataEncerramento || '—'}
                  </td>
                )}
                {mostrarEncerramento && (
                  <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {r.diasDuracao != null ? `${fNum(r.diasDuracao)} d` : '—'}
                  </td>
                )}
                <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11.5 }}>
                  {r.valorUnit > 0 ? fBRL2(r.valorUnit) : '-'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11.5 }}>
                  {r.peso > 0 ? `${fNum(r.peso, 2)} g` : '-'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11.5 }}>
                  {r.valor > 0 ? fBRL2(r.valor) : '-'}
                </td>
                <td style={{ textAlign: 'right', color: '#a3e635', fontWeight: 700, fontFamily: 'monospace', fontSize: 11.5 }}>
                  {r.valorTotal > 0 ? fBRL2(r.valorTotal) : '-'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
