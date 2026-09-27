<template>
  <x-page-shell title="训练记录">
    <!-- ── 概览 ── -->
    <x-stat-grid :items="overviewStats" />

    <!-- ── 趋势 ── -->
    <view class="mt-3">
      <x-bar-chart :points="trendPoints" title="成绩趋势" />
    </view>

    <!--
      ── 最佳记录 ───────────────────────────────────────────────────────
      和趋势图上的金色柱是同一件事的两种表达：图给的是「什么时候」，
      这张卡片给的是「怎么打的」。用户的下一步动作通常是去复现它，
      所以配装信息比分数本身更重要。
    -->
    <view v-if="best" class="mt-3 rounded-panel bg-bg-card p-4">
      <view class="flex items-center justify-between">
        <text class="text-sm text-content-secondary">最佳记录</text>
        <text class="text-2xs text-content-muted">
          {{ formatRelativeTime(best.createdAt) }}
        </text>
      </view>

      <view class="mt-3 flex items-center">
        <x-rating-badge :rating="best.rating" size="md" />
        <view class="ml-3 flex-1">
          <view class="flex items-baseline">
            <text class="text-xl font-medium text-rating-s">{{ best.score }}</text>
            <text class="ml-1 text-2xs text-content-muted">分</text>
          </view>
          <text class="mt-0.5 block text-2xs text-content-muted">
            {{ describeLoadout(best.loadout) }}
          </text>
        </view>
      </view>
    </view>

    <!--
      ── 枪械筛选 ───────────────────────────────────────────────────────
      横向滚动而不是换行铺开：枪械会随版本增加，
      换行的话每加一把枪整个页面就要往下挪一行，列表被越推越远。
      scroll-view 的 scroll-x 在小程序里要求子元素是 inline-block，
      不能靠 flex（那需要额外的 enable-flex 属性，H5 端又不认）。
    -->
    <scroll-view scroll-x class="mt-4 w-full whitespace-nowrap">
      <view
        v-for="option in filterOptions"
        :key="option.id"
        class="mr-2 inline-block rounded-card border-2 px-3 py-1.5"
        :class="
          recordStore.filterWeaponId === option.id
            ? 'border-brand bg-bg-elevated'
            : 'border-transparent bg-bg-card'
        "
        @click="handleFilter(option.id)"
      >
        <text
          class="text-xs"
          :class="
            recordStore.filterWeaponId === option.id ? 'text-brand' : 'text-content-secondary'
          "
        >
          {{ option.name }}
        </text>
      </view>
    </scroll-view>

    <!-- ── 列表 ── -->
    <view v-if="recordStore.list.length > 0" class="mt-3">
      <view
        v-for="record in recordStore.list"
        :key="record.id"
        class="mb-2 rounded-panel bg-bg-card p-3.5 active:bg-bg-elevated"
        @longpress="handleDelete(record)"
      >
        <view class="flex items-center">
          <x-rating-badge :rating="record.rating" size="md" />

          <view class="ml-3 flex-1">
            <view class="flex items-baseline">
              <text class="text-lg font-medium text-content-primary">{{ record.score }}</text>
              <text class="ml-1 text-2xs text-content-muted">分</text>
            </view>
            <text class="mt-0.5 block text-2xs text-content-muted">
              {{ describeLoadout(record.loadout) }}
            </text>
          </view>

          <view class="items-end">
            <text class="text-2xs text-content-muted">
              {{ formatRelativeTime(record.createdAt) }}
            </text>
            <text class="mt-1 block text-right text-2xs text-content-muted">
              垂 {{ record.verticalStability }} · 水 {{ record.horizontalStability }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- ── 首屏加载中 ── -->
    <view v-else-if="recordStore.loading" class="py-16">
      <text class="block text-center text-xs text-content-muted">正在加载…</text>
    </view>

    <!-- ── 空状态 ── -->
    <x-empty-state
      v-else-if="recordStore.isEmpty"
      icon="◎"
      :title="emptyTitle"
      desc="完成一次压枪测试后，成绩会自动记录在这里"
      action-text="去训练"
      @action="goTraining"
    />

    <!-- ── 触底状态 ── -->
    <view v-if="recordStore.list.length > 0" class="py-5">
      <text v-if="recordStore.loadingMore" class="block text-center text-xs text-content-muted">
        正在加载更多…
      </text>
      <text v-else-if="!recordStore.hasMore" class="block text-center text-2xs text-content-muted">
        共 {{ recordStore.total }} 条记录 · 长按可删除
      </text>
    </view>
  </x-page-shell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { onPullDownRefresh, onReachBottom, onShow } from '@dcloudio/uni-app'
import { describeLoadout, WEAPONS } from '@/constants/weapon'
import { useRecordStore } from '@/store'
import { formatCompactDuration, formatRelativeTime, formatShortDate } from '@/utils/format'
import type { TrainingRecord } from '@/types'
import type { ChartPoint } from '@/components/x-bar-chart/x-bar-chart.vue'
import type { StatItem } from '@/components/x-stat-grid/x-stat-grid.vue'

/**
 * 训练记录页
 * ══════════════════════════════════════════════════════════════════════
 * 本页只做展示与转发，所有数据都从 recordStore 取，
 * 包括分页、筛选、统计——页面里没有任何一处自己算聚合值。
 *
 * ── 列表用页面滚动而不是 scroll-view ──────────────────────────────────
 * 记录页的内容是「固定头部 + 无限长的列表」，正适合页面自身的滚动。
 * 用 scroll-view 反而要手动算高度（100vh 减去头部），
 * 还得禁掉页面滚动避免出现两层滚动条。onReachBottom 也只有页面滚动才有。
 *
 * ⚠️ 必须调用 uni.stopPullDownRefresh()，否则下拉 Loading 会一直转
 * （小程序端不会自动收起，H5 端表现为页面卡在刷新态）。
 * ══════════════════════════════════════════════════════════════════════
 */

const recordStore = useRecordStore()

onShow(() => {
  // 只在从未成功加载过时拉取。练完一次回到本页时 store 已经是最新的
  // （submit 内部刷新过聚合数据），再拉一遍纯属浪费
  if (!recordStore.loaded) {
    recordStore.fetchAll()
  }
})

onPullDownRefresh(async () => {
  try {
    await recordStore.fetchAll()
  } finally {
    // finally 而不是成功后才调：请求失败时下拉动画同样必须收起来，
    // 否则页面会永远停在「正在刷新」
    uni.stopPullDownRefresh()
  }
})

onReachBottom(() => {
  // store 内部有 loadingMore / hasMore 守卫，连续触发不会打出重复请求
  recordStore.loadMore()
})

/* ── 概览 ── */

const overviewStats = computed<StatItem[]>(() => {
  const stats = recordStore.stats
  const hasData = !!stats && stats.totalSessions > 0
  const duration = formatCompactDuration(stats?.totalDuration ?? 0)

  return [
    { label: '总场次', value: hasData ? stats.totalSessions : '--' },
    {
      label: '最佳',
      value: hasData ? stats.bestScore : '--',
      unit: hasData ? '分' : '',
      highlight: true,
    },
    {
      label: '平均',
      value: hasData ? stats.averageScore : '--',
      unit: hasData ? '分' : '',
    },
    {
      label: '累计',
      value: hasData ? duration.value : '--',
      unit: hasData ? duration.unit : '',
    },
  ]
})

/* ── 趋势 ── */

const trendPoints = computed<ChartPoint[]>(() => {
  const points = recordStore.trend
  if (points.length === 0) return []

  // 最高分可能有多个（并列），全部标金色——
  // 只标第一个的话，用户会以为后来的那个更高
  const top = Math.max(...points.map((point) => point.score))

  return points.map((point) => ({
    label: formatShortDate(point.createdAt),
    value: point.score,
    isBest: point.score === top,
  }))
})

/* ── 最佳记录 ── */

const best = computed(() => recordStore.best)

/* ── 筛选 ── */

/**
 * 筛选项。第一项是「全部」，用空串而不是 'all' 之类的魔法值——
 * store 里的 filterWeaponId 用的就是空串表示不筛选，
 * 这里保持一致，中间不需要任何转换。
 */
const filterOptions = [
  { id: '', name: '全部' },
  ...WEAPONS.map((weapon) => ({ id: weapon.id as string, name: weapon.name })),
]

function handleFilter(weaponId: string): void {
  // store 内部也做了同样的判断，这里提前返回只是为了避免
  // 重复点击当前项时触发一次多余的列表清空
  if (recordStore.filterWeaponId === weaponId) return
  recordStore.setFilter(weaponId)
}

const emptyTitle = computed(() =>
  recordStore.filterWeaponId ? '这把枪还没有记录' : '还没有训练记录',
)

/* ── 交互 ── */

function goTraining(): void {
  // 记录页与压枪页都是 tabBar 页面
  uni.switchTab({ url: '/pages/recoil/index' })
}

/**
 * 删除一条记录。
 *
 * 用长按而不是左滑：左滑删除要引入 movable-view 自己做手势与动画，
 * 而这条删除路径的使用频率极低（误存的记录才有必要删）。
 * 长按 + 二次确认的成本更低，也不容易在看列表时误触。
 *
 * 确认框必须写清楚「删的是哪一条」——列表里每条长得都一样，
 * 只说「确定删除吗」用户没法确认自己长按的是不是想删的那条。
 */
function handleDelete(record: TrainingRecord): void {
  uni.showModal({
    title: '删除记录',
    content: `确定删除这次 ${record.score} 分的成绩吗？删除后无法恢复`,
    confirmText: '删除',
    confirmColor: '#EF4444',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await recordStore.remove(record.id)
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch {
        // 请求层已经弹过错误提示，这里不再重复弹
      }
    },
  })
}
</script>
