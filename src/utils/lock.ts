import { STORAGE_KEYS } from '@/constants/storage'
import { getStorage, setStorage, removeStorage } from './storage'
import { sha256Hex } from './sha256'

// #ifdef MP-WEIXIN
/**
 * wx 全局对象的最小声明。
 *
 * @dcloudio/types 只提供 uni 与 HTML5+ 的类型，**不含微信的 wx 全局对象**
 * （那是由 miniprogram-api-typings 提供的）。为了一个基础库 2.20.0 才新增的
 * API 去引入整套小程序类型包不划算，这里就地声明真正用到的那一个方法。
 *
 * 只声明不实现，编译后被完全擦除，不会产生任何运行时代码。
 */
declare const wx: {
  getRandomValues?: (options: {
    length: number
    success: (res: { randomValues: ArrayBuffer }) => void
    fail: () => void
  }) => void
}
// #endif

/**
 * 密码锁工具
 * ══════════════════════════════════════════════════════════════════════
 * ── 这个锁到底防住了什么（重要，请如实理解）─────────────────────────
 * 它防的是：**别人拿到你解锁状态的手机，随手点开这个小程序翻看**。
 *
 * 它**防不住**：能读取小程序存储文件的人（root / 越狱 / 备份提取）。
 * 原因有两层，都必须讲清楚：
 *
 *   ① 6 位纯数字只有 100 万种组合。攻击者拿到 salt 与 hash 后可以离线
 *      枚举，单次 SHA-256 在现代设备上是微秒级——穷举全程不到一秒。
 *      盐在这里的作用是「让相同的 PIN 在不同设备上得到不同哈希、
 *      使预计算的彩虹表失效」，它**不是**用来抵抗暴力破解的。
 *      真正能提高离线破解成本的是 PBKDF2 / scrypt 这类慢哈希，
 *      但需求明确约定用 SHA-256 + salt，故不擅自更改。
 *
 *   ② 更根本的是，**记事正文本身是明文存在 storage 里的**（nb_notes）。
 *      锁只挡在界面上，没有加密数据。能拿到存储文件的人根本不需要
 *      去破解 PIN，直接读 nb_notes 就是全部内容。
 *
 * 把密码锁当成「应用的屏保」而不是「加密保险箱」，这个功能的预期就是正确的。
 * 如果将来需要真正的机密性，正确的做法是用 PIN 派生密钥去加密 notes 本身
 * （PBKDF2 + AES-GCM），那是一次独立的功能升级，不是给这里多加几行能解决的。
 *
 * ── 存了什么 ──────────────────────────────────────────────────────────
 * 只存两个键：随机盐 nb_lock_salt 与哈希 nb_lock_hash。
 * **永远不存明文密码**，也没有任何代码路径能还原出它——
 * 校验方式是把用户新输入的 PIN 用同一个盐重新哈希后比对。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 生成随机盐（32 位十六进制 = 128 位）。
 *
 * 取值优先级：
 *   ① crypto.getRandomValues —— H5 / App / Node 18+ 的标准能力
 *   ② wx.getRandomValues     —— 小程序基础库 2.20.0+
 *   ③ Math.random            —— 兜底
 *
 * 兜底为什么可以接受：盐不要求保密、也不要求不可预测，
 * 它只需要「对每台设备、每次设置都不同」。Math.random 生成的 128 位串
 * 完全满足唯一性需求（128 位空间下碰撞概率可忽略）。
 * 用系统 CSPRNG 只是「既然有就顺手用更好的」，不是安全性的必要条件。
 */
async function generateSalt(): Promise<string> {
  const bytes = await randomBytes(16)
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

/** 取 length 字节随机数。三级降级策略见 generateSalt 的说明 */
async function randomBytes(length: number): Promise<Uint8Array> {
  /* ① 标准 Web Crypto。注意判空：`crypto` 这个全局对象在小程序里不存在，
     直接访问会抛 ReferenceError，所以必须先用 typeof 探测 */
  const webCrypto = typeof crypto !== 'undefined' ? crypto : undefined
  if (typeof webCrypto?.getRandomValues === 'function') {
    return webCrypto.getRandomValues(new Uint8Array(length))
  }

  /* ② 小程序专用 API */
  // #ifdef MP-WEIXIN
  const fromWx = await wxRandomBytes(length)
  if (fromWx) return fromWx
  // #endif

  /* ③ 兜底 */
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256)
  }
  return bytes
}

// #ifdef MP-WEIXIN
/**
 * 调 wx.getRandomValues 取随机数，失败返回 null。
 *
 * 它是**异步回调式** API（不像 Web Crypto 那样同步返回），
 * 所以这里包一层 Promise 抹平差异，让上层不用区分平台。
 */
function wxRandomBytes(length: number): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    if (typeof wx.getRandomValues !== 'function') {
      // 基础库低于 2.20.0 时该方法不存在，交给调用方降级
      resolve(null)
      return
    }

    wx.getRandomValues({
      length,
      success: (res) => resolve(new Uint8Array(res.randomValues)),
      // 用户在隐私协议未同意等情况下会走到这里，同样降级处理
      fail: () => resolve(null),
    })
  })
}
// #endif

/**
 * 本地是否已保存密码。
 *
 * ⚠️ 必须 salt 与 hash **同时存在**才算数。
 * 写入是两个独立的 storage 操作，理论上存在「写完 salt 但写 hash 时存储满了」
 * 的中间态。这种情况下若认为「已设置密码」，用户就会面对一个
 * 永远验证不通过、也没有任何入口能重置的死局——
 * 判定为未设置，最多是让用户重新设一次密码，代价小得多。
 */
export function hasPin(): boolean {
  return Boolean(
    getStorage<string>(STORAGE_KEYS.LOCK_SALT) && getStorage<string>(STORAGE_KEYS.LOCK_HASH),
  )
}

/**
 * 把 PIN 与盐一起哈希。
 *
 * 拼接顺序固定为 `salt + pin`，两端一致即可（顺序本身不影响强度）。
 */
function hashPin(pin: string, salt: string): string {
  return sha256Hex(`${salt}${pin}`)
}

/**
 * 设置（或重设）密码。会覆盖已有的凭据。
 *
 * 注意：**不要**在设置成功后顺手把明文 PIN 传给任何持久化层。
 * 这个函数的入参是唯一一次接触明文的地方，函数返回后它就不复存在了。
 */
export async function setPin(pin: string): Promise<void> {
  const salt = await generateSalt()
  const hash = hashPin(pin, salt)

  // 先写哈希再写盐：这样即使中途失败，缺的那一半会让 hasPin() 返回 false，
  // 状态是「未设置密码」而不是「有盐但没哈希」的不可用中间态
  setStorage(STORAGE_KEYS.LOCK_HASH, hash)
  setStorage(STORAGE_KEYS.LOCK_SALT, salt)
}

/**
 * 校验密码。
 *
 * 用「重新哈希后比对」而不是任何形式的解密：
 * SHA-256 是单向的，这个文件（以及整个应用）里没有任何东西能还原出原密码。
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const salt = getStorage<string>(STORAGE_KEYS.LOCK_SALT)
  const expected = getStorage<string>(STORAGE_KEYS.LOCK_HASH)
  if (!salt || !expected) return false

  return hashPin(pin, salt) === expected
}

/**
 * 清除密码凭据。
 *
 * ⚠️ 调用方必须同时确认「用户知道这意味着以后不再需要密码」——
 * 它是「忘记密码」与「关闭密码锁」两条路径的共同终点。
 * 本函数只清密码，**不动记事数据**：忘记密码场景下的数据清除
 * 由调用方用 clearAppStorage() 单独完成，两者的语义必须分开。
 */
export function clearPin(): void {
  removeStorage(STORAGE_KEYS.LOCK_SALT)
  removeStorage(STORAGE_KEYS.LOCK_HASH)
}
