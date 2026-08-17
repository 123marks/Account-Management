# 04 · Google 账号操作一条龙

**预估 2-3 天** · 依赖任务 02（接码）与 03（邮箱）

## 目标

补齐 Google 账号的完整维护能力：改密码（已有）、**改辅助邮箱**、**改/绑手机号**、**启用与轮换 2FA**、**读取备用码**，串成可批量执行的一条龙。

## 先明确技术路线：为什么不做协议级

需求里提到「抓包分析、协议执行」。这里必须说清楚，避免执行方走弯路。

Google 账号安全设置（`myaccount.google.com`）的写操作端点具备以下特征：

1. 请求体包含 **BotGuard**（`bgRequest`）字段——由页面动态 JS 生成的一次性反自动化令牌，无法离线复现
2. 关键操作附带 **reCAPTCHA Enterprise** token，与页面会话、设备指纹强绑定
3. `at` / `SAPISIDHASH` 等签名参数依赖当前 Cookie 与时间戳，且 Google 会校验请求来源的 TLS 指纹与 UA 一致性

结论：**抓包可以看到请求长什么样，但参数是运行时生成的一次性签名，重放必然失败**。协议级实现在 Google 上不成立。

**本任务全部采用浏览器驱动**（Playwright + 本机真实 Chrome + 持久化 profile），这也是现有 `flows/google.ts` 的做法，继续沿用。

> 可协议化的部分已经在任务 02 / 03 做掉了（接码平台、邮箱 IMAP 都是标准协议）。整体架构就是：**外围服务走协议，账号操作走浏览器**。

## 现状

`src/main/automation/flows/google.ts` 现有四个 flow：

| action | 状态 | 说明 |
|---|---|---|
| `check_login` | 可用 | 登录检测，含 2FA |
| `change_password` | 可用 | 改密码并写回账号库 |
| `change_recovery` | 部分可用 | 只能改辅助邮箱，手机号不通 |
| `manage_2fa` | 只读 | 仅读取 2SV 开关状态 |

`TaskType`（`src/shared/types.ts` 第 89 行）目前只有 5 个值，需要扩展。

## 数据结构变更

### 1. 扩展 TaskType

修改 `src/shared/types.ts`：

```ts
export type TaskType =
  | 'check_login'
  | 'change_password'
  | 'change_recovery'      // 保留：改辅助邮箱
  | 'manage_2fa'           // 保留：只读状态
  | 'register'
  | 'change_phone'         // 新增：绑定/更换手机号
  | 'enable_2fa'           // 新增：启用两步验证并导出 TOTP 密钥
  | 'rotate_2fa'           // 新增：轮换 TOTP 密钥
  | 'fetch_backup_codes'   // 新增：拉取备用码
```

⚠️ `automation_tasks` 表的 `type` 是 TEXT，无需迁移。但 `src/renderer/src/pages/Automation.tsx` 与 `components/AutomationTaskDrawer.tsx` 里若有 `TaskType` 的中文映射表，必须同步补齐新值，否则界面显示原始英文。

### 2. 任务参数约定

新动作的 `ActionParam` 定义（在各 flow 的 `params` 字段里声明，UI 自动渲染表单）：

| action | 参数 | 类型 | 说明 |
|---|---|---|---|
| `change_phone` | `useSmsProvider` | boolean | 是否用接码平台自动获取号码，默认 true |
| | `manualPhone` | text | 关闭上项时手填号码 |
| | `country` | text | 接码国家代码，留空用服务默认 |
| | `removeOld` | boolean | 是否删除旧号码，默认 false |
| `enable_2fa` | `method` | select | `totp`（推荐）/ `sms` |
| | `saveSecret` | boolean | 是否把 TOTP 密钥写回账号库，默认 true |
| | `fetchBackupCodes` | boolean | 启用后顺带拉取备用码，默认 true |
| `rotate_2fa` | `saveSecret` | boolean | 同上 |
| `fetch_backup_codes` | `regenerate` | boolean | 是否重新生成一组（旧的会失效），默认 false |

## 实现方案

### 通用前置：Google 页面稳定性处理

现有 `flows/google.ts` 已有登录与 2FA 处理逻辑，新 flow 全部复用。新增一个共享工具文件 `src/main/automation/flows/google/common.ts`，抽出：

```ts
/** 进入指定的 Google 账号设置页，处理可能的重新认证。 */
export async function gotoSecurityPage(ctx: StepContext, path: string): Promise<void>

/**
 * Google 在敏感操作前会要求重新输入密码（"确认是您本人"）。
 * 检测该页面并自动完成；若触发了 2FA 挑战则用账号的 TOTP 应答。
 */
export async function reauthenticate(ctx: StepContext): Promise<void>

/** Google UI 多语言且频繁改版，按可访问性角色 + 多语言正则定位比 CSS 选择器稳。 */
export function byName(re: RegExp): string
```

**定位策略铁律**：Google 的 DOM class 是混淆的且每周变。**禁止使用 class 选择器**，一律用：

1. `page.getByRole('button', { name: /多语言正则/i })`
2. `input[type="tel"]` 这类语义属性
3. `aria-label` 匹配

正则要同时覆盖中英文，例如确认按钮：`/^(next|continue|save|done|下一步|继续|保存|完成)$/i`。

### 步骤 1：change_phone（绑定/更换手机号）

新建 `src/main/automation/flows/google/changePhone.ts`。

流程：

1. `gotoSecurityPage(ctx, 'https://myaccount.google.com/phone')`
2. `reauthenticate(ctx)` — 大概率会要求验证密码
3. 若 `useSmsProvider`：调 `rentNumber({ service: 'go', country, accountId, taskId })`（任务 02 的 API）拿号
4. 点击「添加恢复电话」/「更改」按钮
5. 选择国家区号（下拉用 `selectOption` 或输入 `+86` 形式），填入 `localNumber`
6. 提交后 Google 发送短信
7. 调 `waitForSmsCode(rental.id, { timeoutMs: 180000, signal: ctx.signal })` 等码
8. 填入验证码，提交
9. 校验成功：页面出现新号码，或跳回 `/phone` 且号码已更新
10. `finishRental(rental.id)` 确认完成
11. 返回 `accountPatch: { recoveryPhone: rental.phone }` 写回账号库

失败路径必须处理：

- 任何步骤抛错都要 `cancelRental(rental.id)`，否则用户余额被扣
- Google 提示「此号码已被使用过多次」→ 取消当前号，明确报错让用户换国家
- 触发人机验证 → 复用 `flows/register.ts` 里 `handleChallenge()` 的逻辑

### 步骤 2：enable_2fa（启用两步验证）

新建 `src/main/automation/flows/google/enable2fa.ts`。

这是本任务最复杂的一环。Google 启用 2SV 的前置条件：账号必须已有一个可验证的第二因素（通常是手机号）。所以：

1. 先打开 `https://myaccount.google.com/signinoptions/twosv`
2. 读取当前状态；已启用则直接转 `rotate_2fa` 的逻辑或返回「已启用」
3. 未启用时点「开始使用」，Google 会要求验证手机——若账号无手机号，**明确报错提示先跑 `change_phone`**，不要在这里嵌套
4. 完成 2SV 开启
5. 进入 `https://myaccount.google.com/signinoptions/two-step-verification/authenticator`
6. 点「设置身份验证器」，Google 展示二维码
7. **提取 TOTP 密钥**：页面上有「无法扫描二维码？」链接，点开会显示 base32 明文密钥。**优先取这个文本**，比截图识别二维码可靠得多
8. 若拿不到文本密钥，退化方案：截取二维码图片，用 `jsqr`（项目已依赖）解码得到 `otpauth://` URI，再用 `services/totp.ts` 的 `parseUri` 提取
9. 用提取到的密钥生成当前验证码，填入 Google 的确认输入框完成绑定
10. `saveSecret` 为真时返回 `accountPatch: { totpSecret }`

关键点：**必须先用密钥生成一次码并通过 Google 校验，才能确认提取正确**。绑定成功再写回数据库，避免存进一个错误密钥导致账号锁死。

### 步骤 3：rotate_2fa（轮换密钥）

新建 `src/main/automation/flows/google/rotate2fa.ts`。

流程 = 移除现有 authenticator + 重新执行 `enable_2fa` 的第 5-10 步。

安全要求：**新密钥验证通过前，绝不覆盖数据库里的旧密钥**。实现顺序必须是：提取新密钥 → 生成码 → Google 校验通过 → 才写回。中途失败时旧密钥保持不变，同时把新旧两个密钥都记进任务 `result`（供人工恢复），但**不写日志**。

### 步骤 4：fetch_backup_codes（备用码）

新建 `src/main/automation/flows/google/backupCodes.ts`。

1. 打开 `https://myaccount.google.com/signinoptions/backupcodes`
2. `reauthenticate(ctx)`
3. `regenerate` 为真时点「获取新代码」，否则直接读现有列表
4. 抓取 10 个 8 位数字码
5. 返回 `accountPatch: { backupCodes: [...] }`

`AccountInput.backupCodes` 字段已存在，`repositories/accounts.ts` 已支持加密存储，无需改动数据层。

### 步骤 5：改回任务 00 的降级文案

任务 00 把 `manage_2fa` 标题改成了「（只读）」、`change_recovery` 改成了「修改恢复邮箱」。本任务完成后：

- `manage_2fa` 保持「只读」定位不变（它就是查状态用的），文案可保留
- `change_recovery` 的描述改为「修改恢复邮箱；如需改手机号请使用「Google 绑定/更换手机号」动作」

### 步骤 6：注册到 registry

修改 `src/main/automation/flows/registry.ts` 与 `flows/google.ts` 的导出，把四个新 flow 加进 `googleFlows` 数组。`actionsFor()` 会自动让它们出现在「运行自动化」弹窗里，UI 无需改动。

### 步骤 7：一条龙编排（可选增强）

在 `RunAutomationDialog` 里加一个「完整维护」预设，按顺序排队：
`check_login` → `change_password` → `change_phone` → `enable_2fa` → `fetch_backup_codes`。

实现方式：不要写新的编排引擎，直接在渲染层依次调 `api.automation.enqueue()`，并在前一个任务 `status === 'success'` 后再发下一个（`api.automation.onTaskUpdated` 已提供事件流）。

## 风险与预期

必须写进用户文档，避免预期落差：

1. **Google 会拦截**。同一 IP 短时间批量操作必然触发风控。强制建议每个账号配独立代理（`Account.proxyUrl` 已支持）并降低并发（设置里的 `maxConcurrency`）。
2. **改版即失效**。Google 每隔几个月改一次设置页 DOM。所有选择器要集中在 `flows/google/selectors.ts` 一个文件里，方便快速修。
3. **不保证成功率**。新设备/新 IP 操作敏感设置，Google 常要求「请在其他已登录设备上确认」，这一步无法自动化，只能在非无头模式下让用户手动点。flow 检测到该页面时应暂停并明确提示。
4. **首次跑必须非无头**。建议在这些 flow 的 `description` 里写明「建议关闭无头模式首次运行」。

## 验收标准

- [ ] 用一个测试 Google 账号，`change_phone` 能通过接码平台完成绑定，账号库里 `recoveryPhone` 被更新
- [ ] `change_phone` 中途取消，接码平台订单被释放
- [ ] `enable_2fa` 能提取到正确的 TOTP 密钥，写回后在 2FA 中心显示的验证码与 Google Authenticator 一致
- [ ] `enable_2fa` 提取失败时不写库，账号原状态不被破坏
- [ ] `rotate_2fa` 新密钥校验失败时旧密钥仍可用
- [ ] `fetch_backup_codes` 拉到 10 个码并加密入库，详情抽屉里可查看
- [ ] 全部新动作在「运行自动化」弹窗里可见且参数表单正确渲染
- [ ] 任务失败时自动截图落到 `screenshots/`，日志里能定位到失败步骤
- [ ] 日志与任务 `result` 中搜索不到 TOTP 密钥与备用码明文
- [ ] `npm run typecheck` 无错误
