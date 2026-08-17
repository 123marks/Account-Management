# Changelog

## 0.2.1

- 服务中心「添加」菜单可滚动，小窗口也能选完全部驱动
- 取件链接邮箱：粘贴 iCloud 商业号 `邮箱----URL` / `邮箱---token---URL`，注册时扣库存并收码
- Outlook Graph / OAuth2 双令牌号：`邮箱----密码----clientId----refreshToken`，Graph 读信失败则走 IMAP
- 批量注册同时支持验证码和验证链接，免费临时邮箱 / IMAP / 自建域名 / 取件号 / Outlook 都能闭环
- GitHub README 增加交流群与产品截图

## 0.2.0

账号管理从「能看」做到「能跑」：接码、真实邮箱、Google 维护、OAuth 注册、苹果邮箱 + GitHub 注册全部接入运行时。

- 列表脱敏、全局小眼睛、状态灯可点
- SMS-Activate 兼容 / SMSBower / SMSPool / 通用接码
- IMAP/SMTP、cfworker、generic HTTP 邮箱
- iCloud IMAP、icloud-hme Hide My Email、商业 iCloud Mail API
- Google：改手机、启用/轮换 2FA、拉取备用码、完整维护队列
- OAuth 注册：OpenAI / Cursor / Windsurf / Discord
- GitHub 邮箱注册：单页表单只点 Create account，处理 Arkose，收 launch code
