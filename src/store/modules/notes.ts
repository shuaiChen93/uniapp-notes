import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { STORAGE_KEYS } from '@/constants/storage'
import { uuid } from '@/utils/id'
import { formatDateLabel } from '@/utils/format'
import type { Note, NoteDraft, NoteGroup } from '@/types'

/**
 * 记事数据 store
 * ══════════════════════════════════════════════════════════════════════
 * ── 这是全应用唯一的数据源 ────────────────────────────────────────────
 * 本项目没有后端，store 既扮演「客户端缓存」也扮演「服务端数据库」：
 * 页面调 save()/remove() 后，数据由持久化插件写进 uni storage。
 * 页面**不要**自己去碰 uni.setStorageSync——那样会绕开 store，
 * 造成内存与磁盘不一致（列表已经更新，重启后又变回去）。
 *
 * ── 增删改查都是同步的 ────────────────────────────────────────────────
 * 因为底层 storage 是同步 IO，这里刻意不做成 Promise 形式。
 * 把同步操作包成 async 只会让调用方多写一层 await，
 * 并诱导出「先显示 loading 再立刻隐藏」这种没有意义的过渡态。
 *
 * ── 排序策略：存原始序，排展示序 ──────────────────────────────────────
 * notes 数组本身**不排序**（新记事 push 到末尾）。排序全部发生在
 * groups 这个计算属性里，原因：编辑一条旧记事时若按 updatedAt 重排，
 * 它会从原来的位置跳到最上面，用户会以为「我刚才误操作了」。
 * 让「存储顺序」与「展示顺序」解耦，展示规则以后想改也只动这一处。
 * ══════════════════════════════════════════════════════════════════════
 */
export const useNotesStore = defineStore(
  'notes',
  () => {
    /** 全部记事。顺序为创建先后，展示排序见 groups */
    const notes = ref<Note[]>([])

    /** 是否一条都没有。首页据此决定显示空状态还是时间线 */
    const isEmpty = computed(() => notes.value.length === 0)

    /** 记事总条数，设置页展示「本地已存 N 条」用 */
    const total = computed(() => notes.value.length)

    /**
     * 时间线分组：按日期倒序，组内按创建时刻倒序。
     *
     * 用 Map 分桶而不是对排序后的数组做「相邻元素比较」：
     * 后者要求数组预先排好序，而且要额外处理「同一天跨数组两端」
     * 这类边界，代码会长得多且更容易错。
     */
    const groups = computed<NoteGroup[]>(() => {
      const buckets = new Map<string, Note[]>()

      for (const note of notes.value) {
        const bucket = buckets.get(note.date)
        if (bucket) bucket.push(note)
        else buckets.set(note.date, [note])
      }

      return Array.from(buckets.entries())
        // 日期串是零填充的等长格式，字典序即时间序，无需转成 Date 比较
        .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
        .map(([date, list]) => ({
          date,
          label: formatDateLabel(date),
          // ⚠️ 这里的 sort 是原地排序，但排的是上面新建的桶数组，
          // 不是 notes.value 本身，因此不会污染数据源
          notes: list.sort((a, b) => b.createdAt - a.createdAt),
        }))
    })

    /** 按 ID 取单条。详情页与编辑页共用 */
    function getById(id: string): Note | undefined {
      return notes.value.find((note) => note.id === id)
    }

    /**
     * 保存：draft.id 有值则更新，否则新建。
     *
     * 返回保存后的完整 Note，让调用方能立刻拿到 id
     * （新建后跳详情页需要它）。
     *
     * 用 splice 就地替换而不是重建整个数组：列表是 v-for 渲染的，
     * 整体替换会让所有列表项失去复用、整屏重绘。记事条目可能很多，
     * 这个差别在最坏情况下是肉眼可见的卡顿。
     */
    function save(draft: NoteDraft): Note {
      const now = Date.now()
      const title = draft.title.trim()
      const content = draft.content.trim()

      if (draft.id) {
        const index = notes.value.findIndex((note) => note.id === draft.id)
        if (index !== -1) {
          const updated: Note = {
            ...notes.value[index],
            title,
            content,
            date: draft.date,
            // createdAt 保持不变：它记录的是「这条什么时候写的」，
            // 改一次标题不该让它变成一条新记事
            updatedAt: now,
          }
          notes.value.splice(index, 1, updated)
          return updated
        }
        // 走到这里说明 draft 带着一个已不存在的 id（如详情页停留时
        // 在别处删掉了它）。此时退化为新建，比抛错更符合用户预期——
        // 他刚写完的内容不该因为一个过期 id 就丢掉
      }

      const note: Note = {
        id: uuid('n_'),
        title,
        content,
        date: draft.date,
        createdAt: now,
        updatedAt: now,
      }
      notes.value.push(note)
      return note
    }

    /** 删除单条。整体替换数组即可——删除本就需要重排列表 */
    function remove(id: string): void {
      notes.value = notes.value.filter((note) => note.id !== id)
    }

    /**
     * 清空所有记事。
     *
     * ⚠️ 只清记事，不动密码与设置：
     * 「忘记密码」走的是 utils/lock.ts 的全量清除（那是另一套语义，
     * 连密码本身都要抹掉）。两者混用会让「我只想删掉几条」的场景
     * 意外丢掉密码锁。
     */
    function clearAll(): void {
      notes.value = []
    }

    return { notes, isEmpty, total, groups, getById, save, remove, clearAll }
  },
  {
    persist: {
      key: STORAGE_KEYS.NOTES,
      // 只持久化数据本身。若不写 paths，整个 state 会被存进去，
      // 以后一旦新增 loading/选中态之类的字段就会被一并落盘
      paths: ['notes'],
      /**
       * 不节流（0 = 立即写盘）。
       *
       * 默认的 300ms 节流在设置页那种「改一下立刻能看见效果」的场景
       * 很合适，但记事的写入时机是「用户点保存后返回首页」——
       * 若此时进程被切后台或杀掉，节流窗口内没落盘的内容就直接丢了，
       * 而这恰恰是用户最不能接受丢失的数据。
       *
       * 代价可以接受：notes 的变更只发生在保存/删除这类低频动作上，
       * 不存在「滑动列表时高频写盘」的情况。
       */
      throttle: 0,
    },
  },
)
