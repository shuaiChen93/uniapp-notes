<template>
  <x-page-shell title="设置" show-back>
    <!-- ════════════ 安全 ════════════ -->
    <text class="block px-1 pb-2 text-2xs text-content-muted">安全</text>

    <view class="overflow-hidden rounded-panel bg-bg-card px-4">
      <view class="flex min-h-14 items-center py-3">
        <view class="mr-4 flex-1">
          <text class="block text-base text-content-primary">密码锁</text>
          <text class="mt-0.5 block text-2xs leading-relaxed text-content-muted">
            {{ lockEnabled ? '每次打开都需要输入 6 位密码' : '未开启，任何人打开都能直接看到记事' }}
          </text>
        </view>

        <!--
          自绘开关，而不是小程序的 <switch>。
          三个理由：
            ① 原生 switch 的颜色只能写死十六进制（它由原生层绘制，
               读不到页面里的 CSS 变量），切到暗色主题时会留下一颗
               颜色不搭的绿钮；
            ② 原生 switch 的勾选状态是它自己维持的：用户拨到「开」
               之后我们会跳去设置密码，如果他中途放弃返回，
               开关会停在「开」而数据里仍是「关」——界面在撒谎；
            ③ 本开关的动作有两步（跳转 → 设密码成功才算开），
               必须完全由数据驱动，不能有原生控件自己的一份状态。
        -->
        <view
          class="h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors"
          :class="lockEnabled ? 'bg-brand' : 'bg-bg-elevated'"
          @click="handleLockToggle"
        >
          <view
            class="h-6 w-6 rounded-full bg-white shadow transition-transform"
            :class="lockEnabled ? 'translate-x-5' : 'translate-x-0'"
          />
        </view>
      </view>

      <!--
        修改密码。
        只在锁开着时出现——没有密码可改的时候摆一行点进去只会被
        要求「先设置密码」，那是另一件事（开关本身就是那个入口）。
      -->
      <view
        v-if="lockEnabled"
        class="flex h-14 items-center justify-between border-t border-bg-elevated active:bg-bg-elevated"
        @click="goChangePin"
      >
        <text class="text-base text-content-primary">修改密码</text>
        <text class="text-lg leading-none text-content-muted">›</text>
      </view>
    </view>

    <!--
      锁开着的时候才提示一句「密码忘了会怎样」。
      放在这里而不是常驻：没开锁的用户读到这段话只会觉得莫名其妙，
      而开了锁的用户本来就应该知道这件事，却往往在忘记之后才去找。

      这里给的是**不丢数据**的那条路（关掉锁再重开一个），因为能读到
      这句话的人已经站在设置页里了；至于「连应用都进不去」时只能清空数据，
      锁屏页的「忘记密码」弹窗自会说明——两处的受众不一样，不必都说全。
    -->
    <text v-if="lockEnabled" class="mt-2 block px-1 text-2xs leading-relaxed text-content-muted">
      密码只以哈希形式保存在本机，无法找回。忘记后可在本页关闭密码锁，再重新开启并设一个新密码——记事不会丢。
    </text>

    <!-- ════════════ 外观 ════════════ -->
    <text class="mt-6 block px-1 pb-2 text-2xs text-content-muted">外观</text>

    <view class="overflow-hidden rounded-panel bg-bg-card px-4">
      <view
        v-for="(option, index) in THEME_OPTIONS"
        :key="option.value"
        class="flex h-14 items-center justify-between active:bg-bg-elevated"
        :class="index < THEME_OPTIONS.length - 1 ? 'border-b border-bg-elevated' : ''"
        @click="settingsStore.setTheme(option.value)"
      >
        <text class="text-base text-content-primary">{{ option.label }}</text>
        <!-- 选中态用勾而不是「单选框」：小程序没有原生 radio 的样式可用，
             自绘圆点既要处理边框又要在两种主题下都看得清，成本高于收益 -->
        <text v-if="theme === option.value" class="text-base text-brand">✓</text>
      </view>
    </view>

    <!-- ════════════ 关于 ════════════ -->
    <text class="mt-6 block px-1 pb-2 text-2xs text-content-muted">关于</text>

    <view class="overflow-hidden rounded-panel bg-bg-card px-4">
      <view class="flex h-14 items-center justify-between border-b border-bg-elevated">
        <text class="text-base text-content-primary">已存记事</text>
        <text class="text-sm text-content-secondary">{{ notesStore.total }} 条</text>
      </view>
      <view class="flex h-14 items-center justify-between border-b border-bg-elevated">
        <text class="text-base text-content-primary">数据存储</text>
        <text class="text-sm text-content-secondary">仅本机</text>
      </view>
      <view class="flex h-14 items-center justify-between">
        <text class="text-base text-content-primary">版本</text>
        <text class="text-sm text-content-secondary">{{ APP_VERSION }}</text>
      </view>
    </view>

    <!-- ════════════ 隐私说明 ════════════ -->
    <!--
      这段文字是需求里明确要求的「隐私声明」，三件事必须都在：
      存在哪（本地）、会不会上传（不会）、忘了能不能找回（不能）。
      它同时也是这个应用的安全边界说明书——第 ③ 条尤其重要，
      因为它说的是一件对用户不利、但对开发者免责的实话：
      不写清楚，用户会以为「有密码 = 内容被加密了」。
    -->
    <text class="mt-6 block px-1 pb-2 text-2xs text-content-muted">隐私说明</text>

    <view class="rounded-panel bg-bg-card p-4">
      <view v-for="(item, index) in PRIVACY_ITEMS" :key="item.title" :class="index > 0 ? 'mt-4' : ''">
        <text class="block text-sm font-medium text-content-primary">{{ item.title }}</text>
        <text class="mt-1 block text-2xs leading-relaxed text-content-secondary">{{ item.desc }}</text>
      </view>
    </view>

    <!-- 底部留白：最后一段文字贴着屏幕底边、紧挨 Home Indicator 会很难读 -->
    <view class="h-8" />
  </x-page-shell>
</template>

<script setup lang="ts">
/**
 * 设置页
 * ══════════════════════════════════════════════════════════════════════
 * ── 这一版做了什么 ────────────────────────────────────────────────────
 *   ① 密码锁开关：开启 → 跳锁页设置密码；关闭 → 二次确认后清除凭据；
 *   ② 修改密码：跳锁页验证当前密码后再设新的；
 *   ③ 主题切换（浅色 / 深色）；
 *   ④ 关于与隐私声明。
 *
 * 头像与昵称**暂缓**（需求方确认可以后置）：它们是纯装饰性功能，
 * 而本页真正要解决的是「用户能不能自己控制密码锁」——
 * 没有这个开关，用户一旦设了密码，就只剩「忘记密码清空数据」
 * 一条路可以取消它。
 *
 * ── 开关为什么不是直接改 lockEnabled ──────────────────────────────────
 * lockEnabled 的含义是「本地是否存有密码凭据」（见 types/settings.ts），
 * 它不是用户随手拨的一个标记。所以：
 *   开启 —— 只是跳去锁页，开关本身不动；等锁页真的把 salt/hash 写进
 *           storage 后，lockStore.enable() 才会把它置为 true。
 *   关闭 —— 直接调 lockStore.disable()，它会同时清掉凭据和标记。
 * 若在这里图省事直接 patch({ lockEnabled: true })，得到的会是一个
 * 「锁开着但没有密码」的状态：启动拦截要求输密码，而本地根本没有
 * 密码可以校验——用户被永久关在门外，且没有任何界面能救回来。
 * ══════════════════════════════════════════════════════════════════════
 */
import { computed } from 'vue'
import { APP_VERSION } from '@/constants/app'
import { LOCK_MODE_CHANGE, LOCK_MODE_PARAM, LOCK_MODE_SETUP } from '@/constants/lock'
import { ROUTES } from '@/constants/routes'
import { DANGER_COLOR } from '@/constants/ui'
import { useLockStore, useNotesStore, useSettingsStore } from '@/store'
import type { ThemeMode } from '@/types'

const settingsStore = useSettingsStore()
const lockStore = useLockStore()
const notesStore = useNotesStore()

const lockEnabled = computed(() => settingsStore.settings.lockEnabled)
const theme = computed(() => settingsStore.settings.theme)

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
]

/**
 * 隐私声明。
 *
 * 写进常量数组而不是直接铺在模板里：三条的排版完全一样，
 * 拆开后新增一条只需要加一行数据，不用复制一段带类名的模板。
 */
const PRIVACY_ITEMS = [
  {
    title: '数据只存在本机',
    desc: '全部记事、密码与设置都保存在你自己的手机里，不会上传到任何服务器。本应用没有后端，也不获取你的手机号或微信 OpenID。卸载小程序或清除小程序数据，记事会一并消失且无法恢复。',
  },
  {
    title: '密码无法找回',
    desc: '密码经过加盐哈希后才保存，本机不保留任何形式的明文，任何人都无法还原它——包括开发者。忘记密码只能通过锁屏页的「忘记密码」清空全部本地数据后重新开始。',
  },
  {
    title: '记事正文未加密',
    desc: '密码锁是一道界面上的门，挡住的是「别人拿到你已解锁的手机随手翻看」。记事本身以明文保存在本地存储中，若设备被 root/越狱或存储文件被提取，内容可以被直接读到。请勿用它保存极度敏感的信息。',
  },
]

/**
 * 拨动密码锁开关。
 *
 * 这里不发「目标状态」而是直接判断当前状态：界面上的开关已经是
 * 由 lockEnabled 单向驱动的，点击只表达「我想要相反的状态」，
 * 不需要再从事件里取一次值。
 */
function handleLockToggle(): void {
  if (lockEnabled.value) {
    confirmDisable()
    return
  }

  // 开启：交给锁页去设密码。用 navigateTo 而不是 reLaunch，
  // 这样用户设完（或放弃）之后能回到本页继续改别的设置
  uni.navigateTo({ url: `${ROUTES.LOCK}?${LOCK_MODE_PARAM}=${LOCK_MODE_SETUP}` })
}

/**
 * 去锁页修改密码。
 *
 * 用 change 而不是 setup：这条路必须先验证当前密码。
 * 不验的话，任何人拿到一部已解锁的手机就能直接换掉密码——
 * 那等于绕过了「手机被别人翻看」这个密码锁唯一要防的场景。
 */
function goChangePin(): void {
  uni.navigateTo({ url: `${ROUTES.LOCK}?${LOCK_MODE_PARAM}=${LOCK_MODE_CHANGE}` })
}

/**
 * 关闭密码锁前的确认。
 *
 * 文案里那句「已写下的记事不会被删除」不是客套：
 * 「关闭密码」在用户听来很像「重置」，不说清楚的话，
 * 想临时关掉锁的人会因为怕丢数据而不敢点。
 */
function confirmDisable(): void {
  uni.showModal({
    title: '关闭密码锁',
    content:
      '关闭后会删除本机保存的密码，任何人打开本应用都能直接看到你的记事。\n\n已写下的记事不会被删除。',
    confirmText: '关闭',
    confirmColor: DANGER_COLOR,
    cancelText: '取消',
    success: (res) => {
      if (!res.confirm) return

      lockStore.disable()
      uni.showToast({ title: '密码锁已关闭', icon: 'none' })
    },
  })
}
</script>
