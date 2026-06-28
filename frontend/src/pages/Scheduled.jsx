import { useEffect, useState } from 'react'
import { api } from '../api'
import { useFmtDate } from '../context/SettingsContext'

const CRON_PRESETS = [
  { label: 'Cada hora',           value: '0 * * * *'   },
  { label: 'Diario a las 9am',    value: '0 9 * * *'   },
  { label: 'Semanal (lun. 9am)',  value: '0 9 * * 1'   },
  { label: 'Mensual (día 1, 9am)',value: '0 9 1 * *'   },
  { label: 'Personalizado',       value: '__custom__'   },
]

const PROFILE_ICONS = { web: '🌐', network: '🔌', full: '⚡' }
const PROFILE_LABELS = { web: 'Web', network: 'Network', full: 'Full' }

function CronDisplay({ expr }) {
  const preset = CRON_PRESETS.find(p => p.value === expr)
  return (
    <span className="font-mono text-xs text-[#94a3b8]">
      {preset && preset.value !== '__custom__' ? preset.label : expr}
    </span>
  )
}

const EMPTY_FORM = {
  target_id: '',
  environment_id: '',
  profile: 'web',
  cron_preset: '0 9 * * 1',
  cron_custom: '',
  label: '',
}

function schedToForm(s) {
  const preset = CRON_PRESETS.find(p => p.value === s.cron_expr && p.value !== '__custom__')
  return {
    target_id: String(s.target_id),
    environment_id: s.environment_id ? String(s.environment_id) : '',
    profile: s.profile,
    cron_preset: preset ? preset.value : '__custom__',
    cron_custom: preset ? '' : s.cron_expr,
    label: s.label || '',
  }
}

export default function Scheduled() {
  const [scheduled, setScheduled] = useState([])
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingSched, setEditingSched] = useState(null) // sched object being edited
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [s, t] = await Promise.all([api.scheduled.list(), api.targets.list()])
      setScheduled(s)
      setTargets(t)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Always poll: every 5s when something is running, every 20s otherwise
  useEffect(() => {
    const anyRunning = scheduled.some(s => s.is_running)
    const interval = setInterval(load, anyRunning ? 5000 : 20000)
    return () => clearInterval(interval)
  }, [scheduled])

  const selectedTarget = targets.find(t => String(t.id) === String(form.target_id))
  const targetEnvs = selectedTarget?.environments ?? []

  const effectiveCron = form.cron_preset === '__custom__' ? form.cron_custom : form.cron_preset

  const openCreate = () => {
    setEditingSched(null)
    setForm(EMPTY_FORM)
    setError('')
    setShowForm(true)
  }

  const openEdit = (s) => {
    setEditingSched(s)
    setForm(schedToForm(s))
    setError('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingSched(null)
    setForm(EMPTY_FORM)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.target_id) return setError('Seleccioná un target.')
    if (!effectiveCron.trim()) return setError('Ingresá una expresión cron.')
    setError('')
    setSaving(true)
    try {
      if (editingSched) {
        await api.scheduled.update(editingSched.id, {
          target_id: Number(form.target_id),
          ...(form.environment_id ? { environment_id: Number(form.environment_id) } : { environment_id: null }),
          profile: form.profile,
          cron_expr: effectiveCron.trim(),
          label: form.label.trim() || null,
        })
      } else {
        await api.scheduled.create({
          target_id: Number(form.target_id),
          ...(form.environment_id ? { environment_id: Number(form.environment_id) } : {}),
          profile: form.profile,
          cron_expr: effectiveCron.trim(),
          label: form.label.trim() || null,
        })
      }
      closeForm()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este scan programado?')) return
    setDeletingId(id)
    try {
      await api.scheduled.delete(id)
      setScheduled(s => s.filter(x => x.id !== id))
    } catch (e) {
      alert(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggle = async (sched) => {
    setTogglingId(sched.id)
    try {
      const updated = await api.scheduled.update(sched.id, { active: !sched.active })
      setScheduled(s => s.map(x => x.id === sched.id ? updated : x))
    } catch (e) {
      alert(e.message)
    } finally {
      setTogglingId(null)
    }
  }

  const fmtDate = useFmtDate()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Scans Programados</h1>
          <p className="text-sm text-[#64748b] mt-0.5">Ejecuta scans automáticamente según un calendario</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-[#0a0f1e] font-bold text-sm rounded-lg hover:bg-cyan-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Programado
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">
            {editingSched ? 'Editar Scan Programado' : 'Nuevo Scan Programado'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Target */}
              <div>
                <label className="block text-xs text-[#64748b] mb-1">Target <span className="text-red-400">*</span></label>
                <select
                  value={form.target_id}
                  onChange={e => setForm(f => ({ ...f, target_id: e.target.value, environment_id: '' }))}
                  className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="" style={{ background: '#0d1525' }}>Seleccioná un target</option>
                  {targets.map(t => (
                    <option key={t.id} value={t.id} style={{ background: '#0d1525' }}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Environment */}
              <div>
                <label className="block text-xs text-[#64748b] mb-1">Entorno</label>
                <select
                  value={form.environment_id}
                  onChange={e => setForm(f => ({ ...f, environment_id: e.target.value }))}
                  disabled={targetEnvs.length === 0}
                  className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent cursor-pointer disabled:opacity-40"
                >
                  <option value="" style={{ background: '#0d1525' }}>URL/IP base</option>
                  {targetEnvs.map(e => (
                    <option key={e.id} value={e.id} style={{ background: '#0d1525' }}>{e.name} ({e.env_type})</option>
                  ))}
                </select>
              </div>

              {/* Profile */}
              <div>
                <label className="block text-xs text-[#64748b] mb-1">Perfil</label>
                <select
                  value={form.profile}
                  onChange={e => setForm(f => ({ ...f, profile: e.target.value }))}
                  className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent cursor-pointer"
                >
                  {['web', 'network', 'full'].map(p => (
                    <option key={p} value={p} style={{ background: '#0d1525' }}>{PROFILE_ICONS[p]} {PROFILE_LABELS[p]}</option>
                  ))}
                </select>
              </div>

              {/* Label */}
              <div>
                <label className="block text-xs text-[#64748b] mb-1">Etiqueta (opcional)</label>
                <input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="Scan semanal de producción"
                  className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-[#3d5270]"
                />
              </div>
            </div>

            {/* Cron */}
            <div>
              <label className="block text-xs text-[#64748b] mb-1">Frecuencia</label>
              <div className="flex flex-wrap gap-2">
                {CRON_PRESETS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, cron_preset: p.value }))}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      form.cron_preset === p.value
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-[#1e3a5f] bg-[#0d1525] text-[#64748b] hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {form.cron_preset === '__custom__' && (
                <input
                  value={form.cron_custom}
                  onChange={e => setForm(f => ({ ...f, cron_custom: e.target.value }))}
                  placeholder="0 9 * * 1  (min hora día mes díasemana)"
                  className="mt-2 w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm font-mono rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-[#3d5270]"
                />
              )}
              {effectiveCron && form.cron_preset !== '__custom__' && (
                <div className="mt-1 text-xs text-[#64748b] font-mono">{effectiveCron}</div>
              )}
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-accent text-[#0a0f1e] font-bold text-sm rounded-lg hover:bg-cyan-300 transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : editingSched ? 'Guardar cambios' : 'Crear scan programado'}
              </button>
              <button type="button" onClick={closeForm} className="px-4 py-2 border border-[#1e3a5f] text-[#64748b] text-sm rounded-lg hover:text-white transition-colors">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-[#64748b] text-sm">Cargando...</div>
      ) : scheduled.length === 0 ? (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl py-20 text-center">
          <div className="text-3xl mb-3">🕐</div>
          <div className="text-sm text-[#64748b]">No hay scans programados.</div>
          <button onClick={openCreate} className="mt-3 text-accent text-sm hover:underline">
            Crear primer scan programado →
          </button>
        </div>
      ) : (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl overflow-hidden">
          {scheduled.map((s, i) => (
            <div
              key={s.id}
              className={`flex items-center gap-3 px-5 py-4 ${i < scheduled.length - 1 ? 'border-b border-[#1e3a5f]' : ''}`}
            >
              {/* Running indicator / Profile icon */}
              <div className="flex-shrink-0 text-xl relative">
                {s.is_running ? (
                  <span className="flex items-center justify-center w-8 h-8">
                    <span className="animate-spin inline-block w-5 h-5 border-2 border-accent border-t-transparent rounded-full" />
                  </span>
                ) : (
                  PROFILE_ICONS[s.profile]
                )}
              </div>

              {/* Info */}
              <div className={`flex-1 min-w-0 ${!s.active ? 'opacity-50' : ''}`}>
                <div className="font-semibold text-white truncate flex items-center gap-2">
                  {s.label || s.target?.name || `Scheduled #${s.id}`}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    s.is_running
                      ? 'bg-accent/15 text-accent animate-pulse'
                      : s.active
                        ? 'bg-green-500/15 text-green-400'
                        : 'bg-[#1e3a5f] text-[#64748b]'
                  }`}>
                    {s.is_running ? 'EN CURSO' : s.active ? 'ACTIVO' : 'PAUSADO'}
                  </span>
                </div>
                <div className="text-xs text-[#64748b] mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="text-accent/80">{s.target?.name}</span>
                  {s.environment && <><span>·</span><span>{s.environment.name}</span></>}
                  <span>·</span>
                  <CronDisplay expr={s.cron_expr} />
                </div>
                <div className="text-xs text-[#3d5270] mt-0.5">
                  Último: {fmtDate(s.last_run_at)} &nbsp;·&nbsp; Próximo: {fmtDate(s.next_run_at)}
                </div>
              </div>

              {/* Edit */}
              <button
                onClick={() => openEdit(s)}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
              >
                Editar
              </button>

              {/* Pause / Activate toggle */}
              <button
                onClick={() => handleToggle(s)}
                disabled={togglingId === s.id}
                className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors disabled:opacity-50 ${
                  s.active
                    ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                    : 'border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/20'
                }`}
              >
                {togglingId === s.id ? '...' : s.active ? 'Pausar' : 'Activar'}
              </button>

              {/* Delete */}
              <button
                onClick={() => handleDelete(s.id)}
                disabled={deletingId === s.id}
                className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {deletingId === s.id ? '...' : 'Eliminar'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
