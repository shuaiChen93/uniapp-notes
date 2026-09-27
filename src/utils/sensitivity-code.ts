import { SIGHTS, SENSITIVITY_MAX, SENSITIVITY_MIN, normalizeSensitivity } from '@/constants/sensitivity'
import type { SensitivityValues, SightId } from '@/types'

/**
 * 灵敏度分享码
 * ══════════════════════════════════════════════════════════════════════
 * 把一套 18 个数值的灵敏度方案，压成一行可以复制、粘贴、发微信的短文本。
 *
 * ── 为什么不用 JSON ────────────────────────────────────────────────────
 * JSON 版长这样（约 400 字符）：
 *   {"camera":{"hip":100,...},"firing":{...},"gyro":{...}}
 * 而分享码长这样（约 80 字符）：
 *   RT1:100,90,70, 95,85,65, ...（无空格）
 *
 * 分享码要贴到聊天框里，长度直接决定它会不会被折成好几行、
 * 会不会被输入法或聊天软件截断。而且 JSON 里的键名是重复的样板信息——
 * 18 个值的顺序是固定的，键名完全冗余。
 *
 * ── 为什么不用 base64 ──────────────────────────────────────────────────
 * 小程序端没有 btoa/atob，各端支持程度不一，需要自己实现一份编码表。
 * 更关键的是 base64 会让人**看不懂**——用户拿到一串乱码会怀疑
 * 这东西安不安全，而明文数字至少让人知道"它就是一串数值"。
 * 分享码不需要保密，只需要紧凑。
 *
 * ── 格式 ──────────────────────────────────────────────────────────────
 *   RT1:<18 个 0~300 的整数，逗号分隔>
 *
 * 顺序固定为：镜头(6) → 开火镜头(6) → 陀螺仪(6)，每组内部按
 * 腰射、2x、3x、4x、6x、8x 排列。与 constants/sensitivity.ts 的
 * SIGHTS 顺序严格一致——**改那个数组的顺序就必须同时改版本号**，
 * 否则旧分享码会被解析成完全错乱的数值。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 当前分享码版本。
 *
 * 版本号存在的唯一意义就是「格式变了能认出来」。
 * 解码时只接受当前版本，遇到不认识的版本明确报错，
 * 而不是硬着头皮按当前格式解析——后者会把一套完全错误的灵敏度
 * 静默地导入进来，用户按着错误的数值调了半天才发现不对。
 */
const CODE_VERSION = 'RT1'

/** 分隔符 */
const SEPARATOR = ','

/** 版本号与数据之间的分隔符 */
const PREFIX_SEPARATOR = ':'

/** 编码顺序：类目外层、瞄具内层 */
const CATEGORY_ORDER = ['camera', 'firing', 'gyro'] as const

/**
 * 把灵敏度数值编码成分享码。
 */
export function encodeSensitivity(values: SensitivityValues): string {
  const numbers: number[] = []

  for (const category of CATEGORY_ORDER) {
    for (const sight of SIGHTS) {
      // 缺失的格子按最小值处理，而不是跳过——
      // 跳过会让后续所有数值整体前移，解出来的是另一套完全不同的方案。
      // 宁可导出一个明显不对的值让用户发现，也不要静默错位
      const value = values?.[category]?.[sight as SightId]
      numbers.push(normalizeSensitivity(Number(value)))
    }
  }

  return `${CODE_VERSION}${PREFIX_SEPARATOR}${numbers.join(SEPARATOR)}`
}

/** 解码结果 */
export interface DecodeResult {
  ok: boolean
  /** 失败原因（中文，可直接展示给用户） */
  message: string
  values?: SensitivityValues
}

/**
 * 解析分享码。
 *
 * 返回结构体而不是抛异常或返回 null：
 * 这是一个**用户输入驱动的解析**——他会粘贴错东西、会少复制一段、
 * 会把昵称连着分享码一起复制进来。每种失败都需要给用户一句
 * 能看懂的中文提示，「粘贴的内容不是有效的分享码」远比 null 有用。
 */
export function decodeSensitivity(code: string): DecodeResult {
  const trimmed = (code ?? '').trim()
  if (!trimmed) {
    return { ok: false, message: '请先粘贴分享码' }
  }

  const separatorIndex = trimmed.indexOf(PREFIX_SEPARATOR)
  if (separatorIndex === -1) {
    return { ok: false, message: '分享码格式不正确，应形如 RT1:100,90,...' }
  }

  const version = trimmed.slice(0, separatorIndex)
  if (version !== CODE_VERSION) {
    // 版本不认识时不做任何猜测。将来格式升级，这里可以加分派逻辑
    return { ok: false, message: `无法识别的分享码版本：${version}` }
  }

  const body = trimmed.slice(separatorIndex + 1)
  const parts = body.split(SEPARATOR)

  const expected = CATEGORY_ORDER.length * SIGHTS.length
  if (parts.length !== expected) {
    return {
      ok: false,
      message: `分享码不完整，应有 ${expected} 个数值，实际 ${parts.length} 个`,
    }
  }

  const numbers: number[] = []
  for (const part of parts) {
    const value = Number(part.trim())
    if (!Number.isFinite(value)) {
      return { ok: false, message: `分享码中含有非法数值：${part}` }
    }
    if (value < SENSITIVITY_MIN || value > SENSITIVITY_MAX) {
      return {
        ok: false,
        message: `灵敏度应在 ${SENSITIVITY_MIN}~${SENSITIVITY_MAX} 之间，实际为 ${value}`,
      }
    }
    numbers.push(Math.round(value))
  }

  // 按与编码时完全相同的顺序还原
  const values = {} as SensitivityValues
  let cursor = 0
  for (const category of CATEGORY_ORDER) {
    const group = {} as Record<SightId, number>
    for (const sight of SIGHTS) {
      group[sight] = numbers[cursor]
      cursor += 1
    }
    values[category] = group
  }

  return { ok: true, message: '解析成功', values }
}
