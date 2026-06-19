export default function BottomNav({ tab, setTab }) {
  const items = [
    { key: 'clock',    icon: '🕐', label: '打刻' },
    { key: 'calendar', icon: '📅', label: '履歴' },
    { key: 'salary',   icon: '🪙', label: '給与' },
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
          <span className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}
