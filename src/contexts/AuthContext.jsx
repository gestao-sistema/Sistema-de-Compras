import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

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
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (profErr) console.error('[auth] erro ao carregar profile:', profErr.message)

    if (!prof) {
      // Fallback: cria perfil básico se não existir (ex: trigger não rodou)
      const { data: user } = await supabase.auth.getUser()
      const fallback = {
        id: userId,
        nome: user?.user?.email || 'Usuário',
        empresa: 'ambas',
        role: 'admin',
        ativo: true,
      }
      await supabase.from('profiles').upsert(fallback, { onConflict: 'id' })
      setProfile(fallback)
      setPermSet(new Set(PAGINAS.map(p => p.chave)))
      return
    }

    setProfile(prof)

    if (prof.role === 'admin') {
      setPermSet(new Set(PAGINAS.map(p => p.chave)))
      return
    }

    const { data: perms } = await supabase
      .from('permissoes')
      .select('chave, liberado')
      .eq('user_id', userId)

    const set = new Set((perms || []).filter(p => p.liberado).map(p => p.chave))
    setPermSet(set)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.id)
      else setSession(null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) loadProfile(s.user.id)
      else { setProfile(null); setPermSet(new Set()) }
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

  return (
    <AuthContext.Provider value={{ session, profile, permSet, podeVer, login, logout, loading, reloadProfile: () => session && loadProfile(session.user.id) }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
