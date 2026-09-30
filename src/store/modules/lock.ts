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
   * ⚠️ 归零的方向是「回到未解锁」，不是「放行」。
   *
   * 清空之后本机已经没有凭据，设置也回到默认的「锁开着」，
   * 应用正处在 needsSetup() 所描述的「先设置密码」状态。
   * 若在这里把 unlocked 置为 true，就等于在清空之后留出一段
   * 「谁都能进」的空窗——而用户此刻恰恰是最不该被放行的时刻：
   * 他刚刚才证明了自己打不开这把锁。
   */
  function reset(): void {
    unlocked.value = false
    hiddenAt = 0
  }

  /**
   * 是否必须先**设置**密码才能使用应用。
   *
   * 与 isLockedOut 的区别是「要弹哪个界面」：
   *   这里为 true → 本地还没有凭据，要的是「设置密码」；
   *   isLockedOut 为 true → 凭据存在但本次会话没解锁，要的是「输入密码」。
   * 两者都由 App.vue 在 onShow 时判断，都跳同一个锁页——
   * 锁页会自己按「本地有没有密码」决定进哪个模式，不需要额外传参。
   *
   * ⚠️ 必须是**函数**而不是 computed，这一点很关键：
   * hasPin() 读的是 storage，不参与 Vue 的响应式追踪，
   * 而 enabled 只在开关翻转时才会失效缓存。做成 computed 的话，
   * 用户刚设完密码（enabled 从 true 到 true，没有变化）→ 缓存不失效
   * → 仍返回 true → 立刻又被拉回设置页，形成新的死循环。
   */
  function needsSetup(): boolean {
    return enabled.value && !hasPin()
  }

  /**
   * 启动校正：只在 App 启动时调用一次。
   *
   * 处理的是**历史数据**：早期版本里 lockEnabled 默认 false，
   * 而那批数据产生时还没有任何设置密码的入口，因此它表达的是
   * 「从未选择过」，不是「主动关掉了锁」。两者在存储里完全同形，
   * 只能靠 lockConfigured 区分（见 types/settings.ts）。
   *
   * 不做这个校正的后果很具体：老设备升级后 lockEnabled 仍是 false，
   * 密码锁永远不会启动——而用户看到的现象只是「这个功能好像没做」。
   *
   * ⚠️ 这个函数在旧版里做的是**相反**的事（把没有凭据的锁关掉）。
   * 那个逻辑在「锁默认关闭」的前提下是对的，但现在锁默认开启，
   * 它会直接把第一次使用的人挡在设置流程之外，因此必须改掉。
   */
  function syncFromStorage(): void {
    const { lockEnabled, lockConfigured } = settingsStore.settings
    if (!lockConfigured && !lockEnabled) {
      settingsStore.setLockEnabled(true)
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
    needsSetup,
    reset,
    syncFromStorage,
  }
})
