import { request } from './http';
import type { Acta, ActaNueva, Inspeccion, ResultadoSync } from './types';

export const listarInspecciones = () => request<Inspeccion[]>('/api/inspecciones');

export const reasignarInspeccion = (id: string, inspectorId: string) =>
  request<Inspeccion>(`/api/inspecciones/${id}/asignacion`, { method: 'PATCH', body: { inspectorId } });

export const listarActas = () => request<Acta[]>('/api/actas');

export const obtenerActa = (id: string) => request<Acta>(`/api/actas/${id}`);

export const syncActas = (actas: (ActaNueva & { id: string })[]) =>
  request<{ resultados: ResultadoSync[] }>('/api/v1/sync', { method: 'POST', body: { actas } });
