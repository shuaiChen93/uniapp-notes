/**
 * 接口通用类型
 * ══════════════════════════════════════════════════════════════════════
 * 所有接口的响应都遵循 `ApiResponse<T>` 这层信封结构。
 * 泛型 T 描述的是 data 字段的形状——这样 api 层能写出
 * `request<LoginResult>(...)` 这种「要什么就声明什么」的调用，
 * 页面里拿到的 res 自带类型提示，不需要 any 也不需要手动断言。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 后端统一响应信封 */
export interface ApiResponse<T = unknown> {
  /** 业务状态码，见 src/constants/http.ts 的 BIZ_CODE */
  code: number
  /** 提示文案（成功时通常为空） */
  message: string
  /** 业务数据 */
  data: T
}

/** 分页请求参数 */
export interface PageParams {
  page: number
  pageSize: number
}

/** 分页响应结构 */
export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/**
 * 请求库对外的配置项。
 * 继承 uni.request 的原生参数，再补充业务侧需要的开关。
 */
export interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  data?: Record<string, unknown>
  header?: Record<string, string>
  /** 超时时间（毫秒），不传走全局配置 */
  timeout?: number

  /**
   * 是否显示全屏 loading。
   * 默认 false：多数请求是静默的后台刷新，逐个弹 loading 会让界面一直在闪。
   * 只在「用户明确点了按钮、需要即时反馈」的场景显式开启。
   */
  showLoading?: boolean
  /** loading 提示文案 */
  loadingText?: string

  /**
   * 是否自动携带 token。
   * 默认 true。登录、刷新 token 这类接口本身不需要旧 token，可设为 false。
   */
  auth?: boolean

  /**
   * 请求失败时是否自动弹 toast。
   * 默认 true。当页面想自己处理错误（比如展示空状态而不是弹窗）时设为 false。
   */
  showError?: boolean

  /**
   * 该请求的失败是否要触发「无感刷新」。
   * 默认 true。刷新 token 自身的请求必须设为 false，
   * 否则刷新失败会再次触发刷新，形成无限递归。
   */
  allowRefresh?: boolean

  /**
   * 静默请求：不触发任何全局副作用。
   *
   * 开启后，即使服务端返回「登录态失效」也**不会**清凭证、不会跳登录页，
   * 一切交由调用方自己判断。
   *
   * 这是给「登录」「刷新 token」这两个接口专用的：
   * 它们本身就是鉴权链路的一环，失败时若还去触发「跳登录页」的兜底，
   * 就会出现「登录失败 → 跳登录页」这种自己跳自己的怪象，
   * 以及刷新的安静失败被当成业务请求失败来处理。
   */
  silent?: boolean

  /**
   * 请求分组标识，用于取消同类请求。
   *
   * 典型场景：搜索联想——用户连续输入会连发多个请求，
   * 后发的请求可能先返回，导致界面显示的是旧关键词的结果。
   * 给同一组请求传相同的 cancelKey，新请求发出前会自动取消旧请求。
   */
  cancelKey?: string
}
