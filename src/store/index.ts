/**
 * Store 统一出口
 *
 * main.ts 只需从这里取 createPersistPlugin 安装一次；
 * 页面里则 `import { useUserStore } from '@/store'`。
 *
 * 每个 store 对应一个业务域，文件名即 store 名：
 *   user        —— 登录态与用户资料（有持久化：userInfo）
 *   record      —— 训练记录列表、统计、趋势（**不持久化**，见模块内说明）
 *   sensitivity —— 灵敏度方案列表（有持久化：仅 activePlanId）
 *   settings    —— 应用设置（有持久化：settings 整体）
 *
 * ⚠️ 新增 store 时注意：**默认不持久化**。
 * 持久化必须显式在 defineStore 的第三个参数里声明，
 * 且要用 paths 明确指定字段——全量持久化会把 loading、
 * 分页游标这类会话状态一起存进去，冷启动时恢复出一个
 * 「永远转不完的 loading」。
 */
export { useUserStore } from './modules/user'
export { useRecordStore } from './modules/record'
export { useSensitivityStore } from './modules/sensitivity'
export { useSettingsStore } from './modules/settings'
export { createPersistPlugin } from './plugins/persist'
export type { PersistOptions } from './plugins/persist'
