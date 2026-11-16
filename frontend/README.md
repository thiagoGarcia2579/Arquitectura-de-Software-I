# Frontend · Inspecciones de obra

SPA en React + Vite + TypeScript + Tailwind. El inicio de sesión usa Keycloak con OIDC Authorization Code + PKCE. Las llamadas a la API pasan por el gateway mediante `/api`.

## Requisitos

- Docker Desktop abierto y con el motor en ejecución.
- Node.js y npm solo si se usa Vite.
- Puertos libres: **5173** (frontend), **8000** (gateway), **8080** (Swagger) y **8180** (Keycloak).

## Cómo correrlo en Windows (PowerShell)

Desde la raíz del repositorio, levantá los servicios:

```powershell
docker compose up -d --build
docker compose ps
```

Esperá a que `db` y `keycloak` figuren como `healthy` y que los demás servicios estén corriendo. Abrí http://localhost:5173.

Para desarrollar con Vite en lugar del frontend de Docker, detené este último para liberar el puerto y luego ejecutá:

```powershell
docker compose stop frontend
Set-Location frontend
npm ci
npm run dev
```

Al tocar **Ingresar**, el navegador te redirige a Keycloak en http://localhost:8180; después de autenticarte vuelve a `/login/callback` y te lleva a la pantalla de tu rol. Para volver al frontend de Docker, detené Vite con `Ctrl+C` y ejecutá `docker compose start frontend` desde la raíz.

Vite reenvía `/api` y `/health` a `http://localhost:8000`. La autoridad OIDC predeterminada es `http://localhost:8180/realms/inspecciones` y el cliente es `inspecciones-web`; para cambiarlos, definí `VITE_OIDC_AUTHORITY` o `VITE_OIDC_CLIENT_ID` en `frontend/.env.local`. Para cambiar la dirección del gateway, definí `VITE_GATEWAY_URL`.

Usuarios de prueba:

| Usuario | Contraseña | Rol |
|---|---|---|
| `inspector1` | `inspector123` | Inspector |
| `inspector2` | `inspector123` | Inspector |
| `supervisor1` | `supervisor123` | Supervisor |
| `admin1` | `admin123` | Administrativo |

Para apagar los servicios: `docker compose down` desde la raíz. Esto conserva los datos de Postgres.

## Probar en Android por USB (Windows)

Seguí los [pasos para usar la app en Android por USB](../README.md#usar-la-app-en-un-celular-android-por-usb-windows) del README principal.

## Problemas al iniciar

- **No se puede conectar al daemon de Docker**: abrí Docker Desktop y esperá a que indique que el motor está en ejecución; luego repetí `docker compose up -d --build`.
- **El puerto ya está en uso**: liberá el puerto indicado antes de iniciar.
- **Keycloak no responde**: revisá `docker compose ps` y `docker compose logs keycloak`.
- **No aparece el realm o los usuarios de prueba**: revisá `docker compose logs keycloak`; el realm `inspecciones` se importa al iniciar Keycloak.

## Probar la app al abrirla sin conexión

El service worker está habilitado tanto en desarrollo como en producción. Levantá la app con Docker o Vite como se explicó arriba.

Abrí http://localhost:5173 con conexión, iniciá sesión como inspector y esperá a que cargue la lista de inspecciones. Luego, en DevTools → Network, activá **Offline** y abrí o recargá `/inspector`: los archivos de la interfaz se sirven desde la caché, y las inspecciones y actas previamente guardadas se leen de IndexedDB. Las llamadas al backend no se cachean y requieren conexión. Al desarrollar, los archivos servidos por Vite se guardan al cargarse y se prioriza la versión de red; después de cambiar archivos, recargá con conexión antes de repetir la prueba offline.

El indicador de conexión comprueba el endpoint `/health` del gateway cada 5 segundos; por eso muestra si el servidor es alcanzable, no solo el estado de red reportado por el navegador.

## Estructura

```
src/api/       cliente HTTP central (problem+json, refresh single-flight), endpoints y tipos
src/auth/      sesión OIDC (localStorage), contexto y guarda de rutas por rol
src/offline/   IndexedDB (idb), cola de actas, sync por lotes y hooks
src/pages/     login, inspector, supervisor, shared (actas de solo lectura)
src/components/
```

## Flujo offline del inspector

1. Al guardar, el acta se escribe **siempre primero en IndexedDB** con un UUID del cliente (`pendiente_envio`).
2. Con conexión (evento `online`, al guardar o botón "Sincronizar ahora") se envía todo en `POST /api/v1/sync`, en lotes de 50.
3. Por acta: `creada`/`ya_recibida` → `enviada` (solo lectura); `rechazada` → queda visible con el motivo y se puede descartar; 5xx/502/401 → sigue pendiente y se reintenta.
4. Las enviadas se consultan cada 5 s (`GET /api/v1/actas/{id}`) mientras estén en `pendiente_asociacion`; el polling se pausa si la pestaña está oculta o sin conexión.

En **Mis actas**, el inspector ve las actas locales y las últimas 100 recibidas por el servidor, incluso si se cargaron en otro dispositivo. Se combinan por ID y las del servidor quedan en modo de solo lectura. Al entrar, volver a conectarse o tocar **Actualizar**, se consulta el servidor y se guarda una copia por usuario para verla sin conexión. Las actas pendientes de otro dispositivo no aparecen hasta que ese dispositivo las envíe.

Notas de diseño: el refresh token rotativo se renueva con una sola llamada compartida y un lock entre pestañas (`navigator.locks`); la cola se guarda por usuario; los tokens van en `localStorage` para sobrevivir al cierre de la pestaña (riesgo XSS asumido para el TP).

## Probar el modo offline

DevTools → Network → **Offline**, cargar un acta (queda "Pendiente de envío"), volver a **No throttling** y observar la sincronización automática. Para ver reintentos del SOAP, dejar `MOCK_FALLO_PCT=30` en el `.env` del backend.

Fuera de alcance: subida real de fotos, app nativa, edición de actas enviadas.
