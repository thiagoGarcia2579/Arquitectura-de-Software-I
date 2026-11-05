import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout } from '../api/endpoints';
import type { Rol, Usuario } from '../api/types';
import { clearSession, decodeUsuario, loadSession, saveSession, SESSION_EVENT } from './session';

interface AuthCtx {
  usuario: Usuario | null;
  login: (username: string, password: string) => Promise<Usuario>;
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

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await apiLogin(username, password);
    const u = decodeUsuario(tokens.accessToken);
    if (!u) throw new Error('El servidor devolvió un token inválido.');
    saveSession(tokens);
    setUsuario(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    const s = loadSession();
    // Sin red igual se cierra localmente; la cola offline del usuario queda guardada en el equipo.
    if (s && navigator.onLine) await apiLogout(s.refreshToken).catch(() => undefined);
    clearSession();
    setUsuario(null);
  }, []);

  const value = useMemo(() => ({ usuario, login, logout }), [usuario, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fuera de AuthProvider');
  return c;
}

export const rutaInicial = (rol: Rol): string =>
  rol === 'inspector' ? '/inspector' : rol === 'supervisor' ? '/supervisor' : '/admin';
