<template>
  <x-page-shell title="压枪训练助手">
    <!--
      ── 主入口 ─────────────────────────────────────────────────────────
      首页只应该有一个视觉重心。「开始训练」用整块品牌色卡片，
      其余内容都是它的注脚——用户打开应用的第一件事就是练，
      不该在一堆等权重的入口里做选择。
    -->
    <view class="rounded-panel bg-brand p-5 active:opacity-90" @click="startTraining()">
      <text class="text-lg font-medium text-white">开始压枪训练</text>
      <text class="mt-1 block text-xs text-white opacity-80">{{ planHint }}</text>

      <view class="mt-5 flex items-center justify-between">
        <text class="text-2xs text-white opacity-70">按住射击 · 下滑压枪 · 即时评分</text>
        <text class="text-sm text-white">开始 ›</text>
      </view>
    </view>

    <!-- ── 训练概览 ── -->
    <view class="mt-5">
      <view class="mb-2 flex items-center justify-between">
        <text class="text-sm text-content-secondary">训练概览</text>
        <text class="text-xs text-content-muted" @click="goRecord()">全部记录 ›</text>
      </view>
      <x-stat-grid :items="overviewStats" />
    </view>

    <!--
      ── 最近成绩 ───────────────────────────────────────────────────────
      只在练过之后才出现。新用户看到的第一屏是「开始训练 + 空概览」，
      而不是一张写着「暂无数据」的卡片——后者除了占位置没有任何信息量。
    -->
    <view v-if="latest" class="mt-5">
      <text class="text-sm text-content-secondary">最近成绩</text>
      <view class="mt-2 rounded-panel bg-bg-card p-4 active:bg-bg-elevated" @click="goRecord()">
        <view class="flex items-center">
          <x-rating-badge :rating="latest.rating" size="md" />

          <view class="ml-3 flex-1">
            <view class="flex items-baseline">
              <text class="text-xl font-medium text-content-primary">{{ latest.score }}</text>
              <text class="ml-1 text-2xs text-content-muted">分</text>
            </view>
            <text class="mt-0.5 block text-2xs text-content-muted">
              {{ describeLoadout(latest.loadout) }}
            </text>
          </view>

          <text class="text-2xs text-content-muted">{{ latestTime }}</text>
        </view>
      </view>
    </view>

    <!-- ── 当前灵敏度方案 ── -->
    <view class="mt-5">
      <text class="text-sm text-content-secondary">当前灵敏度方案</text>
      <view
        class="mt-2 rounded-panel bg-bg-card p-4 active:bg-bg-elevated"
        @click="goSensitivity()"
      >
        <view class="flex items-center justify-between">
          <text class="text-base text-content-primary">{{ planName }}</text>
          <text class="text-xs text-brand">调整 ›</text>
        </view>

        <!--
          只露出四倍镜这一格的值作为示例。
          灵敏度是一张 3×6 的表，全铺出来首页会被 18 个数字淹掉；
          而一个代表性的数字能传达「这里有东西可调」就够了。
        -->
        <text class="mt-1.5 block text-2xs text-content-muted">
          开火镜头 · 4 倍 = {{ planSample }}
        </text>
      </view>
    </view>

    <!-- ── 其它入口 ── -->
    <view class="mt-5 overflow-hidden rounded-panel bg-bg-card">
      <view
        v-for="(entry, index) in entries"
        :key="entry.path"
        class="flex items-center px-4 py-3.5 active:bg-bg-elevated"
        :class="{ 'border-t border-bg-elevated': index > 0 }"
        @click="goPage(entry.path)"
      >
        <text class="flex-1 text-base text-content-primary">{{ entry.label }}</text>
        <text class="text-xs text-content-muted">{{ entry.desc }}</text>
      </view>
    </view>

    <text class="mt-6 block text-center text-2xs text-content-muted">
      每天十分钟，压枪稳如老狗
    </text>
  </x-page-shell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { describeLoadout } from '@/constants/weapon'
import { getFiringSensitivity } from '@/constants/sensitivity'
import { useRecordStore, useSensitivityStore } from '@/store'
import { formatRelativeTime } from '@/utils/format'
import type { StatItem } from '@/components/x-stat-grid/x-stat-grid.vue'

/**
 * 首页
 * ══════════════════════════════════════════════════════════════════════
 * ── 这一页的职责边界 ──────────────────────────────────────────────────
 * 首页**不做任何计算**，只负责把 store 里已经算好的东西摆出来。
 * 概览数字来自 recordStore.stats（服务端算的），
 * 最近成绩来自 recordStore.list[0]，灵敏度来自 sensitivityStore.activePlan。
 * 一旦首页开始自己算（比如「今天练了几次」），就会出现与记录页不一致的口径——
 * 这类分歧在用户眼里就是数据错误。
 *
 * ── 为什么用 onShow 而不是 onMounted ──────────────────────────────────
 * 首页是 tabBar 页，创建后一直存活。用 onMounted 的话，
 * 用户练完一次切回首页看到的还是进应用时那份旧数据。
 * ══════════════════════════════════════════════════════════════════════
 */

const recordStore = useRecordStore()
const sensitivityStore = useSensitivityStore()

onShow(() => {
  /**
   * 只在「从没成功加载过」时才拉记录。
   *
   * 不每次 onShow 都拉：训练结束时的 submit 已经把 stats 和列表更新过了，
   * 再拉一次纯属重复请求。而 loaded 为 false 时（首启动、或上次请求失败）
   * 才需要真正去取数据。
   */
  if (!recordStore.loaded) {
    recordStore.refresh()
    recordStore.fetchStats()
  }

  // 灵敏度方案可能在分包页里被改过，store 里的 loaded 标记会拦住重复请求
  if (!sensitivityStore.loaded) {
    sensitivityStore.fetchPlans()
  }
})

/* ── 概览 ── */

const overviewStats = computed<StatItem[]>(() => {
  const stats = recordStore.stats

  return [
    {
      label: '训练场次',
      value: stats ? stats.totalSessions : '--',
    },
    {
      label: '最佳成绩',
      // 没练过时 bestScore 是 0，显示成「0 分」会让人以为是考了零分，
      // 用 -- 表示「还没有数据」更准确
      value: stats && stats.bestScore > 0 ? stats.bestScore : '--',
      unit: stats && stats.bestScore > 0 ? '分' : '',
      highlight: true,
    },
    {
      label: '平均偏移',
      value: stats && stats.totalSessions > 0 ? stats.averageOffset.toFixed(1) : '--',
      unit: stats && stats.totalSessions > 0 ? 'px' : '',
    },
  ]
})

/* ── 最近成绩 ── */

const latest = computed(() => recordStore.list[0] ?? null)

const latestTime = computed(() =>
  latest.value ? formatRelativeTime(latest.value.createdAt) : '',
)

/* ── 灵敏度 ── */

const planName = computed(() => sensitivityStore.activePlan?.name ?? '暂无方案')

const planSample = computed(() =>
  getFiringSensitivity(sensitivityStore.activePlan, '4x'),
)

/** 主入口卡片上的副标题 */
const planHint = computed(() => {
  const plan = sensitivityStore.activePlan
  return plan ? `当前方案 · ${plan.name}` : '还没有灵敏度方案，先用默认参数开练'
})

/* ── 入口 ── */

/** 只有「设置」这一类不在首页露出——它属于配置，不属于训练链路 */
const entries = [
  { label: '灵敏度方案', desc: '保存 / 推荐 / 导入导出', path: '/pages-sub/sensitivity/index' },
  { label: '训练记录', desc: '趋势与最佳', path: '/pages/record/index' },
  { label: '设置', desc: '震动、音效、缓存', path: '/pages-sub/settings/index' },
]

/**
 * 开始训练。
 *
 * 压枪测试是 tabBar 页面，必须用 switchTab —— 用 navigateTo 不会报错，
 * 只是「点了没反应」，是 uni-app 里最典型的静默失败之一。
 */
function startTraining(): void {
  uni.switchTab({ url: '/pages/recoil/index' })
}

/** 训练记录同样是 tabBar 页 */
function goRecord(): void {
  uni.switchTab({ url: '/pages/record/index' })
}

/** 其余入口都在分包里，走 navigateTo */
function goPage(path: string): void {
  uni.navigateTo({ url: path })
}

function goSensitivity(): void {
  goPage('/pages-sub/sensitivity/index')
}
</script>
