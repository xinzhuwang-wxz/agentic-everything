import type { AdaptationPlan } from '@ae/contracts';

/** Reviewed synthetic Python integration. Business transactions stay in the existing host. */
export const inventoryRecipe = {
  ref: { id: 'python-inventory', version: '1.0.0' },
  manifest: 'pyproject.toml',
  inputs: ['pyproject.toml', 'inventory.py', 'test_inventory.py', 'README.md'],
  outputs: ['agentic/ae_adapter.py'],
  businessPath: 'inventory.py',
  observedFlow: 'Observed Python inventory availability and atomic order reservations with host-owned SQLite receipts and current rights.',
  matches(contents: ReadonlyMap<string, string>, stack: readonly string[]): boolean {
    return stack.includes('Python manifest observed') && this.inputs.every(path => contents.has(path)) && /class Inventory\b/.test(contents.get('inventory.py') ?? '') && /def reserve_stock\b/.test(contents.get('inventory.py') ?? '');
  },
  planDetails: {
    goals: ['Expose the existing Python inventory reservation domain through the shared AE capability boundary and a dependency-free JSON CLI surface.'],
    nonGoals: ['Rewriting Python business logic', 'A separate agent runtime', 'Production identity provisioning', 'Browser UI', 'Deployment', 'Paid model calls'],
    capabilities: ['inventory stock read', 'inventory reservation (host authority, target version and explicit runtime approval required)', 'host operation receipt reconciliation'],
    dependencies: ['Installed Python 3.11+ standard library only; no package installation'],
    commands: [], networkAllowlist: [], dataFlows: ['Trusted AE host boundary supplies identity and operation ID; the unchanged Python host independently authorizes and commits the reservation and receipt atomically.'],
    migrations: [], verification: ['Patch hashes', 'Reviewed Python adapter template', 'Original business source unchanged', 'Original/candidate business differential', 'Shared runtime approval and JSON CLI acceptance under explicit fixture profile'],
    rollback: ['Remove only patch-owned generated adapter if its post-apply hash still matches; retain original business data.'],
    cost: { currency: 'USD', maximum: 0, paidCallsAllowed: false },
  } satisfies Pick<AdaptationPlan, 'goals' | 'nonGoals' | 'capabilities' | 'dependencies' | 'commands' | 'networkAllowlist' | 'dataFlows' | 'migrations' | 'verification' | 'rollback' | 'cost'>,
  preview(read: (path: string) => string | null) {
    if (read(this.outputs[0]!) !== null) throw Error('Integration already exists or conflicts');
    return [{ path: this.outputs[0]!, before: null, after: ADAPTER }];
  },
};

const ADAPTER = `"""Generated AE transport only. No model, agent loop, or business transaction logic."""
import argparse
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from inventory import Inventory, InventoryError


def exact(value, keys, name):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise ValueError("Invalid " + name + " fields")


def dispatch(request, database):
    if not isinstance(request, dict):
        raise ValueError("Expected request object")
    operation = request.get("operation")
    keys = ["id", "operation", "principal", "arguments"]
    if operation in ("reserve_stock", "query_operation"):
        keys.append("operationId")
    exact(request, keys, "request")
    if not isinstance(request["id"], str) or not 1 <= len(request["id"]) <= 128:
        raise ValueError("Invalid request id")
    principal = request["principal"]
    exact(principal, ["tenantId", "applicationId", "subjectId", "roles", "scopes"], "principal")
    for key in ("tenantId", "applicationId", "subjectId"):
        if not isinstance(principal[key], str) or not principal[key]:
            raise ValueError("Invalid principal")
    for key in ("roles", "scopes"):
        if not isinstance(principal[key], list) or any(not isinstance(item, str) for item in principal[key]):
            raise ValueError("Invalid principal")
    arguments = request["arguments"]
    expected = {"current_principal": [], "list_stock": [], "read_stock": ["sku"], "reserve_stock": ["sku", "orderId", "quantity", "expectedVersion"], "query_operation": []}
    if operation not in expected:
        raise ValueError("Unknown operation")
    exact(arguments, expected[operation], "arguments")
    if "operationId" in request and (not isinstance(request["operationId"], str) or not 1 <= len(request["operationId"]) <= 128):
        raise ValueError("Invalid operation id")
    host = Inventory(database)
    if operation == "current_principal":
        return host.current_principal(principal)
    if operation == "list_stock":
        return host.list_stock(principal)
    if operation == "read_stock":
        return host.read_stock(principal, arguments["sku"])
    if operation == "query_operation":
        return host.query_operation(principal, request["operationId"])
    return host.reserve_stock(principal, arguments["sku"], arguments["orderId"], arguments["quantity"], arguments["expectedVersion"], request["operationId"])


def main():
    parser = argparse.ArgumentParser(description="Synthetic AE inventory host JSON boundary")
    parser.add_argument("--database", required=True)
    options = parser.parse_args()
    request = None
    try:
        raw = sys.stdin.buffer.read(65537)
        if len(raw) > 65536:
            raise ValueError("Request too large")
        request = json.loads(raw)
        result = dispatch(request, options.database)
        response = {"id": request["id"], "ok": True, "result": result}
    except (ValueError, TypeError, KeyError, InventoryError) as error:
        response = {"id": request.get("id") if isinstance(request, dict) else None, "ok": False, "error": {"code": getattr(error, "code", "invalid_request"), "message": str(error)}}
    sys.stdout.write(json.dumps(response, sort_keys=True, separators=(",", ":")) + "\\n")


if __name__ == "__main__":
    main()
`;
