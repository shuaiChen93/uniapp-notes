<template>
  <x-page-shell title="我的">
    <!-- ── 用户卡片 ── -->
    <view class="flex items-center rounded-panel bg-bg-card p-4" @click="handleUserCardClick">
      <x-user-avatar
        :src="userStore.userInfo?.avatar"
        :name="userStore.isLoggedIn ? userStore.displayName : ''"
        :seed="userStore.userInfo?.id"
        :size="56"
      />

      <view class="ml-4 flex-1">
        <text class="text-lg font-medium text-content-primary">
          {{ userStore.isLoggedIn ? userStore.displayName : '未登录' }}
        </text>

        <text v-if="userStore.isLoggedIn" class="mt-1 block text-xs text-content-secondary">
          账号 {{ shortUserId }} · {{ loginTypeLabel }}
        </text>
        <text v-else class="mt-1 block text-xs text-content-secondary">
          点这里登录后可同步成绩、参与好友排行
        </text>
      </view>

      <text :class="userStore.isLoggedIn ? 'text-xs text-content-muted' : 'text-sm text-brand'">
        {{ userStore.isLoggedIn ? '编辑资料' : '去登录' }}
      </text>
    </view>

    <!-- ── 训练数据概览 ──
         数据本身在阶段 3 接入，此处先把版式与责任方确定下来：
         概览只读训练记录 store，不做任何计算，
         避免「同一份统计在多个页面各算一遍、口径还不一致」 -->
    <view class="mt-3 flex rounded-panel bg-bg-card py-4">
      <view v-for="stat in stats" :key="stat.label" class="flex-1 items-center">
        <text class="block text-center text-lg font-medium text-content-primary">
          {{ stat.value }}
        </text>
        <text class="mt-1 block text-center text-2xs text-content-muted">{{ stat.label }}</text>
      </view>
    </view>

    <!-- ── 功能入口 ── -->
    <view class="mt-3 overflow-hidden rounded-panel bg-bg-card">
      <view
        v-for="(entry, index) in menus"
        :key="entry.path"
        class="flex items-center px-4 py-3 active:bg-bg-elevated"
        :class="{ 'border-t border-bg-elevated': index > 0 }"
        @click="goPage(entry.path)"
      >
        <text class="flex-1 text-base text-content-primary">{{ entry.label }}</text>
        <text class="text-xs text-content-muted">{{ entry.desc }}</text>
      </view>
    </view>

    <!-- ── 退出登录 ── -->
    <view
      v-if="userStore.isLoggedIn"
      class="mt-4 flex items-center justify-center rounded-card bg-bg-card py-3 active:bg-bg-elevated"
      @click="handleLogout"
    >
      <text class="text-base text-danger">退出登录</text>
    </view>

    <text class="mt-6 block text-center text-2xs text-content-muted">
      {{ versionText }}
    </text>
  </x-page-shell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { USE_MOCK } from '@/constants/config'
import { useUserStore } from '@/store'
import type { LoginType } from '@/types'
import { silentLogin } from '@/utils/request'

/**
 * 我的页
 * ══════════════════════════════════════════════════════════════════════
 * 关于登录态，这里有一个容易被忽略的细节：
 *
 * 正常情况下用户**看不到「未登录」这个状态**——应用启动时
 * App.vue 就已经静默登录完成（wx.login 不需要用户授权）。
 * 所以本页默认永远是已登录的，直接显示昵称和头像。
 *
 * 「未登录」只在两种情况下出现：
 *   ① 用户主动点过退出登录；
 *   ② 静默登录失败（appid 未配置、断网、用户拒绝授权）。
 * 这两种情况才需要显示登录引导。
 * ══════════════════════════════════════════════════════════════════════
 */

const userStore = useUserStore()

/** 页面实例内只做一次登录态检查，避免每次 onShow 都打一次接口 */
let sessionChecked = false

onShow(async () => {
  if (sessionChecked) return
  sessionChecked = true

  // 没有凭证时补一次静默登录。
  // 正常情况 App.vue 启动时已经做完了，这里是兜底：
  // 比如启动那一刻正好断网，用户走到本页时网络已经恢复。
  // 用户主动登出过的话，silentLogin 内部会自己跳过，不会把他登回来。
  if (!userStore.isLoggedIn) {
    await silentLogin()
  }

  // 校验一次凭证。accessToken 过期时走无感刷新，用户全程无感知
  await userStore.restoreSession()
})

/* ── 展示数据 ── */

/** 训练数据概览：阶段 3 接入真实统计后替换这里的占位值 */
const stats = [
  { label: '训练场次', value: '--' },
  { label: '最佳评级', value: '--' },
  { label: '平均偏移', value: '--' },
]

const menus = [
  { label: '灵敏度方案', desc: '按枪械与倍镜配置', path: '/pages-sub/sensitivity/index' },
  { label: '排行榜', desc: '看看别人打得怎么样', path: '/pages-sub/rank/index' },
  { label: '设置', desc: '震动、音效、缓存', path: '/pages-sub/settings/index' },
]

/** 用户 ID 太长，卡片上只展示尾 8 位——足够区分身份，又不会撑破布局 */
const shortUserId = computed(() => {
  const id = userStore.userInfo?.id ?? ''
  return id.length > 8 ? id.slice(-8) : id
})

const LOGIN_TYPE_LABEL: Record<LoginType, string> = {
  wechat: '微信登录',
  guest: '游客登录',
}

const loginTypeLabel = computed(() => {
  const type = userStore.userInfo?.loginType
  return type ? LOGIN_TYPE_LABEL[type] : ''
})

const versionText = computed(() =>
  USE_MOCK ? '压枪训练助手 v1.0.0 · 本地演示环境' : '压枪训练助手 v1.0.0',
)

/* ── 交互 ── */

/**
 * 点击用户卡片。
 *
 * 已登录 → 去个人资料页（改头像昵称）；
 * 未登录 → 去登录页（兜底入口，正常情况下走不到）。
 */
function handleUserCardClick(): void {
  goPage(userStore.isLoggedIn ? '/pages-sub/profile/index' : '/pages/login/index')
}

function goPage(path: string): void {
  uni.navigateTo({ url: path })
}

/**
 * 退出登录。
 *
 * 必须二次确认：退出不可撤销（本地凭证会被清除），
 * 且退出后不会再自动登录，用户需要自己点回来。
 */
function handleLogout(): void {
  uni.showModal({
    title: '退出登录',
    content: '退出后需要手动登录，训练记录仍保留在本机',
    confirmColor: '#EF4444',
    success: (res) => {
      if (!res.confirm) return
      userStore.logout()
      uni.showToast({ title: '已退出登录', icon: 'none' })
    },
  })
}
</script>
