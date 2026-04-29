#!/usr/bin/env python3
"""
Flow 1（开户与 KYC）在概要设计分章中维护为 **两张** Mermaid：
  1) flowchart — 业务交互结构图
  2) sequenceDiagram — 系统时序图（与结构图同一 8 步）

单一事实来源：
  docs/aix-phase2/solution-design/chapters/05-money-flows.md
  → 「Flow 1：Account Opening & KYC」内的两个 ```mermaid 代码块。

装订合并稿：
  bash scripts/assemble-solution-design.sh
"""

MERMAID_STRUCTURE = r'''```mermaid
flowchart LR
  c[Customer<br/>用户]
  app[AIX App<br/>用户端应用]
  plat[AIX Platform<br/>核心账本与风控系统]
  kun[KUN<br/>卡发行与合规网关]
  aai[AAI<br/>身份核验服务商]

  c -->|① 发起开户申请| app
  app -->|② 提交开户审核请求| plat
  plat -->|③ 请求身份核验服务| kun
  app -.->|④ 通过 SDK/H5 上传证件、人脸、地址证明<br/>（敏感数据不经 Platform）| aai
  aai -->|⑤ 返回采集结果| kun
  kun -->|⑥ 通知审核结果（通过/拒绝）| plat
  plat -->|⑦ 开通账户功能| plat
  plat -->|⑧ 通知开户结果（通过/拒绝）| app

  classDef user fill:#4D4D4D,stroke:#333333,color:#fff
  classDef aix fill:#1459C7,stroke:#0D4CAE,color:#fff
  classDef kun fill:#238B68,stroke:#155D45,color:#fff
  classDef aai fill:#6B46C1,stroke:#4A2B8C,color:#fff
  class c user
  class app,plat aix
  class kun kun
  class aai aai
```'''

MERMAID_SEQUENCE = r'''```mermaid
sequenceDiagram
    actor Customer as "Customer（用户）"
    participant App as "AIX App（用户端应用）"
    participant AIX as "AIX Platform（核心账本与风控系统）"
    participant KUN as "KUN（卡发行与合规网关）"
    participant AAI as "AAI（身份核验服务商）"

    Customer->>App: ① 发起开户申请
    App->>AIX: ② 提交开户审核请求
    AIX->>KUN: ③ 请求身份核验服务

    Note over App, AAI: 敏感数据直传，不经 Platform 后台
    App->>AAI: ④ 通过 SDK/H5 直接上传证件、人脸、地址证明（敏感数据不经 Platform）

    AAI->>KUN: ⑤ 返回采集结果
    KUN->>AIX: ⑥ 通知审核结果（通过/拒绝）
    AIX->>AIX: ⑦ 开通账户功能
    AIX->>App: ⑧ 通知开户结果（通过/拒绝）
```'''

if __name__ == "__main__":
    print(__doc__)
    print("--- 结构图 ---")
    print(MERMAID_STRUCTURE)
    print("--- 时序图 ---")
    print(MERMAID_SEQUENCE)
