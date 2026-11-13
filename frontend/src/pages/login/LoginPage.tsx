import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../../api/http';
import { rutaInicial, useAuth } from '../../auth/AuthContext';

export function LoginPage() {
  const { usuario, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (usuario) return <Navigate to={rutaInicial(usuario.rol)} replace />;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const u = await login(username.trim(), password);
      navigate(rutaInicial(u.rol), { replace: true });
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={enviar} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Inspecciones de obra</h1>
          <p className="text-sm text-slate-500">Ingresá con tu usuario municipal.</p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Usuario</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Contraseña</span>
          <div className="relative">
            <input className="input pr-12" type={mostrarPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
              onClick={() => setMostrarPassword(!mostrarPassword)}
              aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              aria-pressed={mostrarPassword}
            >
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                {mostrarPassword ? (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.9 5.2A10.8 10.8 0 0112 5c5.2 0 8.5 4.3 9.5 6-.4.7-1.3 2-2.7 3.2M6.2 6.2C3.9 7.6 2.7 9.6 2.5 11c.4.7 1.3 2 2.7 3.2A10.7 10.7 0 0012 17c.7 0 1.4-.1 2-.2" />
                  </>
                ) : (
                  <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
                    <circle cx="12" cy="12" r="2.5" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" disabled={enviando || !username || !password}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
        {!navigator.onLine && <p className="text-xs text-amber-700">Sin conexión: para iniciar sesión necesitás señal.</p>}
      </form>
    </div>
  );
}
