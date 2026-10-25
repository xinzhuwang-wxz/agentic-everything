#!/usr/bin/env bash
# Opt-in, isolated PostgreSQL qualification. No inherited app/provider credentials.
# Usage: bash tests/workflows/run-postgres.sh /path/to/postgresql/bin [port]
set -euo pipefail
PG_BIN=${1:?Pass an installed official PostgreSQL bin directory}
PORT=${2:-55472}
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT > 1023 && PORT < 65536 )) || exit 2
REPO=$(cd "$(dirname "$0")/../.." && pwd)
cd "$REPO"
[[ -f dist/packages/runtime-adapters/db/workflows/runtime.js ]] || { echo 'Build the persistent runtime first: npm run build' >&2; exit 2; }
ROOT=$(mktemp -d /tmp/ae-persistence-postgres-XXXXXX)
"$PG_BIN/initdb" -D "$ROOT/data" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=trust > "$ROOT/initdb.log"
# Disposable synthetic data, trust only on isolated loopback, never a production recipe.
"$PG_BIN/pg_ctl" -D "$ROOT/data" -l "$ROOT/server.log" -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories=''" -w start
trap '"$PG_BIN/pg_ctl" -D "$ROOT/data" -m fast -w stop; echo "PostgreSQL persistence evidence: $ROOT"' EXIT
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" ae_persistence_qualification
VERSION=$("$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -d ae_persistence_qualification -Atc 'show server_version')
echo "PostgreSQL version: $VERSION"
[[ "$VERSION" == 17.11* ]] || { echo 'This pinned qualification requires PostgreSQL 17.11' >&2; exit 2; }
# Keep start, tests and stop in the same shell invocation in ephemeral executors.
env -i PATH="$PATH" HOME="$ROOT" TZ=UTC node tests/workflows/qualify.mjs "postgresql://$(id -un)@127.0.0.1:$PORT/ae_persistence_qualification" "$ROOT"
