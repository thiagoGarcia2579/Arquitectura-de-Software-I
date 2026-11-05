import { useCallback, useEffect, useState } from 'react';
import { listarActas } from '../../api/endpoints';
import { mensajeDeError } from '../../api/http';
import type { Acta, EstadoActa } from '../../api/types';
import { BadgeRemoto, ESTADOS } from '../../components/Badges';
import { Cargando, ErrorMsg, fecha, Vacio } from '../../components/Estados';

// Vista de solo lectura de todas las actas (supervisor y administrativo).
export function ActasPage() {
  const [actas, setActas] = useState<Acta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<EstadoActa | ''>('');
  const [detalle, setDetalle] = useState<Acta | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try { setActas(await listarActas()); } catch (e) { setError(mensajeDeError(e)); } finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const visibles = filtro ? actas.filter((a) => a.estado === filtro) : actas;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Actas</h1>
        <div className="flex items-center gap-2">
          <select className="input w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value as EstadoActa | '')} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            {ESTADOS.map((s) => <option key={s.valor} value={s.valor}>{s.texto}</option>)}
          </select>
          <button className="btn-secondary" onClick={() => void cargar()} disabled={cargando}>Actualizar</button>
        </div>
      </div>

      {error && <ErrorMsg onReintentar={() => void cargar()}>{error}</ErrorMsg>}
      {cargando ? <Cargando /> : visibles.length === 0 && !error ? <Vacio>No hay actas para mostrar.</Vacio> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr><th className="p-3">Recibida</th><th className="p-3">Acta</th><th className="p-3">Fotos</th><th className="p-3">Estado</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {visibles.map((a) => (
                <tr key={a.id} className="border-t border-slate-100">
                  <td className="p-3 whitespace-nowrap">{fecha(a.recibidaEn)}</td>
                  <td className="p-3 font-mono text-xs">{a.id.slice(0, 8)}…</td>
                  <td className="p-3">{a.cantidadFotos}</td>
                  <td className="p-3"><BadgeRemoto estado={a.estado} /></td>
                  <td className="p-3 text-right"><button className="btn-secondary" onClick={() => setDetalle(a)}>Ver</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detalle && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setDetalle(null)}>
          <div role="dialog" aria-modal="true" className="card max-h-[90vh] w-full max-w-lg space-y-2 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold">Detalle del acta</h2>
              <BadgeRemoto estado={detalle.estado} />
            </div>
            <dl className="space-y-1 text-sm">
              <Fila k="ID" v={detalle.id} />
              <Fila k="Inspección" v={detalle.inspeccionId} />
              <Fila k="Inspector" v={detalle.inspectorId} />
              <Fila k="Fotos" v={String(detalle.cantidadFotos)} />
              <Fila k="Creada (según el celular)" v={fecha(detalle.creadaEnDispositivo)} />
              <Fila k="Recibida" v={fecha(detalle.recibidaEn)} />
              <Fila k="Asociada" v={fecha(detalle.asociadaEn)} />
              {detalle.detalleAsociacion && <Fila k="Detalle de asociación" v={detalle.detalleAsociacion} />}
              <div><dt className="font-medium">Observaciones</dt><dd className="whitespace-pre-wrap">{detalle.observaciones || '—'}</dd></div>
            </dl>
            <button className="btn-primary w-full" onClick={() => setDetalle(null)}>Cerrar</button>
          </div>
        </div>
      )}
    </section>
  );
}

function Fila({ k, v }: { k: string; v: string }) {
  return <div><dt className="inline font-medium">{k}: </dt><dd className="inline break-all">{v}</dd></div>;
}
