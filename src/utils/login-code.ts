import type { LoginType } from '@/types'
import { getDeviceId } from './id'

/**
 * 微信小程序的全局对象。
 *
 * `@dcloudio/types` 只声明了 `uni.*`，没有 `wx.*`（那是 miniprogram-api-typings 的活）。
 * 这里只按需声明用得到的那一个 API，而不是引入整个类型包——
 * 后者会让项目里任意 `wx.xxx` 都通过检查，反而掩盖拼写错误。
 *
 * 写在模块内（而非 .d.ts 全局声明）同样是为了不外溢：
 * 只有本文件能看见它，别处想用 wx 得再显式声明一次。
 */
declare const wx: {
  login: (options: {
    provider?: string
    success?: (res: { code?: string }) => void
    fail?: (err: { errMsg?: string }) => void
  }) => void
}

/**
 * 登录凭证（code）的获取
 * ══════════════════════════════════════════════════════════════════════
 * 独立成文件的原因：它同时被两处使用——
 *   ① 启动时的静默登录（src/utils/request.ts）
 *   ② 用户手动登录（src/pages/login/index.vue）
 * * 若留在页面里，request 层就得反向 import 页面，依赖方向会乱掉。
 * ══════════════════════════════════════════════════════════════════════
 */

/**
 * 调起微信登录拿 code。
 *
 * 用回调式 API 包一层 Promise 而不是直接 `await uni.login(...)`：
 * uni API 的 Promise 化在各端支持程度不一，显式包装能保证
 * 「失败一定进 catch」，不会出现某些端上失败被静默吞掉的情况。
 */
// #ifdef MP-WEIXIN
function requestWechatCode(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: (res) => {
        if (res.code) resolve(res.code)
        else reject(new Error('未获取到微信登录 code'))
      },
      fail: (err) => reject(new Error(err.errMsg || '微信登录失败')),
    })
  })
}
// #endif

/**
 * 当前是否运行在微信小程序端。
 *
 * 这里用「条件编译 + 运行时判断」两层，而不是只用条件编译，原因是：
 *
 * 条件编译是**构建期**由 uni 编译器处理的，在 vitest 眼里它只是一句普通注释。
 * 于是源码里 `#ifdef` 和 `#ifndef` 两个分支会同时保留，
 * 且永远只会执行到第一个 return——单测就错误地落在了「小程序」分支上。
 *
 * 它的症状很隐蔽：`getPreferredLoginType()` 在测试里返回 'wechat'，
 * 而测试手写的登录方式是 'guest'，mock 服务端按 (code + 登录方式) 认人，
 * 于是每次静默重登都会被当成新用户注册，账号凭空多出来一个。
 * 而这一切在真机上都不会发生。
 *
 * 加上运行时判断后：真实小程序里 wx 一定存在，判断为真；
 * 测试环境里 wx 不存在，自然落回非小程序分支，与 H5 端行为一致。
 */
export function isMpWeixin(): boolean {
  // #ifdef MP-WEIXIN
  return typeof wx !== 'undefined' && typeof wx.login === 'function'
  // #endif

  // #ifndef MP-WEIXIN
  return false
  // #endif
}

/**
 * 当前平台首选的登录方式。
 *
 * 注意：wx.login 是**完全静默**的，不会弹任何授权框，也不需要用户点击。
 * 因此小程序端可以拿它做「打开即登录」，用户全程无感。
 */
export function getPreferredLoginType(): LoginType {
  return isMpWeixin() ? 'wechat' : 'guest'
}

/**
 * 解析出本次登录要用的 code。
 *
 * 微信登录失败时**不阻断流程**，而是降级为设备 ID：
 * manifest.json 里的 appid 默认是空的，此时 wx.login 必然失败。
 * 若直接抛错，开发者第一次跑起来就会卡在登录页，
 * 而这个失败与业务逻辑无关，纯粹是环境未配置。
 * 降级后游客照样能完整体验，配置好 appid 后微信登录会自动生效。
 */
export async function resolveLoginCode(loginType: LoginType): Promise<string> {
  // #ifdef MP-WEIXIN
  if (loginType === 'wechat') {
    try {
      return await requestWechatCode()
    } catch (err) {
      console.warn('[auth] 微信登录不可用，降级为设备登录：', err)
    }
  }
  // #endif

  return getDeviceId()
}
