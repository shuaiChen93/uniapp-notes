/**
 * Store 统一出口
 *
 * main.ts 只需从这里取 createPersistPlugin 安装一次；
 * 页面里则 `import { useUserStore } from '@/store'`。
 */
export { useUserStore } from './modules/user'
export { createPersistPlugin } from './plugins/persist'
export type { PersistOptions } from './plugins/persist'
