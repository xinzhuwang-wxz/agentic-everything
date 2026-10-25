#!/usr/bin/env bash
set -euo pipefail
PG=${1:?Pass an existing qualified PostgreSQL bin directory}
PORT=${2:-55985}
[[ "$PORT" =~ ^[0-9]+$ ]] && ((PORT > 1023 && PORT < 65536)) || exit 2
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
EVIDENCE=$(mktemp -d /tmp/ae-m1-negative-postgres-XXXXXX)
"$PG/initdb" -D "$EVIDENCE/data" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=trust > "$EVIDENCE/initdb.log"
"$PG/pg_ctl" -D "$EVIDENCE/data" -l "$EVIDENCE/postgres.log" -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories='' -c shared_buffers=32MB -c max_connections=32" -w start
cleanup() { status=$?; trap - EXIT; set +e; "$PG/pg_ctl" -D "$EVIDENCE/data" -m fast -w stop; stopped=$?; test ! -e "$EVIDENCE/data/postmaster.pid"; missing=$?; printf '{"commandExit":%s,"postgresStopExit":%s,"pidRemoved":%s}\n' "$status" "$stopped" "$([ "$missing" = 0 ] && echo true || echo false)" > "$EVIDENCE/process-summary.json"; echo "Evidence: $EVIDENCE"; ((status == 0 && stopped == 0 && missing == 0)) || exit 1; }
trap cleanup EXIT
"$PG/createdb" -h 127.0.0.1 -p "$PORT" ae_persistence_qualification
VERSION=$("$PG/psql" -h 127.0.0.1 -p "$PORT" -d ae_persistence_qualification -Atc 'show server_version')
[[ "$VERSION" == 17.11* ]] || { echo "Pinned PostgreSQL 17.11 required, found $VERSION" >&2; exit 2; }
printf '%s\n' "$VERSION" > "$EVIDENCE/postgresql-version.txt"
cd "$ROOT"
env -i PATH="$PATH" HOME="$EVIDENCE" TZ=UTC node --max-old-space-size=384 qualification/m1-negative/inflight.mjs "postgresql://$(id -un)@127.0.0.1:$PORT/ae_persistence_qualification" "$EVIDENCE"
