import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

export const TOUR_KEY = 'sistema_tour_visto_v1'

const PASSOS = [
  {
    emoji: '👋',
    titulo: 'Bem-vindo ao Sistema de Compras',
    subtitulo: 'Alinare · Gestão Inteligente',
    descricao: 'Este tour vai apresentar cada seção do sistema em poucos minutos. Navegue com os botões abaixo ou pressione as teclas ← →.',
    cor: '#f5c518',
    rota: null,
    itens: [],
    Preview: PreviewBemVindo,
  },
  {
    emoji: '🧮',
    titulo: 'Indicadores e Cálculos',
    subtitulo: 'Entenda cada métrica do sistema',
    descricao: 'Todos os indicadores são calculados automaticamente com base nos dados do ERP. Confira as fórmulas:',
    cor: '#a78bfa',
    rota: null,
    itens: [
      '💰 Markup  →  quanto o preço multiplica o custo (ex: 2,50x)',
      '📊 Margem  →  % de lucro sobre o preço de venda (ex: 60%)',
      '📅 DDE  →  quantos dias o estoque disponível vai durar: Saldo Disp. ÷ (Vend.30d ÷ 30)',
      '🔄 Giro  →  quantas vezes o estoque se renova por ano: (Vend.30d ÷ 30 × 365) ÷ Saldo. Ex: 36x = estoque se renova ~1x por mês',
      '📉 Taxa de Saída  →  % do fluxo total que foi vendido: Vend.30d ÷ (Vend.30d + Saldo) × 100. Ex: 70% = de tudo que circulou, 70% foi vendido',
      '🔴 Ruptura  →  saldo zerado mas produto ainda sendo vendido',
      '🟠 Risco  →  estoque positivo mas acabando em menos de 30 dias',
      '🏆 Curva ABC  →  A = top 80% do faturamento · B = próximos 15% · C = últimos 5%',
    ],
    Preview: PreviewCalculos,
  },
  {
    emoji: '📊',
    titulo: 'Dashboard',
    subtitulo: 'Visão geral do negócio',
    descricao: 'Painel principal com os principais indicadores de desempenho atualizados automaticamente a cada 30 minutos.',
    cor: '#f5c518',
    rota: '/',
    itens: [
      'Saldo atual e saldo disponível em estoque',
      'Valor total em estoque e custo médio dos produtos',
      'Vendas 30 dias com comparativo ao período anterior',
      'Unidades vendidas nos últimos 30 dias',
      'Produtos detalhados com foto, preço e movimentação',
    ],
    Preview: PreviewDashboard,
  },
  {
    emoji: '📈',
    titulo: 'Curva ABC',
    subtitulo: 'Classificação estratégica de produtos',
    descricao: 'Classifica automaticamente todos os produtos em A, B e C com base em faturamento, unidades vendidas ou valor de estoque.',
    cor: '#00b4d8',
    rota: '/sugestoes',
    itens: [
      '3 tipos de curva: Faturamento · Unidades Vendidas · Estoque',
      'Classe A — top 80% do resultado (produtos prioritários)',
      'Classe B — próximos 15%  ·  Classe C — últimos 5%',
      'Clique nas letras A, B ou C para filtrar só aquela classe',
      'Filtros por categoria, grupo e fornecedor em cada curva',
    ],
    Preview: PreviewABC,
  },
  {
    emoji: '🛍️',
    titulo: 'Compras',
    subtitulo: 'Catálogo completo de produtos',
    descricao: 'Acesse o catálogo completo com fotos, preços, estoque e histórico de vendas de todos os produtos.',
    cor: '#a78bfa',
    rota: '/compras',
    itens: [
      'Busca por código, descrição ou grupo · foto ampliada ao passar o mouse',
      'Saldo atual, disponível, preço unitário e custo médio',
      'Sugestão de compra com cobertura desejada de 45 a 90 dias',
      '🧮 Qtd a comprar = (Vend. 90 dias ÷ 90 × cobertura) − Saldo − Pedido pendente',
      'Usa a média dos últimos 90 dias para captar também produtos de giro mais lento',
      'Resultado zero ou negativo aparece como "não recomendado" (estoque já cobre a demanda)',
      '🔴 Destaca produtos em Ruptura — saldo zerado ainda vendendo',
      '🟠 Destaca produtos em Risco — estoque acabando em menos de 30 dias',
      'Exportação em Excel e Word com todos os dados filtrados',
    ],
    Preview: PreviewCompras,
  },
  {
    emoji: '📦',
    titulo: 'Pedidos',
    subtitulo: 'Pedidos em andamento',
    descricao: 'Acompanhe todos os pedidos feitos para fornecedores com detalhes de itens, quantidades e prazos.',
    cor: '#fb923c',
    rota: '/pedidos',
    itens: ['Lista de pedidos por fornecedor', 'Itens com quantidades e saldo pendente', 'Filtros por fornecedor e período', 'Valor total por pedido'],
    Preview: PreviewPedidos,
  },
  {
    emoji: '🔔',
    titulo: 'Alertas de Estoque',
    subtitulo: 'Produtos que precisam de atenção',
    descricao: 'O sino na barra lateral acende automaticamente quando há produtos em situação crítica de estoque.',
    cor: '#f87171',
    rota: null,
    itens: [
      '🔴 Ruptura — saldo zerado mas produto ainda sendo vendido nos últimos 30 dias',
      '🟠 Risco — estoque positivo mas com menos de 30 dias de cobertura (DDE < 30)',
      '✅ Produto com pedido de compra pendente cobrindo ≥ 30 dias não aparece no alerta',
      'Ordenado pelo mais crítico: Ruptura com maior volume de vendas primeiro',
      'Clique no alerta para ver foto, fornecedor e volume de vendas do produto',
    ],
    Preview: PreviewAlertas,
  },
  {
    emoji: '🚚',
    titulo: 'Fornecedores',
    subtitulo: 'Gestão de fornecedores',
    descricao: 'Analise o desempenho de cada fornecedor com dados de produtos, vendas e pedidos em aberto.',
    cor: '#4ade80',
    rota: '/fornecedores',
    itens: ['Portfólio de produtos por fornecedor', 'Faturamento e unidades (30/90 dias)', 'Produtos em ruptura e risco de ruptura', 'Detecção de produtos duplicados'],
    Preview: PreviewFornecedores,
  },
  {
    emoji: '👥',
    titulo: 'Clientes',
    subtitulo: 'Base de clientes',
    descricao: 'Visualize e pesquise a base completa de clientes cadastrados no sistema.',
    cor: '#f472b6',
    rota: '/clientes',
    itens: ['Lista completa de clientes', 'Busca por nome ou código', 'Informações de contato'],
    Preview: PreviewClientes,
  },
  {
    emoji: '🔧',
    titulo: 'Assistências',
    subtitulo: 'Acompanhamento técnico',
    descricao: 'Gerencie e acompanhe todas as assistências técnicas abertas e encerradas.',
    cor: '#94a3b8',
    rota: '/assistencias',
    itens: ['Lista de assistências por status', 'Detalhes de cada ocorrência', 'Filtros por período e situação'],
    Preview: PreviewAssistencias,
  },
  {
    emoji: '⚙️',
    titulo: 'Usuários',
    subtitulo: 'Gerenciamento de acesso',
    descricao: 'Área exclusiva para administradores. Gerencie quem acessa o sistema e quais páginas cada usuário pode ver.',
    cor: '#D4AF37',
    rota: '/admin',
    itens: ['Criar e deletar usuários', 'Liberar ou bloquear acesso por página', 'Definir perfil: Admin ou Usuário', 'Ativar ou bloquear contas'],
    Preview: PreviewAdmin,
  },
]

export default function TourModal({ onClose }) {
  const navigate  = useNavigate()
  const [passo,   setPasso]  = useState(0)
  const [dir,     setDir]    = useState('right') // animação: 'right' | 'left'
  const [animKey, setAnimKey]= useState(0)
  const total = PASSOS.length
  const p     = PASSOS[passo]

  const goTo = useCallback((idx) => {
    if (idx === passo) return
    setDir(idx > passo ? 'right' : 'left')
    setAnimKey(k => k + 1)
    setPasso(idx)
  }, [passo])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') goTo(Math.min(total - 1, passo + 1))
      if (e.key === 'ArrowLeft')  goTo(Math.max(0, passo - 1))
      if (e.key === 'Escape')     onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, total, passo, goTo])

  function handleIrPagina() {
    if (p.rota) { navigate(p.rota); onClose() }
  }

  const progresso = (passo / (total - 1)) * 100

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI', sans-serif",
      backdropFilter: 'blur(6px)',
    }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <style>{`
        @keyframes slideFromRight { from { opacity:0; transform:translateX(40px) } to { opacity:1; transform:translateX(0) } }
        @keyframes slideFromLeft  { from { opacity:0; transform:translateX(-40px) } to { opacity:1; transform:translateX(0) } }
        .tour-slide-right { animation: slideFromRight 0.22s cubic-bezier(.25,.46,.45,.94) both; }
        .tour-slide-left  { animation: slideFromLeft  0.22s cubic-bezier(.25,.46,.45,.94) both; }
        .tour-item { display:flex; align-items:flex-start; gap:10px; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
        .tour-item:last-child { border-bottom:none; }
        .tour-btn { border:none; border-radius:10px; padding:12px 28px; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.15s; letter-spacing:0.04em; }
        .tour-btn:hover:not(:disabled) { transform:translateY(-1px); filter:brightness(1.12); }
        .tour-btn:disabled { opacity:0.25; cursor:default; }
        .tour-dot-wrap { position:relative; display:inline-flex; flex-direction:column; align-items:center; gap:4px; }
        .tour-dot { width:8px; height:8px; border-radius:50%; cursor:pointer; transition:all 0.2s; }
        .tour-dot:hover { transform:scale(1.4); }
        .tour-dot-label { position:absolute; bottom:18px; background:#1e2035; border:1px solid #2a2d40; border-radius:6px; padding:3px 8px; font-size:10px; color:#c4c9d8; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity 0.15s; }
        .tour-dot-wrap:hover .tour-dot-label { opacity:1; }
        .tour-ir-btn { border:none; border-radius:8px; padding:7px 16px; font-size:11px; font-weight:700; cursor:pointer; transition:all 0.15s; letter-spacing:0.04em; display:flex; align-items:center; gap:6px; }
        .tour-ir-btn:hover { transform:translateY(-1px); filter:brightness(1.1); }
      `}</style>

      <div style={{ width:'100%', maxWidth:1100, margin:24, display:'flex', gap:0, borderRadius:20, overflow:'hidden', boxShadow:`0 0 80px ${p.cor}20, 0 40px 100px rgba(0,0,0,0.7)`, border:`1px solid ${p.cor}25`, height:'80vh', maxHeight:700 }}>

        {/* Preview esquerda */}
        <div style={{ width:380, flexShrink:0, background:'#080910', display:'flex', alignItems:'center', justifyContent:'center', padding:32, borderRight:'1px solid #1a1c2a', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', inset:0, background:`radial-gradient(circle at 50% 50%, ${p.cor}10 0%, transparent 70%)` }} />
          <div key={animKey} className={dir === 'right' ? 'tour-slide-right' : 'tour-slide-left'} style={{ position:'relative', zIndex:1, width:'100%' }}>
            <p.Preview cor={p.cor} />
          </div>
        </div>

        {/* Conteúdo direita */}
        <div style={{ flex:1, background:'linear-gradient(160deg,#12131e 0%,#0d0e18 100%)', display:'flex', flexDirection:'column' }}>

          {/* Barra de progresso */}
          <div style={{ height:3, background:'#1e2035' }}>
            <div style={{ height:'100%', width:`${progresso}%`, background:`linear-gradient(90deg,${p.cor}66,${p.cor})`, transition:'width 0.35s ease' }} />
          </div>

          <div style={{ padding:'32px 40px', flex:1, display:'flex', flexDirection:'column' }}>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:22 }}>
              <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                <div style={{ fontSize:42 }}>{p.emoji}</div>
                <div>
                  <div style={{ fontSize:22, fontWeight:800, color:'#e8eaf0', lineHeight:1.2 }}>{p.titulo}</div>
                  <div style={{ fontSize:13, color:p.cor, fontWeight:600, marginTop:4, letterSpacing:'0.04em' }}>{p.subtitulo}</div>
                </div>
              </div>
              <button onClick={onClose} style={{ background:'none', border:'none', color:'#8b93b0', cursor:'pointer', fontSize:22, padding:'2px 8px', lineHeight:1, flexShrink:0 }}>✕</button>
            </div>

            {/* Descrição */}
            <p key={animKey} className={dir === 'right' ? 'tour-slide-right' : 'tour-slide-left'}
              style={{ fontSize:15, color:'#d1d5e8', lineHeight:1.8, marginBottom:p.itens.length ? 20 : 0 }}>
              {p.descricao}
            </p>

            {/* Itens */}
            {p.itens.length > 0 && (
              <div key={animKey + 'i'} className={dir === 'right' ? 'tour-slide-right' : 'tour-slide-left'}
                style={{ background:'#0a0b14', borderRadius:12, padding:'8px 20px', border:`1px solid ${p.cor}30`, flex:1 }}>
                {p.itens.map((item, i) => (
                  <div key={i} className="tour-item">
                    <div style={{ width:7, height:7, borderRadius:'50%', background:p.cor, flexShrink:0, marginTop:7, boxShadow:`0 0 6px ${p.cor}80` }} />
                    <span style={{ fontSize:14, color:'#e2e5f0', lineHeight:1.7, fontWeight:500 }}>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Botão Ir para página */}
            {p.rota && (
              <div style={{ marginTop:12 }}>
                <button className="tour-ir-btn" onClick={handleIrPagina}
                  style={{ background:`${p.cor}18`, border:`1px solid ${p.cor}44`, color:p.cor }}>
                  <span>↗</span> Ir para {p.titulo}
                </button>
              </div>
            )}

            {/* Navegação */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:16 }}>
              <button className="tour-btn" onClick={() => goTo(Math.max(0, passo - 1))} disabled={passo === 0}
                style={{ background:'#1e2035', color:'#e8eaf0', border:'1px solid #2a2d40' }}>
                ← Anterior
              </button>

              {/* Dots com tooltip */}
              <div style={{ display:'flex', gap:6, alignItems:'flex-end', paddingBottom:4 }}>
                {PASSOS.map((s, i) => (
                  <div key={i} className="tour-dot-wrap" onClick={() => goTo(i)}>
                    <div className="tour-dot-label">{s.titulo}</div>
                    <div className="tour-dot" style={{
                      background: i === passo ? p.cor : i < passo ? `${p.cor}55` : '#2a2d40',
                      transform: i === passo ? 'scale(1.4)' : 'scale(1)',
                    }} />
                  </div>
                ))}
              </div>

              {passo < total - 1
                ? <button className="tour-btn" onClick={() => goTo(passo + 1)} style={{ background:p.cor, color:'#0d0e16' }}>Próximo →</button>
                : <button className="tour-btn" onClick={onClose} style={{ background:p.cor, color:'#0d0e16' }}>Começar ✓</button>
              }
            </div>

            <div style={{ textAlign:'center', marginTop:10, fontSize:11, color:'#6b7894' }}>
              {passo + 1} / {total} · ← → para navegar · Esc para fechar
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Previews ────────────────────────────────────────────────────────────────

function PreviewAlertas({ cor }) {
  const [aba, setAba] = React.useState('ruptura')
  const ruptura = [
    { desc: 'COLAR RIVIERA 3MM',   grupo: 'CORRENTE',  vend: 42, comPedido: false },
    { desc: 'ANEL SOLITÁRIO 18K',  grupo: 'ANEL',      vend: 18, comPedido: true  },
    { desc: 'BRINCO ARGOLA OURO',  grupo: 'BRINCO',    vend: 11, comPedido: false },
  ]
  const risco = [
    { desc: 'PULSEIRA RIVIERA 4G', grupo: 'PULSEIRA',  dde: 8,  saldo: 12, comPedido: false },
    { desc: 'PINGENTE CORAÇÃO',    grupo: 'PINGENTE',  dde: 14, saldo: 5,  comPedido: true  },
    { desc: 'RIVIERA REDONDA 2MM', grupo: 'CORRENTE',  dde: 22, saldo: 30, comPedido: false },
  ]
  const lista = aba === 'ruptura' ? ruptura : risco
  return (
    <div style={{ width: '100%' }}>
      {/* Botão sino */}
      <div style={{ background: '#2d0a0a', borderRadius: 8, padding: '7px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #f8717144' }}>
        <span style={{ fontSize: 16 }}>🔔</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#f87171', flex: 1 }}>5 alertas ativos</span>
        <span style={{ background: '#f87171', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>5</span>
      </div>
      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8, background: '#0d0f1a', borderRadius: 6, padding: 3 }}>
        {[{ id: 'ruptura', label: 'Ruptura (2)', cor: '#f87171' }, { id: 'risco', label: 'Risco (3)', cor: '#fb923c' }].map(a => (
          <div key={a.id} onClick={() => setAba(a.id)} style={{ flex: 1, textAlign: 'center', padding: '4px 0', borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: 'pointer', background: aba === a.id ? `${a.cor}22` : 'transparent', color: aba === a.id ? a.cor : '#6b7280', borderBottom: aba === a.id ? `2px solid ${a.cor}` : '2px solid transparent' }}>{a.label}</div>
        ))}
      </div>
      {/* Lista */}
      <div style={{ background: '#12131e', borderRadius: 8, overflow: 'hidden', border: '1px solid #1e2035' }}>
        {lista.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderBottom: '1px solid #1a1c2a', opacity: p.comPedido ? 0.35 : 1 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#20223a', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{aba === 'ruptura' ? '📦' : '⚠️'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: p.comPedido ? '#4b5063' : '#c4c9d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.desc}</div>
              <div style={{ fontSize: 9, color: '#6b7280' }}>{p.grupo} {p.comPedido ? '· ✅ pedido cobre 30d' : ''}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {aba === 'ruptura'
                ? <div style={{ fontSize: 10, fontWeight: 800, color: '#f87171', background: '#7f1d1d', padding: '2px 6px', borderRadius: 4 }}>{p.vend}/30d</div>
                : <div style={{ fontSize: 10, fontWeight: 800, color: '#fb923c', background: '#7c2d12', padding: '2px 6px', borderRadius: 4 }}>{p.dde}d</div>
              }
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 9, color: '#4b5063', marginTop: 6, textAlign: 'center' }}>Itens esmaecidos têm pedido de compra pendente</div>
    </div>
  )
}

function PreviewCalculos({ cor }) {
  const items = [
    { nome: 'MARKUP',      formula: 'Preço ÷ Custo',                  ex: '2,50x',    cor: '#a78bfa', icon: '💰' },
    { nome: 'MARGEM',      formula: '(Preço−Custo) ÷ Preço',          ex: '60%',      cor: '#f5c518', icon: '📊' },
    { nome: 'DDE',         formula: 'Saldo Disp. ÷ Venda/dia',         ex: '30 dias',  cor: '#00b4d8', icon: '📅' },
    { nome: 'GIRO',        formula: '(Vend.30d×365÷30)÷Saldo',        ex: '3,2x',     cor: '#4ade80', icon: '🔄' },
    { nome: 'TX. SAÍDA',   formula: 'Vendas ÷ (Saldo+Vendas) × 100', ex: '68%',      cor: '#38bdf8', icon: '📉' },
    { nome: 'RUPTURA',     formula: 'Saldo=0 + Venda30d>0',           ex: '⚠️ crítico', cor: '#f87171', icon: '🔴' },
    { nome: 'RISCO',       formula: 'Saldo>0 + DDE<30d',              ex: '⚡ urgente', cor: '#fb923c', icon: '🟠' },
    { nome: 'CURVA ABC',   formula: 'A=80% fat · B=15% · C=5%',       ex: 'A/B/C',    cor: '#a3e635', icon: '🏆' },
  ]
  return (
    <div style={{ width:'100%', display:'flex', flexDirection:'column', gap:6 }}>
      {items.map(it => (
        <div key={it.nome} style={{
          background: `linear-gradient(135deg, ${it.cor}12 0%, #0a0b14 100%)`,
          borderRadius: 10, padding: '10px 14px',
          border: `1px solid ${it.cor}40`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>{it.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: it.cor, letterSpacing: '0.06em' }}>{it.nome}</span>
              <span style={{ fontSize: 11, color: '#d4d8ec', fontFamily: 'monospace' }}>{it.formula}</span>
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: it.cor, flexShrink: 0, background: `${it.cor}20`, padding: '2px 8px', borderRadius: 20 }}>{it.ex}</span>
        </div>
      ))}
    </div>
  )
}

function PreviewBemVindo({ cor }) {
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:52, marginBottom:12 }}>🏢</div>
      <div style={{ fontSize:13, fontWeight:800, color:'#D4AF37', letterSpacing:'0.1em' }}>SISTEMA DE</div>
      <div style={{ fontFamily:'Georgia,serif', fontSize:32, fontWeight:700, color:'#D4AF37', lineHeight:1 }}>Compras</div>
      <div style={{ marginTop:12, fontSize:10, color:'#8b93b0', letterSpacing:'0.1em' }}>ALINARE · NOVITAH</div>
    </div>
  )
}

function PreviewDashboard({ cor }) {
  const kpis = [
    { l:'Saldo Atual',    v:'8.432 un',   c:'#00b4d8' },
    { l:'Saldo Disp.',    v:'7.910 un',   c:'#38bdf8' },
    { l:'Valor Estoque',  v:'R$ 1,2M',    c:'#4ade80' },
    { l:'Custo Médio',    v:'R$ 22,40',   c:'#a78bfa' },
    { l:'Vendas 30D',     v:'R$ 284k',    c:'#f5c518' },
    { l:'Período Ant.',   v:'R$ 261k',    c:'#fb923c' },
    { l:'Unid. Vendidas', v:'12.847 un',  c:'#f472b6' },
  ]
  return (
    <div style={{ width:'100%' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, marginBottom:6 }}>
        {kpis.map((k,i) => (
          <div key={i} style={{ background:'#12131e', borderRadius:7, padding:'6px 9px', border:`1px solid ${k.c}28` }}>
            <div style={{ fontSize:10, color:'#a8b0cc', marginBottom:2, fontWeight:500 }}>{k.l}</div>
            <div style={{ fontSize:13, fontWeight:800, color:k.c }}>{k.v}</div>
          </div>
        ))}
        <div style={{ background:'#12131e', borderRadius:7, padding:'6px 9px', border:'1px solid #1e2035', display:'flex', flexDirection:'column', justifyContent:'center' }}>
          <div style={{ fontSize:10, color:'#a8b0cc', marginBottom:4 }}>Vendas 30 dias</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:2, height:24 }}>
            {[70,90,55,80,100,65,85].map((h,i) => (
              <div key={i} style={{ flex:1, height:`${h}%`, background:`${cor}99`, borderRadius:2 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewABC({ cor }) {
  const [ativo, setAtivo] = React.useState(null)
  const cores = { A:'#4ade80', B:'#fb923c', C:'#f87171' }
  const tipos = ['Faturamento','Unid. Vendidas','Estoque']
  const [tipoIdx, setTipoIdx] = React.useState(0)
  const rows = [
    { abc:'A', desc:'RIVIERA 3MM ZIRCÔNIA', v:'R$ 48k' },
    { abc:'A', desc:'COLAR RIVIERA OURO',   v:'R$ 31k' },
    { abc:'B', desc:'ANEL SOLITÁRIO 18K',   v:'R$ 12k' },
    { abc:'C', desc:'PINGENTE CORAÇÃO',     v:'R$ 2k'  },
  ].filter(r => ativo === null || r.abc === ativo)
  return (
    <div style={{ width:'100%' }}>
      {/* Seletor de tipo de curva */}
      <div style={{ display:'flex', gap:4, marginBottom:6, background:'#0d0f1a', borderRadius:6, padding:3 }}>
        {tipos.map((t,i) => (
          <div key={i} onClick={() => setTipoIdx(i)} style={{
            flex:1, textAlign:'center', padding:'4px 0', borderRadius:4, fontSize:10, fontWeight:700, cursor:'pointer',
            background: tipoIdx===i ? cor : 'transparent',
            color: tipoIdx===i ? '#0d0e16' : '#8b93b0',
          }}>{t}</div>
        ))}
      </div>
      {/* Filtros A B C */}
      <div style={{ display:'flex', gap:4, marginBottom:6 }}>
        {['A','B','C'].map(l => (
          <div key={l} onClick={() => setAtivo(a => a===l ? null : l)} style={{
            flex:1, textAlign:'center', padding:'5px 0', borderRadius:5, fontSize:11, fontWeight:800, cursor:'pointer',
            background: ativo===l ? `${cores[l]}22` : '#12131e',
            color: cores[l],
            border: `1px solid ${ativo===l ? cores[l] : cores[l]+'33'}`,
            boxShadow: ativo===l ? `0 0 8px ${cores[l]}44` : 'none',
          }}>{l}</div>
        ))}
      </div>
      {/* Lista de produtos */}
      <div style={{ background:'#12131e', borderRadius:6, overflow:'hidden', border:'1px solid #1e2035' }}>
        {rows.map((r,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', borderBottom:'1px solid #1a1c2a' }}>
            <div style={{ width:5, height:5, borderRadius:'50%', background:cores[r.abc], flexShrink:0 }} />
            <div style={{ flex:1, fontSize:10, color:'#c4c9d8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.desc}</div>
            <div style={{ fontSize:10, fontWeight:800, color:cores[r.abc] }}>{r.v}</div>
            <div style={{ fontSize:10, fontWeight:800, color:cores[r.abc], background:`${cores[r.abc]}18`, padding:'1px 6px', borderRadius:3 }}>{r.abc}</div>
          </div>
        ))}
        {rows.length === 0 && <div style={{ padding:'10px', fontSize:10, color:'#6b7280', textAlign:'center' }}>Nenhum produto nesta classe</div>}
      </div>
    </div>
  )
}

function PreviewCompras({ cor }) {
  return (
    <div style={{ width:'100%' }}>
      {/* Barra de busca */}
      <div style={{ background:'#12131e', borderRadius:6, padding:'5px 8px', marginBottom:6, border:'1px solid #1e2035', display:'flex', gap:6, alignItems:'center' }}>
        <div style={{ flex:1, background:'#0d0f1a', borderRadius:4, height:16, border:'1px solid #2a2d40' }} />
        <div style={{ fontSize:9, color:cor, fontWeight:700, background:`${cor}18`, padding:'2px 8px', borderRadius:4, border:`1px solid ${cor}33`, whiteSpace:'nowrap' }}>Excel</div>
      </div>
      {/* Cobertura desejada */}
      <div style={{ background:'#12131e', borderRadius:6, padding:'5px 10px', marginBottom:6, border:`1px solid ${cor}33`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:10, color:'#c4c9d8' }}>Cobertura desejada</span>
        <div style={{ display:'flex', gap:4 }}>
          {['45d','60d','90d'].map((d,i) => (
            <div key={d} style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:4, background: i===1 ? cor : `${cor}18`, color: i===1 ? '#0d0e16' : cor }}>{d}</div>
          ))}
        </div>
      </div>
      {/* Cards de produto */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5 }}>
        {[
          { icon:'💎', nome:'RIVIERA 3MM', badge:null },
          { icon:'💍', nome:'ANEL OURO 18K', badge:'RUPTURA' },
          { icon:'📿', nome:'COLAR RIVIERA', badge:'RISCO' },
          { icon:'✨', nome:'BRINCO ZIRCÔNIA', badge:null },
        ].map((p,i) => (
          <div key={i} style={{ background:'#12131e', borderRadius:6, padding:6, border:`1px solid ${p.badge==='RUPTURA' ? '#f8717133' : p.badge==='RISCO' ? '#fb923c33' : '#1e2035'}` }}>
            <div style={{ width:'100%', height:34, background:'#20223a', borderRadius:4, marginBottom:4, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
              <span style={{ fontSize:14 }}>{p.icon}</span>
              {p.badge && <div style={{ position:'absolute', top:2, right:2, fontSize:7, fontWeight:800, padding:'1px 4px', borderRadius:3, background: p.badge==='RUPTURA' ? '#7f1d1d' : '#7c2d12', color: p.badge==='RUPTURA' ? '#f87171' : '#fb923c' }}>{p.badge}</div>}
            </div>
            <div style={{ fontSize:9, color:'#c4c9d8', fontWeight:600, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nome}</div>
            <div style={{ height:4, background:`${cor}33`, borderRadius:2, width:'70%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function PreviewPedidos({ cor }) {
  const peds = [{ forn:'FORN. ALFA', itens:12, val:'R$ 48k' }, { forn:'FORN. BETA', itens:7, val:'R$ 22k' }, { forn:'FORN. GAMA', itens:3, val:'R$ 9k' }]
  return (
    <div style={{ width:'100%' }}>
      {peds.map((p,i) => (
        <div key={i} style={{ background:'#12131e', borderRadius:6, padding:'6px 8px', marginBottom:4, border:'1px solid #1e2035' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#e8eaf0' }}>{p.forn}</div>
            <div style={{ fontSize:9, fontWeight:700, color:cor }}>{p.val}</div>
          </div>
          <div style={{ fontSize:11, color:'#c4c9d8', marginTop:3 }}>{p.itens} itens em aberto</div>
          <div style={{ marginTop:4, height:3, background:'#1e2035', borderRadius:2 }}>
            <div style={{ height:'100%', width:`${40+i*20}%`, background:`${cor}88`, borderRadius:2 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function PreviewFornecedores({ cor }) {
  const fns = [{ n:'ALFA JOIAS', p:142, r:2 }, { n:'BETA SEMI', p:89, r:0 }, { n:'GAMA GOLD', p:210, r:5 }]
  return (
    <div style={{ width:'100%' }}>
      {fns.map((f,i) => (
        <div key={i} style={{ background:'#12131e', borderRadius:6, padding:'6px 8px', marginBottom:4, border:'1px solid #1e2035', display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:28, height:28, borderRadius:8, background:`${cor}18`, border:`1px solid ${cor}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>🚚</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#e8eaf0' }}>{f.n}</div>
            <div style={{ fontSize:11, color:'#c4c9d8' }}>{f.p} produtos</div>
          </div>
          {f.r > 0 && <div style={{ fontSize:8, fontWeight:700, color:'#f87171', background:'#7f1d1d', padding:'1px 5px', borderRadius:4 }}>{f.r} rupt.</div>}
        </div>
      ))}
    </div>
  )
}

function PreviewClientes({ cor }) {
  const cls = ['JOIAS MILLER LTDA', 'ARTE & BELEZA ME', 'CASA DAS JOIAS']
  return (
    <div style={{ width:'100%' }}>
      <div style={{ background:'#12131e', borderRadius:6, padding:6, marginBottom:6, border:'1px solid #1e2035' }}>
        <div style={{ height:16, background:'#0d0f1a', borderRadius:4, border:'1px solid #2a2d40' }} />
      </div>
      {cls.map((c,i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 8px', background:'#12131e', borderRadius:6, marginBottom:4, border:'1px solid #1e2035' }}>
          <div style={{ width:22, height:22, borderRadius:'50%', background:`${cor}18`, border:`1px solid ${cor}33`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, flexShrink:0 }}>👤</div>
          <div style={{ fontSize:9, color:'#c4c9d8' }}>{c}</div>
        </div>
      ))}
    </div>
  )
}

function PreviewAssistencias({ cor }) {
  const its = [{ s:'Aberta', c:'#fb923c', d:'Colar partido' }, { s:'Em andamento', c:'#00b4d8', d:'Anel amassado' }, { s:'Concluída', c:'#4ade80', d:'Brinco quebrado' }]
  return (
    <div style={{ width:'100%' }}>
      {its.map((it,i) => (
        <div key={i} style={{ background:'#12131e', borderRadius:6, padding:'6px 8px', marginBottom:4, border:'1px solid #1e2035' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2 }}>
            <div style={{ fontSize:9, color:'#e8eaf0', fontWeight:600 }}>{it.d}</div>
            <div style={{ fontSize:11, fontWeight:700, color:it.c, background:`${it.c}18`, padding:'2px 7px', borderRadius:4 }}>{it.s}</div>
          </div>
          <div style={{ height:3, background:'#1e2035', borderRadius:2 }}>
            <div style={{ height:'100%', width:[30,65,100][i]+'%', background:`${it.c}66`, borderRadius:2 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function PreviewAdmin({ cor }) {
  const users = [{ n:'Rafael Silva', r:'admin', a:true }, { n:'Izabel', r:'usuário', a:true }, { n:'Marilyn', r:'usuário', a:false }]
  return (
    <div style={{ width:'100%' }}>
      {users.map((u,i) => (
        <div key={i} style={{ background:'#12131e', borderRadius:6, padding:'6px 8px', marginBottom:4, border:'1px solid #1e2035', display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:26, height:26, borderRadius:'50%', background: u.r==='admin' ? '#D4AF3722' : '#3a4a8022', border:`1px solid ${u.r==='admin'?'#D4AF37':'#3a4a80'}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0, color: u.r==='admin'?'#D4AF37':'#818cf8', fontWeight:800 }}>
            {u.n[0]}
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#e8eaf0' }}>{u.n}</div>
            <div style={{ fontSize:11, color:'#c4c9d8' }}>{u.r}</div>
          </div>
          <div style={{ width:8, height:8, borderRadius:'50%', background: u.a ? '#4ade80' : '#f87171' }} />
        </div>
      ))}
    </div>
  )
}
