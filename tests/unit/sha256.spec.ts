import { createHash, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256Hex, utf8Bytes } from '@/utils/sha256'

/**
 * SHA-256 实现的正确性验证
 * ══════════════════════════════════════════════════════════════════════
 * 这个文件存在的理由：自实现的密码学算法**必须**被证明是对的。
 *
 * 它一旦算错，症状是「用户设完密码，下次再也解不开」——
 * 没有报错、没有日志，用户只会认为这个应用把他写的东西弄丢了。
 * 而这种错误无法通过人工点几下发现（自己设自己解都会用同一份错误实现，
 * 反而一切正常）。
 *
 * 验证方式有两层：
 *   ① FIPS 180-4 官方测试向量 —— 证明实现符合标准，而不是「自洽」；
 *   ② 与 Node 内置 crypto 对拍随机输入 —— 覆盖面远超手工挑的用例。
 * ══════════════════════════════════════════════════════════════════════
 */

describe('sha256', () => {
  it('符合标准测试向量', () => {
    // 空串：验证「填充一个整块」这条分支
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')

    // 单块短输入
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')

    // 恰好跨块：55 字节是单块能容纳的上限，56 字节必须padding 到第二块
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

  it('与 Node 内置实现对拍随机字节串', () => {
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

  it('UTF-8 编码：非 ASCII 字符按码点展开为正确的字节数', () => {
    expect(utf8Bytes('abc')).toHaveLength(3)
    expect(utf8Bytes('中文')).toHaveLength(6) // 每字 3 字节
    expect(utf8Bytes('🔒')).toHaveLength(4) // 增补平面字符 4 字节

    // 代理对必须合并成一个码点：若按两个 UTF-16 码元分别编码，
    // 会得到 6 字节的错误结果
    expect(Array.from(utf8Bytes('🔒'))).toEqual([0xf0, 0x9f, 0x94, 0x92])
  })
})
