> **归档说明**：本文件为原「五、内部资金与流动性管理 (Internal Treasury Flows)」全文备份。  
> 该章节已从汇总稿 `solution-design.md` / `solution-design.html` 的装配列表中移除（不再纳入终稿目录）。  
> 归档日期以 Git 历史为准。

## 五、内部资金与流动性管理 (Internal Treasury Flows)

本章节定义了对用户透明，但对平台平稳运行至关重要的 3 条 B2B 资金管理流程。

#### Flow 11：Auto Top-up (Withdrawal Wallet Liquidity)（提现热钱包自动调拨）

**核心逻辑**：保证公共提现热钱包水位充足，同时控制热钱包资金敞口防范安全风险。

```mermaid
sequenceDiagram
    autonumber
    participant Monitor as AIX Treasury Monitor
    participant Pool as Cobo (Pool Account)
    participant Hot as Cobo (Withdrawal Wallet)

    Monitor->>Hot: 定时轮询热钱包余额
    
    alt 余额低于安全阈值 (Low Watermark)
        Monitor->>Monitor: 触发自动调拨警报
        Monitor->>Pool: API: 发起内部转账指令
        Pool-->>Hot: [资金流] 链上或 Cobo 内部划转补充资金
        Monitor->>Monitor: 记录调拨日志
    end
```

**关键约束**：
- **风控拦截**：设置单日最大自动调拨额度，超额必须转为人工多签（Multi-sig）审批，防止系统被劫持。

#### Flow 12：Treasury Settlement (B2B Fiat/Crypto Rebalancing)（B2B 资金清算与对冲）

**核心逻辑**：将用户消费扣除的 Crypto 兑换为 Fiat，用于向垫付法币的合作伙伴（KUN / Thunes）进行 B2B 结算或补充备付金。

```mermaid
sequenceDiagram
    autonumber
    participant Treasury as AIX Treasury
    participant OTC as OTC / Liquidity Provider
    participant Bank as AIX Corporate Bank
    participant Partner as KUN / Payout Rail (Thunes)

    Treasury->>Treasury: 日终对账 (T+1): 计算 Fiat 总敞口
    
    Treasury->>OTC: [资金流] 提取 Crypto 发给 OTC 机构
    OTC-->>Bank: [资金流] OTC 机构电汇等值 Fiat 至 AIX 企业账户
    
    Treasury->>Partner: 获取对账单 (Settlement Invoice)
    Treasury->>Bank: 发起银行电汇指令
    Bank-->>Partner: [资金流] 结算 Fiat 至合作伙伴账户 (补充备付金)
```

**关键约束**：
- **汇率敞口**：用户消费汇率与 AIX 实际卖币汇率存在时间差，此汇率波动损益（P&L）由 AIX 承担。

#### Flow 13：Fee Collection & Revenue Sweeping（手续费收取与归集）

**核心逻辑**：将散落在各业务线（开卡费、提现费、Swap 点差）的利润，从客户资金池中物理剥离至公司收入账户，满足合规审计要求。

```mermaid
sequenceDiagram
    autonumber
    participant UserLedger as User Balance Ledger
    participant FeeLedger as AIX Fee Ledger (Internal)
    participant Pool as Cobo (Pool Account)
    participant Revenue as Cobo (Corporate Revenue Wallet)

    Note over UserLedger, FeeLedger: 阶段 A：实时记账
    UserLedger->>FeeLedger: 扣除用户手续费，记入内部 Fee Ledger
    
    Note over FeeLedger, Revenue: 阶段 B：定期物理归集
    FeeLedger->>FeeLedger: 结算周期到达，清零 Fee Ledger
    Pool-->>Revenue: [资金流] 从主资金池将等额利润物理划转至公司收入钱包
```

**关键约束**：
- **账实分离**：日常手续费仅为内部账本数字，必须通过定期的物理划转（Sweeping）实现公司自有资金与客户备付金（Client Funds）的严格隔离。
