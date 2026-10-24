# Runtime semantic provenance

AE code is a TypeScript rewrite, not a copy of the Java runtime. It retains the mature upstream
resolve → policy → approval → invoke → classify boundary and never-retry-unknown-write semantics.

Reviewed EAF source snapshot: b5269d50bcb0af5936d0164a34938572a8b8e97c.
Relevant sources: reachai-runtime-service/src/main/java/com/enterprise/ai/runtime/supervisor/
SupervisorToolPolicyService.java, AgentScopeSupervisorRuntimeAdapter.java; and
reachai-capability-service CapabilityInvocationApplicationService.java.
Original MIT copyright and full license are retained in EAF-MIT-LICENSE.txt out of caution for
substantial semantic adaptation. No customer source or credentials are included.

The actual agent loop is the official @openai/agents 0.21.0 Runner. AgentsModelPort translates
AE's ModelProvider contract only. It contains no second tool loop or autonomous workflow scheduler.
DBOS OSS remains the selected durable owner, not an implemented or qualified database adapter here.
