/**
 * SHA-256 摘要算法（纯 JavaScript 实现）
 * ══════════════════════════════════════════════════════════════════════
 * ── 为什么不直接用 Web Crypto ─────────────────────────────────────────
 * 因为**微信小程序没有 crypto.subtle**。
 *
 * 小程序基础库 2.20.0+ 确实新增了一个同名的 `wx.getRandomValues`，
 * 但它只提供密码学安全的随机数，**不提供任何摘要/加密能力**。
 * 直接写 `crypto.subtle.digest(...)` 在开发者工具里可能因为 JSCore 的
 * 差异而侥幸可跑，真机上必然抛 `Cannot read property 'subtle' of undefined`，
 * 而密码锁一旦抛错，用户会被永久关在自己的数据外面。
 *
 * 因此这里自带一份实现。它只依赖 Uint32Array / DataView，
 * 这两个在小程序、H5、App、Node 上都是标准能力，不存在平台差异。
 *
 * ── 为什么不用第三方库（如 js-sha256）────────────────────────────────
 * 这份实现只有几十行，且是纯函数、可被单测完全覆盖（见 tests/unit/sha256.spec.ts）。
 * 为几十行代码引入一个供应链依赖，并让它进入一个「隐私」定位的应用，
 * 收益与风险不成比例。
 *
 * ── 正确性 ────────────────────────────────────────────────────────────
 * 实现严格遵循 FIPS 180-4，单测里用标准测试向量
 * （空串、"abc"、超长多块输入、含中文与 emoji 的输入）逐字节比对。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 64 个轮常量：前 64 个质数的立方根小数部分的前 32 位 */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

/** 初始哈希值：前 8 个质数的平方根小数部分的前 32 位 */
const H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
])

/** 32 位循环右移 */
function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0
}

/**
 * 字符串 → UTF-8 字节。
 *
 * 不使用 TextEncoder：小程序各基础库对它的支持并不一致
 * （部分版本下 window.TextEncoder 存在但对非 ASCII 处理有偏差），
 * 而只要有一台设备算出的字节不同，用户设的密码就再也验证不通过了——
 * 这类「密码突然不对了」的问题无法解释也无法恢复，必须从源头避免。
 */
export function utf8Bytes(text: string): Uint8Array {
  const bytes: number[] = []

  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i)

    // 代理对（emoji 等增补平面字符）：合并成一个码点再编码，
    // 否则会被当成两个无效的单字符，各自编出 3 字节的错误结果
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000
        i += 1
      }
    }

    if (code < 0x80) {
      bytes.push(code)
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      )
    }
  }

  return new Uint8Array(bytes)
}

/**
 * 计算 SHA-256，返回 32 字节。
 *
 * @param message 待摘要的字符串（按 UTF-8 编码后参与运算）
 */
export function sha256(message: string): Uint8Array {
  const source = utf8Bytes(message)

  /* ── 1. 填充 ──
     规则：先补一个 0x80，再补 0 直到长度 ≡ 56 (mod 64)，最后 8 字节存原始比特长度。
     先右移 6 位再左移 6 位，等于向下取整到 64 的倍数 */
  const paddedLength = (((source.length + 8) >> 6) + 1) << 6
  const buffer = new ArrayBuffer(paddedLength)
  const bytes = new Uint8Array(buffer)
  bytes.set(source)
  bytes[source.length] = 0x80

  /* ── 2. 写入长度（大端）──
     用 DataView 而不是位运算：JS 的位运算只有 32 位，
     输入超过 512MB 时比特长度会溢出 2^32，位运算写法会静默算错。
     用 setUint32 分别写高 32 位与低 32 位是严格正确的 */
  const view = new DataView(buffer)
  const bitLength = source.length * 8
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false)
  view.setUint32(paddedLength - 4, bitLength >>> 0, false)

  /* ── 3. 分块压缩 ── */
  const w = new Uint32Array(64)
  const hash = new Uint32Array(H0)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    // 前 16 个字直接取自消息块
    for (let t = 0; t < 16; t += 1) {
      w[t] = view.getUint32(offset + t * 4, false)
    }
    // 其余 48 个字由前面的字递推扩展而来
    for (let t = 16; t < 64; t += 1) {
      const x = w[t - 15]
      const y = w[t - 2]
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)
      // Uint32Array 赋值时自动截断到 32 位，无需手动 >>> 0
      w[t] = w[t - 16] + s0 + w[t - 7] + s1
    }

    let [a, b, c, d, e, f, g, h] = hash

    for (let t = 0; t < 64; t += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      // 这里的加法可能超过 2^32，但 JS 的 number 能精确表示 2^53 以内，
      // 最后统一 >>> 0 截断即可——中间不截断反而更快也更不易出错
      const temp1 = (h + S1 + ch + K[t] + w[t]) >>> 0

      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    hash[0] = (hash[0] + a) >>> 0
    hash[1] = (hash[1] + b) >>> 0
    hash[2] = (hash[2] + c) >>> 0
    hash[3] = (hash[3] + d) >>> 0
    hash[4] = (hash[4] + e) >>> 0
    hash[5] = (hash[5] + f) >>> 0
    hash[6] = (hash[6] + g) >>> 0
    hash[7] = (hash[7] + h) >>> 0
  }

  const digest = new Uint8Array(32)
  const digestView = new DataView(digest.buffer)
  hash.forEach((word, index) => digestView.setUint32(index * 4, word, false))
  return digest
}

/**
 * 计算 SHA-256，返回 64 位小写十六进制字符串。
 *
 * 密码锁只用这个形式：十六进制串比 Base64 更省心——
 * 不含 `+` `/` `=` 这些在 URL、日志、storage 里需要额外转义的字符。
 */
export function sha256Hex(message: string): string {
  const digest = sha256(message)
  let hex = ''
  for (const byte of digest) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}
