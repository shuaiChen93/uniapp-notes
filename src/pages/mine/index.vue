<template>
  <x-page-shell title="我的">
    <!-- 游客态：阶段 2 接入登录后，这里会切换成昵称 + 头像 -->
    <view class="rounded-panel bg-bg-card p-4">
      <text class="text-base text-content-primary">未登录</text>
      <text class="mt-1 block text-xs text-content-secondary">
        登录后可同步成绩、参与好友排行
      </text>
    </view>

    <view
      class="mt-3 rounded-card bg-bg-card p-4"
      @click="goSettings"
    >
      <text class="text-base text-content-primary">设置</text>
      <text class="mt-1 block text-xs text-content-secondary">
        震动、音效、主题、清除缓存
      </text>
    </view>

    <text class="mt-4 block text-2xs text-content-muted">
      骨架占位页 —— 完整实现见阶段 3
    </text>
  </x-page-shell>
</template>

<script setup lang="ts">
/**
 * 我的页（骨架占位）
 *
 * 「设置」放在分包 pages-sub/settings 而不是主包：
 * 设置页是低频入口，放进分包可以让首屏少下载这部分代码。
 * 分包页面只能用 uni.navigateTo，不能用 switchTab。
 */
function goSettings() {
  uni.navigateTo({ url: '/pages-sub/settings/index' })
}
</script>
