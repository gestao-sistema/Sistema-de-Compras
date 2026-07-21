import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'
import { fMoeda, Kpi, Badge, FichaHeader, GraficoAno, GraficoParcelas, Modalidades, VoltarBtn, FiltroDatas, timelinePorAno } from '../components/FichaFin'

export default function VendedorDetalhePage() {
  const { codigo } = useParams()
  const navigate = useNavigate()
  const [filtros, setFiltros] = useState({})

  const q = useQuery({
    queryKey: ['financeiro-vendedor', codigo, filtros.de, filtros.ate, filtros.pagDe, filtros.pagAte],
    queryFn: () => api.financeiroVendedor(codigo, filtros),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchInterval: d => (d?.carregando ? 4000 : false),
  })

  const d = q.data || {}
  const t = d.totais || {}
  const cp = d.compras || {}
  const sit = d.situacao || {}
  const rk = d.ranking || {}
  const porAno = useMemo(() => timelinePorAno(d.timeline), [d.timeline])

  if (q.isLoading || d.carregando) {
    return <div className="page-body space-y-4"><VoltarBtn navigate={navigate} /><div className="state-box"><div className="spinner" /><p>Carregando ficha da vendedora…</p></div></div>
  }
  if (d.erro) {
    return <div className="page-body space-y-4"><VoltarBtn navigate={navigate} /><div className="err-box">{d.erro}</div></div>
  }

  const vend = d.vendedor || {}
  const pctPend = t.pctPend || 0
  const pctAlta = pctPend > 10

  return (
    <div className="page-body space-y-4">
      <VoltarBtn navigate={navigate} />

      <FichaHeader
        nome={vend.nome} sublabel={`vendedor(a) #${vend.codigo}`}
        badges={<>
          <Badge titulo="Ranking" valor={`#${fNum(rk.posicao)}`} sub={`de ${fNum(rk.deTotal)} vendedores`} cor="var(--accent-title, var(--accent))" />
          <Badge titulo="Clientes" valor={fNum(cp.nClientes)} sub="atendidos" cor="#c084fc" />
          <Badge titulo="Última venda" valor={cp.diasDesdeUltima != null ? `${fNum(cp.diasDesdeUltima)}d` : '—'} sub={cp.ultima || ''} cor={cp.diasDesdeUltima != null && cp.diasDesdeUltima <= 45 ? '#4ade80' : '#fb923c'} />
        </>}
      />

      <FiltroDatas filtros={filtros} setFiltros={setFiltros} />

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <Kpi label="Total Faturado" valor={fBRL(t.devido)} sub="histórico" cor="#93c5fd" />
        <Kpi label="Recebido" valor={fBRL(t.pago)} sub="valor pago" cor="#4ade80" />
        <Kpi label="Pendente" valor={fBRL(t.pend)} sub="em aberto" cor="#fb923c" />
        <Kpi label="% Pendência" valor={`${fNum(pctPend, 1)}%`} sub={pctAlta ? 'atenção' : 'saudável'} cor={pctAlta ? '#f87171' : '#f5c518'} />
        <Kpi label="Ticket Médio" valor={fBRL(cp.ticketMedio)} sub="por venda" cor="#c084fc" />
        <Kpi label="Vendas" valor={fNum(cp.nTitulos)} sub="nº de títulos" cor="#e8eaf0" />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Kpi label="Devoluções (NC)" valor={fBRL(t.notaCredito)} sub="notas de crédito" cor="#f472b6" />
        <Kpi label="Outros créditos" valor={fBRL(t.outrosCredito)} sub="adiantam./ajustes" cor="#f9a8d4" />
        <Kpi label="Primeira venda" valor={cp.primeira || '—'} sub="atuando desde" cor="#22d3ee" small />
        <Kpi label="Situação títulos" valor={`${fNum(sit.pagas)} pagos`} sub={`${fNum(sit.abertas)} em aberto · ${fNum(sit.vencidas)} vencidos`} cor={sit.vencidas > 0 ? '#f87171' : '#4ade80'} small />
      </div>

      <div className="card">
        <div className="sec-title">Faturamento por ano</div>
        <GraficoAno dados={porAno} />
      </div>

      <div className="card">
        <div className="sec-title">Vendas por nº de parcelas</div>
        <GraficoParcelas dados={d.parcelasDist} />
      </div>

      <div className="card">
        <div className="sec-title">Como recebe (modalidades)</div>
        <Modalidades itens={d.modalidades || []} />
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="sec-title" style={{ padding: '14px 18px 10px' }}>Top clientes ({fNum((d.clientes || []).length)})</div>
        <TopClientes clientes={d.clientes || []} navigate={navigate} />
      </div>
    </div>
  )
}

function TopClientes({ clientes, navigate }) {
  const [sortK, setSortK] = useState('total')
  const [sortD, setSortD] = useState('desc')
  const cell = { padding: '7px 10px', fontSize: 11.5, fontFamily: 'monospace', textAlign: 'center', whiteSpace: 'nowrap' }
  const head = { ...cell, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-title, var(--accent))', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }

  const sorted = useMemo(() => {
    const arr = [...clientes]
    arr.sort((a, b) => {
      const cmp = sortK === 'nome'
        ? String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
        : (Number(a[sortK]) || 0) - (Number(b[sortK]) || 0)
      return sortD === 'asc' ? cmp : -cmp
    })
    return arr
  }, [clientes, sortK, sortD])

  function toggle(k) {
    if (sortK === k) setSortD(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortK(k); setSortD(k === 'nome' ? 'asc' : 'desc') }
  }
  const seta = k => (sortK === k ? (sortD === 'asc' ? ' ▲' : ' ▼') : '')
  const cols = [
    { k: 'total', label: 'Faturado' },
    { k: 'pago', label: 'Recebido' },
    { k: 'pend', label: 'Pendente' },
    { k: 'pctPend', label: '% Pend.' },
    { k: 'titulos', label: 'Compras' },
  ]

  return (
    <div style={{ maxHeight: 460, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-input)', zIndex: 2, borderBottom: '2px solid var(--accent-title, var(--accent))' }}>
            <th style={{ ...head, textAlign: 'left', paddingLeft: 18, cursor: 'default' }}>#</th>
            <th style={{ ...head, textAlign: 'left' }} onClick={() => toggle('nome')}>Cliente{seta('nome')}</th>
            {cols.map(c => <th key={c.k} style={head} onClick={() => toggle(c.k)}>{c.label}{seta(c.k)}</th>)}
            <th style={{ ...head, cursor: 'default' }}>Ficha</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => {
            const alta = c.pctPend > 10
            return (
              <tr key={i} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'color-mix(in srgb, var(--accent-title, var(--accent)) 5%, transparent)' : undefined }}>
                <td style={{ ...cell, textAlign: 'left', paddingLeft: 18, color: 'var(--text-dim)', fontWeight: 700 }}>{i + 1}</td>
                <td style={{ padding: '7px 10px', fontSize: 11.5, textAlign: 'left', color: 'var(--text)', fontWeight: 600, maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${c.nome} · #${c.codigo}`}>{c.nome}</td>
                <td style={{ ...cell, color: '#93c5fd', fontWeight: 700 }}>{fMoeda(c.total)}</td>
                <td style={{ ...cell, color: '#4ade80', fontWeight: 700 }}>{fMoeda(c.pago)}</td>
                <td style={{ ...cell, color: '#fb923c', fontWeight: 700 }}>{c.pend > 0 ? fMoeda(c.pend) : '—'}</td>
                <td style={{ ...cell, color: alta ? '#f87171' : '#f5c518', fontWeight: 700 }}>{fNum(c.pctPend, 1)}%</td>
                <td style={{ ...cell, color: 'var(--text-muted)' }}>{fNum(c.titulos)}</td>
                <td style={cell}>
                  {c.codigo && (
                    <button onClick={() => navigate(`/financeiro/cliente/${c.codigo}`)} title="Abrir ficha do cliente"
                      style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 6, border: '1px solid var(--accent-title, var(--accent))', background: 'transparent', color: 'var(--accent-title, var(--accent))', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      ↗
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
