# Agentic Everything

**让你现有的开发智能体，为已有产品加上专属 Agentic 能力。保留原技术栈、业务规则和权限。**

AE 不是另一个通用 coding agent，也不是给所有软件套同一个聊天框。它为你已经使用的开发智能体提供改造方法和工具：检查源码 → 提出针对性方案 → 审阅批准 → 隔离修改 → 验证与回退。

[开始体验](getting-started.md) · [首个示例](examples.md) · [接入说明](integrating.md) · [English](../README.md)

## 现在可以试什么

首条路径从一个原本没有 Agent 的 React/TypeScript 工单页开始。AE 的确定性 recipe 识别这个明确的源码结构，预览改动，经批准后在独立 Git worktree 中加入宿主挂载组件，不改原业务函数。运行面通过现有业务函数读工单；写操作先显示预览、暂停等候确认，再校验宿主权限和版本，并返回执行回执。

当前有 Skill、CLI、契约、改造器、受治理运行时、loopback API、嵌入组件和独立 Console。模型路径明确标注为模拟。MCP transport、任意项目自动理解、其他技术栈 recipe、真实身份接入和 PostgreSQL/DBOS 生产持久化尚未完成资格验证，不能据此上线或处理客户数据。

## 交给你的开发智能体

在本地 AE checkout 中告诉它：

> 阅读 skills/ae-adapt/SKILL.md 和 docs/getting-started.md，在工单 fixture 的临时副本上试用 AE。先给我看源码评估、实际 diff、方案 hash 和未验证项，经批准后再改动。保留宿主技术栈和业务规则，不部署、不调用付费 API、不改其他项目。

也可以在 Node 24 / npm 11 环境运行 `npm ci --ignore-scripts` 和 `npm run check`，再按[入门指南](getting-started.md)生成第一份改造预览。

AE 是一个原生、独立的产品，核心使用 TypeScript；宿主保留自己的技术栈。Java、Python、Go、PHP、.NET 等不同宿主需要分别实现 recipe/adapter、测试与确认兼容范围。

[完整实施计划](../IMPLEMENTATION_PLAN.md) · [参与贡献](../CONTRIBUTING.md) · [安全边界](../SECURITY.md) · [许可证与来源](../NOTICE.md)
