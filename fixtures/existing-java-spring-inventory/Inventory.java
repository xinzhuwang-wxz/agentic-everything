import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.*;
import java.util.UUID;

/** Ordinary host-owned business service. It knows neither AE nor an agent runtime. */
public final class Inventory {
    private final Path database;
    private final ObjectMapper json;
    private ObjectNode state;
    public Inventory(Path database, ObjectMapper json) throws IOException {
        this.database = database; this.json = json;
        if (Files.exists(database)) state = (ObjectNode) json.readTree(Files.readAllBytes(database));
        else {
            state = json.createObjectNode();
            state.set("stock", json.createObjectNode().put("sku", "desk-01").put("tenantId", "tenant-a").put("available", 12).put("version", 1));
            state.set("operations", json.createObjectNode()); state.put("mutationCount", 0);
        }
    }
    public synchronized ObjectNode read(String tenant, String sku) {
        ObjectNode stock = (ObjectNode) state.get("stock");
        if (!stock.path("tenantId").asText().equals(tenant) || !stock.path("sku").asText().equals(sku)) throw new IllegalArgumentException("RESOURCE_DENIED");
        return stock.deepCopy();
    }
    public synchronized JsonNode reserve(String tenant, String application, String subject, String operation, ObjectNode args) throws IOException {
        String key = json.createArrayNode().add(tenant).add(application).add(subject).add(operation).toString();
        ObjectNode stock = read(tenant, args.path("sku").asText());
        JsonNode prior = state.path("operations").get(key);
        if (prior != null) {
            if (!prior.get("arguments").equals(args)) throw new IllegalArgumentException("OPERATION_CONFLICT");
            return prior.get("result").deepCopy();
        }
        if (stock.get("version").intValue() != args.get("expectedVersion").intValue()) throw new IllegalArgumentException("RESOURCE_VERSION_CONFLICT");
        int quantity = args.get("quantity").intValue();
        if (quantity > stock.get("available").intValue()) throw new IllegalArgumentException("INSUFFICIENT_STOCK");
        stock.put("available", stock.get("available").intValue() - quantity).put("version", stock.get("version").intValue() + 1);
        ObjectNode result = json.createObjectNode().put("status", "succeeded").put("operationId", operation).put("receiptId", UUID.randomUUID().toString());
        result.set("data", json.createObjectNode().set("stock", stock));
        ((ObjectNode) result.get("data")).put("orderId", args.get("orderId").asText()).put("quantity", quantity);
        ObjectNode next = state.deepCopy(); next.set("stock", stock); next.put("mutationCount", state.get("mutationCount").intValue() + 1);
        ObjectNode entry = json.createObjectNode(); entry.set("arguments", args.deepCopy()); entry.set("result", result);
        ((ObjectNode) next.get("operations")).set(key, entry);
        Path temporary = Files.createTempFile(database.getParent(), "stock-", ".tmp");
        try { Files.write(temporary, json.writeValueAsBytes(next)); Files.move(temporary, database, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
        finally { Files.deleteIfExists(temporary); }
        state = next;
        return result.deepCopy();
    }
    public synchronized JsonNode query(String tenant, String application, String subject, String operation) {
        String key = json.createArrayNode().add(tenant).add(application).add(subject).add(operation).toString();
        JsonNode entry = state.path("operations").get(key);
        if (entry == null) return json.createObjectNode().put("status", "outcome-unknown").put("operationId", operation).put("message", "No authoritative host receipt; do not retry.");
        read(tenant, entry.path("arguments").path("sku").asText());
        return entry.get("result").deepCopy();
    }
    public synchronized int mutationCount() { return state.get("mutationCount").intValue(); }
}
