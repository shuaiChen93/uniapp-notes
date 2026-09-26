<template>
  <x-page-shell title="排行榜">
    <view class="rounded-panel bg-bg-card p-4">
      <text class="text-base text-content-primary">排行榜</text>
      <text class="mt-2 block text-xs text-content-secondary">
        骨架占位页 —— 完整实现见阶段 3
      </text>

      <view class="mt-4 border-t border-bg-elevated pt-3">
        <text class="text-xs text-content-muted">规划中的能力：</text>
        <text class="mt-1 block text-xs text-content-secondary">
          · 好友排行 / 全服排行切换
        </text>
        <text class="mt-1 block text-xs text-content-secondary">
          · 战绩海报绘制（canvas）与微信分享
        </text>
      </view>
    </view>
  </x-page-shell>
</template>

<script setup lang="ts">
/**
 * 排行榜页（骨架占位，位于 pages-sub 分包）
 *
 * 本页后续要引入 canvas 海报绘制（体积不小）并依赖排行榜接口，
 * 属于「低频但重」的页面，因此与灵敏度方案一起放进分包。
 */
</script>
