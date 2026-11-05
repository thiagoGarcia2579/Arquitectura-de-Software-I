// Backend For Frontend (BFF) de la app Android del inspector.
// Sin base de datos ni lógica de negocio: adapta la API a lo que necesita ESTE cliente
//   - GET  /mobile/inspecciones : lista chica (pocos campos) para la pantalla
//   - POST /mobile/sync         : el celular manda en UN pedido todas las actas acumuladas offline
// El token del usuario se reenvía tal cual: quien decide es la API (el BFF no se "salta" la seguridad).
import http from 'node:http';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';
const PORT = Number(process.env.PORT ?? 3001);
const MAX_ACTAS = 50;

const send = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type });
  res.end(JSON.stringify(body));
};
const problem = (res, status, title, detail) =>
  send(res, status, { type: 'about:blank', title, status, detail }, 'application/problem+json');

async function leerJson(req, limite = 1_000_000) {
  let datos = '';
  for await (const chunk of req) {
    datos += chunk;
    if (datos.length > limite) throw new Error('cuerpo demasiado grande');
  }
  return datos ? JSON.parse(datos) : {};
}

const server = http.createServer(async (req, res) => {
  const auth = req.headers.authorization;
  try {
    if (req.method === 'GET' && req.url === '/mobile/inspecciones') {
      const resp = await fetch(`${API_URL}/inspecciones`, { headers: auth ? { Authorization: auth } : {} });
      const cuerpo = await resp.json();
      if (!resp.ok) return send(res, resp.status, cuerpo, 'application/problem+json');   // 401/403 tal cual
      return send(res, 200, {
        total: cuerpo.length,
        items: cuerpo.map((i) => ({ id: i.id, expediente: i.expedienteId, direccion: i.direccion })),
      });
    }

    if (req.method === 'POST' && req.url === '/mobile/sync') {
      let body;
      try { body = await leerJson(req); } catch { return problem(res, 400, 'Cuerpo inválido', 'Se esperaba JSON de hasta 1 MB.'); }
      const actas = body.actas;
      if (!Array.isArray(actas) || actas.length === 0 || actas.length > MAX_ACTAS) {
        return problem(res, 400, 'Datos inválidos', `Se requiere "actas": lista de 1 a ${MAX_ACTAS} elementos.`);
      }
      // Una por una, en orden. Cada resultado es independiente: una rechazada no frena a las demás.
      const resultados = [];
      for (const a of actas) {
        const { id, ...resto } = a ?? {};
        const r = await fetch(`${API_URL}/actas/${encodeURIComponent(id ?? '')}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: auth } : {}) },
          body: JSON.stringify(resto),
        });
        const cuerpo = r.status === 204 ? {} : await r.json().catch(() => ({}));
        resultados.push({
          id: id ?? null,
          http: r.status,
          estado: r.ok ? (r.status === 201 ? 'creada' : 'ya_recibida') : 'rechazada',
          detalle: r.ok ? undefined : cuerpo.detail,
        });
        if (r.status === 401) break;   // token vencido: no tiene sentido seguir; el celular hace refresh y reintenta
      }
      return send(res, 200, { resultados });
    }

    problem(res, 404, 'No encontrado', 'Ruta inexistente.');
  } catch (err) {
    console.error(err.message);
    problem(res, 502, 'API no disponible', `El BFF no pudo comunicarse con ${API_URL}.`);
  }
});

server.listen(PORT, () => console.log(`BFF inspector escuchando en ${PORT}, API en ${API_URL}`));
