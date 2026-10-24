#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createAeMcpServer } from './index.js';

try {
  const allowedRepoRoot = process.env.AE_MCP_REPO_ROOT;
  if (!allowedRepoRoot || process.argv.length !== 2) throw new Error('Set AE_MCP_REPO_ROOT to an explicitly authorized development Git repository; no CLI arguments are accepted');
  // stdout belongs exclusively to MCP. Never log source or environment contents.
  await serveStdio(() => createAeMcpServer({ allowedRepoRoot }));
} catch {
  process.stderr.write('AE MCP startup rejected: configure one canonical, authorized development Git repository with bounded regular source files.\n');
  process.exitCode = 1;
}
