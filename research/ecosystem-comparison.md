# Agentic Everything：可复用生态比较与选型建议

调研日期：2026-10-24。状态：批准前研究，不是实现或采购决定。

## 0. 结论先行

AE 的第一产品形态应是可下载的 Skill/MCP 驱动的软件改造工具链：读取客户自己的仓库，形成有证据的业务/权限/技术栈理解，生成定制 agent 化计划，经批准后做可逆改造并验证，交付宿主内的 Agentic 配置页、嵌入式助手和受控后端能力。宿主保留原技术栈、身份和权限体系；不是要求客户把应用迁移到 AE 平台。运行时接入层是改造后的产物之一，不是产品全貌。现成生态已经覆盖模型调用、聊天组件、图编排、持久执行和 MCP；真正不可直接买到的是某个宿主软件的业务语义、权限继承、动作契约和变更证据。

建议：

0. **改造工具链优先于运行时框架。** 先构建仓库事实清单、权限链追踪、能力清单和可审阅迁移计划；批准后再由栈专用 recipe 生成 patch。Skill 是工作流程，MCP 是受限工具边界，都不能单独保证“理解全部业务”。详见第 4 节。

1. **优先复用 UI 和协议，不重写通用聊天控件。** CopilotKit 与 assistant-ui 做一个同任务对照 PoC 后二选一。AG-UI 是可替换边界，不应被误当执行权限系统。
2. **只选择一个默认 agent runtime。** Python 路线重点比较 Pydantic AI、OpenAI Agents SDK；已有图编排需求才用 LangGraph。TypeScript 路线比较 Mastra 与 AI SDK。不能把这些全部串起来。
3. **持久执行单独决策。** 已有 Temporal 就沿用；轻型单服务可评估 DBOS；初期已有数据库的简明状态机也可以，但必须实现恢复/租约/审批原子消费。不能同时引入多个 durability owner。
4. **OpenAPI 自动生成只生成“待审核接入草稿”。** FastMCP 官方也明确建议针对任务整理工具，而不是把复杂 REST 全量镜像给模型。AE 应围绕业务能力而非 endpoint 数量收费/验收。
5. **HITL 不等于授权。** Pydantic AI 明确警告 UI adapter 收到的批准不构成安全边界；OpenAI Agents SDK 要求服务端管理待审批状态、认证审批者、校验权限并防重放。因此 AE 必须拥有独立 Action Gateway，不能把 SDK 的 approved=true 当权限凭证。
6. **国内可参考 Coze Studio、Dify、Eino、Spring AI Alibaba、Midscene、Taro，但不能一概称可商用嵌入。** 尤其 Dify 多租户限制、n8n fair-code、Mastra ee/、Phoenix ELv2 都影响 AE 产品化。
7. **浏览器/桌面自动化是最后一档连接器，不是默认核心。** 优先 SDK/业务 API；无 API 才考虑浏览器；UI 自动化不能兑现“所有软件零改造”“外部写操作 exactly once”。

主要证据：[FastMCP OpenAPI](https://gofastmcp.com/integrations/openapi)、[Pydantic approval 边界](https://pydantic.dev/docs/ai/tools-toolsets/deferred-tools/)、[Agents SDK 服务端审批](https://openai.github.io/openai-agents-python/human_in_the_loop/)、[AG-UI 定位](https://docs.ag-ui.com/introduction)。

## 1. 方法、证据等级和未做事项

- **D：官方文档审阅。** 读取功能、接口、示例、约束，不能据此声称生产可用或性能实测。
- **R：官方仓库审阅。** 读取 README、目录/示例入口、许可证说明；不是逐行全仓安全审计。
- **E：官方示例页面/示例代码静态检查。** 检查呈现的交互模式和接入代码，不发送模型请求，不运行 demo。
- **T：实际运行试验。** 本轮全部为“未做”。没有安装、执行第三方产品、创建账号、登录、输入密钥、付款、读取 cookie，也没有接触用户电脑、服务器或暂停中的系统。
- 以下“推荐、拒绝、成本、复杂度、适合 AE”是基于证据的工程判断，不是厂商性能承诺。没有虚构 benchmark、可用性 SLA 或成本数字。
- 覆盖 46 个不同项目/产品/标准：37 个运行时/集成生态，加 9 个源代码理解与改造工具。12 个运行时候选深入比较，并对新增改造层给出专门选型和验证方案。协议和产品分别计数，因为采购和集成决策不同；没有为了凑数加入无关模型或向量数据库。
- 当前主分支/文档会变；实施前必须锁定 release/commit、包版本、transitive licenses。本文未把浮动 main 当作可复现构建物。

## 2. 运行与集成生态全景：37 项及明确处置

处置含义：**复用候选**＝批准后做窄范围 PoC；**适配**＝接已有系统，不成为 AE 核心；**采购候选**＝满足客户条件时买服务；**借鉴**＝参考流程/交互，默认不引入；**暂不选**＝已有具体不匹配或风险。每一行的链接都是本轮访问过的一手来源。

### 2.1 嵌入 UI / 交互协议

| # | 项目 | 可贡献什么 | AE 处置 / 边界 | 证据 |
|---|---|---|---|---|
| 1 | CopilotKit | app context、前端工具、共享状态、审批和 agent UI | 复用候选；适合“助手操控当前业务页面”，宿主仍须限制能力 | [仓库](https://github.com/CopilotKit/CopilotKit)、[文档](https://docs.copilotkit.ai/) R/D/E |
| 2 | assistant-ui | 可组合聊天组件、custom runtime、表单助手 | 复用候选；适合品牌一致和已有前端状态管理；不是任务后端 | [仓库](https://github.com/assistant-ui/assistant-ui)、[示例](https://www.assistant-ui.com/examples) R/D/E |
| 3 | AG-UI | agent↔UI 事件及状态传输 | 复用候选协议；不解决用户认证、业务授权、外部写入幂等 | [规范概览](https://docs.ag-ui.com/introduction)、[仓库](https://github.com/ag-ui-protocol/ag-ui) R/D |
| 4 | Vercel AI SDK | TypeScript 模型/provider 与 UI streaming 开发基础 | TS 路线复用候选；不要再叠第二个同职能模型层 | [仓库](https://github.com/vercel/ai) R |
| 5 | A2UI | 受控声明式 generative UI | 借鉴/后期适配；首版用宿主审核过的固定组件，不开放任意代码 | [仓库](https://github.com/a2ui-project/a2ui) R |

### 2.2 Agent runtime 与持久执行

| # | 项目 | 可贡献什么 | AE 处置 / 边界 | 证据 |
|---|---|---|---|---|
| 6 | LangGraph | 显式图、检查点、interrupt/resume | 图式业务流程适配候选；不要仅为了聊天引入复杂图 | [仓库](https://github.com/langchain-ai/langgraph)、[interrupt](https://docs.langchain.com/oss/python/langgraph/interrupts) R/D |
| 7 | OpenAI Agents SDK | 简洁 agent/tool/handoff、审批运行状态 | Python 默认 runtime 候选之一；SDK 可用不代表完整多租户执行服务 | [仓库](https://github.com/openai/openai-agents-python)、[HITL](https://openai.github.io/openai-agents-python/human_in_the_loop/) R/D |
| 8 | Pydantic AI | 类型化依赖、输出、deferred tools、durable adapters | Python 默认 runtime 候选之一；授权必须在业务工具执行面 | [仓库](https://github.com/pydantic/pydantic-ai)、[deferred tools](https://pydantic.dev/docs/ai/tools-toolsets/deferred-tools/) R/D |
| 9 | Mastra | TS agent、workflow、开发调试与 HITL | TS 整合型候选；检查 ee/ 许可和 agent/workflow 双重恢复边界 | [仓库](https://github.com/mastra-ai/mastra)、[HITL](https://mastra.ai/docs/agents/human-in-the-loop) R/D |
| 10 | Eino | Go 原生 LLM 应用框架 | Go 宿主适配参考；不为了兼容 Go 强迫 AE 核心再跑一个 runtime | [仓库](https://github.com/cloudwego/eino) R |
| 11 | Spring AI Alibaba | Java/Spring agent 开发路径 | Java 企业宿主参考适配器；不是 Python/TS 核心的必需依赖 | [仓库](https://github.com/alibaba/spring-ai-alibaba) R |
| 12 | Temporal | 跨进程/长任务持久工作流 | 已有 Temporal 的客户优先复用；新小型部署需评估额外运维 | [仓库](https://github.com/temporalio/temporal)、[执行模型](https://docs.temporal.io/workflow-execution) R/D |
| 13 | DBOS | 数据库支撑的 workflow/step 恢复 | 轻量 durability 候选；不能以 checkpoint 推导外部 API exactly-once | [仓库](https://github.com/dbos-inc/dbos-transact-py)、[步骤](https://docs.dbos.dev/python/tutorials/step-tutorial) R/D |

### 2.3 现成 agent builder / 企业平台

| # | 项目 | 可贡献什么 | AE 处置 / 边界 | 证据 |
|---|---|---|---|---|
| 14 | Dify | 可视 workflow、RAG、模型管理、API 出口 | 借鉴产品流/适配现有部署；不默认 fork 为多租户 AE | [仓库](https://github.com/langgenius/dify)、[许可证](https://github.com/langgenius/dify/blob/main/LICENSE) R/D |
| 15 | Coze Studio | agent/app/workflow 资源管理、Chat SDK、中文生态 | 借鉴控制台与发布闭环；可作为外部 runtime 适配对象，不整套塞进宿主 | [仓库](https://github.com/coze-dev/coze-studio) R/D |
| 16 | n8n | 成熟业务连接器与可视自动化 | 接已有 n8n workflow 为受控能力；商业嵌入先核许可 | [仓库](https://github.com/n8n-io/n8n) R |
| 17 | Flowise | 历史可视 agent builder / chatflow 模式 | 暂不选新核心：本轮 README 已标 archived；只能看交互历史参考 | [仓库](https://github.com/FlowiseAI/Flowise)、[维护方讨论](https://github.com/FlowiseAI/Flowise/discussions/6727) R |
| 18 | Microsoft Copilot Studio | 企业低代码、连接器、发布与治理 | Microsoft-heavy 客户采购候选；不是可自由复制的 SDK 内核 | [官方概览](https://learn.microsoft.com/en-us/microsoft-copilot-studio/fundamentals-what-is-copilot-studio) D |
| 19 | Salesforce Agentforce | Salesforce 服务/CRM 场景的 agent 平台 | CRM 已在 Salesforce 时采购/适配；不为通用宿主引入 CRM 依赖 | [官方产品](https://www.salesforce.com/agentforce/) D；只看公开产品说明 |

### 2.4 能力接入、身份与安全

| # | 项目 | 可贡献什么 | AE 处置 / 边界 | 证据 |
|---|---|---|---|---|
| 20 | MCP | 标准工具/资源协议与 HTTP 授权规范 | 复用协议；在 AE Gateway 后接 MCP server，不直接信任所有工具 | [授权规范](https://modelcontextprotocol.io/specification/latest/basic/authorization) D |
| 21 | FastMCP | Python MCP server/client、OpenAPI 转换与路由筛选 | 复用生成/适配候选；生成候选工具后必须人工整理任务语义 | [仓库](https://github.com/PrefectHQ/fastmcp)、[OpenAPI](https://gofastmcp.com/integrations/openapi) R/D |
| 22 | Nango | 外部 SaaS 认证、同步、proxy/integration 平台 | 采购候选：减少连接器运维；需审数据驻留、令牌托管与客户隔离 | [官方产品](https://nango.dev/) D；覆盖数不作为验收依据 |
| 23 | Composio | 工具目录、托管认证、MCP session | 采购候选：针对已验收的几个 SaaS，不把全目录自动授权给 agent | [官方文档](https://docs.composio.dev/docs) D |
| 24 | OpenFGA | 细粒度关系授权 | 宿主已采用则直接调用；没有复杂关系权限时不额外建第二套身份真源 | [仓库](https://github.com/openfga/openfga) R |
| 25 | OPA | 通用 policy evaluation | 策略复杂时复用；业务审批事实与策略决策仍要单独持久记录 | [仓库](https://github.com/open-policy-agent/opa) R |
| 26 | Auth0 AI identity | 商业身份/委托访问方案 | Auth0 客户采购/接入候选；不强迫客户迁移 IdP | [官方方案](https://auth0.com/solutions/ship-ai-agents) D；未验证具体套餐 |

### 2.5 浏览器/电脑兜底、跨端、评测

| # | 项目 | 可贡献什么 | AE 处置 / 边界 | 证据 |
|---|---|---|---|---|
| 27 | Playwright | 确定性浏览器操作与回归测试 | 复用为测试/受控网页适配底层；不是自动理解全部软件的 agent | [仓库](https://github.com/microsoft/playwright) R |
| 28 | Stagehand | 自然语言网页操作/提取 SDK | 无 API 站点的试验候选；动作可靠性要按站点评测 | [仓库](https://github.com/browserbase/stagehand) R |
| 29 | Browser Use | Python 浏览器 agent、可选云服务 | 有限浏览器兜底候选；独立会话和权限，不导出用户 cookie | [仓库](https://github.com/browser-use/browser-use) R |
| 30 | UI-TARS Desktop | 多模态桌面 agent 交互范式 | 借鉴可见执行/暂停/接管；首版不分发通用桌面控制器 | [仓库](https://github.com/bytedance/UI-TARS-desktop) R |
| 31 | Midscene | 自然语言视觉 UI 测试/自动化 | 中文生态测试与 UI fallback 候选；不替代业务动作契约 | [仓库](https://github.com/web-infra-dev/midscene) R |
| 32 | Taro | React/Vue 多端和小程序基础 | 宿主使用 Taro 时适配；不是把 Web DOM SDK 原封运行在小程序 | [仓库](https://github.com/NervJS/taro) R |
| 33 | uni-app | Vue 多端/小程序、原生插件桥 | 宿主使用时做 bridge；区分 uni-app 与当前 uni-app x 分支及许可 | [仓库](https://github.com/dcloudio/uni-app) R |
| 34 | Langfuse | tracing、eval、dataset 和产品调试 | 首选观测候选之一，走标准导出；不把业务审计唯一副本放在观测平台 | [仓库](https://github.com/langfuse/langfuse)、[许可](https://github.com/langfuse/langfuse/blob/main/LICENSE) R/D/E |
| 35 | Phoenix | 观测与评测 | 可选自用/采购评估；当前 ELv2，不当作无条件 MIT 白标产品 | [仓库与许可说明](https://github.com/Arize-ai/phoenix) R |
| 36 | Promptfoo | 回归、红队、模型/提示对比 | 评测候选；外部模型和红队服务调用另核数据流，不能推断全离线 | [仓库](https://github.com/promptfoo/promptfoo) R |
| 37 | OpenTelemetry | 跨服务 trace / 语义约定 | 复用观测接口；版本化 GenAI 字段，不与某一家 dashboard 紧耦合 | [官方 GenAI 入口](https://opentelemetry.io/docs/specs/semconv/gen-ai/) D |

## 3. 十二个重点候选：到底复用哪一层

以下每项均未安装或实跑。许可证是本轮仓库表述，不替代具体版本的法律审查；商业服务、商标、第三方组件不自动继承 core 许可证。

### 3.1 CopilotKit：最贴近“现有软件加助手”的候选

- **证据**：仓库 MIT；官方文档区分聊天、shared state、HITL 和 frontend tools；读取了 frontend-tools 的 hook 示例与 demo/code 入口。当前文档也列多种前端/后端组合，但未逐个平台测试。
- **精确复用**：嵌入式 panel、结构化 tool rendering、当前页面显式 context、白名单 UI action；由 AE adapter 对接任务后端。
- **不复用为安全边界**：frontend tool 在浏览器运行，可接触页面环境。AE 只注册导航、选择、草稿编辑等能力；提交必须经过宿主 API/Gateway。不能照搬任何“可读 cookie”示例能力。
- **DX/视觉判断**：以现有项目/前端/后端/功能分步生成接入路径，值得借鉴；组件需要与宿主 theme、layout、错误态整合，不能只挂通用气泡。
- **待验收**：三条业务任务、断线恢复、页面切换 context 清理、重复点击审批、无权用户降级；和 assistant-ui 同一测试集二选一。
- [仓库](https://github.com/CopilotKit/CopilotKit) · [文档](https://docs.copilotkit.ai/) · [前端工具示例](https://docs.copilotkit.ai/frontend-tools)

### 3.2 assistant-ui：宿主设计一致性和自有状态更有吸引力

- **证据**：仓库 MIT，Assistant Cloud 是可选；文档给自有 runtime 四种接入路径。读取官方 form-demo 页面及呈现的 React 代码，未实际对话或提交表单。
- **精确复用**：聊天 primitives、侧栏、消息/附件/tool UI；已有 Redux/Zustand 等状态时研究 ExternalStoreRuntime，而非新建第二份应用状态。
- **有价值示例**：表单 hook 自动注册 set/submit/reset，提交/重置默认审批；示例排除密码、OTP、银行卡 autocomplete 字段。AE 可借鉴敏感字段默认不进 context，但仍需宿主显式字段 allowlist。
- **限制**：视觉审批不构成服务端授权；表单智能填写不是任意页面零接入。配置页和任务审计面仍需要 AE 自己设计。
- **待验收**：品牌主题、键盘/屏幕阅读器、中文长消息、工具卡片错误、审批失效、custom runtime 断线恢复。
- [仓库](https://github.com/assistant-ui/assistant-ui) · [自有 runtime](https://www.assistant-ui.com/docs/runtimes/custom/overview) · [表单示例](https://www.assistant-ui.com/examples/form-demo)

### 3.3 AG-UI：作为可替换连接契约，不是万能标准

- **证据**：仓库 MIT；官方说明区分 AG-UI（用户交互）、MCP（工具数据）和 A2A（agent 协作），并区分 A2UI 组件声明与 AG-UI 事件传输。
- **精确复用**：消息/工具事件/state 更新到 UI 的适配面。AE 保留自己的稳定 Run/Action/Approval 业务模型，再映射到协议。
- **不应推断**：协议列出的“today & upcoming”能力不等于任一 SDK、平台、后端适配器全部实现。首版不要依赖全部 multimodal/subagent 扩展。
- **待验收**：固定协议版本，定义未知事件行为、序号/游标恢复、取消语义、前端工具结果信任等级；无 AG-UI 的宿主也能接 REST+事件流。
- [仓库](https://github.com/ag-ui-protocol/ag-ui) · [协议概览](https://docs.ag-ui.com/introduction)

### 3.4 OpenAI Agents SDK：较轻 runtime，安全责任表达清楚

- **证据**：MIT；官方 HITL 文档给 needs-approval、RunState 序列化与恢复，强调只反序列化可信服务端快照。
- **精确复用**：模型/tool loop、结构化中断结果、trace hook；不把完整 RunState 放浏览器作为执行权票据。
- **必须补齐**：AE 认证 reviewer、按 tenant/user/run 授权、核验 pending IDs、原子消费审批，故障恢复先对账外部副作用。文档中的示例不是可部署 HTTP 审批服务。
- **选择理由**：功能边界较窄，适合把 AE 业务语义留在自有 Gateway；如依赖复杂图/长事务，不靠 SDK session 强行替代 durability。
- **待验收**：序列化跨版本、并发批准、拒绝/撤销、过期、换用户/租户、工具参数变更后的重新审批。
- [仓库](https://github.com/openai/openai-agents-python) · [HITL/服务端示例入口](https://openai.github.io/openai-agents-python/human_in_the_loop/)

### 3.5 Pydantic AI：类型契约和 Python 业务适配较强

- **证据**：MIT；deferred tools 区分待批准、外部执行；可在参数验证/上下文条件中请求批准。官方文档明确指出客户端提供的 approval/history 不是授权边界。
- **精确复用**：类型化输入输出/依赖、能力 handler、延期工具，映射 AE 自己的 pending action；durable engine 仅选一个。
- **必须补齐**：在真实业务执行函数校验宿主权限，不让客户端伪造历史或 tool approval；运行上下文不能由模型填 tenant/user。
- **DX 判断**：Python-heavy API 服务有利；对 TS-only 团队另引 Python 服务未必划算。丰富集成不是全部必装理由。
- **待验收**：恶意历史伪造、同一 toolCallId 重放、schema 变更、deferred result 注入、数据脱敏。
- [仓库](https://github.com/pydantic/pydantic-ai) · [deferred tools](https://pydantic.dev/docs/ai/tools-toolsets/deferred-tools/) · [durability](https://pydantic.dev/docs/ai/capabilities/durable_execution/overview/)

### 3.6 LangGraph：只在图和检查点真的有价值时选

- **证据**：MIT；官方 persistence 区分 thread checkpoint 和跨 thread store；RAM saver 重启丢失。interrupt 文档明确恢复会重跑节点，前置副作用必须幂等。
- **精确复用**：已知业务流程的图状态/中断；生产持久 checkpointer 和 AE run ID 映射。
- **限制**：thread_id 是定位标识，不是权限凭证。把审批前的发邮件/写入放在重跑节点内会导致重复；不能把 checkpoint 宣传为端到端 exactly-once。
- **DX 判断**：适合多分支、审阅、回退流程；简单助手用图增加调试概念成本。独立托管平台是另一个采购决定。
- **待验收**：进程在外部写完成而 checkpoint 未落盘时崩溃，审批节点重跑，子图恢复，checkpoint 数据保留策略。
- [仓库](https://github.com/langchain-ai/langgraph) · [持久化](https://docs.langchain.com/oss/python/langgraph/persistence) · [interrupt 注意事项](https://docs.langchain.com/oss/python/langgraph/interrupts)

### 3.7 Mastra：TS 一体化体验佳，但仔细分离批准和挂起

- **证据**：core/大部分 Apache-2.0，ee/ 为 Enterprise License。官方区分 execute 前审批与 execute 中 suspend；明确 suspend 后代码仍可能继续执行，应 return；默认 RAM store 不跨重启。
- **精确复用**：TS runtime/workflow/调试面作为一个整体候选，而非和其他 agent loop 同时使用。
- **限制**：agent 调用 workflow 后，两层的 resume 可能要协调；已见公开 issue 描述 out-of-band workflow resume 与 agent suspended run 的关联问题，未复现，不能认定所有版本都有此 bug。
- **DX 判断**：偏 TS 团队可降低工具分散；但企业 auth 组件许可不能从 core 的 Apache 标签推断。
- **待验收**：持久 store、审批重启恢复、拒绝、子 workflow out-of-band 恢复、串流 UI 最终状态一致。
- [仓库/许可证说明](https://github.com/mastra-ai/mastra) · [HITL](https://mastra.ai/docs/agents/human-in-the-loop) · [报告问题 #23714](https://github.com/mastra-ai/mastra/issues/23714)

### 3.8 DBOS：可作为更轻的持久执行候选

- **证据**：Python 仓库 MIT；workflow/step 文档说明从已完成步骤恢复、非确定操作包装 step、结果需可序列化、retry 可配置。
- **精确复用**：后台任务、暂停等待、队列/恢复机制；用自己的 ActionExecution 账本保存业务调用状态。
- **限制**：step 外执行不自动有 checkpoint/retry；step 和外部服务之间的事务不是同一数据库原子提交。对超时/未知结果先 query/reconcile，不盲重试。
- **DX 判断**：现有数据库/单服务团队值得评估；并不因为“轻量”就免除迁移、升级、备份、租户隔离和 worker 运维。
- **待验收**：杀 worker、重启、并发 resume、外部 API 模拟不确定成功、代码升级后的旧 run 恢复。
- [仓库](https://github.com/dbos-inc/dbos-transact-py) · [workflow](https://docs.dbos.dev/python/tutorials/workflow-tutorial) · [step](https://docs.dbos.dev/python/tutorials/step-tutorial)

### 3.9 Temporal：成熟耐久编排，但不是免费复杂度

- **证据**：server MIT；官方把 workflow 与 activity 分开，workflow 事件历史持久，activity 调度含重试。
- **精确复用**：客户已有的 workflow service、worker 和可观测性；审批作为受控消息进入 workflow，业务写在 activity。
- **限制**：workflow 的 effectively-once 描述不等价外部系统写入 exactly-once。API 本身的幂等键/去重/查询与补偿仍要 AE 适配器提供。
- **DX 判断**：长任务、多服务、已有运维体系适合；首个小型 SDK 产品不应仅因“企业级”引入整套新基础设施。
- **待验收**：取消不等于回滚、activity 超时后外部实际成功、版本升级、人工审批天级等待、继续执行时权限已撤销。
- [仓库](https://github.com/temporalio/temporal) · [workflow](https://docs.temporal.io/workflow-execution) · [activity](https://docs.temporal.io/activity-execution)

### 3.10 FastMCP：生成器是加速器，不是业务智能替代品

- **证据**：当前官方仓库转到 PrefectHQ/fastmcp，Apache-2.0；OpenAPI 文档提供 route mapping、排除和自定义。官方直接提醒 curated tools 通常优于复杂 API 的自动转换。
- **精确复用**：OpenAPI 导入、生成 schema、endpoint 候选清单与 MCP 适配；通过 allowlist 筛出少量业务能力。
- **不应默认生成**：管理员路由、批量删除、跨租户查询、任意 URL 请求、直接数据库写工具；HTTP method 不能单独决定风险级别。
- **DX 判断**：做“扫描→标注缺项→生成审核 diff→测试→发布”的接入向导，比宣称一键转换整个软件更可信。
- **待验收**：复杂 schema、pagination、鉴权传递、SSRF、OpenAPI 注释 prompt injection、危险 endpoint 排除、授权变更实时生效。
- [仓库](https://github.com/PrefectHQ/fastmcp) · [OpenAPI 文档](https://gofastmcp.com/integrations/openapi)

### 3.11 Coze Studio：值得借鉴产品闭环，不宜整套变成嵌入底座

- **证据**：Apache-2.0；Go 后端/React+TS 前端；README 有 agent/app/workflow、插件/知识库/数据库/prompt 资源及 Chat SDK。部署说明要求配置模型/插件服务。README 也明确提醒公开部署的 SSRF、注册、代码节点和部分横向越权风险。
- **精确借鉴**：能力资源卡、草稿/发布版本、测试面板、运行错误回看、中文文案；必要时作为客户已有 agent backend 对接。
- **限制**：不能把开源版和托管 Coze 功能/安全/渠道能力混为一谈，也不应由“支持 Chat SDK”推导“继承任何宿主 ACL”。
- **判断**：若客户真要完整低代码 agent builder，可单独评估；若只要软件中的 Agentic tab，整套平台过重。
- **待验收**：实际开源版 feature parity、租户与 resource ACL、发布审计、插件 token 边界、代码执行隔离。
- [仓库/功能/部署警告](https://github.com/coze-dev/coze-studio)

### 3.12 Dify：成熟产品参考，白标多租户需先解许可

- **证据**：官方介绍 workflow/RAG/model management/API 出口及云/自托管选项。仓库不是纯 Apache；LICENSE 对多租户环境要求书面授权，含前端标识条件。
- **精确借鉴**：Agentic 配置的测试→发布闭环、数据集/模型/运行日志的信息架构；客户已有 Dify 可经受控 API 适配。
- **限制**：不默认 fork 为 AE SaaS 内核，不把社区版自动等同企业 SSO/RBAC。许可和部署形态是先决条件，不等到写完产品再检查。
- **判断**：单客户内部部署与转售/多租户平台是不同决策；完整低代码平台和嵌入开发者 SDK 也不是同一产品。
- **待验收**：对应版本的嵌入/多租户许可、API 级用户身份/ACL、日志脱敏、发布回滚、工具执行审批。
- [仓库](https://github.com/langgenius/dify) · [LICENSE](https://github.com/langgenius/dify/blob/main/LICENSE)

## 4. 核心新增轴：读任意宿主仓库、定制改造，而非只嵌一个聊天 SDK

### 4.1 九个源代码理解/迁移候选

“支持很多语言”只能表示可以解析/编辑，不意味着自动掌握该软件的权限或业务。下面各项均 R/D 静态核验，未安装/执行。

| # | 项目 / 本轮许可核验 | 精确复用层 | 不足与处置 |
|---|---|---|---|
| 38 | [tree-sitter](https://github.com/tree-sitter/tree-sitter) / MIT | 多语言语法解析、符号/定义索引，容忍部分不完整代码 | 语法树不等于类型/调用图/业务规则；首版可经 ast-grep 间接使用，不必重复造解析器 |
| 39 | [ast-grep](https://github.com/ast-grep/ast-grep) / MIT | 结构化搜路由、middleware、API handler、危险调用；规则式局部改写 | [rewrite 文档](https://ast-grep.github.io/guide/rewrite-code.html)可作 recipe 基础；跨文件权限结论需进一步验证，不把匹配当证明 |
| 40 | [ts-morph](https://github.com/dsherret/ts-morph) / MIT | TS Compiler API wrapper；导入/符号/类型和源代码操纵 | [官方文档](https://ts-morph.com/)支持 AST 操作定位；优先 TS 宿主 recipe，不能覆盖 Vue SFC/动态运行行为全部语义 |
| 41 | [jscodeshift](https://github.com/facebook/jscodeshift) / MIT | JS/TS 批量 codemod，recast 风格保持、dry-run、变更统计 | 简单结构性 UI/provider 插入好用；复杂类型关系用 ts-morph，二者按 recipe 选，不全局叠加 |
| 42 | [OpenRewrite](https://github.com/openrewrite/rewrite) / 分层许可 | Java/Spring 等类型归属、保留格式的 LST 与成熟 recipe 模式 | [许可](https://docs.openrewrite.org/licensing/openrewrite-licensing)区分 Apache core/原始语言模块和部分新语言/recipe 的 MSAL；AE 商用不可直接包装后者 |
| 43 | [LibCST](https://github.com/Instagram/LibCST) / MIT | Python 保留注释/空白的 CST，metadata-aware codemod | [codemod 文档](https://libcst.readthedocs.io/en/latest/codemods.html)有多 pass/metadata 框架；用于 Python 适配插入，不声称完整动态调用分析 |
| 44 | [Semgrep](https://github.com/semgrep/semgrep) / CE 仓库 LGPL-2.1 | 改造前后策略扫描：绕过 auth、危险执行、硬编码 secret、敏感 API | 补充现有 CI 规则，不做“无告警即安全”宣告；规则包与商业 engine 分开核许可，避免直接复制收费规则 |
| 45 | [Aider](https://github.com/Aider-AI/aider) / Apache-2.0 | repo map + 相关文件检索、Git diff/回退的交互参考 | [repo map](https://aider.chat/docs/repomap.html)按依赖图和 token budget 选上下文；借鉴索引策略，不默认接管用户现有 coding agent |
| 46 | [OpenHands](https://github.com/OpenHands/OpenHands) / 当前主仓 MIT | 开发 agent 控制台/多后端执行编排参考 | 本轮 README 已呈现 Agent Canvas 与 ACP-compatible agents，不能照旧资料假设主仓就是旧 Python agent SDK；只借鉴/可选适配，版本与目标子包另审 |

### 4.2 精简的复用组合

默认不下载/捆绑另一个完整 coding agent。用户现有开发 agent 读取 AE Skill，调用 AE MCP 的只读检查、计划、受控 patch 和验证接口；客户可以替换执行 agent。Skill 文本负责流程，真正的路径边界、审批范围和执行权限由工具服务强制。

建议首批基础：

- **公共发现层：** 文件清单/manifest/路由和 AST 结构检索；优先 ast-grep，必要时使用其底层 tree-sitter。保存 path、symbol、commit/hash、证据片段及不确定性。
- **TS 宿主：** ts-morph 处理类型相关接线；jscodeshift 仅用于较简单、已有测试夹具的 JSX/provider/route 变换。每个 recipe 选择一种合适 transformer。
- **Python 宿主：** LibCST 改写；沿用宿主 FastAPI/Django 等鉴权和业务 service，不把业务复制到 TS。
- **Java 宿主：** 先评估明确 Apache 的 OpenRewrite core/Java 模块与自写 recipe；必须逐模块/recipe 核许可。官方当前列的新 JS/TS/Python/Go 等模块并非都可自由商用，不能“一套 OpenRewrite 覆盖所有栈”直接打包。
- **安全验证：** 客户已有测试/静态分析优先；需要时加定制 Semgrep 规则。不要把扫描器当运行时授权。
- **执行隔离：** 原有 coding harness 或受控工作树/容器；不默认将完整源码上传第三方 indexing SaaS。网络、安装、构建脚本执行需单独进入计划和权限边界。

这不是以 parser 替代 LLM，而是把 LLM 用于“解释、提出改造方案、补齐未知”，把可确定的代码定位/机械改写/验收交给可测试工具。

### 4.3 客户接入与使用流（建议产品设计，不声称现成实现）

1. **选择仓库和范围。** 客户安装 Skill/MCP 后指定 repo/workspace，先只读；尊重 ignore、敏感目录和未提交改动。给出哪些数据会发到模型、哪些留本地。
2. **架构与业务事实报告。** 找启动入口、页面路由、API、service、数据模型、tenant/user 来源、权限 middleware、字段/对象 ACL、审计、队列、测试。每一条“已确认”有文件/符号证据；动态/反射/远程权限标未知。
3. **列出可 agent 化的业务任务。** 例如“筛选订单”“草拟改价”“提交改价”，不把一个 CRUD endpoint 自动当一项用户能力；记录输入/输出、权限、审批、可逆性、幂等和错误语义。
4. **生成宿主专属迁移计划。** 明确要改哪些文件、使用原来哪套 UI 与 auth、会加哪些依赖/服务、为何需要、如何测试/回滚；缺关键权限事实则只交计划，不自动补造安全逻辑。
5. **批准精确变更范围。** 计划绑定 repo revision、recipe/version、文件范围、动作与数据流；后续仓库变更使计划失效或重验。批准计划不自动批准生产部署、外部写入测试或凭证扩权。
6. **分支/工作树内最小改造。** UI 添加宿主风格的 Agentic tab 和助手；API 调用宿主业务 service；把审批/Gateway 前置，而非新建一条绕过旧权限的后门。不得覆盖未提交用户工作。
7. **验证与交付。** 显示完整 diff、依赖/许可变化、测试真实结果、未测试项、截图/交互结果（批准后再做）、回滚方法。先关闭 feature flag；客户决定上线。
8. **迭代而非一次性魔法。** 软件升级后检查 adapter/recipe drift；生成新的 reviewable diff，不在后台静默改源码。

### 4.4 改造器真正的验收标准

| 维度 | 必测失败场景 | 成功定义 |
|---|---|---|
| 仓库理解 | monorepo、多前端、外部 auth、动态 route、无测试、混合语言 | 明确覆盖与未知；每个权限主张能追溯证据，不凭目录名猜 |
| 权限保持 | user A/B、tenant A/B、角色降权、字段遮蔽 | agent 与原业务路径同权；不能借服务账号扩大访问 |
| Patch 精度 | 已有 provider、重命名导入、重复执行 recipe、用户改过生成文件 | 不重复插入；冲突停止；最小 diff；生成标识不覆盖用户内容 |
| 可逆性 | 部分 apply、测试失败、仓库 revision 变化 | 可还原 AE 改动，不删除原工作；数据迁移另设回滚计划 |
| 安全输入 | README/注释中恶意指令、恶意 package scripts、软链接越界 | 仓库内容不授予权限；只读扫描不执行项目代码；计划显式列执行 |
| 验证诚实性 | build 需联网/密钥，测试依赖生产服务 | 报 blocked/not run；不把 typecheck pass 说成业务端到端通过 |
| 栈保持 | React、Vue、Java、Python、Taro 宿主 | 增量生成栈专用改造，不要求一律迁移到 Python/Next.js |

## 5. 运行产品形态、跨端和开发者体验

### 5.1 两类配置界面不要混淆

- **开发者侧改造控制面：** 仓库体检、事实证据、迁移计划、patch diff、测试、回滚、升级 drift。
- **改造后的宿主 Agentic tab：** 模型/运行方式、开放能力、权限/审批策略、上下文范围、预算、运行记录、发布版本。它面对宿主管理员，不应成为无边界的 prompt 文本框。
- **终端用户助手：** 在原工作流旁解释/查询/起草/确认/执行，显示当前处理的业务对象、预计影响、可取消阶段和执行结果链接；不展示内部推理链。

建议首版卡片不是“万能聊天”，而是任务建议、证据引用、草稿 diff、审批卡、运行进度、结果/失败修复。审批卡显示目标对象、字段变化、影响范围、金额/收件人等业务关键参数；执行前再校验权限与对象版本。

### 5.2 Web、移动、微信小程序不能用一个 DOM SDK 草率承诺

- Web SDK 先支持一种实际客户栈；对另一栈保留 headless protocol，不承诺所有 SDK 功能一致。
- React Native 可考察 CopilotKit/assistant-ui 当前 native 入口，但本轮只看文档，未验证 feature parity。
- Taro/uni-app 适合已有同类宿主的专用 bridge；不是让客户为 AE 重写整个应用。bridge 暴露有限导航/草稿/审批事件，而非任意 JS 执行。
- 小程序的网络、认证、WebView 消息、生命周期和平台审核需专项官方验证。本轮微信官方 web-view 页面无法读取，**因此未确认具体平台限制或可发布性**，不列为首版已支持。

### 5.3 文档/SDK 交付物清单

批准实施后，最小文档应包含：

1. “已有项目接入”流程，而不是只给全新 demo；输出宿主真实文件位置和为何选择这些位置。
2. 至少一套读取任务、一套安全写入（预览→审批→提交）、一套失败恢复；三套共用同一 Gateway。
3. Skill 与 MCP 工具参考：只读工具、plan 工具、apply 工具的权限和输出契约分别写清。
4. Capability Manifest 例子：业务用途、schema、权限 callback、风险、dry-run、幂等键、外部结果查询/对账、补偿限制。
5. 安全手册：prompt injection、租户隔离、客户端伪造、审批快照、敏感 context、日志脱敏、令牌托管。
6. 组件样式和 accessibility 指南；支持 loading/empty/error/denied/expired/disconnected/cancelled/unknown-outcome 全状态。
7. 迁移/卸载指南：feature flag、数据库迁移、旧 run 兼容、源码 diff 回滚、保留必要审计。
8. 支持矩阵：具体栈/版本/recipe 级别标 discovery-only、plan-only、patch-tested、end-to-end-tested，不只有“支持”。

## 6. 最小选型、采购触发和明确不做

### 6.1 推荐基线是可替换参考实现，不强迫客户换栈

- 改造层：现有 coding agent + AE Skill/MCP + 结构检索 + 按栈选用的 codemod + 验证/证据包。
- 宿主运行层：保留宿主 API/auth/services；没有 agent runtime 才选一个。Python 参考实现可先比较 OpenAI Agents SDK/Pydantic AI；TS-only 宿主优先比较 Mastra/AI SDK，不为了 AE 引入无必要新语言。
- UI：assistant-ui 与 CopilotKit 经同任务对照后选一个参考 UI；headless contract 允许其他栈实现。
- Durability：现有 Temporal 优先；新轻部署评估 DBOS 或明确边界的数据库状态机。不能既让 LangGraph、DBOS、Temporal 都拥有同一个 run 的恢复真源。
- 观测：OTel 导出，Langfuse/Phoenix 二选一或接客户既有平台；不可把监控日志当唯一不可抵赖审计。

### 6.2 何时买，而不是造

| 条件 | 候选 | 必须先核实 |
|---|---|---|
| 大量外部 SaaS OAuth/refresh token 运维成为瓶颈 | Nango 或 Composio | 数据去向、令牌隔离/撤销、权限范围、每个目标 API 的动作语义、费用与退出成本 |
| 客户已经深度 Microsoft / Salesforce | Copilot Studio / Agentforce | 现有许可证、渠道、身份继承、具体工具审批和 API 限制；不套用另一客户结论 |
| 已有 Dify / Coze / n8n 资产 | 适配既有 workflow/API | 谁执行、以谁身份、结果怎样对账、开源/托管版本差异 |
| 大型 Java 迁移需商业 recipes | Moderne/OpenRewrite 商业授权 | AE 分发/收费服务权利、按模块许可、源码数据边界 |
| 需要跨企业长期任务且不愿自运维 | 托管 durability/observability | region、数据保留、恢复承诺、日志敏感数据、预算；本轮未采购 |

### 6.3 明确拒绝的路线

- “只要贴一个 SDK，所有旧软件自动获得所有操作能力”。这忽略权限、业务语义和测试。
- “把 OpenAPI/MCP 全量工具给模型，靠系统提示词约束”。工具数量不是产品价值，schema 描述也不是授权。
- “模型生成 JSX/SQL/shell 直接在宿主执行”。首版只允许已审核组件和业务能力。
- “所有客户强制迁移到同一 runtime/前端”。AE 要改造已有软件，不是替换它。
- “凭 checkpoint 保证任何外部写入只执行一次”。必须有幂等/对账/unknown-outcome 状态。
- 未明确许可就 fork 多租户 Dify、嵌入 n8n 或商业包装 MSAL recipes。
- 把 Flowise 历史教程当作当前长期维护承诺，或把 OpenHands 历史主仓结构当现在 API。

## 7. 批准后的比较实验，而非现在开工

建议第一轮只批准一个代表性宿主仓库的隔离 PoC，并明确不接生产数据。实验顺序：

1. 用真实仓库但只读生成业务/权限证据图，客户审阅 5–10 条关键判断是否正确。
2. 对两个 UI 候选做相同三个任务的可用性比较，不做两套长期产品。
3. 对一个默认 runtime 验证所有审批/恢复安全测试；仅失败或不适配才启用备选。
4. 以栈专用 recipe 生成最小 patch，重跑 recipe 不产生重复插入；在已有用户改动下安全拒绝覆盖。
5. 模拟权限撤销、跨租户、伪造 tool result、双击审批、服务重启、外部请求结果不明；给出事件证据。
6. 输出差异、测试日志、截图、实际改动和可逆交付包；由用户决定下一阶段是否扩大栈支持。

**通过标准的方向**：不新增越权路径、无未经批准的副作用、不能重复消费审批、未知结果不会盲重试、原业务流程仍通过、改动可定位可回退。性能/成本目标需基于客户真实 SLO 和可接受模型预算再定，不在研究阶段编数字。

## 8. 限制、来源与时效说明

- 所有链接于 2026-10-24 访问。本文深审是文档/仓库/许可证/示例的静态审核，不是完整安全审计，也不是运行 benchmark。
- 静态检查过 assistant-ui form-demo 的交互说明和示例代码；CopilotKit frontend-tools 的代码/嵌入 demo 入口；Langfuse demo 的说明页。**没有**在 demo 中发消息、运行任务或测试后端效果，不用“体验过”描述这些页面阅读。
- 首次旧链接失败后，使用官方页面链接或仓库说明继续核验：FastMCP 仓库已重定向，Pydantic 文档路径已变，Microsoft docs 旧域名失败但 learn 页面正文可读。微信 web-view 页面未读到，不以推测补齐。
- 少数公开问题只作 PoC 测试线索，未复现不定性为普遍缺陷。仓库星数/营销覆盖数未作为可靠性评分。
- 采购价格、SLA、数据驻留、特定企业权限套餐没有实质核验，列为采购尽调项。没有要求账号或付费以凑齐调研。
- 实施前重新核验版本和许可，尤其 Mastra ee/、Dify、n8n、Langfuse ee/、Phoenix、OpenRewrite 各模块、uni-app 分支与附加组件；本文不是法律意见。

## 附录 A：后续补做的真实公开 Demo UX 取样

**时间与范围：2026-10-24 12:31–12:34 UTC。** 本附录是在前文静态研究完成后追加，因此前文“未运行/未发消息”的表述指前一阶段；本附录更新最新证据状态，不应再把整份报告概括成“完全没有试用”。使用的是 **dot 云端 Chrome**，不是用户 Mac 或服务器。只进入官方文档链接的免费公开 demo，无账号/登录/密钥/付款，无客户源码或个人资料输入。没有安装产品或运行本地依赖。这里的 **T-UX** 只代表有限公开 UI 操作及观察，不代表部署、性能、安全或可靠性实测。

### A.1 assistant-ui Form-Filling AI Copilot：实际点击并看到页面状态改变

入口：[官方示例页面](https://www.assistant-ui.com/examples/form-demo)。页面内官方嵌入的演示为 assistant-ui-form-demo.vercel.app。

实际做了：

1. 打开官方页面，等待 iframe 完成加载；看到左侧业务表单、右侧聊天，分隔条状态为 60，左右面板各有滚动区域。
2. 点击官方预设 **Fill out the form with sample data**，没有输入真实用户资料，也没有点击注册类建议。
3. 界面先显示 working 状态及 Stop generating 控件，随后表单六个字段出现演示生成的样例值，聊天出现折叠的 **6 tool calls**。
4. 点击展开工具组，确实看到六条 set_form_field 事件占位。检查了页面截图和无障碍树，确认是业务表单值发生变化，不只是助手声称完成。
5. **没有点击 Submit，没有提交报名，没有触发账户创建。** 没有请求执行真实世界动作。

可迁移到 AE 的具体设计：

- **任务面板和业务对象并排，效果可直接核对。** 不把所有结果藏在聊天气泡里。AE 改造后的助手应与正在处理的订单/表单/记录同屏，而不是跳到独立 chatbot。
- **用任务型建议代替空白聊天框。** 预置的“填写样例”让用户立即知道助手能做什么；AE 可提供“解释当前记录”“草拟修改”“检查缺项”，按当前用户权限筛选。
- **聚合低层 tool events，按需展开。** 六次字段操作不需要占据六条长聊天；但演示展开后仅显示重复工具名，信息量不足。AE 应改为“已改 6 个字段”，展开显示字段名、前后值与敏感字段遮蔽。
- **运行中可停止。** 本次看到停止控件，但未点击，所以不能声称已验证取消语义。AE 应明确区分“停止生成”和“已发出的写入无法取消”。
- **完成态需要业务摘要。** 本次可见的最终回复区主要是工具组，业务表单变化才是主要证据。AE 应额外提供“已填写草稿，尚未提交”这类自然语言状态，防止用户误以为写操作已完成。

未验证：实际审批弹窗、拒绝、提交、刷新恢复、并发、跨租户、敏感字段过滤的运行效果、服务端 ACL、移动布局、无障碍完整合规。不能从本次六字段填写推导这些能力已通过。

### A.2 CopilotKit Frontend Tools：实际执行固定 UI 示例并查看代码入口

入口：[Frontend Tools](https://docs.copilotkit.ai/frontend-tools)。官方 iframe 为 feature-viewer.copilotkit.ai 的 agentic_chat 示例。

实际做了：

1. 打开文档，等待嵌入 demo 加载，看到空聊天界面及 Change background / Generate sonnet 两个预设按钮。
2. 只点击 **Change background**。界面提交其固定演示提示，随后显示完成回复。滚动回 demo 顶部后，截图中看到演示容器顶缘的蓝紫渐变，并非只依据文字回复判断；没有操作用户浏览器设置。
3. 点击同区域的 **Demo → Code** 标签，实际出现 page.tsx、agent.py、agent.ts 文件标签和可读代码编辑区域。
4. 通过侧栏展开 Human-in-the-loop，再导航到 [Governed Action Approval UI](https://docs.copilotkit.ai/human-in-the-loop/governed-actions)。该页面本次只有说明/代码，没有执行审批的 live demo，因此这一部分仍是 D 级文档证据。

可迁移到 AE 的具体设计：

- **“运行效果→对应文件代码”紧邻。** AE 接入手册和生成报告应把结果预览、宿主文件 diff、前后端契约放在同一任务下，不让开发者在营销 demo 和仓库间找对应关系。
- **前后端栈明确标注。** 页面同时显示 frontend/backend 选择，Code 区按文件组织。AE 的迁移计划应显示实际检测到的宿主栈与具体文件，而不是通用“复制这段 React”说明。
- **UI 动作须可见。** 即使是换背景这种低风险示例，也应能在当前页面看到结果。AE 对真正业务动作必须提供业务对象版本或结果链接，不能仅信模型说“已完成”。
- **模板化审批卡值得参考，但不照搬为安全实现。** governed-actions 文档展示动作摘要、tool、reference、arguments 和 verdict；AE 仍要补服务端权限校验、有效期、签名/完整性、原子消费、参数变化失效、拒绝终止与未知结果对账。
- **文档导航应按能力组织，同时保持任务导向。** Frontend tools / shared state / HITL 分层清楚；AE 再加“读取、草拟、确认写入、恢复、卸载”的任务入口，避免用户必须先懂内部术语。

未验证：真实后端 provider、全部事件语义、版本稳定性、审批执行、失败恢复、跨框架 parity、免费 demo 的持续可用性。公开演示响应成功不等于生产 SLA 或安全验证。

### A.3 本轮对比的准确结论

| 对象 | 真正做过 | 证据等级 | 可以据此说什么 | 不能据此说什么 |
|---|---|---|---|---|
| assistant-ui form demo | 点击官方样例；确认六字段更新；展开事件组；截图检查 | T-UX（窄范围） | 表单+助手并排、建议按钮和工具组交互在此 demo 实际工作 | 审批/提交/安全/恢复/客户接入已验证 |
| CopilotKit frontend-tools | 点击固定换背景示例；查看可见回复/渐变；切换 Code 标签 | T-UX（窄范围） | UI action + demo/code 导航在此 demo 实际可用 | 任意宿主零接入、所有 framework 功能相同 |
| CopilotKit governed-actions | 侧栏导航到页面并阅读代码 | D + 浏览器导航 | 适合参考审批卡信息结构 | 实际批准/拒绝流程跑通 |

本轮足够支持设计取舍，不足以给两个 UI SDK 打综合性能分或宣布赢家。优先在批准后的同一宿主任务集上做并列 PoC，再决定默认实现。所有浏览器交互均在公开 demo 页面内结束，没有任何真实业务表单提交、凭证读取、代码安装或生产环境修改。
