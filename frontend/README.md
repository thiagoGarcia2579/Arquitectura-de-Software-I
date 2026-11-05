# Frontend · Inspecciones de obra

SPA en React + Vite + TypeScript + Tailwind. Habla con el backend a través del gateway (`/auth`, `/api`, `/mobile`).

## Cómo correrlo

1. Levantar el backend (desde la carpeta superior): `docker compose up -d --build`
2. En esta carpeta:

```bash
npm install && npm run dev
```

Abrir http://localhost:5173. El gateway solo permite CORS desde `:8080`, por eso el proxy de Vite reenvía `/auth`, `/api` y `/mobile` a `http://localhost:8000` y el frontend usa rutas relativas. La URL del gateway se configura en `.env` (ver `.env.example`).

Usuarios de prueba: `inspector1` / `inspector123`, `inspector2` / `inspector123`, `supervisor1` / `supervisor123`, `admin1` / `admin123`.

## Estructura

```
src/api/       cliente HTTP central (problem+json, refresh single-flight), endpoints y tipos
src/auth/      sesión (localStorage), contexto, guarda de rutas por rol
src/offline/   IndexedDB (idb), cola de actas, sync por lotes y hooks
src/pages/     login, inspector, supervisor, shared (actas de solo lectura)
src/components/
```

## Flujo offline del inspector

1. Al guardar, el acta se escribe **siempre primero en IndexedDB** con un UUID del cliente (`pendiente_envio`).
2. Con conexión (evento `online`, al guardar o botón "Sincronizar ahora") se envía todo en `POST /mobile/sync`, en lotes de 50.
3. Por acta: `creada`/`ya_recibida` → `enviada` (solo lectura); `rechazada` → queda visible con el motivo y se puede descartar; 5xx/502/401 → sigue pendiente y se reintenta.
4. Las enviadas se consultan cada 5 s (`GET /api/actas/{id}`) mientras estén en `pendiente_asociacion`; el polling se pausa si la pestaña está oculta o sin conexión.

Notas de diseño: el refresh token rotativo se renueva con una sola llamada compartida y un lock entre pestañas (`navigator.locks`); la cola se guarda por usuario; los tokens van en `localStorage` para sobrevivir al cierre de la pestaña (riesgo XSS asumido para el TP).

## Probar el modo offline

DevTools → Network → **Offline**, cargar un acta (queda "Pendiente de envío"), volver a **No throttling** y observar la sincronización automática. Para ver reintentos del SOAP, dejar `MOCK_FALLO_PCT=30` en el `.env` del backend.

Fuera de alcance: subida real de fotos, app nativa, edición de actas enviadas.
