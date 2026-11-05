import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { mensajeDeError } from '../../api/http';
import { useAuth } from '../../auth/AuthContext';
import { useActasLocales, useOnline } from '../../offline/hooks';
import { actualizarRemoto, sincronizar } from '../../offline/sync';

const POLL_MS = 5000;

// Contenedor del flujo inspector: barra de conexión/cola, sync automático y polling del estado remoto.
export function InspectorShell() {
  const { usuario } = useAuth();
  const userId = usuario!.id;
  const online = useOnline();
  const { actas } = useActasLocales(userId);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const pendientes = actas.filter((a) => a.local === 'pendiente_envio').length;
  const actasRef = useRef(actas);
  actasRef.current = actas;

  const sincronizarAhora = useCallback(async () => {
    setSincronizando(true);
    setMensaje(null);
    try {
      const r = await sincronizar(userId);
      if (r.sinConexion) setMensaje('No se pudo contactar al servidor. Quedan actas pendientes.');
      else if (r.enviadas + r.rechazadas > 0)
        setMensaje(`Sincronización lista: ${r.enviadas} enviada(s)${r.rechazadas ? `, ${r.rechazadas} rechazada(s)` : ''}.`);
      else setMensaje('No hay nada para enviar.');
    } catch (e) {
      setMensaje(mensajeDeError(e));
    } finally {
      setSincronizando(false);
    }
  }, [userId]);

  // Al volver la conexión (y al abrir con conexión) se manda lo acumulado.
  useEffect(() => {
    if (online && actasRef.current.some((a) => a.local === 'pendiente_envio')) void sincronizarAhora();
  }, [online, sincronizarAhora]);

  // Polling de las enviadas que todavía no se resolvieron. Se frena solo cuando no hay ninguna.
  const hayParaSeguir = actas.some((a) => a.local === 'enviada' && (!a.remoto || a.remoto.estado === 'pendiente_asociacion'));
  useEffect(() => {
    if (!online || !hayParaSeguir) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      actasRef.current
        .filter((a) => a.local === 'enviada' && (!a.remoto || a.remoto.estado === 'pendiente_asociacion'))
        .forEach((a) => { void actualizarRemoto(a.id); });
    };
    tick();
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [online, hayParaSeguir]);

  return (
    <>
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="font-semibold">{pendientes}</span> acta(s) pendiente(s) de envío
          {!online && <span className="ml-2 text-amber-700">· Trabajando sin conexión: se guardan en el celular.</span>}
          {mensaje && <p className="mt-1 text-xs text-slate-500" role="status">{mensaje}</p>}
        </div>
        <button className="btn-primary" disabled={!online || sincronizando || pendientes === 0} onClick={() => void sincronizarAhora()}>
          {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
        </button>
      </div>
      <Outlet />
    </>
  );
}
