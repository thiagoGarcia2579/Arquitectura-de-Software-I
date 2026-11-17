#!/usr/bin/env bash
# Mide cuánto tarda en vaciarse el outbox (RNF-07). Correrlo justo después de la carga con k6.
# Uso:  bash scripts/medir-outbox.sh        Salida: evidencia/outbox.txt
set -u
DB_USER="${DB_USER:-inspecciones}"; DB_NAME="${DB_NAME:-inspecciones}"
cd "$(dirname "$0")/.." || exit 1
mkdir -p evidencia
exec > >(tee evidencia/outbox.txt) 2>&1
sql() { docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc "$1" | tr -d '\r'; }

echo "Medición del outbox · $(date '+%Y-%m-%d %H:%M:%S')"
inicio=$(date +%s)
MAX_SEGUNDOS=900

while true; do
  pend=$(sql "SELECT count(*) FROM outbox WHERE procesado_en IS NULL")
  ahora=$(( $(date +%s) - inicio ))
  echo "[${ahora}s] pendientes: $pend"
  [ "$pend" = "0" ] && break
  if [ "$ahora" -ge "$MAX_SEGUNDOS" ]; then
  echo "ERROR: se alcanzó el límite de ${MAX_SEGUNDOS}s."
  exit 1
fi
  sleep 10
done
echo "Outbox vacío a los ${ahora} s (objetivo: menos de 900 s)."
echo "Actas por estado:"
sql "SELECT estado || ': ' || count(*) FROM actas GROUP BY estado ORDER BY estado"
