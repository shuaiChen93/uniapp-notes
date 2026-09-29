import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createPersistPlugin, useLockStore, useNotesStore, useSettingsStore } from '@/store'
import { STORAGE_KEYS } from '@/constants/storage'
import { RELOCK_DELAY } from '@/constants/lock'
import { clearPin, hasPin, setPin, verifyPin } from '@/utils/lock'
import { getStorage } from '@/utils/storage'

/**
 * 密码锁的行为验证
 * ══════════════════════════════════════════════════════════════════════
 * 这里覆盖的是「错了就等于锁失效」的那些点：
 *
 *   · 密码不能以明文出现在存储里
 *   · 相同密码在不同次设置下必须得到不同哈希（盐真的生效了）
 *   · 凭据残缺时必须判定为「未设置密码」，而不是把人锁在门外
 *   · 前后台的超时判定（切后台 30 秒才重新上锁）
 *
 * 最后一条尤其值得测：它的逻辑分支多、且全部依赖时间，
 * 靠手工「切后台等半分钟再切回来」来验证几乎不可能覆盖到边界。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 建一个干净的 pinia（含持久化插件），与 main.ts 的装配顺序保持一致 */
function freshPinia() {
  const pinia = createPinia()
  pinia.use(createPersistPlugin())
  const app = createApp({})
  app.use(pinia)
  setActivePinia(pinia)
  return pinia
}

describe('密码凭据的读写（utils/lock.ts）', () => {
  beforeEach(() => {
    freshPinia()
  })

  it('设置密码后可以校验通过，错误密码校验失败', async () => {
    await setPin('123456')

    expect(hasPin()).toBe(true)
    await expect(verifyPin('123456')).resolves.toBe(true)
    await expect(verifyPin('123457')).resolves.toBe(false)
    // 位数不同、空串都不该通过
    await expect(verifyPin('12345')).resolves.toBe(false)
    await expect(verifyPin('')).resolves.toBe(false)
  })

  it('存储里只有盐和哈希，没有任何形式的明文密码', async () => {
    await setPin('246810')

    // 读**原始**存储值而不是解析后的值：连 JSON 里的引号都算上，
    // 只要明文出现过一次就算失败
    const rawSalt = uni.getStorageSync(STORAGE_KEYS.LOCK_SALT) as string
    const rawHash = uni.getStorageSync(STORAGE_KEYS.LOCK_HASH) as string

    // 这两条是整个功能的安全底线：明文一旦落盘，密码锁就只是个摆设
    expect(rawSalt).not.toContain('246810')
    expect(rawHash).not.toContain('246810')
    expect(rawSalt + rawHash).not.toContain('246810')

    // 格式校验走解析后的值（storage 统一以 JSON 形式存字符串）
    const salt = getStorage<string>(STORAGE_KEYS.LOCK_SALT)
    const hash = getStorage<string>(STORAGE_KEYS.LOCK_HASH)
    expect(salt).toMatch(/^[0-9a-f]{32}$/)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('盐是随机的：同一个密码两次设置得到不同的哈希', async () => {
    await setPin('111111')
    const firstHash = uni.getStorageSync(STORAGE_KEYS.LOCK_HASH) as string

    await setPin('111111')
    const secondHash = uni.getStorageSync(STORAGE_KEYS.LOCK_HASH) as string

    // 哈希相同意味着盐没起作用，攻击者可以直接用彩虹表反查常见 PIN
    expect(firstHash).not.toBe(secondHash)
    // 但两次设置的密码都必须是有效的——盐变了不该影响校验
    await expect(verifyPin('111111')).resolves.toBe(true)
  })

  it('凭据残缺时判定为「未设置密码」，而不是让人永远解不开', async () => {
    await setPin('135790')
    expect(hasPin()).toBe(true)

    // 模拟「写入盐成功、写哈希时失败」这类中间态
    uni.removeStorageSync(STORAGE_KEYS.LOCK_HASH)

    expect(hasPin()).toBe(false)
    await expect(verifyPin('135790')).resolves.toBe(false)
  })

  it('清除凭据后不再接受任何密码', async () => {
    await setPin('999999')
    clearPin()

    expect(hasPin()).toBe(false)
    await expect(verifyPin('999999')).resolves.toBe(false)
  })
})

describe('锁状态与超时判定（store/modules/lock.ts）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-27T10:00:00'))
    freshPinia()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('未启用密码锁时永远不拦截', () => {
    const lock = useLockStore()
    lock.markHidden()
    vi.advanceTimersByTime(10 * 60 * 1000)

    expect(lock.enabled).toBe(false)
    expect(lock.isLockedOut()).toBe(false)
  })

  it('启用后：未解锁即拦截，解锁后放行', async () => {
    const lock = useLockStore()
    await lock.enable('123456')

    // 刚设完密码视为已解锁，不该被自己刚设的密码关在门外
    expect(lock.enabled).toBe(true)
    expect(lock.unlocked).toBe(true)
    expect(lock.isLockedOut()).toBe(false)

    lock.lock()
    expect(lock.isLockedOut()).toBe(true)
  })

  it('切后台未超过 30 秒：保持解锁', async () => {
    const lock = useLockStore()
    await lock.enable('123456')

    lock.markHidden()
    vi.advanceTimersByTime(RELOCK_DELAY - 1000)
    expect(lock.isLockedOut()).toBe(false)
    expect(lock.unlocked).toBe(true)
  })

  it('切后台超过 30 秒：重新上锁，且状态被真正改写', async () => {
    const lock = useLockStore()
    await lock.enable('123456')

    lock.markHidden()
    vi.advanceTimersByTime(RELOCK_DELAY + 1000)

    expect(lock.isLockedOut()).toBe(true)
    // 只返回 true 是不够的：状态必须真的被改回未解锁，
    // 否则下一次 onShow 判断时又会认为「已解锁且没超时」而放行
    expect(lock.unlocked).toBe(false)
    expect(lock.isLockedOut()).toBe(true)
  })

  it('在前台停留多久都不会超时（超时看的是离开前台的时长）', async () => {
    const lock = useLockStore()
    await lock.enable('123456')

    // 没有任何 markHidden，说明用户一直待在前台
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(lock.isLockedOut()).toBe(false)
  })

  it('关闭密码锁会同时清掉凭据与开关', async () => {
    const lock = useLockStore()
    await lock.enable('123456')

    lock.disable()

    expect(lock.enabled).toBe(false)
    expect(hasPin()).toBe(false)
    expect(lock.isLockedOut()).toBe(false)
  })

  it('启动校正：开关说锁开着但凭据已丢失时，以凭据为准放行', () => {
    const settings = useSettingsStore()
    settings.setLockEnabled(true)
    // 刻意不写凭据，模拟「设置写盘成功但凭据被清掉」
    expect(hasPin()).toBe(false)

    const lock = useLockStore()
    expect(lock.enabled).toBe(true)

    lock.syncFromStorage()

    expect(lock.enabled).toBe(false)
    expect(lock.isLockedOut()).toBe(false)
  })
})

describe('忘记密码后的清空（数据与状态一起归零）', () => {
  beforeEach(() => {
    freshPinia()
  })

  it('清空后：记事、设置、密码凭据全部消失', async () => {
    const notes = useNotesStore()
    const settings = useSettingsStore()
    const lock = useLockStore()

    notes.save({ title: '私密内容', content: '不该留下', date: '2026-09-27' })
    settings.setProfile({ nickname: '张三' })
    await lock.enable('123456')

    // 复现锁页 wipeAllData 的动作
    notes.clearAll()
    settings.resetToDefault()
    lock.reset()
    clearPin()

    expect(notes.total).toBe(0)
    expect(settings.settings.profile.nickname).toBe('')
    expect(hasPin()).toBe(false)
    expect(lock.enabled).toBe(false)
  })
})
