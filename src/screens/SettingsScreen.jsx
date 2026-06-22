import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import BottomSheet from '../components/BottomSheet.jsx'
import { today } from '../lib/timeUtils.js'

export default function SettingsScreen({ session, profile, onProfileUpdated, wageHistory, onWageHistoryUpdated, specialWagePatterns, onSpecialWagePatternsUpdated }) {
  const [patterns, setPatterns] = useState([])
  const [bonusPatterns, setBonusPatterns] = useState([])
  const [history, setHistory] = useState([])
  const [sheet, setSheet] = useState(null)
  const [editPattern, setEditPattern] = useState(null)
  const [editBonusPattern, setEditBonusPattern] = useState(null)
  const [editSpecialPattern, setEditSpecialPattern] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteHasShifts, setDeleteHasShifts] = useState(false)
  const [deletePatternTarget, setDeletePatternTarget] = useState(null)
  const [deletePatternUsed, setDeletePatternUsed] = useState(false)

  // フォーム値
  const [wage, setWage] = useState(String(profile.hourly_rate))
  const [wageEffectiveDate, setWageEffectiveDate] = useState(today())
  const [nightEnabled, setNightEnabled] = useState(profile.night_enabled !== false)
  const [nightStart, setNightStart] = useState(profile.night_start)
  const [nightEnd, setNightEnd] = useState(profile.night_end)
  const [nightRate, setNightRate] = useState(String(Math.round((profile.night_rate - 1) * 100)))
  const [holidayEnabled, setHolidayEnabled] = useState(profile.holiday_enabled === true)
  const [satRate, setSatRate] = useState(profile.sat_hourly_rate ? String(profile.sat_hourly_rate) : '')
  const [sunRate, setSunRate] = useState(profile.sun_hourly_rate ? String(profile.sun_hourly_rate) : '')
  const [holRate, setHolRate] = useState(profile.hol_hourly_rate ? String(profile.hol_hourly_rate) : '')
  const [satNightEnabled, setSatNightEnabled] = useState(profile.sat_night_enabled !== false)
  const [sunNightEnabled, setSunNightEnabled] = useState(profile.sun_night_enabled !== false)
  const [holNightEnabled, setHolNightEnabled] = useState(profile.hol_night_enabled !== false)
  const [specialPatternName, setSpecialPatternName] = useState('')
  const [specialPatternRate, setSpecialPatternRate] = useState('')
  const [specialPatternNight, setSpecialPatternNight] = useState(true)
  const [patternName, setPatternName] = useState('')
  const [patternFee, setPatternFee] = useState('')
  const [accountName, setAccountName] = useState(profile.name)

  useEffect(() => { loadPatterns(); loadBonusPatterns(); loadHistory() }, [])

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

  async function loadHistory() {
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 3)
    await supabase.from('edit_history')
      .delete()
      .eq('user_id', session.user.id)
      .lt('created_at', cutoff.toISOString())
    const { data } = await supabase
      .from('edit_history')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setHistory(data || [])
  }

  async function saveWage() {
    const rate = parseInt(wage)
    if (isNaN(rate) || rate < 0) return
    if (!wageEffectiveDate) return
    if (wageHistory.length >= 6) {
      alert('時給の設定は最大6件まで登録できます')
      return
    }
    const duplicate = wageHistory.find(w => w.effective_date === wageEffectiveDate)
    if (duplicate) {
      alert(`${wageEffectiveDate} は既に登録されています。別の日付を選択してください。`)
      return
    }
    setSaving(true)
    await supabase.from('wage_history').insert({
      user_id: session.user.id,
      hourly_rate: rate,
      effective_date: wageEffectiveDate,
    })
    const isLatest = wageHistory.length === 0 ||
      wageEffectiveDate >= wageHistory.reduce((a, b) => a.effective_date > b.effective_date ? a : b).effective_date
    if (isLatest) {
      await supabase.from('profiles').update({ hourly_rate: rate }).eq('id', session.user.id)
      await onProfileUpdated()
    }
    await onWageHistoryUpdated()
    setSaving(false)
    setSheet(null)
  }

  async function handleDeleteWageClick(entry) {
    const sorted = [...wageHistory].sort((a, b) => a.effective_date.localeCompare(b.effective_date))
    const idx = sorted.findIndex(w => w.id === entry.id)
    const nextEntry = sorted[idx + 1]
    let query = supabase.from('time_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .gte('date', entry.effective_date)
    if (nextEntry) query = query.lt('date', nextEntry.effective_date)
    const { count } = await query
    setDeleteTarget(entry)
    setDeleteHasShifts(count > 0)
  }

  async function confirmDeleteWage() {
    await supabase.from('wage_history').delete().eq('id', deleteTarget.id)
    const remaining = wageHistory.filter(w => w.id !== deleteTarget.id)
    if (remaining.length > 0) {
      const latest = remaining.reduce((a, b) => a.effective_date > b.effective_date ? a : b)
      await supabase.from('profiles').update({ hourly_rate: latest.hourly_rate }).eq('id', session.user.id)
    } else {
      // 全削除時は hourly_rate を null にリセット
      await supabase.from('profiles').update({ hourly_rate: null }).eq('id', session.user.id)
    }
    await onProfileUpdated()
    await onWageHistoryUpdated()
    setDeleteTarget(null)
  }

  function fmtWageDate(d) {
    const [y, m, day] = d.split('-')
    return `${y}年${parseInt(m)}月${parseInt(day)}日〜`
  }

  async function saveNight() {
    setSaving(true)
    if (nightEnabled) {
      const rate = 1 + parseInt(nightRate) / 100
      if (isNaN(rate) || parseInt(nightRate) < 0) { alert('割増率を正しく入力してください'); setSaving(false); return }
      const [sh, sm] = nightStart.split(':').map(Number)
      const startMin = sh * 60 + sm
      if (startMin < 17 * 60 || startMin > 23 * 60 + 59) {
        alert('開始時刻は17:00〜23:59の間で設定してください'); setSaving(false); return
      }
      const [eh, em] = nightEnd.split(':').map(Number)
      const endMin = eh * 60 + em
      if (endMin < 0 || endMin > 10 * 60) {
        alert('終了時刻は0:00〜10:00の間で設定してください'); setSaving(false); return
      }
      await supabase.from('profiles').update({
        night_enabled: true,
        night_start: nightStart,
        night_end: nightEnd,
        night_rate: rate,
      }).eq('id', session.user.id)
    } else {
      await supabase.from('profiles').update({ night_enabled: false }).eq('id', session.user.id)
    }
    await onProfileUpdated()
    setSaving(false)
    setSheet(null)
  }

  async function saveAccount() {
    if (!accountName.trim()) return
    setSaving(true)
    await supabase.from('profiles').update({ name: accountName.trim() }).eq('id', session.user.id)
    await onProfileUpdated()
    setSaving(false)
    setSheet(null)
  }

  async function saveHoliday() {
    setSaving(true)
    const updates = { holiday_enabled: holidayEnabled }
    if (holidayEnabled) {
      updates.sat_hourly_rate = satRate ? parseInt(satRate) : null
      updates.sun_hourly_rate = sunRate ? parseInt(sunRate) : null
      updates.hol_hourly_rate = holRate ? parseInt(holRate) : null
      updates.sat_night_enabled = satNightEnabled
      updates.sun_night_enabled = sunNightEnabled
      updates.hol_night_enabled = holNightEnabled
    }
    await supabase.from('profiles').update(updates).eq('id', session.user.id)
    await onProfileUpdated()
    setSaving(false)
    setSheet(null)
  }

  // 交通費パターン
  async function addPattern() {
    const fee = parseInt(patternFee)
    if (!patternName.trim() || isNaN(fee) || fee < 0) return
    if (patterns.length >= 6) { alert('パターンは最大6個まで登録できます'); return }
    setSaving(true)
    await supabase.from('transport_patterns').insert({ user_id: session.user.id, name: patternName.trim(), fee })
    await loadPatterns()
    setPatternName(''); setPatternFee('')
    setSaving(false)
    setSheet(null)
  }

  async function updatePattern() {
    const fee = parseInt(patternFee)
    if (!patternName.trim() || isNaN(fee) || fee < 0) return
    setSaving(true)
    await supabase.from('transport_patterns').update({ name: patternName.trim(), fee }).eq('id', editPattern.id)
    await loadPatterns()
    setSaving(false)
    setSheet(null)
  }

  async function deletePattern(pattern) {
    const { count } = await supabase
      .from('time_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('transport_pattern_id', pattern.id)
    setDeletePatternTarget(pattern)
    setDeletePatternUsed((count || 0) > 0)
    setSheet(null)
  }

  async function confirmDeletePatternKeep() {
    // 交通費の金額はそのまま、パターンIDだけ外す
    await supabase.from('time_logs')
      .update({ transport_pattern_id: null })
      .eq('user_id', session.user.id)
      .eq('transport_pattern_id', deletePatternTarget.id)
    await supabase.from('transport_patterns').delete().eq('id', deletePatternTarget.id)
    await loadPatterns()
    setDeletePatternTarget(null)
  }

  async function confirmDeletePatternReset() {
    // 交通費ごとリセット
    await supabase.from('time_logs')
      .update({ transport_fee: null, transport_pattern_id: null })
      .eq('user_id', session.user.id)
      .eq('transport_pattern_id', deletePatternTarget.id)
    await supabase.from('transport_patterns').delete().eq('id', deletePatternTarget.id)
    await loadPatterns()
    setDeletePatternTarget(null)
  }

  function openEditPattern(p) {
    setEditPattern(p)
    setPatternName(p.name)
    setPatternFee(String(p.fee))
    setSheet('pattern-edit')
  }

  // ボーナスパターン
  async function addBonusPattern() {
    const fee = parseInt(patternFee)
    if (!patternName.trim() || isNaN(fee) || fee < 0) return
    if (bonusPatterns.length >= 6) { alert('パターンは最大6個まで登録できます'); return }
    setSaving(true)
    await supabase.from('bonus_patterns').insert({ user_id: session.user.id, name: patternName.trim(), fee })
    await loadBonusPatterns()
    setPatternName(''); setPatternFee('')
    setSaving(false)
    setSheet(null)
  }

  async function updateBonusPattern() {
    const fee = parseInt(patternFee)
    if (!patternName.trim() || isNaN(fee) || fee < 0) return
    setSaving(true)
    await supabase.from('bonus_patterns').update({ name: patternName.trim(), fee }).eq('id', editBonusPattern.id)
    await loadBonusPatterns()
    setSaving(false)
    setSheet(null)
  }

  async function deleteBonusPattern(id) {
    if (!window.confirm('このパターンを削除しますか？')) return
    await supabase.from('bonus_patterns').delete().eq('id', id)
    await loadBonusPatterns()
    setSheet(null)
  }

  function openEditBonusPattern(p) {
    setEditBonusPattern(p)
    setPatternName(p.name)
    setPatternFee(String(p.fee))
    setSheet('bonus-pattern-edit')
  }

  // 特別時給パターン
  async function addSpecialPattern() {
    const rate = parseInt(specialPatternRate)
    if (!specialPatternName.trim() || isNaN(rate) || rate < 0) return
    if ((specialWagePatterns || []).length >= 6) { alert('パターンは最大6個まで登録できます'); return }
    setSaving(true)
    await supabase.from('special_wage_patterns').insert({
      user_id: session.user.id,
      name: specialPatternName.trim(),
      hourly_rate: rate,
      night_enabled: specialPatternNight,
    })
    await onSpecialWagePatternsUpdated()
    setSpecialPatternName(''); setSpecialPatternRate(''); setSpecialPatternNight(true)
    setSaving(false)
    setSheet(null)
  }

  async function updateSpecialPattern() {
    const rate = parseInt(specialPatternRate)
    if (!specialPatternName.trim() || isNaN(rate) || rate < 0) return
    setSaving(true)
    await supabase.from('special_wage_patterns').update({
      name: specialPatternName.trim(),
      hourly_rate: rate,
      night_enabled: specialPatternNight,
    }).eq('id', editSpecialPattern.id)
    await onSpecialWagePatternsUpdated()
    setSaving(false)
    setSheet(null)
  }

  async function deleteSpecialPattern(id) {
    if (!window.confirm('このパターンを削除しますか？')) return
    await supabase.from('special_wage_patterns').delete().eq('id', id)
    await onSpecialWagePatternsUpdated()
    setSheet(null)
  }

  function openEditSpecialPattern(p) {
    setEditSpecialPattern(p)
    setSpecialPatternName(p.name)
    setSpecialPatternRate(String(p.hourly_rate))
    setSpecialPatternNight(p.night_enabled !== false)
    setSheet('special-pattern-edit')
  }

  async function handleLogout() {
    if (!window.confirm('ログアウトしますか？')) return
    await supabase.auth.signOut()
  }

  const sortedWageHistory = [...wageHistory].sort((a, b) => a.effective_date.localeCompare(b.effective_date))
  const currentDisplayRate = sortedWageHistory.length > 0
    ? sortedWageHistory[sortedWageHistory.length - 1].hourly_rate
    : null

  const fieldLabels = {
    clock_in: '出勤', clock_out: '退勤', break_start: '休憩開始', break_end: '休憩終了',
  }

  function formatHistoryDate(isoStr) {
    const d = new Date(isoStr)
    return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} に変更`
  }

  return (
    <>
      <div className="screen settings-screen">

        {/* 給与設定 */}
        <div className="settings-section-label">給与設定</div>
        <div className="settings-card">
          <div className="settings-row" onClick={() => { setWage(''); setWageEffectiveDate(today()); setSheet('wage') }}>
            <span className="settings-row-label">時給</span>
            <div className="settings-row-right">
              <span className="settings-row-value">{currentDisplayRate !== null ? `¥${currentDisplayRate.toLocaleString()}` : '未設定'}</span>
              <span className="settings-chevron">›</span>
            </div>
          </div>
          {sortedWageHistory.map(w => (
            <div key={w.id} className="settings-row"
              style={{ paddingLeft: 20, background: 'var(--surface-secondary, #f8f8f8)' }}
              onClick={() => handleDeleteWageClick(w)}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{fmtWageDate(w.effective_date)}</span>
              <div className="settings-row-right">
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>¥{w.hourly_rate.toLocaleString()}</span>
                <span style={{ color: 'var(--danger, #e53935)', marginLeft: 8, fontSize: 16, fontWeight: 'bold' }}>×</span>
              </div>
            </div>
          ))}
          <div className="settings-row" onClick={() => { setNightEnabled(profile.night_enabled !== false); setSheet('night') }}>
            <span className="settings-row-label">深夜割増</span>
            <div className="settings-row-right">
              <span className="settings-row-value">
                {profile.night_enabled !== false
                  ? `${profile.night_start?.slice(0,5)}〜${profile.night_end?.slice(0,5)} ×${profile.night_rate}`
                  : 'なし'}
              </span>
              <span className="settings-chevron">›</span>
            </div>
          </div>
          <div className="settings-row" onClick={() => {
            setHolidayEnabled(profile.holiday_enabled === true)
            setSatRate(profile.sat_hourly_rate ? String(profile.sat_hourly_rate) : '')
            setSunRate(profile.sun_hourly_rate ? String(profile.sun_hourly_rate) : '')
            setHolRate(profile.hol_hourly_rate ? String(profile.hol_hourly_rate) : '')
            setSatNightEnabled(profile.sat_night_enabled !== false)
            setSunNightEnabled(profile.sun_night_enabled !== false)
            setHolNightEnabled(profile.hol_night_enabled !== false)
            setSheet('holiday')
          }}>
            <span className="settings-row-label">休日時給</span>
            <div className="settings-row-right">
              <span className="settings-row-value">
                {profile.holiday_enabled
                  ? `ON`
                  : 'なし'}
              </span>
              <span className="settings-chevron">›</span>
            </div>
          </div>
        </div>

        {/* 交通費パターン */}
        <div className="settings-section-label">交通費パターン</div>
        <div className="settings-card">
          {patterns.map(p => (
            <div key={p.id} className="settings-row" onClick={() => openEditPattern(p)}>
              <span className="settings-row-label">{p.name}</span>
              <div className="settings-row-right">
                <span className="settings-row-value">¥{p.fee.toLocaleString()}</span>
                <span className="settings-chevron">›</span>
              </div>
            </div>
          ))}
          <div className="settings-add-row" onClick={() => { setPatternName(''); setPatternFee(''); setSheet('pattern-add') }}>
            ＋ パターンを追加
          </div>
        </div>

        {/* 固定ボーナスパターン */}
        <div className="settings-section-label">固定ボーナスパターン</div>
        <div className="settings-card">
          {bonusPatterns.map(p => (
            <div key={p.id} className="settings-row" onClick={() => openEditBonusPattern(p)}>
              <span className="settings-row-label">{p.name}</span>
              <div className="settings-row-right">
                <span className="settings-row-value">¥{p.fee.toLocaleString()}</span>
                <span className="settings-chevron">›</span>
              </div>
            </div>
          ))}
          <div className="settings-add-row" onClick={() => { setPatternName(''); setPatternFee(''); setSheet('bonus-pattern-add') }}>
            ＋ パターンを追加
          </div>
        </div>

        {/* 特別時給パターン */}
        <div className="settings-section-label">特別時給パターン</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '0 4px 8px', lineHeight: 1.6 }}>
          特別時給はその日の通常時給・休日時給より優先されます。<br />優先順位：特別時給 ＞ 休日時給 ＞ 通常時給
        </div>
        <div className="settings-card">
          {(specialWagePatterns || []).map(p => (
            <div key={p.id} className="settings-row" onClick={() => openEditSpecialPattern(p)}>
              <span className="settings-row-label">{p.name}</span>
              <div className="settings-row-right">
                <span className="settings-row-value">¥{p.hourly_rate.toLocaleString()}{p.night_enabled !== false ? '' : '　深夜なし'}</span>
                <span className="settings-chevron">›</span>
              </div>
            </div>
          ))}
          <div className="settings-add-row" onClick={() => { setSpecialPatternName(''); setSpecialPatternRate(''); setSpecialPatternNight(true); setSheet('special-pattern-add') }}>
            ＋ パターンを追加
          </div>
        </div>

        {/* その他 */}
        <div className="settings-section-label">その他</div>
        <div className="settings-card">
          <div className="settings-row" onClick={() => setSheet('qr')}>
            <span className="settings-row-label">招待QRコード表示</span>
            <div className="settings-row-right"><span className="settings-chevron">›</span></div>
          </div>
          <div className="settings-row" onClick={() => setSheet('history')}>
            <span className="settings-row-label">修正履歴</span>
            <div className="settings-row-right"><span className="settings-chevron">›</span></div>
          </div>
          <div className="settings-row" onClick={() => setSheet('account')}>
            <span className="settings-row-label">アカウント情報</span>
            <div className="settings-row-right">
              <span className="settings-row-value">{profile.name}</span>
              <span className="settings-chevron">›</span>
            </div>
          </div>
        </div>

        <button className="settings-logout" onClick={handleLogout}>ログアウト</button>
      </div>

      {/* 時給追加シート */}
      {sheet === 'wage' && (
        <BottomSheet title="時給を追加" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 12 }}>
            この金額が適用される開始日を設定してください。
          </div>
          <div className="form-field">
            <label className="form-label">適用開始日</label>
            <input
              type="date"
              value={wageEffectiveDate}
              onChange={e => setWageEffectiveDate(e.target.value)}
              min={`${new Date().getFullYear() - 3}-01-01`}
              max={`${new Date().getFullYear() + 3}-12-31`}
            />
          </div>
          <div className="form-field">
            <label className="form-label">時給（円）</label>
            <input type="number" value={wage} onChange={e => setWage(e.target.value)} placeholder="例：1100" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={() => setSheet(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={saveWage} disabled={saving}>{saving ? '保存中...' : '保存する'}</button>
          </div>
        </BottomSheet>
      )}

      {/* 深夜割増シート */}
      {sheet === 'night' && (
        <BottomSheet title="深夜割増を設定" onClose={() => setSheet(null)}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>深夜割増を適用する</span>
            <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28 }}>
              <input type="checkbox" checked={nightEnabled} onChange={e => setNightEnabled(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: nightEnabled ? 'var(--primary)' : '#ccc', borderRadius: 28, transition: '0.3s' }}>
                <span style={{ position: 'absolute', width: 22, height: 22, left: nightEnabled ? 24 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: '0.3s' }} />
              </span>
            </label>
          </div>
          {nightEnabled && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">開始時刻（17:00〜23:59）</label>
                  <input type="time" value={nightStart} min="17:00" max="23:59" onChange={e => setNightStart(e.target.value)} />
                </div>
                <div className="form-field" style={{ flex: 1, marginBottom: 0 }}>
                  <label className="form-label">終了時刻（0:00〜10:00）</label>
                  <input type="time" value={nightEnd} min="00:00" max="10:00" onChange={e => setNightEnd(e.target.value)} />
                </div>
              </div>
              <div className="form-field">
                <label className="form-label">割増率（%）　例：25 → 時給×1.25倍</label>
                <input type="number" value={nightRate} onChange={e => setNightRate(e.target.value)} placeholder="例：25" />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={() => setSheet(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={saveNight} disabled={saving}>{saving ? '保存中...' : '保存する'}</button>
          </div>
        </BottomSheet>
      )}

      {/* 休日時給シート */}
      {sheet === 'holiday' && (
        <BottomSheet title="休日時給を設定" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.6 }}>
            優先順位：特別時給 ＞ 休日時給 ＞ 通常時給
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>休日時給を適用する</span>
            <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28 }}>
              <input type="checkbox" checked={holidayEnabled} onChange={e => setHolidayEnabled(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: holidayEnabled ? 'var(--primary)' : '#ccc', borderRadius: 28, transition: '0.3s' }}>
                <span style={{ position: 'absolute', width: 22, height: 22, left: holidayEnabled ? 24 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: '0.3s' }} />
              </span>
            </label>
          </div>
          {holidayEnabled && (
            <>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>時給は空欄の場合、通常時給を使用します</div>

              {/* 土曜 */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1565c0', marginBottom: 8 }}>土曜</div>
              </div>
              <div className="form-field">
                <label className="form-label">土曜時給（円）</label>
                <input type="number" value={satRate} onChange={e => setSatRate(e.target.value)} placeholder="例：1200" />
              </div>
              {profile.night_enabled !== false && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <span style={{ fontSize: 14 }}>深夜割増を適用する</span>
                  <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28 }}>
                    <input type="checkbox" checked={satNightEnabled} onChange={e => setSatNightEnabled(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: satNightEnabled ? 'var(--primary)' : '#ccc', borderRadius: 28, transition: '0.3s' }}>
                      <span style={{ position: 'absolute', width: 22, height: 22, left: satNightEnabled ? 24 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: '0.3s' }} />
                    </span>
                  </label>
                </div>
              )}

              {/* 日曜 */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e53935', marginBottom: 8 }}>日曜</div>
              </div>
              <div className="form-field">
                <label className="form-label">日曜時給（円）</label>
                <input type="number" value={sunRate} onChange={e => setSunRate(e.target.value)} placeholder="例：1300" />
              </div>
              {profile.night_enabled !== false && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <span style={{ fontSize: 14 }}>深夜割増を適用する</span>
                  <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28 }}>
                    <input type="checkbox" checked={sunNightEnabled} onChange={e => setSunNightEnabled(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: sunNightEnabled ? 'var(--primary)' : '#ccc', borderRadius: 28, transition: '0.3s' }}>
                      <span style={{ position: 'absolute', width: 22, height: 22, left: sunNightEnabled ? 24 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: '0.3s' }} />
                    </span>
                  </label>
                </div>
              )}

              {/* 祝日 */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e53935', marginBottom: 8 }}>祝日</div>
              </div>
              <div className="form-field">
                <label className="form-label">祝日時給（円）</label>
                <input type="number" value={holRate} onChange={e => setHolRate(e.target.value)} placeholder="例：1400" />
              </div>
              {profile.night_enabled !== false && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14 }}>深夜割増を適用する</span>
                  <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28 }}>
                    <input type="checkbox" checked={holNightEnabled} onChange={e => setHolNightEnabled(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: holNightEnabled ? 'var(--primary)' : '#ccc', borderRadius: 28, transition: '0.3s' }}>
                      <span style={{ position: 'absolute', width: 22, height: 22, left: holNightEnabled ? 24 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: '0.3s' }} />
                    </span>
                  </label>
                </div>
              )}
            </>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-outline" onClick={() => setSheet(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={saveHoliday} disabled={saving}>{saving ? '保存中...' : '保存する'}</button>
          </div>
        </BottomSheet>
      )}

      {/* 交通費パターン追加シート */}
      {sheet === 'pattern-add' && (
        <BottomSheet title="交通費パターンを追加" onClose={() => setSheet(null)}>
          <div className="form-field">
            <label className="form-label">ルート名</label>
            <input type="text" value={patternName} onChange={e => setPatternName(e.target.value)} placeholder="例：通常ルート" />
          </div>
          <div className="form-field">
            <label className="form-label">金額（円）</label>
            <input type="number" value={patternFee} onChange={e => setPatternFee(e.target.value)} placeholder="例：320" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={() => setSheet(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={addPattern} disabled={saving}>{saving ? '保存中...' : '保存する'}</button>
          </div>
        </BottomSheet>
      )}

      {/* 交通費パターン編集シート */}
      {sheet === 'pattern-edit' && editPattern && (
        <BottomSheet title="交通費パターンを編集" onClose={() => setSheet(null)}>
          <div className="form-field">
            <label className="form-label">ルート名</label>
            <input type="text" value={patternName} onChange={e => setPatternName(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">金額（円）</label>
            <input type="number" value={patternFee} onChange={e => setPatternFee(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <button className="btn btn-outline" onClick={() => setSheet(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={updatePattern} disabled={saving}>{saving ? '保存中...' : '保存する'}</button>
          </div>
          <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => deletePattern(editPattern)}>このパターンを削除する</button>
        </BottomSheet>
      )}

      {/* ボーナスパターン追加シート */}
      {sheet === 'bonus-pattern-add' && (
        <BottomSheet title="固定ボーナスパターンを追加" onClose={() => setSheet(null)}>
          <div className="form-field">
            <label className="form-label">固定ボーナス名</label>
            <input type="text" value={patternName} onChange={e => setPatternName(e.target.value)} placeholder="例：他店ヘルプ" />
          </div>
          <div className="form-field">
            <label className="form-label">金額（円）</label>
            <input type="number" value={patternFee} onChange={e => setPatternFee(e.target.value)} placeholder="例：1000" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={() => setSheet(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={addBonusPattern} disabled={saving}>{saving ? '保存中...' : '保存する'}</button>
          </div>
        </BottomSheet>
      )}

      {/* ボーナスパターン編集シート */}
      {sheet === 'bonus-pattern-edit' && editBonusPattern && (
        <BottomSheet title="固定ボーナスパターンを編集" onClose={() => setSheet(null)}>
          <div className="form-field">
            <label className="form-label">固定ボーナス名</label>
            <input type="text" value={patternName} onChange={e => setPatternName(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">金額（円）</label>
            <input type="number" value={patternFee} onChange={e => setPatternFee(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <button className="btn btn-outline" onClick={() => setSheet(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={updateBonusPattern} disabled={saving}>{saving ? '保存中...' : '保存する'}</button>
          </div>
          <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => deleteBonusPattern(editBonusPattern.id)}>このパターンを削除する</button>
        </BottomSheet>
      )}

      {/* 特別時給パターン追加シート */}
      {sheet === 'special-pattern-add' && (
        <BottomSheet title="特別時給パターンを追加" onClose={() => setSheet(null)}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.6 }}>
            特別時給はその日の通常時給・休日時給より優先されます。
          </div>
          <div className="form-field">
            <label className="form-label">パターン名</label>
            <input type="text" value={specialPatternName} onChange={e => setSpecialPatternName(e.target.value)} placeholder="例：他店ヘルプ" />
          </div>
          <div className="form-field">
            <label className="form-label">時給（円）</label>
            <input type="number" value={specialPatternRate} onChange={e => setSpecialPatternRate(e.target.value)} placeholder="例：1500" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', marginBottom: 16 }}>
            <span style={{ fontSize: 14 }}>深夜割増を適用する</span>
            <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28 }}>
              <input type="checkbox" checked={specialPatternNight} onChange={e => setSpecialPatternNight(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: specialPatternNight ? 'var(--primary)' : '#ccc', borderRadius: 28, transition: '0.3s' }}>
                <span style={{ position: 'absolute', width: 22, height: 22, left: specialPatternNight ? 24 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: '0.3s' }} />
              </span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={() => setSheet(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={addSpecialPattern} disabled={saving}>{saving ? '保存中...' : '保存する'}</button>
          </div>
        </BottomSheet>
      )}

      {/* 特別時給パターン編集シート */}
      {sheet === 'special-pattern-edit' && editSpecialPattern && (
        <BottomSheet title="特別時給パターンを編集" onClose={() => setSheet(null)}>
          <div className="form-field">
            <label className="form-label">パターン名</label>
            <input type="text" value={specialPatternName} onChange={e => setSpecialPatternName(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">時給（円）</label>
            <input type="number" value={specialPatternRate} onChange={e => setSpecialPatternRate(e.target.value)} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', marginBottom: 16 }}>
            <span style={{ fontSize: 14 }}>深夜割増を適用する</span>
            <label style={{ position: 'relative', display: 'inline-block', width: 50, height: 28 }}>
              <input type="checkbox" checked={specialPatternNight} onChange={e => setSpecialPatternNight(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
              <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: specialPatternNight ? 'var(--primary)' : '#ccc', borderRadius: 28, transition: '0.3s' }}>
                <span style={{ position: 'absolute', width: 22, height: 22, left: specialPatternNight ? 24 : 3, bottom: 3, background: 'white', borderRadius: '50%', transition: '0.3s' }} />
              </span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <button className="btn btn-outline" onClick={() => setSheet(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={updateSpecialPattern} disabled={saving}>{saving ? '保存中...' : '保存する'}</button>
          </div>
          <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => deleteSpecialPattern(editSpecialPattern.id)}>このパターンを削除する</button>
        </BottomSheet>
      )}

      {/* 招待QRコードシート */}
      {sheet === 'qr' && (() => {
        const APP_URL = 'https://tatesyu20051121-bit.github.io/Timecard-ex'
        const INVITE_TOKEN = import.meta.env.VITE_INVITE_TOKEN
        const inviteUrl = INVITE_TOKEN ? `${APP_URL}?invite=${INVITE_TOKEN}` : APP_URL
        const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(inviteUrl)}`
        return (
          <BottomSheet title="招待QRコード" onClose={() => setSheet(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '8px 0 4px' }}>
              <img src={qrSrc} alt="招待QRコード" width={220} height={220}
                style={{ borderRadius: 12, border: '1px solid var(--border)' }} />
              <div style={{
                background: '#fff3e0', border: '1px solid #ffb74d',
                borderRadius: 10, padding: '10px 14px',
                fontSize: 13, color: '#7b4f00', textAlign: 'center', lineHeight: 1.6,
                width: '100%'
              }}>
                ⚠️ このQRコードはSNS上に載せないでください
              </div>
            </div>
          </BottomSheet>
        )
      })()}

      {/* 修正履歴シート */}
      {sheet === 'history' && (
        <BottomSheet title="修正履歴" onClose={() => setSheet(null)}>
          {history.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 24, fontSize: 14 }}>
              修正履歴はありません
            </div>
          ) : (
            history.map(h => (
              <div key={h.id} className="history-item">
                <div className="history-date">{formatHistoryDate(h.created_at)}</div>
                <div className="history-detail">{h.date}　{fieldLabels[h.field_changed] || h.field_changed}</div>
                <div className="history-change">{h.old_value || '（空）'} → {h.new_value || '（空）'}</div>
              </div>
            ))
          )}
        </BottomSheet>
      )}

      {/* アカウント情報シート */}
      {sheet === 'account' && (
        <BottomSheet title="アカウント情報" onClose={() => setSheet(null)}>
          <div className="form-field">
            <label className="form-label">お名前</label>
            <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)} />
          </div>
          <div className="form-field">
            <label className="form-label">メールアドレス</label>
            <input type="text" value={session.user.email} disabled style={{ color: 'var(--text-tertiary)' }} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-outline" onClick={() => setSheet(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={saveAccount} disabled={saving}>{saving ? '保存中...' : '保存する'}</button>
          </div>
        </BottomSheet>
      )}

      {/* 時給削除確認ダイアログ */}
      {deleteTarget && (
        <div className="popup-overlay">
          <div className="popup" style={{ width: 300 }}>
            {deleteHasShifts && (
              <div style={{
                background: '#e0f7fa', border: '1px solid #4dd0e1',
                borderRadius: 8, padding: '10px 12px', marginBottom: 14,
                fontSize: 12, color: '#006064', textAlign: 'left', lineHeight: 1.6
              }}>
                ⚠️ この時給で勤務していた日があります。削除してもよろしいですか？（時給が設定されていないシフトは、給与メニューの月ごとの振り込み予定額に加算されません）
              </div>
            )}
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {fmtWageDate(deleteTarget.effective_date)}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
              ¥{deleteTarget.hourly_rate.toLocaleString()} を削除しますか？
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-outline" onClick={() => setDeleteTarget(null)}>キャンセル</button>
              <button className="btn btn-danger" onClick={confirmDeleteWage}>削除する</button>
            </div>
          </div>
        </div>
      )}
      {/* 交通費パターン削除確認ダイアログ */}
      {deletePatternTarget && (
        <div className="popup-overlay">
          <div className="popup" style={{ width: 300 }}>
            {deletePatternUsed ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
                  「{deletePatternTarget.name}」を削除
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
                  このパターンはすでに使用されています。このパターンが入力されている勤務日の交通費はそのまま保存しますか？
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button className="btn btn-primary" onClick={confirmDeletePatternKeep}>保存してパターン削除</button>
                  <button className="btn btn-danger" onClick={confirmDeletePatternReset}>リセットしてパターン削除</button>
                  <button className="btn btn-outline" onClick={() => setDeletePatternTarget(null)}>キャンセル</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
                  「{deletePatternTarget.name}」を削除しますか？
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="btn btn-outline" onClick={() => setDeletePatternTarget(null)}>キャンセル</button>
                  <button className="btn btn-danger" onClick={confirmDeletePatternKeep}>削除する</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
