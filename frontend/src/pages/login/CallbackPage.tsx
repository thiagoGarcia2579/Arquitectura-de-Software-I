import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rutaInicial, useAuth } from '../../auth/AuthContext';

// Keycloak vuelve acá con un "code" de un solo uso: se canjea por tokens una única vez.
export function CallbackPage() {
  const { completarLogin } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const hecho = useRef(false);   // React StrictMode corre los efectos dos veces en desarrollo

  useEffect(() => {
    if (hecho.current) return;
    hecho.current = true;
    completarLogin()
      .then((u) => navigate(rutaInicial(u.rol), { replace: true }))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo completar el inicio de sesión.'));
  }, [completarLogin, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      {error
        ? <div className="card max-w-sm space-y-3"><p role="alert" className="text-sm text-red-700">{error}</p><a className="btn-secondary" href="/login">Volver</a></div>
        : <p className="text-sm text-slate-500">Ingresando…</p>}
    </div>
  );
}