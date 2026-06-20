import { useState, useRef, useEffect } from 'react'

const ITEM_H = 44
const VISIBLE = 5

function PickerCol({ items, initialIndex, onSelect }) {
  const ref = useRef(null)
  const timer = useRef(null)
  const [currentIdx, setCurrentIdx] = useState(initialIndex)

  // 初期スクロール位置を設定
  useEffect(() => {
    if (!ref.current) return
    ref.current.scrollTop = initialIndex * ITEM_H
  }, [])

  function handleScroll() {
    if (!ref.current) return
    const idx = Math.round(ref.current.scrollTop / ITEM_H)
    const clamped = Math.max(0, Math.min(items.length - 1, idx))
    setCurrentIdx(clamped)

    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!ref.current) return
      ref.current.scrollTop = clamped * ITEM_H
      onSelect(clamped)
    }, 150)
  }

  return (
    <div
      ref={ref}
      onScroll={handleScroll}
      style={{
        height: ITEM_H * VISIBLE,
        overflowY: 'scroll',
        scrollSnapType: 'y mandatory',
        WebkitOverflowScrolling: 'touch',
        width: 80,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      {/* 上パディング */}
      <div style={{ height: ITEM_H * 2, flexShrink: 0 }} />
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            height: ITEM_H,
            scrollSnapAlign: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: i === currentIdx ? 22 : 18,
            fontWeight: i === currentIdx ? 600 : 400,
            color: i === currentIdx ? 'var(--text)' : 'var(--text-tertiary)',
            transition: 'color 0.1s',
            userSelect: 'none',
          }}
        >
          {String(item).padStart(2, '0')}
        </div>
      ))}
      {/* 下パディング */}
      <div style={{ height: ITEM_H * 2, flexShrink: 0 }} />
    </div>
  )
}

export default function TimePicker({ value, onConfirm, onCancel }) {
  const now = new Date()
  const initH = value ? parseInt(value.split(':')[0]) : now.getHours()
  const initM = value ? parseInt(value.split(':')[1]) : now.getMinutes()

  const [hIdx, setHIdx] = useState(initH)
  const [mIdx, setMIdx] = useState(initM)

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: 60 }, (_, i) => i)

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'flex-end',
        maxWidth: 480,
        margin: '0 auto',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: '100%',
          background: 'var(--bg)',
          borderRadius: '16px 16px 0 0',
          overflow: 'hidden',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ヒント */}
        <div style={{
          padding: '10px 20px',
          textAlign: 'center',
          borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            上下にスクロールして時刻を選択
          </span>
        </div>

        {/* ドラムピッカー */}
        <div style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 4,
          padding: '8px 0',
        }}>
          {/* 選択ハイライト */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 192,
            height: ITEM_H,
            background: 'var(--bg-secondary)',
            borderRadius: 10,
            pointerEvents: 'none',
          }} />
          <PickerCol items={hours} initialIndex={initH} onSelect={setHIdx} />
          <span style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', zIndex: 1 }}>:</span>
          <PickerCol items={minutes} initialIndex={initM} onSelect={setMIdx} />
        </div>

        {/* ボタン */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 10,
        }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={() => onConfirm(`${String(hIdx).padStart(2, '0')}:${String(mIdx).padStart(2, '0')}`)}
          >
            確定
          </button>
        </div>
      </div>
    </div>
  )
}
