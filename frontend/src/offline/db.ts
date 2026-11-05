import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Acta, InspeccionLiviana } from '../api/types';

// Estado LOCAL de un acta. Una vez 'enviada' es inmutable (tiene valor legal).
//  pendiente_envio : solo existe en el celular
//  enviada         : el backend ya la tiene (creada o ya_recibida)
//  rechazada       : el backend la rechazó de forma definitiva (ver detalleLocal)
export type EstadoLocal = 'pendiente_envio' | 'enviada' | 'rechazada';

export interface ActaLocal {
  id: string;                    // UUID v4 generado en el cliente
  userId: string;                // cada cola pertenece a un usuario (celulares compartidos)
  inspeccionId: string;
  expediente: string;
  direccion: string;
  observaciones: string;
  cantidadFotos: number;
  creadaEnDispositivo: string;
  local: EstadoLocal;
  detalleLocal?: string;         // motivo del rechazo o del último intento fallido
  remoto?: Acta;                 // última versión conocida del servidor
}

interface Esquema extends DBSchema {
  actas: { key: string; value: ActaLocal; indexes: { porUsuario: string } };
  inspecciones: { key: string; value: { userId: string; items: InspeccionLiviana[] } };
}

let dbPromise: Promise<IDBPDatabase<Esquema>> | null = null;
const db = () =>
  (dbPromise ??= openDB<Esquema>('inspecciones', 1, {
    upgrade(d) {
      d.createObjectStore('actas', { keyPath: 'id' }).createIndex('porUsuario', 'userId');
      d.createObjectStore('inspecciones', { keyPath: 'userId' });
    },
  }));

// Aviso simple a la UI cuando cambia algo en IndexedDB.
const oyentes = new Set<() => void>();
export const suscribir = (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f); }; };
const avisar = () => oyentes.forEach((f) => f());

export async function guardarActa(a: ActaLocal): Promise<void> {
  await (await db()).put('actas', a);
  avisar();
}

export async function obtenerActaLocal(id: string): Promise<ActaLocal | undefined> {
  return (await db()).get('actas', id);
}

export async function actasDeUsuario(userId: string): Promise<ActaLocal[]> {
  const todas = await (await db()).getAllFromIndex('actas', 'porUsuario', userId);
  return todas.sort((a, b) => b.creadaEnDispositivo.localeCompare(a.creadaEnDispositivo));
}

export async function descartarActa(id: string): Promise<void> {
  const d = await db();
  const a = await d.get('actas', id);
  if (a && a.local !== 'enviada') {   // una acta enviada no se borra
    await d.delete('actas', id);
    avisar();
  }
}

export async function cachearInspecciones(userId: string, items: InspeccionLiviana[]): Promise<void> {
  await (await db()).put('inspecciones', { userId, items });
}

export async function inspeccionesCacheadas(userId: string): Promise<InspeccionLiviana[]> {
  return (await (await db()).get('inspecciones', userId))?.items ?? [];
}
