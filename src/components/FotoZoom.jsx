import { useState } from 'react'

function proxyUrl(url) {
  if (!url) return null
  if (url.startsWith('/api/image-proxy')) return url
  if (url.startsWith('http')) return `/api/image-proxy?url=${encodeURIComponent(url)}`
  return url
}

export default function FotoZoom({ url, alt, size = 40 }) {
  const src = proxyUrl(url)
  const [visible, setVisible] = useState(!!url)
  const [pos,     setPos]     = useState(null)

  if (!url || !visible) return (
    <div style={{ width: size, height: size, background: '#20223a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3a3f5c' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
      </svg>
    </div>
  )
  return (
    <div className="foto-zoom-container"
      onMouseEnter={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseMove={e => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      <img src={src} alt={alt} style={{ width: size, height: size, objectFit: 'cover', borderRadius: 6, background: '#20223a', display: 'block' }}
        onError={() => setVisible(false)} />
      {pos && (
        <div className="foto-zoom-popup" style={{ left: pos.x + 16, top: Math.min(pos.y - 110, window.innerHeight - 230) }}>
          <img src={src} alt={alt} style={{ width: 200, height: 200, objectFit: 'contain', display: 'block', borderRadius: 6 }} />
        </div>
      )}
    </div>
  )
}
