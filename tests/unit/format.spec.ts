import { describe, expect, it } from 'vitest'
import {
  formatDateLabel,
  formatFullDate,
  formatRelativeTime,
  parseDate,
  toDateString,
  todayString,
  truncate,
} from '@/utils/format'

/**
 * 展示层格式化的行为验证
 * ══════════════════════════════════════════════════════════════════════
 * 这些函数看着简单，但踩的都是日历边界：跨年、跨天、设备时钟被改动。
 * 它们的输出直接出现在用户眼前（首页的分组标签、列表的「3 小时前」），
 * 一旦错了，用户会先怀疑数据存错了——解释成本远高于在这里多写几个断言。
 *
 * 所有涉及「现在」的断言都注入固定的 now，不用伪造系统时钟：
 * 依赖真实时间的测试会在跨年那天突然变红，而那种红是最难排查的。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 固定参考时刻：2026-09-28 15:30（本地时区） */
const NOW = new Date(2026, 8, 28, 15, 30).getTime()
const DAY = 24 * 60 * 60 * 1000

describe('日期字符串的生成与解析', () => {
  it('toDateString 按月与日补零，且用本地时区', () => {
    // 手动拼串而非 toISOString：后者是 UTC，东八区 08:00 之前会得到「昨天」
    expect(toDateString(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(toDateString(new Date(2026, 11, 31))).toBe('2026-12-31')
    // 凌晨时段：UTC 会算成前一天，本地时区必须是当天
    expect(toDateString(new Date(2026, 8, 28, 0, 30))).toBe('2026-09-28')
  })

  it('todayString 返回今天的日期串', () => {
    expect(todayString()).toBe(toDateString(new Date()))
  })

  it('parseDate 得到本地零点，不受时区与字符串格式影响', () => {
    const date = parseDate('2026-09-28')

    // 手动拆分解析而不是 new Date('2026-09-28')：
    // iOS 的 JavaScriptCore 对带连字符的日期串会解析成 Invalid Date
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(8)
    expect(date.getDate()).toBe(28)
    expect(date.getHours()).toBe(0)
    expect(date.getMinutes()).toBe(0)
  })
})

describe('时间线的分组标签', () => {
  it('今天与昨天直接用词', () => {
    expect(formatDateLabel(todayString(), NOW)).toBe('今天')
    expect(formatDateLabel(toDateString(new Date(NOW - DAY)), NOW)).toBe('昨天')
  })

  it('昨天跨月也能正确识别', () => {
    // 用一个月初的时刻：昨天落在上个月，按「减一天的时间戳」算才不会错
    const firstDay = new Date(2026, 9, 1, 10, 0).getTime()
    expect(formatDateLabel('2026-09-30', firstDay)).toBe('昨天')
  })

  it('本年内的日期省略年份，跨年必须带上年份', () => {
    expect(formatDateLabel('2026-03-05', NOW)).toBe('03月05日')
    // 跨年不带年份会让用户以为是不久前，因此这里必须完整
    expect(formatDateLabel('2025-12-31', NOW)).toBe('2025年12月31日')
  })
})

describe('详情页的完整日期', () => {
  it('带上星期，便于翻看旧记事时回忆', () => {
    // 2026-09-28 是星期一
    expect(formatFullDate('2026-09-28')).toBe('2026年09月28日 星期一')
    // 2026-01-04 是星期日（用真实的星期几，不靠函数自己算）
    expect(formatFullDate('2026-01-04')).toBe('2026年01月04日 星期日')
  })
})

describe('列表卡片的相对时间', () => {
  it('按分 / 时 / 天分级', () => {
    expect(formatRelativeTime(NOW - 30 * 1000, NOW)).toBe('刚刚')
    expect(formatRelativeTime(NOW - 5 * 60 * 1000, NOW)).toBe('5 分钟前')
    expect(formatRelativeTime(NOW - 3 * 60 * 60 * 1000, NOW)).toBe('3 小时前')
    expect(formatRelativeTime(NOW - 2 * DAY, NOW)).toBe('2 天前')
  })

  it('满 7 天后改用绝对日期', () => {
    // 到「一周前」这个尺度，「7 天前」已经不如具体日期好用
    expect(formatRelativeTime(NOW - 7 * DAY, NOW)).toBe(
      toDateString(new Date(NOW - 7 * DAY)),
    )
  })

  it('时间戳在未来时按「刚刚」处理', () => {
    // 设备时钟被手动调快会出现负的差值，
    // 显示「-3 分钟前」比不显示更糟
    expect(formatRelativeTime(NOW + 60 * 1000, NOW)).toBe('刚刚')
  })
})

describe('列表摘要截断', () => {
  it('未超长时原样返回，不加省略号', () => {
    expect(truncate('买牛奶')).toBe('买牛奶')
  })

  it('长度恰好等于上限时不加省略号', () => {
    const exact = 'a'.repeat(60)
    // 加了省略号会让用户以为后面还有内容
    expect(truncate(exact, 60)).toBe(exact)
  })

  it('超长时截断并补省略号', () => {
    const long = 'a'.repeat(100)
    expect(truncate(long, 60)).toBe(`${'a'.repeat(60)}…`)
  })

  it('换行与连续空白压成单个空格', () => {
    // 换行符在卡片里会造成行数跳动，把列表的节奏打乱
    expect(truncate('第一行\n第二行')).toBe('第一行 第二行')
    expect(truncate('  前后留白  ')).toBe('前后留白')
  })
})
