import {
  computeEffectiveRecoil,
  type EffectiveRecoil,
  type Loadout,
  TARGETS,
} from '@/constants/weapon'
import { getRating, type Rating } from '@/constants/rating'

/**
 * 压枪计算核心
 * ══════════════════════════════════════════════════════════════════════
 * 这是整个训练模块的「物理引擎」：把用户手指的滑动轨迹，
 * 换算成一组可以评分的后坐力指标。
 *
 * ── 建模思路 ──────────────────────────────────────────────────────────
 * 把一次连发拆成「每发子弹」逐个计算，而不是只看最终位置。
 * 因为压枪的好坏不在于「最后压到哪」，而在于**整个过程是否跟得住**：
 * 一个先脱靶再猛拉回来的轨迹，和一个全程贴住靶心的轨迹，
 * 最终位置可能相同，但水平差距巨大。
 *
 * 对每一发子弹：
 *   ① 枪口因后坐力上抬，累积到一个高度（带回复衰减）
 *   ② 用户手指在那一刻下滑了 dy 像素，形成补偿
 *   ③ 二者之差就是这一发的实际弹着点偏移
 *
 * ── 拆成「模拟器 + 汇总」两部分的原因 ────────────────────────────────
 * 训练过程中界面要**实时**画出每一发的落点，结束时还要给出完整评分。
 * 如果实时用一套简化算法、结算用另一套完整算法，两者必然对不齐——
 * 用户会看到「屏幕上都打中了，结果分数很低」这种无法解释的现象，
 * 而且极难排查。因此这里只实现一遍单发逻辑（createRecoilSimulator），
 * 实时渲染和最终结算都调它，从结构上保证不可能不一致。
 *
 * ── 为什么做成纯函数 ──────────────────────────────────────────────────
 * 不读任何全局状态、不碰 user 信息、随机源由外部传入。
 * 这样单测可以直接喂一条构造好的轨迹断言输出，
 * 而不需要模拟触摸事件——后坐力算错会让所有评分集体偏移，
 * 属于「肉眼极难发现、但用户一定会觉得不对劲」的那类 bug。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 一次完整训练的目标时长（毫秒） */
export const TRAINING_DURATION = 5000

/**
 * 后坐力系数的像素基准。
 *
 * 枪械表里的 verticalRecoil 是 0.6~1.8 的相对系数，需要乘上这个基准
 * 才能变成「每发上抬多少像素」。取值让它落在「手指滑一整个屏幕高度
 * 刚好能压住最难压的枪」这个范围内——太小学不出差异，太大则压不住。
 */
const RECOIL_PIXEL_UNIT = 6

/**
 * 垂直稳定性的宽容度（像素）。
 *
 * 平均偏移达到这个值时得 50 分。它决定了分数的「刻度」：
 * 调小会让所有人都是 D，调大则人人都是 S。
 * 这个值是按「手机屏幕上靶心的可视半径」估的——
 * 偏移超过靶心半径，射击就已经脱靶了，此时给 50 分是合理的。
 */
const VERTICAL_TOLERANCE_PX = 26

/**
 * 水平稳定性的宽容度（像素）。
 *
 * 明显小于垂直：水平后坐力是**无法通过压枪消除的**（用户再怎么练也压不住
 * 枪口的左右摆动），它主要由配件决定。因此这里的宽容度按
 * 「配件配得好就能压得很低」来定，让配装选择能真实反映在分数上。
 */
const HORIZONTAL_TOLERANCE_PX = 14

/**
 * 枪口回复的基准比例。
 *
 * 每发之后枪口回落 `recovery * 这个值` 的比例。0.15 是调出来的手感值：
 * 太小则连发时枪口会一路顶到天上（压不住也没意义），
 * 太大则后坐力几乎不累积（压枪变成没有难度）。
 */
const RECOVERY_BASE = 0.15

/**
 * 基准灵敏度。
 *
 * 灵敏度等于这个值时，玩家滑多少就补偿多少（增益为 1）。
 * 取 100 是因为游戏里「开火镜头灵敏度」的默认值就在这个量级，
 * 用户对照着自己的设置看能直接对上，不需要脑内换算。
 */
export const BASE_SENSITIVITY = 100

/** 灵敏度增益的下限：调到 0 也还剩这么多补偿能力 */
const MIN_SENSITIVITY_GAIN = 0.6

/** 灵敏度增益的上限：调到 300 也不会变成「滑一点就压满」 */
const MAX_SENSITIVITY_GAIN = 1.7

/** 灵敏度每变化 1 点，补偿增益变化多少 */
const GAIN_PER_SENSITIVITY = 0.004

/**
 * 灵敏度 → 补偿增益。
 *
 * ── 为什么灵敏度要参与计算 ────────────────────────────────────────────
 * 需求把灵敏度列为压枪测试的参数之一。如果它只是个展示字段、
 * 不影响任何计算，那这个参数就是装饰品——用户调它看不到任何变化，
 * 反而会以为功能坏了。
 *
 * ── 为什么不是「越高越好」 ────────────────────────────────────────────
 * 这是这里最关键的设计：高灵敏度确实让压枪更容易（同样的手指滑动
 * 能压住更多后坐力），但它同时**放大手指的微小抖动**，
 * 让水平散布变大（见 getHorizontalScale）。
 *
 * 这样才有取舍：灵敏度 0 时压不住枪，300 时压得住但弹道很散，
 * 最优点落在中段。否则「灵敏度拉满」成为唯一解，
 * 灵敏度方案页的推荐功能就失去了全部意义。
 */
export function getSensitivityGain(sensitivity: number): number {
  const gain = 1 + (sensitivity - BASE_SENSITIVITY) * GAIN_PER_SENSITIVITY
  return clamp(gain, MIN_SENSITIVITY_GAIN, MAX_SENSITIVITY_GAIN)
}

/**
 * 灵敏度增益 → 水平抖动放大系数。
 *
 * 斜率和截距都是调出来的：增益 1.0 时系数正好是 1.0（基准不放大），
 * 增益降到 0.6 时系数 0.88（灵敏度调低，手抖影响变小），
 * 升到 1.7 时系数 1.21（灵敏度拉高，抖动被明显放大）。
 * 幅度刻意控制在 ±20% 左右——大到能左右分数，小到不至于让
 * 高灵敏度变得完全不能用。
 */
function getHorizontalScale(gain: number): number {
  return 0.7 + gain * 0.3
}

/* ──────────────────────────────────────────────────────────────────────
 * 类型
 * ────────────────────────────────────────────────────────────────────── */

/** 弹着点 */
export interface ImpactPoint {
  /** 第几发（从 0 开始），用于按顺序连线画出弹道 */
  index: number
  /** 水平偏移（像素，右为正） */
  x: number
  /** 垂直偏移（像素，**上为正**——与屏幕坐标相反，便于理解「上抬」） */
  y: number
  /** 该发是否命中靶心范围 */
  hit: boolean
}

/** 一次采样点：手指在某个时刻的位置 */
export interface RecoilSample {
  /** 相对开火时刻的毫秒数 */
  t: number
  /** 手指相对起点的垂直位移（像素，向下为正——向下滑才是压枪） */
  dy: number
}

/** 计算入参 */
export interface RecoilInput {
  /** 使用的配装 */
  loadout: Loadout
  /** 手指轨迹采样点。按 t 升序，但函数内部仍会排序以防调用方给乱序数据 */
  samples: RecoilSample[]
  /** 实际按住射击的时长（毫秒） */
  duration: number
  /**
   * 灵敏度。缺省时用基准值。
   *
   * 取的是方案里「开火镜头」在当前倍镜下的那一格——
   * 那正是决定压枪手感的那一项，而不是镜头或陀螺仪。
   */
  sensitivity?: number
  /**
   * 随机种子。
   *
   * 水平后坐力是随机的，但**不能真随机**：同一个轨迹每次算出的分数必须一致，
   * 否则用户会觉得「同样的操作分数不一样」，也无法写单测。
   * 由调用方传入（通常用时间戳或记录 id 的哈希），保证可复现。
   */
  seed: number
}

/** 计算结果 */
export interface RecoilResult {
  /** 综合得分 0~100 */
  score: number
  /** 评级 */
  rating: Rating
  /** 平均垂直偏移（像素，取绝对值后平均） */
  verticalOffset: number
  /** 平均水平偏移（像素） */
  horizontalOffset: number
  /** 垂直稳定性 0~100 */
  verticalStability: number
  /** 水平稳定性 0~100 */
  horizontalStability: number
  /** 本次共打出多少发 */
  shotsFired: number
  /** 命中率 0~1 */
  hitRate: number
  /** 每一发的弹着点，用于绘制靶纸 */
  impacts: ImpactPoint[]
}

/* ──────────────────────────────────────────────────────────────────────
 * 内部工具
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 线性同余伪随机数生成器。
 *
 * 不用 Math.random 的原因见 RecoilInput.seed 的注释——需要可复现。
 * 选 LCG 而不是更复杂的算法：它的分布质量对「枪口随机摆动」这种
 * 用途完全够用，且实现只有三行，不会成为阅读负担。
 */
function createRandom(seed: number): () => number {
  // 用 32 位无符号整数做状态。种子为 0 时会让序列退化成全 0，
  // 因此强制偏移到一个非零起点
  let state = (seed >>> 0) || 1

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

/**
 * 在采样轨迹上做线性插值，取某个时刻的手指位移。
 *
 * 必须插值而不能取最近点：射击间隔约 90ms（M416），而触摸事件的采样率
 * 在低端机上可能只有 30Hz（约 33ms 一次），两者不对齐。
 * 取最近点会让补偿量出现阶梯状跳变，分数随之抖动。
 */
export function interpolateDy(samples: RecoilSample[], t: number): number {
  if (samples.length === 0) return 0

  // 开火前手指还没动
  if (t <= samples[0].t) return samples[0].dy
  // 松手后维持在最后的位置
  const last = samples[samples.length - 1]
  if (t >= last.t) return last.dy

  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1]
    const curr = samples[i]
    if (t <= curr.t) {
      const span = curr.t - prev.t
      // 两个采样点时间相同时无法插值，直接取后一个，避免除以 0 得到 NaN
      if (span <= 0) return curr.dy
      const ratio = (t - prev.t) / span
      return prev.dy + (curr.dy - prev.dy) * ratio
    }
  }

  return last.dy
}

/**
 * 平滑评分曲线。
 *
 * 用 `100 / (1 + x / tolerance)` 而不是 `100 - x * k` 这种线性扣分：
 *   ① 线性扣分需要额外 clamp，否则偏移稍大就变成负分；
 *   ② 线性函数在 0 附近过于严苛——0px 和 2px 的差距被放大成同样大的分差，
 *      但人手本来就不可能做到完美，这会让所有人在低分段挤成一团。
 * 这个函数天然落在 (0, 100] 区间，且在 0 附近平坦、远处收敛，符合手感。
 */
function toScore(offset: number, tolerance: number): number {
  return 100 / (1 + Math.abs(offset) / tolerance)
}

/** 把结果限制在 [min, max] 区间 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 取靶型的评分宽容度。
 *
 * 靶型缺失时按 1 处理：评分不该因为一个展示配置读不到就整体失败。
 */
export function getTargetTolerance(loadout: Loadout): number {
  return TARGETS.find((item) => item.id === loadout.targetId)?.tolerance ?? 1
}

/* ──────────────────────────────────────────────────────────────────────
 * 单发模拟器
 * ────────────────────────────────────────────────────────────────────── */

export interface RecoilSimulator {
  /** 已经打出多少发 */
  readonly shotIndex: number
  /** 当前的累积后坐力（像素）。界面用它画枪口位置 */
  readonly accumulated: number
  /**
   * 打一发。
   *
   * @param compensation 该时刻手指的下滑位移（像素，向下为正）
   * @returns 这一发的落点
   */
  fire(compensation: number): ImpactPoint
}

/**
 * 创建一个单发模拟器。
 *
 * 它持有后坐力累积、水平动量、随机序列这三份可变状态——
 * 这些状态必须跨「发」保留，所以不能写成无状态的纯函数。
 * 用闭包封装而不是 class：本项目其余部分都是函数式风格，
 * 为这一个场景引入 class 会让代码风格割裂。
 */
export function createRecoilSimulator(
  recoil: EffectiveRecoil,
  seed: number,
  tolerance: number,
  sensitivity = BASE_SENSITIVITY,
): RecoilSimulator {
  const random = createRandom(seed)
  const gain = getSensitivityGain(sensitivity)
  const horizontalScale = getHorizontalScale(gain)
  let shotIndex = 0
  let accumVertical = 0
  /**
   * 水平方向的动量。
   *
   * 真实枪口的左右摆动有惯性——它不会这一发往左、下一发立刻往右，
   * 而是像被某种力推着来回游走。用一阶自回归模拟这件事：
   * 每次保留 60% 的上一发动量，再叠加一点新的随机扰动。
   * 纯白噪声（每次独立随机）看起来像抖动，不像后坐力。
   */
  let horizontalMomentum = 0

  return {
    get shotIndex() {
      return shotIndex
    },
    get accumulated() {
      return accumVertical
    },

    fire(compensation: number): ImpactPoint {
      // ① 本发产生的上抬
      accumVertical += recoil.vertical * RECOIL_PIXEL_UNIT

      // ② 枪口回复：每发之后回落一部分
      accumVertical *= 1 - clamp(recoil.recovery * RECOVERY_BASE, 0, 0.9)

      // ③ 垂直偏移 = 枪口上抬 - 手指下压 × 灵敏度增益。
      //    灵敏度越高，同样的滑动能压掉越多后坐力
      const offsetY = accumVertical - compensation * gain

      // ④ 水平摆动。乘上灵敏度放大系数：灵敏度越高，手抖被放得越大
      horizontalMomentum = horizontalMomentum * 0.6 + (random() - 0.5) * 2
      const offsetX =
        horizontalMomentum * recoil.horizontal * RECOIL_PIXEL_UNIT * horizontalScale

      const point: ImpactPoint = {
        index: shotIndex,
        x: offsetX,
        // 存成「上为正」，与屏幕坐标相反，便于阅读与绘制时取反
        y: offsetY,
        hit: isHit(offsetX, offsetY, tolerance),
      }

      shotIndex += 1
      return point
    },
  }
}

/**
 * 命中判定。
 *
 * 靶心半径随距离放大——这模拟的是「目标在视野里变小」的透视效果，
 * 而不是说远距离的靶子在物理上真的更大。二者在数学上等价，
 * 但把变量放在半径上比放在偏移上更好理解。
 */
function isHit(x: number, y: number, tolerance: number): boolean {
  const radius = 18 * tolerance
  return Math.sqrt(x * x + y * y) <= radius
}

/* ──────────────────────────────────────────────────────────────────────
 * 汇总评分
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 把一串弹着点汇总成成绩。
 *
 * @param impacts 逐发落点（实时训练时由模拟器累积而来）
 * @param duration 实际训练时长（毫秒）
 * @param tolerance 靶型宽容度，由 getTargetTolerance 取得
 */
export function summarize(
  impacts: ImpactPoint[],
  duration: number,
  tolerance: number,
): RecoilResult {
  // 至少按一发算：时长为 0 或极短时 shotsFired 为 0，
  // 会让各项平均值变成 NaN，最终渲染出 "NaN 分"
  const shotsFired = Math.max(1, impacts.length)

  const absVertical = impacts.reduce((sum, item) => sum + Math.abs(item.y), 0) / shotsFired
  const absHorizontal = impacts.reduce((sum, item) => sum + Math.abs(item.x), 0) / shotsFired
  const hitCount = impacts.filter((item) => item.hit).length
  const hitRate = hitCount / shotsFired

  // 靶型的宽容度直接放大评分刻度：移动靶更难，就该给更宽的标准，
  // 否则移动靶的分数会永远低于静态靶，无法横向比较
  const verticalStability = toScore(absVertical, VERTICAL_TOLERANCE_PX * tolerance)
  const horizontalStability = toScore(absHorizontal, HORIZONTAL_TOLERANCE_PX * tolerance)

  /**
   * 完成度：没打满目标时长要按比例扣分。
   *
   * 没有这一项的话会出现一个漏洞：用户只按住 0.5 秒、打出 3 发，
   * 前 3 发的后坐力累积还很小，几乎必然得高分。
   * 有了完成度，短按就拿不到高分，训练才有意义。
   */
  const completeness = clamp(duration / TRAINING_DURATION, 0, 1)

  /**
   * 综合得分。
   *
   * 权重分配的依据：
   *   垂直 55% —— 这是压枪训练的核心能力，也是唯一能靠练习显著提升的部分；
   *   水平 30% —— 主要靠配件，但「压枪时枪口是否被带偏」仍反映手部稳定度；
   *   命中 15% —— 是前两者的结果而非独立能力，权重给低，
   *                避免同一件事被重复计分两次。
   */
  const rawScore =
    verticalStability * 0.55 + horizontalStability * 0.3 + hitRate * 100 * 0.15
  const score = Math.round(rawScore * completeness)

  return {
    score,
    rating: getRating(score),
    verticalOffset: Number(absVertical.toFixed(2)),
    horizontalOffset: Number(absHorizontal.toFixed(2)),
    verticalStability: Math.round(verticalStability),
    horizontalStability: Math.round(horizontalStability),
    shotsFired,
    hitRate: Number(hitRate.toFixed(4)),
    impacts,
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * 便捷入口：一次性算出结果
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 计算一次压枪训练的结果（轨迹 → 成绩）。
 *
 * 页面上的实时训练不走这里（它用 createRecoilSimulator 逐发累积，
 * 因为要边打边画），但单测和「回放一段轨迹」的场景用这个入口更方便。
 *
 * @returns 评分结果；配装非法（枪械或倍镜 id 不存在）时返回 null
 */
export function calcRecoilResult(input: RecoilInput): RecoilResult | null {
  const recoil = computeEffectiveRecoil(input.loadout)
  if (!recoil) return null

  const tolerance = getTargetTolerance(input.loadout)

  // 采样点按时间排序。触摸事件在极端情况下可能乱序到达，
  // 不排序会让插值函数在时间倒流的区间里返回错误结果
  const samples = [...input.samples].sort((a, b) => a.t - b.t)

  const duration = Math.max(0, input.duration)
  const shotsFired = Math.max(1, Math.floor(duration / recoil.shotInterval))

  const simulator = createRecoilSimulator(recoil, input.seed, tolerance, input.sensitivity)
  const impacts: ImpactPoint[] = []

  for (let i = 0; i < shotsFired; i += 1) {
    // 第 i 发在 t = (i + 0.5) * 间隔 时刻出膛。加半个间隔让首发不落在 0 时刻，
    // 避免「手指还没开始动，第一发就已经算完了」的失真
    const t = (i + 0.5) * recoil.shotInterval
    impacts.push(simulator.fire(interpolateDy(samples, t)))
  }

  return summarize(impacts, duration, tolerance)
}

/**
 * 生成一条「完美压枪」的参考轨迹。
 *
 * 用途：训练结束后的对比展示——用户可以直观看到自己的轨迹
 * 与标准轨迹差在哪里，比只给一个分数更有指导价值。
 *
 * 之所以要真的跑一遍计算而不是画一条直线：
 * 完美轨迹的形状取决于枪械的后坐力曲线（射速快的枪上抬更密集），
 * 直接画直线在 AKM 上和 Vector 上都不对。
 *
 * @returns 每一发对应的「手指应当下滑到的位置」
 */
export function buildPerfectTrace(
  loadout: Loadout,
  duration = TRAINING_DURATION,
  sensitivity = BASE_SENSITIVITY,
): number[] {
  const recoil = computeEffectiveRecoil(loadout)
  if (!recoil) return []

  const gain = getSensitivityGain(sensitivity)
  const shots = Math.max(1, Math.floor(duration / recoil.shotInterval))
  const trace: number[] = []
  let accum = 0

  for (let i = 0; i < shots; i += 1) {
    accum += recoil.vertical * RECOIL_PIXEL_UNIT
    accum *= 1 - clamp(recoil.recovery * RECOVERY_BASE, 0, 0.9)
    // 完美轨迹 = 每一发都刚好把枪口压回原点。
    // 因为实际补偿量是「滑动距离 × 增益」，所以滑动距离要除回去——
    // 灵敏度调得低，就得滑得更远，这条轨迹正是要告诉用户「该滑多远」
    trace.push(Number((accum / gain).toFixed(2)))
  }

  return trace
}
