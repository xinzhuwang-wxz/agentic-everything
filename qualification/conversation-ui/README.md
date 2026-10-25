# Conversation UI qualification

Uses only synthetic data, a disposable PostgreSQL database, the actual current API/SDK/DBOS composition and, in browser mode, the current React host SDK in sandboxed Chromium. No paid provider, account, deployment or production credentials.

From the repository root with its pinned dependencies installed:

- Browser: `bash qualification/conversation-ui/run.sh /path/to/qualified/postgresql/bin /path/to/qualified/chromium-headless-shell`
- Correlation/migration only: append `55982 correlation` to that same command. The browser path is unused in correlation mode.

The script bundles current source into a fresh temporary evidence directory, starts one loopback PostgreSQL instance with 32MB shared buffers, and cleans it up. Browser mode binds the synthetic API on 127.0.0.1:55983; ensure it is unused. Source bundling executes code but is not a strict TypeScript gate. Run the repository's ordinary strict build/typecheck separately.

The browser covers two actual model turns and exact transcript hydration, dropped create/start responses, approval recovery, one original-host mutation, close/admin continuity, authority denial, explicit host identity boundary and narrow layout. Correlation mode covers nullable pre-upgrade rows, rerunnable migration, accepted-but-unmaterialized reservations, immutable/scoped nonce identity, current authority and durable replay/conflict. The original browser harness parse failure and subsequent fixes are retained in evidence; no successful behavior was inferred from that failed attempt.

`evidence/` contains small recorded results and source hashes, not a live database, generated runtime bundle or dependency tree. The synthetic browser and provider are not production SSO or real-model quality qualification. The tracked scripts are reproducible against current source; individual result files state the source inputs they exercised.
