import { STORAGE_KEYS } from '@/constants/storage'
import { getRating } from '@/constants/rating'
import type { RankEntry, RankResult, RankType, TrainingRecord } from '@/types'
import { selectAll } from '../db'
import { ok, type MockResponse } from '../utils'
import { resolveCurrentUser } from './auth'

/**
 * Mock：排行榜
 * ══════════════════════════════════════════════════════════════════════
 * ⚠️ 这是本项目**最"假"的一块**，务必看清楚边界。
 *
 * 真实的好友排行榜需要两样本机拿不到的东西：
 *   ① 用户的好友关系链 —— 要么走微信开放数据域
 *      （wx.getFriendCloudStorage，只能在子域里渲染，样式受限），
 *      要么由后端维护好友关系；
 *   ② 好友的成绩数据 —— 必须来自服务端，本地无从得知。
 *
 * 因此这里的榜单是**用确定性算法生成的虚拟数据**，只为了让页面的
 * 布局、排序、翻页、"我离上一名还差几分"这些交互能被真实地开发与验证。
 * 它不具备任何真实性，也**不应被当成"以后就这么实现"**。
 *
 * ── 为什么用确定性算法而不是随机数 ────────────────────────────────────
 * 用 Math.random 的话，每次进页面榜单都会变——名次乱跳、分数浮动，
 * 用户会以为数据在实时更新，而实际上只是随机。更要命的是，
 * 这种"每次都不一样"会让任何截图、报错复现都失去意义。
 * 用昵称做哈希种子后，同一个名字永远得到同一个分数，
 * 榜单在多次访问之间保持稳定，看起来才像一个真的榜。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 机器人昵称池。
 *
 * 刻意写成有游戏味的名字，而不是「用户001」——后者一眼假，
 * 会让开发者在调试时下意识地忽略这块内容，反而漏掉真实的布局问题。
 */
const BOT_NAMES: readonly string[] = [
  '一枪一个小朋友',
  'M416本命',
  '压枪压到自闭',
  '沙漠之心',
  '八倍镜战神',
  '不吃鸡不改名',
  '左手压枪右手吃鸡',
  '机场之王P城霸主',
  '狙击手已就位',
  '三级头收藏家',
  '平底锅大师',
  '决赛圈常客',
  '雨林伏地魔',
  '钢枪不虚',
  '开镜就是缘分',
  '落地成盒王',
  '不杀人只捡包',
  '车队司机',
  '医疗兵本兵',
  '报点小能手',
  '手雷当球踢',
  '烟雾弹艺术家',
  '独狼一只',
  '老兵不死',
  '萌新求带飞',
  '压枪全靠缘分',
  '枪法随缘',
  '四指操作萌新',
  '陀螺仪信徒',
  '灵敏度调参侠',
  '中距离之王',
  '近战钢枪怪',
] as const

/** 好友榜取前多少个机器人。数量少，符合「好友本来就没几个」的现实 */
const FRIEND_COUNT = 12

/** 榜单默认返回多少名 */
const DEFAULT_LIMIT = 50

/* ──────────────────────────────────────────────────────────────────────
 * 确定性分数生成
 * ────────────────────────────────────────────────────────────────────── */

/**
 * FNV-1a 字符串哈希。
 *
 * 用它而不是简单的 `charCodeAt` 累加：累加哈希对「字符顺序不同但字符集合相同」
 * 的输入会得到同一个值（"abc" 和 "cba" 撞车），而昵称池里这类情况很常见，
 * 会导致一批机器人分数完全一样，榜单看起来很不自然。
 */
function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    // 用 Math.imul 保证是 32 位整数乘法。
    // 直接写 `hash * 16777619` 会超出双精度整数范围而丢精度
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * 由昵称推算出一个稳定的分数。
 *
 * 分布设计：把哈希值映射到 62~97 区间，且**刻意做成右偏**——
 * 高分段的密度更低。真实的成绩分布本来就是尖峰右偏的
 * （大多数人集中在中等水平，顶尖的很少），
 * 均匀分布会让榜单看起来像随机数，一眼就不真。
 */
function botScore(name: string): number {
  const hash = hashString(`score:${name}`)
  // 取哈希的高位而不是低位：低位的规律性更强，容易出现相邻昵称分数也相邻
  const normalized = (hash % 10000) / 10000
  // 平方后映射，让结果向低分段堆积
  const curved = Math.pow(normalized, 1.6)
  return Math.round(97 - curved * 35)
}

/** 把一条机器人记录转成榜单条目 */
function toBotEntry(name: string): Omit<RankEntry, 'rank' | 'isSelf'> {
  const score = botScore(name)
  return {
    userId: `bot_${hashString(name).toString(36)}`,
    nickname: name,
    // 与用户表保持一致的约定：不引入网络图片，界面用昵称首字的文字头像
    avatar: '',
    score,
    rating: getRating(score),
    // 用哈希决定谁是"好友"：好友榜取哈希值最小的一批，
    // 这样每次算出来的好友集合都是同一批，不会今天有他明天没他
    isFriend: false,
  }
}

/* ──────────────────────────────────────────────────────────────────────
 * GET /rank —— 榜单
 * ────────────────────────────────────────────────────────────────────── */

/**
 * 取当前用户的最高分。
 *
 * 从训练记录里现算，而不是单独维护一张"我的最高分"表：
 * 单表是冗余数据，一旦某次删除记录时忘了同步更新，就会出现
 * "榜上是 95 分，但翻遍记录最高只有 88"这种无法解释的现象。
 * 现算的代价是遍历一次记录数组，几十条数据完全不值得优化。
 */
function getMyBestScore(userId: string | undefined): number {
  const rows = selectAll<TrainingRecord>(STORAGE_KEYS.RECORDS)
  // 未登录时也把游客记录算进去：本项目的记录按设备存，
  // 用户不登录也应该能在榜上看到自己练出来的成绩
  const mine = userId ? rows.filter((row) => row.userId === userId || row.userId === '') : rows

  return mine.reduce((best, row) => Math.max(best, row.score), 0)
}

export function handleGetRank(
  query: Record<string, string>,
  header?: Record<string, string>,
): MockResponse {
  const type = (query.type === 'global' ? 'global' : 'friend') as RankType
  const limit = Math.max(1, Math.min(100, Number(query.limit) || DEFAULT_LIMIT))

  const user = resolveCurrentUser(header)

  // 生成机器人榜。全服榜用全部昵称，好友榜只用前 FRIEND_COUNT 个
  const names = type === 'friend' ? BOT_NAMES.slice(0, FRIEND_COUNT) : BOT_NAMES
  const bots = names.map(toBotEntry)
  if (type === 'friend') {
    // 好友榜里所有机器人都是"好友"，页面据此不显示"加好友"引导
    bots.forEach((bot) => {
      bot.isFriend = true
    })
  }

  const myScore = getMyBestScore(user?.id)

  const me: RankEntry = {
    rank: 0,
    userId: user?.id ?? 'self',
    nickname: user?.nickname ?? '我',
    avatar: user?.avatar ?? '',
    score: myScore,
    rating: getRating(myScore),
    isSelf: true,
    isFriend: true,
  }

  // 所有人一起排序。分数相同时按昵称排——
  // 需要一个稳定的次序，否则同分用户每次刷新的名次都会变
  const all: RankEntry[] = [...bots.map((bot) => ({ ...bot, rank: 0, isSelf: false })), me]
  all.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.nickname.localeCompare(b.nickname)
  })

  all.forEach((entry, index) => {
    entry.rank = index + 1
  })

  const selfEntry = all.find((entry) => entry.isSelf)
  const selfRank = selfEntry?.rank ?? 0
  // 上一名就是排在自己前面的那个。已经是第一时没有上一名，差距记 0
  const above = selfRank > 1 ? all[selfRank - 2] : undefined

  const result: RankResult = {
    type,
    list: all.slice(0, limit),
    self: {
      rank: selfRank,
      score: myScore,
      gapToNext: above ? above.score - myScore : 0,
    },
    total: all.length,
    /**
     * 固定为 0，表示「这个时间不适用」。
     *
     * 不能填 Date.now()：榜单是完全由昵称哈希推出来的确定性数据，
     * 没有任何东西被「更新」过。报一个每次访问都变的时间戳，
     * 会让页面上出现「刚刚更新」这种彻底失真的信息，
     * 用户下次进来发现名次一分没变，只会觉得这个 App 在骗人。
     * 页面据此判断：updatedAt 为 0 时不渲染更新时间。
     */
    updatedAt: 0,
  }

  return ok(result)
}
