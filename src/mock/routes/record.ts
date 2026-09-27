import { BIZ_CODE } from '@/constants/http'
import { STORAGE_KEYS } from '@/constants/storage'
import type {
  PageResult,
  SubmitRecordParams,
  TrainingRecord,
  TrainingStats,
  TrendPoint,
} from '@/types'
import { uuid } from '@/utils/id'
import { deleteRow, findRow, insertRow, selectAll } from '../db'
import { fail, ok, type MockResponse } from '../utils'
import { resolveCurrentUser } from './auth'

/**
 * Mock：训练记录
 * ══════════════════════════════════════════════════════════════════════
 * ── 一个刻意的设计决定：记录按「设备」存，不按「账号」存 ────────────────
 *
 * 每行记录里确实写了 userId，但**查询时不做过滤**，任何人都能读到本机
 * 的全部记录。这与真实后端的行为不同，是有意为之：
 *
 *   本项目的记录是「设备上的训练数据」，不是「账号资产」。
 *   用户练了 20 局之后才登录，如果登录瞬间历史记录全空，
 *   他只会认为「数据丢了」。而单机场景下不存在「多用户共用一台设备」
 *   的真实困扰——storage 本来就是这台设备的。
 *
 * 真实后端接入时，这里要改成按 userId 过滤，前端页面无需改动：
 * 列表、统计、趋势都是按接口返回的原样渲染，不含任何本地过滤逻辑。
 *
 * ── 记录是只增不改的 ──────────────────────────────────────────────────
 * 除了删除，不提供任何修改接口。成绩一旦提交就是历史事实，
 * 允许修改会让排行榜失去意义。这个约束由接口本身保证，
 * 而不是靠调用方自觉。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 单条成绩的合理区间，用于挡掉明显异常的数据 */
const SCORE_MIN = 0
const SCORE_MAX = 100

/**
 * 列表默认分页大小。
 *
 * 比常见的 10 大：训练记录是卡片式展示，一条只有两行字，
 * 一屏能放下 6~8 条。给 10 的话用户划两下就见底，
 * 频繁触发加载更多反而更卡。
 */
const DEFAULT_PAGE_SIZE = 20

/** 趋势图最多取多少个点 */
const TREND_LIMIT = 20

/** 把请求里的字符串参数安全地转成整数 */
function toInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isFinite(value) ? Math.floor(value) : fallback
}

/* ──────────────────────────────────────────────────────────────────────
 * POST /records —— 提交一次训练成绩
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 提交成绩。
 *
 * ⚠️ 服务端**不重算分数**，只做合法性校验。
 *
 * 这在真实项目里是不安全的：客户端算分意味着用户改几个数就能刷榜。
 * 正确做法是把原始轨迹上传，由服务端重跑一遍算法。
 * 但本项目的训练全靠本地采样，轨迹数据量很大（5 秒 50+ 个点），
 * 又完全没有反作弊需求，因此选择只校验范围。
 *
 * 这个取舍必须在注释里写清楚——否则后来者会以为「服务端信客户端」
 * 是本项目的架构决策，而不是一个明确知道风险的简化。
 */
export function handleSubmitRecord(
  body: SubmitRecordParams,
  header?: Record<string, string>,
): MockResponse {
  if (!body?.loadout?.weaponId) {
    return fail(BIZ_CODE.BAD_REQUEST, '缺少配装信息')
  }

  const score = Number(body.score)
  if (!Number.isFinite(score) || score < SCORE_MIN || score > SCORE_MAX) {
    return fail(BIZ_CODE.BAD_REQUEST, '成绩不在合法区间内')
  }

  // 未登录也能提交：游客照样可以训练，只是记录上不归属任何账号
  const user = resolveCurrentUser(header)

  const record: TrainingRecord = {
    id: uuid('r_'),
    userId: user?.id ?? '',
    createdAt: Date.now(),
    loadout: body.loadout,
    score: Math.round(score),
    rating: body.rating,
    verticalOffset: Number(body.verticalOffset) || 0,
    horizontalOffset: Number(body.horizontalOffset) || 0,
    verticalStability: Number(body.verticalStability) || 0,
    horizontalStability: Number(body.horizontalStability) || 0,
    shotsFired: Number(body.shotsFired) || 0,
    hitRate: Number(body.hitRate) || 0,
    duration: Number(body.duration) || 0,
  }

  return ok(insertRow(STORAGE_KEYS.RECORDS, record), '成绩已保存')
}

/* ──────────────────────────────────────────────────────────────────────
 * GET /records —— 分页列表
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 记录列表。
 *
 * 按时间**倒序**（最新的在最前）——这是所有「历史记录」类列表的默认约定，
 * 用户关心的是刚打完那局，不是三个月前那局。
 */
export function handleListRecords(query: Record<string, string>): MockResponse {
  const page = Math.max(1, toInt(query.page, 1))
  const pageSize = Math.max(1, toInt(query.pageSize, DEFAULT_PAGE_SIZE))
  const weaponId = query.weaponId

  let rows = selectAll<TrainingRecord>(STORAGE_KEYS.RECORDS)

  // 按枪械筛选。用 filter 而不是在分页之后筛——
  // 否则会出现「第一页只有 3 条但 total 显示 50」的矛盾
  if (weaponId) {
    rows = rows.filter((row) => row.loadout?.weaponId === weaponId)
  }

  rows.sort((a, b) => b.createdAt - a.createdAt)

  const total = rows.length
  const start = (page - 1) * pageSize
  // slice 越界时返回空数组，不需要额外判断
  const list = rows.slice(start, start + pageSize)

  const result: PageResult<TrainingRecord> = { list, total, page, pageSize }
  return ok(result)
}

/* ──────────────────────────────────────────────────────────────────────
 * GET /records/stats —— 统计概览
 * ────────────────────────────────────────────────────────────────────── */

/** 计算统计概览。抽成函数是为了让「记录为空」这个边界只处理一次 */
function buildStats(rows: TrainingRecord[]): TrainingStats {
  if (rows.length === 0) {
    // 全零而不是 null：调用方拿到的是一个结构完整的对象，
    // 不需要在每个使用处都判空。界面显示 -- 是渲染层的事
    return {
      totalSessions: 0,
      bestScore: 0,
      averageScore: 0,
      averageOffset: 0,
      totalDuration: 0,
      lastTrainedAt: 0,
    }
  }

  let scoreSum = 0
  let offsetSum = 0
  let durationSum = 0
  let bestScore = 0
  let lastTrainedAt = 0

  for (const row of rows) {
    scoreSum += row.score
    // 偏移用「垂直 + 水平」的合偏移：单独看某一个都不足以反映整体压枪水平
    offsetSum += Math.abs(row.verticalOffset) + Math.abs(row.horizontalOffset)
    durationSum += row.duration
    if (row.score > bestScore) bestScore = row.score
    if (row.createdAt > lastTrainedAt) lastTrainedAt = row.createdAt
  }

  return {
    totalSessions: rows.length,
    bestScore,
    averageScore: Math.round(scoreSum / rows.length),
    // 保留一位小数：偏移量本身是像素级的，取整会把 0.4 和 0.6 抹成同一个值
    averageOffset: Number((offsetSum / rows.length).toFixed(1)),
    totalDuration: durationSum,
    lastTrainedAt,
  }
}

export function handleRecordStats(): MockResponse {
  const rows = selectAll<TrainingRecord>(STORAGE_KEYS.RECORDS)
  return ok(buildStats(rows))
}

/* ──────────────────────────────────────────────────────────────────────
 * GET /records/trend —— 趋势数据
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 分数趋势。
 *
 * 返回**时间升序**（最早的在前），与列表的倒序相反——
 * 趋势图是「从左到右」画的，交给图表的数据必须已经是绘制顺序。
 * 让接口返回正确的顺序，而不是让每个使用它的地方各排一次。
 */
export function handleRecordTrend(query: Record<string, string>): MockResponse {
  const limit = Math.max(1, toInt(query.limit, TREND_LIMIT))

  const rows = selectAll<TrainingRecord>(STORAGE_KEYS.RECORDS)
  rows.sort((a, b) => b.createdAt - a.createdAt)

  // 先按倒序取最近的 N 条，再翻回升序——
  // 反过来（先升序再取前 N）拿到的是「最早的 N 条」，正好取反
  const recent = rows.slice(0, limit).reverse()

  const points: TrendPoint[] = recent.map((row) => ({
    createdAt: row.createdAt,
    score: row.score,
  }))

  return ok(points)
}

/* ──────────────────────────────────────────────────────────────────────
 * GET /records/best —— 最佳记录
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 历史最高分的那一条。
 *
 * 没练过时返回 null 而不是 404：这是「查询结果为空」，
 * 不是「请求的资源不存在」。用 404 会让前端的错误提示逻辑误判。
 */
export function handleBestRecord(query: Record<string, string>): MockResponse {
  const weaponId = query.weaponId

  let rows = selectAll<TrainingRecord>(STORAGE_KEYS.RECORDS)
  if (weaponId) {
    rows = rows.filter((row) => row.loadout?.weaponId === weaponId)
  }

  if (rows.length === 0) return ok(null)

  const best = rows.reduce((prev, curr) => (curr.score > prev.score ? curr : prev))
  return ok(best)
}

/* ──────────────────────────────────────────────────────────────────────
 * DELETE /records/:id —— 删除一条记录
 * ────────────────────────────────────────────────────────────────────── */

export function handleDeleteRecord(params: Record<string, string>): MockResponse {
  const id = params.id
  if (!id) return fail(BIZ_CODE.BAD_REQUEST, '缺少记录 id')

  // 先确认存在再删：deleteRow 用返回值表达结果，但前端需要区分
  // 「删掉了」和「这条本来就没了」——后者通常意味着列表已经过期，
  // 应该提示用户刷新而不是报成功
  const existed = findRow<TrainingRecord>(STORAGE_KEYS.RECORDS, (row) => row.id === id)
  if (!existed) {
    return fail(BIZ_CODE.NOT_FOUND, '记录不存在或已被删除')
  }

  deleteRow(STORAGE_KEYS.RECORDS, id)
  return ok({ id }, '已删除')
}
