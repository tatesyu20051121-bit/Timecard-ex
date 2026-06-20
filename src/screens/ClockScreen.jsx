import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { currentTime, addMinutes, today } from '../lib/timeUtils.js'

const ACTIONS = [
  { key: 'clock_in',    label: '出勤',    style: 'btn-primary' },
  { key: 'clock_out',   label: '退勤',    style: 'btn-danger' },
  { key: 'break_start', label: '休憩入り', style: 'btn-outline' },
  { key: 'break_end',   label: '休憩戻り', style: 'btn-outline' },
]

const SEQUENCE = ['clock_in', 'break_start', 'break_end', 'clock_out']

const FIELD_LABELS = {
  clock_in:    '出勤',
  break_start: '休憩入り',
  break_end:   '休憩戻り',
  clock_out:   '退勤',
}

function timeToMin(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function formatTime(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  return `${parseInt(h)}時${m}分`
}

function getConflictFields(actionKey, adjustedTime, record) {
  if (!record) return []
  const newMin = timeToMin(adjustedTime)
  const actionIdx = SEQUENCE.indexOf(actionKey)
  const conflicts = new Set()

  // 後のフィールドがすでに入力されている
  for (let i = actionIdx + 1; i < SEQUENCE.length; i++) {
    const f = SEQUENCE[i]
    if (record[f]) conflicts.add(f)
  }

  // 前のフィールドの時刻が新しい入力より後になっている（矛盾）
  for (let i = 0; i < actionIdx; i++) {
    const f = SEQUENCE[i]
    if (record[f] && timeToMin(record[f]) > newMin) conflicts.add(f)
  }

  return [...conflicts]
}

export default function ClockScreen({ session, profile, setTab }) {
  const [adjustedTime, setAdjustedTime] = useState(() => currentTime())
  const [confirm, setConfirm] = useState(null)
  const [conflictInfo, setConflictInfo] = useState(null)
  const [todayRecord, setTodayRecord] = useState(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    loadTodayRecord()
  }, [])

  async function loadTodayRecord() {
    const { data } = await supabase
      .from('time_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('date', today())
      .single()
    setTodayRecord(data || null)
  }

  function handleAdjust(delta) {
    setAdjustedTime(prev => addMinutes(prev, delta))
  }

  function handleActionPress(action) {
    const conflicts = getConflictFields(action.key, adjustedTime, todayRecord)
    if (conflicts.length > 0) {
      setConflictInfo({ action, conflicts })
    } else {
      setConfirm(action)
    }
  }

  async function handleConfirm() {
    if (!confirm) return
    await doSave(confirm.key, adjustedTime, [], confirm.label)
  }

  async function handleClearAndSave() {
    if (!conflictInfo) return
    const { action, conflicts } = conflictInfo
    setConflictInfo(null)
    await doSave(action.key, adjustedTime, conflicts, action.label)
  }

  async function doSave(field, value, fieldsToClear = [], label = '') {
    setSaving(true)
    const dateStr = today()
    const updates = { [field]: value, updated_at: new Date().toISOString() }
    fieldsToClear.forEach(f => { updates[f] = null })

    if (todayRecord) {
      await supabase.from('time_logs').update(updates).eq('id', todayRecord.id)
    } else {
      await supabase.from('time_logs').insert({
        user_id: session.user.id,
        date: dateStr,
        [field]: value,
      })
    }

    await loadTodayRecord()
    setSaving(false)
    setConfirm(null)
    setConflictInfo(null)
    showToast(`${label || FIELD_LABELS[field]}を記録しました（${value}）`)
    setTimeout(() => setTab('calendar'), 1000)
  }

  function showToast(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  function statusText() {
    if (!todayRecord) return null
    const r = todayRecord
    if (r.clock_out) return <span>退勤済み <span>{r.clock_out}</span></span>
    if (r.break_end) return <span>休憩戻り <span>{r.break_end}</span> 〜 勤務中</span>
    if (r.break_start) return <span>休憩中 <span>{r.break_start}</span> 〜</span>
    if (r.clock_in) return <span>出勤済み <span>{r.clock_in}</span> 〜 勤務中</span>
    return null
  }

  const status = statusText()

  return (
    <>
      <div className="screen clock-screen">
        <div className="clock-time-section">
          <div className="clock-label">起動時刻</div>
          <div className="clock-time">{adjustedTime}</div>
          <div className="clock-adj">
            <button onClick={() => handleAdjust(-1)}>－ 1分</button>
            <button onClick={() => handleAdjust(+1)}>＋ 1分</button>
          </div>
        </div>

        {status && (
          <div className="clock-status">{status}</div>
        )}

        <div className="clock-btns">
          {ACTIONS.map(a => (
            <button
              key={a.key}
              className={`btn ${a.style}`}
              onClick={() => handleActionPress(a)}
            >
              {a.label}
            </button>
          ))}
          <button
            className="btn btn-ghost"
            onClick={() => setTab('calendar')}
            style={{ color: 'var(--text-tertiary)', fontSize: 14 }}
          >
            入力しない（履歴へ）
          </button>
        </div>
      </div>

      {/* 時系列矛盾ダイアログ */}
      {conflictInfo && (
        <div className="popup-overlay">
          <div className="popup" style={{ width: 300, textAlign: 'left' }}>
            <div style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 14 }}>
              今日はすでに{' '}
              {conflictInfo.conflicts.map((f, i) => (
                <span key={f}>
                  <span style={{ fontWeight: 600 }}>{FIELD_LABELS[f]}</span>{' '}
                  {formatTime(todayRecord[f])}
                  {i < conflictInfo.conflicts.length - 1 ? '、' : ''}
                </span>
              ))}
              {' '}の時刻が入力されています。
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
              {conflictInfo.conflicts.map(f => FIELD_LABELS[f]).join('、')}の時刻を消去して
              <span style={{ fontWeight: 600 }}>{conflictInfo.action.label}</span>の入力をしますか？
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline btn-sm" onClick={() => setConflictInfo(null)}>キャンセル</button>
              <button className="btn btn-primary btn-sm" onClick={handleClearAndSave} disabled={saving}>
                {saving ? '記録中...' : '消去して入力'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 確認ポップアップ */}
      {confirm && (
        <div className="popup-overlay">
          <div className="popup">
            <div className="popup-label">記録する内容</div>
            <div className="popup-action">{confirm.label}</div>
            <div className="popup-time">{adjustedTime}</div>
            <div className="popup-question">この時刻でよろしいですか？</div>
            <div className="popup-btns">
              <button className="btn btn-outline btn-sm" onClick={() => setConfirm(null)}>戻る</button>
              <button className="btn btn-primary btn-sm" onClick={handleConfirm} disabled={saving}>
                {saving ? '記録中...' : '入力'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* トースト通知 */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)', color: '#fff', borderRadius: 20,
          padding: '10px 20px', fontSize: 13, whiteSpace: 'nowrap', zIndex: 300,
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
