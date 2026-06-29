import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, toRows, fDate } from '../api/client'
import DataTable from '../components/DataTable'
import { BadgeStatus } from '../components/Badge'

export default function AssistenciasPage() {
  const [cpfcnpj, setCpfcnpj] = useState('')
  const [query, setQuery]     = useState('')
  const [expanded, setExpanded] = useState(null)

  const assistencias = useQuery({
    queryKey: ['assistencias-page', query],
    queryFn: () => api.assistencias(query),
    enabled: !!query,
  })

  const itens = useQuery({
    queryKey: ['itens-page', expanded?.numero ?? expanded?.Numero, query],
    queryFn: () => api.assistenciaItens(
      expanded?.numero ?? expanded?.Numero ?? expanded?.id,
      query
    ),
    enabled: !!(expanded && query),
  })

  function handleSearch(e) {
    e.preventDefault()
    const v = cpfcnpj.trim()
    if (v) { setQuery(v); setExpanded(null) }
  }

  const rows = toRows(assistencias.data)
  const itensRows = toRows(itens.data)

  const COLS = [
    { key: 'numero',    label: 'Nº OS',     render: (v, r) => <span style={{ color: '#f5c518', fontFamily: 'monospace' }}>{v ?? r.Numero ?? r.id ?? '-'}</span> },
    { key: 'data',      label: 'Abertura',  render: (v, r) => fDate(v ?? r.Data ?? r.dataAbertura ?? r.DataAbertura) },
    { key: 'dataFec',   label: 'Fechamento', render: (v, r) => fDate(v ?? r.DataFechamento ?? r.dataFechamento) },
    { key: 'status',    label: 'Status',    render: (v, r) => <BadgeStatus value={v ?? r.Status ?? r.situacao} /> },
    { key: 'descricao', label: 'Descrição', render: (v, r) => v ?? r.Descricao ?? r.obs ?? '-' },
    { key: 'valor',     label: 'Valor',     align: 'right',
      render: (v, r) => {
        const val = v ?? r.Valor ?? r.total
        return val != null ? `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-'
      }
    },
  ]

  const ITENS_COLS = itensRows.length > 0
    ? Object.keys(itensRows[0]).slice(0, 8).map(k => ({ key: k, label: k }))
    : []

  const osId = expanded?.numero ?? expanded?.Numero ?? expanded?.id

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Assistências</h1>
      </div>

      <div className="page-body">
        {/* Busca */}
        <div className="card mb-4">
          <form onSubmit={handleSearch} className="flex gap-3 items-end">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider block mb-1.5" style={{ color: 'var(--text-muted)' }}>
                CPF / CNPJ do cliente
              </label>
              <input
                value={cpfcnpj}
                onChange={e => setCpfcnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="inp w-64"
              />
            </div>
            <button type="submit" className="btn-yellow" disabled={!cpfcnpj.trim()}>
              Buscar OS
            </button>
          </form>
        </div>

        {assistencias.isLoading && (
          <div className="state-box"><div className="spinner" /><p>Buscando assistências…</p></div>
        )}
        {assistencias.isError && <div className="err-box">{assistencias.error.message}</div>}

        {rows.length > 0 && (
          <div className="card mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {rows.length} ordens de serviço encontradas
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Clique em uma linha para ver os itens</p>
            </div>
            <DataTable
              columns={COLS}
              data={rows}
              maxRows={200}
              onRowClick={row => setExpanded(prev => (prev === row ? null : row))}
            />
          </div>
        )}

        {/* Itens expandidos */}
        {expanded && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#f5c518' }}>
                Itens da OS {osId}
              </h2>
              <button className="btn-ghost text-xs" onClick={() => setExpanded(null)}>✕ fechar</button>
            </div>

            {itens.isLoading && (
              <div className="state-box"><div className="spinner" /><p>Carregando itens…</p></div>
            )}
            {itens.isError && <div className="err-box">{itens.error.message}</div>}
            {itensRows.length > 0 && (
              <DataTable columns={ITENS_COLS} data={itensRows} />
            )}
            {!itens.isLoading && itensRows.length === 0 && !itens.isError && itens.data && (
              <div className="state-box text-sm">Nenhum item encontrado para esta OS</div>
            )}
          </div>
        )}

        {!query && (
          <div className="state-box">
            <p>Informe um CPF ou CNPJ para buscar as ordens de serviço</p>
          </div>
        )}
      </div>
    </div>
  )
}
