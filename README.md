# TP Arquitectura de Software 1 — Dominio 2 · Inspecciones de obra municipales

**Escenario 2B · Municipio extenso** (120 inspectores, zonas sin señal, NFR estrella: funcionamiento sin conexión).

Este repo implementa **el corte**: *login* + el caso de uso mínimo **"un inspector completa un acta y queda asociada al expediente"**. El backend se levanta con Docker Compose; la interfaz web se inicia por separado.

---

## Requisitos

- Docker Desktop (o Podman Desktop) abierto y funcionando.
- Puertos libres en tu máquina: **8000**, **8080**.
- Node.js y npm (para correr la interfaz web).

## Levantarlo (3 pasos)

```bash
# 1. Crear el archivo de configuración y secretos (no se sube al repo)
cp .env.example .env            # Windows PowerShell:  Copy-Item .env.example .env

# 2. Construir y levantar todo
docker compose up -d --build

# 3. Verificar
docker compose ps

# 4. Si falla, para reiniciar
docker compose down -v
docker compose up -d --build

```

La primera vez tarda unos minutos (baja imágenes e instala dependencias). Tenés que ver `db` como **healthy** y el resto como **running**. Después abrí:

| URL | Qué es |
|---|---|
| http://localhost:8080 | **Swagger UI** con el contrato (acá se prueba todo) |
| http://localhost:8000/health | Gateway funcionando |

Para apagar: `docker compose down` (conserva los datos) o `docker compose down -v` (borra todo y vuelve a cargar los datos de ejemplo).

## Correr la interfaz web

Primero levantá el backend con los pasos anteriores. Luego, desde la raíz del repo, instalá las dependencias e iniciá el servidor de desarrollo:

```bash
cd frontend;
npm ci;
npm run dev
```

Abrí **http://localhost:5173**. Vite reenvía las llamadas al backend en `http://localhost:8000`. Para detener la interfaz, presioná `Ctrl+C` en esa terminal; para detener el backend, ejecutá `docker compose down` desde la raíz del repo.

---

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
| `auth` | Login. Emite *access token* JWT (15 min) y *refresh token* rotativo (7 días, pensado para zonas sin señal). |
| `api` | Inspecciones y actas. Valida el JWT, el rol y la **regla fina** (el inspector solo carga actas de SUS inspecciones). |
| `bff-inspector` | Adapta la API a la app Android: lista liviana y `POST /mobile/sync` para mandar en un pedido lo acumulado offline. |
| `sync` | **Capa anticorrupción.** Único componente que habla SOAP. Lee el *outbox* y asocia cada acta al expediente, con reintentos. |
| `mock-expedientes` | **Simulador** del sistema municipal heredado: solo SOAP/XML, lento y con fallos intermitentes. |
| `db` | PostgreSQL. No publica puertos. Volumen `pgdata`. |
| `swagger-ui` | Documentación generada desde `openapi.yaml`. |

### Decisiones clave (para justificar en la defensa)

- **El `id` del acta lo genera el celular (UUID)** y se carga con `PUT /actas/{id}`: es **idempotente**. Si el celular reintenta tras un corte, no se duplica.
- **La asociación al expediente es asíncrona (patrón outbox).** `PUT /actas` guarda el acta y el pendiente en la *misma transacción*; después `sync` llama al SOAP. Si el sistema municipal está caído o lento, no se pierde nada ni se bloquea al inspector.
- **Reintentos con criterio.** Error de servidor o timeout → backoff exponencial (4 s, 8 s, 16 s… tope 5 min, máx. 8 intentos). `Fault` de cliente (ej.: expediente inexistente) → error definitivo, no se reintenta.
- **Defensa en profundidad.** El gateway filtra y limita; la API valida token, rol y asignación. El gateway no conoce las asignaciones, así que no puede ser la única barrera.
- **Acta cerrada = inmutable** (tiene valor legal). Un reintento nunca la modifica.
- **Refresh token rotativo con detección de reuso.** Si se reutiliza uno ya usado, se revocan todos los del usuario.
- **Contraseñas con bcrypt** (pgcrypto). Secretos en `.env`, fuera del repo.

---

## Usuarios de prueba

| Usuario | Contraseña | Rol | Inspecciones asignadas |
|---|---|---|---|
| `inspector1` | `inspector123` | inspector | 0001 y 0002 |
| `inspector2` | `inspector123` | inspector | 0003 y 0004 |
| `supervisor1` | `supervisor123` | supervisor | — |
| `admin1` | `admin123` | administrativo | — |

IDs de inspecciones: `aaaaaaaa-0000-0000-0000-00000000000X` (X = 1 a 4). Las 0001 y 0004 son del **mismo expediente** (`EXP-2025-0001`) pero de **distinto inspector**, para ver el caso "dos inspectores sobre el mismo expediente".

---

## Probar el caso de uso mínimo

### Con Swagger UI (lo más simple)

1. http://localhost:8080 → `POST /auth/login` → *Try it out* con `inspector1` / `inspector123` → *Execute*.
2. Copiá el `accessToken`, apretá **Authorize** (arriba a la derecha) y pegalo (solo el token, sin "Bearer").
3. `PUT /api/actas/{id}` → usá el id `bbbbbbbb-0000-0000-0000-000000000001` y el body de ejemplo → *Execute*. Devuelve **201** con `estado: pendiente_asociacion`.
4. Esperá unos segundos y hacé `GET /api/actas/{id}`: pasa a `asociada` (o queda reintentando si el mock falló).
5. Mirá cómo trabaja la sincronización en vivo: `docker compose logs -f sync`.

### Con curl (Git Bash, macOS, Linux o WSL)

```bash
# Login como inspector1 y guardar el token
TOKEN=$(curl -s -X POST http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"inspector1","password":"inspector123"}' \
  | sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')

# Cargar un acta (el id lo inventa el cliente)
curl -i -X PUT http://localhost:8000/api/actas/bbbbbbbb-0000-0000-0000-000000000001 \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"inspeccionId":"aaaaaaaa-0000-0000-0000-000000000001","observaciones":"Sin cartel de obra","cantidadFotos":6}'

# Consultar su estado (repetir hasta que diga "asociada")
curl -s http://localhost:8000/api/actas/bbbbbbbb-0000-0000-0000-000000000001 -H "Authorization: Bearer $TOKEN"
```

> En PowerShell `curl` es un alias de otro comando: usá Swagger UI o `curl.exe`.

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
| **Sincronización offline** | `POST /mobile/sync` con varias actas juntas (ejemplo en Swagger). Incluye una ajena: viene `rechazada` sin frenar a las demás. |
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

## Configuración (`.env`)

| Variable | Qué hace |
|---|---|
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Credenciales de Postgres. |
| `JWT_SECRET` | Secreto con el que `auth` firma y `api` valida los tokens (mínimo 32 caracteres). |
| `ACCESS_TTL_MIN`, `REFRESH_TTL_DAYS` | Vida de los tokens. |
| `MOCK_LATENCIA_MS` | Demora artificial del sistema municipal simulado. |
| `MOCK_FALLO_PCT` | % de pedidos SOAP que fallan. Poné `0` para una demo sin errores. |

Si cambiás `DB_*` después de la primera vez: `docker compose down -v` y volver a levantar (Postgres solo lee esas variables al crear el volumen).

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
- **App Android real** y su base local cifrada: el BFF y `POST /mobile/sync` muestran el contrato que usaría.
- **Reasignación durante un corte de señal**: hoy, si la inspección ya no es del inspector al sincronizar, la API responde **403**. El diseño propone derivar esas actas a revisión del supervisor.
- **Borrador, revisión y aprobación de actas, intimaciones y clausuras, web de supervisión.**
- **`ConsultarExpediente`**: el mock lo expone, pero ningún servicio lo consume todavía.
- **Proveedor de identidad completo (Keycloak/OIDC)**: acá `auth` es un servicio propio y chico, con secreto compartido (HS256). En producción convendría un IdP con claves asimétricas (RS256 + JWKS), para que la API valide sin conocer el secreto de firma.

## Estructura

```
docker-compose.yml     .env.example     openapi.yaml
db/init.sql            gateway/nginx.conf
auth/                  api/             bff-inspector/
sync/                  mock-expedientes/
```
