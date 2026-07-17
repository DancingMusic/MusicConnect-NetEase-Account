# MusicConnect-NetEase-Account

网易云音乐的 DancingMusic **桌面账号连接器实现**。

- 实现 ID：`netease-cloud-music-account`
- 家族 ID：`netease-cloud-music`
- 变体：`account`
- 登录要求：`required`
- 主机：Desktop
- 登录：网易云官方网页扫码或网页登录，由 DancingMusic 桌面端安全捕获会话
- 目录能力：登录后通过宿主隔离会话读取搜索、歌曲信息、可用播放地址、歌词、公开歌单

匿名连接器位于独立仓库
[`DancingMusic/MusicConnect-NetEase`](https://github.com/DancingMusic/MusicConnect-NetEase)。
两个实现共享家族 ID，但拥有独立安装记录和凭据命名空间。

## 登录与凭据

连接器的 `login({ intent: "start" })` 返回网易云官方登录页
`https://music.163.com/#/login` 及 `cookieCapture` 声明。桌面宿主打开隔离窗口，用户可在官方页面扫码或登录。宿主读取包含 `MUSIC_U` 的 Cookie 后，通过一次性的 `request.input.cookie` 交给连接器验证，并保存到安装级安全保险库。

本实现不会：

- 通过 `configPatch` 返回 Cookie；
- 把 Cookie 写进 URL、日志或普通配置；
- 把 Cookie 发给可配置目录网关；
- 在公开 Pages 页面采集真实凭据。

## 官方目录请求

登录成功后，连接器通过 `MusicConnectorHostContext.officialProviderRequest`
请求宿主拥有的网易云适配器。宿主只接受固定操作和非秘密参数，并在
`persist:dancingmusic-netease-login` 隔离会话中访问网易云官方 HTTPS 端点；
HttpOnly Cookie 不会进入连接器参数、URL、日志或普通配置。

账号版不需要也不接受 `apiBaseUrl`。若宿主版本尚未提供网易云官方适配器，
连接器会明确报告能力不可用，而不是把搜索、歌单或歌词静默伪装为空。

账号私有歌单、收藏、推荐和会员能力尚未声明；当前歌单能力仅覆盖公开目录。

## 开发与发布

```bash
npm install
npm test
npm run build
```

针对已打包桌面 Release 联调时，运行 `dancingmusic dev --watch --build`，再以
`--enable-local-dev-bridge` 启动宿主。该路径只验证构建、身份、加载和无凭据契约，
连接器必须显示“测试”标识且不得接收账号凭据。真实账号目录验收必须使用固定
SemVer 与 SRI 的正式安装制品，并由目标宿主 Release 的官方适配器代理会话。

生产环境固定不可变版本：

```text
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-NetEase-Account@v0.3.1/dist/index.js
```

统一文档：[DancingMusic Docs](https://dancingmusic.github.io/docs/connectors/implementations)
