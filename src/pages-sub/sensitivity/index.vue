<template>
  <x-page-shell title="灵敏度方案">
    <view class="rounded-panel bg-bg-card p-4">
      <text class="text-base text-content-primary">灵敏度方案</text>
      <text class="mt-2 block text-xs text-content-secondary">
        骨架占位页 —— 完整实现见阶段 3
      </text>

      <view class="mt-4 border-t border-bg-elevated pt-3">
        <text class="text-xs text-content-muted">规划中的能力：</text>
        <text class="mt-1 block text-xs text-content-secondary">
          · 方案保存与命名（本地优先，登录后同步云端）
        </text>
        <text class="mt-1 block text-xs text-content-secondary">
          · 按枪械 / 倍镜推荐灵敏度
        </text>
        <text class="mt-1 block text-xs text-content-secondary">
          · 分享码导入导出（便于在好友间传递配置）
        </text>
      </view>
    </view>
  </x-page-shell>
</template>

<script setup lang="ts">
/**
 * 灵敏度方案页（骨架占位，位于 pages-sub 分包）
 *
 * 放在分包的原因：本页后续要承载大量表单与分享码解析逻辑，
 * 代码体积明显大于其他页面，而使用频率却很低。
 * 放进分包后，用户不点进来就不会下载这部分代码。
 * （pages.json 的 preloadRule 会在首页空闲时预下载分包，兼顾点击时的秒开体验。）
 */
</script>
