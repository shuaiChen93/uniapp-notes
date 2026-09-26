<template>
  <x-page-shell title="压枪训练助手">
    <view class="mb-4">
      <text class="text-2xl font-medium text-content-primary">开始训练</text>
      <text class="mt-1 block text-sm text-content-secondary">
        选择枪械与灵敏度，测出你的压枪稳定性
      </text>
    </view>

    <view
      v-for="entry in entries"
      :key="entry.url"
      class="mb-3 rounded-card bg-bg-card p-4"
      @click="handleNavigate(entry)"
    >
      <text class="text-base text-content-primary">{{ entry.label }}</text>
      <text class="mt-1.5 block text-xs text-content-secondary">{{ entry.desc }}</text>
    </view>
  </x-page-shell>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/**
 * 首页 —— 首屏入口
 *
 * ⚠️ 当前为**骨架占位**：只保留「入口跳转」这一条最核心的链路，
 * 用于验证 uni-app 的两种路由方式都能正常工作。
 * 完整形态（最近成绩卡片、推荐灵敏度、今日训练目标）在阶段 3 实现。
 */

interface Entry {
  label: string
  desc: string
  url: string
}

const entries = ref<Entry[]>([
  {
    label: '压枪测试',
    desc: '选枪械 / 倍镜 / 距离，按住射击下滑压枪并评分',
    // tabBar 页面
    url: '/pages/recoil/index',
  },
  {
    label: '灵敏度方案',
    desc: '保存、推荐、导入导出你的灵敏度配置',
    // 分包页面
    url: '/pages-sub/sensitivity/index',
  },
  {
    label: '排行榜',
    desc: '好友排行与战绩海报分享',
    url: '/pages-sub/rank/index',
  },
])

/**
 * 跳转分发。
 *
 * ⚠️ 这里是本项目最容易踩的坑之一：
 * **tabBar 页面只能用 uni.switchTab，分包页面只能用 uni.navigateTo**，
 * 用错不会报错——只会「点了没反应」，非常难查。
 * 因此统一在这里按路径做一次分发，页面里不再各自判断。
 */
function handleNavigate(entry: Entry) {
  const isTabBarPage = ['/pages/index/index', '/pages/recoil/index', '/pages/record/index', '/pages/mine/index'].includes(
    entry.url,
  )

  if (isTabBarPage) {
    uni.switchTab({ url: entry.url })
    return
  }

  uni.navigateTo({ url: entry.url })
}
</script>
