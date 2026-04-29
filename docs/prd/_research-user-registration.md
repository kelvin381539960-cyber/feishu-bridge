# 信息收集笔记：用户注册 / 开户与 KYC

> PRD 主题：`user-registration-prd.md`  
> 日期：2026-04-12  
> 流程：`prd-workflow` Phase 1

## 来源索引

| 来源类别 | 检查了什么 | 发现 |
|----------|-----------|------|
| 历史文档 | `docs/aix-phase2/solution-design/chapters/04-mvp-function.md` | E1 |
| 历史文档 | `docs/aix-phase2/solution-design/chapters/05-money-flows.md`（Flow 1） | E2 |
| 历史文档 | `docs/aix-phase2/solution-design/solution-design.md`（Flow 1 摘要） | E3 |
| 已有代码 | 本需求为产品定义，**不适用**（无 App / Platform 实现于本仓库） | — |
| 测试覆盖 | `test/` 无用户注册域 **不适用** | — |
| 项目规则 | `.cursor/rules`、`docs/cursor-architecture/prd-workflow.md` | 约束撰写结构 |
| 外部依赖 | KUN / AAI 接口细则 **未**在本仓库验证 | G1 |
| 变更记录 | Git 状态显示方案文档多处在演进中；以 `chapters/04`、`05` 为当前叙事主链 | E4 |

## 证据表

| ID | 类型 | 陈述 | 依据 |
|----|------|------|------|
| E1 | 事实 | MVP 用户侧包含开户与身份认证：Passport OCR、活体+人脸比对、POA 地址证明；链路为 AIX → KUN → AAI → KUN | `04-mvp-function.md` §4.1.A |
| E2 | 事实 | Flow 1 描述：用户经 App 提交开户审核；Platform 向 KUN 请求身份核验；证件/人脸/地址由 App 采集上传至 AAI；KUN 输出审核结论通知平台；通过后 Platform 联动 Ledger 开立用户账户；App 展示最终结果 | `05-money-flows.md` Flow 1 正文 + Mermaid |
| E3 | 事实 | 合并稿 `solution-design.md` 中 Flow 1 与 E2 叙事一致（Ledger 开立账户表述） | `solution-design.md` |
| E4 | 事实 | 存在历史版本章节（如 `05-money-flows-pre-v0.3.0-historical.md`）对「敏感数据是否经 Platform」有不同强调；**PRD 正文以当前 `05-money-flows.md` 为准**，历史差异记入开放问题 | 仓库内多版本文件并存 |
| I1 | 推断 | 「注册」在用户心智上常等于「手机号/邮箱建号」，在本项目边界内应显式包含 **KYC 完成后** 才视为注册完成、方可使用资金与卡相关能力 | 依赖 E1、E2 |
| A1 | 假设 | 账号标识（如内部 userId）在提交审核前即可创建，用于串联 KYC 会话；**待产品确认** | 无仓库内反证或证实 |
| G1 | 缺口 | KUN / AAI 的字段级接口、回调幂等、重试与终态码表需对接文档或联调后补齐 | 外部依赖 |

## 缺口记录（G）

| ID | 描述 | 对 PRD 影响 |
|----|------|----------------|
| G1 | 第三方身份核验接口与错误码、POA 支持国别/语言 | 验收标准中保留「以对接文档为准」的从句；里程碑标依赖 |

## 待确认项（流入 PRD §开放问题）

1. 敏感采集链路是否强制「App → AAI 直连、不经 Platform 后台」（历史文档曾强调）；与当前 `05-money-flows.md` 图示关系需架构/合规最终确认（E4）。
2. 注册未完成（KYC 中）时，App 允许访问的范围（仅资料填写 vs 部分只读功能）（A1）。
