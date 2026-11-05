// API de inspecciones y actas.
// Reglas de seguridad que se resuelven ACÁ (el gateway no conoce los datos del dominio):
//   1) autenticación: JWT válido (firma, vencimiento, emisor, audiencia)
//   2) rol: qué operaciones puede hacer cada rol (matriz de permisos)
//   3) regla fina: un inspector solo carga actas de inspecciones ASIGNADAS A ÉL
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET falta o tiene menos de 32 caracteres (revisá el .env)');
  process.exit(1);
}

const pool = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const app = express();
app.use(express.json({ limit: '256kb' }));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Errores con Problem Details (RFC 9457)
function problem(res, status, title, detail, instance) {
  return res.status(status).type('application/problem+json').json({ type: 'about:blank', title, status, detail, instance });
}

// ---- Autenticación y roles -------------------------------------------------
function autenticar(req, res, next) {
  const [esquema, token] = (req.get('Authorization') ?? '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    return problem(res, 401, 'No autenticado', 'Falta el header "Authorization: Bearer <token>".', req.originalUrl);
  }
  try {
    const p = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], issuer: 'auth-inspecciones', audience: 'inspecciones' });
    req.usuario = { id: p.sub, rol: p.rol, nombre: p.nombre };
    next();
  } catch {
    problem(res, 401, 'Token inválido', 'El token es inválido o está vencido.', req.originalUrl);
  }
}

const permitir = (...roles) => (req, res, next) =>
  roles.includes(req.usuario.rol)
    ? next()
    : problem(res, 403, 'Prohibido', `El rol "${req.usuario.rol}" no puede realizar esta operación.`, req.originalUrl);

// ---- Mapeos ---------------------------------------------------------------
const aInspeccion = (r) => ({
  id: r.id, expedienteId: r.expediente_id, direccion: r.direccion,
  inspectorId: r.inspector_id, creadaEn: r.creada_en,
});
const aActa = (r) => ({
  id: r.id, inspeccionId: r.inspeccion_id, inspectorId: r.inspector_id,
  observaciones: r.observaciones, cantidadFotos: r.cantidad_fotos, estado: r.estado,
  creadaEnDispositivo: r.creada_en_dispositivo, recibidaEn: r.recibida_en,
  asociadaEn: r.asociada_en, detalleAsociacion: r.detalle_asociacion,
});

// ---- Endpoints --------------------------------------------------------------
app.get('/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});

// Inspector: solo las suyas. Supervisor: todas. Administrativo: 403 (matriz de permisos).
app.get('/inspecciones', autenticar, permitir('inspector', 'supervisor'), async (req, res) => {
  const propias = req.usuario.rol === 'inspector';
  const { rows } = await pool.query(
    `SELECT * FROM inspecciones ${propias ? 'WHERE inspector_id = $1' : ''} ORDER BY creada_en, id`,
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

// PUT con id generado por el cliente => IDEMPOTENTE: si el celular reintenta tras un corte,
// no se duplica el acta. El acta cerrada es inmutable: un reintento nunca la modifica.
app.put('/actas/:id', autenticar, permitir('inspector'), async (req, res) => {
  const { id } = req.params;
  const { inspeccionId, observaciones = '', cantidadFotos = 0, creadaEnDispositivo = null } = req.body ?? {};

  if (!UUID.test(id) || typeof inspeccionId !== 'string' || !UUID.test(inspeccionId)) {
    return problem(res, 400, 'Datos inválidos', 'El id del acta y "inspeccionId" deben ser UUID válidos.', req.originalUrl);
  }
  if (typeof observaciones !== 'string' || observaciones.length > 5000 ||
      !Number.isInteger(cantidadFotos) || cantidadFotos < 0 || cantidadFotos > 20 ||
      (creadaEnDispositivo !== null && (typeof creadaEnDispositivo !== 'string' || Number.isNaN(Date.parse(creadaEnDispositivo))))) {
    return problem(res, 400, 'Datos inválidos',
      '"observaciones" (texto, máx. 5000), "cantidadFotos" (entero 0 a 20) y "creadaEnDispositivo" (fecha ISO, opcional).', req.originalUrl);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insp = await client.query('SELECT * FROM inspecciones WHERE id = $1', [inspeccionId]);
    if (insp.rowCount === 0) {
      await client.query('ROLLBACK');
      return problem(res, 404, 'Inspección no encontrada', `No existe la inspección ${inspeccionId}.`, req.originalUrl);
    }
    // REGLA FINA: el rol "inspector" no alcanza; tiene que ser SU inspección.
    if (insp.rows[0].inspector_id !== req.usuario.id) {
      await client.query('ROLLBACK');
      return problem(res, 403, 'Prohibido', 'La inspección no está asignada a este inspector.', req.originalUrl);
    }

    const ins = await client.query(
      `INSERT INTO actas (id, inspeccion_id, inspector_id, observaciones, cantidad_fotos, creada_en_dispositivo)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING RETURNING *`,
      [id, inspeccionId, req.usuario.id, observaciones, cantidadFotos, creadaEnDispositivo],
    );

    if (ins.rowCount === 0) {            // reintento: el acta ya existía
      const previa = (await client.query('SELECT * FROM actas WHERE id = $1', [id])).rows[0];
      await client.query('ROLLBACK');
      if (previa.inspector_id !== req.usuario.id) {
        return problem(res, 409, 'Conflicto', 'Ya existe un acta con ese id.', req.originalUrl);
      }
      return res.status(200).json(aActa(previa));
    }

    // Outbox: en la MISMA transacción queda registrado lo que falta enviar al sistema SOAP.
    await client.query('INSERT INTO outbox (acta_id) VALUES ($1)', [id]);
    await client.query('COMMIT');
    res.status(201).location(`/actas/${id}`).json(aActa(ins.rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
});

// Inspector: solo las propias. Supervisor y administrativo: todas.
app.get('/actas', autenticar, permitir('inspector', 'supervisor', 'administrativo'), async (req, res) => {
  const propias = req.usuario.rol === 'inspector';
  const { rows } = await pool.query(
    `SELECT * FROM actas ${propias ? 'WHERE inspector_id = $1' : ''} ORDER BY recibida_en DESC LIMIT 100`,
    propias ? [req.usuario.id] : [],
  );
  res.json(rows.map(aActa));
});

app.get('/actas/:id', autenticar, permitir('inspector', 'supervisor', 'administrativo'), async (req, res) => {
  const { id } = req.params;
  if (!UUID.test(id)) return problem(res, 400, 'Id inválido', 'El id debe ser un UUID.', req.originalUrl);
  const { rows } = await pool.query('SELECT * FROM actas WHERE id = $1', [id]);
  // Para un inspector, el acta ajena responde igual que una inexistente (no revela que existe).
  if (rows.length === 0 || (req.usuario.rol === 'inspector' && rows[0].inspector_id !== req.usuario.id)) {
    return problem(res, 404, 'Acta no encontrada', `No existe el acta ${id}.`, req.originalUrl);
  }
  res.json(aActa(rows[0]));
});

// Cualquier error no previsto también sale como Problem Details
app.use((err, req, res, next) => {
  console.error(err);
  problem(res, 500, 'Error interno', 'Ocurrió un error inesperado.', req.originalUrl);
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API de inspecciones escuchando en el puerto ${port}`));
