import { useCallback, useEffect, useState } from 'react';
import { listarInspecciones } from '../../api/endpoints';
import { mensajeDeError } from '../../api/http';
import type { Inspeccion } from '../../api/types';
import { Cargando, ErrorMsg, fecha, Vacio } from '../../components/Estados';

// Solo lectura: el administrativo consulta inspecciones, no las asigna ni las modifica.
export function AdminInspecciones() {
  const [items, setItems] = useState<Inspeccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try { setItems(await listarInspecciones()); } catch (e) { setError(mensajeDeError(e)); } finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  return (
    <section className="space-y-3">
      <h1 className="text-lg font-semibold">Inspecciones</h1>
      {error && <ErrorMsg onReintentar={() => void cargar()}>{error}</ErrorMsg>}
      {cargando ? <Cargando /> : items.length === 0 && !error ? <Vacio>No hay inspecciones.</Vacio> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr><th className="p-3">Expediente</th><th className="p-3">Dirección</th><th className="p-3">Creada</th><th className="p-3">Inspector</th></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="p-3 whitespace-nowrap font-medium">{i.expedienteId}</td>
                  <td className="p-3">{i.direccion}</td>
                  <td className="p-3 whitespace-nowrap">{fecha(i.creadaEn)}</td>
                  <td className="p-3">{i.inspectorNombre ?? <span className="text-slate-400">Sin asignar</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}