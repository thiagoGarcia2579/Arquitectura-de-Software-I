import { useCallback, useEffect, useState } from 'react';
import { listarInspecciones, reasignarInspeccion } from '../../api/endpoints';
import { mensajeDeError } from '../../api/http';
import type { Inspeccion } from '../../api/types';
import { Cargando, ErrorMsg, fecha, Vacio } from '../../components/Estados';

// TODO: el backend no tiene un endpoint para listar inspectores, así que el mapa está hardcodeado.
// Los ids coinciden con db/init.sql. Cuando exista GET de usuarios/inspectores, reemplazar por eso.
const INSPECTORES: Record<string, string> = {
  '11111111-1111-1111-1111-111111111111': 'Ana Inspectora',
  '22222222-2222-2222-2222-222222222222': 'Beto Inspector',
};

export function SupervisorInspecciones() {
  const [items, setItems] = useState<Inspeccion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [errorFila, setErrorFila] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try { setItems(await listarInspecciones()); } catch (e) { setError(mensajeDeError(e)); } finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  async function confirmar(id: string) {
    setGuardando(true);
    setErrorFila(null);
    try {
      const actualizada = await reasignarInspeccion(id, nuevo);
      setItems((prev) => prev.map((i) => (i.id === id ? actualizada : i)));
      setEditando(null);
    } catch (e) {
      setErrorFila(mensajeDeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="space-y-3">
      <h1 className="text-lg font-semibold">Inspecciones</h1>
      {error && <ErrorMsg onReintentar={() => void cargar()}>{error}</ErrorMsg>}
      {cargando ? <Cargando /> : items.length === 0 && !error ? <Vacio>No hay inspecciones.</Vacio> : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-500">
              <tr><th className="p-3">Expediente</th><th className="p-3">Dirección</th><th className="p-3">Creada</th><th className="p-3">Inspector</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className="border-t border-slate-100 align-top">
                  <td className="p-3 whitespace-nowrap font-medium">{i.expedienteId}</td>
                  <td className="p-3">{i.direccion}</td>
                  <td className="p-3 whitespace-nowrap">{fecha(i.creadaEn)}</td>
                  <td className="p-3">
                    {editando === i.id ? (
                      <div className="space-y-1">
                        <select className="input" value={nuevo} onChange={(e) => setNuevo(e.target.value)}>
                          {Object.entries(INSPECTORES).map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}
                        </select>
                        {errorFila && <p role="alert" className="text-xs text-red-700">{errorFila}</p>}
                      </div>
                    ) : (i.inspectorId ? INSPECTORES[i.inspectorId] ?? i.inspectorId : <span className="text-slate-400">Sin asignar</span>)}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {editando === i.id ? (
                      <span className="flex justify-end gap-2">
                        <button className="btn-primary" disabled={guardando} onClick={() => void confirmar(i.id)}>{guardando ? 'Guardando…' : 'Guardar'}</button>
                        <button className="btn-secondary" disabled={guardando} onClick={() => setEditando(null)}>Cancelar</button>
                      </span>
                    ) : (
                      <button
                        className="btn-secondary"
                        onClick={() => { setEditando(i.id); setNuevo(i.inspectorId ?? Object.keys(INSPECTORES)[0]); setErrorFila(null); }}
                      >
                        Reasignar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
