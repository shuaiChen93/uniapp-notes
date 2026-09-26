import { BIZ_CODE } from '@/constants/http'
import { MOCK_DELAY_RANGE } from '@/constants/config'
import type { ApiResponse } from '@/types'
import { uuid } from '@/utils/id'

/**
 * Mock 服务端的公共工具
 * ══════════════════════════════════════════════════════════════════════
 */

/** mock 请求的返回结构，与 uni.request 的 success 回调形状对齐 */
export interface MockResponse {
  statusCode: number
  data: ApiResponse
}

/** 构造成功响应 */
export function ok<T>(data: T, message = 'ok'): MockResponse {
  return {
    statusCode: 200,
    data: { code: BIZ_CODE.SUCCESS, message, data },
  }
}

/**
 * 构造业务失败响应。
 *
 * 注意这里 HTTP 状态码**始终是 200**，错误通过 body 里的 code 表达。
 * 这是刻意的：真实后端把「业务失败」和「网络/服务异常」分开，
 * 401 这类 HTTP 状态码留给「登录态失效」专用。
 * 如果混用（比如用户名密码错误也返回 401），
 * 客户端就无法区分该「弹错误提示」还是该「静默刷新 token」。
 */
export function fail(code: number, message: string, statusCode = 200): MockResponse {
  return {
    statusCode,
    data: { code, message, data: null },
  }
}

/** 模拟网络延迟，让开发期的 loading 态真实可见 */
export function delay(): Promise<void> {
  const [min, max] = MOCK_DELAY_RANGE
  const ms = min + Math.random() * (max - min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ──────────────────────────────────────────────────────────────────────
 * 伪造的 JWT 式凭证
 *
 * 为什么不用 btoa 造一个形似 JWT 的串：小程序端没有 btoa，
 * 各端 API 不统一。这里用一个自描述的点分格式，两端行为一致，
 * 且肉眼就能看出内容，调日志时比一串 base64 好读得多。
 *
 * 格式：rt.<type>.<userId>.<expiresAt>.<signature>
 * ────────────────────────────────────────────────────────────────────── */

export type TokenType = 'access' | 'refresh'

export interface TokenPayload {
  type: TokenType
  userId: string
  expiresAt: number
}

/** accessToken 有效期：2 分钟。
 *  刻意设得很短——开发期要能在一两分钟内就观察到「过期 → 自动刷新」的完整链路，
 *  设成 2 小时的话这条关键逻辑在整个开发期都跑不到一次。 */
export const ACCESS_TOKEN_TTL = 2 * 60 * 1000

/** refreshToken 有效期：30 天（真实项目的常见量级） */
export const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60 * 1000

/** 签发一个 token */
export function signToken(userId: string, type: TokenType, ttl: number): string {
  const expiresAt = Date.now() + ttl
  // 末段用随机串模拟签名：mock 环境下不校验它，
  // 但保留这一段是为了让 token 的长度与形态接近真实，避免前端代码对长度做假设
  return `rt.${type}.${userId}.${expiresAt}.${uuid()}`
}

/** 解析 token，格式非法返回 null */
export function parseToken(token: string | undefined | null): TokenPayload | null {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 5 || parts[0] !== 'rt') return null

  const [, type, userId, expiresAtRaw] = parts
  const expiresAt = Number(expiresAtRaw)
  if (!userId || Number.isNaN(expiresAt)) return null

  return { type: type as TokenType, userId, expiresAt }
}

/**
 * 校验 token 是否可用。
 * 对应真实后端中间件的职责：验签 + 检查过期。
 */
export function verifyToken(
  token: string | undefined | null,
  expectedType: TokenType,
): TokenPayload | null {
  const payload = parseToken(token)
  if (!payload) return null
  if (payload.type !== expectedType) return null
  if (payload.expiresAt <= Date.now()) return null
  return payload
}

/** 从请求头里取出 Bearer token */
export function extractBearerToken(header?: Record<string, string>): string | null {
  if (!header) return null
  // header 的键大小写由调用方决定，这里两种都认，避免因大小写差异导致「取不到 token」
  const raw = header.Authorization ?? header.authorization
  if (!raw) return null
  return raw.replace(/^Bearer\s+/i, '')
}
