import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.*;
import com.sun.net.httpserver.*;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.SpringVersion;
import java.net.InetSocketAddress;
import java.nio.file.Path;
import java.util.*;

/** Qualification adapter: real Spring IoC, JDK HTTP transport, fixture-only identity.
 * No claim of Spring MVC/Boot, OAuth/IAM integration, or a general source sandbox. */
public final class AeHost {
    static final ObjectMapper JSON = new ObjectMapper();
    static final class IdentityDirectory {
        final ObjectNode identities;
        IdentityDirectory(ObjectNode identities) { this.identities = identities; }
        ObjectNode current(String authorization, JsonNode claims) {
            if (!authorization.startsWith("Bearer ")) throw new SecurityException("TOKEN_DENIED");
            JsonNode host = identities.get(authorization.substring(7));
            if (host == null) throw new SecurityException("TOKEN_DENIED");
            for (String field : List.of("tenantId", "applicationId", "subjectId")) if (!host.path(field).equals(claims.path(field))) throw new SecurityException("IDENTITY_DENIED");
            ObjectNode result = host.deepCopy();
            for (String field : List.of("roles", "scopes")) {
                ArrayNode common = JSON.createArrayNode();
                if (!claims.path(field).isArray()) throw new SecurityException("CLAIMS_DENIED");
                for (JsonNode value : host.path(field)) for (JsonNode claim : claims.path(field)) if (value.equals(claim)) { common.add(value); break; }
                result.set(field, common);
            }
            return result;
        }
        void require(ObjectNode p, boolean write) {
            boolean role = false, scope = false;
            for (JsonNode r : p.path("roles")) if (r.asText().equals("operator") || (!write && r.asText().equals("viewer"))) role = true;
            for (JsonNode s : p.path("scopes")) if (s.asText().equals(write ? "inventory:reserve" : "inventory:read")) scope = true;
            if (!role || !scope) throw new SecurityException("AUTHORITY_DENIED");
        }
    }
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("One owned fixture database path is required");
        byte[] configBytes = System.in.readAllBytes();
        if (configBytes.length > 65_536) throw new IllegalArgumentException("Configuration too large");
        ObjectNode config = (ObjectNode) JSON.readTree(configBytes);
        String adminToken = config.path("adminToken").asText();
        if (!adminToken.matches("[A-Za-z0-9_-]{32,256}")) throw new IllegalArgumentException("Fixture token required");
        GenericApplicationContext context = new GenericApplicationContext();
        context.registerBean(ObjectMapper.class, () -> JSON);
        context.registerBean(IdentityDirectory.class, () -> new IdentityDirectory((ObjectNode) config.get("identities")));
        context.registerBean(Inventory.class, () -> { try { return new Inventory(Path.of(args[0]), context.getBean(ObjectMapper.class)); } catch (Exception e) { throw new RuntimeException(e); } });
        context.refresh();
        IdentityDirectory identities = context.getBean(IdentityDirectory.class);
        Inventory inventory = context.getBean(Inventory.class);
        Object authorityLock = new Object();
        boolean[] loseNextWrite = { false };
        int[] writeRequests = { 0 };
        int port = config.path("port").asInt(0);
        if (port < 0 || port > 65535) throw new IllegalArgumentException("Invalid fixture port");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", port), 0);
        String host = "127.0.0.1:" + server.getAddress().getPort();
        server.createContext("/", exchange -> {
            try {
                if (!exchange.getRequestMethod().equals("POST") || !host.equals(exchange.getRequestHeaders().getFirst("Host")) || exchange.getRequestURI().getRawQuery() != null) { reply(exchange, 403, JSON.createObjectNode().put("error", "ENDPOINT_DENIED")); return; }
                String origin = exchange.getRequestHeaders().getFirst("Origin");
                if (origin != null && !origin.equals("http://" + host)) { reply(exchange, 403, JSON.createObjectNode().put("error", "ORIGIN_DENIED")); return; }
                if (!"application/json".equals(exchange.getRequestHeaders().getFirst("Content-Type"))) { reply(exchange, 415, JSON.createObjectNode().put("error", "CONTENT_TYPE_DENIED")); return; }
                byte[] input = exchange.getRequestBody().readNBytes(65_537);
                if (input.length > 65_536) { reply(exchange, 413, JSON.createObjectNode().put("error", "BODY_LIMIT")); return; }
                JsonNode parsed = JSON.readTree(input);
                if (!(parsed instanceof ObjectNode body)) throw new IllegalArgumentException("INVALID_INPUT");
                String authorization = Optional.ofNullable(exchange.getRequestHeaders().getFirst("Authorization")).orElse("");
                synchronized (authorityLock) {
                    // Harness administration is never exported to the model, MCP or AE capability registry.
                    if (exchange.getRequestURI().getRawPath().equals("/_fixture")) {
                        if (!authorization.equals("Bearer " + adminToken)) throw new SecurityException("TOKEN_DENIED");
                        if (body.has("identities")) { identities.identities.removeAll(); identities.identities.setAll((ObjectNode) body.get("identities")); }
                        if (body.has("loseNextWrite")) loseNextWrite[0] = body.path("loseNextWrite").asBoolean(false);
                        reply(exchange, 200, JSON.createObjectNode().put("mutationCount", inventory.mutationCount()).put("writeRequests", writeRequests[0])); return;
                    }
                    if (!exchange.getRequestURI().getRawPath().equals("/ae")) throw new SecurityException("ENDPOINT_DENIED");
                    exact(body, Set.of("operation", "principal", "arguments", "operationId"), Set.of("operation", "principal", "arguments"));
                    ObjectNode principal = identities.current(authorization, body.path("principal"));
                    String operation = body.path("operation").asText();
                    if (!(body.get("arguments") instanceof ObjectNode inputArgs)) throw new IllegalArgumentException("INVALID_INPUT");
                    identities.require(principal, operation.equals("reserve_stock") || operation.equals("query_operation"));
                    JsonNode result;
                    switch (operation) {
                        case "current_principal": exact(inputArgs, Set.of(), Set.of()); result = principal; break;
                        case "read_stock": exact(inputArgs, Set.of("sku"), Set.of("sku")); text(inputArgs, "sku"); result = inventory.read(principal.get("tenantId").asText(), inputArgs.get("sku").asText()); break;
                        case "reserve_stock":
                            writeRequests[0]++;
                            exact(inputArgs, Set.of("sku", "orderId", "quantity", "expectedVersion"), Set.of("sku", "orderId", "quantity", "expectedVersion")); text(inputArgs, "sku"); text(inputArgs, "orderId"); positive(inputArgs, "quantity"); positive(inputArgs, "expectedVersion"); text(body, "operationId");
                            identities.require(principal, false);
                            result = inventory.reserve(principal.get("tenantId").asText(), principal.get("applicationId").asText(), principal.get("subjectId").asText(), body.get("operationId").asText(), inputArgs); break;
                        case "query_operation": exact(inputArgs, Set.of(), Set.of()); text(body, "operationId"); identities.require(principal, false); result = inventory.query(principal.get("tenantId").asText(), principal.get("applicationId").asText(), principal.get("subjectId").asText(), body.get("operationId").asText()); break;
                        default: throw new IllegalArgumentException("OPERATION_DENIED");
                    }
                    if (operation.equals("reserve_stock") && loseNextWrite[0]) { loseNextWrite[0] = false; exchange.close(); return; }
                    ObjectNode response = JSON.createObjectNode(); response.set("result", result); reply(exchange, 200, response);
                }
            } catch (SecurityException e) { reply(exchange, 403, JSON.createObjectNode().put("error", e.getMessage())); }
            catch (IllegalArgumentException e) { reply(exchange, 409, JSON.createObjectNode().put("error", e.getMessage())); }
            catch (Exception e) { reply(exchange, 500, JSON.createObjectNode().put("error", "HOST_OUTCOME_UNCONFIRMED")); }
            finally { exchange.close(); }
        });
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { server.stop(0); context.close(); }));
        server.start();
        System.out.println(JSON.createObjectNode().put("port", server.getAddress().getPort()).put("springVersion", SpringVersion.getVersion()).put("context", context.getClass().getName()).put("managedInventory", context.containsBeanDefinition(Inventory.class.getName())));
    }
    static void exact(ObjectNode node, Set<String> allowed, Set<String> required) {
        Set<String> fields = new HashSet<>(); node.fieldNames().forEachRemaining(fields::add);
        if (!allowed.containsAll(fields) || !fields.containsAll(required)) throw new IllegalArgumentException("INVALID_INPUT");
    }
    static void text(ObjectNode node, String name) { JsonNode value = node.path(name); if (!value.isTextual() || value.asText().isEmpty() || value.asText().length() > 128) throw new IllegalArgumentException("INVALID_INPUT"); }
    static void positive(ObjectNode node, String name) { JsonNode value = node.path(name); if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() <= 0 || value.intValue() > 1_000_000) throw new IllegalArgumentException("INVALID_INPUT"); }
    static void reply(HttpExchange exchange, int status, JsonNode body) throws java.io.IOException {
        byte[] bytes = JSON.writeValueAsBytes(body); exchange.getResponseHeaders().set("Content-Type", "application/json"); exchange.sendResponseHeaders(status, bytes.length); exchange.getResponseBody().write(bytes);
    }
}
