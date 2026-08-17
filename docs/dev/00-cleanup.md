# 00 · 清理空壳与误导性交互

**预估 2 小时** · 无依赖 · 先做这个，避免后续任务在假功能上继续叠加

## 目标

界面上不能出现「配了也没用」和「看着能点其实不能点」的东西。要么实现，要么明确标注未接入，要么隐藏。

## 现状问题清单

### 问题 1：状态灯长得像按钮

`src/renderer/src/components/AccountCard.tsx` 的 `Indicator` 组件（第 11-20 行）渲染 `密码 / 2FA / 代理 / 恢复` 四个带边框的方块，视觉上是按钮，但**没有任何 onClick**。用户点击无反应。

### 问题 2：接码服务是纯空壳

`src/shared/providers.ts` 声明了 `sms_activate` 和 `smsbower` 两个驱动，服务中心能填 API Key 并保存，但：

- `src/main/` 下**没有任何消费 sms 类型 provider 的代码**（已全量检索确认）
- `src/main/services/providers.ts` 的 `testProvider()` 对 sms 类型直接返回「该类型暂不支持一键测试」

用户配了 Key 以为能用，实际什么都不会发生。

### 问题 3：邮箱驱动半数未实现

`src/main/automation/mailbox.ts`：

| 驱动 | 目录里声明 | 运行时 |
|---|---|---|
| `tempmail_lol` | ✅ | ✅ 可用 |
| `testmail` | ✅ | ✅ 可用 |
| `cfworker` | ✅ | ❌ `createInbox()` 抛错 |
| `generic_http` | ✅ | ❌ `createInbox()` 抛错 |

### 问题 4：Google 动作名不副实

`src/main/automation/flows/google.ts`：

- `manage_2fa`（第 242 行）标题是「两步验证状态」，但描述里写明「启用/轮换 2FA 因流程复杂暂不自动执行」，实际**只读状态**
- `change_recovery`（第 185 行）描述写「恢复手机因流程复杂暂为尽力而为」，实际**改不了手机号**

## 实现方案

### 步骤 1：给驱动目录加「未接入」标记

修改 `src/shared/providers.ts`，在 `ProviderDriver` 接口上加字段：

```ts
export interface ProviderDriver {
  // ...existing fields...
  /** 驱动已在目录中声明，但主进程运行时尚未实现。UI 需明确提示。 */
  unimplemented?: boolean
}
```

给以下驱动加 `unimplemented: true`：`cfworker`、`generic_http`、`sms_activate`、`smsbower`。

> 任务 02 完成后要把两个 sms 驱动的该标记去掉。

### 步骤 2：服务中心 UI 呈现该状态

修改 `src/renderer/src/pages/Providers.tsx` 与 `src/renderer/src/components/ProviderConfigDialog.tsx`：

- 驱动下拉里，`unimplemented` 的选项文案后缀加 `（未接入）`
- 选中后在表单顶部显示警告条：`该驱动尚未接入运行时，保存后不会生效。`
- 已保存的此类 provider，在列表卡片上显示一个 `未接入` 的 `Badge variant="outline"`

### 步骤 3：状态灯改成真按钮

修改 `src/renderer/src/components/AccountCard.tsx`：

`Indicator` 增加可选 `onClick` 与 `title`，有 `onClick` 时渲染成 `<button>` 并加 hover 态；无则保持 `<div>`。

`AccountCardHandlers` 接口新增：

```ts
onCopyTotp: () => void
onCopyRecovery: () => void
onEditProxy: () => void
```

四个格子的行为：

| 格子 | 有数据时点击 | 无数据时 |
|---|---|---|
| 密码 | 复用已有 `onCopyPassword` | 不可点，`title="未设置密码"` |
| 2FA | `onCopyTotp` 复制当前验证码 | 不可点，`title="未配置 2FA"` |
| 代理 | `onEditProxy` 打开编辑弹窗并聚焦代理字段 | 同上（可点，去配置） |
| 恢复 | `onCopyRecovery` 复制恢复邮箱/手机 | 不可点 |

在 `src/renderer/src/pages/Accounts.tsx` 第 618-634 行的 `<AccountCard>` 处补齐这三个新 handler。`copyTotp` 函数在该文件中已存在（第 720 行下拉菜单里用过），直接复用。

### 步骤 4：Google 动作改名，避免误导

修改 `src/main/automation/flows/google.ts`：

- `manage_2fa` 的 `title` 改为 `Google 两步验证状态（只读）`
- `change_recovery` 的 `title` 改为 `Google 修改恢复邮箱`，`description` 删掉「恢复手机…尽力而为」，改为「仅修改恢复邮箱；恢复手机请使用独立的改手机号动作（开发中）」

> 任务 04 完成后这两处要改回来。

## 验收标准

- [ ] 服务中心选择 `cfworker` / `generic_http` / `sms_activate` / `smsbower` 时，能看到明确的「未接入」提示
- [ ] 账号卡片四个状态格子：有数据的可点且有 hover 反馈，点击后 toast 提示复制成功；无数据的鼠标悬停显示原因
- [ ] Google 动作列表里不再出现暗示「能改 2FA / 能改手机号」的文案
- [ ] `npm run typecheck` 无错误
