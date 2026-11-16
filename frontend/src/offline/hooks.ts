import { useCallback, useEffect, useState } from 'react';
import { listarActas, listarInspecciones } from '../api/endpoints';
import { mensajeDeError, NetworkError } from '../api/http';
import type { Acta, InspeccionLiviana } from '../api/types';
import { actasDeUsuario, actasRemotasCacheadas, cachearActasRemotas, cachearInspecciones, inspeccionesCacheadas, suscribir, type ActaLocal } from './db';

const HEALTH_URL = '/health';
const HEALTH_CHECK_MS = 5000;
const HEALTH_TIMEOUT_MS = 3000;

export function useOnline(): boolean {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let vigente = true;
    let verificando = false;
    const verificar = async () => {
      if (verificando) return;
      if (!navigator.onLine) {
        setOnline(false);
        return;
      }

      verificando = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      try {
        const respuesta = await fetch(HEALTH_URL, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (vigente) setOnline(navigator.onLine && respuesta.ok);
      } catch {
        if (vigente) setOnline(false);
      } finally {
        window.clearTimeout(timeout);
        verificando = false;
      }
    };
    const on = () => { void verificar(); };
    const off = () => setOnline(false);

    void verificar();
    const intervalo = window.setInterval(() => { void verificar(); }, HEALTH_CHECK_MS);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      vigente = false;
      window.clearInterval(intervalo);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useActasLocales(userId: string) {
  const [actas, setActas] = useState<ActaLocal[]>([]);
  const [cargando, setCargando] = useState(true);
  const recargar = useCallback(async () => {
    setActas(await actasDeUsuario(userId));
    setCargando(false);
  }, [userId]);
  useEffect(() => {
    void recargar();
    return suscribir(() => { void recargar(); });
  }, [recargar]);
  return { actas, cargando };
}

export function useActasRemotas(userId: string, online: boolean) {
  const [cache, setCache] = useState<{ userId: string; items: Acta[] }>({ userId, items: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const actualizar = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    let vigente = true;
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const guardadas = await actasRemotasCacheadas(userId);
        if (!vigente) return;
        setCache({ userId, items: guardadas });
        if (online) {
          const items = (await listarActas()).filter((acta) => acta.inspectorId === userId);
          if (!vigente) return;
          setCache({ userId, items });
          await cachearActasRemotas(userId, items);
        }
      } catch (e) {
        if (vigente) setError(`No se pudieron actualizar las actas del servidor: ${mensajeDeError(e)}`);
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
  }, [userId, online, revision]);

  return { actas: cache.userId === userId ? cache.items : [], cargando, error, actualizar };
}

// Online: guarda solo los campos necesarios. Sin red o con el backend caído: usa lo cacheado.
export function useInspecciones(userId: string, online: boolean) {
  const [items, setItems] = useState<InspeccionLiviana[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [desdeCache, setDesdeCache] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      setCargando(true);
      try {
        if (!online) throw new NetworkError();
        const inspecciones = await listarInspecciones();
        const items = inspecciones.map((i) => ({ id: i.id, expediente: i.expedienteId, direccion: i.direccion }));
        await cachearInspecciones(userId, items);
        if (!vigente) return;
        setItems(items); setDesdeCache(false); setError(null);
      } catch (e) {
        const cache = await inspeccionesCacheadas(userId);
        if (!vigente) return;
        setItems(cache); setDesdeCache(true);
        setError(e instanceof NetworkError ? null : mensajeDeError(e));
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
  }, [userId, online]);

  return { items, cargando, error, desdeCache };
}
