import { useState, useRef, useEffect } from 'react'

export default function BottomSheet({ title, onClose, children }) {
  const dragY = useRef(0)
  const [dragYState, setDragYState] = useState(0)
  const startY = useRef(null)
  const dragging = useRef(false)
  const handleRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    const el = handleRef.current
    if (!el) return

    function onStart(e) {
      startY.current = e.touches[0].clientY
      dragging.current = true
      dragY.current = 0
      setDragYState(0)
    }

    function onMove(e) {
      if (!dragging.current) return
      const delta = e.touches[0].clientY - startY.current
      if (delta > 0) {
        e.preventDefault()
        dragY.current = delta
        setDragYState(delta)
      }
    }

    function onEnd() {
      dragging.current = false
      if (dragY.current > 100) {
        onCloseRef.current()
      }
      dragY.current = 0
      setDragYState(0)
      startY.current = null
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [])

  const sheetStyle = {
    transform: dragYState > 0 ? `translateY(${dragYState}px)` : 'translateY(0)',
    transition: dragYState === 0 ? 'transform 0.25s ease' : 'none',
  }

  return (
    <div
      className="sheet-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sheet" style={sheetStyle}>
        {/* ドラッグハンドル — タッチ判定を広めに */}
        <div
          ref={handleRef}
          className="sheet-handle-area"
          style={{ touchAction: 'none' }}
        >
          <div className="sheet-handle" />
        </div>
        {title && <div className="sheet-title">{title}</div>}
        {/* コンテンツエリアだけスクロール — sheet本体は動かない */}
        <div className="sheet-body">
          {children}
        </div>
      </div>
    </div>
  )
}
