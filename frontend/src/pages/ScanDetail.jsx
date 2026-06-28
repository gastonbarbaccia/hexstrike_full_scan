import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import SeverityBadge from '../components/SeverityBadge'
import { useNotifications } from '../context/NotificationContext'
import { useFmtDate } from '../context/SettingsContext'

function buildReportPage(content, title = 'HexStrike Report', meta = {}) {
  const safe = (content || '').trim()
  const html = safe.replace(/^```(?:html)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  const { target = '', profile = '', findings_count = {}, completed_phases = [], created_at = '' } = meta
  const fc = findings_count
  const crit = fc.critical ?? 0
  const high = fc.high ?? 0
  const med  = fc.medium  ?? 0
  const low  = fc.low     ?? 0
  const info = fc.info    ?? 0
  const total = crit + high + med + low + info

  // Weighted penalty with soft caps per severity tier
  const penalty = Math.min(crit * 15, 45) + Math.min(high * 6, 24) + Math.min(med * 2, 10) + Math.min(low * 1, 5)
  const score   = Math.max(0, 100 - penalty)
  const scoreColor = score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : score >= 25 ? '#f97316' : '#ef4444'
  const scoreLabel = score >= 75 ? 'SEGURO' : score >= 50 ? 'MODERADO' : score >= 25 ? 'EN RIESGO' : 'CRÍTICO'

  const R   = 40
  const circ = +(2 * Math.PI * R).toFixed(2)
  const dash = +(circ - (score / 100) * circ).toFixed(2)

  const isExec = title.toLowerCase().includes('ejecutivo')

  const dateFmt = created_at
    ? new Date(created_at).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })

  const phasesHtml = completed_phases.length
    ? completed_phases.map(p => `<span class="ptag">${p}</span>`).join('')
    : ''

  const scoreRing = `
    <div class="ring-outer">
      <svg class="ring-svg" viewBox="0 0 100 100">
        <circle class="ring-bg" cx="50" cy="50" r="${R}"/>
        <circle class="ring-fg" cx="50" cy="50" r="${R}" stroke-dasharray="${circ}" stroke-dashoffset="${dash}"/>
      </svg>
      <div class="ring-center">
        <div class="score-num">${score}</div>
        <div class="score-denom">/100</div>
      </div>
    </div>
    <div class="score-lbl">${scoreLabel}</div>`

  const statsBar = `
    <div class="stats">
      <div class="sc cr"><div class="sn cc">${crit}</div><div class="sl">Crítico</div></div>
      <div class="sc hi"><div class="sn ch">${high}</div><div class="sl">Alto</div></div>
      <div class="sc me"><div class="sn cm">${med}</div><div class="sl">Medio</div></div>
      <div class="sc lo"><div class="sn cl">${low}</div><div class="sl">Bajo</div></div>
      <div class="sc in"><div class="sn ci">${info}</div><div class="sl">Info</div></div>
    </div>`

  const phasesBar = phasesHtml
    ? `<div class="phases"><span class="pl">Fases completadas</span>${phasesHtml}</div>`
    : ''

  const emptyMsg = isExec
    ? '<p style="padding:3rem;text-align:center;color:#94a3b8">El reporte no está disponible aún.</p>'
    : '<div style="padding:3rem;text-align:center;color:#3d5270">El reporte no está disponible aún.</div>'

  // ── DARK theme (Técnico) ──────────────────────────────────────────────────
  if (!isExec) {
    const accent = '#00d4ff'
    return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HexStrike — ${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{background:#050d1a}
body{background:#050d1a;color:#e2e8f0;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.6;min-height:100vh}
.wrap{max-width:1200px;margin:0 auto}
.hdr{background:linear-gradient(135deg,#080f1f 0%,#0d1b30 60%,#080f1f 100%);border-bottom:1px solid ${accent}28;padding:2rem 2.5rem;position:relative;overflow:hidden}
.hdr::before{content:'';position:absolute;top:-60%;left:-10%;width:50%;height:220%;background:radial-gradient(ellipse,${accent}09 0%,transparent 65%);pointer-events:none}
.hdr-inner{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem}
.brand-ico{width:38px;height:38px;background:linear-gradient(135deg,${accent},${accent}99);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:900;color:#050d1a;flex-shrink:0}
.brand-name{font-size:1rem;font-weight:800;color:${accent};letter-spacing:.06em}
.brand-sub{font-size:9px;color:#3d5270;letter-spacing:.2em;text-transform:uppercase;margin-top:1px}
.rpt-title{font-size:1.55rem;font-weight:800;color:#fff;line-height:1.2;margin-bottom:.65rem}
.pills{display:flex;flex-wrap:wrap;gap:.4rem}
.pill{display:inline-flex;align-items:center;gap:.3rem;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:600;border:1px solid}
.p-target{background:${accent}12;border-color:${accent}30;color:${accent}}
.p-date{background:#64748b18;border-color:#64748b35;color:#64748b}
.p-profile{background:#a855f712;border-color:#a855f730;color:#c084fc}
.p-total{background:#64748b18;border-color:#64748b35;color:#64748b}
.score-wrap{display:flex;flex-direction:column;align-items:center;gap:.4rem;flex-shrink:0}
.ring-svg{width:100px;height:100px}
.ring-bg{fill:none;stroke:#1a2d4a;stroke-width:8}
.ring-fg{fill:none;stroke:${scoreColor};stroke-width:8;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%}
.ring-outer{position:relative;width:100px;height:100px}
.ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.score-num{font-size:1.65rem;font-weight:900;color:${scoreColor};line-height:1}
.score-denom{font-size:9px;color:#3d5270;margin-top:1px}
.score-lbl{font-size:10px;font-weight:800;letter-spacing:.14em;color:${scoreColor};text-transform:uppercase}
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:.65rem;background:#070e1b;padding:1.25rem 2.5rem;border-bottom:1px solid #0f1f3a}
.sc{background:#0b1425;border:1px solid #162236;border-radius:12px;padding:.85rem .75rem;text-align:center}
.sc.cr{border-top:2px solid #ef4444}.sc.hi{border-top:2px solid #f97316}.sc.me{border-top:2px solid #eab308}.sc.lo{border-top:2px solid #22c55e}.sc.in{border-top:2px solid ${accent}}
.sn{font-size:1.85rem;font-weight:900;line-height:1;margin-bottom:.2rem}
.sl{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#3d5270;font-weight:700}
.cc{color:#ef4444}.ch{color:#f97316}.cm{color:#eab308}.cl{color:#22c55e}.ci{color:${accent}}
.phases{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;padding:.75rem 2.5rem;background:#060c19;border-bottom:1px solid #0f1f3a}
.pl{font-size:9px;color:#3d5270;text-transform:uppercase;letter-spacing:.12em;font-weight:700;margin-right:.4rem}
.ptag{display:inline-flex;align-items:center;gap:.25rem;padding:2px 8px;background:#0b1425;border:1px solid #162236;border-radius:100px;font-size:10px;font-family:monospace;color:#4d6585}
.ptag::before{content:'✓';color:#22c55e;font-size:9px;margin-right:1px}
.body{padding:2rem 2.5rem}
h1{font-size:1.5rem;font-weight:800;color:#fff;margin:0 0 .5rem}
h2{font-size:.78rem;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:.15em;margin:2.5rem 0 1rem;padding-bottom:.5rem;border-bottom:1px solid #162236;display:flex;align-items:center;gap:.5rem}
h2::before{content:'';display:inline-block;width:3px;height:13px;background:${accent};border-radius:2px;flex-shrink:0}
h3{font-size:.9rem;font-weight:600;color:#cbd5e1;margin:1.5rem 0 .5rem;padding:.5rem .75rem;background:#0b1425;border-left:3px solid ${accent}66;border-radius:0 6px 6px 0}
p{margin:.5rem 0;color:#8899b0;line-height:1.75}
strong{color:#cbd5e1;font-weight:600}
a{color:${accent}}
hr{border:none;border-top:1px solid #162236;margin:2rem 0}
ul,ol{padding-left:1.4rem;margin:.6rem 0;color:#8899b0}
li{margin:.3rem 0;line-height:1.65}
li::marker{color:${accent}88}
table{width:100%;border-collapse:separate;border-spacing:0;margin:1rem 0;font-size:13px;border-radius:10px;overflow:hidden;border:1px solid #162236}
thead{background:linear-gradient(90deg,#0d1525,#0b1425)}
th{color:#3d5270;font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;padding:10px 14px;border-bottom:1px solid #162236;text-align:left;white-space:nowrap}
td{padding:10px 14px;border-bottom:1px solid #0c1b2e;color:#8899b0;vertical-align:top;line-height:1.5}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#0d1b30;color:#cbd5e1}
[data-sev="CRITICAL"],[data-sev="critical"]{color:#ef4444;font-weight:700}
[data-sev="HIGH"],[data-sev="high"]{color:#f97316;font-weight:700}
[data-sev="MEDIUM"],[data-sev="medium"]{color:#eab308;font-weight:600}
[data-sev="LOW"],[data-sev="low"]{color:#22c55e;font-weight:600}
[data-sev="INFO"],[data-sev="info"]{color:${accent}}
tr[data-sev="CRITICAL"] td{background:rgba(239,68,68,.05)}
tr[data-sev="HIGH"] td{background:rgba(249,115,22,.04)}
code{font-family:'Courier New',monospace;background:#020810;color:#7dd3fc;border:1px solid #162236;border-radius:4px;font-size:12px;padding:1px 5px}
pre{font-family:'Courier New',monospace;background:#020810;color:#7dd3fc;border:1px solid #162236;border-radius:8px;font-size:12px;padding:1rem;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:.75rem 0}
.ftr{margin-top:2.5rem;padding:1.25rem 2.5rem;border-top:1px solid #0f1f3a;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#243347;flex-wrap:wrap;gap:.5rem}
.ftr-brand{font-weight:700;color:#2d3f55}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}html,body{background:#050d1a}.hdr{box-shadow:none}}
</style></head>
<body><div class="wrap">
  <div class="hdr"><div class="hdr-inner">
    <div>
      <div class="brand"><div class="brand-ico">H⚡</div><div><div class="brand-name">HexStrike AI</div><div class="brand-sub">Pentest Platform</div></div></div>
      <div class="rpt-title">${title}</div>
      <div class="pills">
        ${target  ? `<span class="pill p-target">🎯 ${target}</span>` : ''}
        ${dateFmt ? `<span class="pill p-date">📅 ${dateFmt}</span>` : ''}
        ${profile ? `<span class="pill p-profile">⚡ ${profile.toUpperCase()}</span>` : ''}
        <span class="pill p-total">📊 ${total} hallazgos</span>
      </div>
    </div>
    <div class="score-wrap">${scoreRing}</div>
  </div></div>
  ${statsBar}${phasesBar}
  <div class="body">${html || emptyMsg}</div>
  <div class="ftr">
    <span class="ftr-brand">HexStrike AI</span> &nbsp;·&nbsp; Generado el ${dateFmt}
    <span>Puntaje: <strong style="color:${scoreColor}">${score}/100 — ${scoreLabel}</strong></span>
  </div>
</div></body></html>`
  }

  // ── LIGHT theme (Ejecutivo) ───────────────────────────────────────────────
  const accent = '#7c3aed'
  return `<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HexStrike — ${title}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{background:#f8fafc}
body{background:#f8fafc;color:#1e293b;font-family:'Segoe UI',system-ui,sans-serif;font-size:14px;line-height:1.6;min-height:100vh}
.wrap{max-width:1200px;margin:0 auto}
/* Header */
.hdr{background:linear-gradient(135deg,#ffffff 0%,#f1f5f9 100%);border-bottom:2px solid #e2e8f0;padding:2rem 2.5rem;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.hdr::before{content:'';position:absolute;top:-40%;right:5%;width:35%;height:200%;background:radial-gradient(ellipse,${accent}08 0%,transparent 70%);pointer-events:none}
.hdr-inner{display:flex;justify-content:space-between;align-items:flex-start;gap:2rem;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem}
.brand-ico{width:38px;height:38px;background:linear-gradient(135deg,${accent},#a78bfa);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:900;color:#fff;flex-shrink:0}
.brand-name{font-size:1rem;font-weight:800;color:${accent};letter-spacing:.06em}
.brand-sub{font-size:9px;color:#94a3b8;letter-spacing:.2em;text-transform:uppercase;margin-top:1px}
.rpt-title{font-size:1.55rem;font-weight:800;color:#0f172a;line-height:1.2;margin-bottom:.65rem}
.pills{display:flex;flex-wrap:wrap;gap:.4rem}
.pill{display:inline-flex;align-items:center;gap:.3rem;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:600;border:1px solid}
.p-target{background:#ede9fe;border-color:#c4b5fd;color:${accent}}
.p-date{background:#f1f5f9;border-color:#cbd5e1;color:#64748b}
.p-profile{background:#fdf4ff;border-color:#e9d5ff;color:#9333ea}
.p-total{background:#f1f5f9;border-color:#cbd5e1;color:#64748b}
/* Score ring */
.score-wrap{display:flex;flex-direction:column;align-items:center;gap:.4rem;flex-shrink:0}
.ring-svg{width:100px;height:100px}
.ring-bg{fill:none;stroke:#e2e8f0;stroke-width:8}
.ring-fg{fill:none;stroke:${scoreColor};stroke-width:8;stroke-linecap:round;transform:rotate(-90deg);transform-origin:50% 50%}
.ring-outer{position:relative;width:100px;height:100px}
.ring-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.score-num{font-size:1.65rem;font-weight:900;color:${scoreColor};line-height:1}
.score-denom{font-size:9px;color:#94a3b8;margin-top:1px}
.score-lbl{font-size:10px;font-weight:800;letter-spacing:.14em;color:${scoreColor};text-transform:uppercase}
/* Stats */
.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:.65rem;background:#f1f5f9;padding:1.25rem 2.5rem;border-bottom:1px solid #e2e8f0}
.sc{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:.85rem .75rem;text-align:center;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.sc.cr{border-top:2px solid #ef4444}.sc.hi{border-top:2px solid #f97316}.sc.me{border-top:2px solid #eab308}.sc.lo{border-top:2px solid #22c55e}.sc.in{border-top:2px solid ${accent}}
.sn{font-size:1.85rem;font-weight:900;line-height:1;margin-bottom:.2rem}
.sl{font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#94a3b8;font-weight:700}
.cc{color:#ef4444}.ch{color:#f97316}.cm{color:#eab308}.cl{color:#22c55e}.ci{color:${accent}}
/* Phases */
.phases{display:flex;flex-wrap:wrap;gap:.4rem;align-items:center;padding:.75rem 2.5rem;background:#fff;border-bottom:1px solid #e2e8f0}
.pl{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.12em;font-weight:700;margin-right:.4rem}
.ptag{display:inline-flex;align-items:center;gap:.25rem;padding:2px 8px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:100px;font-size:10px;font-family:monospace;color:#64748b}
.ptag::before{content:'✓';color:#22c55e;font-size:9px;margin-right:1px}
/* Content */
.body{padding:2.5rem 2.5rem;background:#fff}
h1{font-size:1.4rem;font-weight:800;color:#0f172a;margin:0 0 .5rem}
h2{font-size:.75rem;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:.15em;margin:2.5rem 0 1rem;padding-bottom:.5rem;border-bottom:2px solid #ede9fe;display:flex;align-items:center;gap:.5rem}
h2::before{content:'';display:inline-block;width:3px;height:13px;background:${accent};border-radius:2px;flex-shrink:0}
h3{font-size:.9rem;font-weight:700;color:#1e293b;margin:1.5rem 0 .5rem;padding:.5rem .85rem;background:#f8f5ff;border-left:3px solid ${accent};border-radius:0 6px 6px 0}
p{margin:.5rem 0;color:#475569;line-height:1.8}
strong{color:#1e293b;font-weight:600}
em{color:#64748b;font-style:italic}
a{color:${accent}}
hr{border:none;border-top:1px solid #e2e8f0;margin:2rem 0}
ul,ol{padding-left:1.4rem;margin:.6rem 0;color:#475569}
li{margin:.3rem 0;line-height:1.65}
li::marker{color:${accent}}
/* Tables */
table{width:100%;border-collapse:separate;border-spacing:0;margin:1rem 0;font-size:13px;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 1px 3px rgba(0,0,0,.04)}
thead{background:linear-gradient(90deg,#f8fafc,#f1f5f9)}
th{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:700;padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}
td{padding:10px 14px;border-bottom:1px solid #f1f5f9;color:#475569;vertical-align:top;line-height:1.5}
tbody tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#faf7ff;color:#1e293b}
[data-sev="CRITICAL"],[data-sev="critical"]{color:#dc2626;font-weight:700}
[data-sev="HIGH"],[data-sev="high"]{color:#ea580c;font-weight:700}
[data-sev="MEDIUM"],[data-sev="medium"]{color:#ca8a04;font-weight:600}
[data-sev="LOW"],[data-sev="low"]{color:#16a34a;font-weight:600}
[data-sev="INFO"],[data-sev="info"]{color:${accent}}
tr[data-sev="CRITICAL"] td{background:#fff5f5}
tr[data-sev="HIGH"] td{background:#fff8f5}
tr[data-sev="MEDIUM"] td{background:#fefce8}
code{font-family:'Courier New',monospace;background:#f8fafc;color:#7c3aed;border:1px solid #e2e8f0;border-radius:4px;font-size:12px;padding:1px 5px}
pre{font-family:'Courier New',monospace;background:#f8fafc;color:#334155;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;padding:1rem;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin:.75rem 0}
/* Footer */
.ftr{background:#f8fafc;margin-top:0;padding:1.25rem 2.5rem;border-top:2px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#94a3b8;flex-wrap:wrap;gap:.5rem}
.ftr-brand{font-weight:700;color:#64748b}
@media print{html,body{background:#fff}.hdr{box-shadow:none}.body{padding:1rem}}
</style></head>
<body><div class="wrap">
  <div class="hdr"><div class="hdr-inner">
    <div>
      <div class="brand"><div class="brand-ico">H⚡</div><div><div class="brand-name">HexStrike AI</div><div class="brand-sub">Pentest Platform</div></div></div>
      <div class="rpt-title">${title}</div>
      <div class="pills">
        ${target  ? `<span class="pill p-target">🎯 ${target}</span>` : ''}
        ${dateFmt ? `<span class="pill p-date">📅 ${dateFmt}</span>` : ''}
        ${profile ? `<span class="pill p-profile">⚡ ${profile.toUpperCase()}</span>` : ''}
        <span class="pill p-total">📊 ${total} hallazgos</span>
      </div>
    </div>
    <div class="score-wrap">${scoreRing}</div>
  </div></div>
  ${statsBar}${phasesBar}
  <div class="body">${html || emptyMsg}</div>
  <div class="ftr">
    <span class="ftr-brand">HexStrike AI Pentest Platform</span> &nbsp;·&nbsp; Generado el ${dateFmt}
    <span>Puntaje de Seguridad: <strong style="color:${scoreColor}">${score}/100 — ${scoreLabel}</strong></span>
  </div>
</div></body></html>`
}

const STATUS_CONFIG = {
  running:   { label: 'Ejecutando', color: '#22d3ee', bg: 'rgba(34,211,238,0.15)',  border: 'rgba(34,211,238,0.45)', dotCls: 'bg-cyan-400 animate-pulse' },
  completed: { label: 'Completado', color: '#16a34a', bg: 'rgba(22,163,74,0.15)',   border: 'rgba(22,163,74,0.5)',   dotCls: 'bg-green-600' },
  failed:    { label: 'Fallido',    color: '#f87171', bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.45)',dotCls: 'bg-red-400' },
  pending:   { label: 'Pendiente',  color: '#facc15', bg: 'rgba(250,204,21,0.15)',  border: 'rgba(250,204,21,0.45)', dotCls: 'bg-yellow-400' },
  cancelled: { label: 'Cancelado',  color: '#9ca3af', bg: 'rgba(156,163,175,0.1)',  border: 'rgba(156,163,175,0.35)',dotCls: 'bg-gray-500' },
}

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 }

function PhaseTag({ phase, active, done }) {
  const style = active
    ? { border: '1px solid rgba(0,212,255,0.6)', background: 'rgba(0,212,255,0.1)', color: '#00d4ff' }
    : done
      ? { border: '1px solid rgba(21,128,61,0.6)', background: 'rgba(21,128,61,0.12)', color: '#15803d' }
      : { border: '1px solid #1e3a5f', background: '#111827', color: '#64748b' }

  return (
    <span className="text-[10px] font-mono px-2 py-0.5 rounded flex items-center gap-1" style={style}>
      {done && !active && <span>✓</span>}
      {phase}
    </span>
  )
}

const REMEDIATION_OPTIONS = [
  { value: 'pending',        label: 'Pendiente',       color: '#64748b', bg: 'rgba(100,116,139,0.15)', border: 'rgba(100,116,139,0.4)' },
  { value: 'in_progress',   label: 'En progreso',     color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.4)'  },
  { value: 'remediated',    label: 'Remediado',       color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.4)'   },
  { value: 'false_positive', label: 'Falso positivo', color: '#00d4ff', bg: 'rgba(0,212,255,0.15)',   border: 'rgba(0,212,255,0.4)'   },
  { value: 'accepted',      label: 'Riesgo aceptado', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)', border: 'rgba(167,139,250,0.4)' },
]

function RemediationBadge({ scanId, findingId, current, onChange }) {
  const [saving, setSaving] = useState(false)
  const opt = REMEDIATION_OPTIONS.find(o => o.value === current) ?? REMEDIATION_OPTIONS[0]

  const handleChange = async (e) => {
    const value = e.target.value
    if (value === current) return
    setSaving(true)
    try {
      await api.scans.updateFinding(scanId, findingId, { remediation_status: value })
      onChange(findingId, value)
    } catch (_) {}
    setSaving(false)
  }

  return (
    <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
      <select
        value={current}
        onChange={handleChange}
        disabled={saving}
        className="text-xs font-semibold rounded-lg border cursor-pointer outline-none appearance-none px-3 py-1.5 transition-colors min-w-[110px]"
        style={{
          color: opt.color,
          background: opt.bg,
          borderColor: opt.border,
          opacity: saving ? 0.5 : 1,
        }}
      >
        {REMEDIATION_OPTIONS.map(o => (
          <option key={o.value} value={o.value} style={{ background: '#0d1525', color: o.color }}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function FindingCard({ scanId, finding, expanded, onToggle, onStatusChange }) {
  return (
    <div
      className={`sev-${finding.severity} border rounded-xl overflow-hidden transition-all`}
    >
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:brightness-110"
      >
        <SeverityBadge severity={finding.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold text-white text-sm leading-tight">{finding.title}</div>
            {finding.is_duplicate && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 whitespace-nowrap">
                Duplicado
              </span>
            )}
          </div>
          <div className="text-xs text-[#64748b] mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="font-mono">{finding.tool}</span>
            {finding.phase && <><span>·</span><span>{finding.phase}</span></>}
            {finding.cve && <><span>·</span><span className="text-orange-400">{finding.cve}</span></>}
            {finding.cvss && <><span>·</span><span>CVSS {finding.cvss}</span></>}
          </div>
        </div>
        <RemediationBadge
          scanId={scanId}
          findingId={finding.id}
          current={finding.remediation_status ?? 'pending'}
          onChange={onStatusChange}
        />
        <svg
          className={`w-4 h-4 text-[#64748b] flex-shrink-0 mt-0.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-current/20 px-4 py-3 space-y-3 bg-black/20">
          {finding.description && (
            <div>
              <div className="text-xs text-[#64748b] uppercase tracking-wider mb-1">Descripción</div>
              <p className="text-sm text-[#94a3b8] leading-relaxed">{finding.description}</p>
            </div>
          )}
          {finding.evidence && (
            <div>
              <div className="text-xs text-[#64748b] uppercase tracking-wider mb-1">Evidencia</div>
              <pre className="text-xs font-mono text-[#94a3b8] bg-black/30 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                {finding.evidence}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ScanDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { addNotification } = useNotifications()
  const fmtDate = useFmtDate()
  const initialReport = searchParams.get('report') === 'executive' ? 'executive' : 'technical'
  const [scan, setScan] = useState(null)
  const [findings, setFindings] = useState([])
  const [logs, setLogs] = useState([])
  const [status, setStatus] = useState('pending')
  const [phases, setPhases] = useState([])
  const [currentPhase, setCurrentPhase] = useState('')
  const [tab, setTab] = useState(searchParams.get('report') ? 'reports' : 'terminal')
  const [filterSev, setFilterSev] = useState('ALL')
  const [filterTool, setFilterTool] = useState('ALL')
  const [filterPhase, setFilterPhase] = useState('ALL')
  const [searchText, setSearchText] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [reportTab, setReportTab] = useState(initialReport)
  const [lastActivity, setLastActivity] = useState(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const terminalRef = useRef(null)
  const esRef = useRef(null)
  // Buffer SSE log events that arrive before the initial scan load completes
  const sseLogBufferRef = useRef([])
  const scanInitDoneRef = useRef(false)

  const handleStatusChange = (findingId, newStatus) => {
    setFindings(prev => prev.map(f => f.id === findingId ? { ...f, remediation_status: newStatus } : f))
  }

  // Load scan info — seed logs from persisted history first, then flush SSE buffer
  useEffect(() => {
    scanInitDoneRef.current = false
    sseLogBufferRef.current = []
    api.scans.get(id).then(s => {
      setScan(s)
      setStatus(s.status)
      setPhases(s.completed_phases || [])
      setCurrentPhase(s.current_phase || '')
      setFindings(s.findings || [])
      const historicalLines = s.log ? s.log.split('\n') : []
      const buffered = sseLogBufferRef.current.splice(0)
      setLogs([...historicalLines, ...buffered])
      scanInitDoneRef.current = true
    }).catch(console.error)
  }, [id])

  // SSE stream — buffer early log events until historical log is loaded
  useEffect(() => {
    const es = api.scans.stream(id)
    esRef.current = es

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)

        if (event.type === 'ping' || event.type === 'done') return

        setLastActivity(Date.now())

        if (event.type === 'log') {
          if (scanInitDoneRef.current) {
            setLogs(l => [...l, event.data])
          } else {
            sseLogBufferRef.current.push(event.data)
          }
        }
        if (event.type === 'phase') {
          const phase = event.data?.phase
          if (phase) {
            setCurrentPhase(phase)
            setPhases(p => p.includes(phase) ? p : [...p, phase])
          }
        }
        if (event.type === 'finding') {
          setFindings(f => {
            const existing = f.find(x => x.id === event.data.id)
            return existing ? f : [...f, event.data]
          })
        }
        if (event.type === 'status') {
          const newStatus = event.data?.status ?? status
          setStatus(newStatus)
          if (['completed', 'failed', 'cancelled'].includes(newStatus)) {
            es.close()
            api.scans.get(id).then(s => {
              setScan(s)
              const targetName = s.target?.name ?? `Scan #${id}`
              const fc = s.findings_count ?? {}
              const total = Object.values(fc).reduce((a, b) => a + b, 0)
              if (newStatus === 'completed') {
                addNotification({
                  title: `Scan completado — ${targetName}`,
                  body: `${total} hallazgo${total !== 1 ? 's' : ''} encontrado${total !== 1 ? 's' : ''}`,
                  type: total > 0 ? 'warning' : 'success',
                })
              } else if (newStatus === 'failed') {
                addNotification({ title: `Scan fallido — ${targetName}`, body: 'El scan terminó con errores', type: 'error' })
              }
            }).catch(() => {})
          }
        }
      } catch (_) {}
    }

    es.onerror = () => {
      // SSE error - try to reload status
      setTimeout(() => {
        api.scans.get(id).then(s => {
          setStatus(s.status)
          setScan(s)
        }).catch(() => {})
      }, 3000)
    }

    return () => es.close()
  }, [id])

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [logs])

  // Clock tick for live "última actividad" display
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  async function handleCancel() {
    if (!confirm('¿Cancelar el scan en curso?')) return
    setCancelling(true)
    try {
      await api.scans.cancel(id)
      setStatus('cancelled')
    } catch (e) {
      alert(e.message)
    } finally {
      setCancelling(false)
    }
  }

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  const fc = scan?.findings_count ?? {}
  const uniqueTools = ['ALL', ...new Set(findings.map(f => f.tool).filter(Boolean))]
  const uniquePhases = ['ALL', ...new Set(findings.map(f => f.phase).filter(Boolean))]

  const sortedFindings = [...findings].sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5)
  )
  const filteredFindings = sortedFindings.filter(f => {
    if (filterSev !== 'ALL' && f.severity !== filterSev) return false
    if (filterTool !== 'ALL' && f.tool !== filterTool) return false
    if (filterPhase !== 'ALL' && f.phase !== filterPhase) return false
    if (searchText) {
      const q = searchText.toLowerCase()
      const match = (
        f.title?.toLowerCase().includes(q) ||
        f.description?.toLowerCase().includes(q) ||
        f.evidence?.toLowerCase().includes(q) ||
        f.tool?.toLowerCase().includes(q) ||
        f.cve?.toLowerCase().includes(q)
      )
      if (!match) return false
    }
    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-sm text-[#64748b] mb-1">
            <Link to="/" className="hover:text-white transition-colors">Dashboard</Link>
            <span>→</span>
            <span>Scan #{id}</span>
          </div>
          <h1 className="text-2xl font-bold text-white">
            {scan?.target?.name ?? `Scan #${id}`}
          </h1>
          <div className="text-sm text-[#64748b] mt-0.5">
            {scan?.target?.url || scan?.target?.ip} &middot; Perfil: {scan?.profile?.toUpperCase()}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border text-sm font-semibold"
            style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.border }}
          >
            {cfg.label}
          </span>
          {status === 'running' && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {cancelling ? 'Cancelando...' : 'Cancelar'}
            </button>
          )}
        </div>
      </div>

      {/* Timing row */}
      {scan?.started_at && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#64748b] bg-[#111827] border border-[#1e3a5f] rounded-xl px-4 py-3">
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
                <span><span className="text-[#475569] font-medium">Inicio:</span> <span className="text-white">{fmtDate(scan.started_at)}</span></span>
                {end && <span><span className="text-[#475569] font-medium">Fin:</span> <span className="text-white">{fmtDate(scan.finished_at)}</span></span>}
                {dur && <span><span className="text-[#475569] font-medium">Duración:</span> <span className="text-accent font-semibold">{dur}</span></span>}
              </>
            )
          })()}
        </div>
      )}

      {/* Stats row */}
      <div className="sev-stats grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Critical', fc.critical, 'text-red-400',    '#ef4444'],
          ['High',     fc.high,     'text-orange-400', '#f97316'],
          ['Medium',   fc.medium,   'text-yellow-400', '#eab308'],
          ['Low',      fc.low,      'text-green-400',  '#15803d'],
          ['Info',     fc.info,     'text-cyan-400',   '#00d4ff'],
        ].map(([label, count, cls, borderColor]) => (
          <div
            key={label}
            className="sev-card rounded-xl p-5 flex flex-col justify-between border"
            style={{
              background: `${borderColor}18`,
              borderColor: `${borderColor}45`,
              borderTop: `3px solid ${borderColor}`,
            }}
          >
            <div className="text-sm font-bold uppercase tracking-widest mb-1" style={{ color: `${borderColor}cc` }}>{label}</div>
            <div className={`text-3xl font-bold ${cls}`}>{count ?? 0}</div>
          </div>
        ))}
      </div>

      {/* Phases */}
      {phases.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {phases.map(phase => (
            <PhaseTag
              key={phase}
              phase={phase}
              active={phase === currentPhase && status === 'running'}
              done={phase !== currentPhase || status !== 'running'}
            />
          ))}
        </div>
      )}

      {/* Tab navigation */}
      {/* Stuck detector banner */}
      {status === 'running' && lastActivity && (() => {
        const idleSecs = Math.floor((nowTick - lastActivity) / 1000)
        const idleMins = Math.floor(idleSecs / 60)
        if (idleSecs < 60) return null
        const isStuck = idleMins >= 6
        return (
          <div className={`flex items-center justify-between gap-3 px-4 py-2 rounded-lg border text-xs ${
            isStuck
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
          }`}>
            <span>
              {isStuck ? '⚠ Sin actividad hace ' : '⏳ Última actividad hace '}
              <strong>{idleMins}m {idleSecs % 60}s</strong>
              {isStuck && ' — el scan podría estar trabado.'}
            </span>
            {isStuck && (
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="px-3 py-1 bg-red-500/20 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {cancelling ? 'Cancelando...' : 'Forzar cancelación'}
              </button>
            )}
          </div>
        )
      })()}

      <div className="border-b border-[#1e3a5f] flex items-stretch justify-between">
        <div className="flex gap-0">
          {[
            ['terminal', `Terminal (${logs.length})`],
            ['findings', `Hallazgos (${findings.length})`],
            ...(scan?.report_technical ? [['reports', 'Reportes']] : []),
          ].map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-accent text-accent'
                  : 'border-transparent text-[#64748b] hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {logs.length > 0 && (
          <button
            onClick={() => {
              const blob = new Blob([logs.join('\n')], { type: 'text/plain' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `hexstrike-scan-${scan?.id ?? 'log'}.txt`
              a.click()
              URL.revokeObjectURL(a.href)
            }}
            className="flex items-center gap-1.5 px-4 py-2 my-1.5 mr-3 text-xs font-medium text-[#64748b] hover:text-white bg-[#1e3a5f]/30 hover:bg-[#1e3a5f]/60 border border-[#1e3a5f] rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
            Descargar logs
          </button>
        )}
      </div>

      {/* Terminal tab */}
      {tab === 'terminal' && (
        <div
          ref={terminalRef}
          className="terminal h-[500px]"
        >
          {logs.length === 0 ? (
            <span className="text-[#1e3a5f]">
              {status === 'pending' ? 'Esperando inicio del scan...' : 'Conectando al stream...'}
            </span>
          ) : (
            logs.map((line, i) => {
              const isFinding = line?.includes('[FINDING:')
              const isPhase = line?.includes('[FASE]')
              const isError = line?.includes('[ERROR]')
              const cls = isFinding ? 'text-orange-400' : isPhase ? 'text-accent font-bold' : isError ? 'text-red-400' : ''
              return (
                <div key={i} className={cls}>{line}</div>
              )
            })
          )}
          {status === 'running' && (
            <span className="text-accent animate-pulse">▋</span>
          )}
        </div>
      )}

      {/* Findings tab */}
      {tab === 'findings' && (
        <div className="space-y-4">
          {/* Filters bar */}
          <div className="space-y-2">
            {/* Text search */}
            <input
              type="text"
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="Buscar por título, descripción, CVE, herramienta..."
              className="w-full bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-accent transition-colors"
            />
            <div className="flex gap-2 flex-wrap items-center">
              {/* Severity filter */}
              {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map(s => (
                <button
                  key={s}
                  onClick={() => setFilterSev(s)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                    filterSev === s
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-[#1e3a5f] bg-[#111827] text-[#64748b] hover:text-white'
                  }`}
                >
                  {s} {s !== 'ALL' && `(${findings.filter(f => f.severity === s).length})`}
                </button>
              ))}
              {/* Tool filter */}
              {uniqueTools.length > 2 && (
                <select
                  value={filterTool}
                  onChange={e => setFilterTool(e.target.value)}
                  className="text-xs bg-[#111827] border border-[#1e3a5f] rounded-lg px-2 py-1.5 text-[#64748b] focus:outline-none focus:border-accent cursor-pointer"
                >
                  {uniqueTools.map(t => (
                    <option key={t} value={t} style={{ background: '#0d1525' }}>
                      {t === 'ALL' ? 'Todas las herramientas' : t}
                    </option>
                  ))}
                </select>
              )}
              {/* Phase filter */}
              {uniquePhases.length > 2 && (
                <select
                  value={filterPhase}
                  onChange={e => setFilterPhase(e.target.value)}
                  className="text-xs bg-[#111827] border border-[#1e3a5f] rounded-lg px-2 py-1.5 text-[#64748b] focus:outline-none focus:border-accent cursor-pointer"
                >
                  {uniquePhases.map(p => (
                    <option key={p} value={p} style={{ background: '#0d1525' }}>
                      {p === 'ALL' ? 'Todas las fases' : p}
                    </option>
                  ))}
                </select>
              )}
              {(filterSev !== 'ALL' || filterTool !== 'ALL' || filterPhase !== 'ALL' || searchText) && (
                <button
                  onClick={() => { setFilterSev('ALL'); setFilterTool('ALL'); setFilterPhase('ALL'); setSearchText('') }}
                  className="text-xs px-2 py-1.5 text-red-400 hover:text-red-300 transition-colors"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            {filteredFindings.length !== findings.length && (
              <div className="text-xs text-[#64748b]">
                Mostrando {filteredFindings.length} de {findings.length} hallazgos
              </div>
            )}
          </div>

          {filteredFindings.length === 0 ? (
            <div className="text-center py-16 text-[#64748b]">
              <div className="text-3xl mb-3">🔍</div>
              <div className="text-sm">
                {status === 'running' ? 'Escaneando... los hallazgos aparecen en tiempo real.' : 'No se encontraron vulnerabilidades.'}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFindings.map(f => (
                <FindingCard
                  key={f.id}
                  scanId={id}
                  finding={f}
                  expanded={expandedId === f.id}
                  onToggle={() => setExpandedId(expandedId === f.id ? null : f.id)}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reports tab */}
      {tab === 'reports' && scan && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2">
              {[['technical', '🔬 Reporte Técnico'], ['executive', '📊 Reporte Ejecutivo']].map(([t, l]) => (
                <button
                  key={t}
                  onClick={() => setReportTab(t)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                    reportTab === t
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-[#1e3a5f] bg-[#111827] text-[#64748b] hover:text-white'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>

            {/* Download PDF button */}
            <button
              onClick={() => {
                const content = reportTab === 'technical' ? scan.report_technical : scan.report_executive
                const title   = reportTab === 'technical' ? '🔬 Reporte Técnico' : '📊 Reporte Ejecutivo'
                const scanMeta = {
                  target: scan.target?.url || scan.target?.ip || '',
                  profile: scan.profile || '',
                  findings_count: scan.findings_count || {},
                  completed_phases: scan.completed_phases || [],
                  created_at: scan.started_at || '',
                }
                const html = buildReportPage(content, title, scanMeta)
                const win = window.open('', '_blank')
                win.document.write(html)
                win.document.close()
                win.addEventListener('load', () => win.print())
              }}
              className="flex items-center gap-2 px-4 py-2 bg-accent/10 border border-accent/30 text-accent text-sm rounded-lg hover:bg-accent/20 transition-colors"
            >
              ⬇ Descargar PDF
            </button>
          </div>

          {/* iframe for full CSS isolation */}
          {(() => {
            const scanMeta = {
              target: scan.target?.url || scan.target?.ip || '',
              profile: scan.profile || '',
              findings_count: scan.findings_count || {},
              completed_phases: scan.completed_phases || [],
              created_at: scan.started_at || '',
            }
            return (
              <iframe
                key={reportTab}
                srcDoc={buildReportPage(
                  reportTab === 'technical' ? scan.report_technical : scan.report_executive,
                  reportTab === 'technical' ? '🔬 Reporte Técnico' : '📊 Reporte Ejecutivo',
                  scanMeta
                )}
                className="w-full border border-[#1e3a5f] rounded-xl"
                style={{ height: '75vh', minHeight: 500 }}
                title={`HexStrike ${reportTab}`}
                sandbox="allow-same-origin"
              />
            )
          })()}
        </div>
      )}
    </div>
  )
}
