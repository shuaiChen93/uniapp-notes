/**
 * 展示层格式化工具
 * ══════════════════════════════════════════════════════════════════════
 * 只做「数据 → 展示文案」的转换，不参与任何业务计算。
 *
 * 集中放在一个文件里的原因：首页的时间线、详情页的日期、编辑页的
 * 默认日期都要处理「哪一天」这件事，各写一份的话很快就会分叉——
 * 而「同一条记事在两个页面显示不同日期」这种问题，用户会直接
 * 怀疑数据存错了，解释成本极高。
 * ══════════════════════════════════════════════════════════════════════
 */

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** 两位补零，如 9 → "09" */
function pad(value: number): string {
  return `${value}`.padStart(2, '0')
}

/**
 * Date → 'YYYY-MM-DD'。
 *
 * 手动拼字符串而**不用 toISOString()**：
 * toISOString 输出的是 UTC 时间，东八区的用户在 08:00 之前取到的
 * 会是「昨天」。这个 bug 在早上的通勤时段触发，最容易在上线后才被发现。
 *
 * 同理也不用 toLocaleDateString()：它的输出格式随系统语言变化，
 * 中文系统下可能得到「2026/9/27」，直接破坏存进 storage 的格式一致性。
 */
export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 'YYYY-MM-DD' → Date（本地时区的当天零点）。
 *
 * ⚠️ 必须手动解析，不能写 `new Date('2026-09-27')`：
 * iOS 端的 JavaScriptCore 对「带连字符的日期字符串」解析规则与
 * Chrome 不同，会得到 Invalid Date——而这个差异只在真机上出现，
 * H5 调试时一切正常，属于小程序开发里最经典的一类跨端坑。
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

/** 今天的日期字符串，'YYYY-MM-DD'。新建记事时的默认值 */
export function todayString(): string {
  return toDateString(new Date())
}

/** 时刻 → 'HH:mm'，用于详情页展示「最后修改」 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 日期字符串 → 时间线上的分组标签。
 *
 * 分级显示的依据是「用户对多久以前的事还有明确感知」：
 *   今天 / 昨天        —— 直接用词，最快读懂
 *   本年内             —— '09月25日'，年份是冗余信息
 *   跨年               —— '2025年12月31日'，必须带年份，否则会误以为是不久前
 *
 * @param now 可注入的「当前时刻」。默认取系统时间，
 *            测试里传固定值就能断言输出，不需要伪造系统时钟
 */
export function formatDateLabel(dateStr: string, now = Date.now()): string {
  const today = todayString()

  if (dateStr === today) return '今天'

  const yesterday = toDateString(new Date(now - DAY))
  if (dateStr === yesterday) return '昨天'

  const date = parseDate(dateStr)
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())

  // 用 getFullYear 而不是字符串前四位：now 可注入，两者在测试里才等价
  return date.getFullYear() === new Date(now).getFullYear()
    ? `${month}月${day}日`
    : `${date.getFullYear()}年${month}月${day}日`
}

/** 详情页头部用的完整日期：'2026年09月27日 星期日' */
export function formatFullDate(dateStr: string): string {
  const date = parseDate(dateStr)
  const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${week[date.getDay()]}`
}

/**
 * 相对时间：刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 2026-09-20
 *
 * 用在列表卡片的右下角，回答「这条是什么时候写的」。
 * 超过一周后改用绝对日期：到那个尺度上，「8 天前」已经不如
 * 具体日期好用了。
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp

  // 设备时钟被手动调快时会算出负数。显示「-3 分钟前」比不显示更糟，
  // 直接当成刚刚——误差本来就在这个量级内
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`

  return toDateString(new Date(timestamp))
}

/**
 * 列表摘要：截断到指定长度并补省略号。
 *
 * 用「先判断再截断」而不是直接 slice：
 * 长度恰好等于限制时不该出现省略号，否则用户会以为还有下文。
 */
export function truncate(text: string, max = 60): string {
  // 换行符在卡片里会导致行数跳动，统一压成空格
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}
