import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'

const NAV = [
  { to: '/',            label: 'Dashboard',    end: true,  Icon: IconGrid,      chave: 'dashboard' },
  { to: '/sugestoes',   label: 'Curva ABC',               Icon: IconBulb,      chave: 'curva_abc' },
  { to: '/compras',     label: 'Compras',                  Icon: IconCart,      chave: 'compras' },
  { to: '/pedidos',     label: 'Pedidos',                  Icon: IconClipboard, chave: 'pedidos' },
  { to: '/fornecedores',label: 'Fornecedores',             Icon: IconTruck,     chave: 'fornecedores' },
  { to: '/clientes',    label: 'Clientes',                 Icon: IconUser,      chave: 'clientes' },
  { to: '/assistencias',label: 'Assistências',             Icon: IconWrench,    chave: 'assistencias' },
]

export default function Layout() {
  const qc               = useQueryClient()
  const navigate         = useNavigate()
  const prevRefreshed    = useRef(null)
  const [justUpdated, setJustUpdated] = useState(false)
  const { profile, podeVer, logout: supaLogout } = useAuth()

  async function logout() {
    qc.clear()
    await supaLogout()
    navigate('/login', { replace: true })
  }

  const navVisivel = NAV.filter(n => podeVer(n.chave))

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

  const isRefreshing = statusQ.data?.done === false

  return (
    <div>
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 22, fontWeight: 400, letterSpacing: '0.12em', color: '#ffffff', marginBottom: 4 }}>Alinare</div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.22em', color: '#f5c518' }}>COMPRAS</div>
        </div>

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
          {/* Indicador de atualização automática */}
          <div style={{ marginBottom: 10, padding: '8px 10px', borderRadius: 6, background: '#12131e', border: '1px solid #22253a' }}>
            {justUpdated ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#4ade80', fontSize: 14 }}>✓</span>
                <span style={{ color: '#4ade80', fontSize: 11, fontWeight: 600 }}>Dados atualizados!</span>
              </div>
            ) : isRefreshing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f5c518', animation: 'pulse 1s infinite' }} />
                <span style={{ color: '#f5c518', fontSize: 11 }}>Atualizando base…</span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
                <span style={{ color: '#6b7280', fontSize: 11 }}>Sincronização ativa</span>
              </div>
            )}
            {statusQ.data?.lastRefreshed && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #22253a' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7b8199', marginBottom: 3 }}>
                  Última atualização
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#4ade80' }}>🕐</span>
                  <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: '0.05em', color: '#f5c518', fontFamily: 'monospace' }}>
                    {new Date(statusQ.data.lastRefreshed).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#8b90a7', marginTop: 2 }}>
                  {new Date(statusQ.data.lastRefreshed).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => qc.invalidateQueries()}
            className="btn-ghost w-full text-center text-xs"
          >
            ↺ Atualizar tela
          </button>
          <button
            onClick={logout}
            className="btn-ghost w-full text-center text-xs"
            style={{ marginTop: 6, color: '#6b7280' }}
          >
            ⏻ Sair
          </button>
        </div>
      </aside>

      <div className="main-content">
        <Outlet />
      </div>
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
