/**
 * 类型统一出口
 *
 * 页面与 store 里统一 `import type { Note } from '@/types'`，
 * 而不是记「这个类型在 types/note.ts 还是 types/lock.ts」。
 * 后续新增领域类型时，改动点收敛在这里一处。
 *
 * ⚠️ 用 `export type *` 而非 `export *`：本目录**只放类型**。
 * 它是编译期的东西，一旦这里混进常量（比如某个默认值对象），
 * 就会变成运行时导出，让「types 目录」这个名字名不副实。
 * 所有「值」——默认配置、长度限制、标签映射——一律放 src/constants/。
 */
export type * from './note'
export type * from './lock'
export type * from './settings'
