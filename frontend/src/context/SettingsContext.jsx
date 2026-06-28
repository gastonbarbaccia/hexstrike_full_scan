import { createContext, useContext, useState, useEffect } from 'react'

const DEFAULTS = {
  timezone: 'America/Argentina/Buenos_Aires',
  dateFormat: 'datetime', // 'datetime' | 'date'
}

const SettingsContext = createContext(null)

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('hs-settings')
      return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS
    } catch {
      return DEFAULTS
    }
  })

  useEffect(() => {
    localStorage.setItem('hs-settings', JSON.stringify(settings))
  }, [settings])

  const update = (key, value) => setSettings(s => ({ ...s, [key]: value }))

  return (
    <SettingsContext.Provider value={{ settings, update }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}

export function useFmtDate() {
  const { settings } = useSettings()
  return (isoStr, mode = 'datetime') => {
    if (!isoStr) return '—'
    const normalized = /Z|[+-]\d{2}:\d{2}$/.test(isoStr) ? isoStr : isoStr + 'Z'
    const d = new Date(normalized)
    if (isNaN(d)) return '—'
    return d.toLocaleString('es', {
      timeZone: settings.timezone,
      day: '2-digit', month: '2-digit', year: 'numeric',
      ...(mode !== 'date' && { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    })
  }
}
