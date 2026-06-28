import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

function IconTarget() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <circle cx="12" cy="12" r="9" strokeWidth={1.8} />
      <circle cx="12" cy="12" r="5" strokeWidth={1.8} />
      <circle cx="12" cy="12" r="1" strokeWidth={1.8} />
      <line x1="12" y1="3" x2="12" y2="6" strokeWidth={1.8} strokeLinecap="round" />
      <line x1="12" y1="18" x2="12" y2="21" strokeWidth={1.8} strokeLinecap="round" />
      <line x1="3" y1="12" x2="6" y2="12" strokeWidth={1.8} strokeLinecap="round" />
      <line x1="18" y1="12" x2="21" y2="12" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  )
}

const ENV_TYPES = ['production', 'staging', 'dev', 'test']
const ENV_COLORS = {
  production: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
  staging:    { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' },
  dev:        { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)'  },
  test:       { color: '#00d4ff', bg: 'rgba(0,212,255,0.12)', border: 'rgba(0,212,255,0.3)'  },
}

const EMPTY_FORM = { name: '', url: '', ip: '', notes: '' }
const EMPTY_ENV  = { name: '', env_type: 'staging', url: '', ip: '', notes: '' }

function EnvBadge({ type }) {
  const c = ENV_COLORS[type] ?? ENV_COLORS.staging
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border"
      style={{ color: c.color, background: c.bg, borderColor: c.border }}>
      {type}
    </span>
  )
}

function EnvironmentPanel({ targetId, environments, onRefresh }) {
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_ENV)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setError('El nombre es requerido.')
    if (!form.url.trim() && !form.ip.trim()) return setError('Ingresá URL o IP.')
    setError('')
    setSaving(true)
    try {
      await api.targets.createEnvironment(targetId, {
        name: form.name.trim(),
        env_type: form.env_type,
        url: form.url.trim() || null,
        ip: form.ip.trim() || null,
        notes: form.notes.trim() || null,
      })
      setForm(EMPTY_ENV)
      setShowAdd(false)
      onRefresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (envId) => {
    if (!confirm('¿Eliminar este entorno?')) return
    setDeletingId(envId)
    try {
      await api.targets.deleteEnvironment(targetId, envId)
      onRefresh()
    } catch (e) {
      alert(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="mt-3 ml-12 space-y-2">
      {environments.map(env => (
        <div key={env.id} className="flex items-center gap-3 px-3 py-2 bg-[#111827] border border-[#1e3a5f] rounded-lg">
          <EnvBadge type={env.env_type} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-white">{env.name}</span>
            <span className="ml-2 text-xs text-[#64748b] truncate">{env.url || env.ip}</span>
          </div>
          <Link
            to={`/scan/new?target=${targetId}`}
            state={{ environmentId: env.id }}
            className="text-xs px-2 py-1 rounded bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-colors flex-shrink-0"
          >
            + Scan
          </Link>
          <button
            onClick={() => handleDelete(env.id)}
            disabled={deletingId === env.id}
            className="text-xs px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0 disabled:opacity-50"
          >
            {deletingId === env.id ? '...' : '×'}
          </button>
        </div>
      ))}

      {showAdd ? (
        <form onSubmit={handleAdd} className="bg-[#111827] border border-[#1e3a5f] rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[#64748b]">Nombre *</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Staging"
                className="w-full mt-0.5 bg-[#111827] border border-[#1e3a5f] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-[#64748b]">Tipo</label>
              <select
                value={form.env_type}
                onChange={e => setForm(f => ({ ...f, env_type: e.target.value }))}
                className="w-full mt-0.5 bg-[#111827] border border-[#1e3a5f] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
              >
                {ENV_TYPES.map(t => <option key={t} value={t} style={{ background: '#0d1525' }}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#64748b]">URL</label>
              <input
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://staging.example.com"
                className="w-full mt-0.5 bg-[#111827] border border-[#1e3a5f] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="text-xs text-[#64748b]">IP</label>
              <input
                value={form.ip}
                onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
                placeholder="10.0.0.5"
                className="w-full mt-0.5 bg-[#111827] border border-[#1e3a5f] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-accent"
              />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="px-3 py-1 bg-accent text-[#0a0f1e] text-xs font-bold rounded hover:bg-cyan-300 transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : 'Agregar'}
            </button>
            <button type="button" onClick={() => { setShowAdd(false); setForm(EMPTY_ENV); setError('') }} className="px-3 py-1 border border-[#1e3a5f] text-[#64748b] text-xs rounded hover:text-white transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="text-xs text-accent/60 hover:text-accent transition-colors"
        >
          + Agregar entorno
        </button>
      )}
    </div>
  )
}

function EditTargetModal({ target, onSave, onClose }) {
  const [form, setForm] = useState({
    name: target.name || '',
    url: target.url || '',
    ip: target.ip || '',
    notes: target.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setError('El nombre es obligatorio.')
    if (!form.url.trim() && !form.ip.trim()) return setError('Ingresá al menos una URL o IP.')
    setError('')
    setSaving(true)
    try {
      const updated = await api.targets.update(target.id, {
        name: form.name.trim(),
        url: form.url.trim() || null,
        ip: form.ip.trim() || null,
        notes: form.notes.trim() || null,
      })
      onSave(updated)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-[#111827] border border-[#1e3a5f] rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f]">
          <h2 className="text-sm font-semibold text-white">Editar Target</h2>
          <button onClick={onClose} className="text-[#64748b] hover:text-white transition-colors text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#64748b] mb-1">Nombre <span className="text-red-400">*</span></label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60 placeholder-[#3d5270]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1">URL</label>
              <input
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://ejemplo.com"
                className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60 placeholder-[#3d5270]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1">IP</label>
              <input
                value={form.ip}
                onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
                placeholder="192.168.1.1"
                className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60 placeholder-[#3d5270]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#64748b] mb-1">Notas</label>
              <input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Descripción opcional..."
                className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60 placeholder-[#3d5270]"
              />
            </div>
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-accent text-[#0a0f1e] font-bold text-sm rounded-lg hover:bg-cyan-300 transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#1e3a5f] text-[#64748b] text-sm rounded-lg hover:text-white transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Targets() {
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [editingTarget, setEditingTarget] = useState(null)

  const load = () =>
    api.targets.list()
      .then(setTargets)
      .catch(console.error)
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return setError('El nombre es obligatorio.')
    if (!form.url.trim() && !form.ip.trim()) return setError('Ingresá al menos una URL o IP.')
    setError('')
    setSaving(true)
    try {
      await api.targets.create({
        name: form.name.trim(),
        url:   form.url.trim()   || null,
        ip:    form.ip.trim()    || null,
        notes: form.notes.trim() || null,
      })
      setForm(EMPTY_FORM)
      setShowForm(false)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este target? También se eliminará su historial de scans.')) return
    setDeletingId(id)
    try {
      await api.targets.delete(id)
      setTargets(t => t.filter(x => x.id !== id))
    } catch (e) {
      alert(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleEditSave = (updated) => {
    setTargets(ts => ts.map(t => t.id === updated.id ? { ...t, ...updated } : t))
    setEditingTarget(null)
  }

  return (
    <div className="space-y-6">
      {/* Edit modal */}
      {editingTarget && (
        <EditTargetModal
          target={editingTarget}
          onSave={handleEditSave}
          onClose={() => setEditingTarget(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Targets</h1>
          <p className="text-sm text-[#64748b] mt-0.5">{targets.length} {targets.length === 1 ? 'objetivo registrado' : 'objetivos registrados'}</p>
        </div>
        <button
          onClick={() => { setShowForm(s => !s); setError('') }}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-[#0a0f1e] font-bold text-sm rounded-lg hover:bg-cyan-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Target
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Nuevo Target</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#64748b] mb-1">Nombre <span className="text-red-400">*</span></label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Mi servidor web"
                  className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60 placeholder-[#3d5270]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1">URL</label>
                <input
                  value={form.url}
                  onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                  placeholder="https://ejemplo.com"
                  className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60 placeholder-[#3d5270]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1">IP</label>
                <input
                  value={form.ip}
                  onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
                  placeholder="192.168.1.1"
                  className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60 placeholder-[#3d5270]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1">Notas</label>
                <input
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Descripción opcional..."
                  className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent/60 placeholder-[#3d5270]"
                />
              </div>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-accent text-[#0a0f1e] font-bold text-sm rounded-lg hover:bg-cyan-300 transition-colors disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar Target'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); setError('') }}
                className="px-4 py-2 border border-[#1e3a5f] text-[#64748b] text-sm rounded-lg hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Targets list */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-[#64748b] text-sm">Cargando...</div>
      ) : targets.length === 0 ? (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl py-20 text-center">
          <div className="flex justify-center mb-3 text-[#1e3a5f]">
            <IconTarget />
          </div>
          <div className="text-sm text-[#64748b]">No hay targets registrados.</div>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-accent text-sm hover:underline"
          >
            Crear primer target →
          </button>
        </div>
      ) : (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl overflow-hidden">
          {targets.map((t, i) => (
            <div key={t.id}>
              <div
                className={`flex items-center gap-4 px-5 py-4 ${i < targets.length - 1 ? 'border-b border-[#1e3a5f]' : ''}`}
              >
                {/* Icon */}
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
                  <IconTarget />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white truncate">{t.name}</div>
                  <div className="text-xs text-[#64748b] truncate">
                    {t.url || t.ip || '—'}
                    {t.notes && <span> &middot; {t.notes}</span>}
                  </div>
                </div>

                {/* Env count */}
                {t.environments?.length > 0 && (
                  <button
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    className="flex-shrink-0 text-xs text-accent/70 hover:text-accent border border-accent/20 rounded px-2 py-0.5 transition-colors"
                  >
                    {t.environments.length} entorno{t.environments.length > 1 ? 's' : ''} {expandedId === t.id ? '▲' : '▼'}
                  </button>
                )}

                {/* Date */}
                <div className="hidden md:block text-xs text-[#64748b] flex-shrink-0">
                  {new Date(t.created_at).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0d1525] border border-[#1e3a5f] text-[#64748b] hover:text-white transition-colors"
                    title="Gestionar entornos"
                  >
                    Entornos
                  </button>
                  <button
                    onClick={() => setEditingTarget(t)}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0d1525] border border-[#1e3a5f] text-[#64748b] hover:text-white transition-colors"
                    title="Editar target"
                  >
                    Editar
                  </button>
                  <Link
                    to={`/scan/new?target=${t.id}`}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-colors"
                  >
                    + Scan
                  </Link>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deletingId === t.id}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    {deletingId === t.id ? '...' : 'Eliminar'}
                  </button>
                </div>
              </div>

              {/* Environment panel */}
              {expandedId === t.id && (
                <div className="px-5 pb-4 border-b border-[#1e3a5f] bg-[#0d1525] keep-dark">
                  <EnvironmentPanel
                    targetId={t.id}
                    environments={t.environments ?? []}
                    onRefresh={load}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
