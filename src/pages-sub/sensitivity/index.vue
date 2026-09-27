<template>
  <x-page-shell title="灵敏度方案">
    <!-- ── 操作栏 ── -->
    <view class="flex gap-3">
      <view
        class="flex-1 rounded-card bg-bg-card py-3 active:bg-bg-elevated"
        @click="handleImport()"
      >
        <text class="block text-center text-sm text-content-primary">导入分享码</text>
      </view>
      <view class="flex-1 rounded-card bg-brand py-3 active:opacity-90" @click="openEditor(null)">
        <text class="block text-center text-sm text-white">新建方案</text>
      </view>
    </view>

    <!-- ── 推荐方案 ── -->
    <view v-if="sensitivityStore.builtinPlans.length > 0" class="mt-5">
      <text class="text-sm text-content-secondary">推荐方案</text>
      <text class="mt-1 block text-2xs text-content-muted">
        内置方案不可修改，选中后可直接用于压枪训练
      </text>

      <view
        v-for="plan in sensitivityStore.builtinPlans"
        :key="plan.id"
        class="mt-2 rounded-panel bg-bg-card p-4 active:bg-bg-elevated"
        @click="sensitivityStore.setActive(plan.id)"
      >
        <view class="flex items-center">
          <view class="flex-1">
            <view class="flex items-center">
              <text class="text-base text-content-primary">{{ plan.name }}</text>
              <text
                v-if="sensitivityStore.activePlan?.id === plan.id"
                class="ml-2 rounded-card bg-brand px-1.5 py-0.5 text-2xs text-white"
              >
                使用中
              </text>
            </view>
            <text class="mt-1 block text-2xs text-content-muted">{{ plan.desc }}</text>
          </view>

          <!--
            点击卡片主体是「使用这套」（最高频操作，一步到位），
            次要操作收进右侧的「···」。
            不把「使用」也放进菜单：那会让最常用的动作变成两步。
          -->
          <text class="ml-2 px-2 py-1 text-xs text-content-muted" @click.stop="openMenu(plan)">
            ···
          </text>
        </view>

        <view class="mt-3 border-t border-bg-elevated pt-2.5">
          <text class="text-2xs text-content-muted">{{ describeValues(plan) }}</text>
        </view>
      </view>
    </view>

    <!-- ── 我的方案 ── -->
    <view class="mt-5">
      <text class="text-sm text-content-secondary">我的方案</text>

      <view
        v-for="plan in sensitivityStore.myPlans"
        :key="plan.id"
        class="mt-2 rounded-panel bg-bg-card p-4 active:bg-bg-elevated"
        @click="sensitivityStore.setActive(plan.id)"
      >
        <view class="flex items-center">
          <view class="flex-1">
            <view class="flex items-center">
              <text class="text-base text-content-primary">{{ plan.name }}</text>
              <text
                v-if="sensitivityStore.activePlan?.id === plan.id"
                class="ml-2 rounded-card bg-brand px-1.5 py-0.5 text-2xs text-white"
              >
                使用中
              </text>
            </view>
            <text v-if="plan.desc" class="mt-1 block text-2xs text-content-muted">
              {{ plan.desc }}
            </text>
          </view>

          <text class="ml-2 px-2 py-1 text-xs text-content-muted" @click.stop="openMenu(plan)">
            ···
          </text>
        </view>

        <view class="mt-3 border-t border-bg-elevated pt-2.5">
          <text class="text-2xs text-content-muted">{{ describeValues(plan) }}</text>
        </view>
      </view>

      <x-empty-state
        v-if="sensitivityStore.loaded && sensitivityStore.myPlans.length === 0"
        icon="＋"
        title="还没有自己的方案"
        desc="按自己的手感调一套，或在推荐方案基础上改"
        action-text="新建方案"
        @action="openEditor(null)"
      />
    </view>

    <!--
      ── 编辑弹层 ───────────────────────────────────────────────────────
      覆盖全屏而不是底部弹层：3 类目 × 6 瞄具共 18 个格子，
      底部弹层要么做得极高，要么内部再套一层滚动，两种体验都不好。
    -->
    <view v-if="editorVisible" class="fixed inset-0 z-50 flex flex-col bg-bg-base">
      <view class="relative bg-bg-card" :style="{ paddingTop: `${statusBarHeight}px` }">
        <!--
          与压枪页的配装面板同款处理：「保存」要让开微信胶囊，
          标题单独成层以保证相对整屏居中。原因见 utils/system.ts。
        -->
        <view
          class="flex h-11 items-center justify-between pl-4"
          :style="{ paddingRight: `${headerRightPadding}px` }"
        >
          <text class="text-sm text-content-secondary" @click="editorVisible = false">取消</text>
          <text class="text-sm text-brand" @click="handleSavePlan()">保存</text>
        </view>

        <view
          class="pointer-events-none absolute inset-x-0 bottom-0 flex h-11 items-center justify-center"
        >
          <text class="text-base font-medium text-content-primary">
            {{ editingId ? '编辑方案' : '新建方案' }}
          </text>
        </view>
      </view>

      <scroll-view scroll-y class="flex-1">
        <view class="p-4">
          <!-- 名称与说明 -->
          <text class="text-2xs text-content-muted">方案名称</text>
          <input
            v-model="draftName"
            class="mt-1.5 w-full rounded-card bg-bg-card px-3 py-2.5 text-sm text-content-primary"
            placeholder="如：M416 中距离压枪"
            placeholder-class="text-content-muted"
            :maxlength="20"
          />

          <text class="mt-4 block text-2xs text-content-muted">说明（可选）</text>
          <input
            v-model="draftDesc"
            class="mt-1.5 w-full rounded-card bg-bg-card px-3 py-2.5 text-sm text-content-primary"
            placeholder="如：适合 100~200 米连发"
            placeholder-class="text-content-muted"
            :maxlength="30"
          />

          <!--
            数值表格：一行一个类目，一列一个瞄具。
            点击格子弹输入框而不是就地放 ± 按钮——
            18 个格子每个都配一对按钮的话，一个格子只剩不到 50px 宽，
            数字和按钮都会小到点不准。
          -->
          <view class="mt-5 flex items-center justify-between">
            <text class="text-sm text-content-secondary">数值</text>
            <text class="text-2xs text-content-muted">点击数字即可修改（0~300）</text>
          </view>

          <view v-for="category in SENSITIVITY_CATEGORIES" :key="category.key" class="mt-3">
            <text class="text-2xs text-content-muted">{{ category.label }}</text>
            <text class="ml-2 text-2xs text-content-muted">{{ category.hint }}</text>

            <view class="mt-1.5 flex gap-1">
              <view
                v-for="sight in SIGHTS"
                :key="sight"
                class="flex-1"
                @click="editValue(category.key, sight)"
              >
                <text class="block text-center text-2xs text-content-muted">
                  {{ SIGHT_LABEL[sight] }}
                </text>
                <view class="mt-1 rounded-card bg-bg-card py-2 active:bg-bg-elevated">
                  <text class="block text-center text-sm text-content-primary">
                    {{ draftValues[category.key][sight] }}
                  </text>
                </view>
              </view>
            </view>
          </view>

          <view class="mt-5 rounded-card bg-bg-card p-3">
            <text class="text-2xs text-content-muted">
              开火镜头这一组决定压枪手感，是压枪训练真正会用到的那一行。
              镜头组影响不开火时的转向速度，陀螺仪组在不用陀螺仪时可以忽略。
            </text>
          </view>

          <view class="h-8" />
        </view>
      </scroll-view>
    </view>
  </x-page-shell>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  SENSITIVITY_CATEGORIES,
  SIGHTS,
  SIGHT_LABEL,
  normalizeSensitivity,
} from '@/constants/sensitivity'
import { useSensitivityStore } from '@/store'
import { decodeSensitivity, encodeSensitivity } from '@/utils/sensitivity-code'
import { getHeaderRightPadding } from '@/utils/system'
import type { SensitivityCategory, SensitivityPlan, SensitivityValues, SightId } from '@/types'

/**
 * 灵敏度方案页（分包）
 * ══════════════════════════════════════════════════════════════════════
 * 需求里这一页要覆盖四件事：保存、推荐、分享、导入导出。
 *
 *   保存 —— 新建 / 编辑方案（编辑弹层）
 *   推荐 —— 内置方案分组，选中即生效
 *   分享 —— 把方案编码成一行分享码复制到剪贴板
 *   导入 —— 粘贴分享码还原成一整套方案
 *
 * ── 页面里没有一处业务校验 ────────────────────────────────────────────
 * 数值规范化（normalizeSensitivity）、分享码解析（decodeSensitivity）、
 * 落库前的合法性检查（mock 路由里的 normalizeValues）各司其职，
 * 页面只负责把它们串起来并展示结果。
 * 如果把校验也写在页面里，会变成三处规则各写一遍，
 * 改一处忘一处就是数据不一致。
 * ══════════════════════════════════════════════════════════════════════
 */

const sensitivityStore = useSensitivityStore()
const { statusBarHeight = 0 } = uni.getWindowInfo()

/** 自绘头部右侧要让出的宽度，用来避开微信胶囊，详见 utils/system.ts */
const headerRightPadding = getHeaderRightPadding()

onShow(() => {
  if (!sensitivityStore.loaded) {
    sensitivityStore.fetchPlans()
  }
})

/* ── 编辑弹层 ── */

const editorVisible = ref(false)

/** 正在编辑的方案 id。null 表示新建 */
const editingId = ref<string | null>(null)

const draftName = ref('')
const draftDesc = ref('')
const draftValues = ref<SensitivityValues>(createDefaultValues())

/**
 * 造一份全是 100 的数值表。
 *
 * 100 是基准灵敏度（见 utils/recoil.ts 的 BASE_SENSITIVITY），
 * 增益为 1 意味着「手指滑多少就补偿多少」，
 * 作为新方案的起点比全 0 或随机值都更有意义。
 */
function createDefaultValues(): SensitivityValues {
  const values = {} as SensitivityValues
  for (const category of SENSITIVITY_CATEGORIES) {
    const group = {} as Record<SightId, number>
    for (const sight of SIGHTS) {
      group[sight] = 100
    }
    values[category.key] = group
  }
  return values
}

/** 深拷贝一份数值表，避免编辑时改到原方案 */
function cloneValues(source: SensitivityValues): SensitivityValues {
  const values = {} as SensitivityValues
  for (const category of SENSITIVITY_CATEGORIES) {
    values[category.key] = { ...source[category.key] }
  }
  return values
}

/**
 * 打开编辑弹层。
 *
 * @param plan 传 null 表示新建
 *
 * 新建时以**当前激活方案**的数值为起点，而不是全 100：
 * 用户点「新建」通常是想在现在这套的基础上微调，
 * 让他从零填 18 个格子是不合理的。没有激活方案时才退回全 100。
 */
function openEditor(plan: SensitivityPlan | null): void {
  if (plan) {
    editingId.value = plan.id
    draftName.value = plan.name
    draftDesc.value = plan.desc
    draftValues.value = cloneValues(plan.values)
  } else {
    const base = sensitivityStore.activePlan
    editingId.value = null
    draftName.value = ''
    draftDesc.value = ''
    draftValues.value = base ? cloneValues(base.values) : createDefaultValues()
  }

  editorVisible.value = true
}

/**
 * 修改单个格子的值。
 *
 * 用 showModal 的 editable 模式而不是自己做一个数字键盘弹层：
 * 小程序原生输入框能正确处理数字键盘、长按粘贴、系统级的输入法切换，
 * 自绘的输入组件在这些细节上永远差一截。
 */
function editValue(category: SensitivityCategory, sight: SightId): void {
  const meta = SENSITIVITY_CATEGORIES.find((item) => item.key === category)

  uni.showModal({
    title: `${meta?.label ?? ''} · ${SIGHT_LABEL[sight]}`,
    editable: true,
    placeholderText: '0 ~ 300',
    content: `${draftValues.value[category][sight]}`,
    success: (res) => {
      if (!res.confirm) return

      // editable 模式下输入内容在 res.content 上。
      // @dcloudio/types 的 ShowModalSuccess 没有声明这个字段
      // （它是微信基础库后加的属性），因此这里显式取一次并做兜底
      const raw = (res as unknown as { content?: string }).content ?? ''
      const value = Number(raw.trim())

      if (!Number.isFinite(value)) {
        uni.showToast({ title: '请输入数字', icon: 'none' })
        return
      }

      // 越界不报错而是夹到区间内：用户输入 350 时，
      // 他的意图显然是"拉满"，报错让他重输一遍是多余的摩擦
      draftValues.value[category][sight] = normalizeSensitivity(value)
    },
  })
}

async function handleSavePlan(): Promise<void> {
  const name = draftName.value.trim()
  if (!name) {
    uni.showToast({ title: '请填写方案名称', icon: 'none' })
    return
  }

  const params = {
    name,
    desc: draftDesc.value.trim(),
    values: cloneValues(draftValues.value),
  }

  try {
    if (editingId.value) {
      await sensitivityStore.update(editingId.value, params)
    } else {
      await sensitivityStore.create(params)
    }
    editorVisible.value = false
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch {
    // 请求层已经弹过错误提示。保留弹层不关闭，用户输入的内容不会丢
  }
}

/* ── 方案菜单 ── */

/**
 * 打开某项的次要操作菜单。
 *
 * 内置方案只给「分享」：它们由服务端维护、所有人共用，
 * 允许编辑会让「推荐方案」变成每人一套，失去参考价值。
 */
function openMenu(plan: SensitivityPlan): void {
  const actions = plan.builtin
    ? ([{ key: 'share', label: '复制分享码' }] as const)
    : ([
        { key: 'share', label: '复制分享码' },
        { key: 'edit', label: '编辑' },
        { key: 'delete', label: '删除' },
      ] as const)

  uni.showActionSheet({
    itemList: actions.map((item) => item.label),
    success: (res) => {
      const action = actions[res.tapIndex]
      if (!action) return

      if (action.key === 'share') handleShare(plan)
      else if (action.key === 'edit') openEditor(plan)
      else handleDelete(plan)
    },
  })
}

function handleShare(plan: SensitivityPlan): void {
  const code = encodeSensitivity(plan.values)

  uni.setClipboardData({
    data: code,
    success: () => {
      uni.showToast({ title: '分享码已复制', icon: 'none' })
    },
  })
}

function handleDelete(plan: SensitivityPlan): void {
  uni.showModal({
    title: '删除方案',
    content: `确定删除「${plan.name}」吗？删除后无法恢复`,
    confirmText: '删除',
    confirmColor: '#EF4444',
    success: async (res) => {
      if (!res.confirm) return
      try {
        await sensitivityStore.remove(plan.id)
        uni.showToast({ title: '已删除', icon: 'none' })
      } catch {
        // 请求层已提示
      }
    },
  })
}

/* ── 导入 ── */

/**
 * 导入分享码。
 *
 * 解析失败时用 showModal 而不是 toast 展示原因：
 * 「分享码不完整，应有 18 个数值，实际 15 个」这类信息有几秒钟的阅读量，
 * toast 一闪而过用户根本看不完，而他又必须知道错在哪才能重新复制。
 */
function handleImport(): void {
  uni.showModal({
    title: '导入方案',
    editable: true,
    placeholderText: '粘贴分享码，形如 RT1:100,90,...',
    success: async (res) => {
      if (!res.confirm) return

      const raw = (res as unknown as { content?: string }).content ?? ''
      const decoded = decodeSensitivity(raw)

      if (!decoded.ok || !decoded.values) {
        uni.showModal({
          title: '导入失败',
          content: decoded.message,
          showCancel: false,
        })
        return
      }

      // 名称带日期，避免连续导入几次后列表里出现三套同名方案分不清
      const now = new Date()
      const name = `导入方案 ${now.getMonth() + 1}/${now.getDate()}`

      try {
        await sensitivityStore.importPlan({
          name,
          desc: '从分享码导入',
          values: decoded.values,
        })
        uni.showToast({ title: '导入成功', icon: 'success' })
      } catch {
        // 请求层已提示
      }
    },
  })
}

/* ── 展示 ── */

/**
 * 方案卡片上的一行摘要。
 *
 * 只挑开火镜头的三个瞄具展示，而不是把 18 个数字全铺出来：
 * 卡片是列表项，不是详情页。三个值足以让用户认出「这是哪一套」，
 * 也能横向比较不同方案的档位高低。
 *
 * 用普通函数而不是 computed：它依赖的是渲染时传入的参数，
 * 不是一个固定的响应式源，包成 computed 只会得到一个恒定的函数引用。
 */
function describeValues(plan: SensitivityPlan): string {
  const firing = plan.values?.firing
  if (!firing) return '数值缺失'
  return `开火镜头 · 腰射 ${firing.hip} / 4 倍 ${firing['4x']} / 8 倍 ${firing['8x']}`
}
</script>
