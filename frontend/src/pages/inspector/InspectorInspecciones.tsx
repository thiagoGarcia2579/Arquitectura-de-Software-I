import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Cargando, ErrorMsg, Vacio } from '../../components/Estados';
import { useInspecciones, useOnline } from '../../offline/hooks';

export function InspectorInspecciones() {
  const { usuario } = useAuth();
  const online = useOnline();
  const { items, cargando, error, desdeCache } = useInspecciones(usuario!.id, online);

  return (
    <section className="space-y-3">
      <h1 className="text-lg font-semibold">Mis inspecciones</h1>
      {desdeCache && <p className="text-xs text-amber-700">Mostrando la última lista guardada en el celular.</p>}
      {error && <ErrorMsg>{error}</ErrorMsg>}
      {cargando ? <Cargando /> : items.length === 0 ? (
        <Vacio>No tenés inspecciones asignadas{desdeCache ? ' (o todavía no se descargaron: conectate una vez)' : ''}.</Vacio>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="card flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{i.expediente}</p>
                <p className="text-sm text-slate-600">{i.direccion}</p>
              </div>
              <Link className="btn-primary" to={`/inspector/nueva?inspeccion=${i.id}`}>Cargar acta</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
