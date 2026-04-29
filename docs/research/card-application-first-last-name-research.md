# 各应用申卡流程是否要求填写 First Name 与 Last Name

> 调研日期：2026-04-14 | 作者：Cursor Agent

## 澄清假设与待确认问题

**关键假设**

- 「申卡」指通过 App 或网页订购/申请**支付卡**（含虚拟/实体、借记/贷记、加密平台联名卡）；不含纯线下纸质申请表的全集字段。
- 「是否要求填写 first name 与 last name」区分两层：**(A)** 用户是否在界面看到**两个独立输入框**且标签为 First name / Last name（或等价「名」「姓」分栏）；**(B)** 合规上是否必须提供可与证件比对的**法定姓名**（可能为单行「全名」或证件 OCR 回填后确认）。本报告对 (A)(B) 分别标注。
- 同一品牌在不同国家/产品线、App 版本下字段可能不同；下表为**公开帮助文档与行业常见实践**归纳，**以当地当前版本实测为准**。
- 用户若已完成开户 KYC，「申卡步骤」可能不再出现空白姓名框，仅确认卡面印刷名或地址——此时 (A) 常为「否（该步不填）」，但账户侧仍已存在结构化姓名。

**待用户补充可提升精度的信息（不等待答复，已按上列假设继续成文）**

- 目标市场是否限定为美国、欧盟、英国、东南亚或中国境内？
- 卡片类型是否限定为信用卡、借记卡、预付卡或加密资产关联卡中的某一类？
- 是否需要包含企业卡、员工卡或联名卡申请？
- 评估口径是否将「账户已 KYC、申卡阶段仅点确认」视为「不要求填写」？

## 1. 背景与定义

### 1.1 核心概念

- **法定姓名（Legal name）**：须与政府签发的身份证件一致，用于 KYC、征信、制裁筛查；与昵称、App 内「显示名」不同。
- **First name / Last name 分栏**：常见于英美表单，将 given name 与 family name 分开展示，便于与北美信用局字段、传统核心系统及卡面凸字截断策略对齐。
- **全名单行（Full legal name）**：单字段采集完整姓名，由系统在后端拆分或整存；利于护照「姓名行」逐字对照，减少跨文化误分栏。
- **卡面印刷名（Name on card）**：受磁条/芯片/凸字长度限制，可能与证件全名略有差异；**申请/订购卡时**仍以可核验的法定姓名为准，部分产品允许在合规范围内微调卡面缩写。

### 1.2 历史沿革

- **卡组与传统银行**：北美发卡长期沿用「名、中间名、姓、后缀」多字段，与纸质申请表及征信档案结构一致。
- **移动互联网与 OCR**：近十年 onboarding 普遍加入证件拍照与 OCR，姓名常以「从证件回填 + 用户确认」出现，用户主观感受的「是否要手填 first/last」与**是否在前序步骤已采集**强相关。
- **挑战银行与加密平台**：在 PSD2、各地电子货币/支付牌照下仍须完整身份，但前端趋向步骤合并；部分产品在开户阶段完成姓名，**订购实体卡时不再重复两个空框**。
- **东亚与多语言市场**：中文语境常见「姓名」整体或「姓/名」两格（语义上未必对应英文 first/last）；跨境用户常遇护照英文行与分栏顺序一致性提示。

## 2. 核心机制 / 工作原理

本节从合规、产品与核验三条线说明「要不要分两格填名」背后的机制。

### 2.1 合规层：为什么几乎总是要「姓名」，而不只是「要不要分两格」

- **KYC/AML**：姓名与证件号、出生日期、地址等组合用于身份识别与可疑交易监测；字段个数是产品选择，**不是**「可不采集姓或名」的依据。
- **制裁与欺诈名单**：姓名规范化后与外部库比对；无论分栏或全名，后端通常收敛为规范化后的逻辑实体。
- **支付网络与发卡行规则**：持卡人数据需满足卡组与发卡行对持卡人标识域的定义；卡面字符长度限制影响**展示**，不豁免申请时的法定姓名采集。

### 2.2 产品层：分栏与全名的工程与体验权衡

- **数据建模**：分栏便于与北美征信接口字段对齐；全名单栏需可靠拆分策略或并行保留「原始全名」以防信息丢失。
- **错误类型**：分栏易误放中间名、双姓只填一栏；全名单栏易与护照行顺序混淆；均需与证件对照的文案与校验。
- **渐进式披露**：先少字段后补全时，用户可能在**后续步骤**才看到名/姓分栏，导致「申卡第一步是否要求 first/last」的答案与完整流程不一致。

### 2.3 核验层：OCR、账户已有 KYC 对界面形态的影响

- **证件扫描回填**：用户可能从未空着填写 first/last，而是编辑系统解析结果；结论应记录「是否出现可编辑分栏」而非仅看首屏。
- **账户已有 KYC**：加密交易所、电子钱包用户加订借记卡时，姓名多在开户阶段已锁定，申卡页可能仅确认**卡面印刷名**或不再展示姓名输入。
- **与信用局匹配**：美国等市场要求申报姓名与局方档案一致；若档案为分栏存储，发卡端仍依赖用户申报 + 证件核验闭环。

## 3. 主流方案 / 实现对比

### 3.1 代表性 App / 机构：是否「分两格」与法定姓名要求

下表依据**公开帮助文档、支持文章及可核对的官方说明**整理；**界面标签**可能因语言/地区变化，「是否两格」指常见英文区或官方描述的交互形态。

| 产品 / 方向 | 申卡或开户阶段是否常见 **First + Last 两个独立输入框** (A) | 是否须提供与证件一致的 **法定姓名** (B) | 补充说明（公开信息要点） |
|-------------|-------------------------------------------------------------|------------------------------------------|---------------------------|
| **Coinbase**（含借记卡与账户） | **常见为是**：官方创建账户/身份说明要求 **First Name、Last Name** 与证件一致；无姓氏时 Last Name 填 `-` 等指引 | **是** | [Create a Coinbase account](https://help.coinbase.com/en/coinbase/getting-started/getting-started-with-coinbase/create-a-coinbase-account)、身份核验 troubleshooting 对姓名字段有明确说明 |
| **Crypto.com**（App KYC / 账户验证） | **常见为是**：账户验证类文章列出须填写 **First and Last name** 等与证件一致 | **是** | [Account verification](https://help.crypto.com/en/articles/3510992-account-verification)、[KYC verification](https://help.crypto.com/en/articles/1972921-all-about-kyc-verification) |
| **Binance**（含 Card 前置 KYC） | **KYC 阶段为是**：教程类公开内容描述须填 **first name, last name** 等；订卡时常为在已有 KYC 上确认 | **是** | 卡申请教程描述在 KYC 信息基础上订购、部分流程可选卡面显示方式（社区/教程来源，以 App 为准） |
| **Wise**（含 Wise Card） | **账户侧为是**：验证说明要求网站填写与证件一致；卡面 **first and last name** 须与账户一致，有字符长度等规则 | **是** | [How does Wise verify my identity](https://wise.com/help/articles/2949801/how-does-wise-verify-my-identity)、[Change name on Wise card](https://wise.com/help/articles/2977976/how-can-i-change-my-name-on-my-wise-card) |
| **Revolut** | **因地区/改版而异**：官方列「姓名」为开户必填；帮助中心强调与证件一致及卡面拉丁字符、长度 | **是** | [Required personal data](https://help.revolut.com/en-US/help/profile-and-plan/security-and-personal-data/personal-data-queries/what-personal-data-do-i-need-to-submit-to-use-revolut/)、身份验证须与账户名一致 |
| **N26** | **开户流程常见为分栏式姓名采集**（与邮箱、出生日期等并列）；须与后续证件核验一致 | **是** | 第三方开户指南与官方「开户/验证身份」流程描述（以 EU 区 App 为准） |
| **Monzo** | **不一定标成英文 First/Last**：强调**法定名与证件一致**；另有 **preferred name** 与法定名分离 | **是** | [Opening account](https://monzo.com/help/opening-an-account/how-to-open-a-Monzo-Personal-Account)、社区讨论法定名与首选名 |
| **PayPal**（个人户 + Debit Card 等） | **开户常见为是**：官方列开户需 **first and last name** 等；借记卡依赖已验证账户身份 | **是** | [What information is required to open a Personal PayPal account](https://www.paypal.com/us/cshelp/article/what-information-is-required-to-open-a-personal-paypal-account%E2%80%AF-help328) |
| **Apple Card** | **申请路径处理法定姓名结构**（与证件、身份核验一致）；未必以「两个空框」为唯一形态，但须满足与证件、SSN 等一致性质检 | **是** | [Application evaluated](https://support.apple.com/en-us/102585)、[Verify identity](https://support.apple.com/en-us/109312) |
| **美国大型银行线上信用卡（如 Chase 类）** | **常见多姓名相关字段**（名、中间名/首字母、姓、后缀等） | **是** | 面向消费者的申请教育材料强调 **full legal name** 与政府证件一致（如 Chase 信用卡申请基础知识文章） |
| **中国境内银行 App 信用卡** | **常见中文「姓名」+ 部分产品要求拼音/英文分栏**；标签未必写 First/Last | **是** | 实名制与身份证一致；跨境/双币产品可能增加英文姓名栏 |
| **支付宝 / 微信等绑外卡** | **多为「持卡人姓名」单行**，与发卡行预留一致 | **是（绑卡侧）** | 强调与卡片登记一致，非美式申卡多字段形态 |

**综合结论（针对本题）**

- **(B) 法定姓名**：几乎所有合规发卡路径都要求用户提供可与证件比对的姓名；**不存在**「完全不填名与姓」的正规申卡流程。
- **(A) First/Last 两格**：在**美国金融科技、全球化英文 UI、多家加密交易所**中非常普遍；**欧洲数字银行**常见「法定名与证件一致」步骤，标签可能是本地化「名/姓」或全名；**已完成 KYC 后仅加订卡**时，**(A) 在申卡屏可能为「否（不重复填写）」**。

## 4. 优劣势与适用场景

### 4.1 分栏（First / Last）的优势与局限

- **优势**：与北美征信、传统核心系统及运营报表字段对齐；对「单 given name + 单 family name」用户路径清晰。
- **局限**：多姓、连字符、无姓文化、长姓名易被误拆分；需包容性校验与说明文案（如无姓氏时的占位规则，见 Coinbase 官方 `-` 指引）。
- **适用**：主服务美国市场、沿用银行传统线上申请表的产品线。

### 4.2 全名一栏或证件驱动回填的优势与局限

- **优势**：减少文化偏见与误分栏；与护照 MRZ/姓名行对照更直观。
- **局限**：下游若强依赖分栏，需可靠拆分或双轨存储；客服与对账展示策略须统一。
- **适用**：跨境用户多、证件类型多样的新银行或全球化产品。

### 4.3 「申卡屏不再分栏、账户内已存在姓名」的变体

- **优势**：减少重复输入，订购实体卡时仅确认卡面名或邮寄信息。
- **局限**：账户姓名错误可能晚至拒付或邮寄失败才暴露；修改法定名常需重新验证。
- **适用**：已完成强 KYC 的加密钱包、综合金融 App 内嵌申卡（用户感知上易误判为「申卡不要填名」）。

## 5. 现实案例 / 生产落地

### 5.1 Coinbase：明确的 First / Last 字段与无姓氏例外

- 官方文档要求姓名与证件一致，并对**仅单一法定名**的用户规定 Last Name 字段填 `-` 等操作，说明产品层**强制两分栏**且需覆盖边缘姓名文化。
- Coinbase Card 依附同一账户身份，申卡阶段往往不再重复采集，但**账户创建时已完成两分栏**。
- 对调研「是否要求填写 first/last」若仅看「点申卡那一屏」，易低估为「否」；若以「开立可申卡账户」为准，则为「是」。

### 5.2 Wise：验证与卡面 first/last 对齐

- Wise 说明卡上印制的姓名与账户中的 **first and last name** 须一致，并存在字符长度与非拉丁字符转写规则，体现**结构化姓名**贯穿发卡。
- 身份验证要求用户在网站/App 填写的姓名与证件一致，属于**强 (B)**。
- 国际化用户需注意卡面缩写与证件全名的关系，属于生产环境常见客服话题。

### 5.3 Revolut / Monzo：法定名、卡面规则与「首选名」

- Revolut 将「姓名」列为创建账户所需个人数据之一，并强调与证件核验一致；卡面有字符与截断相关说明，内部仍按可拆分逻辑生成卡面。
- Monzo 区分**法定名（与证件一致）**与 **preferred name**（显示称呼），申卡借记仍以法定名为准。
- 说明「是否两格」在 UI 上可能弱化为「与证件一致」的一步，但数据上仍对应可核验的个人标识。

### 5.4 中国超级 App 绑卡 vs 境外申卡分栏

- 支付宝、微信等**绑卡**路径强调**持卡人姓名与银行预留一致**，通常为单行，不同于境外信用卡多字段申请。
- 境内银行 App 信用卡申请以身份证与监管实名制为核心，英文 first/last 标签不一定出现。
- 对比可见：**同一用户**在境内绑卡与境外 App 申卡，对「名/姓分栏」的感知差异极大，调研需标明场景。

## 6. 趋势与建议

### 6.1 趋势

- **证件 OCR + 用户确认**降低纯手填分栏错误，弱化「是否分两格」的绝对意义，强化「与证件一致」。
- **全球化产品**倾向包容性更强的法定全名或证件驱动回填，后端再规范化。
- **监管科技**推动姓名与多源名单匹配，前端字段进一步让位于核验结果与风控策略。

### 6.2 对产品设计者的建议

- 主用户群在美国且对接传统征信时，**保留分栏并支持中间名、后缀**通常最稳妥。
- 用户国籍多样时，优先考虑**法定全名 + 明确「与护照/身份证逐字一致」提示**，后端安全拆分或保留原始全名；为无姓氏、长姓名提供**官方级**占位与截断规则说明。
- 若申卡前已完成 KYC，在 UI 上明确「姓名已于验证身份时提供」，避免用户误解为「不需要姓名」。

### 6.3 对调研读者的建议

记录三类信息再下结论：**(1) 字段英文/中文标签**，**(2) 是否允许单行法定名**，**(3) 姓名是否由证件 OCR 预填仅可编辑**。三者组合才能准确回答「是否要求用户填写 first/last」。

## 参考资料

- Coinbase Help: [Create a Coinbase account](https://help.coinbase.com/en/coinbase/getting-started/getting-started-with-coinbase/create-a-coinbase-account)、[Identity verification troubleshooting](https://help.coinbase.com/coinbase/managing-my-account/verify-my-identity/verification-link-issues)
- Crypto.com Help: [Account verification](https://help.crypto.com/en/articles/3510992-account-verification)、[All About: KYC verification](https://help.crypto.com/en/articles/1972921-all-about-kyc-verification)
- Wise Help: [How does Wise verify my identity?](https://wise.com/help/articles/2949801/how-does-wise-verify-my-identity)、[How can I change my name on my Wise card?](https://wise.com/help/articles/2977976/how-can-i-change-my-name-on-my-wise-card)
- Revolut Help: [What personal data do I need to submit to use Revolut?](https://help.revolut.com/en-US/help/profile-and-plan/security-and-personal-data/personal-data-queries/what-personal-data-do-i-need-to-submit-to-use-revolut/)、[How do I verify my identity?](https://help.revolut.com/en-US/help/profile-and-plan/profile-plan/verifying-identity/how-do-i-verify-my-identity/)
- PayPal Help: [What information is required to open a Personal PayPal account?](https://www.paypal.com/us/cshelp/article/what-information-is-required-to-open-a-personal-paypal-account%E2%80%AF-help328)
- Apple Support: [How your Apple Card application is evaluated](https://support.apple.com/en-us/102585)、[Verify your identity for Apple Card or Apple Cash](https://support.apple.com/en-us/109312)
- Monzo Help: [How to open a Monzo Personal Account](https://monzo.com/help/opening-an-account/how-to-open-a-Monzo-Personal-Account)
- Chase: [Everything to know when applying for a credit card online](https://www.chase.com/personal/credit-cards/education/basics/everything-to-know-when-applying-for-credit-card-online)（全文名与证件一致相关表述）
- 包容性姓名输入设计讨论：Riri Nagao, [Best practices to design inclusive name input fields](https://medium.com/@ririnagao/best-practices-to-design-inclusive-name-input-fields-11dec756fdf6)
