import type { Rating } from '@/constants/rating'

/**
 * 排行榜类型
 * ══════════════════════════════════════════════════════════════════════
 * ⚠️ 当前是**本地模拟榜单**（见 src/mock/routes/rank.ts）：
 * 真实的好友排行榜需要后端提供「用户 <-> 好友」关系与好友的成绩数据，
 * 而这依赖微信的开放数据域（wx.getFriendCloudStorage）或自建关系链。
 *
 * 本项目保留完整的类型与接口契约，后端接入后只需替换 mock 的实现，
 * 页面层一行都不用改。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 榜单类型：好友榜 / 全服榜 */
export type RankType = 'friend' | 'global'

/** 榜单上的一条 */
export interface RankEntry {
  /** 名次，从 1 开始 */
  rank: number
  userId: string
  nickname: string
  avatar: string
  /** 最高分 */
  score: number
  rating: Rating
  /** 是否是当前登录用户本人。页面据此高亮自己那一行 */
  isSelf: boolean
  /**
   * 是否是我触达不到的「榜上路人」。
   *
   * 真实的好友榜里只有好友；而展示「全服榜」时会出现大量陌生人。
   * 用一个标记区分开，页面才能决定要不要展示「加好友」引导。
   */
  isFriend: boolean
}

/** 排行榜查询参数 */
export interface RankQuery {
  type?: RankType
  /** 取前多少名 */
  limit?: number
}

/** 我在榜单上的位置（可能不在前 N 名内，需要单独返回） */
export interface RankSelfInfo {
  rank: number
  score: number
  /** 距离上一名还差多少分。已经是第一名时为 0 */
  gapToNext: number
}

/** 排行榜响应 */
export interface RankResult {
  type: RankType
  /** 榜单列表 */
  list: RankEntry[]
  /** 我的排名信息 */
  self: RankSelfInfo
  /** 榜单总人数 */
  total: number
  /** 数据更新时间戳 */
  updatedAt: number
}
