import type { Flow, FlowResult } from '../../types'
import { ensureGoogleLogin } from './login'
import { clickNamed, gotoSecurityPage } from './common'

export const fetchBackupCodes: Flow = {
  platform: 'google',
  action: 'fetch_backup_codes',
  title: 'Google 拉取备用码',
  description: '读取或重新生成 10 个备用码并加密入库。重新生成会使旧码失效。',
  params: [{ key: 'regenerate', label: '重新生成一组（旧码失效）', type: 'boolean', defaultValue: false }],
  async run(ctx): Promise<FlowResult> {
    await ensureGoogleLogin(ctx)
    await ctx.step('打开备用码页', async () => {
      await gotoSecurityPage(ctx, 'https://myaccount.google.com/two-step-verification/backup-codes')
    })
    ctx.setProgress(50)
    if (ctx.params.regenerate) {
      await clickNamed(ctx, /get new|新代码|generate|生成|refresh|刷新/i)
      await ctx.page.waitForTimeout(1500)
    }
    const text = (await ctx.page.textContent('body').catch(() => '')) ?? ''
    const codes = [...text.matchAll(/\b(\d{4}\s?\d{4})\b/g)].map((x) => x[1].replace(/\s/g, ''))
    if (codes.length < 8) throw new Error('未能识别备用码（页面结构可能已变化）')
    ctx.log('info', `已读取 ${codes.length} 个备用码`)
    return {
      ok: true,
      message: `已获取 ${Math.min(codes.length, 10)} 个备用码`,
      data: { accountPatch: { backupCodes: codes.slice(0, 10) } }
    }
  }
}
