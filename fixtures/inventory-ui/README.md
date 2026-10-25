# Synthetic inventory UI mount

This optional test surface mounts the same `AgenticMount`, floating launcher, administration tabs and in-conversation approval over the existing Python/SQLite inventory. It is not part of the Python transformation recipe, which remains a headless adapter/CLI recipe. The original Python business fixture and its baseline hashes are unchanged.

The host supplies `context: { sku: 'desk-01' }`, a display label and two domain-specific suggestions. It does not disguise inventory as a ticket or create another chat/runtime. Server composition uses the existing `PythonInventoryHost`, `ToolBroker` and `GovernedRuntime`, with a deterministic simulated model and synthetic server identity. The browser has no credentials or authority to choose a principal.

After building AE, run `AE_BROWSER_EXECUTABLE=/path/to/qualified/chromium node tests/browser/inventory.mjs`. The runner creates a disposable Python adapter/database, runs a loopback API and Vite preview, exercises the mounted UI and writes screenshots plus JSON evidence to a printed temporary directory. It closes all processes it owns. No external account, production authentication, model-quality, persistent server conversation or deployment claim is made by this fixture.
