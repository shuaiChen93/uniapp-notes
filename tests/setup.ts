import { beforeEach, vi } from 'vitest'

/**
 * 测试环境准备
 * ══════════════════════════════════════════════════════════════════════
 * 被测代码里到处都在用 `uni.xxx`，而单测跑在 Node 里，没有这个全局对象。
 * 这里用内存实现把它补齐。
 *
 * 打桩的取舍原则：**只补被测代码真正会走到的分支**，
 * 没走到的 API 一律给空函数而不去精细模拟其行为——
 * 过度完善的假实现会让人误以为「这里已经测过了」。
 *
 * storage 是唯一需要真实模拟的：本项目「数据只存本地」是需求的核心，
 * 必须能验证「写进去的确实能读出来」。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 用 Map 模拟 uni 的本地存储。真机上它是同步 IO，这里同样是同步语义 */
const storage = new Map<string, string>()

const uniStub = {
  /* ── 存储 ──
     注意模拟「键不存在时返回空字符串」这个真实行为：
     若这里返回 undefined，就会掩盖掉调用方对空值的处理缺陷 */
  setStorageSync: (key: string, value: string): void => {
    storage.set(key, value)
  },
  getStorageSync: (key: string): string => storage.get(key) ?? '',
  removeStorageSync: (key: string): void => {
    storage.delete(key)
  },
  getStorageInfoSync: () => ({
    keys: Array.from(storage.keys()),
    currentSize: 0,
    limitSize: 10240,
  }),

  /* ── 交互反馈 ──
     若不屏蔽，测试输出会被大量 toast / loading 日志淹没 */
  showToast: (): void => void 0,
  hideToast: (): void => void 0,
  showModal: (): void => void 0,
  showLoading: (): void => void 0,
  hideLoading: (): void => void 0,

  /* ── 窗口信息 ──
     x-page-shell 会读 statusBarHeight 计算顶部安全区 */
  getWindowInfo: () => ({
    statusBarHeight: 0,
    windowWidth: 375,
    windowHeight: 667,
    screenWidth: 375,
    screenHeight: 667,
    pixelRatio: 2,
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
  }),

  /* ── 主题 ── */
  setBackgroundColor: (): void => void 0,
  onThemeChange: (): void => void 0,

  /* ── 路由 ──
     单测里只验证「跳转被调用」，不真的模拟页面栈。
     需要断言跳转目标的用例，自行用 vi.spyOn 覆盖对应方法 */
  navigateTo: (): void => void 0,
  redirectTo: (): void => void 0,
  reLaunch: (): void => void 0,
  switchTab: (): void => void 0,
  navigateBack: (): void => void 0,
}

vi.stubGlobal('uni', uniStub)

/**
 * 路由栈查询。默认返回空栈，表示「应用刚启动，还没有任何页面」。
 * x-page-shell 的返回逻辑依赖它来区分「能返回」与「只能重启到首页」。
 */
vi.stubGlobal('getCurrentPages', () => [])

/**
 * 每个用例前清空存储。
 *
 * 必须清：本项目全部数据都落在 storage 里，不清会让用例之间互相污染。
 * 这类污染的症状是「单跑通过、全量跑失败」，是最难排查的一类问题。
 */
beforeEach(() => {
  storage.clear()
})
