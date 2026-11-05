import { useCallback, useEffect, useState } from 'react';
import { misInspeccionesMobile } from '../api/endpoints';
import { mensajeDeError, NetworkError } from '../api/http';
import type { InspeccionLiviana } from '../api/types';
import { actasDeUsuario, cachearInspecciones, inspeccionesCacheadas, suscribir, type ActaLocal } from './db';

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
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

// Online: pide la lista liviana al BFF y la cachea. Sin red o con el backend caído: usa lo cacheado.
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
        const r = await misInspeccionesMobile();
        await cachearInspecciones(userId, r.items);
        if (!vigente) return;
        setItems(r.items); setDesdeCache(false); setError(null);
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
