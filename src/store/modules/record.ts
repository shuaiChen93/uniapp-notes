import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { recordApi } from '@/api'
import type { SubmitRecordParams, TrainingRecord, TrainingStats, TrendPoint } from '@/types'

/**
 * 训练记录 store
 * ══════════════════════════════════════════════════════════════════════
 * ── 为什么这一份**不做持久化** ────────────────────────────────────────
 * 记录的真身在服务端（本项目中是 mock 的 storage 表），
 * store 里这份只是「当前页面正在展示的一页数据」。
 * 把它也持久化会带来两个问题：
 *   ① 用户删除记录后，下次冷启动会先看到一份缓存里的旧列表，
 *      再被接口数据替换——中间那一闪是实打实的数据不一致；
 *   ② 分页状态（第几页、还有没有更多）是典型的会话状态，
 *      持久化后恢复出来的页码往往对不上真实数据。
 * 因此这里只做内存缓存，冷启动一律重新拉取。
 *
 * ── 分页的约定 ────────────────────────────────────────────────────────
 * 用「累加式」分页（下拉刷新重置、上拉加载追加），而不是跳页。
 * 训练记录是流式浏览的内容，用户不会想跳到第 7 页，
 * 只会想「再看点更早的」。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 每页条数。与 mock 的默认值保持一致，避免出现「第一页 20 条、之后每页 10 条」 */
const PAGE_SIZE = 20

export const useRecordStore = defineStore('record', () => {
  /* ── state ── */

  /** 已加载的记录（累积） */
  const list = ref<TrainingRecord[]>([])

  /** 服务端报告的总条数，用于判断是否还有更多 */
  const total = ref(0)

  /** 当前已加载到第几页 */
  const page = ref(0)

  /** 首屏/刷新中的 loading。与「加载更多」分开，两者在界面上的表现不同 */
  const loading = ref(false)
  const loadingMore = ref(false)

  /** 统计概览 */
  const stats = ref<TrainingStats | null>(null)

  /** 分数趋势 */
  const trend = ref<TrendPoint[]>([])

  /**
   * 历史最佳记录。
   *
   * 与 stats.bestScore 的区别：那个只有一个分数，
   * 这个带完整配装，能回答「我打得最好的那一次用的是什么配置」——
   * 而这恰恰是用户最想复现的东西。
   */
  const best = ref<TrainingRecord | null>(null)

  /** 当前筛选的枪械。空串表示不筛选 */
  const filterWeaponId = ref('')

  /** 是否已经成功拉取过至少一次数据。用于区分「还没加载」和「加载完是空的」 */
  const loaded = ref(false)

  /* ── getters ── */

  /**
   * 是否还有更多。
   *
   * 用「已加载条数 vs 总数」判断，而不是「本次返回条数是否等于 pageSize」——
   * 后者在总数恰好是 pageSize 整数倍时会多请求一次空页，
   * 用户看到的是「上拉转了一下，什么都没出来」。
   */
  const hasMore = computed(() => list.value.length < total.value)

  /** 是否完全没有记录（且已经加载完）。页面据此显示空状态而不是骨架屏 */
  const isEmpty = computed(() => loaded.value && list.value.length === 0)

  /* ── actions ── */

  /**
   * 重置并加载第一页。
   *
   * @param silent 静默模式：不显示 loading 态。用于下拉刷新——
   *               下拉本身已经有原生的刷新动画，再叠一层 loading 会重复
   */
  async function refresh(silent = false): Promise<void> {
    if (!silent) loading.value = true

    try {
      const result = await recordApi.list({
        page: 1,
        pageSize: PAGE_SIZE,
        weaponId: filterWeaponId.value || undefined,
      })

      // 整体替换而不是追加：这是「第 1 页」，语义上就是全新的数据
      list.value = result.list
      total.value = result.total
      page.value = 1
      loaded.value = true
    } finally {
      // finally 而不是 catch：无论成功失败都要关掉 loading，
      // 否则一次网络错误会让界面永远卡在加载态
      if (!silent) loading.value = false
    }
  }

  /**
   * 加载下一页并追加。
   *
   * 已经在加载中或没有更多时直接返回——
   * 上拉加载会被滚动事件高频触发，没有这个守卫会瞬间发出几十个重复请求。
   */
  async function loadMore(): Promise<void> {
    if (loadingMore.value || loading.value || !hasMore.value) return

    loadingMore.value = true
    try {
      const next = page.value + 1
      const result = await recordApi.list({
        page: next,
        pageSize: PAGE_SIZE,
        weaponId: filterWeaponId.value || undefined,
      })

      // 追加前按 id 去重：用户可能在两次加载之间删除了一条记录，
      // 导致分页游标错位，同一个 id 出现在两页里。
      // 去重后即使游标错位，界面也不会出现重复项
      const existing = new Set(list.value.map((item) => item.id))
      const fresh = result.list.filter((item) => !existing.has(item.id))

      list.value = [...list.value, ...fresh]
      total.value = result.total
      page.value = next
    } finally {
      loadingMore.value = false
    }
  }

  /** 切换枪械筛选。会重置列表并重新拉第一页 */
  async function setFilter(weaponId: string): Promise<void> {
    if (filterWeaponId.value === weaponId) return
    filterWeaponId.value = weaponId
    // 筛选条件变了，旧的列表数据全部失效，先清空避免用户看到
    // 「筛选后的标题配着筛选前的数据」
    list.value = []
    page.value = 0
    // 最佳记录同样要跟着筛选条件走，两个请求之间没有依赖，并行发
    await Promise.all([refresh(), fetchBest()])
  }

  /** 拉取统计概览 */
  async function fetchStats(): Promise<void> {
    stats.value = await recordApi.stats()
  }

  /** 拉取分数趋势 */
  async function fetchTrend(limit?: number): Promise<void> {
    trend.value = await recordApi.trend(limit)
  }

  /**
   * 拉取历史最佳记录。
   *
   * 没练过时服务端返回 null，这是**正常状态**而不是错误，
   * 界面据此显示空状态。带筛选条件：用户想看的是「M416 的最佳」，
   * 而不是「所有枪混在一起的最佳」。
   */
  async function fetchBest(): Promise<void> {
    best.value = await recordApi.best(filterWeaponId.value || undefined)
  }

  /**
   * 拉取记录页需要的全部数据。
   *
   * 四个请求并行发出而不是串行 await：它们之间没有依赖，
   * 串行会让首屏时间变成四者之和。记录页的骨架屏会一直转，
   * 而实际上四个请求本可以同时飞。
   */
  async function fetchAll(): Promise<void> {
    await Promise.all([refresh(), fetchStats(), fetchTrend(), fetchBest()])
  }

  /**
   * 提交一次训练成绩。
   *
   * 成功后就地插入列表头部，而不是重新拉第一页——
   * 重新拉会让用户刚看到的列表整体闪一下。
   * 但统计与趋势是聚合数据，无法在本地增量更新（平均值、最高分
   * 都要重算，而且服务端可能做了额外处理），只能重新拉取。
   */
  async function submit(params: SubmitRecordParams): Promise<TrainingRecord> {
    const record = await recordApi.submit(params)

    list.value = [record, ...list.value]
    total.value += 1

    // 并行刷新聚合数据，失败也不影响已经保存成功的成绩
    await Promise.allSettled([fetchStats(), fetchTrend(), fetchBest()])

    return record
  }

  /**
   * 删除一条记录。
   *
   * 先调接口再改本地，不做「乐观删除」：删除失败时若已经把
   * 那一行从界面上抹掉了，用户会以为删成功了，重进页面它又回来了——
   * 这种「复活」比删除时多等 200ms 更让人困惑。
   */
  async function remove(id: string): Promise<void> {
    await recordApi.remove(id)

    list.value = list.value.filter((item) => item.id !== id)
    total.value = Math.max(0, total.value - 1)

    // 删掉的正好是最高分那一条时，最佳记录必须跟着变
    await Promise.allSettled([fetchStats(), fetchTrend(), fetchBest()])
  }

  /**
   * 清空内存状态。
   *
   * 用户登出时调用。不清的话，换个账号进来会先看到上一个账号的记录，
   * 直到新数据拉回来才被替换——这段时间里展示的是别人的数据。
   */
  function reset(): void {
    list.value = []
    total.value = 0
    page.value = 0
    stats.value = null
    trend.value = []
    best.value = null
    filterWeaponId.value = ''
    loaded.value = false
  }

  return {
    list,
    total,
    page,
    loading,
    loadingMore,
    stats,
    trend,
    best,
    filterWeaponId,
    loaded,
    hasMore,
    isEmpty,
    refresh,
    loadMore,
    setFilter,
    fetchStats,
    fetchTrend,
    fetchBest,
    fetchAll,
    submit,
    remove,
    reset,
  }
})
