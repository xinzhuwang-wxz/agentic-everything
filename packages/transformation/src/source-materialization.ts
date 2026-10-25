import { createHash } from 'node:crypto';

const forbidden = /(?:^|\/)(?:\.env(?:\.[^/]*)?|\.ssh|\.aws|\.npmrc|\.pypirc|credentials?(?:\.[^/]*)?|secrets?(?:\.[^/]*)?|id_(?:rsa|ed25519)|[^/]*\.(?:pem|key|p12))(?:\/|$)/i;

// A sample filename is not evidence of safety. This one immutable public blob was
// reviewed: credential fields are empty, other values are non-secret defaults.
// Source: sissbruecker/linkding@24b5ad6cc9bde497b5d1b1e86aed5a2fb7d25c2f/.env.sample
// MIT; fixture and original license retained under test/fixtures/public-env/.
// This permits carrying the original committed file, never reading it into a
// model prompt, sourcing it, or granting a recipe permission to modify it.
const publicSample = {
  path: '.env.sample',
  bytes: 2090,
  sha256: '12a0e13fc1b005ea484b96c666813d1a601de5ad85c9db82262b67950dcb10bf',
};

/** Inspect the approved Git tree, not dirty/untracked working-copy credentials. */
export function assertMaterializableTrackedTree(entries: readonly string[], readBlob: (oid: string) => Buffer): void {
  for (const entry of entries) {
    if (!entry) continue;
    const separator = entry.indexOf('\t');
    const metadata = entry.slice(0, separator).split(' ');
    const path = entry.slice(separator + 1);
    const [mode, type, oid] = metadata;
    if (separator < 0 || mode === '120000') throw Error('Tracked symlinks or secret files cannot enter the isolated worktree');
    if (!forbidden.test(path)) continue;
    if (mode === '100644' && type === 'blob' && oid && /^[0-9a-f]{40,64}$/.test(oid) && path === publicSample.path) {
      const contents = readBlob(oid);
      if (contents.length === publicSample.bytes && createHash('sha256').update(contents).digest('hex') === publicSample.sha256) continue;
    }
    // Never include file contents, values or secret-shaped fragments in errors.
    throw Error('Tracked symlinks or secret files cannot enter the isolated worktree');
  }
}
