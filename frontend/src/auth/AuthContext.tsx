import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Rol, Usuario } from '../api/types';
import { userManager } from './oidc';
import { clearSession, decodeUsuario, loadSession, saveSession, SESSION_EVENT } from './session';

interface AuthCtx {
  usuario: Usuario | null;
  iniciarLogin: () => Promise<void>;      // redirige a Keycloak
  completarLogin: () => Promise<Usuario>; // se llama al volver de Keycloak (/login/callback)
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

const leerUsuario = (): Usuario | null => {
  const s = loadSession();
  return s ? decodeUsuario(s.accessToken) : null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(leerUsuario);

  // Se entera de renovaciones, vencimientos y cambios hechos desde otras pestañas.
  useEffect(() => {
    const sync = () => setUsuario((prev) => {
      const nuevo = leerUsuario();
      return prev?.id === nuevo?.id && prev?.rol === nuevo?.rol ? prev : nuevo;
    });
    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(SESSION_EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  const iniciarLogin = useCallback(() => userManager.signinRedirect(), []);

  const completarLogin = useCallback(async () => {
    const user = await userManager.signinRedirectCallback();
    const u = decodeUsuario(user.access_token);
    if (!u) throw new Error('El token no trae un rol del sistema (inspector, supervisor o administrativo).');
    saveSession({ accessToken: user.access_token, refreshToken: user.refresh_token ?? '' });
    setUsuario(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    // La cola offline del usuario queda guardada en el equipo.
    clearSession();
    setUsuario(null);
    if (navigator.onLine) {
      // Cierra también la sesión de Keycloak (SSO); si no, el próximo login entraría solo con el mismo usuario.
      await userManager.signoutRedirect().catch(() => userManager.removeUser());
    } else {
      await userManager.removeUser().catch(() => undefined);
    }
  }, []);

  const value = useMemo(() => ({ usuario, iniciarLogin, completarLogin, logout }), [usuario, iniciarLogin, completarLogin, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}

export const rutaInicial = (rol: Rol): string =>
  rol === 'inspector' ? '/inspector' : rol === 'supervisor' ? '/supervisor' : '/admin';