import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:      60_000,
      refetchInterval: 60_000,
      retry:           3,          // tenta 3x em caso de erro
      retryDelay:      attempt => Math.min(1000 * 2 ** attempt, 10_000), // backoff: 2s, 4s, 8s
      refetchOnWindowFocus: true,  // recarrega ao voltar para a aba
      refetchOnReconnect:   true,  // recarrega ao recuperar conexão
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
)
