import type { StorageKey } from '@/constants/storage'

/**
 * 本地存储封装
 * ══════════════════════════════════════════════════════════════════════
 * 为什么要在 uni.setStorageSync 之上再包一层：
 *
 * ① 统一序列化。uni 各端对「直接存对象」的行为并不一致：小程序端由
 *    wx.setStorageSync 内部序列化，H5 端走 localStorage 时对象会被
 *    转成 "[object Object]" 字符串。两端行为不一致的坑，
 *    在真机上才发现就太晚了。这里统一 JSON.stringify 后再存。
 *
 * ② 兜底异常。storage 可能因配额满、用户清理数据、隐私模式等原因
 *    读写失败。原生 API 会直接抛错，若在 store 的响应式流程里抛出，
 *    会导致整个组件更新中断。这里统一 try/catch 并降级。
 *
 * ③ 类型约束。键名收敛到 StorageKey 联合类型，写错键名在编译期就报错，
 *    而不是等到运行时发现「存进去的东西读不出来」。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 写入。失败时返回 false 而不是抛错——调用方（如持久化插件）需要知道
 * 是否成功，但绝大多数场景不希望因为一次写盘失败就打断页面流程。
 */
export function setStorage<T>(key: StorageKey, value: T): boolean {
  try {
    uni.setStorageSync(key, JSON.stringify(value))
    return true
  } catch (err) {
    console.error(`[storage] 写入失败 key=${key}`, err)
    return false
  }
}

/**
 * 读取。
 *
 * 反序列化失败时一并清除该键：能读出来但解析不了，说明存的是脏数据
 * （比如旧版本遗留的格式），留着它只会让每次读取都失败一次。
 */
export function getStorage<T>(key: StorageKey): T | null {
  try {
    const raw = uni.getStorageSync(key) as string
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch (err) {
    console.error(`[storage] 读取失败，已清除脏数据 key=${key}`, err)
    removeStorage(key)
    return null
  }
}

/** 读取，带默认值。省去调用方到处写 `?? defaultValue` */
export function getStorageWithDefault<T>(key: StorageKey, defaultValue: T): T {
  const value = getStorage<T>(key)
  return value === null ? defaultValue : value
}

/** 删除单个键 */
export function removeStorage(key: StorageKey): void {
  try {
    uni.removeStorageSync(key)
  } catch (err) {
    console.error(`[storage] 删除失败 key=${key}`, err)
  }
}

/**
 * 清空本项目写入的所有存储。
 *
 * 用 uni.getStorageInfoSync 列出全部键后按前缀过滤，
 * 而不是直接调 uni.clearStorageSync()——后者会连第三方 SDK、
 * 其他业务模块的数据一起清掉，属于「看着省事、后患无穷」的写法。
 */
export function clearAppStorage(prefix = 'rt_'): void {
  try {
    const { keys } = uni.getStorageInfoSync()
    keys.filter((key) => key.startsWith(prefix)).forEach((key) => uni.removeStorageSync(key))
  } catch (err) {
    console.error('[storage] 清空失败', err)
  }
}
