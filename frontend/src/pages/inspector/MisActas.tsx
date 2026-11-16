import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { BadgeActaLocal } from '../../components/Badges';
import { Cargando, ErrorMsg, fecha, Vacio } from '../../components/Estados';
import { combinarActas } from '../../offline/actas';
import { descartarActa, type ActaLocal } from '../../offline/db';
import { useActasLocales, useActasRemotas, useOnline } from '../../offline/hooks';

export function MisActas() {
  const { usuario } = useAuth();
  const userId = usuario!.id;
  const online = useOnline();
  const locales = useActasLocales(userId);
  const remotas = useActasRemotas(userId, online);
  const actas = combinarActas(locales.actas, remotas.actas, userId);
  const [abierta, setAbierta] = useState<string | null>(null);

  if (locales.cargando || remotas.cargando) return <Cargando />;
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Mis actas</h1>
        <button className="btn-secondary" onClick={remotas.actualizar} disabled={!online}>Actualizar</button>
      </div>
      {remotas.error && <ErrorMsg onReintentar={online ? remotas.actualizar : undefined}>{remotas.error}</ErrorMsg>}
      {!online && <p className="text-xs text-slate-500">Sin conexión: se muestran las actas guardadas en este dispositivo.</p>}
      {actas.length === 0 ? <Vacio>Todavía no cargaste ninguna acta.</Vacio> : (
        <ul className="space-y-2">
          {actas.map((a) => (
            <li key={a.id} className="card space-y-2">
              <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setAbierta(abierta === a.id ? null : a.id)}>
                <span>
                  <span className="block text-sm font-semibold">{a.expediente}</span>
                  <span className="block text-sm text-slate-600">{a.direccion}</span>
                  <span className="block text-xs text-slate-500">Fecha: {fecha(a.creadaEnDispositivo)}</span>
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
