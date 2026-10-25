#!/usr/bin/env bash
set -euo pipefail
PG_BIN=${1:?Pass official PostgreSQL 17.11 bin directory}
PORT=${2:-55519}
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT > 1023 && PORT < 65536 )) || exit 2
cd "$(dirname "$0")/../.."
ROOT=$(mktemp -d /tmp/ae-retention-postgres-XXXXXX)
"$PG_BIN/initdb" -D "$ROOT/data" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=trust > "$ROOT/initdb.log"
"$PG_BIN/pg_ctl" -D "$ROOT/data" -l "$ROOT/server.log" -o "-h 127.0.0.1 -p $PORT -c shared_buffers=32MB -c max_connections=20 -c unix_socket_directories=''" -w start
trap '"$PG_BIN/pg_ctl" -D "$ROOT/data" -m fast -w stop; echo "Retention evidence: $ROOT"' EXIT
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" ae_persistence_qualification
VERSION=$("$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -d ae_persistence_qualification -Atc 'show server_version')
[[ "$VERSION" == 17.11* ]] || exit 2
env -i PATH="$PATH" HOME="$ROOT" TZ=UTC NODE_OPTIONS=--max-old-space-size=384 node tests/operations/qualify-retention.mjs "postgresql://$(id -un)@127.0.0.1:$PORT/ae_persistence_qualification" "$ROOT"
