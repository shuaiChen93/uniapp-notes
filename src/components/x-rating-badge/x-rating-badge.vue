<template>
  <view class="flex items-center">
    <view
      class="flex items-center justify-center rounded-card border"
      :class="[sizeClass.box, isLight ? 'border-transparent' : meta.borderClass]"
      :style="boxStyle"
    >
      <text class="font-medium" :class="sizeClass.text" :style="textStyle">{{ rating }}</text>
    </view>

    <text v-if="showLabel" class="ml-2 text-xs" :class="labelClass">
      {{ meta.label }}
    </text>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RATING_META, type Rating } from '@/constants/rating'
import { useSettingsStore } from '@/store'

/**
 * x-rating-badge —— 成绩评级徽章
 * ══════════════════════════════════════════════════════════════════════
 * 三处地方要展示评级（记录列表、结果页、排行榜），样式必须完全一致：
 * 同一个 S 级在三个页面显示成三种样子，用户会怀疑是不是同一种评级。
 * 因此抽成组件，色值只有一个来源（RATING_META）。
 *
 * ── 关于背景色的写法 ──────────────────────────────────────────────────
 * 没有用 Tailwind 的 `bg-rating-s/20` 这类带透明度的类名，而是在
 * :style 里拼一个 8 位 hex（#RRGGBBAA）。
 *
 * 原因：`/20` 会被编译成 `rgb(255 197 61 / 0.2)`，这种空格分隔的
 * 现代色彩语法在部分低版本小程序基础库上不被支持，会静默失效
 * （徽章变成透明底，白字看不见）。8 位 hex 是更老也更通用的语法。
 *
 * ── 为什么这个组件要感知主题 ──────────────────────────────────────────
 * 上面那套「淡色底 + 同色字」只在深色背景上成立：把 13% 不透明的金黄
 * 铺在白色卡片上，再写同色的金黄字，对比度低到几乎读不出来。
 *
 * 所以浅色主题下换成「实色底 + 深色字」——同一组评级色在白底上
 * 依然能表达等级（金黄/紫/蓝/绿/灰），只是用法要反过来。
 * 这是全项目**唯一**需要区分主题的组件：其他组件用的都是
 * bg-* / text-* 这类走 CSS 变量的类名，会自动跟着变；
 * 而这里的颜色来自 constants/rating.ts 的字面量 hex，绕过了那套变量。
 * ══════════════════════════════════════════════════════════════════════
 */

const props = withDefaults(
  defineProps<{
    rating: Rating
    /** 尺寸 */
    size?: 'sm' | 'md' | 'lg'
    /** 是否在徽章右侧显示评级的中文评价（如「神枪手」） */
    showLabel?: boolean
  }>(),
  {
    size: 'md',
    showLabel: false,
  },
)

const settingsStore = useSettingsStore()

const meta = computed(() => RATING_META[props.rating])
const isLight = computed(() => settingsStore.settings.theme === 'light')

/** 深色主题：淡色底（13% 不透明）铺在暗背景上 */
const boxStyle = computed(() => ({
  backgroundColor: isLight.value ? meta.value.color : meta.value.color + '22',
}))

/**
 * 浅色主题下的文字色。
 *
 * 写死 #1A1D23 而不是用 text-bg-base：后者在浅色主题下会解析成
 * 浅灰（#F2F4F7），因为语义是「页面底色」而不是「深色文字」。
 * 这两者在浅色主题下恰好是反的，混用会得到一个浅底浅字。
 */
const textStyle = computed(() => (isLight.value ? { color: '#1A1D23' } : {}))

/** 评级评价文字：浅色下改用次要文本色，金黄字在白底上读不清 */
const labelClass = computed(() =>
  isLight.value ? 'text-content-secondary' : meta.value.textClass,
)

/**
 * 尺寸映射。
 *
 * ⚠️ 类名必须是完整字符串（不能拼 `text-${size}`）——
 * Tailwind 是静态扫描的，拼接出来的类名扫描不到，样式会凭空消失。
 * 这是小程序 + Tailwind 组合下最常见的坑，详见 constants/rating.ts 的说明。
 */
const SIZE_CLASS = {
  sm: { box: 'h-6 w-6', text: 'text-sm' },
  md: { box: 'h-9 w-9', text: 'text-lg' },
  lg: { box: 'h-16 w-16', text: 'text-3xl' },
} as const

const sizeClass = computed(() => SIZE_CLASS[props.size])
</script>
