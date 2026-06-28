import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useNotifications } from '../context/NotificationContext'

// ── Constants ──────────────────────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: 'support', label: 'Soporte / Bug', icon: '🐛' },
  { value: 'feature', label: 'Nueva funcionalidad', icon: '✨' },
]

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Baja',  color: '#22c55e' },
  { value: 'medium', label: 'Media', color: '#eab308' },
  { value: 'high',   label: 'Alta',  color: '#ef4444' },
]

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Abierto',    color: '#00d4ff' },
  { value: 'in_progress', label: 'En proceso', color: '#f97316' },
  { value: 'resolved',    label: 'Resuelto',   color: '#22c55e' },
  { value: 'closed',      label: 'Cerrado',    color: '#64748b' },
]

const TYPE_MAP = {
  support: { label: 'Soporte / Bug', icon: '🐛', color: '#f97316' },
  feature: { label: 'Nueva funcionalidad', icon: '✨', color: '#00d4ff' },
}

// ── Markdown helpers ───────────────────────────────────────────────────────

function renderInline(text) {
  const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g
  const parts = []
  let lastIndex = 0
  let match
  let key = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>)
    }
    const m = match[0]
    if (m.startsWith('**')) {
      parts.push(<strong key={key++} className="font-semibold text-white">{m.slice(2, -2)}</strong>)
    } else if (m.startsWith('*')) {
      parts.push(<em key={key++} className="italic">{m.slice(1, -1)}</em>)
    } else {
      parts.push(
        <code key={key++} className="font-mono text-xs bg-[#1a2a40] px-1.5 py-0.5 rounded text-[#00d4ff]">
          {m.slice(1, -1)}
        </code>
      )
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>)
  return parts.length > 0 ? parts : text
}

function MarkdownText({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  const result = []
  let listItems = []
  let listKey = 0

  const flushList = () => {
    if (listItems.length === 0) return
    result.push(
      <ul key={`ul-${listKey++}`} className="list-disc list-inside my-1 space-y-0.5 text-[#cbd5e1]">
        {listItems.map((item, j) => <li key={j} className="text-sm">{item}</li>)}
      </ul>
    )
    listItems = []
  }

  lines.forEach((line, i) => {
    if (line.startsWith('- ')) {
      listItems.push(renderInline(line.slice(2)))
    } else {
      flushList()
      if (line === '') {
        result.push(<div key={`gap-${i}`} className="h-2" />)
      } else {
        result.push(
          <p key={`p-${i}`} className="text-sm text-[#cbd5e1] leading-relaxed">
            {renderInline(line)}
          </p>
        )
      }
    }
  })
  flushList()

  return <div className="space-y-0.5">{result}</div>
}

function applyMarkdownFormat(textarea, format, value, onChange) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = value.slice(start, end)

  let newValue, cursorStart, cursorEnd

  if (format === 'list') {
    const lines = (selected || 'elemento').split('\n')
    const replacement = lines.map(l => `- ${l}`).join('\n')
    newValue = value.slice(0, start) + replacement + value.slice(end)
    cursorStart = start
    cursorEnd = start + replacement.length
  } else {
    const markers = { bold: '**', italic: '*', code: '`' }
    const m = markers[format]
    const content = selected || 'texto'
    const replacement = `${m}${content}${m}`
    newValue = value.slice(0, start) + replacement + value.slice(end)
    cursorStart = start + m.length
    cursorEnd = start + m.length + content.length
  }

  onChange(newValue)
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(cursorStart, cursorEnd)
  }, 0)
}

// ── File helpers ───────────────────────────────────────────────────────────

function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isImage(att) {
  return att.content_type?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(att.name)
}

function FileIcon() {
  return (
    <svg className="w-4 h-4 text-[#64748b] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

// ── Small helpers ──────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{ color: cfg.color, background: `${cfg.color}18`, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  )
}

function PriorityBadge({ priority }) {
  const cfg = PRIORITY_OPTIONS.find(p => p.value === priority) ?? PRIORITY_OPTIONS[1]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold"
      style={{ color: cfg.color, background: `${cfg.color}18`, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  )
}

function fmtDate(iso) {
  if (!iso) return '—'
  const utc = /[Z+]/.test(iso) ? iso : iso + 'Z'
  return new Date(utc).toLocaleString('es', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Rich text toolbar ──────────────────────────────────────────────────────

function RichToolbar({ textareaRef, value, onChange }) {
  const btn = (format, label, title, cls = '') => (
    <button
      key={format}
      type="button"
      title={title}
      onClick={() => applyMarkdownFormat(textareaRef.current, format, value, onChange)}
      className={`px-2 py-1 rounded text-xs text-[#94a3b8] hover:text-white hover:bg-[#1e3a5f] transition-colors ${cls}`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-[#0a0f1e] border border-b-0 border-[#1e3a5f] rounded-t-lg">
      {btn('bold',   <strong>B</strong>,  'Negrita (**texto**)')}
      {btn('italic', <em>I</em>,          'Cursiva (*texto*)', 'italic')}
      {btn('code',   <span className="font-mono text-[11px]">{`</>`}</span>, 'Código (`texto`)')}
      <span className="w-px h-4 bg-[#1e3a5f] mx-1" />
      {btn('list',
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>,
        'Lista (- elemento)'
      )}
      <span className="ml-auto text-[10px] text-[#3d5270] pr-1">markdown</span>
    </div>
  )
}

// ── Attachment drop zone ───────────────────────────────────────────────────

function AttachmentZone({ attachments, onAdd, onRemove }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const handleFiles = async (files) => {
    const arr = Array.from(files)
    setUploading(c => c + arr.length)
    setUploadError('')
    for (const file of arr) {
      try {
        const result = await api.support.uploadFile(file)
        onAdd(result)
      } catch (err) {
        setUploadError(err.message || 'Error al subir archivo')
      } finally {
        setUploading(c => c - 1)
      }
    }
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">
        Archivos adjuntos
      </label>
      <div
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => fileInputRef.current?.click()}
        className={`border border-dashed rounded-lg px-4 py-3 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-accent/60 bg-accent/5' : 'border-[#1e3a5f] hover:border-accent/40'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
        />
        <div className="flex flex-col items-center gap-1">
          <svg className="w-5 h-5 text-[#3d5270]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
          <span className="text-xs text-[#64748b]">
            {uploading > 0 ? `Subiendo ${uploading} archivo${uploading > 1 ? 's' : ''}…` : 'Arrastrá archivos o hacé click para adjuntar'}
          </span>
        </div>
      </div>

      {uploadError && (
        <p className="text-[11px] text-red-400 mt-1">{uploadError}</p>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-[#111827] border border-[#1e3a5f] rounded-lg px-2 py-1.5 max-w-[180px]">
              <FileIcon />
              <span className="text-xs text-[#94a3b8] truncate flex-1">{a.name}</span>
              {a.size && <span className="text-[10px] text-[#3d5270] flex-shrink-0">{fmtSize(a.size)}</span>}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onRemove(i) }}
                className="text-[#3d5270] hover:text-red-400 transition-colors flex-shrink-0"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── New Ticket Modal ───────────────────────────────────────────────────────

function NewTicketModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ type: 'support', subject: '', description: '', priority: 'medium' })
  const [attachments, setAttachments] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const overlayRef = useRef(null)
  const descRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.subject.trim() || form.subject.trim().length < 3) return setError('El asunto debe tener al menos 3 caracteres.')
    if (!form.description.trim() || form.description.trim().length < 10) return setError('La descripción debe tener al menos 10 caracteres.')
    setSaving(true)
    setError('')
    try {
      const created = await api.support.create({ ...form, attachments })
      onCreated(created)
      onClose()
    } catch (err) {
      setError(err.message || 'Error al crear el ticket')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="w-full max-w-lg bg-[#0d1525] border border-[#1e3a5f] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e3a5f] flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-white">Nueva solicitud</h2>
            <p className="text-xs text-[#64748b] mt-0.5">Reportá un bug o solicitá una funcionalidad</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#64748b] hover:text-white hover:bg-[#1e3a5f] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Type selector */}
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set('type', t.value)}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                      form.type === t.value
                        ? 'bg-accent/10 border-accent/40 text-accent'
                        : 'bg-[#111827] border-[#1e3a5f] text-[#64748b] hover:border-accent/20 hover:text-white'
                    }`}
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">Prioridad</label>
              <div className="flex gap-2">
                {PRIORITY_OPTIONS.map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => set('priority', p.value)}
                    className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${
                      form.priority === p.value
                        ? 'border-current'
                        : 'bg-[#111827] border-[#1e3a5f] text-[#64748b] hover:border-[#2d4a6f]'
                    }`}
                    style={form.priority === p.value
                      ? { color: p.color, background: `${p.color}18`, borderColor: `${p.color}50` }
                      : {}}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">Asunto</label>
              <input
                type="text"
                value={form.subject}
                onChange={e => set('subject', e.target.value)}
                placeholder="Resumen breve del problema o funcionalidad"
                maxLength={200}
                className="w-full bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#3d5270] focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>

            {/* Description with rich text toolbar */}
            <div>
              <label className="block text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">Descripción</label>
              <RichToolbar
                textareaRef={descRef}
                value={form.description}
                onChange={v => set('description', v)}
              />
              <textarea
                ref={descRef}
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Descripción detallada, pasos para reproducir, contexto…"
                rows={5}
                maxLength={4000}
                className="w-full bg-[#111827] border border-[#1e3a5f] rounded-b-lg px-3 py-2.5 text-sm text-white placeholder-[#3d5270] focus:outline-none focus:border-accent/50 transition-colors resize-none"
              />
              <div className="text-right text-[10px] text-[#3d5270] mt-1">{form.description.length}/4000</div>
            </div>

            {/* Attachments */}
            <AttachmentZone
              attachments={attachments}
              onAdd={a => setAttachments(prev => [...prev, a])}
              onRemove={i => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
            />

            {error && (
              <div className="px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-lg border border-[#1e3a5f] text-sm text-[#64748b] hover:text-white hover:border-[#2d4a6f] transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-accent text-[#0a0f1e] text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Ticket Detail Modal ────────────────────────────────────────────────────

function TicketDetailModal({ ticket, isAdmin, onClose, onUpdated }) {
  const [comments, setComments] = useState([])
  const [loadingComments, setLoadingComments] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [commentAttachments, setCommentAttachments] = useState([])
  const [sendingComment, setSendingComment] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const overlayRef = useRef(null)
  const commentRef = useRef(null)

  useEffect(() => {
    api.support.listComments(ticket.id)
      .then(setComments)
      .catch(() => {})
      .finally(() => setLoadingComments(false))
  }, [ticket.id])

  // Reflect comment/status changes pushed from parent's background sync
  useEffect(() => {
    if (!loadingComments && ticket.comments) {
      setComments([...ticket.comments].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)))
    }
  }, [ticket.comments?.length, ticket.status])

  const handleAddComment = async () => {
    if (!newComment.trim()) return
    setSendingComment(true)
    try {
      const c = await api.support.addComment(ticket.id, newComment.trim(), commentAttachments)
      setComments(prev => [c, ...prev])
      setNewComment('')
      setCommentAttachments([])
    } catch {}
    setSendingComment(false)
  }

  const handleStatusChange = async (status) => {
    setUpdatingStatus(true)
    try {
      const updated = await api.support.updateStatus(ticket.id, status)
      onUpdated(updated)
    } catch {}
    setUpdatingStatus(false)
  }

  const typeCfg = TYPE_MAP[ticket.type] ?? TYPE_MAP.support
  const attachments = ticket.attachments || []
  const lastCommentTime = comments.length > 0 ? comments[0].created_at : null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="w-full max-w-2xl bg-[#0d1525] border border-[#1e3a5f] rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-[#1e3a5f] flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{typeCfg.icon}</span>
              <span className="text-xs font-semibold" style={{ color: typeCfg.color }}>{typeCfg.label}</span>
              <span className="text-[#3d5270]">·</span>
              <span className="text-xs text-[#64748b]">#{ticket.id}</span>
              {ticket.jira_issue_key && (
                <>
                  <span className="text-[#3d5270]">·</span>
                  <span className="text-xs font-mono text-[#00d4ff] bg-[#00d4ff]/10 px-1.5 py-0.5 rounded border border-[#00d4ff]/20">
                    {ticket.jira_issue_key}
                  </span>
                </>
              )}
            </div>
            <h2 className="text-base font-bold text-white truncate">{ticket.subject}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#64748b] hover:text-white hover:bg-[#1e3a5f] transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Meta */}
          <div className="px-6 py-4 border-b border-[#111827] flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64748b]">Estado</span>
              <StatusBadge status={ticket.status} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64748b]">Prioridad</span>
              <PriorityBadge priority={ticket.priority} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64748b]">Solicitante</span>
              <span className="text-xs font-medium text-white">{ticket.username}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#64748b]">Creado</span>
              <span className="text-xs text-[#94a3b8]">{fmtDate(ticket.created_at)}</span>
            </div>
            {lastCommentTime && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#64748b]">Últ. actividad</span>
                <span className="text-xs text-[#94a3b8]">{fmtDate(lastCommentTime)}</span>
              </div>
            )}

            {/* Admin actions */}
            {isAdmin && (
              <div className="flex items-center gap-2 ml-auto">
                <select
                  value={ticket.status}
                  onChange={e => handleStatusChange(e.target.value)}
                  disabled={updatingStatus}
                  className="bg-[#111827] border border-[#1e3a5f] rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-accent/50 disabled:opacity-50"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="px-6 py-4 border-b border-[#111827]">
            <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-2">Descripción</h3>
            <MarkdownText text={ticket.description} />
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div className="px-6 py-4 border-b border-[#111827]">
              <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-3">
                Archivos adjuntos
                <span className="normal-case text-accent ml-1">({attachments.length})</span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {attachments.map((a, i) => (
                  isImage(a) ? (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-lg overflow-hidden border border-[#1e3a5f] hover:border-accent/40 transition-colors"
                    >
                      <img src={a.url} alt={a.name} className="h-16 w-auto object-cover" />
                      <div className="px-2 py-1 text-[10px] text-[#64748b] truncate max-w-[120px]">{a.name}</div>
                    </a>
                  ) : (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 hover:border-accent/40 transition-colors"
                    >
                      <svg className="w-4 h-4 text-[#64748b] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div>
                        <div className="text-xs text-[#94a3b8] max-w-[140px] truncate">{a.name}</div>
                        {a.size && <div className="text-[10px] text-[#3d5270]">{fmtSize(a.size)}</div>}
                      </div>
                    </a>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div className="px-6 py-4">
            <h3 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-3">
              Comentarios {comments.length > 0 && <span className="normal-case text-accent">({comments.length})</span>}
            </h3>

            {/* Add comment — siempre arriba */}
            {ticket.status !== 'closed' && (
              <div className="mb-5 space-y-2">
                <RichToolbar
                  textareaRef={commentRef}
                  value={newComment}
                  onChange={setNewComment}
                />
                <textarea
                  ref={commentRef}
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  placeholder="Escribí un comentario…"
                  rows={3}
                  className="w-full bg-[#111827] border border-[#1e3a5f] rounded-b-xl px-3 py-2.5 text-sm text-white placeholder-[#3d5270] focus:outline-none focus:border-accent/50 transition-colors resize-none"
                />
                <AttachmentZone
                  attachments={commentAttachments}
                  onAdd={a => setCommentAttachments(prev => [...prev, a])}
                  onRemove={i => setCommentAttachments(prev => prev.filter((_, idx) => idx !== i))}
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleAddComment}
                    disabled={sendingComment || !newComment.trim()}
                    className="px-4 py-2 rounded-lg bg-accent text-[#0a0f1e] text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-40"
                  >
                    {sendingComment ? 'Enviando…' : 'Comentar'}
                  </button>
                </div>
              </div>
            )}

            {loadingComments ? (
              <div className="text-xs text-[#64748b] py-4 text-center">Cargando comentarios…</div>
            ) : comments.length === 0 ? (
              <div className="text-xs text-[#64748b] py-4 text-center">Sin comentarios aún</div>
            ) : (
              <div className="space-y-3">
                {comments.map(c => (
                  <div key={c.id} className={`flex gap-3 ${c.source === 'jira' ? 'opacity-90' : ''}`}>
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5"
                      style={c.source === 'jira'
                        ? { background: 'rgba(0,82,204,0.2)', color: '#0052cc', border: '1px solid rgba(0,82,204,0.3)' }
                        : { background: 'rgba(0,212,255,0.1)', color: '#00d4ff', border: '1px solid rgba(0,212,255,0.2)' }
                      }
                    >
                      {c.source === 'jira' ? 'J' : c.author?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-white">{c.author}</span>
                        {c.source === 'jira' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0052cc]/20 text-[#4c9aff] border border-[#0052cc]/30 font-medium">Jira</span>
                        )}
                        <span className="text-[10px] text-[#3d5270]">{fmtDate(c.created_at)}</span>
                      </div>
                      <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl px-3 py-2.5 space-y-2">
                        <MarkdownText text={c.body} />
                        {c.attachments?.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1 border-t border-[#1e3a5f]">
                            {c.attachments.map((a, i) => (
                              isImage(a) ? (
                                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                                  className="block rounded overflow-hidden border border-[#1e3a5f] hover:border-accent/40 transition-colors">
                                  <img src={a.url} alt={a.name} className="h-12 w-auto object-cover" />
                                </a>
                              ) : (
                                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 bg-[#0d1525] border border-[#1e3a5f] rounded-lg px-2 py-1 hover:border-accent/40 transition-colors">
                                  <FileIcon />
                                  <span className="text-[11px] text-[#94a3b8] max-w-[120px] truncate">{a.name}</span>
                                  {a.size && <span className="text-[10px] text-[#3d5270]">{fmtSize(a.size)}</span>}
                                </a>
                              )
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Ticket Row ─────────────────────────────────────────────────────────────

function TicketRow({ ticket, onClick }) {
  const typeCfg = TYPE_MAP[ticket.type] ?? TYPE_MAP.support
  const lastComment = ticket.comments?.slice(-1)[0]
  const lastUpdate = lastComment?.created_at ?? ticket.created_at
  const hasActivity = !!lastComment

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-4 px-4 py-3 border-b border-[#1e3a5f] last:border-b-0 hover:bg-[#0d1a2d] cursor-pointer transition-colors group"
    >
      {/* Type icon */}
      <span className="text-base flex-shrink-0" title={typeCfg.label}>{typeCfg.icon}</span>

      {/* Subject + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white group-hover:text-accent transition-colors truncate">
            {ticket.subject}
          </span>
          {ticket.jira_issue_key && (
            <span className="text-[10px] font-mono text-[#00d4ff] bg-[#00d4ff]/10 px-1.5 py-0.5 rounded border border-[#00d4ff]/20 flex-shrink-0">
              {ticket.jira_issue_key}
            </span>
          )}
          {ticket.attachments?.length > 0 && (
            <span className="text-[10px] text-[#64748b] flex items-center gap-0.5 flex-shrink-0">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              {ticket.attachments.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-[#3d5270]">#{ticket.id}</span>
          <span className="text-[#3d5270]">·</span>
          <span className="text-[11px] text-[#64748b]">{ticket.username}</span>
          {ticket.comments?.length > 0 && (
            <>
              <span className="text-[#3d5270]">·</span>
              <span className="text-[11px] text-[#64748b]">{ticket.comments.length} comentario{ticket.comments.length !== 1 ? 's' : ''}</span>
            </>
          )}
        </div>
      </div>

      {/* Last update */}
      <div className="hidden md:flex flex-col items-end flex-shrink-0 w-36">
        <span className="text-[10px] text-[#3d5270]">{hasActivity ? 'Últ. actividad' : 'Creado'}</span>
        <span className="text-[11px] text-[#94a3b8]">{fmtDate(lastUpdate)}</span>
      </div>

      {/* Priority */}
      <div className="flex-shrink-0">
        <PriorityBadge priority={ticket.priority} />
      </div>

      {/* Status */}
      <div className="flex-shrink-0">
        <StatusBadge status={ticket.status} />
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Support() {
  const { authEnabled } = useAuth()
  const { addNotification } = useNotifications()
  const [currentUser, setCurrentUser] = useState(null)
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [jiraConfigured, setJiraConfigured] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Refs to avoid stale closures in the polling interval
  const ticketsRef = useRef([])
  const addNotificationRef = useRef(addNotification)
  ticketsRef.current = tickets
  addNotificationRef.current = addNotification

  useEffect(() => {
    if (!authEnabled) {
      setCurrentUser({ username: 'admin', role: 'administrator' })
    } else {
      api.auth.me().then(setCurrentUser).catch(() => {})
    }
    api.support.jiraStatus().then(r => setJiraConfigured(r.configured)).catch(() => {})
    loadTickets()
  }, [authEnabled])

  // Background Jira sync every 5 seconds — runs regardless of which modal is open
  useEffect(() => {
    const prevState = {} // { [ticketId]: { status, commentCount } }
    let initialized = false

    const doSync = async () => {
      const current = ticketsRef.current
      const targets = current.filter(t => t.jira_issue_key && t.status !== 'closed')
      if (targets.length === 0) { initialized = true; return }

      for (const t of targets) {
        try {
          const updated = await api.support.sync(t.id)
          const commentCount = updated.comments?.length ?? 0

          if (initialized && prevState[t.id]) {
            const prev = prevState[t.id]
            if (updated.status !== prev.status) {
              const label = STATUS_OPTIONS.find(s => s.value === updated.status)?.label ?? updated.status
              addNotificationRef.current({
                title: `Ticket #${t.id} — estado actualizado`,
                body: `"${t.subject}" cambió a ${label}`,
                type: 'warning',
              })
            }
            if (commentCount > prev.commentCount) {
              const diff = commentCount - prev.commentCount
              addNotificationRef.current({
                title: `Ticket #${t.id} — nuevo comentario`,
                body: `"${t.subject}" recibió ${diff} comentario${diff > 1 ? 's' : ''} desde Jira`,
                type: 'info',
              })
            }
          }

          prevState[t.id] = { status: updated.status, commentCount }
          setTickets(prev => prev.map(x => x.id === updated.id ? updated : x))
          setSelected(sel => sel?.id === updated.id ? updated : sel)
        } catch {}
      }
      initialized = true
    }

    const id = setInterval(doSync, 5000)
    return () => clearInterval(id)
  }, [])

  const loadTickets = async () => {
    setLoading(true)
    try {
      const data = await api.support.list()
      setTickets(data)
    } catch {}
    setLoading(false)
  }

  const isAdmin = !authEnabled || currentUser?.role === 'administrator'

  const filtered = tickets.filter(t => {
    if (filter !== 'all' && t.status !== filter) return false
    if (search && !t.subject.toLowerCase().includes(search.toLowerCase()) &&
        !t.description.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  }

  const handleCreated = (ticket) => {
    setTickets(prev => [ticket, ...prev])
  }

  const handleUpdated = (updated) => {
    setTickets(prev => prev.map(t => t.id === updated.id ? updated : t))
    setSelected(updated)
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Soporte</h1>
          <p className="text-sm text-[#64748b] mt-1">Reportá bugs o solicitá nuevas funcionalidades</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-[#0a0f1e] text-sm font-bold rounded-xl hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nueva solicitud
          </button>
        </div>
      </div>

      {/* Jira not configured warning (admin only) */}
      {isAdmin && !jiraConfigured && (
        <div className="mb-5 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#f97316]/10 border border-[#f97316]/30">
          <svg className="w-4 h-4 text-[#f97316] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-[#f97316]">
            Jira no está configurado. Definí las variables de entorno <span className="font-mono">JIRA_BASE_URL</span>, <span className="font-mono">JIRA_EMAIL</span>, <span className="font-mono">JIRA_API_TOKEN</span> y <span className="font-mono">JIRA_PROJECT_KEY</span> para habilitar la integración.
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-5">
        {[
          { key: 'all',        label: 'Total',       color: '#64748b' },
          { key: 'open',       label: 'Abiertos',    color: '#00d4ff' },
          { key: 'in_progress',label: 'En proceso',  color: '#f97316' },
          { key: 'resolved',   label: 'Resueltos',   color: '#22c55e' },
          { key: 'closed',     label: 'Cerrados',    color: '#475569' },
        ].map(s => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className={`bg-[#111827] border rounded-xl px-4 py-3 text-left transition-all ${
              filter === s.key
                ? 'border-accent/40 bg-accent/5'
                : 'border-[#1e3a5f] hover:border-[#2d4a6f]'
            }`}
          >
            <div className="text-2xl font-bold" style={{ color: filter === s.key ? '#00d4ff' : s.color }}>
              {counts[s.key]}
            </div>
            <div className="text-[11px] text-[#64748b] mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3d5270]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tickets…"
            className="w-full bg-[#111827] border border-[#1e3a5f] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-[#3d5270] focus:outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-[#64748b] text-sm">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="text-4xl mb-3">🎫</div>
          <div className="text-sm font-medium text-white mb-1">
            {tickets.length === 0 ? 'Sin solicitudes aún' : 'Sin resultados para los filtros aplicados'}
          </div>
          <div className="text-xs text-[#64748b]">
            {tickets.length === 0
              ? 'Creá tu primera solicitud de soporte o funcionalidad'
              : 'Probá cambiar el filtro o la búsqueda'}
          </div>
          {tickets.length === 0 && (
            <button
              onClick={() => setShowNew(true)}
              className="mt-4 px-4 py-2 bg-accent text-[#0a0f1e] text-sm font-bold rounded-xl hover:opacity-90 transition-opacity"
            >
              Nueva solicitud
            </button>
          )}
        </div>
      ) : (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-2 border-b border-[#1e3a5f] bg-[#0d1525]">
            <div className="w-5 flex-shrink-0" />
            <div className="flex-1 text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">Solicitud</div>
            <div className="hidden md:block text-[11px] font-semibold text-[#64748b] uppercase tracking-wider text-right w-36">Actualización</div>
            <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider w-14 text-center">Prior.</div>
            <div className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider w-20 text-center">Estado</div>
          </div>
          {filtered.map(t => (
            <TicketRow
              key={t.id}
              ticket={t}
              onClick={() => setSelected(t)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {showNew && (
        <NewTicketModal
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}

      {selected && (
        <TicketDetailModal
          ticket={selected}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}

    </div>
  )
}
