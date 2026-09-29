/**
 * Store 统一出口
 *
 * main.ts 只需从这里取 createPersistPlugin 安装一次；
 * 页面里则 `import { useNotesStore } from '@/store'`。
 *
 * 每个 store 对应一个业务域，文件名即 store 名：
 *   notes    —— 记事数据（**持久化**：notes，这是全应用唯一的用户数据）
 *   settings —— 本地偏好：主题、密码锁开关、头像昵称（**持久化**：settings）
 *   lock     —— 解锁状态与密码校验入口（**不持久化**，理由见模块内说明：
 *               解锁状态一旦落盘，冷启动就永远是已解锁，密码锁直接失效）
 *
 * ⚠️ 新增 store 时注意：**默认不持久化**。
 * 持久化必须显式在 defineStore 的第三个参数里声明，
 * 且要用 paths 明确指定字段——全量持久化会把 loading、
 * 临时选中项这类会话状态一起存进去，冷启动时恢复出一个
 * 已经失效的中间态。
 */
export { useNotesStore } from './modules/notes'
export { useSettingsStore } from './modules/settings'
export { useLockStore } from './modules/lock'
export { createPersistPlugin } from './plugins/persist'
export type { PersistOptions } from './plugins/persist'
