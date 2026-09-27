import type { SensitivityCategoryMeta, SensitivityPlan, SightId } from '@/types'

/**
 * 灵敏度的展示配置与取值范围
 * ══════════════════════════════════════════════════════════════════════
 * 为什么这些常量不放在 types/sensitivity.ts：
 * types 目录的出口是 `export type *`（见 types/index.ts），只导出类型，
 * 值导出会被静默丢掉，页面里 import 会得到 undefined。
 * 与其把出口改成 `export *` 让两个目录的边界变模糊，
 * 不如让 constants 承担所有「值」——这也是本项目一贯的划分。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 三个类目的展示顺序与说明。
 *
 * 顺序刻意与游戏内设置页一致（镜头 → 开火镜头 → 陀螺仪），
 * 用户对照着游戏调参时不需要在大脑中做顺序映射。
 */
export const SENSITIVITY_CATEGORIES: readonly SensitivityCategoryMeta[] = [
  {
    key: 'camera',
    label: '镜头',
    hint: '不开火时滑动屏幕的转向速度',
  },
  {
    key: 'firing',
    label: '开火镜头',
    hint: '开火状态下滑动屏幕的转向速度，决定压枪跟枪的手感',
  },
  {
    key: 'gyro',
    label: '陀螺仪',
    hint: '陀螺仪灵敏度。不开陀螺仪的话这一组可以不调',
  },
] as const

/** 瞄具维度的展示标签 */
export const SIGHT_LABEL: Record<SightId, string> = {
  hip: '腰射',
  '2x': '2 倍',
  '3x': '3 倍',
  '4x': '4 倍',
  '6x': '6 倍',
  '8x': '8 倍',
}

/**
 * 所有瞄具的展示顺序。
 * 与游戏内设置页一致：腰射在最前，然后按倍率升序。
 */
export const SIGHTS: readonly SightId[] = ['hip', '2x', '3x', '4x', '6x', '8x'] as const

/**
 * 灵敏度的合法区间。
 *
 * 游戏里这个值是 0~300 的整数，这里沿用同样的范围——
 * 用户对照游戏调整时数值可以直接对上，不需要换算。
 */
export const SENSITIVITY_MIN = 0
export const SENSITIVITY_MAX = 300

/** 把任意输入规整成合法的灵敏度值：取整 + 夹到区间内 */
export function normalizeSensitivity(value: number): number {
  if (!Number.isFinite(value)) return SENSITIVITY_MIN
  return Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, Math.round(value)))
}

/**
 * 从方案里取「开火镜头 + 指定瞄具」的灵敏度值。
 *
 * 为什么偏偏取这一类目：压枪测试模拟的是**开火状态下的镜头跟随**，
 * 对应的正是游戏里的「开火镜头灵敏度」。取「镜头」或「陀螺仪」
 * 都不对——前者是不开火时的转向速度，后者是另一套独立的输入方式。
 *
 * 三层兜底，任何一层都不抛错：
 *   ① 方案里这个瞄具的值
 *   ② 方案里腰射的值（玩家通常会把腰射调成一个能用的基准）
 *   ③ 基准值 100（连方案都没有时）
 * 训练页不该因为一份方案数据缺了一格就白屏。
 */
export function getFiringSensitivity(
  plan: SensitivityPlan | null | undefined,
  sightId: SightId,
): number {
  const firing = plan?.values?.firing
  return firing?.[sightId] ?? firing?.hip ?? 100
}
