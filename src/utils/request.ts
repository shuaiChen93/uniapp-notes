import { API_BASE_URL, REQUEST_TIMEOUT, USE_MOCK } from '@/constants/config'
import { BIZ_CODE, BIZ_MESSAGE, HTTP_STATUS } from '@/constants/http'
import { mockRequest } from '@/mock'
import type { ApiResponse, RequestOptions, TokenResult } from '@/types'
import { getPreferredLoginType, resolveLoginCode } from './login-code'
import {
  clearStoredToken,
  getStoredToken,
  hasRefreshToken,
  isAccessTokenValid,
  isLoggedOut,
  setStoredToken,
} from './token'

/**
 * 企业级请求库
 * ══════════════════════════════════════════════════════════════════════
 * 基于 uni.request（不用 axios：小程序端没有 XMLHttpRequest，axios 无法工作）。
 *
 * 分层：
 *   传输层 transport() —— 唯一与「网络」相关的部分。USE_MOCK 开关只影响这里，
 *                        接真实后端时上层代码零改动。
 *   鉴权层 ensureFreshToken() —— 401 无感刷新，并发请求只刷新一次。
 *   业务层 request() —— token 注入、loading、错误提示、泛型解包。
 *
 * 一个刻意的设计取舍：**不做「提前预判过期」的主动刷新**。
 * 主动刷新需要在「token 已过期但刷新失败」时额外分叉出「照常发送」的分支，
 * 逻辑分叉多且容易漏。本项目采用被动刷新——先发请求，收到 401 再刷新并重试。
 * 代价是过期后第一个请求多一次往返，换来的是控制流只有一条直线。
 * ══════════════════════════════════════════════════════════════════════
 */

/* ──────────────────────────────────────────────────────────────────────
 * 一、传输层
 * ────────────────────────────────────────────────────────────────────── */

interface RawResponse {
  statusCode: number
  data: ApiResponse
}

/** 在途请求句柄，用于取消 */
interface PendingRequest {
  abort: () => void
}

/** 按 key 记录在途请求，支持取消 */
const pendingRequests = new Map<string, PendingRequest>()

/**
 * 取消指定 key 的在途请求。
 *
 * 典型场景：搜索框输入联想——用户连续输入时会发出多个请求，
 * 后到的响应可能先返回，导致「显示的是旧关键词的结果」。
 * 发新请求前先取消同 key 的旧请求可根治该问题。
 */
export function cancelRequest(key: string): void {
  const pending = pendingRequests.get(key)
  if (pending) {
    pending.abort()
    pendingRequests.delete(key)
  }
}

/** 发起一次原始请求（不含任何鉴权与业务处理） */
function transport(options: RequestOptions): Promise<RawResponse> {
  const url = options.url.startsWith('http') ? options.url : `${API_BASE_URL}${options.url}`
  const method = options.method ?? 'GET'
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.header,
  }

  if (USE_MOCK) {
    // mock 分支：形状与 uni.request 的 success 回调保持一致，
    // 上层无需知道自己连的是 mock 还是真服务
    const promise = mockRequest({ url, method, data: options.data, header })

    if (options.cancelKey) {
      // mock 请求是纯 Promise，无法真正中断，但接口保持与真实分支一致，
      // 避免「开发时能取消、上线后取消失效」这类只在真机上暴露的差异
      pendingRequests.set(options.cancelKey, { abort: () => void 0 })
    }

    return promise.finally(() => {
      if (options.cancelKey) pendingRequests.delete(options.cancelKey)
    })
  }

  return new Promise<RawResponse>((resolve, reject) => {
    const task = uni.request({
      url,
      method: method as UniApp.RequestOptions['method'],
      data: options.data,
      header,
      timeout: options.timeout ?? REQUEST_TIMEOUT,
      success: (res) => {
        resolve({
          statusCode: res.statusCode,
          data: res.data as ApiResponse,
        })
      },
      fail: (err) => {
        // 网络层失败（断网、超时、DNS 失败）与业务失败是两回事，
        // 用带标记的 Error 区分，便于上层给出不同的提示文案
        const error = new Error(err.errMsg || '网络异常') as Error & { isNetworkError?: boolean }
        error.isNetworkError = true
        reject(error)
      },
    })

    if (options.cancelKey) {
      pendingRequests.set(options.cancelKey, { abort: () => task.abort() })
    }
  }).finally(() => {
    if (options.cancelKey) pendingRequests.delete(options.cancelKey)
  })
}

/* ──────────────────────────────────────────────────────────────────────
 * 二、鉴权层：401 无感刷新
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 正在进行的刷新任务。
 *
 * 这是「防重复刷新」的关键：所有并发请求共享同一个 Promise，
 * 而不是各自发一次刷新请求。
 *
 * 相比传统的「数组队列 + 逐个重放」写法，共享 Promise 的优势是
 * 不存在「忘记出队」「刷新失败后队列没清空」这类状态泄漏问题——
 * 状态只有一个变量，且用 finally 保证一定会复位。
 */
let refreshingPromise: Promise<string> | null = null

/**
 * 确保拿到一个可用的 accessToken。
 * 并发调用时只会真正发起一次刷新请求。
 */
function ensureFreshToken(): Promise<string> {
  if (refreshingPromise) return refreshingPromise

  refreshingPromise = doRefreshToken().finally(() => {
    // 无论成功失败都要复位，否则一次刷新失败会让后续所有请求都拿到旧的失败结果
    refreshingPromise = null
  })

  return refreshingPromise
}

/** 真正执行刷新 */
async function doRefreshToken(): Promise<string> {
  const token = getStoredToken()
  if (!token?.refreshToken) {
    throw new Error('无可用的 refreshToken')
  }

  // ⚠️ 两个开关都是必须的：
  // allowRefresh: false —— 否则刷新失败又触发刷新，形成无限递归，
  //                        且表现为「请求风暴」而非报错，极难排查；
  // silent: true        —— 刷新本身就是鉴权链路的一环，它的失败要留给
  //                        调用方去决定「重登」还是「跳登录页」，
  //                        不能在这里就抢先触发全局兜底
  const result = await request<TokenResult>({
    url: '/auth/refresh',
    method: 'POST',
    data: { refreshToken: token.refreshToken },
    auth: false,
    allowRefresh: false,
    showError: false,
    silent: true,
  })

  setStoredToken({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
  })

  // 广播给 store：request 层不能 import store（store → api → request 会形成
  // 循环依赖，小程序端循环依赖会让某个模块拿到 undefined），
  // 因此用事件把「凭证变了」这件事通知出去，由 store 自己更新内存里的副本
  uni.$emit('auth:token-refreshed', result)

  return result.accessToken
}

/* ──────────────────────────────────────────────────────────────────────
 * 二·补充：静默登录
 *
 * 这是「用户永远看不到登录页」的关键。
 *
 * 微信的 wx.login 是**完全静默**的：不弹授权框、不需要用户点击、
 * 不消耗任何用户操作。因此小程序完全可以在启动时就把登录做完，
 * 用户从打开到进入首页，全程不知道背后发生过一次登录。
 *
 * 从前那种「先弹登录页、等用户点一下按钮」的流程，
 * 是照搬了「需要用户授权」时代的习惯。如今 wx.login 无授权成本，
 * 把登录页当作必经之路，等于凭空给用户加了一道没有任何作用的门槛。
 *
 * 登录页仍然保留，但退居为兜底：仅在静默登录也失败、
 * 或用户主动退出后需要重新登录时才会出现。
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 正在进行的静默登录任务。
 * 与刷新同理，并发触发时共享同一个 Promise。
 *
 * 这个场景很常见：应用刚启动时凭证已失效，首页同时发出好几个请求，
 * 它们会一起走进来，但只需要真正登录一次。
 */
let silentLoginPromise: Promise<boolean> | null = null

function ensureSilentLogin(): Promise<boolean> {
  // 用户主动登出过：绝不能自作主张把他登录回来，
  // 否则「退出登录」就变成了一个点了没反应的假按钮
  if (isLoggedOut()) return Promise.resolve(false)

  if (silentLoginPromise) return silentLoginPromise

  silentLoginPromise = doSilentLogin().finally(() => {
    silentLoginPromise = null
  })

  return silentLoginPromise
}

/**
 * 真正执行静默登录。
 *
 * 整个函数不弹任何界面、不抛任何错——静默登录失败不是异常，
 * 只是一种状态，调用方据此决定下一步即可。
 */
async function doSilentLogin(): Promise<boolean> {
  try {
    const loginType = getPreferredLoginType()
    const code = await resolveLoginCode(loginType)

    // silent: true 见 RequestOptions 的注释：
    // 登录接口的失败必须就地消化，不能外溢成「登录态失效 → 跳登录页」
    const result = await request<TokenResult>({
      url: '/auth/login',
      method: 'POST',
      data: { code, loginType },
      auth: false,
      allowRefresh: false,
      silent: true,
    })

    setStoredToken({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
    })

    // 广播给 store，让界面上的登录态同步更新
    uni.$emit('auth:token-refreshed', result)
    return true
  } catch (err) {
    console.warn('[request] 静默登录未成功：', err)
    return false
  }
}

/**
 * 静默登录（对外）。
 *
 * 应用启动时调用即可完成「打开即登录」，用户无感。
 * 返回 false 只表示这次没拿到凭证，不是错误——
 * 调用方通常什么都不用做，等真正需要登录态时再处理。
 */
export function silentLogin(): Promise<boolean> {
  // 凭证仍然可用：什么都不用做
  if (isAccessTokenValid()) return Promise.resolve(true)

  // 还有 refreshToken：交给 401 刷新链路处理即可，
  // 主动重新登录反而会白白多一张新凭证
  if (hasRefreshToken()) return Promise.resolve(true)

  return ensureSilentLogin()
}

/** 登录态彻底失效：清凭证 + 回登录页 */
function handleAuthExpired(): void {
  clearStoredToken()
  uni.$emit('auth:expired')

  // 避免重复跳转：如果当前已经在登录页（或正在跳转），就不再叠加一次
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  if (current?.route === 'pages/login/index') return

  uni.navigateTo({
    url: '/pages/login/index',
    fail: () => {
      // navigateTo 在页面栈超过 10 层时会失败，此时退化为 redirectTo
      uni.redirectTo({ url: '/pages/login/index' })
    },
  })
}

/* ──────────────────────────────────────────────────────────────────────
 * 三、提示层
 * ────────────────────────────────────────────────────────────────────── */

/**
 * loading 引用计数。
 *
 * uni.showLoading / hideLoading 是全局单例：并发 3 个请求时，
 * 第一个请求结束就调 hideLoading 会把还在飞的请求的 loading 一起关掉。
 * 用计数保证「第一个请求开、最后一个请求关」。
 */
let loadingCount = 0

function showLoading(title: string): void {
  if (loadingCount === 0) {
    uni.showLoading({ title, mask: true })
  }
  loadingCount += 1
}

function hideLoading(): void {
  loadingCount = Math.max(0, loadingCount - 1)
  if (loadingCount === 0) {
    uni.hideLoading()
  }
}

/**
 * 错误提示节流。
 *
 * 并发请求同时失败时（比如断网），逐个弹 toast 会连弹好几个，
 * 用户看到的是反复闪烁的提示。同一文案在此时间窗内只弹一次。
 */
const TOAST_THROTTLE = 800
let lastToast = { message: '', time: 0 }

function toastError(message: string): void {
  const now = Date.now()
  if (lastToast.message === message && now - lastToast.time < TOAST_THROTTLE) return

  lastToast = { message, time: now }
  uni.showToast({ title: message, icon: 'none', duration: 2000 })
}

/* ──────────────────────────────────────────────────────────────────────
 * 四、业务层
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 发起请求。
 *
 * @returns 直接返回业务数据（已剥掉 code/message 信封），失败时 reject
 */
export async function request<T>(options: RequestOptions): Promise<T> {
  // silent 请求连 loading 都不显示：它总是在用户没发起操作时悄悄跑，
  // 弹一个遮罩出来反而会打断用户正在做的事
  const needLoading = options.showLoading === true && options.silent !== true
  if (needLoading) showLoading(options.loadingText ?? '加载中')

  try {
    return await doRequest<T>(options)
  } catch (err) {
    if (options.showError !== false && options.silent !== true) {
      toastError(resolveErrorMessage(err))
    }
    throw err
  } finally {
    if (needLoading) hideLoading()
  }
}

/** 实际的请求流程（含一次 401 重试） */
async function doRequest<T>(options: RequestOptions, isRetry = false): Promise<T> {
  const header: Record<string, string> = { ...options.header }

  // 注入 token。默认携带，登录/刷新这类接口显式传 auth: false
  let usedAccessToken: string | undefined
  if (options.auth !== false) {
    const token = getStoredToken()
    if (token?.accessToken) {
      usedAccessToken = token.accessToken
      header.Authorization = `Bearer ${token.accessToken}`
    }
  }

  const { statusCode, data } = await transport({ ...options, header })

  /* ── HTTP 层判定 ── */
  if (statusCode === HTTP_STATUS.UNAUTHORIZED) {
    const retried = await tryRefreshAndRetry<T>(options, isRetry, usedAccessToken)
    if (retried !== undefined) return retried
    // 刷新失败或已达重试上限：抛出供上层处理
    throw createAuthError()
  }

  // 403：已登录但无权访问。这类错误刷新 token 没有意义，直接提示
  if (statusCode === HTTP_STATUS.FORBIDDEN) {
    throw createBizError(BIZ_CODE.FORBIDDEN, BIZ_MESSAGE[BIZ_CODE.FORBIDDEN])
  }

  // 5xx：服务端异常。同样不重试——重试也大概率还是失败，
  // 反而会放大服务端压力（真实项目如需重试应交给专门的退避重试机制）
  if (statusCode >= HTTP_STATUS.SERVER_ERROR) {
    throw createBizError(BIZ_CODE.SERVER_ERROR, BIZ_MESSAGE[BIZ_CODE.SERVER_ERROR])
  }

  /* ── 业务层判定 ── */
  const body = data ?? ({} as ApiResponse)
  if (body.code !== BIZ_CODE.SUCCESS) {
    // 业务码里表示「登录态失效」的，同样走刷新流程
    if (body.code === BIZ_CODE.UNAUTHORIZED) {
      const retried = await tryRefreshAndRetry<T>(options, isRetry, usedAccessToken)
      if (retried !== undefined) return retried
      throw createAuthError()
    }

    throw createBizError(body.code, body.message || BIZ_MESSAGE[body.code] || '请求失败')
  }

  return body.data as T
}

/**
 * 尝试刷新 token 后重试原请求。
 *
 * @param usedAccessToken 本次请求实际携带的 accessToken，用于识别并发刷新
 * @returns 重试成功返回业务数据；不满足重试条件或刷新失败时返回 undefined，
 *          由调用方决定抛什么错——这样「能否重试」的判断只有一处
 */
async function tryRefreshAndRetry<T>(
  options: RequestOptions,
  isRetry: boolean,
  usedAccessToken?: string,
): Promise<T | undefined> {
  // 三个不重试的条件：
  //   1. 该接口显式声明了不允许刷新（如刷新接口自身）
  //   2. 已经重试过一次（防止无限循环）
  //   3. 没有 refreshToken（游客态，刷新无从谈起）
  if (options.allowRefresh === false || isRetry) {
    if (options.silent !== true) handleAuthExpired()
    return undefined
  }

  const token = getStoredToken()
  if (!token?.refreshToken) {
    // 连 refreshToken 都没有，刷新是无从谈起的，只能重新登录。
    // 而微信登录不需要用户授权，所以先试静默登录——
    // 成功的话用户根本不会察觉到刚才发生过一次登录态失效
    if (await ensureSilentLogin()) {
      return doRequest<T>(options, true)
    }

    if (options.silent !== true) handleAuthExpired()
    return undefined
  }

  /**
   * 并发保护：凭证在本请求「飞行途中」已被别的请求刷新过了。
   *
   * 这说明本次的 401 是基于旧凭证产生的，刷新已经没有必要——
   * 直接用新凭证重试即可。
   *
   * 少了这一步，在后端启用 refreshToken 轮换（刷新后旧 refreshToken 立即作废）
   * 的场景下会出问题：两个并发请求先后拿到 401，第一个刷新成功拿到新凭证，
   * 第二个却还拿着已作废的旧 refreshToken 去刷新，直接被判失效并把用户踢回登录页。
   * 而这种问题只在「恰好在 token 过期瞬间并发请求」时出现，极难复现和排查。
   */
  if (usedAccessToken && token.accessToken !== usedAccessToken) {
    return doRequest<T>(options, true)
  }

  try {
    await ensureFreshToken()
  } catch {
    // refreshToken 也失效了（通常是 30 天没打开过）。
    // 先试静默登录：微信登录不需要用户授权，成功就能无感把登录态续上，
    // 用户不会因为「一个月没用」就被弹一个登录页
    if (await ensureSilentLogin()) {
      return doRequest<T>(options, true)
    }

    // 静默登录也不行（比如 appid 未配置、用户拒绝了授权），才退回登录页
    if (options.silent !== true) handleAuthExpired()
    return undefined
  }

  // 重试用 isRetry = true 标记，确保不会再触发第二次刷新
  return doRequest<T>(options, true)
}

/* ──────────────────────────────────────────────────────────────────────
 * 五、错误对象
 * ────────────────────────────────────────────────────────────────────── */

/** 业务错误：带业务码，页面可据此做差异化处理 */
export interface BizError extends Error {
  code: number
  isBizError: true
}

function createBizError(code: number, message: string): BizError {
  const error = new Error(message) as BizError
  error.code = code
  error.isBizError = true
  return error
}

function createAuthError(): BizError {
  return createBizError(BIZ_CODE.UNAUTHORIZED, BIZ_MESSAGE[BIZ_CODE.UNAUTHORIZED])
}

/** 把任意异常转成给用户看的文案 */
function resolveErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    // 网络层失败：文案要具体，用户才知道是「自己网不好」而不是「App 坏了」
    if ((err as Error & { isNetworkError?: boolean }).isNetworkError) {
      return '网络连接失败，请检查网络后重试'
    }
    return err.message || '请求失败'
  }
  return '请求失败'
}

/* ──────────────────────────────────────────────────────────────────────
 * 六、语法糖
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 便捷方法。
 * GET 的 data 会被序列化成查询串——这里交给 uni.request 处理，
 * 它对 GET 的 data 会自动拼接为 query string。
 */
export const http = {
  get<T>(url: string, options?: Omit<RequestOptions, 'url' | 'method'>) {
    return request<T>({ url, method: 'GET', ...options })
  },
  post<T>(url: string, data?: Record<string, unknown>, options?: Omit<RequestOptions, 'url' | 'method' | 'data'>) {
    return request<T>({ url, method: 'POST', data, ...options })
  },
  put<T>(url: string, data?: Record<string, unknown>, options?: Omit<RequestOptions, 'url' | 'method' | 'data'>) {
    return request<T>({ url, method: 'PUT', data, ...options })
  },
  del<T>(url: string, options?: Omit<RequestOptions, 'url' | 'method'>) {
    return request<T>({ url, method: 'DELETE', ...options })
  },
}
