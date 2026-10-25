"""Synthetic, ordinary stock reservations with host-owned SQLite state.

This module has no agent integration. Callers supply an already authenticated
principal; the fixture is deliberately not an identity provider.
"""

from contextlib import contextmanager
import json
from pathlib import Path
import sqlite3


class InventoryError(Exception):
    """A stable business rejection, not permission to retry a write."""

    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


_PRINCIPAL_FIELDS = {"tenantId", "applicationId", "subjectId", "roles", "scopes"}
_MAX_INTEGER = (1 << 63) - 1


def _text(value, name):
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        raise InventoryError("invalid_input", f"{name} must be a nonempty string of at most 200 characters")
    return value


def _strings(value, name):
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value):
        raise InventoryError("invalid_input", f"{name} must be an array of nonempty strings")
    return value


def _principal(principal):
    if not isinstance(principal, dict) or set(principal) != _PRINCIPAL_FIELDS:
        raise InventoryError("access_denied", "A trusted principal with the exact host identity fields is required")
    for key in ("tenantId", "applicationId", "subjectId"):
        _text(principal[key], key)
    _strings(principal["roles"], "roles")
    _strings(principal["scopes"], "scopes")
    return (principal["tenantId"], principal["applicationId"], principal["subjectId"])


def _positive_integer(value, name):
    # bool is a subclass of int in Python, but is never a business quantity.
    if type(value) is not int or value <= 0 or value >= _MAX_INTEGER:
        raise InventoryError("invalid_input", f"{name} must be a positive integer below {_MAX_INTEGER}")
    return value


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


class Inventory:
    """A bounded synthetic host with atomic stock and durable operation receipts.

    Use a new database path to reset the seed. Reopening an existing database
    preserves reservations, receipts, and current host rights across processes.
    """

    def __init__(self, database_path):
        self.database_path = str(Path(database_path))
        if self.database_path == ":memory:":
            raise ValueError("Use a filesystem database path; each operation owns a connection")
        with self._transaction(write=True) as connection:
            connection.execute("CREATE TABLE IF NOT EXISTS fixture_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS stock (sku TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, available INTEGER NOT NULL CHECK (available >= 0), version INTEGER NOT NULL CHECK (version > 0))")
            connection.execute("CREATE TABLE IF NOT EXISTS host_rights (tenant_id TEXT NOT NULL, application_id TEXT NOT NULL, subject_id TEXT NOT NULL, roles TEXT NOT NULL, scopes TEXT NOT NULL, PRIMARY KEY (tenant_id, application_id, subject_id))")
            connection.execute("CREATE TABLE IF NOT EXISTS operations (operation_id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, application_id TEXT NOT NULL, subject_id TEXT NOT NULL, request_json TEXT NOT NULL, result_json TEXT NOT NULL)")
            if connection.execute("SELECT value FROM fixture_meta WHERE key = 'seed'").fetchone() is None:
                connection.executemany("INSERT INTO stock VALUES (?, ?, ?, ?)", [("desk-01", "tenant-a", 12, 1), ("desk-02", "tenant-b", 8, 1)])
                for tenant, subject, role in (("tenant-a", "alice", "operator"), ("tenant-a", "bob", "viewer"), ("tenant-b", "mallory", "operator")):
                    scopes = ["inventory:read", "inventory:reserve"] if role == "operator" else ["inventory:read"]
                    connection.execute("INSERT INTO host_rights VALUES (?, ?, ?, ?, ?)", (tenant, "inventory-fixture", subject, _json([role]), _json(scopes)))
                connection.execute("INSERT INTO fixture_meta VALUES ('seed', '1')")

    @contextmanager
    def _transaction(self, *, write=False):
        connection = sqlite3.connect(self.database_path, timeout=10, isolation_level=None)
        connection.row_factory = sqlite3.Row
        try:
            connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield connection
            connection.commit()
        except BaseException:
            connection.rollback()
            raise
        finally:
            connection.close()

    @staticmethod
    def _authorize(connection, principal, *, reserve=False):
        identity = _principal(principal)
        current = connection.execute("SELECT roles, scopes FROM host_rights WHERE tenant_id = ? AND application_id = ? AND subject_id = ?", identity).fetchone()
        role_options = {"operator"} if reserve else {"operator", "viewer"}
        scope = "inventory:reserve" if reserve else "inventory:read"
        if current is None or not (set(principal["roles"]) & set(json.loads(current["roles"])) & role_options) or scope not in principal["scopes"] or scope not in json.loads(current["scopes"]):
            raise InventoryError("access_denied", "Current host rights do not permit this action")
        return identity

    @staticmethod
    def _stock(connection, tenant_id, sku):
        row = connection.execute("SELECT sku, tenant_id, available, version FROM stock WHERE sku = ?", (sku,)).fetchone()
        if row is None:
            raise InventoryError("not_found", "Stock item does not exist")
        if row["tenant_id"] != tenant_id:
            raise InventoryError("access_denied", "Stock item is outside the principal's tenant")
        return {"sku": row["sku"], "tenantId": row["tenant_id"], "available": row["available"], "version": row["version"]}

    def current_principal(self, principal):
        """Resolve current host rights without elevating claims or changing identity.

        The caller has already authenticated the supplied identity. A known,
        fully revoked identity remains recognizable with no effective rights.
        """
        identity = _principal(principal)
        with self._transaction() as connection:
            current = connection.execute("SELECT roles, scopes FROM host_rights WHERE tenant_id = ? AND application_id = ? AND subject_id = ?", identity).fetchone()
            if current is None:
                raise InventoryError("access_denied", "Principal identity is not registered in the host")
            roles = set(json.loads(current["roles"]))
            scopes = set(json.loads(current["scopes"]))
            return {
                "tenantId": principal["tenantId"],
                "applicationId": principal["applicationId"],
                "subjectId": principal["subjectId"],
                "roles": list(dict.fromkeys(role for role in principal["roles"] if role in roles)),
                "scopes": list(dict.fromkeys(scope for scope in principal["scopes"] if scope in scopes)),
            }

    def list_stock(self, principal):
        with self._transaction() as connection:
            tenant_id, _, _ = self._authorize(connection, principal)
            rows = connection.execute("SELECT sku, tenant_id, available, version FROM stock WHERE tenant_id = ? ORDER BY sku", (tenant_id,)).fetchall()
            return [{"sku": row["sku"], "tenantId": row["tenant_id"], "available": row["available"], "version": row["version"]} for row in rows]

    def read_stock(self, principal, sku):
        _text(sku, "sku")
        with self._transaction() as connection:
            tenant_id, _, _ = self._authorize(connection, principal)
            return self._stock(connection, tenant_id, sku)

    def reserve_stock(self, principal, sku, order_id, quantity, expected_version, operation_id):
        _text(sku, "sku")
        _text(order_id, "order_id")
        _text(operation_id, "operation_id")
        _positive_integer(quantity, "quantity")
        _positive_integer(expected_version, "expected_version")
        request_json = _json({"sku": sku, "orderId": order_id, "quantity": quantity, "expectedVersion": expected_version})
        with self._transaction(write=True) as connection:
            identity = self._authorize(connection, principal, reserve=True)
            previous = connection.execute("SELECT * FROM operations WHERE operation_id = ?", (operation_id,)).fetchone()
            if previous is not None:
                owner = (previous["tenant_id"], previous["application_id"], previous["subject_id"])
                if owner != identity or previous["request_json"] != request_json:
                    raise InventoryError("operation_conflict", "Operation identifier is already bound to another request")
                # An authorized exact replay returns the original business result,
                # including its stock snapshot, before checking today's version.
                return json.loads(previous["result_json"])
            stock = self._stock(connection, identity[0], sku)
            if stock["version"] != expected_version:
                raise InventoryError("stale_version", "Expected stock version does not match current stock")
            if quantity > stock["available"]:
                raise InventoryError("insufficient_stock", "Requested quantity exceeds available stock")
            stock["available"] -= quantity
            stock["version"] += 1
            result = {"status": "succeeded", "operationId": operation_id, "receiptId": f"receipt-{operation_id}", "data": {"stock": stock, "orderId": order_id, "quantity": quantity}}
            connection.execute("UPDATE stock SET available = ?, version = ? WHERE sku = ? AND tenant_id = ?", (stock["available"], stock["version"], sku, identity[0]))
            connection.execute("INSERT INTO operations VALUES (?, ?, ?, ?, ?, ?)", (operation_id, *identity, request_json, _json(result)))
            return result

    def query_operation(self, principal, operation_id):
        _text(operation_id, "operation_id")
        with self._transaction() as connection:
            identity = self._authorize(connection, principal, reserve=True)
            previous = connection.execute("SELECT * FROM operations WHERE operation_id = ?", (operation_id,)).fetchone()
            if previous is None:
                return {"status": "outcome-unknown", "operationId": operation_id, "message": "No host receipt found"}
            if (previous["tenant_id"], previous["application_id"], previous["subject_id"]) != identity:
                raise InventoryError("access_denied", "Operation receipt belongs to a different principal")
            return json.loads(previous["result_json"])

    def set_principal_rights(self, principal, roles, scopes):
        """Trusted host/test administration only; never expose as a business RPC.

        This synthetic fixture has no administration authentication. The caller
        must already control the local database. Empty rights revoke access.
        """
        identity = _principal(principal)
        _strings(roles, "roles")
        _strings(scopes, "scopes")
        with self._transaction(write=True) as connection:
            connection.execute("INSERT INTO host_rights VALUES (?, ?, ?, ?, ?) ON CONFLICT (tenant_id, application_id, subject_id) DO UPDATE SET roles = excluded.roles, scopes = excluded.scopes", (*identity, _json(roles), _json(scopes)))
