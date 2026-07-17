# OpenSpec: NetEase Account Connector

- Spec-ID: `music-connect-netease-account`
- Version: `1.1.0`
- Status: `Active`
- Last-Updated: `2026-07-17`

## Scope

本仓库提供网易云音乐的独立账号连接器制品。它与匿名连接器共享
`familyId: netease-cloud-music`，但使用独立实现 ID、安装记录、凭据命名空间、版本和发布制品。

## Runtime contract

连接器 MUST 声明：

- `id: netease-cloud-music-account`；
- `familyId: netease-cloud-music`；
- `variant: account`；
- `authRequirement: required`；
- `supportedHosts: [desktop]`；
- `login`、搜索、歌曲详情、播放地址、歌词与公开歌单能力。

桌面登录 MUST 通过 `https://music.163.com/#/login` 的官方页面完成。连接器返回
带 `cookieCapture` 的 `open-url` 动作，由宿主打开隔离登录窗口、等待用户在官方页面扫码或登录，并读取至少包含 `MUSIC_U` 的 Cookie。

## Credential boundary

- 宿主是凭据持久化的唯一所有者。
- `request.input.cookie` 只用于验证一次登录结果；认证成功后连接器只返回状态，不返回秘密。
- 宿主可在后续 `init()` 中注入 `cookie`。连接器只在当前 Worker 内存中保留它，用于登录状态判断。
- `configPatch` 只能包含非秘密配置。本实现不得通过 `configPatch` 返回 Cookie、Token、密码、Authorization 或 API Key。
- `logout` 只返回匿名状态；宿主负责清除安装级安全保险库并重新初始化实例。
- 凭据不得进入 URL、查询参数、日志、错误消息、Store 元数据、Pages 或普通浏览器存储。

## Official catalog boundary

登录成功后，目录能力 MUST 通过 `MusicConnectorHostContext.officialProviderRequest`
调用宿主拥有的网易云适配器。连接器只提交经过约束的操作名与分页、歌曲 ID、
歌单 ID 等非秘密参数；宿主验证实现 ID、操作名、参数范围与固定的
`https://music.163.com` 端点，并使用同一个隔离登录会话发起请求。

账号 Cookie、Token 或 Authorization 不得进入连接器请求参数、URL、日志或普通配置。
账号版不得要求或暴露 `apiBaseUrl`。宿主官方适配器不可用、登录过期或官方端点失败时，
目录方法 MUST 抛出明确错误，不得把能力缺口伪装成空搜索、空歌单或无封面。

普通歌单列表在账号版中表示当前已认证账号的“我的歌单”：连接器先请求当前账号资料，
再把其中的数字用户 ID 交给宿主受限地请求该用户的歌单。该 ID 不是凭据，Cookie、
Token 和 Authorization 仍不得离开宿主。公开歌单目录只在调用方显式传入
`category: "public"` 时使用；公开和账号歌单的曲目详情共用受限的歌单详情操作。

账号收藏、每日推荐、会员权益和任何可写账号操作仍不得声明，直到对应的固定宿主操作
经过独立评审与测试。

歌曲和歌单封面必须保留网易云真实图片，并把受信任的
`p1` 至 `p4.music.126.net` HTTP 地址规范化为 HTTPS。

## Public documentation

`docs/index.html` 只能是无凭据文档或统一文档站跳转页，不得提供真实登录、Cookie 输入或持久化功能。

## Release

- 修复账号曲库、封面与“我的歌单”路径的版本为 `0.3.0`。
- 构建并提交 `dist/index.js` 和 `dist/index.d.ts`。
- 发布使用不可变 SemVer 标签；MusicStore 记录必须提供匹配制品的 SHA-256 SRI。
- CI 必须运行测试、重新构建并验证已提交 dist 无差异。
