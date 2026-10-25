"""Domain behavior only: no agent framework, network, or third-party packages."""

from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from inventory import Inventory, InventoryError


ALICE = {"tenantId": "tenant-a", "applicationId": "inventory-fixture", "subjectId": "alice", "roles": ["operator"], "scopes": ["inventory:read", "inventory:reserve"]}
BOB = {"tenantId": "tenant-a", "applicationId": "inventory-fixture", "subjectId": "bob", "roles": ["viewer"], "scopes": ["inventory:read"]}
MALLORY = {"tenantId": "tenant-b", "applicationId": "inventory-fixture", "subjectId": "mallory", "roles": ["operator"], "scopes": ["inventory:read", "inventory:reserve"]}
SEED_A = {"sku": "desk-01", "tenantId": "tenant-a", "available": 12, "version": 1}
SEED_B = {"sku": "desk-02", "tenantId": "tenant-b", "available": 8, "version": 1}


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = str(Path(self.directory.name) / "inventory.sqlite")
        self.inventory = Inventory(self.path)

    def reserve(self, **changes):
        arguments = {"principal": ALICE, "sku": "desk-01", "order_id": "order-1", "quantity": 3, "expected_version": 1, "operation_id": "op-1"}
        arguments.update(changes)
        return self.inventory.reserve_stock(**arguments)

    def reject(self, code, callback, *args, **kwargs):
        with self.assertRaises(InventoryError) as raised:
            callback(*args, **kwargs)
        self.assertEqual(raised.exception.code, code)
        self.assertTrue(raised.exception.message)

    def test_current_principal_intersects_claims_without_changing_identity(self):
        claims = {**ALICE, "roles": ["operator", "admin", "operator"], "scopes": ["inventory:reserve", "inventory:delete", "inventory:read", "inventory:read"]}
        original = deepcopy(claims)
        self.assertEqual(self.inventory.current_principal(claims), {**ALICE, "scopes": ["inventory:reserve", "inventory:read"]})
        self.assertEqual(claims, original)
        self.assertEqual(self.inventory.current_principal({**ALICE, "roles": [], "scopes": []}), {**ALICE, "roles": [], "scopes": []})
        self.assertEqual(self.inventory.current_principal(BOB), BOB)

    def test_current_principal_returns_empty_rights_after_revocation(self):
        self.inventory.set_principal_rights(ALICE, [], [])
        expected = {**ALICE, "roles": [], "scopes": []}
        self.assertEqual(self.inventory.current_principal(ALICE), expected)
        self.assertEqual(Inventory(self.path).current_principal(ALICE), expected)
        self.reject("access_denied", self.inventory.list_stock, ALICE)
        self.reject("access_denied", self.reserve)

    def test_current_principal_checks_each_identity_field(self):
        for field, value in (("tenantId", "tenant-b"), ("applicationId", "other-app"), ("subjectId", "unknown")):
            with self.subTest(field=field):
                self.reject("access_denied", self.inventory.current_principal, {**ALICE, field: value})
        self.reject("access_denied", self.inventory.current_principal, {**ALICE, "untrusted": True})

    def test_seeded_stock_is_scoped_and_viewer_can_read(self):
        self.assertEqual(self.inventory.list_stock(ALICE), [SEED_A])
        self.assertEqual(self.inventory.list_stock(BOB), [SEED_A])
        self.assertEqual(self.inventory.list_stock(MALLORY), [SEED_B])
        self.assertEqual(self.inventory.read_stock(BOB, "desk-01"), SEED_A)

    def test_exact_reservation_result_and_readback(self):
        expected = {"status": "succeeded", "operationId": "op-1", "receiptId": "receipt-op-1", "data": {"stock": {"sku": "desk-01", "tenantId": "tenant-a", "available": 9, "version": 2}, "orderId": "order-1", "quantity": 3}}
        self.assertEqual(self.reserve(), expected)
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01"), expected["data"]["stock"])
        self.assertEqual(self.inventory.query_operation(ALICE, "op-1"), expected)

    def test_exact_replay_precedes_version_check_and_keeps_original_snapshot(self):
        original = self.reserve()
        self.reserve(order_id="order-2", quantity=2, expected_version=2, operation_id="op-2")
        self.assertEqual(self.reserve(), original)
        self.assertEqual(self.inventory.query_operation(ALICE, "op-1"), original)
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01")["available"], 7)
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01")["version"], 3)

    def test_receipt_and_stock_survive_fresh_process(self):
        expected = self.reserve()
        code = "import json,sys; from inventory import Inventory; db=Inventory(sys.argv[1]); p=json.loads(sys.argv[2]); print(json.dumps([db.query_operation(p,'op-1'),db.reserve_stock(p,'desk-01','order-1',3,1,'op-1'),db.read_stock(p,'desk-01')]))"
        process = subprocess.run([sys.executable, "-B", "-c", code, self.path, json.dumps(ALICE)], cwd=Path(__file__).parent, check=True, capture_output=True, text=True)
        self.assertEqual(json.loads(process.stdout), [expected, expected, expected["data"]["stock"]])

    def test_new_database_is_an_explicit_reset(self):
        self.reserve()
        self.assertEqual(Inventory(str(Path(self.directory.name) / "fresh.sqlite")).list_stock(ALICE), [SEED_A])
        self.assertEqual(Inventory(self.path).read_stock(ALICE, "desk-01")["available"], 9)

    def test_invalid_quantities_and_versions_do_not_change_stock(self):
        for value in (0, -1, True, False, 1.5, "3", None, [], {}, 1 << 63):
            for field in ("quantity", "expected_version"):
                with self.subTest(field=field, value=value):
                    self.reject("invalid_input", self.reserve, **{field: value})
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01"), SEED_A)

    def test_invalid_identifiers_are_rejected(self):
        for field in ("sku", "order_id", "operation_id"):
            for value in ("", " ", None, 123, "a" * 201):
                with self.subTest(field=field, value=value):
                    self.reject("invalid_input", self.reserve, **{field: value})

    def test_overstock_stale_and_missing_stock_have_no_receipts(self):
        self.reject("insufficient_stock", self.reserve, quantity=13)
        self.reject("stale_version", self.reserve, expected_version=2)
        self.reject("not_found", self.reserve, sku="missing")
        self.assertEqual(self.inventory.query_operation(ALICE, "op-1"), {"status": "outcome-unknown", "operationId": "op-1", "message": "No host receipt found"})
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01"), SEED_A)

    def test_full_stock_reservation_can_reach_zero_but_not_negative(self):
        self.assertEqual(self.reserve(quantity=12)["data"]["stock"]["available"], 0)
        self.reject("insufficient_stock", self.reserve, quantity=1, expected_version=2, operation_id="op-2")

    def test_cross_tenant_read_and_write_denied(self):
        self.reject("access_denied", self.inventory.read_stock, ALICE, "desk-02")
        self.reject("access_denied", self.reserve, sku="desk-02")
        self.reject("access_denied", self.reserve, principal=MALLORY)
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01"), SEED_A)
        self.assertEqual(self.inventory.read_stock(MALLORY, "desk-02"), SEED_B)

    def test_viewer_cannot_reserve_or_query_receipts(self):
        self.reserve()
        self.reject("access_denied", self.reserve, principal=BOB)
        self.reject("access_denied", self.inventory.query_operation, BOB, "op-1")

    def test_current_host_rights_block_forged_claims_and_identity(self):
        forged_bob = {**BOB, "roles": ["operator"], "scopes": ["inventory:read", "inventory:reserve"]}
        self.reject("access_denied", self.reserve, principal=forged_bob)
        for field, value in (("applicationId", "other-app"), ("subjectId", "unknown"), ("tenantId", "tenant-b")):
            with self.subTest(field=field):
                self.reject("access_denied", self.reserve, principal={**ALICE, field: value})

    def test_claims_cannot_exceed_or_omit_current_role_and_scope(self):
        for overrides in ({"roles": []}, {"roles": ["viewer"]}, {"scopes": ["inventory:read"]}):
            self.reject("access_denied", self.reserve, principal={**ALICE, **overrides})
        self.reject("access_denied", self.inventory.list_stock, {**ALICE, "scopes": ["inventory:reserve"]})

    def test_revocation_applies_before_replay_and_query_and_survives_reopen(self):
        self.reserve()
        self.inventory.set_principal_rights(ALICE, [], [])
        self.inventory = Inventory(self.path)
        self.reject("access_denied", self.reserve)
        self.reject("access_denied", self.inventory.query_operation, ALICE, "op-1")
        self.reject("access_denied", self.inventory.list_stock, ALICE)
        self.inventory.set_principal_rights(ALICE, ["operator"], ["inventory:read", "inventory:reserve"])
        self.assertEqual(self.reserve()["data"]["stock"]["available"], 9)

    def test_current_role_and_scope_are_checked_independently(self):
        for roles, scopes in ((["viewer"], ["inventory:read", "inventory:reserve"]), (["operator"], ["inventory:read"])):
            self.inventory.set_principal_rights(ALICE, roles, scopes)
            self.reject("access_denied", self.reserve)

    def test_collision_rejects_changed_request_and_other_principal(self):
        self.reserve()
        for override in ({"quantity": 2}, {"order_id": "order-2"}, {"sku": "desk-02"}, {"expected_version": 2}, {"principal": MALLORY, "sku": "desk-02"}):
            with self.subTest(override=override):
                self.reject("operation_conflict", self.reserve, **override)
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01")["available"], 9)
        self.assertEqual(self.inventory.read_stock(MALLORY, "desk-02"), SEED_B)

    def test_receipt_queries_bind_all_identity_fields(self):
        self.reserve()
        self.reject("access_denied", self.inventory.query_operation, MALLORY, "op-1")
        for overrides in ({"subjectId": "carol"}, {"applicationId": "other-app"}):
            other = {**ALICE, **overrides}
            self.inventory.set_principal_rights(other, other["roles"], other["scopes"])
            self.reject("access_denied", self.inventory.query_operation, other, "op-1")
            self.reject("operation_conflict", self.reserve, principal=other)

    def test_returned_results_cannot_mutate_stock_or_receipts(self):
        result = self.reserve()
        saved = deepcopy(result)
        result["data"]["stock"]["available"] = 999
        self.assertEqual(self.inventory.query_operation(ALICE, "op-1"), saved)
        read = self.inventory.read_stock(ALICE, "desk-01")
        read["available"] = 999
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01")["available"], 9)

    def test_concurrent_exact_retries_only_decrement_once(self):
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _: self.reserve(), range(16)))
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01")["available"], 9)
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01")["version"], 2)

    def test_concurrent_distinct_writes_serialize_version_check(self):
        def attempt(number):
            try:
                return self.reserve(operation_id=f"op-{number}")["status"]
            except InventoryError as error:
                return error.code
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(attempt, (1, 2)))
        self.assertCountEqual(results, ["succeeded", "stale_version"])
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01")["available"], 9)

    def test_receipt_failure_rolls_back_stock_decrement(self):
        with sqlite3.connect(self.path) as connection:
            connection.execute("CREATE TRIGGER reject_receipt BEFORE INSERT ON operations BEGIN SELECT RAISE(ABORT, 'synthetic receipt failure'); END")
        with self.assertRaises(sqlite3.IntegrityError):
            self.reserve()
        self.assertEqual(self.inventory.read_stock(ALICE, "desk-01"), SEED_A)
        self.assertEqual(self.inventory.query_operation(ALICE, "op-1")["status"], "outcome-unknown")

    def test_malformed_principal_is_not_authority(self):
        for principal in (None, {}, {**ALICE, "extra": "authority"}, {key: value for key, value in ALICE.items() if key != "roles"}):
            self.reject("access_denied", self.inventory.list_stock, principal)
        for field, value in (("roles", "operator"), ("scopes", [None]), ("subjectId", "")):
            self.reject("invalid_input", self.inventory.list_stock, {**ALICE, field: value})


if __name__ == "__main__":
    unittest.main()
