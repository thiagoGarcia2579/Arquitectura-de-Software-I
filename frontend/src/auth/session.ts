import type { Rol, Tokens, Usuario } from '../api/types';

// Decisión consciente: localStorage para que la sesión sobreviva al cierre de la pestaña
// (zonas sin señal durante horas). Riesgo: es legible por cualquier script de la página (XSS).
const KEY = 'inspecciones.session';
export const SESSION_EVENT = 'inspecciones:session-changed';

export interface Session {
  accessToken: string;
  refreshToken: string;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(t: Pick<Tokens, 'accessToken' | 'refreshToken'>): void {
  localStorage.setItem(KEY, JSON.stringify({ accessToken: t.accessToken, refreshToken: t.refreshToken }));
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}

const ROLES: Rol[] = ['inspector', 'supervisor', 'administrativo'];

// Solo lectura, SIN verificar la firma: la verificación real la hace el backend.
export function decodeUsuario(accessToken: string): Usuario | null {
  try {
    const payload = accessToken.split('.')[1];
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes)) as { sub?: string; rol?: string; nombre?: string };
    if (!p.sub || !p.rol || !ROLES.includes(p.rol as Rol)) return null;
    return { id: p.sub, rol: p.rol as Rol, nombre: p.nombre ?? p.sub };
  } catch {
    return null;
  }
}
