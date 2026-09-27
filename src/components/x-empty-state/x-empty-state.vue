<template>
  <view class="flex flex-col items-center justify-center px-8 py-12">
    <!--
      图标用一个简单的圆环 + 文字，不引入图片资源。
      原因：小程序加载网络图片要配置合法域名，本地图片又要占用主包体积，
      而空状态图标本身不承载信息，用 CSS 画反而更轻、更可控。
    -->
    <view class="flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated">
      <text class="text-2xl text-content-muted">{{ icon }}</text>
    </view>

    <text class="mt-4 text-base text-content-secondary">{{ title }}</text>
    <text v-if="desc" class="mt-2 text-center text-xs text-content-muted">{{ desc }}</text>

    <view
      v-if="actionText"
      class="mt-6 rounded-card bg-brand px-6 py-2.5 active:opacity-90"
      @click="$emit('action')"
    >
      <text class="text-sm text-white">{{ actionText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * x-empty-state —— 空状态占位
 * ══════════════════════════════════════════════════════════════════════
 * ── 为什么空状态值得单独做个组件 ──────────────────────────────────────
 * 它是「新用户看到的第一屏」。记录页、排行榜、方案列表在一个新用户
 * 眼里**全都是空的**，如果这几处只是各写一句「暂无数据」，
 * 用户对整个应用的第一印象就是「这东西什么都没有」。
 *
 * 一个合格的空状态要回答三个问题：
 *   ① 这里本来会有什么？（title）
 *   ② 我该做什么才能让它有内容？（desc）
 *   ③ 现在就去做（actionText 按钮）
 * 三句话缺一不可，只写「暂无数据」等于什么都没说。
 *
 * ── 为什么用 $emit 而不是传函数 ────────────────────────────────────────
 * 小程序端不支持把函数作为 prop 传给自定义组件（会被序列化丢掉）。
 * 用事件是小程序 + Vue 组合下唯一可靠的父子通信方式。
 * ══════════════════════════════════════════════════════════════════════
 */

withDefaults(
  defineProps<{
    /** 顶部图标字符（用 emoji 或单个汉字，不引图片） */
    icon?: string
    /** 主文案：说明这里是什么 */
    title: string
    /** 副文案：告诉用户怎么让它有内容 */
    desc?: string
    /** 按钮文案。不传则不显示按钮 */
    actionText?: string
  }>(),
  {
    icon: '·',
    desc: '',
    actionText: '',
  },
)

defineEmits<{ action: [] }>()
</script>
