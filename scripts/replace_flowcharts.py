import re
from pathlib import Path

content = Path("docs/aix-phase2/solution-design/chapters/05-money-flows.md").read_text()
blocks = re.findall(r'```mermaid\nflowchart.*?\n(.*?)```', content, re.DOTALL)

if len(blocks) != 10:
    print(f"Error: Expected 10 flowcharts, found {len(blocks)}")
    exit(1)

new_blocks = [
    # Flow 1
    """flowchart LR
    subgraph UserLayer [" 用户侧 "]
        direction TB
        Customer["Customer<br/>用户"]:::user
        App["AIX App<br/>用户端应用"]:::user
    end
    subgraph AIXLayer [" AIX 系统 "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    subgraph LedgerLayer [" 核心账本 (虚拟账户) "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
    end
    subgraph ExternalLayer [" 外部协作与合规 "]
        direction TB
        KUN["KUN<br/>发卡与合规网关"]:::external
        AAI["AAI<br/>身份核验服务商"]:::external
    end

    Customer -->|"① 发起开户申请"| App
    App -->|"② 提交开户审核请求"| Platform
    Platform -->|"③ 请求身份核验服务"| KUN
    App -.->|"④ 通过 SDK/H5 上传证件、人脸、地址证明<br/>（敏感数据不经 Platform）"| AAI
    AAI -->|"⑤ 返回采集结果"| KUN
    KUN -->|"⑥ 通知审核结果（通过/拒绝）"| Platform
    Platform -->|"⑦ 开通账户功能"| Ledger
    Platform -->|"⑧ 通知开户结果（通过/拒绝）"| App

    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef custody fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef external fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:1.5px;
    classDef asset fill:#FEF3C7,stroke:#D97706,color:#451A03,stroke-width:1.5px;
""",
    # Flow 2
    """flowchart LR
    subgraph UserLayer [" 用户侧 "]
        direction TB
        Customer["Customer<br/>用户"]:::user
    end
    subgraph AIXLayer [" AIX 系统 "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    subgraph LedgerLayer [" 核心账本 (虚拟账户) "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
    end
    subgraph CustodyLayer [" 链上托管与资金池 "]
        direction TB
        Cobo["Cobo<br/>链上资产托管"]:::custody
        Pool["AIX Pool Account<br/>主资金池"]:::asset
        Fee["AIX Fee Account<br/>手续费账户"]:::asset
    end
    subgraph ExternalLayer [" 外部协作与合规 "]
        direction TB
        KUN["KUN<br/>发卡与合规网关"]:::external
        Issue["Issue<br/>卡片发行处理商"]:::external
        Manufacturer["Card Manufacturer<br/>制卡商"]:::external
        Logistics["Logistics Provider<br/>物流商"]:::external
    end

    Customer -->|"① 申请开卡"| Platform
    Platform -->|"③ 提交开卡"| KUN
    KUN -->|"④ 开卡请求"| Issue
    Issue -->|"⑤ 开卡审核"| Issue
    Issue -->|"⑥ 通知开卡结果"| KUN
    KUN -->|"⑦ 通知开卡结果"| Platform
    Platform -->|"⑬ 通知开卡结果"| Customer

    Platform -->|"② 记账冻结手续费"| Ledger
    Platform -->|"⑧ 审核通过通知扣款"| Cobo
    Cobo -->|"⑩ 扣款结果返回"| Platform
    Ledger -->|"⑪ 冻结转扣"| Platform
    Ledger -->|"⑫ 更新余额"| Platform

    Pool -.->|"⑨ 划扣 fee 资金"| Fee
    Fee -.->|"MPC 控制链上钱包"| Cobo

    Issue -->|"⑭ 通知制卡（仅物理卡）"| Manufacturer
    Manufacturer -->|"⑮ 通知寄送卡"| Logistics
    Logistics -.->|"⑯ 寄送卡"| Customer
    Platform -->|"⑰ 查询物流状态"| Logistics
    Logistics -->|"⑱ 同步物流状态"| Platform
    Platform -->|"⑲ 同步物流状态"| Customer

    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef custody fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef external fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:1.5px;
    classDef asset fill:#FEF3C7,stroke:#D97706,color:#451A03,stroke-width:1.5px;
""",
    # Flow 3
    """flowchart LR
    subgraph CustodyLayer [" 链上托管与资金池 "]
        direction TB
        External["External Wallet<br/>外部钱包"]:::asset
        UserWallet["User On-chain Wallet<br/>用户充值地址"]:::asset
        Pool["AIX Pool Account<br/>主资金池"]:::asset
        Cobo["Cobo<br/>链上资产托管"]:::custody
    end
    subgraph AIXLayer [" AIX 系统 "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    subgraph LedgerLayer [" 核心账本 (虚拟账户) "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
    end
    subgraph ExternalLayer [" 外部协作与合规 "]
        direction TB
        Chainalysis["Chainalysis<br/>(KYT)"]:::external
        Notabene["Notabene<br/>(Travel Rule)"]:::external
    end

    External -->|"1. 链上入账"| UserWallet
    UserWallet -.->|"sweeping<br/>(异步归集)"| Pool
    
    UserWallet -->|"2. 入金通知"| Cobo
    Cobo -->|"3. 同步入金信息"| Platform

    Platform ---->|"4. 提交 KYT"| Chainalysis
    Chainalysis ---->|"5. 返回 KYT 结果"| Platform
    Platform ---->|"6. 提交 Travel Rule"| Notabene
    Notabene ---->|"7. 返回 TR 结果"| Platform

    Platform -->|"8. 记录待确认入账"| Ledger
    Ledger -->|"9. 更新入账状态"| Platform
    Platform -->|"10. 入账生效<br/>增加可用余额"| Ledger

    Platform -->|"11. 执行扣款指令"| Cobo
    Cobo -->|"12. 返回扣款结果"| Platform
    Platform -->|"13. 冻结转正式扣款"| Ledger

    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef custody fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef external fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:1.5px;
    classDef asset fill:#FEF3C7,stroke:#D97706,color:#451A03,stroke-width:1.5px;
""",
    # Flow 4
    """flowchart LR
    subgraph UserLayer [" 用户侧 "]
        direction TB
        Customer["Customer<br/>用户"]:::user
    end
    subgraph AIXLayer [" AIX 系统 "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    subgraph LedgerLayer [" 核心账本 (虚拟账户) "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
    end
    subgraph ExternalLayer [" 外部协作与合规 "]
        direction TB
        Chainalysis["Chainalysis<br/>(KYT)"]:::external
        Notabene["Notabene<br/>(Travel Rule)"]:::external
    end
    subgraph CustodyLayer [" 链上托管与资金池 "]
        direction TB
        Cobo["Cobo<br/>链上资产托管"]:::custody
        Pool["AIX Pool Account<br/>主资金池"]:::asset
        ExternalWallet["External Wallet<br/>外部钱包"]:::asset
    end

    Customer -->|"① 发起提现"| Platform
    Platform -->|"② 冻结提现金额"| Ledger
    
    Platform -->|"③ 提交 KYT"| Chainalysis
    Chainalysis -->|"④ 返回 KYT 结果"| Platform
    Platform -->|"⑤ 提交 Travel Rule"| Notabene
    Notabene -->|"⑥ 返回 TR 结果"| Platform
    
    Platform -->|"⑦ 发起链上转账指令"| Cobo
    Cobo -->|"⑧ 广播交易并返回 Hash"| Platform
    Pool -.->|"⑨ 资金划转"| ExternalWallet
    
    Platform -->|"⑩ 扣款 (Captured)"| Ledger
    Platform -->|"⑪ 通知提现成功"| Customer

    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef custody fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef external fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:1.5px;
    classDef asset fill:#FEF3C7,stroke:#D97706,color:#451A03,stroke-width:1.5px;
""",
    # Flow 6
    """flowchart LR
    subgraph UserLayer [" 用户侧 "]
        direction TB
        Customer["Customer<br/>用户"]:::user
    end
    subgraph ExternalLayer [" 外部协作与合规 "]
        direction TB
        Merchant["Merchant<br/>商户"]:::external
        Acquirer["Acquirer<br/>收单行"]:::external
        CardNetwork["Card Network<br/>Visa / MC"]:::external
        KUN["KUN<br/>发卡与合规网关"]:::external
        IssuerBank["Issuer Funding Channel<br/>发卡侧资金通道"]:::external
        IssuerFloat["Issuer Float Account<br/>发卡侧备付资金"]:::asset
    end
    subgraph AIXLayer [" AIX 系统 "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    subgraph LedgerLayer [" 核心账本 (虚拟账户) "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
    end
    subgraph CustodyLayer [" 链上托管与资金池 "]
        direction TB
        Pool["AIX Pool Account<br/>主资金池"]:::asset
        Cobo["Cobo<br/>链上资产托管"]:::custody
    end

    Customer -->|"1. 发起交易"| Merchant
    Merchant -->|"2. Auth 请求"| Acquirer
    Acquirer -->|"3. 转发 Auth"| CardNetwork
    CardNetwork -->|"4. 路由至发卡侧"| KUN
    KUN -->|"5. 转发 Auth"| Platform
    Platform -->|"6. Hold（冻结金额）"| Ledger
    Platform -->|"7. Auth 决策"| KUN
    KUN -->|"8. 回传 Auth"| CardNetwork
    CardNetwork -->|"9. 返回结果"| Acquirer
    Acquirer -->|"10. 通知商户"| Merchant

    Merchant -->|"11. Capture（商户请款）"| Acquirer
    Acquirer -->|"12. 提交 Capture"| CardNetwork

    CardNetwork -->|"13. 下发 Clearing Record"| KUN
    KUN -->|"14. 转发 Clearing 数据"| Platform
    Platform -->|"15. Capture / Adjust（账本正式扣账）"| Ledger

    Platform -->|"16. Funding Instruction"| Cobo
    Pool -.->|"17. 由 Cobo 执行资金池出金"| Cobo
    Cobo -->|"18. 经外部兑换 / 银行通道接入 issuer funding"| IssuerBank
    IssuerBank -->|"19. 资金补足至 Issuer Float"| IssuerFloat

    CardNetwork -->|"20. 发起 Settlement Cycle（结算周期触发）"| IssuerFloat
    IssuerFloat -.->|"21. Settlement 执行（资金清算）"| CardNetwork

    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef custody fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef external fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:1.5px;
    classDef asset fill:#FEF3C7,stroke:#D97706,color:#451A03,stroke-width:1.5px;
""",
    # Flow 7 (Refund)
    """flowchart LR
    subgraph UserLayer [" 用户侧 "]
        direction TB
        User["Customer<br/>用户"]:::user
    end
    subgraph ExternalLayer [" 外部协作与合规 "]
        direction TB
        Merchant["Merchant<br/>商户"]:::external
        Acquirer["Acquirer<br/>收单行"]:::external
        CardNetwork["Card Network<br/>Visa / MC"]:::external
        KUN["KUN<br/>发卡与合规网关"]:::external
        IssuerBank["Issuer Bank /<br/>Settlement System"]:::external
        IssuerFloat["Issuer Float Account<br/>发卡侧备付资金"]:::asset
    end
    subgraph AIXLayer [" AIX 系统 "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    subgraph LedgerLayer [" 核心账本 (虚拟账户) "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
        AIXTreasury["AIX Treasury Account<br/>AIX 财库账户"]:::ledger
    end

    Merchant -->|"1. 发起退款 (Refund)"| Acquirer
    Acquirer -->|"2. 提交退款请求"| CardNetwork
    CardNetwork -->|"3. 路由至发卡侧"| KUN
    KUN -->|"4. 转发 Refund Webhook"| Platform
    Platform -->|"5. 校验原交易"| Platform
    Platform -->|"6. 确认退款接收"| KUN
    Platform -->|"7. 给用户入账 / 更新余额"| Ledger
    Platform -->|"8. 更新退款结果状态"| User

    CardNetwork -.->|"9. Card Network 下发退款清算信息"| IssuerBank
    IssuerBank -->|"10. 退款资金结算至 Issuer Float"| IssuerFloat
    IssuerFloat -->|"11. 退款资金回补至 AIX Treasury"| AIXTreasury
    AIXTreasury -.->|"12. 完成账务与资金对齐"| Ledger

    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef custody fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef external fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:1.5px;
    classDef asset fill:#FEF3C7,stroke:#D97706,color:#451A03,stroke-width:1.5px;
""",
    # Flow 7 (Dispute)
    """flowchart LR
    subgraph UserLayer [" 用户侧 "]
        direction TB
        User["Customer<br/>用户"]:::user
    end
    subgraph ExternalLayer [" 外部协作与合规 "]
        direction TB
        Merchant["Merchant<br/>商户"]:::external
        Acquirer["Acquirer<br/>收单行"]:::external
        CardNetwork["Card Network<br/>Visa / MC"]:::external
        KUN["KUN<br/>发卡与合规网关"]:::external
        IssuerBank["Issuer Bank /<br/>Settlement System"]:::external
        IssuerFloat["Issuer Float Account<br/>发卡侧备付资金"]:::asset
    end
    subgraph AIXLayer [" AIX 系统 "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    subgraph LedgerLayer [" 核心账本 (虚拟账户) "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
        AIXTreasury["AIX Treasury Account<br/>AIX 财库账户"]:::ledger
    end

    User -->|"1. 发起争议 (Dispute)"| Platform
    Platform -->|"2. 发起 Chargeback (如满足条件)"| KUN

    KUN -->|"3. 提交 Chargeback"| CardNetwork
    CardNetwork -->|"4. 下发至收单侧"| Acquirer
    Acquirer -->|"5. 通知商户应诉"| Merchant
    Merchant -->|"6. 提交举证材料"| Acquirer
    Acquirer -->|"7. 回传举证材料"| CardNetwork
    CardNetwork -->|"8. 返回 Chargeback 结果"| KUN
    KUN -->|"9. Result Webhook"| Platform

    CardNetwork -.->|"10. Card Network 下发争议清算信息"| IssuerBank
    IssuerBank -->|"11. 争议资金结算至 Issuer Float"| IssuerFloat
    IssuerFloat -->|"12. 资金回补至 AIX Treasury"| AIXTreasury

    Platform -->|"13. 根据结果给用户入账 / 调整余额"| Ledger
    AIXTreasury -.->|"14. 完成争议账务与资金对齐"| Ledger

    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef custody fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef external fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:1.5px;
    classDef asset fill:#FEF3C7,stroke:#D97706,color:#451A03,stroke-width:1.5px;
""",
    # Flow 8
    """flowchart LR
    subgraph UserLayer [" 用户侧 "]
        direction TB
        Customer["Customer<br/>用户"]:::user
        App["AIX App<br/>用户端应用"]:::user
    end
    subgraph AIXLayer [" AIX 系统 "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    subgraph LedgerLayer [" 核心账本 (虚拟账户) "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
    end
    subgraph ExternalLayer [" 外部协作与合规 "]
        direction TB
        KUN["KUN<br/>发卡与合规网关"]:::external
    end

    Customer -->|"1. 发起卡管理操作"| App
    App -->|"2. 操作请求提交"| Platform

    Platform -->|"3. 提交卡管理操作<br/>(Activation / Set PIN / Change PIN / Lock / Unlock / Replace)"| KUN
    KUN -->|"4. 操作结果返回 / 状态回传"| Platform

    Platform -->|"5. 账户绑定迁移（仅 Replace）"| Ledger

    Platform -->|"6. 状态同步"| App
    App -->|"7. 结果展示"| Customer

    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef custody fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef external fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:1.5px;
    classDef asset fill:#FEF3C7,stroke:#D97706,color:#451A03,stroke-width:1.5px;
""",
    # Flow 9
    """flowchart LR
    subgraph UserLayer [" 用户侧 "]
        direction TB
        User["Customer<br/>用户"]:::user
        App["AIX App<br/>用户端应用"]:::user
    end
    subgraph AIXLayer [" AIX 系统 "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    subgraph LedgerLayer [" 核心账本 (虚拟账户) "]
        direction LR
        UserBal["User Balance Accounts<br/>用户余额账户"]:::ledger
        Settle["AIX Settlement Account<br/>内部清算位"]:::ledger
        OTC["AIX OTC Account<br/>OTC 头寸账户"]:::ledger
    end
    subgraph CustodyLayer [" 链上托管与资金池 "]
        direction LR
        Pool["AIX Pool Account<br/>主资金池"]:::asset
    end
    subgraph ExternalLayer [" 外部协作与合规 "]
        direction LR
        Ramp["Off & On Ramps<br/>法币出入金渠道"]:::external
    end

    User -->|"1. 发起内部兑换请求"| App
    App -->|"2. 提交兑换请求"| Platform

    Platform -->|"3. 扣减卖出币种余额"| UserBal
    Platform -->|"4. 记录兑换交易"| Settle
    Settle -->|"5. 记录 OTC 转换头寸"| OTC
    Platform -->|"6. 增加买入币种余额"| UserBal

    Platform -.->|"7. 库存低于阈值，触发补仓"| Ramp
    Ramp -.->|"8. 补充目标币种流动性"| Pool
    Pool -.->|"9. 更新 OTC 库存头寸"| OTC

    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef custody fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef external fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:1.5px;
    classDef asset fill:#FEF3C7,stroke:#D97706,color:#451A03,stroke-width:1.5px;
""",
    # Flow 10
    """flowchart LR
    subgraph UserLayer [" 用户侧 "]
        direction TB
        Customer["Customer<br/>用户"]:::user
    end
    subgraph AIXLayer [" AIX 系统 "]
        direction TB
        Platform["AIX Platform<br/>业务中台"]:::aix
    end
    subgraph LedgerLayer [" 核心账本 (虚拟账户) "]
        direction TB
        Ledger["AIX Ledger<br/>核心账本"]:::ledger
        UserWallets["User Balance Accounts<br/>用户余额账户"]:::ledger
        YieldAccount["AIX Yield Account<br/>收益映射账户"]:::ledger
    end
    subgraph CustodyLayer [" 链上托管与资金池 "]
        direction TB
        Pool["AIX Pool Account<br/>主资金池"]:::asset
        Cobo["Cobo<br/>链上资产托管"]:::custody
    end
    subgraph ExternalLayer [" 外部协作与合规 "]
        direction TB
        YieldProvider["External Yield Account<br/>外部收益账户 (digiFT/Ondo)"]:::external
    end

    Customer -->|"1. 发起申购 / 赎回请求"| Platform
    Platform -->|"2. 记录申购 / 赎回交易"| Ledger
    Ledger -->|"3. 更新钱包 / 收益账户映射"| Platform
    Platform -->|"4. 返回申购 / 赎回结果"| Customer

    Ledger -.->|"5. 触发申购 / 赎回调仓"| Platform
    Platform -.->|"6. 发起调仓请求"| Cobo
    Cobo -->|"7. 执行申购 / 赎回指令"| YieldProvider
    YieldProvider -->|"8. 返回执行结果"| Cobo
    Cobo -->|"9. 回传执行结果"| Platform
    Platform -.->|"10. 更新收益头寸映射"| Ledger

    UserWallets -.->|"11. 资金归集"| Pool
    Pool -.->|"12. 分配至收益账户"| YieldAccount
    YieldAccount -->|"13. 执行申购"| YieldProvider
    YieldProvider -->|"14. 收益回流 / 执行赎回"| YieldAccount
    YieldAccount -->|"15. 流动性回补至资金池"| Pool

    classDef user fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:1.5px;
    classDef aix fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E,stroke-width:1.5px;
    classDef ledger fill:#EEF2FF,stroke:#6366F1,color:#312E81,stroke-width:1.5px;
    classDef custody fill:#F5F3FF,stroke:#8B5CF6,color:#4C1D95,stroke-width:1.5px;
    classDef external fill:#F1F5F9,stroke:#64748B,color:#0F172A,stroke-width:1.5px;
    classDef asset fill:#FEF3C7,stroke:#D97706,color:#451A03,stroke-width:1.5px;
"""
]

for i in range(10):
    old_block = f"```mermaid\nflowchart{blocks[i]}```"
    new_block = f"```mermaid\n{new_blocks[i]}```"
    content = content.replace(old_block, new_block)

Path("docs/aix-phase2/solution-design/chapters/05-money-flows.md").write_text(content)
print("Successfully replaced all 10 flowcharts.")
