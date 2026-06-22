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
  // 全エントリがその日付より後の場合はnull（設定前の日付）
  return null
}

// 指定年の日本の祝日セットを構築
function nthWeekday(year, month, n, dow) {
  const d = new Date(year, month - 1, 1)
  let cnt = 0
  while (d.getMonth() === month - 1) {
    if (d.getDay() === dow) { cnt++; if (cnt === n) return d.getDate() }
    d.setDate(d.getDate() + 1)
  }
  return null
}

function buildHolidaySet(year) {
  const list = []
  const add = (m, d) => { if (d != null) list.push(`${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`) }

  add(1, 1);   add(2, 11);  add(2, 23);  add(4, 29)
  add(5, 3);   add(5, 4);   add(5, 5);   add(8, 11)
  add(11, 3);  add(11, 23)

  add(1, nthWeekday(year, 1, 2, 1))
  add(7, nthWeekday(year, 7, 3, 1))
  add(9, nthWeekday(year, 9, 3, 1))
  add(10, nthWeekday(year, 10, 2, 1))

  const shunbun = { 2023: 21, 2024: 20, 2025: 20, 2026: 20, 2027: 21, 2028: 20, 2029: 20, 2030: 20 }
  const shubun  = { 2023: 23, 2024: 22, 2025: 23, 2026: 23, 2027: 23, 2028: 22, 2029: 23, 2030: 23 }
  if (shunbun[year]) add(3, shunbun[year])
  if (shubun[year])  add(9, shubun[year])

  const set = new Set(list)
  // 振替休日（祝日が日曜→翌月曜）
  const extras = []
  set.forEach(s => {
    const d = new Date(s + 'T00:00:00')
    if (d.getDay() === 0) {
      const next = new Date(d)
      next.setDate(next.getDate() + 1)
      let nextStr = next.toISOString().slice(0, 10)
      while (set.has(nextStr) || extras.includes(nextStr)) {
        next.setDate(next.getDate() + 1)
        nextStr = next.toISOString().slice(0, 10)
      }
      extras.push(nextStr)
    }
  })
  extras.forEach(s => set.add(s))
  return set
}

const _holidayCache = {}
export function isJapaneseHoliday(dateStr) {
  if (!dateStr) return false
  const year = parseInt(dateStr.slice(0, 4))
  if (!_holidayCache[year]) _holidayCache[year] = buildHolidaySet(year)
  return _holidayCache[year].has(dateStr)
}

// 1日の給与計算
// record: { clock_in, clock_out, break_start, break_end, transport_fee, date }
// settings: { hourly_rate, night_start, night_end, night_rate }
// wageHistory: [{ hourly_rate, effective_date }] (省略可)
export function calcDayPay(record, settings, wageHistory = null) {
  const { clock_in, clock_out, break_start, break_end, transport_fee = 0, bonus_fee = 0 } = record
  let { hourly_rate, night_start = '22:00', night_end = '05:00', night_rate = 1.25 } = settings

  // wage_historyがある場合は対応日の時給を使用
  let hasWage = true
  if (wageHistory && record.date) {
    const rateForDate = getWageForDate(wageHistory, record.date)
    if (rateForDate !== null) {
      hourly_rate = rateForDate
    } else {
      // wage_historyがあるが対応する時給が見つからない（全削除 or 設定前の日付）
      hasWage = false
    }
  }

  // 休日時給チェック（通常時給を上書き）
  let isHolidayRate = false
  if (hasWage && settings.holiday_enabled && record.date) {
    const d = new Date(record.date + 'T00:00:00')
    const dow = d.getDay()
    const isHol = isJapaneseHoliday(record.date)
    if (isHol && settings.hol_hourly_rate) {
      hourly_rate = settings.hol_hourly_rate
      isHolidayRate = true
    } else if (dow === 0 && settings.sun_hourly_rate) {
      hourly_rate = settings.sun_hourly_rate
      isHolidayRate = true
    } else if (dow === 6 && settings.sat_hourly_rate) {
      hourly_rate = settings.sat_hourly_rate
      isHolidayRate = true
    }
  }

  if (!clock_in || !clock_out) {
    return { workMinutes: 0, nightMinutes: 0, regularMinutes: 0, pay: 0, nightBonus: 0, transportFee: transport_fee || 0, bonusFee: bonus_fee || 0, totalPay: (transport_fee || 0) + (bonus_fee || 0), hasWage }
  }

  // 時給未設定の場合は給与0
  if (!hasWage) {
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
    const totalWorkMinutes = Math.max(0, outMin - inMin - breakMinutes)
    return { workMinutes: totalWorkMinutes, nightMinutes: 0, regularMinutes: totalWorkMinutes, pay: 0, nightBonus: 0, transportFee: transport_fee || 0, bonusFee: bonus_fee || 0, totalPay: (transport_fee || 0) + (bonus_fee || 0), hasWage: false }
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

  // 深夜割増：休日時給の日は holiday_night_enabled が false の場合スキップ
  const nightEnabled = settings.night_enabled !== false &&
    (!isHolidayRate || settings.holiday_night_enabled !== false)
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
    hasWage: true,
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
  let daysWithoutWage = 0

  records.forEach(r => {
    const result = calcDayPay(r, settings, wageHistory)
    totalWorkMinutes += result.workMinutes
    totalNightMinutes += result.nightMinutes
    totalPay += result.pay
    totalTransport += result.transportFee
    totalNightBonus += result.nightBonus || 0
    totalBonus += result.bonusFee || 0
    if (result.workMinutes > 0) {
      workDays++
      if (result.hasWage === false) daysWithoutWage++
    }
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
    daysWithoutWage,
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

// 月のカレンダー情報を生成（日曜始まり、前後月の日付も含む）
export function getMonthCalendar(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number)
  const firstDay = new Date(year, month - 1, 1)
  const lastDay = new Date(year, month, 0)

  // 0=日曜始まり（日曜が0なのでそのまま使用）
  const startOffset = firstDay.getDay()

  const days = []

  // 前月の日付（1日が日曜=0の場合は前月不要）
  if (startOffset > 0) {
    const prevLastDay = new Date(year, month - 1, 0)
    const prevYear = month === 1 ? year - 1 : year
    const prevMonthNum = month === 1 ? 12 : month - 1
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevLastDay.getDate() - i
      const date = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({ date, day: d, otherMonth: true })
    }
  }

  // 当月の日付
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push({ date, day: d, otherMonth: false })
  }

  // 翌月の日付（最終週を埋める）
  const remainder = days.length % 7
  if (remainder !== 0) {
    const nextYear = month === 12 ? year + 1 : year
    const nextMonthNum = month === 12 ? 1 : month + 1
    const toAdd = 7 - remainder
    for (let d = 1; d <= toAdd; d++) {
      const date = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      days.push({ date, day: d, otherMonth: true })
    }
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
