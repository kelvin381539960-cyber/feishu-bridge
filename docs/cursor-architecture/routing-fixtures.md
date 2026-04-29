# Routing Fixtures

> Agent 1（Routing QA）交付物。  
> 目的：为**入口定向规则**建立稳定、可复用的路由样本集（含 `~/.cursor/rules/task-dispatcher.mdc` 中的 PRD/Generic/quick 分流与 PRD 强制首跳），作为端到端验收与回归测试的统一输入源。  
> 基准版本：`docs/cursor-architecture/README.md`（§3.1）+ `~/.cursor/rules/task-dispatcher.mdc`（若启用）+ **本仓库** `.cursor/rules/prd-workflow.mdc` + `~/.cursor/skills/generic-workflow/SKILL.md`（及可选 `~/.cursor/skills/prd-workflow/SKILL.md`）

## 1. 使用范围

- 覆盖 `prd`、`quick_answer`、`code`、`research`、`generic` 五类 `task_type`
- 覆盖高置信、低置信、边界混合、误路由易发场景
- 只验证**派发层**是否正确分类与路由
- 不在本文件里验证 workflow 内部 Phase 行为

## 2. 评判原则

- 先按用户显式意图判断，不按实现难度反推
- `prd` 与 `generic` 的边界，以“用户是否要求产出 PRD/规格/需求文档”为主
- `quick_answer` 仅适用于单轮、低上下文、无需进入 workflow 的事实/解释/定义问题
- `code` 只要用户要求写代码、修 bug、改配置、测试、部署、脚本，即优先命中
- `research` 只要主任务是调研、比较、分析、外部信息归纳，即优先命中
- 混合、模糊、或未命中以上规则时归入 `generic`

## 3. 样本集

| ID | 用户任务样本 | 预期 `task_type` | 预期目标 | 置信度 | 路由原因 |
|----|---------------|------------------|----------|--------|----------|
| PRD-01 | 帮我写一个“飞书提醒机器人”的 PRD，包含目标用户、核心流程、验收标准。 | `prd` | `prd-workflow` | high | 明确要求 PRD 交付物 |
| PRD-02 | 给“批量导入商户”功能写需求文档和功能规格。 | `prd` | `prd-workflow` | high | 明确是需求文档/功能规格 |
| PRD-03 | 把“消息去重”方案整理成产品方案，面向产品和研发评审。 | `prd` | `prd-workflow` | high | 明确是产品方案 |
| PRD-04 | 输出一个支付失败重试机制的 PRFAQ/PRD 初稿。 | `prd` | `prd-workflow` | medium | 交付物是 PRD 类文档 |
| PRD-05 | 先读现有代码，再写“会话记忆”的产品需求说明。 | `prd` | `prd-workflow` | medium | 读代码只是辅助，最终交付仍是 PRD |
| QA-01 | 什么是 MCP？一句话解释。 | `quick_answer` | direct answer | high | 单轮定义解释 |
| QA-02 | `git rebase` 和 `git merge` 有什么区别？ | `quick_answer` | direct answer | high | 单轮事实/解释 |
| QA-03 | Mermaid 里 flowchart 和 sequenceDiagram 差别是什么？ | `quick_answer` | direct answer | high | 单轮定义比较 |
| QA-04 | PDPA 是哪个国家的隐私法？ | `quick_answer` | direct answer | high | 单轮事实问答 |
| QA-05 | 这个错误码 502 一般代表什么？ | `quick_answer` | direct answer | medium | 常识性解释，无需 workflow |
| CODE-01 | 修一下 `feishu-cursor-route` 的单元测试失败。 | `code` | `generic-workflow` | high | 明确要求修代码/测试 |
| CODE-02 | 在 `lib/feishu-session-memory.js` 里补一个 TTL 过期逻辑。 | `code` | `generic-workflow` | high | 明确要求实现代码 |
| CODE-03 | 帮我重构这个解析器，把分支判断拆到独立模块。 | `code` | `generic-workflow` | high | 明确要求重构 |
| CODE-04 | 给这个仓库补一个 `npm run lint:cursor` 的脚本。 | `code` | `generic-workflow` | high | 明确要求改脚本/配置 |
| CODE-05 | 把腾讯云部署脚本里的环境变量加载顺序修正一下。 | `code` | `generic-workflow` | high | 明确要求改部署脚本 |
| CODE-06 | 看下为什么服务启动报错，并直接修掉。 | `code` | `generic-workflow` | high | 调试 + 修复，本质是代码任务 |
| CODE-07 | 把这段伪代码落成 Node.js 实现并补测试。 | `code` | `generic-workflow` | high | 明确要求实现代码 |
| CODE-08 | 优化这个查询，必要时改 SQL 和索引。 | `code` | `generic-workflow` | medium | 明确要求实施修改 |
| RES-01 | 调研一下 Cursor 的多 Agent 编排最佳实践，整理成对比表。 | `research` | `generic-workflow` | high | 主要任务是外部调研与比较 |
| RES-02 | 比较 Feishu webhook 和 bot 回调两种方案的优缺点。 | `research` | `generic-workflow` | high | 方案比较型调研 |
| RES-03 | 帮我分析为什么当前架构更适合 Git 原生上下文管理。 | `research` | `generic-workflow` | medium | 以分析和总结为主 |
| RES-04 | 调研一下 Lighthouse 和 CVM 在轻量运维场景下的差异。 | `research` | `generic-workflow` | high | 外部信息比较 |
| RES-05 | 看下业内怎么做任务派发器的路由评测。 | `research` | `generic-workflow` | high | 研究评测方法 |
| RES-06 | 总结一下这套架构和 AutoGen、OpenHands 的差异。 | `research` | `generic-workflow` | medium | 研究分析类交付 |
| GEN-01 | 帮我梳理一下这套 Cursor 架构还有哪些缺口。 | `generic` | `generic-workflow` | medium | 混合判断与建议，不是纯研究也不是 PRD |
| GEN-02 | 先看架构，再帮我安排 3 个 agent 的任务分工。 | `generic` | `generic-workflow` | medium | 组织/执行设计，不是单纯问答 |
| GEN-03 | 这个需求有点乱，你先帮我收敛一下，别急着写 PRD。 | `generic` | `generic-workflow` | medium | 模糊、混合、需要先定性 |
| GEN-04 | 读一遍项目，再告诉我下一阶段最值得做的 3 件事。 | `generic` | `generic-workflow` | medium | 需要综合分析与判断 |
| GEN-05 | 帮我处理这个任务，你来决定是研究、写文档还是改代码。 | `generic` | `generic-workflow` | low | 用户刻意保持模糊，需 flow 内判定 |
| GEN-06 | 这次不要直接实现，先帮我拆解问题和推进顺序。 | `generic` | `generic-workflow` | medium | 以任务编排为主，未明确进入 PRD/研究/代码 |

## 4. 边界判例

### 4.1 `prd` vs `generic`

| 场景 | 预期 | 原因 |
|------|------|------|
| “先看代码，再写 PRD” | `prd` | 代码阅读只是辅助，不改变最终交付形态 |
| “先帮我收敛问题，不急着写 PRD” | `generic` | 用户明确要求先做定性，不进入 PRD 交付 |
| “写一个功能规格草案，供评审” | `prd` | 明确是规格文档 |

### 4.2 `quick_answer` vs `research`

| 场景 | 预期 | 原因 |
|------|------|------|
| “MCP 是什么？” | `quick_answer` | 单轮定义问题 |
| “调研 MCP 在企业内网场景的最佳实践” | `research` | 需要外部信息与综合分析 |
| “为什么我们的 MCP 设计这么做？” | `research` | 需要结合上下文和分析，不是单轮定义 |

### 4.3 `code` vs `research`

| 场景 | 预期 | 原因 |
|------|------|------|
| “分析测试为什么挂了，并直接修掉” | `code` | 目标是修复，不是单纯分析 |
| “总结这个模块为什么容易出错” | `research` | 目标是解释和分析，不要求改动 |
| “比较两种实现方案，最后再建议一个” | `research` | 主任务是方案比较，不是直接实施 |

## 5. 最低验收标准

- 五类 `task_type` 都有样本，且每类不少于 5 个
- 至少 6 个边界样本，覆盖 `prd/generic`、`quick_answer/research`、`code/research`
- 每个样本必须写清楚 `routing_reason`
- 所有样本必须能被映射到 `e2e-test-matrix.md`
- 如果后续新增 `code-workflow` 或 `research-workflow`，仅更新“预期目标”列，不重写样本语义

## 6. 维护规则

- 新增规则或 workflow 后，先补样本再改入口定向规则（含 `task-dispatcher.mdc`）
- 任何误路由缺陷修复，必须回填至少 1 条 fixture
- 若某样本长期低置信，保留并标注为“边界样本”，不要简单删除
