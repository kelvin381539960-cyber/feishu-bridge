# Workflow Profiles

> Workflow Profile 用于根据任务类型选择合适的执行流程。
> 启动任务时，PM Agent 必须先判断 Task Type，再选择 Workflow Profile。

---

# Profile A：通用复杂任务

## 适用场景

- 不明确的大任务
- 多步骤任务
- 需要持续推进的任务
- 无法归类到其他 Profile 的任务

## 流程

1. Define：明确目标、边界、输出物
2. Plan：拆阶段、拆任务、分 Agent
3. Context：确定上下文包
4. Execute：逐步执行
5. Review：审核质量、冲突、漏项
6. Deliver：交付最终结果
7. Retrospective：复盘沉淀

---

# Profile B：文档生成任务

## 适用场景

- PRD
- 方案
- 周报
- 汇报
- 邮件
- 知识库文档
- 说明文档

## 流程

1. 明确文档目标
2. 明确读者和使用场景
3. 搭建文档结构
4. 装载上下文材料
5. 生成初稿
6. 审核准确性和完整性
7. 输出终版

## 常用 Agent

- PM Agent
- Writer Agent
- Review Agent
- Context Agent

---

# Profile C：调研分析任务

## 适用场景

- 行业调研
- 竞品分析
- 方案对比
- 技术选型
- 市场分析
- 用户研究

## 流程

1. 明确调研问题
2. 定义调研维度
3. 明确信息源
4. 收集资料
5. 交叉验证
6. 形成判断
7. 输出结论和建议

## 常用 Agent

- Research Agent
- Analysis Agent
- Review Agent
- Risk Agent

---

# Profile D：代码 / 技术任务

## 适用场景

- 代码分析
- Bug 排查
- 脚本生成
- 系统设计
- 接口设计
- 技术方案评审

## 流程

1. 明确问题现象 / 技术目标
2. 装载代码、日志、配置、环境信息
3. 定位原因或约束
4. 设计方案
5. 输出修改建议或代码
6. 审核风险
7. 给出验证步骤

## 常用 Agent

- Tech Agent
- Analysis Agent
- Builder Agent
- Review Agent
- Risk Agent

---

# Profile E：执行管理任务

## 适用场景

- 项目推进
- 上线计划
- 多人协作
- 任务排期
- 风险跟踪
- 周期性管理

## 流程

1. 明确目标
2. 拆任务
3. 定 Owner
4. 定优先级
5. 定节奏和里程碑
6. 跟踪风险
7. 输出推进表
8. 复盘结果

## 常用 Agent

- PM Agent
- Review Agent
- Risk Agent
- Writer Agent

---

# Profile F：知识库整理任务

## 适用场景

- 文档归档
- 知识库建设
- 原始材料整理
- 多文档合并
- 文档去重
- 规则沉淀

## 流程

1. 明确知识库目标和读者
2. 收集原始材料
3. 分类和去重
4. 提取稳定事实
5. 标记不确定项
6. 生成结构化文档
7. 审核冲突和缺口
8. 输出知识库索引

## 常用 Agent

- Context Agent
- Analysis Agent
- Writer Agent
- Review Agent

---

# Profile G：数据分析任务

## 适用场景

- 数据表分析
- 指标解释
- 漏斗分析
- 问题归因
- 数据口径梳理

## 流程

1. 明确分析问题
2. 明确数据来源和口径
3. 清洗和整理数据
4. 计算指标
5. 分析异常和趋势
6. 输出结论
7. 给出行动建议

## 常用 Agent

- Data Agent
- Analysis Agent
- Review Agent
- Writer Agent

---

# Profile 选择规则

如果一个任务同时匹配多个 Profile，按以下顺序判断：

1. 是否涉及代码 / 技术系统：优先 Profile D
2. 是否核心是数据：优先 Profile G
3. 是否核心是调研判断：优先 Profile C
4. 是否核心是文档产出：优先 Profile B
5. 是否核心是知识沉淀：优先 Profile F
6. 是否核心是推进管理：优先 Profile E
7. 其他复杂任务：使用 Profile A

如果无法判断，使用 Profile A，并在 Gap List 里记录任务类型不确定。
