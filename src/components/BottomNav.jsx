function CoinIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#B8860B"/>
      <circle cx="12" cy="12" r="9.5" fill="#FFD700"/>
      <circle cx="12" cy="11.8" r="7.2" fill="none" stroke="#DAA520" strokeWidth="1.2"/>
      <circle cx="12" cy="11.8" r="7.2" fill="none" stroke="#B8860B" strokeWidth="0.5" strokeDasharray="2.5,2"/>
      <text x="12" y="17.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#7A5200" fontFamily="serif">¥</text>
    </svg>
  )
}

export default function BottomNav({ tab, setTab }) {
  const items = [
    { key: 'clock',    icon: '🕐', label: '打刻' },
    { key: 'calendar', icon: '📅', label: '履歴' },
    { key: 'salary',   icon: null,  label: '給与' },
    { key: 'settings', icon: '⚙️', label: '設定' },
  ]
  return (
    <nav className="bottom-nav">
      {items.map(item => (
        <button
          key={item.key}
          className={`nav-item${tab === item.key ? ' active' : ''}`}
          onClick={() => setTab(item.key)}
        >
          <span className="nav-icon">
            {item.key === 'salary' ? <CoinIcon /> : item.icon}
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
