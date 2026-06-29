import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, toRows, fDate } from '../api/client'
import DataTable from '../components/DataTable'

export default function ClientesPage() {
  const [cpfcnpj, setCpfcnpj] = useState('')
  const [query, setQuery]     = useState('')
  const [selectedOS, setSelectedOS] = useState(null)

  const cliente = useQuery({
    queryKey: ['cliente', query],
    queryFn: () => api.cliente(query),
    enabled: !!query,
  })

  const assistencias = useQuery({
    queryKey: ['assistencias', query],
    queryFn: () => api.assistencias(query),
    enabled: !!query,
  })

  const itens = useQuery({
    queryKey: ['itens', selectedOS?.numero ?? selectedOS?.Numero, query],
    queryFn: () => api.assistenciaItens(selectedOS?.numero ?? selectedOS?.Numero ?? selectedOS?.id, query),
    enabled: !!(selectedOS && query),
  })

  function handleSearch(e) {
    e.preventDefault()
    const v = cpfcnpj.trim()
    if (v) setQuery(v)
    setSelectedOS(null)
  }

  const clienteInfo = cliente.data
    ? (Array.isArray(cliente.data) ? cliente.data[0] : (cliente.data?.cliente ?? cliente.data))
    : null

  const osRows = toRows(assistencias.data)

  const OS_COLS = [
    { key: 'numero',   label: 'Nº OS',   render: (v, r) => v ?? r.Numero ?? r.id ?? '-' },
    { key: 'data',     label: 'Data',    render: (v, r) => fDate(v ?? r.Data ?? r.dataAbertura) },
    { key: 'status',   label: 'Status',  render: (v, r) => v ?? r.Status ?? r.situacao ?? '-' },
    { key: 'descricao',label: 'Descrição', render: (v, r) => v ?? r.Descricao ?? r.obs ?? '-' },
    { key: 'valor',    label: 'Valor',   align: 'right', render: (v, r) => {
      const val = v ?? r.Valor ?? r.total
      return val != null ? `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'
    }},
  ]

  const itensRows = toRows(itens.data)
  const ITENS_COLS = itensRows.length > 0
    ? Object.keys(itensRows[0]).slice(0, 7).map(k => ({ key: k, label: k }))
    : []

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
      </div>

      <div className="page-body">
        {/* Busca */}
        <div className="card mb-4">
          <form onSubmit={handleSearch} className="flex gap-3 items-end">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                CPF / CNPJ
              </label>
              <input
                value={cpfcnpj}
                onChange={e => setCpfcnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="inp w-64"
              />
            </div>
            <button type="submit" className="btn-yellow" disabled={!cpfcnpj.trim()}>
              Buscar
            </button>
          </form>
        </div>

        {/* Loading */}
        {(cliente.isLoading || assistencias.isLoading) && (
          <div className="state-box"><div className="spinner" /><p>Buscando cliente…</p></div>
        )}

        {/* Erros */}
        {cliente.isError && <div className="err-box">{cliente.error.message}</div>}
        {assistencias.isError && <div className="err-box">{assistencias.error.message}</div>}

        {/* Dados do cliente */}
        {clienteInfo && (
          <div className="card mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Dados do Cliente
            </h2>
            <div className="grid grid-cols-2 gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {Object.entries(clienteInfo)
                .filter(([, v]) => v != null && typeof v !== 'object')
                .map(([k, v]) => (
                  <div key={k}>
                    <div className="text-xs uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-dim)' }}>{k}</div>
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{String(v)}</div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Assistências */}
        {osRows.length > 0 && (
          <div className="card mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
              Histórico de Assistências ({osRows.length})
            </h2>
            <DataTable
              columns={OS_COLS}
              data={osRows}
              onRowClick={row => setSelectedOS(prev => prev === row ? null : row)}
              maxRows={100}
            />
          </div>
        )}

        {/* Itens da OS selecionada */}
        {selectedOS && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#f5c518' }}>
                Itens — OS {selectedOS?.numero ?? selectedOS?.Numero ?? selectedOS?.id}
              </h2>
              <button className="btn-ghost text-xs" onClick={() => setSelectedOS(null)}>✕ fechar</button>
            </div>
            {itens.isLoading && <div className="state-box"><div className="spinner" /><p>Carregando itens…</p></div>}
            {itens.isError && <div className="err-box">{itens.error.message}</div>}
            {itensRows.length > 0 && <DataTable columns={ITENS_COLS} data={itensRows} />}
          </div>
        )}
      </div>
    </div>
  )
}
