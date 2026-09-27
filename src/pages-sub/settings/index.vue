<template>
  <x-page-shell title="设置">
    <!-- ── 开关类设置 ── -->
    <view class="overflow-hidden rounded-panel bg-bg-card">
      <view
        v-for="(item, index) in switchItems"
        :key="item.key"
        class="flex items-center justify-between p-4"
        :class="{ 'border-t border-bg-elevated': index > 0 }"
      >
        <view class="flex-1 pr-3">
          <text class="text-sm text-content-primary">{{ item.label }}</text>
          <text class="mt-1 block text-2xs text-content-muted">{{ item.desc }}</text>
        </view>

        <!--
          用 uni 自带的 switch 而不是自绘：小程序端它是原生组件，
          iOS 上的手感、动态、无障碍支持都是自绘做不出来的。
          自绘唯一的好处是样式可控，而这里并不需要。
        -->
        <switch
          :checked="item.value"
          color="#FF6B1A"
          @change="item.onChange"
        />
      </view>
    </view>

    <!-- ── 主题 ── -->
    <view class="mt-3 rounded-panel bg-bg-card p-4">
      <text class="text-sm text-content-primary">主题</text>
      <text class="mt-1 block text-2xs text-content-muted">
        暗色贴近游戏内 HUD 的观感，亮色在白天户外更清楚
      </text>

      <view class="mt-3 flex gap-2">
        <view
          v-for="option in THEME_OPTIONS"
          :key="option.value"
          class="rounded-card border-2 px-4 py-2"
          :class="
            settingsStore.settings.theme === option.value
              ? 'border-brand bg-bg-elevated'
              : 'border-transparent bg-bg-elevated'
          "
          @click="settingsStore.setTheme(option.value)"
        >
          <text
            class="text-sm"
            :class="
              settingsStore.settings.theme === option.value
                ? 'text-brand'
                : 'text-content-secondary'
            "
          >
            {{ option.label }}
          </text>
        </view>
      </view>
    </view>

    <!-- ── 清除缓存 ── -->
    <view
      class="mt-3 flex items-center justify-between rounded-panel bg-bg-card p-4 active:bg-bg-elevated"
      @click="handleClearCache()"
    >
      <view class="flex-1 pr-3">
        <text class="text-sm text-content-primary">清除缓存</text>
        <text class="mt-1 block text-2xs text-content-muted">
          清空本机的训练记录、灵敏度方案与登录状态
        </text>
      </view>
      <text class="text-sm text-danger">清除</text>
    </view>

    <!-- ── 恢复默认设置 ── -->
    <view
      class="mt-3 flex items-center justify-center rounded-panel bg-bg-card py-3.5 active:bg-bg-elevated"
      @click="handleResetSettings()"
    >
      <text class="text-sm text-content-secondary">恢复默认设置</text>
    </view>

    <text class="mt-6 block text-center text-2xs text-content-muted">{{ versionText }}</text>
  </x-page-shell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { USE_MOCK } from '@/constants/config'
import { useSettingsStore, useUserStore } from '@/store'
import { clearAppStorage } from '@/utils/storage'
import type { ThemeMode } from '@/types'

/**
 * 设置页（分包）
 * ══════════════════════════════════════════════════════════════════════
 * ── 这一页没有服务端 ──────────────────────────────────────────────────
 * 所有设置项都是**设备本地偏好**，读写直接走 store + 持久化插件，
 * 不经过请求层。理由见 types/settings.ts：同一个账号在手机和平板上
 * 可能想要不同的设置，同步到服务端反而添乱。
 *
 * ── 为什么 switch 的配置用计算属性而不是写死数组 ──────────────────────
 * 开关的「当前值」和「变更处理」都必须来自 store，
 * 写成一个静态数组的话，每次 store 变化都要手动重建这个数组，
 * 很容易漏掉某一项导致开关显示的状态和真实值不一致。
 * ══════════════════════════════════════════════════════════════════════
 */

const settingsStore = useSettingsStore()
const userStore = useUserStore()
const { settings } = settingsStore

/**
 * switch 的 change 事件。
 *
 * 这个类型是在迁就 vue-tsc 的模板检查：它按 DOM 的 Event 类型校验
 * 事件处理器，而 DOM 的 Event 上并没有 detail 字段（那是小程序与 uni
 * 在 Event 之上扩展出来的），所以 `detail` 只能声明成可选。
 *
 * `type` 字段本身用不到，它的存在是为了满足 TS 的弱类型检查：
 * 一个所有属性都可选的接口属于「弱类型」，只有当源类型至少有一个
 * 同名属性时才允许赋值——Event 上恰好没有 detail，于是报
 * 「no properties in common」。补上一个 Event 确实拥有的 `type`
 * 就能让检查通过，同时这个属性在运行时也真实存在，不算凭空捏造。
 *
 * 取值处仍然要判空，见下面每处的注释。
 */
interface SwitchChangeEvent {
  type: string
  detail?: { value: boolean }
}

/**
 * 开关项配置。
 *
 * onChange 里统一用 `if (e.detail)` 而不是 `e.detail?.value ?? false`：
 * 前者在拿不到 detail 时**不做任何事**，后者会把开关强制设成 false。
 * 万一某个平台的事件结构不同，前者是「开关没反应」，后者是
 * 「用户想打开，结果被设成了关闭」——后者的表现更像 bug，也更难解释。
 */
const switchItems = computed(() => [
  {
    key: 'vibration',
    label: '震动反馈',
    desc: '训练结束时震动一次，作为成绩已生成的触觉提示',
    value: settings.vibration,
    onChange: (e: SwitchChangeEvent) => {
      if (e.detail) settingsStore.setVibration(e.detail.value)
    },
  },
  {
    key: 'sound',
    label: '音效',
    desc: '当前版本暂无音频资源，开关会在后续版本生效',
    value: settings.sound,
    onChange: (e: SwitchChangeEvent) => {
      if (e.detail) settingsStore.setSound(e.detail.value)
    },
  },
  {
    key: 'autoSave',
    label: '训练后自动保存',
    desc: '关闭后成绩需要手动点「保存成绩」才会入库',
    value: settings.autoSave,
    onChange: (e: SwitchChangeEvent) => {
      if (e.detail) settingsStore.setAutoSave(e.detail.value)
    },
  },
])

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'dark', label: '暗色' },
  { value: 'light', label: '亮色' },
]

const versionText = computed(() =>
  USE_MOCK ? '压枪训练助手 v1.0.0 · 本地演示环境' : '压枪训练助手 v1.0.0',
)

/* ── 危险操作 ── */

/**
 * 清除缓存。
 *
 * ⚠️ 这会连登录凭证一起清掉，用户退出后需要重新静默登录——
 * 而在 mock 环境下，设备标识也一并被清除，重新登录会得到一个**新账号**，
 * 之前（已经清掉的）记录不会回来。文案必须说清楚这一点，
 * 否则用户会以为「清缓存只是清图片，成绩还在云端」。
 *
 * 清完之后用 reLaunch 重建整个应用而不是就地刷新：
 * 内存里的 store 还持有已经被删掉的数据，逐个 reset 容易漏，
 * 重启一次是最不容易出错的做法。
 */
function handleClearCache(): void {
  uni.showModal({
    title: '清除缓存',
    content: '将清空本机的训练记录、灵敏度方案与登录状态，且无法恢复。确定继续吗？',
    confirmText: '清除',
    confirmColor: '#EF4444',
    success: (res) => {
      if (!res.confirm) return

      clearAppStorage()

      // 先把登录态在内存里也清掉，避免重启过程中有请求带着旧 token 发出去
      userStore.logout()

      uni.showToast({ title: '已清除', icon: 'success' })

      // 重启到首页。延迟一点让 toast 能被看到——
      // reLaunch 会立即销毁当前页面，toast 挂在页面上会一起消失
      setTimeout(() => {
        uni.reLaunch({ url: '/pages/index/index' })
      }, 600)
    },
  })
}

function handleResetSettings(): void {
  uni.showModal({
    title: '恢复默认设置',
    content: '只会重置震动、音效、主题等偏好，不会影响训练记录',
    success: (res) => {
      if (!res.confirm) return
      settingsStore.resetToDefault()
      uni.showToast({ title: '已恢复默认', icon: 'none' })
    },
  })
}
</script>
