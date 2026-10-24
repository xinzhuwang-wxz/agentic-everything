#!/usr/bin/env bash
# Optional integration qualification, outside the no-service unit-test suite.
# Usage: bash tests/durability/run-postgres.sh /path/to/postgresql/bin [port]
set -euo pipefail
PG_BIN=${1:?Pass an installed official PostgreSQL bin directory}
PORT=${2:-55439}
[[ "$PORT" =~ ^[0-9]+$ ]] || exit 2
ROOT=$(mktemp -d /tmp/ae-postgres-qualification-XXXXXX)
"$PG_BIN/initdb" -D "$ROOT/data" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=trust > "$ROOT/initdb.log"
# Trust authentication is restricted to a disposable synthetic cluster on loopback.
# Never use this cluster setup for application/production data or on shared untrusted hosts.
"$PG_BIN/pg_ctl" -D "$ROOT/data" -l "$ROOT/server.log" -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories=''" -w start
trap '"$PG_BIN/pg_ctl" -D "$ROOT/data" -m fast -w stop; echo "PostgreSQL qualification evidence: $ROOT"' EXIT
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" ae_durability_qualification
"$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -d ae_durability_qualification -Atc 'select version()'
node tests/durability/qualify.mjs "postgresql://$(id -un)@127.0.0.1:$PORT/ae_durability_qualification"
