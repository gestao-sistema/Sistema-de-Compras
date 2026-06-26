import { useState, useEffect, useRef } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'
import { BadgeDDE } from '../components/Badge'
import FilialSelector from '../components/FilialSelector'

const PAGE_LIMIT = 100
const TAB_LABEL  = { grupo: 'Grupo', pedra: 'Tipo de Pedra', tag2: 'TAG 2' }

export default function Dashboard() {
  const [tab,         setTab]         = useState('grupo')
  const [search,      setSearch]      = useState('')
  const [dbSearch,    setDbSearch]    = useState('')
  const [tipoFilter,    setTipoFilter]    = useState('todos')
  const [rupturaFilter, setRupturaFilter] = useState('')
  const [grupoFilter, setGrupoFilter] = useState('')
  const [pedraFilter, setPedraFilter] = useState('')
  const [tag2Filter,  setTag2Filter]  = useState('')
  const [catFilter,    setCatFilter]    = useState('')
  const [estoqueFilter,setEstoqueFilter]= useState('')
  const [filialFilter, setFilialFilter] = useState('')
  const [codigoFilter, setCodigoFilter] = useState('')
  const [dbCodigo,    setDbCodigo]    = useState('')
  const [page,        setPage]        = useState(0)
  const [sortK,       setSortK]       = useState('_valorEst')
  const [sortD,       setSortD]       = useState('desc')

  useEffect(() => {
    const t = setTimeout(() => { setDbSearch(search);  setPage(0) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    const t = setTimeout(() => { setDbCodigo(codigoFilter); setPage(0) }, 400)
    return () => clearTimeout(t)
  }, [codigoFilter])

  function changeTab(t)  { setTab(t); setPage(0) }
  function changeTipo(t) { setTipoFilter(t); setPage(0) }
  function changeRuptura(v) { setRupturaFilter(v); setPage(0) }
  function changeSort(k) {
    if (sortK === k) setSortD(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortK(k); setSortD('desc') }
    setPage(0)
  }
  function resetFilters() {
    setGrupoFilter(''); setPedraFilter(''); setTag2Filter(''); setCatFilter('')
    setEstoqueFilter(''); setFilialFilter(''); setCodigoFilter(''); setSearch(''); setTipoFilter('todos'); setRupturaFilter(''); setPage(0)
  }

  const kpi = useQuery({
    queryKey:        ['dashboard', dbSearch, dbCodigo, tipoFilter, rupturaFilter, grupoFilter, pedraFilter, tag2Filter, estoqueFilter, filialFilter],
    queryFn:         () => api.dashboard({ search: dbSearch, codigo: dbCodigo, tipo: tipoFilter, ruptura: rupturaFilter || undefined, grupo: grupoFilter, pedra: pedraFilter, tag2: tag2Filter, estoque: estoqueFilter || undefined, filial: filialFilter || undefined }),
    refetchInterval: d => d?.loading === false ? false : 3000,
    staleTime:       30000,
    placeholderData: keepPreviousData,
  })

  const d      = kpi.data || {}
  const loaded = d.loading === false

  const optionsQ = useQuery({
    queryKey:        ['produtos-options'],
    queryFn:         api.produtosOptions,
    enabled:         loaded,
    staleTime:       Infinity,
  })
  const opts = optionsQ.data || { grupos: [], pedras: [], tag2s: [], categorias: [] }

  const groupQ = useQuery({
    queryKey:        ['produtos-group', tab, dbSearch, dbCodigo, tipoFilter, rupturaFilter, grupoFilter, pedraFilter, tag2Filter, catFilter, estoqueFilter, filialFilter],
    queryFn:         () => api.produtos({ view: tab, search: dbSearch, codigo: dbCodigo, tipo: tipoFilter, ruptura: rupturaFilter || undefined, grupo: grupoFilter, pedra: pedraFilter, tag2: tag2Filter, categoria: catFilter, estoque: estoqueFilter || undefined, filial: filialFilter || undefined }),
    enabled:         loaded && tab !== 'produto',
    staleTime:       30000,
    placeholderData: keepPreviousData,
  })

  const listQ = useQuery({
    queryKey:        ['produtos-list', dbSearch, dbCodigo, tipoFilter, rupturaFilter, grupoFilter, pedraFilter, tag2Filter, catFilter, estoqueFilter, filialFilter, page, sortK, sortD],
    queryFn:         () => api.produtos({ view: 'list', page, limit: PAGE_LIMIT, sort: sortK, dir: sortD, search: dbSearch, tipo: tipoFilter, grupo: grupoFilter, pedra: pedraFilter, tag2: tag2Filter, categoria: catFilter, codigo: dbCodigo, ruptura: rupturaFilter || undefined, estoque: estoqueFilter || undefined, filial: filialFilter || undefined }),

    enabled:         loaded && tab === 'produto',
    staleTime:       30000,
    refetchInterval: false,
    placeholderData: keepPreviousData,
  })

  const isWarm     = d.loading === true
  const isFetching = kpi.isFetching || groupQ.isFetching || listQ.isFetching

  const groupRows  = groupQ.data?.items  || []
  const listRows   = listQ.data?.items   || []
  const listTotal  = listQ.data?.total   || 0
  const totalNovo    = listQ.data?.totalNovo      ?? 0
  const totalRep     = listQ.data?.totalReposicao ?? 0
  const totalRuptura = listQ.data?.totalRuptura   ?? 0
  const totalPages = Math.ceil(listTotal / PAGE_LIMIT)

  const hasFilters = grupoFilter || pedraFilter || tag2Filter || catFilter || estoqueFilter || filialFilter || codigoFilter || dbSearch || tipoFilter !== 'todos' || rupturaFilter !== ''

  return (
    <div>
      {isFetching && !isWarm && (
        <div style={{ position: 'absolute', top: 12, right: 24, zIndex: 20 }}>
          <span className="text-xs" style={{ color: '#f5c518' }}>↻ atualizando…</span>
        </div>
      )}

      {isWarm && (
        <div style={{ background: '#1a1c2a', border: '1px solid #f5c518', borderRadius: 8, padding: '12px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="spinner" />
          <div>
            <div style={{ color: '#f5c518', fontWeight: 600, fontSize: 13 }}>Carregando catálogo completo da API…</div>
            <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
              {d.pais > 0 ? `${d.pais.toLocaleString('pt-BR')} produtos pai carregados — ` : ''}aguarde ({d.elapsed}s)
            </div>
          </div>
        </div>
      )}

      <div className="page-body space-y-4">
        {/* KPIs */}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
          <KPICard label="Saldo Atual"  value={fNum(d.saldoEstoque)}      sub="Estoque Atual"                    color="#e8eaf0" />
          <KPICard label="Disponível"   value={fNum(d.saldoDisponivel)}   sub="Estoque Disponível"               color="#00b4d8" />
          <KPICard label="Estoque"      value={fBRL(d.valorEstoque)}      sub="preço venda × qtd"               color="#a3e635" />
          <KPICard label="Custo Médio"  value={fBRL(d.custoMedio)}        sub="Σ(custo × saldo) / Σ saldo"      color="#a3e635" />
          <KPICard label="Giro Médio"   value={`${fNum(d.giroMedio,1)}x`} sub="vendas 365d ÷ saldo médio"       color="#818cf8" />
          <KPICard label="DDE Médio"    value={`${fNum(d.ddeMedio,0)} d`} sub="saldo ÷ (vendas 365d ÷ 365)"    color="#fb923c" />
        </div>

        {/* Tabela */}
        <div className="card">
          {/* Tabs */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <DrillTab label="GRUPO"         id="grupo"   active={tab} onClick={changeTab} />
            <DrillTab label="TIPO DE PEDRA" id="pedra"   active={tab} onClick={changeTab} />
            <DrillTab label="TAG 2"         id="tag2"    active={tab} onClick={changeTab} />
            <DrillTab label="PRODUTO"       id="produto" active={tab} onClick={changeTab} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
              {[{ id: '', label: 'Todos' }, { id: '01', label: 'Almox 01' }, { id: '04', label: 'Almox 04' }].map(o => (
                <button key={o.id} onClick={() => { setFilialFilter(o.id); setPage(0) }}
                  className="px-3 py-1 rounded text-xs font-bold transition-all"
                  style={filialFilter === o.id
                    ? { background: '#f5c518', color: '#0d0e16' }
                    : { background: '#20223a', color: '#6b7280', border: '1px solid #2a2d40' }}>
                  {o.label}
                </button>
              ))}
            </div>
            <div className="ml-auto">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar descrição…" className="inp w-48 text-xs" />
            </div>
          </div>

          {/* Filtros extras — só na aba PRODUTO */}
          {tab === 'produto' && (
            <div className="flex flex-wrap items-end gap-3 mb-4 pb-4" style={{ borderBottom: '1px solid #22253a' }}>
              {/* Tipo */}
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Tipo</div>
                <div className="flex gap-1.5">
                  {[
                    { id: 'todos',     label: 'Todos' },
                    { id: 'novo',      label: `Novo (${totalNovo.toLocaleString('pt-BR')})` },
                    { id: 'reposicao', label: `Reposição (${totalRep.toLocaleString('pt-BR')})` },
                  ].map(({ id, label }) => (
                    <button key={id} onClick={() => changeTipo(id)}
                      className="px-3 py-1 rounded text-xs font-semibold transition-all"
                      style={tipoFilter === id ? { background: '#f5c518', color: '#0d0e16' } : { background: '#20223a', color: '#8b90a7', border: '1px solid #2a2d40' }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grupo */}
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Grupo</div>
                <select value={grupoFilter} onChange={e => { setGrupoFilter(e.target.value); setPage(0) }} className="inp text-xs" style={{ minWidth: 130 }}>
                  <option value="">Todos</option>
                  {opts.grupos.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>

              {/* Tipo de Pedra */}
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Tipo de Pedra</div>
                <select value={pedraFilter} onChange={e => { setPedraFilter(e.target.value); setPage(0) }} className="inp text-xs" style={{ minWidth: 160 }}>
                  <option value="">Todas</option>
                  {opts.pedras.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              {/* Categoria */}
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Categoria</div>
                <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0) }} className="inp text-xs" style={{ minWidth: 140 }}>
                  <option value="">Todas</option>
                  {opts.categorias.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* TAG 2 */}
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>TAG 2</div>
                <select value={tag2Filter} onChange={e => { setTag2Filter(e.target.value); setPage(0) }} className="inp text-xs" style={{ minWidth: 120 }}>
                  <option value="">Todas</option>
                  {opts.tag2s.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Estoque */}
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Estoque</div>
                <select value={estoqueFilter} onChange={e => { setEstoqueFilter(e.target.value); setPage(0) }} className="inp text-xs"
                  style={{ minWidth: 150, borderColor: estoqueFilter === 'sem' ? '#f87171' : estoqueFilter === 'baixo' ? '#fb923c' : estoqueFilter === 'com' ? '#4ade80' : '#2a2d40', color: estoqueFilter === 'sem' ? '#f87171' : estoqueFilter === 'baixo' ? '#fb923c' : estoqueFilter === 'com' ? '#4ade80' : '#e8eaf0' }}>
                  <option value="">Todos</option>
                  <option value="com">Com estoque</option>
                  <option value="sem">Sem estoque</option>
                  <option value="baixo">Estoque baixo (DDE &lt; 30d)</option>
                </select>
              </div>


              {/* Ruptura */}
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Ruptura</div>
                <select value={rupturaFilter} onChange={e => changeRuptura(e.target.value)} className="inp text-xs"
                  style={{ minWidth: 160, borderColor: rupturaFilter === 'ruptura' ? '#f87171' : rupturaFilter === 'risco' ? '#fb923c' : '#2a2d40', color: rupturaFilter === 'ruptura' ? '#f87171' : rupturaFilter === 'risco' ? '#fb923c' : '#e8eaf0' }}>
                  <option value="">Todos</option>
                  <option value="risco">Risco de Ruptura</option>
                  <option value="normalizado">Normalizado</option>
                  <option value="ruptura">Ruptura</option>
                </select>
              </div>

              {/* Código */}
              <div>
                <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Código</div>
                <input value={codigoFilter} onChange={e => setCodigoFilter(e.target.value)} placeholder="ex: 215894" className="inp text-xs" style={{ width: 120 }} />
              </div>

              {/* Limpar */}
              {hasFilters && (
                <button onClick={resetFilters} className="btn-ghost text-xs self-end">✕ Limpar filtros</button>
              )}
            </div>
          )}

          {!loaded && <div className="state-box"><p>Aguardando carregamento do catálogo…</p></div>}

          {loaded && tab !== 'produto' && groupQ.isLoading && (
            <div className="state-box"><div className="spinner" /><p>Carregando {TAB_LABEL[tab]}…</p></div>
          )}

          {loaded && tab !== 'produto' && !groupQ.isLoading && (
            <TabelaGrupo rows={groupRows} label={TAB_LABEL[tab]} isFetching={groupQ.isFetching} />
          )}

          {loaded && tab === 'produto' && (
            <TabelaProdutos
              rows={listRows} total={listTotal} page={page} totalPages={totalPages}
              sortK={sortK} sortD={sortD} onSort={changeSort} onPage={setPage}
              isFetching={listQ.isFetching}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function DrillTab({ label, id, active, onClick }) {
  const isActive = active === id
  return (
    <button onClick={() => onClick(id)} className="px-5 py-2 rounded text-xs font-bold uppercase tracking-wider transition-all"
      style={isActive ? { background: '#f5c518', color: '#0d0e16' } : { background: '#1e2035', color: '#8b90a7', border: '1px solid #2a2d40' }}>
      {isActive ? '▼' : '▶'} {label}
    </button>
  )
}

function KPICard({ label, value, sub, color }) {
  return (
    <div className="card flex flex-col justify-between" style={{ minHeight: 100 }}>
      <span className="kpi-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <div className="font-black tracking-tight" style={{ color, fontSize: 'clamp(16px, 2vw, 26px)', lineHeight: 1.1, margin: '6px 0 4px' }}>{value}</div>
      <div className="kpi-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
    </div>
  )
}

function VendasPeriodo({ data }) {
  const max  = data.d90val || 1
  const bars = [
    { label: '30 dias', value: data.d30val },
    { label: '60 dias', value: data.d60val },
    { label: '90 dias', value: data.d90val },
  ]
  return (
    <div className="flex flex-col gap-3">
      {bars.map(({ label, value }) => (
        <div key={label}>
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs" style={{ color: '#6b7280' }}>{label}</span>
            <span className="text-sm font-bold" style={{ color: '#00b4d8' }}>{fBRL(value)}</span>
          </div>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${Math.round(((value || 0) / max) * 100)}%`, background: '#00b4d8' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Tabela produtos ──────────────────────────────────────────────────────────

function TabelaProdutos({ rows, total, page, totalPages, sortK, sortD, onSort, onPage, isFetching }) {
  function TH({ k, label, align = 'left' }) {
    return (
      <th onClick={() => onSort(k)} style={{ textAlign: align, cursor: 'pointer', userSelect: 'none' }}
        className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wider">
        <span style={{ color: sortK === k ? '#f5c518' : '#6b7280' }}>
          {label}{sortK === k ? (sortD === 'asc' ? ' ▲' : ' ▼') : ''}
        </span>
      </th>
    )
  }

  return (
    <div style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.15s' }}>
      <div className="tbl-scroll">
        <table className="tbl" style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 260 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr>
              <TH k="grupo"       label="Grupo" />
              <TH k="pedra"       label="Tipo de Pedra" />
              <TH k="tag2"        label="TAG 2" />
              <TH k="descricao"   label="Produto" />
              <TH k="_saldo"      label="Est. Atual"   align="center" />
              <TH k="_saldoDisp"  label="Disponível"   align="center" />
              <TH k="_vend30"     label="Vend. 30D"    align="center" />
              <TH k="_taxaSaida"  label="Saída"        align="center" />
              <TH k="_dde"        label="DDE"          align="center" />
              <TH k="_giro"       label="Giro"         align="center" />
              <TH k="_precoMedio" label="Preço M."     align="center" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !isFetching && (
              <tr><td colSpan={11}><div className="state-box text-sm">Nenhum produto encontrado</div></td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i}>
                <td style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>{row.grupo ?? '-'}</td>
                <td style={{ color: '#00b4d8', fontSize: 12 }}>{row.pedra || '-'}</td>
                <td style={{ color: '#f5c518', fontSize: 12 }}>{row.tag2 || '-'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <FotoZoom url={row._foto} alt={row.descricao} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                        <span style={{ color: '#e8eaf0', fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 155, display: 'block' }} title={row.descricao}>
                          {row.descricao ?? '-'}
                        </span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, flexShrink: 0, background: row.isNovo ? '#14532d' : '#1e3a5f', color: row.isNovo ? '#4ade80' : '#60a5fa' }}>
                          {row.isNovo ? 'NOVO' : 'REP'}
                        </span>
                      </div>
                      <div style={{ color: '#4b5063', fontSize: 11 }}>{row.produtoBase} › {row.produto}</div>
                    </div>
                  </div>
                </td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{fNum(row._saldo)}</td>
                <td style={{ textAlign: 'center', fontFamily: 'monospace', color: '#00b4d8' }}>{fNum(row._saldoDisp)}</td>
                <td style={{ textAlign: 'center' }}>
                  {row._vend30 > 0 ? <span style={{ color: '#4ade80', fontWeight: 700 }}>{fNum(row._vend30)}</span> : <span style={{ color: '#4b5063' }}>-</span>}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {row._taxaSaida > 0 ? <span style={{ color: '#4ade80' }}>{row._taxaSaida.toFixed(1)}%</span> : <span style={{ color: '#4b5063' }}>-</span>}
                </td>
                <td style={{ textAlign: 'center' }}><BadgeDDE value={row._dde} /></td>
                <td style={{ textAlign: 'center' }}>
                  {row._giro > 0 ? <span style={{ color: '#818cf8' }}>{fNum(row._giro, 1)}x</span> : <span style={{ color: '#4b5063' }}>-</span>}
                </td>
                <td style={{ textAlign: 'center' }}>{row._precoMedio > 0 ? fBRL(row._precoMedio) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-1 mt-3">
        <p className="text-xs" style={{ color: '#4b5063' }}>
          {total > 0
            ? `${(page * PAGE_LIMIT + 1).toLocaleString('pt-BR')}–${Math.min((page + 1) * PAGE_LIMIT, total).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} produtos`
            : '0 produtos'}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => onPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-3 py-1 rounded text-xs font-semibold"
            style={{ background: '#1e2035', color: page === 0 ? '#3a3f5c' : '#e8eaf0', border: '1px solid #2a2d40' }}>
            ← Anterior
          </button>
          <span className="text-xs" style={{ color: '#6b7280' }}>{page + 1} / {totalPages || 1}</span>
          <button onClick={() => onPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="px-3 py-1 rounded text-xs font-semibold"
            style={{ background: '#1e2035', color: page >= totalPages - 1 ? '#3a3f5c' : '#e8eaf0', border: '1px solid #2a2d40' }}>
            Próximo →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tabela agrupada ──────────────────────────────────────────────────────────

function TabelaGrupo({ rows, label, isFetching }) {
  const [sortK, setSortK] = useState('_valorEst')
  const [sortD, setSortD] = useState('desc')

  const sorted = [...rows].sort((a, b) => {
    const na = parseFloat(a[sortK]), nb = parseFloat(b[sortK])
    const cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : String(a[sortK] ?? '').localeCompare(String(b[sortK] ?? ''), 'pt-BR')
    return sortD === 'asc' ? cmp : -cmp
  })

  function TH({ k, l, align = 'left' }) {
    const active = sortK === k
    return (
      <th onClick={() => { if (active) setSortD(d => d === 'asc' ? 'desc' : 'asc'); else { setSortK(k); setSortD('desc') } }}
        style={{ textAlign: align, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', padding: '10px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', position: 'sticky', top: 0, background: '#1a1c2a', zIndex: 10 }}>
        <span style={{ color: active ? '#f5c518' : '#6b7280' }}>{l}{active ? (sortD === 'asc' ? ' ▲' : ' ▼') : ''}</span>
      </th>
    )
  }

  return (
    <div style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.15s' }}>
      <div className="tbl-scroll">
        <table className="tbl" style={{ tableLayout: 'auto', width: '100%' }}>
          <thead>
            <tr>
              <TH k="_key"        l={label} />
              <TH k="_count"      l="Produtos"     align="right" />
              <TH k="_saldo"      l="Est. Atual"   align="right" />
              <TH k="_saldoDisp"  l="Est. Disp."   align="right" />
              <TH k="_valorEst"   l="Val. Estoque" align="right" />
              <TH k="_vend30"     l="Vend. 30D"    align="right" />
              <TH k="_taxaSaida"  l="Taxa Saída"   align="right" />
              <TH k="_dde"        l="DDE"          align="right" />
              <TH k="_giroMedio"  l="Giro"         align="right" />
              <th style={{ whiteSpace: 'nowrap', padding: '10px 12px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', position: 'sticky', top: 0, background: '#1a1c2a', zIndex: 10 }}>Ruptura</th>
              <TH k="_precoMedio" l="Preço Médio"  align="right" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr><td colSpan={11}><div className="state-box text-sm">Nenhum dado encontrado</div></td></tr>
            )}
            {sorted.map((row, i) => {
              const dde = row._dde ?? 9999
              const semVenda = (row._vend30 ?? 0) === 0 && (row._vendida ?? 0) === 0
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 700, color: '#e8eaf0', whiteSpace: 'nowrap' }}>{row._key}</td>
                  <td style={{ textAlign: 'right', color: '#6b7280', fontFamily: 'monospace' }}>{fNum(row._count)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fNum(row._saldo)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#00b4d8' }}>{fNum(row._saldoDisp)}</td>
                  <td style={{ textAlign: 'right', color: '#a3e635', fontWeight: 600 }}>{fBRL(row._valorEst)}</td>
                  <td style={{ textAlign: 'right' }}>
                    {row._vend30 > 0 ? <span style={{ color: '#4ade80', fontWeight: 700 }}>{fNum(row._vend30)}</span> : <span style={{ color: '#4b5063' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {row._taxaSaida > 0 ? <span style={{ color: '#4ade80' }}>{row._taxaSaida?.toFixed(1)}%</span> : <span style={{ color: '#4b5063' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {dde < 9999
                      ? <span style={{ color: dde < 30 ? '#f87171' : dde < 60 ? '#fb923c' : '#e8eaf0' }}>{fNum(dde)} d</span>
                      : <span style={{ color: '#4b5063' }}>—</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {row._giroMedio > 0 ? <span style={{ color: '#818cf8' }}>{fNum(row._giroMedio, 1)}x</span> : <span style={{ color: '#4b5063' }}>—</span>}
                  </td>
                  <td>
                    {semVenda
                      ? <span className="badge" style={{ background: '#713f12', color: '#fbbf24', fontSize: 11 }}>SEM GIRO</span>
                      : dde < 30 ? <span className="badge badge-risco">RISCO</span>
                      : <span className="badge badge-ok">OK</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>{row._precoMedio > 0 ? fBRL(row._precoMedio) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Foto com zoom ────────────────────────────────────────────────────────────

function FotoZoom({ url, alt }) {
  const [pos, setPos] = useState(null)

  if (!url) return <PlaceholderFoto />

  return (
    <div className="foto-zoom-container"
      onMouseEnter={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      <img src={url} alt={alt} className="rounded object-cover flex-shrink-0"
        style={{ width: 36, height: 36, background: '#20223a', display: 'block' }}
        onError={e => { e.target.style.display = 'none' }} />
      {pos && (
        <div className="foto-zoom-popup" style={{
          left: pos.x + 16,
          top:  Math.min(pos.y - 110, window.innerHeight - 230),
        }}>
          <img src={url} alt={alt} style={{ width: 200, height: 200, objectFit: 'contain', display: 'block', borderRadius: 6 }} />
        </div>
      )}
    </div>
  )
}

function PlaceholderFoto() {
  return (
    <div className="rounded flex items-center justify-center flex-shrink-0" style={{ width: 36, height: 36, background: '#20223a', color: '#3a3f5c' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
      </svg>
    </div>
  )
}

function RupturaBadge({ dde, saldo, vend30 }) {
  if (saldo === 0 && vend30 > 0) return <span className="badge badge-risco">RISCO</span>
  if (dde < 30 && dde < 9999)   return <span className="badge badge-alerta">ATENÇÃO</span>
  if (dde < 9999)                return <span className="badge badge-ok">OK</span>
  return <span style={{ color: '#4b5063', fontSize: 12 }}>S/V</span>
}
