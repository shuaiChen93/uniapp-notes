/**
 * 设备信息工具
 * ══════════════════════════════════════════════════════════════════════
 * 目前只有一个用途：算出「自绘头部右侧要留出多少内边距」，
 * 好让页面自己的按钮不去和微信右上角的胶囊（关闭 / 分享那两颗）打架。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 兜底值：没有胶囊时按常规页边距处理，与 Tailwind 的 px-4 一致 */
const FALLBACK_RIGHT_PADDING = 16

/** 按钮与胶囊之间至少让出的空隙，纯粹是视觉呼吸感 */
const CAPSULE_GAP = 12

/**
 * 自绘头部右侧应留出的内边距（px）。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────
 * 微信小程序的胶囊按钮是**原生组件**，永远绘制在 WebView 之上，
 * 页面里 z-index 写得再高也盖不住。自绘导航栏时若把「保存」「完成」
 * 这类按钮右对齐，真机上会被胶囊整个吃掉。
 *
 * 这个 bug 的隐蔽之处在于：H5 端没有胶囊，调试时一切正常，
 * 只有在小程序模拟器或真机上才看得见——所以它不是「样式微调」，
 * 而是会直接导致主操作点不到的功能缺陷。
 *
 * ── 为什么用条件编译而不是运行时判断 ──────────────────────────────────
 * H5 与 App 端同样注册了这个 API，返回值各版本不一（有返回全 0 的，
 * 也有返回一组模拟值的）。靠「宽度大于 0」来猜平台并不可靠——
 * 一旦某个版本在 H5 返回了模拟胶囊，网页端就会凭空多出一大块右侧留白。
 * 条件编译把判断提前到编译期，比运行时试探确定得多。
 *
 * try/catch 是另一层保险：个别基础库版本在页面尚未就绪时调用会抛错，
 * 而一段样式计算不值得让整个页面白屏。
 */
export function getHeaderRightPadding(): number {
  // #ifdef MP-WEIXIN
  try {
    const rect = uni.getMenuButtonBoundingClientRect()
    const { windowWidth = 0 } = uni.getWindowInfo()

    // 胶囊左边缘到屏幕右边的距离，正是右侧按钮必须让出的宽度
    if (rect && rect.width > 0 && rect.left > 0 && windowWidth > rect.left) {
      const safe = windowWidth - rect.left + CAPSULE_GAP
      if (safe > FALLBACK_RIGHT_PADDING) return safe
    }
  } catch {
    // 取不到就当没有胶囊，走下面的兜底值
  }
  // #endif

  return FALLBACK_RIGHT_PADDING
}
