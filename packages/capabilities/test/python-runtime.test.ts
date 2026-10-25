import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { qualifiedPython } from '../src/python-runtime.js';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ae-python-selection-'));
  const oldPath = process.env.PATH, oldOverride = process.env.AE_PYTHON_EXECUTABLE;
  delete process.env.AE_PYTHON_EXECUTABLE;
  const executable = (folder: string, version: unknown, name = 'python3') => {
    const parent = join(directory, folder); mkdirSync(parent, { recursive: true });
    const path = join(parent, name);
    writeFileSync(path, `#!${process.execPath}\nif (process.argv[2] !== '-I' || process.argv[3] !== '-B' || process.argv[4] !== '-c' || !process.argv[5]?.includes('sqlite3')) process.exit(9); process.stdout.write(${JSON.stringify(JSON.stringify(version))});\n`);
    chmodSync(path, 0o755); return path;
  };
  const close = () => {
    if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
    if (oldOverride === undefined) delete process.env.AE_PYTHON_EXECUTABLE; else process.env.AE_PYTHON_EXECUTABLE = oldOverride;
    rmSync(directory, { recursive: true });
  };
  return { directory, executable, close };
}
test('qualified Python skips obsolete PATH entries and resolves a later compatible interpreter', () => {
  const f = fixture();
  try {
    f.executable('conda', [3, 10, 18]); f.executable('system', [3, 9, 6]); const current = f.executable('brew', [3, 14, 5]);
    process.env.PATH = ['conda', 'system', 'brew'].map(name => join(f.directory, name)).join(delimiter);
    assert.equal(qualifiedPython(), realpathSync(current));
  } finally { f.close(); }
});
test('explicit Python overrides fail closed for old, missing, malformed or non-executable candidates', () => {
  const f = fixture();
  try {
    const current = f.executable('current', [3, 14, 5]), old = f.executable('old', [3, 10, 18]), malformed = f.executable('malformed', ['3', 14, 5]), blocked = f.executable('blocked', [3, 14, 5]);
    chmodSync(blocked, 0o644); process.env.PATH = join(f.directory, 'current');
    for (const override of [old, malformed, blocked, join(f.directory, 'missing')]) {
      process.env.AE_PYTHON_EXECUTABLE = override;
      assert.throws(() => qualifiedPython(), /Python >=3\.11.*explicit override did not qualify/);
      assert.equal(qualifiedPython(current), realpathSync(current), 'trusted explicit option has priority over environment');
    }
    process.env.AE_PYTHON_EXECUTABLE = current;
    assert.throws(() => qualifiedPython(old), /explicit override did not qualify/);
  } finally { f.close(); }
});
test('Python selection uses literal absolute executable paths and validates changed cached files', () => {
  const f = fixture();
  try {
    const current = f.executable('literal', [3, 11, 0], 'python3 ; literal'), alias = join(f.directory, 'python-link');
    symlinkSync(current, alias); assert.equal(qualifiedPython(alias), realpathSync(current));
    const before = readFileSync(current); assert.ok(before.length > 0);
    f.executable('literal', [3, 9, 6], 'python3 ; literal');
    assert.throws(() => qualifiedPython(alias), /explicit override did not qualify/);
    for (const path of ['', 'python3', './python3', 'python3; touch marker', current + '\0']) assert.throws(() => qualifiedPython(path), /absolute executable path/);
    assert.equal(existsSync(join(f.directory, 'marker')), false);
  } finally { f.close(); }
});
test('Python selection preserves the caller deadline before probing or returning a cached interpreter', () => {
  const f = fixture();
  try {
    const current = f.executable('current', [3, 14, 5]); assert.equal(qualifiedPython(current), realpathSync(current));
    assert.throws(() => qualifiedPython(current, Date.now() - 1), /qualification budget exhausted/);
  } finally { f.close(); }
});
