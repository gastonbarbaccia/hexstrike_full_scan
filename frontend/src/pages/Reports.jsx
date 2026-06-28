import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useFmtDate } from '../context/SettingsContext'

const PROFILE_LABELS = { web: 'Web', network: 'Red', full: 'Full' }

const SEV_TIERS = [
  { key: 'critical', label: 'Critical', text: 'text-red-400',    border: '#ef4444' },
  { key: 'high',     label: 'High',     text: 'text-orange-400', border: '#f97316' },
  { key: 'medium',   label: 'Medium',   text: 'text-yellow-400', border: '#eab308' },
  { key: 'low',      label: 'Low',      text: 'text-green-700',  border: '#15803d' },
  { key: 'info',     label: 'Info',     text: 'text-cyan-400',   border: '#00d4ff' },
]

function calcScore(fc = {}) {
  const crit = fc.critical ?? 0
  const high = fc.high     ?? 0
  const med  = fc.medium   ?? 0
  const low  = fc.low      ?? 0
  const penalty = Math.min(crit * 15, 45) + Math.min(high * 6, 24) + Math.min(med * 2, 10) + Math.min(low * 1, 5)
  return Math.max(0, 100 - penalty)
}

function scoreColor(s) {
  return s >= 75 ? 'text-green-400' : s >= 50 ? 'text-yellow-400' : s >= 25 ? 'text-orange-400' : 'text-red-400'
}

function scoreLabel(s) {
  return s >= 75 ? 'SEGURO' : s >= 50 ? 'MODERADO' : s >= 25 ? 'EN RIESGO' : 'CRÍTICO'
}

function ScoreRing({ score }) {
  const R    = 18
  const circ = +(2 * Math.PI * R).toFixed(2)
  const dash = +(circ - (score / 100) * circ).toFixed(2)
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : score >= 25 ? '#f97316' : '#ef4444'

  return (
    <div className="relative w-12 h-12 flex-shrink-0">
      <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
        <circle cx="22" cy="22" r={R} fill="none" stroke="#1a2d4a" strokeWidth="4" />
        <circle cx="22" cy="22" r={R} fill="none"
          stroke={color} strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={dash}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-bold" style={{ color }}>{score}</span>
      </div>
    </div>
  )
}

function ScanReportCard({ scan }) {
  const fc    = scan.findings_count ?? {}
  const score = calcScore(fc)

  const toUTC = (s) => s ? new Date(/Z|[+-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z') : null
  const start  = toUTC(scan.started_at)
  const end    = toUTC(scan.finished_at)
  const diffMs = start && end ? end - start : null
  const dur    = diffMs !== null
    ? diffMs < 60000
      ? `${Math.round(diffMs / 1000)}s`
      : diffMs < 3600000
        ? `${Math.floor(diffMs / 60000)}m ${Math.round((diffMs % 60000) / 1000)}s`
        : `${Math.floor(diffMs / 3600000)}h ${Math.floor((diffMs % 3600000) / 60000)}m`
    : null
  const fmtDate = useFmtDate()

  return (
    <div className="border-b border-[#1e3a5f] last:border-0 px-4 py-4 space-y-3">
      {/* Top row: score + meta + report buttons */}
      <div className="flex items-center gap-4">
        <ScoreRing score={score} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-bold ${scoreColor(score)}`}>{score}/100</span>
            <span className={`text-[10px] border rounded px-1 py-0.5 font-mono font-bold ${scoreColor(score)} border-current`}>
              {scoreLabel(score)}
            </span>
            <span className="text-[10px] text-[#64748b] border border-[#1e3a5f] rounded px-1.5 py-0.5 font-mono">
              {PROFILE_LABELS[scan.profile] ?? scan.profile}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5 text-xs text-[#64748b]">
            {start && <span><span className="text-[#475569]">Inicio:</span> {fmtDate(scan.started_at)}</span>}
            {end   && <span><span className="text-[#475569]">Fin:</span> {fmtDate(scan.finished_at)}</span>}
            {dur   && <span><span className="text-[#475569]">Duración:</span> <span className="text-accent font-semibold">{dur}</span></span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            to={`/scan/${scan.id}?report=technical`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0d1525] border border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10 transition-colors"
          >
            🔬 Reporte Técnico
          </Link>
          <Link
            to={`/scan/${scan.id}?report=executive`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#1a0a2e] border border-[#7c3aed]/30 text-[#a78bfa] hover:bg-[#7c3aed]/10 transition-colors"
          >
            📊 Reporte Ejecutivo
          </Link>
        </div>
      </div>

      {/* Severity count cards */}
      <div className="grid grid-cols-5 gap-2">
        {SEV_TIERS.map(({ key, label, text, border }) => {
          const count = fc[key] ?? 0
          return (
            <div
              key={key}
              className="rounded-lg px-3 py-2.5 border"
              style={{
                background: `${border}18`,
                borderColor: `${border}45`,
                borderTop: `3px solid ${border}`,
              }}
            >
              <div className={`text-xl font-bold ${text}`}>{count}</div>
              <div className="text-sm font-bold mt-0.5" style={{ color: `${border}cc` }}>{label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TargetSection({ target, scans }) {
  const completedScans = scans.filter(s => s.status === 'completed')
  const totalFindings  = completedScans.reduce((acc, s) => {
    return acc + Object.values(s.findings_count ?? {}).reduce((a, b) => a + b, 0)
  }, 0)

  return (
    <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1e3a5f] flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">{target.name}</div>
          <div className="text-xs text-[#64748b] truncate">{target.url || target.ip || '—'}</div>
        </div>
        <div className="flex items-center gap-3 text-xs text-[#64748b] flex-shrink-0">
          <span>{completedScans.length} {completedScans.length === 1 ? 'scan' : 'scans'}</span>
          {totalFindings > 0 && (
            <span className="text-orange-400 font-semibold">{totalFindings} hallazgos</span>
          )}
        </div>
      </div>

      {completedScans.length === 0 ? (
        <div className="px-5 py-8 text-center text-xs text-[#64748b]">
          Sin reportes generados aún
        </div>
      ) : (
        completedScans.map(scan => <ScanReportCard key={scan.id} scan={scan} />)
      )}
    </div>
  )
}

export default function Reports() {
  const [targets, setTargets] = useState([])
  const [scans, setScans]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.targets.list(), api.scans.list()])
      .then(([t, s]) => { setTargets(t); setScans(s) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-[#64748b] text-sm">
        Cargando reportes...
      </div>
    )
  }

  const scansByTarget  = scans.reduce((acc, s) => {
    if (!acc[s.target_id]) acc[s.target_id] = []
    acc[s.target_id].push(s)
    return acc
  }, {})
  const targetsWithScans = targets.filter(t => scansByTarget[t.id]?.length > 0)
  const totalReports     = scans.filter(s => s.status === 'completed').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Reportes</h1>
        <p className="text-sm text-[#64748b] mt-0.5">
          {totalReports} {totalReports === 1 ? 'reporte generado' : 'reportes generados'} en {targetsWithScans.length} {targetsWithScans.length === 1 ? 'target' : 'targets'}
        </p>
      </div>

      {targetsWithScans.length === 0 ? (
        <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl py-20 text-center">
          <div className="text-4xl mb-3">📄</div>
          <div className="text-sm text-[#64748b]">No hay reportes generados aún.</div>
          <Link to="/scan/new" className="mt-3 inline-block text-accent text-sm hover:underline">
            Iniciar un scan →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {targetsWithScans.map(target => (
            <TargetSection key={target.id} target={target} scans={scansByTarget[target.id] ?? []} />
          ))}
        </div>
      )}
    </div>
  )
}
