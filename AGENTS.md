# MusicConnect-NetEase-Account Instructions

本仓库只实现网易云音乐账号变体，不承载宿主 UI、MusicConnect 协议或 MusicStore 注册表逻辑。

## 开始开发前

1. 阅读 `README.md` 和 `openspec/CONNECTOR_OPENSPEC.md`。
2. 检查 Git 状态并保留已有修改。
3. 登录、凭据或网络边界变化必须先更新 OpenSpec。

## 强制边界

- 实现 ID 固定为 `netease-cloud-music-account`，家族 ID 固定为 `netease-cloud-music`。
- 本实现是 `account` / `required` / `desktop` 变体，匿名实现位于独立的 `MusicConnect-NetEase` 仓库。
- Cookie 只能由宿主安全保险库通过 `init()` 注入，或在一次登录调用的 `request.input.cookie` 中短暂出现。
- Cookie、Token、密码和其他凭据不得进入 `configPatch`、URL、日志、诊断、文档、测试快照或普通持久化。
- 官方网页登录使用宿主拥有的 `cookieCapture`；公开 Pages 不采集真实账号凭据。
- 自定义目录网关仅提供匿名数据，绝不接收网易云账号 Cookie。
- 不声明尚未实现的账号歌单、收藏、推荐或会员能力。

## 验证

修改实现后至少运行：

```bash
npm test
npm run build
```

提交发布前必须确认 `dist/index.js` 和 `dist/index.d.ts` 与源码一致。
