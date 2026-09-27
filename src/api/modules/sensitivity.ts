import type { SavePlanParams, SensitivityPlan } from '@/types'
import { request } from '@/utils/request'
import { buildQuery } from '../helpers'

/**
 * 灵敏度方案接口
 * ══════════════════════════════════════════════════════════════════════
 * 方案的增删改**必须登录**（服务端会返回 401）：
 * 方案要归属到具体账号才能区分「我的」和「别人的」，
 * 而这与训练记录不同——记录允许游客提交，因为它是设备数据。
 *
 * 这里不做任何"未登录就本地暂存"的兜底：那会让用户以为保存成功了，
 * 换台设备却发现方案没了。直接让请求失败并提示登录，是更诚实的行为。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 获取全部可用方案（内置 + 我的） */
export function list() {
  return request<SensitivityPlan[]>({
    url: '/sensitivity/plans',
    method: 'GET',
  })
}

/** 新建方案 */
export function create(params: SavePlanParams) {
  return request<SensitivityPlan>({
    url: '/sensitivity/plans',
    method: 'POST',
    data: { ...params },
    showLoading: true,
    loadingText: '保存中',
  })
}

/**
 * 更新方案。
 *
 * id 走路径而不是放进 body：这是 REST 的标准做法，
 * 也让「改的是哪个资源」在请求行上就一目了然。
 * 注意 id 要 encodeURIComponent —— 方案 id 由 uuid 生成，
 * 当前不含特殊字符，但这里不该依赖那个巧合。
 */
export function update(id: string, params: SavePlanParams) {
  return request<SensitivityPlan>({
    url: `/sensitivity/plans/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: { ...params },
    showLoading: true,
    loadingText: '保存中',
  })
}

/** 删除方案 */
export function remove(id: string) {
  return request<{ id: string }>({
    url: `/sensitivity/plans/${encodeURIComponent(id)}`,
    method: 'DELETE',
    showLoading: true,
    loadingText: '删除中',
  })
}

/** 按枪械获取推荐方案 */
export function recommend(weaponId?: string) {
  return request<SensitivityPlan | null>({
    url: `/sensitivity/recommend${buildQuery({ weaponId })}`,
    method: 'GET',
  })
}
