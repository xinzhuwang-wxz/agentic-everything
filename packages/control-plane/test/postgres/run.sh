#!/usr/bin/env bash
set -euo pipefail
PG_BIN=${1:?Pass official PostgreSQL 17 bin directory}
PORT=${2:-55459}
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT > 1023 && PORT < 65536 )) || exit 2
cd "$(dirname "$0")/../../../.."
ROOT=$(mktemp -d /tmp/ae-control-postgres-XXXXXX)
"$PG_BIN/initdb" -D "$ROOT/data" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=trust > "$ROOT/initdb.log"
"$PG_BIN/pg_ctl" -D "$ROOT/data" -l "$ROOT/server.log" -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories=''" -w start
trap '"$PG_BIN/pg_ctl" -D "$ROOT/data" -m fast -w stop; echo "Control-plane qualification evidence: $ROOT"' EXIT
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" ae_control_qualification
VERSION=$("$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -d ae_control_qualification -Atc 'show server_version')
echo "PostgreSQL version: $VERSION"
[[ "$VERSION" == 17.11* ]] || exit 2
# Disposable synthetic, loopback-only database. Start, qualification and stop are one invocation.
env -i PATH="$PATH" HOME="$ROOT" TZ=UTC node packages/control-plane/test/postgres/qualify.mjs "postgresql://$(id -un)@127.0.0.1:$PORT/ae_control_qualification"
