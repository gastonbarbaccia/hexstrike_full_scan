import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import SeverityBadge from '../components/SeverityBadge'
import { useFmtDate } from '../context/SettingsContext'

const STATUS_CONFIG = {
  running:   { label: 'Ejecutando', color: '#22d3ee', bg: 'rgba(34,211,238,0.15)',  border: 'rgba(34,211,238,0.45)', dotCls: 'bg-cyan-400 animate-pulse' },
  completed: { label: 'Completado', color: '#16a34a', bg: 'rgba(22,163,74,0.15)',   border: 'rgba(22,163,74,0.5)',   dotCls: 'bg-green-600' },
  failed:    { label: 'Fallido',    color: '#f87171', bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.45)',dotCls: 'bg-red-400' },
  pending:   { label: 'Pendiente',  color: '#facc15', bg: 'rgba(250,204,21,0.15)',  border: 'rgba(250,204,21,0.45)', dotCls: 'bg-yellow-400' },
  cancelled: { label: 'Cancelado',  color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',  border: 'rgba(156,163,175,0.35)',dotCls: 'bg-gray-500' },
}

function StatCard({ label, value, color = 'text-white', sub }) {
  return (
    <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl p-5">
      <div className="text-[11px] text-[#64748b] uppercase tracking-widest mb-1">{label}</div>
      <div className={`text-3xl font-bold ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-[#64748b] mt-1">{sub}</div>}
    </div>
  )
}

function SeverityCard({ label, count, textColor, borderColor }) {
  return (
    <div
      className="sev-card rounded-xl p-5 flex flex-col justify-between border"
      style={{
        background: `${borderColor}18`,
        borderColor: `${borderColor}45`,
        borderTop: `3px solid ${borderColor}`,
      }}
    >
      <div className="text-sm font-bold uppercase tracking-widest mb-1" style={{ color: `${borderColor}cc` }}>{label}</div>
      <div className={`text-3xl font-bold ${textColor}`}>{count ?? 0}</div>
    </div>
  )
}

function ScanRow({ scan, onDelete, onRetry }) {
  const target = scan.target
  const cfg = STATUS_CONFIG[scan.status] ?? STATUS_CONFIG.pending
  const fc = scan.findings_count ?? {}
  const totalFindings = Object.values(fc).reduce((a, b) => a + b, 0)
  const fmt = useFmtDate()
  const canDelete = !['pending', 'running'].includes(scan.status)
  const canRetry  = scan.status === 'failed'

  const handleDelete = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`¿Eliminar scan de "${target?.name ?? scan.target_id}"?`)) return
    try {
      await api.scans.delete(scan.id)
      onDelete(scan.id)
    } catch (err) {
      alert(err.message)
    }
  }

  const handleRetry = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const newScan = await api.scans.start({
        target_id: scan.target_id,
        profile: scan.profile,
        environment_id: scan.environment_id ?? undefined,
        scan_config: scan.scan_config ?? undefined,
      })
      onRetry(newScan)
    } catch (err) {
      alert(err.message)
    }
  }

  return (
    <Link to={`/scan/${scan.id}`} className="block hover:bg-[#111827]/70 transition-colors">
      <div className="flex items-center gap-4 px-5 py-4 border-b border-[#1e3a5f] last:border-0">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">
            {target?.name ?? `Target #${scan.target_id}`}
          </div>
          <div className="text-xs text-[#64748b] truncate">
            {target?.url || target?.ip || '—'} &middot; {scan.profile?.toUpperCase()}
          </div>
        </div>

        <div className="hidden sm:flex items-center">
          <span
            className="inline-flex items-center justify-center px-3 py-1 rounded-full border text-xs font-semibold"
            style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
          >
            {cfg.label}
          </span>
        </div>

        {scan.current_phase && scan.status !== 'completed' && (
          <div className="hidden md:block text-xs font-mono text-[#64748b] max-w-[140px] truncate">
            {scan.current_phase}
          </div>
        )}

        <div className="flex gap-1.5 items-center">
          {fc.critical > 0 && <span className="text-red-400 text-xs font-bold">{fc.critical}C</span>}
          {fc.high > 0 && <span className="text-orange-400 text-xs font-bold">{fc.high}H</span>}
          {fc.medium > 0 && <span className="text-yellow-400 text-xs font-bold">{fc.medium}M</span>}
          {totalFindings === 0 && <span className="text-[#64748b] text-xs">—</span>}
        </div>

        <div className="hidden lg:flex flex-col gap-0.5 text-xs text-[#64748b] text-right">
          {(() => {
            const toUTC = (s) => s ? new Date(/Z|[+-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z') : null
            const start = toUTC(scan.started_at)
            const end   = toUTC(scan.finished_at)
            const diffMs = start && end ? end - start : null
            const dur = diffMs !== null
              ? diffMs < 60000
                ? `${Math.round(diffMs / 1000)}s`
                : diffMs < 3600000
                  ? `${Math.floor(diffMs / 60000)}m ${Math.round((diffMs % 60000) / 1000)}s`
                  : `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m`
              : null
            return (
              <>
                {start && <span><span className="text-[#475569]">Inicio:</span> {fmt(scan.started_at)}</span>}
                {end   && <span><span className="text-[#475569]">Fin:</span> {fmt(scan.finished_at)}</span>}
                {dur   && <span><span className="text-[#475569]">Duración:</span> <span className="text-accent font-semibold">{dur}</span></span>}
              </>
            )
          })()}
        </div>

        {canRetry && (
          <button
            onClick={handleRetry}
            className="flex-shrink-0 p-1.5 rounded-lg text-[#64748b] hover:text-accent hover:bg-accent/10 transition-colors"
            title="Reintentar scan"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}

        {canDelete && (
          <button
            onClick={handleDelete}
            className="flex-shrink-0 p-1.5 rounded-lg text-[#64748b] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Eliminar scan"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}

        <svg className="w-4 h-4 text-[#1e3a5f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [scans, setScans] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const [s, sc] = await Promise.all([api.dashboard(), api.scans.list()])
      setStats(s)
      setScans(sc)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 10000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#64748b] text-sm">
        Cargando...
      </div>
    )
  }

  const sev = stats?.findings_by_severity ?? {}

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-[#64748b] mt-0.5">Visión general de la plataforma</p>
        </div>
        <Link
          to="/scan/new"
          className="flex items-center gap-2 px-4 py-2 bg-accent text-[#0a0f1e] font-bold text-sm rounded-lg hover:bg-cyan-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuevo Scan
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Targets" value={stats?.total_targets} />
        <StatCard label="Scans totales" value={stats?.total_scans} />
        <StatCard label="En ejecución" value={stats?.running_scans} color="text-accent" />
        <StatCard label="Hallazgos" value={stats?.total_findings} color="text-orange-400" />
      </div>

      {/* Findings by severity */}
      <div>
        <div className="text-xs text-[#64748b] uppercase tracking-widest mb-3">Hallazgos por severidad</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
          <SeverityCard label="Critical" count={sev.CRITICAL} textColor="text-red-400"    borderColor="#ef4444" />
          <SeverityCard label="High"     count={sev.HIGH}     textColor="text-orange-400" borderColor="#f97316" />
          <SeverityCard label="Medium"   count={sev.MEDIUM}   textColor="text-yellow-400" borderColor="#eab308" />
          <SeverityCard label="Low"      count={sev.LOW}      textColor="text-green-400"  borderColor="#15803d" />
          <SeverityCard label="Info"     count={sev.INFO}     textColor="text-cyan-400"   borderColor="#00d4ff" />
        </div>
      </div>

      {/* Recent scans */}
      <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl overflow-hidden">
        <div className="section-header flex items-center justify-between px-5 py-4 border-b border-[#1e3a5f]">
          <span className="text-sm font-semibold text-white">Scans recientes</span>
          <span className="text-xs text-[#64748b]">{scans.length} total</span>
        </div>
        {scans.length === 0 ? (
          <div className="text-center py-16 text-[#64748b]">
            <div className="text-4xl mb-3">🎯</div>
            <div className="text-sm">No hay scans aún.</div>
            <Link to="/scan/new" className="mt-3 inline-block text-accent text-sm hover:underline">
              Iniciar primer scan →
            </Link>
          </div>
        ) : (
          scans.map(scan => (
            <ScanRow
              key={scan.id}
              scan={scan}
              onDelete={id => setScans(s => s.filter(x => x.id !== id))}
              onRetry={newScan => setScans(s => [newScan, ...s])}
            />
          ))
        )}
      </div>
    </div>
  )
}
