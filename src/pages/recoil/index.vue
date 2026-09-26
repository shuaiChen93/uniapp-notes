<template>
  <x-page-shell title="压枪测试">
    <view class="rounded-panel bg-bg-card p-4">
      <text class="text-base text-content-primary">压枪测试</text>
      <text class="mt-2 block text-xs text-content-secondary">
        骨架占位页 —— 完整实现见阶段 3
      </text>

      <view class="mt-4 border-t border-bg-elevated pt-3">
        <text class="text-xs text-content-muted">规划中的能力：</text>
        <text class="mt-1 block text-xs text-content-secondary">
          · 枪械 / 配件 / 倍镜（2·3·4·6·8 倍）/ 距离 / 靶型选择
        </text>
        <text class="mt-1 block text-xs text-content-secondary">
          · 按住射击并下滑模拟压枪，采样触点的位移轨迹
        </text>
        <text class="mt-1 block text-xs text-content-secondary">
          · 计算弹着点偏移、垂直 / 水平后坐力、稳定性得分与评级
        </text>
      </view>
    </view>
  </x-page-shell>
</template>

<script setup lang="ts">
/**
 * 压枪测试页（骨架占位）
 *
 * pages.json 中本页配置为：
 *   - navigationStyle: "custom"  → 用 x-page-shell 自绘头部
 *   - disableScroll: true        → 禁止页面滚动与下拉回弹
 *
 * disableScroll 为 true 的原因：本页后续要用 touchmove 采样压枪轨迹，
 * 页面一旦可滚动，手指下滑会同时触发「页面滚动」与「压枪采样」，
 * 不仅数据被污染，iOS 上还会出现橡皮筋回弹把采样点拉回原位。
 */
</script>
