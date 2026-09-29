import type { PiniaPluginContext } from 'pinia'
import type { StorageKey } from '@/constants/storage'
import { getStorage, setStorage } from '@/utils/storage'

/**
 * Pinia 持久化插件
 * ══════════════════════════════════════════════════════════════════════
 * 基于 uni.setStorageSync，**不依赖浏览器 localStorage**——
 * 小程序端根本没有 localStorage，用它会直接报错。
 *
 * ── 用法 ──────────────────────────────────────────────────────────────
 * 在 defineStore 的第三个参数里声明：
 *
 *   defineStore('notes', { ... }, {
 *     persist: {
 *       key: STORAGE_KEYS.NOTES,
 *       paths: ['notes'],   // 只持久化需要的字段
 *     },
 *   })
 *
 * 不声明 persist 的 store 完全不受影响，不会被写入任何存储。
 * ══════════════════════════════════════════════════════════════════════
 */

export interface PersistOptions {
  /** 存储键名。用 StorageKey 约束，避免写错键名导致「存了读不出来」 */
  key: StorageKey
  /**
   * 需要持久化的字段路径。
   * 不传则持久化整个 state。
   *
   * ⚠️ 强烈建议显式声明：state 里往往混着 loading、error、临时选中项
   * 这类「只属于当前会话」的字段。全量持久化会让用户下次打开应用时
   * 看到一个永远转不完的 loading —— 因为上次退出时它恰好是 true。
   *
   * 支持点号路径，如 'user.profile.name'。
   */
  paths?: string[]
  /**
   * 写盘节流间隔（毫秒），默认 300。
   *
   * storage 是同步 IO，高频变更的 state 直接写盘会阻塞渲染，
   * 表现为「滑动列表时卡顿」这类与业务逻辑毫无关系的性能问题。
   *
   * ⚠️ 传 0 表示**同步写盘**：数据会在 state 变更的当次调用里就落盘。
   * 这是刻意区分的——记事数据用 0，因为它的写入时机是「用户点保存后
   * 立刻退出」，哪怕只延后一个事件循环也存在丢数据的窗口。
   */
  throttle?: number
}

/**
 * 扩展 Pinia 的类型：让 defineStore 的第三个参数认识 persist 字段。
 * 没有这段 declare module，TS 会把多余的 persist 字段判为类型错误。
 */
declare module 'pinia' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export interface DefineStoreOptionsBase<S, Store> {
    persist?: PersistOptions
  }
}

/** 按点号路径取值，如 getByPath(state, 'user.name') */
function getByPath(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined
    return (acc as Record<string, unknown>)[key]
  }, source)
}

/** 按点号路径写值，用于把扁平路径还原成嵌套结构 */
function setByPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cursor = target

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value
      return
    }
    // 中间层不存在就补一个空对象，保证 'a.b.c' 这种路径能完整还原
    if (typeof cursor[key] !== 'object' || cursor[key] === null) {
      cursor[key] = {}
    }
    cursor = cursor[key] as Record<string, unknown>
  })
}

/** 从 state 里按 paths 抽取需要持久化的部分 */
function pickPaths(state: Record<string, unknown>, paths?: string[]): Record<string, unknown> {
  if (!paths?.length) return state

  const result: Record<string, unknown> = {}
  for (const path of paths) {
    const value = getByPath(state, path)
    // undefined 不写入：否则恢复时会把一个不存在的字段覆盖成 undefined，
    // 反而破坏了 state 的初始值
    if (value !== undefined) {
      setByPath(result, path, value)
    }
  }
  return result
}

/**
 * 创建持久化插件。
 * 在 main.ts 里通过 pinia.use(createPersistPlugin()) 安装。
 */
export function createPersistPlugin() {
  return ({ store, options }: PiniaPluginContext): void => {
    const persist = (options as { persist?: PersistOptions }).persist
    if (!persist) return

    /* ── 1. 启动时恢复 ── */
    const saved = getStorage<Record<string, unknown>>(persist.key)
    if (saved) {
      // 用 $patch 而不是直接赋值：$patch 会走 store 的响应式更新流程，
      // 直接改 store.$state 在 setup store 里可能绕过部分响应式依赖
      store.$patch(pickPaths(saved, persist.paths) as never)
    }

    /* ── 2. 变化时写盘（节流） ── */
    const throttle = persist.throttle ?? 300
    let timer: ReturnType<typeof setTimeout> | null = null

    store.$subscribe(
      (_mutation, state) => {
        const write = (): void => {
          setStorage(persist.key, pickPaths(state as Record<string, unknown>, persist.paths))
        }

        // throttle 为 0 时直接同步写。
        // 看似只省了一个 setTimeout(…, 0)，实则不然：setTimeout 的最小延迟
        // 在部分运行环境下会被拉长到 4ms 以上，而更关键的是它把写盘推迟到了
        // 下一个事件循环——用户点完「保存」立刻划掉小程序时，
        // 那次写盘可能永远没有机会执行。
        if (throttle <= 0) {
          write()
          return
        }

        if (timer) return

        timer = setTimeout(() => {
          timer = null
          write()
        }, throttle)
      },
      {
        // detached: true 是必须的。
        // 默认情况下 $subscribe 会绑定到「当前组件实例」，组件卸载后订阅即失效——
        // 而 store 是全局的，必须在整个应用生命周期内持续生效。
        // 漏掉这个参数的症状是「页面 A 改的数据没存上，页面 B 改的存上了」，极难排查。
        detached: true,

        /**
         * flush: 'sync' —— 让回调在 state 变更的**当次调用栈内**立即执行。
         *
         * 这个参数是在修一个很隐蔽的时序问题：$subscribe 默认用 'pre' 刷新，
         * 回调会被排进 Vue 的调度队列、等下一个微任务才跑。也就是说
         * 「保存 → 写盘」之间始终隔着一个事件循环，throttle 设成 0 也无法避免。
         *
         * 对普通数据这毫无影响，但对记事是致命的：用户点完「保存」
         * 立刻切后台或划掉小程序时，那次排队的写盘可能永远没有机会执行，
         * 而他刚写完的那段字就没了。改成同步后，save() 返回时数据已经在磁盘上。
         */
        flush: 'sync',
      },
    )
  }
}
