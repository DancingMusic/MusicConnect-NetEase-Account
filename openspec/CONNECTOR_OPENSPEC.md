# OpenSpec: NetEase Account Connector

- Spec-ID: `music-connect-netease-account`
- Version: `1.0.0`
- Status: `Active`
- Last-Updated: `2026-07-12`

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
- `login` 以及实际提供的匿名目录能力。

桌面登录 MUST 通过 `https://music.163.com/#/login` 的官方页面完成。连接器返回
带 `cookieCapture` 的 `open-url` 动作，由宿主打开隔离登录窗口、等待用户在官方页面扫码或登录，并读取至少包含 `MUSIC_U` 的 Cookie。

## Credential boundary

- 宿主是凭据持久化的唯一所有者。
- `request.input.cookie` 只用于验证一次登录结果；认证成功后连接器只返回状态，不返回秘密。
- 宿主可在后续 `init()` 中注入 `cookie`。连接器只在当前 Worker 内存中保留它，用于登录状态判断。
- `configPatch` 只能包含非秘密配置。本实现不得通过 `configPatch` 返回 Cookie、Token、密码、Authorization 或 API Key。
- `logout` 只返回匿名状态；宿主负责清除安装级安全保险库并重新初始化实例。
- 凭据不得进入 URL、查询参数、日志、错误消息、Store 元数据、Pages 或普通浏览器存储。

## Network boundary

可选 `apiBaseUrl` 是用户信任的兼容 HTTPS 目录网关，只承载匿名搜索、歌曲信息、公开歌单、歌词和可用播放地址。连接器 MUST NOT 将账号 Cookie 或其他凭据发送给该网关。

账号歌单、收藏、推荐和会员播放只有在未来具备 DancingMusic 控制的固定可信账号网关，或具备经过协议评审的宿主专用网易云适配器后才可实现和声明。

## Public documentation

`docs/index.html` 只能是无凭据文档或统一文档站跳转页，不得提供真实登录、Cookie 输入或持久化功能。

## Release

- 首个版本为 `0.1.0`。
- 构建并提交 `dist/index.js` 和 `dist/index.d.ts`。
- 发布使用不可变 `v0.1.0` 标签；MusicStore 记录必须提供匹配制品的 SHA-256 SRI。
- CI 必须运行测试、重新构建并验证已提交 dist 无差异。
