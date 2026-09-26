<template>
  <view class="min-h-screen bg-bg-base">
    <!--
      自定义导航栏。
      pages.json 里本项目的页面大多设了 `navigationStyle: "custom"`，
      原生导航栏会被移除，必须自绘——否则首行内容会直接顶到状态栏（刘海/挖孔）下面。
    -->
    <view class="bg-bg-card" :style="{ paddingTop: `${statusBarHeight}px` }">
      <view class="flex h-11 items-center justify-center px-4">
        <text class="text-base font-medium text-content-primary">{{ title }}</text>
      </view>
    </view>

    <view class="p-4">
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * x-page-shell —— 页面外壳
 * ══════════════════════════════════════════════════════════════════════
 * 这个组件同时承担两个职责：
 *
 * ① 复用：统一「状态栏安全区 + 自定义头部」的骨架，避免每个页面
 *    各写一遍 paddingTop 计算（这是小程序最常见的一类视觉不一致来源）。
 *
 * ② 验证 easycom：本组件**没有**被任何页面 import，全靠 pages.json 里的
 *    `"^x-(.*)": "@/components/x-$1/x-$1.vue"` 规则自动注册。
 *    如果 easycom 配置写错了，这里会立刻编译失败而不是等到上线才发现。
 * ══════════════════════════════════════════════════════════════════════
 */
withDefaults(defineProps<{ title?: string }>(), { title: '' })

/**
 * 状态栏高度。
 *
 * 为什么必须动态取、不能写死：
 * iOS 刘海屏约 44px、老机型 20px、安卓挖孔屏 24~36px 不等，
 * 写死任何一个值都会在另一批机型上出现「标题被状态栏压住」或「顶部留白过大」。
 *
 * 用 getWindowInfo 而非 getSystemInfoSync：
 * 后者已标记废弃，且会同步返回屏幕/设备/网络等一大堆用不上的字段，
 * 在小程序启动期是实打实的耗时。getWindowInfo 只返回窗口尺寸，
 * 且是 uni 官方推荐的新 API（H5 端同样有实现，返回 0，不影响 Web 展示）。
 */
const { statusBarHeight = 0 } = uni.getWindowInfo()
</script>
