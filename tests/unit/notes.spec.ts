import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createPersistPlugin, useNotesStore } from '@/store'
import { STORAGE_KEYS } from '@/constants/storage'

/**
 * 记事 store 的单元测试
 * ══════════════════════════════════════════════════════════════════════
 * 重点覆盖三件事，因为它们任何一个出错都会直接导致用户数据丢失：
 *
 *   ① 增删改的正确性（尤其是「编辑不该产生新条目」）
 *   ② 持久化真的发生了（写完立刻就在 storage 里，不等下一个事件循环）
 *   ③ 冷启动能恢复（这是「本地数据库」这个定位的底线）
 *
 * 时间线分组也一并覆盖：它是首页唯一的排序依据。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 建一个干净的 pinia 并返回 store。每次调用都模拟一次「冷启动」。
 *
 * ⚠️ 这里的行数与顺序都和 main.ts 保持一致，尤其是 `app.use(pinia)`
 * ——它**不是可省略的样板代码**。Pinia 的 use() 在实例尚未安装到
 * 应用时，只是把插件压进一个待安装队列，等 install 时才真正注册。
 * 漏掉这一句的话，插件永远不生效，而 store 本身照常工作：
 * 表现为「增删改查的断言全绿，持久化的断言全红」，
 * 看起来像是写盘逻辑坏了，实际是测试脚手架没搭对。
 */
function freshStore() {
  const pinia = createPinia()
  pinia.use(createPersistPlugin())

  const app = createApp({})
  app.use(pinia)

  setActivePinia(pinia)
  return useNotesStore()
}

/** 直接读原始 storage，绕过 store，验证「确实写进去了」 */
function readRaw(): { notes: unknown[] } | null {
  const raw = uni.getStorageSync(STORAGE_KEYS.NOTES) as string
  return raw ? JSON.parse(raw) : null
}

describe('notes store', () => {
  beforeEach(() => {
    // 固定系统时间：分组标签（今天/昨天）与时间戳断言都依赖它
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-27T10:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('新建记事：生成 id，并补齐系统维护的字段', () => {
    const store = freshStore()

    const note = store.save({ title: '  今天的计划  ', content: ' 看两章书 ', date: '2026-09-27' })

    expect(note.id).toMatch(/^n_/)
    // 标题与正文在保存时去空白：用户在输入框里的随手空格不该被当成内容
    expect(note.title).toBe('今天的计划')
    expect(note.content).toBe('看两章书')
    expect(note.createdAt).toBe(note.updatedAt)
    expect(store.total).toBe(1)
  })

  it('保存后数据立刻落盘，不依赖下一个事件循环', () => {
    const store = freshStore()
    store.save({ title: 'A', content: '', date: '2026-09-27' })

    // 不 await、不推进定时器，直接读——这正是用户「点保存后立刻划掉小程序」的时序
    expect(readRaw()?.notes).toHaveLength(1)
  })

  it('编辑已有记事：不新增条目，且 createdAt 保持不变', () => {
    const store = freshStore()
    const created = store.save({ title: '原标题', content: '原内容', date: '2026-09-27' })

    vi.setSystemTime(new Date('2026-09-27T12:00:00'))
    const updated = store.save({
      id: created.id,
      title: '新标题',
      content: '新内容',
      date: '2026-09-26',
    })

    expect(store.total).toBe(1)
    expect(updated.id).toBe(created.id)
    // createdAt 记的是「这条什么时候写的」，改标题不该让它变成新记事
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.updatedAt).toBeGreaterThan(created.createdAt)
    expect(updated.date).toBe('2026-09-26')
  })

  it('编辑一个已被删除的 id：退化为新建，而不是丢弃用户刚写的内容', () => {
    const store = freshStore()
    const created = store.save({ title: 'A', content: '', date: '2026-09-27' })
    store.remove(created.id)

    const result = store.save({ id: created.id, title: 'B', content: '', date: '2026-09-27' })

    expect(store.total).toBe(1)
    expect(result.id).not.toBe(created.id)
    expect(result.title).toBe('B')
  })

  it('删除：只影响目标条目', () => {
    const store = freshStore()
    const first = store.save({ title: 'A', content: '', date: '2026-09-27' })
    store.save({ title: 'B', content: '', date: '2026-09-27' })

    store.remove(first.id)

    expect(store.total).toBe(1)
    expect(store.getById(first.id)).toBeUndefined()
  })

  it('时间线分组：日期倒序，组内按创建时刻倒序，并带出展示标签', () => {
    const store = freshStore()

    store.save({ title: '较早', content: '', date: '2026-09-25' })
    vi.setSystemTime(new Date('2026-09-27T11:00:00'))
    store.save({ title: '今天先写', content: '', date: '2026-09-27' })
    vi.setSystemTime(new Date('2026-09-27T12:00:00'))
    store.save({ title: '今天后写', content: '', date: '2026-09-27' })

    const groups = store.groups

    expect(groups.map((g) => g.date)).toEqual(['2026-09-27', '2026-09-25'])
    expect(groups[0].label).toBe('今天')
    // 同一天内后写的排前面：用户刚记完的东西应该一眼就能看到
    expect(groups[0].notes.map((n) => n.title)).toEqual(['今天后写', '今天先写'])
    expect(groups[1].label).toBe('09月25日')
  })

  it('分组不会污染数据源：源数组的存储顺序保持为创建先后', () => {
    const store = freshStore()
    store.save({ title: '先', content: '', date: '2026-09-27' })
    store.save({ title: '后', content: '', date: '2026-09-26' })

    void store.groups

    // 若分组时对源数组做了原地排序，这里会变成 ['后', '先']
    expect(store.notes.map((n) => n.title)).toEqual(['先', '后'])
  })

  it('冷启动：新建 store 能从 storage 恢复出全部记事', () => {
    const first = freshStore()
    first.save({ title: '重启前写的', content: '内容', date: '2026-09-27' })

    // 重开一次应用：全新的 pinia、全新的 store 实例
    const second = freshStore()

    expect(second.total).toBe(1)
    expect(second.notes[0].title).toBe('重启前写的')
  })
})
