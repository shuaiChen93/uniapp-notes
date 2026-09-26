import type { StorageKey } from '@/constants/storage'
import { getStorageWithDefault, setStorage } from '@/utils/storage'

/**
 * Mock 服务端的「本地数据库」
 * ══════════════════════════════════════════════════════════════════════
 * 这是 mock 层与「纯内存 mock」最本质的区别：
 * 所有数据经过 uni storage 落盘，因此刷新页面、重启小程序、关掉
 * 开发者工具再打开，数据都还在——行为与真实后端一致。
 * 否则「登录后刷新页面就掉线」，会让整个登录链路的调试失去意义。
 *
 * 每张「表」就是一个 storage 键，存一个对象数组。
 * 数据量在开发期只有几十条，直接整体读写完全够用，
 * 不值得为它引入索引或增量更新。
 * ══════════════════════════════════════════════════════════════════════
 */

/** 所有「表」里的行都必须有 id，供 update / delete 定位 */
export interface BaseRow {
  id: string
}

/** 读取整张表 */
export function selectAll<T extends BaseRow>(table: StorageKey): T[] {
  return getStorageWithDefault<T[]>(table, [])
}

/** 覆盖写入整张表 */
export function saveAll<T extends BaseRow>(table: StorageKey, rows: T[]): void {
  setStorage(table, rows)
}

/** 插入一行，返回插入后的记录（已补上 id） */
export function insertRow<T extends BaseRow>(table: StorageKey, row: T): T {
  const rows = selectAll<T>(table)
  rows.push(row)
  saveAll(table, rows)
  return row
}

/** 按条件查一行 */
export function findRow<T extends BaseRow>(
  table: StorageKey,
  predicate: (row: T) => boolean,
): T | undefined {
  return selectAll<T>(table).find(predicate)
}

/**
 * 按 id 局部更新一行。
 * 返回更新后的记录；找不到则返回 null（对应真实后端的 404）。
 */
export function updateRow<T extends BaseRow>(
  table: StorageKey,
  id: string,
  patch: Partial<T>,
): T | null {
  const rows = selectAll<T>(table)
  const index = rows.findIndex((row) => row.id === id)
  if (index === -1) return null

  const updated = { ...rows[index], ...patch }
  rows[index] = updated
  saveAll(table, rows)
  return updated
}
