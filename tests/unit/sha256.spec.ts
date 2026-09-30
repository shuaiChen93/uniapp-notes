import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256Hex } from '@/utils/sha256'

/**
 * SHA-256 摘要的契约验证
 * ══════════════════════════════════════════════════════════════════════
 * 实现已经换成 crypto-js（小程序端没有 crypto.subtle，见 utils/sha256.ts），
 * 这里的测试**不是**在验证 crypto-js 算得对不对——那是它自己的事。
 * 它锁住的是我们与它之间的那份契约，理由有两条：
 *
 * ① 输出格式一旦变化，全体用户的密码立刻失效。
 *    verifyPin 拿新摘要和 storage 里的旧摘要做字符串比较，
 *    大小写、是否带前缀、进制只要变一点，正确密码也会被判定为错误。
 *    这类改动（「换成大写更整齐」「顺手加上 0x」）看起来无害，
 *    必须在测试里被拦住。
 *
 * ② 已落盘的哈希是**历史数据**，换实现必须逐字节兼容。
 *    FIPS 向量 + 与 Node 内置实现对拍，共同定义了「什么叫兼容」，
 *    将来若换成 crypto.subtle 或其它库，跑一遍就知道能不能平滑迁移。
 * ══════════════════════════════════════════════════════════════════════
 */

describe('sha256Hex', () => {
  it('符合 SHA-256 标准测试向量', () => {
    // 空串：验证「填充一个整块」这条分支
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')

    // 单块短输入
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')

    // 恰好跨块：55 字节是单块能容纳的上限，56 字节必须 padding 到第二块
    expect(sha256Hex('a'.repeat(55))).toBe(
      '9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318',
    )
    expect(sha256Hex('a'.repeat(56))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    )

    // 官方多块用例
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  it('输出固定为 64 位小写十六进制', () => {
    // 这三个用例的共同点是「输入长度导致摘要里出现字母」，
    // 若有实现差异（大写、base64、带前缀），这里会立刻炸
    for (const input of ['', '1', '123456', '私密记事本']) {
      expect(sha256Hex(input)).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('与 Node 内置实现逐一对拍（含中文与 emoji）', () => {
    const samples = [
      '0',
      '123456',
      'deadbeefdeadbeefdeadbeefdeadbeef',
      '中文密码测试',
      '混合 mixed 内容 🔒 带 emoji',
      '换行\n与\t制表符',
      'x'.repeat(1000),
      '张'.repeat(300),
    ]

    for (const sample of samples) {
      const expected = createHash('sha256').update(sample, 'utf8').digest('hex')
      expect(sha256Hex(sample), `输入: ${sample.slice(0, 20)}`).toBe(expected)
    }
  })

  it('与 Node 内置实现对拍随机输入', () => {
    // 随机输入能覆盖到手工用例想不到的长度与字节组合
    for (let i = 0; i < 50; i += 1) {
      const bytes = randomBytes(Math.floor(Math.random() * 200))
      const text = Array.from(bytes)
        // 只取可打印 ASCII，保证同一串文本在两侧用同样的 UTF-8 编码
        .map((b) => String.fromCharCode(32 + (b % 95)))
        .join('')

      const expected = createHash('sha256').update(text, 'utf8').digest('hex')
      expect(sha256Hex(text)).toBe(expected)
    }
  })

  it('与 Node 内置实现对拍随机中文（验证 UTF-8 编码而非 UTF-16）', () => {
    /**
     * ⚠️ 这一条针对的是一个具体的坑：JS 的字符串是 UTF-16，
     * 若某次改造中不小心把它按 UTF-16 编码再去摘要，
     * 纯 ASCII 用例（如密码）**依然全部通过**，
     * 只有中文、emoji 会算出不同的结果——
     * 而用户设密码时用的正是数字，永远不会发现，
     * 直到某天他用中文备注了什么。
     */
    for (let i = 0; i < 30; i += 1) {
      const text = Array.from({ length: 1 + Math.floor(Math.random() * 12) }, () =>
        String.fromCharCode(0x4e00 + Math.floor(Math.random() * 0x2000)),
      ).join('')

      const expected = createHash('sha256').update(text, 'utf8').digest('hex')
      expect(sha256Hex(text), `输入: ${text}`).toBe(expected)
    }
  })
})
