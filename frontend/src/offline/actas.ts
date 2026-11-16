import type { Acta } from '../api/types';
import type { ActaLocal } from './db';

export function combinarActas(locales: ActaLocal[], remotas: Acta[], userId: string): ActaLocal[] {
  const porId = new Map(locales.filter((acta) => acta.userId === userId).map((acta) => [acta.id, acta]));
  for (const acta of remotas) {
    if (acta.inspectorId !== userId) continue;
    porId.set(acta.id, {
      id: acta.id,
      userId,
      inspeccionId: acta.inspeccionId,
      expediente: acta.expedienteId,
      direccion: acta.direccion,
      observaciones: acta.observaciones,
      cantidadFotos: acta.cantidadFotos,
      creadaEnDispositivo: acta.creadaEnDispositivo ?? acta.recibidaEn,
      local: 'enviada',
      remoto: acta,
    });
  }
  return [...porId.values()].sort((a, b) => b.creadaEnDispositivo.localeCompare(a.creadaEnDispositivo));
}
