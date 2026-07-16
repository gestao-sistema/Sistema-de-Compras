import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useCompany, EMPRESAS } from '../contexts/CompanyContext'
import TourModal, { TOUR_KEY } from './TourModal'
import FloatingActions from './FloatingActions'

// Módulos disponíveis por empresa (Novitah: compras + fornecedores + pedidos + financeiro)
const NAV_NOVITAH = ['dashboard', 'curva_abc', 'compras', 'pedidos', 'fornecedores', 'clientes']

const NAV = [
  { to: '/',            label: 'Dashboard',    end: true,  Icon: IconGrid,      chave: 'dashboard' },
  { to: '/sugestoes',   label: 'Curva ABC',               Icon: IconBulb,      chave: 'curva_abc' },
  { to: '/compras',     label: 'Sugestão de Compra',       Icon: IconCart,      chave: 'compras' },
  { to: '/pedidos',     label: 'Pedidos de Compras',       Icon: IconClipboard, chave: 'pedidos' },
  { to: '/fornecedores',label: 'Fornecedores',             Icon: IconTruck,     chave: 'fornecedores' },
  { to: '/financeiro',  label: 'Contas a Receber',         Icon: IconMoney,     chave: 'clientes' },
  { to: '/assistencias',label: 'Assistências',             Icon: IconWrench,    chave: 'assistencias' },
]

export default function Layout() {
  const qc               = useQueryClient()
  const navigate         = useNavigate()
  const prevRefreshed    = useRef(null)
  const [justUpdated, setJustUpdated] = useState(false)
  const [showTour,    setShowTour]    = useState(() => !localStorage.getItem(TOUR_KEY))
  const { profile, podeVer, podeFinanceiro, logout: supaLogout } = useAuth()
  const { empresa, empresaLabel, setEmpresa } = useCompany()

  async function logout() {
    qc.clear()
    await supaLogout()
    navigate('/login', { replace: true })
  }

  // Ao trocar de empresa, limpa o cache para recarregar os dados da empresa certa
  const empresaAnterior = useRef(empresa)
  useEffect(() => {
    if (empresaAnterior.current !== empresa) {
      qc.clear()
      empresaAnterior.current = empresa
    }
  }, [empresa, qc])

  function trocarEmpresa(e) {
    if (e === empresa) return
    setEmpresa(e)
    navigate('/', { replace: true })
  }

  const podeAmbas = profile?.empresa === 'ambas'
  // Financeiro depende só de podeFinanceiro (permissão explícita/Rafael); as demais, de podeVer
  let navVisivel = NAV.filter(n => n.to === '/financeiro' ? podeFinanceiro : podeVer(n.chave))
  if (empresa === 'novitah') navVisivel = navVisivel.filter(n => NAV_NOVITAH.includes(n.chave))

  // Pré-carrega pedidos e fornecedores em background para acesso instantâneo
  useQuery({ queryKey: ['pedidos'],              queryFn: api.pedidos,                staleTime: 5 * 60 * 1000 })
  useQuery({ queryKey: ['fornecedores','','',''], queryFn: () => api.fornecedores({}), staleTime: 5 * 60 * 1000 })

  // Polling do status a cada 10s para detectar nova atualização do backend
  const statusQ = useQuery({
    queryKey:       ['status'],
    queryFn:        api.status,
    refetchInterval: 10000,
    staleTime:       0,
  })

  useEffect(() => {
    const lr = statusQ.data?.lastRefreshed
    if (!lr) return
    if (prevRefreshed.current && lr !== prevRefreshed.current) {
      // Backend concluiu nova atualização — invalida todos os dados
      qc.invalidateQueries()
      setJustUpdated(true)
      setTimeout(() => setJustUpdated(false), 4000)
      console.log('[auto-sync] dados atualizados automaticamente')
    }
    prevRefreshed.current = lr
  }, [statusQ.data?.lastRefreshed, qc])

  // "Última atualização" contextual: Financeiro → horário do financeiro; Assistências →
  // horário do cache de assistências; nas demais, o refresh de produtos (estoque).
  const location = useLocation()
  const naFinanceiro   = location.pathname.startsWith('/financeiro')
  const naAssistencia  = location.pathname.startsWith('/assistencia')
  const atualizadoEm = naFinanceiro  ? statusQ.data?.finCacheAt
                     : naAssistencia ? statusQ.data?.assistCacheAt
                     : statusQ.data?.lastRefreshed
  const contextoLabel = naFinanceiro  ? 'Contas a Receber'
                      : naAssistencia ? 'Assistências'
                      : 'Estoque'

  const isRefreshing = statusQ.data?.done === false

  return (
    <div>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img
            key={empresa}
            src={EMPRESAS[empresa].logo}
            alt={empresaLabel}
            style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block', borderRadius: 6 }}
            onError={e => { e.currentTarget.style.display = 'none'; const n = e.currentTarget.nextSibling; if (n) n.style.display = 'block' }}
          />
          <div style={{ display: 'none', fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 22, fontWeight: 400, letterSpacing: '0.12em', color: 'var(--text)' }}>{empresaLabel}</div>
        </div>

        {podeAmbas && (
          <div style={{ display: 'flex', gap: 4, padding: '0 12px', marginBottom: 4 }}>
            {Object.entries(EMPRESAS).map(([id, cfg]) => (
              <button key={id} onClick={() => trocarEmpresa(id)}
                className="flex-1 rounded text-xs font-bold transition-all"
                style={empresa === id
                  ? { background: cfg.accent, color: '#0d0e16', padding: '5px 0' }
                  : { background: 'var(--bg-input)', color: 'var(--text-nav)', border: '1px solid var(--border2)', padding: '5px 0' }}>
                {cfg.label}
              </button>
            ))}
          </div>
        )}

        <nav className="flex flex-col mt-2 gap-0.5 px-2">
          {navVisivel.map(({ to, label, end, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-item rounded-md ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
          {profile?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => `nav-item rounded-md ${isActive ? 'active' : ''}`}>
              <IconShield size={16} />
              Usuários
            </NavLink>
          )}
        </nav>

        <div className="mt-auto px-4 pb-6">
          {/* Indicador de sincronização */}
          <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: 'var(--bg)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: atualizadoEm ? 8 : 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sincronização ativa</span>
            </div>
            {atualizadoEm ? (
              <>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-nav)', marginBottom: 4 }}>
                  Última atualização · <span style={{ color: 'var(--accent-title, var(--accent))' }}>{contextoLabel}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 10, color: '#f5c518' }}>🕐</span>
                  <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.05em', color: '#f5c518', fontFamily: 'monospace' }}>
                    {new Date(atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#f5c518', marginTop: 2, fontFamily: 'monospace' }}>
                  {new Date(atualizadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
              </>
            ) : (naFinanceiro || naAssistencia) && (
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{contextoLabel} carregando…</div>
            )}
          </div>
          <button
            onClick={() => setShowTour(true)}
            className="btn-ghost w-full text-center text-xs"
            style={{ marginTop: 6, color: '#818cf8' }}
          >
            ? Tour do sistema
          </button>
          <button
            onClick={logout}
            className="btn-ghost w-full text-center text-xs"
            style={{ marginTop: 6, color: 'var(--text-muted)' }}
          >
            ⏻ Sair
          </button>
        </div>
      </aside>

      <div className="main-content">
        <Outlet />
      </div>

      <FloatingActions />
      {showTour && <TourModal onClose={() => { setShowTour(false); localStorage.setItem(TOUR_KEY, '1') }} />}
    </div>
  )
}

// ─── inline SVG icons ─────────────────────────────────────────────────────────

function IconGrid({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  )
}

function IconBulb({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 2.5-1.3 4.7-3.2 6H8.2A7 7 0 015 9a7 7 0 017-7z"/>
    </svg>
  )
}

function IconCart({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
      <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
    </svg>
  )
}

function IconMoney({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>
      <path d="M6 12h.01M18 12h.01"/>
    </svg>
  )
}

function IconUser({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  )
}

function IconClipboard({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  )
}

function IconTruck({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="1"/>
      <path d="M16 8h4l3 5v3h-7V8z"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  )
}

function IconWrench({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
    </svg>
  )
}

function IconShield({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )
}
