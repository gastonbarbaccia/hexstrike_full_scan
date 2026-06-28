const config = {
  CRITICAL: { label: 'CRITICAL', cls: 'bg-red-500/15 text-red-400 border border-red-500/30' },
  HIGH:     { label: 'HIGH',     cls: 'bg-orange-500/15 text-orange-400 border border-orange-500/30' },
  MEDIUM:   { label: 'MEDIUM',   cls: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30' },
  LOW:      { label: 'LOW',      cls: 'bg-green-500/15 text-green-400 border border-green-500/30' },
  INFO:     { label: 'INFO',     cls: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30' },
}

export default function SeverityBadge({ severity }) {
  const { label, cls } = config[severity?.toUpperCase()] ?? config.INFO
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded font-mono ${cls}`}>
      {label}
    </span>
  )
}
