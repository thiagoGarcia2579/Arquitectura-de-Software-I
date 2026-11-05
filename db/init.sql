-- Corre automáticamente solo la PRIMERA vez que se crea el volumen pgdata.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE usuarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  nombre        TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('inspector','supervisor','administrativo')),
  password_hash TEXT NOT NULL            -- bcrypt generado con pgcrypto: nunca texto plano
);

-- Refresh tokens rotativos: se guarda solo el hash del secreto.
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id),
  secret_hash TEXT NOT NULL,
  expira_en   TIMESTAMPTZ NOT NULL,
  revocado_en TIMESTAMPTZ
);

-- El expediente vive en el sistema municipal (SOAP); acá solo guardamos su identificador.
CREATE TABLE inspecciones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expediente_id TEXT NOT NULL,
  direccion     TEXT NOT NULL,
  inspector_id  UUID REFERENCES usuarios(id),
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El id del acta lo genera el celular (UUID): offline no se puede esperar un SERIAL.
CREATE TABLE actas (
  id                      UUID PRIMARY KEY,
  inspeccion_id           UUID NOT NULL REFERENCES inspecciones(id),
  inspector_id            UUID NOT NULL REFERENCES usuarios(id),
  observaciones           TEXT NOT NULL DEFAULT '',
  cantidad_fotos          INTEGER NOT NULL DEFAULT 0 CHECK (cantidad_fotos BETWEEN 0 AND 20),
  estado                  TEXT NOT NULL DEFAULT 'pendiente_asociacion'
                          CHECK (estado IN ('pendiente_asociacion','asociada','error_asociacion')),
  creada_en_dispositivo   TIMESTAMPTZ,          -- dato DECLARADO por el celular, no es verdad
  recibida_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
  asociada_en             TIMESTAMPTZ,
  detalle_asociacion      TEXT
);

-- Outbox: lo pendiente de enviar al sistema SOAP. Lo procesa el servicio "sync".
CREATE TABLE outbox (
  id              BIGSERIAL PRIMARY KEY,
  acta_id         UUID UNIQUE NOT NULL REFERENCES actas(id),
  intentos        INTEGER NOT NULL DEFAULT 0,
  proximo_intento TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_error    TEXT,
  procesado_en    TIMESTAMPTZ
);
CREATE INDEX outbox_pendientes ON outbox (proximo_intento) WHERE procesado_en IS NULL;

-- Datos de ejemplo (solo para desarrollo). Contraseñas: ver README.
INSERT INTO usuarios (id, username, nombre, rol, password_hash) VALUES
  ('11111111-1111-1111-1111-111111111111','inspector1', 'Ana Inspectora',  'inspector',      crypt('inspector123',  gen_salt('bf'))),
  ('22222222-2222-2222-2222-222222222222','inspector2', 'Beto Inspector',  'inspector',      crypt('inspector123',  gen_salt('bf'))),
  ('33333333-3333-3333-3333-333333333333','supervisor1','Carla Supervisora','supervisor',    crypt('supervisor123', gen_salt('bf'))),
  ('44444444-4444-4444-4444-444444444444','admin1',     'Diego Administrativo','administrativo', crypt('admin123',   gen_salt('bf')));

INSERT INTO inspecciones (id, expediente_id, direccion, inspector_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','EXP-2025-0001','Ruta 7 km 52, lote 14',      '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002','EXP-2025-0002','Camino Rural s/n, parcela 3','11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000003','EXP-2025-0003','Av. Los Álamos 1200',        '22222222-2222-2222-2222-222222222222'),
  -- Mismo expediente que la 0001, asignada a otro inspector: caso "dos inspectores, mismo expediente".
  ('aaaaaaaa-0000-0000-0000-000000000004','EXP-2025-0001','Ruta 7 km 52, lote 14 (fondo)','22222222-2222-2222-2222-222222222222');
