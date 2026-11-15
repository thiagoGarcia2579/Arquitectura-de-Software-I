# TP Arquitectura de Software 1 — Dominio 2 · Inspecciones de obra municipales

## Integrantes
- Thiago Garcia
- Carolina Rodriguez
- Valentin Varela
- Aldana Gomez

**Escenario 2B · Municipio extenso** (120 inspectores, zonas sin señal, NFR estrella: funcionamiento sin conexión).

Este repo implementa **el corte**: *login* + el caso de uso mínimo **"un inspector completa un acta y queda asociada al expediente"**. El backend se levanta con Docker Compose; la interfaz web se inicia por separado.

---

## Requisitos

- Docker Desktop (o Podman Desktop) abierto y funcionando.
- Puertos libres en tu máquina: **8000**, **8080**.
- Node.js y npm (para correr la interfaz web).

## Levantarlo

```bash
git clone https://github.com/thiagoGarcia2579/Arquitectura-de-Software-I.git
cd Arquitectura-de-Software-I
docker compose up -d --build --wait
```

No hace falta crear ningún archivo `.env`: todo tiene valores por defecto de desarrollo.
La primera vez tarda unos minutos (baja imágenes y Keycloak demora ~1 minuto en arrancar).

| URL | Qué es |
|---|---|
| http://localhost:5173 | **Aplicación web** (login con Keycloak, funciona sin conexión) |
| http://localhost:8080 | **Swagger UI** con el contrato v1 (botón Authorize) |
| http://localhost:8180/admin | Consola de Keycloak (`admin` / `admin`), realm `inspecciones` |
| http://localhost:8000/health | Gateway |

Para apagar: `docker compose down` (conserva los datos) o `docker compose down -v` (borra todo).
Para ver los reintentos hacia el sistema municipal, creá un `.env` con `MOCK_FALLO_PCT=30`.

### Cambiar de usuario (SSO)
Keycloak recuerda la sesión: al salir, la app cierra también la sesión de Keycloak. En Swagger,
el botón Logout solo borra el token; para cambiar de usuario abrí una ventana de incógnito por rol.

## Arquitectura

```
 Swagger UI (:8080)      app Android / curl
        │ (tu navegador)        │
        └──────────┬────────────┘
                   ▼  http://localhost:8000
            ┌─────────────┐
            │   gateway   │  nginx: enruta, limita el login, CORS
            └──┬───┬───┬──┘
      /auth/*  │   │   │ /mobile/*
               ▼   │   ▼
         ┌──────┐  │  ┌───────────────┐
         │ auth │  │  │ bff-inspector │
         └──┬───┘  │  └───────┬───────┘
            │      │ /api/*   │
            │      ▼          │
            │   ┌─────┐◄──────┘
            │   │ api │  inspecciones y actas (roles + regla fina)
            │   └──┬──┘
            ▼      ▼
         ┌────────────┐  outbox   ┌──────┐  SOAP   ┌──────────────────┐
         │     db     │◄─────────►│ sync │────────►│ mock-expedientes │
         │ (Postgres) │           └──────┘         │ (sistema viejo)  │
         └────────────┘                            └──────────────────┘
```

| Servicio | Rol |
|---|---|
| `gateway` | Único punto de entrada. Enruta por prefijo (`/auth`, `/api`, `/mobile`), limita intentos de login (10/min) y permite CORS solo desde Swagger UI. |
| `api` | Inspecciones y actas. Valida el JWT, el rol y la **regla fina** (el inspector solo carga actas de SUS inspecciones). |
| `bff-inspector` | Adapta la API a la app Android: lista liviana y `POST /mobile/v1/sync` para mandar en un pedido lo acumulado offline. |
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
1. Abrí http://localhost:8080 -> Hacé clic en Authorize. Dejá vacío client_secret. Iniciá sesión con un usuario de prueba con `inspector1` / `inspector123` 
3. `PUT /api/v1/actas/{id}` → usá el id `bbbbbbbb-0000-0000-0000-000000000001` y el body de ejemplo → *Execute*. Devuelve **201** con `estado: pendiente_asociacion`.
4. Esperá unos segundos y hacé `GET /api/v1/actas/{id}`: pasa a `asociada` (o queda reintentando si el mock falló).
5. Mirá cómo trabaja la sincronización en vivo: `docker compose logs -f sync`.

### Con curl (Git Bash, macOS, Linux o WSL)

```bash
# Login como inspector1 y guardar el token
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"inspector1","password":"inspector123"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

# Cargar un acta (el id lo inventa el cliente)
curl -i -X PUT http://localhost:8000/api/v1/actas/bbbbbbbb-0000-0000-0000-000000000001 \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"inspeccionId":"aaaaaaaa-0000-0000-0000-000000000001","observaciones":"Sin cartel de obra","cantidadFotos":6}'

# Consultar su estado (repetir hasta que diga "asociada")
curl -s http://localhost:8000/api/v1/actas/bbbbbbbb-0000-0000-0000-000000000001 -H "Authorization: Bearer $TOKEN"
```

> En PowerShell `curl` es un alias de otro comando: usá Swagger UI o `curl.exe`.

---

## Qué mirar para comprobar cada decisión

| Quiero ver… | Cómo |
|---|---|
| **Idempotencia** | Repetí el mismo `PUT` del acta: la segunda vez devuelve **200** (no 201) y no crea otra. |
| **Regla fina** (403) | Con `inspector1`, `PUT` de un acta sobre la inspección `aaaaaaaa-0000-0000-0000-000000000003` (es de `inspector2`) → **403**. |
| **Matriz de permisos** | Con `admin1`: `GET /api/v1/inspecciones` → **403**; `PUT /api/v1/actas/...` → **403**. Con `supervisor1`: `GET /api/v1/actas` → **200** (ve todas). |
| **Sin token / vencido** | Cualquier endpoint sin `Authorization` → **401**. |
| **Reasignación** | Con `supervisor1`: `PATCH /api/v1/inspecciones/{id}/asignacion` con el `inspectorId` de otro inspector. Luego el inspector original ya no puede cargar sobre esa inspección. |
| **Reintentos del SOAP** | `docker compose logs -f sync`: líneas `↻` (reintento) y `✔` (asociada). El mock falla el 30 % de las veces a propósito. |
| **Error definitivo** | Cambiá en la base el `expediente_id` de una inspección por uno inexistente (ver abajo) y cargá un acta: el acta termina en `error_asociacion` sin reintentos infinitos. |
| **Sistema externo caído** | `docker compose stop mock-expedientes`, cargá un acta (sigue dando **201**), después `docker compose start mock-expedientes`: se asocia sola. |
| **Sincronización offline** | `POST /mobile/v1/sync` con varias actas juntas (ejemplo en Swagger). Incluye una ajena: viene `rechazada` sin frenar a las demás. |
| **Refresh rotativo** | `POST /auth/refresh` dos veces con el mismo `refreshToken`: la segunda da **401** y revoca todos los del usuario. |

Ver la base de datos (no publica puertos, se entra por el contenedor):

```bash
docker compose exec db psql -U inspecciones -d inspecciones -c "SELECT id, estado, detalle_asociacion FROM actas;"
docker compose exec db psql -U inspecciones -d inspecciones -c "SELECT acta_id, intentos, ultimo_error, procesado_en FROM outbox;"
# Provocar el error definitivo:
docker compose exec db psql -U inspecciones -d inspecciones -c "UPDATE inspecciones SET expediente_id='EXP-9999' WHERE id='aaaaaaaa-0000-0000-0000-000000000002';"
```

(Si cambiaste `DB_USER` o `DB_NAME` en `.env`, usá esos valores.)

---


## Errores comunes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `variable is not set` / `falta JWT_SECRET en .env` | No existe `.env` | `cp .env.example .env` |
| `Cannot connect to the Docker daemon` | Docker Desktop cerrado | Abrilo y esperá a que diga *Engine running* |
| `port is already allocated` | 8000 u 8080 ocupados | Cambiá el puerto **izquierdo** en `docker-compose.yml` (y el `servers` de `openapi.yaml` + el origen CORS en `gateway/nginx.conf` si tocás el 8000 o el 8080) |
| Swagger muestra `Failed to fetch` | Gateway caído o CORS | `docker compose ps` y `docker compose logs gateway` |
| Login da **401** con usuario correcto | El volumen se creó con otro `init.sql` | `docker compose down -v` y volver a levantar |
| Cambié el código y no se ve | Imagen sin reconstruir | `docker compose up -d --build` |
| Cambié `init.sql` y no se aplica | Solo corre con el volumen vacío | `docker compose down -v` |
| Login da **429** | Más de 10 intentos por minuto | Esperá un minuto (es el límite a propósito) |
| El acta tarda en pasar a `asociada` | El mock falla/demora a propósito | Mirá `docker compose logs -f sync`; bajá `MOCK_FALLO_PCT` |

---

## Qué NO está implementado (va en el diseño, no en el corte)

- **Fotos**: el acta solo registra `cantidadFotos` (0 a 20). En el diseño completo van a un *object storage* con subida en partes reanudable, compresión en el celular y borrado local tras confirmar la subida.
- **App Android real** y su base local cifrada: el BFF y `POST /mobile/v1/sync` muestran el contrato que usaría.
- **Reasignación durante un corte de señal**: hoy, si la inspección ya no es del inspector al sincronizar, la API responde **403**. El diseño propone derivar esas actas a revisión del supervisor.
- **Borrador, revisión y aprobación de actas, intimaciones y clausuras, web de supervisión.**
- **`ConsultarExpediente`**: el mock lo expone, pero ningún servicio lo consume todavía.

## Estructura

```
docker-compose.yml     .env.example     openapi.yaml
db/init.sql            gateway/nginx.conf
auth/                  api/             bff-inspector/
sync/                  mock-expedientes/
```
