import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { BadgeActaLocal } from '../../components/Badges';
import { Cargando, fecha, Vacio } from '../../components/Estados';
import { descartarActa, type ActaLocal } from '../../offline/db';
import { useActasLocales } from '../../offline/hooks';

export function MisActas() {
  const { usuario } = useAuth();
  const { actas, cargando } = useActasLocales(usuario!.id);
  const [abierta, setAbierta] = useState<string | null>(null);

  if (cargando) return <Cargando />;
  return (
    <section className="space-y-3">
      <h1 className="text-lg font-semibold">Mis actas</h1>
      {actas.length === 0 ? <Vacio>Todavía no cargaste ninguna acta.</Vacio> : (
        <ul className="space-y-2">
          {actas.map((a) => (
            <li key={a.id} className="card space-y-2">
              <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setAbierta(abierta === a.id ? null : a.id)}>
                <span>
                  <span className="block text-sm font-semibold">{a.expediente}</span>
                  <span className="block text-sm text-slate-600">{a.direccion}</span>
                  <span className="block text-xs text-slate-500">Según el celular: {fecha(a.creadaEnDispositivo)}</span>
                </span>
                <BadgeActaLocal acta={a} />
              </button>
              {a.local !== 'enviada' && a.detalleLocal && (
                <p className={`text-xs ${a.local === 'rechazada' ? 'text-red-700' : 'text-slate-500'}`}>{a.detalleLocal}</p>
              )}
              {abierta === a.id && <Detalle acta={a} />}
              {a.local === 'rechazada' && (
                <button className="btn-danger" onClick={() => void descartarActa(a.id)}>Descartar</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Detalle({ acta }: { acta: ActaLocal }) {
  const r = acta.remoto;
  return (
    <dl className="space-y-1 border-t border-slate-100 pt-2 text-sm">
      <div><dt className="inline font-medium">Observaciones: </dt><dd className="inline whitespace-pre-wrap">{acta.observaciones || '—'}</dd></div>
      <div><dt className="inline font-medium">Fotos: </dt><dd className="inline">{acta.cantidadFotos}</dd></div>
      <div><dt className="inline font-medium">ID: </dt><dd className="inline break-all text-xs">{acta.id}</dd></div>
      {r && <div><dt className="inline font-medium">Recibida por el servidor: </dt><dd className="inline">{fecha(r.recibidaEn)}</dd></div>}
      {r?.asociadaEn && <div><dt className="inline font-medium">Asociada: </dt><dd className="inline">{fecha(r.asociadaEn)}</dd></div>}
      {r?.detalleAsociacion && <div><dt className="inline font-medium">Detalle: </dt><dd className="inline">{r.detalleAsociacion}</dd></div>}
      {acta.local === 'enviada' && <p className="text-xs text-slate-500">Acta enviada: solo lectura.</p>}
    </dl>
  );
}
