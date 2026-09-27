import type { ScopeId, WeaponId } from '@/constants/weapon'

/**
 * 灵敏度方案类型
 * ══════════════════════════════════════════════════════════════════════
 * 灵敏度不是「一个数」，而是一张**二维表**：
 *   纵轴是操作类型（不开火镜头 / 开火镜头 / 陀螺仪），
 *   横轴是瞄具（腰射 + 五档倍镜）。
 * 游戏里就是这么一个 3×6 的网格，共 18 个值。
 *
 * 为什么按这个结构建模而不是拍平成 18 个字段：
 * 页面上的编辑界面就是按这个维度分的，拍平后每一处都要做
 * 「第 7 个格子属于哪一类」的换算，逻辑会散落到各个角落。
 * 用嵌套结构后，渲染直接两层 v-for 搞定。
 *
 * ⚠️ 本文件只放类型。展示用的常量（标签、可选档位、取值范围）
 * 在 src/constants/sensitivity.ts —— 见 types/index.ts 的说明。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 瞄具维度：腰射 + 五档倍镜 */
export type SightId = 'hip' | ScopeId

/** 灵敏度类目（纵轴） */
export type SensitivityCategory = 'camera' | 'firing' | 'gyro'

/** 一张完整的灵敏度表 */
export type SensitivityValues = Record<SensitivityCategory, Record<SightId, number>>

/** 一套灵敏度方案 */
export interface SensitivityPlan {
  id: string
  /** 所属用户。空字符串表示内置的推荐方案（所有人可见） */
  userId: string
  /** 方案名，如「M416 中距离压枪」 */
  name: string
  /** 一句话说明，展示在方案卡片上 */
  desc: string
  /** 灵敏度数值 */
  values: SensitivityValues
  /** 适用枪械。空数组表示通用 */
  weaponIds: WeaponId[]
  /** 是否内置推荐方案。内置方案不可删除、不可编辑 */
  builtin: boolean
  createdAt: number
  updatedAt: number
}

/** 新建 / 更新方案的参数 */
export interface SavePlanParams {
  id?: string
  name: string
  desc?: string
  values: SensitivityValues
  weaponIds?: WeaponId[]
}

/** 类目元信息，用于渲染编辑表格的左侧标签 */
export interface SensitivityCategoryMeta {
  key: SensitivityCategory
  label: string
  /** 说明文字，解释这一类灵敏度控制的是什么 */
  hint: string
}
