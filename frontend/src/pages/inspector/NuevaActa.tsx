import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Cargando, Vacio } from '../../components/Estados';
import { guardarActa } from '../../offline/db';
import { useInspecciones, useOnline } from '../../offline/hooks';
import { sincronizar } from '../../offline/sync';

const MAX_OBS = 5000;
const MAX_FOTOS = 20;

export function NuevaActa() {
  const { usuario } = useAuth();
  const userId = usuario!.id;
  const online = useOnline();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { items, cargando } = useInspecciones(userId, online);

  const [inspeccionId, setInspeccionId] = useState(params.get('inspeccion') ?? '');
  const [observaciones, setObservaciones] = useState('');
  const [fotos, setFotos] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegida = items.find((i) => i.id === inspeccionId);
  const valido = !!elegida && observaciones.length <= MAX_OBS;

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!elegida || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      // Siempre se guarda primero en el celular: nunca se pierde un acta por falta de señal.
      await guardarActa({
        id: crypto.randomUUID(),
        userId,
        inspeccionId: elegida.id,
        expediente: elegida.expediente,
        direccion: elegida.direccion,
        observaciones,
        cantidadFotos: fotos,
        creadaEnDispositivo: new Date().toISOString(),
        local: 'pendiente_envio',
      });
      if (online) void sincronizar(userId).catch(() => undefined);
      navigate('/inspector/actas');
    } catch {
      setError('No se pudo guardar el acta en el celular. Revisá el almacenamiento disponible.');
      setGuardando(false);
    }
  }

  if (cargando) return <Cargando />;
  if (items.length === 0) return <Vacio>No hay inspecciones disponibles para cargar un acta. Conectate al menos una vez para descargarlas.</Vacio>;

  return (
    <form onSubmit={guardar} className="card max-w-xl space-y-4">
      <h1 className="text-lg font-semibold">Nueva acta</h1>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Inspección</span>
        <select className="input" value={inspeccionId} onChange={(e) => setInspeccionId(e.target.value)} required>
          <option value="" disabled>Elegí una inspección…</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.expediente} · {i.direccion}</option>)}
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium">Observaciones</span>
        <textarea
          className="input min-h-32"
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          maxLength={MAX_OBS}
          placeholder="Describí lo observado en la obra…"
        />
        <span className="block text-right text-xs text-slate-500">{observaciones.length} / {MAX_OBS}</span>
      </label>

      <div className="space-y-1">
        <span className="text-sm font-medium">Cantidad de fotos</span>
        <div className="flex items-center gap-3">
          <button type="button" className="btn-secondary h-10 w-10 text-lg" disabled={fotos <= 0} onClick={() => setFotos(fotos - 1)} aria-label="Una foto menos">−</button>
          <span className="w-8 text-center text-lg font-semibold" aria-live="polite">{fotos}</span>
          <button type="button" className="btn-secondary h-10 w-10 text-lg" disabled={fotos >= MAX_FOTOS} onClick={() => setFotos(fotos + 1)} aria-label="Una foto más">+</button>
        </div>
        <p className="text-xs text-slate-500">Por ahora el sistema solo registra cuántas fotos se sacaron (0 a 20); no se suben las imágenes.</p>
      </div>

      <p className="text-xs text-slate-500">La fecha del dispositivo se toma automáticamente al guardar. Una vez enviada, el acta no se puede modificar.</p>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full" disabled={!valido || guardando}>
        {guardando ? 'Guardando…' : online ? 'Guardar y enviar' : 'Guardar (se enviará al reconectar)'}
      </button>
    </form>
  );
}
