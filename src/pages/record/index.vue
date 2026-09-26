<template>
  <x-page-shell title="训练记录">
    <view class="rounded-panel bg-bg-card p-4">
      <text class="text-base text-content-primary">训练记录</text>
      <text class="mt-2 block text-xs text-content-secondary">
        骨架占位页 —— 完整实现见阶段 3
      </text>

      <view class="mt-4 border-t border-bg-elevated pt-3">
        <text class="text-xs text-content-muted">规划中的能力：</text>
        <text class="mt-1 block text-xs text-content-secondary">
          · 历史成绩列表（按枪械 / 时间筛选）
        </text>
        <text class="mt-1 block text-xs text-content-secondary">
          · 稳定性趋势图（小程序端用 lime-echart，H5 端懒加载 echarts）
        </text>
        <text class="mt-1 block text-xs text-content-secondary">· 个人最佳记录</text>
      </view>

      <text class="mt-4 block text-2xs text-content-muted">
        提示：下拉可刷新本页
      </text>
    </view>
  </x-page-shell>
</template>

<script setup lang="ts">
import { onPullDownRefresh } from '@dcloudio/uni-app'

/**
 * 训练记录页（骨架占位）
 *
 * 本页在 pages.json 中开启了 enablePullDownRefresh，
 * 因此这里注册 onPullDownRefresh 钩子把骨架链路先打通：
 * 记录页是「练完回来看数据」的场景，下拉即刷新是成本最低的交互。
 *
 * ⚠️ 必须调用 uni.stopPullDownRefresh()，否则下拉 Loading 会一直转
 * （小程序端不会自动收起，H5 端表现为页面卡在刷新态）。
 */
onPullDownRefresh(async () => {
  // 阶段 3 在这里调用记录列表接口，此处仅演示「结束刷新」的必要收尾
  try {
    // 预留：await recordApi.list()
  } finally {
    uni.stopPullDownRefresh()
  }
})
</script>
