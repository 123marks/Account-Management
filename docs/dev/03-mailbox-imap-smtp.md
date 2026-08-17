# 03 · 邮箱 IMAP/SMTP 支持

**预估 1 天** · 依赖任务 00 · 与任务 02 无依赖，可并行

## 目标

让用户能接入自己的真实邮箱（Gmail / Outlook / 自建域名邮箱）通过 IMAP 收验证码，通过 SMTP 发信。替代当前不稳定、易被平台拉黑的临时邮箱。

顺带补齐任务 00 里标为「未接入」的 `cfworker` 与 `generic_http` 两个驱动。

## 现状

`src/main/automation/mailbox.ts` 只实现了两个驱动：

| 驱动 | createInbox | pollMails |
|---|---|---|
| `tempmail_lol` | ✅ | ✅ |
| `testmail` | ✅ | ✅ |
| `cfworker` | ❌ 抛错 | ❌ 抛错 |
| `generic_http` | ❌ 抛错 | ❌ 抛错 |

现有对外接口（供 flows 调用）：

```ts
export async function createInbox(): Promise<Inbox>
export function waitForCode(driver: string, token: string, opts?: WaitOpts): Promise<string>
export function waitForLink(driver: string, token: string, opts?: WaitOpts): Promise<string>
```

`Inbox` 结构是 `{ driver, email, token }`，`token` 对不同驱动语义不同（tempmail 是会话 token，testmail 是 tag）。IMAP 场景下 `token` 可复用为「本次注册使用的 plus-address 后缀」。

## 依赖

需要新增两个 npm 包（都是纯 JS，无原生编译，符合项目「零原生依赖」原则）：

```bash
npm i imapflow nodemailer
npm i -D @types/nodemailer
```

- `imapflow`：现代 IMAP 客户端，Promise API，比 `node-imap` 好用得多
- `nodemailer`：SMTP 发信事实标准

**打包注意**：两者会被 `externalizeDepsPlugin` 外置，必须确认它们进了 `package.json` 的 `dependencies`（不是 `devDependencies`），否则打包后运行时找不到。参考 `sql.js` / `playwright-core` 的处理方式。若 `imapflow` 出现 asar 内加载问题，需在 `package.json` 的 `build.asarUnpack` 里追加 `node_modules/imapflow/**`。

## 数据结构

### 驱动目录扩展

修改 `src/shared/providers.ts`，在 mailbox 段落新增：

```ts
{
  type: 'mailbox',
  driver: 'imap',
  label: 'IMAP 邮箱（推荐）',
  description: '接入你自己的真实邮箱收验证码，配合 plus-address 可无限派生子地址。',
  testable: true,
  fields: [
    { key: 'host', label: 'IMAP 服务器', type: 'text', required: true, placeholder: 'imap.gmail.com' },
    { key: 'port', label: 'IMAP 端口', type: 'number', required: true, defaultValue: 993 },
    { key: 'secure', label: '使用 TLS', type: 'boolean', defaultValue: true },
    { key: 'user', label: '登录邮箱', type: 'text', required: true },
    {
      key: 'pass',
      label: '密码 / 应用专用密码',
      type: 'password',
      required: true,
      secret: true,
      help: 'Gmail 需在账号安全设置生成「应用专用密码」，不能用登录密码。'
    },
    {
      key: 'baseAddress',
      label: '派生地址基址（可选）',
      type: 'text',
      placeholder: 'me@gmail.com',
      help: '留空则用登录邮箱。注册时会派生 me+xxxx@gmail.com 形式的子地址。'
    },
    {
      key: 'plusAddressing',
      label: '启用 plus-address 派生',
      type: 'boolean',
      defaultValue: true,
      help: '关闭后所有注册共用同一地址，容易被平台判定重复。'
    },
    { key: 'mailbox', label: '收信文件夹', type: 'text', defaultValue: 'INBOX' },
    {
      key: 'smtpHost',
      label: 'SMTP 服务器（可选）',
      type: 'text',
      placeholder: 'smtp.gmail.com',
      help: '仅在需要发信时填写。'
    },
    { key: 'smtpPort', label: 'SMTP 端口（可选）', type: 'number', defaultValue: 465 }
  ]
}
```

同时移除 `cfworker` 与 `generic_http` 的 `unimplemented` 标记（本任务会实现它们）。

`generic_http` 的字段需要补全才能真正可用：

```ts
{
  type: 'mailbox',
  driver: 'generic_http',
  label: '通用 HTTP 邮箱',
  description: '用 URL 模板对接任意临时邮箱 API，支持 {email}/{token} 占位符。',
  testable: true,
  fields: [
    { key: 'createUrl', label: '创建邮箱 URL', type: 'text', required: true },
    { key: 'createMethod', label: '创建请求方法', type: 'text', defaultValue: 'POST' },
    { key: 'emailPath', label: '邮箱地址的 JSON 路径', type: 'text', required: true, placeholder: 'data.address' },
    { key: 'tokenPath', label: '令牌的 JSON 路径', type: 'text', placeholder: 'data.token' },
    { key: 'listUrl', label: '拉取邮件 URL', type: 'text', required: true, placeholder: 'https://api.example.com/inbox?token={token}' },
    { key: 'listPath', label: '邮件数组的 JSON 路径', type: 'text', defaultValue: 'emails' },
    { key: 'token', label: '固定 Bearer Token（可选）', type: 'password', secret: true }
  ]
}
```

## 实现方案

### 步骤 1：重构 mailbox 为驱动分发结构

当前 `mailbox.ts` 是一长串 `if (driver === 'xxx')`，加两个驱动会失控。先重构成与任务 02 一致的结构：

新建 `src/main/automation/mailbox/types.ts`：

```ts
export interface Inbox {
  driver: string
  email: string
  token: string
}

export interface MailMessage {
  id: string
  subject: string
  from: string
  text: string
  html: string
  receivedAt: number
}

export interface MailboxDriverContext {
  config: Record<string, string | number | boolean>
  signal?: AbortSignal
}

export interface MailboxDriver {
  driver: string
  createInbox(ctx: MailboxDriverContext): Promise<Inbox>
  /** 拉取邮件列表。实现方只负责取，去重与匹配由上层统一处理。 */
  fetchMails(ctx: MailboxDriverContext, inbox: Inbox): Promise<MailMessage[]>
  /** 连通性测试。 */
  test(ctx: MailboxDriverContext): Promise<{ ok: boolean; message: string }>
  /** 可选：发信能力。 */
  send?(ctx: MailboxDriverContext, mail: { to: string; subject: string; text: string }): Promise<void>
}
```

把现有 `tempmail_lol` / `testmail` 的逻辑原样搬进 `mailbox/tempmail.ts` 与 `mailbox/testmail.ts`，**保持行为不变**。

`mailbox/index.ts` 保留原有对外签名（`createInbox` / `waitForCode` / `waitForLink`），内部改为驱动分发，这样 `flows/register.ts` 无需改动。

> 重构完先跑一遍现有注册流程，确认没退化，再往下加新驱动。

### 步骤 2：实现 IMAP 驱动

新建 `src/main/automation/mailbox/imap.ts`。

**createInbox 的语义**：IMAP 不「创建」邮箱，而是派生一个 plus-address。

```ts
async createInbox(ctx) {
  const base = String(ctx.config.baseAddress || ctx.config.user)
  const plus = ctx.config.plusAddressing !== false
  if (!plus) return { driver: 'imap', email: base, token: '' }
  const tag = randomBytes(4).toString('hex')
  const [local, domain] = base.split('@')
  return { driver: 'imap', email: `${local}+${tag}@${domain}`, token: tag }
}
```

**fetchMails 实现要点**：

```ts
import { ImapFlow } from 'imapflow'

const client = new ImapFlow({
  host, port, secure,
  auth: { user, pass },
  logger: false          // 关键：imapflow 默认往 stdout 狂打日志
})
await client.connect()
const lock = await client.getMailboxLock(String(ctx.config.mailbox || 'INBOX'))
try {
  // 只取最近 15 分钟的邮件，避免全量拉取
  const since = new Date(Date.now() - 15 * 60 * 1000)
  const uids = await client.search({ since })
  // 取最后 20 封
  for await (const msg of client.fetch(uids.slice(-20), { envelope: true, source: true })) {
    // 用 mailparser 或简单解析取正文
  }
} finally {
  lock.release()
  await client.logout()
}
```

关键约束：

1. **连接复用**：`waitForCode` 每 3 秒轮询一次，每次都重连 IMAP 会被 Gmail 限流封禁。必须维护一个按 provider 复用的长连接池，或改用 IMAP IDLE。**推荐 IDLE**：`imapflow` 支持 `client.idle()`，服务器推送新邮件，比轮询更快也更省。
2. **收件人过滤**：plus-address 派生后，所有子地址的邮件都进同一个 INBOX。必须按 `envelope.to` 精确匹配 `inbox.email`，否则并发注册时会串码。
3. **正文解析**：`source` 是原始 MIME，需要 `mailparser`（`npm i mailparser`）解析，或者用 `bodyParts` 只取 text/plain。优先取 `text/plain`，没有再从 HTML 里剥标签。
4. **超时与清理**：连接必须在 `finally` 里 `logout()`，异常路径也不能泄漏连接。

**test 实现**：连接 + 打开 INBOX + 读取邮件总数，返回 `{ ok: true, message: 'IMAP 连接正常，INBOX 共 1234 封' }`。常见错误要翻译：认证失败提示「密码错误，Gmail 请使用应用专用密码」。

**send 实现**（nodemailer）：

```ts
const transport = nodemailer.createTransport({
  host: smtpHost, port: smtpPort, secure: smtpPort === 465,
  auth: { user, pass }
})
await transport.sendMail({ from: user, to, subject, text })
```

### 步骤 3：实现 generic_http 驱动

新建 `src/main/automation/mailbox/genericHttp.ts`。与任务 02 的通用 SMS 适配器同构：URL 模板替换 + JSON 路径取值。两处的 `pick()` 工具应抽到 `src/main/utils/jsonPath.ts` 共用。

### 步骤 4：实现 cfworker 驱动

新建 `src/main/automation/mailbox/cfworker.ts`。对接自建 Cloudflare 邮件 Worker，约定接口：

- `POST {apiUrl}/api/inbox` 带 `Authorization: Bearer {adminToken}` → 返回 `{ address }`
- `GET {apiUrl}/api/inbox/{address}/messages` → 返回 `{ messages: [...] }`

由于自建 Worker 实现各异，文档里要写明这套约定，并建议用户实在对不上就改用 `generic_http`。

### 步骤 5：上层匹配逻辑增强

`mailbox/index.ts` 的 `poll()` 保留现有的去重（`seen` 集合）与正则提取逻辑，但增加：

- `WaitOpts` 新增 `toAddress?: string`，IMAP 驱动据此过滤收件人
- 验证码正则从写死的 `/(?<!\d)(\d{6})(?!\d)/` 改为可配置，默认支持 4/6/8 位：`/(?<!\d)(\d{4}|\d{6}|\d{8})(?!\d)/`

### 步骤 6：一键测试接入

修改 `src/main/services/providers.ts` 的 `testMailbox()`，改为分发到驱动的 `test()` 方法，删掉现在那句「该邮箱驱动的一键测试将在注册运行时接入」。

## 安全注意事项

1. IMAP 密码走 `secret: true`，落库前由 `encryptField` 加密，与 API Key 同等对待
2. 邮件正文可能包含其他敏感信息，**禁止把完整正文写进日志**，只记录 `subject` 与匹配结果
3. 建议在 IMAP 驱动的说明文案里提示用户使用应用专用密码而非主密码，并优先用小号邮箱

## 验收标准

- [ ] 重构后原有 `tempmail_lol` / `testmail` 注册流程行为不变
- [ ] 配置真实 Gmail（应用专用密码）后一键测试通过
- [ ] 用 plus-address 派生的地址注册第三方站点，能在 180 秒内取到验证码
- [ ] 并发跑两个注册任务，两个子地址各自拿到正确的码，不串号
- [ ] 连续轮询 10 分钟不被 Gmail 限流（验证 IDLE 或连接复用生效）
- [ ] `cfworker` 与 `generic_http` 能对接 mock 服务并取码
- [ ] 服务中心不再有「未接入」的邮箱驱动
- [ ] 日志中搜索不到邮件正文与验证码明文
- [ ] `npm run typecheck` 无错误
- [ ] `npm run dist:win` 打包后，装完的应用里 IMAP 功能仍可用（验证依赖没被打包漏掉）
