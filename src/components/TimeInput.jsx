import { useState, useEffect } from 'react'

export default function TimeInput({ value, onChange }) {
  const [h, setH] = useState('')
  const [m, setM] = useState('')

  useEffect(() => {
    if (value && value.includes(':')) {
      const [hh, mm] = value.split(':')
      setH(hh)
      setM(mm)
    } else {
      setH('')
      setM('')
    }
  }, [value])

  function emit(hv, mv) {
    const hi = parseInt(hv)
    const mi = parseInt(mv)
    if (hv === '' && mv === '') {
      onChange('')
    } else if (
      hv !== '' && mv !== '' &&
      !isNaN(hi) && !isNaN(mi) &&
      hi >= 0 && hi <= 23 &&
      mi >= 0 && mi <= 59
    ) {
      onChange(`${String(hi).padStart(2, '0')}:${String(mi).padStart(2, '0')}`)
    }
  }

  function handleHChange(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
    setH(raw)
    emit(raw, m)
  }

  function handleMChange(e) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
    setM(raw)
    emit(h, raw)
  }

  function handleHBlur() {
    const hi = parseInt(h)
    if (!isNaN(hi) && hi >= 0 && hi <= 23) {
      const padded = String(hi).padStart(2, '0')
      setH(padded)
      emit(padded, m)
    } else if (h !== '') {
      setH('')
      emit('', m)
    }
  }

  function handleMBlur() {
    const mi = parseInt(m)
    if (!isNaN(mi) && mi >= 0 && mi <= 59) {
      const padded = String(mi).padStart(2, '0')
      setM(padded)
      emit(h, padded)
    } else if (m !== '') {
      setM('')
      emit(h, '')
    }
  }

  const numStyle = {
    width: 52,
    textAlign: 'center',
    padding: '11px 4px',
    fontSize: 16,
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--bg)',
    color: 'var(--text)',
    fontFamily: 'inherit',
    outline: 'none',
    MozAppearance: 'textfield',
    WebkitAppearance: 'none',
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 4 }}>
      <input
        type="number"
        inputMode="numeric"
        min="0" max="23"
        value={h}
        onChange={handleHChange}
        onBlur={handleHBlur}
        placeholder="時"
        style={numStyle}
      />
      <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)' }}>:</span>
      <input
        type="number"
        inputMode="numeric"
        min="0" max="59"
        value={m}
        onChange={handleMChange}
        onBlur={handleMBlur}
        placeholder="分"
        style={numStyle}
      />
    </div>
  )
}
