/**
 * 本地存储键名常量
 * ══════════════════════════════════════════════════════════════════════
 * 为什么必须集中管理而不是各写各的字符串字面量：
 *
 * 本项目的 mock 层扮演「服务端」、store 层扮演「客户端」，
 * 两边都会读写 storage。键名一旦散落，很容易出现
 * 「服务端写 rt_users、客户端读 rt_user」这类单复数笔误——
 * 而且它不会报错，只表现为「数据莫名丢失」，排查代价极高。
 *
 * 统一加 `rt_` 前缀（recoil trainer）：小程序的 storage 是全局共享的，
 * 第三方 SDK、其他页面都可能往里写，加前缀可避免键冲突。
 * ══════════════════════════════════════════════════════════════════════
 */
export const STORAGE_KEYS = {
  /** 登录凭证：accessToken / refreshToken / expiresAt */
  TOKEN: 'rt_token',

  /** 当前登录用户信息 */
  USER: 'rt_user',

  /** 训练记录表（mock 服务端的「数据库表」） */
  RECORDS: 'rt_records',

  /** 用户表（mock 服务端用，登录时在此注册/查找用户） */
  MOCK_USERS: 'rt_mock_users',

  /** 灵敏度方案表 */
  SENSITIVITY: 'rt_sensitivity',

  /** 应用设置（震动、音效、主题等） */
  SETTINGS: 'rt_settings',

  /**
   * 设备标识。
   * 非小程序端（H5 / App）没有微信登录能力，用一个本地生成的稳定 ID
   * 充当登录凭证，保证「同一台设备再次登录仍是同一个账号」。
   */
  DEVICE_ID: 'rt_device_id',

  /**
   * 用户主动登出的标记。
   *
   * 存在的唯一理由：wx.login 是静默的，应用一启动就会自动登录。
   * 没有这个标记的话，「退出登录」就是个假按钮——
   * 用户点完退出，下次打开又被自动登录回去。
   * 详见 src/utils/token.ts 的 isLoggedOut。
   */
  LOGGED_OUT: 'rt_logged_out',
} as const

/** 所有合法存储键的联合类型，供 storage 工具做类型约束用 */
export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
