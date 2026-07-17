import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { CompanyProvider } from './contexts/CompanyContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SugestoesPage from './pages/SugestoesPage'
import ComprasPage from './pages/ComprasPage'
import FinanceiroPage from './pages/FinanceiroPage'
import ClienteDetalhePage from './pages/ClienteDetalhePage'
import VendedorDetalhePage from './pages/VendedorDetalhePage'
import AssistenciasPage from './pages/AssistenciasPage'
import PedidosPage from './pages/PedidosPage'
import FornecedorPage from './pages/FornecedorPage'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'

function PrivateRoute({ children, chave, soFinanceiro, soAdmin }) {
  const { session, profile, podeVer, podeFinanceiro, loading } = useAuth()
  if (loading || (session && !profile)) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#6b7280', fontSize:13 }}>Carregando…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!profile.ativo) return <Navigate to="/login" replace />
  if (soAdmin && profile.role !== 'admin') return <Navigate to="/" replace />
  if (soFinanceiro && !podeFinanceiro) return <Navigate to="/" replace />
  if (chave && !podeVer(chave)) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:8 }}>
      <div style={{ fontSize:32 }}>🔒</div>
      <div style={{ color:'#e8eaf0', fontWeight:700 }}>Acesso negado</div>
      <div style={{ color:'#6b7280', fontSize:13 }}>Você não tem permissão para acessar esta página.</div>
    </div>
  )
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<PrivateRoute chave="dashboard"><Dashboard /></PrivateRoute>} />
        <Route path="sugestoes"    element={<PrivateRoute chave="curva_abc"><SugestoesPage /></PrivateRoute>} />
        <Route path="compras"      element={<PrivateRoute chave="compras"><ComprasPage /></PrivateRoute>} />
        <Route path="pedidos"      element={<PrivateRoute chave="pedidos"><PedidosPage /></PrivateRoute>} />
        <Route path="fornecedores" element={<PrivateRoute chave="fornecedores"><FornecedorPage /></PrivateRoute>} />
        <Route path="financeiro"   element={<PrivateRoute chave="clientes" soFinanceiro><FinanceiroPage /></PrivateRoute>} />
        <Route path="financeiro/cliente/:codigo" element={<PrivateRoute chave="clientes" soFinanceiro><ClienteDetalhePage /></PrivateRoute>} />
        <Route path="financeiro/vendedor/:codigo" element={<PrivateRoute chave="clientes" soFinanceiro><VendedorDetalhePage /></PrivateRoute>} />
        <Route path="assistencias" element={<PrivateRoute chave="assistencias"><AssistenciasPage /></PrivateRoute>} />
        <Route path="admin"        element={<PrivateRoute soAdmin><AdminPage /></PrivateRoute>} />
        <Route path="*"            element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <CompanyProvider>
          <AppRoutes />
        </CompanyProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
