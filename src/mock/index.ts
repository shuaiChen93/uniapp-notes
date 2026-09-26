import { API_BASE_URL } from '@/constants/config'
import { BIZ_CODE } from '@/constants/http'
import type { LoginParams, UpdateProfileParams } from '@/types'
import { handleLogin, handleProfile, handleRefresh, handleUpdateProfile } from './routes/auth'
import { delay, fail, type MockResponse } from './utils'

/**
 * Mock 服务入口
 * ══════════════════════════════════════════════════════════════════════
 * 定位：它扮演的是「后端」，而不是「前端的假数据」。
 *
 * 边界必须分清——
 *   属于 Mock：数据的产生与存储、token 签发与校验、业务码的返回
 *   不属于 Mock：请求拦截、token 注入、401 无感刷新、错误提示
 *
 * 后一组全部留在 request.ts 里按真实标准实现。这样接入真实后端时，
 * 只需要把 constants/config.ts 的 USE_MOCK 改成 false，
 * request.ts 及其之上的所有代码（api / store / 页面）一行都不用动。
 *
 * ── 如何新增一个接口 ──────────────────────────────────────────────
 * 1. 在 src/mock/routes/ 下新建模块（如 record.ts），导出处理函数；
 * 2. 在下方 routes 表里追加一行 `'方法 路径': 处理函数`；
 * 3. 在 src/api/modules/ 下写对应的调用函数。
 * 路径里**不要**带 API_BASE_URL 前缀，分发时会自动剥掉。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 传给处理函数的上下文 */
export interface MockContext {
  /** 已剥掉 base 前缀与查询串的路径，如 /auth/login */
  path: string
  method: string
  data: Record<string, unknown>
  header: Record<string, string>
}

type RouteHandler = (ctx: MockContext) => MockResponse | Promise<MockResponse>

/**
 * 路由表。
 * 键的格式固定为 `METHOD 路径`，METHOD 大写——
 * 表驱动的好处是新增接口只需加一行，不必改分发逻辑。
 */
const routes: Record<string, RouteHandler> = {
  'POST /auth/login': (ctx) => handleLogin(ctx.data as Partial<LoginParams>),
  'POST /auth/refresh': (ctx) => handleRefresh(ctx.data as { refreshToken?: string }),
  'GET /auth/profile': (ctx) => handleProfile(ctx.header),
  'PUT /auth/profile': (ctx) => handleUpdateProfile(ctx.data as UpdateProfileParams, ctx.header),
}

/** 把请求地址规整成路由表里的键：去掉域名/base 前缀、查询串、结尾斜杠 */
function normalizePath(url: string): string {
  let path = url

  // 去掉可能出现的完整域名，只保留 pathname
  path = path.replace(/^https?:\/\/[^/]+/, '')
  // 去掉 base 前缀（如 /api）
  if (path.startsWith(API_BASE_URL)) {
    path = path.slice(API_BASE_URL.length)
  }
  // 去掉查询串与 hash
  path = path.split('?')[0].split('#')[0]
  // 补齐开头的斜杠，并去掉结尾多余的斜杠（'/auth/login/' → '/auth/login'）
  if (!path.startsWith('/')) path = `/${path}`
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  return path
}

/**
 * 模拟一次网络请求。
 * 返回结构与 uni.request 的 success 回调对齐，便于 request.ts 用同一套逻辑处理。
 */
export async function mockRequest(options: {
  url: string
  method?: string
  data?: Record<string, unknown>
  header?: Record<string, string>
}): Promise<MockResponse> {
  // 先延迟再处理：模拟真实网络的耗时，让 loading / 骨架屏在开发期真的能被看到
  await delay()

  const method = (options.method ?? 'GET').toUpperCase()
  const path = normalizePath(options.url)
  const key = `${method} ${path}`
  const handler = routes[key]

  if (!handler) {
    // 未匹配时把已注册的路由一并打出来：新增接口写错路径时，
    // 一眼就能看出「是路径写错了」还是「压根忘了注册」
    console.error(
      `[mock] 未实现的接口: ${key}\n已注册的路由:\n${Object.keys(routes)
        .map((item) => `  ${item}`)
        .join('\n')}`,
    )
    return fail(BIZ_CODE.NOT_FOUND, `Mock 接口未实现: ${key}`, 404)
  }

  return handler({
    path,
    method,
    data: options.data ?? {},
    header: options.header ?? {},
  })
}

export type { MockResponse }
