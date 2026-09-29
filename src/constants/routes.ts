/**
 * 页面路由常量
 * ══════════════════════════════════════════════════════════════════════
 * 用常量而不是到处写 '/pages/xxx/xxx' 字面量，理由：
 *
 * ① 路由字符串写错**不会报错**，只会表现为「点了没反应」。
 *    这类问题在真机上排查一次的成本，远高于在这里多写一行。
 * ② 全局拦截（App.vue）与锁页会反复跳转首页/锁页，路径一旦散落，
 *    改目录结构时极容易漏改其中一处。
 *
 * ⚠️ 这里的值与 src/pages.json 必须严格一致，新增页面时两处一起改。
 * ══════════════════════════════════════════════════════════════════════
 */
export const ROUTES = {
  /** 首页：时间线列表 */
  HOME: '/pages/index/index',
  /** 编辑页：新建与修改共用。需携带 ?id=xxx 表示编辑已有记事 */
  EDIT: '/pages/edit/edit',
  /** 详情页：需携带 ?id=xxx */
  DETAIL: '/pages/detail/detail',
  /** 密码锁页 */
  LOCK: '/pages/lock/lock',
  /** 设置页 */
  SETTINGS: '/pages/settings/settings',
} as const

/** 详情页 / 编辑页接收的参数名，避免两处各写一遍 'id' */
export const ROUTE_PARAM_ID = 'id' as const

/**
 * 拼出带 id 参数的路由，如 '/pages/detail/detail?id=n_xxx'。
 *
 * 三个页面（首页跳详情、详情跳编辑、编辑读参数）都要处理这个拼接，
 * 集中在这里可以保证「拼」与「读」用的是同一个参数名——
 * 这两处一旦不一致，表现是详情页打开后一片空白，且不报任何错。
 */
export function routeWithId(route: string, id: string): string {
  return `${route}?${ROUTE_PARAM_ID}=${id}`
}
