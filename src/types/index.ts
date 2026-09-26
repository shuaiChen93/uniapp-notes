/**
 * 类型统一出口
 *
 * 页面与 store 里统一 `import type { UserInfo } from '@/types'`，
 * 而不是记「这个类型在 types/user.ts 还是 types/api.ts」。
 * 后续新增领域类型时，改动点收敛在这里一处。
 */
export type * from './api'
export type * from './user'
