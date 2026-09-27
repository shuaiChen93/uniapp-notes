/**
 * api 层的公共工具
 */

/** 查询参数的合法类型 */
type QueryValue = string | number | boolean | undefined | null

/**
 * 把对象拼成查询串。
 *
 * ── 为什么必须手工拼，而不是把参数放进 request 的 data ────────────────
 * uni.request 对 GET 请求确实会自动把 data 拼成 query string，
 * 但 **mock 分支不会**——mockRequest 直接拿 options.url 去匹配路由，
 * 压根不看 data。结果是：开发时接口正常（因为 mock 自己解析了 url），
 * 上线后参数全丢（因为真机上 data 里的东西没进 url）。
 *
 * 与其在 mock 里再实现一套「把 data 拼进 url」的逻辑来对齐行为，
 * 不如让 api 层显式拼好——这样两端看到的是同一个 url，
 * 行为不可能不一致，调试时复制 url 到浏览器也能直接验证。
 *
 * 跳过 undefined / null / 空串：这三个值在业务上都表示「不传这个筛选条件」，
 * 拼成 `?weaponId=` 会让 mock 端收到一个空字符串，
 * 反而可能被误判成「按空枪械筛选」而查出空列表。
 */
export function buildQuery(params: Record<string, QueryValue>): string {
  const parts: string[] = []

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    // 键和值都要编码：值里可能出现中文（昵称）或 & 这类分隔符
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
  }

  return parts.length > 0 ? `?${parts.join('&')}` : ''
}
