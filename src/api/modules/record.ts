import type {
  PageResult,
  RecordQuery,
  SubmitRecordParams,
  TrainingRecord,
  TrainingStats,
  TrendPoint,
} from '@/types'
import { request } from '@/utils/request'
import { buildQuery } from '../helpers'

/**
 * 训练记录相关接口
 * ══════════════════════════════════════════════════════════════════════
 * 与其他模块一样，这一层只声明「接口地址 + 参数 + 返回类型」，
 * 不含任何业务流程。页面拿到数据后怎么展示、存不存 store，
 * 都由调用方决定。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 提交一次训练成绩 */
export function submit(params: SubmitRecordParams) {
  return request<TrainingRecord>({
    url: '/records',
    method: 'POST',
    data: { ...params },
    // 不弹 loading：成绩提交发生在训练结束的结果页，
    // 此时界面上已经有一个"保存中"的状态，再叠一层全屏遮罩会显得很重
    showLoading: false,
  })
}

/**
 * 分页查询训练记录。
 *
 * 默认按时间倒序（服务端保证），调用方不需要也不能指定排序方向——
 * 记录页只有一个排序维度，把它做成参数只会让接口更难用。
 */
export function list(query: RecordQuery = {}) {
  return request<PageResult<TrainingRecord>>({
    url: `/records${buildQuery({
      page: query.page,
      pageSize: query.pageSize,
      weaponId: query.weaponId,
    })}`,
    method: 'GET',
  })
}

/** 统计概览：总次数、最高分、平均分、平均偏移、累计时长 */
export function stats() {
  return request<TrainingStats>({
    url: '/records/stats',
    method: 'GET',
  })
}

/**
 * 分数趋势。
 *
 * @param limit 取最近多少条。不传则由服务端决定（当前是 20）
 */
export function trend(limit?: number) {
  return request<TrendPoint[]>({
    url: `/records/trend${buildQuery({ limit })}`,
    method: 'GET',
  })
}

/**
 * 历史最佳记录。
 *
 * 返回类型带 null：没练过的时候服务端返回 null（而不是 404），
 * 调用方必须显式处理"还没有记录"这个正常状态。
 * 把 null 写进类型里，是为了让忘记处理它的人**在编译期**就被拦住。
 */
export function best(weaponId?: string) {
  return request<TrainingRecord | null>({
    url: `/records/best${buildQuery({ weaponId })}`,
    method: 'GET',
  })
}

/** 删除一条记录 */
export function remove(id: string) {
  return request<{ id: string }>({
    url: `/records/${encodeURIComponent(id)}`,
    method: 'DELETE',
    showLoading: true,
    loadingText: '删除中',
  })
}
