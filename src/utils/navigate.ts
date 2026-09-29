import { ROUTES } from '@/constants/routes'

/**
 * 路由跳转工具
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 返回上一页；页面栈里只有自己时改跳兜底页（默认首页）。
 *
 * 为什么必须判断页面栈长度，而不是直接调 uni.navigateBack()：
 * 从「编译模式直达」「分享卡片」「扫码进入」这类入口打开页面时，
 * 栈里只有当前这一页，navigateBack 会**静默失败**——不报错、不跳转。
 * 用户看到的是「点了返回没反应」，比跳错页面更让人困惑。
 *
 * 这个判断在本项目有三处需要（页面外壳的返回按钮、锁页的取消与设置完成），
 * 集中在这里可以避免某处漏判，也避免三份实现逐渐分叉。
 *
 * @param fallback 无路可退时的目标页，默认首页
 */
export function goBack(fallback: string = ROUTES.HOME): void {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }
  // 用 reLaunch 而不是 redirectTo：兜底场景下页面栈信息已经不可信，
  // reLaunch 会清空栈后重建，结果是确定的
  uni.reLaunch({ url: fallback })
}
