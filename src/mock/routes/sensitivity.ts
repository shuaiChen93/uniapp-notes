import { BIZ_CODE } from '@/constants/http'
import { SIGHTS, SENSITIVITY_MAX, SENSITIVITY_MIN, normalizeSensitivity } from '@/constants/sensitivity'
import { STORAGE_KEYS } from '@/constants/storage'
import type { SavePlanParams, SensitivityPlan, SensitivityValues, SightId } from '@/types'
import { uuid } from '@/utils/id'
import { deleteRow, findRow, insertRow, selectAll, updateRow } from '../db'
import { fail, ok, type MockResponse } from '../utils'
import { resolveCurrentUser } from './auth'

/**
 * Mock：灵敏度方案
 * ══════════════════════════════════════════════════════════════════════
 * 方案分两类：
 *   内置方案 —— 定义在本文件里，**不落 storage**。用户改不了也删不掉。
 *   我的方案 —— 存在 storage 的 rt_sensitivity 表里，可增删改。
 *
 * 为什么内置方案不落 storage：
 * 落盘意味着要有一套「首次启动时初始化内置数据」的逻辑，
 * 还要处理「用户删掉后下次启动又回来了」的诡异现象，
 * 以及「内置方案被用户改坏了怎么办」。做成代码里的常量后，
 * 这三个问题全部不存在——它们是只读的参照物，本就该是代码。
 *
 * ⚠️ 数值是**参考值**，不是从职业选手配置里抄来的。
 * 厂商不同、机型不同、手指习惯不同，灵敏度没有标准答案，
 * 内置方案的作用是给一个合理起点，而不是「正确答案」。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 构造一张灵敏度表：按「倍镜越高、灵敏度越低」的规律生成 */
function buildValues(
  base: number,
  firingRatio: number,
  gyroRatio: number,
): SensitivityValues {
  /**
   * 每个瞄具相对腰射的衰减系数。
   *
   * 为什么必须随倍镜递减：高倍镜下屏幕上的目标被放大，
   * 同样的手指位移会让准星移动更远的实际距离。
   * 若各倍镜用同一个值，高倍镜会「一动就飞过目标」，完全没法瞄。
   *
   * 这个递减不是线性的——2 倍到 4 倍降得快，6 倍到 8 倍降得慢，
   * 因为高倍镜本身用得少，且瞄准方式更依赖微调而非大范围转向。
   */
  const decay: Record<SightId, number> = {
    hip: 1,
    '2x': 0.82,
    '3x': 0.7,
    '4x': 0.6,
    '6x': 0.48,
    '8x': 0.4,
  }

  const camera = {} as Record<SightId, number>
  const firing = {} as Record<SightId, number>
  const gyro = {} as Record<SightId, number>

  for (const sight of SIGHTS) {
    const value = base * decay[sight]
    camera[sight] = normalizeSensitivity(value)
    // 开火灵敏度通常比镜头略低：开火时手指还要兼顾压枪，
    // 灵敏度太高会让「压枪」和「转向」互相干扰
    firing[sight] = normalizeSensitivity(value * firingRatio)
    // 陀螺仪是另一套操作方式，数值体系与触屏不通用，单独按比例给
    gyro[sight] = normalizeSensitivity(value * gyroRatio)
  }

  return { camera, firing, gyro }
}

/**
 * 内置推荐方案。
 *
 * 三套覆盖了主要场景：不知道选什么就用「通用均衡」，
 * 打近战用「近战冲锋」，打远程用「远程压枪」。
 * 只给三套而不是十几套：选项过多时用户不会去比较，只会随便点一个。
 */
const BUILTIN_PLANS: SensitivityPlan[] = [
  {
    id: 'builtin-balanced',
    userId: '',
    name: '通用均衡',
    desc: '不知道选什么就用这套，适合大多数枪械与距离',
    values: buildValues(100, 0.9, 0.7),
    weaponIds: [],
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-close',
    userId: '',
    name: '近战冲锋',
    desc: '高灵敏度，转向快，适合 UMP45 / Vector 贴脸',
    values: buildValues(130, 0.95, 0.8),
    weaponIds: ['ump45', 'vector'],
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'builtin-long',
    userId: '',
    name: '远程压枪',
    desc: '低灵敏度，准星更稳，适合 4/6/8 倍镜单点',
    values: buildValues(72, 0.85, 0.6),
    weaponIds: ['m416', 'scar-l', 'akm'],
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
]

/** 方案名长度上限。与其他名称类字段保持一致，避免界面被超长名字撑破 */
const NAME_MAX_LENGTH = 20

/* ──────────────────────────────────────────────────────────────────────
 * 校验
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 把外部传来的 values 规整成合法结构。
 *
 * 逐格校验而不是整体信任：灵敏度网格有 18 个格子，只要有一个是
 * undefined 或 NaN，渲染时那一格的输入框就会显示成空白或 NaN，
 * 而错误发生在哪一格完全看不出来。在这里一次性补齐，
 * 上游就不用再写防御性代码。
 */
function normalizeValues(raw: unknown): SensitivityValues | null {
  if (!raw || typeof raw !== 'object') return null

  const source = raw as Partial<Record<keyof SensitivityValues, unknown>>
  const result = {} as SensitivityValues

  for (const category of ['camera', 'firing', 'gyro'] as const) {
    const group = source[category]
    // 某一类缺失时整体判非法，而不是补一组默认值：
    // 缺一整类说明前端传错了结构，静默补默认值会让 bug 被掩盖到用户投诉为止
    if (!group || typeof group !== 'object') return null

    const values = group as Record<string, unknown>
    const filled = {} as Record<SightId, number>

    for (const sight of SIGHTS) {
      const value = Number(values[sight])
      if (!Number.isFinite(value)) return null
      if (value < SENSITIVITY_MIN || value > SENSITIVITY_MAX) {
        throwInvalidValue(sight)
      }
      filled[sight] = Math.round(value)
    }

    result[category] = filled
  }

  return result
}

/**
 * 值越界时抛出错误，由调用方 catch 后转成统一的响应。
 *
 * 用抛错而不是返回 null：调用方需要知道「是越界了还是结构错了」，
 * 因为两者的提示文案不同。返回值只能表达「失败」，
 * 把原因藏在闭包变量里会让代码难以追踪。
 */
function throwInvalidValue(sight: SightId): never {
  throw new RangeError(`瞄具 ${sight} 的灵敏度必须在 ${SENSITIVITY_MIN}~${SENSITIVITY_MAX} 之间`)
}

/* ──────────────────────────────────────────────────────────────────────
 * GET /sensitivity/plans —— 方案列表
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 列出全部可用方案：内置方案在前，我的方案在后。
 *
 * 内置在前的理由：用户第一次进来时「我的方案」是空的，
 * 把内置排前面能让他立刻有东西可用；等他自己建了几套之后，
 * 位置固定也不会让他每次都要重新找。
 */
export function handleListPlans(header?: Record<string, string>): MockResponse {
  const user = resolveCurrentUser(header)
  const mine = selectAll<SensitivityPlan>(STORAGE_KEYS.SENSITIVITY)

  // 只返回自己的方案。方案与记录不同——记录是「设备数据」，
  // 而方案是「个人配置」，同一台设备上换个账号还看到别人的配置会很奇怪
  const myPlans = user ? mine.filter((plan) => plan.userId === user.id) : []

  myPlans.sort((a, b) => b.updatedAt - a.updatedAt)

  return ok([...BUILTIN_PLANS, ...myPlans])
}

/* ──────────────────────────────────────────────────────────────────────
 * POST /sensitivity/plans —— 新建
 * ────────────────────────────────────────────────────────────────────── */

export function handleCreatePlan(
  body: SavePlanParams,
  header?: Record<string, string>,
): MockResponse {
  const user = resolveCurrentUser(header)
  if (!user) {
    // 方案必须归属到账号，否则无法区分「我的」和「别人的」。
    // 这与记录不同——记录允许游客提交，方案不允许
    return fail(BIZ_CODE.UNAUTHORIZED, '登录后才能保存灵敏度方案', 401)
  }

  const name = (body?.name ?? '').trim()
  if (!name) return fail(BIZ_CODE.BAD_REQUEST, '方案名不能为空')
  if (name.length > NAME_MAX_LENGTH) {
    return fail(BIZ_CODE.BAD_REQUEST, `方案名最多 ${NAME_MAX_LENGTH} 个字`)
  }

  let values: SensitivityValues | null
  try {
    values = normalizeValues(body.values)
  } catch (err) {
    return fail(BIZ_CODE.BAD_REQUEST, (err as Error).message)
  }
  if (!values) return fail(BIZ_CODE.BAD_REQUEST, '灵敏度数据格式不正确')

  const now = Date.now()
  const plan: SensitivityPlan = {
    id: uuid('s_'),
    userId: user.id,
    name,
    desc: (body.desc ?? '').trim(),
    values,
    weaponIds: body.weaponIds ?? [],
    builtin: false,
    createdAt: now,
    updatedAt: now,
  }

  return ok(insertRow(STORAGE_KEYS.SENSITIVITY, plan), '方案已保存')
}

/* ──────────────────────────────────────────────────────────────────────
 * PUT /sensitivity/plans/:id —— 更新
 * ────────────────────────────────────────────────────────────────────── */

export function handleUpdatePlan(
  params: Record<string, string>,
  body: SavePlanParams,
  header?: Record<string, string>,
): MockResponse {
  const user = resolveCurrentUser(header)
  if (!user) {
    return fail(BIZ_CODE.UNAUTHORIZED, '登录后才能修改灵敏度方案', 401)
  }

  const existing = findRow<SensitivityPlan>(
    STORAGE_KEYS.SENSITIVITY,
    (row) => row.id === params.id,
  )
  if (!existing) return fail(BIZ_CODE.NOT_FOUND, '方案不存在')
  if (existing.userId !== user.id) {
    // 越权访问返回 403 而不是 404：资源确实存在，只是不属于你。
    // 这个区分在多人协作场景下对排查问题很重要
    return fail(BIZ_CODE.FORBIDDEN, '无法修改他人的方案')
  }

  const patch: Partial<SensitivityPlan> = { updatedAt: Date.now() }

  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return fail(BIZ_CODE.BAD_REQUEST, '方案名不能为空')
    if (name.length > NAME_MAX_LENGTH) {
      return fail(BIZ_CODE.BAD_REQUEST, `方案名最多 ${NAME_MAX_LENGTH} 个字`)
    }
    patch.name = name
  }

  if (body.desc !== undefined) patch.desc = body.desc.trim()
  if (body.weaponIds !== undefined) patch.weaponIds = body.weaponIds

  if (body.values !== undefined) {
    try {
      const values = normalizeValues(body.values)
      if (!values) return fail(BIZ_CODE.BAD_REQUEST, '灵敏度数据格式不正确')
      patch.values = values
    } catch (err) {
      return fail(BIZ_CODE.BAD_REQUEST, (err as Error).message)
    }
  }

  const updated = updateRow<SensitivityPlan>(STORAGE_KEYS.SENSITIVITY, params.id, patch)
  return ok(updated, '方案已更新')
}

/* ──────────────────────────────────────────────────────────────────────
 * DELETE /sensitivity/plans/:id —— 删除
 * ────────────────────────────────────────────────────────────────────── */

export function handleDeletePlan(
  params: Record<string, string>,
  header?: Record<string, string>,
): MockResponse {
  const user = resolveCurrentUser(header)
  if (!user) {
    return fail(BIZ_CODE.UNAUTHORIZED, '登录后才能删除灵敏度方案', 401)
  }

  const existing = findRow<SensitivityPlan>(
    STORAGE_KEYS.SENSITIVITY,
    (row) => row.id === params.id,
  )
  if (!existing) return fail(BIZ_CODE.NOT_FOUND, '方案不存在')
  if (existing.userId !== user.id) {
    return fail(BIZ_CODE.FORBIDDEN, '无法删除他人的方案')
  }

  deleteRow(STORAGE_KEYS.SENSITIVITY, params.id)
  return ok({ id: params.id }, '已删除')
}

/* ──────────────────────────────────────────────────────────────────────
 * GET /sensitivity/recommend —— 按枪械推荐
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 为指定枪械挑一套推荐方案。
 *
 * 匹配规则：优先找 weaponIds 里包含该枪械的内置方案；
 * 找不到就回落到「通用均衡」。
 *
 * 不返回 null 而是永远给出一套：调用方拿到 null 还得决定「那显示什么」，
 * 而「不知道推荐什么时给通用方案」本来就是合理的业务结果。
 */
export function handleRecommendPlan(query: Record<string, string>): MockResponse {
  const weaponId = query.weaponId

  const matched = weaponId
    ? BUILTIN_PLANS.find((plan) => (plan.weaponIds as string[]).includes(weaponId))
    : undefined

  const fallback = BUILTIN_PLANS.find((plan) => plan.id === 'builtin-balanced')
  return ok(matched ?? fallback ?? null)
}
