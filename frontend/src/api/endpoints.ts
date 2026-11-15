import { request } from './http';
import type {
  Acta, ActaNueva, Inspeccion, InspeccionLiviana, ResultadoSync, Tokens,
} from './types';

export const listarInspecciones = () => request<Inspeccion[]>('/api/inspecciones');

export const reasignarInspeccion = (id: string, inspectorId: string) =>
  request<Inspeccion>(`/api/inspecciones/${id}/asignacion`, { method: 'PATCH', body: { inspectorId } });

export const listarActas = () => request<Acta[]>('/api/actas');

export const obtenerActa = (id: string) => request<Acta>(`/api/actas/${id}`);

export const misInspeccionesMobile = () =>
  request<{ total: number; items: InspeccionLiviana[] }>('/mobile/inspecciones');

export const syncActas = (actas: (ActaNueva & { id: string })[]) =>
  request<{ resultados: ResultadoSync[] }>('/mobile/sync', { method: 'POST', body: { actas } });
