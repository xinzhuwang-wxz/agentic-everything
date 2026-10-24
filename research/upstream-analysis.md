# AE 上游源码深度审阅：EnterpriseAgentFramework / ReachAI

审阅日期：2026-10-24。用途：AE 独立项目的重构立项与范围审批，**不是已开始重写或生产验收结论**。

## 1. 结论先行

ReachAI 不是几个 prompt 加 CRUD 的演示项目。当前源码是一套五 Java 服务、Vue/TypeScript 管理端、嵌入聊天 SDK、Java 能力 SDK/Starter、TypeScript 执行 Worker 的企业能力平台。重写的主要价值应是：降低分布式部署及维护成本、采用语言无关能力协议、明确宿主身份和授权边界、让审批与副作用成为可靠的运行时事实，而不是简单换语言或把现有代码变成“多智能体”。

值得保留的核心是：能力来源与已接纳修订分离、发布快照/执行 pin、平台身份与业务身份分离、可信内部请求/nonce、防止模型制造授权、执行与业务结果区分、interaction/执行 lease 和 outbox、知识检索的权限再检查。值得重新设计的是：通用宿主适配协议、多租户隔离、可恢复执行和副作用不确定性、跨环境取消/事件背压、减少重复的安全分支和兼容分支。

不能把 README 中“适用于 OA/ERP/CRM”等场景直接当作任意软件零接入的现成能力。源码要求宿主注册能力、服务端身份交换、页面动作处理器、原业务后端鉴权及真实验收；A2A、市场 API、部分 workflow 节点还有明确未开放范围。

## 2. 来源、下载范围与可复现性

- 仓库：[w8123/EnterpriseAgentFramework](https://github.com/w8123/EnterpriseAgentFramework)。GitHub API 返回 public，默认分支 main。
- 固定提交：`4068240525a42e55542277af2ebf0c617c82e38b`，提交说明为优化账号角色权限页面并更新交流群图片；仓库 pushed_at 为 2026-10-23T05:08:32Z。
- [固定源码树](https://github.com/w8123/EnterpriseAgentFramework/tree/4068240525a42e55542277af2ebf0c617c82e38b)。以下 `path:line` 全部相对此提交根目录，不指向随时变化的 main。
- 完整 Git tree：4,521 条，3,777 个 blob，文件总内容约 220.40 MB。按扩展名选择文本源文件，跳过图片、视频/3D、缓存、node_modules、编辑器配置与 Git 历史；初次下载 3,612 文件、29,165,591 字节，另补齐 Dockerfile.*。下载归档流式读取，不把完整大压缩包留盘。
- 本地 `upstream/source` 是**源码审阅快照，不是完整可构建 checkout**，缺少品牌/图片等静态资源，不能将其构建失败等同于上游构建失败。
- `upstream/repo-metadata.json`、`commit-metadata.json`、`tree.json`、`PINNED_COMMIT` 保存来源；`source-manifest.json` 给出每个下载文件的 Git blob SHA-1、SHA-256、size。每个文件重新计算 Git blob SHA-1 并与 GitHub tree 比对后写入清单。
- 全程只读取并解析源文件。没有运行上游任何脚本、安装依赖、启动服务、连接数据库/企业系统、调用收费模型或发布。
- 静态规模：2,432 个 Java、536 个 TS、274 个 Vue 文件（含测试），上述语言约 525,129 行；764 个 src/test 文件、211 个前端 *.test.ts。测试存在≠测试通过。

## 3. 许可证与再分发边界

`LICENSE:1-21` 是 MIT，Copyright (c) 2026 w8123；文件 SHA-256：`88fb961d3b6cd2a0abf7e42d5dbe866cfc943cab3f6b678af9f49a0a430d5cff`。使用/改写实质性代码应保留该版权与许可文本，不能因迁到 TS/Python 就删去出处。

MIT 不是整个依赖/视觉素材供应链的统一许可证：

1. `ai-admin-front/THIRD_PARTY_NOTICES.md:5-19` 壁纸为 Unsplash，具有自己的使用限制；不随新产品品牌默认搬迁。
2. 同文件 `21-51` 的 liqui-design，以及 `53-83` 的 liquid-glass-react 移植片段分别保留 Fan Li、Max Rovensky 的 MIT 声明。
3. `ai-admin-front/src/assets/ai-coding-providers/LICENSE.md:1-39`：LobeHub 图标来源与 MIT，产品名称/商标属于各权利人。
4. Maven/npm、容器镜像、Docling、数据库/对象存储等仍需正式 SBOM 和依赖许可证审计。本次不安装依赖，不声称全部依赖已完成法律或漏洞审查。
5. 建议 AE 使用独立品牌/新 UI 资产；借鉴设计与移植代码分别记录来源。保留上游 LICENSE + THIRD_PARTY_NOTICES，不照搬 ReachAI 商标及宣传图。

## 4. 真实系统地图

| 模块 | 源码中的职责 | 重写处置 |
|---|---|---|
| `reachai-control-service` | 公共控制台/BFF、平台 session/RBAC、项目、嵌入 token/页面动作、MCP/A2A Hub、技能、AI Coding 接入任务、个人记忆、运行管理代理 | AE control-plane 模块，不必先拆独立服务 |
| `reachai-runtime-service` | AgentScope supervisor、GraphSpec 编译/执行、发布版本、workflow/agent 配置、interaction、会话、RunOps、eval、automation、managed execution | 单一显式 run 状态机 + 可插拔 agent executor，保留确定性工作流与模型决策区别 |
| `reachai-capability-service` | 扫描/注册、Java business methods、HTTP API 资产、来源接纳、执行修订、能力调用/签名、市场绑定 | capability registry + policy/tool broker + adapters |
| `reachai-knowledge-service` | 文档/导入任务、chunk、embedding、Milvus、RAG、业务索引、权限及生命周期 | 可选知识模块；权限先于检索质量，非第一切片必选 |
| `reachai-model-service` | 厂商目录/账号/实例、模板、模型路由、OpenAI-compatible 调用、流/usage | 统一 model provider port；不提前仿制整个模型市场 |
| `ai-common`, `ai-runtime-contract` | DTO/契约、签名、公用策略、运行边界 | 语言中立 JSON Schema/OpenAPI + TS 类型，不共享数据库 entity |
| `reachai-capability-sdk`, `reachai-spring-boot2-starter` | 业务能力注解/HTTP 注册、宿主执行入口、签名校验、身份和上下文 | Java 作为后续 adapter 保留兼容价值，不把新内核继续绑 Java |
| `ai-admin-front` | Vue3/Pinia/ElementPlus、VueFlow/ELK、工作台与 standalone SDK 构建、嵌入聊天 | 独立 AE Console + Web SDK；先建最低完整流程，复杂画布后置 |
| `managed-executor-worker` | TS 受控执行协议、运行事件/产物、worker lease | 高风险 sandbox 扩展，不进入 v0 默认通用工具箱 |

证据：根 `pom.xml:15-55` 明确模块、Java17、SpringBoot3.4.5、AgentScope2.0.0、LangGraph4j1.8.16；前端 `package.json` 明确 Vue/Vite/SDK/test 脚本；各服务 src/main 下实际控制器/service/entity/client 构成上述领域，而非 README 目录而已。

## 5. 已深入追踪的入口与信任链

### 5.1 控制台会话 → Agent 执行

1. 前端 router 使用权限元数据控制导航（`ai-admin-front/src/router/index.ts:1-88`），这是体验层，不是唯一授权。
2. 后端 `PlatformBearerAuthService.java:25-47` 读取 token digest、有效/撤销状态、ACTIVE 用户及数据库授权。`PlatformSessionTokenCodec.java:17-31` 用 32 随机字节发 opaque token，只保存 SHA-256 摘要。
3. `PlatformConsoleAuthInterceptor.java:47-94` 处理 bearer/cookie，cookie 写请求校验 CSRF，路由无匹配规则或权限不足拒绝。控制台、独立协议入口、optional session 由 `PlatformConsoleAuthWebConfig.java:20-29` 分类。
4. `ControlRuntimePublicController.java:210-228` 提供同步/详细/SSE 执行；`1445-1495` 先去除客户端 trust envelope，已登录调用 trusted gateway，无登录进入不可信公共路径。这里并非“一切公开执行都等于认证用户”。
5. `1504-1520` 草稿 debug 需服务器检查 agent:debug/project；`1545-1571` 服务器覆盖 user/roles/tenant，再映射 runtime 用户。
6. `ControlInternalServiceAuthVerifier.java:49-106` 验证内部 caller、identity source、tenant、精确 body hash、HMAC、时间窗及数据库 nonce，失败/存储不可用拒绝。生产传输单独由 `InternalTransportSecurityPolicy.java:22-58` 要求 TLS 或声明 mesh。

重写注意：`ControlRuntimePublicController.java:1554` 和内部 verifier `:70` 均固定 `default` tenant。存在 tenant 字段不能等同于完整 SaaS 多租户；AE 必须把 tenant/project/subject 从可信宿主交换带到每个存储、查询、事件与执行许可。

### 5.2 能力执行不是让模型直接访问 HTTP

`CapabilityInvocationApplicationService.java:30-68` 是明确 resolve → policy → invoker → classification 边界。`CapabilityInvocationPolicyChain.java:15-59` 检查 deadline、enabled、精确工具/project、必要身份、eval 只读约束。

`CapabilityToolExecutionService.java:52-103` 还检查已接纳来源契约、asset revision、binding hash、execution revision、试调用上下文和输入，再构造 HTTP 调用。`:132-159` 在资源/修订改变时拒绝；`:192-218` 特别不允许控制台平台身份被当成业务身份。

`DefaultCapabilityHttpToolInvoker.java:36-80` 附 idempotency-key、traceparent，按 deadline 配 timeout，执行后分类响应。这里 key 的传递**不等于宿主实现幂等，更不等于 exactly-once**；新 adapter 必须声明是否支持去重、结果查询及补偿。

审阅发现需硬化的边界：上述 invoker 把响应整块读为 byte[] (`:76`)，未见此路径独立字节上限；transport policy 主要验证 URL 结构/TLS（`CapabilityOutboundTransportPolicy.java:17-32` → common policy），不能视为通用 SSRF/重定向/DNS rebind 防护。企业内部 endpoint 本来可能合法，不能一刀切禁止私网；应做按 adapter 管理的 egress allowlist、重定向逐跳校验、DNS/IP policy 与响应限额。本次未做攻击验证，不作可利用漏洞断言。

### 5.3 发布与版本变更

`ControlRuntimePublicController.java:960-1013` 保存 agent draft 时组装服务端 Skill/A2A binding snapshot，发布时重新检查。`:887-920` 禁止仍绑定 project-scoped skill 的 Agent 静默搬项目。应移植“发布不可变快照 + 每次执行校验授权/连接状态”，而非仅存一个可编辑 Agent JSON。

### 5.4 Runtime：模型监督器与确定性图执行器分离

以下路径前缀 R = `reachai-runtime-service/src/main/java/com/enterprise/ai/runtime/`。

- `R/internal/RuntimeAgentExecutionInternalController.java:60-87,108-157,254-296` 验内部签名和 body/header identity 一致性；`R/supervisor/RuntimeAgentExecutionService.java:128-166,593-670` 清除伪造 continuity/memory/control 字段，路由首次执行或 resume，加载已发布配置，只接受 AGENTSCOPE。
- `R/supervisor/AgentScopeSupervisorRuntimeAdapter.java:197-332` 获取会话 turn lease，装配规划/final/workflow/A2A/managed-executor tools、上下文 hooks 和有界 ReActAgent。`:269-303` 明确 Skill 指令不授予权限且禁用 Skill 代码执行；`:333-403` 把对外最终答案与内部运行分开。
- `:1873-1970,2020-2050` workflow 必须在记录的 plan 中，已完成或写操作结果不明不能盲目重试，工具政策/审批通过后 reservation + 读写锁执行。
- `R/execution/kernel/RuntimeGraphSpecExecutionEngine.java:282-464` 编译 GraphSpec，放入可信上下文，调用注册 node handler，发事件并选下一条边。`RuntimeGraphSpecExecutor.java` 是 facade，不是另一个完整内核。
- `R/execution/kernel/RuntimeActionNodeHandlers.java:91-164` TOOL 带 contract/revision/binding、invocation/idempotency key/deadline/trace/identity 到 Capability；HTTP API 是独立 port。
- `R/supervisor/SupervisorToolPolicyService.java:52-149,282-332` allowlist-first，坏配置拒绝，roles/tenant/project/risk/permission 检查；不可逆操作默认拒绝，WRITE 需一次性匹配审批。
- `R/execution/checkpoint/WorkflowCheckpointCodec.java:18-29,51-146` checkpoint 有 schema/engine/graph/payload digest 和清理后的 state，默认 256 KiB、上限 1 MiB。`RuntimeInteractionResumeService.java:48-161` 校验 owner/idempotency payload、先提交 claim、加载持久化图/checkpoint，不任意 merge 客户端输入。

限制与重写要求：

1. kernel 是单 current-node/next-edge 的 64 步循环（`:50,323-324,449-456`），不是通用并行 DAG 调度。Supervisor 并行只读调用是另一层。
2. 外部副作用不可由取消自动回滚（`:344-346`）；设计 UNKNOWN/reconcile，不承诺原子事务跨业务系统。
3. checkpoint resume 的 facade `RuntimeGraphSpecExecutor.java:195-221` 使用 NOOP event sink、Cancellation.none、EvalContext.none。这是上下文能力传播限制；不能据此声称 eval 绕过，因为 blocking interaction 在 eval 路径另有拒绝。
4. supervisor 单文件 2,378 行、kernel 1,431 行，重构应按 planner/policy/run ledger/executor/event stream/continuation 分离。
5. workflow HTTP 已实现更强的地址 pin、redirect/credential/response 控制（`R/execution/http/WorkflowHttpEgressPolicy.java:15-45`、`WorkflowHttpClient.java:107-165`）。应统一为所有 adapter 的可信 egress 层，而非遗漏这项已存在设计。
6. retry 依错误类别、HTTP 方法及策略，最多五次/10 秒 backoff（kernel `:529-583,637-721`），不要替换成 LLM 自由重试。

### 5.5 模型与知识

M = `reachai-model-service/src/main/java/com/enterprise/ai/model/`；K = `reachai-knowledge-service/src/main/java/com/enterprise/ai/`。

模型：`M/service/ModelRoutingService.java:27-75` 加载配置的 active instance，此路径仅支持 OPENAI_COMPATIBLE，不是现成跨厂商智能路由/自动 failover。`M/runtime/OpenAiCompatibleRuntimeClient.java:180-209` 用阻塞 reader + boundedElastic + BUFFER；所查方法未将取消/dispose 绑定 provider body/task 关闭，不能默认取消已经停止计费生成。需要取消、timeout、背压、usage 尾事件契约。`src/main/resources/application.yml:15-19` 明确多实例缓存失效有默认五秒窗口，授权/密钥撤销延迟需在威胁模型里列明。

知识：`K/security/impl/PermissionServiceImpl.java:25-69`、`K/retrieval/KnowledgeRetrievalCore.java:25-49`、`DefaultKnowledgeRetrievalEngine.java:158-196` 不只依赖 vector filter：抓文件 grant generation、用数据库重新找仍授权 chunk，在 rerank 前和返回前再次检查。值得保留这一强约束。

导入：`K/pipeline/document/job/DocumentImportJobWorker.java:66-181` 有 parse/index lease、按执行租约的 artifact、发布 guard，以及确定 fencing 后才补偿删除；不明结果留给 reconcile。这比简单上传→向量化更可复用。

局限：`DefaultKnowledgeRetrievalEngine.java:78-143,202-225` 每 KB 顺序检索、失败进入诊断；`:280-331` keyword 路径是 SQL LIKE/LIMIT 后字符串评分，不是 BM25。没有执行评测，不能宣称混合检索质量达标。AE 初期可将 RAG 后置，但保留授权与 generation 契约。

### 5.6 宿主嵌入与页面动作

- 宿主后端 `reachai-spring-boot2-starter/.../ReachAiEmbedTokenEndpoint.java:36-69` 从宿主 resolver 取得登录主体，要求 agent/page-instance，优先 HTTP Origin 并拒绝 body 不匹配。`ReachAiEmbedTokenClient.java:43-63,125-134` 服务端签名向平台交换；浏览器不应持项目 secret。
- Control `platform/PlatformEmbedTokenService.java:45-87,90-136` 把 project/agent/user/page-instance/origin/roles 放入有 issuer/audience/expiry 的 token。`PlatformEmbedPublicController.java:79-94` 仍固定 default tenant。
- `ai-admin-front/src/sdk/eafChat.ts:515-540,626-640` 直接 Vue createApp/mount 到宿主 DOM，支持 SPA rebind，**不是 iframe sandbox**。page bridge 需要宿主 action handler/navigation adapter，不是任意页面自动操控器。
- `eafPageBridge.ts:10-74,123-140` 动作有 request/action/page-instance/args/confirm，业务 NO_DATA/PRECONDITION_FAILED/USER_CANCELLED 与技术失败区分。`embedPageActions.ts:73-160` 有本地去重、in-flight 去重、result retry。
- Control `PlatformEmbedPublicController.java:354-383` claim CAS REQUESTED→EXECUTING；`:278-339` terminal/idempotent result 与状态迁移；`PlatformEmbedSessionService.java:71-88,153-157` 绑定 project/agent/user/page instance。

需要改造的信任边界（静态风险，不是已重现漏洞）：

- `eafPageBridge.ts:212-241,337-345` 执行只看 request.confirm，未在该路径强制本地 declaration.confirmRequired。`embedPageActions.ts:300-323` 旧 window bridge fallback 使用 confirmed:true。服务端 claim 未独立持有审批证据，而结果接受客户端 userConfirmed。AE 必须把“客户端声称确认”与服务器签发的、精确参数/版本/期限绑定的 approval grant 区分，写业务接口仍由原系统最终鉴权。
- `eafPageBridge.ts:545-561` timeout 是 Promise.race，未向宿主 handler 传 AbortSignal，超时后副作用可能继续。要记录 UNKNOWN 而不是自动再发。
- SDK `reachai-capability-sdk/.../auth/ReachAiSigner.java:21-27` project 请求签名为 project+timestamp+nonce，不包含方法/path/body；`ReachAiInvocationToken.java:40-67` 所查 verifier 没有一次性 jti/argument digest 校验。不要混淆它与上面更强的内部 HMAC 协议。
- CORS 不是被盗 bearer 的 proof-of-possession；SDK 同宿主 origin/脚本 trust domain。可选择 iframe 隔离 UI，但通过桥允许的动作仍需宿主权限策略。

### 5.7 托管 Worker 与开放协议

- `managed-executor-worker/src/runner.ts:122-151,220-230` 真正调用 Codex app-server initialize→thread/start→turn/start，ephemeral thread，user reviewer、read-only/workspace-write、network disabled。`approval.ts:10-55` 默认 cancel，匹配 requestId；`process-policy.ts:20-83` env allowlist、shell:false、output/time caps。
- 它是已实现的受控 worker port，并非仅提示词；但 OS 隔离依赖 app-server 与部署，不可把 subprocess 限制当作容器安全证明。
- MCP `control/mcp/api/protocol/McpEndpointController.java:59-95,113-138` 有 authenticated POST JSON-RPC，initialize/server discover/tools list/call；GET SSE 明确不支持。
- A2A 不是只有名字：有 publication/revision、principal、trust、task/event/outbox、outbound policy。`control/a2a/infrastructure/transport/httpjson/A2aOutboundTargetPolicy.java:23-138` 有 HTTPS/port/DNS/network policy；`DeterministicA2aAgentCardGenerator.java:83-91` 明确拒绝声明 streaming/push/extended card。

## 6. 持久化与部署审阅

- `sql/initV2.sql` 有 176 行真实 CREATE TABLE 语句；表的单一服务 owner 在 `docs/architecture/service-table-ownership.md:10-26` 和矩阵中维护。当前是**五个物理服务共用一个 MySQL 数据库**，不是五个独立数据库；源码规则要求跨 owner 用 internal API。
- 数据类别至少包括：control users/sessions/grants/project/page/action/token、A2A/MCP/skill、personal-memory/candidate/outbox；runtime agent/config/workflow/release/pin、run/trace/conversation/checkpoint/interaction、automation occurrence/attempt/lease、eval dataset/experiment/task、managed execution/event/artifact/outbox；capability catalog/source/revision/credential；knowledge file/chunk/permission/import/artifact；model account/instance/catalog。
- `sql/README.md:7-14,28-56,66-70` 明确新库 baseline 与旧库迁移不同，近期升级包含丢弃旧 memory/评测表、重置内置角色等破坏性操作，旧迁移链在 Git 历史。AE 不能自动运行这些脚本导入既有客户系统；迁移先做映射、备份、dry-run 和可验证恢复。
- `deploy/docker-compose.infra.yml` 是基础设施：MySQL、Redis、etcd、MinIO、Milvus，Docling opt-in，不是一个自包含的整产品部署；MySQL 挂载整个 sql 目录作为 init directory，而 SQL README 要求新库只运行 initV2，使用前应明确排除升级脚本以免重复/不当执行。
- Dockerfile 每服务 COPY 预先构建的 target JAR（例如 `deploy/Dockerfile.reachai-runtime-service:1-5`），不是自动从源码构建。
- `deploy/k8s/reachai-control-service.yml:19,42-61` 使用示例 registry/latest、HTTP service 地址、关闭 LOCAL/bootstrap、secure cookie 和 secretRef。生产传输模式默认 DEVELOPMENT_PLAINTEXT (`control/application.yml:173-184`)，common production guard 只在 prod/production profile 检查；样例本身不能证明 mesh/TLS 已部署。
- 更重要的生产落地缺口：`control/identity/PlatformConsoleAuthAvailability.java:21-29` 非 LOCAL provider 一律返回 NOT_IMPLEMENTED；关闭 LOCAL 后不是自动获得企业 SSO。AE 必须明确 OIDC/SSO 是独立工作包，避免“关默认账号即可生产可用”的假象。
- `control/application.yml:160-172` 有文档化开发 bootstrap 默认账号。新项目不继承此默认；首次配置使用一次性初始化流程/随机秘密，生产环境 fail closed。

## 7. README 宣传、真实实现、尚未证明的内容

| 主题 | 当前可确认 | 不应宣称 |
|---|---|---|
| 企业系统智能化 | 有业务 SDK、注册/扫描、page bridge、token broker 和运行时 | 任意系统零改造；不用宿主后端鉴权 |
| 智能体 | 真 AgentScope supervisor、planning/tool policy/continuation | 只换模型即可无限安全自治 |
| Workflow | 编译、node handler、有限循环、checkpoint | 全功能并行 durable DAG |
| 人工交互 | session/claim/resume 实现；节点开放策略单独控制 | 所有交互 UI 已生产验证；所有写确认都有独立可信证据 |
| Workflow 节点 | `workflow/node/RuntimeWorkflowNodeCapabilityRegistry.java:147-175` 列出 stable/beta/planned | enum 中出现就已可执行/可发布 |
| Blocking interaction | 同上 `169-173` 只开放 PRESENT_OUTPUT，阻塞变体等待 live E2E | 具备 handler 就代表已对用户全面开放 |
| A2A | publication/trust/task/outbox/HTTP JSON | streaming/push/extended card；全面互操作已通过 |
| MCP | 指定 POST 方法与工具协议 | 通用 transport/全规范实现 |
| API 市场 | `ApiMarketHttpApiBindingService.java:44-72` 当前只接明确无认证、只读 GET、受限 schema/JSON | 所有 OpenAPI/auth/write 自动可用 |
| 模型 | OpenAI-compatible 配置实例与流 | 通用跨协议 provider/failover |
| 知识 | 权限/generation/导入租约真实 | 已达成 BM25/高质量 hybrid 效果 |
| 企业身份 | 本地平台 auth 与宿主业务身份 | OIDC/SAML 已实现、真正多租户已证明 |
| 测试 | 大量 negative/recovery 测试源码 | 本次已运行通过、覆盖率/性能/SLA 已证明 |

## 8. 重写迁移清单：保留语义，不照搬复杂度

| 领域资产 | AE 迁移策略 | 最低验收 |
|---|---|---|
| Project / capability source / accepted revision | 移植概念和状态机，重写 TS schema | source hash 变化不能静默扩大可执行权限 |
| Capability invocation contract | 移植为语言无关 request/result JSON Schema | exact tool/input/revision/subject/idempotency trace 可追溯 |
| Host identity broker | 优先重写并提供宿主示例 | 浏览器改 userId/role/project 无法越权 |
| Grant / approval | 新建独立服务端 policy decision + bound approval | 改参数、换主体、过期、重复确认均拒绝 |
| Run / event / checkpoint / leases | 借鉴现有恢复语义，统一 ledger | 重启、断流、并发 claimant、UNKNOWN 均有确定行为 |
| Page actions | 沿用 typed handler + page instance/rebind 思路，删旧 confirmed fallback | 双击/导航/超时不重复写；需确认动作不能降级 |
| Agent configuration / workflow release | 保留 draft→validate→publish→immutable release | 每 run 记录所有版本，撤销权限仍即时限制 |
| Knowledge authorization | 保留 owner/generation/revalidation | revoke/replace 后不得返回 stale chunk |
| Model routing | 从小型 provider interface 开始，别先做全目录 | SSE 断连资源释放、usage、budget/timeout |
| MCP / A2A | 独立 adapter，按明确版本/子集做 conformance | 声明能力必须真实支持；外部 server 不成为授权源 |
| Java SDK | 后续保留 Java adapter 兼容接口，不当新内核 | 宿主最终鉴权、签名/nonce/body binding |
| Automation / Eval / Managed execution | 分阶段引入，不阻塞 v0 | durable leases、read-only eval、隔离与审批契约 |
| UI / 品牌 | 新 AE Console/嵌入助手；复用交互概念而非美术 | 独立网页入口 + 宿主 tab + 同一能力配置 |
| SQL 数据 | 制定显式导入 mapping，不直接改写旧库 | snapshot dry-run、冲突报告、备份恢复演练 |
| 测试 | 翻译关键语义案例，不机械复制 Java assertions | golden fixture + contract + fault injection 三层 |

### 最小端到端重写切片（仅建议，批准后实施）

用一个我们控制的示例业务系统验证“不是只有聊天框”：

1. 独立 AE Console 创建 project/agent，登记 `orders.lookup`（读）与 `orders.updateNote`（有限可恢复写）两个明确能力，发布版本。
2. 示例宿主新增 Agentic tab，链接对应 project 配置页；挂载助手、传可信页面上下文，服务端交换短时 scoped identity。
3. 用户问订单 → 模型提出工具调用 → policy 校验主体/范围/输入/版本 → adapter 执行 → 原系统仍校验订单权限 → 流式结果 + trace。
4. 写备注必须展示 exact effect/target/arguments，确认 token 绑定主体/参数 hash/revision/expiry；后台执行业务幂等键，超时不盲重试。
5. 人工中断、重复事件、浏览器刷新、服务重启、权限撤销、错误 model output、prompt injection、tenant/project 越权都进入验收。
6. 用 fake model/本地 fixture 完成可重复测试；未经批准不连真实企业系统、不使用真实凭据/收费模型、不公开部署。

不在首切片塞入：任意网页电脑操作、完整拖拽工作流画布、多智能体群体、全企业知识导入、A2A federation、代码执行 sandbox、所有手机/小程序 SDK。先通过一个真实的受控业务回路，再扩 adapter。

## 9. 验证状态与后续证据要求

已完成：固定官方源码、文件 hash 验证、主要真实调用链静态追踪、显式未支持范围定位、许可证/依赖声明初筛、迁移语义与最小切片整理。

未做：上游 build/test、容器启动、DB migration、真实 LLM、浏览器 live E2E、漏洞利用验证、性能/恢复压测、全依赖 SBOM/安全扫描。报告的风险均为源码审阅发现或设计推论，不是生产事故或可利用漏洞确认。

值得移植的现有测试：

- runtime `execution/checkpoint/WorkflowCheckpointCodecTest.java:21-88`：清理、graph drift、payload 篡改、大小。
- runtime `execution/RuntimeWorkflowResumeRecoveryPersistenceTest.java:86-137,301-302`：claimant 消失、不明结果、未提交 receipt、stale fencing、重复 key、并发 reconciler。
- runtime `supervisor/SupervisorToolPolicyServiceTest.java`：工具策略。
- model `runtime/OpenAiCompatibleRuntimeClientTest.java:28-172`：提前 EOF、finish_reason/DONE、usage tail timeout、单终态。
- knowledge `service/impl/KnowledgeRetrievalAuthorizationTest.java:67-94,224-284`：文件替换、撤销、rerank/model 前后再校验、数据库失败关闭。
- knowledge `pipeline/document/job/DocumentImportJobWorkerTest.java`、`service/impl/DocumentImportLeaseRecoveryTest.java`：导入与 lease 恢复。

实际运行及外部集成验证应放在用户审批后的独立实施阶段，不把研究成果包装成完成重构。

## 10. 快照摘要

补齐 Dockerfiles 后，实际下载 3,618 文件、29,167,274 字节。

- source-manifest.json SHA-256: `d997341cbb17d68a54025cf655325e9251f1a2e9e42ac67a58d029622edda1d6`
- tree.json SHA-256: `5397b0f62b030983ecaecc74555a6f44febd2b1703253c2b99c002c47f5e31c3`

## 11. 重要补充：源码驱动的 Skill/MCP 改造链路，上游已有多少？

用户进一步强调的“下载 Skill/MCP → 深读任意目标软件及业务流 → 定制改造计划 → 经批准修改、测试、可回退 → 最终 tab + 助手 + 能力 runtime”与上游部分设计高度一致。**不能把上游误写成只有手工 SDK 接入。**

### 已实现：供外部 Coding Agent 使用的受控接入任务包

- `reachai-control-service/src/main/resources/ai-assist/skills/reachai-onboarding/SKILL.md:3,10,35-70` 明确让 coding agent 先读目标仓库模块、Java/Spring 版本、controller/service、配置、身份、gateway、测试，再修改 Maven/config、网关、身份 broker、frontend；它是实际 source-aware 接入 Skill。
- `reachai-control-service/src/main/java/com/enterprise/ai/control/aiassist/ControlAiAssistSkillController.java:54-100` 从最新已发布 Skill version 提供 ZIP 下载、版本文件名和 SHA-256 header。
- `.../aiassist/ProjectOnboardingTaskProvider.java:88-133,250-264` 任务包含当前业务仓库及显式 frontend/gateway 的 scope、canonical steps、SDK artifact/checklist、必须先读取的 Skill ZIP/entrypoint。
- `.../aicoding/application/AiCodingTaskQueryService.java:244-275` 返回 endpoints、result JSON schema、示例、协议/验证 guide 与 required resources。
- `.../aicoding/api/AiCodingTaskProtocolController.java:32-124` 实际提供 context/heartbeat/events/questions/artifacts/verification REST API。Skill `:14-18` 区分一次性 activation→短时 task token 与长期 project key。

### 已实现：带来源验证的安装与适配模板

- onboarding `scripts/install-java-sdk.ps1:47-84` 下载精确 JAR/consumer POM、验证两者 SHA-256，再调用 Maven install-file。
- `scripts/install-embed-chat.mjs:181-196,272` 校验 tarball/本地副本 hash、写 artifact marker。
- 模板包括 Maven dependency、YAML、Java annotation、Angular page-action adapter、Nginx/Kong/Spring Cloud Gateway。
- `scripts/reachai-doctor.mjs:144,254-318,369,568-596` 有 static/runtime/e2e 模式，但部分静态检查是 regex/source/config heuristic，不是形式验证或全语言语义理解。

### 已实现：交付声明与平台观测分开

- `.../aicoding/domain/AiCodingDeliveryEvidence.java:5-29` 结构化收集 test 命令/状态/证据、browser URL/scenario/screenshot；声明本身不是最终 proof。
- `.../aicoding/application/AiCodingTaskDeliveryService.java:111-129` artifact canonical hash，并拒绝同 artifactKey 不同内容。
- `.../aiassist/ProjectOnboardingTaskProvider.java:241-247,267-315` CODE_READY/RUNTIME_READY/SDK_CALLBACK_READY/E2E_READY gates，后两者要求 callback、平台观测 session/message/reply。`AiCodingTaskDeliveryService.java:261-313` 完成前要求 ACCEPTANCE_READY 并复算。
- 注意 `.../aiassist/ControlSdkAccessReadinessCalculator.java:97-112` 的 CODE_READY 更多证明配置/凭据/artifact/实例记录，**不等于编译成功**。AE 应拆成 SourcePlanApproved、PatchApplied、BuildVerified、ContractVerified、RuntimeConnected、BrowserAccepted，避免一个绿色 readiness 状态掩盖缺失验证。

### 未实现：任意语言/框架的自动改造编译器

- `reachai-knowledge-service/src/main/java/com/enterprise/ai/controller/ScannerController.java:22-38` 原生 scanner 提供 OpenAPI 和 Spring MVC controller。
- `.../text/tooling/scanner/controller/ControllerAnnotationToolManifestScanner.java:12-20,72-99` 是 JavaParser class index/选定 Java 文件，无法解析时记录诊断跳过。
- `.../scanner/controller/ControllerHttpApiInventoryExtractor.java:80-90` 维护 source/filter scope 是否完整；`.../scanner/openapi/OpenApiHttpApiInventoryExtractor.java:728-744` 对 request/response/auth/header/side effect 的 canonical contract hash 很值得保留。
- `.../scanner/manifest/ToolSource.java:5-9` 来源基本是 scanner/location。AE 可升级为 file+symbol+line range+commit+content hash+confidence+observed/inferred/unknown，不把 AI 推断误当静态事实。

### 对 AE 全面计划的影响

AE 的新价值不是“首次加一个 Skill”，而是把既有接入 pack 变成语言中立、框架可插拔、带明确人工门槛的 transformation lifecycle：

1. Read-only discovery：框架/路由/身份/权限/数据流/业务副作用和源码证据；无法确定的结论列为 unknown。
2. Plan：能力地图、可安全暴露范围、tab/assistant 接入点、改动文件/依赖/权限/部署/迁移及回退计划，等待用户批准。
3. Approved patch：在受控 branch/worktree 生成有边界的 patch，不自动编辑生产库或部署；adapter-specific codemod 可以辅助，但不能把任意 framework 伪装成已支持。
4. Tests：项目原测试 + 新 contract/security tests + fake-model scenario + bootstrap/rollback/repeated-action 测试；保留真实命令和结果。
5. Runtime and browser acceptance：机器健康≠真实用户业务成功；确认 tab 跳转、身份传递、页面读写、确认交互、失败/恢复都可用。
6. Delivery：source evidence、diff、必要配置、版本化能力包、test evidence、已知限制与回退命令。Skill/MCP 是同一契约的分发/调用入口，不是绕过审批的授权源。

第一批框架的选择与哪些阶段允许自动执行，须在用户最终批准的计划中列明。跨 Web/移动 App/小程序应复用 backend capability contract，各平台提供自己的 UI/context/action bridge；无 SDK/API/源码授权时，只能报告缺口，不能承诺“任何软件都自动改好”。
