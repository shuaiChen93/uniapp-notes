import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authApi } from '@/api'
import { STORAGE_KEYS } from '@/constants/storage'
import type {
  LoginType,
  StoredToken,
  TokenResult,
  UpdateProfileParams,
  UserInfo,
} from '@/types'
import {
  clearStoredToken,
  getStoredToken,
  setLoggedOut,
  setStoredToken,
} from '@/utils/token'

/**
 * 用户 store
 * ══════════════════════════════════════════════════════════════════════
 * 职责边界（与 utils/token.ts 的分工，务必分清）：
 *
 *   token.ts   —— 凭证的唯一权威来源，负责落盘。request.ts 从这里读。
 *   user store —— 内存里的副本，只用来驱动界面响应式更新。
 *
 * 也就是说 storage 是「源」，store 是「视图」。二者不会双写打架，
 * 因为只有 token.ts 会真正写凭证，store 只是把结果同步到内存。
 *
 * 为什么 userInfo 又要走持久化插件？
 * 因为它不是凭证，没有时效性，且首屏渲染需要它（否则进「我的」页
 * 会先闪一下未登录态再跳成已登录）。直接用插件缓存最省事。
 * ══════════════════════════════════════════════════════════════════════
 */
export const useUserStore = defineStore(
  'user',
  () => {
    /* ── state ── */

    /** 凭证的内存副本（真身在 storage，见 utils/token.ts） */
    const token = ref<StoredToken | null>(getStoredToken())

    /** 当前用户信息 */
    const userInfo = ref<UserInfo | null>(null)

    /* ── getters ── */

    const isLoggedIn = computed(() => Boolean(token.value?.accessToken))

    /** 展示用昵称：未登录时给一个占位，避免界面出现空白 */
    const displayName = computed(() => userInfo.value?.nickname ?? '未登录')

    /** 文字头像用的首字（小程序不引入网络头像，用昵称首字 + 渐变底代替） */
    const avatarText = computed(() => {
      const name = userInfo.value?.nickname
      if (!name) return '?'
      // 取不到首字时的兜底：某些表情符号会被 slice 截断，用 Array.from 按码点取
      return Array.from(name)[0] ?? '?'
    })

    /* ── 内部工具 ── */

    /** 把接口返回的凭证同步到 storage 与内存两处 */
    function applyTokenResult(result: TokenResult): void {
      const stored: StoredToken = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
      }
      setStoredToken(stored)
      token.value = stored
      userInfo.value = result.user
    }

    /* ── actions ── */

    /**
     * 登录（首次登录由 mock 服务端自动注册）。
     *
     * @param code 登录凭证：小程序端为 wx.login 的 code，其他端为设备标识
     */
    async function login(code: string, loginType: LoginType = 'guest'): Promise<void> {
      const result = await authApi.login({ code, loginType })
      applyTokenResult(result)

      // 用户主动登录了，说明他不再处于「已登出」状态，
      // 静默登录从此恢复工作
      setLoggedOut(false)
    }

    /** 拉取用户信息。accessToken 过期时会自动走无感刷新，调用方无感知 */
    async function fetchProfile(): Promise<void> {
      userInfo.value = await authApi.getProfile()
    }

    /**
     * 更新昵称 / 头像。
     *
     * 直接用服务端返回的用户信息覆盖本地——而不是把参数 patch 进去。
     * 因为服务端可能对数据做规范化（裁剪空格、长度截断、头像换成永久 URL），
     * 本地自己拼的话就会和服务端产生偏差，且这种偏差只有下次拉取时才暴露。
     */
    async function updateProfile(params: UpdateProfileParams): Promise<void> {
      userInfo.value = await authApi.updateProfile(params)
    }

    /**
     * 恢复登录态。
     *
     * 应用启动时调用：本地有凭证就校验一次。
     * 校验会真实打到 /auth/profile —— 这同时是「无感刷新」链路的实际触发点：
     * accessToken 往往已过期，于是 401 → 刷新 → 重试 → 成功，用户全程无感。
     */
    async function restoreSession(): Promise<void> {
      if (!token.value?.accessToken) return
      try {
        await fetchProfile()
      } catch {
        // 失败时不再额外处理：request 层已经把凭证清掉并广播了 auth:expired，
        // 下面的监听器会同步清空内存状态
      }
    }

    /**
     * 退出登录：清空凭证与用户信息。
     *
     * 除了清凭证，还必须落下「主动登出」标记——
     * 否则下次静默登录会把用户自动登录回来，退出按钮形同虚设。
     * 详见 utils/token.ts 的 isLoggedOut。
     */
    function logout(): void {
      clearStoredToken()
      setLoggedOut(true)
      token.value = null
      userInfo.value = null
    }

    /* ── 与 request 层的事件对接 ──
     *
     * request.ts 不能 import store（会形成 store → api → request → store 的循环依赖，
     * 小程序端循环依赖会导致某个模块拿到 undefined）。
     * 因此由 request 层广播事件，store 在这里接收。
     *
     * 注册位置就在 store 的 setup 里：setup store 的函数体只在
     * store 首次被使用时执行一次，天然就是单例注册，不会重复监听。
     */

    /** 无感刷新成功：把新凭证同步进内存 */
    uni.$on('auth:token-refreshed', (result: TokenResult) => {
      token.value = {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
      }
      userInfo.value = result.user
    })

    /** 登录态彻底失效：清空内存状态，界面立刻回到未登录态 */
    uni.$on('auth:expired', () => {
      token.value = null
      userInfo.value = null
    })

    return {
      token,
      userInfo,
      isLoggedIn,
      displayName,
      avatarText,
      login,
      logout,
      fetchProfile,
      updateProfile,
      restoreSession,
    }
  },
  {
    /**
     * 只持久化 userInfo。
     *
     * token 不在这里持久化：它的真身在 utils/token.ts 管理的 storage 里，
     * 若此处再存一份，就会出现「两份凭证谁更新」的不一致问题。
     * 而 token 是随请求走的敏感数据，双份存储也会扩大泄露面。
     */
    persist: {
      key: STORAGE_KEYS.USER,
      paths: ['userInfo'],
    },
  },
)
