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
 * storage 是唯一需要真实模拟的：本项目「本地持久化」是需求的一部分，
 * 必须能验证「写进去的确实能读出来」。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 用 Map 模拟 uni 的本地存储。真机上它是同步 IO，这里同样是同步语义 */
const storage = new Map<string, string>()

/** 事件总线的订阅表 */
const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

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

  /* ── 事件总线 ──
     request 层用它广播「凭证已刷新 / 登录态失效」，store 层监听。
     这里必须实现**真实的投递**而不是空函数：
     「登录态失效后 store 同步清空」这条逻辑完全依赖事件送达，
     空函数会让它永远测不到——用例会「通过」，但通过的是假象。 */
  $emit: (event: string, ...args: unknown[]): void => {
    listeners.get(event)?.forEach((handler) => handler(...args))
  },
  $on: (event: string, handler: (...args: never[]) => void): void => {
    const set = listeners.get(event) ?? new Set()
    set.add(handler as (...args: unknown[]) => void)
    listeners.set(event, set)
  },
  $off: (event: string, handler?: (...args: never[]) => void): void => {
    if (handler) listeners.get(event)?.delete(handler as (...args: unknown[]) => void)
    else listeners.delete(event)
  },

  /* ── 交互反馈 ──
     若不屏蔽，测试输出会被大量 toast / loading 日志淹没 */
  showToast: (): void => void 0,
  showLoading: (): void => void 0,
  hideLoading: (): void => void 0,
  showModal: (): void => void 0,

  /* ── 窗口信息 ── */
  getWindowInfo: () => ({
    statusBarHeight: 0,
    windowWidth: 375,
    windowHeight: 667,
    screenWidth: 375,
    screenHeight: 667,
    pixelRatio: 2,
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
  }),

  /* ── 路由 ──
     登录态失效时 request 层会跳登录页。单测里只验证「跳转被调用」，
     不真的模拟页面栈 */
  navigateTo: (): void => void 0,
  redirectTo: (): void => void 0,
  switchTab: (): void => void 0,
  navigateBack: (): void => void 0,

  /* ── 网络 ──
     本项目的 USE_MOCK 分支不会走到这里，保留是为了让「万一走到」时
     报错信息更明确，而不是一个难以理解的 undefined is not a function */
  request: (): void => {
    throw new Error('[tests] 单测中不应发起真实网络请求，请检查 USE_MOCK 是否被改成了 false')
  },
}

vi.stubGlobal('uni', uniStub)

/** 路由栈查询。默认返回空栈，表示「应用刚启动，还没有任何页面」 */
vi.stubGlobal('getCurrentPages', () => [])

/**
 * 每个用例前清空存储与订阅表。
 *
 * 二者都必须清：
 *   storage  —— 本项目大量使用本地持久化，不清会让用例之间互相污染；
 *   订阅表   —— 每个用例都会新建 pinia 与 store 实例，而 store 在 setup 里
 *               注册事件监听。不清的话旧实例的监听器会持续累积，
 *               一次 $emit 会更新到多个已经废弃的 store 上。
 * 这两种污染的共同症状都是「单跑通过、全量跑失败」，是最难排查的一类问题。
 */
beforeEach(() => {
  storage.clear()
  listeners.clear()
})
