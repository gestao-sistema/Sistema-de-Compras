import { createContext, useContext, useState, useEffect } from 'react'
import { setApiEmpresa } from '../api/client'

export const EMPRESAS = {
  alinare: { label: 'Allinare', accent: '#1a3878', accentText: '#ffffff', accentNav: '#6f9be6', accentTitle: '#6f9be6', logo: '/alinare.png' },
  novitah: { label: 'Novitah', accent: '#d2703f', accentText: '#ffffff', accentNav: '#e0925f', accentTitle: '#d2703f', logo: '/novitha.png' },
}

const CompanyContext = createContext(null)

export function CompanyProvider({ children }) {
  const [empresa, setEmpresaState] = useState(() => {
    const e = (localStorage.getItem('empresa') || 'alinare')
    const v = EMPRESAS[e] ? e : 'alinare'
    setApiEmpresa(v)
    return v
  })

  function setEmpresa(e) {
    const v = EMPRESAS[e] ? e : 'alinare'
    setApiEmpresa(v)
    localStorage.setItem('empresa', v)
    setEmpresaState(v)
  }

  // Aplica o accent da empresa em todo o app (Alinare = azul da logo; Novitah = terracota)
  useEffect(() => {
    const root = document.documentElement
    const cfg = EMPRESAS[empresa] || EMPRESAS.alinare
    root.style.setProperty('--accent', cfg.accent)
    root.style.setProperty('--accent-text', cfg.accentText)
    root.style.setProperty('--accent-nav', cfg.accentNav)
    root.style.setProperty('--accent-title', cfg.accentTitle)
  }, [empresa])

  const value = { empresa, setEmpresa, empresaLabel: EMPRESAS[empresa].label, accent: EMPRESAS[empresa].accent }
  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
}

export function useCompany() {
  return useContext(CompanyContext) || { empresa: 'alinare', setEmpresa: () => {}, empresaLabel: 'Allinare' }
}
