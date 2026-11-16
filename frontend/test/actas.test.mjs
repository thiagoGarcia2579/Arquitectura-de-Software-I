import assert from 'node:assert/strict';
import { test } from 'node:test';
import { combinarActas } from '../src/offline/actas.ts';

const userId = 'inspector1';
const local = (id, estado = 'pendiente_envio') => ({
  id, userId, inspeccionId: 'inspeccion', expediente: 'EXP', direccion: 'Calle',
  observaciones: 'Local', cantidadFotos: 0, creadaEnDispositivo: '2026-01-01T00:00:00Z', local: estado,
});
const remota = (id, inspectorId = userId) => ({
  id, inspectorId, inspeccionId: 'inspeccion', expedienteId: 'EXP', direccion: 'Calle',
  observaciones: 'Servidor', cantidadFotos: 1, creadaEnDispositivo: null,
  recibidaEn: '2026-02-01T00:00:00Z', estado: 'asociada', asociadaEn: null, detalleAsociacion: null,
});

test('combina actas de otro dispositivo con pendientes locales y evita duplicados', () => {
  const pendientes = local('pendiente');
  const duplicada = local('duplicada');
  const resultado = combinarActas([pendientes, duplicada], [remota('duplicada'), remota('otro-dispositivo')], userId);

  assert.deepEqual(resultado.map((a) => a.id), ['duplicada', 'otro-dispositivo', 'pendiente']);
  assert.equal(resultado[0].local, 'enviada');
  assert.equal(resultado[0].observaciones, 'Servidor');
  assert.equal(resultado[0].remoto.estado, 'asociada');
  assert.equal(resultado[2].local, 'pendiente_envio');
  assert.equal(duplicada.local, 'pendiente_envio');
});

test('no mezcla actas remotas de otro usuario y conserva rechazos locales', () => {
  const ajenaLocal = { ...local('ajena-local'), userId: 'inspector2' };
  const resultado = combinarActas([local('rechazada', 'rechazada'), ajenaLocal], [remota('ajena', 'inspector2')], userId);
  assert.deepEqual(resultado.map((a) => a.id), ['rechazada']);
  assert.equal(resultado[0].local, 'rechazada');
});
