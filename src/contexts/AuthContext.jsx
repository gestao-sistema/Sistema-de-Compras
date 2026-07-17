import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// Financeiro fica restrito a estes e-mails (não aparece no menu nem na rota p/ os demais)
const FINANCEIRO_EMAILS = ['rafael.silva@azime.com.br']

export const PAGINAS = [
  { chave: 'dashboard',    label: 'Dashboard' },
  { chave: 'curva_abc',    label: 'Curva ABC' },
  { chave: 'compras',      label: 'Compras' },
  { chave: 'compras.exportar', label: 'Compras › Exportar' },
  { chave: 'pedidos',      label: 'Pedidos' },
  { chave: 'fornecedores', label: 'Fornecedores' },
  { chave: 'fornecedores.duplicados', label: 'Fornecedores › Duplicados' },
  { chave: 'clientes',     label: 'Clientes' },
  { chave: 'assistencias', label: 'Assistências' },
]

export function AuthProvider({ children }) {
  const [session,    setSession]    = useState(undefined) // undefined = loading
  const [profile,   setProfile]    = useState(null)
  const [permSet,   setPermSet]    = useState(new Set())

  async function loadProfile(userId) {
    // Carrega perfil + permissões pelo backend (service key ignora o RLS, que está
    // com recursão na policy de profiles). Assim o usuário lê o perfil real.
    let prof = null, perms = []
    try {
      const res = await fetch(`/api/me/${userId}`)
      const data = await res.json()
      prof  = data.profile || null
      perms = data.permissoes || []
    } catch (e) {
      console.error('[auth] erro ao carregar perfil:', e.message)
    }

    if (!prof) {
      // Sem perfil legível → acesso MÍNIMO (nunca admin). Um admin real libera depois.
      setProfile({ id: userId, nome: 'Usuário', empresa: 'ambas', role: 'usuario', ativo: true })
      setPermSet(new Set())
      return
    }

    setProfile(prof)
    // 'financeiro' é explícita (nem admin ganha automático); só entra se liberada individualmente.
    const granted = new Set((perms || []).filter(p => p.liberado).map(p => p.chave))
    if (prof.role === 'admin') {
      const all = new Set(PAGINAS.map(p => p.chave))   // admin: acesso total às páginas normais
      if (granted.has('financeiro')) all.add('financeiro')
      setPermSet(all)
    } else {
      setPermSet(granted)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.id)
      else setSession(null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (s) loadProfile(s.user.id)
      else if (event === 'SIGNED_OUT') { setProfile(null); setPermSet(new Set()) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  function podeVer(chave) {
    if (!profile) return false
    if (profile.role === 'admin') return true
    return permSet.has(chave)
  }

  const loading = session === undefined

  // Financeiro: sempre para o Rafael; para os demais, só se explicitamente liberado
  const podeFinanceiro = !!session && (
    FINANCEIRO_EMAILS.includes((session.user?.email || '').toLowerCase()) || permSet.has('financeiro')
  )

  return (
    <AuthContext.Provider value={{ session, profile, permSet, podeVer, podeFinanceiro, login, logout, loading, reloadProfile: () => session && loadProfile(session.user.id) }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
