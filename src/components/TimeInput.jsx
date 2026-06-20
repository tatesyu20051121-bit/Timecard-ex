import { useState } from 'react'
import TimePicker from './TimePicker.jsx'

export default function TimeInput({ value, onChange }) {
  const [showPicker, setShowPicker] = useState(false)

  return (
    <>
      <div
        style={{
          flex: 1,
          padding: '11px 12px',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 16,
          color: value ? 'var(--text)' : 'var(--text-tertiary)',
          background: 'var(--bg)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          minHeight: 44,
          boxSizing: 'border-box',
        }}
        onClick={() => setShowPicker(true)}
      >
        {value || '--:--'}
      </div>
      {showPicker && (
        <TimePicker
          value={value}
          onConfirm={val => { onChange(val); setShowPicker(false) }}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </>
  )
}
