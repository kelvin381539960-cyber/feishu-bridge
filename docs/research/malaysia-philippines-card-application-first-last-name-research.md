# 马来西亚与菲律宾：申卡流程是否要求填写 First Name 与 Last Name

> 调研日期：2026-04-14 | 作者：Cursor Agent

归档路径：`docs/research/malaysia-philippines-card-application-first-last-name-research.md`

## 澄清假设与待确认问题

**关键假设（本报告据此展开）**

- 「申卡」包括：**持牌银行信用卡**（纸质/PDF 申请表与官网/App 在线申请）、**数字银行/电子钱包内嵌信贷或联名卡**（如 Maya、GCash GGives）、以及**卡组规则下的卡面印刷名**；不含企业卡、员工卡专项流程。
- 「是否要求填写 **First name** 与 **Last name**」区分为两层：**(A)** 界面是否出现**两个独立输入框**且标签为 *First name* / *Last name*（或明确「名」「姓」与英美序一致）；**(B)** 合规上是否必须采集可与**政府证件逐字一致**的法定姓名（可为单行全名、或 *Last, First, Middle* 等本地分栏）。下表对 (A)(B) 分别标注。
- 证据以**公开发布的申请表 PDF、银行官网申请表入口、帮助中心**为主；**未对每一款 App 的当前版本做逐屏截图审计**，各机构改版后以前端为准。
- 会话语境以 **MY / PH 消费金融市场**为主；不覆盖美国/欧盟纯数字卡商的全球统一表单（另有仓库内泛化调研可参考）。

**如需更精准仍建议补充（不阻塞结论）**

- 对标产品线是传统**循环贷记卡**、**借记/预付**，还是 **BNPL / PayLater**？
- 评估口径是否将「账户已 KYC、申卡页仅确认卡面名」记为「不要求当场填写 first/last」？
- 是否需纳入 **伊斯兰金融**（如 *-i* 卡）在姓名字段上的额外宗教/法律表述？
- 是否需锁定具体机构清单（如 Maybank、CIMB、BPI、UnionBank、Grab）做对照矩阵？

---

## 1. 背景与定义

### 1.1 核心概念

- **法定姓名（Legal name as per ID）**：须与 **NRIC / MyKad**（马来西亚）或 **PhilSys / UMID / 护照** 等菲律宾官方证件一致，用于 KYC、征信（如马来西亚 **CTOS/CCRIS**、菲律宾 **CIC** 相关报送）与制裁筛查；**不等于**卡面凸字可截断的短名。
- **First name / Last name 分栏**：英美 Web 表单常见模式（Given name + Family name）；在菲律宾因普遍存在 **Middle name、Suffix（Jr./III）**，实务上常扩展为 **First / Middle / Last / Suffix** 或单行 **「Last, First, Middle」** 指令，而非严格的「仅两格」。
- **全名「如证件所示」单行（Full name as in NRIC/Passport）**：马来西亚传统申请表与多家网银在线申请更常见，避免将马来裔 **bin/binti**、印度裔多段名、华裔「姓+名」强行塞进英美两格。
- **卡面印刷名（Name to appear on card）**：受 **ISO/IEC 7813** 等实践中约 **19–21 字符**（含空格）量级限制，常与证件全名分行采集；用户可能在申卡时**额外**编辑缩略形式，与「是否分 first/last」正交。

### 1.2 历史沿革

- **马来西亚**：纸质信用卡申请表长期采用 **「Name as in NRIC or Passport」+「Name to appear on card」** 双语结构（如 Maybank 公开 PDF），与 **1960 年代国民登记体系**以来「证件姓名为准」的银行作业习惯一致，**弱绑定**「First/Last」英文标签。
- **菲律宾**：受 **美国殖民时期** 民事登记与银行作业影响，纸质申请表普遍继承 **「名—中间名—姓—后缀」** 多字段或 **「姓, 名 中间」** 组合行；与 **PhilSys** 推行的结构化人口数据并存，数字化后仍常见多分栏。
- **移动互联网与 eKYC**：近十年 **OCR + 活体** 普及后，用户可能**不手填** first/last，而是确认证件解析结果；结论须区分「界面上是否出现分栏」与「数据源是否结构化存储」。
- **电子钱包闭环**：如 **GCash GGives** 要求申请人已是 **Fully Verified** 用户，姓名来自钱包画像，**产品开通步**可能不再出现空白姓名分栏（但账户侧仍有法定姓名）。

---

## 2. 核心机制 / 工作原理

### 2.1 合规与证件对齐：采集的是「与证一致」，不是「英文两格」

- **BNM / AMLA**（马来西亚）与 **BSP Circular No. 808** 系列等反洗钱框架要求金融机构建立客户身份识别程序；**姓名是关键标识符**，与证件号、出生日期、地址组合使用，**不规定**前端必须采用 *First name* / *Last name* 英文标签。
- **菲律宾**《反洗钱法》及 BSP 对金融机构客户尽职调查指引同样要求**可核验身份**；界面常见 **First/Middle/Last** 与本地民事登记习惯一致，属于**产品/核心系统惯例**，而非「只能用两格」。
- **卡组与发卡处理**：无论前端分几栏，发卡行后端通常收敛为 **持卡人姓名域** 及 **卡面条目**；PCI DSS 语境下卡面 PAN 与姓名展示有规范，但**不强制**申请页使用英文二分法。

### 2.2 前端信息架构：分栏数由「核心银行系统字段」与「本地化」共同决定

- **马来西亚大型行**：在线申请常见 **「Full Name (as per NRIC)」** 或等价表述的**主姓名字段**（如 CIMB 信用卡在线申请表入口），辅以地址、收入、证件上传；**减少**对非英美姓名结构的误解析。
- **菲律宾大型行**：PDF 与网银常见 **Last name、First name、Middle name** 四格或 **「Name (Last, First, Middle)」** 组合行（见 BPI 公开申请表），以匹配 **PSA 出生证/税卡** 等文件上的习惯顺序。
- **「Name to appear on card」** 几乎总是**独立字段**，与法定姓名分行处理，避免用户误以为「卡面两格 = 法定名两分」。

### 2.3 数字钱包与「申卡」：姓名多在 KYC 主路径，卡片为下游交付

- **Maya Black** 等数字银行信用卡路径公开宣传为在 App 内完成申请，并涉及**选择卡面持卡人名**（与已验证身份关联），用户感知可能是「一步选名」而非「首次填写 first/last」。
- **GCash GGives** 帮助中心说明申请人须为 **Fully Verified** 用户；**姓名变更**走单独工单与证件（见 GCash「Change my name or birthday」帮助文章），印证**主姓名不在 GGives 开通子流程重复采集**的常见形态。
- **银行 App 内嵌 H5 申请表**：字段标签可能与银行主站 PDF **一致或子集**；若嵌入第三方获客页，仍应回指发卡行 PDF 的法定字段定义。

---

## 3. 主流方案 / 实现对比

### 3.1 马来西亚 vs 菲律宾：申卡姓名字段模式对照

| 维度 | **马来西亚（典型）** | **菲律宾（典型）** |
|------|---------------------|---------------------|
| **(A) 是否常见独立的 *First name* + *Last name* 两输入框** | **较少作为主标签**；更常见 **Full name as in NRIC/Passport** 单行或「如证件」说明 + 卡面名 | **较常见多分栏**：**First / Middle / Last / Suffix**，或 **Name (Last, First, Middle)** 组合行 + 卡面名 |
| **(B) 是否必须采集与证件一致的法定姓名** | **是**（表述多为 NRIC/Passport 对齐） | **是**（表述常强调与有效政府签发的 ID 一致） |
| **Middle name 处理** | 通常**不单独**强制 Middle name 栏；多段名写入「全名」字段 | **常单独**要求 Middle name（或明确「无则填 N/A/MNM」类指引，以机构表单为准） |
| **卡面名** | 普遍单独 **Name to appear on card**（常限字符数） | 普遍单独 **Name to appear on card**（常限字符数） |
| **数字钱包信贷** | 依赖钱包/银行主 KYC；开通步可能无空白姓名分栏 | 同上（如 GGives 与 GCash 验证等级绑定） |
| **主要驱动** | NRIC 姓名行、马来/华/印多元姓名结构 | 菲律宾民事登记「名—中间—姓—后缀」习惯与历史银行表单 |

### 3.2 代表性公开材料中的「是否 first/last 两格」速览

> 下表依据**可下载的官方 PDF 或银行公开页面**归纳 **(A)(B)**；**App 内动态表单**可能因 A/B 测试与语言包与 PDF 略异。

| 机构 / 材料 | 司法辖区 | **(A) First+Last 两格为主？** | **(B) 法定姓名必填？** | 公开依据类型 |
|-------------|---------|------------------------------|------------------------|----------------|
| **Maybank** 信用卡申请表 | MY | **否（主字段为证件全名类表述 + 卡面名）** | **是** | [Maybank2u 信用卡申请表 PDF](https://www.maybank2u.com.my/iwov-resources/pdf/personal/cards/credit_cards/credit-card-appform.pdf) |
| **CIMB** 在线信用卡申请（网页表单） | MY | **否（常见「Full Name…as per NRIC」类单字段）** | **是** | [CIMB 在线申请表入口示例 `apply.cimb.com.my/ccform`](https://apply.cimb.com.my/ccform/) |
| **UOB Malaysia** 通用信用卡申请表 | MY | **否（Principal/Supplementary 姓名区 + 卡面名等，非典型英美两格标签）** | **是** | [UOB MY 信用卡申请表 PDF](https://www.uob.com.my/assets/web-resources/personal/pdf/useful/forms/cc-application.pdf) |
| **Standard Chartered MY** 在线信用卡表单（公开页面） | MY | **否（强调 Full name as in IC/Passport）** | **是** | [SCB MY 在线信用卡申请页（示例产品页）](https://forms.online.standardchartered.com/public_website/malaysia/OnlineSales_gwo/credit_card_form_platinum_visa.html) |
| **BPI** 信用卡申请表 | PH | **否（采用 *Name (Last, First, Middle)* 等组合行 + 卡面名，而非单纯 First+Last 两格）** | **是** | [BPI Credit Card Application Form PDF](https://www.bpi.com.ph/content/dam/bau/personal-banking/cards/credit-cards/info/credit-card-forms/BPI%20Credit%20Card%20Application%20Form.pdf?download=true) |
| **PNB** 信用卡申请表 | PH | **否（First / Middle / Last / Suffix 多分栏）** | **是** | [PNB Credit Card Application Form PDF](https://www.pnb.com.ph/storage/asset-libraries/4hJ8rx95yBG91k0qD2EV4L96LPea7812pzMcLzIk.pdf) |
| **Bank of Commerce** 信用卡申请表 | PH | **否（LAST / FIRST / MIDDLE + 卡面名）** | **是** | [Bank of Commerce CC Application PDF](https://www.bankcom.com.ph/wp-content/uploads/2024/09/Application-Form-CCU-16-26-B-R0924-1.pdf) |
| **BDO** 综合申请表（卡类业务） | PH | **否（常见 Last / First / Middle 结构）** | **是** | [BDO Consolidated Application Form PDF](https://www.aem.bdo.com.ph/content/dam/cbg/marketing-services/channels/cards/pdf-files/CONSOLIDATED_APPLICATION_FORM.pdf) |
| **HSBC Philippines** 信用卡申请表 | PH | **否（FIRST NAME / SURNAME / MIDDLE NAME 等）** | **是** | [HSBC PH Credit Card Application PDF](https://www.hsbc.com.ph/content/dam/hsbc/ph/docs/credit-cards/cc-application-form/credit-card-application-form.pdf) |
| **Maybank Philippines** 信用卡申请表 | PH | **否（NAME (First, Middle, Last, Suffix)）** | **是** | [Maybank PH CC Application PDF](https://www.maybank.com.ph/en/personal/cards/MAYBANK_CC_APPLICATION_FORM.PDF) |
| **GCash GGives**（开通资格） | PH | **开通步通常不再采集（依赖 Fully Verified 画像）** | **账户级已采集** | [How to apply for GGives](https://help.gcash.com/hc/en-us/articles/30662698019737-How-to-apply-for-GGives) |
| **Maya Black 信用卡**（公开宣传流程） | PH | **强调在 App 内申请与选择卡面持卡人名** | **是（与银行 KYC 关联）** | [Maya.ph 官方故事页](https://www.maya.ph/stories/how-to-apply-for-a-maya-black-credit-card-and-why-you-should-make-it-your-primary-credit-card)、[Maya Bank 信用卡介绍页](https://www.mayabank.ph/creditcard/maya-black-express/) |

---

## 4. 优劣势与适用场景

### 4.1 采用「Full name as per NRIC」单行（马来西亚主流纸表单/部分网银）

- **优势**：对 **bin/binti**、双名、无「姓氏」文化更包容，减少分栏顺序错误；与 **证件 OCR 整行回填**一致性好。
- **劣势**：下游若必须与 **ISO 8583** 或外方合作伙伴的 **given/family** 字段对接，需要可靠的后端拆分与人工复核规则。
- **适用**：以 **NRIC/护照** 为唯一真源的零售信贷、伊斯兰银行 *-i* 卡、面向本土多元族群的数字申请。

### 4.2 采用「First / Middle / Last / Suffix」多分栏（菲律宾主流）

- **优势**：与 **PSA 文件、税卡、传统核心系统** 字段习惯一致，客服与信审对齐成本低。
- **劣势**：对 **海外护照仅一行英文姓名**、或 **单名（mononym）** 用户，需额外校验与指引（各机构表单脚注不同）。
- **适用**：大型商业银行信用卡、房贷/车贷 bundled 申请、纸质流程数字化迁移场景。

### 4.3 强行使用「仅 First + Last 两格」的跨境产品

- **优势**：与 **北美 SaaS**、部分 **国际卡组** 默认模板对齐快，工程复用度高。
- **劣势**：在 **MY/PH** 易产生证件对照纠纷（中间名缺失、姓序颠倒、马来冠名处理不当）；监管沟通与争议处理成本高。
- **适用**：**纯线上跨境金融科技**若必须两格，应配套 **「与证件完全一致」** 的二次确认与 **人工工单改名** 路径（参考 GCash 改名流程形态）。

---

## 5. 现实案例 / 生产落地

### 5.1 马来西亚：传统银行公开申请表证据链

- **Maybank** 公开 PDF 在申请人信息区使用 **「Name as in NRIC or Passport」** 与 **「Name to appear on Card」** 分行采集，并含 **Salutation**、**NRIC** 等字段，**不将英美 First/Last 作为主标签**（见申请表 PDF）。
- **UOB Malaysia** 公开通用信用卡 PDF 显示 **Principal / Supplementary** 申请人信息结构及卡面名等字段，属于**典型银行多维个人信息表**，而非简化两格英文模型（见 UOB MY PDF）。
- **Standard Chartered Malaysia** 公开在线申请页在字段说明中要求 **Full name (as in IC/Passport)**，体现 **证件整名** 导向的线上采集策略（见 SCB 在线表单页）。

### 5.2 菲律宾：大型银行 PDF 的「多分栏」一致性

- **BPI** 申请表使用 **「Name (Last, First, Middle)」** 与 **「Name to appear on card (maximum 21 characters including spaces)」** 并列，体现 **法定姓名排序指令** 与 **卡面条目** 分离（见 BPI PDF）。
- **PNB** 与 **Bank of Commerce** 公开 PDF 明确列出 **FIRST NAME / MIDDLE NAME / LAST NAME / SUFFIX** 或 **LAST/FIRST/MIDDLE** 栅格，印证 **菲律宾市场强于英美两格** 的惯例（见对应 PDF）。
- **HSBC Philippines** 申请表包含 **SURNAME** 与 **FIRST NAME**、**MIDDLE NAME** 等字段，显示**国际行在菲仍本地化**为多段名结构（见 HSBC PH PDF）。

### 5.3 数字银行 / 钱包：姓名在 KYC 主路径，卡片申请为「下游动作」

- **GCash GGives** 官方帮助说明申请人须为 **Filipino citizen** 且 **Fully Verified** GCash 用户；**GGives 开通**本身不替代 KYC，姓名治理在账户级完成（见 GGives 申请帮助文章；改名见 GCash [Change my name or birthday](https://help.gcash.com/hc/en-us/articles/360034342914-Change-my-name-or-birthday)）。
- **Maya / Maya Bank** 公开材料描述 **Maya Black** 信用卡可在 **Maya App** 内申请，并提到 **choose your cardholder name** 等用户可见步骤，体现**卡面条目与已验证身份绑定**的产品叙事（见 maya.ph 故事页与 mayabank.ph 信用卡页）。
- **产品启示**：若竞品审计只打开「申卡页」而未先完成 **KYC**，会**低估**姓名采集强度；正确口径是 **「账户+产品全链路是否出现过 first/last 分栏」**。

---

## 6. 趋势与建议

### 6.1 趋势判断

- **马来西亚**：传统与伊斯兰条线会继续以 **NRIC 对齐整名** 为主轴，**英美两格标签不会成为监管口径**；数字化只会增强 **OCR 回填 + 用户确认**。
- **菲律宾**：在 **PhilSys** 推广下，**结构化人口数据**与银行表单对齐压力上升，**First/Middle/Last** 多分栏仍将长期存在；纯「First+Last」难成为大行主模板。
- **区域数字信贷**：**钱包画像 + 评分**驱动下，用户端「少填甚至不填姓名框」的体验会增加，但**后台法定名**仍完整，合规审计关注 **数据源** 而非分栏数。

### 6.2 对产品设计的中性建议（面向 MY / PH）

- **马来西亚**：优先 **「Full legal name as per NRIC/Passport」** 单行 + **卡面名**；避免强制 **First/Last** unless 有明确卡组/收单行技术硬约束且配 **人工复核**。
- **菲律宾**：采用 **First / Middle / Last / Suffix** 或 **「Last, First, Middle」** 单行指令，与公开大行 PDF 习惯一致；对 **无中间名** 给出明确占位指引。
- **国际化中台**：若全球模板只有 **First/Last**，在 MY/PH 应做 **本地化覆盖层**（字段标签、顺序、校验、与证件 OCR 映射），并在隐私政策中说明 **姓名处理与证件一致性**。

### 6.3 验证方法（若需「逐 App」硬证据）

- 对目标机构分别截取 **(1) 未登录获客页 (2) 登录后完整申请动线 (3) 卡面名确认屏**，记录**可见标签原文**。
- 对照**同期 PDF 申请表**与 **Terms** 中 *legal name* 定义，检查 **App 是否省略中间名** 等潜在合规偏差。
- 对 **Fully Verified 钱包用户** 与 **新客** 各跑一遍，确认姓名是否出现在 **KYC** 而非 **申卡子流程**。

---

## 参考资料

1. Maybank2u — *Credit Card And Charge Card Application Form*（PDF）  
   https://www.maybank2u.com.my/iwov-resources/pdf/personal/cards/credit_cards/credit-card-appform.pdf  

2. CIMB — *Credit Card Application Form*（在线申请入口示例）  
   https://apply.cimb.com.my/ccform/  

3. UOB Malaysia — *Generic Credit Card Form*（PDF）  
   https://www.uob.com.my/assets/web-resources/personal/pdf/useful/forms/cc-application.pdf  

4. Standard Chartered Malaysia — *Online credit card application form*（示例产品页）  
   https://forms.online.standardchartered.com/public_website/malaysia/OnlineSales_gwo/credit_card_form_platinum_visa.html  

5. BPI — *Credit Card Application Form*（PDF）  
   https://www.bpi.com.ph/content/dam/bau/personal-banking/cards/credit-cards/info/credit-card-forms/BPI%20Credit%20Card%20Application%20Form.pdf?download=true  

6. PNB — *CREDIT CARD APPLICATION FORM*（PDF）  
   https://www.pnb.com.ph/storage/asset-libraries/4hJ8rx95yBG91k0qD2EV4L96LPea7812pzMcLzIk.pdf  

7. Bank of Commerce — *CREDIT CARD APPLICATION*（PDF）  
   https://www.bankcom.com.ph/wp-content/uploads/2024/09/Application-Form-CCU-16-26-B-R0924-1.pdf  

8. BDO — *CONSOLIDATED APPLICATION FORM*（PDF）  
   https://www.aem.bdo.com.ph/content/dam/cbg/marketing-services/channels/cards/pdf-files/CONSOLIDATED_APPLICATION_FORM.pdf  

9. HSBC Philippines — *credit-card-application-form*（PDF）  
   https://www.hsbc.com.ph/content/dam/hsbc/ph/docs/credit-cards/cc-application-form/credit-card-application-form.pdf  

10. Maybank Philippines — *MAYBANK_CC_APPLICATION_FORM*（PDF）  
    https://www.maybank.com.ph/en/personal/cards/MAYBANK_CC_APPLICATION_FORM.PDF  

11. GCash Help Center — *How to apply for GGives*  
    https://help.gcash.com/hc/en-us/articles/30662698019737-How-to-apply-for-GGives  

12. GCash Help Center — *Change my name or birthday*  
    https://help.gcash.com/hc/en-us/articles/360034342914-Change-my-name-or-birthday  

13. Maya — *How to Apply for a Maya Black Credit Card…*（官方故事页）  
    https://www.maya.ph/stories/how-to-apply-for-a-maya-black-credit-card-and-why-you-should-make-it-your-primary-credit-card  

14. Maya Bank — *Maya Black Express*（信用卡产品介绍）  
    https://www.mayabank.ph/creditcard/maya-black-express/  

15. Philippine Statistics Authority — *PhilSys FAQ*（人口数据与证件语境参考）  
    https://philsys.gov.ph/faq-frequently-asked-questions/  

16. 仓库内泛化调研（非 MY/PH 专用，可作对照）：`docs/research/card-application-first-last-name-research.md`
