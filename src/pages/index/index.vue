<template>
  <x-page-shell title="私密记事本" right>
    <template #right>
      <view class="flex h-11 items-center px-3 active:opacity-60" @click="goSettings">
        <text class="text-sm text-content-secondary">设置</text>
      </view>
    </template>

    <!-- ── 空状态：新用户看到的第一屏 ── -->
    <x-empty-state
      v-if="notesStore.isEmpty"
      icon="记"
      title="还没有记事"
      desc="点击右下角的按钮，写下第一条"
      action-text="写一条"
      @action="goEdit"
    />

    <!-- ── 时间线 ── -->
    <template v-else>
      <view v-for="group in notesStore.groups" :key="group.date" class="mb-6">
        <!-- 日期分组头：条数放右侧，回答「这天写了几条」 -->
        <view class="mb-2 flex items-baseline justify-between px-1">
          <text class="text-sm font-medium text-content-secondary">{{ group.label }}</text>
          <text class="text-2xs text-content-muted">{{ group.notes.length }} 条</text>
        </view>

        <view
          v-for="note in group.notes"
          :key="note.id"
          class="mb-2.5 rounded-panel bg-bg-card px-4 py-3.5 active:bg-bg-elevated"
          @click="goDetail(note.id)"
        >
          <text class="block truncate text-base font-medium text-content-primary">
            {{ note.title || '无标题' }}
          </text>

          <!--
            只有标题的记事是常见写法（「买牛奶」这类），
            此时不渲染摘要，卡片自然收紧，不会留一条空行
          -->
          <text v-if="note.content" class="excerpt mt-1 block text-sm text-content-secondary">
            {{ excerpt(note.content) }}
          </text>

          <text class="mt-2 block text-2xs text-content-muted">
            {{ formatRelativeTime(note.updatedAt) }}
          </text>
        </view>
      </view>

      <!-- 底部留白：最后一张卡片不该被悬浮按钮压住 -->
      <view class="h-16" />
    </template>

    <!--
      ── 悬浮新增按钮 ──
      固定在右下角而非放在头部的「+」：单手拿手机时拇指的自然落点就在这里，
      而头部的按钮需要换握姿才能点到——这是记事类应用的高频操作，值得为它优化。
    -->
    <view class="fixed right-5 z-10 active:opacity-90" :style="{ bottom: fabBottom }" @click="goEdit">
      <view class="flex h-14 w-14 items-center justify-center rounded-full bg-brand shadow-lg">
        <!-- 用全角加号字符而非图片：省一张资源，且能随主题继承颜色 -->
        <text class="text-2xl leading-none text-white">＋</text>
      </view>
    </view>
  </x-page-shell>
</template>

<script setup lang="ts">
/**
 * 首页 —— 时间线列表
 * ══════════════════════════════════════════════════════════════════════
 * ── 为什么是「时间线」而不是「日历」 ──────────────────────────────────
 * 需求允许二选一。日历视图要画月份网格、处理跨月翻页与当日高亮，
 * 而它回答的问题是「哪几天写了」；用户打开记事本时真正想问的是
 * 「我最近写了什么」。日期分组 + 卡片的时间线直接回答后者，
 * 信息密度更高，实现也更简单。
 *
 * ── 排序与分组全部在 store 里 ─────────────────────────────────────────
 * 页面只负责渲染，不在这里写任何 sort/filter。
 * 排序规则一旦散落到页面，就会出现「首页的顺序和别处不一致」
 * 这类只能靠肉眼发现的问题。
 * ══════════════════════════════════════════════════════════════════════
 */
import { ROUTES, routeWithId } from '@/constants/routes'
import { useNotesStore } from '@/store'
import { formatRelativeTime, truncate } from '@/utils/format'

const notesStore = useNotesStore()

/**
 * 悬浮按钮距屏幕底部的距离。
 *
 * 必须加上安全区：全面屏机型底部有一条 Home Indicator，
 * 不留出这段距离的话按钮会贴在系统手势条上，
 * 点击很容易被系统的手势识别抢走，表现为「按钮时灵时不灵」。
 */
const fabBottom = 'calc(24px + env(safe-area-inset-bottom))'

/** 卡片摘要：截断到 60 字。太长会让卡片高低不齐，列表失去可扫读性 */
function excerpt(content: string): string {
  return truncate(content, 60)
}

/** 进入详情页 */
function goDetail(id: string): void {
  // id 由 uuid() 生成，字符集固定为 [0-9a-z_]，不含需要转义的字符。
  // 因此不做 encodeURIComponent——两端各转一次反而容易出现不一致
  uni.navigateTo({ url: routeWithId(ROUTES.DETAIL, id) })
}

/** 进入编辑页（不携带 id 即为新建） */
function goEdit(): void {
  uni.navigateTo({ url: ROUTES.EDIT })
}

function goSettings(): void {
  uni.navigateTo({ url: ROUTES.SETTINGS })
}
</script>

<style lang="scss" scoped>
/**
 * 摘要最多两行。
 *
 * JS 侧的 truncate 只是「别把超长文本塞进 DOM」的兜底，
 * 真正决定卡片高度的是这里——固定两行才能让列表有稳定的节奏。
 *
 * 用 -webkit-box + line-clamp 而不是固定高度 + overflow: hidden：
 * 后者会把第二行切掉一半，看到半截文字比看到省略号更像「页面坏了」。
 */
.excerpt {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
</style>
