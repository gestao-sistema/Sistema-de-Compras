import { useState, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'
import FotoZoom from '../components/FotoZoom'

function calcMarkup(custo, preco) {
  if (custo > 0 && preco > 0) return preco / custo
  return null
}
function fMarkup(custo, preco) {
  const mk = calcMarkup(custo, preco)
  return mk === null ? '—' : `${mk.toFixed(2)}x`
}
function mkColor(custo, preco) {
  const mk = calcMarkup(custo, preco)
  if (mk === null) return 'var(--text-muted)'
  return mk >= 3 ? '#a3e635' : mk >= 2 ? '#f5c518' : '#f87171'
}

const SORT_OPTS = [
  { id: 'lucro',    label: 'Lucro' },
  { id: 'margem',   label: 'Margem' },
  { id: 'vendidas', label: 'Qtd. Vendidas' },
]

export default function FornecedorPage() {
  const [sortBy,      setSortBy]      = useState('lucro')
  const [expanded,    setExpanded]    = useState(null)
  const [fornFiltro,  setFornFiltro]  = useState('')
  const [dataInicio,  setDataInicio]  = useState('')
  const [dataFim,     setDataFim]     = useState('')
  const [grupoFiltro, setGrupoFiltro] = useState('')
  const [tag2Filtro,  setTag2Filtro]  = useState('')
  const [pedraFiltro, setPedraFiltro] = useState('')
  const [rupturaFiltro, setRupturaFiltro] = useState('')

  const q = useQuery({
    queryKey:  ['fornecedores', fornFiltro, dataInicio, dataFim],
    queryFn:   () => api.fornecedores({
      fornecedor: fornFiltro || undefined,
      dataInicio: dataInicio || undefined,
      dataFim:    dataFim    || undefined,
    }),
    staleTime: 5 * 60 * 1000,
  })

  const data   = q.data || { nomesDisponiveis: [], fornecedores: [], duplicados: [] }
  const hasFilter = fornFiltro || dataInicio || dataFim || grupoFiltro || tag2Filtro || pedraFiltro || rupturaFiltro

  // Opções faceteadas: cada dropdown lista só o que existe considerando os DEMAIS
  // filtros de produto ativos (exclui o próprio). Assim, ao escolher Grupo, os dropdowns
  // de Tag2/Pedra passam a mostrar só o que existe dentro daquele grupo — e vice-versa.
  const allProds = useMemo(() => data.fornecedores.flatMap(f => f.produtos), [data.fornecedores])
  const opGrupos = useMemo(() => [...new Set(applyProdFiltros(allProds, { tag2Filtro, pedraFiltro, rupturaFiltro }).map(p => p.grupo).filter(Boolean))].sort(), [allProds, tag2Filtro, pedraFiltro, rupturaFiltro])
  const opTag2s  = useMemo(() => [...new Set(applyProdFiltros(allProds, { grupoFiltro, pedraFiltro, rupturaFiltro }).map(p => p.tag2).filter(Boolean))].sort(),  [allProds, grupoFiltro, pedraFiltro, rupturaFiltro])
  const opPedras = useMemo(() => [...new Set(applyProdFiltros(allProds, { grupoFiltro, tag2Filtro, rupturaFiltro }).map(p => p.pedra).filter(Boolean))].sort(), [allProds, grupoFiltro, tag2Filtro, rupturaFiltro])
  // Fornecedor segue os filtros de produto (quando nenhum fornecedor específico está fixado)
  const opForn = useMemo(() => {
    const anyProd = grupoFiltro || tag2Filtro || pedraFiltro || rupturaFiltro
    if (!anyProd || fornFiltro) return data.nomesDisponiveis
    const comMatch = new Set(data.fornecedores.filter(f => applyProdFiltros(f.produtos, { grupoFiltro, tag2Filtro, pedraFiltro, rupturaFiltro }).length > 0).map(f => f.nome))
    return data.nomesDisponiveis.filter(n => comMatch.has(n))
  }, [data.nomesDisponiveis, data.fornecedores, grupoFiltro, tag2Filtro, pedraFiltro, rupturaFiltro, fornFiltro])

  // filtro de produtos aplicado dentro de cada fornecedor
  const prodFiltros = { grupoFiltro, tag2Filtro, pedraFiltro, rupturaFiltro }

  const fornFiltered = useMemo(() => {
    const list = [...data.fornecedores]
    list.sort((a, b) => b.qtdVendida - a.qtdVendida)
    return list
  }, [data.fornecedores])

  function toggle(nome) { setExpanded(cur => cur === nome ? null : nome) }
  function reset() { setFornFiltro(''); setDataInicio(''); setDataFim(''); setGrupoFiltro(''); setTag2Filtro(''); setPedraFiltro(''); setRupturaFiltro('') }

  // KPIs — recalculados com base nos produtos filtrados
  const kpiProdutos = useMemo(() => {
    const todos = fornFiltered.flatMap(f => f.produtos)
    return applyProdFiltros(todos, prodFiltros)
  }, [fornFiltered, grupoFiltro, tag2Filtro, pedraFiltro, rupturaFiltro])

  const fornComProdutos = useMemo(() => {
    const hasProd = new Set(kpiProdutos.map(p => p.produto))
    return fornFiltered.filter(f => f.produtos.some(p => hasProd.has(p.produto)))
  }, [fornFiltered, kpiProdutos])

  const totVendida = kpiProdutos.reduce((s, p) => s + (p.vendida      || 0), 0)
  const totCusto   = kpiProdutos.reduce((s, p) => s + (p.custoVendas  || 0), 0)
  const totVenda   = kpiProdutos.reduce((s, p) => s + (p.vendaReal    || 0), 0)
  const totLucro   = totVenda - totCusto
  const totMargem  = totVenda > 0 ? (totLucro / totVenda) * 100 : 0

  return (
    <div className="page-body space-y-4">

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        <KPI label="Fornecedores"                       value={fNum(fornComProdutos.length)} color="#f5c518" sub="Total histórico" />
        <KPI label="Peças Vendidas"                     value={fNum(totVendida)}             color="#00b4d8" sub="Total histórico" />
        <KPI label="Custo Total"                        value={fBRL(totCusto)}               color="#f87171" sub="Total histórico" />
        <KPI label="Receita"                             value={fBRL(totVenda)}               color="#a3e635" sub="Total histórico" />
        <KPI label={`Lucro (${totMargem.toFixed(1)}%)`} value={fBRL(totLucro)}              color="#818cf8" sub="Total histórico" />
      </div>

      {/* Filtros + Classificação */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="flex items-end gap-4 flex-wrap">
          {/* Classificar por */}
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Classificar por</div>
            <div className="flex gap-1" style={{ background: 'var(--bg-card2)', borderRadius: 6, padding: 3 }}>
              {SORT_OPTS.map(o => (
                <button key={o.id} onClick={() => setSortBy(o.id)}
                  className="px-4 py-1.5 rounded text-xs font-bold transition-all"
                  style={sortBy === o.id
                    ? { background: '#f5c518', color: '#0d0e16' }
                    : { background: 'transparent', color: 'var(--text-muted)' }}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtro Fornecedor */}
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Fornecedor</div>
            <select value={fornFiltro} onChange={e => setFornFiltro(e.target.value)} className="inp text-xs" style={{ minWidth: 180 }}>
              <option value="">Todos</option>
              {opForn.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          {/* Filtro Data */}
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Emissão — De</div>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className="inp text-xs" style={{ width: 140 }} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Até</div>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className="inp text-xs" style={{ width: 140 }} />
          </div>

          {/* Grupo */}
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Grupo</div>
            <select value={grupoFiltro} onChange={e => setGrupoFiltro(e.target.value)} className="inp text-xs" style={{ minWidth: 130 }}>
              <option value="">Todos</option>
              {opGrupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          {/* Tag2 */}
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Tag2</div>
            <select value={tag2Filtro} onChange={e => setTag2Filtro(e.target.value)} className="inp text-xs" style={{ minWidth: 130 }}>
              <option value="">Todos</option>
              {opTag2s.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Tipo de Pedra */}
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Tipo de Pedra</div>
            <select value={pedraFiltro} onChange={e => setPedraFiltro(e.target.value)} className="inp text-xs" style={{ minWidth: 130 }}>
              <option value="">Todos</option>
              {opPedras.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {/* Ruptura */}
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Ruptura</div>
            <select value={rupturaFiltro} onChange={e => setRupturaFiltro(e.target.value)} className="inp text-xs" style={{ minWidth: 120 }}>
              <option value="">Todos</option>
              <option value="ruptura">Ruptura</option>
              <option value="risco">Risco</option>
            </select>
          </div>

          {hasFilter && <button onClick={reset} className="btn-ghost text-xs self-end">✕ Limpar</button>}
        </div>
      </div>

      {q.isLoading
        ? <div className="state-box"><div className="spinner" /><p>Carregando fornecedores…</p></div>
        : q.isError
        ? <div className="state-box"><p style={{ color: '#f87171' }}>Erro: {q.error?.message}</p></div>
        : <>
            <GlobalTop7 fornecedores={fornFiltered} sortBy={sortBy} prodFiltros={prodFiltros} />
            <ResumoTab fornecedores={fornFiltered} expanded={expanded} toggle={toggle} sortBy={sortBy} prodFiltros={prodFiltros} />
          </>
      }
    </div>
  )
}

// ─── TOP 7 GLOBAL ─────────────────────────────────────────────────────────────
function GlobalTop7({ fornecedores, sortBy, prodFiltros }) {
  const allProdutos = useMemo(() => {
    const todos = fornecedores.flatMap(f =>
      f.produtos.map(p => ({ ...p, nomeFornecedor: f.nome }))
    )
    return applyProdFiltros(todos, prodFiltros)
  }, [fornecedores, prodFiltros])

  if (allProdutos.length === 0) return null
  return <Top7Vendidos produtos={allProdutos} sortBy={sortBy} globalLabel />
}

function applyProdFiltros(produtos, { grupoFiltro, tag2Filtro, pedraFiltro, rupturaFiltro }) {
  let list = produtos
  if (grupoFiltro)  list = list.filter(p => p.grupo === grupoFiltro)
  if (tag2Filtro)   list = list.filter(p => p.tag2  === tag2Filtro)
  if (pedraFiltro)  list = list.filter(p => p.pedra === pedraFiltro)
  if (rupturaFiltro === 'ruptura') list = list.filter(p => p.ruptura)
  if (rupturaFiltro === 'risco')   list = list.filter(p => p.risco)
  return list
}

// ─── ABA RESUMO ───────────────────────────────────────────────────────────────
function ResumoTab({ fornecedores, expanded, toggle, sortBy, prodFiltros }) {
  const [visivel, setVisivel] = useState(15)
  const hasProdFiltro = prodFiltros.grupoFiltro || prodFiltros.tag2Filtro || prodFiltros.pedraFiltro || prodFiltros.rupturaFiltro
  const visiveis = fornecedores.slice(0, visivel)

  if (fornecedores.length === 0)
    return <div className="state-box"><p>Nenhum fornecedor encontrado.</p></div>

  return (
    <div className="space-y-3">
      {visiveis.map(f => {
        const produtos = hasProdFiltro ? applyProdFiltros(f.produtos, prodFiltros) : f.produtos

        const isOpen  = expanded === f.nome
        const mgColor = f.margem >= 50 ? '#a3e635' : f.margem >= 30 ? '#f5c518' : '#f87171'

        return (
          <div key={f.nome} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div onClick={() => toggle(f.nome)} style={{
              cursor: 'pointer', padding: '14px 20px',
              display: 'flex', alignItems: 'center', gap: 16,
              background: isOpen ? 'var(--bg-hover)' : 'var(--bg-card2)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = isOpen ? 'var(--bg-hover)' : 'var(--bg-card2)'}>

              <span style={{ color: '#f5c518', fontSize: 13, width: 14 }}>{isOpen ? '▼' : '▶'}</span>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{f.nome}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {hasProdFiltro ? `${produtos.length} produto${produtos.length !== 1 ? 's' : ''} filtrados` : `${f.produtosCount} produto${f.produtosCount !== 1 ? 's' : ''}`}
                  {f.pedidosCount > 0 ? ` · ${f.pedidosCount} pedido${f.pedidosCount !== 1 ? 's' : ''} em aberto` : ''}{' · '}
                  <span style={{ color: '#00b4d8' }}>{fNum(f.qtdVendida)} peças vendidas</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 28, flexShrink: 0 }}>
                <Stat label="Custo Total" value={fBRL(f.custoVendas)} color="#f87171" />
                <Stat label="Receita"     value={fBRL(f.vendaReal)}   color="#a3e635" />
                <Stat label="Lucro"       value={fBRL(f.lucro)}       color="#818cf8" />
                <Stat label="Margem"      value={`${f.margem.toFixed(1)}%`} color={mgColor} />
              </div>
            </div>

            {/* Detalhe expandido */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <Top7Vendidos produtos={produtos} sortBy={sortBy} />
                <TodosProdutos produtos={produtos} sortBy={sortBy} />
              </div>
            )}
          </div>
        )
      })}
      {visivel < fornecedores.length && (
        <button
          onClick={() => setVisivel(v => v + 15)}
          className="btn-ghost w-full text-xs"
          style={{ marginTop: 4 }}
        >
          ↓ Carregar mais ({fornecedores.length - visivel} restantes)
        </button>
      )}
    </div>
  )
}

// ─── Top 5 do fornecedor (ordem segue sortBy) ────────────────────────────────
const TOP5_LABEL = { lucro: 'Maior Lucro', margem: 'Maior Margem', vendidas: 'Mais Vendidos' }
const TOP5_SORT  = {
  lucro:    (a, b) => b.lucro    - a.lucro,
  margem:   (a, b) => b.margem   - a.margem,
  vendidas: (a, b) => b.vendida  - a.vendida,
}

function Top7Vendidos({ produtos, sortBy = 'vendidas', globalLabel = false }) {
  const limit = globalLabel ? 5 : 6
  const top7 = [...produtos]
    .filter(p => (p.vendida > 0 || p.lucro > 0) && p.custo > 0)
    .sort(TOP5_SORT[sortBy] || TOP5_SORT.vendidas)
    .slice(0, limit)

  if (top7.length === 0) return null

  return (
    <div style={{ background: 'var(--bg-card2)', borderBottom: '2px solid #f5c51830', padding: '12px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#f5c518', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          ★ {globalLabel ? `🌐 Geral — Top 5 ${TOP5_LABEL[sortBy] || TOP5_LABEL.vendidas}` : `Top 6 ${TOP5_LABEL[sortBy] || TOP5_LABEL.vendidas}`}
        </span>
        <div style={{ flex: 1, height: 1, background: '#f5c51830' }} />
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {top7.map((p, i) => {
          const mgColor  = p.margem >= 50 ? '#a3e635' : p.margem >= 30 ? '#f5c518' : '#f87171'
          const medals   = ['🥇', '🥈', '🥉', '4°', '5°', '6°', '7°', '8°', '9°', '10°', '11°', '12°']
          return (
            <div key={p.produto} style={{
              flex: '1 1 180px', minWidth: 170, maxWidth: 220,
              background: i === 0 ? '#1a1500' : '#111320',
              border: `1px solid ${i === 0 ? '#f5c518' : '#2a2d40'}`,
              borderRadius: 8, padding: '10px 12px',
              position: 'relative', overflow: 'hidden',
            }}>
              {/* Posição */}
              <div style={{ position: 'absolute', top: 6, right: 8, fontSize: i < 3 ? 16 : 11,
                color: i < 3 ? undefined : '#4b5063', fontWeight: 700 }}>
                {medals[i]}
              </div>

              {/* Foto + código */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6 }}>
                <FotoZoom
                  url={p.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(p.fotoUrl)}` : null}
                  alt={p.descricao} size={36} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#f5c518' }}>{p.produto}</div>
                  <div style={{ fontSize: 10, color: '#00b4d8' }}>{p.grupo}</div>
                </div>
              </div>

              {/* Descrição */}
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ffffff', marginBottom: 8,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={p.descricao}>{p.descricao}</div>

              {/* Métricas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                <Metric label="QTD. Vend."     value={fNum(p.vendida)}             color="#f5c518" bold />
                <Metric label="Estoque Total"  value={fNum(p.saldo)}               color="#f5c518" />
                <Metric label="Receita"        value={fBRL(p.vendaReal)}           color="#a3e635" />
                <Metric label="Lucro"          value={fBRL(p.lucro)}               color="#818cf8" />
                <Metric label="Valor Un Venda" value={fBRL(p.preco)}               color="#00b4d8" />
                <Metric label="Custo"          value={fBRL(p.custo)}               color="#f87171" />
                <Metric label="Markup"         value={fMarkup(p.custo, p.preco)}   color={mkColor(p.custo, p.preco)} />
                <Metric label="Margem"         value={`${p.margem.toFixed(1)}%`}   color={mgColor} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Metric({ label, value, color, bold }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: '#8b93b0', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 12, fontFamily: 'monospace', color, fontWeight: bold ? 800 : 600 }}>{value}</div>
    </div>
  )
}

// ─── Todos os produtos do fornecedor, ordem decrescente de vendas ─────────────
const PAGE_SIZE = 100

function TodosProdutos({ produtos, sortBy }) {
  const [limite, setLimite] = useState(PAGE_SIZE)
  // volta pro início quando a ordenação muda
  const prevSort = useRef(sortBy)
  if (prevSort.current !== sortBy) { prevSort.current = sortBy; setLimite(PAGE_SIZE) }
  const sorted = useMemo(() => {
    const list = [...produtos]
    if (sortBy === 'margem')   list.sort((a, b) => b.margem     - a.margem)
    else if (sortBy === 'lucro') list.sort((a, b) => b.lucro    - a.lucro)
    else                         list.sort((a, b) => b.vendida  - a.vendida)
    return list
  }, [produtos, sortBy])
  const visivel = sorted.slice(0, limite)

  return (
    <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
      <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card2)', borderBottom: '2px solid #22253a', position: 'sticky', top: 0, zIndex: 10 }}>
            {['Foto','Código','Descrição','Grupo','Estoque Total','QTD. Vend.','Custo Unit.','Custo Total','PV UN','Receita','Lucro','MG(%)','Markup'].map(h => (
              <th key={h} style={{ ...thStyle(h==='Descrição'), fontSize: 10, background: 'var(--bg-card2)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visivel.map((p, i) => {
            const mgColor = p.margem >= 50 ? '#a3e635' : p.margem >= 30 ? '#f5c518' : '#f87171'
            const isTop7  = i < 6
            return (
              <tr key={p.produto} style={{
                background: isTop7
                  ? (i === 0 ? 'color-mix(in srgb, #f5c518 8%, var(--bg-card))' : 'color-mix(in srgb, #818cf8 5%, var(--bg-card))')
                  : 'transparent',
                borderBottom: `1px solid ${isTop7 ? 'var(--accent)20' : 'var(--border)'}`,
              }}>
                <td style={td}>
                  <FotoZoom url={p.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(p.fotoUrl)}` : null} alt={p.descricao} size={30} />
                </td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#f5c518', whiteSpace: 'nowrap' }}>{p.produto}</td>
                <td style={{ ...td, fontSize: 12, color: 'var(--text)', maxWidth: 220 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.descricao}>{p.descricao}</div>
                </td>
                <td style={{ ...td, textAlign: 'center', fontSize: 11, color: '#00b4d8' }}>{p.grupo}</td>
                <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', color: p.saldo <= 0 ? '#f87171' : 'var(--text)' }}>{fNum(p.saldo)}</td>
                <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', color: isTop7 ? '#f5c518' : 'var(--text)', fontWeight: isTop7 ? 800 : 400 }}>{fNum(p.vendida)}</td>
                <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#f87171' }}>{(p.custo ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#f87171', fontWeight: 700 }}>{fBRL(p.custoVendas)}</td>
                <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#a3e635' }}>{fBRL(p.preco)}</td>
                <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#a3e635', fontWeight: 700 }}>{fBRL(p.vendaReal)}</td>
                <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, color: '#818cf8', fontWeight: 700 }}>{fBRL(p.lucro)}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: 12, color: mgColor }}>{p.margem.toFixed(1)}%</td>
                <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: mkColor(p.custo, p.preco) }}>{fMarkup(p.custo, p.preco)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {limite < sorted.length && (
        <div style={{ textAlign: 'center', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setLimite(l => l + PAGE_SIZE)}
            style={{
              background: '#22253a', border: '1px solid #3a3f5c', borderRadius: 6,
              color: '#818cf8', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              padding: '7px 20px',
            }}
          >
            Carregar mais ({sorted.length - limite} restantes)
          </button>
        </div>
      )}
    </div>
  )
}

// ─── ABA PRODUTOS EM COMUM ────────────────────────────────────────────────────
function DuplicadosTab({ duplicados, allFornNames }) {
  if (duplicados.length === 0)
    return <div className="state-box"><p>Nenhum produto em comum entre fornecedores.</p></div>

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr style={{ background: 'var(--bg-card2)', borderBottom: '2px solid #2a2d40' }}>
            <th style={thStyle(false)}>Foto</th>
            <th style={thStyle(false)}>Código</th>
            <th style={thStyle(true)}>Descrição</th>
            <th style={thStyle(false)}>Grupo</th>
            <th style={thStyle(false)}>Preço Venda</th>
            {allFornNames.map(n => (
              <th key={n} style={{ ...thStyle(false), color: '#f5c518', minWidth: 130 }}>{n}</th>
            ))}
            <th style={thStyle(false)}>Diferença</th>
          </tr>
        </thead>
        <tbody>
          {duplicados.map((d, i) => {
            // mapa rápido por nome
            const fornMap = {}
            d.fornecedores.forEach(f => { fornMap[f.nome] = f })
            const precos  = d.fornecedores.map(f => f.custoMedio).filter(v => v > 0)
            const minCost = precos.length ? Math.min(...precos) : 0
            const maxCost = precos.length ? Math.max(...precos) : 0
            const diffPct = minCost > 0 ? (((maxCost - minCost) / minCost) * 100).toFixed(1) : null

            return (
              <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card2)', borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...td, width: 44 }}>
                  <FotoZoom url={d.fotoUrl ? `/api/image-proxy?url=${encodeURIComponent(d.fotoUrl)}` : null} alt={d.descricao} size={32} />
                </td>
                <td style={{ ...td, fontFamily: 'monospace', fontSize: 11, color: '#f5c518', whiteSpace: 'nowrap' }}>{d.produto}</td>
                <td style={{ ...td, fontSize: 12, color: 'var(--text)', maxWidth: 200 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.descricao}>{d.descricao}</div>
                  <div style={{ fontSize: 10, color: '#4b5563' }}>{d.grupo}</div>
                </td>
                <td style={{ ...td, textAlign: 'center', fontSize: 11, color: '#00b4d8' }}>{d.grupo}</td>
                <td style={{ ...td, textAlign: 'center', fontFamily: 'monospace', color: '#a3e635', fontWeight: 700 }}>{fBRL(d.preco)}</td>

                {allFornNames.map(nome => {
                  const f       = fornMap[nome]
                  const isBest  = f && f.custoMedio === minCost && minCost < maxCost
                  const isWorst = f && f.custoMedio === maxCost && minCost < maxCost
                  return (
                    <td key={nome} style={{ ...td, textAlign: 'center' }}>
                      {f ? (
                        <div style={{
                          display: 'inline-block',
                          background: isBest ? '#14290f' : isWorst ? '#2d0f0f' : 'var(--bg-card2)',
                          border: `1px solid ${isBest ? '#4ade80' : isWorst ? '#f87171' : '#2a2d40'}`,
                          borderRadius: 6, padding: '4px 10px',
                        }}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                            color: isBest ? '#4ade80' : isWorst ? '#f87171' : '#e8eaf0' }}>
                            {fBRL(f.custoMedio)}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{fNum(f.qtd)} un.</div>
                        </div>
                      ) : (
                        <span style={{ color: '#2a2d40', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  )
                })}

                <td style={{ ...td, textAlign: 'center' }}>
                  {diffPct !== null ? (
                    <span style={{ fontSize: 11, background: '#2d1a0a', border: '1px solid #92400e',
                      borderRadius: 4, padding: '3px 8px', color: '#fbbf24', fontWeight: 700 }}>
                      +{diffPct}%
                    </span>
                  ) : <span style={{ color: 'var(--text-dim)' }}>—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function KPI({ label, value, color, sub }) {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color, fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: 'monospace' }}>{value}</div>
    </div>
  )
}

function thStyle(left = false) {
  return {
    padding: '8px 10px', textAlign: left ? 'left' : 'center',
    color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  }
}

const td = { padding: '7px 10px' }
