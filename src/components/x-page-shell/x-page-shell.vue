<template>
  <!--
    主题 class 挂在这一层：它是页面内容的根节点，
    CSS 变量在这里被覆盖后会继承给整棵子树，
    页面里的 bg-bg-card / text-content-primary 随之取到新色值。
  -->
  <view class="min-h-screen bg-bg-base" :class="theme">
    <!--
      自定义导航栏。
      pages.json 里所有页面都设了 `navigationStyle: "custom"`，
      原生导航栏会被移除，必须自绘——否则首行内容会直接顶到状态栏（刘海/挖孔）下面。

      ⚠️ 原生导航栏被关掉后，**页面就失去了自带的返回按钮**。
      凡是从首页跳进来的二级页面（编辑 / 详情 / 设置），都必须传 show-back，
      否则用户只能靠手势返回——而 iOS 的手势返回在没有原生导航栏时也不可用，
      等于把人困在页面里。这是自绘导航栏最容易踩的坑。
    -->
    <view class="bg-bg-card" :style="{ paddingTop: `${statusBarHeight}px` }">
      <view
        class="flex h-11 items-center px-2"
        :style="{ paddingRight: `${headerRightPadding}px` }"
      >
        <view
          v-if="showBack"
          class="flex h-11 w-11 shrink-0 items-center justify-center active:opacity-60"
          @click="handleBack"
        >
          <!-- 用字符而非图片画返回箭头：省一张图片资源，且能随主题变色 -->
          <text class="text-2xl leading-none text-content-primary">‹</text>
        </view>

        <text
          class="min-w-0 flex-1 truncate text-base font-medium text-content-primary"
          :class="showBack ? 'text-left' : 'text-center'"
        >
          {{ title }}
        </text>

        <!--
          右侧操作区。
          宽度交给内容决定，但外层始终占位——若用 v-if 隐藏，
          标题的可用宽度会在「有无按钮」之间跳变，切换页面时会看到标题横向位移。
        -->
        <view class="flex h-11 shrink-0 items-center justify-end">
          <slot name="right" />
        </view>
      </view>
    </view>

    <view class="p-4">
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
/**
 * x-page-shell —— 页面外壳
 * ══════════════════════════════════════════════════════════════════════
 * 这个组件同时承担三个职责：
 *
 * ① 复用：统一「状态栏安全区 + 自定义头部 + 返回按钮」的骨架，
 *    避免每个页面各写一遍 paddingTop 计算（这是小程序最常见的一类视觉不一致来源）。
 *
 * ② 主题：把主题 class 挂在页面根节点上。放在外壳里而不是每个页面各写一遍，
 *    是为了让「新增页面」这件事默认就是支持换肤的——
 *    漏挂的页面在暗色主题下会保持浅色，而这种 bug 只有切到暗色才看得见。
 *
 * ③ 验证 easycom：本组件**没有**被任何页面 import，全靠 pages.json 里的
 *    `"^x-(.*)": "@/components/x-$1/x-$1.vue"` 规则自动注册。
 *    如果 easycom 配置写错了，这里会立刻编译失败而不是等到上线才发现。
 * ══════════════════════════════════════════════════════════════════════
 */
import { computed } from 'vue'
import { useSettingsStore } from '@/store'
import { themeClass } from '@/utils/theme'
import { goBack } from '@/utils/navigate'
import { getHeaderRightPadding } from '@/utils/system'

const props = withDefaults(
  defineProps<{
    /** 头部标题 */
    title?: string
    /** 是否显示返回按钮。二级页面必须为 true，理由见模板注释 */
    showBack?: boolean
    /**
     * 本页是否会在 #right 插槽里放按钮。
     *
     * 需要显式声明而不是自动探测插槽：
     * 小程序端没有「插槽是否有内容」的可靠运行时判断，
     * 靠探测很容易在某个平台上失效，而失效的表现是
     * 「按钮被微信胶囊盖住点不到」——只在真机上复现。
     */
    right?: boolean
    /**
     * 由父页面接管返回动作。
     *
     * 置为 true 时，点击返回只发出 back 事件，不做任何跳转，
     * 由父页面决定后续（典型用法：编辑页有未保存内容时先弹确认框）。
     *
     * 同样采用「显式声明」而非自动探测父组件有没有监听 back 事件：
     * uni-app 编译到小程序后，自定义组件的事件监听不会保留在 vnode 上，
     * 靠探测判断会得到一个「永远为假」的结果——表现为确认框根本不弹，
     * 而这正是这个 prop 想要防止的问题。
     */
    interceptBack?: boolean
  }>(),
  { title: '', showBack: false, right: false, interceptBack: false },
)

const emit = defineEmits<{ back: [] }>()

const settingsStore = useSettingsStore()
const theme = computed(() => themeClass(settingsStore.settings.theme))

/**
 * 状态栏高度。
 *
 * 为什么必须动态取、不能写死：
 * iOS 刘海屏约 44px、老机型 20px、安卓挖孔屏 24~36px 不等，
 * 写死任何一个值都会在另一批机型上出现「标题被状态栏压住」或「顶部留白过大」。
 *
 * 用 getWindowInfo 而非 getSystemInfoSync：
 * 后者已标记废弃，且会同步返回屏幕/设备/网络等一大堆用不上的字段，
 * 在小程序启动期是实打实的耗时。getWindowInfo 只返回窗口尺寸，
 * 且是 uni 官方推荐的新 API（H5 端同样有实现，返回 0，不影响 Web 展示）。
 */
const { statusBarHeight = 0 } = uni.getWindowInfo()

/**
 * 头部右侧内边距。
 *
 * 只有本页真的会在右侧放按钮时才去避让胶囊——否则首页那种
 * 居中标题会被无谓地推偏（微信胶囊的避让宽度接近 100px，肉眼很明显）。
 */
const headerRightPadding = computed(() => (props.right || props.showBack ? getHeaderRightPadding() : 12))

/**
 * 返回上一页。
 *
 * 页面栈判断与兜底跳转统一交给 goBack 处理（理由见 utils/navigate.ts）。
 * 这里只负责决定「是交给父页面还是自己处理」。
 */
function handleBack(): void {
  if (props.interceptBack) {
    emit('back')
    return
  }
  goBack()
}
</script>
