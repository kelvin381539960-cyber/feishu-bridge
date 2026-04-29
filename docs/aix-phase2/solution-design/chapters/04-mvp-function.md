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
