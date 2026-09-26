import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { createPersistPlugin } from './store'

// Tailwind 的样式入口在这里引入而不是 App.vue 的 <style> 里，原因有二：
// 1. weapp-tailwindcss 官方推荐 Tailwind 入口是独立 .css 文件，
//    混入 scss 链路（App.vue 若用 lang="scss"）会先经历 sass 编译再进 PostCSS，
//    多一层转换容易在转义阶段出问题；
// 2. 小程序端 uni-app 会把入口 css 收集进 app.wxss，放在 main.ts 能被正确收集。
import './styles/tailwind.css'

/**
 * uni-app 的应用入口。
 *
 * ⚠️ 必须用 createSSRApp 而不是 createApp：
 * uni-app 的 Vue3 运行时在小程序端需要 SSR 形态的渲染器来接管
 * setData 更新，用 createApp 会导致页面白屏。
 */
export function createApp() {
  const app = createSSRApp(App)

  // Pinia 实例在此创建并挂载。
  // 放在 createApp 内部而不是模块顶层：H5 端 SSR / 多次调用 createApp 时，
  // 模块顶层的单例会被多个 app 复用，造成跨请求状态污染。
  const pinia = createPinia()

  // 持久化插件必须在这里注册，且必须在 app.use(pinia) 之前。
  //
  // pinia.use() 的注册时机是有讲究的：若在 pinia 已挂载到 app 之后再注册，
  // 插件只会对「此后新建」的 store 生效，而在此之前已经被创建的 store
  // 会永远拿不到插件——症状是某些 store 存不上，且与调用顺序强相关，极难定位。
  // 统一写在挂载之前，可以彻底避开这个时序问题。
  pinia.use(createPersistPlugin())

  app.use(pinia)

  return {
    app,
    // 一并导出 pinia：H5 SSR 场景需要用它恢复组件内的 store 状态。
    // 非 SSR 端导出无害，保留以兼容官方约定。
    pinia,
  }
}
