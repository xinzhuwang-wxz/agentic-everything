import { spawnSync } from 'node:child_process';
import { accessSync, constants, realpathSync, statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';

const qualified = new Map<string, { fingerprint: string; compatible: boolean }>();
const requirement = 'Python >=3.11 with SQLite is required; set AE_PYTHON_EXECUTABLE to an absolute qualified interpreter path';
/** Trusted server/operator configuration only, never model or HTTP arguments. No shell is used. */
export function qualifiedPython(interpreter?: string, deadlineAt = Number.POSITIVE_INFINITY): string {
  const override = interpreter ?? process.env.AE_PYTHON_EXECUTABLE;
  if (override !== undefined && (typeof override !== 'string' || !isAbsolute(override) || override.includes('\0'))) throw Error(requirement + '; explicit override must be an absolute executable path');
  const paths = (process.env.PATH ?? '').split(delimiter).filter(path => isAbsolute(path)).slice(0, 64);
  const candidates = override === undefined ? [...paths.map(path => join(path, 'python3')), '/opt/homebrew/bin/python3', '/usr/local/bin/python3', '/usr/bin/python3'] : [override];
  const seen = new Set<string>(), deadline = Math.min(deadlineAt, Date.now() + 5000);
  for (const candidate of candidates) {
    if (Date.now() >= deadline) throw Error(requirement + '; interpreter qualification budget exhausted');
    let executable: string, fingerprint: string;
    try {
      executable = realpathSync(candidate); if (seen.has(executable)) continue; seen.add(executable);
      const stat = statSync(executable); if (!stat.isFile()) continue; accessSync(executable, constants.X_OK);
      fingerprint = [stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs].join(':');
    } catch { continue; }
    const cached = qualified.get(executable);
    if (cached?.fingerprint === fingerprint) { if (cached.compatible) return executable; continue; }
    const child = spawnSync(executable, ['-I', '-B', '-c', 'import json, sqlite3, sys; print(json.dumps(list(sys.version_info[:3])))'], {
      encoding: 'utf8', timeout: Math.max(1, Math.min(2000, deadline - Date.now())), killSignal: 'SIGKILL', maxBuffer: 4096,
      env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1' },
    });
    if (child.error || child.status !== 0 || child.signal || Date.now() > deadline) continue;
    let version: unknown; try { version = JSON.parse(child.stdout); } catch { continue; }
    if (!Array.isArray(version) || version.length !== 3 || !version.every(part => Number.isSafeInteger(part) && part >= 0)) continue;
    const compatible = version[0] > 3 || version[0] === 3 && version[1] >= 11;
    if (qualified.size >= 64) qualified.clear(); qualified.set(executable, { fingerprint, compatible });
    if (compatible) return executable;
  }
  throw Error(requirement + (override === undefined ? '; no compatible interpreter found' : '; explicit override did not qualify (no fallback)'));
}
