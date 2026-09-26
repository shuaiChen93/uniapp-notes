import { BIZ_CODE } from '@/constants/http'
import { STORAGE_KEYS } from '@/constants/storage'
import type { LoginParams, TokenResult, UpdateProfileParams, UserInfo } from '@/types'
import { uuid } from '@/utils/id'
import { findRow, insertRow, updateRow } from '../db'
import {
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  extractBearerToken,
  fail,
  ok,
  signToken,
  verifyToken,
  type MockResponse,
} from '../utils'

/**
 * Mock：登录 / 刷新 / 用户信息
 * ══════════════════════════════════════════════════════════════════════
 * 这里扮演的是「服务端」。前端发来的 code 在真实后端会被拿去
 * 请求微信服务器换取 openid，mock 环境则直接把 code 当作账号唯一键。
 *
 * 关键设计：**所有 token 的签发与校验都是真实逻辑**——
 * accessToken 会真的在 2 分钟后过期，过期后接口真的会返回 401。
 * 只有「网络传输」是假的。这样前端那套无感刷新逻辑能被真实地跑通，
 * 而不是等接上后端才发现队列写错了。
 * ══════════════════════════════════════════════════════════════════════
 */

/** mock 用户表的行结构：UserInfo 加上账号唯一键 */
interface MockUserRow extends UserInfo {
  /** 登录凭证（微信 code 或设备标识），相当于真实后端的 openid */
  code: string
}

/** 昵称词库：让每次注册出现的新用户看起来像真人，而不是「用户001」 */
const NICKNAME_PREFIX = ['王牌', '疾风', '影袭', '铁血', '精准', '闪电', '苍鹰', '烈焰']
const NICKNAME_SUFFIX = ['狙击手', '突击兵', '指挥官', '射手', '战术家', '尖兵']

function randomNickname(): string {
  const prefix = NICKNAME_PREFIX[Math.floor(Math.random() * NICKNAME_PREFIX.length)]
  const suffix = NICKNAME_SUFFIX[Math.floor(Math.random() * NICKNAME_SUFFIX.length)]
  // 补三位随机数：避免同名前缀组合撞车，也让昵称更像真实玩家 ID
  return `${prefix}${suffix}${Math.floor(100 + Math.random() * 900)}`
}

/** 按 code 查找用户，没有就注册一个 */
function findOrCreateUser(code: string, loginType: LoginParams['loginType']): MockUserRow {
  const existed = findRow<MockUserRow>(
    STORAGE_KEYS.MOCK_USERS,
    (row) => row.code === code && row.loginType === loginType,
  )
  if (existed) return existed

  const user: MockUserRow = {
    id: uuid('u_'),
    code,
    nickname: randomNickname(),
    // 头像留空：真实环境这里是微信头像 URL，mock 环境不引入外部图片依赖
    // （小程序加载网络图片需要配置 downloadFile 合法域名，会让项目开箱即用性变差）。
    // 界面侧改用「昵称首字 + 渐变底」的文字头像，视觉上同样成立且零依赖。
    avatar: '',
    loginType,
    createdAt: Date.now(),
  }
  return insertRow(STORAGE_KEYS.MOCK_USERS, user)
}

/** 用用户信息签发一组 token */
function issueTokens(user: MockUserRow): TokenResult {
  return {
    accessToken: signToken(user.id, 'access', ACCESS_TOKEN_TTL),
    refreshToken: signToken(user.id, 'refresh', REFRESH_TOKEN_TTL),
    // 把过期时间戳一并返回：客户端据此提前判断是否需要刷新，
    // 不必解析 token 内容（真实项目的 JWT 解析有额外成本，且要处理时钟偏差）
    expiresAt: Date.now() + ACCESS_TOKEN_TTL,
    user: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      loginType: user.loginType,
      createdAt: user.createdAt,
    },
  }
}

/** POST /auth/login */
export function handleLogin(body: Partial<LoginParams>): MockResponse {
  const { code, loginType = 'guest' } = body

  if (!code) {
    return fail(BIZ_CODE.BAD_REQUEST, '缺少登录凭证 code')
  }

  const user = findOrCreateUser(code, loginType)
  return ok(issueTokens(user), '登录成功')
}

/**
 * POST /auth/refresh
 *
 * 用 refreshToken 换一个新的 accessToken。
 *
 * ⚠️ 本 mock **不做 refreshToken 轮换**（refresh 后旧 refreshToken 仍可用）：
 * 轮换需要后端维护「已用令牌」黑名单并处理并发刷新的竞态，
 * 而前端已经有刷新队列保证同一时刻只有一个刷新请求。
 * 真实项目是否轮换取决于后端约定，此处保持简单以便聚焦前端链路。
 */
export function handleRefresh(body: { refreshToken?: string }): MockResponse {
  const payload = verifyToken(body.refreshToken, 'refresh')
  if (!payload) {
    // refreshToken 也失效了：客户端必须清空本地凭证并回到登录页，
    // 这种情况无法静默恢复，所以返回明确的业务码让前端做跳转
    return fail(BIZ_CODE.UNAUTHORIZED, '登录已失效，请重新登录')
  }

  const user = findRow<MockUserRow>(STORAGE_KEYS.MOCK_USERS, (row) => row.id === payload.userId)
  if (!user) {
    return fail(BIZ_CODE.UNAUTHORIZED, '账号不存在，请重新登录')
  }

  return ok(issueTokens(user), '刷新成功')
}

/** 去掉账号唯一键，只返回对外的用户信息 */
function toUserInfo(row: MockUserRow): UserInfo {
  const { code: _code, ...userInfo } = row
  return userInfo
}

/**
 * 从请求头解析出当前登录用户。
 * 返回 null 表示未登录——调用方统一回 401。
 */
function resolveCurrentUser(header?: Record<string, string>): MockUserRow | null {
  const payload = verifyToken(extractBearerToken(header), 'access')
  if (!payload) return null
  // findRow 找不到时返回 undefined，统一收敛成 null，调用方只需判一种空值
  return (
    findRow<MockUserRow>(STORAGE_KEYS.MOCK_USERS, (row) => row.id === payload.userId) ?? null
  )
}

/**
 * GET /auth/profile
 *
 * 需要有效的 accessToken —— 这正是「无感刷新」的触发点：
 * 应用启动时用它恢复登录态，若 accessToken 已过期就会拿到 401，
 * 前端据此走刷新队列，用户全程无感知。
 */
export function handleProfile(header?: Record<string, string>): MockResponse {
  const user = resolveCurrentUser(header)
  if (!user) {
    // 返回 HTTP 401 而不是业务码：这是前端唯一会触发「静默刷新」的信号，
    // 必须与「用户名密码错误」这类业务失败严格区分开
    return fail(BIZ_CODE.UNAUTHORIZED, 'accessToken 已过期', 401)
  }

  return ok(toUserInfo(user))
}

/** 昵称长度上限，与微信「头像昵称填写能力」的限制保持一致 */
const NICKNAME_MAX_LENGTH = 30

/**
 * PUT /auth/profile
 *
 * 更新昵称 / 头像。
 *
 * 真实后端在这里要做的事比 mock 多得多：把 wxfile:// 临时路径
 * （或 chooseAvatar 返回的临时链接）下载下来转存到自己的对象存储，
 * 换成永久 URL 再落库。mock 环境没有对象存储，直接把传来的值存下即可——
 * 前端调用方看到的接口契约是完全一样的。
 */
export function handleUpdateProfile(
  body: UpdateProfileParams,
  header?: Record<string, string>,
): MockResponse {
  const user = resolveCurrentUser(header)
  if (!user) {
    return fail(BIZ_CODE.UNAUTHORIZED, 'accessToken 已过期', 401)
  }

  const patch: Partial<MockUserRow> = {}

  if (body.nickname !== undefined) {
    // 昵称可能带首尾空格（输入法很容易带出来），先裁剪再校验，
    // 否则「全是空格」会被当成合法昵称存进去
    const nickname = body.nickname.trim()
    if (!nickname) {
      return fail(BIZ_CODE.BAD_REQUEST, '昵称不能为空')
    }
    if (nickname.length > NICKNAME_MAX_LENGTH) {
      return fail(BIZ_CODE.BAD_REQUEST, `昵称最多 ${NICKNAME_MAX_LENGTH} 个字符`)
    }
    patch.nickname = nickname
  }

  if (body.avatar !== undefined) {
    patch.avatar = body.avatar
  }

  const updated = updateRow<MockUserRow>(STORAGE_KEYS.MOCK_USERS, user.id, patch)
  if (!updated) {
    return fail(BIZ_CODE.NOT_FOUND, '账号不存在')
  }

  return ok(toUserInfo(updated), '保存成功')
}
