// API de inspecciones y actas.
// Reglas de seguridad que se resuelven ACÁ (el gateway no conoce los datos del dominio):
//   1) autenticación: JWT válido (firma, vencimiento, emisor, audiencia)
//   2) rol: qué operaciones puede hacer cada rol (matriz de permisos)
//   3) regla fina: un inspector solo carga actas de inspecciones ASIGNADAS A ÉL
import express from 'express';
import pg from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS_URL = process.env.JWKS_URL;
const ISSUER = process.env.ISSUER;
const AUDIENCE = process.env.AUDIENCE ?? 'inspecciones-api';
if (!JWKS_URL || !ISSUER) {
  console.error('Faltan JWKS_URL e ISSUER (revisá el docker-compose)');
  process.exit(1);
}
// Se descarga la primera vez que llega un token y queda en caché.
const jwks = createRemoteJWKSet(new URL(JWKS_URL));
const ROLES = ['inspector', 'supervisor', 'administrativo'];

const pool = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const app = express();
app.use('/sync', express.json({ limit: '1mb' }));
app.use(express.json({ limit: '256kb' }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Errores con Problem Details (RFC 9457)
const PREFIJO_PUBLICO = '/api/v1';   // el gateway quita este prefijo antes de llegar a la API
function problem(res, status, title, detail, instance) {
  return res.status(status).type('application/problem+json')
    .json({ type: 'about:blank', title, status, detail, instance: PREFIJO_PUBLICO + instance });
}

// Copia local de la identidad (la fuente de verdad es Keycloak). Hace falta porque
// inspecciones.inspector_id y actas.inspector_id tienen clave foránea a usuarios(id).
const registrados = new Set();   // evita escribir en la base en cada pedido
async function registrarUsuario(u, username) {
  const clave = `${u.id}:${u.rol}`;   // si cambia el rol en Keycloak, se vuelve a registrar
  if (registrados.has(clave)) return;
  try {
    await pool.query(
      `INSERT INTO usuarios (id, username, nombre, rol) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, rol = EXCLUDED.rol`,
      [u.id, username, u.nombre, u.rol]);
    registrados.add(clave);
  } catch (err) {
    console.error('No se pudo registrar al usuario', u.id, err.message);   // no bloquea el pedido
  }
}

// ---- Autenticación y roles -------------------------------------------------
async function autenticar(req, res, next) {
  const [esquema, token] = (req.get('Authorization') ?? '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    res.set('WWW-Authenticate', 'Bearer');
    return problem(res, 401, 'No autenticado', 'Falta el header "Authorization: Bearer <token>".', req.originalUrl);
  }
  let p;
  try {
    // Verifica firma (clave pública de Keycloak), emisor, audiencia y vencimiento.
    ({ payload: p } = await jwtVerify(token, jwks, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['RS256'] }));
  } catch {
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    return problem(res, 401, 'Token inválido', 'El token es inválido o está vencido.', req.originalUrl);
  }
  const rol = (p.realm_access?.roles ?? []).find((r) => ROLES.includes(r));
  if (!rol) return problem(res, 403, 'Prohibido', 'El usuario no tiene un rol del sistema.', req.originalUrl);
  req.usuario = { id: p.sub, rol, nombre: p.name ?? p.preferred_username ?? p.sub };
  await registrarUsuario(req.usuario, p.preferred_username ?? p.sub);
  next();
}

const permitir = (...roles) => (req, res, next) =>
  roles.includes(req.usuario.rol)
    ? next()
    : problem(res, 403, 'Prohibido', `El rol "${req.usuario.rol}" no puede realizar esta operación.`, req.originalUrl);

// ---- Mapeos ---------------------------------------------------------------
const aInspeccion = (r) => ({
  id: r.id, expedienteId: r.expediente_id, direccion: r.direccion,
  inspectorId: r.inspector_id, inspectorNombre: r.inspector_nombre ?? null, creadaEn: r.creada_en,
});
const aActa = (r) => ({
  id: r.id, inspeccionId: r.inspeccion_id, inspectorId: r.inspector_id, expedienteId: r.expediente_id,
  direccion: r.direccion,
  observaciones: r.observaciones, cantidadFotos: r.cantidad_fotos, estado: r.estado,
  creadaEnDispositivo: r.creada_en_dispositivo, recibidaEn: r.recibida_en,
  asociadaEn: r.asociada_en, detalleAsociacion: r.detalle_asociacion,
});

// ---- Endpoints --------------------------------------------------------------
app.get('/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});

// Inspector: solo las suyas. Supervisor y administrativo: todas.
app.get('/inspecciones', autenticar, permitir('inspector', 'supervisor', 'administrativo'), async (req, res) => {
  const propias = req.usuario.rol === 'inspector';
  const { rows } = await pool.query(
    `SELECT i.*, u.nombre AS inspector_nombre
       FROM inspecciones i LEFT JOIN usuarios u ON u.id = i.inspector_id
      ${propias ? 'WHERE i.inspector_id = $1' : ''}
      ORDER BY i.creada_en, i.id`,
    propias ? [req.usuario.id] : [],
  );
  res.json(rows.map(aInspeccion));
});

// Solo el supervisor asigna o reasigna.
app.patch('/inspecciones/:id/asignacion', autenticar, permitir('supervisor'), async (req, res) => {
  const { id } = req.params;
  const { inspectorId } = req.body ?? {};
  if (!UUID.test(id) || typeof inspectorId !== 'string' || !UUID.test(inspectorId)) {
    return problem(res, 400, 'Datos inválidos', 'Se requiere un id de inspección y un "inspectorId" (UUID) válidos.', req.originalUrl);
  }
  const u = await pool.query("SELECT 1 FROM usuarios WHERE id = $1 AND rol = 'inspector'", [inspectorId]);
  if (u.rowCount === 0) return problem(res, 400, 'Inspector inválido', 'El usuario indicado no existe o no es inspector.', req.originalUrl);
  const { rows } = await pool.query('UPDATE inspecciones SET inspector_id = $1 WHERE id = $2 RETURNING *', [inspectorId, id]);
  if (rows.length === 0) return problem(res, 404, 'Inspección no encontrada', `No existe la inspección ${id}.`, req.originalUrl);
  res.json(aInspeccion(rows[0]));
});

// Compartida por la carga individual y por lote: cada acta tiene su propia transacción.
async function cargarActa(id, body, usuario) {
  const { inspeccionId, observaciones = '', cantidadFotos = 0, creadaEnDispositivo = null } = body ?? {};

  if (typeof id !== 'string' || !UUID.test(id) || typeof inspeccionId !== 'string' || !UUID.test(inspeccionId)) {
    return { status: 400, title: 'Datos inválidos', detail: 'El id del acta y "inspeccionId" deben ser UUID válidos.' };
  }
  if (typeof observaciones !== 'string' || observaciones.length > 5000 ||
    !Number.isInteger(cantidadFotos) || cantidadFotos < 0 || cantidadFotos > 20 ||
    (creadaEnDispositivo !== null && (typeof creadaEnDispositivo !== 'string' || Number.isNaN(Date.parse(creadaEnDispositivo))))) {
    return { status: 400, title: 'Datos inválidos',
      detail: '"observaciones" (texto, máx. 5000), "cantidadFotos" (entero 0 a 20) y "creadaEnDispositivo" (fecha ISO, opcional).' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insp = await client.query('SELECT * FROM inspecciones WHERE id = $1', [inspeccionId]);
    if (insp.rowCount === 0) {
      await client.query('ROLLBACK');
      return { status: 404, title: 'Inspección no encontrada', detail: `No existe la inspección ${inspeccionId}.` };
    }
    if (insp.rows[0].inspector_id !== usuario.id) {
      await client.query('ROLLBACK');
      return { status: 403, title: 'Prohibido', detail: 'La inspección no está asignada a este inspector.' };
    }

    const ins = await client.query(
      `INSERT INTO actas (id, inspeccion_id, inspector_id, observaciones, cantidad_fotos, creada_en_dispositivo)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING RETURNING *`,
      [id, inspeccionId, usuario.id, observaciones, cantidadFotos, creadaEnDispositivo],
    );

    if (ins.rowCount === 0) {            // reintento: el acta ya existía
      // Hacemos JOIN para traer el expediente_id en el reintento (respuesta 200)
      const previa = (await client.query(
        `SELECT a.*, i.expediente_id, i.direccion FROM actas a JOIN inspecciones i ON i.id = a.inspeccion_id WHERE a.id = $1`,
        [id]
      )).rows[0];

      await client.query('ROLLBACK');
      if (previa.inspector_id !== usuario.id) {
        return { status: 409, title: 'Conflicto', detail: 'Ya existe un acta con ese id.' };
      }
      return { status: 200, acta: aActa(previa) };
    }

    // Outbox
    await client.query('INSERT INTO outbox (acta_id) VALUES ($1)', [id]);
    await client.query('COMMIT');

    // Para la respuesta 201 (creada con éxito), necesitamos el expediente_id haciendo JOIN también
    const creadaConExpediente = (await client.query(
      `SELECT a.*, i.expediente_id, i.direccion FROM actas a JOIN inspecciones i ON i.id = a.inspeccion_id WHERE a.id = $1`,
      [id]
    )).rows[0];

    return { status: 201, acta: aActa(creadaConExpediente) };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al revertir la transacción:', rollbackError);
    }
    throw err;
  } finally {
    client.release();
  }
}

// PUT idempotente: un reintento no duplica ni modifica el acta cerrada.
app.put('/actas/:id', autenticar, permitir('inspector'), async (req, res) => {
  const resultado = await cargarActa(req.params.id, req.body, req.usuario);
  if (resultado.status >= 400) {
    return problem(res, resultado.status, resultado.title, resultado.detail, req.originalUrl);
  }
  if (resultado.status === 201) res.location(`/api/v1/actas/${req.params.id}`);
  return res.status(resultado.status).json(resultado.acta);
});

app.post('/sync', autenticar, permitir('inspector'), async (req, res) => {
  const actas = req.body?.actas;
  if (!Array.isArray(actas) || actas.length === 0 || actas.length > 50) {
    return problem(res, 400, 'Datos inválidos', 'Se requiere "actas": lista de 1 a 50 elementos.', req.originalUrl);
  }

  const resultados = [];
  for (const acta of actas) {
    const id = typeof acta?.id === 'string' ? acta.id : null;
    try {
      const resultado = await cargarActa(id, acta, req.usuario);
      resultados.push({
        id,
        http: resultado.status,
        estado: resultado.status === 201 ? 'creada' : resultado.status === 200 ? 'ya_recibida' : 'rechazada',
        ...(resultado.detail && { detalle: resultado.detail }),
      });
    } catch (err) {
      console.error('Error al sincronizar acta:', err);
      resultados.push({ id, http: 500, estado: 'rechazada', detalle: 'Error interno al procesar el acta; se puede reintentar.' });
    }
  }
  return res.json({ resultados });
});

// Inspector: solo las propias. Supervisor y administrativo: todas.
app.get('/actas', autenticar, permitir('inspector', 'supervisor', 'administrativo'), async (req, res) => {
  const propias = req.usuario.rol === 'inspector';
  const { rows } = await pool.query(
    `SELECT a.*, i.expediente_id, i.direccion
     FROM actas a 
     JOIN inspecciones i ON i.id = a.inspeccion_id 
     ${propias ? 'WHERE a.inspector_id = $1' : ''} 
     ORDER BY a.recibida_en DESC LIMIT 100`,
    propias ? [req.usuario.id] : [],
  );
  res.json(rows.map(aActa));
});

app.get('/actas/:id', autenticar, permitir('inspector', 'supervisor', 'administrativo'), async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(id)) return problem(res, 400, 'Id inválido', 'El id debe ser un UUID.', req.originalUrl);

  // Hacemos JOIN con inspecciones para obtener el expediente_id
  const { rows } = await pool.query(
    `SELECT a.*, i.expediente_id, i.direccion
     FROM actas a 
     JOIN inspecciones i ON i.id = a.inspeccion_id 
     WHERE a.id = $1`,
    [id]
  );

  if (rows.length === 0 || (req.usuario.rol === 'inspector' && rows[0].inspector_id !== req.usuario.id)) {
    return problem(res, 404, 'Acta no encontrada', `No existe el acta ${id}.`, req.originalUrl);
  }
  res.json(aActa(rows[0]));
});

// Cualquier error no previsto también sale como Problem Details
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return problem(res, 413, 'Cuerpo demasiado grande', 'El cuerpo supera el tamaño permitido.', req.originalUrl);
  }
  if (err.type === 'entity.parse.failed') {
    return problem(res, 400, 'Cuerpo inválido', 'Se esperaba JSON válido.', req.originalUrl);
  }
  console.error(err);
  problem(res, 500, 'Error interno', 'Ocurrió un error inesperado.', req.originalUrl);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API de inspecciones escuchando en el puerto ${port}`));
