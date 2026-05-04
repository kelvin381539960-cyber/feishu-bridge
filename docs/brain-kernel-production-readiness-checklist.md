# Brain Kernel Production Readiness Checklist

## 1. 文档目的

本文档用于 P9 阶段最终验收：确认 Brain Kernel + Harness + Long Memory + Workflow + Output + Compat 重构结果是否具备上线条件。

目标不是继续加功能，而是确认系统满足：

```text
可测试
可观测
可回滚
可降级
可上线
```

---

## 2. P9 验收总览

| 验收域 | 状态 | 通过标准 | 验证方式 |
|---|---|---|---|
| 全量测试 | Pending | `npm test` 全部通过 | 本地/CI 执行 |
| Replay Harness | Pending | P3 replay 仍通过，且未弱化断言 | `test/brain-replay-harness.test.js` |
| Contract Harness | Pending | 协议负例仍通过 | `test/brain-contracts.test.js` |
| Memory / Token | Pending | memory 不无界注入，token budget 生效 | memory/token tests |
| Workflow | Pending | research clarify/execute/end/fresh reset 行为不变 | research workflow tests |
| Output | Pending | doc export / usage / limit 行为不变 | output tests + replay |
| Compat / Planning | Pending | session/idempotency/gatewayRequest 不变 | compat/planning tests |
| Feature Flag | Pending | 新架构可开关，默认安全 | feature flag tests |
| Rollback | Pending | 可无代码回退到稳定路径 | env flag / config 验证 |
| Observability | Pending | 关键 stage/plugin 有 telemetry/log | telemetry 检查 |

---

## 3. 必须执行的测试命令

```bash
npm test
```

如仓库有更细命令，可补充：

```bash
node --test test/brain-replay-harness.test.js
node --test test/brain-contracts.test.js
node --test test/memory-router.test.js
node --test test/memory-budget-controller.test.js
node --test test/research-workflow-runner.test.js
node --test test/compat-adapter.test.js
node --test test/feature-flags.test.js
```

通过标准：

```text
0 failed
0 unexpected skipped
无外部真实副作用
无 flaky case
```

---

## 4. Replay Gate

必须确认以下行为仍被锁住：

| 场景 | 通过标准 |
|---|---|
| text basic | executor 只调用一次；ack/reply/persist/doc side effects 精确匹配 |
| prefix miss | 不执行 executor；不 ack；不 persist；只发 prefix hint |
| group @bot | 真实 mentions + botOpenId 判断；未 @bot 跳过，@bot 进入 pipeline |
| relay short-circuit | 不进入 executor/memory；reply 精确匹配 |
| reaction fallback | fake reactionResult=false 时 fallback text ack |
| doc export throw | reply 正常发送；logger 记录 exporter failure |
| memory injected | executor 收到受控 memory task；persist 标记 memoryInjected |

禁止通过方式：

```text
不得弱化断言
不得修改测试适配错误实现
不得 mock 掉真实关键判断
```

---

## 5. Contract Gate

必须确认以下协议被锁住：

| 协议 | 关键约束 |
|---|---|
| TaskEnvelope | source/channel/content/context/routing/trace 必填，routing.mode enum |
| Mention item | `id.open_id` 必填 |
| Attachment item | type enum |
| BrainContext v0 | flags 全字段 boolean |
| ExecutionPlan | runner.type enum；dispatch.task 非空；gatewayRequest 必须存在 |
| MemoryPack | records/summary/tokenEstimate/omitted 完整，negative memory 可表达 |
| TokenBudget | allocation < totalLimit；safetyMargin 合法 |

通过标准：

```text
happy path 通过
negative case 会 fail
生产 builder 输出能通过验证
```

---

## 6. Memory / Token Gate

必须确认：

1. Memory Router 不直接拼全部历史。
2. MemoryPack 有 `tokenEstimate` 和 `omitted`。
3. `maxTokens` / `maxRecords` 生效。
4. negative memory 优先于普通记忆。
5. 不同 user/chat/session/project 不串记忆。
6. 长内容进入 artifact，摘要进入 prompt。
7. memory failure 不影响主回复。

拒绝上线条件：

```text
memory 无预算限制
memory 直接全量拼接 prompt
persist 每轮无限写入无筛选
```

---

## 7. Workflow Gate

Research workflow 必须确认：

1. clarify-first 行为不变。
2. clarify → execute 行为不变。
3. 继续澄清仍 stay clarify。
4. 继续下一步/开始执行进入 execute。
5. 结束任务清理 state。
6. fresh reset 不串旧任务。
7. failed snapshot 保持。
8. 成功后清理 workflow state。
9. general/relay 不被 research 插件误伤。

拒绝上线条件：

```text
research state key / namespace / TTL 改变且无兼容测试
failed snapshot 丢失
fresh reset 误判导致串任务
```

---

## 8. Output Gate

必须确认：

1. doc export 插件复用原逻辑。
2. clarify 阶段不导出。
3. doc export failure 不影响 reply。
4. usage footer 只 append，不改变主 reply。
5. feishu limit 不破坏语义。
6. output plugin 执行顺序稳定：doc → usage → limit。
7. memory persist 使用正确 reply body。

拒绝上线条件：

```text
doc export timing 改变
reply 顺序改变
usage footer 污染主内容
limit plugin 截断关键信息且无 artifact fallback
```

---

## 9. Compat / Planning Gate

必须确认：

1. legacy / plugin-native runtime mode 输出不变。
2. sessionId 不变。
3. idempotencyKey 不变。
4. dispatch.task 不变。
5. gatewayRequest 不丢字段。
6. reasonCodes 保留。
7. prePlan 不触发执行。
8. finalPlan 是唯一执行依据。

拒绝上线条件：

```text
sessionId/idempotencyKey 被重新生成
executor opts 与 P3 replay 不一致
gatewayRequest 丢失或被重写
```

---

## 10. Feature Flag Gate

必须具备以下开关或等价配置：

| Flag | 目标 |
|---|---|
| brain kernel enable/disable | 允许回退主路径 |
| memory enable/disable | memory 出问题可关闭 |
| workflow plugin enable/disable | workflow 出问题可关闭 |
| output plugin enable/disable | doc/export/usage/limit 出问题可关闭 |
| compat/planning new mode enable/disable | planning 收敛可回退 |

默认策略：

```text
默认值必须安全
无法判断时默认走旧稳定行为
```

---

## 11. Rollback Gate

上线前必须确认：

1. 不需要改代码即可关闭新路径。
2. 回滚后 session/idempotency 不变。
3. 回滚后 replay 行为与旧路径一致。
4. 回滚不会破坏 memory store 或 workflow state。
5. 回滚路径有文档说明。

最低回滚说明模板：

```text
如新 Brain Kernel 路径异常：
1. 设置 <FLAG>=0
2. 重启 feishu-bridge 服务
3. 验证 text basic / prefix miss / group @bot / relay short-circuit
4. 检查 telemetry 中无新 plugin execution
```

---

## 12. Observability Gate

必须可观察：

| 指标 | 用途 |
|---|---|
| stage latency | 判断慢在哪个阶段 |
| workflow key | 判断执行路径 |
| memory token usage | 判断是否接近预算 |
| memory omitted count | 判断裁剪是否生效 |
| plugin execution | 判断 output/workflow 是否执行 |
| doc export error | 判断副作用失败 |
| planning mode | 判断 prePlan/finalPlan 路径 |
| rollback flag state | 判断当前运行模式 |

拒绝上线条件：

```text
关键失败只吞掉无日志
无法区分旧路径/新路径
无法定位慢阶段
```

---

## 13. 最终 Go / No-Go 判定

### Go 条件

```text
所有关键测试通过
Replay/Contract 未弱化
Feature Flag 可关闭新路径
Rollback 已验证
高风险模块有 telemetry/log
剩余 Gap 不影响主链路
```

### No-Go 条件

```text
全量测试失败且原因不明
session/idempotency 变更无兼容策略
memory 无 token budget
research 状态机有行为漂移
doc export 失败影响 reply
无法回滚
```

---

## 14. P9 输出模板

P9 完成时，台账应回填：

```text
测试结果：
- npm test：通过 / 失败 / 未执行
- replay：通过 / 失败 / 未执行
- contract：通过 / 失败 / 未执行

风险：
- R1 ...
- R2 ...

Gap：
- G1 ...

上线结论：
- Go / Conditional Go / No-Go

下一步建议：
- ...
```
