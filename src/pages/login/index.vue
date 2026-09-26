<template>
  <view class="relative flex min-h-screen flex-col overflow-hidden bg-bg-base">
    <!--
      背景光晕。用内联 style 写径向渐变而不是 Tailwind 的 blur 系列类：
      小程序对 CSS filter 的支持在不同渲染引擎下并不一致，
      而径向渐变是各端都稳的基础能力，装饰性效果不值得为它引入兼容风险。
    -->
    <view
      class="pointer-events-none absolute inset-x-0 top-0 h-80"
      :style="{
        background:
          'radial-gradient(circle at 50% 0%, rgba(255, 107, 26, 0.18), transparent 70%)',
      }"
    />

    <!-- 顶部：返回按钮（自适应状态栏高度） -->
    <view class="relative z-10" :style="{ paddingTop: `${statusBarHeight}px` }">
      <view class="flex h-11 items-center px-4">
        <view
          v-if="canGoBack"
          class="flex h-8 w-8 items-center justify-center rounded-full active:bg-bg-elevated"
          @click="goBack"
        >
          <!-- 纯 CSS 画的左箭头：旋转 45° 的 L 形描边。零图片依赖，且能跟随主题色 -->
          <view
            class="border-b-2 border-l-2 border-content-primary"
            :style="{ width: '8px', height: '8px', transform: 'rotate(45deg)' }"
          />
        </view>
      </view>
    </view>

    <!-- 品牌区 -->
    <view class="relative z-10 flex flex-1 flex-col items-center justify-center px-8">
      <!-- Logo：准星图形，同样全部用 CSS 绘制 -->
      <view
        class="relative flex items-center justify-center rounded-full"
        :style="{
          width: '88px',
          height: '88px',
          backgroundImage: 'linear-gradient(135deg, #FF8F4D, #D9540B)',
          boxShadow: '0 12px 32px rgba(255, 107, 26, 0.35)',
        }"
      >
        <!-- 内圈：细白描边，做出瞄准镜的层次感 -->
        <view
          :style="{
            position: 'absolute',
            width: '56px',
            height: '56px',
            borderRadius: '9999px',
            border: '1px solid rgba(255, 255, 255, 0.45)',
          }"
        />
        <!-- 准星横线 -->
        <view
          :style="{
            position: 'absolute',
            width: '40px',
            height: '2px',
            background: 'rgba(255, 255, 255, 0.95)',
          }"
        />
        <!-- 准星竖线 -->
        <view
          :style="{
            position: 'absolute',
            width: '2px',
            height: '40px',
            background: 'rgba(255, 255, 255, 0.95)',
          }"
        />
      </view>

      <text class="mt-6 text-2xl font-medium text-content-primary">压枪训练助手</text>
      <text class="mt-2 text-sm text-content-secondary">
        科学分析后坐力，练出稳定弹道
      </text>

      <!-- 能力清单：登录页是唯一会被「未登录用户」完整看到的页面，
           在这里把核心价值讲清楚，比堆一张插画更有说服力 -->
      <view class="mt-10 w-full">
        <view
          v-for="item in features"
          :key="item"
          class="mb-3 flex items-center rounded-card bg-bg-card px-4 py-3"
        >
          <view class="mr-3 rounded-full bg-brand" :style="{ width: '6px', height: '6px' }" />
          <text class="text-sm text-content-secondary">{{ item }}</text>
        </view>
      </view>
    </view>

    <!-- 底部：登录按钮 -->
    <view class="relative z-10 px-8" :style="{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 32px)' }">
      <button
        class="flex h-12 w-full items-center justify-center rounded-card text-base font-medium text-white active:opacity-90"
        :style="{ backgroundImage: 'linear-gradient(135deg, #07C160, #06AD56)' }"
        :disabled="logging"
        @click="handleLogin('wechat')"
      >
        <!-- #ifdef MP-WEIXIN -->
        <text>微信一键登录</text>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <text>一键登录</text>
        <!-- #endif -->
      </button>

      <view class="mt-3 flex justify-center" @click="handleLogin('guest')">
        <text class="text-sm text-content-secondary active:text-content-primary">
          先随便逛逛（游客模式）
        </text>
      </view>

      <text class="mt-6 block text-center text-2xs text-content-muted">
        {{ hintText }}
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { USE_MOCK } from '@/constants/config'
import { useUserStore } from '@/store'
import type { LoginType } from '@/types'
import { resolveLoginCode } from '@/utils/login-code'

/**
 * 登录页（兜底页）
 * ══════════════════════════════════════════════════════════════════════
 * ⚠️ 这不是登录的必经之路。
 *
 * 正常情况下用户**永远看不到这个页面**：小程序的 wx.login 完全静默，
 * 应用启动时 App.vue 就已经把登录做完了（见 utils/request.ts 的 silentLogin）。
 * 登录态中途失效时，请求层也会先尝试静默重登，同样不需要用户参与。
 *
 * 只有两种情况会走到这里：
 *   ① 静默登录也失败了（appid 未配置、用户拒绝授权、网络异常）；
 *   ② 用户主动退出登录后，想重新登录。
 *
 * 因此本页的定位是「兜底」而非「入口」——它的存在是为了
 * 保证任何异常情况下用户都有路可走，而不是给用户加一道流程。
 *
 * 页面只负责拿到 code，剩下的交给 store：
 *   resolveLoginCode → userStore.login(code) → api → request → mock 服务端
 * ══════════════════════════════════════════════════════════════════════
 */

const userStore = useUserStore()

const logging = ref(false)

const { statusBarHeight = 0 } = uni.getWindowInfo()

/** 页面栈里还有上一页才显示返回按钮（直接进入登录页时无处可返回） */
const canGoBack = getCurrentPages().length > 1

/** 登录页是未登录用户唯一会完整看到的页面，把能力清单摆在这里 */
const features = [
  '记录每一发的弹道偏移，量化你的压枪手感',
  '按枪械与倍镜给出灵敏度方案，照着调就行',
  '训练记录本地留存，换设备前可随时导出',
]

const hintText = computed(() =>
  USE_MOCK
    ? '当前为本地演示环境，登录不涉及真实微信授权'
    : '登录即表示同意《用户协议》与《隐私政策》',
)

/* ── 交互 ── */

async function handleLogin(loginType: LoginType): Promise<void> {
  if (logging.value) return
  logging.value = true

  try {
    const code = await resolveLoginCode(loginType)
    await userStore.login(code, loginType)

    uni.showToast({ title: '登录成功', icon: 'success' })
    // 稍等一下再跳转：toast 与页面跳转同时触发时，
    // 部分安卓机型上跳转动画会盖掉 toast，用户看不到登录成功的反馈
    setTimeout(goBackAfterLogin, 600)
  } catch (err) {
    // 错误提示已由 request 层统一弹出（toastError），这里只负责恢复按钮可用
    console.error('[login] 登录失败：', err)
  } finally {
    logging.value = false
  }
}

/**
 * 登录成功后的去向。
 *
 * 优先返回上一页：用户大概率是点了「我的」里的登录按钮过来的，
 * 回到原页面才符合预期。
 * 若登录页是页面栈底（直接启动进登录页），则切到首页 tab。
 */
function goBackAfterLogin(): void {
  if (getCurrentPages().length > 1) {
    uni.navigateBack()
    return
  }
  uni.switchTab({ url: '/pages/index/index' })
}

function goBack(): void {
  uni.navigateBack()
}
</script>
