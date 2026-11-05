import type { ReactNode } from 'react';

export const fecha = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <p role="status" className="py-8 text-center text-sm text-slate-500">{texto}</p>;
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 py-8 text-center text-sm text-slate-500">{children}</p>;
}

export function ErrorMsg({ children, onReintentar }: { children: ReactNode; onReintentar?: () => void }) {
  return (
    <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <span>{children}</span>
      {onReintentar && <button className="btn-secondary shrink-0" onClick={onReintentar}>Reintentar</button>}
    </div>
  );
}
