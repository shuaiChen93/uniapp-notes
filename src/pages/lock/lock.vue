<template>
  <!--
    锁屏页不使用 x-page-shell：它是全屏界面，没有导航栏，
    也不该出现系统返回——解锁是继续使用应用的前提。

    v-if="ready" 是「决策完成前不渲染任何内容」：
    本页同时是启动页，关闭了密码锁的用户每次冷启动都会落到这里，
    而让路的判断在 onLoad 里——若不做这层保护，那一瞬间会先画出
    一屏「设置密码」再跳走，看起来像页面在抽搐。
    page 的背景色已在 App.vue 里设好，空白期不会露白。
  -->
  <view
    v-if="ready"
    class="flex min-h-screen flex-col bg-bg-base"
    :style="{ paddingTop: `${topPadding}px` }"
  >
    <!--
      ── 顶部返回 ──
      只有「从设置页主动进来」时才显示。
      启动即锁页（冷启动、全局拦截）时页面栈里只有本页，此时不显示返回——
      没有密码就进不去应用，这正是「私密感」的来源；
      而设置页跳进来时用户本来就是来改设置的，硬拦着不让他反悔反而莫名其妙。
    -->
    <view class="flex h-11 items-center px-3">
      <view
        v-if="canCancel && mode !== 'verify'"
        class="flex h-11 w-11 items-center justify-center active:opacity-60"
        @click="handleCancel"
      >
        <text class="text-2xl leading-none text-content-primary">‹</text>
      </view>
    </view>

    <!-- ── 标题 ── -->
    <view class="mt-4 px-10">
      <text class="block text-xl font-medium text-content-primary">{{ title }}</text>
      <text class="mt-2 block text-sm text-content-secondary">{{ subtitle }}</text>
    </view>

    <!--
      ── 密码圆点 ──
      shake 类通过 :class 切换触发抖动：动画播完后由定时器移除类名，
      否则第二次输错时类名没变化，浏览器不会重播动画。
    -->
    <view class="mt-12 flex justify-center" :class="{ shake }">
      <view
        v-for="index in PIN_LENGTH"
        :key="index"
        class="mx-2 h-3.5 w-3.5 rounded-full border-2 transition-colors"
        :class="index <= input.length ? 'border-brand bg-brand' : 'border-content-muted'"
      />
    </view>

    <!-- ── 提示区：高度固定，避免出现错误文案时把圆点和键盘顶得上下跳动 ── -->
    <view class="mt-8 flex h-6 items-center justify-center">
      <text v-if="errorText" class="text-sm text-danger">{{ errorText }}</text>
    </view>

    <!-- ── 忘记密码：只在解锁模式出现，设置模式下重置数据没有意义 ── -->
    <view v-if="mode === 'verify'" class="mt-6 flex justify-center" @click="handleForgot">
      <text class="text-sm text-content-secondary">忘记密码？</text>
    </view>

    <!--
      ── 忘记当前密码（修改密码的第一段）──
      这里刻意不给「清空并重置」的入口：能走到这一步的人已经解锁了
      （他就站在设置页里），而设置页有一个不需要密码的「关闭密码锁」开关——
      关掉再重新开启同样能换一个新密码，且一条记事都不会丢。
      把「清空全部数据」摆在一条有更温和替代方案的路上，只会帮倒忙。
    -->
    <view v-else-if="mode === 'change'" class="mt-6 px-10">
      <text class="block text-center text-2xs leading-relaxed text-content-muted">
        忘记当前密码？可回到设置页关闭密码锁，再重新开启——记事不会丢失。
      </text>
    </view>

    <!--
      ── 隐私声明（设置模式）──
      在用户**即将把密码定下来**的这一刻说清三件事：
      数据存在哪、会不会上传、忘了能不能找回。
      放在这里而不是只写在设置页：这是他第一次做出安全承诺的界面，
      也是唯一有动机读完这几行字的时候——设置页里的声明，
      用户往往在出问题之后才会想起来去翻。
    -->
    <view v-else class="mt-6 px-10">
      <text class="block text-center text-2xs leading-relaxed text-content-muted">
        密码与记事只保存在本机，不会上传到任何服务器。密码无法找回，请牢记。
      </text>
    </view>

    <!--
      ── 数字键盘 ──
      mt-auto 把键盘压到屏幕底部：这是密码类界面的惯例，拇指自然落点就在下方。
      自绘而不用 input：拉起系统键盘会占掉半个屏幕，且键盘样式不可控。
    -->
    <view class="safe-bottom mt-auto">
      <view class="border-t border-bg-elevated">
        <view
          v-for="(row, rowIndex) in KEY_ROWS"
          :key="rowIndex"
          class="flex"
          :class="{ 'border-t border-bg-elevated': rowIndex > 0 }"
        >
          <view
            v-for="key in row"
            :key="key.value"
            class="flex h-16 flex-1 items-center justify-center"
            :class="key.value ? 'active:bg-bg-elevated' : ''"
            @click="handleKey(key.value)"
          >
            <text class="text-2xl" :class="key.value === 'del' ? 'text-content-secondary' : 'text-content-primary'">
              {{ key.label }}
            </text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * 密码锁页 —— 设置 / 二次确认 / 校验三种模式共用
 * ══════════════════════════════════════════════════════════════════════
 * ── 为什么三种模式共用一个页面 ────────────────────────────────────────
 * 数字键盘、圆点指示器、输入处理这三块占了本页 90% 的代码，
 * 而三种模式的差别只有「文案 + 满 6 位之后做什么」。
 * 拆成三个页面会让这三块代码复制三份，于是「键盘的某个交互改了
 * 但只改了其中一个页面」这类不一致迟早会出现。
 *
 * ── 进入方式决定了退路 ────────────────────────────────────────────────
 *   全局拦截（App.vue）—— reLaunch 进来，页面栈里只有本页，解锁后回首页；
 *   设置页主动进入   —— navigateTo 进来，可返回，设置完成后回到设置页。
 * 两条路径的差异只在「结束后去哪」，输入逻辑完全一致。
 * ══════════════════════════════════════════════════════════════════════
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  LOCK_MODE_CHANGE,
  LOCK_MODE_PARAM,
  LOCK_MODE_SETUP,
  PIN_LENGTH,
  SHAKE_DURATION,
} from '@/constants/lock'
import { ROUTES } from '@/constants/routes'
import { DANGER_COLOR } from '@/constants/ui'
import { useLockStore, useNotesStore, useSettingsStore } from '@/store'
import { hasPin } from '@/utils/lock'
import { goBack } from '@/utils/navigate'
import { clearAppStorage } from '@/utils/storage'
import type { LockMode } from '@/types'

const lockStore = useLockStore()
const notesStore = useNotesStore()
const settingsStore = useSettingsStore()

/**
 * 状态栏安全区：本页没有导航栏，标题直接顶到状态栏会很难看。
 * 再额外加一段留白，让标题不至于紧贴状态栏。
 */
const { statusBarHeight = 0 } = uni.getWindowInfo()
const topPadding = statusBarHeight + 24

/* ── 输入状态 ── */

const mode = ref<LockMode>('verify')
/** 决策是否已完成。为 false 时整页不渲染，理由见模板里的说明 */
const ready = ref(false)
/** 是否允许放弃设置密码（从设置页进来时为 true） */
const canCancel = ref(false)
const input = ref('')
/** setup 模式第一遍的输入，用于与第二遍比对 */
const firstPin = ref('')
/**
 * 本次设置是不是「修改密码」流程。
 *
 * 修改密码时 mode 会经历 change → setup → confirm，与首次设置
 * 走的是同一条路。两者的差别只剩「成功后的文案」（密码已修改 /
 * 密码已设置），用一个标记记下来，比把 mode 拆成六个值划算得多。
 */
const isChange = ref(false)
const errorText = ref('')
const shake = ref(false)
/** 防重复提交：满 6 位会自动提交，用户手快连点两下不能触发两次校验 */
const submitting = ref(false)

/* ── 键盘布局 ── */

/**
 * 键盘按键。
 *
 * 做成「行 × 列」的二维结构而不是一维数组：一维数组要靠取模判断
 * 什么时候换行，改布局时极易错位；二维结构在模板里直接双循环展开，
 * 与看到的键盘完全对应。
 *
 * 空白键位保留 value 为空串的占位项，而不是用 CSS 让最后一个键换行——
 * 保底布局（第 4 行是「空 / 0 / 删除」）是数字键盘的通用习惯，
 * 显式写出来比依赖换行行为可靠。
 */
const KEY_ROWS: Array<Array<{ value: string; label: string }>> = [
  [
    { value: '1', label: '1' },
    { value: '2', label: '2' },
    { value: '3', label: '3' },
  ],
  [
    { value: '4', label: '4' },
    { value: '5', label: '5' },
    { value: '6', label: '6' },
  ],
  [
    { value: '7', label: '7' },
    { value: '8', label: '8' },
    { value: '9', label: '9' },
  ],
  [
    { value: '', label: '' },
    { value: '0', label: '0' },
    { value: 'del', label: '⌫' },
  ],
]

/* ── 文案 ── */

const title = computed(() => {
  if (mode.value === 'change') return '验证当前密码'
  if (mode.value === 'setup') return isChange.value ? '设置新密码' : '设置密码'
  if (mode.value === 'confirm') return '确认新密码'
  return '请输入密码'
})

const subtitle = computed(() => {
  if (mode.value === 'change') return '验证通过后即可设置新密码'
  if (mode.value === 'setup') {
    return isChange.value ? `请输入新的 ${PIN_LENGTH} 位数字密码` : `请输入 ${PIN_LENGTH} 位数字密码`
  }
  if (mode.value === 'confirm') return '请再次输入以确认'
  return '解锁你的私密记事本'
})

/* ── 生命周期 ── */

onLoad((query) => {
  /**
   * 本次进入是不是「启动即锁页」。
   *
   * 判据是页面栈里有没有上一页，而不是某个需要层层传下来的参数：
   *   · 冷启动（锁页是 pages.json 的第一项）→ 栈里只有本页；
   *   · 全局拦截（App.vue 用 reLaunch 跳来）→ reLaunch 清空页面栈，同样只有本页；
   *   · 从设置页主动进来（navigateTo）→ 栈里有上一页。
   * 用栈长度判断，两条路径的差异不需要额外传参，也不会因为漏传而失效。
   */
  const isEntry = getCurrentPages().length <= 1

  /**
   * 密码锁已被用户关掉：本页只是启动页，直接让路。
   *
   * ⚠️ 只在 isEntry 时让路。从设置页跳进来「开启密码锁」时，
   * lockEnabled 同样是 false（要等他设完密码才会被置为 true），
   * 若不加这个条件，用户点「开启」会被立刻弹回首页，开关永远打不开。
   */
  if (isEntry && !lockStore.enabled) {
    uni.reLaunch({ url: ROUTES.HOME })
    return
  }

  /**
   * 从 URL 参数决定进哪个模式。
   *
   * 用显式的取值而不是「不是 setup 就是 verify」的两分支写法：
   * 多出 change 之后，那种写法会把 change 悄悄归到 verify 上，
   * 表现为「点修改密码，进去却要求解锁」——功能没坏，但完全不对。
   */
  const requested: LockMode =
    query?.[LOCK_MODE_PARAM] === LOCK_MODE_SETUP
      ? 'setup'
      : query?.[LOCK_MODE_PARAM] === LOCK_MODE_CHANGE
        ? 'change'
        : 'verify'

  /**
   * 本地没有密码时，无论传什么模式都强制进入设置模式。
   *
   * 这是对「编译模式直达本页」「用户手动改了 URL」这类非正常入口的兜底：
   * 若此时停在 verify 模式，用户面对的是一个永远验证不通过、
   * 也没有返回按钮可用的界面——只能靠忘记密码清空数据才能脱身。
   */
  mode.value = hasPin() ? requested : 'setup'

  /**
   * 只有「本地确实有密码，且用户是来改密码的」才算修改流程。
   *
   * 取 mode 的最终值而不是 requested：上面那句兜底可能把 change
   * 降级成 setup（本地没有密码时），此时它就不再是「修改」了，
   * 文案要跟着回到首次设置——否则用户会看到「设置新密码」之后
   * 跟着一句「密码已修改」，而本机在此之前根本没有密码。
   */
  isChange.value = mode.value === 'change'

  /**
   * 只有「有人把本页推上来」时才允许放弃。
   *
   * 启动即锁页时不给退路：没设密码就进不去应用。
   * 这条规则本身就是「私密感」的一部分——如果设置密码的界面能一键跳过，
   * 那它和没有密码锁的区别，只在用户愿不愿意多点一下。
   */
  canCancel.value = !isEntry

  ready.value = true
})

/* ── 输入处理 ── */

function handleKey(value: string): void {
  // 抖动动画播放期间忽略输入：此时正在提示上一次失败，
  // 继续吃键会让用户的输入与看到的圆点数对不上
  if (shake.value || submitting.value) return
  if (!value) return

  // 任何一次新输入都清掉上一次的错误提示，否则提示会一直挂在那里，
  // 用户无法判断它说的是刚才那次还是这一次
  errorText.value = ''

  if (value === 'del') {
    input.value = input.value.slice(0, -1)
    return
  }

  if (input.value.length >= PIN_LENGTH) return
  input.value += value

  // 满位自动提交：比让用户再找一次「确定」按钮少一步操作，
  // 而这一步在密码界面里是纯粹的多余动作
  if (input.value.length === PIN_LENGTH) void submit()
}

/** 触发失败反馈：清空输入 + 抖动 + 文案 */
function fail(message: string): void {
  input.value = ''
  errorText.value = message
  shake.value = true

  // 动画结束后移除类名，让下次失败还能重新触发。
  // 时长必须与下方 <style> 里的 animation-duration 一致（见 constants/lock.ts）
  setTimeout(() => {
    shake.value = false
  }, SHAKE_DURATION)
}

async function submit(): Promise<void> {
  if (submitting.value) return

  const pin = input.value
  submitting.value = true

  try {
    /* ── 第一遍：记下来，切到确认模式 ── */
    if (mode.value === 'setup') {
      firstPin.value = pin
      input.value = ''
      mode.value = 'confirm'
      return
    }

    /* ── 第二遍：比对 ── */
    if (mode.value === 'confirm') {
      if (pin !== firstPin.value) {
        // 不一致时回到第一遍重设，而不是停在确认模式让用户反复猜
        // 「刚才第一次输的是什么」——后者用户根本无从得知
        firstPin.value = ''
        mode.value = 'setup'
        fail('两次输入不一致，请重新设置')
        return
      }

      await lockStore.enable(pin)
      handleSetupDone()
      return
    }

    /* ── 校验：verify（解锁）与 change（改密码的第一步）共用同一段 ── */
    const ok = await lockStore.verify(pin)
    if (!ok) {
      fail('密码错误，请重试')
      return
    }

    /**
     * 修改密码：当前密码通过后**不**跳首页，而是转入设置新密码。
     *
     * 两条路在此分叉，之后 setup → confirm 完全共用——
     * 改密码与首次设置的差别，仅在于「第一段输入的是什么」。
     */
    if (mode.value === 'change') {
      input.value = ''
      firstPin.value = ''
      mode.value = 'setup'
      uni.showToast({ title: '验证通过', icon: 'none' })
      return
    }

    // 解锁：拦截是 reLaunch 进来的，栈里只有本页，因此直接回首页
    uni.reLaunch({ url: ROUTES.HOME })
  } finally {
    submitting.value = false
  }
}

/* ── 流程出口 ── */

function handleSetupDone(): void {
  uni.showToast({ title: isChange.value ? '密码已修改' : '密码已设置', icon: 'success' })

  // 延迟跳转：reLaunch / navigateBack 会立刻销毁本页，
  // 挂在页面上的 toast 会一起消失，用户根本看不到设置成功的反馈
  setTimeout(() => goBack(), 600)
}

/** 放弃设置密码（仅设置模式可触发） */
function handleCancel(): void {
  goBack()
}

/**
 * 忘记密码。
 *
 * 文案必须诚实：说清楚「密码找不回来」以及「数据会一起没」。
 * 这是整个应用中唯一一处会删光用户全部数据的地方，
 * 用一句含糊的「将重置应用」把它包装得轻描淡写是不负责任的。
 */
function handleForgot(): void {
  uni.showModal({
    title: '忘记密码',
    content:
      '密码只以加密哈希的形式保存在本机，没有任何人能还原它，因此无法找回。\n\n继续操作会清空本机保存的全部记事、设置与密码，且无法撤销。',
    confirmText: '清空并重置',
    confirmColor: DANGER_COLOR,
    cancelText: '再想想',
    success: (res) => {
      if (!res.confirm) return

      wipeAllData()
      uni.showToast({ title: '已清空，请设置新密码', icon: 'none' })
      resetToSetup()
    },
  })
}

/**
 * 回到「设置密码」的初始状态。
 *
 * 用在清空数据之后：resetToDefault 会把密码锁恢复成默认的「开启」，
 * 此时本地已经没有密码了，应用正处在「锁开着但没有凭据」的状态。
 * 跳回首页会留出一段「应用没有任何防护」的窗口，而下一次切回前台
 * 又会突然弹出设置密码——不如就地要求他设一个新的，
 * 前后逻辑才是自洽的（这与全新安装时看到的界面完全一致）。
 */
function resetToSetup(): void {
  mode.value = 'setup'
  // 清空数据后是**首次设置**，不是修改——文案跟着回到「密码已设置」
  isChange.value = false
  input.value = ''
  firstPin.value = ''
  errorText.value = ''
  shake.value = false
}

/**
 * 清空全部本地数据。
 *
 * ⚠️ 顺序是「先内存、后磁盘」，不能反：
 * 这些 store 的写入是同步落盘的，先清 storage 的话，紧接着的
 * resetToDefault / clearAll 会把默认值重新写回 storage——
 * 看似无害，但如果将来某个 reset 实现里带了数据（比如保留主题），
 * 就会在用户已经被告知「全部清空」之后悄悄留下东西。
 * 先清内存再清磁盘，最终状态一定是干净的。
 */
function wipeAllData(): void {
  notesStore.clearAll()
  settingsStore.resetToDefault()
  lockStore.reset()
  clearAppStorage()
}
</script>

<style lang="scss" scoped>
/**
 * 底部安全区。
 *
 * iPhone 的 Home Indicator 会压住键盘最后一行的一部分，
 * 不做避让的话「0」和「⌫」在全面屏机型上会贴着屏幕底边，
 * 既不美观也影响点击。
 *
 * 写两遍是兼容性要求：constant() 是 iOS 11.0~11.2 的写法，
 * env() 是 11.2 之后的标准，后来的会覆盖前面的。
 */
.safe-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}

/**
 * 密码错误时的抖动。
 *
 * ⚠️ 时长 400ms 必须与 constants/lock.ts 的 SHAKE_DURATION 保持一致——
 * 那个常量负责在动画播完后移除类名，两者不同步会导致
 * 「类名移除得比动画早（抖动被截断）」或「移除得比动画晚（这段时间内输不进数字）」。
 */
@keyframes lock-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-16rpx);
  }
  40% {
    transform: translateX(16rpx);
  }
  60% {
    transform: translateX(-10rpx);
  }
  80% {
    transform: translateX(10rpx);
  }
}

.shake {
  animation: lock-shake 400ms ease-in-out;
}
</style>
