import { useState, useRef } from 'react'

export default function BottomSheet({ title, onClose, children }) {
  const [dragY, setDragY] = useState(0)
  const startY = useRef(null)
  const startX = useRef(null)
  const dragging = useRef(false)
  const isVertical = useRef(null) // null=未判定, true=縦, false=横

  function handleTouchStart(e) {
    startY.current = e.touches[0].clientY
    startX.current = e.touches[0].clientX
    dragging.current = true
    isVertical.current = null
    setDragY(0)
  }

  function handleTouchMove(e) {
    if (!dragging.current) return
    const deltaY = e.touches[0].clientY - startY.current
    const deltaX = Math.abs(e.touches[0].clientX - startX.current)

    // 最初の動きで縦か横かを判定（4px以上動いた時点で決定）
    if (isVertical.current === null && (Math.abs(deltaY) > 4 || deltaX > 4)) {
      isVertical.current = Math.abs(deltaY) >= deltaX
    }

    // 横スワイプは無視
    if (isVertical.current === false) return

    if (deltaY > 0 && isVertical.current) {
      e.preventDefault()
      setDragY(deltaY)
    }
  }

  function handleTouchEnd() {
    dragging.current = false
    if (dragY > 100) {
      onClose()
    } else {
      setDragY(0)
    }
    startY.current = null
    startX.current = null
    isVertical.current = null
  }

  const sheetStyle = {
    transform: dragY > 0 ? `translateY(${dragY}px)` : 'translateY(0)',
    transition: dragY === 0 ? 'transform 0.25s ease' : 'none',
  }

  return (
    <div
      className="sheet-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="sheet"
        style={sheetStyle}
        onTouchMove={e => e.stopPropagation()}
      >
        <div
          className="sheet-handle"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ cursor: 'grab', paddingTop: 12, paddingBottom: 8 }}
        />
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}
