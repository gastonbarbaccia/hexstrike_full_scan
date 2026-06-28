import { useEffect, useState } from 'react'
import { useSettings } from '../context/SettingsContext'
import { api } from '../api'

const TIMEZONES = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (UTC-3)' },
  { value: 'America/Sao_Paulo',              label: 'São Paulo (UTC-3)' },
  { value: 'America/Santiago',               label: 'Santiago (UTC-4/-3)' },
  { value: 'America/Bogota',                 label: 'Bogotá (UTC-5)' },
  { value: 'America/Lima',                   label: 'Lima (UTC-5)' },
  { value: 'America/Mexico_City',            label: 'Ciudad de México (UTC-6)' },
  { value: 'America/New_York',               label: 'Nueva York (UTC-5/-4)' },
  { value: 'America/Los_Angeles',            label: 'Los Ángeles (UTC-8/-7)' },
  { value: 'Europe/Madrid',                  label: 'Madrid (UTC+1/+2)' },
  { value: 'Europe/London',                  label: 'Londres (UTC+0/+1)' },
  { value: 'UTC',                            label: 'UTC' },
]

function Section({ title, children }) {
  return (
    <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1e3a5f]">
        <span className="text-sm font-semibold text-white">{title}</span>
      </div>
      <div className="px-5 py-5 space-y-5">{children}</div>
    </div>
  )
}

function Field({ label, description, children }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex-1">
        <div className="text-sm font-medium text-white">{label}</div>
        {description && <div className="text-xs text-[#64748b] mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
        value ? 'bg-accent' : 'bg-[#1e3a5f]'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-1'}`} />
    </button>
  )
}

const SLA_LABELS = {
  CRITICAL: { label: 'Crítico', color: '#ef4444' },
  HIGH:     { label: 'Alto',    color: '#f97316' },
  MEDIUM:   { label: 'Medio',   color: '#eab308' },
  LOW:      { label: 'Bajo',    color: '#22c55e' },
  INFO:     { label: 'Info',    color: '#00d4ff' },
}

export default function Settings() {
  const { settings, update } = useSettings()

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookOnCritical, setWebhookOnCritical] = useState(true)
  const [webhookOnComplete, setWebhookOnComplete] = useState(true)
  const [webhookSaving, setWebhookSaving] = useState(false)
  const [webhookMsg, setWebhookMsg] = useState('')

  // Auth info state
  const [authEnabled, setAuthEnabled] = useState(false)
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authSaving, setAuthSaving] = useState(false)
  const [authMsg, setAuthMsg] = useState('')

  // SLA state
  const [slaValues, setSlaValues] = useState({ CRITICAL: 24, HIGH: 72, MEDIUM: 168, LOW: 336, INFO: 720 })
  const [slaSaving, setSlaSaving] = useState(false)
  const [slaMsg, setSlaMsg] = useState('')

  useEffect(() => {
    api.settings.get().then(s => {
      setWebhookUrl(s.webhook_url || '')
      setWebhookOnCritical(s.webhook_on_critical)
      setWebhookOnComplete(s.webhook_on_complete)
    }).catch(() => {})

    api.auth.config().then(c => {
      setAuthEnabled(c.auth_enabled)
    }).catch(() => {})

    api.sla.get().then(configs => {
      const map = {}
      configs.forEach(c => { map[c.severity] = c.hours })
      setSlaValues(v => ({ ...v, ...map }))
    }).catch(() => {})
  }, [])

  const saveWebhook = async () => {
    setWebhookSaving(true)
    setWebhookMsg('')
    try {
      await api.settings.update({
        webhook_url: webhookUrl.trim() || null,
        webhook_on_critical: webhookOnCritical,
        webhook_on_complete: webhookOnComplete,
      })
      setWebhookMsg('Guardado correctamente.')
    } catch (e) {
      setWebhookMsg(`Error: ${e.message}`)
    } finally {
      setWebhookSaving(false)
      setTimeout(() => setWebhookMsg(''), 3000)
    }
  }

  const testLogin = async () => {
    if (!authUsername || !authPassword) { setAuthMsg('Ingresá usuario y contraseña.'); return }
    setAuthSaving(true)
    setAuthMsg('')
    try {
      const resp = await api.auth.login({ username: authUsername, password: authPassword })
      if (resp.token) {
        setAuthMsg('Credenciales válidas. Login exitoso.')
      }
    } catch (e) {
      setAuthMsg(`Error: ${e.message}`)
    } finally {
      setAuthSaving(false)
      setTimeout(() => setAuthMsg(''), 4000)
    }
  }

  const saveSla = async () => {
    setSlaSaving(true)
    setSlaMsg('')
    try {
      await api.sla.update(slaValues)
      setSlaMsg('SLAs guardados correctamente.')
    } catch (e) {
      setSlaMsg(`Error: ${e.message}`)
    } finally {
      setSlaSaving(false)
      setTimeout(() => setSlaMsg(''), 3000)
    }
  }

  const now = new Date().toLocaleString('es', {
    timeZone: settings.timezone,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Ajustes</h1>
        <p className="text-sm text-[#64748b] mt-0.5">Configuración general de la plataforma</p>
      </div>

      <Section title="Fecha y Hora">
        <Field label="Zona horaria" description={`Hora actual: ${now}`}>
          <select
            value={settings.timezone}
            onChange={e => update('timezone', e.target.value)}
            className="bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent cursor-pointer"
          >
            {TIMEZONES.map(tz => (
              <option key={tz.value} value={tz.value}>{tz.label}</option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Webhook / Slack */}
      <Section title="Webhook / Notificaciones">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[#64748b] mb-1">URL del Webhook</label>
            <input
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/... o cualquier endpoint"
              className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-[#3d5270]"
            />
            <div className="text-xs text-[#64748b] mt-1">
              HexStrike enviará un HTTP POST con el resumen del scan. Compatible con Slack, Discord, Make, n8n, etc.
            </div>
          </div>

          <Field label="Notificar al completar" description="Envía webhook cuando cualquier scan finaliza">
            <Toggle value={webhookOnComplete} onChange={setWebhookOnComplete} />
          </Field>

          <Field label="Notificar en CRITICAL" description="Envía webhook cuando hay hallazgos críticos">
            <Toggle value={webhookOnCritical} onChange={setWebhookOnCritical} />
          </Field>

          <div className="flex items-center gap-3">
            <button
              onClick={saveWebhook}
              disabled={webhookSaving}
              className="px-4 py-2 bg-accent text-[#0a0f1e] font-bold text-sm rounded-lg hover:bg-cyan-300 transition-colors disabled:opacity-50"
            >
              {webhookSaving ? 'Guardando...' : 'Guardar'}
            </button>
            {webhookMsg && (
              <span className={`text-xs ${webhookMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                {webhookMsg}
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* Auth */}
      <Section title="Autenticación">
        <div className="space-y-4">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${authEnabled ? 'bg-green-500/10 border border-green-500/30 text-green-400' : 'bg-[#1e3a5f]/30 border border-[#1e3a5f] text-[#64748b]'}`}>
            <span className={`w-2 h-2 rounded-full ${authEnabled ? 'bg-green-400' : 'bg-[#64748b]'}`} />
            {authEnabled
              ? 'Autenticación habilitada (AUTH_ENABLED=true en el servidor).'
              : 'Autenticación deshabilitada. Para activarla, configurá AUTH_ENABLED=true en el servidor.'}
          </div>

          {authEnabled && (
            <>
              <div className="text-xs text-[#64748b]">
                Para cambiar las credenciales, editá las variables de entorno <span className="text-accent font-mono">ADMIN_USER</span> y <span className="text-accent font-mono">ADMIN_PASS</span> en el servidor y reiniciá el backend.
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[#64748b] mb-1">Probar credenciales</label>
                  <div className="flex gap-2">
                    <input
                      value={authUsername}
                      onChange={e => setAuthUsername(e.target.value)}
                      placeholder="Usuario"
                      className="flex-1 bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-[#3d5270]"
                    />
                    <input
                      type="password"
                      value={authPassword}
                      onChange={e => setAuthPassword(e.target.value)}
                      placeholder="Contraseña"
                      className="flex-1 bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-[#3d5270]"
                    />
                    <button
                      onClick={testLogin}
                      disabled={authSaving}
                      className="px-4 py-2 border border-accent/40 text-accent text-sm rounded-lg hover:bg-accent/10 transition-colors disabled:opacity-50"
                    >
                      {authSaving ? '...' : 'Probar'}
                    </button>
                  </div>
                  {authMsg && (
                    <div className={`mt-1 text-xs ${authMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                      {authMsg}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </Section>

      {/* SLA Configuration */}
      <Section title="Configuración de SLA">
        <div className="space-y-4">
          <p className="text-xs text-[#64748b]">
            Define cuántas horas tiene el equipo para remediar cada tipo de vulnerabilidad desde que es descubierta. El kanban mostrará un countdown de tiempo restante.
          </p>
          <div className="space-y-3">
            {Object.entries(SLA_LABELS).map(([severity, { label, color }]) => (
              <div key={severity} className="flex items-center gap-4">
                <div className="w-24 flex-shrink-0">
                  <span
                    className="text-xs font-bold px-2 py-1 rounded border"
                    style={{ color, background: `${color}18`, borderColor: `${color}40` }}
                  >
                    {label}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="number"
                    min={1}
                    value={slaValues[severity] ?? ''}
                    onChange={e => setSlaValues(v => ({ ...v, [severity]: parseInt(e.target.value) || 1 }))}
                    className="w-24 bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent"
                  />
                  <span className="text-xs text-[#64748b]">
                    horas
                    {slaValues[severity] >= 24
                      ? ` (${(slaValues[severity] / 24).toFixed(1)} días)`
                      : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={saveSla}
              disabled={slaSaving}
              className="px-4 py-2 bg-accent text-[#0a0f1e] font-bold text-sm rounded-lg hover:bg-cyan-300 transition-colors disabled:opacity-50"
            >
              {slaSaving ? 'Guardando...' : 'Guardar SLAs'}
            </button>
            {slaMsg && (
              <span className={`text-xs ${slaMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                {slaMsg}
              </span>
            )}
          </div>
        </div>
      </Section>

      <Section title="Acerca de">
        <Field label="Versión" description="HexStrike AI Pentest Platform">
          <span className="text-xs border border-accent/40 text-accent/70 px-2 py-1 rounded font-mono">v2.0</span>
        </Field>
      </Section>
    </div>
  )
}
