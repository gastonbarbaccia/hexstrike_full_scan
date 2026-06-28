import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import NewScan from './pages/NewScan'
import ScanDetail from './pages/ScanDetail'
import Reports from './pages/Reports'
import Targets from './pages/Targets'
import Settings from './pages/Settings'
import Scheduled from './pages/Scheduled'
import Login from './pages/Login'
import Users from './pages/Users'
import Vulnerabilities from './pages/Vulnerabilities'
import Support from './pages/Support'
import { SettingsProvider } from './context/SettingsContext'
import { NotificationProvider, useNotifications } from './context/NotificationContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import { api } from './api'

const NAV_ITEMS = [
  {
    to: '/',
    exact: true,
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/scan/new',
    exact: false,
    label: 'Nuevo Scan',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
  {
    to: '/targets',
    exact: false,
    label: 'Targets',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
        <circle cx="12" cy="12" r="5" strokeWidth={1.8} />
        <circle cx="12" cy="12" r="1" strokeWidth={1.8} />
        <line x1="12" y1="3" x2="12" y2="6" strokeWidth={1.8} strokeLinecap="round" />
        <line x1="12" y1="18" x2="12" y2="21" strokeWidth={1.8} strokeLinecap="round" />
        <line x1="3" y1="12" x2="6" y2="12" strokeWidth={1.8} strokeLinecap="round" />
        <line x1="18" y1="12" x2="21" y2="12" strokeWidth={1.8} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/vulnerabilities',
    exact: false,
    label: 'Vulnerabilidades',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
  },
  {
    to: '/scheduled',
    exact: false,
    label: 'Programados',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/reports',
    exact: false,
    label: 'Reportes',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to: '/support',
    exact: false,
    label: 'Soporte',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    exact: false,
    label: 'Ajustes',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
]

const USERS_NAV = {
  to: '/users',
  exact: false,
  label: 'Usuarios',
  icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

const TYPE_COLORS = {
  success: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' },
  error:   { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.3)' },
  warning: { color: '#facc15', bg: 'rgba(250,204,21,0.12)', border: 'rgba(250,204,21,0.3)' },
  info:    { color: '#00d4ff', bg: 'rgba(0,212,255,0.12)', border: 'rgba(0,212,255,0.3)' },
}

const ROLE_LABELS = {
  administrator: { label: 'Admin',    color: '#ef4444' },
  analista:      { label: 'Analista', color: '#f97316' },
  viewer:        { label: 'Viewer',   color: '#64748b' },
}

// ── Notification Bell (icon-only, for header) ──────────────────────────────

function NotificationBell() {
  const { notifications, unreadCount, markAllRead, clear } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleOpen = () => { setOpen(o => !o); if (!open) markAllRead() }

  const fmtTs = (ts) => {
    const d = new Date(ts)
    return d.toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        title="Notificaciones"
        className="relative w-9 h-9 flex items-center justify-center rounded-lg text-[#64748b] hover:text-white hover:bg-[#111827] transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span
            className="absolute top-1 right-1 min-w-[14px] h-3.5 rounded-full text-[8px] font-bold flex items-center justify-center px-0.5 leading-none"
            style={{ background: '#ef4444', color: '#fff' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-72 bg-[#0d1525] border border-[#1e3a5f] rounded-xl shadow-2xl z-[200] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e3a5f]">
            <span className="text-xs font-semibold text-white">Notificaciones</span>
            {notifications.length > 0 && (
              <button onClick={clear} className="text-[10px] text-[#64748b] hover:text-red-400 transition-colors">
                Limpiar
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-[#64748b]">Sin notificaciones</div>
            ) : (
              notifications.map(n => {
                const tc = TYPE_COLORS[n.type] ?? TYPE_COLORS.info
                return (
                  <div
                    key={n.id}
                    className="px-4 py-3 border-b border-[#111827] last:border-0"
                    style={{ background: n.read ? 'transparent' : tc.bg }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: tc.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{n.title}</div>
                        {n.body && <div className="text-[11px] text-[#64748b] mt-0.5">{n.body}</div>}
                        <div className="text-[10px] text-[#3d5270] mt-1">{fmtTs(n.ts)}</div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Top Header Bar ─────────────────────────────────────────────────────────

function TopBar({ theme, onToggleTheme }) {
  const { authEnabled, logout } = useAuth()
  const [currentUser, setCurrentUser] = useState(null)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const isClassic = theme === 'classic'

  useEffect(() => {
    if (!authEnabled) {
      setCurrentUser({ username: 'admin', role: 'administrator' })
      return
    }
    api.auth.me().then(setCurrentUser).catch(() => {})
  }, [authEnabled])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const role = !authEnabled ? 'administrator' : (currentUser?.role ?? 'viewer')
  const roleCfg = ROLE_LABELS[role] ?? ROLE_LABELS.viewer

  return (
    <header className="fixed top-0 left-56 right-0 h-14 border-b border-[#1e3a5f] flex items-center justify-end px-5 gap-1 z-40" style={{ background: isClassic ? '#141414' : 'rgba(8,14,28,0.85)', backdropFilter: isClassic ? 'none' : 'blur(8px)' }}>

      {/* Theme toggle */}
      <button
        onClick={onToggleTheme}
        title={isClassic ? 'Cambiar a tema Dark' : 'Cambiar a tema Classic'}
        className="w-9 h-9 flex items-center justify-center rounded-lg text-[#64748b] hover:text-white hover:bg-[#111827] transition-colors"
      >
        {isClassic ? (
          <svg className="w-4.5 h-4.5 w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          </svg>
        ) : (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        )}
      </button>

      {/* Notification bell */}
      <NotificationBell />

      {/* Divider */}
      <div className="w-px h-5 bg-[#1e3a5f] mx-1" />

      {/* User menu */}
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#111827] transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[11px] font-bold text-accent flex-shrink-0">
            {currentUser?.username?.[0]?.toUpperCase() ?? '?'}
          </div>
          <div className="text-left hidden sm:block">
            <div className="text-xs font-medium text-white leading-none">{currentUser?.username ?? '...'}</div>
            <div className="text-[9px] font-semibold mt-0.5 leading-none" style={{ color: roleCfg.color }}>{roleCfg.label}</div>
          </div>
          <svg className={`w-3 h-3 text-[#3d5270] transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && authEnabled && (
          <div className="absolute top-full right-0 mt-1.5 w-48 bg-[#0d1525] border border-[#1e3a5f] rounded-xl shadow-2xl overflow-hidden z-[200]">
            <button
              onClick={() => { setOpen(false); logout() }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-[#64748b] hover:text-red-400 hover:bg-[#111827] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  )
}

// ── Sidebar (solo logo + nav) ──────────────────────────────────────────────

function Sidebar() {
  const { pathname } = useLocation()
  const { authEnabled } = useAuth()
  const [currentUser, setCurrentUser] = useState(null)
  const isActive = (to, exact) => exact ? pathname === to : pathname.startsWith(to)

  useEffect(() => {
    if (!authEnabled) {
      setCurrentUser({ role: 'administrator' })
      return
    }
    api.auth.me().then(setCurrentUser).catch(() => {})
  }, [authEnabled])

  const role = !authEnabled ? 'administrator' : (currentUser?.role ?? 'viewer')
  const isAdmin = role === 'administrator'
  const navItems = isAdmin ? [...NAV_ITEMS, USERS_NAV] : NAV_ITEMS

  return (
    <aside className="fixed top-0 left-0 h-screen w-56 bg-[#080e1c] border-r border-[#1e3a5f] flex flex-col z-50">
      {/* Logo */}
      <div className="px-5 h-14 border-b border-[#1e3a5f] flex items-center gap-2 flex-shrink-0">
        <Link to="/" className="flex items-center gap-2 font-bold text-white">
          <span className="text-accent text-xl">⬡</span>
          <span className="tracking-tight text-base">
            HexStrike <span className="text-accent">AI</span>
          </span>
        </Link>
        <span className="ml-auto text-[10px] border border-accent/40 text-accent/70 px-1.5 py-0.5 rounded font-mono flex-shrink-0">
          v2.0
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, exact, label, icon }) => {
          const active = isActive(to, exact)
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-[#64748b] hover:text-white hover:bg-[#111827]'
                }`}
            >
              {icon}
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

// ── Auth guard ─────────────────────────────────────────────────────────────

function AuthGuard({ children }) {
  const { authEnabled, isAuthenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0f1e] flex items-center justify-center">
        <div className="text-[#64748b] text-sm">Cargando...</div>
      </div>
    )
  }

  if (authEnabled && !isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return children
}

// ── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('hs-theme') ?? 'dark')

  useEffect(() => {
    if (theme === 'classic') {
      document.documentElement.classList.add('classic')
    } else {
      document.documentElement.classList.remove('classic')
    }
    localStorage.setItem('hs-theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'classic' : 'dark')

  return (
    <SettingsProvider>
      <NotificationProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route path="/*" element={
                <AuthGuard>
                  <div className="flex min-h-screen bg-[#0a0f1e]">
                    <Sidebar />
                    <TopBar theme={theme} onToggleTheme={toggleTheme} />
                    {/* Content area — background image only in dark mode */}
                    <div
                      className="flex-1 ml-56 min-h-screen"
                      style={theme !== 'classic' ? {
                        backgroundImage: 'url(/app-bg.jpg)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center top',
                        backgroundAttachment: 'fixed',
                      } : {}}
                    >
                    <main className="pt-20 px-8 py-8 min-h-screen" style={{ background: theme !== 'classic' ? 'rgba(10,15,30,0.72)' : 'transparent' }}>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/targets" element={<Targets />} />
                        <Route path="/vulnerabilities" element={<Vulnerabilities />} />
                        <Route path="/reports" element={<Reports />} />
                        <Route path="/scheduled" element={<Scheduled />} />
                        <Route path="/scan/new" element={<NewScan />} />
                        <Route path="/scan/:id" element={<ScanDetail />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/users" element={<Users />} />
                        <Route path="/support" element={<Support />} />
                      </Routes>
                    </main>
                    </div>
                  </div>
                </AuthGuard>
              } />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </NotificationProvider>
    </SettingsProvider>
  )
}
