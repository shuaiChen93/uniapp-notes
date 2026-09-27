import { API_BASE_URL } from '@/constants/config'
import { BIZ_CODE } from '@/constants/http'
import type { LoginParams, SavePlanParams, SubmitRecordParams, UpdateProfileParams } from '@/types'
import { handleLogin, handleProfile, handleRefresh, handleUpdateProfile } from './routes/auth'
import {
  handleBestRecord,
  handleDeleteRecord,
  handleListRecords,
  handleRecordStats,
  handleRecordTrend,
  handleSubmitRecord,
} from './routes/record'
import { handleGetRank } from './routes/rank'
import {
  handleCreatePlan,
  handleDeletePlan,
  handleListPlans,
  handleRecommendPlan,
  handleUpdatePlan,
} from './routes/sensitivity'
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
 *
 * 路径里可以写 `:参数名` 占位（如 `/records/:id`），
 * 匹配到的值会放进 ctx.params —— 这样 api 层能写标准的 RESTful 路径，
 * 接真实后端时路径形态完全一致，不需要改。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 传给处理函数的上下文 */
export interface MockContext {
  /** 已剥掉 base 前缀与查询串的路径，如 /auth/login */
  path: string
  method: string
  /**
   * 请求体。
   *
   * 类型是「形状未知的 JSON 对象」而不是某个具体接口的参数类型——
   * 这恰恰是服务端的真实处境：body 是网络上传来的字节，
   * 必须由处理函数自己校验。
   *
   * 因此路由表里的 `ctx.data as unknown as XxxParams` 是**有意的双重断言**：
   * 它明确表达「这里发生了一次从无类型输入到有类型的转换」，
   * 且每个 handler 内部都做了字段校验（缺失时返回 BAD_REQUEST）。
   * 不要为了消掉这个断言而把 data 改成 any——那会让「谁负责校验」
   * 这件事在代码里彻底消失。
   */
  data: Record<string, unknown>
  /** 查询串参数，如 ?page=2 → { page: '2' }。值一律是字符串 */
  query: Record<string, string>
  /** 路径参数，如路由 `/records/:id` 匹配 `/records/r_1` → { id: 'r_1' } */
  params: Record<string, string>
  header: Record<string, string>
}

type RouteHandler = (ctx: MockContext) => MockResponse | Promise<MockResponse>

/**
 * 路由表。
 * 键的格式固定为 `METHOD 路径`，METHOD 大写——
 * 表驱动的好处是新增接口只需加一行，不必改分发逻辑。
 */
const routes: Record<string, RouteHandler> = {
  /* 鉴权 */
  'POST /auth/login': (ctx) => handleLogin(ctx.data as Partial<LoginParams>),
  'POST /auth/refresh': (ctx) => handleRefresh(ctx.data as { refreshToken?: string }),
  'GET /auth/profile': (ctx) => handleProfile(ctx.header),
  'PUT /auth/profile': (ctx) => handleUpdateProfile(ctx.data as UpdateProfileParams, ctx.header),

  /* 训练记录 */
  'POST /records': (ctx) =>
    handleSubmitRecord(ctx.data as unknown as SubmitRecordParams, ctx.header),
  'GET /records': (ctx) => handleListRecords(ctx.query),
  // ⚠️ 这三个静态路径必须能匹配成功，且不能被 '/records/:id' 抢走。
  // 分发器先做精确匹配再做模式匹配，所以这里的顺序不影响结果——
  // 但阅读时仍建议把具体的写在前面，符合直觉
  'GET /records/stats': () => handleRecordStats(),
  'GET /records/trend': (ctx) => handleRecordTrend(ctx.query),
  'GET /records/best': (ctx) => handleBestRecord(ctx.query),
  'DELETE /records/:id': (ctx) => handleDeleteRecord(ctx.params),

  /* 灵敏度方案 */
  'GET /sensitivity/plans': (ctx) => handleListPlans(ctx.header),
  'POST /sensitivity/plans': (ctx) =>
    handleCreatePlan(ctx.data as unknown as SavePlanParams, ctx.header),
  'PUT /sensitivity/plans/:id': (ctx) =>
    handleUpdatePlan(ctx.params, ctx.data as unknown as SavePlanParams, ctx.header),
  'DELETE /sensitivity/plans/:id': (ctx) => handleDeletePlan(ctx.params, ctx.header),
  'GET /sensitivity/recommend': (ctx) => handleRecommendPlan(ctx.query),

  /* 排行榜 */
  'GET /rank': (ctx) => handleGetRank(ctx.query, ctx.header),
}

/**
 * 把请求地址规整成路由表里的键：去掉域名/base 前缀、查询串、结尾斜杠。
 *
 * 注意**必须去掉查询串**才能匹配路由表——否则 `/records?page=2`
 * 会被当成一个和 `/records` 完全不同的路径而匹配失败。
 * 查询串在 normalizePath 之外单独解析（见 parseQuery）。
 */
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
 * 解析查询串。
 *
 * 小程序端没有 URLSearchParams，因此手写解析。
 * 值全部保持字符串——转换成本该由处理函数按字段类型自己决定，
 * 在这里猜（比如把 "0123" 转成数字 123）反而会丢信息。
 */
function parseQuery(url: string): Record<string, string> {
  const index = url.indexOf('?')
  if (index === -1) return {}

  const search = url.slice(index + 1).split('#')[0]
  if (!search) return {}

  const query: Record<string, string> = {}
  for (const pair of search.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    // 没有等号时（如 ?debug）记成空串，而不是丢掉这个键——
    // 「参数存在但为空」和「参数不存在」在业务上是两回事
    const key = eq === -1 ? pair : pair.slice(0, eq)
    const value = eq === -1 ? '' : pair.slice(eq + 1)
    try {
      query[decodeURIComponent(key)] = decodeURIComponent(value)
    } catch {
      // 非法的百分号编码（如用户手输了 "%zz"）会让 decodeURIComponent 抛错。
      // 这种请求按原样记录即可，不该让整个请求失败
      query[key] = value
    }
  }

  return query
}

/**
 * 用路由模式匹配实际路径，提取路径参数。
 * 不匹配返回 null。
 */
function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/')
  const pathParts = path.split('/')

  // 段数不同必然不匹配，先挡掉——这一步让绝大多数路由在 O(1) 内被排除
  if (patternParts.length !== pathParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i += 1) {
    const segment = patternParts[i]
    if (segment.startsWith(':')) {
      const name = segment.slice(1)
      // 空段不算匹配：`/records//` 不该被 `/records/:id` 接住
      if (!pathParts[i]) return null
      try {
        params[name] = decodeURIComponent(pathParts[i])
      } catch {
        params[name] = pathParts[i]
      }
    } else if (segment !== pathParts[i]) {
      return null
    }
  }

  return params
}

/** 路由匹配结果 */
interface RouteMatch {
  handler: RouteHandler
  params: Record<string, string>
}

/**
 * 查找匹配的路由。
 *
 * 两轮：先精确匹配，再按模式匹配。
 * 必须精确优先，否则 `/records/stats` 会被 `/records/:id` 抢先匹配，
 * 把 "stats" 当成一个记录 id 传进去——这会导致一个极难定位的 404。
 */
function matchRoute(method: string, path: string): RouteMatch | null {
  const exact = routes[`${method} ${path}`]
  if (exact) return { handler: exact, params: {} }

  for (const key of Object.keys(routes)) {
    const spaceIndex = key.indexOf(' ')
    const routeMethod = key.slice(0, spaceIndex)
    if (routeMethod !== method) continue

    const params = matchPattern(key.slice(spaceIndex + 1), path)
    if (params) return { handler: routes[key], params }
  }

  return null
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
  const matched = matchRoute(method, path)

  if (!matched) {
    // 未匹配时把已注册的路由一并打出来：新增接口写错路径时，
    // 一眼就能看出「是路径写错了」还是「压根忘了注册」
    console.error(
      `[mock] 未实现的接口: ${method} ${path}\n已注册的路由:\n${Object.keys(routes)
        .map((item) => `  ${item}`)
        .join('\n')}`,
    )
    return fail(BIZ_CODE.NOT_FOUND, `Mock 接口未实现: ${method} ${path}`, 404)
  }

  return matched.handler({
    path,
    method,
    data: options.data ?? {},
    query: parseQuery(options.url),
    params: matched.params,
    header: options.header ?? {},
  })
}

export type { MockResponse }
