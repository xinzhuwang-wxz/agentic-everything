# Runtime semantic provenance

This package independently implements governed execution in TypeScript.
Reference concepts include resolve → policy → approval → invoke → classify and unknown-outcome reconciliation.

Reviewed EAF source snapshot: 4068240525a42e55542277af2ebf0c617c82e38b.
Relevant sources: reachai-runtime-service/src/main/java/com/enterprise/ai/runtime/supervisor/
SupervisorToolPolicyService.java, AgentScopeSupervisorRuntimeAdapter.java; and
reachai-capability-service CapabilityInvocationApplicationService.java.
Original MIT copyright and full license are retained in EAF-MIT-LICENSE.txt out of caution for
substantial semantic adaptation. No customer source or credentials are included.

The actual agent loop is the official @openai/agents 0.21.0 Runner. AgentsModelPort translates
AE's ModelProvider contract only. It contains no second tool loop or autonomous workflow scheduler.
See docs/DURABILITY_QUALIFICATION.md for separately scoped DBOS/PostgreSQL evidence; this package does not by itself establish production durability.
