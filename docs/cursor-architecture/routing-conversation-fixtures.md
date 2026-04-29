# Routing Conversation Fixtures

> Agent 1（Routing QA）增强交付物。  
> 目的：补足单轮样本之外的“多轮对话污染 / 上下文漂移”验证，确认**入口定向规则**（含 `task-dispatcher.mdc` 若启用）在已有对话上下文下仍能保持正确首跳分类。  
> 使用边界：只验证**最新一轮用户意图**对首跳路由的影响，不验证 workflow 内部执行深度。

## 1. 设计原则

- 以**最后一轮用户请求**为主判断 `task_type`
- 前文上下文只作为补充信号，不得反客为主
- 若最后一轮显式改变任务形态，应立即切换到对应分类
- 若最后一轮仍然模糊，则保留在 `generic`

## 2. 多轮样本

| ID | 上下文摘要 | 最后一轮用户请求 | 预期 `task_type` | 预期目标 | 验证重点 |
|----|------------|------------------|------------------|----------|----------|
| CTX-01 | 前文一直在讨论架构和 workflow 设计 | 那 Mermaid 里的 flowchart 和 sequenceDiagram 到底差别是什么？ | `quick_answer` | direct answer | 长上下文下不误送 workflow |
| CTX-02 | 前文先讨论了现有代码实现和模块边界 | 好，代码先别动，直接给我这块功能的 PRD 初稿。 | `prd` | `prd-workflow` | 代码上下文不应压过 PRD 意图 |
| CTX-03 | 前文已经在写 PRD 结构 | 先不要写 PRD，先帮我把问题空间收敛一下。 | `generic` | `generic-workflow` | 明确降级为定性/收敛任务 |
| CTX-04 | 前文在排查一个测试失败 | 顺便解释一下 TTL 是什么，用一句话。 | `quick_answer` | direct answer | 代码上下文中保留单轮问答能力 |
| CTX-05 | 前文在做技术方案调研 | 别再比较了，直接把脚本改掉并补测试。 | `code` | `generic-workflow` | research 上下文切回 code |
| CTX-06 | 前文在修 bug 和调试日志 | 先停一下，调研下业内怎么做会话记忆。 | `research` | `generic-workflow` | code 上下文切回 research |
| CTX-07 | 前文在讨论是否写 PRD 还是先做研究 | 你来决定该研究、写文档还是改代码，先帮我推进。 | `generic` | `generic-workflow` | 刻意模糊，保持兜底 |
| CTX-08 | 前文读了现有模块和接口 | 现在根据你看到的代码，写需求说明，不需要实现。 | `prd` | `prd-workflow` | “读代码后写需求”仍属 PRD |
| CTX-09 | 前文在讨论数据库索引和 SQL 性能 | 先别改库，比较一下两种优化路线的优缺点。 | `research` | `generic-workflow` | code 语境下的方案分析 |
| CTX-10 | 前文在做高风险部署方案分析 | 结论我不要了，直接告诉我 502 一般代表什么。 | `quick_answer` | direct answer | 高风险上下文也不能污染简单问答 |
| CTX-11 | 前文在做 generic 收敛和任务分工 | 最终还是你来写一版功能规格草案吧。 | `prd` | `prd-workflow` | generic 上下文切入 PRD |
| CTX-12 | 前文在讨论产品需求和验收标准 | 先别写文档，直接落代码实现。 | `code` | `generic-workflow` | PRD 上下文切入 code |

## 3. 最低验收标准

- 多轮样本不少于 10 条
- 至少覆盖以下漂移方向：
  - `context-heavy -> quick_answer`
  - `code -> prd`
  - `prd -> generic`
  - `research -> code`
  - `generic -> prd`
  - `prd -> code`
- 所有失败样本必须回填到 `architecture-validation-report.md`

## 4. 使用规则

- 若单轮 fixtures 通过而多轮 fixtures 失败，优先判定为“上下文污染风险”
- 后续规则改动时，必须同时回归：
  - `routing-fixtures.md`
  - `routing-conversation-fixtures.md`
