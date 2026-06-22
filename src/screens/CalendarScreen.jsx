import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import BottomSheet from '../components/BottomSheet.jsx'
import TimeInput from '../components/TimeInput.jsx'
import {
  currentYearMonth, prevMonth, nextMonth, getMonthCalendar,
  formatDate, formatYearMonth, minutesToDisplay, calcDayPay, today,
  getWageForDate, isJapaneseHoliday
} from '../lib/timeUtils.js'

export default function CalendarScreen({ session, profile, wageHistory, yearMonth, setYearMonth }) {
  const [records, setRecords] = useState({})
  const [patterns, setPatterns] = useState([])
  const [bonusPatterns, setBonusPatterns] = useState([])
  const [selectedDate, setSelectedDate] = useState(today())
  const [showTransport, setShowTransport] = useState(false)
  const [showBonus, setShowBonus] = useState(false)
  const [showTimeEdit, setShowTimeEdit] = useState(false)
  const [editFields, setEditFields] = useState({})
  const [freeTransport, setFreeTransport] = useState('')
  const [freeBonus, setFreeBonus] = useState('')
  const [saving, setSaving] = useState(false)

  const todayStr = today()

  useEffect(() => { loadRecords() }, [yearMonth])
  useEffect(() => { loadPatterns(); loadBonusPatterns() }, [])

  async function loadRecords() {
    const [y, m] = yearMonth.split('-')
    const start = `${yearMonth}-01`
    const end = `${yearMonth}-${new Date(+y, +m, 0).getDate().toString().padStart(2, '0')}`
    const { data } = await supabase
      .from('time_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('date', start)
      .lte('date', end)
    const map = {}
    data?.forEach(r => { map[r.date] = r })
    setRecords(map)
  }

  async function loadPatterns() {
    const { data } = await supabase
      .from('transport_patterns')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at')
    setPatterns(data || [])
  }

  async function loadBonusPatterns() {
    const { data } = await supabase
      .from('bonus_patterns')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at')
    setBonusPatterns(data || [])
  }

  const { days } = getMonthCalendar(yearMonth)
  const record = records[selectedDate]

  const settings = {
    hourly_rate: profile.hourly_rate,
    night_start: profile.night_start,
    night_end: profile.night_end,
    night_rate: profile.night_rate,
    night_enabled: profile.night_enabled !== false,
    holiday_enabled: profile.holiday_enabled === true,
    sat_hourly_rate: profile.sat_hourly_rate || null,
    sun_hourly_rate: profile.sun_hourly_rate || null,
    hol_hourly_rate: profile.hol_hourly_rate || null,
    holiday_night_enabled: profile.holiday_night_enabled !== false,
    sat_night_enabled: profile.sat_night_enabled !== false,
    sun_night_enabled: profile.sun_night_enabled !== false,
    hol_night_enabled: profile.hol_night_enabled !== false,
  }
  const dayCalc = record ? calcDayPay(record, settings, wageHistory) : null

  // 交通費の前回値（前回引き継ぎあり）
  function getLastTransport() {
    const sorted = Object.keys(records).sort()
    for (let i = sorted.length - 1; i >= 0; i--) {
      const r = records[sorted[i]]
      if (r.date !== selectedDate && r.transport_fee != null) {
        return { fee: r.transport_fee, patternId: r.transport_pattern_id }
      }
    }
    return null
  }

  const lastTransport = getLastTransport()
  const displayTransportFee = record?.transport_fee ?? lastTransport?.fee ?? null
  const displayPatternId = record?.transport_pattern_id ?? lastTransport?.patternId ?? null
  const isTransportFromLast = record?.transport_fee == null && lastTransport != null

  // ボーナスは前回引き継ぎなし
  const displayBonusFee = record?.bonus_fee ?? null
  const displayBonusPatternId = record?.bonus_pattern_id ?? null

  function patternName(id) {
    return patterns.find(p => p.id === id)?.name || ''
  }

  function bonusPatternName(id) {
    return bonusPatterns.find(p => p.id === id)?.name || ''
  }

  async function selectTransport(patternId, fee) {
    setSaving(true)
    await upsertRecord({ transport_fee: fee, transport_pattern_id: patternId || null })
    setShowTransport(false)
    setSaving(false)
  }

  async function saveFreeTransport() {
    const fee = parseInt(freeTransport)
    if (isNaN(fee) || fee < 0) return
    await selectTransport(null, fee)
    setFreeTransport('')
  }

  async function selectBonus(patternId, fee) {
    setSaving(true)
    await upsertRecord({ bonus_fee: fee, bonus_pattern_id: patternId || null })
    setShowBonus(false)
    setSaving(false)
  }

  async function clearBonus() {
    setSaving(true)
    await upsertRecord({ bonus_fee: null, bonus_pattern_id: null })
    setShowBonus(false)
    setSaving(false)
  }

  async function saveFreeBonus() {
    const fee = parseInt(freeBonus)
    if (isNaN(fee) || fee < 0) return
    await selectBonus(null, fee)
    setFreeBonus('')
  }

  async function saveTimeEdit() {
    setSaving(true)
    const updates = {}
    const oldRecord = record || {}
    const changed = []

    for (const field of ['clock_in', 'clock_out', 'break_start', 'break_end']) {
      if (editFields[field] !== undefined && editFields[field] !== (oldRecord[field] || '')) {
        updates[field] = editFields[field] || null
        changed.push({ field, old: oldRecord[field], new: editFields[field] })
      }
    }

    if (changed.length === 0) { setShowTimeEdit(false); setSaving(false); return }

    const f = editFields
    const toMin = t => { if (!t) return null; const [h,m] = t.split(':').map(Number); return h*60+m }
    const ci = toMin(f.clock_in), bs = toMin(f.break_start), be = toMin(f.break_end), co = toMin(f.clock_out)
    if (ci !== null && bs !== null && bs < ci) { alert('休憩開始は出勤より後にしてください'); setSaving(false); return }
    if (bs !== null && be !== null && be < bs) { alert('休憩終了は休憩開始より後にしてください'); setSaving(false); return }
    if (be !== null && co !== null && co < be) { alert('退勤は休憩終了より後にしてください'); setSaving(false); return }
    if (ci !== null && co !== null && co < ci) { alert('退勤は出勤より後にしてください'); setSaving(false); return }

    await upsertRecord(updates)

    for (const c of changed) {
      await supabase.from('edit_history').insert({
        user_id: session.user.id,
        date: selectedDate,
        field_changed: c.field,
        old_value: c.old || '',
        new_value: c.new || '',
      })
    }

    setShowTimeEdit(false)
    setSaving(false)
  }

  async function upsertRecord(updates) {
    if (records[selectedDate]) {
      await supabase
        .from('time_logs')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', records[selectedDate].id)
    } else {
      await supabase.from('time_logs').insert({
        user_id: session.user.id,
        date: selectedDate,
        ...updates,
      })
    }
    await loadRecords()
  }

  function openTimeEdit() {
    const r = record || {}
    setEditFields({
      clock_in: r.clock_in || '',
      clock_out: r.clock_out || '',
      break_start: r.break_start || '',
      break_end: r.break_end || '',
    })
    setShowTimeEdit(true)
  }

  function resetField(key) {
    setEditFields(prev => ({ ...prev, [key]: '' }))
  }

  const weekdays = ['日', '月', '火', '水', '木', '金', '土']

  const nowYear = new Date().getFullYear()
  const minYearMonth = `${nowYear - 3}-01`
  const maxYearMonth = `${nowYear + 3}-12`

  function goToPrev() {
    const prev = prevMonth(yearMonth)
    if (prev >= minYearMonth) setYearMonth(prev)
  }
  function goToNext() {
    const next = nextMonth(yearMonth)
    if (next <= maxYearMonth) setYearMonth(next)
  }

  return (
    <>
      <div className="screen calendar-screen">
        <div className="cal-month-nav">
          <button onClick={goToPrev} disabled={prevMonth(yearMonth) < minYearMonth}>◀</button>
          <span className="cal-month-label">{formatYearMonth(yearMonth)}</span>
          <button onClick={goToNext} disabled={nextMonth(yearMonth) > maxYearMonth}>▶</button>
        </div>

        <div className="cal-weekdays">
          {weekdays.map((d, i) => (
            <div key={d} className="cal-weekday" style={{ color: i === 0 ? '#e53935' : i === 6 ? '#1565c0' : undefined }}>
              {d}
            </div>
          ))}
        </div>

        <div className="cal-days">
          {days.map((day) => {
            const rec = records[day.date]
            const isWorked = !!rec && (rec.clock_in || rec.clock_out)
            const isIncomplete = isWorked && ((rec.clock_in && !rec.clock_out) || (rec.break_start && !rec.break_end))
            const isNoWage = isWorked && !isIncomplete && wageHistory.length > 0 && getWageForDate(wageHistory, day.date) === null
            const isSelected = day.date === selectedDate
            const isToday = day.date === todayStr
            const isHoliday = isJapaneseHoliday(day.date)
            const dayOfWeek = new Date(day.date + 'T00:00:00').getDay()
            const isSunday = dayOfWeek === 0
            const isSaturday = dayOfWeek === 6

            let cls = 'cal-cell'
            if (isSelected) cls += ' selected'
            else if (isIncomplete) cls += ' incomplete'
            else if (isNoWage) cls += ' no-wage'
            else if (isWorked) cls += ' worked'
            if (isToday && !isSelected) cls += ' today'
            if (day.otherMonth) cls += ' other-month'

            // 数字の色: 選択中は白、祝日・日曜は赤、土曜は青
            let numColor
            if (isSelected) numColor = undefined  // CSS で white に
            else if (isHoliday || isSunday) numColor = '#e53935'
            else if (isSaturday) numColor = '#1565c0'

            return (
              <div
                key={day.date}
                className={cls}
                style={numColor ? { color: numColor } : undefined}
                onClick={() => {
                  if (day.date === selectedDate) {
                    openTimeEdit()
                  } else {
                    setSelectedDate(day.date)
                  }
                }}
              >
                {day.day}
              </div>
            )
          })}
        </div>

        <div className="cal-detail">
          <div className="cal-detail-title">{formatDate(selectedDate)}</div>

          {(() => {
            const hasClockData = record?.clock_in || record?.clock_out
            const hasBreakOnly = !hasClockData && (record?.break_start || record?.break_end)
            if (hasClockData) {
              return (
                <>
                  <div className="detail-row">
                    <span className="detail-label">出退勤</span>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span className="detail-value">
                        {record.clock_in || '--:--'} → {record.clock_out || '--:--'}
                      </span>
                      <button className="detail-edit-btn" onClick={openTimeEdit}>編集</button>
                    </div>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">休憩</span>
                    <span className="detail-value">
                      {record.break_start && record.break_end
                        ? `${record.break_start}〜${record.break_end}`
                        : '---'}
                    </span>
                  </div>
                  {dayCalc && (
                    <div className="detail-row">
                      <span className="detail-label">労働時間</span>
                      <span className="detail-value">{minutesToDisplay(dayCalc.workMinutes)}</span>
                    </div>
                  )}
                </>
              )
            } else if (hasBreakOnly) {
              return (
                <>
                  <div className="detail-row">
                    <span className="detail-label">出退勤</span>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span className="detail-value">--:-- → --:--</span>
                      <button className="detail-edit-btn" onClick={openTimeEdit}>編集</button>
                    </div>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">休憩</span>
                    <span className="detail-value">
                      {`${record.break_start || '--:--'}〜${record.break_end || '--:--'}`}
                    </span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">労働時間</span>
                    <span className="detail-value">---</span>
                  </div>
                </>
              )
            } else {
              return (
                <div className="detail-row">
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>この日の記録はありません</span>
                  <button className="detail-edit-btn" onClick={openTimeEdit}>追加</button>
                </div>
              )
            }
          })()}

          {/* 交通費 */}
          <div className="detail-row">
            <span className="detail-label">交通費</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {displayTransportFee != null ? (
                <>
                  <span className="transport-value">
                    {displayPatternId ? patternName(displayPatternId) + ' ' : ''}
                    ¥{displayTransportFee.toLocaleString()}
                    {isTransportFromLast && <span className="prev-badge">前回</span>}
                  </span>
                  <button className="change-link" onClick={() => setShowTransport(true)}>変更</button>
                </>
              ) : (
                <button className="change-link" onClick={() => setShowTransport(true)}>選択</button>
              )}
            </div>
          </div>

          {/* ボーナス */}
          <div className="detail-row">
            <span className="detail-label">固定ボーナス</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {displayBonusFee != null ? (
                <>
                  <span className="transport-value">
                    {displayBonusPatternId ? bonusPatternName(displayBonusPatternId) + ' ' : ''}
                    ¥{displayBonusFee.toLocaleString()}
                  </span>
                  <button className="change-link" onClick={() => setShowBonus(true)}>変更</button>
                </>
              ) : (
                <button className="change-link" onClick={() => setShowBonus(true)}>選択</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 交通費選択シート */}
      {showTransport && (
        <BottomSheet title="交通費を選択" onClose={() => { setShowTransport(false); setFreeTransport('') }}>
          {patterns.map(p => (
            <div
              key={p.id}
              className={`transport-option${displayPatternId === p.id ? ' selected' : ''}`}
              onClick={() => selectTransport(p.id, p.fee)}
            >
              <span className="transport-option-name">{p.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="transport-option-fee">¥{p.fee.toLocaleString()}</span>
                {displayPatternId === p.id && <span className="transport-check">✓</span>}
              </div>
            </div>
          ))}
          <div className="transport-free-input">
            <label>フリー入力</label>
            <input
              type="number"
              placeholder="金額（円）"
              value={freeTransport}
              onChange={e => setFreeTransport(e.target.value)}
              style={{ width: '100%' }}
            />
            <button
              className="btn btn-primary btn-sm"
              style={{ width: 'auto', padding: '10px 16px' }}
              onClick={saveFreeTransport}
              disabled={saving}
            >
              確定
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ボーナス選択シート */}
      {showBonus && (
        <BottomSheet title="固定ボーナスを選択" onClose={() => { setShowBonus(false); setFreeBonus('') }}>
          {/* なしオプション */}
          <div
            className={`transport-option${displayBonusFee === null ? ' selected' : ''}`}
            onClick={clearBonus}
          >
            <span className="transport-option-name">なし（0円）</span>
            {displayBonusFee === null && <span className="transport-check">✓</span>}
          </div>
          {bonusPatterns.map(p => (
            <div
              key={p.id}
              className={`transport-option${displayBonusPatternId === p.id ? ' selected' : ''}`}
              onClick={() => selectBonus(p.id, p.fee)}
            >
              <span className="transport-option-name">{p.name}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="transport-option-fee">¥{p.fee.toLocaleString()}</span>
                {displayBonusPatternId === p.id && <span className="transport-check">✓</span>}
              </div>
            </div>
          ))}
          <div className="transport-free-input">
            <label>フリー入力</label>
            <input
              type="number"
              placeholder="金額（円）"
              value={freeBonus}
              onChange={e => setFreeBonus(e.target.value)}
              style={{ width: '100%' }}
            />
            <button
              className="btn btn-primary btn-sm"
              style={{ width: 'auto', padding: '10px 16px' }}
              onClick={saveFreeBonus}
              disabled={saving}
            >
              確定
            </button>
          </div>
        </BottomSheet>
      )}

      {/* 時刻編集シート */}
      {showTimeEdit && (
        <BottomSheet title="時刻を編集" onClose={() => setShowTimeEdit(false)}>
          <div className="time-edit-fields">
            {[
              { key: 'clock_in',    label: '出勤',    minKey: null },
              { key: 'break_start', label: '休憩開始', minKey: 'clock_in' },
              { key: 'break_end',   label: '休憩終了', minKey: 'break_start' },
              { key: 'clock_out',   label: '退勤',    minKey: 'break_end' },
            ].map(f => {
              const minVal = f.minKey ? (editFields[f.minKey] || '') : ''
              return (
                <div key={f.key} className="time-field form-field">
                  <label className="form-label">{f.label}</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <TimeInput
                      value={editFields[f.key] || ''}
                      onChange={val => setEditFields(prev => ({ ...prev, [f.key]: val }))}
                    />
                    <button
                      type="button"
                      onClick={() => resetField(f.key)}
                      style={{
                        padding: '8px 12px', fontSize: 13,
                        border: '1px solid var(--border)', borderRadius: 8,
                        background: 'none', cursor: 'pointer',
                        color: 'var(--text-tertiary)', whiteSpace: 'nowrap',
                        flexShrink: 0
                      }}
                    >
                      消去
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
            ※ カレンダーからの変更は修正履歴に記録されます
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={() => setShowTimeEdit(false)}>キャンセル</button>
            <button className="btn btn-primary" onClick={saveTimeEdit} disabled={saving}>
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  )
}
