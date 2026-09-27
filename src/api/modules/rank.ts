import type { RankQuery, RankResult } from '@/types'
import { request } from '@/utils/request'
import { buildQuery } from '../helpers'

/**
 * 排行榜接口
 * ══════════════════════════════════════════════════════════════════════
 * ⚠️ 当前数据由 mock 用确定性算法生成，详见 src/mock/routes/rank.ts。
 * 接入真实后端时这一层不需要任何改动——接口契约是照着
 * 「后端能提供什么」来设计的，而不是照着本地 mock 能造什么。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 获取榜单。
 *
 * 不弹 loading：榜单页有自己的骨架屏/空状态，
 * 全屏遮罩会把用户正在看的上一份数据也盖住，体验反而更差。
 */
export function getRank(query: RankQuery = {}) {
  return request<RankResult>({
    url: `/rank${buildQuery({ type: query.type, limit: query.limit })}`,
    method: 'GET',
  })
}
