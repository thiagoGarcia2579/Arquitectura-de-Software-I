import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { mensajeDeError } from '../../api/http';
import { rutaInicial, useAuth } from '../../auth/AuthContext';

export function LoginPage() {
  const { usuario, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
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
