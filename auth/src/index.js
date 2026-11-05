// Servicio de autenticación: valida usuario/contraseña y emite JWT.
//  - access token: corto (15 min), lo validan api y bff con el secreto compartido.
//  - refresh token: largo (días, pensado para zonas sin señal), ROTATIVO: cada uso entrega uno nuevo.
//    Si alguien reutiliza uno ya usado, se asume robo y se revocan todos los del usuario.
import express from 'express';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { randomUUID, randomBytes, createHash } from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET falta o tiene menos de 32 caracteres (revisá el .env)');
  process.exit(1);
}
const ACCESS_TTL_MIN = Number(process.env.ACCESS_TTL_MIN ?? 15);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TTL_DAYS ?? 7);
const ISSUER = 'auth-inspecciones';
const AUDIENCE = 'inspecciones';

const pool = new pg.Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const app = express();
app.use(express.json({ limit: '16kb' }));

function problem(res, status, title, detail, instance) {
  res.status(status).type('application/problem+json').json({ type: 'about:blank', title, status, detail, instance });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

async function emitirTokens(usuario) {
  const accessToken = jwt.sign(
    { rol: usuario.rol, nombre: usuario.nombre },
    JWT_SECRET,
    { algorithm: 'HS256', subject: usuario.id, issuer: ISSUER, audience: AUDIENCE, expiresIn: `${ACCESS_TTL_MIN}m` },
  );
  const id = randomUUID();
  const secret = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO refresh_tokens (id, usuario_id, secret_hash, expira_en)
     VALUES ($1, $2, $3, now() + make_interval(days => $4))`,
    [id, usuario.id, sha256(secret), REFRESH_TTL_DAYS],
  );
  return { accessToken, refreshToken: `${id}.${secret}`, tokenType: 'Bearer', expiresIn: ACCESS_TTL_MIN * 60 };
}

app.get('/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok' });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return problem(res, 400, 'Datos inválidos', 'Se requiere "username" y "password" (texto).', req.originalUrl);
  }
  // crypt() de pgcrypto compara contra el hash bcrypt guardado
  const { rows } = await pool.query(
    'SELECT id, nombre, rol FROM usuarios WHERE username = $1 AND password_hash = crypt($2, password_hash)',
    [username, password],
  );
  // Mismo mensaje si el usuario no existe o la contraseña es incorrecta (no revela cuál)
  if (rows.length === 0) return problem(res, 401, 'Credenciales inválidas', 'Usuario o contraseña incorrectos.', req.originalUrl);
  res.json(await emitirTokens(rows[0]));
});

app.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body ?? {};
  const [id, secret] = typeof refreshToken === 'string' ? refreshToken.split('.') : [];
  if (!id || !secret) return problem(res, 400, 'Datos inválidos', 'Se requiere "refreshToken".', req.originalUrl);
  const invalido = () => problem(res, 401, 'Refresh token inválido', 'Iniciá sesión nuevamente.', req.originalUrl);

  if (!UUID.test(id)) return invalido();
  const { rows } = await pool.query(
    `SELECT r.*, u.id AS uid, u.nombre, u.rol FROM refresh_tokens r JOIN usuarios u ON u.id = r.usuario_id
     WHERE r.id = $1`, [id],
  );
  const t = rows[0];
  if (!t || t.secret_hash !== sha256(secret)) return invalido();
  if (t.revocado_en) {
    // Reutilización de un token ya rotado: posible robo. Se revocan todos los del usuario.
    await pool.query('UPDATE refresh_tokens SET revocado_en = now() WHERE usuario_id = $1 AND revocado_en IS NULL', [t.usuario_id]);
    return invalido();
  }
  if (new Date(t.expira_en) < new Date()) return invalido();

  await pool.query('UPDATE refresh_tokens SET revocado_en = now() WHERE id = $1', [id]);
  res.json(await emitirTokens({ id: t.uid, nombre: t.nombre, rol: t.rol }));
});

// Útil si se pierde un celular: revoca el refresh token indicado.
app.post('/logout', async (req, res) => {
  const [id] = typeof req.body?.refreshToken === 'string' ? req.body.refreshToken.split('.') : [];
  if (id && UUID.test(id)) {
    await pool.query('UPDATE refresh_tokens SET revocado_en = now() WHERE id = $1 AND revocado_en IS NULL', [id]);
  }
  res.sendStatus(204);
});

app.use((err, req, res, next) => {
  console.error(err);
  problem(res, 500, 'Error interno', 'Ocurrió un error inesperado.', req.originalUrl);
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`auth escuchando en el puerto ${port}`));
