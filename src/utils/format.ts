/**
 * 展示层格式化工具
 * ══════════════════════════════════════════════════════════════════════
 * 只做「数据 → 展示文案」的转换，不参与任何业务计算。
 *
 * 集中放在一个文件里的原因：首页、记录页、排行榜都要显示时间，
 * 如果各写一份，很快就会出现「首页说 3 分钟前、记录页说 3 分钟前(刚刚
 * 才改过的另一次实现)」这种同一条数据两处不一致的情况。
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
 * 相对时间：刚刚 / 5 分钟前 / 3 小时前 / 2 天前 / 2026-09-20
 *
 * @param now 可注入的「当前时刻」。默认取系统时间，
 *            测试里传固定值就能断言输出，不需要伪造系统时钟
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  // 0 是后端约定的「不适用」标记（见 mock/routes/rank.ts），不是 1970 年
  if (!timestamp) return '--'

  const diff = now - timestamp

  // 设备时钟比服务端慢时会算出负数。显示「-3 分钟前」比不显示更糟，
  // 直接当成刚刚——误差本来就在这个量级内
  if (diff < MINUTE) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`

  return formatDate(timestamp)
}

/** 完整日期：2026-09-26 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 短日期：09-26。
 * 给趋势图的横轴刻度用——横轴上跨年与否对读数几乎没有影响，
 * 「2026-09-26」这种全写会把刻度挤成一团。
 */
export function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp)
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * 时长：90 秒 → "1 分 30 秒"。
 *
 * 用于累计训练时长。不做「1.5 小时」这种小数写法：
 * 训练时长是给人看成就感的，整数读起来更快。
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))

  if (totalSeconds < 60) return `${totalSeconds} 秒`

  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) {
    const seconds = totalSeconds % 60
    return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`
  }

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes > 0 ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`
}

/**
 * 紧凑时长：拆成「数值 + 单位」两段返回。
 *
 * 用在 x-stat-grid 这种每格只有几十像素宽的场合——
 * formatDuration 输出的「1 分 30 秒」在那里会换行，
 * 而换行后的标签会与相邻格子对不齐，整排数字看起来是歪的。
 * 拆成两段是为了让单位能用更小的字号单独排版（组件已支持 unit 字段）。
 */
export function formatCompactDuration(ms: number): { value: string; unit: string } {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))

  // 不足一分钟时用秒：新手第一次练完看到「0 分」会以为没记录上
  if (totalSeconds < 60) return { value: `${totalSeconds}`, unit: '秒' }

  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) return { value: `${minutes}`, unit: '分' }

  return { value: (minutes / 60).toFixed(1), unit: '时' }
}
