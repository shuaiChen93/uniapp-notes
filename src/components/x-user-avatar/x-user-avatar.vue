<template>
  <view
    class="flex items-center justify-center overflow-hidden rounded-full"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      backgroundImage: showImage ? undefined : gradient,
    }"
  >
    <!-- 有真实头像就用图片，加载失败自动退回文字头像（见 onImageError 的说明） -->
    <image
      v-if="showImage"
      :src="src"
      mode="aspectFill"
      :style="{ width: `${size}px`, height: `${size}px` }"
      @error="onImageError"
    />

    <text
      v-else
      class="font-medium text-white"
      :style="{ fontSize: `${fontSize}px`, lineHeight: `${size}px` }"
    >
      {{ initial }}
    </text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * 文字头像
 * ══════════════════════════════════════════════════════════════════════
 * 关于样式隔离（排查过一次，结论记在这里，避免重复踩）：
 *
 * 微信小程序的组件默认 `styleIsolation: isolated`，按官方文档的说法
 * 「app.wxss 中的样式对自定义组件无效」——照此推演，本组件里的
 * `flex` / `items-center` 这些 Tailwind 类应该全部失效。
 * 但实测并非如此：uni-app 的小程序运行时在 parseComponent 里
 * 默认给每个组件设了 `addGlobalClass: true`（等价于 apply-shared），
 * 见 node_modules/@dcloudio/uni-mp-weixin/dist/uni.mp.esm.js。
 * 因此 app.wxss 里的 Tailwind 产物对组件是生效的，无需额外配置。
 *
 * ── 为什么不用 <image :src="user.avatar"> ──────────────────────────────
 * 本项目的 mock 环境里 avatar 恒为空串，而小程序加载网络图片必须先在
 * 微信后台配置 downloadFile 合法域名（且必须是 https 备案域名）。
 * 这会让项目在别人机器上 clone 下来就跑不起来——一个头像不该有这种成本。
 *
 * 改用「昵称首字 + 渐变底」，在排行榜、训练记录这类会密集出现头像的位置
 * 反而比真实头像更整齐（没有五花八门的图片破坏视觉节奏）。
 * 将来接入真实头像时，只需在本组件内部加一个 image 分支，
 * 所有调用点无需改动。
 * ══════════════════════════════════════════════════════════════════════
 */
const props = withDefaults(
  defineProps<{
    /** 昵称，取首字作为头像文字 */
    name?: string
    /**
     * 头像图片地址。为空时显示文字头像。
     *
     * ⚠️ 小程序端这里要传**永久地址**。
     * chooseAvatar 返回的是 wxfile:// 开头的临时文件路径，
     * 重启小程序后就会被清理掉——真实项目必须先把临时文件上传到自己的
     * 对象存储、换成永久 URL 再保存（见 pages-sub/profile 的说明）。
     * 本项目的 mock 环境直接把临时路径存了下来，因此重启后可能加载失败，
     * 由下面的兜底逻辑接管。
     */
    src?: string
    /** 直径（px），与设计稿 1:1 对应 */
    size?: number
    /**
     * 用于挑选底色的标识（一般传用户 ID）。
     * 同一个用户每次渲染都要得到同一个颜色，所以只能由 ID 决定，
     * 不能用随机数——否则页面一刷新头像就换个颜色。
     */
    seed?: string
  }>(),
  { name: '', src: '', size: 48, seed: '' },
)

/**
 * 图片是否加载失败。
 *
 * 为什么需要它：头像地址来自服务端，可能失效——
 * 本项目的 mock 环境存的是临时文件路径，重启小程序后必然失效；
 * 真实项目里用户换了头像、CDN 地址变更也会出现同样的情况。
 *
 * 不做兜底的话，用户会看到一个破图占位符，比没有头像更难看。
 * 这里退回到文字头像，视觉上始终是完整的。
 */
const loadFailed = ref(false)

// 地址一变就重新给一次机会：用户刚换完头像时，
// 若沿用上一张图的失败状态，新头像会显示不出来
watch(
  () => props.src,
  () => {
    loadFailed.value = false
  },
)

function onImageError(): void {
  loadFailed.value = true
}

const showImage = computed(() => Boolean(props.src) && !loadFailed.value)

/** 渐变底色池。取自项目调色板，保证与整体暗色战术风一致 */
const GRADIENTS = [
  'linear-gradient(135deg, #FF8F4D, #D9540B)',
  'linear-gradient(135deg, #60A5FA, #2563EB)',
  'linear-gradient(135deg, #34D399, #059669)',
  'linear-gradient(135deg, #A78BFA, #7C3AED)',
  'linear-gradient(135deg, #F472B6, #DB2777)',
  'linear-gradient(135deg, #FBBF24, #D97706)',
]

/**
 * 由 seed 稳定地映射到一个渐变色。
 * 用字符码累加取模，而不是 hashCode()——后者在小程序端不存在。
 */
const gradient = computed(() => {
  const key = props.seed || props.name || ''
  if (!key) return GRADIENTS[0]

  let sum = 0
  for (let i = 0; i < key.length; i += 1) {
    sum += key.charCodeAt(i)
  }
  return GRADIENTS[sum % GRADIENTS.length]
})

/**
 * 首字。
 * 用 Array.from 按码点切分而不是 name[0]：
 * 直接下标会把 emoji、生僻字这类「代理对」截断成半个字符，渲染出方框。
 */
const initial = computed(() => {
  if (!props.name) return '?'
  return Array.from(props.name)[0] ?? '?'
})

/** 字号取直径的 42%，是文字头像里视觉重心最稳的比例 */
const fontSize = computed(() => Math.round(props.size * 0.42))
</script>
