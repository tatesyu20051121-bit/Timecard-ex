import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { currentTime, addMinutes, today } from '../lib/timeUtils.js'

const ACTIONS = [
  { key: 'clock_in',    label: '出勤',    style: 'btn-primary' },
  { key: 'clock_out',   label: '退勤',    style: 'btn-danger' },
  { key: 'break_start', label: '休憩入り', style: 'btn-outline' },
  { key: 'break_end',   label: '休憩戻り', style: 'btn-outline' },
]

export default function ClockScreen({ session, profile, setTab }) {
  const [frozenTime, setFrozenTime] = useState(() => currentTime())
  const [adjustedTime, setAdjustedTime] = useState(() => currentTime())
  const [confirm, setConfirm] = useState(null) // { key, label }
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
    setConfirm(action)
  }

  async function handleConfirm() {
    if (!confirm) return
    setSaving(true)

    const field = confirm.key
    const value = adjustedTime
    const dateStr = today()

    // 既存レコードがあれば更新、なければ挿入
    if (todayRecord) {
      const updates = { [field]: value, updated_at: new Date().toISOString() }
      await supabase
        .from('time_logs')
        .update(updates)
        .eq('id', todayRecord.id)
    } else {
      await supabase
        .from('time_logs')
        .insert({
          user_id: session.user.id,
          date: dateStr,
          [field]: value,
        })
    }

    await loadTodayRecord()
    setSaving(false)
    const savedLabel = confirm.label
    setConfirm(null)
    showToast(`${savedLabel}を記録しました（${value}）`)
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
