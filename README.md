# TP Arquitectura de Software 1 — Dominio 2B · Inspecciones de obra municipales

## Integrantes
- Thiago Garcia
- Carolina Rodriguez
- Valentin Varela
- Aldana Gomez

[Informe de Arquitectura](https://docs.google.com/document/d/1CvTt-X90DKGGSAZpIrN9Bs9hy3g-LwBgCctXp4BYaGA/edit?usp=sharing)

[Presentacion](https://canva.link/0n7gxuiwo6t6ex5)

**Escenario 2B · Municipio extenso** (120 inspectores, zonas sin señal, NFR estrella: funcionamiento sin conexión).

Este repo implementa  *login* + el caso de uso mínimo **"un inspector completa un acta y queda asociada al expediente"**. Docker Compose levanta el backend y la interfaz web.

---

## Requisitos

- Docker Desktop (o Podman Desktop) abierto y funcionando.
- Puertos libres en tu máquina: **5173**, **8000**, **8080**, **8180**.
- Node.js y npm (solo para desarrollar la interfaz con Vite).

## Levantarlo
Desde la raíz del repositorio:

```bash
docker compose up -d --build
```

Comprobá los servicios con `docker compose ps`.

Si necesitás reiniciar sin borrar los datos:

```bash
docker compose down
docker compose up -d --build
```

El archivo `.env` es opcional: todo tiene valores por defecto de desarrollo.
La primera vez tarda unos minutos (baja imágenes y Keycloak demora ~1 minuto en arrancar).

Si ya tenías una versión anterior con `bff-inspector`, reconstruí los servicios con `docker compose up -d --build`. El contenedor viejo puede quedar como huérfano: revisá los contenedores antes de detenerlo o eliminarlo.

| URL | Qué es |
|---|---|
| http://localhost:5173 | Aplicación web |
| http://localhost:8080 | **Swagger UI** con el contrato (acá se prueba todo) |
| http://localhost:8000/health | Gateway funcionando |
| http://localhost:8180 | Keycloak (proveedor de identidad) |

Para apagar: `docker compose down` (conserva los datos). `docker compose down -v` elimina los datos de la base.

## Usar la app solo en la PC

1. Levantá todos los servicios con los pasos de **Levantarlo** y esperá a que estén listos.
2. Abrí **http://localhost:5173** e iniciá sesión. Para usarla solo en la PC no necesitás ADB ni conectar un celular.

Para desarrollar con Vite en vez del frontend de Docker, detené primero ese servicio para liberar el puerto y luego ejecutá:

```powershell
docker compose stop frontend
cd frontend
npm ci
npm run dev
```

`npm ci` solo hace falta la primera vez o cuando cambian las dependencias. Dejá la terminal abierta mientras uses Vite. Para volver al frontend de Docker, detené Vite con `Ctrl+C` y ejecutá `docker compose start frontend` desde la raíz.

## Usar la app en un celular Android por USB (Windows)

Esto permite probar la PWA en el celular; no instala una app Android nativa.

1. Levantá todos los servicios con los pasos de **Levantarlo** y comprobá que el frontend esté disponible en **http://localhost:5173** en la PC.
2. La primera vez, descargá [Android SDK Platform-Tools](https://developer.android.com/tools/releases/platform-tools) para Windows y extraé el ZIP. En el celular, activá **Opciones para desarrolladores → Depuración USB**.
3. Conectá el celular con un cable que permita transferir datos. En el Explorador de Windows, abrí la carpeta `platform-tools`, escribí `powershell` en la barra de direcciones y presioná Enter. Ejecutá:

   ```powershell
   .\adb.exe devices
   ```

   Desbloqueá el celular y aceptá el aviso de autorización de depuración USB. Volvé a ejecutar el comando: el dispositivo debe aparecer con el estado `device`.
4. En esa misma terminal, configurá los túneles hacia el frontend y Keycloak:

   ```powershell
   .\adb.exe reverse tcp:5173 tcp:5173
   .\adb.exe reverse tcp:8180 tcp:8180
   .\adb.exe reverse --list
   ```

5. Con el cable conectado y los servicios corriendo, abrí **http://localhost:5173** en Chrome del celular e iniciá sesión. Desde el menú de Chrome podés agregar la PWA a la pantalla de inicio.

Después de desconectar el celular, comprobá los túneles con `.\adb.exe reverse --list` y volvé a ejecutar los dos comandos `reverse` si faltan. Para probar sin conexión, primero iniciá sesión y cargá las inspecciones con conexión; las actas pendientes se enviarán cuando vuelva la conexión.

Si usás Vite en lugar del frontend de Docker, seguí los pasos de desarrollo de la sección anterior y ejecutá `npm run dev -- --host 127.0.0.1` en lugar de `npm run dev`. Para detener los servicios sin borrar los datos, ejecutá `docker compose down` desde la raíz del repositorio.

---
Para ver los reintentos hacia el sistema municipal, creá un `.env` con `MOCK_FALLO_PCT=30`.

### Cambiar de usuario (SSO)
Keycloak recuerda la sesión: al salir, la app cierra también la sesión de Keycloak. En Swagger,
el botón Logout solo borra el token; para cambiar de usuario abrí una ventana de incógnito por rol.

## Arquitectura

```
 Navegador: SPA (:5173) ── OIDC Authorization Code + PKCE ──► Keycloak (:8180)
       │                                                        │
       └── /api ────────────► gateway (:8000) ◄── Swagger UI (:8080)
                                  │
                            ┌─────┴─────┐
                            │    API    │
                            └─────┬─────┘
                                  ▼
                       Postgres ◄── sync ──► mock SOAP
```

| Servicio | Rol |
|---|---|
| `keycloak` | Proveedor OIDC. Importa el realm `inspecciones`, usuarios y clientes de prueba; el frontend y Swagger UI usan clientes públicos con PKCE. |
| `gateway` | Único punto de entrada del backend. Enruta `/api/v1` hacia la API. |
| `api` | Inspecciones, actas y sincronización por lotes (`POST /api/v1/sync`). Valida firma, emisor, audiencia, vencimiento y rol del JWT; aplica también la **regla fina** (el inspector solo carga actas de SUS inspecciones). |
| `frontend` | Sirve la PWA y reenvía las solicitudes al gateway. |
| `sync` | **Capa anticorrupción.** Único componente que habla SOAP. Lee el *outbox* y asocia cada acta al expediente, con reintentos. |
| `mock-expedientes` | **Simulador** del sistema municipal heredado: solo SOAP/XML, lento y con fallos intermitentes. |
| `db` | PostgreSQL. No publica puertos. Volumen `pgdata`. |
| `swagger-ui` | Documentación generada desde `openapi.yaml`. |


## Usuarios de prueba

| Usuario | Contraseña | Rol | Inspecciones asignadas |
|---|---|---|---|
| `inspector1` | `inspector123` | inspector | 0001 y 0002 |
| `inspector2` | `inspector123` | inspector | 0003 y 0004 |
| `supervisor1` | `supervisor123` | supervisor | — |
| `admin1` | `admin123` | administrativo | — |

IDs de inspecciones: `aaaaaaaa-0000-0000-0000-00000000000X` (X = 1 a 4). Las 0001 y 0004 son del **mismo expediente** (`EXP-2025-0001`) pero de **distinto inspector**, para ver el caso "dos inspectores sobre el mismo expediente".

---


## Prueba carga de acta sin conexion

Para simular una carga sin conexion, ejecutar el siguiente comando

```bash
docker compose stop gateway
```

Crear con un inspector las actas

Verificar el estado del acta

Volver a levantar el gateway con el siguiente comando

```bash
docker compose start gateway
```

Verificar si las actas se insertaron correctamente

---

## Probar el caso de uso mínimo

### Con Swagger UI (lo más simple)
1. Abrí http://localhost:8080 y tocá **Authorize**.
2. Dejá vacío `client_secret`, iniciá sesión con un usuario de prueba y aceptá la autorización. Swagger usa Authorization Code + PKCE.
3. Ejecutá `PUT /api/v1/actas/{id}` con el id `bbbbbbbb-0000-0000-0000-000000000001` y el body de ejemplo. Devuelve **201** con `estado: pendiente_asociacion`.
4. Esperá unos segundos y ejecutá `GET /api/v1/actas/{id}`: pasa a `asociada` (o queda reintentando si el mock falló).
5. Mirá la sincronización en vivo con `docker compose logs -f sync`.

Para probar la autenticación de la aplicación web, usá http://localhost:5173 e iniciá sesión con uno de los usuarios de prueba.

---

## Qué mirar para comprobar cada decisión

| Quiero ver… | Cómo |
|---|---|
| **Idempotencia** | Repetí el mismo `PUT` del acta: la segunda vez devuelve **200** (no 201) y no crea otra. |
| **Regla fina** (403) | Con `inspector1`, `PUT` de un acta sobre la inspección `aaaaaaaa-0000-0000-0000-000000000003` (es de `inspector2`) → **403**. |
| **Matriz de permisos** | Con `admin1`: `GET /api/v1/inspecciones` → **200**; `PUT /api/v1/actas/...` → **403**. Con `supervisor1`: `GET /api/v1/actas` → **200** (ve todas). |
| **Sin token / vencido** | Cualquier endpoint sin `Authorization` → **401**. |
| **Reasignación** | Con `supervisor1`: `PATCH /api/v1/inspecciones/{id}/asignacion` con el `inspectorId` de otro inspector. Luego el inspector original ya no puede cargar sobre esa inspección. |
| **Reintentos del SOAP** | `docker compose logs -f sync`: líneas `↻` (reintento) y `✔` (asociada). El mock falla el 30 % de las veces a propósito. |
| **Error definitivo** | Cambiá en la base el `expediente_id` de una inspección por uno inexistente (ver abajo) y cargá un acta: el acta termina en `error_asociacion` sin reintentos infinitos. |
| **Sistema externo caído** | `docker compose stop mock-expedientes`, cargá un acta (sigue dando **201**), después `docker compose start mock-expedientes`: se asocia sola. |
| **Sincronización offline** | `POST /api/v1/sync` con varias actas juntas (ejemplo en Swagger). Incluye una ajena: viene `rechazada` sin frenar a las demás. |
| **Renovación de sesión** | El frontend renueva los tokens de Keycloak cuando la API responde **401**; el refresh token se coordina entre pestañas. |

Las pruebas de integración de [sincronización](api/test/sync.test.js) requieren Node.js, una **base de prueba aislada** con los datos de `db/init.sql` y los tokens de `inspector1` y `supervisor1`. Configurá `TEST_API_URL` (URL del gateway), `TEST_INSPECTOR_TOKEN` y `TEST_SUPERVISOR_TOKEN`, y ejecutá `node --test api/test/sync.test.js`. Las pruebas crean actas: no las ejecutes contra datos que quieras conservar.

Ver la base de datos (no publica puertos, se entra por el contenedor):

```bash
docker compose exec db psql -U inspecciones -d inspecciones -c "SELECT id, estado, detalle_asociacion FROM actas;"
docker compose exec db psql -U inspecciones -d inspecciones -c "SELECT acta_id, intentos, ultimo_error, procesado_en FROM outbox;"
# Provocar el error definitivo:
docker compose exec db psql -U inspecciones -d inspecciones -c "UPDATE inspecciones SET expediente_id='EXP-9999' WHERE id='aaaaaaaa-0000-0000-0000-000000000002';"
```

(Si cambiaste `DB_USER` o `DB_NAME` en `.env`, usá esos valores.)

---

## Configuración (`.env`)

| Variable | Qué hace |
|---|---|
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Credenciales de Postgres. |
| `KC_ADMIN_PASSWORD` | Contraseña del administrador de Keycloak para desarrollo (por defecto, `admin`). |
| `MOCK_LATENCIA_MS` | Demora artificial del sistema municipal simulado. |
| `MOCK_FALLO_PCT` | % de pedidos SOAP que fallan. Poné `0` para una demo sin errores. |
| `SYNC_MAX_INTENTOS` | Máximo de intentos para asociar un acta al expediente. |

Si cambiás `DB_*` después de la primera vez: `docker compose down -v` y volver a levantar (Postgres solo lee esas variables al crear el volumen).

---
## Errores comunes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `variable is not set` / `falta DB_NAME en .env` | No existe `.env` | `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`) |
| `Cannot connect to the Docker daemon` | Docker Desktop cerrado | Abrilo y esperá a que diga *Engine running* |
| `port is already allocated` | Alguno de los puertos 5173, 8000, 8080 o 8180 está ocupado | Liberá ese puerto antes de iniciar los servicios |
| Swagger muestra `Failed to fetch` | Gateway caído o CORS | `docker compose ps` y `docker compose logs gateway` |
| Keycloak muestra `Invalid parameter: redirect_uri` | Se abrió el frontend en un host o puerto distinto de `localhost:5173` | Abrí la dirección predeterminada o actualizá el cliente en `keycloak/realm-inspecciones.json` |
| Cambié el código y no se ve | Imagen sin reconstruir | `docker compose up -d --build` |
| Cambié `init.sql` y no se aplica | Solo corre con el volumen vacío | `docker compose down -v` |
| El acta tarda en pasar a `asociada` | El mock falla/demora a propósito | Mirá `docker compose logs -f sync`; bajá `MOCK_FALLO_PCT` |

---

## Qué NO está implementado (va en el diseño, no en el corte)

- **Fotos**: el acta solo registra `cantidadFotos` (0 a 20). En el diseño completo van a un *object storage* con subida en partes reanudable, compresión en el celular y borrado local tras confirmar la subida.
- **App Android real** y su base local cifrada: `POST /api/v1/sync` muestra el contrato de sincronización que podría usar.
- **Reasignación durante un corte de señal**: hoy, si la inspección ya no es del inspector al sincronizar, el resultado de esa acta es `rechazada` con **403**. El diseño propone derivar esas actas a revisión del supervisor.
- **Borrador, revisión y aprobación de actas, intimaciones y clausuras, web de supervisión.**
- **`ConsultarExpediente`**: el mock lo expone, pero ningún servicio lo consume todavía.
- **Despliegue productivo de identidad**: la configuración Keycloak incluida es para desarrollo local; en producción se deben configurar HTTPS, dominios y URIs de redirección del entorno.

## Estructura

```
docker-compose.yml     .env.example     openapi.yaml
db/init.sql            gateway/nginx.conf
keycloak/              api/             frontend/
sync/                  mock-expedientes/
```
