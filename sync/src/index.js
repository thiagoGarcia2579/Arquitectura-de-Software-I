// Servicio de sincronización = CAPA ANTICORRUPCIÓN hacia el sistema municipal.
// Es el ÚNICO componente que habla SOAP. Toma lo pendiente de la tabla "outbox" y lo envía.
//   - Error "Server"/timeout/red  => se reintenta con backoff exponencial.
//   - Fault "Client"              => error permanente: no se reintenta, el acta queda en error_asociacion.
//   - Un solo worker y una fila por vez => las asociaciones se hacen serializadas.
import pg from 'pg';

const SOAP_URL = process.env.SOAP_URL ?? 'http://mock-expedientes:4100/';
const INTERVALO_MS = Number(process.env.SYNC_INTERVALO_MS ?? 2000);
const TIMEOUT_MS = Number(process.env.SOAP_TIMEOUT_MS ?? 5000);
const MAX_INTENTOS = Number(process.env.SYNC_MAX_INTENTOS ?? 8);

const pool = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const esc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

// Traduce nuestro modelo -> XML del sistema viejo, y su respuesta -> resultado simple.
async function asociarActa(expedienteId, actaId) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:exp="http://municipio.example/expedientes">
  <soapenv:Body>
    <exp:AsociarActa><exp:expedienteId>${esc(expedienteId)}</exp:expedienteId><exp:actaId>${esc(actaId)}</exp:actaId></exp:AsociarActa>
  </soapenv:Body>
</soapenv:Envelope>`;
  let resp, texto;
  try {
    resp = await fetch(SOAP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: 'AsociarActa' },
      body: xml,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    texto = await resp.text();
  } catch (err) {
    return { ok: false, permanente: false, detalle: `Sin respuesta del sistema municipal (${err.name})` };
  }
  const code = texto.match(/<faultcode>([^<]*)<\/faultcode>/)?.[1];
  if (code) {
    const msg = texto.match(/<faultstring>([^<]*)<\/faultstring>/)?.[1] ?? 'Fault sin detalle';
    return { ok: false, permanente: code.endsWith('Client'), detalle: `SOAP Fault ${code}: ${msg}` };
  }
  if (resp.ok && /<resultado>OK<\/resultado>/.test(texto)) {
    return { ok: true, detalle: /<yaAsociada>true</.test(texto) ? 'OK (ya estaba asociada)' : 'OK' };
  }
  return { ok: false, permanente: false, detalle: `Respuesta inesperada (HTTP ${resp.status})` };
}

// Procesa UNA fila pendiente en su propia transacción. Devuelve false si no había nada.
async function procesarUna() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT o.id, o.acta_id, o.intentos, i.expediente_id
         FROM outbox o
         JOIN actas a ON a.id = o.acta_id
         JOIN inspecciones i ON i.id = a.inspeccion_id
        WHERE o.procesado_en IS NULL AND o.proximo_intento <= now()
        ORDER BY o.id LIMIT 1
        FOR UPDATE OF o SKIP LOCKED`,
    );
    if (rows.length === 0) { await client.query('ROLLBACK'); return false; }
    const f = rows[0];

    const r = await asociarActa(f.expediente_id, f.acta_id);
    const intentos = f.intentos + 1;

    if (r.ok) {
      await client.query('UPDATE outbox SET procesado_en = now(), intentos = $2, ultimo_error = NULL WHERE id = $1', [f.id, intentos]);
      await client.query("UPDATE actas SET estado = 'asociada', asociada_en = now(), detalle_asociacion = $2 WHERE id = $1", [f.acta_id, r.detalle]);
      console.log(`✔ acta ${f.acta_id} -> ${f.expediente_id}: ${r.detalle} (intento ${intentos})`);
    } else if (r.permanente || intentos >= MAX_INTENTOS) {
      await client.query('UPDATE outbox SET procesado_en = now(), intentos = $2, ultimo_error = $3 WHERE id = $1', [f.id, intentos, r.detalle]);
      await client.query("UPDATE actas SET estado = 'error_asociacion', detalle_asociacion = $2 WHERE id = $1", [f.acta_id, r.detalle]);
      console.log(`✖ acta ${f.acta_id}: ${r.detalle} (definitivo, intento ${intentos})`);
    } else {
      const esperaS = Math.min(2 ** intentos * 2, 300);   // 4s, 8s, 16s ... tope 5 min
      await client.query(
        `UPDATE outbox SET intentos = $2, ultimo_error = $3, proximo_intento = now() + make_interval(secs => $4) WHERE id = $1`,
        [f.id, intentos, r.detalle, esperaS],
      );
      console.log(`↻ acta ${f.acta_id}: ${r.detalle}. Reintento en ${esperaS}s (intento ${intentos})`);
    }
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

console.log(`sync iniciado · SOAP en ${SOAP_URL} · cada ${INTERVALO_MS} ms`);
while (true) {
  try {
    while (await procesarUna()) { /* seguir mientras haya pendientes */ }
  } catch (err) {
    console.error('Error en el ciclo de sync:', err.message);
  }
  await new Promise((r) => setTimeout(r, INTERVALO_MS));
}
