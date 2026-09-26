<template>
  <x-page-shell title="设置">
    <view class="rounded-panel bg-bg-card">
      <view
        v-for="(item, index) in items"
        :key="item.key"
        class="flex items-center justify-between p-4"
        :class="{ 'border-t border-bg-elevated': index > 0 }"
      >
        <view class="flex flex-col">
          <text class="text-sm text-content-primary">{{ item.label }}</text>
          <text class="mt-1 text-2xs text-content-muted">{{ item.desc }}</text>
        </view>

        <text class="text-xs text-content-secondary">{{ item.value }}</text>
      </view>
    </view>

    <text class="mt-4 block text-2xs text-content-muted">
      骨架占位页 —— 开关状态与持久化见阶段 2 / 3
    </text>
  </x-page-shell>
</template>

<script setup lang="ts">
import { ref } from 'vue'

/**
 * 设置页（骨架占位，位于 pages-sub 分包）
 *
 * 这里先只做静态展示，目的是把「设置项 → 持久化 store」的链条在阶段 2
 * 一次性打通（Pinia + uni.setStorageSync 持久化插件），
 * 避免出现「页面写完了、存储层还没有」的返工。
 */

interface SettingItem {
  key: string
  label: string
  desc: string
  value: string
}

const items = ref<SettingItem[]>([
  { key: 'vibrate', label: '震动反馈', desc: '射击采样时触发震动', value: '开' },
  { key: 'sound', label: '音效', desc: '射击与命中音效', value: '开' },
  { key: 'theme', label: '主题', desc: '跟随系统 / 固定暗色', value: '暗色' },
  { key: 'clearCache', label: '清除缓存', desc: '清空本地成绩与图片缓存', value: '—' },
])
</script>
