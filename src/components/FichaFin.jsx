// Componentes visuais compartilhados pelas fichas financeiras (Cliente e Vendedora)
import { fBRL, fNum } from '../api/client'

export const fMoeda = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)

// Cor estável por forma de pagamento (mesma da tela de Contas a Receber)
const MOD_PALETTE = ['#60a5fa', '#f472b6', '#facc15', '#4ade80', '#c084fc', '#fb923c', '#22d3ee', '#f87171', '#a3e635', '#e879f9', '#38bdf8', '#fbbf24', '#34d399', '#fca5a5', '#818cf8', '#f9a8d4']
export function modColor(forma) {
  let h = 0
  for (const ch of String(forma || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return MOD_PALETTE[h % MOD_PALETTE.length]
}
export const formaLabel = f => (/nota de cr[eé]dito/i.test(f || '') ? 'Nota de crédito (usada)' : f)

export function VoltarBtn({ navigate }) {
  return (
    <button onClick={() => navigate(-1)} className="btn-ghost text-xs" style={{ alignSelf: 'flex-start' }}>
      ← Voltar
    </button>
  )
}

export function Kpi({ label, valor, sub, cor, small }) {
  return (
    <div className="card flex flex-col justify-between" style={{ minHeight: 92 }}>
      <span className="kpi-label">{label}</span>
      <div className="font-black tracking-tight" style={{ color: cor, fontSize: small ? 'clamp(13px,1.3vw,17px)' : 'clamp(15px,1.7vw,23px)', lineHeight: 1.1, margin: '6px 0 3px' }}>
        {valor}
      </div>
      <div className="kpi-sub">{sub}</div>
    </div>
  )
}

export function Badge({ titulo, valor, sub, cor }) {
  return (
    <div style={{
      background: 'var(--bg-input)', border: '1px solid var(--border2)', borderRadius: 12,
      padding: '10px 16px', textAlign: 'center', minWidth: 104,
      borderTop: `2px solid ${cor}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-sec)' }}>{titulo}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: cor, fontFamily: 'monospace', lineHeight: 1.25, margin: '2px 0 1px' }}>{valor}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{sub}</div>}
    </div>
  )
}

// Header genérico da ficha (avatar + nome + código + selos à direita)
export function FichaHeader({ nome, sublabel, badges }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{
        flexShrink: 0, width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, fontWeight: 800, color: 'var(--accent-text)', background: 'var(--accent)',
      }}>
        {(nome || '?').trim().charAt(0).toUpperCase()}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', lineHeight: 1.15 }}>{nome || '—'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>{sublabel}</div>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{badges}</div>
    </div>
  )
}

// Gráfico de barras "por ano" (números vivos, barras com gradiente)
export function GraficoAno({ dados }) {
  if (!dados.length) return <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Sem histórico</div>
  const max = Math.max(...dados.map(a => Math.abs(a.devido)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 180, paddingTop: 20, overflowX: 'auto' }}>
      {dados.map(a => {
        const h = Math.max(3, (Math.abs(a.devido) / max) * 140)
        return (
          <div key={a.ano} title={`${a.ano} · ${fMoeda(a.devido)} · ${fNum(a.titulos)} compras`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '1 0 34px', minWidth: 34 }}>
            <div style={{ fontSize: 10, color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{fBRL(a.devido)}</div>
            <div style={{
              width: '100%', maxWidth: 42, height: h, borderRadius: '6px 6px 0 0',
              background: 'linear-gradient(180deg, #7dd3fc 0%, #3b82f6 60%, #2563eb 100%)',
              boxShadow: '0 0 14px rgba(56,189,248,0.35)',
            }} />
            <div style={{ fontSize: 10.5, color: 'var(--text-sec)', fontWeight: 700, fontFamily: 'monospace' }}>{a.ano}</div>
          </div>
        )
      })}
    </div>
  )
}

// Gráfico de colunas: quantidade de compras por nº de parcelas (1x, 2x, 3x…)
export function GraficoParcelas({ dados }) {
  const lista = (dados || []).filter(d => d.qtd > 0)
  if (!lista.length) return <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Sem compras parceladas</div>
  const max = Math.max(...lista.map(d => d.qtd), 1)
  const totalCompras = lista.reduce((s, d) => s + d.qtd, 0)
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
        {fNum(totalCompras)} compras · dividido de {lista[0].parcelas}x a {lista[lista.length - 1].parcelas}x
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 170, paddingTop: 18, overflowX: 'auto' }}>
        {lista.map(d => {
          const h = Math.max(3, (d.qtd / max) * 120)
          const pct = totalCompras > 0 ? (d.qtd / totalCompras) * 100 : 0
          return (
            <div key={d.parcelas} title={`${d.parcelas}x · ${fNum(d.qtd)} compras (${fNum(pct, 1)}%) · ${fBRL(d.valor)}`}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '1 0 40px', minWidth: 40 }}>
              <div style={{ fontSize: 11, color: '#c084fc', fontWeight: 800, fontFamily: 'monospace' }}>{fNum(d.qtd)}</div>
              <div style={{
                width: '100%', maxWidth: 46, height: h, borderRadius: '6px 6px 0 0',
                background: 'linear-gradient(180deg, #d8b4fe 0%, #a855f7 60%, #7c3aed 100%)',
                boxShadow: '0 0 14px rgba(168,85,247,0.35)',
              }} />
              <div style={{ fontSize: 11, color: 'var(--text-sec)', fontWeight: 700, fontFamily: 'monospace' }}>{d.parcelas}x</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Barras de modalidade de pagamento
export function Modalidades({ itens }) {
  if (!itens.length) return <div style={{ color: 'var(--text-dim)', fontSize: 12 }}>Sem pagamentos registrados</div>
  const top = itens.slice(0, 8)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 4 }}>
      {top.map((m, i) => {
        const cor = modColor(m.forma)
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                <span style={{ flexShrink: 0, width: 8, height: 8, borderRadius: '50%', background: cor }} />
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.forma}>{formaLabel(m.forma)}</span>
              </span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {fMoeda(m.valor)} <span style={{ color: cor }}>· {fNum(m.pct, 1)}%</span>
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 4, background: 'var(--bg-input)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(2, m.pct)}%`, background: cor, borderRadius: 4 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Barra de progresso simples (para listas: vendedores de um cliente, etc.)
export function BarraLinha({ label, valor, extra, pct, cor = 'var(--accent-title, var(--accent))', onClick, acao }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', minWidth: 0 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</span>
          {acao}
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
          {fMoeda(valor)} {extra != null && <span style={{ color: 'var(--text-dim)' }}>· {extra}</span>}
        </span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--bg-input)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(2, pct)}%`, background: cor, borderRadius: 4 }} />
      </div>
    </div>
  )
}

// Barra de filtro por data (emissão e pagamento) — usada nas fichas.
// `filtros` = { de, ate, pagDe, pagAte }; setFiltros recebe o objeto novo.
export function FiltroDatas({ filtros, setFiltros }) {
  const set = (k, v) => setFiltros({ ...filtros, [k]: v })
  const tem = filtros.de || filtros.ate || filtros.pagDe || filtros.pagAte
  const lab = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, color: 'var(--accent-title, var(--accent))', marginBottom: 4 }
  return (
    <div className="card flex flex-wrap items-end gap-3">
      <div>
        <div style={lab}>Emissão (de)</div>
        <input type="date" value={filtros.de || ''} onChange={e => set('de', e.target.value)} className="inp text-xs" />
      </div>
      <div>
        <div style={lab}>Emissão (até)</div>
        <input type="date" value={filtros.ate || ''} onChange={e => set('ate', e.target.value)} className="inp text-xs" />
      </div>
      <div>
        <div style={lab}>Pagamento (de)</div>
        <input type="date" value={filtros.pagDe || ''} onChange={e => set('pagDe', e.target.value)} className="inp text-xs" />
      </div>
      <div>
        <div style={lab}>Pagamento (até)</div>
        <input type="date" value={filtros.pagAte || ''} onChange={e => set('pagAte', e.target.value)} className="inp text-xs" />
      </div>
      {tem && <button onClick={() => setFiltros({})} className="btn-ghost text-xs" style={{ paddingBottom: 6 }}>✕ Limpar</button>}
    </div>
  )
}

// Deriva série "por ano" a partir da timeline mensal (períodos 'YYYY-MM')
export function timelinePorAno(timeline) {
  const map = {}
  for (const m of (timeline || [])) {
    const ano = (m.periodo || '').slice(0, 4)
    if (!ano) continue
    if (!map[ano]) map[ano] = { ano, devido: 0, pago: 0, pend: 0, titulos: 0 }
    map[ano].devido += m.devido; map[ano].pago += m.pago; map[ano].pend += m.pend; map[ano].titulos += m.titulos
  }
  return Object.values(map).sort((a, b) => a.ano.localeCompare(b.ano))
}
