export default function KPICard({ label, value, sub, color = 'yellow', icon }) {
  const colors = {
    yellow: '#f5c518',
    cyan:   '#00b4d8',
    green:  '#4ade80',
    red:    '#f87171',
    orange: '#fb923c',
    purple: '#a78bfa',
  }
  const c = colors[color] ?? colors.yellow

  return (
    <div className="card flex flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <span className="kpi-label">{label}</span>
        {icon && (
          <span className="flex items-center justify-center w-8 h-8 rounded-lg text-base" style={{ background: c + '22', color: c }}>
            {icon}
          </span>
        )}
      </div>
      <div className="kpi-value" style={{ color: c }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}
