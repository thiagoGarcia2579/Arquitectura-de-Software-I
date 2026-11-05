import { Navigate, Outlet } from 'react-router-dom';
import type { Rol } from '../api/types';
import { rutaInicial, useAuth } from './AuthContext';

// OJO: esto es solo comodidad de interfaz. La seguridad real (token, rol y asignación)
// la hace el backend; ocultar una pantalla acá no protege nada.
export function RequireRole({ rol }: { rol: Rol }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (usuario.rol !== rol) return <Navigate to={rutaInicial(usuario.rol)} replace />;
  return <Outlet />;
}
