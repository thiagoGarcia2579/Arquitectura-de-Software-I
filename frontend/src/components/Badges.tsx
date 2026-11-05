import type { EstadoActa } from '../api/types';
import type { ActaLocal } from '../offline/db';

const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium';

export function BadgeRemoto({ estado }: { estado: EstadoActa }) {
  if (estado === 'asociada') return <span className={`${base} bg-emerald-100 text-emerald-800`}>Asociada ✔</span>;
  if (estado === 'error_asociacion') return <span className={`${base} bg-red-100 text-red-800`}>Error de asociación</span>;
  return <span className={`${base} bg-amber-100 text-amber-800`}>Enviada, asociando al expediente</span>;
}

// Combina el estado local (celular) con el remoto (servidor).
export function BadgeActaLocal({ acta }: { acta: ActaLocal }) {
  if (acta.local === 'pendiente_envio') return <span className={`${base} bg-slate-200 text-slate-700`}>Pendiente de envío</span>;
  if (acta.local === 'rechazada') return <span className={`${base} bg-red-100 text-red-800`}>Rechazada</span>;
  return <BadgeRemoto estado={acta.remoto?.estado ?? 'pendiente_asociacion'} />;
}

export const ESTADOS: { valor: EstadoActa; texto: string }[] = [
  { valor: 'pendiente_asociacion', texto: 'Asociando' },
  { valor: 'asociada', texto: 'Asociada' },
  { valor: 'error_asociacion', texto: 'Error de asociación' },
];
