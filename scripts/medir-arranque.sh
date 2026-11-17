#!/usr/bin/env bash
# Mide el arranque desde cero (RNF-06). BORRA los volúmenes (docker compose down -v).
# Uso:  bash scripts/medir-arranque.sh        Salida: evidencia/arranque.txt
set -u
cd "$(dirname "$0")/.." || exit 1
mkdir -p evidencia
read -r -p "Esto borra los datos (down -v). ¿Continuar? [s/N] " r
[ "$r" = "s" ] || { echo "Cancelado."; exit 1; }
exec > >(tee evidencia/arranque.txt) 2>&1

echo "Arranque en limpio · $(date '+%Y-%m-%d %H:%M:%S') · commit $(git rev-parse --short HEAD 2>/dev/null || echo 's/d')"
docker compose down -v >/dev/null 2>&1
inicio=$(date +%s)
docker compose up -d --build --wait
fin=$(( $(date +%s) - inicio ))
echo
docker compose ps
echo
echo "Todos los servicios sanos en ${fin} s (objetivo: 600 s o menos)."
