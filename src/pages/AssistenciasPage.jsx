import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'
import KPICard from '../components/KPICard'
import ExportAssistencias from '../components/ExportAssistencias'

const fBRL2 = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

// "30/04/2026" → "30 abr 2026" (data por extenso)
const MESES_EXT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function fDataExt(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[1]} ${MESES_EXT[+m[2] - 1]} ${m[3]}` : (s || '')
}

// Data numérica dd/mm/aaaa (descarta hora, se houver)
function fDataNum(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[1]}/${m[2]}/${m[3]}` : (s || '')
}

// "dd/mm/yyyy…" → "yyyy-mm-dd" (para comparar com <input type=date>)
function toISO(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

const SEM_FORN = '(sem fornecedor)'  // rótulo p/ linhas sem fornecedor (filtro e agrupamento)
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
  const [operacaoF,   setOperacaoF]   = useState([])
  const [osClienteF,  setOsClienteF]  = useState('')
  const [osFornF,     setOsFornF]     = useState('')
  const [dataIni,     setDataIni]     = useState('')
  const [dataFim,     setDataFim]     = useState('')

  const q = useQuery({
    queryKey: ['assistencias-geral', status],
    queryFn: () => api.assistenciasGeral(status),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })

  const data  = q.data || {}
  const rows  = data.rows || []

  // Opções faceteadas: cada filtro lista só o que existe considerando os DEMAIS filtros
  // ativos (exclui o próprio). Busca, OS e datas sempre restringem (não são dropdowns).
  const opcoes = useMemo(() => {
    const term = busca.trim().toLowerCase()
    const osC  = osClienteF.trim().toLowerCase()
    const osF  = osFornF.trim().toLowerCase()
    const pTerm = r => !term || (
      (r.clienteNome || '').toLowerCase().includes(term) ||
      (r.cliente || '').toLowerCase().includes(term) ||
      (r.produto || '').toLowerCase().includes(term) ||
      (r.produtoCod || '').toLowerCase().includes(term) ||
      (r.fornecedor || '').toLowerCase().includes(term) ||
      (r.osCliente || '').toLowerCase().includes(term))
    const pOsC  = r => !osC || ((r.osCliente || '').toLowerCase().includes(osC) || (r.cliente || '').toLowerCase().includes(osC))
    const pOsF  = r => !osF || ((r.osFornecedor || '').toLowerCase().includes(osF) || (r.fornecedorCod || '').toLowerCase().includes(osF))
    const pData = r => {
      if (!dataIni && !dataFim) return true
      const iso = toISO(r.dataEntrada); if (!iso) return false
      if (dataIni && iso < dataIni) return false
      if (dataFim && iso > dataFim) return false
      return true
    }
    const pCli  = r => !clienteF.length    || clienteF.includes(r.clienteNome)
    const pForn = r => !fornecedorF.length || fornecedorF.includes(r.fornecedor || SEM_FORN)
    const pServ = r => !servicoF.length    || servicoF.includes(r.servicoDesc)
    const pStat = r => !statusF.length     || statusF.includes(r.statusOss)
    const pOp   = r => !operacaoF.length   || operacaoF.includes(r.operacao)

    // coleta valores distintos de `valOf(r)`, aplicando todos os predicados menos `excl`
    const collect = (excl, valOf) => {
      const set = new Set()
      for (const r of rows) {
        if (!pTerm(r) || !pOsC(r) || !pOsF(r) || !pData(r)) continue
        if (excl !== 'cli'  && !pCli(r))  continue
        if (excl !== 'forn' && !pForn(r)) continue
        if (excl !== 'serv' && !pServ(r)) continue
        if (excl !== 'stat' && !pStat(r)) continue
        if (excl !== 'op'   && !pOp(r))   continue
        const v = valOf(r); if (v) set.add(v)
      }
      return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }
    return {
      clientes:     collect('cli',  r => r.clienteNome),
      fornecedores: collect('forn', r => r.fornecedor || SEM_FORN),
      servicos:     collect('serv', r => r.servicoDesc),
      situacoes:    collect('stat', r => r.statusOss),
      operacoes:    collect('op',   r => r.operacao),
    }
  }, [rows, busca, osClienteF, osFornF, dataIni, dataFim, clienteF, fornecedorF, servicoF, statusF, operacaoF])

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
      if (fornecedorF.length && !fornecedorF.includes(r.fornecedor || SEM_FORN)) return false
      if (servicoF.length    && !servicoF.includes(r.servicoDesc))     return false
      if (statusF.length     && !statusF.includes(r.statusOss))        return false
      if (operacaoF.length   && !operacaoF.includes(r.operacao))       return false
      if (osC && !(
        (r.osCliente || '').toLowerCase().includes(osC) ||
        (r.cliente   || '').toLowerCase().includes(osC)
      )) return false
      if (osF && !(
        (r.osFornecedor  || '').toLowerCase().includes(osF) ||
        (r.fornecedorCod || '').toLowerCase().includes(osF)
      )) return false
      if (dataIni || dataFim) {
        const iso = toISO(r.dataEntrada)
        if (!iso) return false
        if (dataIni && iso < dataIni) return false
        if (dataFim && iso > dataFim) return false
      }
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
  }, [rows, busca, sortK, sortD, clienteF, fornecedorF, servicoF, statusF, operacaoF, osClienteF, osFornF, dataIni, dataFim])

  // Agrupa em 2 camadas: Fornecedor (topo) → Cliente → Produtos
  const grupos = useMemo(() => {
    const fMap = new Map()
    for (const r of filtradas) {
      const fKey = r.fornecedor || SEM_FORN
      if (!fMap.has(fKey)) {
        fMap.set(fKey, {
          key: fKey, fornecedor: fKey, nProdutos: 0,
          valorProduto: 0, valorServico: 0, oss: new Map(), clientesMap: new Map(),
        })
      }
      const fg = fMap.get(fKey)
      fg.nProdutos++
      fg.valorProduto += r.valorProduto || 0
      fg.valorServico += r.valorTotal || 0
      if (r.codigoAssistencia && !fg.oss.has(r.codigoAssistencia)) fg.oss.set(r.codigoAssistencia, r.diasEmAberto)

      const cKey = `${r.cliente}||${r.clienteNome}`
      if (!fg.clientesMap.has(cKey)) {
        fg.clientesMap.set(cKey, {
          key: `${fKey}>>${cKey}`, cliente: r.cliente, clienteNome: r.clienteNome,
          rows: [], valorProduto: 0, valorServico: 0, oss: new Map(),
        })
      }
      const cg = fg.clientesMap.get(cKey)
      cg.rows.push(r)
      cg.valorProduto += r.valorProduto || 0
      cg.valorServico += r.valorTotal || 0
      if (r.codigoAssistencia && !cg.oss.has(r.codigoAssistencia)) cg.oss.set(r.codigoAssistencia, r.diasEmAberto)
    }

    // SLA = média de dias em aberto das OSs (dedup por assistência)
    const sla = oss => {
      const dias = [...oss.values()].filter(d => d != null)
      return dias.length ? Math.round(dias.reduce((s, d) => s + d, 0) / dias.length) : null
    }
    const ordItem = (a, b) =>
      String(a.codigoAssistencia || '').localeCompare(String(b.codigoAssistencia || ''), 'pt-BR', { numeric: true }) ||
      String(a.item || '').localeCompare(String(b.item || ''), 'pt-BR', { numeric: true })

    const arr = [...fMap.values()]
    arr.forEach(fg => {
      fg.sla = sla(fg.oss)
      fg.clientes = [...fg.clientesMap.values()]
      fg.clientes.forEach(cg => { cg.sla = sla(cg.oss); cg.rows.sort(ordItem) })
      fg.clientes.sort((a, b) => (a.clienteNome || '').localeCompare(b.clienteNome || '', 'pt-BR'))
    })
    return arr.sort((a, b) => (a.fornecedor || '').localeCompare(b.fornecedor || '', 'pt-BR'))
  }, [filtradas])

  // Paginação por fornecedor (camada de topo)
  const totalPages = Math.max(1, Math.ceil(grupos.length / pageSize))
  const pageSafe   = Math.min(page, totalPages - 1)
  const inicio     = pageSafe * pageSize
  const visiveis   = grupos.slice(inicio, inicio + pageSize)

  // Controle de expansão — accordion: só um fornecedor e um cliente abertos por vez
  const [expFor, setExpFor] = useState(() => new Set())
  const [expCli, setExpCli] = useState(() => new Set())
  const toggleFor = key => {
    setExpFor(s => (s.has(key) ? new Set() : new Set([key])))
    setExpCli(new Set())  // ao trocar de fornecedor, recolhe os clientes
  }
  const toggleCli = key => setExpCli(s => (s.has(key) ? new Set() : new Set([key])))
  const algumAberto = expFor.size > 0 || expCli.size > 0
  function recolherTudo() { setExpFor(new Set()); setExpCli(new Set()) }

  // Volta para a 1ª página quando muda filtro, busca, ordenação ou tamanho de página
  useEffect(() => { setPage(0) },
    [busca, sortK, sortD, clienteF, fornecedorF, servicoF, statusF, operacaoF, osClienteF, osFornF, dataIni, dataFim, pageSize])

  // Cards recalculados a partir das linhas filtradas (dedup por OSS)
  const cards = useMemo(() => {
    const oss = new Map()  // cliente|osCliente -> { aberta, temForn, dias }
    const ossSemForn = new Set()  // OSs sem fornecedor (mesma definição do grupo "(sem fornecedor)")
    let totalSku = 0, valorAberto = 0, valorFechado = 0
    for (const r of filtradas) {
      totalSku++
      const key = `${r.cliente}|${r.osCliente}`
      if (!oss.has(key)) oss.set(key, { aberta: r.aberta, temForn: r.temForn, dias: r.diasEmAberto })
      if (!r.fornecedor) ossSemForn.add(r.codigoAssistencia || key)
      if (r.aberta) valorAberto += r.valorTotal || 0
      else          valorFechado += r.valorTotal || 0
    }
    let ossEncerradas = 0, slaSoma = 0, slaBase = 0
    for (const o of oss.values()) {
      if (!o.aberta) ossEncerradas++       // tem data de encerramento
      // SLA = média de dias em aberto de todas as OSS (aberta = até hoje; encerrada = até o retorno)
      if (o.dias != null) { slaSoma += o.dias; slaBase++ }
    }
    return {
      totalOss: oss.size, ossEncerradas, ossSemForn: ossSemForn.size, totalSku,
      slaMedio: slaBase ? Math.round(slaSoma / slaBase) : 0, slaBase,
      valorAberto, valorFechado, valorTotal: valorAberto + valorFechado,
    }
  }, [filtradas])

  function changeSort(k) {
    if (sortK === k) setSortD(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortK(k); setSortD('desc') }
  }
  function limparFiltros() {
    setClienteF([]); setFornecedorF([]); setServicoF([]); setStatusF([]); setOperacaoF([])
    setOsClienteF(''); setOsFornF(''); setBusca(''); setDataIni(''); setDataFim('')
  }
  const temFiltro = clienteF.length || fornecedorF.length || servicoF.length || statusF.length || operacaoF.length || osClienteF || osFornF || busca || dataIni || dataFim

  return (
    <div>
      <div className="page-body space-y-4">
        {/* Cards */}
        <div className="grid gap-3 titulos-dourados" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          <KPICard label="Total OS"         value={fNum(cards.totalOss)}        sub="todas as OSs"                    color="cyan"   icon="◎" />
          <KPICard label="OS Encerradas"    value={fNum(cards.ossEncerradas)}   sub="com data de encerramento"        color="green"  icon="✓" />
          <KPICard label="OS sem Fornecedor" value={fNum(cards.ossSemForn)}     sub="produto sem fornecedor no serviço" color="orange" icon="◷" />
          <KPICard label="Total SKU"        value={fNum(cards.totalSku)}        sub="itens de produto"                color="purple" icon="◈" />
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
            <Campo label="Situação da OS">
              <MultiCombo value={statusF} onChange={setStatusF} options={opcoes.situacoes} width={170} />
            </Campo>
            <Campo label="Operação (garantia)">
              <MultiCombo value={operacaoF} onChange={setOperacaoF} options={opcoes.operacoes} width={170} />
            </Campo>
            <Campo label="Data de Entrada">
              <div className="flex items-center gap-1.5">
                <input type="date" value={dataIni} onChange={e => setDataIni(e.target.value)} className="inp text-xs" style={{ width: 140 }} title="De" />
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>até</span>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="inp text-xs" style={{ width: 140 }} title="Até" />
              </div>
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
            {q.isFetching && (
              <span className="ml-auto self-end text-xs" style={{ color: 'var(--text-dim)' }}>atualizando…</span>
            )}
          </div>

          {q.isLoading && (
            <div className="state-box"><div className="spinner" /><p>Carregando assistências…</p></div>
          )}
          {q.isError && <div className="err-box">{q.error.message}</div>}

          {!q.isLoading && !q.isError && (
            <>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  {fNum(grupos.length)} {grupos.length === 1 ? 'fornecedor' : 'fornecedores'}
                  {' · '}{fNum(filtradas.length)} {filtradas.length === 1 ? 'SKU' : 'SKUs'}
                  {grupos.length > 0 && ` — fornecedores ${fNum(inicio + 1)}–${fNum(inicio + visiveis.length)}`}
                </p>
                <div className="flex items-center gap-3">
                  {algumAberto && (
                    <button onClick={recolherTudo} className="btn-ghost text-xs">▾ Recolher tudo</button>
                  )}
                  <ExportAssistencias rows={filtradas} />
                </div>
              </div>
              <Tabela grupos={visiveis} expFor={expFor} expCli={expCli} onToggleFor={toggleFor} onToggleCli={toggleCli} />

              <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                  <span>Fornecedores por página:</span>
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
      <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--accent-title, var(--accent))' }}>{label}</div>
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
  if (/abert/.test(v))                              return { bg: '#713f12', fg: '#fbbf24' }
  if (/fechad/.test(v))                             return { bg: '#14532d', fg: '#4ade80' }
  if (/cancel|resídu|resid|não ger|nao ger|devolvid/.test(v)) return { bg: '#450a0a', fg: '#f87171' }
  if (/entrada|cadastr/.test(v))                    return { bg: '#334155', fg: '#cbd5e1' }
  return { bg: 'var(--bg-input)', fg: 'var(--text-muted)' }
}

// Badge de status reutilizável (cor pela regra de statusColor)
function StatusBadge({ v }) {
  const sc = statusColor(v)
  return (
    <span className="badge cut" style={{ background: sc.bg, color: sc.fg, fontSize: 10.5, display: 'inline-block', maxWidth: '100%' }} title={v}>
      {v || '—'}
    </span>
  )
}

// Status do serviço: Entregue (verde) · Em dia (amarelo) · Atrasado (vermelho)
function StatusServicoBadge({ v }) {
  const map = {
    'Entregue':  { bg: '#14532d', fg: '#4ade80' },
    'Em dia':    { bg: '#713f12', fg: '#fbbf24' },
    'Atrasado':  { bg: '#450a0a', fg: '#f87171' },
  }
  const c = map[v] || { bg: 'var(--bg-input)', fg: 'var(--text-muted)' }
  return (
    <span className="badge" style={{ background: c.bg, color: c.fg, fontSize: 10.5, fontWeight: 700 }} title={v}>
      {v || '—'}
    </span>
  )
}

function diasColor(d) {
  if (d == null) return 'var(--text-dim)'
  if (d > 60) return '#f87171'
  if (d > 30) return '#fb923c'
  return 'var(--text)'
}

// Operação (garantia): destaca se o produto está em garantia ou fora dela
function garantiaColor(op) {
  const v = String(op || '').toLowerCase()
  if (/fora/.test(v))   return { bg: '#7f1d1d', fg: '#fca5a5' }  // Fora da Garantia
  if (/garant/.test(v)) return { bg: '#14532d', fg: '#4ade80' }  // Em Garantia
  return { bg: 'var(--bg-input)', fg: 'var(--text-muted)' }
}

// ─── Tabela: Fornecedor (topo) → Cliente → Produtos ────────────────────────────

function Tabela({ grupos, expFor, expCli, onToggleFor, onToggleCli }) {
  return (
    <div className="tbl-scroll" style={{ maxHeight: '68vh' }}>
      {grupos.length === 0 && (
        <div className="state-box text-sm">Nenhuma assistência encontrada</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {grupos.map(fg => {
          const aberto = expFor.has(fg.key)
          return (
            <div key={fg.key} style={{ border: '1px solid var(--border2)', borderRadius: 8, overflow: 'hidden' }}>
              {/* Cabeçalho do fornecedor (1ª camada) */}
              <button onClick={() => onToggleFor(fg.key)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 12px',
                         background: aberto ? 'var(--bg-hover)' : 'var(--bg-input)', border: 'none', cursor: 'pointer',
                         borderLeft: `3px solid ${FORN}`, textAlign: 'left' }}>
                <span style={{ color: FORN, fontSize: 13, transition: 'transform .15s',
                               transform: aberto ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>▶</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="cut" style={{ color: FORN, fontWeight: 800, fontSize: 13.5 }} title={fg.fornecedor}>
                    {fg.fornecedor}
                  </div>
                  <div style={{ color: FORN, opacity: 0.7, fontSize: 10.5, fontFamily: 'monospace', fontWeight: 600 }}>
                    {fNum(fg.clientes.length)} {fg.clientes.length === 1 ? 'cliente' : 'clientes'}
                    {' · '}{fNum(fg.oss.size)} {fg.oss.size === 1 ? 'OS' : 'OSs'}
                  </div>
                </div>
                <ResumoHeader sla={fg.sla} nProdutos={fg.nProdutos} valorServico={fg.valorServico} />
              </button>

              {/* Clientes do fornecedor (2ª camada) */}
              {aberto && (
                <div style={{ padding: '6px 8px 8px', display: 'flex', flexDirection: 'column', gap: 5,
                              background: 'var(--bg-card)' }}>
                  {fg.clientes.map(cg => (
                    <ClienteGrupo key={cg.key} cg={cg} aberto={expCli.has(cg.key)} onToggle={() => onToggleCli(cg.key)} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Resumo reutilizável do cabeçalho: SLA · qtd de produtos · total de serviços
function ResumoHeader({ sla, nProdutos, valorServico }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexShrink: 0 }}>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.03em' }}>SLA</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: diasColor(sla), fontFamily: 'monospace' }}>
          {sla != null ? `${fNum(sla)} d` : '—'}
        </div>
      </div>
      <span className="badge" style={{ background: 'var(--bg-card)', color: UNID, fontSize: 11, fontWeight: 700 }}>
        {fNum(nProdutos)} {nProdutos === 1 ? 'SKU' : 'SKUs'}
      </span>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '.03em' }}>Total Serviços</div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#a3e635', fontFamily: 'monospace' }}>{fBRL2(valorServico)}</div>
      </div>
    </div>
  )
}

// Cliente (2ª camada): setinha expande → tabela de produtos
function ClienteGrupo({ cg, aberto, onToggle }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <button onClick={onToggle}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                 background: aberto ? 'var(--bg-hover)' : 'var(--bg-input)', border: 'none', cursor: 'pointer',
                 borderLeft: `3px solid ${CLI}`, textAlign: 'left' }}>
        <span style={{ color: CLI, fontSize: 12, transition: 'transform .15s',
                       transform: aberto ? 'rotate(90deg)' : 'none', flexShrink: 0 }}>▶</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="cut" style={{ color: CLI, fontWeight: 700, fontSize: 12.5 }} title={cg.clienteNome}>
            {cg.clienteNome || '(sem nome)'}
          </div>
          <div style={{ color: CLI, opacity: 0.7, fontSize: 10, fontFamily: 'monospace', fontWeight: 600 }}>
            #{cg.cliente} · {fNum(cg.oss.size)} {cg.oss.size === 1 ? 'OS' : 'OSs'}
          </div>
        </div>
        <ResumoHeader sla={cg.sla} nProdutos={cg.rows.length} valorServico={cg.valorServico} />
      </button>
      {aberto && <ProdutosTabela rows={cg.rows} />}
    </div>
  )
}

// Tabela de produtos (3ª camada)
function ProdutosTabela({ rows }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="tbl tbl-compact" style={{ width: '100%', minWidth: 1500 }}>
        <colgroup>
          <col style={{ width: '3%'  }} />{/* Item */}
          <col style={{ width: '5%'  }} />{/* Cod. Assistencia */}
          <col style={{ width: '13%' }} />{/* SKU */}
          <col style={{ width: '9%'  }} />{/* Servico */}
          <col style={{ width: '3%'  }} />{/* Qtd */}
          <col style={{ width: '6%'  }} />{/* Valor Produto */}
          <col style={{ width: '4%'  }} />{/* Peso */}
          <col style={{ width: '6%'  }} />{/* Valor Servico */}
          <col style={{ width: '6%'  }} />{/* Total Servico */}
          <col style={{ width: '7%'  }} />{/* Data Entrada */}
          <col style={{ width: '7%'  }} />{/* Data Encerrada */}
          <col style={{ width: '7%'  }} />{/* Prev. Entrega */}
          <col style={{ width: '5%'  }} />{/* Dias Aberto */}
          <col style={{ width: '6%'  }} />{/* Situação OS */}
          <col style={{ width: '6%'  }} />{/* Situação (produto) */}
          <col style={{ width: '7%'  }} />{/* Status do Serviço */}
        </colgroup>
        <thead>
          <tr>
            <SubTH label="Item" align="center" />
            <SubTH label="Cód. Assist." align="center" />
            <SubTH label="SKU" />
            <SubTH label="Serviço" />
            <SubTH label="Qtd" align="center" />
            <SubTH label="Valor Produto" align="right" />
            <SubTH label="Peso" align="right" />
            <SubTH label="Valor Serviço" align="right" />
            <SubTH label="Total Serviço" align="right" />
            <SubTH label="Dt Entrada" align="center" />
            <SubTH label="Dt Encerrada" align="center" />
            <SubTH label="Prev. Entrega" align="center" />
            <SubTH label="Dias Ab" align="center" />
            <SubTH label="Situação OS" align="center" />
            <SubTH label="Situação" align="center" />
            <SubTH label="Status do Serviço" align="center" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            return (
              <tr key={i}>
                <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {r.item || '-'}
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text)', fontWeight: 700 }}>
                  {r.codigoAssistencia || '-'}
                </td>
                <td style={{ borderLeft: `3px solid ${PROD}` }}>
                  <div className="cut" style={{ color: 'var(--text)', fontWeight: 700, fontSize: 12 }} title={r.produto}>
                    {r.produto || '-'}
                  </div>
                  <div className="cut" style={{ fontSize: 10.5, fontFamily: 'monospace' }}>
                    <span style={{ color: PROD, fontWeight: 700 }}>{r.produtoCod}</span>
                  </div>
                </td>
                <td>
                  <div className="cut" style={{ color: 'var(--text-muted)', fontSize: 12 }} title={r.servicoDesc}>
                    {r.servicoDesc || '-'}
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: 11.5, color: UNID }}>
                  {fNum(r.quantidade)}
                </td>
                <td style={{ textAlign: 'right', color: '#38bdf8', fontFamily: 'monospace', fontSize: 11.5 }}>
                  {r.valorProduto > 0 ? fBRL2(r.valorProduto) : '-'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: 11.5 }}>
                  {r.peso > 0 ? `${fNum(r.peso, 2)} g` : '-'}
                </td>
                <td style={{ textAlign: 'right', color: '#fb923c', fontFamily: 'monospace', fontSize: 11.5 }}>
                  {r.valor > 0 ? fBRL2(r.valor) : '-'}
                </td>
                <td style={{ textAlign: 'right', color: '#a3e635', fontWeight: 800, fontFamily: 'monospace', fontSize: 11.5 }}>
                  {r.valorTotal > 0 ? fBRL2(r.valorTotal) : '-'}
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11.5 }}>
                  {r.dataEntrada ? fDataNum(r.dataEntrada) : '-'}
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11.5, color: r.dataEncerramento ? '#4ade80' : 'var(--text-dim)' }}>
                  {r.dataEncerramento ? fDataNum(r.dataEncerramento) : '—'}
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 11.5, color: '#f5c518' }}>
                  {r.prevEntrega ? fDataExt(r.prevEntrega) : '—'}
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: 11.5,
                             color: r.dataEncerramento ? 'var(--text-muted)' : diasColor(r.diasEmAberto) }}>
                  {r.diasEmAberto != null ? `${fNum(r.diasEmAberto)} d` : '—'}
                </td>
                <td style={{ textAlign: 'center' }}><StatusBadge v={r.statusOss} /></td>
                <td style={{ textAlign: 'center' }}><StatusBadge v={r.situacao} /></td>
                <td style={{ textAlign: 'center' }}><StatusServicoBadge v={r.statusServico} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SubTH({ label, align = 'left' }) {
  return (
    <th style={{ textAlign: align, whiteSpace: 'nowrap', padding: '7px 6px', fontSize: 10, fontWeight: 700,
                 textTransform: 'uppercase', letterSpacing: '0.03em', position: 'sticky', top: 0,
                 background: 'var(--bg-card)', zIndex: 5, color: 'var(--accent)' }}>
      {label}
    </th>
  )
}
