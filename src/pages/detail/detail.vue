<template>
  <x-page-shell title="记事详情" show-back right>
    <template #right>
      <view v-if="note" class="flex h-11 items-center px-3 active:opacity-60" @click="goEdit">
        <text class="text-sm text-content-secondary">编辑</text>
      </view>
    </template>

    <template v-if="note">
      <view class="rounded-panel bg-bg-card px-5 py-5">
        <text class="block text-xl font-medium text-content-primary">
          {{ note.title || '无标题' }}
        </text>

        <!-- 完整日期带星期：翻看旧记事时，「那天是星期几」是很有用的记忆线索 -->
        <text class="mt-2 block text-2xs text-content-muted">{{ formatFullDate(note.date) }}</text>

        <view v-if="note.content" class="my-4 h-px bg-bg-elevated" />

        <!--
          只有标题的记事不该在正文区留一片空白，因此正文与分隔线一起条件渲染。
          user-select 打开长按选中：用户经常需要把记事内容复制到别处，
          默认不可选中会逼着他手打一遍。
        -->
        <text
          v-if="note.content"
          class="block whitespace-pre-wrap text-base text-content-primary"
          user-select
        >
          {{ note.content }}
        </text>
      </view>

      <text class="mt-3 block px-1 text-2xs text-content-muted">
        创建于 {{ formatRelativeTime(note.createdAt) }}
        <template v-if="note.updatedAt !== note.createdAt">
          · 最后修改 {{ formatRelativeTime(note.updatedAt) }}
        </template>
      </text>

      <!--
        ── 删除 ──
        放在正文下方、且用文字链而不是按钮：
        它和头部的「编辑」隔开一整屏的距离，不可能被误触；
        而一个显眼的红色按钮摆在那里，会持续暗示「你可以删掉它」，
        这不是一个记事应用该给用户的默认心理暗示。
      -->
      <view class="mt-10 flex justify-center active:opacity-60" @click="handleDelete">
        <text class="text-sm text-danger">删除这条记事</text>
      </view>
    </template>

    <!--
      兜底：进入页面时记事就没了（在别处被删掉、或入口传了无效 id）。
      正常路径下 onLoad 会立刻退回，这一屏只是一闪而过的保险，
      防止出现「一片空白的详情页」这种看起来像坏掉的状态。
    -->
    <x-empty-state v-else icon="?" title="这条记事已不存在" desc="它可能已经被删除了" />
  </x-page-shell>
</template>

<script setup lang="ts">
/**
 * 详情页 —— 展示单条记事
 * ══════════════════════════════════════════════════════════════════════
 * 参数：`?id=xxx`（必传）。
 *
 * ── 数据来源是 store，不是 onLoad 时拷一份 ────────────────────────────
 * note 是个计算属性，始终从 store 现取。这样从编辑页返回时，
 * 页面显示的就是刚保存的内容——不需要任何「刷新」「回传」之类的机制。
 * 如果把 onLoad 时的值存进本地 ref，返回后就会显示旧内容，
 * 而用户刚刚才在编辑页确认过保存，会直接怀疑数据丢了。
 * ══════════════════════════════════════════════════════════════════════
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { ROUTES, ROUTE_PARAM_ID, routeWithId } from '@/constants/routes'
import { DANGER_COLOR } from '@/constants/ui'
import { useNotesStore } from '@/store'
import { formatFullDate, formatRelativeTime } from '@/utils/format'
import { goBack } from '@/utils/navigate'

const notesStore = useNotesStore()

const noteId = ref('')
const note = computed(() => (noteId.value ? notesStore.getById(noteId.value) : undefined))

onLoad((query) => {
  noteId.value = query?.[ROUTE_PARAM_ID] ?? ''

  if (!note.value) {
    // 停在空白页上会让用户以为是加载失败，退回首页并说明情况
    uni.showToast({ title: '这条记事已不存在', icon: 'none' })
    setTimeout(() => goBack(), 600)
  }
})

function goEdit(): void {
  if (!note.value) return
  uni.navigateTo({ url: routeWithId(ROUTES.EDIT, note.value.id) })
}

/**
 * 删除。
 *
 * 必须二次确认：这是本应用里唯一一个会销毁用户输入内容的动作，
 * 且没有回收站、删掉就真的没了。确认框里的文案要说明「无法恢复」，
 * 而不是只问一句「确定删除吗」——后者用户会习惯性点确定。
 */
function handleDelete(): void {
  const target = note.value
  if (!target) return

  uni.showModal({
    title: '删除记事',
    content: '删除后无法恢复，确定要删除这条记事吗？',
    confirmText: '删除',
    confirmColor: DANGER_COLOR,
    cancelText: '取消',
    success: (res) => {
      if (!res.confirm) return

      notesStore.remove(target.id)
      uni.showToast({ title: '已删除', icon: 'none' })

      // 与编辑页同理：延迟返回，否则 toast 会随着页面一起被销毁
      setTimeout(() => goBack(), 600)
    },
  })
}
</script>
