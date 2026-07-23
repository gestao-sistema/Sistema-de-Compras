import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api, fBRL, fNum } from '../api/client'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const labelMes = m => { const [y, mm] = (m || '').split('-'); return mm ? `${MESES[+mm - 1]}/${String(y).slice(2)}` : m }
const labelDia = d => { const p = (d || '').split('-'); return p[2] ? `${p[2]}/${p[1]}` : d }
const fBRLc = v => { const a = Math.abs(v || 0); if (a >= 1e9) return `R$ ${(v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} bi`; if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`; if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`; return fBRL(v) }
const fNumc = v => { const a = Math.abs(v || 0); if (a >= 1e6) return `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`; if (a >= 1e3) return `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`; return fNum(v) }
const VAZIO = { pecas: 0, valorCusto: 0, valorVenda: 0, skus: 0, lancamentos: 0, fornecedores: 0 }

export default function LancamentosDashPage() {
  const navigate = useNavigate()
  const [sel, setSel] = useState('todos')      // todos | efetivado | parcial
  const [metrica, setMetrica] = useState('valorCusto')  // valorCusto | valorVenda | pecas

  const q = useQuery({
    queryKey: ['lancamentos'],
    queryFn: api.lancamentos,
    staleTime: 5 * 60 * 1000,
    refetchInterval: query => (query.state.data?.building ? 15000 : false),
  })
  const data = q.data || {}
  const meses = data.meses || []
  const pick = node => (node && (node[sel] || node.todos)) || node || VAZIO
  const total = pick(data.totalGeral)

  // Série por mês (valores/peças do status escolhido)
  const porMes = useMemo(() => meses.map(m => ({ mes: m.mes, ...pick(m) })).filter(m => m.pecas > 0), [meses, sel])

  // Top fornecedores (soma dos valores/peças ao longo de tudo)
  const porForn = useMemo(() => {
    const map = {}
    for (const m of meses) for (const d of (m.dias || [])) for (const f of (d.fornecedores || [])) {
      const v = pick(f)
      if (v.pecas <= 0) continue
      if (!map[f.nome]) map[f.nome] = { nome: f.nome, pecas: 0, valorCusto: 0, valorVenda: 0 }
      map[f.nome].pecas += v.pecas; map[f.nome].valorCusto += v.valorCusto; map[f.nome].valorVenda += v.valorVenda
    }
    return Object.values(map).sort((a, b) => b[metrica] - a[metrica]).slice(0, 15)
  }, [meses, sel, metrica])

  // Por dia (todos os dias, mês a mês)
  const porDia = useMemo(() => {
    const arr = []
    for (const m of meses) for (const d of (m.dias || [])) {
      const v = pick(d)
      if (v.pecas > 0) arr.push({ dia: d.dia, ...v })
    }
    return arr.sort((a, b) => b.dia.localeCompare(a.dia))
  }, [meses, sel])

  if (q.isLoading || data.building) {
    return <div className="page-body space-y-4"><Voltar navigate={navigate} /><div className="state-box"><div className="spinner" /><p>{data.building ? 'Preparando os dados…' : 'Carregando…'}</p></div></div>
  }

  const metricaLabel = metrica === 'valorVenda' ? 'valor a venda' : metrica === 'pecas' ? 'peças' : 'valor a custo'
  const fmtMetrica = v => (metrica === 'pecas' ? fNum(v) : fBRL(v))
  const mesMax = Math.max(...porMes.map(m => m[metrica]), 1)
  const fornMax = Math.max(...porForn.map(f => f[metrica]), 1)
  const th = { padding: '8px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--accent-title, var(--accent))', position: 'sticky', top: 0, background: 'var(--bg-input)', whiteSpace: 'nowrap' }
  const td = { padding: '7px 10px', fontSize: 12, fontFamily: 'monospace', whiteSpace: 'nowrap' }

  return (
    <div className="page-body space-y-4">
      <Voltar navigate={navigate} />
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)' }}>Dashboard de Lançamentos</div>

      {/* KPIs */}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <Kpi label="Valor a Custo" value={fBRLc(total.valorCusto)} title={fBRL(total.valorCusto)} cor="#a3e635" />
        <Kpi label="Valor a Venda" value={fBRLc(total.valorVenda)} title={fBRL(total.valorVenda)} cor="#f5c518" />
        <Kpi label="Peças" value={fNumc(total.pecas)} title={fNum(total.pecas)} cor="#818cf8" />
        <Kpi label="SKUs" value={fNum(total.skus)} cor="#00b4d8" />
        <Kpi label="Lançamentos" value={fNum(total.lancamentos)} cor="#f472b6" />
        <Kpi label="Fornecedores" value={fNum(total.fornecedores)} cor="#60a5fa" />
      </div>

      {/* Filtros */}
      <div className="card flex flex-wrap items-end gap-4">
        <div>
          <div style={lbl}>Status</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <FBtn on={sel === 'todos'} onClick={() => setSel('todos')} label="Todos" />
            <FBtn on={sel === 'efetivado'} onClick={() => setSel('efetivado')} label="Efetivado" cor="#4ade80" />
            <FBtn on={sel === 'parcial'} onClick={() => setSel('parcial')} label="Parcialmente" cor="#f5c518" />
          </div>
        </div>
        <div>
          <div style={lbl}>Métrica dos gráficos</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <FBtn on={metrica === 'valorCusto'} onClick={() => setMetrica('valorCusto')} label="A custo" cor="#a3e635" />
            <FBtn on={metrica === 'valorVenda'} onClick={() => setMetrica('valorVenda')} label="A venda" cor="#f5c518" />
            <FBtn on={metrica === 'pecas'} onClick={() => setMetrica('pecas')} label="Peças" cor="#818cf8" />
          </div>
        </div>
      </div>

      {/* Valor por mês */}
      <div className="card">
        <div className="sec-title">Por mês — {metricaLabel}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 200, paddingTop: 22, overflowX: 'auto' }}>
          {porMes.map(m => {
            const h = Math.max(3, (m[metrica] / mesMax) * 150)
            return (
              <div key={m.mes} title={`${labelMes(m.mes)} · custo ${fBRL(m.valorCusto)} · venda ${fBRL(m.valorVenda)} · ${fNum(m.pecas)} peças · ${fNum(m.lancamentos)} lançamentos`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '1 0 44px', minWidth: 44 }}>
                <div style={{ fontSize: 9.5, color: '#c084fc', fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{metrica === 'pecas' ? fNumc(m[metrica]) : fBRLc(m[metrica])}</div>
                <div style={{ width: '100%', maxWidth: 46, height: h, borderRadius: '6px 6px 0 0', background: 'linear-gradient(180deg,#d8b4fe,#a855f7 60%,#7c3aed)', boxShadow: '0 0 12px rgba(168,85,247,.35)' }} />
                <div style={{ fontSize: 10, color: 'var(--text-sec)', fontWeight: 700, fontFamily: 'monospace' }}>{labelMes(m.mes)}</div>
              </div>
            )
          })}
          {porMes.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Sem dados para este status.</div>}
        </div>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        {/* Top fornecedores */}
        <div className="card">
          <div className="sec-title">Top fornecedores — {metricaLabel}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 6 }}>
            {porForn.map(f => (
              <div key={f.nome} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 150, flexShrink: 0, fontSize: 11.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.nome}>{f.nome}</span>
                <div style={{ flex: 1, height: 16, borderRadius: 5, background: 'var(--bg-input)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.max(2, (f[metrica] / fornMax) * 100)}%`, background: '#a855f7', borderRadius: 5 }} />
                </div>
                <span style={{ width: 96, textAlign: 'right', fontFamily: 'monospace', fontSize: 11.5, fontWeight: 700, color: '#c084fc' }}>{fmtMetrica(f[metrica])}</span>
              </div>
            ))}
            {porForn.length === 0 && <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</div>}
          </div>
        </div>

        {/* Por dia */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="sec-title" style={{ padding: '12px 14px 8px' }}>Por dia ({fNum(porDia.length)})</div>
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Dia</th>
                  <th style={{ ...th, textAlign: 'center' }}>Peças</th>
                  <th style={{ ...th, textAlign: 'center' }}>SKUs</th>
                  <th style={{ ...th, textAlign: 'right' }}>A Custo</th>
                  <th style={{ ...th, textAlign: 'right' }}>A Venda</th>
                </tr>
              </thead>
              <tbody>
                {porDia.map((d, i) => (
                  <tr key={d.dia} style={{ borderTop: '1px solid var(--border)', background: i % 2 ? 'var(--bg-card2)' : undefined }}>
                    <td style={{ ...td, color: 'var(--text)' }}>{labelDia(d.dia)}<span style={{ color: 'var(--text-dim)', fontSize: 10 }}> /{(d.dia || '').slice(0, 4)}</span></td>
                    <td style={{ ...td, textAlign: 'center', color: '#818cf8', fontWeight: 700 }}>{fNum(d.pecas)}</td>
                    <td style={{ ...td, textAlign: 'center', color: '#00b4d8' }}>{fNum(d.skus)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#a3e635', fontWeight: 700 }}>{fBRL(d.valorCusto)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#f5c518', fontWeight: 700 }}>{fBRL(d.valorVenda)}</td>
                  </tr>
                ))}
                {porDia.length === 0 && <tr><td colSpan={5} style={{ ...td, color: 'var(--text-dim)', padding: 14 }}>Sem dados.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
        Agrupado por data de lançamento. Valores a custo e a preço de venda × quantidade. Fornecedores somam peças e valores (SKUs não são somados entre dias).
      </div>
    </div>
  )
}

function Voltar({ navigate }) {
  return <button onClick={() => navigate('/lancamentos')} className="btn-ghost text-xs" style={{ alignSelf: 'flex-start' }}>← Voltar para Lançamentos</button>
}
function Kpi({ label, value, title, cor }) {
  return (
    <div className="card" style={{ borderLeft: `3px solid ${cor}`, minHeight: 82, overflow: 'hidden' }}>
      <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div title={title || value} style={{ fontSize: 19, fontWeight: 900, color: cor, fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}
const lbl = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: 'var(--accent-title, var(--accent))', marginBottom: 5 }
function FBtn({ on, onClick, label, cor }) {
  return (
    <button onClick={onClick} className="text-xs font-semibold rounded"
      style={on ? { background: cor || 'var(--accent)', color: '#0d0e16', padding: '6px 12px', border: '1px solid transparent' }
                : { background: 'var(--bg-input)', color: 'var(--text-nav)', border: '1px solid var(--border2)', padding: '6px 12px' }}>
      {label}
    </button>
  )
}
