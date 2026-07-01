import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

const DOMINIO_PERMITIDO = 'azime.com.br'

export default function LoginPage() {
  const navigate              = useNavigate()
  const { session, profile, login } = useAuth()

  const [step,        setStep]        = useState('login')
  const [email,       setEmail]       = useState('')
  const [senha,       setSenha]       = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [error,       setError]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [shake,       setShake]       = useState(false)
  const [resetMode,   setResetMode]   = useState(false)
  const [resetEmail,  setResetEmail]  = useState('')
  const [resetMsg,    setResetMsg]    = useState('')
  const [resetLoading,setResetLoading]= useState(false)
  const [forcePwd,    setForcePwd]    = useState(() => window.location.hash.includes('type=recovery'))

  useEffect(() => {
    if (!session) return
    if (forcePwd) return // aguarda troca de senha antes de navegar
    if (!profile) {
      const t = setTimeout(() => {
        if (!profile) setError('Erro ao carregar perfil. Tente novamente.')
        setLoading(false)
      }, 5000)
      return () => clearTimeout(t)
    }
    if (!profile.ativo) { setError('Conta bloqueada. Contate o administrador.'); setLoading(false); return }
    if (profile.empresa === 'ambas') setStep('select')
    else navigate('/', { replace: true })
  }, [session, profile, forcePwd])

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    const emailNorm = email.trim().toLowerCase()

    if (!emailNorm.endsWith(`@${DOMINIO_PERMITIDO}`)) {
      setError(`Acesso permitido apenas para @${DOMINIO_PERMITIDO}`)
      setShake(true); setTimeout(() => setShake(false), 600)
      return
    }

    setLoading(true)
    try {
      await login(emailNorm, senha)
      if (senha === 'AZIME2026') setForcePwd(true)
    } catch (err) {
      const isAuthError = err?.status >= 400 && err?.status < 500
      setError(isAuthError ? 'E-mail ou senha incorretos.' : 'Falha de conexão. Verifique sua internet e tente novamente.')
      setShake(true); setTimeout(() => setShake(false), 600)
    }
    setLoading(false)
  }

  async function handleReset(e) {
    e.preventDefault()
    const emailNorm = resetEmail.trim().toLowerCase()

    if (!emailNorm.endsWith(`@${DOMINIO_PERMITIDO}`)) {
      setResetMsg(`Apenas e-mails @${DOMINIO_PERMITIDO} são aceitos.`)
      return
    }

    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(emailNorm, {
      redirectTo: `${window.location.origin}/login`,
    })
    setResetLoading(false)

    if (error) setResetMsg('Erro ao enviar. Verifique o e-mail e tente novamente.')
    else setResetMsg('E-mail enviado! Verifique sua caixa de entrada.')
  }

  function selectCompany(c) {
    if (c === 'novitah') return
    navigate('/', { replace: true })
  }

  const isRecovery = window.location.hash.includes('type=recovery')
  if (forcePwd) return (
    <ForceChangeScreen
      isReset={isRecovery}
      onSave={async (novaSenha) => {
        const { error } = await supabase.auth.updateUser({ password: novaSenha })
        if (error) throw error
        setForcePwd(false)
      }}
    />
  )

  if (step === 'select') return <SelectScreen onSelect={selectCompany} />

  if (resetMode) return (
    <ResetScreen
      email={resetEmail} setEmail={setResetEmail}
      msg={resetMsg} loading={resetLoading}
      onSubmit={handleReset}
      onBack={() => { setResetMode(false); setResetMsg('') }}
    />
  )

  return (
    <LoginScreen
      email={email} setEmail={setEmail}
      senha={senha} setSenha={setSenha}
      showPass={showPass} setShowPass={setShowPass}
      error={error} loading={loading} shake={shake}
      onSubmit={handleLogin}
      onForgot={() => { setResetMode(true); setResetEmail(email) }}
    />
  )
}

// ─── Tela de login ────────────────────────────────────────────────────────────
function LoginScreen({ email, setEmail, senha, setSenha, showPass, setShowPass, error, loading, shake, onSubmit, onForgot }) {
  return (
    <div style={{
      width:'100vw', height:'100vh', background:'#000',
      display:'flex', fontFamily:"'Segoe UI',sans-serif", overflow:'hidden',
    }}>
      <style>{`
        @keyframes floatAzime { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-20px) scale(1.025)} }
        @keyframes shimmerBtn { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes fadeInL    { from{opacity:0;transform:translateX(-24px)} to{opacity:1;transform:translateX(0)} }
        @keyframes fadeInR    { from{opacity:0;transform:translateX(24px)}  to{opacity:1;transform:translateX(0)} }
        @keyframes shake      { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-9px)} 40%{transform:translateX(9px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
        @keyframes glowLine   { 0%,100%{opacity:.3} 50%{opacity:1} }
        @keyframes glowAzime  { 0%,100%{filter:drop-shadow(0 0 30px rgba(212,175,55,0.30))} 50%{filter:drop-shadow(0 0 70px rgba(237,210,106,0.65))} }
        @keyframes titlePulse { 0%,100%{text-shadow:0 2px 24px rgba(212,175,55,0.40),0 0 60px rgba(212,175,55,0.15)} 50%{text-shadow:0 2px 40px rgba(237,210,106,0.85),0 0 100px rgba(212,175,55,0.35)} }
        @keyframes orbPulse   { 0%,100%{transform:translate(-50%,-50%) scale(1)} 50%{transform:translate(-50%,-50%) scale(1.08)} }
        @keyframes ringRot    { from{transform:translate(-50%,-50%) rotate(0deg)}   to{transform:translate(-50%,-50%) rotate(360deg)} }
        @keyframes ringRev    { from{transform:translate(-50%,-50%) rotate(0deg)}   to{transform:translate(-50%,-50%) rotate(-360deg)} }
        @keyframes streakL    { 0%{left:-60%;opacity:0} 10%{opacity:.7} 85%{opacity:.4} 100%{left:110%;opacity:0} }
        @keyframes streakR    { 0%{left:110%;opacity:0} 10%{opacity:.5} 85%{opacity:.3} 100%{left:-60%;opacity:0} }
        @keyframes partUp     { 0%{transform:translateY(100vh);opacity:0} 8%{opacity:.8} 92%{opacity:.3} 100%{transform:translateY(-8vh);opacity:0} }

        .l-inp { width:100%; box-sizing:border-box; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:14px 16px; color:#e8eaf0; font-size:14px; outline:none; transition:border-color .25s,box-shadow .25s; }
        .l-inp:focus { border-color:rgba(212,175,55,.75); box-shadow:0 0 0 3px rgba(212,175,55,.10); background:rgba(255,255,255,0.06); }
        .l-inp::placeholder { color:#383838; }
        .l-btn { width:100%; padding:14px; border:none; border-radius:10px; background:linear-gradient(90deg,#6b4a00,#B8860B,#D4AF37,#EDD26A,#D4AF37,#B8860B); background-size:300% auto; color:#1a1000; font-weight:900; font-size:13px; letter-spacing:.18em; cursor:pointer; animation:shimmerBtn 6s linear infinite; transition:opacity .2s,transform .12s; text-shadow:0 1px 2px rgba(255,255,255,0.15); }
        .l-btn:hover:not(:disabled) { opacity:.88; transform:translateY(-2px); }
        .l-btn:disabled { opacity:.45; cursor:wait; }
        .card-shake { animation:shake .5s ease; }
      `}</style>

      {/* ══════════ LADO ESQUERDO — 58% ══════════ */}
      <div style={{
        flex:'0 0 58%', position:'relative', overflow:'hidden',
        background:'#000',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        animation:'fadeInL .6s ease both',
      }}>

        {/* Orb dourado central de fundo */}
        <div style={{ position:'absolute', top:'50%', left:'50%', width:720, height:720, borderRadius:'50%', background:'radial-gradient(circle,rgba(212,175,55,0.13) 0%,rgba(180,140,30,0.05) 55%,transparent 70%)', animation:'orbPulse 6s ease-in-out infinite', pointerEvents:'none' }} />

        {/* Anéis rotativos concêntricos */}
        {[
          { s:620, dur:'32s', anim:'ringRot', op:.07, w:1   },
          { s:500, dur:'22s', anim:'ringRev', op:.10, w:1.5 },
          { s:380, dur:'15s', anim:'ringRot', op:.14, w:1   },
          { s:260, dur:'10s', anim:'ringRev', op:.18, w:1   },
        ].map((r,i) => (
          <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:r.s, height:r.s, borderRadius:'50%', border:`${r.w}px solid rgba(212,175,55,${r.op})`, animation:`${r.anim} ${r.dur} linear infinite`, pointerEvents:'none' }} />
        ))}

        {/* Partículas orbitando */}
        {[0,72,144,216,288].map((deg,i) => (
          <div key={i} style={{ position:'absolute', top:'50%', left:'50%', width:280, height:280, animation:`ringRot ${11+i*2}s linear infinite`, pointerEvents:'none' }}>
            <div style={{ position:'absolute', top:-5, left:'50%', marginLeft:-5, width:10, height:10, borderRadius:'50%', background:`rgba(212,${155+i*6},${30+i*4},0.90)`, boxShadow:`0 0 16px 6px rgba(212,175,55,0.65)`, transform:`rotate(${deg}deg) translateY(-140px)` }} />
          </div>
        ))}

        {/* Streaks diagonais — CONTIDOS no lado esquerdo */}
        {[
          { top:'12%', dur:'11s', delay:'0s',   h:1,   anim:'streakL', color:'rgba(212,175,55,0.50)' },
          { top:'28%', dur:'16s', delay:'3.5s', h:1.5, anim:'streakR', color:'rgba(237,210,106,0.38)' },
          { top:'48%', dur:'13s', delay:'1.5s', h:1,   anim:'streakL', color:'rgba(212,175,55,0.45)' },
          { top:'65%', dur:'18s', delay:'5s',   h:.8,  anim:'streakR', color:'rgba(184,134,11,0.42)' },
          { top:'80%', dur:'14s', delay:'7s',   h:1,   anim:'streakL', color:'rgba(212,175,55,0.40)' },
          { top:'92%', dur:'20s', delay:'2s',   h:.6,  anim:'streakR', color:'rgba(237,210,106,0.30)' },
        ].map((s,i) => (
          <div key={i} style={{ position:'absolute', top:s.top, height:s.h, width:'140%', background:s.color, transform:'rotate(-8deg)', animation:`${s.anim} ${s.dur} ${s.delay} ease-in-out infinite`, pointerEvents:'none' }} />
        ))}

        {/* Partículas subindo */}
        {['12%','28%','44%','60%','76%','88%'].map((left,i) => (
          <div key={i} style={{ position:'absolute', left, bottom:0, width:3+i%3, height:3+i%3, borderRadius:'50%', background:`rgba(${215-i*4},${142+i*9},0,0.75)`, animation:`partUp ${8+i*2}s ${i*1.5}s ease-in-out infinite`, pointerEvents:'none' }} />
        ))}

        {/* Reflexo de chão */}
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'35%', background:'radial-gradient(ellipse at 50% 100%,rgba(212,175,55,0.11) 0%,transparent 70%)', pointerEvents:'none' }} />

        {/* ── Conteúdo central ── */}
        <div style={{ position:'relative', zIndex:2, display:'flex', flexDirection:'column', alignItems:'center', padding:'0 40px' }}>

          {/* Marca — posicionada acima do bloco flutuante */}
          <div style={{ textAlign:'center', marginBottom:44 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'center', marginBottom:10 }}>
              <div style={{ flex:1, maxWidth:50, height:1, background:'linear-gradient(90deg,transparent,rgba(212,175,55,0.5))' }} />
              <div style={{ width:4, height:4, background:'#D4AF37', transform:'rotate(45deg)', boxShadow:'0 0 6px 2px rgba(212,175,55,0.6)' }} />
              <div style={{ flex:1, maxWidth:50, height:1, background:'linear-gradient(90deg,rgba(212,175,55,0.5),transparent)' }} />
            </div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:'0.55em', color:'rgba(212,175,55,0.75)', textTransform:'uppercase', fontFamily:"'Segoe UI',sans-serif" }}>
              Alinare &amp; Novitah
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'center', marginTop:10 }}>
              <div style={{ flex:1, maxWidth:50, height:1, background:'linear-gradient(90deg,transparent,rgba(212,175,55,0.3))' }} />
              <div style={{ flex:1, maxWidth:50, height:1, background:'linear-gradient(90deg,rgba(212,175,55,0.3),transparent)' }} />
            </div>
          </div>

          {/* SISTEMA DE COMPRAS flutuando — substitui o azime */}
          <div style={{ animation:'floatAzime 4.5s ease-in-out infinite', textAlign:'center', userSelect:'none' }}>

            {/* Separador topo */}
            <div style={{ display:'flex', alignItems:'center', gap:14, justifyContent:'center', marginBottom:24 }}>
              <div style={{ flex:1, maxWidth:80, height:1, background:'linear-gradient(90deg,transparent,rgba(212,175,55,0.45))' }} />
              <div style={{ width:5, height:5, background:'#D4AF37', transform:'rotate(45deg)', boxShadow:'0 0 8px 2px rgba(212,175,55,0.7)' }} />
              <div style={{ flex:1, maxWidth:80, height:1, background:'linear-gradient(90deg,rgba(212,175,55,0.45),transparent)' }} />
            </div>

            {/* "SISTEMA" — linha superior */}
            <div style={{
              fontSize:13, fontWeight:800, letterSpacing:'0.75em',
              color:'rgba(212,175,55,0.65)', textTransform:'uppercase',
              marginBottom:6,
            }}>
              Sistema
            </div>

            {/* "DE" — micro */}
            <div style={{
              fontSize:9, fontWeight:300, letterSpacing:'0.9em',
              color:'rgba(255,255,255,0.20)', textTransform:'uppercase',
              marginBottom:4,
            }}>
              de
            </div>

            {/* "COMPRAS" — elemento principal */}
            <div style={{
              fontFamily:'Georgia,"Times New Roman",serif',
              fontSize:88, fontWeight:700, letterSpacing:'0.05em',
              color:'#D4AF37', textTransform:'uppercase', lineHeight:0.92,
              textShadow:'0 2px 30px rgba(212,175,55,0.70), 0 0 100px rgba(212,175,55,0.25)',
              animation:'titlePulse 3.5s ease-in-out infinite',
            }}>
              Compras
            </div>

            {/* Separador baixo */}
            <div style={{ display:'flex', alignItems:'center', gap:14, justifyContent:'center', marginTop:24 }}>
              <div style={{ flex:1, maxWidth:80, height:1, background:'linear-gradient(90deg,transparent,rgba(212,175,55,0.4))' }} />
              <div style={{ display:'flex', gap:6 }}>
                <div style={{ width:4, height:4, background:'rgba(212,175,55,0.45)', transform:'rotate(45deg)' }} />
                <div style={{ width:5, height:5, background:'#D4AF37', transform:'rotate(45deg)', boxShadow:'0 0 8px 2px rgba(212,175,55,0.6)' }} />
                <div style={{ width:4, height:4, background:'rgba(212,175,55,0.45)', transform:'rotate(45deg)' }} />
              </div>
              <div style={{ flex:1, maxWidth:80, height:1, background:'linear-gradient(90deg,rgba(212,175,55,0.4),transparent)' }} />
            </div>

            {/* Tagline */}
            <div style={{ marginTop:20, fontSize:9, letterSpacing:'0.35em', color:'rgba(212,175,55,0.28)', textTransform:'uppercase' }}>
              Gestão · Estoque · Fornecedores
            </div>
          </div>
        </div>
      </div>

      {/* ── Divisor ── */}
      <div style={{ width:1, background:'linear-gradient(to bottom,transparent,rgba(212,175,55,0.25) 30%,rgba(212,175,55,0.25) 70%,transparent)', flexShrink:0 }} />

      {/* ══════════ LADO DIREITO — 42% ══════════ */}
      <div className={shake ? 'card-shake' : ''} style={{
        flex:'0 0 42%',
        background:'linear-gradient(160deg,#0c0c0c 0%,#080808 100%)',
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        padding:'0 64px', animation:'fadeInR .6s ease both', position:'relative',
      }}>
        {/* Brilho sutil no canto superior direito */}
        <div style={{ position:'absolute', top:0, right:0, width:300, height:300, background:'radial-gradient(ellipse at 100% 0%,rgba(212,175,55,0.07) 0%,transparent 70%)', pointerEvents:'none' }} />

        <div style={{ width:'100%', maxWidth:360, position:'relative', zIndex:1 }}>

          {/* Cabeçalho */}
          <div style={{ marginBottom:44, textAlign:'center' }}>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:'0.6em', color:'rgba(212,175,55,0.70)', textTransform:'uppercase', marginBottom:14 }}>
              Bem‑vindo de volta
            </div>
            <div style={{
              fontFamily:'Georgia,"Times New Roman",serif',
              fontSize:40, fontWeight:700, letterSpacing:'0.04em',
              color:'#ffffff', marginBottom:22, lineHeight:1,
            }}>
              Login
            </div>
            {/* Linha dourada centralizada */}
            <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center' }}>
              <div style={{ flex:1, height:1, background:'linear-gradient(90deg,transparent,rgba(212,175,55,0.50))' }} />
              <div style={{ width:5, height:5, background:'#D4AF37', transform:'rotate(45deg)', boxShadow:'0 0 10px 3px rgba(212,175,55,0.70)' }} />
              <div style={{ flex:1, height:1, background:'linear-gradient(90deg,rgba(212,175,55,0.50),transparent)' }} />
            </div>
          </div>

          <form onSubmit={onSubmit} style={{ display:'flex', flexDirection:'column', gap:26 }}>

            {/* Campo Email */}
            <div>
              <label style={{
                fontSize:11, fontWeight:700, color:'#888',
                marginBottom:10, display:'flex', alignItems:'center', gap:8,
                letterSpacing:'0.12em', textTransform:'uppercase',
              }}>
                <span style={{ display:'inline-block', width:3, height:12, background:'#D4AF37', borderRadius:2 }} />
                Email
              </label>
              <input className="l-inp" type="email" placeholder="seu@email.com"
                value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email" />
            </div>

            {/* Campo Senha */}
            <div>
              <label style={{
                fontSize:11, fontWeight:700, color:'#888',
                marginBottom:10, display:'flex', alignItems:'center', gap:8,
                letterSpacing:'0.12em', textTransform:'uppercase',
              }}>
                <span style={{ display:'inline-block', width:3, height:12, background:'#D4AF37', borderRadius:2 }} />
                Senha
              </label>
              <div style={{ position:'relative' }}>
                <input className="l-inp" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                  value={senha} onChange={e => setSenha(e.target.value)}
                  required autoComplete="current-password" style={{ paddingRight:80 }} />
                <button type="button" onClick={() => setShowPass(p => !p)} style={{
                  position:'absolute', right:10, top:'50%', transform:'translateY(-50%)',
                  background:'rgba(212,175,55,0.08)', border:'1px solid rgba(212,175,55,0.28)',
                  borderRadius:6, color:'#D4AF37', fontSize:9, fontWeight:800,
                  cursor:'pointer', padding:'5px 12px', letterSpacing:'0.08em', textTransform:'uppercase',
                }}>
                  {showPass ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.22)', borderRadius:8, padding:'12px 16px', color:'#f87171', fontSize:12, textAlign:'center', letterSpacing:'0.03em' }}>
                {error}
              </div>
            )}

            <button className="l-btn" type="submit" disabled={loading} style={{ marginTop:4 }}>
              {loading ? 'VERIFICANDO...' : 'ACESSAR SISTEMA'}
            </button>

            <div style={{ textAlign:'center', marginTop:-10 }}>
              <button type="button" onClick={onForgot} style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'rgba(212,175,55,0.55)', letterSpacing:'0.04em' }}>
                Esqueceu a senha?
              </button>
            </div>
          </form>

          {/* Rodapé */}
          <div style={{ marginTop:48, textAlign:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, justifyContent:'center' }}>
              <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.04)' }} />
              <span style={{ fontSize:9, color:'#2e2e2e', letterSpacing:'0.18em', textTransform:'uppercase' }}>
                Alinare Joias · 2026
              </span>
              <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.04)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Troca de senha obrigatória ───────────────────────────────────────────────
function ForceChangeScreen({ onSave, isReset = false }) {
  const [nova,      setNova]      = useState('')
  const [confirma,  setConfirma]  = useState('')
  const [showNova,  setShowNova]  = useState(false)
  const [showConf,  setShowConf]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [ok,        setOk]        = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (nova.length < 6)           return setError('A senha deve ter pelo menos 6 caracteres.')
    if (nova === 'AZIME2026')      return setError('Escolha uma senha diferente da senha temporária.')
    if (nova !== confirma)         return setError('As senhas não coincidem.')
    setLoading(true)
    try {
      await onSave(nova)
      setOk(true)
      setTimeout(() => window.location.replace('/'), 1500)
    } catch (err) {
      setError(err.message || 'Erro ao salvar. Tente novamente.')
    }
    setLoading(false)
  }

  return (
    <div style={{ width:'100vw', height:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Segoe UI',sans-serif" }}>
      <div style={{ width:420, background:'rgba(12,12,20,0.97)', border:'1px solid rgba(212,175,55,0.25)', borderRadius:20, padding:'48px 40px', boxShadow:'0 30px 80px rgba(0,0,0,0.7)' }}>
        {ok ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:800, color:'#4ade80', marginBottom:8 }}>Senha alterada!</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)' }}>Redirecionando...</div>
          </div>
        ) : (
          <>
            <div style={{ textAlign:'center', marginBottom:32 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🔐</div>
              <div style={{ fontSize:13, fontWeight:800, letterSpacing:'0.4em', color:'rgba(212,175,55,0.8)', textTransform:'uppercase', marginBottom:10 }}>
                {isReset ? 'Redefinir senha' : 'Primeiro acesso'}
              </div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', lineHeight:1.7 }}>
                {isReset
                  ? 'Digite sua nova senha para recuperar o acesso.'
                  : <>Você entrou com uma senha temporária.<br />Crie uma senha pessoal para continuar.</>}
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:18 }}>
              {/* Nova senha */}
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:8, display:'block', letterSpacing:'0.1em', textTransform:'uppercase' }}>Nova senha</label>
                <div style={{ position:'relative' }}>
                  <input
                    type={showNova ? 'text' : 'password'} value={nova} onChange={e => setNova(e.target.value)}
                    required placeholder="Mínimo 6 caracteres"
                    style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'14px 70px 14px 16px', color:'#e8eaf0', fontSize:14, outline:'none' }}
                  />
                  <button type="button" onClick={() => setShowNova(p => !p)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'rgba(212,175,55,0.08)', border:'1px solid rgba(212,175,55,0.28)', borderRadius:6, color:'#D4AF37', fontSize:9, fontWeight:800, cursor:'pointer', padding:'5px 10px', letterSpacing:'0.08em', textTransform:'uppercase' }}>
                    {showNova ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </div>

              {/* Confirmar senha */}
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#888', marginBottom:8, display:'block', letterSpacing:'0.1em', textTransform:'uppercase' }}>Confirmar senha</label>
                <div style={{ position:'relative' }}>
                  <input
                    type={showConf ? 'text' : 'password'} value={confirma} onChange={e => setConfirma(e.target.value)}
                    required placeholder="Repita a nova senha"
                    style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'14px 70px 14px 16px', color:'#e8eaf0', fontSize:14, outline:'none' }}
                  />
                  <button type="button" onClick={() => setShowConf(p => !p)} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'rgba(212,175,55,0.08)', border:'1px solid rgba(212,175,55,0.28)', borderRadius:6, color:'#D4AF37', fontSize:9, fontWeight:800, cursor:'pointer', padding:'5px 10px', letterSpacing:'0.08em', textTransform:'uppercase' }}>
                    {showConf ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:8, padding:'11px 14px', color:'#f87171', fontSize:12, textAlign:'center' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={loading} style={{ padding:'14px', border:'none', borderRadius:10, background:'linear-gradient(90deg,#6b4a00,#B8860B,#D4AF37,#EDD26A,#D4AF37,#B8860B)', backgroundSize:'300% auto', color:'#1a1000', fontWeight:900, fontSize:13, letterSpacing:'.18em', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.5 : 1, marginTop:4 }}>
                {loading ? 'SALVANDO...' : 'DEFINIR MINHA SENHA'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Tela de recuperação de senha ─────────────────────────────────────────────
function ResetScreen({ email, setEmail, msg, loading, onSubmit, onBack }) {
  const enviado = msg && msg.includes('enviado')
  return (
    <div style={{ width:'100vw', height:'100vh', background:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Segoe UI',sans-serif" }}>
      <div style={{ width:400, background:'rgba(18,18,28,0.95)', border:'1px solid rgba(212,175,55,0.2)', borderRadius:20, padding:'48px 40px', boxShadow:'0 30px 80px rgba(0,0,0,0.7)' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:13, fontWeight:800, letterSpacing:'0.5em', color:'rgba(212,175,55,0.7)', textTransform:'uppercase', marginBottom:12 }}>
            Recuperar acesso
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)', lineHeight:1.6 }}>
            Digite seu e-mail corporativo e enviaremos um link para redefinir sua senha.
          </div>
        </div>

        {!enviado ? (
          <form onSubmit={onSubmit} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="seu@azime.com.br"
              style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'14px 16px', color:'#e8eaf0', fontSize:14, outline:'none' }}
            />
            {msg && <div style={{ fontSize:12, color:'#f87171', textAlign:'center' }}>{msg}</div>}
            <button type="submit" disabled={loading}
              style={{ padding:'14px', border:'none', borderRadius:10, background:'linear-gradient(90deg,#6b4a00,#B8860B,#D4AF37,#EDD26A,#D4AF37,#B8860B)', backgroundSize:'300% auto', color:'#1a1000', fontWeight:900, fontSize:13, letterSpacing:'.18em', cursor:'pointer', opacity: loading ? 0.5 : 1 }}>
              {loading ? 'ENVIANDO...' : 'ENVIAR LINK'}
            </button>
          </form>
        ) : (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:36, marginBottom:16 }}>✉️</div>
            <div style={{ fontSize:14, color:'#4ade80', fontWeight:700, marginBottom:8 }}>E-mail enviado!</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', lineHeight:1.6 }}>
              Verifique sua caixa de entrada em <strong style={{ color:'rgba(212,175,55,0.8)' }}>{email}</strong> e clique no link para redefinir sua senha.
            </div>
          </div>
        )}

        <button onClick={onBack} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(212,175,55,0.5)', fontSize:12, display:'block', margin:'24px auto 0', letterSpacing:'0.04em' }}>
          ← Voltar ao login
        </button>
      </div>
    </div>
  )
}

// ─── Seleção de empresa ───────────────────────────────────────────────────────
function SelectScreen({ onSelect }) {
  return (
    <div style={{
      width:'100vw', height:'100vh', background:'#050505',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      fontFamily:"'Segoe UI', sans-serif", overflow:'hidden', position:'relative',
    }}>
      <style>{`
        @keyframes floatA    { 0%,100%{transform:translateY(0)}    50%{transform:translateY(-16px)} }
        @keyframes floatB    { 0%,100%{transform:translateY(0)}    50%{transform:translateY(-18px)} }
        @keyframes glowBlue  { 0%,100%{box-shadow:0 8px 40px rgba(26,56,120,0.40),0 0 0 2px #1a3878} 50%{box-shadow:0 16px 80px rgba(26,56,120,0.65),0 0 0 2px #1a3878} }
        @keyframes glowBrown { 0%,100%{box-shadow:0 8px 36px rgba(160,100,80,0.18),0 0 0 1px rgba(160,100,80,0.24)} 50%{box-shadow:0 14px 64px rgba(170,110,85,0.40),0 0 0 1px rgba(170,110,85,0.48)} }
        @keyframes fadeUp2   { from{opacity:0;transform:translateY(28px)} to{opacity:1;transform:translateY(0)} }
        @keyframes badgePulse{ 0%,100%{opacity:.65} 50%{opacity:1} }
        @keyframes shimmerBtnSel { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes shimmerBrown  { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes ringSelR  { from{transform:translate(-50%,-50%) rotate(0deg)} to{transform:translate(-50%,-50%) rotate(360deg)} }
        @keyframes ringSelL  { from{transform:translate(-50%,-50%) rotate(0deg)} to{transform:translate(-50%,-50%) rotate(-360deg)} }
        @keyframes titleGlow { 0%,100%{text-shadow:0 2px 20px rgba(255,255,255,0.06)} 50%{text-shadow:0 2px 40px rgba(255,255,255,0.16)} }
        @keyframes bgGrid    { 0%{opacity:.03} 50%{opacity:.06} 100%{opacity:.03} }

        .sc     { cursor:pointer; transition:transform .3s cubic-bezier(.34,1.56,.64,1),filter .3s; }
        .sc:hover { transform:translateY(-14px) scale(1.03) !important; filter:brightness(1.1); }
        .sc-dis { cursor:not-allowed; }
        .sc-dis:hover { transform:translateY(0) scale(1) !important; }
      `}</style>

      {/* Fundo: grade sutil + orbs nas cores dos cards */}
      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', animation:'bgGrid 6s ease-in-out infinite' }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="g" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)" />
      </svg>
      {/* Orb azul — lado esquerdo onde está Alinare */}
      <div style={{ position:'absolute', width:550, height:550, borderRadius:'50%', background:'radial-gradient(circle,rgba(25,60,170,0.10) 0%,transparent 65%)', top:'50%', left:'28%', transform:'translate(-50%,-50%)', pointerEvents:'none' }} />
      {/* Orb marrom — lado direito onde está Novitah */}
      <div style={{ position:'absolute', width:480, height:480, borderRadius:'50%', background:'radial-gradient(circle,rgba(160,100,75,0.09) 0%,transparent 65%)', top:'50%', left:'72%', transform:'translate(-50%,-50%)', pointerEvents:'none' }} />
      {/* Linha divisória central */}
      <div style={{ position:'absolute', top:'20%', bottom:'20%', left:'50%', width:1, background:'linear-gradient(to bottom,transparent,rgba(255,255,255,0.04),transparent)', pointerEvents:'none' }} />

      {/* Cabeçalho */}
      <div style={{ textAlign:'center', marginBottom:56, animation:'fadeUp2 .5s ease both', position:'relative', zIndex:2 }}>
        <div style={{ fontSize:13, fontWeight:800, letterSpacing:'0.45em', color:'rgba(212,175,55,0.80)', textTransform:'uppercase', marginBottom:16, textShadow:'0 0 14px rgba(212,175,55,0.35)' }}>
          Selecione o sistema
        </div>
        <div style={{ fontFamily:'Georgia,"Times New Roman",serif', fontSize:54, fontWeight:700, letterSpacing:'0.05em', color:'#D4AF37', lineHeight:1, animation:'titleGlow 4s ease-in-out infinite', textShadow:'0 2px 30px rgba(212,175,55,0.55), 0 0 80px rgba(212,175,55,0.20)' }}>
          Acesso
        </div>
        <div style={{ marginTop:14, display:'flex', alignItems:'center', gap:14, justifyContent:'center' }}>
          <div style={{ width:60, height:1, background:'linear-gradient(90deg,transparent,rgba(212,175,55,0.55))' }} />
          <div style={{ width:5, height:5, background:'#D4AF37', transform:'rotate(45deg)', boxShadow:'0 0 8px 3px rgba(212,175,55,0.65)' }} />
          <div style={{ width:60, height:1, background:'linear-gradient(90deg,rgba(212,175,55,0.55),transparent)' }} />
        </div>
      </div>

      {/* ── Cards ── */}
      <div style={{ display:'flex', gap:32, position:'relative', zIndex:2, animation:'fadeUp2 .6s .08s ease both', opacity:0, alignItems:'stretch' }}>

        {/* ALINARE */}
        <div className="sc" onClick={() => onSelect('alinare')} style={{
          width:310, borderRadius:20,
          background:'linear-gradient(160deg,#08101e 0%,#060c18 60%,#091428 100%)',
          border:'1px solid #1a3878',
          animation:'floatA 4.5s ease-in-out infinite, glowBlue 4.5s ease-in-out infinite',
          display:'flex', flexDirection:'column', alignItems:'center',
          overflow:'hidden', position:'relative',
        }}>
          {/* Faixa topo navy do logo */}
          <div style={{ width:'100%', height:3, background:'linear-gradient(90deg,transparent,#1a3878,#1a3878,transparent)', flexShrink:0 }} />
          {/* Brilho interno topo */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:200, background:'radial-gradient(ellipse at 50% -20%,rgba(26,56,120,0.20) 0%,transparent 70%)', pointerEvents:'none' }} />
          {/* Brilho canto esquerdo */}
          <div style={{ position:'absolute', top:0, left:0, width:120, height:120, background:'radial-gradient(circle at 0% 0%,rgba(26,56,120,0.10) 0%,transparent 70%)', pointerEvents:'none' }} />

          <div style={{ padding:'36px 32px 32px', display:'flex', flexDirection:'column', alignItems:'center', width:'100%', boxSizing:'border-box', flex:1 }}>
            {/* Logo sem container e sem anéis */}
            <div style={{ marginBottom:28, flexShrink:0 }}>
              <img src="/alinare.png" alt="Alinare" style={{ width:100, height:100, objectFit:'contain', borderRadius:18 }} onError={e => e.target.style.display='none'} />
            </div>

            <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.5em', color:'rgba(80,120,190,0.85)', textTransform:'uppercase', marginBottom:20, animation:'badgePulse 3s ease-in-out infinite' }}>
              Compras
            </div>

            <div style={{ width:'100%', height:1, background:'linear-gradient(90deg,transparent,rgba(26,56,120,0.40),transparent)', marginBottom:20 }} />

            <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', textAlign:'center', lineHeight:1.9, marginBottom:28, letterSpacing:'0.01em', flex:1 }}>
              Gestão de compras, estoque,<br />fornecedores e curva ABC
            </div>

            <div style={{
              width:'100%', padding:'13px 0', borderRadius:10, textAlign:'center',
              background:'linear-gradient(90deg,#0e2050,#1a3878,#1a3878,#0e2050)',
              backgroundSize:'200% auto', color:'#c8d8f8', fontWeight:800,
              fontSize:11, letterSpacing:'0.22em',
              boxShadow:'0 6px 24px rgba(10,30,100,0.5)',
              animation:'shimmerBtnSel 2.5s linear infinite',
            }}>
              ACESSAR
            </div>
          </div>
        </div>

        {/* NOVITAH — terracota como acento */}
        <div className="sc sc-dis" style={{
          width:310, borderRadius:20,
          background:'linear-gradient(160deg,#100806 0%,#0c0604 60%,#140a08 100%)',
          border:'1px solid rgba(140,70,48,0.45)',
          animation:'floatB 5.5s 0.8s ease-in-out infinite, glowBrown 5.5s ease-in-out infinite',
          display:'flex', flexDirection:'column', alignItems:'center',
          overflow:'hidden', position:'relative',
        }}>
          {/* Faixa topo terracota brilhante */}
          <div style={{ width:'100%', height:3, background:'linear-gradient(90deg,transparent,#c05838,#e07050,#c05838,transparent)', flexShrink:0 }} />
          <div style={{ position:'absolute', top:0, left:0, right:0, height:200, background:'radial-gradient(ellipse at 50% -20%,rgba(160,80,50,0.22) 0%,transparent 70%)', pointerEvents:'none' }} />
          {/* Brilho canto direito */}
          <div style={{ position:'absolute', top:0, right:0, width:120, height:120, background:'radial-gradient(circle at 100% 0%,rgba(160,80,50,0.12) 0%,transparent 70%)', pointerEvents:'none' }} />

          <div style={{ padding:'36px 32px 32px', display:'flex', flexDirection:'column', alignItems:'center', width:'100%', boxSizing:'border-box', flex:1 }}>
            {/* Logo sem container e sem anéis */}
            <div style={{ marginBottom:28, flexShrink:0 }}>
              <img src="/novitha.png" alt="Novitah" style={{ width:100, height:100, objectFit:'contain', borderRadius:18, filter:'brightness(0.65)' }} onError={e => e.target.style.display='none'} />
            </div>

            <div style={{ fontSize:11, fontWeight:800, letterSpacing:'0.5em', color:'rgba(180,110,85,0.8)', textTransform:'uppercase', marginBottom:20, animation:'badgePulse 3s ease-in-out infinite' }}>
              Compras
            </div>

            <div style={{ width:'100%', height:1, background:'linear-gradient(90deg,transparent,rgba(160,95,75,0.28),transparent)', marginBottom:20 }} />

            <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', textAlign:'center', lineHeight:1.9, marginBottom:28, flex:1 }}>
              Em desenvolvimento<br />para lançamento em breve
            </div>

            <div style={{
              width:'100%', padding:'13px 0', borderRadius:10, textAlign:'center',
              background:'rgba(160,95,75,0.08)', border:'1px solid rgba(160,95,75,0.22)',
              color:'rgba(180,110,85,0.6)', fontWeight:800, fontSize:11, letterSpacing:'0.22em',
            }}>
              EM BREVE
            </div>
          </div>
        </div>
      </div>

      {/* Rodapé */}
      <div style={{ marginTop:52, textAlign:'center', animation:'fadeUp2 .65s .18s ease both', opacity:0, position:'relative', zIndex:2 }}>
        <div style={{ fontSize:9, color:'#1e1e1e', letterSpacing:'0.22em', textTransform:'uppercase' }}>
          Alinare · Novitah · Sistemas Internos · 2026
        </div>
      </div>
    </div>
  )
}
