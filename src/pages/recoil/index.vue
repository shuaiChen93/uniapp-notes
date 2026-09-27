<template>
  <view class="relative flex h-screen flex-col overflow-hidden bg-bg-base" :class="theme">
    <!-- ── 顶部标题（自定义导航栏，避开状态栏） ── -->
    <view class="bg-bg-card" :style="{ paddingTop: `${statusBarHeight}px` }">
      <view class="flex h-11 items-center justify-center">
        <text class="text-base font-medium text-content-primary">压枪测试</text>
      </view>
    </view>

    <!-- ── 配装摘要条：点一下换枪换配件 ── -->
    <view
      class="flex items-center justify-between border-b border-bg-elevated bg-bg-card px-4 py-2.5"
      :class="firing ? 'opacity-50' : 'active:bg-bg-elevated'"
      @click="openConfig()"
    >
      <view class="flex-1">
        <text class="text-xs text-content-primary">{{ summary }}</text>
        <text class="mt-0.5 block text-2xs text-content-muted">
          开火镜头灵敏度 {{ firingSensitivity }}
        </text>
      </view>
      <text class="ml-3 text-xs text-brand">{{ firing ? '训练中' : '更换配装' }}</text>
    </view>

    <!--
      ── 靶场 ─────────────────────────────────────────────────────────────
      整块区域就是开火键：按住开始射击，手指下滑模拟压枪。
      没有单独做一个「开火按钮」，因为真实的压枪操作里，
      开火与压枪本就是同一只手的同一个动作，拆成两个区域反而不像在压枪。

      touchmove 必须 .prevent：H5 端手指下滑会触发页面滚动，
      采样点会被滚动位置污染。小程序端虽然已在 pages.json 里设了
      disableScroll，但 H5 端不吃那个配置，两边都处理才一致。
    -->
    <view
      class="relative flex-1 overflow-hidden"
      @touchstart="onTouchStart"
      @touchmove.stop.prevent="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <!-- 靶心环。半径 18px 是 tolerance=1 时的命中半径，三环依次向外 -->
      <view
        class="absolute left-1/2 top-1/2 h-[108px] w-[108px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-bg-elevated"
      />
      <view
        class="absolute left-1/2 top-1/2 h-[72px] w-[72px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-bg-elevated"
      />
      <view
        class="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand"
      />
      <!-- 靶心点 -->
      <view
        class="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand"
      />

      <!--
        弹着点。
        坐标是「上为正」的数学坐标系，而屏幕是「下为正」，
        所以 top 用减法。差值在模板里直接算，避免为每个点建一个中间对象。
      -->
      <view
        v-for="point in impacts"
        :key="point.index"
        class="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        :class="point.hit ? 'bg-rating-s' : 'bg-content-muted'"
        :style="{
          left: `calc(50% + ${point.x.toFixed(1)}px)`,
          top: `calc(50% - ${point.y.toFixed(1)}px)`,
        }"
      />

      <!-- 最近一发的准星标记：让用户知道子弹正打在哪儿 -->
      <view
        v-if="firing && lastImpact"
        class="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        :style="{
          left: `calc(50% + ${lastImpact.x.toFixed(1)}px)`,
          top: `calc(50% - ${lastImpact.y.toFixed(1)}px)`,
        }"
      />

      <!-- 未开始时的引导文案 -->
      <view
        v-if="!firing && !result"
        class="absolute inset-x-0 bottom-8 flex flex-col items-center"
      >
        <text class="text-sm text-content-secondary">按住屏幕开始射击</text>
        <text class="mt-1 text-xs text-content-muted">手指向下滑动模拟压枪</text>
      </view>

      <!-- 训练中：实时偏移读数 -->
      <view v-if="firing" class="absolute inset-x-0 top-3 flex justify-center">
        <view class="rounded-card bg-bg-card px-4 py-1.5">
          <text class="text-xs text-content-secondary">
            已射 {{ impacts.length }} 发 · 偏移 {{ currentOffsetText }}
          </text>
        </view>
      </view>
    </view>

    <!--
      ── 底部控制区 ───────────────────────────────────────────────────────
      训练结束后这里就地换成结果面板，而不是弹一个居中弹窗——
      弹窗会把刚打出来的弹道整个盖住，而那恰恰是用户最想看的东西。
    -->
    <view class="bg-bg-card px-4 pb-6 pt-4">
      <!-- 状态一：训练中 / 待开始，显示进度 -->
      <view v-if="!result">
        <view class="h-1.5 w-full overflow-hidden rounded-full bg-bg-elevated">
          <view
            class="h-full rounded-full bg-brand transition-all"
            :style="{ width: `${progress}%` }"
          />
        </view>
        <view class="mt-2 flex items-center justify-between">
          <text class="text-2xs text-content-muted">
            {{ firing ? `${(elapsed / 1000).toFixed(1)}s` : '准备就绪' }}
          </text>
          <text class="text-2xs text-content-muted">
            {{ (TRAINING_DURATION / 1000).toFixed(0) }}s
          </text>
        </view>
      </view>

      <!-- 状态二：成绩 -->
      <view v-else>
        <view class="flex items-center justify-between">
          <x-rating-badge :rating="result.rating" size="lg" />
          <view class="items-end">
            <view class="flex items-baseline">
              <text class="text-3xl font-medium text-content-primary">{{ result.score }}</text>
              <text class="ml-1 text-xs text-content-muted">分</text>
            </view>
            <text class="text-2xs text-content-muted">{{ ratingMeta.label }}</text>
          </view>
        </view>

        <view class="mt-3">
          <x-stat-grid :items="resultStats" />
        </view>

        <!-- 时长不足时不提供保存：把一次误触存成成绩，会让趋势图出现一个假的低谷 -->
        <view v-if="!canSave" class="mt-3 rounded-card bg-bg-elevated px-3 py-2">
          <text class="text-2xs text-content-muted">
            训练时长不足 1 秒，本次不计入记录
          </text>
        </view>

        <view class="mt-4 flex gap-3">
          <view
            class="flex-1 rounded-card bg-bg-elevated py-3 active:opacity-80"
            @click="resetTraining()"
          >
            <text class="block text-center text-sm text-content-secondary">再来一次</text>
          </view>

          <!-- 已入库（手动保存过，或训练结束时自动保存成功） -->
          <view v-if="saved" class="flex-1 rounded-card bg-bg-elevated py-3">
            <text class="block text-center text-sm text-content-muted">已保存</text>
          </view>

          <view
            v-else-if="canSave"
            class="flex-1 rounded-card bg-brand py-3 active:opacity-90"
            :class="saving ? 'opacity-60' : ''"
            @click="handleSave()"
          >
            <text class="block text-center text-sm text-white">
              {{ saving ? '保存中…' : '保存成绩' }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <!--
      ── 配装面板 ─────────────────────────────────────────────────────────
      用整屏覆盖层而不是底部弹层：选项总共二十多个，底部弹层要么做很高
      （和弹窗没区别），要么做内部滚动（小程序里嵌套滚动的体验很差）。
    -->
    <view v-if="configVisible" class="absolute inset-0 z-40 flex flex-col bg-bg-base">
      <view class="relative bg-bg-card" :style="{ paddingTop: `${statusBarHeight}px` }">
        <!--
          右侧按钮必须让开微信胶囊，否则「完成」会被那颗原生按钮整个盖住、
          点不到（H5 端没有胶囊，所以只在真机上暴露）。避让宽度见 utils/system.ts。
          左侧不用让：胶囊只占右上角。
        -->
        <view
          class="flex h-11 items-center justify-between pl-4"
          :style="{ paddingRight: `${headerRightPadding}px` }"
        >
          <text class="text-sm text-content-secondary" @click="closeConfig()">取消</text>
          <text class="text-sm text-brand" @click="closeConfig()">完成</text>
        </view>

        <!--
          标题单独抽成一层绝对定位，是为了让它相对**整个屏幕**居中。
          若继续留在按钮行里，右侧让开胶囊后可用宽度变窄，标题会跟着左偏，
          看起来像排版错位。
          pointer-events-none 不能省：这层压在按钮行之上，否则会挡住点击。
        -->
        <view
          class="pointer-events-none absolute inset-x-0 bottom-0 flex h-11 items-center justify-center"
        >
          <text class="text-base font-medium text-content-primary">配装</text>
        </view>
      </view>

      <scroll-view scroll-y class="flex-1">
        <view class="p-4">
          <!-- 枪械 -->
          <text class="text-xs text-content-muted">枪械</text>
          <view class="mt-2 flex flex-wrap gap-2">
            <view
              v-for="weapon in WEAPONS"
              :key="weapon.id"
              class="rounded-card border-2 px-3 py-2"
              :class="
                loadout.weaponId === weapon.id
                  ? 'border-brand bg-bg-elevated'
                  : 'border-transparent bg-bg-card'
              "
              @click="loadout.weaponId = weapon.id"
            >
              <text
                class="text-sm"
                :class="loadout.weaponId === weapon.id ? 'text-brand' : 'text-content-secondary'"
              >
                {{ weapon.name }}
              </text>
            </view>
          </view>

          <!-- 倍镜。需求指定 2|3|4|6|8 五档 -->
          <text class="mt-5 block text-xs text-content-muted">倍镜</text>
          <view class="mt-2 flex flex-wrap gap-2">
            <view
              v-for="scope in SCOPES"
              :key="scope.id"
              class="rounded-card border-2 px-3 py-2"
              :class="
                loadout.scopeId === scope.id
                  ? 'border-brand bg-bg-elevated'
                  : 'border-transparent bg-bg-card'
              "
              @click="loadout.scopeId = scope.id"
            >
              <text
                class="text-sm"
                :class="loadout.scopeId === scope.id ? 'text-brand' : 'text-content-secondary'"
              >
                {{ scope.name }}
              </text>
            </view>
          </view>

          <!-- 距离 -->
          <text class="mt-5 block text-xs text-content-muted">距离</text>
          <view class="mt-2 flex flex-wrap gap-2">
            <view
              v-for="distance in DISTANCES"
              :key="distance"
              class="rounded-card border-2 px-3 py-2"
              :class="
                loadout.distance === distance
                  ? 'border-brand bg-bg-elevated'
                  : 'border-transparent bg-bg-card'
              "
              @click="loadout.distance = distance"
            >
              <text
                class="text-sm"
                :class="loadout.distance === distance ? 'text-brand' : 'text-content-secondary'"
              >
                {{ distance }}m
              </text>
            </view>
          </view>

          <!-- 靶型 -->
          <text class="mt-5 block text-xs text-content-muted">靶型</text>
          <view class="mt-2">
            <view
              v-for="target in TARGETS"
              :key="target.id"
              class="mb-2 rounded-card border-2 px-3 py-2.5"
              :class="
                loadout.targetId === target.id
                  ? 'border-brand bg-bg-elevated'
                  : 'border-transparent bg-bg-card'
              "
              @click="loadout.targetId = target.id"
            >
              <text
                class="text-sm"
                :class="loadout.targetId === target.id ? 'text-brand' : 'text-content-secondary'"
              >
                {{ target.name }}
              </text>
              <text class="mt-0.5 block text-2xs text-content-muted">{{ target.desc }}</text>
            </view>
          </view>

          <!-- 配件。三个槽位各选一个，再点一次取消装配 -->
          <text class="mt-5 block text-xs text-content-muted">配件</text>
          <view v-for="slot in ATTACHMENT_SLOTS" :key="slot" class="mt-3">
            <text class="text-2xs text-content-muted">{{ ATTACHMENT_SLOT_LABEL[slot] }}</text>
            <view class="mt-1.5 flex flex-wrap gap-2">
              <view
                v-for="item in getAttachmentsBySlot(slot)"
                :key="item.id"
                class="rounded-card border-2 px-3 py-2"
                :class="
                  loadout.attachments[slot] === item.id
                    ? 'border-brand bg-bg-elevated'
                    : 'border-transparent bg-bg-card'
                "
                @click="pickAttachment(slot, item.id)"
              >
                <text
                  class="text-sm"
                  :class="
                    loadout.attachments[slot] === item.id
                      ? 'text-brand'
                      : 'text-content-secondary'
                  "
                >
                  {{ item.name }}
                </text>
              </view>
            </view>
          </view>

          <!--
            灵敏度：只读展示 + 跳转调整。
            这里不做内联滑杆，因为灵敏度是一张 3×6 的表，
            在配装面板里只露出其中一格，用户改完也不知道改的是整套方案的哪一部分。
            跳转到方案页去改，改的是完整的一套，语义才清楚。
          -->
          <view class="mt-5">
            <text class="text-xs text-content-muted">灵敏度</text>
            <view class="mt-2 rounded-card bg-bg-card px-3 py-3 active:opacity-80" @click="goSensitivity()">
              <view class="flex items-center justify-between">
                <text class="text-sm text-content-primary">
                  {{ sensitivityStore.activePlan?.name ?? '暂无方案' }}
                </text>
                <text class="text-xs text-brand">调整 ›</text>
              </view>
              <text class="mt-1 block text-2xs text-content-muted">
                开火镜头 · {{ SIGHT_LABEL[loadout.scopeId] }} = {{ firingSensitivity }}
              </text>
            </view>
          </view>

          <!-- 当前配装的后坐力预览：让用户立刻看到「换这个配件有什么用」 -->
          <view class="mt-5 rounded-card bg-bg-card p-3">
            <text class="text-xs text-content-muted">当前后坐力</text>
            <view class="mt-2 flex">
              <view class="flex-1">
                <text class="text-sm text-content-primary">
                  {{ recoilParams ? recoilParams.vertical.toFixed(2) : '--' }}
                </text>
                <text class="mt-0.5 block text-2xs text-content-muted">垂直</text>
              </view>
              <view class="flex-1">
                <text class="text-sm text-content-primary">
                  {{ recoilParams ? recoilParams.horizontal.toFixed(2) : '--' }}
                </text>
                <text class="mt-0.5 block text-2xs text-content-muted">水平</text>
              </view>
              <view class="flex-1">
                <text class="text-sm text-content-primary">{{ recoilParams?.shotInterval.toFixed(0) ?? '--' }}</text>
                <text class="mt-0.5 block text-2xs text-content-muted">毫秒/发</text>
              </view>
            </view>
          </view>

          <!-- 底部留白，避免最后一项贴着屏幕边缘 -->
          <view class="h-8" />
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import {
  ATTACHMENT_SLOTS,
  ATTACHMENT_SLOT_LABEL,
  computeEffectiveRecoil,
  DEFAULT_LOADOUT,
  describeLoadout,
  DISTANCES,
  getAttachmentsBySlot,
  SCOPES,
  TARGETS,
  WEAPONS,
  type AttachmentId,
  type AttachmentSlot,
  type Loadout,
  type ScopeId,
} from '@/constants/weapon'
import { getFiringSensitivity, SIGHT_LABEL } from '@/constants/sensitivity'
import { RATING_META } from '@/constants/rating'
import { useRecordStore, useSettingsStore, useSensitivityStore } from '@/store'
import {
  createRecoilSimulator,
  getTargetTolerance,
  interpolateDy,
  summarize,
  TRAINING_DURATION,
  type ImpactPoint,
  type RecoilResult,
  type RecoilSample,
  type RecoilSimulator,
} from '@/utils/recoil'
import { getHeaderRightPadding } from '@/utils/system'
import { themeClass } from '@/utils/theme'
import type { StatItem } from '@/components/x-stat-grid/x-stat-grid.vue'

/**
 * 压枪测试页
 * ══════════════════════════════════════════════════════════════════════
 * 本项目最核心的一页，也是唯一一页直接处理原始触摸事件的页面。
 *
 * ── 交互模型 ──────────────────────────────────────────────────────────
 * 整块靶场就是开火键：按住开始射击，手指下滑模拟压枪。
 * 没有单独做一个「开火按钮」——真实压枪时开火与下拉本就是同一个动作，
 * 拆成两个区域反而不像在压枪，还会让用户下意识地先点按钮再找靶场。
 *
 * ── 发弹为什么要用定时器而不是「每次 touchmove 算一发」 ────────────────
 * 触摸事件的频率由设备决定（低端机可能只有 30Hz），而射速是枪械的固定属性
 * （Vector 是 1100 发/分，约 54ms 一发）。两者没有任何关系。
 * 用触摸事件驱动发弹，会导致「手指不动就不出子弹」——
 * 但真实情况是按住不放就一直在射，手不动只是压不住枪而已。
 * 因此用一个 16ms 的定时器按枪械射速补发子弹，触摸事件只负责提供
 * 每个时刻的手指位置（补偿量）。
 *
 * ── 实时与结算的一致性 ────────────────────────────────────────────────
 * 全程只有一套计算：createRecoilSimulator 逐发累积出 impacts，
 * 结束时 summarize 把这份 impacts 汇总成分数。
 * 不存在「边打边算一套、结算再算一套」的双份逻辑，
 * 也就不可能出现「看着都打中了，分数却很低」这种无法解释的现象。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 定时器间隔（毫秒）。16ms ≈ 60fps，够画面上流畅地逐发落点 */
const TICK_INTERVAL = 16

/**
 * 发数上限。
 * 正常训练最多约 92 发（Vector 5 秒）。给到 200 纯粹是防御——
 * 万一手机休眠后定时器被批量补发，没有这个上限会瞬间创建上千个弹着点
 * 并让渲染卡死。这类问题在开发机上永远复现不出来。
 */
const MAX_SHOTS = 200

/** 允许保存成绩的最短发数。低于它就是误触，不该污染历史记录 */
const MIN_SHOTS_TO_SAVE = 10

/* ── 页面基础状态 ── */

const { statusBarHeight = 0 } = uni.getWindowInfo()

/**
 * 自绘头部右侧要让出的宽度，用来避开微信胶囊。
 * 只在 setup 里算一次：它由屏幕与胶囊位置决定，
 * 而本项目只支持竖屏，没有中途变化的可能。
 */
const headerRightPadding = getHeaderRightPadding()

const recordStore = useRecordStore()
const settingsStore = useSettingsStore()
const sensitivityStore = useSensitivityStore()

/**
 * 主题 class。
 * 本页没有用 x-page-shell（它需要撑满全屏的三段式布局，与外壳的
 * 「头部 + 内容区」结构不兼容），所以主题要在这里单独挂一次。
 */
const theme = computed(() => themeClass(settingsStore.settings.theme))

/* ── 配装 ── */

/**
 * 当前配装。
 *
 * 用深拷贝而不是直接引用 DEFAULT_LOADOUT：后者是模块级常量，
 * 直接改它会让「默认配装」在所有页面之间被污染，
 * 下次进页面看到的就不是默认值而是上次改过的值。
 */
const loadout = ref<Loadout>({
  ...DEFAULT_LOADOUT,
  attachments: { ...DEFAULT_LOADOUT.attachments },
})

const configVisible = ref(false)

/** 当前配装算出的后坐力参数。配装非法时为 null，界面据此显示占位符 */
const recoilParams = computed(() => computeEffectiveRecoil(loadout.value))

/**
 * 本次训练使用的开火镜头灵敏度。
 *
 * 取「开火镜头 + 当前倍镜」这一格：压枪模拟的正是开火状态下的镜头跟随，
 * 取「镜头」或「陀螺仪」都不对——前者不开火，后者是另一套输入方式。
 */
const firingSensitivity = computed(() =>
  getFiringSensitivity(sensitivityStore.activePlan, loadout.value.scopeId),
)

/** 配装摘要文案。与记录页、首页共用同一个函数，保证三处写法完全一致 */
const summary = computed(() => describeLoadout(loadout.value))

/* ── 训练状态 ── */

const firing = ref(false)
const elapsed = ref(0)
const impacts = ref<ImpactPoint[]>([])
const result = ref<RecoilResult | null>(null)
const resultDuration = ref(0)
const saving = ref(false)

/** 本次成绩是否已经入库。用于把「保存」按钮换成「已保存」并防止重复提交 */
const saved = ref(false)

/**
 * 采样点与模拟器放在普通变量里而不是 ref。
 *
 * 它们每 16ms 就写一次，做成响应式会让 Vue 为每一次触摸都跑一遍
 * 依赖收集与更新调度，而这期间界面唯一需要重绘的东西是 impacts。
 * 只让真正驱动渲染的数据是响应式的，是高频率循环里最划算的一件事。
 */
let samples: RecoilSample[] = []
let simulator: RecoilSimulator | null = null
let seed = 1
let startTime = 0
let startY = 0
let nextShotAt = 0
let timer: ReturnType<typeof setInterval> | null = null

/** 进度条百分比 */
const progress = computed(() =>
  Math.min(100, (elapsed.value / TRAINING_DURATION) * 100),
)

/** 最近一发的落点，用于画准星标记 */
const lastImpact = computed(() => impacts.value[impacts.value.length - 1] ?? null)

/** 实时偏移读数 */
const currentOffsetText = computed(() => {
  const point = lastImpact.value
  if (!point) return '--'
  return `${point.y > 0 ? '上' : '下'} ${Math.abs(point.y).toFixed(0)}px`
})

/** 结果面板上的指标 */
const resultStats = computed<StatItem[]>(() => {
  if (!result.value) return []
  return [
    { label: '垂直', value: result.value.verticalStability, unit: '分' },
    { label: '水平', value: result.value.horizontalStability, unit: '分' },
    { label: '命中率', value: `${Math.round(result.value.hitRate * 100)}`, unit: '%' },
    { label: '发数', value: result.value.shotsFired },
  ]
})

const ratingMeta = computed(() => RATING_META[result.value?.rating ?? 'D'])

/** 本次成绩是否够格入库 */
const canSave = computed(
  () => !!result.value && result.value.shotsFired >= MIN_SHOTS_TO_SAVE,
)

/* ── 配装面板 ── */

function openConfig(): void {
  // 训练中不许改配装：改了会让已经在跑的模拟器与新参数对不上
  if (firing.value) return
  configVisible.value = true
}

function closeConfig(): void {
  configVisible.value = false
}

/**
 * 选择 / 取消配件。
 * 再点一次已选中的配件表示卸下——这是移动端「装配件」的通用手势，
 * 比额外做一个「卸下」按钮更省空间，也不会误触。
 */
function pickAttachment(slot: AttachmentSlot, id: AttachmentId): void {
  loadout.value.attachments[slot] = loadout.value.attachments[slot] === id ? null : id
}

function goSensitivity(): void {
  uni.navigateTo({ url: '/pages-sub/sensitivity/index' })
}

/* ── 触摸采样 ── */

/**
 * 触摸事件的最小结构。
 *
 * 没有直接用 DOM 的 TouchEvent 类型：本项目有一半的运行环境
 * （微信小程序）根本没有 DOM，那边的触摸事件是结构相似、
 * 但由另一套实现产出的普通对象。用 DOM 类型能通过编译，
 * 却会让「这些字段真的是两端都保证的吗」变得含糊。
 *
 * 写成宽接口的另一个好处是它同时满足两端：DOM 的 TouchList 有 length
 * 和索引访问，小程序端的普通数组也有，因此两种事件对象都能传进来。
 * （注意不能写成 `Array<...>`——TouchList 没有 push/pop 这些数组方法，
 * 那样写会让 DOM 的事件对象反而通不过检查。）
 */
interface TouchLikeEvent {
  /** 触摸点列表。只声明真正会用到的 length 与索引访问 */
  touches: {
    length: number
    [index: number]: { clientY: number }
  }
}

function onTouchStart(e: TouchLikeEvent): void {
  // 多指触摸时忽略后续手指：第二根手指会把 startY 覆盖掉，
  // 让补偿量瞬间跳变出一个巨大的值
  if (firing.value || result.value) return

  const recoil = recoilParams.value
  const touch = e.touches[0]
  if (!recoil || !touch) return

  firing.value = true
  elapsed.value = 0
  impacts.value = []
  samples = []
  startY = touch.clientY
  startTime = Date.now()

  /**
   * 随机种子取当前时间戳。
   *
   * 水平后坐力是随机的，但同一次训练必须可复现（见 recoil.ts 的说明）。
   * 用时间戳而不是 Math.random：万一用户反馈「这一把算错了」，
   * 通过时间戳能反推出完全相同的随机序列来复现，
   * Math.random 则什么都留不下。
   */
  seed = Date.now() & 0x7fffffff
  simulator = createRecoilSimulator(
    recoil,
    seed,
    getTargetTolerance(loadout.value),
    firingSensitivity.value,
  )

  nextShotAt = recoil.shotInterval
  timer = setInterval(tick, TICK_INTERVAL)
}

function onTouchMove(e: TouchLikeEvent): void {
  if (!firing.value) return

  const touch = e.touches[0]
  if (!touch) return

  // 向下滑为正：向下是压枪方向
  const dy = touch.clientY - startY
  samples.push({ t: Date.now() - startTime, dy })
}

function onTouchEnd(): void {
  if (!firing.value) return
  finish()
}

/**
 * 主循环。
 *
 * 用 while 而不是 if 来补发子弹：如果主线程被其它任务卡住
 * （一次性渲染很多弹着点、或者系统弹了通知），一次 tick 可能跨越了
 * 好几发子弹的间隔。用 if 的话每次只补一发，射速会永久性地落后于真实值，
 * 而且越卡落后越多。while 会把欠下的子弹一次性补齐。
 */
function tick(): void {
  const recoil = recoilParams.value
  if (!recoil || !simulator) {
    finish()
    return
  }

  const now = Date.now() - startTime
  elapsed.value = Math.min(now, TRAINING_DURATION)

  while (nextShotAt <= now && impacts.value.length < MAX_SHOTS) {
    impacts.value.push(simulator.fire(interpolateDy(samples, nextShotAt)))
    nextShotAt += recoil.shotInterval
  }

  if (now >= TRAINING_DURATION) finish()
}

/** 结束训练并结算 */
function finish(): void {
  if (!firing.value) return
  firing.value = false
  stopTimer()

  const duration = Math.min(Date.now() - startTime, TRAINING_DURATION)
  resultDuration.value = duration

  /**
   * 用实时累积的 impacts 直接汇总，而不是拿轨迹再跑一遍 calcRecoilResult。
   *
   * 两者结果一致（同一个模拟器、同一个种子），但再跑一遍意味着
   * 屏幕上显示的弹道和评分依据的弹道是两份不同的数据——
   * 只要有任何一个参数在两处传得不一样，就会出现「屏幕上是 A、
   * 评分算的是 B」这种最难排查的 bug。直接汇总则从根上没这个机会。
   */
  result.value = summarize(
    [...impacts.value],
    duration,
    getTargetTolerance(loadout.value),
  )
  elapsed.value = duration

  if (settingsStore.settings.vibration) {
    uni.vibrateShort({})
  }

  /*
   * 自动保存。
   *
   * 设成默认开启是因为「忘记保存」的代价远大于「不需要却存了」——
   * 前者是练了半天一条记录都没有，后者最多是历史列表多一行。
   * 想连续试手感、不想留记录的用户可以在设置里关掉。
   *
   * 不 await：这里在事件回调里，等它会让震动和界面更新延后。
   * 保存失败也不影响结果面板——用户能看到成绩，也能手动再点一次。
   */
  if (settingsStore.settings.autoSave) {
    void submitRecord()
  }
}

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

/** 清空本次成绩，回到待开始状态（保留配装） */
function resetTraining(): void {
  stopTimer()
  firing.value = false
  result.value = null
  resultDuration.value = 0
  saved.value = false
  impacts.value = []
  elapsed.value = 0
  samples = []
  simulator = null
}

/* ── 保存 ── */

/**
 * 提交成绩（自动保存与手动保存共用）。
 *
 * @returns 是否提交成功
 */
async function submitRecord(): Promise<boolean> {
  const current = result.value
  if (!current || !canSave.value || saving.value || saved.value) return false

  saving.value = true
  try {
    await recordStore.submit({
      loadout: loadout.value,
      score: current.score,
      rating: current.rating,
      verticalOffset: current.verticalOffset,
      horizontalOffset: current.horizontalOffset,
      verticalStability: current.verticalStability,
      horizontalStability: current.horizontalStability,
      shotsFired: current.shotsFired,
      hitRate: current.hitRate,
      duration: resultDuration.value,
    })
    saved.value = true
    return true
  } catch {
    // 请求层已经弹过错误提示了，这里再弹一次会盖掉它。
    // 结果面板保留不清空，用户可以再点一次保存重试
    return false
  } finally {
    saving.value = false
  }
}

/**
 * 手动保存。
 *
 * 保存成功后**不**自动清空结果面板：
 * 用户常常想再看一眼弹道和各项分数，直接把他弹回待开始状态太急了。
 * 想再练一次就点旁边的「再来一次」。
 */
async function handleSave(): Promise<void> {
  if (await submitRecord()) {
    uni.showToast({ title: '成绩已保存', icon: 'success' })
  }
}

/* ── 生命周期 ── */

onShow(() => {
  // 灵敏度方案在分包页里可能被改过，每次回到本页都确认一次数据已加载。
  // store 里有 loaded 标记，不会重复请求
  if (!sensitivityStore.loaded) {
    sensitivityStore.fetchPlans()
  }
})

/**
 * 页面被切走时中止训练。
 *
 * 不这么做的话定时器会在后台继续跑：用户切到微信回个消息再回来，
 * 会看到一个已经打满 5 秒、但自己全程没参与的成绩。
 */
onHide(() => {
  if (firing.value) {
    firing.value = false
    stopTimer()
    impacts.value = []
    elapsed.value = 0
  }
})

onUnmounted(stopTimer)
</script>
