# TP Arquitectura de Software 1 — Dominio 2 · Inspecciones de obra municipales

## Integrantes
- Thiago Garcia
- Carolina
- Valentin Varela
- Aldana Gomez

**Escenario 2B · Municipio extenso** (120 inspectores, zonas sin señal, NFR estrella: funcionamiento sin conexión).

Este repo implementa **el corte**: *login* + el caso de uso mínimo **"un inspector completa un acta y queda asociada al expediente"**. El backend se levanta con Docker Compose; la interfaz web se inicia por separado.

---

## Requisitos

- Docker Desktop (o Podman Desktop) abierto y funcionando.
- Puertos libres en tu máquina: **5173**, **8000**, **8080**, **8180**.
- Node.js y npm (para correr la interfaz web).

## Levantarlo

Windows PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose up -d --build
docker compose ps
```

macOS, Linux o WSL:

```bash
if [ ! -f .env ]; then cp .env.example .env; fi
docker compose up -d --build
docker compose ps
```

Si necesitás reiniciar sin borrar los datos:

```bash
docker compose down
docker compose up -d --build
```

La primera vez tarda unos minutos (baja imágenes e instala dependencias). Tenés que ver `db` como **healthy** y el resto como **running**. Después abrí:

Si ya tenías una versión anterior con `bff-inspector`, reconstruí los servicios con `docker compose up -d --build`. El contenedor viejo puede quedar como huérfano: revisá los contenedores antes de detenerlo o eliminarlo.

| URL | Qué es |
|---|---|
| http://localhost:5173 | Aplicación web (se inicia por separado; ver abajo) |
| http://localhost:8080 | **Swagger UI** con el contrato (acá se prueba todo) |
| http://localhost:8000/health | Gateway funcionando |
| http://localhost:8180 | Keycloak (proveedor de identidad) |

Para apagar: `docker compose down` (conserva los datos) o `docker compose down -v` (borra todo y vuelve a cargar los datos de ejemplo).

## Correr la interfaz web

Primero levantá el backend con los pasos anteriores. Luego, desde la raíz del repo, instalá las dependencias e iniciá el servidor de desarrollo:

```bash
cd frontend;
npm ci;
npm run dev
```

Abrí **http://localhost:5173**. Al iniciar sesión, la app redirige a Keycloak en el puerto `8180` y vuelve a la interfaz. Vite reenvía las llamadas a la API por `/api` hacia `http://localhost:8000`. Para detener la interfaz, presioná `Ctrl+C` en esa terminal; para detener el backend, ejecutá `docker compose down` desde la raíz del repo.

Para probar la PWA en un celular Android conectado por USB, seguí la [guía de ADB](frontend/README.md#probar-en-android-por-usb-windows).

---


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
| `gateway` | Único punto de entrada del backend. Enruta `/api` hacia la API. |
| `api` | Inspecciones, actas y sincronización por lotes (`POST /api/v1/sync`). Valida firma, emisor, audiencia, vencimiento y rol del JWT; aplica también la **regla fina** (el inspector solo carga actas de SUS inspecciones). |
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
3. Ejecutá `PUT /api/actas/{id}` con el id `bbbbbbbb-0000-0000-0000-000000000001` y el body de ejemplo. Devuelve **201** con `estado: pendiente_asociacion`.
4. Esperá unos segundos y ejecutá `GET /api/actas/{id}`: pasa a `asociada` (o queda reintentando si el mock falló).
5. Mirá la sincronización en vivo con `docker compose logs -f sync`.

Para probar la autenticación de la aplicación web, usá http://localhost:5173 e iniciá sesión con uno de los usuarios de prueba.

---

## Qué mirar para comprobar cada decisión

| Quiero ver… | Cómo |
|---|---|
| **Idempotencia** | Repetí el mismo `PUT` del acta: la segunda vez devuelve **200** (no 201) y no crea otra. |
| **Regla fina** (403) | Con `inspector1`, `PUT` de un acta sobre la inspección `aaaaaaaa-0000-0000-0000-000000000003` (es de `inspector2`) → **403**. |
| **Matriz de permisos** | Con `admin1`: `GET /api/inspecciones` → **403**; `PUT /api/actas/...` → **403**. Con `supervisor1`: `GET /api/actas` → **200** (ve todas). |
| **Sin token / vencido** | Cualquier endpoint sin `Authorization` → **401**. |
| **Reasignación** | Con `supervisor1`: `PATCH /api/inspecciones/{id}/asignacion` con el `inspectorId` de otro inspector. Luego el inspector original ya no puede cargar sobre esa inspección. |
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

Si cambiás `DB_*` después de la primera vez: `docker compose down -v` y volver a levantar (Postgres solo lee esas variables al crear el volumen).

---

## Errores comunes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `variable is not set` / `falta DB_NAME en .env` | No existe `.env` | `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`) |
| `Cannot connect to the Docker daemon` | Docker Desktop cerrado | Abrilo y esperá a que diga *Engine running* |
| `port is already allocated` | Alguno de los puertos 8000, 8080 o 8180 está ocupado | Liberá ese puerto antes de iniciar los servicios |
| Swagger muestra `Failed to fetch` | Gateway caído o CORS | `docker compose ps` y `docker compose logs gateway` |
| Keycloak muestra `Invalid parameter: redirect_uri` | Se abrió el frontend en un host o puerto distinto de `localhost:5173` | Abrí la dirección predeterminada o actualizá el cliente en `keycloak/realm-inspecciones.json` |
| Cambié el código y no se ve | Imagen sin reconstruir | `docker compose up -d --build` |
| Cambié `init.sql` y no se aplica | Solo corre con el volumen vacío | `docker compose down -v` |
| El acta tarda en pasar a `asociada` | El mock falla/demora a propósito | Mirá `docker compose logs -f sync`; bajá `MOCK_FALLO_PCT` |

---

## Qué NO está implementado (va en el diseño, no en el corte)

- **Fotos**: el acta solo registra `cantidadFotos` (0 a 20). En el diseño completo van a un *object storage* con subida en partes reanudable, compresión en el celular y borrado local tras confirmar la subida.
- **App Android real** y su base local cifrada: `POST /api/v1/sync` muestra el contrato de sincronización que podría usar.
- **Reasignación durante un corte de señal**: hoy, si la inspección ya no es del inspector al sincronizar, la API responde **403**. El diseño propone derivar esas actas a revisión del supervisor.
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
