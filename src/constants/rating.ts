/**
 * 成绩评级
 * ══════════════════════════════════════════════════════════════════════
 * ⚠️ 本文件里的样式类名**必须是完整字符串**，不能动态拼接。
 *
 * 原因：Tailwind v3 是 JIT 编译，靠静态扫描源码里的完整类名来决定生成
 * 哪些样式。写 `` `text-rating-${rating.toLowerCase()}` `` 的话，
 * 扫描器看到的是 `text-rating-` 这个残缺前缀，一条样式都不会生成——
 * 而且不报错，只是评级颜色全部失效，表现为「所有评级都是灰的」。
 *
 * 因此这里用「枚举 → 完整类名」的映射表，把类名写成字面量。
 * 这是小程序 + Tailwind 组合下最容易踩、又最难查的一类坑。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 评级。从高到低，顺序即排序依据 */
export const RATINGS = ['S', 'A', 'B', 'C', 'D'] as const

export type Rating = (typeof RATINGS)[number]

/**
 * 各评级的最低分数线。
 *
 * 分档刻意不是等距的（S 需要 92 分，A 只要 80）：
 * 压枪训练的分数天然集中在 60~85 这个区间，若按 20 分一档均分，
 * 会出现「几乎所有人都拿 C」的情况，评级就失去了区分度。
 * 把高档位的门槛拉开，中低档压缩，才符合实际分布。
 */
export const RATING_THRESHOLDS: Record<Rating, number> = {
  S: 92,
  A: 80,
  B: 65,
  C: 48,
  D: 0,
}

/** 每个评级的展示信息 */
export interface RatingMeta {
  /** 评级字母 */
  rating: Rating
  /** 一句话评价，给用户的正向反馈 */
  label: string
  /** 文字色类名（完整字面量，见文件头说明） */
  textClass: string
  /** 背景色类名，用于徽章底色 */
  bgClass: string
  /** 边框色类名 */
  borderClass: string
  /** 原始色值。canvas 绘制与行内样式用，Tailwind 类名覆盖不到的场景 */
  color: string
}

/**
 * 评级元信息表。
 *
 * 色值与 tailwind.config.js 里 theme.extend.colors.rating 一一对应，
 * 两处都写是为了覆盖不同场景：
 * 类名用于常规标签，原始色值用于 canvas 绘图与 :style 行内样式
 * （canvas 读不到 CSS 类，只能拿到色值）。
 */
export const RATING_META: Record<Rating, RatingMeta> = {
  S: {
    rating: 'S',
    label: '神枪手',
    textClass: 'text-rating-s',
    bgClass: 'bg-rating-s',
    borderClass: 'border-rating-s',
    color: '#FFC53D',
  },
  A: {
    rating: 'A',
    label: '压枪大师',
    textClass: 'text-rating-a',
    bgClass: 'bg-rating-a',
    borderClass: 'border-rating-a',
    color: '#A855F7',
  },
  B: {
    rating: 'B',
    label: '稳定发挥',
    textClass: 'text-rating-b',
    bgClass: 'bg-rating-b',
    borderClass: 'border-rating-b',
    color: '#3B82F6',
  },
  C: {
    rating: 'C',
    label: '还需练习',
    textClass: 'text-rating-c',
    bgClass: 'bg-rating-c',
    borderClass: 'border-rating-c',
    color: '#22C55E',
  },
  D: {
    rating: 'D',
    label: '重新校准',
    textClass: 'text-rating-d',
    bgClass: 'bg-rating-d',
    borderClass: 'border-rating-d',
    color: '#6B7280',
  },
}

/**
 * 按分数取评级。
 *
 * 遍历顺序依赖 RATINGS 的从高到低排列——先匹配到的一定是更高的档位，
 * 所以不需要排序，也不会出现「92 分同时满足 S 和 A」的歧义。
 */
export function getRating(score: number): Rating {
  const matched = RATINGS.find((rating) => score >= RATING_THRESHOLDS[rating])
  // 分数为负或 NaN 时兜底到最低档，而不是返回 undefined——
  // 调用方拿到 undefined 会在渲染时炸掉，返回 D 至少界面是正常的
  return matched ?? 'D'
}

/** 按分数直接取展示信息，省去调用方两步取值 */
export function getRatingMeta(score: number): RatingMeta {
  return RATING_META[getRating(score)]
}
