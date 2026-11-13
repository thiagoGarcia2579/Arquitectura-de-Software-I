import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useOnline } from '../offline/hooks';

export function OnlineDot() {
  const online = useOnline();
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${online ? 'text-emerald-700' : 'text-amber-700'}`}>
      <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {online ? 'Servidor disponible' : 'Sin conexión'}
    </span>
  );
}

const NAV: Record<string, { to: string; texto: string; end?: boolean }[]> = {
  inspector: [
    { to: '/inspector', texto: 'Inspecciones', end: true },
    { to: '/inspector/nueva', texto: 'Nueva acta' },
    { to: '/inspector/actas', texto: 'Mis actas' },
  ],
  supervisor: [
    { to: '/supervisor', texto: 'Inspecciones', end: true },
    { to: '/supervisor/actas', texto: 'Actas' },
  ],
  administrativo: [{ to: '/admin', texto: 'Actas', end: true }],
};

export function Layout() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  if (!usuario) return null;

  return (
    <div className="mx-auto min-h-screen max-w-5xl">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{usuario.nombre}</p>
            <p className="text-xs capitalize text-slate-500">{usuario.rol}</p>
          </div>
          <div className="flex items-center gap-3">
            <OnlineDot />
            <button
              className="btn-secondary"
              onClick={async () => { await logout(); navigate('/login'); }}
            >
              Salir
            </button>
          </div>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto">
          {NAV[usuario.rol].map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-emerald-700 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {n.texto}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="space-y-4 p-4">
        <Outlet />
      </main>
    </div>
  );
}
