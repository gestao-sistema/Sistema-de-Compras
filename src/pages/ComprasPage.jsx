import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'
import ExportCompras from '../components/ExportCompras'
import FilialSelector from '../components/FilialSelector'
import FotoZoom from '../components/FotoZoom'

const PAGE_LIMIT  = 100
const LOCAL_SORTS = ['solicitado', '_saldoDisp01', '_saldoDisp04']

export default function ComprasPage() {
  const [rupturaTab,   setRupturaTab]   = useState('risco')
  const [grupoFilter,  setGrupoFilter]  = useState('')
  const [pedraFilter,  setPedraFilter]  = useState('')
  const [tag2Filter,   setTag2Filter]   = useState('')
  const [filialFilter, setFilialFilter] = useState('')
  const [codigoFilter, setCodigoFilter] = useState('')
  const [dbCodigo,     setDbCodigo]     = useState('')
  const [search,       setSearch]       = useState('')
  const [dbSearch,     setDbSearch]     = useState('')
  const [page,         setPage]         = useState(0)
  const [cobertura,    setCobertura]    = useState(60)
  const [sortCol,      setSortCol]      = useState('_dde')   // sort do servidor
  const [sortDir,      setSortDir]      = useState('asc')
  const [localSort,    setLocalSort]    = useState(null)      // sort client-side (solicitado)
  const [localDir,     setLocalDir]     = useState('desc')

  // col ativo para exibição da seta
  const activeSortCol = localSort || sortCol
  const activeSortDir = localSort ? localDir : sortDir

  function toggleSort(col) {
    if (LOCAL_SORTS.includes(col)) {
      if (localSort === col) setLocalDir(d => d === 'asc' ? 'desc' : 'asc')
      else { setLocalSort(col); setLocalDir('desc'); setPage(0) }
      return
    }
    setLocalSort(null)
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
    setPage(0)
  }

  function SortArrow({ col }) {
    if (activeSortCol !== col) return <span style={{ color: 'var(--text-dim)', marginLeft: 3 }}>⇅</span>
    return <span style={{ color: '#f5c518', marginLeft: 3 }}>{activeSortDir === 'asc' ? '↑' : '↓'}</span>
  }

  useEffect(() => {
    const t = setTimeout(() => { setDbSearch(search); setPage(0) }, 400)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    const t = setTimeout(() => { setDbCodigo(codigoFilter); setPage(0) }, 400)
    return () => clearTimeout(t)
  }, [codigoFilter])

  function changeTab(v) { setRupturaTab(v); setPage(0) }

  const optQ     = useQuery({ queryKey: ['produtos-options'],    queryFn: api.produtosOptions,    staleTime: Infinity })
  // busca imediata — usado na coluna Solicitado e no sort global
  const pedidosQ = useQuery({ queryKey: ['pedidos-por-produto'], queryFn: api.pedidosPorProduto, staleTime: 5 * 60 * 1000, refetchOnMount: true })
  const opts         = optQ.data     || { grupos: [], pedras: [], tag2s: [] }
  const pedidosMap   = pedidosQ.data || {}

  // Totais por status — atualiza ao mudar cobertura ou filtros
  const totaisQ = useQuery({
    queryKey:  ['compras-totais', cobertura, dbSearch, grupoFilter, pedraFilter, tag2Filter, filialFilter],
    queryFn:   () => api.comprasTotais({ cobertura, search: dbSearch, grupo: grupoFilter, pedra: pedraFilter, tag2: tag2Filter, filial: filialFilter || undefined }),
    staleTime: 30000,
    placeholderData: keepPreviousData,
  })
  const totais = totaisQ.data || {
    ruptura: { count: 0, valor: 0 },
    risco:   { count: 0, valor: 0 },
    total:   { count: 0, valor: 0 },
  }

  const isLocalSort = LOCAL_SORTS.includes(localSort)

  // Query paginada normal (todos os outros sorts — servidor pagina)
  const listQ = useQuery({
    queryKey:        ['compras-list', rupturaTab, dbSearch, dbCodigo, grupoFilter, pedraFilter, tag2Filter, filialFilter, page, sortCol, sortDir],
    queryFn:         () => api.produtos({
      view: 'list', page, limit: PAGE_LIMIT,
      sort: sortCol, dir: sortDir,
      ruptura: rupturaTab,
      search: dbSearch, codigo: dbCodigo || undefined,
      grupo: grupoFilter, pedra: pedraFilter, tag2: tag2Filter,
      filial: filialFilter || undefined,
    }),
    enabled:         !isLocalSort,
    staleTime:       30000,
    placeholderData: keepPreviousData,
  })

  // Query completa sem paginação — usada ao ordenar por colunas client-side
  const allQ = useQuery({
    queryKey:        ['compras-all', rupturaTab, dbSearch, dbCodigo, grupoFilter, pedraFilter, tag2Filter, filialFilter],
    queryFn:         () => api.produtos({
      view: 'list', page: 0, limit: 99999,
      sort: '_dde', dir: 'asc',
      ruptura: rupturaTab,
      search: dbSearch, codigo: dbCodigo || undefined,
      grupo: grupoFilter, pedra: pedraFilter, tag2: tag2Filter,
      filial: filialFilter || undefined,
    }),
    enabled:         isLocalSort,
    staleTime:       60000,
    placeholderData: keepPreviousData,
  })

  // Dados efetivos
  const allSorted = isLocalSort
    ? [...(allQ.data?.items || [])].sort((a, b) => {
        let sa, sb
        if (localSort === 'solicitado') {
          sa = pedidosMap[a.produto]?.qtd || 0
          sb = pedidosMap[b.produto]?.qtd || 0
        } else {
          sa = a[localSort] ?? 0
          sb = b[localSort] ?? 0
        }
        return localDir === 'asc' ? sa - sb : sb - sa
      })
    : []

  const rows       = isLocalSort ? allSorted.slice(page * PAGE_LIMIT, (page + 1) * PAGE_LIMIT) : (listQ.data?.items || [])
  const total      = isLocalSort ? (allQ.data?.total || 0) : (listQ.data?.total || 0)
  const totalPages = Math.ceil(total / PAGE_LIMIT)
  const isLoading  = isLocalSort ? allQ.isLoading  : listQ.isLoading
  const isFetching = isLocalSort ? allQ.isFetching : listQ.isFetching

  const hasFilters = grupoFilter || pedraFilter || tag2Filter || filialFilter || dbSearch || dbCodigo
  function reset() { setGrupoFilter(''); setPedraFilter(''); setTag2Filter(''); setFilialFilter(''); setCodigoFilter(''); setSearch(''); setPage(0) }

  return (
    <div style={{ position: 'relative' }}>

      <div className="page-body space-y-4">

        {/* Cards de resumo */}
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard
            label="RUPTURA"
            sub="Saldo zerado com vendas recentes"
            count={totais.ruptura.count}
            valor={totais.ruptura.valor}
            color="#f87171"
            active={rupturaTab === 'ruptura'}
            onClick={() => changeTab('ruptura')}
            loading={totaisQ.isLoading}
          />
          <SummaryCard
            label="RISCO DE RUPTURA"
            sub="DDE menor que 30 dias"
            count={totais.risco.count}
            valor={totais.risco.valor}
            color="#fb923c"
            active={rupturaTab === 'risco'}
            onClick={() => changeTab('risco')}
            loading={totaisQ.isLoading}
          />
          {/* Card total geral */}
          <div className="card flex flex-col justify-between" style={{ border: '2px solid #f5c51840' }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: '#f5c518' }}>TOTAL GERAL</div>
            <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Ruptura + Risco combinados</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#f5c518', lineHeight: 1 }}>
              {totais.total.count.toLocaleString('pt-BR')}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>produtos</div>
            <div style={{ marginTop: 10, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
              <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Val. reposição estimado</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#a3e635' }}>
                {totaisQ.isLoading ? '—' : fBRL(totais.total.valor)}
              </div>
            </div>
          </div>
          {/* Cobertura */}
          <div className="card flex flex-col justify-between" style={{ borderColor: '#22253a' }}>
            <div className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Cobertura desejada</div>
            <div className="flex gap-2">
              {[30, 45, 60, 90].map(d => (
                <button key={d} onClick={() => setCobertura(d)}
                  className="flex-1 py-2 rounded text-xs font-bold transition-all"
                  style={cobertura === d ? { background: '#f5c518', color: '#0d0e16' } : { background: 'var(--bg-input)', color: 'var(--text-nav)', border: '1px solid var(--border2)' }}>
                  {d}d
                </button>
              ))}
            </div>
            <div className="text-xs mt-3" style={{ color: 'var(--text-dim)' }}>
              Qtd = venda/dia × {cobertura}d − saldo − solicitado
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="card">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Grupo</div>
              <select value={grupoFilter} onChange={e => { setGrupoFilter(e.target.value); setPage(0) }} className="inp text-xs" style={{ minWidth: 130 }}>
                <option value="">Todos</option>
                {opts.grupos.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Tipo de Pedra</div>
              <select value={pedraFilter} onChange={e => { setPedraFilter(e.target.value); setPage(0) }} className="inp text-xs" style={{ minWidth: 150 }}>
                <option value="">Todas</option>
                {opts.pedras.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>TAG 2</div>
              <select value={tag2Filter} onChange={e => { setTag2Filter(e.target.value); setPage(0) }} className="inp text-xs" style={{ minWidth: 120 }}>
                <option value="">Todas</option>
                {opts.tag2s.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <FilialSelector value={filialFilter} onChange={v => { setFilialFilter(v); setPage(0) }} />
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Código Filho</div>
              <input value={codigoFilter} onChange={e => setCodigoFilter(e.target.value)} placeholder="ex: 506300001" className="inp text-xs" style={{ width: 130 }} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Descrição</div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar…" className="inp text-xs" style={{ width: 170 }} />
            </div>
            {hasFilters && <button onClick={reset} className="btn-ghost text-xs self-end">✕ Limpar</button>}
          </div>
        </div>

        {/* Tabela */}
        <div className="card">
          {isLoading
            ? <div className="state-box"><div className="spinner" /><p>Carregando sugestões…</p></div>
            : (
              <div style={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.15s' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: rupturaTab === 'ruptura' ? '#f87171' : '#fb923c' }}>
                    ▌ {rupturaTab === 'ruptura' ? 'Ruptura — Reposição Urgente' : 'Risco de Ruptura — Reposição Necessária'}
                  </p>
                  <div className="flex items-center gap-4">
                    <ExportCompras
                      rupturaTab={rupturaTab}
                      grupoFilter={grupoFilter}
                      pedraFilter={pedraFilter}
                      tag2Filter={tag2Filter}
                      dbSearch={dbSearch}
                      cobertura={cobertura}
                    />
                    <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{total.toLocaleString('pt-BR')} produtos</p>
                  </div>
                </div>

                <div className="tbl-scroll">
                  <table className="tbl" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <colgroup>
                      <col style={{ width: 50 }} />   {/* foto */}
                      <col style={{ width: 130 }} />  {/* código */}
                      <col style={{ width: 210 }} />  {/* descrição */}
                      <col style={{ width: 90 }} />   {/* grupo */}
                      <col style={{ width: 70 }} />   {/* saldo */}
                      <col style={{ width: 70 }} />   {/* disp */}
                      <col style={{ width: 60 }} />   {/* almox 1 */}
                      <col style={{ width: 60 }} />   {/* almox 4 */}
                      <col style={{ width: 70 }} />   {/* vend 30d */}
                      <col style={{ width: 60 }} />   {/* DDE */}
                      <col style={{ width: 80 }} />   {/* solicitado */}
                      <col style={{ width: 95 }} />   {/* dt. pedido */}
                      <col style={{ width: 90 }} />   {/* qtd sugerida */}
                      <col style={{ width: 100 }} />  {/* val. repor */}
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ color: 'var(--text-muted)' }}>Foto</th>
                        <th style={{ color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => toggleSort('produto')}>Código<SortArrow col="produto" /></th>
                        <th style={{ color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => toggleSort('descricao')}>Descrição<SortArrow col="descricao" /></th>
                        <th style={{ color: 'var(--text-muted)', cursor: 'pointer' }} onClick={() => toggleSort('grupo')}>Grupo<SortArrow col="grupo" /></th>
                        <th style={{ color: 'var(--text-muted)', textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSort('_saldo')}>Saldo<SortArrow col="_saldo" /></th>
                        <th style={{ color: 'var(--text-muted)', textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSort('_saldoDisp')}>Disp.<SortArrow col="_saldoDisp" /></th>
                        <th style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 10, cursor: 'pointer' }} onClick={() => toggleSort('_saldoDisp01')}>Alm. 1<SortArrow col="_saldoDisp01" /></th>
                        <th style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: 10, cursor: 'pointer' }} onClick={() => toggleSort('_saldoDisp04')}>Alm. 4<SortArrow col="_saldoDisp04" /></th>
                        <th style={{ color: 'var(--text-muted)', textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSort('_vend30')}>Vend. 30D<SortArrow col="_vend30" /></th>
                        <th style={{ color: 'var(--text-muted)', textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSort('_dde')}>DDE<SortArrow col="_dde" /></th>
                        <th style={{ color: '#818cf8', textAlign: 'center', cursor: pedidosQ.isLoading ? 'wait' : 'pointer' }}
                          onClick={() => !pedidosQ.isLoading && toggleSort('solicitado')}>
                          Solicitado{pedidosQ.isLoading ? <span style={{ fontSize: 9, marginLeft: 4, color: '#f5c518' }}>⏳</span> : <SortArrow col="solicitado" />}
                        </th>
                        <th style={{ color: '#818cf8', textAlign: 'center' }}>Dt. Pedido</th>
                        <th style={{ color: '#f5c518', textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSort('_vend30')}>Qtd p/ {cobertura}d<SortArrow col="_vend30" /></th>
                        <th style={{ color: '#f5c518', textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleSort('_custo')}>R$<SortArrow col="_custo" /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && !isFetching && (
                        <tr><td colSpan={14}><div className="state-box text-sm">Nenhum produto encontrado</div></td></tr>
                      )}
                      {rows.map((row, i) => {
                        const urgencia    = row._saldo === 0 && row._vend30 > 0 ? 'ruptura' : 'risco'
                        const pedInfo     = pedidosMap[row.produto]
                        const solicitado  = pedInfo?.qtd || 0
                        const datasPedido = pedInfo?.datas || []
                        const qtdSug     = Math.max(0, Math.ceil((row._vend30 / 30) * cobertura) - row._saldo - solicitado)
                        const valRepor   = qtdSug * (row._custo || 0)
                        const dde      = row._dde < 9999 ? row._dde : null
                        return (
                          <tr key={i}>
                            <td><FotoZoom url={row._foto} alt={row.descricao} /></td>
                            <td>
                              <div style={{ color: '#f5c518', fontFamily: 'monospace', fontSize: 11 }}>{row.produtoBase}</div>
                              <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>{row.produto}</div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)', fontSize: 12 }} title={row.descricao}>
                                  {row.descricao ?? '-'}
                                </span>
                                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, flexShrink: 0,
                                  background: urgencia === 'ruptura' ? '#7f1d1d' : '#7c2d12',
                                  color:      urgencia === 'ruptura' ? '#f87171' : '#fb923c' }}>
                                  {urgencia === 'ruptura' ? 'RUPTURA' : 'RISCO'}
                                </span>
                              </div>
                              <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 2 }}>{row.pedra || ''}{row.tag2 ? ` · ${row.tag2}` : ''}</div>
                            </td>
                            <td style={{ color: '#00b4d8', fontSize: 12 }}>{row.grupo ?? '-'}</td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', color: row._saldo === 0 ? '#f87171' : '#e8eaf0', fontWeight: row._saldo === 0 ? 700 : 400 }}>
                              {fNum(row._saldo)}
                            </td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', color: '#00b4d8' }}>{fNum(row._saldoDisp)}</td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: row._saldoDisp01 < 0 ? '#f87171' : '#94a3b8' }}>{fNum(row._saldoDisp01)}</td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: row._saldoDisp04 < 0 ? '#f87171' : '#94a3b8' }}>{fNum(row._saldoDisp04)}</td>
                            <td style={{ textAlign: 'center', color: '#4ade80', fontWeight: 700 }}>{fNum(row._vend30)}</td>
                            <td style={{ textAlign: 'center' }}>
                              {dde !== null
                                ? <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: dde === 0 ? '#7f1d1d' : dde < 15 ? '#7f1d1d' : '#7c2d12', color: dde === 0 ? '#f87171' : dde < 15 ? '#f87171' : '#fb923c' }}>
                                    {dde === 0 ? 'ZERO' : `${dde}D`}
                                  </span>
                                : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 13 }}>
                              {pedidosQ.isLoading
                                ? <span style={{ color: 'var(--text-dim)' }}>…</span>
                                : solicitado > 0
                                  ? <span style={{ color: '#818cf8', fontWeight: 700 }}>{fNum(solicitado)}</span>
                                  : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: 10, color: '#818cf8', lineHeight: 1.4 }}>
                              {pedidosQ.isLoading
                                ? <span style={{ color: 'var(--text-dim)' }}>…</span>
                                : datasPedido.length > 0
                                  ? datasPedido.join(' / ')
                                  : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {qtdSug > 0
                                ? <span style={{ color: '#f5c518', fontWeight: 800, fontSize: 15 }}>{fNum(qtdSug)}</span>
                                : <span style={{ color: '#4ade80', fontSize: 11 }}>✓ OK</span>}
                            </td>
                            <td style={{ textAlign: 'center', color: '#a3e635', fontWeight: 600 }}>
                              {valRepor > 0 ? fBRL(valRepor) : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Paginação */}
                <div className="flex items-center justify-between px-1 mt-3">
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {total > 0
                      ? `${(page * PAGE_LIMIT + 1).toLocaleString('pt-BR')}–${Math.min((page + 1) * PAGE_LIMIT, total).toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')}`
                      : '0 produtos'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                      className="px-3 py-1 rounded text-xs font-semibold"
                      style={{ background: 'var(--bg-input)', color: page === 0 ? 'var(--text-dim)' : 'var(--text)', border: '1px solid var(--border2)' }}>
                      ← Anterior
                    </button>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{page + 1} / {totalPages || 1}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                      className="px-3 py-1 rounded text-xs font-semibold"
                      style={{ background: 'var(--bg-input)', color: page >= totalPages - 1 ? 'var(--text-dim)' : 'var(--text)', border: '1px solid var(--border2)' }}>
                      Próximo →
                    </button>
                  </div>
                </div>
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ label, sub, count, valor, color, active, onClick, loading }) {
  return (
    <button onClick={onClick} style={{
      textAlign: 'left', background: 'var(--bg-card)', cursor: 'pointer', width: '100%',
      border: `2px solid ${active ? color : '#22253a'}`,
      borderRadius: 10, padding: '16px 20px', transition: 'border-color 0.15s',
    }}>
      <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.05em', color: active ? color : '#e8eaf0', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{sub}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color, lineHeight: 1 }}>{count.toLocaleString('pt-BR')}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginBottom: 10 }}>produtos</div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Val. reposição estimado</div>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#a3e635' }}>
          {loading ? '—' : fBRL(valor)}
        </div>
      </div>
    </button>
  )
}

