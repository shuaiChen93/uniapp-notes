<template>
  <x-page-shell title="个人资料">
    <!-- ── 头像 ── -->
    <view class="rounded-panel bg-bg-card p-4">
      <text class="text-sm text-content-secondary">头像</text>

      <view class="mt-4 flex flex-col items-center">
        <!-- #ifdef MP-WEIXIN -->
        <!--
          ⚠️ 必须用 <button open-type="chooseAvatar">。
          这是微信目前**唯一**合规获取用户头像的方式：
          外层换成 <view> 或 <image> 都不会触发，点击毫无反应。

          微信早已回收了 wx.getUserInfo / wx.getUserProfile /
          <button open-type="getUserInfo"> 这些老接口，
          它们现在会静默返回「微信用户」和灰色默认头像，且不报任何错。
          因此头像和昵称只能由用户主动选择，无法静默获取。
        -->
        <button
          class="flex flex-col items-center"
          open-type="chooseAvatar"
          @chooseavatar="onChooseAvatar"
        >
          <x-user-avatar
            :src="form.avatar"
            :name="form.nickname"
            :seed="userStore.userInfo?.id"
            :size="72"
          />
          <text class="mt-3 text-xs text-brand">点击更换头像</text>
        </button>
        <!-- #endif -->

        <!-- #ifndef MP-WEIXIN -->
        <!--
          非小程序端没有 chooseAvatar 能力，头像只读。
          这里不做「点击上传」的假交互：H5 端没有对象存储可传，
          做了也只能存成本地 blob，换个浏览器就没了。
        -->
        <x-user-avatar
          :src="form.avatar"
          :name="form.nickname"
          :seed="userStore.userInfo?.id"
          :size="72"
        />
        <text class="mt-3 text-xs text-content-muted">头像仅支持在微信小程序内更换</text>
        <!-- #endif -->
      </view>
    </view>

    <!-- ── 昵称 ── -->
    <view class="mt-3 rounded-panel bg-bg-card p-4">
      <text class="text-sm text-content-secondary">昵称</text>

      <input
        class="mt-3 h-10 w-full rounded-card bg-bg-elevated px-3 text-base text-content-primary"
        :type="nicknameInputType"
        :value="form.nickname"
        :maxlength="NICKNAME_MAX_LENGTH"
        placeholder="请输入昵称"
        placeholder-class="text-content-muted"
        @input="onNicknameInput"
        @blur="onNicknameBlur"
      />

      <text class="mt-2 block text-2xs text-content-muted">
        {{ nicknameHint }}
      </text>
    </view>

    <!-- ── 保存 ── -->
    <button
      class="mt-6 flex h-12 w-full items-center justify-center rounded-card text-base font-medium text-white active:opacity-90"
      :style="{ backgroundImage: 'linear-gradient(135deg, #FF8F4D, #D9540B)' }"
      :disabled="saving"
      @click="handleSave"
    >
      <text>保存</text>
    </button>
  </x-page-shell>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useUserStore } from '@/store'
import type { UpdateProfileParams } from '@/types'

/**
 * 个人资料
 * ══════════════════════════════════════════════════════════════════════
 * 这个页面存在的原因，是微信的隐私策略决定的：
 *
 * 用户的头像和昵称**无法静默获取**。微信先后回收了 wx.getUserInfo、
 * wx.getUserProfile、<button open-type="getUserInfo"> 三代接口，
 * 现在唯一合规的路径是「头像昵称填写能力」——由用户主动点一下头像、
 * 主动选一次昵称，小程序才能拿到。
 *
 * 注意这和「登录」是两件事：
 *   登录（wx.login）是静默的，用户无感，所以打开小程序就已登录完成；
 *   头像昵称是用户资料，必须用户主动提供，所以放在这个页面里由他决定。
 *
 * 因此本页是**可选的**：用户不进来，账号照常用，只是显示默认昵称和文字头像。
 * ══════════════════════════════════════════════════════════════════════
 */

const userStore = useUserStore()

/** 昵称长度上限，与微信「头像昵称填写能力」的限制一致 */
const NICKNAME_MAX_LENGTH = 30

/**
 * 昵称输入框的类型。
 *
 * `type="nickname"` 是微信提供的特殊输入类型：用户聚焦时，
 * 键盘上方会直接展示他的微信昵称，点一下就填进来了——
 * 比手打方便，也是用户更愿意配合的交互。
 *
 * 非小程序端没有这个能力，退回普通文本输入。
 */
const nicknameInputType = ref('text')

// #ifdef MP-WEIXIN
nicknameInputType.value = 'nickname'
// #endif

const nicknameHint = computed(() =>
  nicknameInputType.value === 'nickname'
    ? '可直接选择微信昵称，最多 30 个字符'
    : '最多 30 个字符',
)

/**
 * 表单。
 *
 * 用本地副本而不是直接绑 store：用户改到一半退出时，
 * store 里的正式数据不该被这些未保存的改动污染。
 */
const form = reactive({
  nickname: userStore.userInfo?.nickname ?? '',
  avatar: userStore.userInfo?.avatar ?? '',
})

const saving = ref(false)

/* ── 头像 ── */

/**
 * 用户选完头像。
 *
 * e.detail.avatarUrl 是**临时文件路径**（形如 wxfile://...），
 * 不是可以直接长期使用的 URL。真实项目必须在保存前用 uni.uploadFile
 * 把它上传到自己的对象存储，换成永久地址再提交——否则这次会话结束后
 * 头像就变成裂图了。
 *
 * 本项目没有后端和对象存储，mock 层直接把临时路径存了下来，
 * 因此重启小程序后可能失效。x-user-avatar 对此做了兜底：
 * 图片加载失败时自动退回文字头像，界面不会出现破图。
 */
function onChooseAvatar(e: { detail: { avatarUrl: string } }): void {
  form.avatar = e.detail.avatarUrl
}

/* ── 昵称 ── */

/**
 * 从 uni 事件对象里取出输入值。
 *
 * 这里必须做类型断言，原因是编译期类型和运行时形状对不上：
 * 模板里的 <input> 在 vue-tsc 眼里是浏览器的 HTMLInputElement，
 * blur/input 事件被推导成 DOM 的 FocusEvent / InputEvent；
 * 而实际运行时（小程序和 H5 都是）传进来的是 uni 的事件对象，
 * 值在 e.detail.value 里。DOM 事件没有 detail.value，两者无法自动对齐。
 *
 * 参数类型写成 Event（DOM 事件的基类）而不是具体形状：
 * 函数参数是逆变的，只有声明成超类型才能赋值给 DOM 事件要求的签名。
 */
function readInputValue(e: Event): string {
  const detail = (e as unknown as { detail?: { value?: string } }).detail
  return detail?.value ?? ''
}

function onNicknameInput(e: Event): void {
  form.nickname = readInputValue(e)
}

/**
 * 失焦时再取一次值。
 *
 * 微信的 nickname 输入框有个已知行为：键盘上方选中的昵称
 * 不一定会通过 input 事件同步过来，值只在失焦时才最终确定。
 * 只监听 input 的话，小程序端会出现「明明选了昵称却没保存上」。
 */
function onNicknameBlur(e: Event): void {
  form.nickname = readInputValue(e)
}

/* ── 保存 ── */

async function handleSave(): Promise<void> {
  if (saving.value) return

  const nickname = form.nickname.trim()
  if (!nickname) {
    uni.showToast({ title: '昵称不能为空', icon: 'none' })
    return
  }

  // 只提交真正改动过的字段。
  // 真实后端可能对头像做转存处理，把没变的字段一起提交纯属浪费，
  // 也会让「上传头像」这种重操作被无谓触发
  const patch: UpdateProfileParams = {}
  if (nickname !== userStore.userInfo?.nickname) patch.nickname = nickname
  if (form.avatar !== userStore.userInfo?.avatar) patch.avatar = form.avatar

  if (!patch.nickname && !patch.avatar) {
    uni.showToast({ title: '资料没有变化', icon: 'none' })
    return
  }

  saving.value = true
  try {
    await userStore.updateProfile(patch)
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 600)
  } catch (err) {
    // 错误提示由 request 层统一弹出，这里只恢复按钮可用
    console.error('[profile] 保存失败：', err)
  } finally {
    saving.value = false
  }
}
</script>
