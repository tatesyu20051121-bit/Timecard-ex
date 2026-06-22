import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import {
  currentYearMonth, prevMonth, nextMonth, formatYearMonth,
  minutesToDisplay, calcMonthPay
} from '../lib/timeUtils.js'

export default function SalaryScreen({ session, profile, wageHistory, yearMonth, setYearMonth }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadRecords() }, [yearMonth])

  async function loadRecords() {
    setLoading(true)
    const [y, m] = yearMonth.split('-')
    const start = `${yearMonth}-01`
    const end = `${yearMonth}-${new Date(+y, +m, 0).getDate().toString().padStart(2, '0')}`
    const { data } = await supabase
      .from('time_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('date', start)
      .lte('date', end)
    setRecords(data || [])
    setLoading(false)
  }

  const settings = {
    hourly_rate: profile.hourly_rate,
    night_start: profile.night_start,
    night_end: profile.night_end,
    night_rate: profile.night_rate,
    night_enabled: profile.night_enabled !== false,
  }

  const result = calcMonthPay(records, settings, wageHistory)
  const nightRatePercent = Math.round((profile.night_rate - 1) * 100)
  const incompleteRecords = records.filter(r =>
    (r.clock_in && !r.clock_out) || (r.break_start && !r.break_end)
  )

  return (
    <div className="screen salary-screen">
      {/* 月ナビ */}
      <div className="salary-month-nav">
        <button onClick={() => setYearMonth(prevMonth(yearMonth))}>◀</button>
        <span className="salary-month-label">{formatYearMonth(yearMonth)}</span>
        <button onClick={() => setYearMonth(nextMonth(yearMonth))}>▶</button>
      </div>

      {loading ? (
        <div className="loading" style={{ flex: 'none', padding: 40 }}>
          <div className="spinner" />
        </div>
      ) : records.length === 0 ? (
        <div className="no-data">この月の勤務記録はありません</div>
      ) : (
        <>
          {/* 時給未設定の警告 */}
          {result.daysWithoutWage > 0 && (
            <div style={{
              background: '#e0f7fa', border: '1px solid #4dd0e1',
              borderRadius: 10, padding: '10px 14px', marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 8
            }}>
              <span>⚠️</span>
              <span style={{ fontSize: 13, color: '#006064', fontWeight: 500 }}>
                時給が設定されていない勤務日があります
              </span>
            </div>
          )}
          {/* 不完全記録の警告 */}
          {incompleteRecords.length > 0 && (
            <div style={{
              background: '#fff8e1', border: '1px solid #f9a825',
              borderRadius: 10, padding: '10px 14px', margin: '0 0 12px',
              fontSize: 13, color: '#795548'
            }}>
              ⚠️ 記録が途切れている日があります（{incompleteRecords.map(r => {
                const d = new Date(r.date + 'T00:00:00')
                return `${d.getMonth()+1}/${d.getDate()}`
              }).join('、')}）
            </div>
          )}
          {/* 勤務サマリー */}
          <div className="salary-card">
            <div className="salary-card-title">勤務サマリー</div>
            <div className="salary-row">
              <span className="salary-label">勤務日数</span>
              <span className="salary-value">{result.workDays}日</span>
            </div>
            <div className="salary-row">
              <span className="salary-label">総労働時間</span>
              <span className="salary-value">{minutesToDisplay(result.totalWorkMinutes)}</span>
            </div>
            {profile.night_enabled !== false && (
              <div className="salary-row">
                <span className="salary-label">深夜時間（{profile.night_start?.slice(0,5)}〜{profile.night_end?.slice(0,5)}）</span>
                <span className="salary-value">{minutesToDisplay(result.totalNightMinutes)}</span>
              </div>
            )}
          </div>

          {/* 給与内訳 */}
          <div className="salary-card">
            <div className="salary-card-title">給与内訳</div>
            <div className="salary-row">
              <span className="salary-label">通常給与</span>
              <span className="salary-value">¥{(result.totalPay - result.totalNightBonus).toLocaleString()}</span>
            </div>
            {profile.night_enabled !== false && (
              <div className="salary-row">
                <span className="salary-label">深夜割増（+{nightRatePercent}%）</span>
                <span className="salary-value">+¥{result.totalNightBonus.toLocaleString()}</span>
              </div>
            )}
            <div className="salary-row">
              <span className="salary-label">交通費</span>
              <span className="salary-value">¥{result.totalTransport.toLocaleString()}</span>
            </div>
            <div className="salary-row">
              <span className="salary-label">ボーナス</span>
              <span className="salary-value">¥{result.totalBonus.toLocaleString()}</span>
            </div>
            <div className="salary-total-row">
              <span className="salary-total-label">振込予定額</span>
              <span className="salary-total-value">¥{result.grandTotal.toLocaleString()}</span>
            </div>
          </div>

          {/* 日別一覧 */}
          <div className="salary-card">
            <div className="salary-card-title">日別明細</div>
            {records
              .filter(r => r.clock_in)
              .sort((a, b) => a.date.localeCompare(b.date))
              .map(r => {
                const d = calcMonthPay([r], settings, wageHistory)
                const dateObj = new Date(r.date + 'T00:00:00')
                const label = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
                const days = ['日', '月', '火', '水', '木', '金', '土']
                const dow = days[dateObj.getDay()]
                return (
                  <div key={r.id} className="salary-row" style={{ flexWrap: 'wrap', gap: 4 }}>
                    <span className="salary-label">{label}（{dow}）</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <span className="salary-value">¥{d.grandTotal.toLocaleString()}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {minutesToDisplay(d.totalWorkMinutes)}
                        {r.transport_fee ? ` ＋交通費¥${r.transport_fee}` : ''}
                        {r.bonus_fee ? ` ＋ボーナス¥${r.bonus_fee}` : ''}
                      </span>
                    </div>
                  </div>
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}
