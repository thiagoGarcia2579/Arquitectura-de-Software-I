import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { rutaInicial, useAuth } from '../../auth/AuthContext';

export function LoginPage() {
  const { usuario, iniciarLogin } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [yendo, setYendo] = useState(false);

  if (usuario) return <Navigate to={rutaInicial(usuario.rol)} replace />;

  async function ingresar() {
    setYendo(true);
    setError(null);
    try {
      await iniciarLogin();
    } catch {
      setError('No se pudo contactar al proveedor de identidad. Revisá la conexión e intentá de nuevo.');
      setYendo(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Inspecciones de obra</h1>
          <p className="text-sm text-slate-500">Ingresá con tu usuario municipal.</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button className="btn-primary w-full" onClick={() => void ingresar()} disabled={yendo || !navigator.onLine}>
          {yendo ? 'Redirigiendo…' : 'Ingresar'}
        </button>
        {!navigator.onLine && <p className="text-xs text-amber-700">Sin conexión: para iniciar sesión necesitás señal.</p>}
      </div>
    </div>
  );
}