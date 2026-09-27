import type { Rating } from '@/constants/rating'
import type { Loadout } from '@/constants/weapon'
import type { PageParams } from './api'

/**
 * 训练记录类型
 * ══════════════════════════════════════════════════════════════════════
 * 一条记录 = 一次完整的压枪训练结果。
 *
 * ⚠️ 刻意**不存弹着点明细**（impacts 数组）：
 * 一次 5 秒训练有 50+ 发，每发两个浮点数，存进 storage 后单条记录就有
 * 几百字节。训练记录是只增不改的，几千条下来会把 storage 撑爆
 * （小程序单域名上限 10MB），而历史列表根本用不到弹着点——
 * 它只在训练刚结束的结果页里展示一次。
 * 因此明细只存在于内存，落库时只保留统计值。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 一条训练记录 */
export interface TrainingRecord {
  id: string
  /** 所属用户。未登录时为空字符串（游客的本地记录仍然保留） */
  userId: string
  /** 训练时间戳（毫秒） */
  createdAt: number
  /** 本次使用的配装 */
  loadout: Loadout
  /** 综合得分 0~100 */
  score: number
  /** 评级 */
  rating: Rating
  /** 平均垂直偏移（像素） */
  verticalOffset: number
  /** 平均水平偏移（像素） */
  horizontalOffset: number
  /** 垂直稳定性 0~100 */
  verticalStability: number
  /** 水平稳定性 0~100 */
  horizontalStability: number
  /** 总发数 */
  shotsFired: number
  /** 命中率 0~1 */
  hitRate: number
  /** 实际训练时长（毫秒） */
  duration: number
}

/** 提交一次训练成绩的参数 */
export interface SubmitRecordParams {
  loadout: Loadout
  score: number
  rating: Rating
  verticalOffset: number
  horizontalOffset: number
  verticalStability: number
  horizontalStability: number
  shotsFired: number
  hitRate: number
  duration: number
}

/** 记录列表的查询参数 */
export interface RecordQuery extends Partial<PageParams> {
  /**
   * 按枪械筛选。
   * undefined 表示不筛选——用 undefined 而不是 'all' 这种魔法字符串，
   * 是为了让「不筛选」这件事在类型上就是「没传」，不需要记约定。
   */
  weaponId?: string
}

/** 训练统计概览：展示在首页与「我的」页 */
export interface TrainingStats {
  /** 总训练次数 */
  totalSessions: number
  /** 历史最高分。没练过时为 0 */
  bestScore: number
  /** 平均分 */
  averageScore: number
  /** 平均偏移（像素），衡量整体稳定水平 */
  averageOffset: number
  /** 累计训练时长（毫秒） */
  totalDuration: number
  /** 最近一次训练的时间戳。没练过时为 0 */
  lastTrainedAt: number
}

/** 趋势图上的一个点 */
export interface TrendPoint {
  /** 时间戳 */
  createdAt: number
  /** 分数 */
  score: number
}
