import { useState, useEffect } from 'react'

const PAGINAS = [
  { chave: 'dashboard',              label: 'Dashboard' },
  { chave: 'curva_abc',              label: 'Curva ABC' },
  { chave: 'compras',                label: 'Compras' },
  { chave: 'compras.exportar',       label: 'Compras › Exportar' },
  { chave: 'pedidos',                label: 'Pedidos' },
  { chave: 'fornecedores',           label: 'Fornecedores' },
  { chave: 'fornecedores.duplicados',label: 'Fornecedores › Duplicados' },
  { chave: 'clientes',               label: 'Clientes' },
  { chave: 'assistencias',           label: 'Assistências' },
]

const EMPRESAS = [
  { value: 'ambas',   label: 'Ambas' },
  { value: 'alinare', label: 'Allinare' },
  { value: 'novitah', label: 'Novitah' },
]

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export default function AdminPage() {
  const [usuarios,    setUsuarios]    = useState([])
  const [permissoes,  setPermissoes]  = useState({})
  const [loading,     setLoading]     = useState(true)
  const [novoEmail,   setNovoEmail]   = useState('')
  const [novaSenha,   setNovaSenha]   = useState('')
  const [novoNome,    setNovoNome]    = useState('')
  const [novaEmpresa, setNovaEmpresa] = useState('ambas')
  const [novoRole,    setNovoRole]    = useState('usuario')
  const [criando,     setCriando]     = useState(false)
  const [msg,         setMsg]         = useState(null)
  const [expandido,   setExpandido]   = useState({})

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const data = await api('GET', '/api/admin/usuarios')
    const profs = data.profiles || []
    const perms = data.permissoes || []

    setUsuarios(profs)
    const mapa = {}
    profs.forEach(p => { mapa[p.id] = {} })
    perms.forEach(p => { if (mapa[p.user_id]) mapa[p.user_id][p.chave] = p.liberado })
    setPermissoes(mapa)
    setLoading(false)
  }

  async function criarUsuario() {
    if (!novoEmail || !novaSenha || !novoNome) return flash('Preencha todos os campos', 'erro')
    setCriando(true)
    const data = await api('POST', '/api/admin/criar-usuario', {
      email: novoEmail, password: novaSenha, nome: novoNome, empresa: novaEmpresa, role: novoRole,
    })
    if (data.error) flash(data.error, 'erro')
    else {
      setNovoEmail(''); setNovaSenha(''); setNovoNome(''); setNovaEmpresa('ambas'); setNovoRole('usuario')
      flash('Usuário criado!')
      carregar()
    }
    setCriando(false)
  }

  async function alterarCampo(userId, campo, valor) {
    await api('PATCH', `/api/admin/usuarios/${userId}`, { [campo]: valor })
    setUsuarios(u => u.map(x => x.id === userId ? { ...x, [campo]: valor } : x))
  }

  async function togglePermissao(userId, chave, atual) {
    const liberado = !atual
    await api('POST', '/api/admin/permissoes', [{ user_id: userId, chave, liberado }])
    setPermissoes(p => ({ ...p, [userId]: { ...p[userId], [chave]: liberado } }))
  }

  async function liberarTudo(userId) {
    const rows = PAGINAS.map(p => ({ user_id: userId, chave: p.chave, liberado: true }))
    await api('POST', '/api/admin/permissoes', rows)
    const novo = {}; PAGINAS.forEach(p => { novo[p.chave] = true })
    setPermissoes(p => ({ ...p, [userId]: novo }))
  }

  async function bloquearTudo(userId) {
    const rows = PAGINAS.map(p => ({ user_id: userId, chave: p.chave, liberado: false }))
    await api('POST', '/api/admin/permissoes', rows)
    const novo = {}; PAGINAS.forEach(p => { novo[p.chave] = false })
    setPermissoes(p => ({ ...p, [userId]: novo }))
  }

  async function deletarUsuario(userId, nome) {
    if (!window.confirm(`Deletar "${nome}" permanentemente? Essa ação não pode ser desfeita.`)) return
    const data = await api('DELETE', `/api/admin/usuarios/${userId}`)
    if (data.error) flash(data.error, 'erro')
    else { flash('Usuário deletado.'); carregar() }
  }

  function flash(text, tipo = 'ok') {
    setMsg({ text, tipo })
    setTimeout(() => setMsg(null), 3500)
  }

  if (loading) return <div className="page-body"><div className="state-box"><div className="spinner" /><p>Carregando…</p></div></div>

  return (
    <div className="page-body space-y-5">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <h1 style={{ fontSize:20, fontWeight:800, color:'#e8eaf0' }}>Gerenciar Usuários</h1>
        {msg && (
          <div style={{ padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:600,
            background: msg.tipo === 'erro' ? '#7f1d1d' : '#14532d',
            color:      msg.tipo === 'erro' ? '#f87171' : '#4ade80',
            border:`1px solid ${msg.tipo === 'erro' ? '#f87171' : '#4ade80'}` }}>
            {msg.text}
          </div>
        )}
      </div>

      {/* Formulário novo usuário */}
      <div className="card">
        <div style={{ fontSize:12, fontWeight:800, letterSpacing:'0.08em', color:'#f5c518', textTransform:'uppercase', marginBottom:16 }}>
          Novo Usuário
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color:'#6b7280' }}>Nome</div>
            <input value={novoNome} onChange={e => setNovoNome(e.target.value)} placeholder="Nome completo" className="inp text-xs" style={{ width:170 }} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color:'#6b7280' }}>E-mail</div>
            <input value={novoEmail} onChange={e => setNovoEmail(e.target.value)} placeholder="email@azime.com.br" className="inp text-xs" style={{ width:210 }} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color:'#6b7280' }}>Senha</div>
            <input type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="••••••••" className="inp text-xs" style={{ width:130 }} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color:'#6b7280' }}>Empresa</div>
            <select value={novaEmpresa} onChange={e => setNovaEmpresa(e.target.value)} className="inp text-xs" style={{ width:110 }}>
              {EMPRESAS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color:'#6b7280' }}>Perfil</div>
            <select value={novoRole} onChange={e => setNovoRole(e.target.value)} className="inp text-xs" style={{ width:100 }}>
              <option value="usuario">Usuário</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button onClick={criarUsuario} disabled={criando}
            className="px-5 py-2 rounded text-xs font-bold"
            style={{ background:'#f5c518', color:'#0d0e16', opacity: criando ? 0.6 : 1, cursor: criando ? 'wait' : 'pointer' }}>
            {criando ? 'Criando…' : '+ Criar'}
          </button>
        </div>
      </div>

      {/* Lista de usuários */}
      {usuarios.length === 0 && (
        <div className="state-box"><p>Nenhum usuário encontrado.</p></div>
      )}

      {usuarios.map(u => {
        const isAdmin   = u.role === 'admin'
        const permsUser = permissoes[u.id] || {}
        const aberto    = !!expandido[u.id]

        return (
          <div key={u.id} className="card" style={{ padding:0, overflow:'hidden' }}>
            {/* Header */}
            <div onClick={() => setExpandido(e => ({ ...e, [u.id]: !e[u.id] }))}
              style={{ padding:'14px 20px', cursor:'pointer', display:'flex', alignItems:'center', gap:14,
                background: aberto ? '#1a1c30' : '#181929',
                borderBottom: aberto ? '1px solid #22253a' : 'none' }}>

              {/* Avatar */}
              <div style={{ width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
                background: isAdmin ? 'rgba(212,175,55,0.15)' : 'rgba(100,120,200,0.12)',
                border:`1px solid ${isAdmin ? '#D4AF37' : '#3a4a80'}`,
                color: isAdmin ? '#D4AF37' : '#818cf8', fontSize:14, fontWeight:800 }}>
                {u.nome?.charAt(0)?.toUpperCase()}
              </div>

              {/* Nome e empresa */}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:800, fontSize:14, color:'#e8eaf0' }}>{u.nome}</div>
                <div style={{ fontSize:11, color:'#6b7280', marginTop:1 }}>
                  {isAdmin ? '⭐ Admin' : 'Usuário'} · {EMPRESAS.find(e => e.value === u.empresa)?.label || u.empresa}
                </div>
              </div>

              {/* Controles rápidos */}
              <div style={{ display:'flex', alignItems:'center', gap:10 }} onClick={e => e.stopPropagation()}>
                <select value={u.empresa} onChange={e => alterarCampo(u.id, 'empresa', e.target.value)}
                  className="inp text-xs" style={{ width:100 }}>
                  {EMPRESAS.map(emp => <option key={emp.value} value={emp.value}>{emp.label}</option>)}
                </select>

                <select value={u.role} onChange={e => alterarCampo(u.id, 'role', e.target.value)}
                  className="inp text-xs" style={{ width:100 }}>
                  <option value="usuario">Usuário</option>
                  <option value="admin">Admin</option>
                </select>

                <button onClick={() => alterarCampo(u.id, 'ativo', !u.ativo)}
                  style={{ padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
                    background: u.ativo ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
                    border:`1px solid ${u.ativo ? '#4ade80' : '#f87171'}`,
                    color: u.ativo ? '#4ade80' : '#f87171' }}>
                  {u.ativo ? 'Ativo' : 'Bloqueado'}
                </button>
              </div>

              {/* Seta expandir — fora do stopPropagation */}
              <div style={{ padding:'4px 8px', color:'#6b7280', fontSize:13 }}>
                {aberto ? '▲' : '▼'}
              </div>
            </div>

            {/* Permissões */}
            {aberto && (
              <div style={{ padding:'18px 20px' }}>
                {/* Financeiro — acesso especial: nem admin ganha automático, é liberado individualmente */}
                {(() => {
                  const libFin = !!permsUser['financeiro']
                  return (
                    <div onClick={() => togglePermissao(u.id, 'financeiro', libFin)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', marginBottom:16,
                        borderRadius:8, cursor:'pointer',
                        background: libFin ? 'rgba(245,197,24,0.10)' : 'rgba(245,197,24,0.03)',
                        border:`1px solid ${libFin ? 'rgba(245,197,24,0.5)' : 'rgba(245,197,24,0.2)'}` }}>
                      <div style={{ width:16, height:16, borderRadius:4, flexShrink:0,
                        background: libFin ? '#f5c518' : 'transparent',
                        border:`2px solid ${libFin ? '#f5c518' : '#8a6d1a'}`,
                        display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {libFin && <span style={{ color:'#0d0e16', fontSize:10, fontWeight:900 }}>✓</span>}
                      </div>
                      <div>
                        <div style={{ fontSize:12, fontWeight:700, color: libFin ? '#f5c518' : '#a98a2e' }}>💰 Financeiro (acesso especial)</div>
                        <div style={{ fontSize:10.5, color:'#6b7280', marginTop:1 }}>Liberado individualmente — nem admin tem por padrão.</div>
                      </div>
                    </div>
                  )
                })()}
                {isAdmin ? (
                  <p style={{ fontSize:12, color:'#D4AF37' }}>Admin tem acesso total às demais páginas automaticamente.</p>
                ) : (
                  <>
                    <div style={{ display:'flex', gap:8, marginBottom:14, alignItems:'center' }}>
                      <button onClick={() => liberarTudo(u.id)} className="btn-ghost text-xs" style={{ color:'#4ade80' }}>✓ Liberar tudo</button>
                      <button onClick={() => bloquearTudo(u.id)} className="btn-ghost text-xs" style={{ color:'#f87171' }}>✕ Bloquear tudo</button>
                      <div style={{ flex:1 }} />
                      <button onClick={() => deletarUsuario(u.id, u.nome)}
                        style={{ padding:'4px 12px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
                          background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.4)', color:'#f87171' }}>
                        🗑 Deletar usuário
                      </button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:8 }}>
                      {PAGINAS.map(pag => {
                        const lib = !!permsUser[pag.chave]
                        return (
                          <div key={pag.chave} onClick={() => togglePermissao(u.id, pag.chave, lib)}
                            style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px',
                              borderRadius:8, cursor:'pointer',
                              background: lib ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.05)',
                              border:`1px solid ${lib ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.18)'}`,
                              transition:'all 0.15s' }}>
                            <div style={{ width:16, height:16, borderRadius:4, flexShrink:0,
                              background: lib ? '#4ade80' : 'transparent',
                              border:`2px solid ${lib ? '#4ade80' : '#4b5063'}`,
                              display:'flex', alignItems:'center', justifyContent:'center' }}>
                              {lib && <span style={{ color:'#0d0e16', fontSize:10, fontWeight:900 }}>✓</span>}
                            </div>
                            <span style={{ fontSize:12, color: lib ? '#e8eaf0' : '#6b7280', userSelect:'none' }}>
                              {pag.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
