<template>
  <view class="rounded-panel bg-bg-card p-4">
    <view class="mb-3 flex items-center justify-between">
      <text class="text-sm text-content-secondary">{{ title }}</text>
      <text v-if="points.length > 0" class="text-2xs text-content-muted">
        共 {{ points.length }} 次 · 最高 {{ maxValue }}
      </text>
    </view>

    <!--
      图表主体。
      ⚠️ 容器必须有**确定的高度**：柱子的高度用百分比表达，
      而百分比高度需要一个有确定高度的父元素才能计算。
      父元素高度是 auto 的话，百分比会退化成 0，整个图会消失
      —— 而且不报任何错，非常难查。
    -->
    <view v-if="points.length > 0" class="flex h-32 items-end justify-center gap-1">
      <view
        v-for="(point, index) in points"
        :key="index"
        class="flex h-full max-w-[20px] flex-1 flex-col justify-end"
      >
        <!-- 柱体本身。高度按 0~max 的比例换算 -->
        <view
          class="w-full rounded-t-sm transition-all"
          :class="point.isBest ? 'bg-rating-s' : 'bg-brand opacity-70'"
          :style="{ height: `${barHeight(point.value)}%` }"
        />
      </view>
    </view>

    <view v-else class="flex h-32 items-center justify-center">
      <text class="text-xs text-content-muted">还没有数据，练几次就能看到趋势了</text>
    </view>

    <!--
      底部刻度：只标首尾两个时间点。
      20 根柱子的时间标签全都显示的话会挤成一团黑线，
      而中间某一次具体是哪天，用户看列表比看图表更清楚。
    -->
    <view v-if="points.length > 1" class="mt-2 flex justify-between">
      <text class="text-2xs text-content-muted">{{ points[0].label }}</text>
      <text class="text-2xs text-content-muted">{{ points[points.length - 1].label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * x-bar-chart —— 成绩趋势柱状图
 * ══════════════════════════════════════════════════════════════════════
 * ── 为什么不用 echarts / lime-echart ──────────────────────────────────
 * 这是本项目一个明确的取舍，值得写清楚：
 *
 *   ① 体积：完整的 echarts 约 1MB。微信小程序的**主包上限是 2MB**，
 *      一个图表库就要占掉一半，而这份图表要展示的只是
 *      「最近 20 次训练的分数」这一件事。
 *   ② 跨端一致性：echarts 在小程序端需要 canvas 2d 适配层
 *      （lime-echart 做的是这件事），而 canvas 在 H5、小程序、
 *      不同基础库版本上的 API 与尺寸获取方式都有差异，
 *      需要一整套条件编译。为了一个柱状图付出这个代价不划算。
 *   ③ 交互：本项目不需要缩放、拖拽、tooltip 这些 echarts 的核心能力。
 *
 * 柱状图是**纯 view + 百分比高度**实现的，零依赖、两端行为完全一致、
 * 主包体积增量为零。真到了需要复杂图表的阶段（比如 K 线、
 * 多轴对比），再引入专业库也不迟——那时也才付得起它的代价。
 *
 * ── 为什么是柱状图而不是折线图 ────────────────────────────────────────
 * 折线图需要计算每段的长度与角度（小程序不支持 SVG），
 * 得先拿到容器实际宽度再做三角函数，还要处理尺寸变化后的重算。
 * 而「最近 N 次成绩」用柱子表达同样清楚：柱子的高低就是水平高低。
 * ══════════════════════════════════════════════════════════════════════
 */

export interface ChartPoint {
  /** 底部刻度文案，只在首尾展示 */
  label: string
  /** 数值 */
  value: number
  /** 是否是最高值。用金色高亮，让用户一眼看到自己的最好成绩 */
  isBest?: boolean
}

const props = withDefaults(
  defineProps<{
    points: ChartPoint[]
    title?: string
    /**
     * 满格对应的数值。
     *
     * 默认 100 —— 因为分数天然是 0~100，用它做满格能让柱子的高度
     * 直接等于分数，用户不需要任何换算就能读懂。
     * 若换成「偏移量」这类没有天然上限的数据，必须显式传这个值，
     * 否则所有柱子都会顶格。
     */
    max?: number
  }>(),
  {
    title: '',
    max: 100,
  },
)

const maxValue = computed(() => {
  if (props.points.length === 0) return 0
  return Math.max(...props.points.map((point) => point.value))
})

/**
 * 换算柱子高度（百分比）。
 *
 * 下限 4%：分数为 0 的柱子高度是 0，在界面上完全看不见，
 * 用户会以为「这次没记录上」而不是「考了 0 分」。
 * 留一点点高度让它至少是一条可见的线。
 */
function barHeight(value: number): number {
  const ratio = props.max > 0 ? value / props.max : 0
  return Math.max(4, Math.min(100, ratio * 100))
}
</script>
