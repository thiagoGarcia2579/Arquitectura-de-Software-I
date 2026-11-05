import { clearSession, loadSession, saveSession } from '../auth/session';
import type { ProblemDetails, Tokens } from './types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

// Error HTTP del backend (application/problem+json).
export class ApiError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail: string,
  ) {
    super(detail);
  }
}

// Sin red (o el backend no responde): NO es una sesión vencida ni un rechazo del servidor.
export class NetworkError extends Error {
  constructor() {
    super('No hay conexión con el servidor.');
  }
}

export function mensajeDeError(e: unknown): string {
  if (e instanceof ApiError) return e.detail;
  if (e instanceof NetworkError) return e.message;
  return 'Ocurrió un error inesperado.';
}

interface Opciones {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function parse<T>(resp: Response): Promise<T> {
  if (resp.status === 204) return undefined as T;
  if (!resp.ok) {
    let p: ProblemDetails = {};
    try { p = (await resp.json()) as ProblemDetails; } catch { /* cuerpo no JSON */ }
    const detail =
      resp.status === 429 ? 'Demasiados intentos. Esperá un minuto y volvé a probar.'
      : p.detail ?? (resp.status === 502 ? 'El servidor no está disponible.' : `Error ${resp.status}`);
    throw new ApiError(resp.status, p.title ?? 'Error', detail);
  }
  return (await resp.json()) as T;
}

async function fetchRed(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, init);
  } catch {
    throw new NetworkError();
  }
}

function enviar(path: string, o: Opciones, accessToken?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (o.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetchRed(path, { method: o.method ?? 'GET', headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined });
}

// ---- Refresh single-flight -------------------------------------------------
// El refresh token es rotativo: usarlo dos veces hace que el backend revoque TODAS las sesiones.
// Por eso: (1) una sola promesa compartida dentro de la pestaña y (2) un lock entre pestañas.
let refreshEnCurso: Promise<string> | null = null;

export function refrescarSesion(tokenViejo: string | undefined): Promise<string> {
  refreshEnCurso ??= ejecutarRefresh(tokenViejo).finally(() => { refreshEnCurso = null; });
  return refreshEnCurso;
}

async function ejecutarRefresh(tokenViejo: string | undefined): Promise<string> {
  const correr = async (): Promise<string> => {
    const actual = loadSession();
    if (!actual) throw new ApiError(401, 'Sesión vencida', 'Tu sesión venció. Iniciá sesión nuevamente.');
    // Otra pestaña ya renovó mientras esperábamos el lock: usamos su token.
    if (tokenViejo && actual.accessToken !== tokenViejo) return actual.accessToken;

    const resp = await fetchRed('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: actual.refreshToken }),
    });
    if (resp.status === 400 || resp.status === 401) {
      clearSession();
      throw new ApiError(401, 'Sesión vencida', 'Tu sesión venció. Iniciá sesión nuevamente.');
    }
    const tokens = await parse<Tokens>(resp);
    saveSession(tokens);   // siempre se guarda el refresh token NUEVO
    return tokens.accessToken;
  };
  return navigator.locks ? navigator.locks.request('inspecciones-refresh', correr) : correr();
}

// ---- Cliente central -------------------------------------------------------
export async function request<T>(path: string, o: Opciones = {}): Promise<T> {
  const auth = o.auth ?? true;
  const token = auth ? loadSession()?.accessToken : undefined;
  let resp = await enviar(path, o, token);

  // 401 con sesión: se renueva y se reintenta UNA sola vez.
  if (resp.status === 401 && auth && token) {
    const nuevo = await refrescarSesion(token);
    resp = await enviar(path, o, nuevo);
  }
  return parse<T>(resp);
}
