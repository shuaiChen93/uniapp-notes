import { defineStore } from 'pinia'
import { ref } from 'vue'
import { STORAGE_KEYS } from '@/constants/storage'
import type { AppSettings, ThemeMode, UserProfile } from '@/types'

/**
 * 应用设置 store
 * ══════════════════════════════════════════════════════════════════════
 * 与 notes store 的区别：这里存的是**偏好**而不是**内容**。
 * 丢一条记事是灾难，丢一个主题设置只是要重新点一下，
 * 因此两者的持久化策略可以不同（本模块允许清空后回到默认值）。
 *
 * ── 为什么整个 settings 是一个 ref 而不是拆成三个 ────────────────────
 * 持久化插件的 paths 是按字段路径抽取的，拆开要写三条路径；
 * 合成一个对象后只写 ['settings'] 一条，以后新增设置项也不用改配置。
 * 这些字段的读写频率都很低，整体替换带来的重渲染开销可以忽略。
 *
 * 默认值定义在这里而不是 types 里：types 目录只放类型，
 * 而默认值是会被执行到的运行时数据。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 默认设置。
 *
 * theme 默认浅色：记事本是长时间阅读文字的场景，浅色底在自然光下更易读。
 * lockEnabled 默认关闭：密码锁是一个「用户主动想要才会开」的功能。
 * 默认开启的话，第一次进应用就要面对设置密码的流程，
 * 而多数人下载时只是想随手记点东西——先给价值，再给安全感。
 */
const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  lockEnabled: false,
  profile: {
    nickname: '',
    avatar: '',
  },
}

export const useSettingsStore = defineStore(
  'settings',
  () => {
    // profile 单独展开一层：直接 {...DEFAULT_SETTINGS} 只会复制外层，
    // 内外两个对象的 profile 会指向同一份引用，一旦被就地修改，
    // 常量本身就被污染了（下次 resetToDefault 会恢复出被改过的「默认值」）
    const settings = ref<AppSettings>({
      ...DEFAULT_SETTINGS,
      profile: { ...DEFAULT_SETTINGS.profile },
    })

    /** 逐项更新的内部工具，避免每个 setter 都写一遍展开 */
    function patch(partial: Partial<AppSettings>): void {
      settings.value = { ...settings.value, ...partial }
    }

    function setTheme(value: ThemeMode): void {
      patch({ theme: value })
    }

    /**
     * 设置密码锁开关。
     *
     * ⚠️ 这里**只改这个标记**，不碰密码本身。
     * 真正的「设置密码 / 清除密码」由 store/modules/lock.ts 负责，
     * 它会在完成之后回调这里同步标记——两件事必须原子地一起成功，
     * 否则会出现「标记说锁开着，但本地没有密码」这种启动时无法解锁的死局。
     */
    function setLockEnabled(value: boolean): void {
      patch({ lockEnabled: value })
    }

    /** 更新昵称 / 头像。用局部合并，只传想改的那个字段即可 */
    function setProfile(partial: Partial<UserProfile>): void {
      patch({ profile: { ...settings.value.profile, ...partial } })
    }

    /**
     * 恢复默认设置。
     *
     * 用整体替换而不是逐个 setter：逐个调用会触发多次持久化写盘，
     * 而且中间态（改了一半）有可能被其它组件读到。
     */
    function resetToDefault(): void {
      settings.value = {
        ...DEFAULT_SETTINGS,
        profile: { ...DEFAULT_SETTINGS.profile },
      }
    }

    return { settings, setTheme, setLockEnabled, setProfile, resetToDefault }
  },
  {
    persist: {
      key: STORAGE_KEYS.SETTINGS,
      paths: ['settings'],
      /**
       * 不节流（0 = 立即写盘）。
       *
       * 设置项少、变更频率低，默认的 300ms 节流反而会带来一个真实的问题：
       * 用户关掉「密码锁」开关后立刻杀掉小程序，写盘还没发生，
       * 下次打开锁又开着——用户会认为这个开关坏了。
       */
      throttle: 0,
    },
  },
)
