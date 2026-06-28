import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !password) { setError('Completá todos los campos.'); return }
    setLoading(true)
    setError('')
    try {
      await login(username, password)
      navigate('/', { replace: true })
    } catch (e) {
      setError(e.message || 'Credenciales inválidas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{
        backgroundImage: 'url(/login-bg.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/55" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 font-bold text-white text-xl mb-2">
            <span className="text-accent text-2xl">⬡</span>
            <span>HexStrike <span className="text-accent">AI</span></span>
          </div>
          <div className="text-[#64748b] text-sm tracking-widest uppercase">Pentest Platform</div>
        </div>

        {/* Card — frosted glass */}
        <div className="backdrop-blur-md bg-black/50 border border-[#00d4ff]/20 rounded-2xl p-8 shadow-2xl shadow-black/60">
          <h1 className="text-lg font-bold text-white mb-6 tracking-wide">Iniciar sesión</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[#00d4ff] mb-1 uppercase tracking-widest font-medium">Usuario</label>
              <input
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                className="w-full bg-black/40 border border-[#00d4ff]/20 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#00d4ff]/70 focus:shadow-[0_0_0_1px_rgba(0,212,255,0.25)] transition-all placeholder-[#3d5270]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#00d4ff] mb-1 uppercase tracking-widest font-medium">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-black/40 border border-[#00d4ff]/20 text-white text-sm rounded-lg px-3 py-2.5 focus:outline-none focus:border-[#00d4ff]/70 focus:shadow-[0_0_0_1px_rgba(0,212,255,0.25)] transition-all placeholder-[#3d5270]"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-3 py-2 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 mt-2 bg-[#00d4ff] hover:bg-[#00bde8] text-black font-bold text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-[#00d4ff]/20"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Ingresando...
                </>
              ) : (
                'Ingresar'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
