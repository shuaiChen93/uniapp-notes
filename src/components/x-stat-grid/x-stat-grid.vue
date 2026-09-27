<template>
  <view class="flex rounded-panel bg-bg-card py-4">
    <view v-for="item in items" :key="item.label" class="flex-1 items-center">
      <view class="flex items-baseline justify-center">
        <text class="text-lg font-medium" :class="item.highlight ? 'text-brand' : 'text-content-primary'">
          {{ item.value }}
        </text>
        <text v-if="item.unit" class="ml-0.5 text-2xs text-content-muted">{{ item.unit }}</text>
      </view>
      <text class="mt-1 block text-center text-2xs text-content-muted">{{ item.label }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * x-stat-grid —— 横向数据网格
 * ══════════════════════════════════════════════════════════════════════
 * 首页、记录页、我的页都要展示「几个关键数字并排」。
 *
 * ── 为什么不做成自适应换行 ────────────────────────────────────────────
 * 这一组数字永远是一个整体（总场次 / 最佳 / 平均），
 * 换行会让它们视觉上散架，反而不像一个整体。因此固定用 flex-1
 * 平分宽度，不换行。
 *
 * 数量超过 4 个时不要用这个组件——四列已经是手机屏幕上
 * 还能看清标签的极限，再多就该改用列表了。
 * ══════════════════════════════════════════════════════════════════════
 */

export interface StatItem {
  /** 标签，如「最佳」 */
  label: string
  /** 数值。已经是格式化好的字符串，组件不做任何加工 */
  value: string | number
  /** 单位，显示在数值右侧的小字，如「分」 */
  unit?: string
  /** 是否用品牌色高亮。用于突出最重要的那一个（通常是最高分） */
  highlight?: boolean
}

withDefaults(
  defineProps<{
    items: StatItem[]
  }>(),
  {},
)
</script>
