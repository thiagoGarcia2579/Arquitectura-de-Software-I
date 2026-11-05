// SIMULADOR (mock) del sistema municipal de expedientes: solo habla SOAP/XML.
// No tiene lógica de negocio real; imita, desde afuera, a un sistema heredado:
//   - lento       (MOCK_LATENCIA_MS)
//   - intermitente (MOCK_FALLO_PCT = % de pedidos que fallan con un Fault "Server")
//   - estricto    (expediente inexistente => Fault "Client", no tiene sentido reintentar)
//   - idempotente a medias: reasociar la misma acta al mismo expediente responde OK (yaAsociada=true)
import http from 'node:http';
import { readFileSync } from 'node:fs';

const PORT = Number(process.env.PORT ?? 4100);
const LATENCIA = Number(process.env.MOCK_LATENCIA_MS ?? 800);
const FALLO_PCT = Number(process.env.MOCK_FALLO_PCT ?? 0);
const WSDL = readFileSync(new URL('./expedientes.wsdl', import.meta.url), 'utf8');

const EXPEDIENTES = new Map([
  ['EXP-2025-0001', { titular: 'Constructora Pampa S.A.', estado: 'EN_OBRA' }],
  ['EXP-2025-0002', { titular: 'García, Marta', estado: 'EN_OBRA' }],
  ['EXP-2025-0003', { titular: 'Consorcio Los Álamos', estado: 'EN_REVISION' }],
]);
const asociaciones = new Map();   // actaId -> expedienteId

const NS = 'http://municipio.example/expedientes';
const sobre = (cuerpo) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>${cuerpo}</soapenv:Body></soapenv:Envelope>`;
const fault = (code, msg) =>
  sobre(`<soapenv:Fault><faultcode>soapenv:${code}</faultcode><faultstring>${msg}</faultstring></soapenv:Fault>`);
const campo = (xml, nombre) => xml.match(new RegExp(`<(?:\\w+:)?${nombre}>([^<]*)</(?:\\w+:)?${nombre}>`))?.[1]?.trim();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function responder(res, status, xml) {
  res.writeHead(status, { 'Content-Type': 'text/xml; charset=utf-8' });
  res.end(xml);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET') {
    if (req.url.includes('wsdl')) { res.writeHead(200, { 'Content-Type': 'text/xml' }); return res.end(WSDL); }
    if (req.url === '/health') { res.writeHead(200); return res.end('ok'); }
    res.writeHead(404); return res.end();
  }
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }

  let cuerpo = '';
  for await (const chunk of req) { cuerpo += chunk; if (cuerpo.length > 100_000) { res.writeHead(413); return res.end(); } }

  await dormir(LATENCIA);
  if (Math.random() * 100 < FALLO_PCT) {
    console.log('Fallo simulado (Server)');
    return responder(res, 500, fault('Server', 'Servicio temporalmente no disponible'));
  }

  if (/<(\w+:)?AsociarActa[\s>]/.test(cuerpo)) {
    const expedienteId = campo(cuerpo, 'expedienteId');
    const actaId = campo(cuerpo, 'actaId');
    if (!expedienteId || !actaId) return responder(res, 500, fault('Client', 'Faltan expedienteId o actaId'));
    if (!EXPEDIENTES.has(expedienteId)) return responder(res, 500, fault('Client', `Expediente inexistente: ${expedienteId}`));
    const previo = asociaciones.get(actaId);
    if (previo && previo !== expedienteId) return responder(res, 500, fault('Client', `El acta ${actaId} ya está asociada a otro expediente`));
    asociaciones.set(actaId, expedienteId);
    console.log(`Acta ${actaId} asociada a ${expedienteId}${previo ? ' (repetida)' : ''}`);
    return responder(res, 200, sobre(`<AsociarActaResponse xmlns="${NS}"><resultado>OK</resultado><yaAsociada>${Boolean(previo)}</yaAsociada></AsociarActaResponse>`));
  }

  if (/<(\w+:)?ConsultarExpediente[\s>]/.test(cuerpo)) {
    const expedienteId = campo(cuerpo, 'expedienteId');
    const e = EXPEDIENTES.get(expedienteId);
    if (!e) return responder(res, 500, fault('Client', `Expediente inexistente: ${expedienteId}`));
    return responder(res, 200, sobre(`<ConsultarExpedienteResponse xmlns="${NS}"><expedienteId>${expedienteId}</expedienteId><titular>${e.titular}</titular><estado>${e.estado}</estado></ConsultarExpedienteResponse>`));
  }

  responder(res, 500, fault('Client', 'Operación desconocida'));
});

server.listen(PORT, () => console.log(`Mock de expedientes (SOAP) en ${PORT} · latencia ${LATENCIA} ms · fallos ${FALLO_PCT}%`));
