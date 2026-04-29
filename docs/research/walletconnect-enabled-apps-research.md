# 哪些 App 具备 WalletConnect 功能（钱包端 / 应用端）

> 调研日期：2026-04-16 | 作者：Cursor Agent

归档路径：`docs/research/walletconnect-enabled-apps-research.md`

## 澄清假设与待确认问题

**关键假设（本报告据此展开）**

- 「**有 WalletConnect 功能**」区分两类：**(A) 钱包 App**（作为会话中的 **Wallet** 侧：扫码 / 深度链接批准连接并签名）；**(B) 链上应用 / 商户端 App**（作为 **dApp / 客户端** 侧：展示连接入口、生成 **WalletConnect URI / 二维码**）。两者都叫「接入了 WalletConnect」，但用户感知不同。
- 讨论范围以 **WalletConnect v2（Sign API / 当代 SDK 栈）** 为主；老版本 v1 已淘汰，**不应**再作为选型依据。
- 「App」包含 **移动端原生 App、浏览器扩展、桌面端、Web dApp**；**不做**「全球每一款钱包 2026-04-16 当日版本」的穷尽截图审计，**可核对清单**以 WalletConnect 官方生态目录与各方帮助文档为准。
- **交易所主站 App**是否展示「WalletConnect」取决于产品线（现货/钱包/Web3 模块）；本报告只列**行业常见形态**与核验方法，不把「某交易所一定支持」当作默认事实。

**如需更精准仍建议补充（不阻塞结论）**

- 你关心的是 **钱包侧**、**dApp 侧**，还是 **B 端支付（WalletConnect Pay）**？
- 目标链是 **EVM only** 还是 **Solana / Cosmos / 其他非 EVM**？
- 是否需要 **中国大陆应用商店可下载** 的专项清单？
- 是否需要把 **嵌入式钱包（Privy / Dynamic 等）** 与 **外部钱包** 分开统计？

---

## 1. 背景与定义

### 1.1 核心概念

- **WalletConnect** 是一套 **开源、中继（relay）辅助** 的 **钱包—应用连接协议**：应用侧生成 **wc:…** 形态的 **URI**，钱包侧读取 URI 后建立加密会话，从而在 **不导出私钥** 的前提下完成 **连接、签名、发交易** 等 JSON-RPC 能力（具体方法集由链与钱包实现决定）。
- **「有 WalletConnect 功能」在钱包 App 上**通常表现为：**设置 / 浏览器 / 发现页**里出现 **WalletConnect** 入口，或在 **相机扫码** 流程中可识别 **WalletConnect 二维码**；在 **dApp** 上则表现为连接面板里的 **WalletConnect** 选项（常伴随二维码或「复制到钱包打开」）。
- **WalletConnect Network / 生态规模**是动态统计：官方宣传页给出 **「80,000+ apps、700+ wallets」** 量级（统计口径可能随时间调整），因此**正确做法**是用 **WalletGuide / 官方目录**核对「某款钱包是否登记、支持哪些链」，而不是依赖一次性人工枚举列表。

### 1.2 历史沿革

- **v1 → v2**：早期 v1 以桥接移动端钱包访问桌面 dApp 为主；v2 引入更现代的 **多链命名空间（namespaces / CAIP-2 链标识）**、**会话生命周期管理** 与 **更安全的配对流程**，并成为当前 SDK 与钱包集成的事实标准。
- **品牌与产品演进**：生态中常见 **Reown AppKit（原 Web3Modal 一脉）** 等 SDK，文档明确写出通过 **WalletConnect Network** 连接 **数百个钱包**；这代表「WalletConnect 功能」越来越多以 **SDK + 网络目录** 交付，而非每家 dApp 自己维护钱包白名单。
- **从「连以太坊」到「多链」**：随着 **Solana、Bitcoin 等** 进入连接器矩阵，「支持 WalletConnect」不再等价于「只支持 EVM」；是否可用取决于 **钱包实现 + dApp 声明的 namespaces + 用户所选链** 三者交集。

---

## 2. 核心机制 / 工作原理

### 2.1 会话建立：URI、配对（pairing）与中继

- **应用侧**通过 SDK 生成 **WalletConnect URI**（常以 `wc:` 开头），在 Web 上常见为 **二维码**，在移动端可为 **深度链接 / 剪贴板粘贴**。
- **钱包侧**读取 URI 后，与用户确认 **会话提案（session proposal）**（包含链 ID、方法权限等），同意后建立 **持久会话**；会话消息经 **WalletConnect 中继网络**传输，**不**等于把密钥上传到服务器。
- **断开与重连**：会话可过期或被用户主动断开；再次连接需要重新走 **配对 / 批准** 流程，这是安全模型的一部分。

### 2.2 钱包端 vs 应用端：同一协议，两种产品形态

- **钱包 App**实现的是 **Wallet 角色**：负责 **展示人类可读的交易详情**、**请求用户授权签名**、管理 **多账户 / 多链切换**（若支持）。
- **dApp / 商户 App**实现的是 **Client / dApp 角色**：负责 **发起连接**、**发起签名与交易请求**；多数团队通过 **AppKit、ConnectKit、wagmi connector、Thirdweb、Privy、Dynamic** 等集成，而非从零手写协议。
- **硬件钱包 / 托管钱包**也可能出现在「钱包侧」：例如 **部分套件式 App** 通过二维码或桥接组件与 WalletConnect 会话对接（具体以厂商说明为准）。

### 2.3 与浏览器注入（window.ethereum）的关系

- **浏览器扩展钱包**常用 **EIP-1193 注入** 直连站点；**WalletConnect** 主要补齐 **移动端钱包 ↔ 桌面 Web**、**无注入环境 ↔ dApp** 的缺口。
- 许多产品会 **同时支持** 多种连接方式：**Injected、WalletConnect、Coinbase Smart Wallet、Email/Social** 等，并在 UI 层做降级。
- **安全提示**：用户应只批准 **自己主动发起** 的连接；钓鱼站点可能伪造连接面板，**域名验证 / 交易预览** 是钱包侧的重要防线（能力因钱包而异）。

---

## 3. 主流方案 / 实现对比

### 3.1 按产品类型的典型集成方式（对照表）

| 类型 | 是否典型具备「WalletConnect」入口 | 用户侧典型交互 | 核验建议 |
|------|-----------------------------------|----------------|----------|
| **自托管移动钱包**（MetaMask、Trust、Rainbow、imToken、OKX Wallet 等） | **高** | 扫码或 App 内粘贴 URI → 批准会话 → 签名 | 在 **WalletGuide** 搜索品牌；查官方帮助/博客 |
| **浏览器扩展 + 移动端配套** | **中–高** | 桌面 Web 显示二维码，手机钱包扫码 | 以各钱包「移动端连接桌面 dApp」文档为准 |
| **多链 DeFi / NFT 大型 dApp**（如 Uniswap 等） | **高**（作为 **dApp 侧**） | Web 上选 **WalletConnect** 连接手机钱包 | 查 dApp 官方支持文档 |
| **游戏 / Social / AI 类 Web3 应用** | **中** | 多数通过 **AppKit 类 SDK** 间接集成 | 看连接弹窗是否出现 WalletConnect / Reown |
| **交易所主 App（非 Web3 钱包模块）** | **低–中** | 若有 **Web3 钱包子应用** 更可能出现 | 以交易所「Web3 / DeFi / 钱包」产品说明为准 |
| **硬件钱包套件** | **中**（因厂商路线差异大） | 可能通过配套 App 扫码接入 | 查 Ledger / Trezor 等 **官方集成列表** |

### 3.2 代表性「钱包 App / 套件」（示例而非穷尽）

> 下列条目用于说明「行业头部常见支持」；**是否覆盖你的目标链**仍需以 WalletGuide/钱包官网为准。

| 品牌 / 产品 | 更常见的 WalletConnect 角色 | 可核对公开出处（类型） |
|-------------|------------------------------|-------------------------|
| **MetaMask**（移动端等） | Wallet：与 dApp 远程配对连接 | MetaMask 开发者文档体系（连接/多平台）与社区常见「扫码连接」流程说明 |
| **Trust Wallet** | Wallet：内置 WalletConnect 使用指南 | Trust Wallet 官方博客《How to Use WalletConnect With Trust Wallet》 |
| **Trust Developers** | Wallet / 集成参考：移动端 WalletConnect | `developer.trustwallet.com` 的 *Mobile (WalletConnect)* 文档页 |
| **Rainbow** 等以太坊钱包 | Wallet：常用 WC 作为移动端 dApp 桥梁 | 行业常见实践 + WalletGuide 检索 |
| **Coinbase Wallet** | Wallet：主流多链钱包常见 WC 支持 | 以 Coinbase Wallet 官方帮助/文档为准（部分区域访问受限） |
| **imToken、OKX Wallet、Bitget Wallet** 等 | Wallet：中文用户常见选择 | 以各自帮助中心 / 版本说明为准 |
| **Safe{Wallet}（原 Gnosis Safe）** | Wallet / 多签协同场景常见 | 以 Safe 官方文档为准 |
| **Ledger Live** 等套件 | 视功能模块而定（非所有流程都走 WC） | 以 Ledger 官方说明为准 |

### 3.3 代表性「应用端 / dApp 侧」与集成栈

| 对象 | 说明 | 可核对公开出处 |
|------|------|----------------|
| **大量 Web3 网站** | 作为 Client 集成 WC（用户看到「连接钱包 → WalletConnect」） | WalletConnect Network 宣传页给出的 **「80,000+ apps」** 规模描述（动态） |
| **Uniswap 支持文档** | 面向用户解释如何通过 WalletConnect 连接 | Uniswap Help Center：*How to connect my wallet to a site (dapp) using WalletConnect* |
| **Reown AppKit** | SDK 文档写明通过 WalletConnect Network 连接 **600+** 钱包 | Reown 文档 *About Reown SDK* |
| **RainbowKit / ConnectKit / Thirdweb / Privy / Dynamic** | 作为 dApp 集成层连接 WC 网络 | WalletConnect Network「SDK Partners」页面列举的合作伙伴 |

---

## 4. 优劣势与适用场景

### 4.1 优势：跨端、跨浏览器、对非注入环境友好

- **移动端钱包用户**可在 **不安装桌面插件** 的情况下使用 **桌面版 dApp**（扫码配对）。
- **同一套连接体验**可覆盖多链产品形态（取决于钱包与 dApp 声明的 namespaces）。
- **对开发者**：集成 **AppKit / ConnectKit** 等可减少「逐个钱包适配」成本。

### 4.2 劣势：依赖中继与实现质量、钓鱼面更大

- **连接入口**若缺少 **域名绑定 / 风险提示**，用户更容易在钓鱼站误点「批准」。
- **不同钱包**对 **同一笔交易**的解码展示质量不同，影响用户理解成本。
- **会话异常**（网络切换、RPC 失败、钱包杀后台）会带来 **更高的客服与排障成本**。

### 4.3 适用场景建议

- **优先 WalletConnect**：桌面 Web3 + 手机自托管钱包；或 **无注入环境**（某些内置浏览器受限场景）。
- **优先 Injected**：用户已安装浏览器扩展且只在桌面使用。
- **企业/支付**：若目标是 **收款 / 结账**，应单独评估 **WalletConnect Pay** 与传统 **钱包连接** 的产品边界（文档体系不同）。

---

## 5. 现实案例 / 生产落地

### 5.1 官方生态目录：用「检索」代替「拍脑袋枚举」

- **WalletGuide**（`walletguide.walletconnect.network`）定位为 **钱包与链生态的目录/检索入口**，适合回答「**某钱包是否在该网络生态中登记**、**支持哪些链**」。
- **WalletConnect Network** 页面描述其连接 **大量应用与钱包**（**80,000+ apps、700+ wallets** 为页面公开表述），适合作为「**为什么无法手工列全**」的依据。
- **GitHub `WalletConnect/awesome-walletconnect`** 提供资源索引入口，适合开发者快速跳转到 **文档 / SDK / 示例**。

### 5.2 钱包侧落地：教育材料与开发者文档双证据

- **Trust Wallet** 在官方博客提供 **WalletConnect 使用指南**，属于「钱包明确支持 WC」的强证据链。
- **Trust Developers** 提供 **Mobile (WalletConnect)** 文档，说明 **Sign API / wagmi** 等集成语境，证明 WC 在 Trust 生态是 **一等公民连接方式**。
- **MetaMask** 侧：开发者文档大量描述 **跨端连接**（二维码 / 深度链接）与 **多链会话**；即便品牌从「WalletConnect 字样」迁移到 **MetaMask Connect** 等产品化包装，**行业语境**仍常把其归为同一类「远程配对连接」问题域（具体以 MetaMask 官方最新文档为准）。

### 5.3 应用侧落地：大型 dApp 的用户支持文档

- **Uniswap Help Center** 提供「如何通过 WalletConnect 连接 dApp」的用户向说明，是 **dApp 侧提供 WC 连接** 的直观证据。
- **Reown AppKit** 文档给出 **「600+ wallets via WalletConnect Network」** 的集成描述，可作为 **B 端集成现状** 的引用。
- **WalletConnect Network** 的 **SDK Partners** 列表（Reown、ConnectKit、Dynamic、Mesh、Privy、Thirdweb、RainbowKit 等）说明：**「有 WC 功能的 app」在供给侧大量通过少数 SDK 聚合实现**。

---

## 6. 趋势与建议

### 6.1 趋势判断

- **供给侧集中化**：更多应用通过 **AppKit / ConnectKit / Privy / Dynamic** 统一接入 **WalletConnect Network**，「是否支持 WC」逐渐变成「是否采用主流 onboarding SDK」。
- **多链化**：连接能力从 **EVM 单栈** 扩展到 **Solana、Bitcoin** 等（以 SDK 与钱包矩阵为准），验收要以 **目标链** 为准。
- **品牌化演进**：对外文档可能出现 **Reown / AppKit / WalletConnect Pay** 等并列概念；调研时应 **以「是否实现 WalletConnect 协议会话」** 为技术判据，而不是以页面是否出现某个旧商标为唯一依据。

### 6.2 对「选型 / 竞品清单」的可执行建议

- **先定义角色**：你要清单的是 **钱包 App** 还是 **包含连接按钮的 dApp**；两者数据源不同。
- **用 WalletGuide 做主数据源**：输出表格字段建议包含：**品牌、平台（iOS/Android/Extension）、支持链、登记来源链接、最后核验日期**。
- **对关键链路做抽样实测**：选 3 款目标钱包 × 3 个目标 dApp，走一遍 **连接 → 切链 → 签名 → 发交易**，记录失败点（比纯文档枚举更接近真实）。

### 6.3 安全与合规提示（与「有没有 WC」同等重要）

- **WC 只是连接协议**，不自动保证 **dApp 善意**；产品侧应配合 **域名验证、交易模拟、黑名单** 等能力。
- **企业采购**应要求供应商说明：**中继可用性 SLA、日志与隐私、会话密钥管理、事故响应**。
- **对客文案**建议明确：**WalletConnect 不会索要助记词/私钥**；遇到此类请求应视为钓鱼。

---

## 参考资料

1. WalletConnect Network — *Apps: Join WalletConnect Network*（**80,000+ apps、700+ wallets** 等表述）  
   https://walletconnect.network/apps-joining-the-network  

2. WalletGuide | WalletConnect（生态目录 / 检索入口）  
   https://walletguide.walletconnect.network/  

3. GitHub — `WalletConnect/awesome-walletconnect`（资源索引）  
   https://github.com/WalletConnect/awesome-walletconnect  

4. Reown 文档 — *About Reown SDK*（**600+ wallets via WalletConnect Network**）  
   https://docs.reown.com/appkit/overview  

5. Trust Wallet — *How to Use WalletConnect With Trust Wallet*  
   https://trustwallet.com/blog/guides/how-to-use-walletconnect-with-trust-wallet  

6. Trust Developers — *Mobile (WalletConnect)*  
   https://developer.trustwallet.com/developer/develop-for-trust/mobile  

7. Uniswap Help Center — *How to connect my wallet to a site (dapp) using WalletConnect*  
   https://support.uniswap.org/hc/en-us/articles/11306127816845-How-to-connect-my-wallet-to-a-site-dapp-using-WalletConnect  

8. WalletConnect 文档索引（含 Pay 等产品线入口；注意与「连接协议」文档体系区分）  
   https://docs.walletconnect.com/  

9. MetaMask 开发者文档 — *MetaMask Connect*（跨端连接/二维码/深度链接等产品描述）  
   https://docs.metamask.io/metamask-connect/  

10. WalletConnect 文档（Wallet SDK / Web Usage 示例页，偏开发者集成）  
    https://docs.walletconnect.network/wallet-sdk/web/usage  
