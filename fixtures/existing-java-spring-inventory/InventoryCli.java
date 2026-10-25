import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.*;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.SpringVersion;
import java.nio.file.Path;
import java.util.*;

/** Existing local batch CLI. No AE protocol, agent loop, or runtime dependency. */
public final class InventoryCli {
    static final ObjectMapper JSON = new ObjectMapper();
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("Expected owned inventory state path");
        byte[] bytes = System.in.readNBytes(65_537);
        if (bytes.length > 65_536) throw new IllegalArgumentException("Batch too large");
        JsonNode commands = JSON.readTree(bytes);
        if (!commands.isArray() || commands.size() > 16) throw new IllegalArgumentException("Expected bounded command array");
        try (GenericApplicationContext context = new GenericApplicationContext()) {
            context.registerBean(Inventory.class, () -> { try { return new Inventory(Path.of(args[0]), JSON); } catch (Exception e) { throw new RuntimeException(e); } });
            context.refresh();
            Inventory inventory = context.getBean(Inventory.class);
            ArrayNode results = JSON.createArrayNode();
            for (JsonNode command : commands) {
                try { results.add(dispatch(inventory, (ObjectNode) command)); }
                catch (IllegalArgumentException | SecurityException e) { results.add(JSON.createObjectNode().put("error", e.getMessage())); }
            }
            ObjectNode output = JSON.createObjectNode(); output.set("results", results);
            output.put("springVersion", SpringVersion.getVersion()).put("managedInventory", context.containsBeanDefinition(Inventory.class.getName()));
            output.put("mutationCount", inventory.mutationCount());
            System.out.println(output);
        }
    }
    static JsonNode dispatch(Inventory inventory, ObjectNode command) throws Exception {
        Set<String> fields = new HashSet<>(); command.fieldNames().forEachRemaining(fields::add);
        if (!Set.of("subject", "operation", "arguments", "operationId").containsAll(fields) || !fields.containsAll(Set.of("subject", "operation", "arguments"))) throw new IllegalArgumentException("INVALID_INPUT");
        String subject = command.path("subject").asText(), operation = command.path("operation").asText();
        if (!Set.of("alice", "bob", "mallory").contains(subject)) throw new SecurityException("AUTHORITY_DENIED");
        String tenant = subject.equals("mallory") ? "tenant-b" : "tenant-a";
        if (!(command.get("arguments") instanceof ObjectNode input)) throw new IllegalArgumentException("INVALID_INPUT");
        if (!operation.equals("read_stock") && subject.equals("bob")) throw new SecurityException("AUTHORITY_DENIED");
        switch (operation) {
            case "read_stock": exact(input, Set.of("sku")); text(input, "sku"); return inventory.read(tenant, input.get("sku").asText());
            case "reserve_stock":
                exact(input, Set.of("sku", "orderId", "quantity", "expectedVersion")); text(input, "sku"); text(input, "orderId"); positive(input, "quantity"); positive(input, "expectedVersion"); text(command, "operationId");
                return inventory.reserve(tenant, "java-inventory", subject, command.get("operationId").asText(), input);
            case "query_operation": exact(input, Set.of()); text(command, "operationId"); return inventory.query(tenant, "java-inventory", subject, command.get("operationId").asText());
            default: throw new IllegalArgumentException("OPERATION_DENIED");
        }
    }
    static void exact(ObjectNode node, Set<String> required) { Set<String> fields = new HashSet<>(); node.fieldNames().forEachRemaining(fields::add); if (!fields.equals(required)) throw new IllegalArgumentException("INVALID_INPUT"); }
    static void text(ObjectNode node, String name) { JsonNode value = node.path(name); if (!value.isTextual() || value.asText().isEmpty() || value.asText().length() > 128) throw new IllegalArgumentException("INVALID_INPUT"); }
    static void positive(ObjectNode node, String name) { JsonNode value = node.path(name); if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() <= 0 || value.intValue() > 1_000_000) throw new IllegalArgumentException("INVALID_INPUT"); }
}
