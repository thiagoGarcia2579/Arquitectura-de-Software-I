import { ApiError, NetworkError } from '../api/http';
import { obtenerActa, syncActas } from '../api/endpoints';
import type { ActaNueva } from '../api/types';
import { actasDeUsuario, guardarActa, obtenerActaLocal, type ActaLocal } from './db';

const LOTE = 50;

export interface ResumenSync {
  enviadas: number;
  rechazadas: number;
  pendientes: number;
  sinConexion: boolean;
}

let enCurso: Promise<ResumenSync> | null = null;

const aPayload = (a: ActaLocal): ActaNueva & { id: string } => ({
  id: a.id,
  inspeccionId: a.inspeccionId,
  observaciones: a.observaciones,
  cantidadFotos: a.cantidadFotos,
  creadaEnDispositivo: a.creadaEnDispositivo,
});

// Manda TODO lo acumulado en lotes de a 50 por POST /api/v1/sync. Solo corre un sync a la vez.
export function sincronizar(userId: string): Promise<ResumenSync> {
  enCurso ??= ejecutar(userId).finally(() => { enCurso = null; });
  return enCurso;
}

async function ejecutar(userId: string): Promise<ResumenSync> {
  const resumen: ResumenSync = { enviadas: 0, rechazadas: 0, pendientes: 0, sinConexion: false };
  const cola = (await actasDeUsuario(userId))
    .filter((a) => a.local === 'pendiente_envio')
    .reverse();   // las más viejas primero

  for (let i = 0; i < cola.length && !resumen.sinConexion; i += LOTE) {
    const lote = cola.slice(i, i + LOTE);
    let resultados;
    try {
      resultados = (await syncActas(lote.map(aPayload))).resultados;
    } catch (e) {
      if (e instanceof NetworkError || (e instanceof ApiError && e.status >= 500)) {
        resumen.sinConexion = true;
        resumen.pendientes += cola.length - i;
        break;
      }
      throw e;
    }

    for (const acta of lote) {
      const r = resultados.find((x) => x.id === acta.id);
      if (!r) {
        resumen.pendientes++;
      } else if (r.estado === 'creada' || r.estado === 'ya_recibida') {
        await guardarActa({ ...acta, local: 'enviada', detalleLocal: undefined });
        resumen.enviadas++;
      } else if (r.http >= 500 || r.http === 401) {
        await guardarActa({ ...acta, detalleLocal: r.detalle ?? 'El servidor falló; se reintentará.' });
        resumen.pendientes++;
      } else {
        await guardarActa({ ...acta, local: 'rechazada', detalleLocal: r.detalle ?? `Rechazada (HTTP ${r.http}).` });
        resumen.rechazadas++;
      }
    }
  }
  return resumen;
}

// Trae el estado de asociación desde el servidor para un acta ya enviada.
export async function actualizarRemoto(id: string): Promise<void> {
  try {
    const remoto = await obtenerActa(id);
    const local = await obtenerActaLocal(id);
    if (local) await guardarActa({ ...local, remoto });
  } catch (e) {
    if (e instanceof NetworkError || e instanceof ApiError) return;   // se reintenta en el próximo ciclo
    throw e;
  }
}
