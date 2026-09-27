import type { ThemeMode } from '@/types'

/**
 * 主题切换
 * ══════════════════════════════════════════════════════════════════════
 * ── 实现方式 ──────────────────────────────────────────────────────────
 * 设计令牌（背景 / 文本色）在 App.vue 里以 CSS 变量定义在 page 节点上，
 * tailwind.config.js 的 colors 引用这些变量。
 * 因此换肤只需要给**页面根节点**挂一个 class，那一层覆盖掉变量，
 * 整棵子树里所有 `bg-bg-card`、`text-content-primary` 自动取到新值。
 *
 * 组件完全不需要感知主题——它们用的还是同一批类名。
 * 这是这套方案最值钱的地方：新增页面不用为暗色/浅色各写一套样式。
 *
 * ── 为什么要一个单独的模块 ────────────────────────────────────────────
 * class 名和背景色值需要被三个地方用到（App.vue 的启动应用、
 * 页面外壳的 class 绑定、设置页的切换动作），
 * 分散写字符串很容易出现「改了变量名但漏改一处」——
 * 而那种错误的表现是「主题切了但某个页面没变」，极难定位。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 浅色主题的 class 名。定义在 App.vue 的全局样式里 */
const LIGHT_THEME_CLASS = 'theme-light'

/**
 * 各主题下页面根节点的背景色。
 *
 * 这个值必须与 App.vue 里 `--color-bg-base` 保持一致。
 *
 * 为什么不能用 CSS 变量代替：uni.setBackgroundColor 设置的是**窗口背景**，
 * 它由小程序原生层绘制，不在页面的 DOM/CSS 作用域内，读不到页面上的变量。
 * 它是页面滚到底部（或内容不足一屏）时露出来的那一层底色，
 * 不设置的话浅色主题下会从页面边缘露出一圈黑色。
 */
const THEME_BACKGROUND: Record<ThemeMode, string> = {
  dark: '#0F1115',
  light: '#F2F4F7',
}

/**
 * 取主题对应的根节点 class。
 *
 * 暗色返回空串（它是变量定义在 page 上的默认值，不需要额外 class）。
 */
export function themeClass(theme: ThemeMode): string {
  return theme === 'light' ? LIGHT_THEME_CLASS : ''
}

/**
 * 应用主题到窗口层。
 *
 * 页面内的颜色由 class 负责，这里只处理 class 够不到的那一层
 * （窗口背景、iOS 的上下回弹区域）。
 */
export function applyTheme(theme: ThemeMode): void {
  uni.setBackgroundColor({
    backgroundColor: THEME_BACKGROUND[theme],
    // 失败不抛错：某些平台（尤其 H5）不支持这个 API，
    // 而它只影响露出的那一圈底色，不该让主题切换整体失败
    fail: () => undefined,
  })
}
