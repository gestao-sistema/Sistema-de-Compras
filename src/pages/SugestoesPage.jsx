import { useState, useEffect } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'
import { BadgeABC } from '../components/Badge'
import FilialSelector from '../components/FilialSelector'

const PAGE_LIMIT = 100

const CURVES = [
  { id: 'faturamento', label: 'ABC FATURAMENTO',       sub: 'Receita vendida × preço — 30 dias', metricLabel: 'Faturamento 30D', metricFmt: v => fBRL(v), color: '#f5c518' },
  { id: 'unidades',    label: 'ABC UNIDADES VENDIDAS', sub: 'Quantidade vendida — 30 dias',       metricLabel: 'Unidades 30D',    metricFmt: v => fNum(v), color: '#00b4d8' },
  { id: 'estoque',     label: 'ABC ESTOQUE',           sub: 'Capital investido saldo × preço',    metricLabel: 'Val. Estoque',    metricFmt: v => fBRL(v), color: '#4ade80' },
]

export default function SugestoesPage() {
  const [curva,        setCurva]        = useState('faturamento')
  const [abcFilter,    setAbcFilter]    = useState('')
  const [grupoFilter,  setGrupoFilter]  = useState('')
  const [pedraFilter,  setPedraFilter]  = useState('')
  const [fornFilter,   setFornFilter]   = useState('')
  const [catFilter,    setCatFilter]    = useState('')
  const [filialFilter, setFilialFilter] = useState('')
  const [codigoFilter, setCodigoFilter] = useState('')
  const [search,       setSearch]       = useState('')
  const [dbSearch,     setDbSearch]     = useState('')
  const [dbCodigo,     setDbCodigo]     = useState('')
  const [page,         setPage]         = useState(0)
  const [sortK,        setSortK]        = useState('_metric')
  const [sortD,        setSortD]        = useState('desc')

  useEffect(() => { const t = setTimeout(() => { setDbSearch(search);  setPage(0) }, 400); return () => clearTimeout(t) }, [search])
  useEffect(() => { const t = setTimeout(() => { setDbCodigo(codigoFilter); setPage(0) }, 400); return () => clearTimeout(t) }, [codigoFilter])

  function changeCurva(id) { setCurva(id); setPage(0); setSortK('_metric'); setSortD('desc') }
  function changeAbc(v)    { setAbcFilter(v); setPage(0) }
  function changeSort(k)   { if (sortK === k) setSortD(d => d === 'asc' ? 'desc' : 'asc'); else { setSortK(k); setSortD('desc') }; setPage(0) }

  const optQ = useQuery({ queryKey: ['produtos-options'], queryFn: api.produtosOptions, staleTime: Infinity })
  const opts = optQ.data || { grupos: [], pedras: [], categorias: [], fornecedores: [] }

  const abcQ = useQuery({
    queryKey:        ['abc', curva, abcFilter, dbSearch, dbCodigo, grupoFilter, pedraFilter, fornFilter, catFilter, filialFilter, page, sortK, sortD],
    queryFn:         () => api.abc({ tipo: curva, abc: abcFilter, search: dbSearch, codigo: dbCodigo, grupo: grupoFilter, pedra: pedraFilter, fornecedor: fornFilter, categoria: catFilter, filial: filialFilter || undefined, page, limit: PAGE_LIMIT, sort: sortK, dir: sortD }),
    staleTime:       60000,
    placeholderData: keepPreviousData,
  })

  const data       = abcQ.data || {}
  const rows       = data.items    || []
  const total      = data.total    || 0
  const totalA     = data.totalA   || 0
  const totalB     = data.totalB   || 0
  const totalC     = data.totalC   || 0
  const totalPages = Math.ceil(total / PAGE_LIMIT)
  const cDef       = CURVES.find(c => c.id === curva)
  const hasFilters = grupoFilter || pedraFilter || fornFilter || catFilter || filialFilter || dbCodigo || dbSearch || abcFilter

  function reset() { setGrupoFilter(''); setPedraFilter(''); setFornFilter(''); setCatFilter(''); setFilialFilter(''); setCodigoFilter(''); setSearch(''); setAbcFilter(''); setPage(0) }

  return (
    <div>
      {abcQ.isFetching && (
        <div style={{ position: 'fixed', top: 18, right: 70, zIndex: 20 }}>
          <span className="text-xs" style={{ color: 'var(--accent)' }}>↻ atualizando…</span>
        </div>
      )}

      <div className="page-body space-y-4">

        {/* Cards das 3 curvas */}
        <div className="grid grid-cols-3 gap-4">
          {CURVES.map(c => {
            const isActive = curva === c.id
            return (
              <button key={c.id} onClick={() => changeCurva(c.id)} style={{
                textAlign: 'left', background: 'var(--bg-card)', cursor: 'pointer',
                border: `2px solid ${isActive ? c.color : 'var(--border)'}`,
                borderRadius: 10, padding: '16px 20px', transition: 'border-color 0.15s',
                boxShadow: isActive ? `0 0 0 1px ${c.color}33, 0 4px 16px ${c.color}18` : '0 1px 4px var(--shadow)',
              }}>
                <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: '0.05em', marginBottom: 4, color: isActive ? c.color : 'var(--text)' }}>
                  {c.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>{c.sub}</div>
                {isActive
                  ? <div style={{ display: 'flex', gap: 8 }}>
                      <AbcChip label="A" count={totalA} active={abcFilter === 'A'} onClick={e => { e.stopPropagation(); changeAbc(abcFilter === 'A' ? '' : 'A') }} />
                      <AbcChip label="B" count={totalB} active={abcFilter === 'B'} onClick={e => { e.stopPropagation(); changeAbc(abcFilter === 'B' ? '' : 'B') }} />
                      <AbcChip label="C" count={totalC} active={abcFilter === 'C'} onClick={e => { e.stopPropagation(); changeAbc(abcFilter === 'C' ? '' : 'C') }} />
                    </div>
                  : <div style={{ display: 'flex', gap: 8 }}>
                      <span className="badge badge-A">A</span>
                      <span className="badge badge-B">B</span>
                      <span className="badge badge-C">C</span>
                    </div>
                }
              </button>
            )
          })}
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
              <select value={pedraFilter} onChange={e => { setPedraFilter(e.target.value); setPage(0) }} className="inp text-xs" style={{ minWidth: 160 }}>
                <option value="">Todas</option>
                {opts.pedras.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Fornecedor</div>
              <select value={fornFilter} onChange={e => { setFornFilter(e.target.value); setPage(0) }} className="inp text-xs" style={{ minWidth: 180 }}>
                <option value="">Todos</option>
                {opts.fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Categoria</div>
              <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setPage(0) }} className="inp text-xs" style={{ minWidth: 140 }}>
                <option value="">Todas</option>
                {opts.categorias.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <FilialSelector value={filialFilter} onChange={v => { setFilialFilter(v); setPage(0) }} />
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Código</div>
              <input value={codigoFilter} onChange={e => setCodigoFilter(e.target.value)} placeholder="ex: 215894" className="inp text-xs" style={{ width: 120 }} />
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
          {abcQ.isLoading
            ? <div className="state-box"><div className="spinner" /><p>Calculando {cDef.label}…</p></div>
            : (
              <div style={{ opacity: abcQ.isFetching ? 0.7 : 1, transition: 'opacity 0.15s' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: cDef.color }}>▌ {cDef.label}</p>
                  <p className="text-xs" style={{ color: 'var(--text-dim)' }}>{total.toLocaleString('pt-BR')} produtos</p>
                </div>

                <div className="tbl-scroll">
                  <table className="tbl" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <colgroup>
                      <col style={{ width: 44 }} />
                      <col style={{ width: 48 }} />
                      <col style={{ width: 120 }} />
                      <col style={{ width: 220 }} />
                      <col style={{ width: 80 }} />
                      <col style={{ width: 160 }} />
                      <col style={{ width: 55 }} />
                      <col style={{ width: 70 }} />
                      <col style={{ width: 70 }} />
                      <col style={{ width: 110 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th style={{ color: 'var(--text-muted)' }}>#</th>
                        <th style={{ color: 'var(--text-muted)' }}>Foto</th>
                        <TH k="produto"         label="Código"           sortK={sortK} sortD={sortD} onSort={changeSort} />
                        <TH k="descricao"       label="Descrição"        sortK={sortK} sortD={sortD} onSort={changeSort} />
                        <TH k="grupo"           label="Grupo"            sortK={sortK} sortD={sortD} onSort={changeSort} />
                        <TH k="nomeFornecedor"  label="Fornecedor"       sortK={sortK} sortD={sortD} onSort={changeSort} />
                        <TH k="_abc"            label="ABC"              sortK={sortK} sortD={sortD} onSort={changeSort} />
                        <TH k="_saldo"          label="Saldo"            sortK={sortK} sortD={sortD} onSort={changeSort} align="right" />
                        <TH k="_saldoDisp"      label="Disponível"       sortK={sortK} sortD={sortD} onSort={changeSort} align="right" />
                        <TH k="_metric"         label={cDef.metricLabel} sortK={sortK} sortD={sortD} onSort={changeSort} align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && !abcQ.isFetching && (
                        <tr><td colSpan={10}><div className="state-box text-sm">Nenhum produto encontrado</div></td></tr>
                      )}
                      {rows.map((row, i) => (
                        <tr key={i}>
                          <td style={{ color: 'var(--text-dim)', fontFamily: 'monospace', fontSize: 12 }}>{page * PAGE_LIMIT + i + 1}</td>
                          <td><FotoZoom url={row._foto} alt={row.descricao} /></td>
                          <td>
                            <div style={{ color: '#f5c518', fontFamily: 'monospace', fontSize: 11 }}>{row.produtoBase}</div>
                            <div style={{ color: 'var(--text-dim)', fontSize: 10 }}>{row.produto}</div>
                          </td>
                          <td>
                            <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)', fontSize: 12 }} title={row.descricao}>
                              {row.descricao ?? '-'}
                            </span>
                          </td>
                          <td style={{ color: '#00b4d8', fontSize: 12 }}>{row.grupo ?? '-'}</td>
                          <td style={{ fontSize: 11, color: '#a78bfa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.nomeFornecedor}>{row.nomeFornecedor || '-'}</td>
                          <td><BadgeABC value={row._abc} /></td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fNum(row._saldo)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', color: (row._saldoDisp ?? 0) > 0 ? '#4ade80' : '#f87171' }}>{fNum(row._saldoDisp ?? 0)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: cDef.color }}>{cDef.metricFmt(row._metric)}</td>
                        </tr>
                      ))}
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

function TH({ k, label, sortK, sortD, onSort, align = 'left' }) {
  const active = sortK === k
  return (
    <th onClick={() => onSort(k)} style={{ textAlign: align, cursor: 'pointer', userSelect: 'none' }}>
      <span style={{ color: active ? '#f5c518' : '#6b7280' }}>
        {label}{active ? (sortD === 'asc' ? ' ▲' : ' ▼') : ''}
      </span>
    </th>
  )
}

function AbcChip({ label, count, active, onClick }) {
  const colors = { A: { bg: '#14532d', fg: '#4ade80' }, B: { bg: '#7c2d12', fg: '#fb923c' }, C: { bg: '#7f1d1d', fg: '#f87171' } }
  const { bg, fg } = colors[label]
  return (
    <button onClick={onClick} style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700,
      background: active ? fg : bg, color: active ? '#0d0e16' : fg,
      border: `1px solid ${active ? fg : 'transparent'}`,
      cursor: 'pointer', transition: 'all 0.1s',
    }}>
      {label} {count.toLocaleString('pt-BR')}
    </button>
  )
}

function FotoZoom({ url, alt }) {
  const [visible, setVisible] = useState(!!url)
  const [pos,     setPos]     = useState(null)

  if (!url || !visible) return (
    <div style={{ width: 36, height: 36, background: 'var(--bg-input)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
      </svg>
    </div>
  )
  return (
    <div className="foto-zoom-container"
      onMouseEnter={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      <img src={url} alt={alt} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, background: 'var(--bg-input)', display: 'block' }}
        onError={() => setVisible(false)} />
      {pos && (
        <div className="foto-zoom-popup" style={{ left: pos.x + 16, top: Math.min(pos.y - 110, window.innerHeight - 230) }}>
          <img src={url} alt={alt} style={{ width: 200, height: 200, objectFit: 'contain', display: 'block', borderRadius: 6 }} />
        </div>
      )}
    </div>
  )
}
