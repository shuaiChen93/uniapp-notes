import { defineStore } from 'pinia'
import { ref } from 'vue'
import { STORAGE_KEYS } from '@/constants/storage'
import type { AppSettings, ThemeMode } from '@/types'

/**
 * 应用设置 store
 * ══════════════════════════════════════════════════════════════════════
 * 与另外两个 store 的根本区别：**设置没有服务端**。
 *
 * 它不走 api 层、不经过请求库，直接存在本地。
 * 这是有意的——震动、音效这类开关是设备相关的，
 * 同一个账号在手机和平板上想要不同的设置，同步到服务端反而添乱。
 * 为纯本地数据造一套假接口，只会让「哪些数据真的需要后端」变得模糊。
 *
 * 默认值定义在这里而不是 types 里：types 目录只放类型（见 types/index.ts），
 * 而默认值是会被执行到的运行时数据。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 默认设置。
 *
 * 震动默认开启：压枪训练靠手感反馈，震动是唯一的实时触觉提示。
 * 音效默认关闭：训练场景（可能在地铁、办公室）外放声音容易打扰他人，
 * 需要的人自己开。
 * 两者的取舍标准是「误开的代价 vs 误关的代价」——
 * 误开震动只是多费一点电，误开音效却可能让人在公共场合尴尬。
 */
const DEFAULT_SETTINGS: AppSettings = {
  vibration: true,
  sound: false,
  theme: 'dark',
  autoSave: true,
}

export const useSettingsStore = defineStore(
  'settings',
  () => {
    /**
     * 设置对象。
     *
     * 整体作为一个 ref 而不是拆成四个：持久化插件的 paths 是按字段路径
     * 抽取的，拆开要写四条路径；合成一个对象后只写 ['settings'] 一条，
     * 新增设置项时也不用改配置。四个字段的读写频率都很低，
     * 整体替换带来的重渲染开销可以忽略。
     */
    const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })

    /** 逐项更新的内部工具，避免每个 setter 都写一遍展开 */
    function patch(partial: Partial<AppSettings>): void {
      settings.value = { ...settings.value, ...partial }
    }

    function setVibration(value: boolean): void {
      patch({ vibration: value })
      // 开启震动时立刻震一下：让用户马上知道这个开关是做什么的，
      // 比只看到一个开关状态变化更有反馈感
      if (value) {
        uni.vibrateShort({ fail: () => undefined })
      }
    }

    function setSound(value: boolean): void {
      patch({ sound: value })
    }

    function setTheme(value: ThemeMode): void {
      patch({ theme: value })
    }

    function setAutoSave(value: boolean): void {
      patch({ autoSave: value })
    }

    /**
     * 恢复默认设置。
     *
     * 用整体替换而不是逐个 setter：逐个 setter 会触发多次持久化写盘，
     * 而且 setVibration 还会顺带震一下，恢复默认时并不需要这个反馈。
     */
    function resetToDefault(): void {
      settings.value = { ...DEFAULT_SETTINGS }
    }

    return {
      settings,
      setVibration,
      setSound,
      setTheme,
      setAutoSave,
      resetToDefault,
    }
  },
  {
    persist: {
      key: STORAGE_KEYS.SETTINGS,
      // 设置项少、变更频率低，300ms 的默认节流反而会让「关掉开关后立刻
      // 杀掉进程」来不及写盘。这里不设节流，让它同步落盘
      paths: ['settings'],
      throttle: 0,
    },
  },
)
