import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { sensitivityApi } from '@/api'
import { STORAGE_KEYS } from '@/constants/storage'
import type { SavePlanParams, SensitivityPlan } from '@/types'

/**
 * 灵敏度方案 store
 * ══════════════════════════════════════════════════════════════════════
 * 这里只持久化**一个字段**：`activePlanId`。
 *
 * 方案列表本身不持久化——它来自接口，冷启动重新拉即可，
 * 持久化只会让「删掉的方案又出现在列表里」这种脏数据问题找上门。
 * 但「当前正在用哪套方案」是纯本地的用户选择，服务端不知道，
 * 不存的话用户每次打开都要重新选一次。
 *
 * 这也是本文件里唯一一处 `paths` 的用意：不持久化列表，
 * 只持久化那个选择。
 * ══════════════════════════════════════════════════════════════════════
 */
export const useSensitivityStore = defineStore(
  'sensitivity',
  () => {
    /* ── state ── */

    /** 全部可用方案（内置在前，我的在后） */
    const plans = ref<SensitivityPlan[]>([])

    /** 当前选中的方案 id。空串表示还没选过，界面应默认选第一套内置方案 */
    const activePlanId = ref('')

    const loading = ref(false)

    /**
     * 是否已经加载过。
     * 与记录 store 同理：用来区分「还没加载」和「加载完是空的」，
     * 避免页面在数据回来之前就渲染出空状态。
     */
    const loaded = ref(false)

    /* ── getters ── */

    /** 内置方案 */
    const builtinPlans = computed(() => plans.value.filter((plan) => plan.builtin))

    /** 我创建的方案 */
    const myPlans = computed(() => plans.value.filter((plan) => !plan.builtin))

    /**
     * 当前生效的方案。
     *
     * 三层兜底，任何一层都不返回 undefined：
     *   ① 用户选中的那套（前提是它还在列表里——可能已被删除）
     *   ② 列表里的第一套
     *   ③ null（列表为空时）
     * 页面拿到它就能直接渲染，不需要到处判空。
     */
    const activePlan = computed<SensitivityPlan | null>(() => {
      const selected = plans.value.find((plan) => plan.id === activePlanId.value)
      if (selected) return selected
      return plans.value[0] ?? null
    })

    const isEmpty = computed(() => loaded.value && plans.value.length === 0)

    /* ── actions ── */

    /** 拉取方案列表 */
    async function fetchPlans(): Promise<void> {
      loading.value = true
      try {
        plans.value = await sensitivityApi.list()
        loaded.value = true
      } finally {
        loading.value = false
      }
    }

    /** 选中一套方案 */
    function setActive(id: string): void {
      activePlanId.value = id
    }

    /**
     * 新建方案。
     * 创建后自动选中它——用户刚建完就想用，不该还要再点一下。
     */
    async function create(params: SavePlanParams): Promise<SensitivityPlan> {
      const plan = await sensitivityApi.create(params)
      plans.value = [...plans.value, plan]
      activePlanId.value = plan.id
      return plan
    }

    /**
     * 更新方案。
     *
     * 用返回的对象整体替换列表里的那一项，而不是把参数 patch 进去：
     * 服务端会更新 updatedAt、可能还会规整数值，本地自己拼会与服务端产生偏差。
     */
    async function update(id: string, params: SavePlanParams): Promise<SensitivityPlan> {
      const plan = await sensitivityApi.update(id, params)
      plans.value = plans.value.map((item) => (item.id === id ? plan : item))
      return plan
    }

    /**
     * 删除方案。
     *
     * 删掉的正好是当前选中的那套时，把选择清空——
     * activePlan 的兜底逻辑会自动落到第一套方案上，
     * 不会出现「选中的方案没了但界面还在显示它」的空窗。
     */
    async function remove(id: string): Promise<void> {
      await sensitivityApi.remove(id)
      plans.value = plans.value.filter((item) => item.id !== id)
      if (activePlanId.value === id) activePlanId.value = ''
    }

    /**
     * 导入方案（从分享码解析出来的数值）。
     *
     * 走的是「新建」接口——导入进来的方案对服务端来说就是一套新方案，
     * 没有理由为它单独开一个接口。
     */
    async function importPlan(params: SavePlanParams): Promise<SensitivityPlan> {
      return create(params)
    }

    /** 清空内存状态（登出时调用） */
    function reset(): void {
      plans.value = []
      activePlanId.value = ''
      loaded.value = false
    }

    return {
      plans,
      activePlanId,
      loading,
      loaded,
      builtinPlans,
      myPlans,
      activePlan,
      isEmpty,
      fetchPlans,
      setActive,
      create,
      update,
      remove,
      importPlan,
      reset,
    }
  },
  {
    persist: {
      key: STORAGE_KEYS.SENSITIVITY,
      // 只存「选了哪套」。方案数据本身不缓存，理由见文件头
      paths: ['activePlanId'],
    },
  },
)
