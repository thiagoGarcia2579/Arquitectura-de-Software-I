// Prueba de carga de fin de jornada (RNF-07): 600 actas en 2 minutos = 5 pedidos por segundo.
// Correr:  mkdir -p evidencia && k6 run scripts/carga.js | tee evidencia/carga.txt
import http from 'k6/http';
import { check } from 'k6';

const BASE = __ENV.BASE || 'http://localhost:8000';
const KC = __ENV.KC || 'http://localhost:8180/realms/inspecciones/protocol/openid-connect/token';

// Inspecciones válidas asignadas a inspector1 en el init.sql para distribuir la carga
const INSPECCIONES_INSPECTOR1 = [
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000002'
];

export const options = {
  scenarios: {
    fin_de_jornada: {
      executor: 'constant-arrival-rate',
      rate: 5, timeUnit: '1s', duration: '2m',
      preAllocatedVUs: 50, maxVUs: 200,
    },
  },
  thresholds: {
    'http_req_duration{name:put_acta}': ['p(95)<1000'],   // p95 < 1 s
    'http_req_failed{name:put_acta}': ['rate<0.01'],      // < 1 % de errores
    checks: ['rate>0.99'],
  },
};

export function setup() {
  const r = http.post(KC, { grant_type: 'password', client_id: 'inspecciones-cli', username: 'inspector1', password: 'inspector123' });
  const token = r.json('access_token');
  if (!token) throw new Error('No se pudo obtener el token (Keycloak en ' + KC + ')');
  return { token };
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function (data) {
  const inspeccionId = INSPECCIONES_INSPECTOR1[Math.floor(Math.random() * INSPECCIONES_INSPECTOR1.length)];

  // Usamos la ruta completa a través del Gateway mapeando a /actas/:id
  const res = http.put(
    `${BASE}/api/v1/actas/${uuid()}`,
    JSON.stringify({ 
      inspeccionId: inspeccionId, 
      observaciones: 'carga de fin de jornada', 
      cantidadFotos: 6, 
      creadaEnDispositivo: new Date().toISOString() 
    }),
    { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.token}` }, tags: { name: 'put_acta' } },
  ); 
  check(res, { 'responde 201': (r) => r.status === 201 });
}