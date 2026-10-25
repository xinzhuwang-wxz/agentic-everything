# Existing Python inventory host

This is an original, deliberately synthetic inventory/reservation business fixture. It is not an external customer project, production identity provider, or deployment. The original code contains no agent integration and uses only Python 3.11+ standard-library modules, including SQLite. No package installation, provider key, account, network request, or external download is needed.

## Business contract

Construct `Inventory(database_path)` from `inventory.py` with a writable SQLite file path in a temporary directory. The constructor creates the schema and seeds a new database once. Reopening that database, including from another Python process, retains stock, rights, and receipts. To reset a test, use a new database path. `:memory:` is intentionally unsupported because operations use independent connections.

The trusted host supplies an already authenticated principal with exactly these fields:

```json
{"tenantId":"tenant-a","applicationId":"inventory-fixture","subjectId":"alice","roles":["operator"],"scopes":["inventory:read","inventory:reserve"]}
```

The fixture does not authenticate these dictionaries, issue tokens, or establish production identity. An integration must authenticate and bind the principal outside this module, and must never take identity or operation identifiers from model-generated business arguments. SQLite and the trusted host remain the authority for current rights and receipts.

Seed identities, all in application `inventory-fixture`:

- `alice`, tenant-a: role `operator`, scopes `inventory:read` and `inventory:reserve`.
- `bob`, tenant-a: role `viewer`, scope `inventory:read`.
- `mallory`, tenant-b: role `operator`, scopes `inventory:read` and `inventory:reserve`.

Seed stock is `{sku: "desk-01", tenantId: "tenant-a", available: 12, version: 1}` and `{sku: "desk-02", tenantId: "tenant-b", available: 8, version: 1}`.

Public business methods:

- `current_principal(principal)` preserves the supplied tenant/application/subject identity and returns only roles/scopes present in both supplied claims and current host rights. Unknown identities are denied. A registered but fully revoked identity returns empty roles/scopes, without requiring read permission, so callers can hide unavailable capabilities. It does not authenticate the caller or grant additional claims.
- `list_stock(principal)` returns only that tenant's stock, sorted by SKU.
- `read_stock(principal, sku)` returns one `{sku, tenantId, available, version}` object.
- `reserve_stock(principal, sku, order_id, quantity, expected_version, operation_id)` atomically decreases available stock, increments the version, and stores the exact succeeded receipt.
- `query_operation(principal, operation_id)` returns the exact original receipt, or `{"status":"outcome-unknown","operationId":"...","message":"No host receipt found"}`. An absent receipt is not permission to retry blindly.

Reads require a matching `viewer` or `operator` role and `inventory:read` scope in both supplied claims and current host rights. Reservations and receipt queries require `operator` and `inventory:reserve` in both. A separate application, unknown subject, cross-tenant access, revoked right, or forged role claim is rejected independently of any calling framework's policy.

For `alice`, reserving `desk-01`, `order-1`, quantity `3`, expected version `1`, operation `op-1` returns:

```json
{"status":"succeeded","operationId":"op-1","receiptId":"receipt-op-1","data":{"stock":{"sku":"desk-01","tenantId":"tenant-a","available":9,"version":2},"orderId":"order-1","quantity":3}}
```

Exact retries by the same tenant/application/subject return that stored business result before checking the current stock version, even after later reservations change stock. Reusing an operation identifier for changed business arguments, expected version, or another identity is denied. Current rights are rechecked before any replay or receipt disclosure. Role/scope changes are not business-argument changes; they only change whether the same owner may access an existing receipt.

`InventoryError` exposes stable `code` and `message` attributes. Codes are `access_denied`, `invalid_input`, `not_found`, `stale_version`, `insufficient_stock`, and `operation_conflict`. Invalid quantities include zero, negatives, booleans, non-integers, and out-of-range integers. Identifiers must be nonempty strings of at most 200 characters. Rejected operations produce neither stock changes nor success receipts.

## Persistence and test administration

One SQLite transaction serializes rights checks, operation-key lookup, stock/version checks, stock update, and receipt insertion. A receipt-insertion failure rolls the stock update back. Separate-process reopening, concurrent retries, and competing versioned reservations are tested. This is bounded local SQLite evidence, not qualification of production backup, migrations, high availability, distributed databases, or arbitrary process/power-loss windows.

`set_principal_rights(principal, roles, scopes)` is a trusted host/test-administration helper for changing the local synthetic rights table. Empty lists revoke rights. It has no administration authentication and must never be exposed as a business or agent RPC. A caller who can modify this local database is already inside the fixture's trusted boundary. Do not use real customer or credential data.

## Run the original business tests

From this directory:

```sh
python3 -B -m unittest -v
```

Tests use disposable temporary SQLite files, including a fresh Python subprocess. They do not import an agent framework or execute network operations. This fixture's original tests establish business behavior; any generated adapter, policy/approval lifecycle, or cross-stack acceptance needs its own separate evidence.
