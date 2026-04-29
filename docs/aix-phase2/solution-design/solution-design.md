# AIX Phase 2 概要设计方案

角色与职责 · MVP 功能 · 核心业务流

| 字段 | 内容 |
|------|------|
| 文档类型 | 概要设计（Solution Architecture） |
| 版本 | v0.2 草稿 |
| 状态 | 待内部评审 |
| 日期 | 2026-04-06 |

---

## 一、方案概述

Phase 2 的本质转变：从依赖 dtcPay 单一合作方的卡产品，升级为以 自主牌照 + 模块化基础设施为核心的稳定币资金账户平台。 AIX 自主掌控：账户体系、账本、合规策略、风控规则、资金归集与分配。 外部 Vendor 负责：链上资产托管（Custody）、区块链风险分析（KYT）、合规报文交换（Travel Rule）、卡发行清算（BIN Issuer）、流动性补仓（Liquidity Partner）。

---

## 二、AIX系统说明

### AIX 内部两层核心子系统

AIX 自有系统在逻辑上分为两个相互独立、职责清晰的核心子系统：


| 子系统                    | 定位  | 主要职责                                                                                         |
| ---------------------- | --- | -------------------------------------------------------------------------------------------- |
| **AIX Platform**（业务中台） | 编排层 | 接收用户/外部请求；管理全流程状态机；调用外部 Vendor（KUN、Cobo、KYT、Travel Rule、Liquidity Partner）；将账本操作指令下发给 Ledger |
| **AIX Ledger**（核心账本）   | 账本层 | 以双记账法维护每用户余额；执行预扣/冻结/结算/划拨；触发 Cobo 链上资金转移指令；保持账本与 Custody 的一致性                               |


两层子系统之间单向依赖：Platform 调用 Ledger，Ledger 不反向依赖 Platform 的业务逻辑。KYC 身份核验不在 AIX 内部完成——AIX Platform 仅串联 KUN（持牌合规网关），由 KUN + AAI 完成证件核验与合规审定，AIX 保存结论，不存储原始证件。

---

## 三、角色与职责（Roles & Responsibilities）

**AIXPAY LIMITED** 作为核心运营主体，与用户直接建立产品与服务法律关系（T&C + Privacy Policy），并分别与下列**法定主体**通过商业合同与技术集成对接，组合形成完整的数字资产账户与卡支付能力栈。

**生态关系总览**：

```mermaid
flowchart TB
    classDef hub fill:#1652b8,stroke:#0d47a1,color:#fff,stroke-width:2.5px,font-weight:bold;
    classDef vendor fill:#f1f5f9,stroke:#64748b,color:#0f172a,stroke-width:1.5px;
    classDef psp fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e,stroke-width:1.5px;
    classDef hidden fill:none,stroke:none,color:none;

    %% ========== Row 1: Top ==========
    Cobo["Cobo Singapore<br/>Technology Pte. Ltd."]:::vendor

    %% ========== Row 2: Middle ==========
    KUN["YEEWALLEX HK<br/>LIMITED<br/>(aka KUN)"]:::vendor
    AIX["AIXPAY LIMITED"]:::hub
    Chainalysis["Chainalysis<br/>Singapore Pte. Ltd."]:::vendor

    %% ========== Row 3: Bottom ==========
    WC["WalletConnect Inc."]:::psp
    Notabene["Notabene Pte. Ltd."]:::vendor
    QCP["QCP Capital Pte. Ltd."]:::vendor

    %% ========== Connections ==========
    Cobo <-->|"数字资产托管 &<br/>链上划转技术服务商"| AIX
    KUN <-->|"BIN Sponsor（发卡资质许可）<br/>+ 交易处理"| AIX
    AIX <-->|"KYT 链上交易<br/>风控服务商"| Chainalysis
    WC <-->|"链上充值<br/>支付服务商 (PSP)"| AIX
    Notabene <-->|"Travel Rule<br/>合规服务商"| AIX
    AIX <-->|"流动性补仓<br/>做市商"| QCP
```



**各方角色与职责详述**：


| 主体                                      | 角色标签                                                          | 职责范围与边界                                                                                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cobo Singapore Technology Pte. Ltd.** | Digital Asset Custody & On-Chain Transfer Technology Provider | 为 AIX 提供**数字资产托管**基础设施：私钥管理（MPC 多方计算）、充值地址生成、链上转账执行（含 Gas 管理）、余额快照与 Webhook 通知。AIX 通过 API 向 Cobo 下发转账指令，Cobo 负责签名广播并回传链上确认。双方通过**日终对账**（AIX Ledger 账本 vs Cobo 余额报告）保证账实一致。**私钥始终不离开 Cobo 侧**。                                                                                                                  |
| **YEEWALLEX HK LIMITED（aka KUN）**       | Card BIN Sponsorship + Processing                             | 作为 AIX 的**卡业务核心合作方**，提供三重能力：① **BIN Sponsorship**——以 KUN 持有的发卡牌照为 AIX 用户发行 Visa / Mastercard 卡片（虚拟卡 + 实体卡）；② **Card Processing**——处理实时授权（Auth）、清算（Clearing）、结算（Settlement）等卡网络交互，AIX 作为 Online Issuer 提供授权决策；③ **KYC 协同入口**——KUN 整合 AAI 身份核验能力，AIX App 通过 SDK 直连 AAI 采集证件/人脸（敏感数据不经 AIX 后台），KUN 输出最终合规结论给 AIX。 |
| **Chainalysis Singapore Pte. Ltd.**     | KYT Technology Provider                                       | 为 AIX 提供 **KYT（Know Your Transaction）** 能力：对链上地址与交易进行风险评分（Risk Score）、制裁名单匹配（OFAC / EU / UN）、黑名单筛查。AIX 在用户充值到账与提现发起时调用 Chainalysis API，根据返回的风险等级决定放行、人工审核或拒绝。评分规则阈值由 AIX 合规团队配置。                                                                                                                               |
| **WalletConnect Inc.**                  | On-chain deposit PSP                                          | 作为**链上入金**路径上的 **PSP（Payment Service Provider）** 能力提供方，为用户提供从外部钱包向 AIX 充值地址转入数字资产时的连接与交互体验（如 WalletConnect 协议支持的多钱包扫码连接）。AIX 平台侧集成该通道能力，具体产品形态随链与钱包生态演进调整。                                                                                                                                                     |
| **Notabene Pte. Ltd.**                  | Travel Rule Technology Provider                               | 为 AIX 提供 **Travel Rule** 合规能力：在用户链上充值/提现时，按 FATF 要求与对手方 VASP 交换 **IVMS101** 格式的发起方/受益方信息。Notabene 负责对手方 VASP 发现（Discovery）、报文路由与加密传输。AIX 作为 Originating / Beneficiary VASP 发起或响应合规报文，超时未响应的交易按 AIX 内部策略降级处理。                                                                                                   |
| **QCP Capital Pte. Ltd.**               | Liquidity Partner                                             | 作为 AIX 在**流动性补仓**场景下的 **做市商**：提供实时汇率报价、执行大额换汇、完成 Crypto 划转至 AIX 企业账户。用于支撑平台侧的 B2B 资金清算与备付金补充。AIX 承担报价锁定期后的汇率波动风险。                                                                                                                                                                                              |

---

## 四、MVP 功能范围（MVP Function Scope）

本章锁定 Phase 2 MVP 交付边界，回答「**做什么、不做什么、谁参与**」。内容与业务 BRD §3 对齐；每项功能的详细步骤交互见**第五章**。

---

### 4.1 用户侧功能（User-Facing）

#### A. 开户与身份认证（Account Opening / KYC）

| 功能 | 交互链路 | 说明 |
|------|----------|------|
| Passport OCR | AIX → KUN → AAI → KUN | 护照信息自动识别 |
| Liveness + Face Comparison | AIX → KUN → AAI → KUN | 活体检测与人脸比对 |
| POA 地址证明 | AIX → KUN → AAI → KUN | 上传并核验地址证明 |

#### B. 卡片管理（Card Management）

| 功能 | 交互链路 | 核心逻辑 |
|------|----------|----------|
| View Card Info / Activation / Set PIN / Change PIN / Lock / Unlock | AIX → KUN | 统一经 KUN 网关处理卡片全生命周期操作，AIX 仅存储脱敏信息 |

#### C. 链上充提（Token On-Chain Transfer）

| 功能 | 交互链路 | 核心逻辑 |
|------|----------|----------|
| **Deposit（充值）** | Cobo → AIX → KYT / TR → AIX | **Cobo** 监测入账并通知；**AIX** 独立调用 KYT/TR 插件；合规通过后正式 credit 账本 |
| **Withdrawal（提现）** | AIX → KYT / TR → Cobo | **AIX** 先冻结账本，完成合规校验后向 **Cobo** 下发广播指令 |

#### D. 内部兑换（Token Swapping）

| 功能 | 交互链路 | 核心逻辑 |
|------|----------|----------|
| Token Swapping | AIX 内部 | 账本层原子操作，秒级成交，不发生链上交易 |

#### E. 稳定币生息产品（Stablecoins Yield）

| 功能 | 交互链路 | 核心逻辑 |
|------|----------|----------|
| 申购 / 赎回 | AIX → Yield Partner | 用户侧“秒申秒赎”体验；底层资金由 AIX 统一与合作方进行异步再平衡 |
| 每日计息 | AIX → Yield Partner | 按约定规则日结收益并发放 |

---

### 4.2 系统侧能力（System-Internal）

对用户不可见，但支撑风控、流动性与账务一致性的核心能力。

| 能力 | 说明 | 交互 |
|------|------|------|
| **Token Sweeping** | 用户充值钱包 → Omnibus Pool 自动归集 | AIX → Cobo |
| **Inventory Rebalancing** | 内部头寸补仓（Flow 10），确保 Swap 业务流动性 | AIX → Partner |
| **Withdrawal Top-up** | 提现热钱包余额低于阈值时自动从 Pool 补仓 | AIX → Cobo |
| **Deposit Escrow** | KYT / Travel Rule 触发时，入账暂缓释放 | AIX → Cobo |
| **Balance Ledger** | 双记账法追踪每笔 credit / debit，计算用户当前余额 | AIX |

---

## 五、核心业务流与系统交互 (Main Business Flows)

### 5.1 客户核心旅程 (Customer-Facing Flows)

#### Flow 1：Account Opening & KYC（开户与身份认证）

**核心逻辑**：用户经 App 提交开户审核；AIX Platform（业务中台）向 KUN（Issuer Gateway）请求身份核验服务。证件、人脸、地址证明由 AIX App 采集并上传，由 KUN 输出审核结论并通知平台；平台侧在审核通过后联动 AIX Ledger（核心账本）开立用户账户。App 向用户展示最终开户结果。

**业务交互结构图（Mermaid `flowchart`）**：展示系统边界与数据走向。

```mermaid
flowchart LR
  subgraph CH[" Customer & Channel "]
    direction TB
    c[Customer<br/>用户]
    app[AIX App<br/>用户端应用]
  end

  subgraph ORCH[" AIX Orchestration "]
    direction TB
    plat[AIX Platform<br/>业务中台]
  end

  subgraph CTRL[" AIX Ledger & Controls "]
    direction TB
    ledger[AIX Ledger<br/>核心账本]
  end

  subgraph EXT[" External Partners "]
    direction TB
    kun[KUN<br/>Issuer Gateway]
    aai[AAI<br/>身份核验服务商]
  end

  c -->|① 发起开户申请| app
  app -->|② 提交开户审核请求| plat
  plat -->|③ 请求身份核验服务| kun
  app -.->|"④ 上传证件、人脸、地址证明"| aai
  aai -->|⑤ 返回采集结果| kun
  kun -->|⑥ 通知审核结果（通过/拒绝）| plat
  plat -->|⑦ 审核通过后开立用户账户| ledger
  plat -->|⑧ 通知开户结果（通过/拒绝）| app

  classDef user fill:#4D4D4D,stroke:#333333,color:#fff
  classDef aix fill:#1459C7,stroke:#0D4CAE,color:#fff
  classDef kun fill:#238B68,stroke:#155D45,color:#fff
  classDef aai fill:#6B46C1,stroke:#4A2B8C,color:#fff
  class c user
  class app,plat,ledger aix
  class kun kun
  class aai aai
```





#### Flow 2：Card Application & Issuance（卡片申请与发卡）

**核心逻辑**：AIX Platform（业务中台）全程负责申卡流程编排；AIX Ledger（核心账本）负责开卡手续费的冻结与结算。KUN（Issuer Gateway）将开卡请求路由至 Issue（实际发卡处理商），Issue 完成内部合规审核后逐级回传结果。审核通过后，由 AIX Platform 调用 Cobo（Custody）执行物理资金划拨。实体卡申请同步触发制卡商制卡与物流商寄送流程。

**业务交互结构图（Mermaid `flowchart`）**：展示申卡申请、开卡审核、手续费结算以及实体卡物流追踪的完整闭环。

```mermaid
flowchart LR
subgraph CH[" Customer & Channel "]
  direction TB
  customer["Customer<br/>用户"]
  app["AIX App<br/>用户端应用"]
end

subgraph ORCH[" AIX Orchestration "]
  direction TB
  platform["AIX Platform<br/>业务中台"]
end

subgraph CTRL[" AIX Ledger & Controls "]
  direction TB
  ledger["AIX Ledger<br/>核心账本"]
end

subgraph EXT[" External Partners "]
  direction TB
  kun["KUN<br/>Issuer Gateway"]
  issue["Issue<br/>卡片发行处理商"]
  cobo["Cobo<br/>Custody"]
  manufacturer["Card Manufacturer<br/>制卡商"]
  logistics["Logistics Provider<br/>物流商"]
end

subgraph ACCT[" Accounts & Asset Containers "]
  direction TB
  pool["AIX Pool Account<br/>资金池账户"]
  fee["AIX Fee Account<br/>手续费账户"]
end

customer -->|"① 发起开卡申请"| app
app -->|"② 提交开卡申请"| platform
platform -->|"③ 冻结开卡手续费"| ledger
platform -->|"④ 提交开卡请求"| kun
kun -->|"⑤ 路由开卡申请"| issue
issue -->|"⑥ 返回开卡结果"| kun
kun -->|"⑦ 通知开卡结果"| platform
platform -->|"⑧ 审核通过后发起手续费结算"| cobo
cobo -.->|"⑨ 执行资金划拨"| pool
cobo -.->|"⑩ 资金入账手续费账户"| fee
cobo -->|"⑪ 返回结算结果"| platform
platform -->|"⑫ 冻结转结算"| ledger
platform -->|"⑬ 同步开卡结果"| app

issue -->|"⑭ 通知制卡（仅实体卡）"| manufacturer
manufacturer -->|"⑮ 通知寄送卡"| logistics
logistics -.->|"⑯ 实体卡配送"| customer
platform -->|"⑰ 查询物流状态"| logistics
logistics -->|"⑱ 同步物流状态"| platform
platform -->|"⑲ 更新物流状态"| app


classDef user fill:#5a5a5a,stroke:#333,color:#fff;
classDef aix fill:#1652b8,stroke:#0d47a1,color:#fff;
classDef external fill:#1f8f6b,stroke:#155d45,color:#fff;
classDef custody fill:#5b1fb5,stroke:#4a148c,color:#fff;
classDef account fill:#efe6c8,stroke:#d6a11a,color:#222;
classDef supply fill:#6f8798,stroke:#546e7a,color:#fff;

class customer user;
class app,ledger,platform aix;
class kun,issue external;
class cobo custody;
class pool,fee account;
class logistics,manufacturer supply;

style CH fill:none,stroke:none
style ORCH fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
style CTRL fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
style EXT fill:none,stroke:#ccc,stroke-dasharray: 5 5
style ACCT fill:#fdfdfd,stroke:#bbb,stroke-dasharray: 3 3
```



**关键约束**：

- **职责分离**：AIX Platform 负责业务串联（验资格、调 KUN、调用 Cobo 结算）；AIX Ledger 负责账本操作（冻结手续费③、记录冻结转结算⑫）。
- **实体卡配送追踪**：Issue 触发制卡商制卡后，AIX Platform 主动查询物流状态并同步给用户。

#### Flow 3：On-chain Deposit with KYT & Travel Rule（链上充值与合规流程）

**核心逻辑**：用户通过 WalletConnect 等协议向 AIX 专属充值地址发起转账。Cobo 监测入账后通知 AIX，AIX 独立调用 KYT/TR 插件进行合规审查；合规通过后由 AIX Ledger 正式 credit 用户余额。资金物理归集（Sweeping）异步进行。

**业务交互结构图（Mermaid `flowchart`）**：展示从地址申请、链上入账、合规校验到账本 credit 的完整链路。

```mermaid
flowchart LR
subgraph CH[" Customer & Channel "]
  direction TB
  customer["Customer<br/>用户"]
  app["AIX App<br/>用户端应用"]
end

subgraph ORCH[" AIX Orchestration "]
  direction TB
  platform_d["AIX Platform<br/>业务中台"]
end

subgraph CTRL[" AIX Ledger & Controls "]
  direction TB
  ledger_d["AIX Ledger<br/>核心账本"]
end

subgraph EXT[" External Partners "]
  direction TB
  cobo["Cobo<br/>Custody"]
  notabene_d["Notabene<br/>(Travel Rule)"]
  chainalysis_d["Chainalysis<br/>(KYT)"]
end

subgraph ACCT[" Accounts & Asset Containers "]
  direction TB
  external["Customer External Wallet<br/>用户外部钱包"]
  user_wallet["AIX User Deposit Address<br/>用户专属充值地址"]
  pool["AIX Pool Account<br/>资金池账户"]
end

customer -->|"1. 请求充值地址"| app
app -->|"2. 获取充值地址"| platform_d
platform_d -->|"3. 生成专属充值地址"| cobo
cobo -->|"4. 返回充值地址"| platform_d
platform_d -->|"5. 展示充值地址"| app
external -.->|"6. 链上转账"| user_wallet
user_wallet -->|"7. 监测到入账"| cobo
cobo -->|"8. 同步入账信息"| platform_d
platform_d -->|"9. 记录待处理入账"| ledger_d
platform_d -->|"10. 提交 KYT"| chainalysis_d
platform_d -->|"11. 提交 Travel Rule"| notabene_d
platform_d -->|"12. 更新入账状态<br/>(pending review / credited)"| ledger_d
user_wallet -.->|"13. 异步 Sweeping"| pool
platform_d -->|"14. 通知充值状态"| app


classDef wallet fill:#efe6c8,stroke:#d6a11a,color:#222;
classDef custody fill:#5b1fb5,stroke:#4a148c,color:#fff;
classDef aix fill:#1652b8,stroke:#0d47a1,color:#fff;
classDef vendor fill:#f5f5f5,stroke:#333,color:#333;

class customer user;
class app,platform_d,ledger_d aix;
class external,user_wallet,pool wallet;
class cobo custody;
class notabene_d,chainalysis_d vendor;

style CH fill:none,stroke:none
style ORCH fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
style CTRL fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
style EXT fill:none,stroke:#ccc,stroke-dasharray: 5 5
style ACCT fill:none,stroke:#ccc,stroke-dasharray: 5 5
```



**关键约束**：

- **Deposit Escrow**：合规未通过或待人工复核的资金停留在 `pending review` 状态，不映射到用户可用余额。
- **异步 Sweeping**：物理资金归集不阻塞用户账本加钱。

#### Flow 4：On-chain Withdrawal with Travel Rule（链上提现与合规流程）

**核心逻辑**：严格遵循"先冻结账本，后下发打钱指令"原则。提现场景统一使用 `freeze / settle / unfreeze` 语义，资金从公共提现热钱包（Withdrawal Wallet）流出。

**业务交互结构图（Mermaid `flowchart`）**：展示从发起提现、账本冻结、合规校验到链上转账与账务结算的完整流程。

```mermaid
flowchart LR
subgraph CH[" Customer & Channel "]
  direction TB
  customer_w["Customer<br/>用户"]
  app_w["AIX App<br/>用户端应用"]
end

subgraph ORCH[" AIX Orchestration "]
  direction TB
  platform_w["AIX Platform<br/>业务中台"]
end

subgraph CTRL[" AIX Ledger & Controls "]
  direction TB
  ledger_w["AIX Ledger<br/>核心账本"]
end

subgraph EXT[" External Partners "]
  direction TB
  chainalysis_w["Chainalysis<br/>(KYT)"]
  notabene_w["Notabene<br/>(Travel Rule)"]
  cobo_w["Cobo<br/>Custody"]
end

subgraph ACCT[" Accounts & Asset Containers "]
  direction TB
  withdrawal_w["AIX Withdrawal Wallet<br/>提现热钱包"]
  external_w["Customer External Wallet<br/>用户外部钱包"]
end

customer_w -->|"① 发起提现"| app_w
app_w -->|"② 提交提现请求"| platform_w
platform_w -->|"③ 冻结提现金额"| ledger_w
platform_w -->|"④ 提交 KYT"| chainalysis_w
platform_w -->|"⑤ 提交 Travel Rule"| notabene_w
platform_w -->|"⑥ 发起提现指令"| cobo_w
cobo_w -.->|"⑦ 控制提现热钱包"| withdrawal_w
withdrawal_w -.->|"⑧ 链上转账"| external_w
cobo_w -->|"⑨ 返回执行结果"| platform_w
platform_w -->|"⑩ 结算或解冻"| ledger_w
platform_w -->|"⑪ 通知提现结果"| app_w


classDef user fill:#5a5a5a,stroke:#333,color:#fff;
classDef aix fill:#1652b8,stroke:#0d47a1,color:#fff;
classDef vendor fill:#f5f5f5,stroke:#333,color:#333;
classDef custody fill:#5b1fb5,stroke:#4a148c,color:#fff;
classDef wallet fill:#efe6c8,stroke:#d6a11a,color:#222;

class customer_w user;
class app_w,platform_w,ledger_w aix;
class chainalysis_w,notabene_w vendor;
class cobo_w custody;
class withdrawal_w,external_w wallet;

style CH fill:none,stroke:none
style ORCH fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
style CTRL fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
style EXT fill:none,stroke:#ccc,stroke-dasharray: 5 5
style ACCT fill:none,stroke:#ccc,stroke-dasharray: 5 5
```







#### Flow 5：Card Transaction (Auth & Capture)（刷卡消费：授权与清算）

**核心逻辑**：毫秒级实时授权（Auth）执行 `hold`，T+1 异步清算（Capture）执行 `capture / release`。资金补足阶段，AIX 通过 Cobo（Custody）将稳定币从 `AIX Pool Account` 转出，经外部资金通道补足至 `Issuer Float Account`，后续法币清算由传统卡网络完成。

**业务交互结构图（Mermaid `flowchart`）**：展示授权、请款、清算、资金补足四个阶段。

```mermaid
flowchart LR
    subgraph CH[" Customer & Channel "]
        direction TB
        Customer["Customer<br/>用户"]
    end

    subgraph ORCH[" AIX Orchestration "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]
    end

    subgraph CTRL[" AIX Ledger & Controls "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]
    end

    subgraph EXT[" External Partners "]
        direction TB
        Merchant["Merchant<br/>商户"]
        Acquirer["Acquirer<br/>收单行"]
        CardNetwork["Card Network<br/>Visa / MC"]
        KUN["KUN<br/>Issuer Gateway"]
        Cobo["Cobo<br/>Custody"]
        IssuerBank["Issuer Funding Channel<br/>发卡侧资金通道"]
    end

    subgraph ACCT[" Accounts & Asset Containers "]
        direction TB
        Pool["AIX Pool Account<br/>主资金池"]
        IssuerFloat["Issuer Float Account<br/>发卡侧备付资金"]
    end

    Customer -->|1. 发起交易| Merchant
    Merchant -->|2. Auth 请求| Acquirer
    Acquirer -->|3. 转发 Auth| CardNetwork
    CardNetwork -->|4. 路由至发卡侧| KUN
    KUN -->|5. 转发 Auth| Platform
    Platform -->|6. Hold（冻结金额）| Ledger
    Platform -->|7. Auth 决策| KUN
    KUN -->|8. 回传 Auth| CardNetwork
    CardNetwork -->|9. 返回结果| Acquirer
    Acquirer -->|10. 通知商户| Merchant

    Merchant -->|11. Capture（商户请款）| Acquirer
    Acquirer -->|12. 提交 Capture| CardNetwork
    CardNetwork -->|13. 下发 Clearing Record| KUN
    KUN -->|14. 转发 Clearing 数据| Platform
    Platform -->|15. Capture / Adjust（账本正式扣账）| Ledger

    Platform -->|16. Funding Instruction| Cobo
    Cobo -.->|17. 从资金池转出稳定币| Pool
    Cobo -->|18. 经外部兑换 / 银行通道接入 issuer funding| IssuerBank
    IssuerBank -.->|19. 资金补足至 Issuer Float| IssuerFloat
    CardNetwork -.->|20. 发起 Settlement Cycle| IssuerFloat

    classDef user fill:#5a5a5a,stroke:#333,color:#fff;
    classDef aix fill:#1652b8,stroke:#0d47a1,color:#fff;
    classDef external fill:#1f8f6b,stroke:#155d45,color:#fff;
    classDef custody fill:#5b1fb5,stroke:#4a148c,color:#fff;
    classDef wallet fill:#efe6c8,stroke:#d6a11a,color:#222;

    class Customer,Merchant user;
    class Acquirer,CardNetwork,IssuerBank external;
    class KUN external;
    class Platform,Ledger aix;
    class Cobo custody;
    class Pool,IssuerFloat wallet;

    style CH fill:none,stroke:none
    style ORCH fill:none,stroke:#1652b8,stroke-width:2px,stroke-dasharray: 5 5
    style CTRL fill:none,stroke:#1652b8,stroke-width:2px,stroke-dasharray: 5 5
    style EXT fill:none,stroke:#1f8f6b,stroke-width:2px,stroke-dasharray: 5 5
    style ACCT fill:#fdfdfd,stroke:#bbb,stroke-dasharray: 3 3
```





#### Flow 6：Card Refund & Dispute（退款与争议处理）

**核心逻辑**：退款和争议均为异步流程。退款由商户发起，争议（Chargeback）由用户发起。AIX Platform 负责流程编排、账本更新及资金对齐。

**场景 A：商户主动退款 (Refund)**  
**业务含义**：退款是商户触发、发卡侧回传、AIX 先更新用户账务、后完成资金对齐的异步流程。

**业务交互结构图（Mermaid `flowchart`）**：展示从商户发起退款到 AIX 账本更新及资金回补的闭环。

```mermaid
flowchart LR
    subgraph CH[" Customer & Channel "]
        direction TB
        User["Customer<br/>用户"]
        App_R["AIX App<br/>用户端应用"]
    end

    subgraph ORCH[" AIX Orchestration "]
        direction TB
        Platform_R["AIX Platform<br/>业务中台"]
    end

    subgraph CTRL[" AIX Ledger & Controls "]
        direction TB
        Ledger_R["AIX Ledger<br/>核心账本"]
    end

    subgraph EXT[" External Partners "]
        direction TB
        Merchant["Merchant<br/>商户"]
        Acquirer["Acquirer<br/>收单行"]
        CardNetwork["Card Network<br/>Visa / MC"]
        KUN_R["KUN<br/>Issuer Gateway"]
        IssuerBank_R["Issuer Bank /<br/>Settlement System"]
    end

    subgraph ACCT[" Accounts & Asset Containers "]
        direction TB
        IssuerFloat_R["Issuer Float Account<br/>发卡侧备付资金"]
        AIXTreasury_R["AIX Pool Account<br/>主资金池"]
    end

    User -->|1. 向商户申请退款| Merchant
    Merchant -->|2. 发起 Refund 请求| Acquirer
    Acquirer -->|3. 提交退款清算信息| CardNetwork
    CardNetwork -->|4. 退款信息发送至发卡侧| KUN_R
    KUN_R -->|5. Refund Webhook| Platform_R
    Platform_R -->|6. 关联原交易并确认退款金额| Platform_R
    Platform_R -->|7. 给用户入账 / 更新余额| Ledger_R
    Platform_R -->|8. 更新退款结果状态| App_R
    CardNetwork -.->|9. Card Network 下发退款清算信息| IssuerBank_R
    IssuerBank_R -->|10. 退款资金结算至 Issuer Float| IssuerFloat_R
    IssuerFloat_R -->|11. 退款资金回补至 AIX Pool| AIXTreasury_R
    AIXTreasury_R -.->|12. 完成账务与资金对齐| Ledger_R

    classDef user fill:#5a5a5a,stroke:#333,color:#fff;
    classDef aix fill:#1652b8,stroke:#0d47a1,color:#fff;
    classDef external fill:#1f8f6b,stroke:#155d45,color:#fff;
    classDef wallet fill:#efe6c8,stroke:#d6a11a,color:#222;

    class User,Merchant user;
    class Acquirer,CardNetwork,IssuerBank_R external;
    class KUN_R external;
    class App_R,Platform_R,Ledger_R aix;
    class AIXTreasury_R,IssuerFloat_R wallet;

    style CH fill:none,stroke:none
    style ORCH fill:none,stroke:#1652b8,stroke-width:2px,stroke-dasharray: 5 5
    style CTRL fill:none,stroke:#1652b8,stroke-width:2px,stroke-dasharray: 5 5
    style EXT fill:none,stroke:#1f8f6b,stroke-width:2px,stroke-dasharray: 5 5
    style ACCT fill:#fdfdfd,stroke:#bbb,stroke-dasharray: 3 3
```



**场景 B：用户发起争议 (Dispute / Chargeback)**  
**业务含义**：争议是用户触发、平台判断是否满足发起条件、卡组织和收单侧完成举证裁定、AIX 再进行账务调整的异步流程。

**业务交互结构图（Mermaid `flowchart`）**：展示从用户发起争议到最终资金回补的闭环。

```mermaid
flowchart LR
    subgraph CH[" Customer & Channel "]
        direction TB
        User_D["Customer<br/>用户"]
        App_D["AIX App<br/>用户端应用"]
    end

    subgraph ORCH[" AIX Orchestration "]
        direction TB
        Platform_D["AIX Platform<br/>业务中台"]
    end

    subgraph CTRL[" AIX Ledger & Controls "]
        direction TB
        Ledger_D["AIX Ledger<br/>核心账本"]
    end

    subgraph EXT[" External Partners "]
        direction TB
        KUN_D["KUN<br/>Issuer Gateway"]
        CardNetwork_D["Card Network<br/>Visa / MC"]
        Acquirer_D["Acquirer<br/>收单行"]
        Merchant_D["Merchant<br/>商户"]
        IssuerBank_D["Issuer Bank /<br/>Settlement System"]
    end

    subgraph ACCT[" Accounts & Asset Containers "]
        direction TB
        IssuerFloat_D["Issuer Float Account<br/>发卡侧备付资金"]
        AIXTreasury_D["AIX Pool Account<br/>主资金池"]
    end

    User_D -->|"1. 发起争议 (Dispute)"| App_D
    App_D -->|"2. 提交争议申请"| Platform_D
    Platform_D -->|"3. 发起 Chargeback (如满足条件)"| KUN_D

    KUN_D -->|"4. 提交 Chargeback"| CardNetwork_D
    CardNetwork_D -->|"5. 下发至收单侧"| Acquirer_D
    Acquirer_D -->|"6. 通知商户应诉"| Merchant_D
    Merchant_D -->|"7. 提交举证材料"| Acquirer_D
    Acquirer_D -->|"8. 回传举证材料"| CardNetwork_D
    CardNetwork_D -->|"9. 返回 Chargeback 结果"| KUN_D
    KUN_D -->|"10. Result Webhook"| Platform_D

    CardNetwork_D -.->|"11. Card Network 下发争议清算信息"| IssuerBank_D
    IssuerBank_D -->|"12. 争议资金结算至 Issuer Float"| IssuerFloat_D
    IssuerFloat_D -->|"13. 资金回补至 AIX Pool"| AIXTreasury_D
    Platform_D -->|"14. 根据结果给用户入账 / 调整余额"| Ledger_D
    AIXTreasury_D -.->|"15. 完成争议账务与资金对齐"| Ledger_D
    Platform_D -->|"16. 通知争议结果"| App_D

    classDef user fill:#5a5a5a,stroke:#333,color:#fff;
    classDef aix fill:#1652b8,stroke:#0d47a1,color:#fff;
    classDef external fill:#1f8f6b,stroke:#155d45,color:#fff;
    classDef wallet fill:#efe6c8,stroke:#d6a11a,color:#222;

    class User_D,Merchant_D user;
    class Acquirer_D,CardNetwork_D,IssuerBank_D external;
    class KUN_D external;
    class App_D,Platform_D,Ledger_D aix;
    class AIXTreasury_D,IssuerFloat_D wallet;

    style CH fill:none,stroke:none
    style ORCH fill:none,stroke:#1652b8,stroke-width:2px,stroke-dasharray: 5 5
    style CTRL fill:none,stroke:#1652b8,stroke-width:2px,stroke-dasharray: 5 5
    style EXT fill:none,stroke:#1f8f6b,stroke-width:2px,stroke-dasharray: 5 5
    style ACCT fill:#fdfdfd,stroke:#bbb,stroke-dasharray: 3 3
```




#### Flow 7：Card Management (Freeze, Unfreeze, Replace)（卡片管理）

**核心逻辑**：支持用户主动通过 App 进行卡片生命周期管理（激活、设置/修改 PIN、锁定/解锁、换卡）。AIX Platform 负责业务编排与 KUN 对接，AIX Ledger 负责换卡时的账户绑定迁移。

**业务交互结构图（Mermaid `flowchart`）**：展示从用户发起操作到 KUN 执行及账本同步的完整链路。

```mermaid
flowchart LR
    subgraph CH[" Customer & Channel "]
        direction TB
        Customer["Customer<br/>用户"]
        App["AIX App<br/>用户端应用"]
    end

    subgraph ORCH[" AIX Orchestration "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]
    end

    subgraph CTRL[" AIX Ledger & Controls "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]
    end

    subgraph EXT[" External Partners "]
        direction TB
        KUN["KUN<br/>Issuer Gateway"]
    end

    Customer -->|"1. 发起卡管理操作"| App
    App -->|"2. 操作请求提交"| Platform
    Platform -->|"3. 提交卡管理操作<br/>(Activation / Set PIN / Change PIN / Lock / Unlock / Replace)"| KUN
    KUN -->|"4. 操作结果返回 / 状态回传"| Platform
    Platform -->|"5. 更新绑定关系（仅 Replace）"| Ledger
    Platform -->|"6. 状态同步"| App
    App -->|"7. 结果展示"| Customer

    %% 样式美化
    classDef user fill:#5a5a5a,stroke:#333,color:#fff;
    classDef aix fill:#1652b8,stroke:#0d47a1,color:#fff;
    classDef external fill:#1f8f6b,stroke:#155d45,color:#fff;

    class Customer user;
    class App,Platform aix;
    class Ledger aix;
    class KUN external;

    style CH fill:none,stroke:none
    style ORCH fill:none,stroke:#1652b8,stroke-width:2px,stroke-dasharray: 5 5
    style CTRL fill:none,stroke:#1652b8,stroke-width:2px,stroke-dasharray: 5 5
    style EXT fill:none,stroke:#1f8f6b,stroke-width:2px,stroke-dasharray: 5 5
```




#### Flow 8：Token Swapping（内部代币兑换）

**核心逻辑**：零 Gas 费、秒级成交的内部账本转换，不发生真实链上交易。AIX Platform 负责报价与编排，AIX Ledger 负责原子记账并维护内部头寸账户。

**业务交互结构图（Mermaid `flowchart`）**：展示用户发起兑换到账本原子记账的实时链路。

```mermaid
flowchart LR
    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef app fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef asset fill:#F8FAFC,stroke:#64748B,color:#111827,stroke-width:1.2px;

    subgraph CH[" Customer & Channel "]
        direction TB
        User["Customer<br/>用户"]:::user
        App["AIX App<br/>用户端应用"]:::app
    end
    
    subgraph ORCH[" AIX Orchestration "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::app
    end
    
    subgraph CTRL[" AIX Ledger & Controls "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
    end

    subgraph ACCT[" Accounts & Asset Containers "]
        direction LR
        UserBal["User Balance Accounts<br/>用户余额账户"]:::asset
        Settle["AIX Settlement Account<br/>内部清算位"]:::asset
        Inventory["AIX Inventory Account<br/>内部头寸账户"]:::asset
    end
    
    User -->|"1. 发起内部兑换请求"| App
    App -->|"2. 提交兑换请求"| Platform
    Platform -->|"3. 提交兑换执行指令"| Ledger
    Ledger -->|"4. 扣减卖出币种余额"| UserBal
    Ledger -->|"5. 增加买入币种余额"| UserBal
    Ledger -->|"6. 记录兑换交易"| Settle
    Ledger -->|"7. 更新内部头寸"| Inventory

    style CH fill:none,stroke:none
    style ORCH fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
    style CTRL fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
    style ACCT fill:none,stroke:#ccc,stroke-dasharray: 5 5
```


#### Flow 9：Yield Subscription / Redemption（生息产品的申购与赎回）

**核心逻辑**：用户侧实现“活期秒退”的账本划转，平台侧通过资金池缓冲（Liquidity Buffer）异步投资底层资产。AIX Platform 负责业务编排与调仓触发，AIX Ledger 负责钱包余额、收益余额与头寸状态的映射记账。

**业务交互结构图（Mermaid `flowchart`）**：展示用户账务侧与底层调仓侧的解耦链路。

```mermaid
flowchart LR
    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef external fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef asset fill:#F8FAFC,stroke:#64748B,color:#111827,stroke-width:1.2px;

    subgraph CH[" Customer & Channel "]
        direction TB
        Customer["Customer<br/>用户"]:::user
        App["AIX App<br/>用户端应用"]:::aix
    end

    subgraph ORCH[" AIX Orchestration "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end

    subgraph CTRL[" AIX Ledger & Controls "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
    end

    subgraph EXT[" External Partners "]
        direction TB
        Cobo["Cobo<br/>Custody"]:::external
        YieldProvider["Yield Provider<br/>底层生息机构"]:::external
    end

    subgraph ACCT[" Accounts & Asset Containers "]
        direction LR
        WalletBalance["Wallet Balance Account<br/>钱包余额账户"]:::asset
        YieldBalance["Yield Balance Account<br/>收益余额账户"]:::asset
        Pool["AIX Pool Account<br/>资金池账户"]:::asset
        YieldAccount["AIX Yield Account<br/>收益账户"]:::asset
    end

    Customer -->|"1. 发起申购 / 赎回请求"| App
    App -->|"2. 提交申赎请求"| Platform
    Platform -->|"3. 记录申赎指令"| Ledger
    Ledger -->|"4. 更新 Wallet Balance"| WalletBalance
    Ledger -->|"5. 更新 Yield Balance"| YieldBalance
    Platform -.->|"6. 触发调仓"| Cobo
    Cobo -.->|"7. 执行申购 / 赎回指令"| YieldProvider
    Pool -.->|"8. 资金调拨"| YieldAccount
    YieldAccount -.->|"9. 底层申购 / 赎回"| YieldProvider
    Cobo -->|"10. 回传调仓结果"| Platform
    Platform -.->|"11. 更新头寸与调仓状态"| Ledger

    style CH fill:none,stroke:none
    style ORCH fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
    style CTRL fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
    style EXT fill:none,stroke:#ccc,stroke-dasharray: 5 5
    style ACCT fill:none,stroke:#ccc,stroke-dasharray: 5 5
```



**关键约束**：

- **资金池模式**：底层资产方仅对接 AIX 机构账户，不感知散户。
- **消费隔离**：`Yield Balance` 不能直接用于刷卡消费，必须先赎回到 `Wallet Balance`。
- **流动性缓冲**：平台需维持一定比例的 `Pool Account` 余额，以支持散户的实时赎回需求。
- **调仓周期**：外部 B2B 调仓通常为 T+1 或定时批处理，与散户端的 T+0 体验通过内部账本解耦。

### 5.2 系统能力层 (System Capability Flows)

本节为对用户不可见的后台系统能力，支撑风控、流动性与账务一致性。

#### Flow 10：Inventory Rebalancing（头寸补仓）

**核心逻辑**：当内部头寸账户（Inventory Account）的某一币种余额低于安全阈值时，由平台侧自动或人工触发外部流动性补仓。该过程异步进行，不影响用户端的实时兑换体验。

**业务交互结构图（Mermaid `flowchart`）**：展示从头寸监控到外部补仓回写的系统后台链路。

```mermaid
flowchart LR
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef external fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef asset fill:#F8FAFC,stroke:#64748B,color:#111827,stroke-width:1.2px;

    subgraph ORCH[" AIX Orchestration "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    
    subgraph CTRL[" AIX Ledger & Controls "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
    end

    subgraph EXT[" External Partners "]
        direction TB
        Ramp["Liquidity Partner (e.g. QCP)<br/>外部流动性供应商"]:::external
    end

    subgraph ACCT[" Accounts & Asset Containers "]
        direction LR
        Inventory["AIX Inventory Account<br/>内部头寸账户"]:::asset
        Pool["AIX Pool Account<br/>主资金池"]:::asset
    end
    
    Ledger -->|"1. 监控头寸水位"| Inventory
    Inventory -.->|"2. 触发低水位告警"| Platform
    Platform -->|"3. 向供应商请求报价/下单"| Ramp
    Ramp -->|"4. 物理资金划转"| Pool
    Platform -->|"5. 更新内部头寸与补仓记录"| Ledger
    Ledger -->|"6. 增加头寸余额"| Inventory

    style ORCH fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
    style CTRL fill:none,stroke:#4aa3ff,stroke-dasharray: 5 5
    style EXT fill:none,stroke:#ccc,stroke-dasharray: 5 5
    style ACCT fill:none,stroke:#ccc,stroke-dasharray: 5 5
```

**关键约束**：
- **库存管理**：AIX 内部头寸账户需实时监控各币种库存，确保内部流动性充足。

---

## 六、外部依赖和约束

本方案的实施与运行高度依赖下列外部合作方及技术约束：

1. **持牌网关 (KUN)**：依赖 KUN 提供的 BIN Sponsor 资质及交易处理接口。若 KUN 侧服务中断或牌照变更，将直接影响卡片发行与消费授权。
2. **数字资产托管 (Cobo)**：依赖 Cobo 的 MPC 钱包技术与链上交互 API。私钥管理安全与链上转账时效由其保障。
3. **合规插件 (Chainalysis & Notabene)**：依赖 KYT 风险评分与 Travel Rule 报文交换。合规策略的配置需与 AIX 内部风控逻辑深度对齐。
4. **卡组织规范 (Visa / Mastercard)**：所有卡业务逻辑必须遵循卡组织的实时授权 SLA（如 <200ms 响应）及清算结算规则。
5. **网络与延迟**：跨境支付场景对网络延迟极其敏感，AIX 与各 Vendor 间的 API 调用需具备高可用性与低延迟保障。

---

## 七、不确定性和风险

针对 Phase 2 交付，需关注以下核心不确定性与风险：

1. **合规政策波动**：不同司法辖区对稳定币及加密资产支付的监管政策处于动态调整中，可能导致部分市场准入延迟或合规成本上升。
2. **多方集成复杂度**：方案涉及 KUN、Cobo、KYT、Travel Rule 等多个外部系统，任何一方的接口变更或联调进度滞后都可能推迟 MVP 交付。
3. **汇率敞口风险**：在 Auth 冻结与 Capture 清算的时间差内，稳定币与法币间的汇率波动由平台承担（Float 模型），需建立完善的对冲或库存管理机制。
4. **流动性风险**：若生息产品（Yield）出现大规模集中赎回，且平台资金池（Pool Account）缓冲不足，可能面临实时赎回降级为 T+N 的风险。
5. **资金对账闭环**：多币种、多账户、多合作方的复杂账务体系下，需确保 AIX Ledger 与外部余额报告的每日对账 100% 准确，防范资金损失。

---

