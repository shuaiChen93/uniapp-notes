/**
 * 类型统一出口
 *
 * 页面与 store 里统一 `import type { UserInfo } from '@/types'`，
 * 而不是记「这个类型在 types/user.ts 还是 types/api.ts」。
 * 后续新增领域类型时，改动点收敛在这里一处。
 *
 * ⚠️ 用 `export type *` 而非 `export *`：本目录**只放类型**。
 * 它是编译期的东西，一旦这里混进常量（比如某个默认值对象），
 * 就会变成运行时导出，让「types 目录」这个名字名不副实。
 * 所有「值」——标签映射、默认配置、取值范围——一律放 src/constants/。
 *
 * 注意两者之间会形成 `types ←→ constants` 的互相引用
 * （如 types/sensitivity.ts 引用 constants/weapon.ts 的 ScopeId，
 *   而 constants/sensitivity.ts 反过来引用本目录的类型）。
 * 这是安全的：全部是 `import type`，编译后被完全擦除，
 * 运行时不存在这个循环。
 */
export type * from './api'
export type * from './user'
export type * from './record'
export type * from './sensitivity'
export type * from './settings'
export type * from './rank'
