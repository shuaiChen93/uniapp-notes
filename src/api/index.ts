/**
 * 接口统一出口
 * ══════════════════════════════════════════════════════════════════════
 * 按模块做命名空间导出，调用方写成 `authApi.login(...)`。
 *
 * 为什么用命名空间而不是把所有函数平铺导出：
 * 接口一多，平铺导出必然出现重名（好几个模块都有 `getList`、`detail`），
 * 到时候只能靠改名绕开，越绕越乱。命名空间从根上避免这件事，
 * 也让调用处一眼能看出「这是哪个业务的接口」。
 *
 * 命名统一为 `<模块>Api`，模块名与 src/mock/routes/ 下的文件名对应，
 * 找接口实现时不需要猜。
 * ══════════════════════════════════════════════════════════════════════
 */
import * as authApi from './modules/auth'
import * as rankApi from './modules/rank'
import * as recordApi from './modules/record'
import * as sensitivityApi from './modules/sensitivity'

export { authApi, rankApi, recordApi, sensitivityApi }
