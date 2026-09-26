import { STORAGE_KEYS } from '@/constants/storage'
import { TOKEN_EXPIRY_SKEW } from '@/constants/config'
import type { StoredToken } from '@/types'
import { getStorage, removeStorage, setStorage } from './storage'

/**
 * 登录凭证的读写入口
 * ══════════════════════════════════════════════════════════════════════
 * 为什么凭证的「唯一权威来源」是 storage，而不是 Pinia store：
 *
 * request.ts 每次发请求都要读 accessToken。但 request.ts 不能 import store，
 * 否则会形成 store → api → request → store 的循环依赖。
 * 循环依赖在小程序端尤其危险：模块求值顺序被打乱，很容易出现
 * 「某个模块拿到的是 undefined」，且报错位置与真实原因相距甚远。
 *
 * 因此本项目的约定：
 *   storage  ← 凭证的唯一落盘处（本文件负责读写）
 *   store    ← 保留一份副本，仅用于驱动界面响应式更新
 *   request  ← 直接从 storage 读，与 store 完全解耦
 *
 * 三者之间是「storage 为源、store 为视图」的单向关系，不存在双写不一致。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 读取本地保存的凭证 */
export function getStoredToken(): StoredToken | null {
  return getStorage<StoredToken>(STORAGE_KEYS.TOKEN)
}

/** 保存凭证（登录成功、刷新成功时调用） */
export function setStoredToken(token: StoredToken): void {
  setStorage(STORAGE_KEYS.TOKEN, token)
}

/** 清除凭证（登出、刷新失败时调用） */
export function clearStoredToken(): void {
  removeStorage(STORAGE_KEYS.TOKEN)
}

/**
 * 判断 accessToken 是否仍然可用。
 *
 * 这里刻意**提前** TOKEN_EXPIRY_SKEW 判定为失效，而不是精确卡在过期时刻：
 * 请求在网络上还要飞一段，若卡着过期点放行，很容易出现
 * 「发出时有效、到达服务端时已过期」的 401，白多一次刷新往返。
 */
export function isAccessTokenValid(token: StoredToken | null = getStoredToken()): boolean {
  if (!token?.accessToken) return false
  return token.expiresAt - TOKEN_EXPIRY_SKEW > Date.now()
}

/** 是否存在可用的 refreshToken（决定 401 后是「静默续期」还是「跳登录页」） */
export function hasRefreshToken(token: StoredToken | null = getStoredToken()): boolean {
  return Boolean(token?.refreshToken)
}

/**
 * 用户是否主动登出过。
 * ══════════════════════════════════════════════════════════════════════
 * 这个标记解决的是「自动登录」与「退出登录」之间的一处直接冲突：
 *
 *   因为 wx.login 完全静默，应用一启动就会把用户自动登录回来。
 *   那么用户点「退出登录」之后会发生什么？
 *   凭证被清掉 → 下次进入应用 → 静默登录又把他登回去。
 *   用户看到的现象是「退出按钮根本没反应」。
 *
 * 所以退出时记一笔，静默登录看到它就跳过；直到用户主动登录一次才清除。
 * 这样「退出」才是一个真正有意义的动作，而不是一个骗人的按钮。
 *
 * 注意它是**独立于凭证**的一份状态：登出时凭证被删了，
 * 但「曾经主动登出过」这件事必须留下来，否则就失去了意义。
 * ══════════════════════════════════════════════════════════════════════
 */
export function isLoggedOut(): boolean {
  return getStorage<boolean>(STORAGE_KEYS.LOGGED_OUT) === true
}

/** 设置/清除「主动登出」标记 */
export function setLoggedOut(loggedOut: boolean): void {
  if (loggedOut) setStorage(STORAGE_KEYS.LOGGED_OUT, true)
  else removeStorage(STORAGE_KEYS.LOGGED_OUT)
}
