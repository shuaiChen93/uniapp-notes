/**
 * 用户与登录态相关类型
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 登录方式。
 *
 * 本项目当前是「本地 mock 登录」：不接真实后端，用户数据全部存在本机。
 * 但类型上仍区分 wechat / guest，原因有二：
 *   1. 接入真实微信登录后，登录方式会影响后续逻辑（能否同步、能否参与好友排行）；
 *   2. mock 层的 user 表需要按登录方式区分账号，否则同一台设备上
 *      「先游客登录、再微信登录」会被当成同一个人，与真实后端行为不符。
 */
export type LoginType = 'wechat' | 'guest'

/** 用户信息 */
export interface UserInfo {
  /** 用户唯一标识（mock 环境下由本地生成，真实环境为后端返回的 openid） */
  id: string
  /** 昵称 */
  nickname: string
  /** 头像地址 */
  avatar: string
  /** 登录方式 */
  loginType: LoginType
  /** 注册时间戳（毫秒） */
  createdAt: number
}

/**
 * 更新用户资料的参数。
 *
 * 字段全部可选：调用方只传要改的那几项，未传的保持原值。
 * 这样接口能同时服务于「只换头像」和「只改昵称」两种场景，
 * 而不必让调用方先把完整对象读出来再整体提交
 * （那样在并发编辑时会互相覆盖）。
 */
export interface UpdateProfileParams {
  /** 新昵称，最多 30 个字符 */
  nickname?: string
  /** 新头像地址 */
  avatar?: string
}

/** 登录接口的请求参数 */
export interface LoginParams {
  /**
   * 登录凭证。
   * 小程序端为 wx.login 返回的 code；非小程序端（H5/App）为本地设备标识。
   * 真实后端会用这个 code 去微信服务器换取 openid。
   */
  code: string
  /** 登录方式 */
  loginType: LoginType
}

/** 登录 / 刷新 token 接口的返回结构 */
export interface TokenResult {
  /** 短期凭证：随每个业务请求发送，过期后用 refreshToken 换新的 */
  accessToken: string
  /** 长期凭证：只用于换取新的 accessToken，不参与业务请求 */
  refreshToken: string
  /** accessToken 的过期时间戳（毫秒），客户端据此提前判断是否需要刷新 */
  expiresAt: number
  /** 用户信息 */
  user: UserInfo
}

/** 本地持久化的凭证结构（存在 storage 里的形状） */
export interface StoredToken {
  accessToken: string
  refreshToken: string
  expiresAt: number
}
