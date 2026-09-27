/**
 * 枪械 / 配件 / 倍镜 / 距离 / 靶型 数据
 * ══════════════════════════════════════════════════════════════════════
 * 这些是**静态配置**，不是接口数据——真实项目里它们通常也放在前端，
 * 因为：射击游戏每次调版本平衡都要动这些数值，若走接口，
 * 会导致「打开训练页先等一次网络请求」；而且它们不随用户变化，没有下发的必要。
 *
 * 但注意：**枪械的数值会随版本变化**。真实项目应把这份表做成
 * 「本地兜底 + 远端覆盖」——启动时拉一次最新配置，拉不到就用本地这份。
 * 本项目没有后端，先只保留本地兜底。
 *
 * ⚠️ 数值是**游戏手感意义上的相对值**，不是从游戏里扒出来的真实参数。
 * 它们只保证「AKM 比 M416 难压」这类相对关系成立，
 * 让评分能区分出枪械差异；绝对值没有意义，也不必去对齐。
 * ══════════════════════════════════════════════════════════════════════
 */

/* ──────────────────────────────────────────────────────────────────────
 * 枪械
 * ────────────────────────────────────────────────────────────────────── */

export type WeaponId = 'm416' | 'akm' | 'scar-l' | 'm762' | 'ump45' | 'vector'

export type WeaponCategory = 'ar' | 'smg'

export interface Weapon {
  id: WeaponId
  /** 展示名 */
  name: string
  /** 分类：突击步枪 / 冲锋枪。用于列表分组 */
  category: WeaponCategory
  /** 射速（发/分钟）。决定每发之间的间隔，是手感的核心 */
  rpm: number
  /**
   * 垂直后坐力系数。
   * 含义：每发子弹让枪口上抬的基准量。数值越大越难压。
   */
  verticalRecoil: number
  /**
   * 水平后坐力系数。
   * 含义：每发子弹让枪口左右摆动的幅度。这部分**无法通过压枪消除**，
   * 只能靠配件降低——它才是区分高手和新手的关键指标。
   */
  horizontalRecoil: number
  /**
   * 枪口回复速度（占射速间隔的比例）。
   * 停火或压枪过度后，枪口自动回落的速度。数值越大越"跟手"。
   */
  recovery: number
}

/**
 * 枪械表。
 *
 * 排序即列表展示顺序：从「最易上手」到「最难驾驭」，
 * 而不是按 id 或字母序——新手进来第一眼看到的应该是 M416，
 * 而不是被 AKM 的高后坐力劝退。
 */
export const WEAPONS: readonly Weapon[] = [
  {
    id: 'm416',
    name: 'M416',
    category: 'ar',
    rpm: 660,
    verticalRecoil: 1.0,
    horizontalRecoil: 0.55,
    recovery: 0.85,
  },
  {
    id: 'scar-l',
    name: 'SCAR-L',
    category: 'ar',
    rpm: 600,
    verticalRecoil: 1.1,
    horizontalRecoil: 0.6,
    recovery: 0.8,
  },
  {
    id: 'akm',
    name: 'AKM',
    category: 'ar',
    rpm: 600,
    // AKM 的灵魂就是「垂直后坐力大但水平很稳」，所以这里垂直给高、水平给低。
    // 这类「偏科」设定让不同枪械需要不同的压枪手法，而不是单纯的难度排序
    verticalRecoil: 1.65,
    horizontalRecoil: 0.5,
    recovery: 0.6,
  },
  {
    id: 'm762',
    name: 'M762',
    category: 'ar',
    rpm: 700,
    // 垂直和水平双高：游戏里公认最难压的枪之一
    verticalRecoil: 1.8,
    horizontalRecoil: 1.05,
    recovery: 0.55,
  },
  {
    id: 'ump45',
    name: 'UMP45',
    category: 'smg',
    rpm: 620,
    // 冲锋枪垂直后坐力低但水平散布略大，符合「近战泼水」的定位
    verticalRecoil: 0.72,
    horizontalRecoil: 0.7,
    recovery: 0.9,
  },
  {
    id: 'vector',
    name: 'Vector',
    category: 'smg',
    rpm: 1100,
    // 射速极高意味着单位时间内要压的枪口位移极大，
    // 单发后坐力很低但总需求最高——这是它手感独特的原因
    verticalRecoil: 0.6,
    horizontalRecoil: 0.65,
    recovery: 1.0,
  },
] as const

/** 按 id 取枪械，找不到返回 undefined（调用方负责兜底） */
export function getWeapon(id: WeaponId): Weapon | undefined {
  return WEAPONS.find((item) => item.id === id)
}

/** 每发子弹的间隔（毫秒），由射速换算 */
export function getShotInterval(weapon: Weapon): number {
  return 60000 / weapon.rpm
}

/* ──────────────────────────────────────────────────────────────────────
 * 配件
 *
 * 配件分三个槽位，每个槽位只能装一个——与游戏一致。
 * 用 Record<槽位, 配件[]> 组织，页面渲染时直接遍历，不需要额外分组逻辑。
 * ────────────────────────────────────────────────────────────────────── */

export type AttachmentSlot = 'muzzle' | 'grip' | 'stock'

export type AttachmentId =
  // 枪口
  | 'compensator'
  | 'flash-hider'
  | 'suppressor'
  // 握把
  | 'vertical-grip'
  | 'angled-grip'
  | 'lightweight-grip'
  // 枪托
  | 'tactical-stock'
  | 'cheek-pad'

export interface Attachment {
  id: AttachmentId
  name: string
  slot: AttachmentSlot
  /**
   * 后坐力修正系数。最终后坐力 = 基础值 × 各槽位系数的乘积。
   *
   * 用**乘法**而不是加法：加法在多件配件叠加时会出现负值或归零，
   * 让「装三个配件就完全无后坐力」成为可能，平衡性直接崩掉。
   * 乘法天然收敛，永远不会低于 0。
   */
  verticalFactor: number
  horizontalFactor: number
  /** 对回复速度的修正，同样是乘数 */
  recoveryFactor: number
  /** 一句话说明，展示在配件选择项下方 */
  desc: string
}

export const ATTACHMENT_SLOTS: readonly AttachmentSlot[] = ['muzzle', 'grip', 'stock'] as const

/** 槽位的中文名 */
export const ATTACHMENT_SLOT_LABEL: Record<AttachmentSlot, string> = {
  muzzle: '枪口',
  grip: '握把',
  stock: '枪托',
}

/**
 * 配件表。
 *
 * ⚠️ 槽位齐全很重要：如果某个槽位在表里一个配件都没有，
 * 页面会渲染出一个空分组，用户点进去发现什么都没有，
 * 会以为是 bug。因此三个槽位各自至少给 2~3 个选项。
 */
export const ATTACHMENTS: readonly Attachment[] = [
  /* 枪口 */
  {
    id: 'compensator',
    name: '补偿器',
    slot: 'muzzle',
    // 唯一同时降低垂直与水平后坐力的枪口，代价是没有任何隐蔽性收益
    verticalFactor: 0.75,
    horizontalFactor: 0.8,
    recoveryFactor: 1,
    desc: '同时降低垂直与水平后坐力，压枪首选',
  },
  {
    id: 'flash-hider',
    name: '消焰器',
    slot: 'muzzle',
    verticalFactor: 0.9,
    horizontalFactor: 0.92,
    recoveryFactor: 1.05,
    desc: '小幅降低后坐力，并消除开火火光',
  },
  {
    id: 'suppressor',
    name: '消音器',
    slot: 'muzzle',
    // 一点后坐力都不减：它的价值在隐蔽性，不在手感。
    // 保留这个「零收益」选项是有意的——它能验证评分确实在按数值算，
    // 而不是「装了配件就加分」
    verticalFactor: 1,
    horizontalFactor: 1,
    recoveryFactor: 1,
    desc: '降低开火声音与火光，不改善后坐力',
  },
  /* 握把 */
  {
    id: 'vertical-grip',
    name: '垂直握把',
    slot: 'grip',
    verticalFactor: 0.8,
    horizontalFactor: 1,
    recoveryFactor: 1,
    desc: '大幅降低垂直后坐力，适合压枪不稳时使用',
  },
  {
    id: 'angled-grip',
    name: '直角握把',
    slot: 'grip',
    verticalFactor: 1,
    horizontalFactor: 0.8,
    recoveryFactor: 1,
    desc: '降低水平后坐力，弹道更集中',
  },
  {
    id: 'lightweight-grip',
    name: '轻质握把',
    slot: 'grip',
    // 不直接减后坐力，而是让枪口回得更快。
    // 这类「间接收益」配件是真实存在的，也让配装有了取舍
    verticalFactor: 0.95,
    horizontalFactor: 0.95,
    recoveryFactor: 1.3,
    desc: '枪口回落更快，连续点射更跟手',
  },
  /* 枪托 */
  {
    id: 'tactical-stock',
    name: '战术枪托',
    slot: 'stock',
    verticalFactor: 0.85,
    horizontalFactor: 0.85,
    recoveryFactor: 1.2,
    desc: '全面提升稳定性，综合收益最高',
  },
  {
    id: 'cheek-pad',
    name: '托腮板',
    slot: 'stock',
    verticalFactor: 0.9,
    horizontalFactor: 0.9,
    recoveryFactor: 1,
    desc: '小幅降低后坐力，轻量选择',
  },
] as const

/** 取某个槽位的全部可选配件 */
export function getAttachmentsBySlot(slot: AttachmentSlot): Attachment[] {
  return ATTACHMENTS.filter((item) => item.slot === slot)
}

/** 按 id 取配件 */
export function getAttachment(id: AttachmentId): Attachment | undefined {
  return ATTACHMENTS.find((item) => item.id === id)
}

/* ──────────────────────────────────────────────────────────────────────
 * 倍镜
 * ────────────────────────────────────────────────────────────────────── */

export type ScopeId = '2x' | '3x' | '4x' | '6x' | '8x'

export interface Scope {
  id: ScopeId
  name: string
  /**
   * 放大倍率。
   *
   * 它直接乘在后坐力的视觉位移上：倍镜越大，同样的后坐力在镜头里
   * 表现为越剧烈的抖动，压枪也就越难。这正是「高倍镜压枪更难」的原理。
   */
  magnification: number
}

/**
 * 倍镜表。需求指定 2|3|4|6|8 五档（跳过了 1 倍和 5 倍，与游戏一致）。
 */
export const SCOPES: readonly Scope[] = [
  { id: '2x', name: '2 倍镜', magnification: 1.3 },
  { id: '3x', name: '3 倍镜', magnification: 1.7 },
  { id: '4x', name: '4 倍镜', magnification: 2.2 },
  { id: '6x', name: '6 倍镜', magnification: 3.0 },
  { id: '8x', name: '8 倍镜', magnification: 3.8 },
] as const

/**
 * 高倍镜的后坐力惩罚系数。
 *
 * 为什么在 magnification 之外还要单独一个惩罚系数：
 * 放大倍率只该影响「视野里看到多大」，而后坐力本身是枪械属性，
 * 不该被瞄具改变。但游戏里高倍镜压枪明显更难，原因是它把抖动放大了。
 * 把这两件事分开建模，评分才能公平地反映「用户实际承受的难度」，
 * 而不是让 8 倍镜的分数天然比 2 倍镜低一截。
 */
export function getScopePenalty(scope: Scope): number {
  return 1 + (scope.magnification - 1) * 0.35
}

/* ──────────────────────────────────────────────────────────────────────
 * 距离与靶型
 * ────────────────────────────────────────────────────────────────────── */

/** 射击距离（米） */
export type Distance = 50 | 100 | 200 | 300

export const DISTANCES: readonly Distance[] = [50, 100, 200, 300] as const

/**
 * 距离对压枪的影响系数。
 *
 * 距离越远，同样的枪口偏移在靶面上被放大得越厉害——
 * 这是几何决定的，不是游戏设定。因此它作为**惩罚**乘在偏移量上，
 * 让「100 米压得住」和「300 米压得住」能区分出水平差异。
 */
export function getDistanceFactor(distance: Distance): number {
  // 以 100 米为基准（系数 1），每远 100 米惩罚递增
  return distance / 100
}

export type TargetId = 'static' | 'moving' | 'human'

export interface Target {
  id: TargetId
  name: string
  desc: string
  /**
   * 评分宽容度。数值越大，同样的偏移扣分越少。
   * 移动靶和静态靶的难度差异体现在这里，而不是靠改后坐力——
   * 后坐力是枪械属性，不该因为靶子类型变化。
   */
  tolerance: number
}

export const TARGETS: readonly Target[] = [
  {
    id: 'static',
    name: '静态靶',
    desc: '靶心固定，适合练基础压枪',
    tolerance: 1.0,
  },
  {
    id: 'moving',
    name: '移动靶',
    desc: '靶子左右横移，考验追踪与压枪的同时控制',
    // 宽容度更高：移动靶本身就难，若再按静态靶的标准扣分，
    // 分数会低到没有参考价值，也打击练习积极性
    tolerance: 1.35,
  },
  {
    id: 'human',
    name: '人形靶',
    desc: '模拟真人轮廓，考核实战命中率',
    tolerance: 1.15,
  },
] as const

/* ──────────────────────────────────────────────────────────────────────
 * 配装（一次训练用到的全部选择）
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 一套完整的配装。
 *
 * 配件用「槽位 → 配件 id」的映射而不是数组：
 * 「一个槽位只能装一个」这条规则由数据结构本身保证，
 * 不需要在业务代码里额外校验，也就不会出现「装了两个枪口」的脏数据。
 * 值为 null 表示该槽位空着。
 */
export interface Loadout {
  weaponId: WeaponId
  scopeId: ScopeId
  distance: Distance
  targetId: TargetId
  attachments: Record<AttachmentSlot, AttachmentId | null>
}

/** 默认配装：新手第一次进来就能直接开打，不用先做一堆选择 */
export const DEFAULT_LOADOUT: Loadout = {
  weaponId: 'm416',
  scopeId: '2x',
  distance: 100,
  targetId: 'static',
  attachments: {
    muzzle: 'compensator',
    grip: 'vertical-grip',
    stock: null,
  },
}

/**
 * 计算一套配装的实际后坐力参数。
 *
 * 这是整个评分系统的输入，也是页面上「当前后坐力」指示条的来源。
 * 做成纯函数（不读任何全局状态）让它能被单测直接覆盖——
 * 平衡性数值算错，会让所有评分集体偏移，而这种错误肉眼极难发现。
 */
export interface EffectiveRecoil {
  /** 每发子弹的垂直位移（像素，基准单位） */
  vertical: number
  /** 每发子弹的水平位移幅度（像素） */
  horizontal: number
  /** 枪口回复速度 */
  recovery: number
  /** 每发之间的间隔（毫秒） */
  shotInterval: number
}

export function computeEffectiveRecoil(loadout: Loadout): EffectiveRecoil | null {
  const weapon = getWeapon(loadout.weaponId)
  const scope = SCOPES.find((item) => item.id === loadout.scopeId)
  if (!weapon || !scope) return null

  // 从 1 开始做乘法累积：没装配件的槽位乘 1，等价于不生效
  let verticalFactor = 1
  let horizontalFactor = 1
  let recoveryFactor = 1

  for (const slot of ATTACHMENT_SLOTS) {
    const id = loadout.attachments[slot]
    if (!id) continue
    const attachment = getAttachment(id)
    if (!attachment) continue
    // 逐个相乘而不是先求和再乘：保证「装几个都不会归零」
    verticalFactor *= attachment.verticalFactor
    horizontalFactor *= attachment.horizontalFactor
    recoveryFactor *= attachment.recoveryFactor
  }

  const scopePenalty = getScopePenalty(scope)
  const distanceFactor = getDistanceFactor(loadout.distance)

  return {
    vertical: weapon.verticalRecoil * verticalFactor * scopePenalty * distanceFactor,
    horizontal: weapon.horizontalRecoil * horizontalFactor * scopePenalty * distanceFactor,
    // 回复速度除以系数：系数越大表示回复越快
    recovery: weapon.recovery * recoveryFactor,
    shotInterval: getShotInterval(weapon),
  }
}

/**
 * 把一套配装描述成一行文案，如「M416 · 2 倍镜 · 100m · 静态靶」。
 *
 * 首页的最近成绩、记录页的每一条、训练页的顶部摘要都要显示这一行。
 * 放在这里而不是各页面自己拼：三处的格式必须完全一致，
 * 否则用户会以为「首页那条记录」和「记录页那条」不是同一次训练。
 *
 * 任何一项查不到时用 `--` 占位而不抛错：历史记录里可能存着
 * 已经下架的枪械 id（版本更新后很常见），一条读不懂的记录
 * 不该让整个列表渲染失败。
 */
export function describeLoadout(loadout: Loadout): string {
  const weapon = getWeapon(loadout.weaponId)
  const scope = SCOPES.find((item) => item.id === loadout.scopeId)
  const target = TARGETS.find((item) => item.id === loadout.targetId)
  return `${weapon?.name ?? '--'} · ${scope?.name ?? '--'} · ${loadout.distance}m · ${target?.name ?? '--'}`
}
