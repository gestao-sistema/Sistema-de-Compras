import { useState, useMemo } from 'react'

export default function DataTable({ columns, data, onRowClick, searchable = false, maxRows = 500 }) {
  const [sortKey, setSortKey]  = useState(null)
  const [sortDir, setSortDir]  = useState('asc')
  const [search,  setSearch]   = useState('')

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const rows = useMemo(() => {
    let r = [...(data || [])]

    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(row => columns.some(col => {
        const v = row[col.key]
        return v != null && String(v).toLowerCase().includes(q)
      }))
    }

    if (sortKey) {
      r.sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey]
        const na = parseFloat(va), nb = parseFloat(vb)
        const cmp = (!isNaN(na) && !isNaN(nb))
          ? na - nb
          : String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR')
        return sortDir === 'asc' ? cmp : -cmp
      })
    }

    return r.slice(0, maxRows)
  }, [data, search, sortKey, sortDir, columns, maxRows])

  return (
    <div>
      {searchable && (
        <div className="mb-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Pesquisar..."
            className="inp w-64"
          />
        </div>
      )}
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  onClick={() => toggleSort(col.key)}
                  style={{ textAlign: col.align || 'left' }}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1" style={{ color: '#f5c518' }}>
                      {sortDir === 'asc' ? '▲' : '▼'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length}>
                  <div className="state-box text-sm">Nenhum resultado</div>
                </td>
              </tr>
            )}
            {rows.map((row, i) => (
              <tr
                key={i}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={onRowClick ? 'tbl-clickable' : ''}
              >
                {columns.map(col => (
                  <td key={col.key} className={col.align === 'right' ? 'num' : ''}>
                    {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.length > maxRows && (
        <p className="text-xs mt-2" style={{ color: '#4b5063' }}>
          Exibindo {maxRows} de {data.length} registros
        </p>
      )}
    </div>
  )
}
