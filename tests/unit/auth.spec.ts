import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { authApi } from '@/api'
import { STORAGE_KEYS } from '@/constants/storage'
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL } from '@/mock/utils'
import { createPersistPlugin, useUserStore } from '@/store'
import type { StoredToken } from '@/types'
import { getDeviceId } from '@/utils/id'
import { silentLogin } from '@/utils/request'
import { getStorage } from '@/utils/storage'
import { clearStoredToken } from '@/utils/token'

/**
 * 登录 / 无感刷新 / 静默登录链路的端到端验证
 * ══════════════════════════════════════════════════════════════════════
 * 这一组用例覆盖的是本项目**最容易写错、且错了最难发现**的部分：
 *
 *   「凭证过期 → 401 → 静默刷新 → 自动重试 → 调用方拿到数据」
 *   「刷新也失效 → 静默重登 → 自动重试 → 用户全程无感」
 *
 * 之所以能用单测覆盖，是因为 mock 层扮演的是真实服务端：
 * token 会真的过期，过期后接口真的返回 401。因此这里跑的不是「假设的流程」，
 * 而是与真机完全一致的代码路径。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 模拟一台固定设备。
 *
 * 用 getDeviceId() 而不是写死一个字符串：静默登录走的也是这个函数，
 * 两边必须是同一个值，才能验证「凭证失效后静默重登，仍是同一个账号」。
 * 它在 beforeEach 里生成（此时 storage 已被 setup.ts 清空），
 * 之后所有取用都会读到同一个值。
 */
let deviceCode = ''

/** 读取落盘的凭证 */
function readToken(): StoredToken | null {
  return getStorage<StoredToken>(STORAGE_KEYS.TOKEN)
}

/**
 * 快进系统时间，用来伪造 token 过期。
 *
 * 只伪造 Date，不伪造 setTimeout：
 * mock 服务端的网络延迟是靠真实 setTimeout 实现的，
 * 若一并接管，请求就永远等不到 resolve，测试会卡死。
 */
function advance(ms: number): void {
  vi.setSystemTime(Date.now() + ms)
}

describe('登录与无感刷新', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })

    // 每个用例一个全新的 pinia：避免状态跨用例泄漏
    const pinia = createPinia()
    pinia.use(createPersistPlugin())
    setActivePinia(pinia)

    deviceCode = getDeviceId()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('登录：签发凭证、写入本地、更新登录态', async () => {
    const store = useUserStore()
    expect(store.isLoggedIn).toBe(false)

    await store.login(deviceCode, 'guest')

    // 内存状态
    expect(store.isLoggedIn).toBe(true)
    expect(store.userInfo?.nickname).toBeTruthy()

    // 落盘状态：凭证必须真的写进 storage，否则冷启动后无法恢复登录态
    const stored = readToken()
    expect(stored).not.toBeNull()
    expect(stored?.accessToken).toBe(store.token?.accessToken)
    expect(stored?.refreshToken).toBeTruthy()
    expect(stored?.expiresAt).toBeGreaterThan(Date.now())
  })

  it('同一设备重复登录：仍是同一个账号，不会被重复注册', async () => {
    const store = useUserStore()

    await store.login(deviceCode, 'guest')
    const firstUserId = store.userInfo?.id

    await store.login(deviceCode, 'guest')

    expect(store.userInfo?.id).toBe(firstUserId)
  })

  it('accessToken 过期：自动刷新并重试，调用方无感知', async () => {
    const store = useUserStore()
    await store.login(deviceCode, 'guest')

    const expiredToken = readToken()
    expect(expiredToken).not.toBeNull()

    // 快进到 accessToken 已过期、但 refreshToken 仍在有效期内的时间点
    advance(ACCESS_TOKEN_TTL + 1000)

    // 这一次请求会真实地拿到 401，内部走完「刷新 → 重试」后正常返回。
    // 对调用方而言，这只是一次普通成功的请求，没有任何异常需要处理
    await expect(store.fetchProfile()).resolves.toBeUndefined()

    const refreshed = readToken()
    expect(refreshed?.accessToken).not.toBe(expiredToken?.accessToken)
    expect(refreshed?.expiresAt).toBeGreaterThan(expiredToken?.expiresAt ?? 0)

    // 关键断言：用户信息确实被填上了。
    // 如果刷新后忘了重试、或重试时拿不到数据，这里会是空值
    expect(store.userInfo?.id).toBeTruthy()
  })

  it('并发请求同时遇到过期的凭证：都能成功，不会互相干扰', async () => {
    const store = useUserStore()
    await store.login(deviceCode, 'guest')

    advance(ACCESS_TOKEN_TTL + 1000)

    // 两个请求几乎同时发出，且都携带同一个已过期的 accessToken。
    // 共享 Promise 机制保证它们不会各自发起一次刷新，
    // 且第二个请求能靠「凭证已变」的判断直接重试
    const [profileA, profileB] = await Promise.all([
      authApi.getProfile(),
      authApi.getProfile(),
    ])

    expect(profileA.id).toBe(profileB.id)
    expect(profileA.id).toBe(store.userInfo?.id)
  })

  it('refreshToken 也失效：静默重登后原请求自动重试，用户无感', async () => {
    const store = useUserStore()
    await store.login(deviceCode, 'guest')
    const userId = store.userInfo?.id

    // 快进到两个 token 都已过期（相当于 30 天没打开过小程序）
    advance(REFRESH_TOKEN_TTL + ACCESS_TOKEN_TTL + 1000)

    // 这一次请求会经历完整链路：
    //   401 → 刷新失败 → 静默重登 → 用新凭证重试 → 成功
    // 用户全程不会看到登录页，甚至不知道刚才发生过一次登录态重建
    await expect(store.fetchProfile()).resolves.toBeUndefined()

    expect(store.isLoggedIn).toBe(true)
    expect(store.userInfo?.id).toBe(userId)
    expect(readToken()).not.toBeNull()
  })

  it('静默登录：本地没有凭证时自动完成登录，不需要用户操作', async () => {
    const store = useUserStore()
    expect(store.isLoggedIn).toBe(false)

    const success = await silentLogin()

    expect(success).toBe(true)
    expect(store.isLoggedIn).toBe(true)
    expect(store.userInfo?.nickname).toBeTruthy()
    expect(readToken()).not.toBeNull()
  })

  it('用户主动退出后：静默登录不会把他自动登回来', async () => {
    const store = useUserStore()
    await store.login(deviceCode, 'guest')
    store.logout()

    expect(store.isLoggedIn).toBe(false)

    // 「退出登录」必须是真按钮。
    // 若少了 LOGGED_OUT 标记，这里会返回 true，用户点完退出又被自动登回去
    const success = await silentLogin()

    expect(success).toBe(false)
    expect(store.isLoggedIn).toBe(false)
    expect(readToken()).toBeNull()
  })

  it('用户重新主动登录后：登出标记被清除，静默登录恢复工作', async () => {
    const store = useUserStore()
    await store.login(deviceCode, 'guest')
    store.logout()

    // 登出状态下，静默登录被挡住
    expect(await silentLogin()).toBe(false)

    // 用户自己点了一次登录，说明他不再处于「已登出」状态
    await store.login(deviceCode, 'guest')

    // 把凭证清掉，模拟「凭证自然失效、需要重新登录」的场景。
    // 注意这里只清凭证、不动登出标记——正是现实中会发生的形态
    clearStoredToken()
    expect(readToken()).toBeNull()

    // 标记已被 login 清除，静默登录应当恢复正常
    expect(await silentLogin()).toBe(true)
    expect(store.isLoggedIn).toBe(true)
    expect(readToken()).not.toBeNull()
  })

  it('更新资料：昵称与头像落库，并同步到本地状态', async () => {
    const store = useUserStore()
    await store.login(deviceCode, 'guest')

    await store.updateProfile({ nickname: '  新昵称  ', avatar: 'wxfile://tmp_avatar' })

    // 服务端会裁剪首尾空格，本地直接采信服务端返回的结果
    expect(store.userInfo?.nickname).toBe('新昵称')
    expect(store.userInfo?.avatar).toBe('wxfile://tmp_avatar')

    // 重新拉一次，确认改动确实落库了，而不只是内存里改了改
    await store.fetchProfile()
    expect(store.userInfo?.nickname).toBe('新昵称')
    expect(store.userInfo?.avatar).toBe('wxfile://tmp_avatar')
  })

  it('更新资料：空昵称会被服务端拒绝', async () => {
    const store = useUserStore()
    await store.login(deviceCode, 'guest')
    const before = store.userInfo?.nickname

    await expect(store.updateProfile({ nickname: '   ' })).rejects.toThrow()

    expect(store.userInfo?.nickname).toBe(before)
  })

  it('退出登录：清空凭证与用户信息', async () => {
    const store = useUserStore()
    await store.login(deviceCode, 'guest')

    store.logout()

    expect(readToken()).toBeNull()
    expect(store.isLoggedIn).toBe(false)
    expect(store.userInfo).toBeNull()
  })
})
