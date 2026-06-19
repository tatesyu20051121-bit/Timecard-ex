// 時刻文字列 "HH:MM" を分数に変換
export function timeToMinutes(timeStr) {
  if (!timeStr) return null
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

// 分数を時刻文字列 "HH:MM" に変換
export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// 分数を "○時間○分" 形式に変換
export function minutesToDisplay(minutes) {
  if (minutes === null || minutes === undefined || minutes < 0) return '--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}分`
  if (m === 0) return `${h}時間`
  return `${h}時間${m}分`
}

// 深夜時間帯の計算（日をまたぐ場合も考慮）
function calcNightMinutes(workStart, workEnd, nightStartStr, nightEndStr) {
  const ns = timeToMinutes(nightStartStr)
  let ne = timeToMinutes(nightEndStr)

  let ws = workStart
  let we = workEnd

  if (we < ws) we += 24 * 60

  let nightMinutes = 0

  // 深夜帯1: ns 〜 24:00
  const zone1Start = ns
  const zone1End = 24 * 60
  const overlap1Start = Math.max(ws, zone1Start)
  const overlap1End = Math.min(we, zone1End)
  if (overlap1End > overlap1Start) {
    nightMinutes += overlap1End - overlap1Start
  }

  // 深夜帯2: 0:00 〜 ne（翌日扱いで 24:00 〜 24:00+ne）
  const zone2Start = 24 * 60
  const zone2End = 24 * 60 + ne
  const overlap2Start = Math.max(ws, zone2Start)
  const overlap2End = Math.min(we, zone2End)
  if (overlap2End > overlap2Start) {
    nightMinutes += overlap2End - overlap2Start
  }

  return nightMinutes
}

// 日付に対応する時給を取得（wage_historyから）
// wageHistory: [{ hourly_rate, effective_date }]
// 戻り値: 対応する時給（見つからない場合はnull）
export function getWageForDate(wageHistory, date) {
  if (!wageHistory || wageHistory.length === 0) return null
  const sorted = [...wageHistory].sort((a, b) => b.effective_date.localeCompare(a.effective_date))
  // その日付以前で最新のエントリを探す
  const applicable = sorted.find(w => w.effective_date <= date)
  if (applicable) return applicable.hourly_rate
  // 全エントリがその日付より後の場合は最も古いエントリを使用
  return sorted[sorted.length - 1].hourly_rate
}

// 1日の給与計算
// record: { clock_in, clock_out, break_start, break_end, transport_fee, date }
// settings: { hourly_rate, night_start, night_end, night_rate }
// wageHistory: [{ hourly_rate, effective_date }] (省略可)
export function calcDayPay(record, settings, wageHistory = null) {
  const { clock_in, clock_out, break_start, break_end, transport_fee = 0, bonus_fee = 0 } = record
  let { hourly_rate, night_start = '22:00', night_end = '05:00', night_rate = 1.25 } = settings

  // wage_historyがある場合は対応日の時給を使用
  if (wageHistory && record.date) {
    const rateForDate = getWageForDate(wageHistory, record.date)
    if (rateForDate !== null) hourly_rate = rateForDate
  }

  if (!clock_in || !clock_out) {
    return { workMinutes: 0, nightMinutes: 0, regularMinutes: 0, pay: 0, nightBonus: 0, transportFee: transport_fee || 0, bonusFee: bonus_fee || 0, totalPay: (transport_fee || 0) + (bonus_fee || 0) }
  }

  const inMin = timeToMinutes(clock_in)
  let outMin = timeToMinutes(clock_out)
  if (outMin < inMin) outMin += 24 * 60

  let breakMinutes = 0
  if (break_start && break_end) {
    const bsMin = timeToMinutes(break_start)
    let beMin = timeToMinutes(break_end)
    if (beMin < bsMin) beMin += 24 * 60
    breakMinutes = beMin - bsMin
  }

  const totalWorkMinutes = outMin - inMin - breakMinutes
  if (totalWorkMinutes <= 0) {
    return { workMinutes: 0, nightMinutes: 0, regularMinutes: 0, pay: 0, nightBonus: 0, transportFee: transport_fee || 0, bonusFee: bonus_fee || 0, totalPay: (transport_fee || 0) + (bonus_fee || 0) }
  }

  // 深夜割増が無効の場合はスキップ
  const nightEnabled = settings.night_enabled !== false
  const nightMin = nightEnabled ? calcNightMinutes(inMin, outMin, night_start, night_end) : 0
  const regularMin = totalWorkMinutes - Math.min(nightMin, totalWorkMinutes)

  const ratePerMin = hourly_rate / 60
  const regularPay = Math.floor(regularMin * ratePerMin)
  const nightPay = Math.floor(nightMin * ratePerMin * night_rate)
  const nightBonus = Math.floor(nightMin * ratePerMin * (night_rate - 1))
  const pay = regularPay + nightPay
  const bonusFee = bonus_fee || 0
  const totalPay = pay + (transport_fee || 0) + bonusFee

  return {
    workMinutes: totalWorkMinutes,
    nightMinutes: nightMin,
    regularMinutes: regularMin,
    pay,
    nightBonus,
    transportFee: transport_fee || 0,
    bonusFee,
    totalPay,
  }
}

// 月の給与合計を計算
// wageHistory: [{ hourly_rate, effective_date }] (省略可)
export function calcMonthPay(records, settings, wageHistory = null) {
  let totalWorkMinutes = 0
  let totalNightMinutes = 0
  let totalPay = 0
  let totalTransport = 0
  let totalNightBonus = 0
  let totalBonus = 0
  let workDays = 0

  records.forEach(r => {
    const result = calcDayPay(r, settings, wageHistory)
    totalWorkMinutes += result.workMinutes
    totalNightMinutes += result.nightMinutes
    totalPay += result.pay
    totalTransport += result.transportFee
    totalNightBonus += result.nightBonus || 0
    totalBonus += result.bonusFee || 0
    if (result.workMinutes > 0) workDays++
  })

  return {
    workDays,
    totalWorkMinutes,
    totalNightMinutes,
    totalPay,
    totalTransport,
    totalNightBonus,
    totalBonus,
    grandTotal: totalPay + totalTransport + totalBonus,
  }
}

// 今日の日付を "YYYY-MM-DD" で返す
export function today() {
  return new Date().toISOString().slice(0, 10)
}

// 日付を "YYYY-MM-DD" → "M月D日（曜）" に変換
export function formatDate(dateStr) {
  const days = ['日', '月', '火', '水', '木', '金', '土']
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}月${d.getDate()}日（${days[d.getDay()]}）`
}

// "YYYY-MM" → "YYYY年M月"
export function formatYearMonth(ym) {
  const [y, m] = ym.split('-')
  return `${y}年${parseInt(m)}月`
}

// 現在時刻を "HH:MM" で返す
export function currentTime() {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

// 時刻に分を加算
export function addMinutes(timeStr, delta) {
  const mins = timeToMinutes(timeStr) + delta
  const clamped = ((mins % (24 * 60)) + 24 * 60) % (24 * 60)
  return minutesToTime(clamped)
}

// 月のカレンダー情報を生成
export function getMonthCalendar(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)

  let startOffset = firstDay.getDay() - 1
  if (startOffset < 0) startOffset = 6

  const days = []
  for (let i = 0; i < startOffset; i++) {
    days.push(null)
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({ date, day: d })
  }
  return { year, month, days }
}

// 前月・翌月の "YYYY-MM" を返す
export function prevMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  if (m === 1) return `${y - 1}-12`
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

export function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

// 現在の "YYYY-MM"
export function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
