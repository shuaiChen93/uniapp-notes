import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { RELOCK_DELAY } from '@/constants/lock'
import { clearPin, hasPin, setPin, verifyPin } from '@/utils/lock'
import { useSettingsStore } from './settings'

/**
 * 密码锁 store
 * ══════════════════════════════════════════════════════════════════════
 * ── 这个 store 不持久化，而且这是它的核心设计，不是疏漏 ──────────────
 * 它持有的 `unlocked` 是**会话级**状态：本次打开小程序是否已经解锁过。
 * 一旦落盘，下次冷启动就会读回一个 `true`，密码锁直接失效——
 * 而且这个 bug 在开发时几乎不可能发现，因为开发者改完代码顺手刷新，
 * 永远是「已解锁」的状态，看起来一切正常。
 *
 * 所以这里刻意不写 persist 配置，并在注释里留下原因：
 * 本项目的约定是「不声明 persist 就不落盘」，而这是一个**安全性**
 * 依赖该约定的地方，最容易被后来者顺手「补全」。
 *
 * ── 密码凭据存在哪 ────────────────────────────────────────────────────
 * salt 与 hash 由 utils/lock.ts 直接读写 storage（键名见 constants/storage.ts），
 * **不经过这个 store**。理由：验证密码的过程不该经过一个会被
 * Vue 响应式追踪、会被开发者工具序列化展示的状态层。
 * 这个 store 只保存「结论」——解没解锁，不保存「凭据」。
 * ══════════════════════════════════════════════════════════════════════
 */
export const useLockStore = defineStore('lock', () => {
  const settingsStore = useSettingsStore()

  /** 本次会话是否已解锁。⚠️ 绝不持久化，理由见文件头 */
  const unlocked = ref(false)

  /**
   * 密码锁是否启用。
   *
   * 以 settings.lockEnabled 为准而不是每次都去问 hasPin()：
   * storage 是同步 IO，而这个值会被页面渲染频繁读取（每次进锁页、
   * 每次切前后台都要判断）。settings 由持久化插件在启动时读一次，
   * 之后的判断都是内存操作。
   *
   * 两者的同步由下面的 enable / disable 保证——它们是这个应用中
   * 唯二能改变「锁是否启用」的入口。
   */
  const enabled = computed(() => settingsStore.settings.lockEnabled)

  /**
   * 进入后台的时刻，0 表示「本次会话还没进过后台」。
   *
   * 用普通变量而不是 ref：它不参与渲染，只用于前后台之间的时间比较，
   * 做成响应式反而会让每次切后台都触发一轮无谓的组件更新。
   */
  let hiddenAt = 0

  /** 标记为已解锁。由锁页在校验通过后调用 */
  function unlock(): void {
    unlocked.value = true
    // 解锁动作本身说明用户正在前台使用，清掉后台计时，
    // 否则「解锁后立刻切后台再回来」可能因残留的旧时刻而被误判为超时
    hiddenAt = 0
  }

  /** 立即上锁（不跳页）。跳转由调用方决定，store 不碰路由 */
  function lock(): void {
    unlocked.value = false
  }

  /**
   * 设置密码并开启密码锁。
   *
   * 「写入凭据」与「打开开关」必须成对完成，且**顺序不能反**：
   * 先写凭据再改开关，中间失败的结果是「有密码但锁没开」，用户重设一次即可；
   * 反过来则会短暂出现「锁开着但没有密码」——那是一个解不开也关不掉的死局。
   */
  async function enable(pin: string): Promise<void> {
    await setPin(pin)
    settingsStore.setLockEnabled(true)
    // 刚设完密码的人显然应该处于解锁状态，否则会被自己刚设的密码
    // 立刻关在门外，体验上非常荒谬
    unlocked.value = true
  }

  /**
   * 关闭密码锁并清除凭据。
   *
   * 关闭时直接删掉密码而不是「留着但不再校验」：
   * 后者会让「锁已关闭」这个状态下仍然存着一份可以用离线枚举
   * 攻破的哈希，而它已经没有任何用处。数据越少，风险面越小。
   */
  function disable(): void {
    clearPin()
    settingsStore.setLockEnabled(false)
    unlocked.value = true
  }

  /**
   * 校验密码，通过则标记解锁。
   *
   * @returns 是否校验通过，供锁页决定是「跳首页」还是「抖动提示」
   */
  async function verify(pin: string): Promise<boolean> {
    const ok = await verifyPin(pin)
    if (ok) unlock()
    return ok
  }

  /** 记录进入后台的时刻。由 App.vue 的 onHide 调用 */
  function markHidden(): void {
    hiddenAt = Date.now()
  }

  /**
   * 判断当前是否应当被锁在外面。由 App.vue 的 onShow 调用。
   *
   * 三种情况需要拦：
   *   ① 从未解锁（冷启动，或用户上次是被超时锁上的）
   *   ② 本来就没解锁（从锁页切后台又回来）
   *   ③ 会话内解锁过，但离开前台已超过 RELOCK_DELAY
   *
   * 注意这里用「离开前台的时长」而不是「距上次操作的时长」：
   * 用户可能在前台盯着锁页发了十分钟呆，那不该被算作超时——
   * 他人在，屏幕亮着，这本来就是「正在使用」的状态。
   */
  function isLockedOut(): boolean {
    if (!enabled.value) return false
    if (!unlocked.value) return true

    if (hiddenAt > 0 && Date.now() - hiddenAt > RELOCK_DELAY) {
      // 超时：立刻改回未解锁，避免同一秒内多次 onShow 时重复判定
      unlocked.value = false
      return true
    }

    return false
  }

  /**
   * 重置（清空全部数据后调用）。
   *
   * 此时凭据已被 clearAppStorage 删除，内存里的状态也必须跟着归零，
   * 否则会出现「数据显示已清空，但锁仍然拦着」的矛盾状态。
   */
  function reset(): void {
    unlocked.value = true
    hiddenAt = 0
  }

  /**
   * 用本地实际存储校正「锁是否启用」这个标记。
   *
   * 只在启动时调用一次，处理一种极端情况：设置写盘成功但应用被强杀，
   * 或用户通过微信的「清除缓存」抹掉了部分键，导致 settings 里说锁开着、
   * 但密码凭据已经不存在了。此时应当以**凭据是否存在**为准，
   * 因为凭据才是能不能解锁的唯一依据。
   */
  function syncFromStorage(): void {
    if (settingsStore.settings.lockEnabled && !hasPin()) {
      settingsStore.setLockEnabled(false)
    }
  }

  return {
    unlocked,
    enabled,
    unlock,
    lock,
    enable,
    disable,
    verify,
    markHidden,
    isLockedOut,
    reset,
    syncFromStorage,
  }
})
