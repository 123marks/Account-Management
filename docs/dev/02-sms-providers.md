# 02 · 接码服务（SMS）打通

**预估 1 天** · 依赖任务 00

## 目标

把接码从「只能填 Key 的空壳」做成可用能力：租号 → 轮询收码 → 完成/退款释放，并封装成通用适配层，让后续新增平台只写一个配置对象。

明确要支持：**SMS-Activate**、**SMSBower**、**SMSPool**。其余平台通过**通用适配器**由用户自行填 URL 模板接入。

## 现状

- `src/shared/providers.ts` 声明了 `sms_activate` / `smsbower` 两个驱动的表单
- `src/main/` 下**零运行时代码**（全量检索确认无任何租号/收码逻辑）
- `testProvider()` 对 sms 类型返回「暂不支持一键测试」

## 设计要点

### 为什么能协议化

接码平台本身就是 REST API，无风控、无动态签名，纯 HTTP 调用。这与 Google 账号操作有本质区别（后者的请求带运行时生成的一次性签名，无法重放）。所以接码这块做成纯协议实现是正确选择。

### 三家平台的协议差异

**SMS-Activate 与 SMSBower 使用同一套 `handler_api.php` 协议**（SMSBower 是兼容实现），只有 base URL 不同。SMSPool 是独立的 JSON API。

| | SMS-Activate | SMSBower | SMSPool |
|---|---|---|---|
| Base URL | `https://api.sms-activate.ae/stubs/handler_api.php` | `https://smsbower.online/stubs/handler_api.php` | `https://api.smspool.net` |
| 协议族 | handler_api | handler_api（兼容） | 独立 JSON |
| 响应格式 | 纯文本 `ACCESS_NUMBER:id:phone` | 同左 | JSON |

因此代码上应抽出 `handlerApiDriver`，两家共用，只传不同 base URL。

## 数据结构

### 1. 新增共享类型

在 `src/shared/types.ts` 末尾追加：

```ts
/** 一次接码租用的生命周期状态。 */
export type SmsRentalStatus = 'pending' | 'code_received' | 'canceled' | 'expired' | 'finished'

export interface SmsRental {
  /** 平台侧的租用 ID，用于后续查码/取消 */
  id: string
  /** E.164 号码，如 +8613800138000 */
  phone: string
  /** 不含国际区号的本地号码，某些站点表单需要 */
  localNumber: string
  countryCode: string
  driver: string
  status: SmsRentalStatus
  /** 已收到的验证码（未收到为 null） */
  code: string | null
  createdAt: number
  /** 平台侧租期截止时间戳 */
  expiresAt: number | null
  /** 消耗的余额，平台返回则填 */
  cost?: number
}

export interface SmsServiceOption {
  /** 平台侧的服务代号，如 SMS-Activate 的 'go' 代表 Google */
  code: string
  label: string
  /** 当前可用号码数，平台支持则填 */
  available?: number
  price?: number
}
```

### 2. 扩展驱动目录

修改 `src/shared/providers.ts`：

移除 `sms_activate` / `smsbower` 上的 `unimplemented`（任务 00 加的），补齐字段并新增两个驱动。完整的 SMS 段落：

```ts
// ── SMS ──────────────────────────────────────────────────
{
  type: 'sms',
  driver: 'sms_activate',
  label: 'SMS-Activate',
  description: '国际主流接码平台，按需租用号码接收短信验证码。',
  testable: true,
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true },
    {
      key: 'country',
      label: '默认国家代码',
      type: 'text',
      placeholder: '0=俄罗斯 6=印尼 187=美国',
      help: '留空则由平台自动分配。代码表见平台文档。'
    },
    {
      key: 'apiBase',
      label: 'API 地址（可选）',
      type: 'text',
      placeholder: 'https://api.sms-activate.ae/stubs/handler_api.php'
    },
    {
      key: 'maxPrice',
      label: '单号最高价（可选）',
      type: 'number',
      help: '超过此价格不租用，防止余额被高价号消耗。'
    }
  ]
},
{
  type: 'sms',
  driver: 'smsbower',
  label: 'SMSBower',
  description: '接码平台，使用与 SMS-Activate 兼容的 handler_api 协议。',
  testable: true,
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true },
    { key: 'country', label: '默认国家代码', type: 'text' },
    {
      key: 'apiBase',
      label: 'API 地址（可选）',
      type: 'text',
      placeholder: 'https://smsbower.online/stubs/handler_api.php'
    }
  ]
},
{
  type: 'sms',
  driver: 'smspool',
  label: 'SMSPool',
  description: '接码平台，独立 JSON API。',
  testable: true,
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true },
    { key: 'country', label: '默认国家（ISO 或数字 ID）', type: 'text', placeholder: 'US' },
    { key: 'apiBase', label: 'API 地址（可选）', type: 'text', placeholder: 'https://api.smspool.net' }
  ]
},
{
  type: 'sms',
  driver: 'generic_sms',
  label: '通用接码适配器',
  description: '用 URL 模板对接任意接码平台，支持 {apiKey}/{service}/{country}/{id} 占位符。',
  testable: true,
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true, secret: true },
    {
      key: 'rentUrl',
      label: '租号请求 URL',
      type: 'text',
      required: true,
      placeholder: 'https://api.example.com/rent?key={apiKey}&service={service}&country={country}'
    },
    {
      key: 'rentIdPath',
      label: '租用 ID 的 JSON 路径',
      type: 'text',
      required: true,
      placeholder: 'data.id',
      help: '响应为纯文本时填 text，配合下方正则提取。'
    },
    { key: 'rentPhonePath', label: '号码的 JSON 路径', type: 'text', required: true, placeholder: 'data.phone' },
    {
      key: 'codeUrl',
      label: '查码请求 URL',
      type: 'text',
      required: true,
      placeholder: 'https://api.example.com/sms?key={apiKey}&id={id}'
    },
    { key: 'codePath', label: '验证码的 JSON 路径', type: 'text', placeholder: 'data.code' },
    {
      key: 'codeRegex',
      label: '验证码提取正则（可选）',
      type: 'text',
      placeholder: '(\\d{6})',
      help: '响应非 JSON 或需从短信正文提取时使用，取第一个捕获组。'
    },
    { key: 'cancelUrl', label: '取消/释放 URL（可选）', type: 'text' },
    { key: 'finishUrl', label: '完成确认 URL（可选）', type: 'text' }
  ]
}
```

### 3. 数据库迁移

在 `src/main/db/migrations.ts` 的 `MIGRATIONS` 数组**末尾追加**：

```ts
{
  version: 10,
  // 接码租用记录。号码本身不算高敏感，但与账号绑定后有追溯价值，
  // 且需要在应用重启后仍能继续轮询/释放未完成的租用。
  sql: `
    CREATE TABLE sms_rentals (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      driver TEXT NOT NULL,
      remote_id TEXT NOT NULL,
      phone TEXT NOT NULL,
      country_code TEXT NOT NULL DEFAULT '',
      service TEXT NOT NULL DEFAULT '',
      account_id TEXT,
      task_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      code TEXT,
      cost REAL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_sms_rentals_status ON sms_rentals(status);
    CREATE INDEX idx_sms_rentals_account ON sms_rentals(account_id);
  `
}
```

## 实现方案

### 步骤 1：驱动抽象层

新建 `src/main/automation/sms/types.ts`：

```ts
import type { SmsRental, SmsServiceOption } from '@shared/types'

export interface SmsDriverContext {
  config: Record<string, string | number | boolean>
  signal?: AbortSignal
}

export interface SmsDriver {
  driver: string
  /** 租一个号。service 是平台侧服务代号，如 'go' = Google。 */
  rent(ctx: SmsDriverContext, service: string, country?: string): Promise<SmsRental>
  /** 查一次码。未到返回 null，不要在这里做轮询。 */
  fetchCode(ctx: SmsDriverContext, remoteId: string): Promise<string | null>
  /** 取消租用并退款。 */
  cancel(ctx: SmsDriverContext, remoteId: string): Promise<void>
  /** 确认完成（部分平台需要，否则号码会被判为未使用）。 */
  finish(ctx: SmsDriverContext, remoteId: string): Promise<void>
  /** 查余额，用于一键测试。 */
  balance(ctx: SmsDriverContext): Promise<{ amount: number; currency: string }>
  /** 可选：列出支持的服务，用于 UI 下拉。 */
  services?(ctx: SmsDriverContext, country?: string): Promise<SmsServiceOption[]>
}
```

### 步骤 2：handler_api 驱动（SMS-Activate + SMSBower 共用）

新建 `src/main/automation/sms/handlerApi.ts`。

协议速查（`GET` 请求，响应是纯文本）：

| 操作 | 请求参数 | 成功响应 | 失败响应示例 |
|---|---|---|---|
| 查余额 | `action=getBalance` | `ACCESS_BALANCE:123.45` | `BAD_KEY` |
| 租号 | `action=getNumber&service={s}&country={c}` | `ACCESS_NUMBER:{id}:{phone}` | `NO_NUMBERS` / `NO_BALANCE` |
| 查码 | `action=getStatus&id={id}` | `STATUS_OK:{code}` | `STATUS_WAIT_CODE` |
| 取消 | `action=setStatus&id={id}&status=8` | `ACCESS_CANCEL` | — |
| 完成 | `action=setStatus&id={id}&status=6` | `ACCESS_ACTIVATION` | — |

实现要求：

```ts
export function makeHandlerApiDriver(driver: string, defaultBase: string): SmsDriver
```

- 所有请求带 `api_key` 参数
- 响应先按 `:` 分割判断前缀，前缀不在白名单内一律当错误抛出，错误信息要把原始响应带上（如 `SMS-Activate 返回 NO_BALANCE：余额不足`）
- 常见错误码需翻译成中文：`BAD_KEY`→API Key 无效、`NO_NUMBERS`→当前无可用号码、`NO_BALANCE`→余额不足、`WRONG_SERVICE`→服务代号错误
- `rent()` 返回的 `phone` 统一补 `+` 前缀；`localNumber` 去掉国家码（handler_api 返回的是不带 `+` 的完整号码，国家码需按 `country` 参数映射，做一个常用国家码表即可）
- 请求超时 20 秒（`AbortSignal.timeout(20000)`），并与传入的 `ctx.signal` 合并

导出两个实例：

```ts
export const smsActivateDriver = makeHandlerApiDriver(
  'sms_activate',
  'https://api.sms-activate.ae/stubs/handler_api.php'
)
export const smsBowerDriver = makeHandlerApiDriver(
  'smsbower',
  'https://smsbower.online/stubs/handler_api.php'
)
```

### 步骤 3：SMSPool 驱动

新建 `src/main/automation/sms/smspool.ts`。

协议速查（`POST`，`application/x-www-form-urlencoded`，响应 JSON）：

| 操作 | 端点 | 关键参数 | 响应字段 |
|---|---|---|---|
| 查余额 | `/request/balance` | `key` | `balance` |
| 租号 | `/purchase/sms` | `key`, `country`, `service` | `success`, `order_id`, `number`, `cc`, `expires_in` |
| 查码 | `/sms/check` | `key`, `orderid` | `status`（1=待接收 3=已完成）, `sms`, `full_sms` |
| 取消 | `/sms/cancel` | `key`, `orderid` | `success` |

`fetchCode` 在 `status === 3` 时返回 `sms`，否则返回 `null`。SMSPool 无独立「完成」接口，`finish()` 实现为空操作。

### 步骤 4：通用适配器驱动

新建 `src/main/automation/sms/generic.ts`。

- URL 模板占位符替换：`{apiKey}` `{service}` `{country}` `{id}`
- JSON 路径取值实现一个小工具 `pick(obj, 'data.id')`，支持点号路径与数组下标
- `rentIdPath` 填 `text` 时把整个响应体当字符串处理，配合 `codeRegex` 提取
- 未配置 `cancelUrl` / `finishUrl` 时对应方法为空操作，不报错

### 步骤 5：驱动注册与服务层

新建 `src/main/automation/sms/index.ts`：

```ts
const DRIVERS: Record<string, SmsDriver> = {
  sms_activate: smsActivateDriver,
  smsbower: smsBowerDriver,
  smspool: smspoolDriver,
  generic_sms: genericSmsDriver
}

/** 默认（或第一个启用的）接码服务。 */
export function resolveDefaultSms(): { providerId: string; driver: SmsDriver; config: ... } | null

/** 租号并落库。 */
export async function rentNumber(opts: {
  service: string
  country?: string
  accountId?: string
  taskId?: string
  signal?: AbortSignal
}): Promise<SmsRental>

/** 轮询直到收到验证码或超时；超时自动取消租用。 */
export async function waitForSmsCode(
  rentalId: string,
  opts?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<string>

export async function cancelRental(rentalId: string): Promise<void>
export async function finishRental(rentalId: string): Promise<void>
export function listRentals(filter?: { status?: SmsRentalStatus }): SmsRental[]
```

`waitForSmsCode` 实现要求（对齐 `automation/mailbox.ts` 的 `poll()` 写法）：

- 轮询间隔 5 秒（接码平台限流普遍比邮箱严，不要用 3 秒）
- 默认超时 180 秒
- 每次轮询检查 `signal.aborted`，中断时**必须调用 `cancel()` 释放号码**，否则用户余额被白扣
- 超时同样要 `cancel()`
- 成功拿到码后调用 `finish()` 并把 `code` 与 `status` 写回 `sms_rentals`
- 全程不记录验证码明文到日志，只记位数

### 步骤 6：服务代号映射

新建 `src/main/automation/sms/services.ts`，维护平台服务代号表：

```ts
/** 内部平台 → 各接码平台的服务代号。 */
export const SERVICE_CODES: Record<Platform, Record<string, string>> = {
  google:  { handler_api: 'go',  smspool: '395' },
  github:  { handler_api: 'dr',  smspool: 'purchase 时按名称查' },
  x:       { handler_api: 'tw',  smspool: '...' },
  discord: { handler_api: 'ds',  smspool: '...' },
  // ...
}
```

> 代号会变动，实现时以平台当时的官方文档为准；`services()` 方法拿到的动态列表优先于这张静态表。

### 步骤 7：一键测试接入

修改 `src/main/services/providers.ts` 的 `testProvider()`：

```ts
if (p.type === 'sms') return await testSms(p)
```

`testSms()` 调用对应驱动的 `balance()`，返回 `{ ok: true, message: 'SMS-Activate 余额：$12.34' }`。余额为 0 时返回 `ok: false` 并提示充值。

### 步骤 8：IPC 暴露

四处同步（参考 `README.md` 铁律 2）：

`src/shared/ipc.ts` 新增：

```ts
sms: {
  rent: 'sms:rent',
  waitCode: 'sms:wait-code',
  cancel: 'sms:cancel',
  list: 'sms:list',
  services: 'sms:services'
}
```

`src/shared/types.ts` 的 `Api` 接口新增：

```ts
sms: {
  rent(opts: { service: string; country?: string; accountId?: string }): Promise<SmsRental>
  waitCode(rentalId: string, timeoutMs?: number): Promise<string>
  cancel(rentalId: string): Promise<void>
  list(): Promise<SmsRental[]>
  services(country?: string): Promise<SmsServiceOption[]>
}
```

新建 `src/main/ipc/sms.ipc.ts`，在 `src/main/ipc/index.ts` 注册；`src/preload/index.ts` 加桥接。

### 步骤 9：UI

**服务中心**（`pages/Providers.tsx`）：SMS 类型的卡片显示余额（调 `test` 拿到），去掉「未接入」标记。

**新增租号面板**：在 `pages/Providers.tsx` 的 SMS 分区下方加一个「当前租用」列表，展示 `sms:list` 的结果，每行显示号码、状态、倒计时、验证码（脱敏，复用任务 01 的 `SecretCell`），以及「取消释放」按钮。应用重启后未完成的租用要能在这里看到并手动释放。

## 验收标准

- [ ] 服务中心配置 SMS-Activate 后点「测试」能显示真实余额
- [ ] 手动租号能拿到真实号码，平台后台可见对应订单
- [ ] 发一条真实短信到该号码，轮询能取到验证码
- [ ] 轮询过程中点取消，平台侧订单变为已取消（余额退回）
- [ ] 超时后号码被自动释放，不会残留占用
- [ ] 关闭应用再打开，未完成的租用仍在「当前租用」列表里且可释放
- [ ] 通用适配器能对接一个自定义 URL（用 mock 服务验证即可）
- [ ] 日志中搜索不到验证码明文
- [ ] `npm run typecheck` 无错误
