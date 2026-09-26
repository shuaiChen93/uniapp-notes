import { STORAGE_KEYS } from '@/constants/storage'
import { getStorage, setStorage } from './storage'

/**
 * 标识生成工具
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 生成一个本地唯一 ID。
 *
 * 为什么不用 crypto.randomUUID()：小程序端没有 Web Crypto API，
 * 而自增数字在多设备/多表场景下会撞车。
 * 「时间戳(36 进制) + 随机数」在单机场景下足够唯一，
 * 且生成的串短、可读、便于日志排查。
 *
 * @param prefix 业务前缀，便于在日志里一眼看出这是什么 ID
 */
export function uuid(prefix = ''): string {
  const time = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `${prefix}${time}${random}`
}

/**
 * 获取（或首次生成）本机设备标识。
 *
 * 用途：非小程序端没有 wx.login，拿不到登录 code。
 * 这里生成一个稳定 ID 充当凭证——它一旦写入 storage 就不再变化，
 * 因此「卸载重进仍是同一个账号」这个体验与真实微信登录一致，
 * 便于在 H5 上完整调试登录/刷新/登出全流程。
 */
export function getDeviceId(): string {
  const cached = getStorage<string>(STORAGE_KEYS.DEVICE_ID)
  if (cached) return cached

  const id = uuid('dev_')
  setStorage(STORAGE_KEYS.DEVICE_ID, id)
  return id
}
