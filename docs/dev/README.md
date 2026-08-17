# 开发任务总索引

本目录是给**执行方（人或 AI 模型）**的实现规格。00–05 已在 `0.2.0` 落地；另含苹果邮箱（IMAP / icloud-hme / iCloud Mail API）与 GitHub 注册。每份文档自带现状分析、文件清单、数据结构、分步骤实现方案与验收标准。

## 执行顺序

按依赖关系排列，建议顺序执行。02 与 03 之间无依赖，可并行。

| 序号 | 任务 | 预估 | 依赖 | 文档 |
|---|---|---|---|---|
| 00 | 清理空壳与误导性交互 | 2h | 无 | [00-cleanup.md](00-cleanup.md) |
| 01 | 账号列表脱敏与快捷操作 | 0.5d | 无 | [01-ui-secrets.md](01-ui-secrets.md) |
| 02 | 接码服务（SMS）打通 | 1d | 00 | [02-sms-providers.md](02-sms-providers.md) |
| 03 | 邮箱 IMAP/SMTP 支持 | 1d | 00 | [03-mailbox-imap-smtp.md](03-mailbox-imap-smtp.md) |
| 04 | Google 账号操作一条龙 | 2-3d | 02, 03 | [04-google-flows.md](04-google-flows.md) |
| 05 | OAuth 注册第三方平台 | 2d | 04 | [05-oauth-register.md](05-oauth-register.md) |

## 项目架构速记

执行任何任务前需理解的分层。详细设计见 [`../ARCHITECTURE.md`](../ARCHITECTURE.md)。

```
src/
  shared/     主进程与渲染层共享的类型和 IPC 通道常量（禁止引入 Node/DOM API）
    types.ts      领域类型 + window.api 的完整类型契约
    ipc.ts        所有 IPC 通道名的唯一来源
    providers.ts  外部服务驱动目录（表单模板，驱动 UI 动态渲染）
  main/       Electron 主进程
    db/           sql.js + 版本化迁移
    services/     crypto / providers / settings / totp / logger / security
    automation/   浏览器自动化引擎、flows、mailbox、captcha、proxy
    ipc/          各领域 IPC handler 注册
  preload/    contextBridge 暴露 window.api
  renderer/   React 前端
```

### 铁律

1. **密文永不出主进程**。渲染层拿到的 `Account` 不含任何密钥字段；取明文必须显式调用 `api.accounts.reveal(id)`，且调用点要能被审计。
2. **新增 IPC 必须三处同步**：`shared/ipc.ts` 加通道名 → `shared/types.ts` 的 `Api` 接口加签名 → `main/ipc/*.ipc.ts` 加 handler → `preload/index.ts` 加桥接。漏一处会在运行时静默失败。
3. **数据库变更只能追加迁移**。在 `main/db/migrations.ts` 的 `MIGRATIONS` 数组末尾追加新 `version`，**绝不修改已有迁移**（用户库已经跑过了）。
4. **敏感值禁止写日志**。参考 `flows/register.ts` 的写法：只记录「已收到验证码（6 位）」，不记录码本身。日志会落库并可导出。
5. **每完成一项跑通** `npm run typecheck`，不留类型错误。

### 通用约定

- 所有面向用户的文案用简体中文，错误信息要包含可执行的下一步（反例：「操作失败」；正例：「未配置接码服务，请到「服务中心」添加并设为默认」）。
- 新增外部服务一律走 `provider_settings` 表 + `shared/providers.ts` 驱动目录，不要硬编码 API Key。
- 新增自动化动作一律实现为 `Flow`（见 `main/automation/types.ts`），由 `flows/registry.ts` 注册，UI 会自动出现对应入口。
- 长耗时网络轮询统一用 `AbortSignal`（`StepContext.signal`）响应取消，禁止不可中断的 `while(true)`。
