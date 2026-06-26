export default function FilialSelector({ value, onChange }) {
  const opts = [
    { id: '',    label: 'Todos' },
    { id: '01',  label: 'Almox 01' },
    { id: '04',  label: 'Almox 04' },
  ]
  return (
    <div>
      <div className="text-xs uppercase tracking-wider font-semibold mb-1.5" style={{ color: '#6b7280' }}>Almox</div>
      <div className="flex gap-1" style={{ background: '#20223a', borderRadius: 6, padding: 3, border: '1px solid #2a2d40' }}>
        {opts.map(o => (
          <button key={o.id} onClick={() => onChange(o.id)}
            className="px-3 py-1 rounded text-xs font-bold transition-all"
            style={value === o.id
              ? { background: '#f5c518', color: '#0d0e16' }
              : { background: 'transparent', color: '#6b7280' }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
