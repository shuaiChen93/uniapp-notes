<template>
  <x-page-shell
    :title="pageTitle"
    show-back
    right
    :intercept-back="true"
    @back="handleBack"
  >
    <template #right>
      <view class="flex h-11 items-center px-3 active:opacity-60" @click="handleSave">
        <text class="text-sm font-medium text-brand">保存</text>
      </view>
    </template>

    <!--
      ── 标题 + 正文 ──
      两者放在同一张卡片里、中间只用一条细分隔线：
      它们在用户心里本来就是「一页纸」的两部分，分成两张卡片反而割裂。
    -->
    <view class="rounded-panel bg-bg-card px-4 py-3">
      <input
        v-model="form.title"
        class="h-11 w-full text-base text-content-primary"
        type="text"
        placeholder="标题"
        placeholder-class="x-placeholder"
        :maxlength="TITLE_MAX_LENGTH"
      />

      <view class="h-px bg-bg-elevated" />

      <!--
        auto-height 让输入框随内容长高，而不是固定高度内部滚动：
        记事以长文本为主，写到一半只能看到三行会非常难受。
        min-h-64 保证空白时也有足够的可点击区域。
      -->
      <textarea
        v-model="form.content"
        class="mt-3 min-h-64 w-full text-base text-content-primary"
        placeholder="写点什么…"
        placeholder-class="x-placeholder"
        auto-height
        :maxlength="-1"
      />
    </view>

    <!-- ── 日期 ── -->
    <view class="mt-3 rounded-panel bg-bg-card px-4">
      <picker mode="date" :value="form.date" @change="handleDateChange">
        <view class="flex h-12 items-center justify-between active:opacity-60">
          <text class="text-sm text-content-secondary">日期</text>
          <text class="text-sm text-content-primary">{{ formatDateLabel(form.date) }}</text>
        </view>
      </picker>
    </view>

    <!--
      说明这条日期能干什么。用户看到「日期」第一反应是「这是什么日期」，
      写清楚它是这条记事归属的那一天（可以与今天不同），
      能避免「补写昨天的日记」这类需求被误解为不支持。
    -->
    <text class="mt-3 block px-1 text-2xs text-content-muted">
      日期决定这条记事出现在时间线的哪一天，默认今天，可以改成过去或未来的日期。
    </text>
  </x-page-shell>
</template>

<script setup lang="ts">
/**
 * 编辑页 —— 新建与修改共用
 * ══════════════════════════════════════════════════════════════════════
 * 参数：`?id=xxx` 有值表示编辑已有记事，无值表示新建。
 * 两种模式共用同一个页面而不是拆成两个：表单字段、校验规则、保存逻辑
 * 完全一致，拆开只会让这三样东西各维护两份，然后慢慢分叉。
 *
 * ── 关于「返回时确认」──────────────────────────────────────────────────
 * 页面始终接管返回动作（intercept-back），由 isDirty() 现场判断要不要拦。
 *
 * ⚠️ 这个保护只覆盖页面内的返回按钮。系统级返回（安卓物理返回键、
 * iOS 的边缘手势）在关闭原生导航栏后依然存在，JS 无法拦截——
 * 那部分只能靠平台提供的 wx.enableAlertBeforeUnload，而它仅在小程序端有效，
 * 引入后 H5 端的表现又不一样。相比把平台差异铺进这个页面，
 * 更划算的做法是让返回按钮这条主路径足够可靠。
 * ══════════════════════════════════════════════════════════════════════
 */
import { computed, reactive } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { ROUTE_PARAM_ID } from '@/constants/routes'
import { DANGER_COLOR } from '@/constants/ui'
import { useNotesStore } from '@/store'
import { formatDateLabel, todayString } from '@/utils/format'
import { goBack } from '@/utils/navigate'
import type { NoteDraft } from '@/types'

/** 标题长度上限。列表卡片只显示一行，过长的标题在后面被截断时反而更难认 */
const TITLE_MAX_LENGTH = 50

const notesStore = useNotesStore()

/** 表单模型。date 默认今天——绝大多数记事都是「记下此刻」 */
const form = reactive<NoteDraft>({
  id: undefined,
  title: '',
  content: '',
  date: todayString(),
})

/**
 * 载入完成时的快照，用于判断用户有没有真的改过东西。
 *
 * 用「与快照比对」而不是监听 input 事件维护一个 isDirty 标志：
 * 后者要处理「改了又改回来」的情况（标志位会一直停在 true），
 * 而快照比对天然就是准确的。
 */
const snapshot = { title: '', content: '', date: '' }

const editing = computed(() => Boolean(form.id))
const pageTitle = computed(() => (editing.value ? '编辑记事' : '写记事'))

onLoad((query) => {
  const id = query?.[ROUTE_PARAM_ID]
  if (!id) {
    // 新建：表单已是默认值，直接记下快照
    takeSnapshot()
    return
  }

  const note = notesStore.getById(id)
  if (!note) {
    /**
     * 记事已不存在（在别处被删掉了，或入口传了一个无效 id）。
     *
     * 此时不能停在空白表单上：用户会以为自己刚写的内容丢了，
     * 然后重新写一遍——凭空多出一条重复记事。退回并说明情况更诚实。
     */
    uni.showToast({ title: '这条记事已不存在', icon: 'none' })
    setTimeout(() => goBack(), 600)
    return
  }

  form.id = note.id
  form.title = note.title
  form.content = note.content
  form.date = note.date
  takeSnapshot()
})

function takeSnapshot(): void {
  snapshot.title = form.title
  snapshot.content = form.content
  snapshot.date = form.date
}

/** 表单是否有未保存的改动 */
function isDirty(): boolean {
  return (
    form.title !== snapshot.title ||
    form.content !== snapshot.content ||
    form.date !== snapshot.date
  )
}

/**
 * 返回。
 *
 * 有未保存内容时先确认——这是记事类应用最容易被骂的一处：
 * 用户在编辑页写了三百字，误触返回键，内容瞬间消失且无法恢复。
 */
function handleBack(): void {
  if (!isDirty()) {
    goBack()
    return
  }

  uni.showModal({
    title: '放弃这条记事？',
    content: '有未保存的内容，返回后会丢失。',
    confirmText: '放弃',
    confirmColor: DANGER_COLOR,
    cancelText: '继续编辑',
    success: (res) => {
      if (res.confirm) goBack()
    },
  })
}

/** 保存 */
function handleSave(): void {
  const title = form.title.trim()
  const content = form.content.trim()

  // 标题和正文都空时不保存：否则会在列表里留下一条什么都点不开的空白记事。
  // 只写标题或只写正文都允许——「买牛奶」这种只有标题的写法很常见
  if (!title && !content) {
    uni.showToast({ title: '还没写内容', icon: 'none' })
    return
  }

  // 把去空格后的值写回表单，让输入框的显示与存入的内容一致——
  // 也保证了紧接着的快照比对不会因为首尾空格而误判为「还有改动」
  form.title = title
  form.content = content

  notesStore.save({ id: form.id, title, content, date: form.date })
  // 保存后立刻更新快照，否则接下来点返回会被判定为「有未保存内容」，
  // 明明已经保存过却还要再确认一次
  takeSnapshot()

  uni.showToast({ title: '已保存', icon: 'none' })

  // 延迟返回：navigateBack 会立即销毁本页，挂在页面上的 toast 会一起消失，
  // 用户看不到「已保存」这个反馈
  setTimeout(() => goBack(), 600)
}

/** picker 的 change 事件：各端统一把选中值放在 detail.value */
function handleDateChange(event: { detail: { value: string } }): void {
  form.date = event.detail.value
}
</script>
