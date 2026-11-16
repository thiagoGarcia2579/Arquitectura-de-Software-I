import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';

const base = process.env.TEST_API_URL;
const inspector = process.env.TEST_INSPECTOR_TOKEN;
const supervisor = process.env.TEST_SUPERVISOR_TOKEN;
if (!base || !inspector || !supervisor) {
  throw new Error('Las pruebas requieren TEST_API_URL, TEST_INSPECTOR_TOKEN y TEST_SUPERVISOR_TOKEN; usá una base de prueba aislada.');
}

const propia = 'aaaaaaaa-0000-0000-0000-000000000001';
const ajena = 'aaaaaaaa-0000-0000-0000-000000000003';
const crear = (inspeccionId = propia) => ({ id: randomUUID(), inspeccionId, observaciones: 'Prueba', cantidadFotos: 0 });

async function pedir(path, { token = inspector, method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    method, headers, ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: response.status, location: response.headers.get('location'), body: await response.json() };
}

test('la versión pública de la API se aplica a las rutas y al encabezado Location', async () => {
  const acta = crear();
  const creada = await pedir(`/api/v1/actas/${acta.id}`, { method: 'PUT', body: acta });
  assert.equal(creada.status, 201);
  assert.equal(creada.location, `/api/v1/actas/${acta.id}`);
  assert.equal((await pedir('/api/inspecciones')).status, 404);
});

test('el lote respeta autenticación, roles y límites', async () => {
  const actas = [crear()];
  assert.equal((await pedir('/api/v1/sync', { method: 'POST', token: '', body: { actas } })).status, 401);
  assert.equal((await pedir('/api/v1/sync', { method: 'POST', token: supervisor, body: { actas } })).status, 403);
  assert.equal((await pedir('/api/v1/sync', { method: 'POST', body: { actas: [] } })).status, 400);
  assert.equal((await pedir('/api/v1/sync', { method: 'POST', body: { actas: Array.from({ length: 51 }, () => crear()) } })).status, 400);
});

test('el lote procesa actas independientes y los reintentos son idempotentes', async () => {
  const primera = crear();
  const otra = crear(ajena);
  const ultima = crear();
  const body = { actas: [primera, otra, { id: 'incorrecto' }, ultima] };
  const resultado = await pedir('/api/v1/sync', { method: 'POST', body });
  assert.equal(resultado.status, 200);
  assert.deepEqual(resultado.body.resultados.map(({ http, estado }) => [http, estado]), [
    [201, 'creada'], [403, 'rechazada'], [400, 'rechazada'], [201, 'creada'],
  ]);
  const repetido = await pedir('/api/v1/sync', { method: 'POST', body: { actas: [primera] } });
  assert.equal(repetido.body.resultados[0].estado, 'ya_recibida');
  const individual = await pedir(`/api/v1/actas/${primera.id}`, { method: 'PUT', body: primera });
  assert.equal(individual.status, 200);
  assert.equal(individual.body.id, primera.id);
  assert.equal(individual.body.expedienteId, 'EXP-2025-0001');
  assert.equal(individual.body.direccion, 'Ruta 7 km 52, lote 14');
});

test('acepta 50 actas válidas con observaciones largas', async () => {
  const actas = Array.from({ length: 50 }, () => ({ ...crear(), observaciones: '€'.repeat(5000) }));
  const resultado = await pedir('/api/v1/sync', { method: 'POST', body: { actas } });
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.resultados.length, 50);
  assert.ok(resultado.body.resultados.every((r) => r.http === 201 && r.estado === 'creada'));
});

test('la lista normal solo devuelve las inspecciones asignadas al inspector', async () => {
  const resultado = await pedir('/api/v1/inspecciones');
  assert.equal(resultado.status, 200);
  assert.ok(resultado.body.some((i) => i.id === propia));
  assert.ok(resultado.body.every((i) => i.inspectorId === '11111111-1111-1111-1111-111111111111'));
});

test('la lista de actas incluye el expediente y la dirección para otros dispositivos', async () => {
  const resultado = await pedir('/api/v1/actas');
  assert.equal(resultado.status, 200);
  assert.ok(resultado.body.some((a) => a.expedienteId === 'EXP-2025-0001' && a.direccion === 'Ruta 7 km 52, lote 14'));
});
