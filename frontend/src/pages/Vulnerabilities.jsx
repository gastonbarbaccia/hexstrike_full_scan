import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { api } from '../api'

const SEVERITY_CONFIG = {
  CRITICAL: { label: 'Crítico',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.4)',  order: 0 },
  HIGH:     { label: 'Alto',     color: '#f97316', bg: 'rgba(249,115,22,0.12)',  border: 'rgba(249,115,22,0.4)', order: 1 },
  MEDIUM:   { label: 'Medio',    color: '#eab308', bg: 'rgba(234,179,8,0.12)',   border: 'rgba(234,179,8,0.4)',  order: 2 },
  LOW:      { label: 'Bajo',     color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.4)',  order: 3 },
  INFO:     { label: 'Info',     color: '#00d4ff', bg: 'rgba(0,212,255,0.12)',   border: 'rgba(0,212,255,0.4)',  order: 4 },
}

const STATUS_COLUMNS = [
  { key: 'pending',         label: 'Pendiente',      color: '#64748b', icon: '⏳' },
  { key: 'in_progress',    label: 'En Progreso',    color: '#3b82f6', icon: '🔧' },
  { key: 'remediated',     label: 'Remediado',      color: '#22c55e', icon: '✅' },
  { key: 'false_positive', label: 'Falso Positivo', color: '#a855f7', icon: '🚫' },
  { key: 'accepted',       label: 'Aceptado',       color: '#f97316', icon: '📋' },
]

const STATUS_MAP = Object.fromEntries(STATUS_COLUMNS.map(c => [c.key, c]))

const ACTIVITY_LABELS = {
  status_change: (d) => {
    const from = STATUS_MAP[d?.from]?.label ?? d?.from ?? '?'
    const to   = STATUS_MAP[d?.to]?.label   ?? d?.to   ?? '?'
    return `cambió el estado de "${from}" a "${to}"`
  },
  comment_added:   () => 'añadió un comentario',
  comment_edited:  () => 'editó un comentario',
  comment_deleted: () => 'eliminó un comentario',
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return d.toLocaleString('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Multi-select checkbox dropdown ─────────────────────────────────────────

function CheckboxDropdown({ label, options, selected, onChange, colorFn }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeCount = selected.length
  const toggle = (val) => onChange(selected.includes(val) ? selected.filter(x => x !== val) : [...selected, val])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          activeCount > 0
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-[#1e3a5f] bg-[#111827] text-[#64748b] hover:text-white hover:border-[#3d5270]'
        }`}
      >
        <span>{label}</span>
        {activeCount > 0 && (
          <span className="bg-accent text-[#0a0f1e] text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">{activeCount}</span>
        )}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 min-w-[180px] bg-[#0d1525] border border-[#1e3a5f] rounded-xl shadow-2xl z-30 overflow-hidden">
          <div className="px-3 py-2 border-b border-[#1e3a5f] flex items-center justify-between">
            <span className="text-[10px] text-[#64748b] uppercase tracking-wider font-semibold">{label}</span>
            {activeCount > 0 && (
              <button onClick={() => onChange([])} className="text-[10px] text-red-400 hover:text-red-300 transition-colors">Limpiar</button>
            )}
          </div>
          <div className="py-1 max-h-56 overflow-y-auto">
            {options.map(opt => {
              const isChecked = selected.includes(opt.value)
              const color = colorFn ? colorFn(opt.value) : null
              return (
                <label key={opt.value} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#1e3a5f]/40 transition-colors" onClick={() => toggle(opt.value)}>
                  <span className={`w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${isChecked ? 'border-accent bg-accent' : 'border-[#3d5270] bg-transparent'}`}>
                    {isChecked && (
                      <svg className="w-2.5 h-2.5 text-[#0a0f1e]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-xs flex items-center gap-2 flex-1">
                    {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />}
                    <span style={{ color: isChecked && color ? color : undefined }} className={isChecked ? 'font-medium text-white' : 'text-[#94a3b8]'}>{opt.label}</span>
                    {opt.count !== undefined && <span className="ml-auto text-[10px] text-[#3d5270]">{opt.count}</span>}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────

function SLABadge({ slaHours, slaDeadline, remediationStatus }) {
  if (!slaHours || remediationStatus === 'remediated' || remediationStatus === 'false_positive') return null
  const deadline = slaDeadline ? new Date(slaDeadline) : null
  if (!deadline) return null
  const diffMs = deadline - Date.now()
  const isExpired = diffMs <= 0
  const fmt = (ms) => { const h = Math.floor(Math.abs(ms) / 3600000); return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d ${h % 24}h` }
  return (
    <span className={`text-xs font-semibold px-2 py-1 rounded border ${
      isExpired ? 'text-red-400 bg-red-500/10 border-red-500/30'
      : diffMs < 86400000 ? 'text-orange-400 bg-orange-500/10 border-orange-500/30'
      : 'text-[#64748b] bg-[#1e3a5f]/30 border-[#1e3a5f]'
    }`}>
      {isExpired ? `⚠ SLA +${fmt(diffMs)}` : `⏱ ${fmt(diffMs)}`}
    </span>
  )
}

function SeverityBadge({ severity }) {
  const cfg = SEVERITY_CONFIG[severity] ?? SEVERITY_CONFIG.INFO
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}>
      {cfg.label}
    </span>
  )
}

// ── Assign dropdown ────────────────────────────────────────────────────────

function AssignDropdown({ vuln, users, onAssign, saving }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const current = users.find(u => u.id === vuln.assigned_to_id) ?? null
  const select = (userId) => { setOpen(false); onAssign(userId) }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[#1e3a5f] bg-[#0d1525] hover:border-[#3d5270] transition-colors disabled:opacity-50 text-xs"
      >
        <div className="flex items-center gap-2 min-w-0">
          {current ? (
            <>
              <span className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[9px] font-bold text-accent flex-shrink-0">{current.username?.[0]?.toUpperCase()}</span>
              <span className="text-white truncate">{current.username}</span>
            </>
          ) : (
            <span className="text-[#3d5270] italic">Sin asignar</span>
          )}
        </div>
        <svg className={`w-3.5 h-3.5 text-[#3d5270] flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#0d1525] border border-[#1e3a5f] rounded-xl shadow-2xl z-30 overflow-hidden">
          <div className="py-1 max-h-48 overflow-y-auto">
            <button onClick={() => select(null)} className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[#1e3a5f]/40 ${!vuln.assigned_to_id ? 'text-accent font-semibold' : 'text-[#64748b]'}`}>
              <span className="w-5 h-5 rounded-full border border-[#3d5270] flex items-center justify-center flex-shrink-0 text-[9px] text-[#3d5270]">—</span>
              Sin asignar
              {!vuln.assigned_to_id && <svg className="w-3 h-3 ml-auto text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </button>
            {users.map(u => (
              <button key={u.id} onClick={() => select(u.id)} className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[#1e3a5f]/40 ${vuln.assigned_to_id === u.id ? 'text-accent font-semibold' : 'text-[#94a3b8]'}`}>
                <span className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[9px] font-bold text-accent flex-shrink-0">{u.username?.[0]?.toUpperCase()}</span>
                <span className="truncate">{u.username}</span>
                {vuln.assigned_to_id === u.id && <svg className="w-3 h-3 ml-auto text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Rich Text Editor ───────────────────────────────────────────────────────

function RichEditor({ onContentChange, placeholder = 'Escribe un comentario...', initialHtml = '', resetKey = 0 }) {
  const editorRef = useRef(null)
  const prevReset = useRef(resetKey)

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initialHtml
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (resetKey !== prevReset.current && editorRef.current) {
      editorRef.current.innerHTML = ''
      prevReset.current = resetKey
      onContentChange('')
    }
  }, [resetKey, onContentChange])

  const exec = (cmd, val = null) => {
    document.execCommand(cmd, false, val)
    editorRef.current?.focus()
    onContentChange(editorRef.current?.innerHTML ?? '')
  }

  const insertLink = () => {
    const url = window.prompt('URL del enlace:')
    if (url) exec('createLink', url)
  }

  const TBtn = ({ onClick, title, children, active }) => (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick() }}
      title={title}
      className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition-colors ${
        active ? 'bg-accent/20 text-accent' : 'text-[#64748b] hover:text-white hover:bg-[#1e3a5f]/60'
      }`}
    >
      {children}
    </button>
  )

  return (
    <div className="border border-[#1e3a5f] rounded-lg overflow-hidden focus-within:border-[#3d5270] transition-colors">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[#1e3a5f] bg-[#111827]">
        <TBtn onClick={() => exec('bold')} title="Negrita"><b>B</b></TBtn>
        <TBtn onClick={() => exec('italic')} title="Cursiva"><i>I</i></TBtn>
        <TBtn onClick={() => exec('underline')} title="Subrayado"><u>U</u></TBtn>
        <div className="w-px h-4 bg-[#1e3a5f] mx-1" />
        <TBtn onClick={() => exec('insertUnorderedList')} title="Lista sin orden">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
        </TBtn>
        <TBtn onClick={() => exec('insertOrderedList')} title="Lista ordenada">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h10M7 16h10M3 8h.01M3 12h.01M3 16h.01" />
          </svg>
        </TBtn>
        <div className="w-px h-4 bg-[#1e3a5f] mx-1" />
        <TBtn onClick={insertLink} title="Insertar enlace">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </TBtn>
      </div>
      {/* Editable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => onContentChange(editorRef.current?.innerHTML ?? '')}
        className="min-h-[90px] max-h-[200px] overflow-y-auto p-3 text-xs text-[#94a3b8] outline-none rich-editor bg-[#0d1525]"
        style={{ wordBreak: 'break-word', lineHeight: '1.6' }}
      />
    </div>
  )
}

// ── Details Tab ────────────────────────────────────────────────────────────

function DetailsTab({ vuln, users, onMove, onAssign }) {
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingAssign, setSavingAssign] = useState(false)

  const changeStatus = async (newStatus) => {
    if (newStatus === (vuln.remediation_status || 'pending')) return
    setSavingStatus(true)
    try {
      await api.vulnerabilities.update(vuln.id, { remediation_status: newStatus })
      onMove(vuln.id, newStatus)
    } catch (e) {
      alert(e.message)
    } finally {
      setSavingStatus(false)
    }
  }

  const assign = async (userId) => {
    setSavingAssign(true)
    try {
      await api.vulnerabilities.update(vuln.id, { assigned_to_id: userId ?? 0 })
      const user = userId ? users.find(u => u.id === userId) ?? null : null
      onAssign(vuln.id, userId, user)
    } catch (e) {
      alert(e.message)
    } finally {
      setSavingAssign(false)
    }
  }

  const currentStatus = vuln.remediation_status || 'pending'
  const col = STATUS_MAP[currentStatus]

  return (
    <div className="absolute inset-0 overflow-y-auto px-5 py-4 space-y-5">
      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        {vuln.tool && (
          <div>
            <div className="text-[#3d5270] uppercase tracking-wider text-[9px] mb-1">Herramienta</div>
            <div className="text-[#94a3b8] font-mono">{vuln.tool}</div>
          </div>
        )}
        {vuln.phase && (
          <div>
            <div className="text-[#3d5270] uppercase tracking-wider text-[9px] mb-1">Fase</div>
            <div className="text-[#94a3b8]">{vuln.phase}</div>
          </div>
        )}
        {vuln.cve && (
          <div>
            <div className="text-[#3d5270] uppercase tracking-wider text-[9px] mb-1">CVE</div>
            <div className="text-orange-400 font-mono">{vuln.cve}</div>
          </div>
        )}
        {vuln.cvss !== null && vuln.cvss !== undefined && (
          <div>
            <div className="text-[#3d5270] uppercase tracking-wider text-[9px] mb-1">CVSS</div>
            <div className="text-white font-semibold">{vuln.cvss}</div>
          </div>
        )}
        <div>
          <div className="text-[#3d5270] uppercase tracking-wider text-[9px] mb-1">Descubierto</div>
          <div className="text-[#94a3b8]">
            {vuln.created_at ? new Date(vuln.created_at).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
          </div>
        </div>
        <div>
          <div className="text-[#3d5270] uppercase tracking-wider text-[9px] mb-1">Scan</div>
          <Link to={`/scan/${vuln.scan_id}`} className="text-accent hover:underline">#{vuln.scan_id}</Link>
        </div>
      </div>

      {/* Description */}
      {vuln.description && (
        <div>
          <div className="text-[#3d5270] uppercase tracking-wider text-[9px] mb-2">Descripción</div>
          <p className="text-xs text-[#94a3b8] leading-relaxed">{vuln.description}</p>
        </div>
      )}

      {/* Assign */}
      <div>
        <div className="text-[#3d5270] uppercase tracking-wider text-[9px] mb-2">Asignado a</div>
        <AssignDropdown vuln={vuln} users={users} onAssign={assign} saving={savingAssign} />
      </div>

      {/* Status dropdown */}
      <div>
        <div className="text-[#3d5270] uppercase tracking-wider text-[9px] mb-2">Estado</div>
        <div className="relative">
          <select
            value={currentStatus}
            onChange={(e) => changeStatus(e.target.value)}
            disabled={savingStatus}
            className="w-full px-3 py-2 pr-9 rounded-lg border text-sm font-medium appearance-none cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[#0d1525] outline-none"
            style={{ color: col?.color, borderColor: `${col?.color}40`, background: `${col?.color}10` }}
          >
            {STATUS_COLUMNS.map(c => (
              <option key={c.key} value={c.key} style={{ background: '#0d1525', color: c.color }}>
                {c.icon}  {c.label}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            {savingStatus ? (
              <svg className="w-3.5 h-3.5 animate-spin text-[#64748b]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-[#64748b]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Comments Tab ───────────────────────────────────────────────────────────

function ImageLightbox({ src, name, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between w-full px-1">
          <span className="text-xs text-[#94a3b8] truncate max-w-[80%]">{name}</span>
          <button onClick={onClose} className="text-[#64748b] hover:text-white transition-colors text-xl leading-none ml-4">×</button>
        </div>
        <img src={authImgUrl(src)} alt={name} className="max-w-full max-h-[80vh] rounded-lg object-contain shadow-2xl" />
        <a href={authImgUrl(src)} download={name} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">Descargar</a>
      </div>
    </div>,
    document.body
  )
}

function authImgUrl(url) {
  const token = localStorage.getItem('hs-token') || ''
  if (!url || !token || token === 'no-auth') return url
  return `${url}?token=${encodeURIComponent(token)}`
}

function CommentsTab({ vuln, currentUser, onCountChange }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState('')
  const [attachments, setAttachments] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [resetKey, setResetKey] = useState(0)
  const [lightbox, setLightbox] = useState(null)
  const fileInputRef = useRef(null)

  const loadComments = useCallback(async () => {
    try {
      const data = await api.vulnerabilities.listComments(vuln.id)
      setComments(data)
      onCountChange(data.length)
    } finally {
      setLoading(false)
    }
  }, [vuln.id, onCountChange])

  useEffect(() => { loadComments() }, [loadComments])

  const isContentEmpty = (html) => !html || html.replace(/<[^>]*>/g, '').trim() === ''

  const submit = async () => {
    if (isContentEmpty(content)) return
    setSubmitting(true)
    try {
      const comment = await api.vulnerabilities.createComment(vuln.id, { content, attachments })
      const updated = [...comments, comment]
      setComments(updated)
      onCountChange(updated.length)
      setContent('')
      setAttachments([])
      setResetKey(k => k + 1)
    } catch (e) {
      alert(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (comment) => {
    setEditingId(comment.id)
    setEditContent(comment.content)
  }

  const saveEdit = async (commentId) => {
    if (isContentEmpty(editContent)) return
    setEditSaving(true)
    try {
      const updated = await api.vulnerabilities.updateComment(vuln.id, commentId, { content: editContent })
      setComments(prev => prev.map(c => c.id === commentId ? updated : c))
      setEditingId(null)
    } catch (e) {
      alert(e.message)
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (commentId) => {
    if (!window.confirm('¿Eliminar este comentario?')) return
    try {
      await api.vulnerabilities.deleteComment(vuln.id, commentId)
      const updated = comments.filter(c => c.id !== commentId)
      setComments(updated)
      onCountChange(updated.length)
    } catch (e) {
      alert(e.message)
    }
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try {
      const result = await api.vulnerabilities.uploadFile(file)
      setAttachments(prev => [...prev, result])
    } catch (err) {
      alert('Error al subir archivo: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (index) => setAttachments(prev => prev.filter((_, i) => i !== index))

  const isImage = (att) => att.content_type?.startsWith('image/')

  if (loading) return <div className="absolute inset-0 flex items-center justify-center text-[#64748b] text-xs">Cargando comentarios...</div>

  return (
    <div className="absolute inset-0 flex flex-col">
      {lightbox && <ImageLightbox src={lightbox.url} name={lightbox.name} onClose={() => setLightbox(null)} />}
      {/* Comment list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-4">
        {comments.length === 0 && (
          <div className="text-center py-10 text-[#3d5270] text-xs">Sin comentarios aún. Sé el primero en comentar.</div>
        )}
        {comments.map(comment => (
          <div key={comment.id} className="bg-[#0d1525] border border-[#1e3a5f] rounded-xl p-3.5 space-y-2.5">
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[9px] font-bold text-accent flex-shrink-0">
                  {comment.username?.[0]?.toUpperCase() ?? '?'}
                </div>
                <span className="text-xs font-semibold text-white">{comment.username}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] text-[#3d5270]">{fmtDate(comment.created_at)}</span>
                {comment.is_edited && (
                  <span className="text-[9px] text-[#3d5270] italic" title={`Editado: ${fmtDate(comment.updated_at)}`}>
                    · editado {fmtDate(comment.updated_at)}
                  </span>
                )}
                {editingId !== comment.id && (
                  <>
                    <button
                      onClick={() => startEdit(comment)}
                      className="text-[#3d5270] hover:text-accent transition-colors"
                      title="Editar"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="text-[#3d5270] hover:text-red-400 transition-colors"
                      title="Eliminar"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Content or edit form */}
            {editingId === comment.id ? (
              <div className="space-y-2">
                <RichEditor initialHtml={comment.content} onContentChange={setEditContent} placeholder="Editar comentario..." />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => setEditingId(null)}
                    className="px-3 py-1.5 text-xs text-[#64748b] hover:text-white transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => saveEdit(comment.id)}
                    disabled={editSaving || isContentEmpty(editContent)}
                    className="px-3 py-1.5 text-xs bg-accent/10 text-accent border border-accent/30 rounded-lg hover:bg-accent/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {editSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="text-xs text-[#94a3b8] comment-html leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: comment.content }}
                />
                {comment.attachments?.length > 0 && (
                  <div className="pt-1 space-y-2">
                    {/* Image thumbnails */}
                    {comment.attachments.some(isImage) && (
                      <div className="flex flex-wrap gap-2">
                        {comment.attachments.filter(isImage).map((att, i) => (
                          <button
                            key={i}
                            onClick={() => setLightbox(att)}
                            className="group relative rounded-lg overflow-hidden border border-[#1e3a5f] hover:border-accent/50 transition-colors"
                            title={att.name}
                          >
                            <img src={authImgUrl(att.url)} alt={att.name} className="h-20 w-auto max-w-[160px] object-cover block" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                              </svg>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Non-image file chips */}
                    {comment.attachments.filter(a => !isImage(a)).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {comment.attachments.filter(a => !isImage(a)).map((att, i) => (
                          <a key={i} href={att.url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-1.5 px-2 py-1 bg-[#111827] border border-[#1e3a5f] rounded-lg text-[10px] text-accent hover:border-accent/40 transition-colors">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            <span className="max-w-[120px] truncate">{att.name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* New comment composer */}
      <div className="px-5 pb-8 pt-3 border-t border-[#1e3a5f] space-y-2.5 flex-shrink-0">
        <RichEditor onContentChange={setContent} placeholder="Escribe un comentario..." resetKey={resetKey} />

        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((att, i) => (
              <span key={i} className="flex items-center gap-1.5 px-2 py-1 bg-[#0d1525] border border-[#1e3a5f] rounded-lg text-[10px] text-[#94a3b8]">
                <span className="max-w-[120px] truncate">{att.name}</span>
                <button onClick={() => removeAttachment(i)} className="text-[#3d5270] hover:text-red-400 transition-colors leading-none">×</button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-[11px] text-[#64748b] hover:text-accent transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            )}
            {uploading ? 'Subiendo...' : 'Adjuntar'}
          </button>
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />

          <button
            onClick={submit}
            disabled={submitting || isContentEmpty(content)}
            className="flex items-center gap-2 px-4 py-1.5 text-xs bg-accent text-[#0a0f1e] font-semibold rounded-lg hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {submitting && <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
            {submitting ? 'Enviando...' : 'Comentar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Activity Tab ───────────────────────────────────────────────────────────

function ActivityTab({ vuln }) {
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.vulnerabilities.listActivity(vuln.id)
      .then(setActivity)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [vuln.id])

  if (loading) return <div className="absolute inset-0 flex items-center justify-center text-[#64748b] text-xs">Cargando actividad...</div>

  if (activity.length === 0) return (
    <div className="absolute inset-0 flex items-center justify-center text-[#3d5270] text-xs">Sin actividad registrada aún.</div>
  )

  return (
    <div className="absolute inset-0 overflow-y-auto px-5 py-4">
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-[#1e3a5f]" />

        <div className="space-y-0">
          {activity.map((item, idx) => {
            const label = ACTIVITY_LABELS[item.action_type]
            return (
              <div key={item.id} className={`relative flex items-start gap-3 ${idx < activity.length - 1 ? 'pb-5' : ''}`}>
                {/* Avatar dot */}
                <div className="relative z-10 w-7 h-7 rounded-full bg-[#080e1c] border border-[#1e3a5f] flex items-center justify-center flex-shrink-0">
                  <div className="w-5 h-5 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[9px] font-bold text-accent">
                    {item.username?.[0]?.toUpperCase() ?? '?'}
                  </div>
                </div>

                {/* Content */}
                <div className="pt-0.5 min-w-0">
                  <div className="text-xs leading-relaxed">
                    <span className="font-semibold text-white">{item.username}</span>
                    {' '}
                    <span className="text-[#94a3b8]">
                      {label ? label(item.details) : item.action_type}
                    </span>
                  </div>
                  <div className="text-[10px] text-[#3d5270] mt-0.5">{fmtDate(item.created_at)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Detail Panel ───────────────────────────────────────────────────────────

function DetailPanel({ vuln, users, onClose, onMove, onAssign, currentUser }) {
  const [tab, setTab] = useState('details')
  const [commentCount, setCommentCount] = useState(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const TABS = [
    { key: 'details', label: 'Detalles' },
    { key: 'comments', label: commentCount !== null ? `Comentarios (${commentCount})` : 'Comentarios' },
    { key: 'activity', label: 'Actividad' },
  ]

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className="fixed top-0 right-0 h-full w-[560px] max-w-full z-50 bg-[#0d1525] border-l border-[#1e3a5f] flex flex-col shadow-2xl"
        style={{ animation: 'slideInRight 0.18s ease-out' }}
        onWheel={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[#1e3a5f] flex-shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <SeverityBadge severity={vuln.severity} />
              <SLABadge slaHours={vuln.sla_hours} slaDeadline={vuln.sla_deadline} remediationStatus={vuln.remediation_status} />
            </div>
            <h2 className="text-sm font-bold text-white leading-snug">{vuln.title}</h2>
            <div className="mt-1 text-xs text-[#64748b] flex items-center gap-1.5">
              <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeWidth={2}/><circle cx="12" cy="12" r="4" strokeWidth={2}/>
              </svg>
              {vuln.target_name || '—'}
            </div>
          </div>
          <button onClick={onClose} className="text-[#64748b] hover:text-white transition-colors text-xl leading-none flex-shrink-0 mt-0.5">×</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1e3a5f] flex-shrink-0 bg-[#0d1525]">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'text-accent border-accent'
                  : 'text-[#64748b] border-transparent hover:text-white hover:border-[#3d5270]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab body — relative so each tab can use absolute inset-0 */}
        <div className="flex-1 min-h-0 relative overflow-hidden">
          {tab === 'details' && (
            <DetailsTab vuln={vuln} users={users} onMove={onMove} onAssign={onAssign} />
          )}
          {tab === 'comments' && (
            <CommentsTab vuln={vuln} currentUser={currentUser} onCountChange={setCommentCount} />
          )}
          {tab === 'activity' && (
            <ActivityTab vuln={vuln} />
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        .rich-editor:empty:before {
          content: attr(data-placeholder);
          color: #3d5270;
          pointer-events: none;
        }
        .comment-html a { color: #00d4ff; text-decoration: underline; }
        .comment-html ul { list-style: disc; padding-left: 1.2em; margin: 0.25em 0; }
        .comment-html ol { list-style: decimal; padding-left: 1.2em; margin: 0.25em 0; }
        .comment-html b, .comment-html strong { color: #e2e8f0; font-weight: 600; }
        .comment-html i, .comment-html em { font-style: italic; }
        .rich-editor a { color: #00d4ff; }
        .rich-editor ul { list-style: disc; padding-left: 1.2em; margin: 0.25em 0; }
        .rich-editor ol { list-style: decimal; padding-left: 1.2em; margin: 0.25em 0; }
        .rich-editor b, .rich-editor strong { color: #e2e8f0; font-weight: 600; }
      `}</style>
    </>
  )
}

// ── Card assign dropdown (portal-based) ────────────────────────────────────

function CardAssignDropdown({ vuln, users, onQuickAssign }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const dropRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        dropRef.current && !dropRef.current.contains(e.target)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (e) => {
    e.stopPropagation()
    if (!open) { const rect = btnRef.current.getBoundingClientRect(); setPos({ top: rect.bottom + 4, left: rect.left }) }
    setOpen(o => !o)
  }

  const select = (e, userId) => { e.stopPropagation(); setOpen(false); onQuickAssign(vuln.id, userId) }

  return (
    <>
      <button ref={btnRef} onClick={toggle} className="flex items-center gap-1.5 min-w-0 hover:opacity-75 transition-opacity" title="Asignar usuario">
        {vuln.assigned_to ? (
          <>
            <span className="w-6 h-6 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">{vuln.assigned_to.username?.[0]?.toUpperCase()}</span>
            <span className="text-sm text-white font-medium truncate">{vuln.assigned_to.full_name || vuln.assigned_to.username}</span>
          </>
        ) : (
          <span className="text-sm text-white italic opacity-70 hover:opacity-100 transition-opacity">+ Asignar</span>
        )}
      </button>

      {open && createPortal(
        <div ref={dropRef} className="fixed w-44 bg-[#0d1525] border border-[#1e3a5f] rounded-xl shadow-2xl overflow-hidden kanban-assign-portal" style={{ top: pos.top, left: pos.left, zIndex: 9999 }} onClick={e => e.stopPropagation()}>
          <div className="py-1 max-h-44 overflow-y-auto">
            <button onClick={e => select(e, null)} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-[#1e3a5f]/40 ${!vuln.assigned_to_id ? 'text-accent font-semibold' : 'text-[#64748b]'}`}>
              <span className="w-4 h-4 rounded-full border border-[#3d5270] flex items-center justify-center text-[8px] text-[#3d5270] flex-shrink-0">—</span>
              Sin asignar
              {!vuln.assigned_to_id && <svg className="w-3 h-3 ml-auto text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </button>
            {users.map(u => (
              <button key={u.id} onClick={e => select(e, u.id)} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors hover:bg-[#1e3a5f]/40 ${vuln.assigned_to_id === u.id ? 'text-accent font-semibold' : 'text-[#94a3b8]'}`}>
                <span className="w-4 h-4 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-[8px] font-bold text-accent flex-shrink-0">{u.username?.[0]?.toUpperCase()}</span>
                <span className="truncate">{u.username}</span>
                {vuln.assigned_to_id === u.id && <svg className="w-3 h-3 ml-auto text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// ── Kanban card ─────────────────────────────────────────────────────────────

function KanbanCard({ vuln, users, onClick, onQuickAssign, isClassic }) {
  const sev = SEVERITY_CONFIG[vuln.severity] ?? SEVERITY_CONFIG.INFO
  const didDrag = useRef(false)
  return (
    <div
      draggable
      onDragStart={(e) => { didDrag.current = true; e.dataTransfer.setData('vulnId', String(vuln.id)); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={() => { setTimeout(() => { didDrag.current = false }, 50) }}
      className="kanban-card w-full text-left rounded-xl border transition-all hover:brightness-95 hover:shadow-lg hover:-translate-y-0.5 cursor-grab active:cursor-grabbing"
      style={isClassic ? {
        borderColor: `${sev.color}60`,
        background: `${sev.color}22`,
        borderLeft: `4px solid ${sev.color}`,
      } : {
        borderColor: `${sev.color}70`,
        background: `${sev.color}22`,
        borderLeft: `4px solid ${sev.color}`,
      }}
      onClick={() => { if (!didDrag.current) onClick() }}
    >
      <div className="p-3 space-y-2">
        <div className="text-[11px] font-bold leading-tight line-clamp-2" style={{ color: isClassic ? '#111111' : '#ffffff' }}>{vuln.title}</div>
        <div><SeverityBadge severity={vuln.severity} /></div>
        <div className="flex items-center gap-1 text-[11px] text-[#6b82a8]">
          <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <circle cx="12" cy="12" r="9" strokeWidth={2}/><circle cx="12" cy="12" r="4" strokeWidth={2}/>
          </svg>
          <span className="truncate font-medium">{vuln.target_name || '—'}</span>
        </div>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <CardAssignDropdown vuln={vuln} users={users} onQuickAssign={onQuickAssign} />
          <SLABadge slaHours={vuln.sla_hours} slaDeadline={vuln.sla_deadline} remediationStatus={vuln.remediation_status} />
        </div>
      </div>
    </div>
  )
}

// ── Kanban column ──────────────────────────────────────────────────────────

function KanbanColumn({ column, vulns, users, onCardClick, onQuickAssign, onDrop, isClassic }) {
  const [dragOver, setDragOver] = useState(false)
  const critCount = vulns.filter(v => v.severity === 'CRITICAL').length
  const highCount = vulns.filter(v => v.severity === 'HIGH').length
  return (
    <div
      className="flex flex-col flex-1 min-w-[220px] rounded-xl transition-all"
      style={dragOver ? { outline: `2px dashed ${column.color}`, outlineOffset: '2px', background: `${column.color}08` } : {}}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const id = parseInt(e.dataTransfer.getData('vulnId'), 10); if (id) onDrop(id, column.key) }}
    >
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl mb-3 border transition-all" style={dragOver ? { background: `${column.color}25`, borderColor: column.color } : isClassic ? { background: `${column.color}30`, borderColor: `${column.color}90`, borderBottom: `2px solid ${column.color}` } : { background: `${column.color}12`, borderColor: `${column.color}30` }}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{column.icon}</span>
          <span className="text-xs font-semibold" style={{ color: column.color }}>{column.label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {critCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">{critCount}C</span>}
          {highCount > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">{highCount}A</span>}
          <span className="text-[10px] text-[#64748b] px-1.5 py-0.5 rounded bg-[#1e3a5f]/30 border border-[#1e3a5f]">{vulns.length}</span>
        </div>
      </div>
      <div className="space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-290px)] pr-0.5 pb-2">
        {vulns.length === 0 ? (
          <div className="flex items-center justify-center h-16 rounded-lg border border-dashed text-[#3d5270] text-xs transition-all" style={{ borderColor: dragOver ? column.color : '#1e3a5f', color: dragOver ? column.color : undefined }}>
            {dragOver ? 'Soltar aquí' : 'Sin vulnerabilidades'}
          </div>
        ) : (
          vulns.map(v => (
            <KanbanCard key={v.id} vuln={v} users={users} onClick={() => onCardClick(v)} onQuickAssign={onQuickAssign} isClassic={isClassic} />
          ))
        )}
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function Vulnerabilities() {
  const [vulns, setVulns] = useState([])
  const [users, setUsers] = useState([])
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filterSevs, setFilterSevs] = useState([])
  const [filterTargets, setFilterTargets] = useState([])
  const [filterUsers, setFilterUsers] = useState([])
  const [isClassic, setIsClassic] = useState(() => document.documentElement.classList.contains('classic'))
  const vulnsRef = useRef([])

  useEffect(() => {
    document.body.style.overflowY = 'hidden'
    return () => { document.body.style.overflowY = '' }
  }, [])

  useEffect(() => {
    const obs = new MutationObserver(() => setIsClassic(document.documentElement.classList.contains('classic')))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])

  const [, setTick] = useState(0)

  const load = useCallback(() => {
    Promise.all([
      api.vulnerabilities.list(),
      api.users.list().catch(() => []),
      api.auth.me().catch(() => null),
    ]).then(([vs, us, me]) => {
      setVulns(vs)
      setCurrentUser(me)
      if (me?.id && !us.find(u => u.id === me.id)) {
        setUsers([{ ...me, isCurrentUser: true }, ...us])
      } else {
        setUsers(us.map(u => ({ ...u, isCurrentUser: u.id === me?.id })))
      }
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const tickInterval = setInterval(() => setTick(t => t + 1), 60_000)
    const reloadInterval = setInterval(load, 300_000)
    return () => { clearInterval(tickInterval); clearInterval(reloadInterval) }
  }, [load])

  useEffect(() => { vulnsRef.current = vulns }, [vulns])

  useEffect(() => {
    const id = setInterval(() => {
      if (vulnsRef.current.length > 0) load()
    }, 5000)
    return () => clearInterval(id)
  }, [load])

  const handleMove = (findingId, newStatus) => {
    setVulns(prev => prev.map(v => v.id === findingId ? { ...v, remediation_status: newStatus } : v))
    setSelected(prev => prev?.id === findingId ? { ...prev, remediation_status: newStatus } : prev)
  }

  const handleAssign = (findingId, userId, user) => {
    setVulns(prev => prev.map(v => v.id === findingId ? { ...v, assigned_to_id: userId, assigned_to: user } : v))
    setSelected(prev => prev?.id === findingId ? { ...prev, assigned_to_id: userId, assigned_to: user } : prev)
  }

  const handleQuickAssign = async (vulnId, userId) => {
    try {
      await api.vulnerabilities.update(vulnId, { assigned_to_id: userId ?? 0 })
      const user = userId ? users.find(u => u.id === userId) ?? null : null
      handleAssign(vulnId, userId, user)
    } catch (e) {
      alert(e.message)
    }
  }

  const handleDrop = async (vulnId, newStatus) => {
    const vuln = vulns.find(v => v.id === vulnId)
    if (!vuln || (vuln.remediation_status || 'pending') === newStatus) return
    const prevStatus = vuln.remediation_status || 'pending'
    handleMove(vulnId, newStatus)
    try {
      await api.vulnerabilities.update(vulnId, { remediation_status: newStatus })
    } catch (e) {
      handleMove(vulnId, prevStatus)
      alert(e.message)
    }
  }

  const uniqueTargets = [...new Set(vulns.map(v => v.target_name).filter(Boolean))].sort()
  const sevOptions = Object.entries(SEVERITY_CONFIG).map(([key, cfg]) => ({
    value: key, label: cfg.label, count: vulns.filter(v => v.severity === key).length,
  }))
  const targetOptions = uniqueTargets.map(t => ({
    value: t, label: t, count: vulns.filter(v => v.target_name === t).length,
  }))
  const userOptions = [
    { value: '__unassigned__', label: 'Sin asignar', count: vulns.filter(v => !v.assigned_to_id).length },
    ...users.map(u => ({
      value: String(u.id), label: u.username + (u.isCurrentUser ? ' (yo)' : ''),
      count: vulns.filter(v => v.assigned_to_id === u.id).length,
    })),
  ].filter(o => o.count > 0)

  const hasFilters = filterSevs.length > 0 || filterTargets.length > 0 || filterUsers.length > 0

  const filtered = vulns.filter(v => {
    if (filterSevs.length > 0 && !filterSevs.includes(v.severity)) return false
    if (filterTargets.length > 0 && !filterTargets.includes(v.target_name)) return false
    if (filterUsers.length > 0) {
      const key = v.assigned_to_id ? String(v.assigned_to_id) : '__unassigned__'
      if (!filterUsers.includes(key)) return false
    }
    return true
  })

  const sevOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 }
  const sorted = [...filtered].sort((a, b) => {
    const expA = a.sla_expired ? 0 : 1
    const expB = b.sla_expired ? 0 : 1
    if (expA !== expB) return expA - expB
    return (sevOrder[a.severity] ?? 5) - (sevOrder[b.severity] ?? 5)
  })

  const grouped = {}
  STATUS_COLUMNS.forEach(col => { grouped[col.key] = sorted.filter(v => (v.remediation_status || 'pending') === col.key) })

  const totalExpired = vulns.filter(v =>
    v.sla_expired && v.remediation_status !== 'remediated' && v.remediation_status !== 'false_positive'
  ).length

  const selectedVuln = selected ? (vulns.find(v => v.id === selected.id) ?? selected) : null

  if (loading) return <div className="flex items-center justify-center h-64 text-[#64748b] text-sm">Cargando vulnerabilidades...</div>

  return (
    <div className="space-y-4">
      {selectedVuln && (
        <DetailPanel
          vuln={selectedVuln}
          users={users}
          currentUser={currentUser}
          onClose={() => setSelected(null)}
          onMove={handleMove}
          onAssign={handleAssign}
        />
      )}

      <div>
        <h1 className="text-2xl font-bold text-white">Vulnerabilidades</h1>
        <p className="text-sm text-[#64748b] mt-0.5">
          {vulns.length} hallazgo{vulns.length !== 1 ? 's' : ''} en total
          {totalExpired > 0 && <span className="ml-2 text-red-400 font-semibold">· {totalExpired} SLA vencido{totalExpired !== 1 ? 's' : ''}</span>}
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <CheckboxDropdown label="Severidad" options={sevOptions} selected={filterSevs} onChange={setFilterSevs} colorFn={val => SEVERITY_CONFIG[val]?.color} />
        {targetOptions.length > 0 && <CheckboxDropdown label="Proyecto" options={targetOptions} selected={filterTargets} onChange={setFilterTargets} />}
        {userOptions.length > 0 && <CheckboxDropdown label="Asignado a" options={userOptions} selected={filterUsers} onChange={setFilterUsers} />}
        {hasFilters && (
          <>
            <button onClick={() => { setFilterSevs([]); setFilterTargets([]); setFilterUsers([]) }} className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1.5">Limpiar filtros</button>
            <span className="text-xs text-[#64748b]">{filtered.length} de {vulns.length}</span>
          </>
        )}
      </div>

      {vulns.length === 0 ? (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl py-24 text-center">
          <div className="text-4xl mb-3">🛡️</div>
          <div className="text-white font-semibold">Sin vulnerabilidades</div>
          <div className="text-sm text-[#64748b] mt-1">Los hallazgos de los scans aparecerán aquí.</div>
          <Link to="/scan/new" className="mt-4 inline-block text-accent text-sm hover:underline">Iniciar un scan →</Link>
        </div>
      ) : (
        <div className="overflow-x-auto pb-6">
          <div className="flex gap-4 w-full">
            {STATUS_COLUMNS.map(col => (
              <KanbanColumn
                key={col.key}
                column={col}
                vulns={grouped[col.key] ?? []}
                users={users}
                onCardClick={setSelected}
                onQuickAssign={handleQuickAssign}
                onDrop={handleDrop}
                isClassic={isClassic}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
