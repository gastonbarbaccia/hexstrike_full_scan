import { useEffect, useState } from 'react'
import { api } from '../api'

const ROLES = [
  { value: 'administrator', label: 'Administrador', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
  { value: 'analista',      label: 'Analista', color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' },
  { value: 'viewer',        label: 'Viewer', color: '#64748b', bg: 'rgba(100,116,139,0.12)', border: 'rgba(100,116,139,0.3)' },
]

function RoleBadge({ role }) {
  const r = ROLES.find(x => x.value === role) ?? ROLES[2]
  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border"
      style={{ color: r.color, background: r.bg, borderColor: r.border }}
    >
      {r.label}
    </span>
  )
}

const EMPTY_FORM = { username: '', email: '', password: '', role: 'viewer' }

function UserModal({ user, onSave, onClose }) {
  const isEdit = !!user
  const [form, setForm] = useState(
    isEdit
      ? { username: user.username, email: user.email || '', password: '', role: user.role }
      : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isEdit && !form.username.trim()) return setError('El nombre de usuario es obligatorio.')
    if (!isEdit && !form.password.trim()) return setError('La contraseña es obligatoria al crear.')
    setError('')
    setSaving(true)
    try {
      let result
      if (isEdit) {
        const payload = { role: form.role, email: form.email.trim() || null }
        if (form.password.trim()) payload.password = form.password.trim()
        result = await api.users.update(user.id, payload)
      } else {
        result = await api.users.create({
          username: form.username.trim(),
          email: form.email.trim() || null,
          password: form.password,
          role: form.role,
        })
      }
      onSave(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-[#111827] border border-[#1e3a5f] rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f]">
          <h2 className="text-sm font-semibold text-white">{isEdit ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button onClick={onClose} className="text-[#64748b] hover:text-white transition-colors text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-xs text-[#64748b] mb-1">Usuario <span className="text-red-400">*</span></label>
              <input
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="juan.perez"
                autoComplete="off"
                className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-[#3d5270]"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-[#64748b] mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="juan@empresa.com"
              className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-[#3d5270]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1">
              Contraseña {isEdit && <span className="text-[#3d5270]">(dejar vacío para no cambiar)</span>}
              {!isEdit && <span className="text-red-400"> *</span>}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder={isEdit ? '••••••••' : 'Mínimo 8 caracteres'}
              autoComplete="new-password"
              className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-[#3d5270]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#64748b] mb-1">Rol</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full bg-[#0d1525] border border-[#1e3a5f] text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent cursor-pointer"
            >
              {ROLES.map(r => (
                <option key={r.value} value={r.value} style={{ background: '#0d1525' }}>{r.label}</option>
              ))}
            </select>
            <div className="mt-1.5 text-[10px] text-[#3d5270] space-y-0.5">
              <div><span className="text-[#ef4444]">Administrador</span>: gestión total, usuarios, SLA, scans</div>
              <div><span className="text-[#f97316]">Analista</span>: crear scans, gestionar vulnerabilidades, asignar tickets</div>
              <div><span className="text-[#64748b]">Viewer</span>: solo lectura</div>
            </div>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-accent text-[#0a0f1e] font-bold text-sm rounded-lg hover:bg-cyan-300 transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
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

export default function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [togglingId, setTogglingId] = useState(null)

  const load = () =>
    api.users.list()
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const handleSave = () => {
    load()
    setShowModal(false)
    setEditingUser(null)
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return
    setDeletingId(id)
    try {
      await api.users.delete(id)
      setUsers(prev => prev.filter(u => u.id !== id))
    } catch (e) {
      alert(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleActive = async (user) => {
    setTogglingId(user.id)
    try {
      const updated = await api.users.update(user.id, { is_active: !user.is_active })
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u))
    } catch (e) {
      alert(e.message)
    } finally {
      setTogglingId(null)
    }
  }

  const fmtDate = (d) => new Date(d).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })

  if (error === 'Solo administradores pueden gestionar usuarios' || error.includes('403')) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-3xl mb-3">🔒</div>
        <div className="text-white font-semibold">Acceso restringido</div>
        <div className="text-sm text-[#64748b] mt-1">Solo los administradores pueden gestionar usuarios.</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Modal */}
      {(showModal || editingUser) && (
        <UserModal
          user={editingUser}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingUser(null) }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Usuarios</h1>
          <p className="text-sm text-[#64748b] mt-0.5">{users.length} {users.length === 1 ? 'usuario registrado' : 'usuarios registrados'}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-[#0a0f1e] font-bold text-sm rounded-lg hover:bg-cyan-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo usuario
        </button>
      </div>

      {/* Role legend */}
      <div className="flex gap-4 flex-wrap">
        {ROLES.map(r => (
          <div key={r.value} className="flex items-center gap-1.5">
            <RoleBadge role={r.value} />
            <span className="text-xs text-[#64748b]">{users.filter(u => u.role === r.value).length}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-[#64748b] text-sm">Cargando...</div>
      ) : users.length === 0 ? (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl py-20 text-center">
          <div className="text-3xl mb-3">👥</div>
          <div className="text-sm text-[#64748b]">No hay usuarios registrados.</div>
          <button
            onClick={() => setShowModal(true)}
            className="mt-3 text-accent text-sm hover:underline"
          >
            Crear primer usuario →
          </button>
        </div>
      ) : (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl overflow-hidden">
          {/* Header row */}
          <div className="grid grid-cols-[2fr_2fr_200px_100px_140px] gap-4 px-5 py-3 border-b border-[#1e3a5f] text-xs font-semibold text-[#64748b] uppercase tracking-wider">
            <span>Usuario</span>
            <span>Email</span>
            <span>Rol</span>
            <span>Estado</span>
            <span>Acciones</span>
          </div>

          {users.map((u, i) => (
            <div
              key={u.id}
              className={`grid grid-cols-[2fr_2fr_200px_100px_140px] gap-4 items-center px-5 py-4 ${i < users.length - 1 ? 'border-b border-[#1e3a5f]' : ''}`}
            >
              <div>
                <div className="font-semibold text-white text-sm">{u.username}</div>
                <div className="text-[11px] text-[#3d5270]">Creado {fmtDate(u.created_at)}</div>
              </div>
              <div className="text-sm text-[#64748b] truncate">{u.email || '—'}</div>
              <div><RoleBadge role={u.role} /></div>
              <div>
                <button
                  onClick={() => handleToggleActive(u)}
                  disabled={togglingId === u.id}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-colors disabled:opacity-50 ${
                    u.is_active
                      ? 'text-green-400 bg-green-400/10 border-green-400/30 hover:bg-red-400/10 hover:text-red-400 hover:border-red-400/30'
                      : 'text-[#64748b] bg-[#1e3a5f]/20 border-[#1e3a5f] hover:bg-green-400/10 hover:text-green-400 hover:border-green-400/30'
                  }`}
                  title={u.is_active ? 'Click para desactivar' : 'Click para activar'}
                >
                  {togglingId === u.id ? '...' : u.is_active ? 'Activo' : 'Inactivo'}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingUser(u)}
                  className="text-xs px-2 py-1 rounded bg-[#0d1525] border border-[#1e3a5f] text-[#64748b] hover:text-white transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(u.id)}
                  disabled={deletingId === u.id}
                  className="text-xs px-2 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  {deletingId === u.id ? '...' : 'Eliminar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="bg-[#0d1525] border border-[#1e3a5f] rounded-xl p-4 text-xs text-[#64748b] space-y-1">
        <div className="font-semibold text-white mb-2">Permisos por rol</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ROLES.map(r => (
            <div key={r.value} className="space-y-1">
              <RoleBadge role={r.value} />
              <div className="mt-1 space-y-0.5">
                {r.value === 'administrator' && (
                  <>
                    <div>✓ Gestión de usuarios</div>
                    <div>✓ Configurar SLAs</div>
                    <div>✓ Crear y cancelar scans</div>
                    <div>✓ Gestionar vulnerabilidades</div>
                    <div>✓ Asignar tickets</div>
                    <div>✓ Ver todos los reportes</div>
                  </>
                )}
                {r.value === 'analista' && (
                  <>
                    <div>✗ Gestión de usuarios</div>
                    <div>✓ Configurar SLAs</div>
                    <div>✓ Crear y cancelar scans</div>
                    <div>✓ Gestionar vulnerabilidades</div>
                    <div>✓ Asignar tickets</div>
                    <div>✓ Ver todos los reportes</div>
                  </>
                )}
                {r.value === 'viewer' && (
                  <>
                    <div>✗ Gestión de usuarios</div>
                    <div>✗ Configurar SLAs</div>
                    <div>✗ Crear scans</div>
                    <div>✗ Modificar vulnerabilidades</div>
                    <div>✓ Ver scans y reportes</div>
                    <div>✓ Ver kanban</div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
