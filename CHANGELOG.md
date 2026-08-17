# Changelog

## 0.2.6

- Google / YouTube 注册按真实多步向导填表：姓名、生日性别、自建 @gmail.com 或已有邮箱、密码+确认密码
- 确认页分开显示登录邮箱和收信邮箱；预览字段原样写入对应步骤，写不进去会停
- GitHub 注册回读校验邮箱/用户名/密码，预览用户名按 GitHub 规则生成

## 0.2.5

- 批量注册改为先预览再确认：核对平台、收信邮箱、用户名、密码
- 明确「目标平台 ≠ 邮箱后缀」；卡片同时显示平台名和真实域名
- 已生成邮箱可搜索、批量删除/打标签、读信，空闲邮箱可直接用于注册
- 注册收信来源：新生成 / 已有临时邮箱 / 账号库里的 Gmail·iCloud·Outlook

## 0.2.4

- 服务中心记录测试/注册生成的临时邮箱，可复制、读信、删除
- 邮箱注册平台与添加账号对齐：Google / GitHub / Microsoft / Apple / X / YouTube / Discord / OpenAI / Claude / Cursor / Windsurf

## 0.2.3

- 接入 electron-updater：GitHub 打 tag 发版后，安装版会自动检查并提示更新
- 添加/编辑账号可按 Gmail / iCloud / Outlook 填写不同收信凭证
- 邮箱注册平台扩展到 Discord / OpenAI / X / Claude；临时邮箱入库显示完整地址
- 转动彩虹边框仅用于执行中账号，金色边框表示主号；批量删除/标主号更明显

## 0.2.2

- 账号卡片渐变描边
- 新增/导入支持 `----` / `---` / `|` / `邮箱:密码` 快捷粘贴
- 读信：服务中心与账号详情可预览最近邮件并复制验证码
- 账号可一键「用作收信」，供批量注册收验证码

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
