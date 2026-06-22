import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase.js'
import { currentYearMonth } from './lib/timeUtils.js'
import AuthScreen from './screens/AuthScreen.jsx'
import ClockScreen from './screens/ClockScreen.jsx'
import CalendarScreen from './screens/CalendarScreen.jsx'
import SalaryScreen from './screens/SalaryScreen.jsx'
import SettingsScreen from './screens/SettingsScreen.jsx'
import BottomNav from './components/BottomNav.jsx'

// supabase.jsのcreateClient実行後にURLを取得
const INIT_SEARCH = window.location.search
const INIT_HASH = window.location.hash

// LINE・Instagram等の内蔵ブラウザ検出
const ua = navigator.userAgent
const isInAppBrowser = /Line\/|Instagram|FBAN|FBAV|Twitter\/|Snapchat/i.test(ua)

function InAppBrowserScreen() {
  const currentUrl = window.location.href
  const [copied, setCopied] = useState(false)

  function copyUrl() {
    navigator.clipboard.writeText(currentUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {})
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 24px', background: 'var(--background)', textAlign: 'center', gap: 20
    }}>
      <div style={{ fontSize: 48 }}>🌐</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>
        ブラウザで開いてください
      </div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        このアプリはLINEなどの内蔵ブラウザでは<br />
        Googleログインができません。<br />
        下のボタンでURLをコピーして、<br />
        SafariまたはChromeで開いてください。
      </div>
      <button
        onClick={copyUrl}
        style={{
          padding: '14px 32px', borderRadius: 12, border: 'none',
          background: 'var(--primary)', color: 'white',
          fontSize: 16, fontWeight: 600, cursor: 'pointer',
          minWidth: 200
        }}
      >
        {copied ? '✓ コピーしました' : 'URLをコピー'}
      </button>
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
        ブラウザでURLを貼り付ける手順：<br />
        SafariまたはChromeを開く → アドレスバーを長押し → ペースト → 開く
      </div>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [wageHistory, setWageHistory] = useState([])
  const [tab, setTab] = useState('clock')
  const [sharedYearMonth, setSharedYearMonth] = useState(currentYearMonth())
  const [logs, setLogs] = useState([
    `S:${INIT_SEARCH || '(なし)'}`,
    `H:${INIT_HASH ? INIT_HASH.substring(0, 30) : '(なし)'}`,
    `URL:${import.meta.env.VITE_SUPABASE_URL ? import.meta.env.VITE_SUPABASE_URL.substring(8, 35) : 'missing'}`,
    `KEY:${import.meta.env.VITE_SUPABASE_ANON_KEY ? import.meta.env.VITE_SUPABASE_ANON_KEY.substring(0, 15) : 'missing'}`,
  ])

  const addLog = (msg) => setLogs(prev => [...prev, msg].slice(-6))

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const invite = params.get('invite')
    if (invite) {
      localStorage.setItem('invite_token', invite)
      window.history.replaceState({}, '', window.location.pathname)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      addLog(`${event}:${session ? session.user.email.split('@')[0] : 'null'}`)
      setSession(session ?? null)
      if (event === 'SIGNED_IN' && window.location.hash) {
        window.history.replaceState({}, '', window.location.pathname)
      }
    })

    if (INIT_HASH && INIT_HASH.includes('access_token=')) {
      const hashParams = new URLSearchParams(INIT_HASH.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token') || ''
      addLog(`AT:${accessToken ? 'あり' : 'なし'} RT:${refreshToken ? 'あり' : 'なし'}`)
      if (accessToken) {
        supabase.auth.getUser(accessToken)
          .then(({ data, error }) => {
            if (error) addLog(`getUserErr:${error.message.substring(0, 18)}`)
            else {
              addLog(`getUser:${data.user?.email?.split('@')[0]}`)
              if (refreshToken) {
                supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
                  .then(({ error: se }) => {
                    if (se) addLog(`setErr:${se.message.substring(0, 15)}`)
                    else addLog(`setSession成功`)
                  })
              }
            }
          })
      }
    }

    const handlePageShow = async (event) => {
      if (event.persisted) {
        addLog('BFCache復元')
        const { data: { session } } = await supabase.auth.getSession()
        setSession(session ?? null)
      }
    }
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); setWageHistory([]); return }
    loadProfile()
    loadWageHistory()
  }, [session])

  async function loadProfile() {
    const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
    setProfile(data)
  }

  async function loadWageHistory() {
    const { data } = await supabase
      .from('wage_history')
      .select('*')
      .eq('user_id', session.user.id)
      .order('effective_date')
    setWageHistory(data || [])
  }

  const errorLogs = logs.filter(l => /err|miss|fail/i.test(l))
  const DebugBar = () => errorLogs.length === 0 ? null : (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      zIndex: 50, fontFamily: 'monospace', fontSize: '11px',
    }}>
      <div style={{
        background: 'rgba(92,60,0,0.85)', color: '#ffe082',
        padding: '6px 10px', lineHeight: '1.4', pointerEvents: 'none'
      }}>
        {errorLogs.map((l, i) => <div key={i}>{l}</div>)}
      </div>
      <div style={{
        background: '#fff8e1', color: '#5d4200', fontFamily: 'sans-serif',
        border: '1px solid #f0c040',
        padding: '10px 14px', fontSize: '12px', lineHeight: '1.8', textAlign: 'center'
      }}>
        大変申し訳ございません。エラーが起きてしまいました。
        この画面をスクリーンショットして、
        <span style={{ fontWeight: 700 }}>jefuni20260530@gmail.com</span> にメールで送信してください。
        その際に、どのような操作でエラーが発生したのかを一緒に書いていただけると幸いです。
      </div>
    </div>
  )

  if (isInAppBrowser) return <InAppBrowserScreen />

  if (session === undefined) return <><div className="loading"><div className="spinner" /></div><DebugBar /></>
  if (!session) return <><AuthScreen onLogin={() => {}} /><DebugBar /></>
  if (!profile) return <><AuthScreen firstSetup session={session} onProfileCreated={loadProfile} /><DebugBar /></>

  return (
    <>
      {tab === 'clock' && <ClockScreen session={session} profile={profile} setTab={setTab} />}
      {tab === 'calendar' && <CalendarScreen session={session} profile={profile} wageHistory={wageHistory} yearMonth={sharedYearMonth} setYearMonth={setSharedYearMonth} />}
      {tab === 'salary' && <SalaryScreen session={session} profile={profile} wageHistory={wageHistory} yearMonth={sharedYearMonth} setYearMonth={setSharedYearMonth} />}
      {tab === 'settings' && (
        <SettingsScreen
          session={session}
          profile={profile}
          onProfileUpdated={loadProfile}
          wageHistory={wageHistory}
          onWageHistoryUpdated={loadWageHistory}
        />
      )}
      <BottomNav tab={tab} setTab={setTab} />
      <DebugBar />
    </>
  )
}
