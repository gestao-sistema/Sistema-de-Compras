import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { api, fNum } from '../api/client'

const PRAZO_LIMITE = 60   // > 60 dias = fora do prazo

const toISO = s => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }
const dataNum = s => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[1]}/${m[2]}/${m[3]}` : (s || '—') }
const isoLabel = iso => { const [y, mo, d] = (iso || '').split('-'); return d ? `${d}/${mo}/${y}` : (iso || '—') }
const contaSla = st => !/cancel|res[ií]duo/i.test(st || '')

export default function AssistenciasSlaPage() {
  const navigate = useNavigate()
  const [prazoF, setPrazoF] = useState('todos')   // todos | no | fora
  const [sitF, setSitF]     = useState('todas')    // todas | abertas | entregues
  const [busca, setBusca]   = useState('')
  const [diaDe, setDiaDe]   = useState('')         // ISO aaaa-mm-dd
  const [diaAte, setDiaAte] = useState('')

  const q = useQuery({
    queryKey: ['assistencias-geral', 'todas'],
    queryFn: () => api.assistenciasGeral('todas'),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
  const rows = q.data?.rows || []

  // Deduplica por OS (exclui Cancelada/Resíduo — não são fluxo de serviço)
  const oss = useMemo(() => {
    const m = new Map()
    for (const r of rows) {
      if (!contaSla(r.statusOss)) continue
      const k = `${r.cliente}|${r.osCliente}`
      if (!m.has(k)) {
        m.set(k, {
          os: r.osCliente, cliente: r.cliente, clienteNome: r.clienteNome || '',
          fornecedor: r.fornecedor || '', entrada: r.dataEntrada || '',
          saida: r.dataEncerramento || '', dias: r.diasEmAberto, aberta: r.aberta,
          statusOss: r.statusOss || '',
        })
      } else { const o = m.get(k); if (!o.fornecedor && r.fornecedor) o.fornecedor = r.fornecedor }
    }
    return [...m.values()].map(o => ({ ...o, fora: o.dias != null && o.dias > PRAZO_LIMITE }))
  }, [rows])

  const bq = busca.trim().toLowerCase()

  // Base filtrada por conteúdo (prazo, situação, busca) — SEM o filtro de dia.
  // O "Por dia" e a lista partem daqui; só a lista aplica também o intervalo de dia.
  const base = useMemo(() => {
    let l = oss
    if (prazoF === 'no')   l = l.filter(o => o.dias != null && !o.fora)
    if (prazoF === 'fora') l = l.filter(o => o.fora)
    if (sitF === 'abertas')   l = l.filter(o => o.aberta)
    if (sitF === 'entregues') l = l.filter(o => !o.aberta)
    if (bq) l = l.filter(o => (o.clienteNome || '').toLowerCase().includes(bq) || (o.fornecedor || '').toLowerCase().includes(bq) || String(o.os || '').includes(bq))
    return l
  }, [oss, prazoF, sitF, bq])

  // Resumo por dia: quantas ABRIRAM (entrada) e quantas foram ENTREGUES (saída) naquele dia
  const porDia = useMemo(() => {
    const m = {}
    const bump = (iso, campo) => { if (!iso) return; (m[iso] = m[iso] || { dia: iso, abriram: 0, entregues: 0 })[campo]++ }
    for (const o of base) {
      bump(toISO(o.entrada), 'abriram')
      if (!o.aberta) bump(toISO(o.saida), 'entregues')
    }
    return Object.values(m).sort((a, b) => b.dia.localeCompare(a.dia))
  }, [base])

  // OS entra no filtro de dia se ENTROU ou SAIU dentro do intervalo
  const noDia = o => {
    if (!diaDe && !diaAte) return true
    const e = toISO(o.entrada), s = !o.aberta ? toISO(o.saida) : ''
    const dentro = iso => iso && (!diaDe || iso >= diaDe) && (!diaAte || iso <= diaAte)
    return dentro(e) || dentro(s)
  }
  const lista = useMemo(() => [...base.filter(noDia)].sort((a, b) => (b.dias || 0) - (a.dias || 0)), [base, diaDe, diaAte])

  // KPIs seguem a MESMA lógica dos filtros (refletem exatamente a lista exibida)
  const kpis = useMemo(() => {
    const comDias = lista.filter(o => o.dias != null)
    const fora = comDias.filter(o => o.fora).length
    const sla = comDias.length ? Math.round(comDias.reduce((s, o) => s + o.dias, 0) / comDias.length) : 0
    return {
      total: lista.length,
      abertas: lista.filter(o => o.aberta).length,
      entregues: lista.filter(o => !o.aberta).length,
      fora, noPrazo: comDias.length - fora, sla,
    }
  }, [lista])

  if (q.isLoading) {
    return <div className="page-body space-y-4"><Voltar navigate={navigate} /><div className="state-box"><div className="spinner" /><p>Carregando SLA…</p></div></div>
  }

  const th = { padding: '8px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--accent-title, var(--accent))', position: 'sticky', top: 0, background: 'var(--bg-input)', whiteSpace: 'nowrap' }
  const td = { padding: '7px 10px', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' }

  return (
    <div className="page-body space-y-4">
      <Voltar navigate={navigate} />

      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>SLA — Assistência Técnica</div>

      {/* KPIs */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <Kpi label="OSs" value={fNum(kpis.total)} sub={`${fNum(kpis.abertas)} abertas · ${fNum(kpis.entregues)} entregues`} cor="#22d3ee" />
        <Kpi label="SLA médio" value={`${fNum(kpis.sla)} d`} sub="dias por OS" cor="#f5c518" />
        <Kpi label="No prazo" value={fNum(kpis.noPrazo)} sub={`≤ ${PRAZO_LIMITE} dias`} cor="#4ade80" />
        <Kpi label="Fora do prazo" value={fNum(kpis.fora)} sub={`> ${PRAZO_LIMITE} dias`} cor="#f87171" />
        <Kpi label="Abertas" value={fNum(kpis.abertas)} sub="em andamento" cor="#fb923c" />
        <Kpi label="Entregues" value={fNum(kpis.entregues)} sub="encerradas" cor="#a3e635" />
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-end gap-4">
        <div>
          <div style={lbl}>Prazo</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <FBtn on={prazoF === 'todos'} onClick={() => setPrazoF('todos')} label="Todos" />
            <FBtn on={prazoF === 'no'} onClick={() => setPrazoF('no')} label="No prazo" cor="#4ade80" />
            <FBtn on={prazoF === 'fora'} onClick={() => setPrazoF('fora')} label="Fora do prazo" cor="#f87171" />
          </div>
        </div>
        <div>
          <div style={lbl}>Situação</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <FBtn on={sitF === 'todas'} onClick={() => setSitF('todas')} label="Todas" />
            <FBtn on={sitF === 'abertas'} onClick={() => setSitF('abertas')} label="Abertas" cor="#fb923c" />
            <FBtn on={sitF === 'entregues'} onClick={() => setSitF('entregues')} label="Entregues" cor="#a3e635" />
          </div>
        </div>
        <div>
          <div style={lbl}>Dia — de</div>
          <input type="date" value={diaDe} onChange={e => setDiaDe(e.target.value)} className="inp text-xs" style={{ width: 150 }} />
        </div>
        <div>
          <div style={lbl}>Dia — até</div>
          <input type="date" value={diaAte} onChange={e => setDiaAte(e.target.value)} className="inp text-xs" style={{ width: 150 }} />
        </div>
        <div>
          <div style={lbl}>Buscar</div>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Cliente, fornecedor, OS…" className="inp text-xs" style={{ width: 200 }} />
        </div>
        {(diaDe || diaAte || busca) && <button onClick={() => { setDiaDe(''); setDiaAte(''); setBusca('') }} className="btn-ghost text-xs" style={{ paddingBottom: 6 }}>✕ Limpar</button>}
        <div className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{fNum(lista.length)} OSs</div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '360px 1fr', alignItems: 'start' }}>
        {/* Resumo por dia */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="sec-title" style={{ padding: '12px 14px 8px' }}>Por dia — abriram × entregues</div>
          <div style={{ maxHeight: '62vh', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Dia</th>
                  <th style={{ ...th, textAlign: 'center' }}>Abriram</th>
                  <th style={{ ...th, textAlign: 'center' }}>Entregues</th>
                </tr>
              </thead>
              <tbody>
                {porDia.map((d, i) => {
                  const sel = diaDe === d.dia && diaAte === d.dia
                  return (
                    <tr key={d.dia} onClick={() => sel ? (setDiaDe(''), setDiaAte('')) : (setDiaDe(d.dia), setDiaAte(d.dia))}
                      title="Clique para filtrar este dia"
                      style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: sel ? 'color-mix(in srgb, var(--accent) 22%, transparent)' : i % 2 ? 'var(--bg-card2)' : undefined }}>
                      <td style={{ ...td, color: sel ? 'var(--accent-title, var(--accent))' : 'var(--text)', fontWeight: sel ? 800 : 400 }}>{isoLabel(d.dia)}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#fb923c', fontWeight: 700 }}>{d.abriram || '—'}</td>
                      <td style={{ ...td, textAlign: 'center', color: '#a3e635', fontWeight: 700 }}>{d.entregues || '—'}</td>
                    </tr>
                  )
                })}
                {porDia.length === 0 && <tr><td colSpan={3} style={{ ...td, color: 'var(--text-dim)', padding: 14 }}>Sem dados.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detalhe por OS */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="sec-title" style={{ padding: '12px 14px 8px' }}>OSs — entrou · saiu · permaneceu</div>
          <div style={{ maxHeight: '62vh', overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>OS</th>
                  <th style={{ ...th, textAlign: 'left' }}>Cliente</th>
                  <th style={{ ...th, textAlign: 'left' }}>Fornecedor</th>
                  <th style={{ ...th, textAlign: 'center' }}>Entrou</th>
                  <th style={{ ...th, textAlign: 'center' }}>Saiu</th>
                  <th style={{ ...th, textAlign: 'center' }}>Permaneceu</th>
                  <th style={{ ...th, textAlign: 'center' }}>Prazo</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((o, i) => (
                  <tr key={`${o.cliente}|${o.os}`} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'var(--bg-card2)' : undefined }}>
                    <td style={{ ...td, color: '#60a5fa', fontWeight: 700 }}>{o.os}</td>
                    <td style={{ padding: '7px 10px', fontSize: 11.5, color: 'var(--text)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.clienteNome}>{o.clienteNome || '—'}</td>
                    <td style={{ padding: '7px 10px', fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.fornecedor}>{o.fornecedor || '—'}</td>
                    <td style={{ ...td, textAlign: 'center', color: 'var(--text-sec)' }}>{dataNum(o.entrada)}</td>
                    <td style={{ ...td, textAlign: 'center', color: o.aberta ? 'var(--text-dim)' : '#4ade80' }}>{o.aberta ? '— (aberta)' : dataNum(o.saida)}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: o.fora ? '#f87171' : 'var(--text)' }}>{o.dias != null ? `${fNum(o.dias)} d` : '—'}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {o.dias == null ? '—' : (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: o.fora ? '#450a0a' : '#14532d', color: o.fora ? '#fca5a5' : '#86efac' }}>
                          {o.fora ? 'FORA DO PRAZO' : 'NO PRAZO'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && <tr><td colSpan={7} style={{ ...td, color: 'var(--text-dim)', padding: 14 }}>Nenhuma OS para este filtro.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
        Permaneceu = dias entre a entrada e a saída (OS aberta conta até hoje). Fora do prazo = mais de {PRAZO_LIMITE} dias. Canceladas e Resíduo não entram.
      </div>
    </div>
  )
}

function Voltar({ navigate }) {
  return <button onClick={() => navigate('/assistencias')} className="btn-ghost text-xs" style={{ alignSelf: 'flex-start' }}>← Voltar para Assistências</button>
}

function Kpi({ label, value, sub, cor }) {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${cor}`, minHeight: 84 }}>
      <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: cor, fontFamily: 'monospace' }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }}>{sub}</div>
    </div>
  )
}

const lbl = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: 'var(--accent-title, var(--accent))', marginBottom: 5 }
function FBtn({ on, onClick, label, cor }) {
  return (
    <button onClick={onClick} className="text-xs font-semibold rounded"
      style={on
        ? { background: cor || 'var(--accent)', color: '#0d0e16', padding: '6px 12px', border: '1px solid transparent' }
        : { background: 'var(--bg-input)', color: 'var(--text-nav)', border: '1px solid var(--border2)', padding: '6px 12px' }}>
      {label}
    </button>
  )
}
