<script setup lang="ts">
import { watch } from 'vue'
import { onLaunch, onShow, onHide, onError } from '@dcloudio/uni-app'
import { useLockStore, useSettingsStore } from '@/store'
import { applyTheme } from '@/utils/theme'
import { ROUTES } from '@/constants/routes'

/**
 * 主题初始化。
 *
 * 在 setup 顶层（而不是 onLaunch 内部）建立 watch：
 * setup 的执行早于所有生命周期钩子，immediate: true 会让它在
 * 首屏渲染之前就把窗口背景色设好。放进 onLaunch 的话，
 * 冷启动时会先闪一下默认底色再变成用户选的主题。
 */
const settingsStore = useSettingsStore()
watch(() => settingsStore.settings.theme, applyTheme, { immediate: true })

/* ══════════════════════════════════════════════════════════════════════
 * 密码锁的全局拦截
 * ══════════════════════════════════════════════════════════════════════
 * 拦截点放在 App 的 onShow 而不是每个页面的 onShow：
 *
 *   ① 页面级拦截要靠每个页面自觉调用，新增页面时漏一次就是一个缺口，
 *      而「漏了拦截」这个 bug 不会报错，只表现为「某个页面不用密码就能进」；
 *   ② App 的 onShow 是唯一的全局入口——冷启动、切后台回来都会经过它，
 *      天然覆盖了「重新打开」这个最需要拦截的时刻。
 * ══════════════════════════════════════════════════════════════════════ */
const lockStore = useLockStore()

/**
 * 跳转到锁页。
 *
 * ⚠️ 必须用 reLaunch 而不是 navigateTo，两者在安全性上完全不同：
 *
 *   navigateTo —— 把锁页压在原来的页面之上。用户一个返回手势（或安卓返回键）
 *                 就回到了被保护的页面，密码锁形同虚设；
 *   reLaunch   —— 清空页面栈后重建，栈里只剩锁页，返回键无从下手。
 *
 * 代价是解锁后无法「原路返回」，只能回到首页——这个代价是值得的，
 * 而且符合用户对「应用级密码锁」的预期：解锁之后从首页重新进入。
 */
function redirectToLock(): void {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]

  // 已经在锁页就不再跳：重复 reLaunch 会重建页面，把用户输到一半的密码清空，
  // 表现为「输得快一点就会莫名重置」
  if (current && `/${current.route}` === ROUTES.LOCK) return

  uni.reLaunch({ url: ROUTES.LOCK })
}

/**
 * 应用生命周期。
 *
 * 这里刻意不放业务数据初始化：记事数据由 Pinia 持久化插件在
 * store first-use 时自动从 storage 恢复，不需要在启动时手动读一次。
 * 重复的初始化只会带来「两处都在写同一份数据」的风险。
 */
onLaunch(() => {
  // 启动时校正一次锁标记：以本地是否真的存在密码凭据为准。
  // 处理的是「设置里说锁开着，但凭据已被清掉」这种不一致状态——
  // 若不放行，用户会面对一个永远验证不通过、也关不掉的锁
  lockStore.syncFromStorage()
})

onShow(() => {
  /**
   * 从后台切回前台（含冷启动的首次触发）。这里不区分「是不是刚启动」——
   * 冷启动时 unlocked 本来就是 false，统一走同一条判断路径更不容易漏。
   *
   * ── 冷启动为什么不靠这里来「第一时间」拦住 ──────────────────────────
   * pages.json 的第一项是锁页，冷启动的落地页就是它，首页根本不会被渲染。
   * 所以「打开应用先看到密码」这件事不依赖 onShow 的时机，
   * 这里主要负责**热启动**：用户在首页停留过、切后台超过 30 秒再回来。
   */
  if (lockStore.needsSetup() || lockStore.isLockedOut()) redirectToLock()
})

onHide(() => {
  // 进入后台：记下时刻，作为「离开多久算超时」的计时起点。
  // 具体的超时判断在下次 onShow 时做，而不是在这里起一个定时器——
  // 小程序切到后台后定时器随时可能被系统冻结，用它来做安全判定并不可靠
  lockStore.markHidden()
})

onError((err) => {
  // 全局错误兜底。小程序端未捕获的异常不会打印完整堆栈，
  // 这里统一转成可上报的结构，避免线上问题无从查起
  console.error('[App] error:', err)
})
</script>

<style lang="scss">
/**
 * 全局基础样式。
 *
 * 注意：这里只写「每个页面都需要」的重置，页面级样式一律写在各自 SFC 中。
 * 原因：App.vue 的样式在编译后会进入 app.wxss（小程序全局样式表），
 * 一旦臃肿，会影响所有页面的样式解析与注入耗时。
 */

/* 小程序没有 html/body，页面根节点是 page */
page {
  /* ────────────────────────────────────────────────────────────────
   * 设计令牌（浅色，默认）。
   *
   * 为什么默认浅色：这是一本记事本，绝大多数使用场景是
   * 「在自然光下读一段自己写的文字」，浅色底在那种环境下的
   * 可读性明显更好。暗色作为夜间可选项保留（.theme-dark）。
   *
   * 这些变量的值被 tailwind.config.js 里的 colors 引用，
   * 因此页面里 `bg-bg-card`、`text-content-secondary` 这类类名最终
   * 取到的就是下面这些色值。
   *
   * 换肤原理：变量定义在 page 上，会被所有后代继承；
   * 页面根节点挂上 .theme-dark 后，那一层的变量被覆盖，
   * 整棵子树内的所有类名随之取到暗色值——不需要改任何一处类名。
   *
   * 色板取「柔和中性」而非高饱和：记事的界面常年被阅读，
   * 高饱和的主色在长时间注视下会疲劳，也不该和用户写下的内容抢注意力。
   * ──────────────────────────────────────────────────────────────── */
  --color-brand: #4a7c6f; /* 柔和墨绿：主按钮、激活态 */
  --color-brand-light: #6a9c8f;
  --color-brand-dark: #38645a;

  /* 背景层级：base < card < elevated，浅色下越靠上层越白 */
  --color-bg-base: #f7f6f3; /* 暖白，比纯白柔和，久看不刺眼 */
  --color-bg-card: #ffffff;
  --color-bg-elevated: #edeae4;

  --color-content-primary: #26262a; /* 正文用近黑而非纯黑，降低对比疲劳 */
  --color-content-secondary: #6b6b72;
  --color-content-muted: #9c9ca3;

  background-color: var(--color-bg-base);
  color: var(--color-content-primary);
  /* 使用系统字体栈：小程序无法加载 web 字体，系统字体是唯一零成本选择 */
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica,
    'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 30rpx;
  line-height: 1.6; /* 记事以长文本为主，行高比常规界面略宽松 */
}

/**
 * 暗色主题。
 *
 * ⚠️ 层级关系与浅色**方向相反**：浅色下越靠上层越白（#F7F6F3 → #FFFFFF），
 * 暗色下则是越靠上层越亮（#17181A → #2C2D31）——
 * 两种主题里「卡片都比页面底色更突出」这条规则是一致的，
 * 只是实现它需要朝相反的方向调整明度。直接照搬同一组灰阶会让
 * 暗色主题下的卡片"陷"进背景里，看起来像没有边框。
 *
 * 品牌色在暗色下需要单独提亮：同一个墨绿在白底上清晰，
 * 到了深色底上会显得脏且对比不足。因此这里覆盖了 brand 三项，
 * 而浅色下的品牌色是默认值。
 */
.theme-dark {
  --color-brand: #7fb3a3;
  --color-brand-light: #9ccabc;
  --color-brand-dark: #5e9384;

  --color-bg-base: #17181a;
  --color-bg-card: #212225;
  --color-bg-elevated: #2c2d31;

  --color-content-primary: #ededf0;
  --color-content-secondary: #a3a3ab;
  --color-content-muted: #6e6e76;
}

/**
 * 全局盒模型统一。
 * Tailwind 的 preflight 已在 tailwind.config.js 中关闭（它会用通配选择器
 * 污染小程序内置组件），因此这里手工补上最关键的一条：
 * 小程序默认使用 content-box，不加这条会导致所有带 padding 的元素宽度溢出。
 */
view,
scroll-view,
swiper,
swiper-item,
text,
image,
button,
input,
textarea {
  box-sizing: border-box;
}

/**
 * 输入框占位文案的样式。
 *
 * ⚠️ 必须写在全局样式里，不能写进页面的 <style scoped>：
 * placeholder 元素由小程序的原生 input/textarea 组件在内部创建，
 * 不带 SFC 编译时加的 data-v 标记，而 scoped 会把选择器编译成
 * `.x-placeholder[data-v-xxx]`——于是这条规则永远匹配不上，
 * 且不会有任何报错，只表现为「占位文字颜色改不动」。
 *
 * 颜色取 content-muted 而不是浏览器默认的浅灰：
 * 默认灰在暗色主题下几乎看不见，而这里是用户输入前唯一的提示。
 */
.x-placeholder {
  color: var(--color-content-muted);
}

/* 去掉 button 在小程序端的默认边框与背景，交给 Tailwind 类控制 */
button {
  padding: 0;
  margin: 0;
  background-color: transparent;
  line-height: normal;

  &::after {
    border: none;
  }
}
</style>
