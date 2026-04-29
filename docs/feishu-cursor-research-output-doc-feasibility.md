# 飞书 → Cursor：调研结果自动落「飞书云文档」可行性调研

> 日期：2026-04-14  
> 范围：基于本仓库 **当前实现** + 飞书开放平台 **公开文档** 的可行性判断；不涉及具体 PRD/合同承诺。  
> 结论摘要：**技术上可行**；本仓库 **尚未实现**「创建 docx + 写入正文 + 回群链接」；落地需 **开放平台权限、文件夹策略、内容写入方案** 三件套。

**技术论证与实施方案（文件级、验收、灰度）**见：[feishu-cursor-research-doc-implementation-plan.md](./feishu-cursor-research-doc-implementation-plan.md)。

---

## 1. 背景与目标

**诉求**：从飞书发起「调研类」任务后，希望在飞书里得到**可点击打开的云文档**（而非仅在会话里看长文本）。

**本文回答**：

- 飞书开放平台是否支持？
- 与现有 `feishu-ws-cursor` / 租户 token 体系是否兼容？
- 本仓库要补哪些模块、主要风险是什么？

---

## 2. 本仓库现实基线（已具备 / 未具备）

### 2.1 已具备（与诉求强相关）

| 能力 | 位置 | 说明 |
|------|------|------|
| 租户 `tenant_access_token` | `lib/feishu-tenant.js` | 与飞书服务端 API 调用一致；`FEISHU_LARK_DOMAIN` 可切换 `open.feishu.cn` / `open.larksuite.com`。 |
| 读云文档 docx / wiki / sheet 等 | `lib/feishu-online-doc.js`、`fetchDocxRawContent` | 已走 `docx/v1`、`wiki/v2` 等；读路径成熟。 |
| 群聊发长文 | `sendFeishuChatReply` | `im/v1/messages`，`post` 类型，正文有较长上限（实现中 `slice(0, 60000)`），适合「摘要 + 链接」。 |
| 向已有表格追加行 | `scripts/feishu-sheet-append-row.js` | 适合**结构化台账**，不是「一篇可读调研报告」形态。 |

### 2.2 未具备（缺口）

- **创建** docx：`POST /docx/v1/documents` 等写接口在本仓库 **无封装、无调用链**。
- **写入正文**：需 `docx/v1/documents/:id/blocks` 批量创建块（或官方建议的「复制模板文件」路径）；本仓库当前以 **读 blocks** 为主，无「调研 Markdown → block」管线。
- **与助手任务收口的自动化挂钩**：pipeline 将助手文本回飞书；**未见**「输出落 docx」步骤（需新增脚本或 Node 模块并在 pipeline 中调用）。

---

## 3. 飞书开放平台侧：官方能力要点

### 3.1 创建 docx

- **接口**：`POST https://open.feishu.cn/open-apis/docx/v1/documents`（国际域名为 `open.larksuite.com` 同源路径）。  
- **能力边界**：**仅支持标题 + 可选文件夹**；**不支持创建时直接带全文**。正文需后续「创建块」或「复制文件」从模板生成。  
- **权限（任一即可）**：`docx:document`（创建及编辑新版文档）或 `docx:document:create`（创建新版文档）。  
- **鉴权**：支持 `tenant_access_token` 或 `user_access_token`（与本机机器人现状一致的是 **租户 token**）。  
- **`folder_token`**：可选；官方说明使用 `tenant_access_token` 时，**仅可指定应用自身创建的文件夹**（否则需用户授权等路径，见官方「如何选择 token」文档）。  
- **频控与并发**：单应用约 **3 次/秒**；同一文件夹下 **不宜并发创建**（错误码含 `folder locked` 等）。  

权威文档：[创建文档 - docx v1](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/create?lang=zh-CN)

### 3.2 带内容落地的典型两条路

| 路线 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| **A. 空文档 + 写块** | `POST /docx/v1/documents` → 多次 `blocks` 批量插入 | 不依赖人工模板文件 | Markdown/纯文本 → Block JSON **映射与分片**需开发；大文档要拆请求、注意块数量/深度上限。 |
| **B. 模板复制** | 先准备一篇格式固定的模板 docx → [复制文件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/copy) → 再替换正文块 | 版式稳定 | 需维护模板 token、复制后权限与挂载目录策略；仍可能要块级写入替换占位符。 |

官方在「创建文档」页明确提到模板 + 复制文件路径。

### 3.3 可见性与「点进去能看」

- 创建成功后响应中含 `document_id`，可拼 **`https://<企业域名>/docx/<document_id>`**（与现有读链接规则一致）。  
- **群成员能否打开**取决于：文档所在云空间/文件夹 ACL、是否全员可见、是否需单独加协作者。租户应用创建的文件夹若在企业策略下对普通成员不可见，会出现「机器人发了链接但部分人 403」。**需在贵司租户实测**，无法仅凭代码库推断。

---

## 4. 与现有飞书 Cursor 链路的集成方式（概念层）

典型挂载点（三选一或组合）：

1. **后处理**：检测「本轮为调研任务」且存在结构化输出文件（如约定路径的 `.md`）→ 调新建 docx + 写块 → stdout 或 sidecar 文件里带 URL → 现有回飞书逻辑拼进回复。  
2. **Node 侧**（`feishu-ws-cursor.js` / pipeline）：在收到 Cursor 子进程结束事件后，若环境变量 `FEISHU_EXPORT_RESEARCH_DOC=1` 等开关打开，则调用新模块 `lib/feishu-docx-create.js` 再 `sendFeishuChatReply`。  
3. **仅人工/半自动**：Cursor 输出到仓库 `docs/_research-*.md`，运维用独立 cron 同步到飞书——不改主链路，可行性高但体验弱。

**推荐讨论顺序**：先定 **1 或 2** 谁维护成本更低（你们更熟 Python 还是 Node、谁已有重试/日志规范）。

---

## 5. 权限与配置清单（落地前必须对齐）

在飞书开发者后台对 **当前 WS 机器人所用应用** 检查或新增：

- [ ] `docx:document` 或 `docx:document:create`（创建）  
- [ ] 写块所需权限（以控制台实际列出的 **编辑文档/块** 相关 scope 为准，需与「仅只读 doc」区分）  
- [ ] 若指定 `folder_token`：应用是否已创建该文件夹、或是否改用 **用户 user_access_token**（会引入 OAuth 与白板服务类似的授权成本，见 `docs/feishu-whiteboard-service.md` 模式）  
- [ ] 云空间「应用可用容量」或企业策略是否允许机器人创建文件  

**说明**：本仓库 `feishu-tenant.js` 注释已提到读 docx 需只读类权限；**写**权限通常与读 **分开申请**，不能假设「能读就能建」。

---

## 6. 风险与限制（现实向）

| 风险 | 说明 | 缓解思路 |
|------|------|----------|
| 权限/文件夹 | `1770040 no folder permission`、`1770032 forbidden` | 固定使用应用自建 `folder_token`；或走用户授权写指定目录。 |
| 频控与大包体 | 3 QPS、块数/深度/单次 raw 限制 | 正文分片、指数退避；极大调研先摘要进 doc、全文放附件或 Git。 |
| 格式损失 | Markdown 标题、表格、代码块与 docx block 非一一对应 | 产品接受「纯文本 + 一级标题」MVP；或模板路线控制版式。 |
| 安全与合规 | 调研内容进入企业云文档留存 | 与现有「群聊可见」策略对齐；敏感任务加开关或黑名单。 |

---

## 7. 工作量量级（粗估，非报价）

| 阶段 | 内容 | 量级（经验值） |
|------|------|----------------|
| M0 | 控制台开权限 + 手工 curl 创建空 doc + 手拼链接发群 | 0.5～1 人日（运维+开发） |
| M1 | 仓库内封装「创建空 doc + 写一段纯文本」+ 环境变量 + 回群一条链接 | 约 2～5 人日（含错误处理与日志） |
| M2 | Markdown/结构化报告 → 分块写入 + 失败重试 + 与 pipeline 挂钩 | 约 1～2 周（视格式复杂度） |
| M3 | 模板复制、目录规范、权限矩阵、观测与告警 | 视企业规范追加 |

---

## 8. 建议在贵司环境做的最小验证（Go/No-Go）

1. 用当前 `FEISHU_APP_ID` + secret 换 `tenant_access_token`，**仅调用** `POST /docx/v1/documents`（不传 `folder_token` 先测根目录行为，以官方返回为准）。  
2. 若成功：对返回 `document_id` 拼 URL，在飞书客户端打开，确认 **机器人所在租户成员** 默认可见性是否符合预期。  
3. 再测传入 **`folder_token`（应用自建文件夹）** 是否稳定，避免与个人「我的空间」策略冲突。  

若第 1 步即失败，优先排查 **scope 与应用类型**，而不是先写桥接代码。

---

## 9. 参考链接

- [创建文档 docx v1](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/create?lang=zh-CN)  
- [文档概述 docx v1](https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/docx-overview?lang=zh-CN)  
- [Drive 复制文件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/copy)（模板路线）  

---

## 10. 结论

| 问题 | 结论 |
|------|------|
| 飞书是否支持「新建云文档 + 可分享链接」？ | **支持**；官方提供创建接口，正文需后续写入或模板复制。 |
| 与本仓库 token/域名/发消息能力是否兼容？ | **兼容**；复用 `tenant_access_token` 与 `getFeishuApiBase()` 即可扩展。 |
| 本仓库现状能否「开箱即用」？ | **不能**；需新增写 docx 能力与任务收口挂钩，并完成开放平台权限与文件夹策略。 |
| 建议下一步 | 先做 **§8 最小验证** 定 Go/No-Go，再选 **路线 A 或 B** 定 MVP 范围。 |
