#!/usr/bin/env bash
# Verificación automática de NFRs (RNF-01 a RNF-06, lo que se puede probar sin la app móvil).
# Requisitos: bash, curl, jq, docker compose y el sistema levantado (docker compose up -d --build --wait).
# Uso:        bash scripts/verificar-nfr.sh
# Variables:  BASE, KC, SYNC_PATH (por defecto /api/v1/sync; con el BFF viejo: SYNC_PATH=/mobile/v1/sync)
# Salida:     evidencia/verificar-nfr.log  (adjuntarlo al informe)
set -u

BASE="${BASE:-http://localhost:8000}"
KC="${KC:-http://localhost:8180/realms/inspecciones/protocol/openid-connect/token}"
SYNC_PATH="${SYNC_PATH:-/api/v1/sync}"
DB_USER="${DB_USER:-inspecciones}"
DB_NAME="${DB_NAME:-inspecciones}"

INSP1=aaaaaaaa-0000-0000-0000-000000000001   # de inspector1 (EXP-2025-0001)
INSP2=aaaaaaaa-0000-0000-0000-000000000002   # de inspector1 (EXP-2025-0002)
INSP3=aaaaaaaa-0000-0000-0000-000000000003   # de inspector2
INSPECTOR2_ID=22222222-2222-2222-2222-222222222222

cd "$(dirname "$0")/.." || exit 1
mkdir -p evidencia
exec > >(tee evidencia/verificar-nfr.log) 2>&1

for c in curl jq docker; do command -v "$c" >/dev/null || { echo "Falta el comando: $c"; exit 1; }; done

PASS=0; FAIL=0
ok()      { PASS=$((PASS+1)); echo "  [OK]     $1"; }
ko()      { FAIL=$((FAIL+1)); echo "  [FALLA]  $1"; }
check()   { if [ "$2" = "$3" ]; then ok "$1 (esperado $2)"; else ko "$1 (esperado $2, obtenido $3)"; fi; }
section() { echo; echo "== $1"; }

gen_uuid() {
  if command -v uuidgen >/dev/null; then uuidgen | tr 'A-Z' 'a-z'
  elif [ -r /proc/sys/kernel/random/uuid ]; then cat /proc/sys/kernel/random/uuid
  else python3 -c 'import uuid; print(uuid.uuid4())'; fi
}
token() {  # usuario contraseña -> access token (cliente de verificación, solo desarrollo)
  curl -s -X POST "$KC" -d grant_type=password -d client_id=inspecciones-cli \
    -d "username=$1" -d "password=$2" | jq -r '.access_token // empty'
}
decode() {
  local p m; p=$(echo "$1" | cut -d. -f2 | tr '_-' '/+'); m=$(( ${#p} % 4 ))
  [ "$m" -eq 2 ] && p="$p=="; [ "$m" -eq 3 ] && p="$p="
  echo "$p" | base64 -d 2>/dev/null
}
rol_de() { decode "$1" | jq -r '[.realm_access.roles[] | select(.=="inspector" or .=="supervisor" or .=="administrativo")][0]' 2>/dev/null; }
tamper() {  # altera la firma del JWT
  local h p s c; IFS=. read -r h p s <<<"$1"; c=${s:0:1}; [ "$c" = "A" ] && c=B || c=A; echo "$h.$p.$c${s:1}"
}
code() {  # metodo ruta token [cuerpo] -> código HTTP
  local m=$1 u=$2 t=$3 b=${4:-}
  if [ -n "$b" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$BASE$u" ${t:+-H "Authorization: Bearer $t"} -H 'Content-Type: application/json' -d "$b"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$m" "$BASE$u" ${t:+-H "Authorization: Bearer $t"}
  fi
}
code_file() {  # metodo ruta token archivo
  curl -s -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2" -H "Authorization: Bearer $3" -H 'Content-Type: application/json' --data-binary @"$4"
}
ctype() {  # metodo ruta token [cuerpo] -> Content-Type de la respuesta
  local m=$1 u=$2 t=$3 b=${4:-}
  curl -s -o /dev/null -w '%{content_type}' -X "$m" "$BASE$u" ${t:+-H "Authorization: Bearer $t"} -H 'Content-Type: application/json' ${b:+-d "$b"}
}
sql() { docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1" | tr -d '\r'; }
acta_body() { printf '{"inspeccionId":"%s","observaciones":"%s","cantidadFotos":%s}' "$1" "${2:-prueba}" "${3:-3}"; }
esperar_estado() {  # id estado_esperado timeout_s -> imprime el último estado visto
  local t=0 e=""
  while [ "$t" -lt "$3" ]; do
    e=$(sql "SELECT estado FROM actas WHERE id='$1'")
    [ "$e" = "$2" ] && { echo "$e"; return 0; }
    sleep 3; t=$((t+3))
  done
  echo "$e"; return 1
}

restaurar() {
  sql "UPDATE inspecciones SET expediente_id='EXP-2025-0002' WHERE id='$INSP2'" >/dev/null 2>&1
  docker compose start mock-expedientes >/dev/null 2>&1
}
trap restaurar EXIT

echo "Verificación de NFRs · $(date '+%Y-%m-%d %H:%M:%S') · commit $(git rev-parse --short HEAD 2>/dev/null || echo 's/d')"
echo "BASE=$BASE · SYNC_PATH=$SYNC_PATH"

# ---------------------------------------------------------------------------
section "Preparación"
check "Gateway responde en /health" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")"
T_INSP1=$(token inspector1 inspector123); T_INSP2=$(token inspector2 inspector123)
T_SUP=$(token supervisor1 supervisor123);  T_ADM=$(token admin1 admin123)
for u in T_INSP1 T_INSP2 T_SUP T_ADM; do
  [ -n "${!u}" ] || { echo "No se pudo obtener el token de $u. ¿Keycloak está sano (puerto 8180)?"; exit 1; }
done

# ---------------------------------------------------------------------------
section "RNF-06 · Login de cada rol con Keycloak (OIDC)"
check "inspector1 entra con rol"  inspector      "$(rol_de "$T_INSP1")"
check "inspector2 entra con rol"  inspector      "$(rol_de "$T_INSP2")"
check "supervisor1 entra con rol" supervisor     "$(rol_de "$T_SUP")"
check "admin1 entra con rol"      administrativo "$(rol_de "$T_ADM")"

# ---------------------------------------------------------------------------
section "RNF-02 · Matriz de permisos (un caso por celda relevante)"
A_PROPIA=$(gen_uuid)
check "inspector1 carga acta sobre su inspección"                 201 "$(code PUT /api/v1/actas/$A_PROPIA "$T_INSP1" "$(acta_body $INSP1 'seguridad' 1)")"
check "sin token → GET /api/v1/actas"                             401 "$(code GET /api/v1/actas '')"
check "token con firma alterada → GET /api/v1/actas"              401 "$(code GET /api/v1/actas "$(tamper "$T_INSP1")")"
check "inspector1 carga acta sobre inspección ajena"              403 "$(code PUT /api/v1/actas/$(gen_uuid) "$T_INSP1" "$(acta_body $INSP3)")"
check "inspector1 carga acta sobre inspección inexistente"        404 "$(code PUT /api/v1/actas/$(gen_uuid) "$T_INSP1" "$(acta_body $(gen_uuid))")"
check "inspector1 reasigna una inspección (solo supervisor)"      403 "$(code PATCH /api/v1/inspecciones/$INSP1/asignacion "$T_INSP1" "{\"inspectorId\":\"$INSPECTOR2_ID\"}")"
check "supervisor1 intenta cargar un acta"                        403 "$(code PUT /api/v1/actas/$(gen_uuid) "$T_SUP" "$(acta_body $INSP1)")"
check "admin1 intenta cargar un acta"                             403 "$(code PUT /api/v1/actas/$(gen_uuid) "$T_ADM" "$(acta_body $INSP1)")"
check "admin1 lista inspecciones"                                 200 "$(code GET /api/v1/inspecciones "$T_ADM")"
check "admin1 lista actas"                                        200 "$(code GET /api/v1/actas "$T_ADM")"
check "supervisor1 lista actas (todas)"                           200 "$(code GET /api/v1/actas "$T_SUP")"
check "inspector2 lee un acta de inspector1 (no se revela)"       404 "$(code GET /api/v1/actas/$A_PROPIA "$T_INSP2")"
check "inspector1 lee su propia acta"                             200 "$(code GET /api/v1/actas/$A_PROPIA "$T_INSP1")"
check "id de acta que no es UUID"                                 400 "$(code PUT /api/v1/actas/abc "$T_INSP1" "$(acta_body $INSP1)")"
check "ruta sin versión (gateway) → GET /api/actas"               404 "$(code GET /api/actas "$T_INSP1")"
case "$(ctype PUT /api/v1/actas/$(gen_uuid) "$T_ADM" "$(acta_body $INSP1)")" in
  application/problem+json*) ok "Los errores salen como application/problem+json";;
  *) ko "Los errores NO salen como application/problem+json";;
esac

# ---------------------------------------------------------------------------
section "RNF-05 · Límites del contrato (fotos y tamaños)"
check "cantidadFotos = 21"                    400 "$(code PUT /api/v1/actas/$(gen_uuid) "$T_INSP1" "$(acta_body $INSP1 limite 21)")"
check "cantidadFotos = -1"                    400 "$(code PUT /api/v1/actas/$(gen_uuid) "$T_INSP1" "$(acta_body $INSP1 limite -1)")"
check "cantidadFotos = 20 (máximo permitido)" 201 "$(code PUT /api/v1/actas/$(gen_uuid) "$T_INSP1" "$(acta_body $INSP1 limite 20)")"
BIG=$(mktemp); printf '{"inspeccionId":"%s","observaciones":"' "$INSP1" > "$BIG"
head -c 300000 /dev/zero | tr '\0' 'a' >> "$BIG"; printf '"}' >> "$BIG"
check "cuerpo de 300 KB (límite 256 KB)"      413 "$(code_file PUT /api/v1/actas/$(gen_uuid) "$T_INSP1" "$BIG")"
rm -f "$BIG"
L51='{"actas":['; for i in $(seq 51); do L51+="{\"id\":\"$(gen_uuid)\",\"inspeccionId\":\"$INSP1\"},"; done; L51="${L51%,}]}"
check "lote de 51 actas (máximo 50)"          400 "$(code POST "$SYNC_PATH" "$T_INSP1" "$L51")"
echo "  (Compresión de fotos, almacenamiento local y subida reanudable son diseño: no verificables en el corte.)"

# ---------------------------------------------------------------------------
section "RNF-01 · Sincronización de lo acumulado sin conexión (lote de 8 + 1 ajena)"
IDS=(); for i in $(seq 8); do IDS+=("$(gen_uuid)"); done; AJENA=$(gen_uuid)
LOTE='{"actas":['
for id in "${IDS[@]}"; do LOTE+="{\"id\":\"$id\",\"inspeccionId\":\"$INSP1\",\"observaciones\":\"acta cargada sin conexion\",\"cantidadFotos\":2},"; done
LOTE+="{\"id\":\"$AJENA\",\"inspeccionId\":\"$INSP3\",\"observaciones\":\"ajena\",\"cantidadFotos\":0}]}"
enviar_lote() { curl -s -X POST "$BASE$SYNC_PATH" -H "Authorization: Bearer $T_INSP1" -H 'Content-Type: application/json' -d "$LOTE"; }
contar() { echo "$1" | jq "[.resultados[] | select(.estado==\"$2\")] | length" 2>/dev/null || echo 0; }
R1=$(enviar_lote)
check "Primer envío: actas creadas"            8 "$(contar "$R1" creada)"
check "Primer envío: acta ajena rechazada"     1 "$(contar "$R1" rechazada)"
R2=$(enviar_lote)
check "Reenvío del mismo lote: ya_recibida"    8 "$(contar "$R2" ya_recibida)"
check "Reenvío del mismo lote: ajena rechazada" 1 "$(contar "$R2" rechazada)"
IDS_SQL=$(printf "'%s'," "${IDS[@]}"); IDS_SQL=${IDS_SQL%,}
check "Filas en la base para las 8 actas"      8 "$(sql "SELECT count(*) FROM actas WHERE id IN ($IDS_SQL)")"
check "Pendientes (outbox) para esas 8 actas"  8 "$(sql "SELECT count(*) FROM outbox WHERE acta_id IN ($IDS_SQL)")"
check "El acta ajena no quedó guardada"        0 "$(sql "SELECT count(*) FROM actas WHERE id='$AJENA'")"
echo "  (Prueba manual: docker compose stop gateway; abrir/recargar la web en :5173, cargar actas; docker compose start gateway.)"

# ---------------------------------------------------------------------------
section "RNF-03 · Integridad: 50 envíos concurrentes del mismo id y reinicio"
ID_C=$(gen_uuid); BODY=$(acta_body "$INSP1" concurrencia 1)
CODES=$(seq 50 | xargs -P 50 -I{} curl -s -o /dev/null -w '%{http_code}\n' -X PUT "$BASE/api/v1/actas/$ID_C" \
        -H "Authorization: Bearer $T_INSP1" -H 'Content-Type: application/json' -d "$BODY")
check "Respuestas 201"                          1 "$(echo "$CODES" | grep -c '^201$')"
check "Respuestas 200 (reintento idempotente)" 49 "$(echo "$CODES" | grep -c '^200$')"
check "Filas en actas"                          1 "$(sql "SELECT count(*) FROM actas WHERE id='$ID_C'")"
check "Pendientes en outbox"                    1 "$(sql "SELECT count(*) FROM outbox WHERE acta_id='$ID_C'")"
echo "  Reiniciando api y sync..."
docker compose restart api sync >/dev/null 2>&1
t=0; until [ "$(code GET /api/v1/actas/$ID_C "$T_INSP1")" = "200" ] || [ "$t" -ge 90 ]; do sleep 3; t=$((t+3)); done
check "Tras el reinicio el acta sigue en la base" 1 "$(sql "SELECT count(*) FROM actas WHERE id='$ID_C'")"
check "Tras el reinicio se sigue asociando"  asociada "$(esperar_estado "$ID_C" asociada 120)"

# ---------------------------------------------------------------------------
section "RNF-04 · Resiliencia ante el sistema de expedientes"
docker compose stop mock-expedientes >/dev/null 2>&1
sleep 5
ID_L=$(gen_uuid)
check "Con el legacy caído la API sigue aceptando actas" 201 "$(code PUT /api/v1/actas/$ID_L "$T_INSP1" "$(acta_body $INSP1 'legacy caido' 1)")"
sleep 8
check "El acta queda pendiente de asociación" pendiente_asociacion "$(sql "SELECT estado FROM actas WHERE id='$ID_L'")"
docker compose start mock-expedientes >/dev/null 2>&1
check "Al volver el legacy se asocia sola (sin intervención)" asociada "$(esperar_estado "$ID_L" asociada 300)"

sql "UPDATE inspecciones SET expediente_id='EXP-9999' WHERE id='$INSP2'" >/dev/null
ID_E=$(gen_uuid)
check "Acta sobre expediente inexistente se acepta" 201 "$(code PUT /api/v1/actas/$ID_E "$T_INSP1" "$(acta_body $INSP2 'expediente inexistente' 1)")"
check "Termina en error_asociacion" error_asociacion "$(esperar_estado "$ID_E" error_asociacion 120)"
check "Sin reintentos infinitos (1 intento: error definitivo)" 1 "$(sql "SELECT intentos FROM outbox WHERE acta_id='$ID_E'")"
sql "UPDATE inspecciones SET expediente_id='EXP-2025-0002' WHERE id='$INSP2'" >/dev/null

# ---------------------------------------------------------------------------
section "Resumen"
echo "OK: $PASS · FALLAS: $FAIL"
echo "Pendiente a mano: (1) la web abre y carga actas sin señal; (2) RNF-06: alta de un inspector en Keycloak y asignación con PATCH."
echo "Siguiente: RNF-07 con k6 (scripts/carga.js) y scripts/medir-outbox.sh; arranque en limpio con scripts/medir-arranque.sh."
[ "$FAIL" -eq 0 ]
