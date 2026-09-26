import type { LoginParams, TokenResult, UpdateProfileParams, UserInfo } from '@/types'
import { request } from '@/utils/request'

/**
 * 登录鉴权相关接口
 * ══════════════════════════════════════════════════════════════════════
 * 这一层只做一件事：把「接口地址 + 参数 + 返回类型」声明出来。
 *
 * 不要在这一层写业务流程（比如「登录成功后跳哪个页面」）——
 * 那属于 store 或页面。api 层保持「哑」的好处是：
 * 同一个接口可以被 store、被页面、被埋点逻辑复用，而不带任何副作用。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 登录（首次登录自动注册） */
export function login(params: LoginParams) {
  return request<TokenResult>({
    url: '/auth/login',
    method: 'POST',
    data: { ...params },
    // 登录时还没有 token，显式关闭携带与刷新
    auth: false,
    allowRefresh: false,
    showLoading: true,
    loadingText: '登录中',
  })
}

/**
 * 获取当前用户信息。
 *
 * 这是应用启动时「恢复登录态」用的接口：
 * accessToken 过期时它会返回 401，从而触发无感刷新链路。
 * 因此这里不显式设置任何开关，保持默认（携带 token + 允许刷新）。
 */
export function getProfile() {
  return request<UserInfo>({
    url: '/auth/profile',
    method: 'GET',
  })
}

/**
 * 更新当前用户资料（昵称 / 头像）。
 *
 * 与 getProfile 走同一个路径、不同方法，语义清晰：
 * GET 读、PUT 写。调用方只需传要改的字段。
 */
export function updateProfile(params: UpdateProfileParams) {
  return request<UserInfo>({
    url: '/auth/profile',
    method: 'PUT',
    data: { ...params },
    showLoading: true,
    loadingText: '保存中',
  })
}
