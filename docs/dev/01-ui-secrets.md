# 01 · 账号列表脱敏与快捷操作

**预估 0.5 天** · 无依赖

## 目标

参照成熟账号管理器（如 Cockpit 风格）的信息密度：敏感信息**默认隐藏**，一个全局小眼睛统一切换；列表视图内联展示可复制、可编辑的 2FA / 密码 / 手机号 / 邮箱。

## 现状

- 脱敏能力**只存在于详情抽屉** `src/renderer/src/components/AccountDetailDrawer.tsx`（`revealPw` / `revealCodes` / `revealToken` 三个局部 state）
- 列表视图（`pages/Accounts.tsx` 第 637-746 行的 Table）**只有 2FA 一列**，且验证码始终明文显示
- 密码、手机号在列表里完全看不到，只能进详情或走下拉菜单复制
- 没有全局脱敏开关

## 数据结构变更

### 1. 全局脱敏状态

新建 `src/renderer/src/store/privacy.ts`：

```ts
import { create } from 'zustand'

const KEY = 'aam.privacy.revealed'

interface PrivacyState {
  /** 全局是否显示敏感信息。默认 false（隐藏）。 */
  revealed: boolean
  toggle: () => void
  set: (v: boolean) => void
}

export const usePrivacyStore = create<PrivacyState>((set) => ({
  // 默认隐藏；用户的选择在会话间保留，但每次冷启动重置为隐藏更安全。
  // 这里采用 sessionStorage：关闭应用后恢复隐藏。
  revealed: sessionStorage.getItem(KEY) === '1',
  toggle: () =>
    set((s) => {
      const next = !s.revealed
      sessionStorage.setItem(KEY, next ? '1' : '0')
      return { revealed: next }
    }),
  set: (v) => {
    sessionStorage.setItem(KEY, v ? '1' : '0')
    set({ revealed: v })
  }
}))
```

参考已有 store 的写法：`src/renderer/src/store/app.ts`。

### 2. 列表需要密码明文——但不能全量下发

**关键约束**：`Account` 类型不含密码，列表渲染时拿不到明文。绝不能为了显示而修改 `accounts:list` 让它返回密文。

采用**按需揭示 + 内存缓存**：

新建 `src/renderer/src/lib/secretsCache.ts`：

```ts
import type { AccountSecrets } from '@shared/types'
import { api } from '@renderer/lib/api'

// 仅存活于渲染进程内存；切换到隐藏态时必须清空。
const cache = new Map<string, AccountSecrets>()
const inflight = new Map<string, Promise<AccountSecrets>>()

export async function getSecrets(accountId: string): Promise<AccountSecrets> {
  const hit = cache.get(accountId)
  if (hit) return hit
  const pending = inflight.get(accountId)
  if (pending) return pending
  const p = api.accounts.reveal(accountId).then((s) => {
    cache.set(accountId, s)
    inflight.delete(accountId)
    return s
  })
  inflight.set(accountId, p)
  return p
}

export function clearSecretsCache(): void {
  cache.clear()
  inflight.clear()
}

export function invalidateSecrets(accountId: string): void {
  cache.delete(accountId)
}
```

`usePrivacyStore` 切回隐藏时、以及账号被编辑后，必须调用对应的清理函数。

## 实现方案

### 步骤 1：顶栏加全局小眼睛

修改 `src/renderer/src/components/TopBar.tsx`，在右侧操作区加按钮：

```tsx
const revealed = usePrivacyStore((s) => s.revealed)
const toggle = usePrivacyStore((s) => s.toggle)

<Button
  variant="ghost"
  size="icon"
  title={revealed ? '隐藏敏感信息' : '显示敏感信息'}
  aria-label={revealed ? '隐藏敏感信息' : '显示敏感信息'}
  aria-pressed={revealed}
  onClick={() => {
    if (revealed) clearSecretsCache()
    toggle()
  }}
>
  {revealed ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
</Button>
```

再挂一个全局快捷键 `Ctrl+Shift+H` 切换（`CommandPalette.tsx` 里已有键盘监听的写法可参考）。

### 步骤 2：抽出通用脱敏单元格组件

新建 `src/renderer/src/components/SecretCell.tsx`。这是本任务的核心复用组件：

```tsx
interface SecretCellProps {
  /** 明文值；传 null 表示尚未加载 */
  value: string | null
  /** 无值时的占位，默认 '—' */
  empty?: string
  /** 遮罩形态：'dots' 定长圆点 / 'partial' 保留首尾（手机号、邮箱用） */
  mask?: 'dots' | 'partial'
  /** 复制成功的 toast 文案，如「密码已复制」 */
  copyLabel: string
  /** 传入则显示铅笔图标，点击进入行内编辑 */
  onEdit?: (next: string) => Promise<void>
  /** 需要异步取明文时的加载器（配合 secretsCache） */
  load?: () => Promise<string | null>
  className?: string
}
```

行为规范：

1. 全局 `revealed === false` 时显示遮罩，**不触发** `load()`——即不调用 `api.accounts.reveal`，避免无谓解密
2. `revealed === true` 时调用 `load()` 取明文，加载中显示骨架
3. 整个单元格可点击复制（即使处于遮罩态也能复制真实值——此时临时调 `load()`），复制后 `toast.success(copyLabel)`
4. 传了 `onEdit` 时，末尾显示铅笔按钮；点击切换为 `<Input>`，`Enter` 保存 / `Esc` 取消 / 失焦保存
5. `mask: 'partial'` 规则：邮箱 `ab****@gmail.com`，手机号 `+86 138****8888`

遮罩样式统一用 `font-mono tracking-widest text-muted-foreground`，圆点数固定 8 个，**不要按真实长度渲染**（会泄漏密码长度）。

### 步骤 3：改造 TotpCell 支持脱敏与编辑

修改 `src/renderer/src/components/TotpCell.tsx`：

- 接入 `usePrivacyStore`；隐藏态时验证码渲染为 `••• •••`，倒计时环**保持正常转动**（不泄漏内容但保留可用性）
- 点击行为不变：始终复制真实验证码
- 新增可选 prop `onEditSecret?: () => void`，传入时在右侧加一个小铅笔按钮，点击打开 `AccountDialog` 并定位到 2FA 字段
- 隐藏态下轮询照常（`api.totp.get` 返回的是验证码不是密钥，风险可接受）

### 步骤 4：列表视图扩列

修改 `src/renderer/src/pages/Accounts.tsx` 第 637-746 行的表格。新列布局：

| 列 | 内容 | 组件 |
|---|---|---|
| 选择框 | 不变 | `Checkbox` |
| 平台 | 不变 | `PlatformGlyph` |
| 账号 | 不变（标签 + 邮箱） | 现有 |
| **密码** | **新增**，脱敏 + 点击复制 + 可编辑 | `SecretCell` |
| 2FA 验证码 | 改造后的 | `TotpCell` |
| **手机号** | **新增**，脱敏 + 点击复制 + 可编辑 | `SecretCell` |
| 恢复信息 | 现有 `recoveryTags(a)` 改为可点击复制 | `SecretCell` |
| 状态 | 不变 | `AccountStatusBadge` |
| 最近使用 | 不变 | — |
| 操作 | 不变 | `DropdownMenu` |

列变多后表格会挤，需要：

- 给 `<Table>` 外层套 `overflow-x-auto`
- 密码列固定 `w-[140px]`，手机号列 `w-[150px]`
- 在工具栏加「列显示」下拉（复用 `DropdownMenu` + `Checkbox`），让用户勾选显示哪些列，选择存 `localStorage`

各列的数据来源：

```tsx
// 密码列
<SecretCell
  value={null}
  load={async () => (await getSecrets(a.id)).password}
  copyLabel="密码已复制"
  onEdit={async (next) => {
    await api.accounts.update(a.id, { password: next })
    invalidateSecrets(a.id)
    await load()
  }}
/>

// 手机号列（recoveryPhone 本身不是密文，Account 上直接有）
<SecretCell
  value={a.recoveryPhone}
  mask="partial"
  copyLabel="手机号已复制"
  onEdit={async (next) => {
    await api.accounts.update(a.id, { recoveryPhone: next })
    await load()
  }}
/>
```

### 步骤 5：卡片视图同步

`AccountCard.tsx` 在任务 00 已把状态灯改成按钮。此处补充：隐藏态下卡片副标题的邮箱也走 `mask: 'partial'`。

## 安全注意事项

1. `secretsCache` 只能存在于渲染进程内存，**禁止**写入 `localStorage` / `sessionStorage` / IndexedDB
2. 切回隐藏态、应用锁定（`store/lock.ts` 的锁定事件）、窗口失焦超过 5 分钟，都要调 `clearSecretsCache()`
3. 行内编辑密码时，`<Input type="text">` 只在 `revealed === true` 时允许；隐藏态下点铅笔要先提示「请先开启显示」
4. 复制到剪贴板后建议 60 秒自动清空剪贴板（可选增强，用 `setTimeout` + `navigator.clipboard.writeText('')`，需判断期间用户没复制别的内容）

## 验收标准

- [ ] 冷启动后所有敏感字段默认遮罩
- [ ] 顶栏小眼睛与 `Ctrl+Shift+H` 都能全局切换，切换即时生效于所有列表行
- [ ] 隐藏态下点击密码单元格仍能正确复制真实密码
- [ ] 列表内可直接编辑密码与手机号并落库，刷新后保持
- [ ] 2FA 列在隐藏态显示 `••• •••` 且倒计时环仍在走
- [ ] 列显示配置刷新后保持
- [ ] 隐藏态下打开 DevTools 检查 DOM，**看不到**任何明文密码
- [ ] `npm run typecheck` 无错误
