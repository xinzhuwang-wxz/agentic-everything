# Agentic Everything

**让你现有的开发智能体，为已有产品加上专属 Agentic 能力。保留原技术栈、业务规则和权限。**

AE 是 MIT 开源改造工具，不是另一个通用 coding agent，也不是给所有软件套同一个聊天框。不需要 AE 官网、注册账户或 AE 服务 Key。你的开发智能体检查源码，提出一份集中的改造与验证方案；确认后在批准边界内自主实现、验证并交付，不把普通工程步骤逐项交回给你。

[开始体验](getting-started.md) · [示例与证据](examples.md) · [接入说明](integrating.md) · [English](../README.md)

## 三个真实开源改造项目

| 原始项目 / 固定版本 | 改造后的仓库 | Agent 集成目录 | 支持的受控能力 | 改造前 / 批准界面 / 证据 |
| --- | --- | --- | --- | --- |
| [reveal.js 6.0.2](https://github.com/hakimel/reveal.js/tree/75dff6f515d2d08df0c32cf2b7328b89425c6f25) | [reveal.js-agentic](https://github.com/xinzhuwang-wxz/reveal.js-agentic) | [`agentic/`](https://github.com/xinzhuwang-wxz/reveal.js-agentic/tree/main/agentic/) | 读取幻灯片；明确批准纯文本修改；SQLite 持久化内容与回执。 | [<img src="https://raw.githubusercontent.com/xinzhuwang-wxz/reveal.js-agentic/main/docs/assets/before.png" width="160" alt="Original host">](https://github.com/xinzhuwang-wxz/reveal.js-agentic/blob/main/docs/assets/before.png) [<img src="https://raw.githubusercontent.com/xinzhuwang-wxz/reveal.js-agentic/main/docs/assets/approval.png" width="160" alt="Governed approval">](https://github.com/xinzhuwang-wxz/reveal.js-agentic/blob/main/docs/assets/approval.png)<br>[窄屏](https://github.com/xinzhuwang-wxz/reveal.js-agentic/blob/main/docs/assets/mobile.png) · [验收证据](https://github.com/xinzhuwang-wxz/reveal.js-agentic/blob/main/docs/acceptance.json) |
| [linkding 1.47.0](https://github.com/sissbruecker/linkding/tree/24b5ad6cc9bde497b5d1b1e86aed5a2fb7d25c2f) | [linkding-agentic](https://github.com/xinzhuwang-wxz/linkding-agentic) | [`ae_linkding/`](https://github.com/xinzhuwang-wxz/linkding-agentic/tree/main/ae_linkding/) · [`agentic/`](https://github.com/xinzhuwang-wxz/linkding-agentic/tree/main/agentic/) | 沿用登录会话搜索书签；确认后修改标签，并重查所有权与配置。 | [<img src="https://raw.githubusercontent.com/xinzhuwang-wxz/linkding-agentic/main/docs/agentic-evidence/before.png" width="160" alt="Original host">](https://github.com/xinzhuwang-wxz/linkding-agentic/blob/main/docs/agentic-evidence/before.png) [<img src="https://raw.githubusercontent.com/xinzhuwang-wxz/linkding-agentic/main/docs/agentic-evidence/after-approval.png" width="160" alt="Governed approval">](https://github.com/xinzhuwang-wxz/linkding-agentic/blob/main/docs/agentic-evidence/after-approval.png)<br>[窄屏](https://github.com/xinzhuwang-wxz/linkding-agentic/blob/main/docs/agentic-evidence/after-narrow.png) · [验收证据](https://github.com/xinzhuwang-wxz/linkding-agentic/blob/main/docs/agentic-evidence/accepted-summary.json) |
| [Kanboard 1.2.56](https://github.com/kanboard/kanboard/tree/e197e71af4ff9f371b931ab0338b2b41827e6394) | [kanboard-agentic](https://github.com/xinzhuwang-wxz/kanboard-agentic) | [`plugins/AgenticEverything/`](https://github.com/xinzhuwang-wxz/kanboard-agentic/tree/agentic-showcase/plugins/AgenticEverything/) | 读取当前任务；按宿主项目权限确认负责人或状态修改。 | [<img src="https://raw.githubusercontent.com/xinzhuwang-wxz/kanboard-agentic/agentic-showcase/docs/agentic-evidence/screenshots/original-before.png" width="160" alt="Original host">](https://github.com/xinzhuwang-wxz/kanboard-agentic/blob/agentic-showcase/docs/agentic-evidence/screenshots/original-before.png) [<img src="https://raw.githubusercontent.com/xinzhuwang-wxz/kanboard-agentic/agentic-showcase/docs/agentic-evidence/screenshots/candidate-approval.png" width="160" alt="Governed approval">](https://github.com/xinzhuwang-wxz/kanboard-agentic/blob/agentic-showcase/docs/agentic-evidence/screenshots/candidate-approval.png)<br>[窄屏](https://github.com/xinzhuwang-wxz/kanboard-agentic/blob/agentic-showcase/docs/agentic-evidence/screenshots/candidate-narrow.png) · [验收证据](https://github.com/xinzhuwang-wxz/kanboard-agentic/blob/agentic-showcase/docs/agentic-evidence/delivery/manifest.json) |

每一行都保留原宿主，复用同一 AE 运行时、明确批准与宿主权限校验。已记录的调用者是确定性模拟，不是付费模型质量测试；验收仅覆盖固定上游与明确 profile，详见[范围及真实限制](verification/external-cases.md)。Kanboard 改造版本位于默认分支 `agentic-showcase`，原始 `main` 未改动。


## 当前可用范围

- 六个限定 recipe：React/TypeScript 工单、Python/SQLite 库存、Java/Spring Core 库存三个合成验收宿主，以及真实开源项目 reveal.js、linkding、Kanboard 的固定上游版本。均使用评估、计划、批准、改前基线、隔离修改、对拍和交付流程；保留宿主语言与业务权限。真实项目的[支持范围与验收](verification/external-cases.md)独立记录，不用合成 fixture 代替。
- 一套 TypeScript 内核、官方 Agents JS 循环、宿主权限与精确操作确认、回执核对；显式选择 PostgreSQL/DBOS 时，使用已单独验证的持久恢复路径。
- 可移动的日常悬浮助手与宿主后台 Agentic tab，共用能力、配置和运行真源。业务确认留在对话内；无界面项目不必强加聊天页面。
- 可运行的只读 MCP 开发工具；Java/Spring Core 的限定源码 recipe、宿主 adapter 与经过身份校验的 remote MCP 声明子集，不宣称任意 Java 项目、Spring Boot/MVC 或生产身份接入。
- 固定源码安装、doctor、并存升级与受保护卸载，以及 schema dry-run、备份恢复、版本化配置转移、限流和限定会话投影保留。
- 不调用模型的有限确定性业务流程：版本化定义、读取、分支、精确确认、终端写入与故障恢复，由同一 DBOS 调度，写操作不自动重试。
- 有界 DBOS automation、A2A 子集与移动桥合同实验。知识模块关闭；真实移动平台未验证。

所有已记录模型调用均为明确标注的模拟。第二 provider 证明的是实际 loopback HTTP 合同，不是付费模型效果、成本或生产可靠性。原始宿主、权限、浏览器和恢复证据分别说明范围，不以某个绿色 fixture 代表任意项目可上线。当前核心版本已在记录范围内通过验收，版本与证据见[验收状态](acceptance-status.md)，支持等级和责任见[支持矩阵](support-matrix.md)。

## 交给你的开发智能体

在 AE checkout 中告诉它：

> 阅读 skills/ae-adapt/SKILL.md 和 docs/getting-started.md，在工单 fixture 的临时副本上试用 AE。将固定 synthetic verification profile 纳入同一份方案，先给我看源码评估、拟修改内容、方案 hash、验证动作和边界。确认后完成批准内的改造、验证和交付，保留宿主技术栈、业务规则及回退路径，不部署、不调用付费 API、不改其他项目。

也可以在 Node 24 / npm 11 环境运行 `npm ci --ignore-scripts` 和 `npm run check`，再按[入门指南](getting-started.md)生成改造预览。可管理的固定版本安装使用[运维指南](operations.md)，不是假设已经发布的 npm 包。

当前 fixture 不是计划中的三个真实外部开源项目案例。核心验收已通过；这些独立案例仍待制作与验收，完成实际改造、原始基线、对拍、截图和许可保留，最后填写经核验的原仓库与改造仓库链接，不使用占位 URL。

[完整实施计划](../IMPLEMENTATION_PLAN.md) · [参与贡献](../CONTRIBUTING.md) · [安全边界](../SECURITY.md) · [许可证与来源](../NOTICE.md)
