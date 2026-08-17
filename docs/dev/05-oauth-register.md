# 05 · 用 Google / GitHub 账号注册第三方平台

**预估 2 天** · 依赖任务 04

## 目标

现在的注册流程只支持「邮箱 + 密码」表单注册，且只覆盖 Cursor / Windsurf 两个平台。本任务增加 **OAuth 注册**：用账号库里已有的 Google / GitHub 账号，一键在第三方平台完成「使用 Google 继续」式注册，并把新账号落库、与源账号建立关联。

## 现状

`src/main/automation/flows/register.ts` 是一个数据驱动的表单注册框架：

```ts
export interface RegisterSpec {
  platform: Platform
  signupUrl: string
  emailSelectors: string[]
  passwordSelectors?: string[]
  codeSelectors: string[]
  // ...
}
```

新增一个表单注册平台只需加一个 spec 对象，这个设计要保留并沿用到 OAuth。

现有约束：

- 注册入口是 `BatchRegisterDialog`，走 `api.automation.registerBatch(platform, count)`
- 注册前由 `mailbox.createInbox()` 分配临时邮箱，token 通过 `secrets.ts` 的 `getTaskSecret` 在内存里传递
- `registerablePlatforms()` 从 flows 里推导可注册平台列表

## 设计

### 与表单注册的本质差异

| | 表单注册 | OAuth 注册 |
|---|---|---|
| 需要邮箱服务 | 是 | 否（用源账号的邮箱） |
| 需要新密码 | 是 | 否（无独立密码） |
| 前置条件 | 无 | 必须已有可登录的 Google/GitHub 账号 |
| 关键步骤 | 填表 + 收验证码 | 点 OAuth 按钮 + 授权确认 |
| 产物 | 新账号（含密码） | 新账号（无密码，标记 OAuth 来源） |

### 数据结构

#### 1. 账号关联字段

新增迁移，在 `src/main/db/migrations.ts` 末尾追加：

```ts
{
  version: 11,
  // OAuth 注册产生的账号，记录它是用哪个账号授权来的，
  // 便于「源账号失效 → 找出所有受影响的下游账号」。
  sql: `
    ALTER TABLE accounts ADD COLUMN oauth_provider TEXT;
    ALTER TABLE accounts ADD COLUMN oauth_source_account_id TEXT;
    CREATE INDEX idx_accounts_oauth_source ON accounts(oauth_source_account_id);
  `
}
```

`src/shared/types.ts` 的 `Account` 与 `AccountInput` 同步加字段：

```ts
/** 该账号通过哪个 OAuth 提供方注册（'google' | 'github' | ''）。 */
oauthProvider: string
/** 授权源账号的 id，空表示非 OAuth 注册。 */
oauthSourceAccountId: string
```

`src/main/db/repositories/accounts.ts` 的 `mapRow` / `create` / `update` 三处补齐字段读写。

#### 2. OAuth 注册 spec

新建 `src/main/automation/flows/oauthRegister.ts`：

```ts
export interface OAuthRegisterSpec {
  /** 目标平台 */
  platform: Platform
  title: string
  description: string
  signupUrl: string
  /** 支持哪些授权源 */
  providers: Array<'google' | 'github'>
  /** 「使用 Google 继续」按钮的定位候选 */
  oauthButtonSelectors: Record<'google' | 'github', string[]>
  /** 注册成功的判据：URL 包含该片段 */
  successUrlIncludes?: string
  /** 成功后可选的补充步骤，如填昵称、勾选条款 */
  postSteps?: Array<{ selectors: string[]; action: 'click' | 'fill'; value?: string }>
}
```

## 实现方案

### 步骤 1：源账号选择与登录态复用

这是 OAuth 注册的核心难点：目标平台的浏览器上下文里，必须已经有 Google/GitHub 的登录态。

方案：**直接复用源账号的持久化 profile**。

`Account.profileDir` 已经为每个账号维护了独立的 Chrome user-data-dir（见 `automation/browser.ts`）。OAuth 注册任务应该：

1. 不为新账号创建 profile
2. 直接用**源账号**的 profile 启动浏览器
3. 在该上下文里访问目标平台并完成 OAuth

这样源账号的 Google 登录态天然可用，不需要在授权页重新登录。

实现上需要在 `automation/engine.ts` 里支持「任务指定使用另一个账号的 profile」。新增任务参数 `sourceAccountId`，`browser.ts` 的 `launchContext` 按该 id 取 profileDir。

### 步骤 2：OAuth flow 实现

```ts
export function makeOAuthRegisterFlow(spec: OAuthRegisterSpec): Flow {
  return {
    platform: spec.platform,
    action: 'register',
    title: spec.title,
    description: spec.description,
    params: [
      {
        key: 'oauthProvider',
        label: '授权方式',
        type: 'select',
        required: true,
        options: spec.providers.map((p) => ({ value: p, label: p === 'google' ? 'Google' : 'GitHub' }))
      },
      { key: 'sourceAccountId', label: '授权源账号', type: 'text', required: true }
    ],
    async run(ctx) { /* ... */ }
  }
}
```

`run` 的步骤：

1. **打开注册页** `page.goto(spec.signupUrl)`
2. **点击 OAuth 按钮** — 用 `firstVisible(page, spec.oauthButtonSelectors[provider])`；定位优先用文本角色匹配：`getByRole('button', { name: /continue with google|sign up with google|使用 Google/i })`
3. **处理授权页**：
   - 若跳到 `accounts.google.com` 且显示账号选择器 → 点击与源账号邮箱匹配的那一项
   - 若要求重新输入密码 → 复用任务 04 的 `reauthenticate()`
   - 若出现「继续前往 XXX」的同意页 → 点「继续 / Allow / Authorize」
   - GitHub 的 `Authorize` 按钮有 3 秒防误点延迟，需 `waitForTimeout(3500)` 再点
4. **等待回跳** — `page.waitForURL(url => url.includes(spec.successUrlIncludes), { timeout: 60000 })`
5. **执行 postSteps** — 部分平台回跳后还要填昵称/选套餐
6. **返回结果**：

```ts
return {
  ok: true,
  message: `已通过 ${provider} 完成 ${spec.platform} 注册`,
  data: {
    accountPatch: {
      email: sourceAccount.email,
      oauthProvider: provider,
      oauthSourceAccountId: sourceAccount.id,
      status: 'active',
      notes: `OAuth 注册于 ${new Date().toLocaleString()} · 源账号 ${sourceAccount.label}`
    }
  }
}
```

### 步骤 3：首批平台 spec

覆盖常见的 AI/开发工具平台（这些普遍支持 Google/GitHub 登录）：

```ts
const OPENAI: OAuthRegisterSpec = {
  platform: 'openai',
  title: 'OpenAI 注册（OAuth）',
  description: '用已有 Google/Microsoft 账号在 OpenAI 完成注册。',
  signupUrl: 'https://auth.openai.com/create-account',
  providers: ['google'],
  oauthButtonSelectors: {
    google: ['button:has-text("Continue with Google")', '[data-provider="google"]'],
    github: []
  },
  successUrlIncludes: 'chatgpt.com'
}

const CURSOR_OAUTH: OAuthRegisterSpec = {
  platform: 'cursor',
  title: 'Cursor 注册（OAuth）',
  signupUrl: 'https://authenticator.cursor.sh/sign-up',
  providers: ['google', 'github'],
  // ...
}
```

同一 platform 同时存在表单注册与 OAuth 注册时，`registry.ts` 的 `byKey` 用 `platform:action` 做键会冲突。需要把键改为 `platform:action:variant`，或给 OAuth flow 用独立的 action 值 `register_oauth`（**推荐后者，改动更小**）。

选 `register_oauth` 的话：

- `TaskType` 加该值
- `registry.ts` 的 `actionsFor()` 过滤条件从 `f.action !== 'register'` 改为 `!f.action.startsWith('register')`
- `registerablePlatforms()` 同步适配

### 步骤 4：UI

修改 `src/renderer/src/components/BatchRegisterDialog.tsx`：

1. 顶部加「注册方式」切换：`邮箱注册` / `OAuth 注册`
2. 选 OAuth 时：
   - 平台下拉只列支持 OAuth 的平台
   - 新增「授权源账号」选择器，列出账号库里 `platform === 'google' | 'github'` 且 `status === 'active'` 的账号，支持多选
   - 数量输入框改为只读（等于选中的源账号数——一个源账号在同一平台只能注册一个）
3. 提交时按源账号逐个 enqueue

### 步骤 5：关联展示

在 `AccountDetailDrawer.tsx` 里，若账号有 `oauthSourceAccountId`：

- 显示一行「授权来源：{源账号 label}」，可点击跳转到源账号详情
- 反向：在源账号详情里显示「已用此账号注册：N 个平台」列表

这个关联在源账号要改密码/改 2FA 时很有价值——能提前知道会影响哪些下游账号。

## 风险提示

1. **OAuth 授权页高度依赖 UI**，Google 同意页有多种变体（新用户/老用户/组织账号），需要多次实测调选择器
2. **平台可能拒绝**：部分平台对同一 Google 账号只允许注册一次，重复执行会走到登录而非注册。flow 要能识别「已存在账号」并返回明确信息而非报错
3. **风控关联**：用同一 Google 账号在大量平台注册会形成关联画像。文档里要提示用户按需使用

## 验收标准

- [ ] 用一个已登录的 Google 账号，能在目标平台完成 OAuth 注册并落库
- [ ] 新账号的 `oauthProvider` 与 `oauthSourceAccountId` 正确写入
- [ ] 详情抽屉能双向看到授权关联
- [ ] 源账号未登录时，flow 报出明确错误（提示先跑 `check_login`）
- [ ] 目标平台已存在该账号时，返回「账号已存在」而非失败
- [ ] 表单注册的原有流程（Cursor / Windsurf）不受影响
- [ ] `npm run typecheck` 无错误
