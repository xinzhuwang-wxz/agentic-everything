#!/usr/bin/env bash
set -euo pipefail
PG_BIN=${1:?Pass official PostgreSQL 17.11 bin directory}
LEGACY=${2:?Pass isolated built pre-migration checkout}
PORT=${3:-55519}
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT > 1023 && PORT < 65536 )) || exit 2
cd "$(dirname "$0")/../.."
ROOT=$(mktemp -d /tmp/ae-operations-postgres-XXXXXX)
"$PG_BIN/initdb" -D "$ROOT/data" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=trust > "$ROOT/initdb.log"
"$PG_BIN/pg_ctl" -D "$ROOT/data" -l "$ROOT/server.log" -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories=''" -w start
trap '"$PG_BIN/pg_ctl" -D "$ROOT/data" -m fast -w stop; echo "Operations evidence: $ROOT"' EXIT
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" ae_persistence_qualification
VERSION=$("$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -d ae_persistence_qualification -Atc 'show server_version')
[[ "$VERSION" == 17.11* ]] || exit 2
# Disposable owned data only. Trust-on-loopback is not a production configuration.
env -i PATH="$PATH" HOME="$ROOT" TZ=UTC NODE_OPTIONS=--max-old-space-size=640 node tests/operations/qualify.mjs "postgresql://$(id -un)@127.0.0.1:$PORT/ae_persistence_qualification" "$ROOT" "$PG_BIN" "$LEGACY"
