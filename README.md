# MusicConnect-NetEase-Account

网易云音乐的 DancingMusic **桌面账号连接器实现**。

- 实现 ID：`netease-cloud-music-account`
- 家族 ID：`netease-cloud-music`
- 变体：`account`
- 登录要求：`required`
- 主机：Desktop
- 登录：网易云官方网页扫码或网页登录，由 DancingMusic 桌面端安全捕获会话
- 目录能力：搜索、歌曲信息、可用播放地址、歌词、公开歌单

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

## 匿名目录网关

账号会话与目录访问当前严格隔离。若要使用搜索、歌词和公开歌单，可配置自己信任的兼容 HTTPS 网关：

```json
{
  "apiBaseUrl": "https://your-netease-gateway.example.com"
}
```

本地开发允许 `http://localhost`、`http://127.0.0.1` 或 `http://[::1]`。无论是否登录，请求网关时都不会附带 Cookie、Token 或密码。

网关端点：

- `GET /cloudsearch`
- `GET /song/detail`
- `GET /song/url/v1`
- `GET /lyric`
- `GET /top/playlist`
- `GET /playlist/track/all`

账号歌单、收藏、推荐和会员播放尚未声明。它们需要固定可信账号网关或经过协议评审的宿主专用适配器，不能把账号凭据发送给任意代理来实现。

## 开发与发布

```bash
npm install
npm test
npm run build
```

生产环境固定不可变版本：

```text
https://cdn.jsdelivr.net/gh/DancingMusic/MusicConnect-NetEase-Account@v0.1.0/dist/index.js
```

统一文档：[DancingMusic Docs](https://dancingmusic.github.io/docs/connectors/implementations)
