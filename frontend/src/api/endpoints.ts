import { request } from './http';
import type { Acta, ActaNueva, Inspeccion, ResultadoSync } from './types';

// Versión del contrato: si cambia, se cambia en un solo lugar.
const API = '/api/v1';

export const listarInspecciones = () => request<Inspeccion[]>(`${API}/inspecciones`);

export const reasignarInspeccion = (id: string, inspectorId: string) =>
  request<Inspeccion>(`${API}/inspecciones/${id}/asignacion`, { method: 'PATCH', body: { inspectorId } });

export const listarActas = () => request<Acta[]>(`${API}/actas`);

export const obtenerActa = (id: string) => request<Acta>(`${API}/actas/${id}`);

export const syncActas = (actas: (ActaNueva & { id: string })[]) =>
  request<{ resultados: ResultadoSync[] }>(`${API}/sync`, { method: 'POST', body: { actas } });
