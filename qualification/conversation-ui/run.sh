#!/usr/bin/env bash
set -euo pipefail
PG=${1:?Pass an already-qualified PostgreSQL bin directory}
BROWSER=${2:?Pass an already-qualified sandboxed Chromium executable}
PORT=${3:-55982}
MODE=${4:-browser}
[[ "$MODE" = browser || "$MODE" = correlation ]] || exit 2
SOURCE=$(cd "$(dirname "$0")/../.." && pwd)
EVIDENCE=$(mktemp -d /tmp/ae-conversation-ui-postgres-XXXXXX)
node --max-old-space-size=384 "$SOURCE/qualification/conversation-ui/build.mjs" "$EVIDENCE" "$MODE"
ln -s "$SOURCE/node_modules" "$EVIDENCE/node_modules"
"$PG/initdb" -D "$EVIDENCE/data" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=trust >"$EVIDENCE/initdb.log"
"$PG/pg_ctl" -D "$EVIDENCE/data" -l "$EVIDENCE/postgres.log" -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories='' -c shared_buffers=32MB -c max_connections=32" -w start
cleanup(){ status=$?;trap - EXIT;"$PG/pg_ctl" -D "$EVIDENCE/data" -m fast -w stop;stop=$?;test ! -e "$EVIDENCE/data/postmaster.pid";removed=$?;printf '{"commandExit":%s,"postgresStopExit":%s,"pidRemoved":%s}\n' "$status" "$stop" "$([ "$removed" = 0 ] && echo true || echo false)" >"$EVIDENCE/process-summary.json";echo "Evidence: $EVIDENCE";exit "$status"; }
trap cleanup EXIT
"$PG/createdb" -h 127.0.0.1 -p "$PORT" ae_persistence_qualification
AE_SOURCE_ROOT="$SOURCE" AE_BROWSER_EXECUTABLE="$BROWSER" node --max-old-space-size=512 "$EVIDENCE/$MODE.mjs" "postgresql://$(id -un)@127.0.0.1:$PORT/ae_persistence_qualification" "$EVIDENCE"
