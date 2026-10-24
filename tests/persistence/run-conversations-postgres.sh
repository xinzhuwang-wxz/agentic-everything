#!/usr/bin/env bash
# Opt-in, isolated PostgreSQL qualification. No inherited app/provider credentials.
# Usage: bash tests/persistence/run-conversations-postgres.sh /path/to/postgresql/bin [port]
set -euo pipefail
PG_BIN=${1:?Pass an installed official PostgreSQL bin directory}
PORT=${2:-55472}
[[ "$PORT" =~ ^[0-9]+$ ]] && (( PORT > 1023 && PORT < 65536 )) || exit 2
REPO=$(cd "$(dirname "$0")/../.." && pwd)
cd "$REPO"
[[ -f dist/packages/runtime-adapters/db/runtime.js ]] || { echo 'Build the persistent runtime first: npm run build' >&2; exit 2; }
ROOT=$(mktemp -d /tmp/ae-persistence-postgres-XXXXXX)
"$PG_BIN/initdb" -D "$ROOT/data" --no-locale --encoding=UTF8 --auth-local=trust --auth-host=trust > "$ROOT/initdb.log"
# Disposable synthetic data, trust only on isolated loopback, never a production recipe.
"$PG_BIN/pg_ctl" -D "$ROOT/data" -l "$ROOT/server.log" -o "-h 127.0.0.1 -p $PORT -c unix_socket_directories=''" -w start
cleanup() {
  local run_status=$?
  trap - EXIT
  set +e
  "$PG_BIN/pg_ctl" -D "$ROOT/data" -m fast -w stop
  local stop_status=$?
  env -i PATH="$PATH" HOME="$ROOT" TZ=UTC node --input-type=module - "$ROOT" "$run_status" "$stop_status" <<'JS'
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [root, exit, stop] = process.argv.slice(2);
const cleanup = { commandExitCode: Number(exit), postgresStopExitCode: Number(stop), postmasterPidRemoved: !existsSync(join(root, 'data/postmaster.pid')), observedAt: new Date().toISOString() };
const passed = cleanup.commandExitCode === 0 && cleanup.postgresStopExitCode === 0 && cleanup.postmasterPidRemoved;
writeFileSync(join(root, 'process-summary.json'), JSON.stringify({ status: passed ? 'pass' : 'fail', ...cleanup }, null, 2) + '\n');
const path = join(root, 'joined-summary.json');
if (existsSync(path)) { const result = JSON.parse(readFileSync(path, 'utf8')); result.cleanup = { ...result.cleanup, postgres: cleanup }; if (!passed) result.status = 'fail'; writeFileSync(path, JSON.stringify(result, null, 2) + '\n'); }
if (!passed) process.exitCode = 1;
JS
  local record_status=$?
  echo "PostgreSQL persistence evidence: $ROOT"
  (( run_status == 0 && stop_status == 0 && record_status == 0 )) || exit 1
}
trap cleanup EXIT
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" ae_persistence_qualification
VERSION=$("$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -d ae_persistence_qualification -Atc 'show server_version')
echo "PostgreSQL version: $VERSION"
[[ "$VERSION" == 17.11* ]] || { echo 'This pinned qualification requires PostgreSQL 17.11' >&2; exit 2; }
# Keep start, tests and stop in the same shell invocation in ephemeral executors.
env -i PATH="$PATH" HOME="$ROOT" TZ=UTC NODE_OPTIONS=--max-old-space-size=640 node tests/persistence/qualify-conversations.mjs "postgresql://$(id -un)@127.0.0.1:$PORT/ae_persistence_qualification" "$ROOT"
