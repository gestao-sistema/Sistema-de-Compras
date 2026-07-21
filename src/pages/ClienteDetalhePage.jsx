import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'
import { fMoeda, Kpi, Badge, FichaHeader, GraficoAno, GraficoParcelas, Modalidades, BarraLinha, VoltarBtn, FiltroDatas, timelinePorAno } from '../components/FichaFin'

export default function ClienteDetalhePage() {
  const { codigo } = useParams()
  const navigate = useNavigate()
  const [filtros, setFiltros] = useState({})

  const q = useQuery({
    queryKey: ['financeiro-cliente', codigo, filtros.de, filtros.ate, filtros.pagDe, filtros.pagAte],
    queryFn: () => api.financeiroCliente(codigo, filtros),
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
    return <div className="page-body space-y-4"><VoltarBtn navigate={navigate} /><div className="state-box"><div className="spinner" /><p>Carregando ficha do cliente…</p></div></div>
  }
  if (d.erro) {
    return <div className="page-body space-y-4"><VoltarBtn navigate={navigate} /><div className="err-box">{d.erro}</div></div>
  }

  const cli = d.cliente || {}
  const pctPend = t.pctPend || 0
  const pctAlta = pctPend > 10
  const vendMax = Math.max(...(d.vendedores || []).map(v => Math.abs(v.total)), 1)

  return (
    <div className="page-body space-y-4">
      <VoltarBtn navigate={navigate} />

      <FichaHeader
        nome={cli.nome} sublabel={`cliente #${cli.codigo}`}
        badges={<>
          <Badge titulo="Ranking" valor={`#${fNum(rk.posicao)}`} sub={`de ${fNum(rk.deTotal)} clientes`} cor="var(--accent-title, var(--accent))" />
          <Badge titulo="Última compra" valor={cp.diasDesdeUltima != null ? `${fNum(cp.diasDesdeUltima)}d` : '—'} sub={cp.ultima || ''} cor={cp.diasDesdeUltima != null && cp.diasDesdeUltima <= 45 ? '#4ade80' : '#fb923c'} />
        </>}
      />

      <FiltroDatas filtros={filtros} setFiltros={setFiltros} />

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <Kpi label="Total Faturado" valor={fBRL(t.devido)} sub="histórico" cor="#93c5fd" />
        <Kpi label="Recebido" valor={fBRL(t.pago)} sub="valor pago" cor="#4ade80" />
        <Kpi label="Pendente" valor={fBRL(t.pend)} sub="em aberto" cor="#fb923c" />
        <Kpi label="% Pendência" valor={`${fNum(pctPend, 1)}%`} sub={pctAlta ? 'atenção' : 'saudável'} cor={pctAlta ? '#f87171' : '#f5c518'} />
        <Kpi label="Ticket Médio" valor={fBRL(cp.ticketMedio)} sub="por compra" cor="#c084fc" />
        <Kpi label="Compras" valor={fNum(cp.nTitulos)} sub="nº de títulos" cor="#e8eaf0" />
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <Kpi label="Devoluções (NC)" valor={fBRL(t.notaCredito)} sub="notas de crédito" cor="#f472b6" />
        <Kpi label="Outros créditos" valor={fBRL(t.outrosCredito)} sub="adiantam./ajustes" cor="#f9a8d4" />
        <Kpi label="Primeira compra" valor={cp.primeira || '—'} sub="cliente desde" cor="#22d3ee" small />
        <Kpi label="Situação títulos" valor={`${fNum(sit.pagas)} pagos`} sub={`${fNum(sit.abertas)} em aberto · ${fNum(sit.vencidas)} vencidos`} cor={sit.vencidas > 0 ? '#f87171' : '#4ade80'} small />
      </div>

      <div className="card">
        <div className="sec-title">Faturamento por ano</div>
        <GraficoAno dados={porAno} />
      </div>

      <div className="card">
        <div className="sec-title">Compras por nº de parcelas</div>
        <GraficoParcelas dados={d.parcelasDist} />
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <div className="sec-title">Como o cliente paga</div>
          <Modalidades itens={d.modalidades || []} />
        </div>
        <div className="card">
          <div className="sec-title">Vendedores que atenderam</div>
          {(d.vendedores || []).length === 0
            ? <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 4 }}>
                {(d.vendedores || []).slice(0, 8).map((v, i) => (
                  <BarraLinha key={i} label={v.nome} valor={v.total} extra={fNum(v.titulos)} pct={(Math.abs(v.total) / vendMax) * 100} />
                ))}
              </div>}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="sec-title" style={{ padding: '14px 18px 10px' }}>Títulos ({fNum((d.contas || []).length)})</div>
        <Contas contas={d.contas || []} />
      </div>
    </div>
  )
}

function Contas({ contas }) {
  const cell = { padding: '7px 10px', fontSize: 11.5, fontFamily: 'monospace', textAlign: 'center', whiteSpace: 'nowrap' }
  const head = { ...cell, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent-title, var(--accent))', textAlign: 'center' }
  const lista = contas.slice(0, 300)
  return (
    <div style={{ maxHeight: 420, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-input)', zIndex: 2, borderBottom: '2px solid var(--accent-title, var(--accent))' }}>
            <th style={{ ...head, textAlign: 'left', paddingLeft: 18 }}>Documento</th>
            <th style={head}>Emissão</th>
            <th style={{ ...head, textAlign: 'left' }}>Histórico</th>
            <th style={head}>Devido</th>
            <th style={head}>Recebido</th>
            <th style={head}>Pendente</th>
            <th style={head}>Situação</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((c, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'color-mix(in srgb, var(--accent-title, var(--accent)) 5%, transparent)' : undefined }}>
              <td style={{ ...cell, textAlign: 'left', paddingLeft: 18, color: '#60a5fa', fontWeight: 700 }}>{c.prefixo} {c.numero}</td>
              <td style={{ ...cell, color: 'var(--text-sec)' }}>{c.emissao || '—'}</td>
              <td style={{ padding: '7px 10px', fontSize: 11, textAlign: 'left', color: 'var(--text)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.historico}>{c.historico || '—'}</td>
              <td style={{ ...cell, color: '#93c5fd', fontWeight: 700 }}>{fMoeda(c.devido)}</td>
              <td style={{ ...cell, color: '#4ade80', fontWeight: 700 }}>{fMoeda(c.pago)}</td>
              <td style={{ ...cell, color: '#fb923c', fontWeight: 700 }}>{c.pend > 0 ? fMoeda(c.pend) : '—'}</td>
              <td style={cell}>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: c.aberto ? '#7c2d12' : '#14532d', color: c.aberto ? '#fdba74' : '#86efac' }}>
                  {c.aberto ? 'EM ABERTO' : 'PAGO'}
                </span>
              </td>
            </tr>
          ))}
          {contas.length > lista.length && (
            <tr><td colSpan={7} style={{ ...cell, color: 'var(--text-dim)', padding: '10px' }}>+{fNum(contas.length - lista.length)} títulos mais antigos…</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
