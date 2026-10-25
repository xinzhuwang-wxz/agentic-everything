# AE component ownership and provenance

AE uses one official Agents JS model loop, one DBOS durable scheduler, PostgreSQL state, Hono HTTP, official MCP transports and React/Radix presentation. The [accepted source](../docs/acceptance-status.md) and [support matrix](../docs/support-matrix.md) define the tested combinations.

## Composition boundaries

| Responsibility | Foundation | AE-owned contract |
| --- | --- | --- |
| Schemas and source adaptation | Zod, TypeScript parser, Git | Source-bound plans, approvals, isolated patch, baseline and business-difference evidence |
| Model and tools | Official Agents JS Agent/Runner/tool | Canonical capability definitions, independent broker validation, current host authority and exact approval binding |
| Durable execution | DBOS and PostgreSQL | Stable operation identity, locked receipt transitions, unknown-outcome reconciliation and immutable release binding |
| HTTP and MCP | Hono and official MCP SDK | Trusted host identity, bounded inputs and explicitly declared transport/tool subset |
| UI and host context | React, Radix and attributed Kokonut components | Host-owned mounts, reference/session boundaries, confirmation presentation and server-owned conversation state |
| Operations | pg transactions/advisory locks, Git and npm | One AE schema owner, fixed-source integrity, compatible upgrade and scoped retention/admission |

Capability definitions feed both the catalog and SDK tool factory; the broker independently validates before execution. SDK continuation approval and a host-bound business grant are separate boundaries. Cached workflow results never override current rights. A receipt with unknown outcome is not permission to redispatch a write.

The bounded [assistant-ui comparison](../docs/verification/assistant-ui-bounded-comparison.md) measures presentation integration without replacing the server execution or approval owners. [Cross-stack evidence](../docs/verification/cross-stack-inventory.md), [Java recipe](../docs/verification/java-spring-recipe.md), [workflows](../docs/verification/deterministic-workflows.md) and [operations](../docs/verification/release-operations.md) define actual reused interfaces and qualification limits. Optional knowledge, unrestricted outbound connectors, universal host adaptation and production identity/scale are not implied by installed dependencies.

## Exact code and license provenance

The artifact inventory was recorded against source `67bd11bf6ae4c4dc6869eb5fb45d138b6c642b85`; current exact locked supply-chain records and accepted composition are linked in the core acceptance report.

Sources for the pins below are the reviewed `package.json`, `package-lock.json`, and the actual installed packages' `package.json` plus license files. The registry tarball URL and SHA-512 integrity identify exact code bytes; an npm version is not asserted to identify a Git commit. The root lockfile also pins transitive packages. This is a focused provenance check, not a complete SBOM, security scan or legal opinion.

- P1: `zod@4.6.7`, MIT.
- P2: `@openai/agents`, `agents-core`, `agents-openai` at 0.21.0, MIT. The imported Runner is real SDK code; providers are simulated in observed tests.
- P3: `@dbos-inc/dbos-sdk@5.3.0` and `pg@8.23.1`, MIT. PostgreSQL binary provenance is separately recorded in `docs/DURABILITY_QUALIFICATION.md`: 17.11, Debian package `17.11-0+deb13u1`, server SHA-256 `d2ce1ddffafa783f9acda4c92c86fc21e8288bff3782d739294f14fa797d7886`, client `9d8558f8dd57c8e92e218a20698383575d53742ca3f9e7c2b7fe5f246d5216ae`; recorded artifact hashes are not verified signed release metadata.
- P4: `hono@4.13.13`, `@hono/node-server@2.1.5`, MIT.
- P5: MCP server/client/core 2.4.0. Package metadata says Apache-2.0, but each actual LICENSE explicitly retains MIT for unrelicensed prior contributions. Preserve the entire mixed-license notice; do not relabel everything Apache-only.
- P6: React/react-dom 19.3.1, MIT. P7: Radix Tabs 1.2.1, MIT.
- P8: Kokonut free repository at `590ded728c3414f871607a5d0662f9e70941d054`, MIT; pristine source/notice bytes and SHA-256 hashes are checked by the provenance test. `packages/ui/THIRD_PARTY_NOTICES.md` lists exact upstream files, authors and changes. Only textarea hook, controlled composer and status disclosure were adopted, not a chat runtime. No React Bits/Pro code is adopted.
- P9: TypeScript 5.9.3, Apache-2.0; Vite 8.3.5, MIT, including its bundled dependency notices. P10: Node 24.19.0 test/assert; jsdom 30.1.3 MIT; Playwright Core 1.64.1 Apache-2.0 and bundled notices. Installed Playwright alone is not browser qualification.
- P11: npm 11.9.0 and Git existing tools. Fixed-source clean-install evidence is recorded in the core acceptance report.
- P12: EAF semantic provenance commit `4068240525a42e55542277af2ebf0c617c82e38b`, retained MIT notice in `LICENSE`, `NOTICE.md`, and `runtime-core/docs`. This is attribution for earlier semantic adaptation, not a runtime dependency or compatibility contract.
- P13: AE's own code at the audited Git revision and its root LICENSE; justified custom domains are explicitly separated in the module map. No external foundation is invented for unimplemented roadmap entries.

### Artifact identity table

| Package | Exact official artifact | Integrity (SHA-512) |
| --- | --- | --- |
| @openai/agents@0.21.0 | [registry tarball](https://registry.npmjs.org/@openai/agents/-/agents-0.21.0.tgz) | `sha512-NpJ74/dGbpYZiRYF474pCaBpxqh4A8+WHbZmaEZVQpRqieZAVH+MV4fesR9MtRGUZfpW5B91zuHzIilQp2iSxQ==` |
| @openai/agents-core@0.21.0 | [registry tarball](https://registry.npmjs.org/@openai/agents-core/-/agents-core-0.21.0.tgz) | `sha512-P2jJhc85xrKpe9GUOHAVfPHqK52my49fD1CI0LnfYEvBUwZxJXQI6lgSwby9nWhvQECveM9OvBUglAXuArsHXw==` |
| @openai/agents-openai@0.21.0 | [registry tarball](https://registry.npmjs.org/@openai/agents-openai/-/agents-openai-0.21.0.tgz) | `sha512-Y1u1ek6FwKx8j+T7gRYcm4kKyN0irqsyZm0XUDZ+g+8s15tu4EhNwNJ92zOHGx7Vjkr2RugWBxTeNspHjw/lQw==` |
| @dbos-inc/dbos-sdk@5.3.0 | [registry tarball](https://registry.npmjs.org/@dbos-inc/dbos-sdk/-/dbos-sdk-5.3.0.tgz) | `sha512-SuoJ8Rk9jU+s7KZ42nAsVsX7dHRymsb0mlnvOJxgPV8uAbaQikRYlVjkVZjSG8jKJM06TMlfDD8OtzjX0C66eg==` |
| pg@8.23.1 | [registry tarball](https://registry.npmjs.org/pg/-/pg-8.23.1.tgz) | `sha512-aL96AHANtWjPLDOLqnhx+ngp9+UK7ETEU8VJrDCGvsSSi/mGLcWYsS6Herg7lmaBJe4uwrfqsa7gTEFaSizDoQ==` |
| hono@4.13.13 | [registry tarball](https://registry.npmjs.org/hono/-/hono-4.13.13.tgz) | `sha512-CQ46U0ZkAGmbT/4UxdzzGJpacP2IeKgY4a5/tOI9AABbpOMfK739wfDXmv1usCk+3RkKj1hQy4/fjhiwa2xlrA==` |
| @hono/node-server@2.1.5 | [registry tarball](https://registry.npmjs.org/@hono/node-server/-/node-server-2.1.5.tgz) | `sha512-MgP/I06GdvsilDspMk/qmRzpk8LOUStP6jFAbSRi40W09DhoyUn+Mj7eyKICPqeYKybOjVFLVIAQzvu1bfIa7Q==` |
| @modelcontextprotocol/server@2.4.0 | [registry tarball](https://registry.npmjs.org/@modelcontextprotocol/server/-/server-2.4.0.tgz) | `sha512-rgR9yxSaAJ+bcsi/XroT/S2AfPiIWloXAnrdfYSCms9ivVju0ishu/wW0J21Ho6+ZOR1r7RyeRbjiRuF87ix5Q==` |
| @modelcontextprotocol/client@2.4.0 | [registry tarball](https://registry.npmjs.org/@modelcontextprotocol/client/-/client-2.4.0.tgz) | `sha512-LgrD2OphHuG12vfKFKz6SOnq7bKHQmhGJIAYdD+MZBn2npHEyry6uD8zvktodtl5CQM85MO0anUyD9JwmUmxww==` |
| @modelcontextprotocol/core@2.4.0 | [registry tarball](https://registry.npmjs.org/@modelcontextprotocol/core/-/core-2.4.0.tgz) | `sha512-z8QBKqdfXLPzkLQuG4xp8hrVEMm1PZ1IgxMN2sMbJiFiAKOWXnAzogXn2W4aqIBlP1ea6U5yiqVquvUNM1Cj6Q==` |
| react@19.3.1 | [registry tarball](https://registry.npmjs.org/react/-/react-19.3.1.tgz) | `sha512-QNhWdt7nrgVWWQG58QuGsAR3jv3Hbe4mb4vz7w2csnHavciZJgda1CPNaldF6eVxv90ud3jUXpKlHL69gO38yw==` |
| react-dom@19.3.1 | [registry tarball](https://registry.npmjs.org/react-dom/-/react-dom-19.3.1.tgz) | `sha512-Y0bARz53lhEC1NMCASs0/j+faB/zqt3R8hpvg1e8+61ZVJ4UL0UdC4cBbXfZMcIuhrfgeILTLe+ZeBCavQPtKQ==` |
| @radix-ui/react-tabs@1.2.1 | [registry tarball](https://registry.npmjs.org/@radix-ui/react-tabs/-/react-tabs-1.2.1.tgz) | `sha512-hRoJlode+hg5ZNlR+3tkfkUliIybdTpD5lkAvHQ9yaXseGf7XVO9Ib2GPEIOuaJJbo7YWYbNpDDRfo8Dhf6/xA==` |
| zod@4.6.7 | [registry tarball](https://registry.npmjs.org/zod/-/zod-4.6.7.tgz) | `sha512-g8W2D2kU6a8untc053fX1uVBKzM7yqAxW/3zwk83+6RyF2+SKOuV+c0wBDhUwzV1PaGapmZH+rmcUzPf+3CGwg==` |
| typescript@5.9.3 | [registry tarball](https://registry.npmjs.org/typescript/-/typescript-5.9.3.tgz) | `sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==` |
| vite@8.3.5 | [registry tarball](https://registry.npmjs.org/vite/-/vite-8.3.5.tgz) | `sha512-z1YpjieJ9g0ebTmQpLBv/oq9E3F9EIlOe+7LahW8SrE3LTiG3udBRUXQOlYXP9b+IC2q2phHeVxj9xGlw34OEQ==` |
| jsdom@30.1.3 | [registry tarball](https://registry.npmjs.org/jsdom/-/jsdom-30.1.3.tgz) | `sha512-hQMUPvRgN7KxsfIytDQji7bimuJeRQa6Qo5+iuiZQk5CafeRxLIA10/cG5YCBFNpD9RO3oqIiN4CO1Y44kxqXg==` |
| playwright-core@1.64.1 | [registry tarball](https://registry.npmjs.org/playwright-core/-/playwright-core-1.64.1.tgz) | `sha512-BC4s8y6SEVA6Q1rSxZTto8hI1KUI3xXlHGZgvGqP4IqPdI/a6FX9H29IDNz7vKo9l21b6LfYosScPL6M3xxyDQ==` |

## Reproduction

```sh
npm ci --ignore-scripts
npm run check
npm run schemas
```

Service and browser checks require the exact environments and commands in their linked qualification reports. The [release evidence map](../docs/verification/core-acceptance-audit.md) distinguishes assembled-source results from component receipts. Lock integrity and source hashes identify artifacts; they do not alone certify runtime behavior, security or license compatibility for another distribution.
