/**
 * HTTP 与业务状态码
 * ══════════════════════════════════════════════════════════════════════
 * 为什么要把「HTTP 状态码」和「业务码」分开定义：
 *
 * 两者描述的是不同层面的结果，真实项目中会同时出现：
 *   HTTP 状态码 → 传输层结果（404 路由不存在、500 服务端崩了、401 没登录）
 *   业务码      → 业务层结果（"该昵称已被占用"、"今日挑战次数已用完"）
 *
 * 混在一起用是常见的返工源头：比如想用 401 表示"token 过期"，
 * 又想用 401 表示"用户名密码错误"，最后响应拦截器无法区分该不该刷新 token。
 *
 * 因此约定：**401 只用于登录态失效**（触发无感刷新），
 * 其余业务错误一律用 BIZ_CODE，HTTP 状态码保持 200。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 业务状态码（放在响应体的 code 字段） */
export const BIZ_CODE = {
  /** 成功 */
  SUCCESS: 0,
  /** 参数校验失败 */
  BAD_REQUEST: 40000,
  /** 登录态失效：accessToken 过期或非法，客户端应尝试用 refreshToken 续期 */
  UNAUTHORIZED: 40100,
  /** 已登录但无权访问该资源 */
  FORBIDDEN: 40300,
  /** 资源不存在 */
  NOT_FOUND: 40400,
  /** 服务端内部错误 */
  SERVER_ERROR: 50000,
} as const

export type BizCode = (typeof BIZ_CODE)[keyof typeof BIZ_CODE]

/** HTTP 状态码中本项目需要特殊处理的部分 */
export const HTTP_STATUS = {
  OK: 200,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500,
} as const

/**
 * 业务码 → 用户可读提示文案。
 *
 * 只有「用户看得懂且需要知道」的错误才配文案。
 * 像 500 这类保留兜底文案即可，把技术细节通过 console 输出给开发者，
 * 不要把 "TypeError: cannot read property of undefined" 这种内容弹给用户。
 */
export const BIZ_MESSAGE: Record<number, string> = {
  [BIZ_CODE.BAD_REQUEST]: '请求参数有误',
  [BIZ_CODE.UNAUTHORIZED]: '登录已过期，请重新登录',
  [BIZ_CODE.FORBIDDEN]: '没有权限执行该操作',
  [BIZ_CODE.NOT_FOUND]: '请求的内容不存在',
  [BIZ_CODE.SERVER_ERROR]: '服务开小差了，请稍后重试',
}
