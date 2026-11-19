#!/usr/bin/env bash
# Rebuild the committed basemap in public/geo/ from Natural Earth (public domain).
# Source: https://github.com/nvkelso/natural-earth-vector (GeoJSON mirror of naturalearthdata.com)
# Clip box per CLAUDE.md: lon -98..-72, lat 33..50.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson
BBOX=-98,33,-72,50
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

layer() { # name source simplify%
  local name=$1 src=$2 keep=$3; shift 3
  echo "→ $name ($src)"
  curl -fsSL --retry 3 -o "$TMP/$src.geojson" "$BASE/$src.geojson"
  npx mapshaper "$TMP/$src.geojson" \
    -clip bbox=$BBOX \
    "$@" \
    -simplify "$keep" keep-shapes \
    -o "public/geo/$name.geojson" format=geojson precision=0.001 force
}

layer land       ne_10m_land                          20%
layer coastline  ne_10m_coastline                     20%
layer lakes      ne_10m_lakes                         25% -filter 'scalerank <= 6' -filter-fields name,scalerank
layer rivers     ne_10m_rivers_lake_centerlines       30% -filter 'scalerank <= 9' -filter-fields name,scalerank
# Regional detail (Fox, Illinois, Rock, St. Joseph, Kalamazoo…); rendered thinner than the main rivers.
layer rivers_na  ne_10m_rivers_north_america          15% -filter 'scalerank <= 12' -filter-fields name,scalerank
