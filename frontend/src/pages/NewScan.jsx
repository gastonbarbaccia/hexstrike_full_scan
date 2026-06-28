import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'

const PROFILES = [
  {
    id: 'web',
    label: 'Web Application',
    icon: '🌐',
    desc: 'Enfocado en vulnerabilidades web: XSS, SQLi, directorios, WAF, endpoints ocultos.',
    tools: ['subfinder', 'nmap', 'nikto', 'gobuster', 'nuclei', 'dalfox', 'sqlmap', 'katana'],
  },
  {
    id: 'network',
    label: 'Network / Infraestructura',
    icon: '🔌',
    desc: 'Análisis de red: todos los puertos, servicios, SMB, SSH, RDP, credenciales.',
    tools: ['rustscan', 'nmap', 'nmap -sU', 'nuclei', 'hydra', 'enum4linux'],
  },
  {
    id: 'full',
    label: 'Pentest Completo',
    icon: '⚡',
    desc: 'Análisis exhaustivo combinando web + red. Todas las fases y herramientas disponibles.',
    tools: ['subfinder', 'rustscan', 'nmap', 'nikto', 'gobuster', 'nuclei', 'dalfox', 'sqlmap', 'hydra', '+ más'],
  },
]

const EMPTY_SCOPE = {
  excluded_paths: '',
  target_ports: '',
  auth_header_key: '',
  auth_header_val: '',
  auth_cookie_key: '',
  auth_cookie_val: '',
  notes: '',
}

export default function NewScan() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedTargetId = searchParams.get('target')
  const [targets, setTargets] = useState([])
  const [step, setStep] = useState(1)  // 1: target, 2: profile, 3: scope, 4: confirm
  const [form, setForm] = useState({
    targetMode: 'existing',
    targetId: preselectedTargetId ?? '',
    environmentId: '',
    name: '',
    url: '',
    ip: '',
    notes: '',
    profile: 'web',
  })
  const [scope, setScope] = useState(EMPTY_SCOPE)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.targets.list().then(setTargets).catch(() => {})
  }, [])

  const selectedTarget = targets.find(t => String(t.id) === String(form.targetId))
  const selectedProfile = PROFILES.find(p => p.id === form.profile)
  const targetEnvironments = selectedTarget?.environments ?? []
  const selectedEnv = targetEnvironments.find(e => String(e.id) === String(form.environmentId))

  function buildScanConfig() {
    const cfg = {}
    const excluded = scope.excluded_paths
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
    if (excluded.length) cfg.excluded_paths = excluded
    if (scope.target_ports.trim()) cfg.target_ports = scope.target_ports.trim()
    if (scope.auth_header_key.trim() && scope.auth_header_val.trim()) {
      cfg.auth_headers = { [scope.auth_header_key.trim()]: scope.auth_header_val.trim() }
    }
    if (scope.auth_cookie_key.trim() && scope.auth_cookie_val.trim()) {
      cfg.auth_cookies = { [scope.auth_cookie_key.trim()]: scope.auth_cookie_val.trim() }
    }
    if (scope.notes.trim()) cfg.notes = scope.notes.trim()
    return Object.keys(cfg).length ? cfg : null
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')
    try {
      let targetId = form.targetId
      if (form.targetMode === 'new') {
        if (!form.name.trim()) throw new Error('El nombre del target es requerido')
        if (!form.url && !form.ip) throw new Error('Ingresá URL o IP del target')
        const t = await api.targets.create({
          name: form.name,
          url: form.url || null,
          ip: form.ip || null,
          notes: form.notes || null,
        })
        targetId = t.id
      }
      if (!targetId) throw new Error('Seleccioná un target')

      const scanConfig = buildScanConfig()
      const payload = {
        target_id: Number(targetId),
        profile: form.profile,
        ...(form.environmentId ? { environment_id: Number(form.environmentId) } : {}),
        ...(scanConfig ? { scan_config: scanConfig } : {}),
      }
      const scan = await api.scans.start(payload)
      navigate(`/scan/${scan.id}`)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const STEPS = ['Target', 'Perfil', 'Scope', 'Confirmar']

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Nuevo Scan</h1>
        <p className="text-sm text-[#64748b] mt-0.5">Configurá el objetivo y perfil de análisis</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className="flex items-center gap-2">
            <button
              onClick={() => s < step && setStep(s)}
              className={`w-8 h-8 rounded-full text-sm font-bold border transition-colors ${
                s === step
                  ? 'bg-accent text-[#0a0f1e] border-accent'
                  : s < step
                  ? 'bg-accent/20 text-accent border-accent/40 cursor-pointer'
                  : 'bg-[#111827] text-[#64748b] border-[#1e3a5f]'
              }`}
            >
              {s < step ? '✓' : s}
            </button>
            {s < 4 && <div className={`h-px w-8 ${s < step ? 'bg-accent/40' : 'bg-[#1e3a5f]'}`} />}
          </div>
        ))}
        <span className="ml-2 text-xs text-[#64748b]">{STEPS[step - 1]}</span>
      </div>

      {/* Step 1: Target */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {[['existing', 'Target existente'], ['new', 'Nuevo target']].map(([m, l]) => (
              <button
                key={m}
                onClick={() => setForm(f => ({ ...f, targetMode: m, targetId: '', environmentId: '' }))}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  form.targetMode === m
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'bg-[#111827] border-[#1e3a5f] text-[#64748b] hover:text-white'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {form.targetMode === 'existing' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs text-[#64748b] uppercase tracking-wider">Seleccionar target</label>
                {targets.length === 0 ? (
                  <div className="text-sm text-[#64748b] py-4 text-center border border-[#1e3a5f] rounded-lg">
                    No hay targets. Creá uno nuevo.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {targets.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setForm(f => ({ ...f, targetId: t.id, environmentId: '' }))}
                        className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                          String(form.targetId) === String(t.id)
                            ? 'bg-accent/10 border-accent'
                            : 'bg-[#111827] border-[#1e3a5f] hover:border-accent/40'
                        }`}
                      >
                        <div className="font-semibold text-white text-sm">{t.name}</div>
                        <div className="text-xs text-[#64748b] mt-0.5">
                          {t.url || t.ip}
                          {t.environments?.length > 0 && (
                            <span className="ml-2 text-accent/60">{t.environments.length} entorno{t.environments.length > 1 ? 's' : ''}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Environment selector */}
              {targetEnvironments.length > 0 && (
                <div>
                  <label className="text-xs text-[#64748b] uppercase tracking-wider">Entorno (opcional)</label>
                  <div className="mt-1.5 space-y-1.5">
                    <button
                      onClick={() => setForm(f => ({ ...f, environmentId: '' }))}
                      className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                        !form.environmentId
                          ? 'bg-accent/10 border-accent text-accent'
                          : 'bg-[#111827] border-[#1e3a5f] text-[#64748b] hover:text-white'
                      }`}
                    >
                      URL/IP base del target
                    </button>
                    {targetEnvironments.map(env => (
                      <button
                        key={env.id}
                        onClick={() => setForm(f => ({ ...f, environmentId: env.id }))}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                          String(form.environmentId) === String(env.id)
                            ? 'bg-accent/10 border-accent text-accent'
                            : 'bg-[#111827] border-[#1e3a5f] text-[#64748b] hover:text-white'
                        }`}
                      >
                        <span className="font-medium text-white">{env.name}</span>
                        <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1e3a5f] text-[#64748b]">{env.env_type}</span>
                        <div className="text-xs text-[#64748b] mt-0.5">{env.url || env.ip}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {[
                ['name', 'Nombre *', 'Mi servidor web', false],
                ['url', 'URL', 'https://example.com', false],
                ['ip', 'IP', '192.168.1.1', false],
                ['notes', 'Notas', 'Contexto adicional...', true],
              ].map(([field, label, placeholder, textarea]) => (
                <div key={field}>
                  <label className="block text-xs text-[#64748b] uppercase tracking-wider mb-1">{label}</label>
                  {textarea ? (
                    <textarea
                      value={form[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      placeholder={placeholder}
                      rows={3}
                      className="w-full bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-accent transition-colors resize-none"
                    />
                  ) : (
                    <input
                      value={form[field]}
                      onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                      placeholder={placeholder}
                      className="w-full bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-accent transition-colors"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              if (form.targetMode === 'existing' && !form.targetId) { setError('Seleccioná un target'); return }
              if (form.targetMode === 'new' && !form.name.trim()) { setError('El nombre es requerido'); return }
              if (form.targetMode === 'new' && !form.url && !form.ip) { setError('Ingresá URL o IP'); return }
              setError(''); setStep(2)
            }}
            className="w-full py-3 bg-accent text-[#0a0f1e] font-bold rounded-lg hover:bg-cyan-300 transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Step 2: Profile */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-3">
            {PROFILES.map(p => (
              <button
                key={p.id}
                onClick={() => setForm(f => ({ ...f, profile: p.id }))}
                className={`w-full text-left p-4 rounded-xl border transition-colors ${
                  form.profile === p.id
                    ? 'bg-accent/10 border-accent'
                    : 'bg-[#111827] border-[#1e3a5f] hover:border-accent/40'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{p.icon}</span>
                  <span className="font-bold text-white">{p.label}</span>
                  {form.profile === p.id && (
                    <span className="ml-auto text-accent text-sm">✓ Seleccionado</span>
                  )}
                </div>
                <p className="text-xs text-[#64748b] mb-3">{p.desc}</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.tools.map(t => (
                    <span key={t} className="text-[10px] font-mono bg-[#1f2937] text-accent border border-[#1e3a5f] px-1.5 py-0.5 rounded">
                      {t}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(1)} className="flex-1 py-3 bg-[#111827] border border-[#1e3a5f] text-[#64748b] font-semibold rounded-lg hover:text-white transition-colors">
              ← Atrás
            </button>
            <button onClick={() => { setError(''); setStep(3) }} className="flex-2 flex-grow-[2] py-3 bg-accent text-[#0a0f1e] font-bold rounded-lg hover:bg-cyan-300 transition-colors">
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Scope */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="text-xs text-[#64748b] bg-[#111827] border border-[#1e3a5f] rounded-lg px-4 py-3">
            Configuración opcional del alcance. Si no completás nada, Claude decide los parámetros automáticamente.
          </div>

          <div className="space-y-4">
            {/* Target ports */}
            <div>
              <label className="block text-xs text-[#64748b] uppercase tracking-wider mb-1">Puertos objetivo</label>
              <input
                value={scope.target_ports}
                onChange={e => setScope(s => ({ ...s, target_ports: e.target.value }))}
                placeholder="80,443,8080,8443  (vacío = todos los puertos)"
                className="w-full bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Excluded paths */}
            <div>
              <label className="block text-xs text-[#64748b] uppercase tracking-wider mb-1">Paths excluidos (uno por línea)</label>
              <textarea
                value={scope.excluded_paths}
                onChange={e => setScope(s => ({ ...s, excluded_paths: e.target.value }))}
                placeholder={"/logout\n/admin/delete\n/api/reset"}
                rows={4}
                className="w-full bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-accent transition-colors resize-none font-mono"
              />
            </div>

            {/* Auth header */}
            <div>
              <label className="block text-xs text-[#64748b] uppercase tracking-wider mb-1">Header de autenticación</label>
              <div className="flex gap-2">
                <input
                  value={scope.auth_header_key}
                  onChange={e => setScope(s => ({ ...s, auth_header_key: e.target.value }))}
                  placeholder="Authorization"
                  className="w-2/5 bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-accent transition-colors"
                />
                <input
                  value={scope.auth_header_val}
                  onChange={e => setScope(s => ({ ...s, auth_header_val: e.target.value }))}
                  placeholder="Bearer eyJ..."
                  className="flex-1 bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>

            {/* Auth cookie */}
            <div>
              <label className="block text-xs text-[#64748b] uppercase tracking-wider mb-1">Cookie de autenticación</label>
              <div className="flex gap-2">
                <input
                  value={scope.auth_cookie_key}
                  onChange={e => setScope(s => ({ ...s, auth_cookie_key: e.target.value }))}
                  placeholder="session"
                  className="w-2/5 bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-accent transition-colors"
                />
                <input
                  value={scope.auth_cookie_val}
                  onChange={e => setScope(s => ({ ...s, auth_cookie_val: e.target.value }))}
                  placeholder="abc123def456..."
                  className="flex-1 bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs text-[#64748b] uppercase tracking-wider mb-1">Notas adicionales para Claude</label>
              <textarea
                value={scope.notes}
                onChange={e => setScope(s => ({ ...s, notes: e.target.value }))}
                placeholder="Contexto adicional, restricciones especiales, credenciales de prueba..."
                rows={3}
                className="w-full bg-[#111827] border border-[#1e3a5f] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:outline-none focus:border-accent transition-colors resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(2)} className="flex-1 py-3 bg-[#111827] border border-[#1e3a5f] text-[#64748b] font-semibold rounded-lg hover:text-white transition-colors">
              ← Atrás
            </button>
            <button onClick={() => { setError(''); setStep(4) }} className="flex-2 flex-grow-[2] py-3 bg-accent text-[#0a0f1e] font-bold rounded-lg hover:bg-cyan-300 transition-colors">
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="bg-[#111827] border border-[#1e3a5f] rounded-xl p-5 space-y-4">
            <div className="text-xs text-[#64748b] uppercase tracking-widest">Resumen del scan</div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-[#64748b] mb-1">Target</div>
                <div className="font-semibold text-white">
                  {form.targetMode === 'existing'
                    ? selectedTarget?.name ?? `#${form.targetId}`
                    : form.name}
                </div>
                <div className="text-xs text-[#64748b] mt-0.5">
                  {selectedEnv
                    ? <><span className="text-accent">{selectedEnv.name}</span> · {selectedEnv.url || selectedEnv.ip}</>
                    : form.targetMode === 'existing'
                    ? (selectedTarget?.url || selectedTarget?.ip)
                    : (form.url || form.ip)}
                </div>
              </div>
              <div>
                <div className="text-xs text-[#64748b] mb-1">Perfil</div>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{selectedProfile?.icon}</span>
                  <span className="font-semibold text-white">{selectedProfile?.label}</span>
                </div>
              </div>
            </div>

            {/* Scope summary */}
            {(scope.target_ports || scope.excluded_paths || scope.auth_header_key || scope.auth_cookie_key || scope.notes) && (
              <div className="border-t border-[#1e3a5f] pt-4 space-y-1.5">
                <div className="text-xs text-[#64748b] mb-2 uppercase tracking-wider">Scope configurado</div>
                {scope.target_ports && <div className="text-xs text-[#94a3b8]"><span className="text-accent/70">Puertos:</span> {scope.target_ports}</div>}
                {scope.excluded_paths && <div className="text-xs text-[#94a3b8]"><span className="text-accent/70">Excluidos:</span> {scope.excluded_paths.split('\n').filter(Boolean).join(', ')}</div>}
                {scope.auth_header_key && <div className="text-xs text-[#94a3b8]"><span className="text-accent/70">Auth header:</span> {scope.auth_header_key}</div>}
                {scope.auth_cookie_key && <div className="text-xs text-[#94a3b8]"><span className="text-accent/70">Auth cookie:</span> {scope.auth_cookie_key}</div>}
                {scope.notes && <div className="text-xs text-[#94a3b8]"><span className="text-accent/70">Notas:</span> {scope.notes}</div>}
              </div>
            )}

            <div className="border-t border-[#1e3a5f] pt-4 text-xs text-[#64748b]">
              El scan será orquestado por <span className="text-accent">Claude claude-sonnet-4-6</span> con acceso a las 67 herramientas de HexStrike.
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(3)}
              disabled={loading}
              className="flex-1 py-3 bg-[#111827] border border-[#1e3a5f] text-[#64748b] font-semibold rounded-lg hover:text-white transition-colors disabled:opacity-50"
            >
              ← Atrás
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-grow-[2] flex-2 py-3 bg-accent text-[#0a0f1e] font-bold rounded-lg hover:bg-cyan-300 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-[#0a0f1e] border-t-transparent rounded-full animate-spin" />
                  Iniciando...
                </>
              ) : (
                'Iniciar Scan ⚡'
              )}
            </button>
          </div>
        </div>
      )}

      {error && step < 4 && (
        <div className="mt-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}
    </div>
  )
}
